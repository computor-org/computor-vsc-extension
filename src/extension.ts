import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { IconGenerator } from './utils/IconGenerator';

import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { ComputorApiService } from './services/ComputorApiService';
import { CourseMemberReadinessStatus } from './types/generated';
import { GitLabTokenManager } from './services/GitLabTokenManager';

import { BasicAuthHttpClient } from './http/BasicAuthHttpClient';
import { ApiKeyHttpClient } from './http/ApiKeyHttpClient';
import { JwtHttpClient } from './http/JwtHttpClient';
import { BackendConnectionService } from './services/BackendConnectionService';
import { GitEnvironmentService } from './services/GitEnvironmentService';

import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerExampleTreeProvider } from './ui/tree/lecturer/LecturerExampleTreeProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { LecturerExampleCommands } from './commands/LecturerExampleCommands';

import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { StudentRepositoryManager } from './services/StudentRepositoryManager';
import { CourseSelectionService } from './services/CourseSelectionService';
import { StudentCommands } from './commands/StudentCommands';

// import { TutorTreeDataProvider } from './ui/tree/tutor/TutorTreeDataProvider';
import { TutorCommands } from './commands/TutorCommands';

import { TestResultsPanelProvider, TestResultsTreeDataProvider } from './ui/panels/TestResultsPanel';
import { TestResultService } from './services/TestResultService';
import { manageGitLabTokens } from './commands/manageGitLabTokens';

type Role = 'Lecturer' | 'Student' | 'Tutor';
type AuthType = 'basic' | 'apiKey' | 'jwt';

interface StoredAuth {
  type: AuthType;
  username?: string;
  password?: string;
  apiKey?: string;
  token?: string;
  headerName?: string;
  headerPrefix?: string;
}

interface ActiveSession {
  role: Role;
  deactivate: () => Promise<void>;
}

const STUDENT_MARKER = '.computor_student';
const TUTOR_MARKER = '.computor_tutor';
const LECTURER_MARKER = '.computor_lecturer';

function getWorkspaceRoot(): string | undefined {
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || ws.length === 0) return undefined;
  return ws[0]?.uri.fsPath;
}

async function ensureBaseUrl(settings: ComputorSettingsManager): Promise<string | undefined> {
  const current = await settings.getBaseUrl();
  if (current) return current;
  const url = await vscode.window.showInputBox({
    title: 'Computor Backend URL',
    prompt: 'Enter the Computor backend URL',
    placeHolder: 'http://localhost:8000',
    ignoreFocusOut: true,
    validateInput: (value) => {
      try { new URL(value); return undefined; } catch { return 'Enter a valid URL'; }
    }
  });
  if (!url) return undefined;
  await settings.setBaseUrl(url);
  return url;
}

async function chooseAuthType(settings: ComputorSettingsManager, defaultType?: AuthType): Promise<AuthType | undefined> {
  const choice = await vscode.window.showQuickPick([
    { label: 'Basic (username/password)', value: 'basic', picked: defaultType === 'basic' },
    { label: 'API Key', value: 'apiKey', picked: defaultType === 'apiKey' },
    { label: 'JWT Token (SSO)', value: 'jwt', picked: defaultType === 'jwt' }
  ], { title: 'Choose authentication method', placeHolder: 'Select auth method' });
  if (!choice) return undefined;
  await settings.setAuthProvider(choice.value);
  return choice.value as AuthType;
}

async function promptCredentials(role: Role, auth: AuthType, settings: ComputorSettingsManager, previous?: StoredAuth): Promise<StoredAuth | undefined> {
  switch (auth) {
    case 'basic': {
      const username = await vscode.window.showInputBox({ title: `${role} Login`, prompt: 'Username', value: previous?.username, ignoreFocusOut: true });
      if (!username) return undefined;
      const password = await vscode.window.showInputBox({ title: `${role} Login`, prompt: 'Password', value: previous?.password, password: true, ignoreFocusOut: true });
      if (!password) return undefined;
      return { type: 'basic', username, password };
    }
    case 'apiKey': {
      const apiKey = await vscode.window.showInputBox({ title: `${role} Login`, prompt: 'API Key', value: previous?.apiKey, password: true, ignoreFocusOut: true });
      if (!apiKey) return undefined;
      const tokenSettings = await settings.getTokenSettings();
      return { type: 'apiKey', apiKey, headerName: tokenSettings.headerName, headerPrefix: tokenSettings.headerPrefix };
    }
    case 'jwt': {
      const token = await vscode.window.showInputBox({ title: `${role} Login`, prompt: 'Paste JWT/OAuth access token', value: previous?.token, password: true, ignoreFocusOut: true });
      if (!token) return undefined;
      return { type: 'jwt', token };
    }
  }
}

function buildHttpClient(baseUrl: string, auth: StoredAuth): BasicAuthHttpClient | ApiKeyHttpClient | JwtHttpClient {
  if (auth.type === 'basic') {
    return new BasicAuthHttpClient(baseUrl, auth.username!, auth.password!, 5000);
  } else if (auth.type === 'apiKey') {
    return new ApiKeyHttpClient(baseUrl, auth.apiKey!, auth.headerName || 'X-API-Key', auth.headerPrefix || '', 5000);
  } else {
    const jwt = new JwtHttpClient(baseUrl, { serverUrl: baseUrl, realm: 'computor', clientId: 'computor-vscode', redirectUri: '' }, 5000);
    jwt.setTokens(auth.token!);
    return jwt;
  }
}

async function readMarker(file: string): Promise<{ courseId?: string } | undefined> {
  try {
    if (!fs.existsSync(file)) return undefined;
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

async function writeMarker(file: string, data: { courseId: string }): Promise<void> {
  await fs.promises.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function ensureCourseMarker(role: Role, api: ComputorApiService, context?: vscode.ExtensionContext): Promise<string | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    const action = await vscode.window.showErrorMessage(`${role} login requires an open workspace.`, 'Open Folder');
    if (action === 'Open Folder') {
      // Let the user select a folder to open as workspace
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select Workspace Folder'
      });
      
      if (folderUri && folderUri.length > 0) {
        // Store pending login info before workspace change
        if (context) {
          await context.globalState.update('pendingLogin', { 
            role, 
            timestamp: Date.now() 
          });
        }
        
        // Add the folder to the current workspace
        // This will restart the extension if no workspace was open
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        vscode.workspace.updateWorkspaceFolders(
          workspaceFolders.length,
          0,
          { uri: folderUri[0]!, name: path.basename(folderUri[0]!.fsPath) }
        );
        
        // If we had existing workspace folders, the extension won't restart
        // In that case, we can continue immediately
        if (workspaceFolders.length > 0) {
          // Give VS Code a moment to update
          await new Promise(resolve => setTimeout(resolve, 100));
          // Recursively call to handle the marker with the new workspace
          return ensureCourseMarker(role, api, context);
        }
        
        // Extension will restart, return undefined
        return undefined;
      }
    }
    return undefined;
  }
  const markerFile = role === 'Student' ? STUDENT_MARKER :
                   role === 'Tutor' ? TUTOR_MARKER : LECTURER_MARKER;
  const file = path.join(root, markerFile);
  const existing = await readMarker(file);

  // Get courses based on role
  let courses: any[] | undefined;
  if (role === 'Student') {
    courses = await api.getStudentCourses();
  } else if (role === 'Tutor') {
    courses = await api.getTutorCourses(false);
  } else {
    // Lecturer
    courses = await api.getLecturerCourses();
  }
  if (!courses || courses.length === 0) {
    vscode.window.showWarningMessage(`No ${role.toLowerCase()} courses found for your account.`);
    return undefined;
  }

  if (existing?.courseId) {
    const match = courses.find((course: any) => course.id === existing.courseId);
    if (match) {
      return existing.courseId;
    }

    // Invalid or stale marker – remove and continue as if no marker exists
    try {
      await fs.promises.unlink(file);
    } catch {
      // Ignore errors when removing invalid marker
    }
  }

  const pick = await vscode.window.showQuickPick(
    courses.map((c: any) => ({ label: c.title || c.path || c.name || c.id, description: c.path || '', course: c })),
    { title: `${role}: Select Course`, placeHolder: 'Pick your course' }
  );
  if (!pick) return undefined;
  await writeMarker(file, { courseId: pick.course.id });
  return pick.course.id as string;
}

function formatProviderLabel(status: CourseMemberReadinessStatus): string {
  if (status.provider) {
    try {
      const providerUrl = new URL(status.provider);
      return providerUrl.host;
    } catch {
      return status.provider;
    }
  }
  if (status.provider_type) {
    const label = status.provider_type.trim();
    if (label.toLowerCase() === 'gitlab') {
      return 'GitLab';
    }
    return label;
  }
  return 'provider';
}

async function ensureCourseProviderAccount(
  api: ComputorApiService,
  context: vscode.ExtensionContext,
  courseId: string,
  courseLabel: string,
  providerHint?: string | null,
  currentUser?: { username?: string }
): Promise<void> {
  // Provider URL should always be available from course configuration
  if (!providerHint) {
    throw new Error(`No Git provider configured for course "${courseLabel}". Please contact your instructor.`);
  }

  let readiness: CourseMemberReadinessStatus | undefined;
  let providerAccessToken: string | undefined;
  let providerAccountId: string | undefined;
  const providerUrl = providerHint;

  const resolveProviderUrl = (): string => readiness?.provider ?? providerUrl;
  const tokenManager = GitLabTokenManager.getInstance(context);

  const acquireToken = async (options?: { defaultValue?: string; forcePrompt?: boolean }): Promise<string> => {
    const providerUrlString = resolveProviderUrl();
    const providerUrlObject = new URL(providerUrlString);
    const origin = `${providerUrlObject.protocol}//${providerUrlObject.host}`;

    if (options?.forcePrompt) {
      const prompted = await tokenManager.requestAndStoreToken(origin, options.defaultValue);
      if (!prompted) {
        throw new Error(`A personal access token for ${origin} is required to verify your account.`);
      }
      return prompted;
    }

    const existing = await tokenManager.ensureTokenForUrl(origin);
    if (existing) {
      return existing;
    }

    const prompted = await tokenManager.requestAndStoreToken(origin, options?.defaultValue);
    if (!prompted) {
      throw new Error(`A personal access token for ${origin} is required to verify your account.`);
    }
    return prompted;
  };

  const validate = async (token: string): Promise<CourseMemberReadinessStatus> =>
    api.validateCourseReadiness(courseId, token);

  const promptRetryOrCancel = async (message: string, retryLabel: string): Promise<boolean> => {
    const selection = await vscode.window.showWarningMessage(message, retryLabel, 'Cancel');
    return selection === retryLabel;
  };

  const promptForAccountId = async (providerLabel: string, defaultValue: string): Promise<string> => {
    const accountInput = await vscode.window.showInputBox({
      title: `Link ${providerLabel} account`,
      prompt: `Enter the ${providerLabel} account ID to use for ${courseLabel}`,
      value: defaultValue,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        return trimmed.length === 0 ? 'Account ID is required' : undefined;
      }
    });

    if (accountInput === undefined) {
      throw new Error(`${providerLabel} account registration cancelled for ${courseLabel}`);
    }

    return accountInput.trim();
  };

  while (true) {
    if (!providerAccessToken) {
      providerAccessToken = await acquireToken();
    }
    try {
      readiness = await validate(providerAccessToken);
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = (error?.response?.data?.detail || error?.message || '').toString().toLowerCase();
      if (status === 401 || detail.includes('token')) {
        const label = readiness ? formatProviderLabel(readiness) : 'GitLab';
        const retry = await promptRetryOrCancel(
          `${label} token is required to validate your course access. Provide a token?`,
          'Provide Token'
        );
        if (!retry) {
          throw new Error('Provider account verification cancelled.');
        }
        providerAccessToken = await acquireToken({ defaultValue: providerAccessToken, forcePrompt: true });
        continue;
      }
      throw error;
    }

    if (!readiness.requires_account) {
      return;
    }

    if (readiness.is_ready) {
      return;
    }

    const providerLabel = formatProviderLabel(readiness);

    if (!providerAccountId) {
      const defaultAccount = readiness.provider_account_id?.trim() || currentUser?.username || '';
      providerAccountId = await promptForAccountId(providerLabel, defaultAccount);
    }

    try {
      const updated = await api.registerCourseProviderAccount(courseId, {
        provider_account_id: providerAccountId,
        provider_access_token: providerAccessToken
      });

      providerAccountId = updated.provider_account_id?.trim() || providerAccountId;

      if (updated.is_ready) {
        vscode.window.showInformationMessage(
          `${formatProviderLabel(updated)} account "${providerAccountId}" linked for ${courseLabel}.`
        );
        return;
      }

      const needsAccount = !updated.has_account || !updated.provider_account_id;
      const needsToken = !updated.provider_access_token;
      const missingParts: string[] = [];
      if (needsAccount) missingParts.push('account ID');
      if (needsToken) missingParts.push('access token');

      const retry = await promptRetryOrCancel(
        `${formatProviderLabel(updated)} still needs ${missingParts.join(' and ') || 'additional details'} for ${courseLabel}. Update the details now?`,
        'Update Details'
      );
      if (!retry) {
        throw new Error('Provider account verification cancelled.');
      }

      if (needsAccount) {
        providerAccountId = undefined;
      }

      if (needsToken) {
        providerAccessToken = undefined;
      }

      readiness = updated;
      continue;
    } catch (error: any) {
      const detail = (error?.response?.data?.detail || error?.message || '').toString().toLowerCase();
      const status = error?.response?.status;

      if (status === 401 || detail.includes('token') || detail.includes('access')) {
        const retry = await promptRetryOrCancel(
          `${providerLabel} token was rejected. Provide a new token?`,
          'Provide Token'
        );
        if (!retry) {
          throw new Error('Provider account verification cancelled.');
        }
        providerAccessToken = await acquireToken({ defaultValue: providerAccessToken, forcePrompt: true });
        continue;
      }

      if (status === 400 || status === 422 || detail.includes('account')) {
        const retry = await promptRetryOrCancel(
          `${providerLabel} account ID was not accepted. Enter a different account ID?`,
          'Update Account ID'
        );
        if (!retry) {
          throw new Error('Provider account verification cancelled.');
        }
        providerAccountId = undefined;
        continue;
      }

      throw error;
    }
  }
}

abstract class BaseRoleController {
  protected context: vscode.ExtensionContext;
  protected settings: ComputorSettingsManager;
  protected api?: ComputorApiService;
  protected client?: ReturnType<typeof buildHttpClient>;
  protected disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.settings = new ComputorSettingsManager(context);
  }

  abstract activate(client: ReturnType<typeof buildHttpClient>): Promise<void>;

  protected async setupApi(client: ReturnType<typeof buildHttpClient>): Promise<ComputorApiService> {
    const api = new ComputorApiService(this.context);
    (api as any).httpClient = client;
    this.api = api;
    this.client = client;
    return api;
  }

  async dispose(): Promise<void> {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    if (this.api) this.api.clearHttpClient();
    this.api = undefined;
    this.client = undefined;
  }
}

class LecturerController extends BaseRoleController {
  private tree?: LecturerTreeDataProvider;
  private exampleTree?: LecturerExampleTreeProvider;
  private repoManager?: any;

  async activate(client: ReturnType<typeof buildHttpClient>): Promise<void> {
    const api = await this.setupApi(client);

    // Ensure course marker exists / choose course
    const courseId = await ensureCourseMarker('Lecturer', api, this.context);
    if (!courseId) throw new Error('Lecturer course selection cancelled.');

    const lecturerUser = await api.getCurrentUser();

    // Get detailed course information including repository details
    const detailedCourse = await api.getCourse(courseId);

    await ensureCourseProviderAccount(
      api,
      this.context,
      courseId,
      detailedCourse?.title || detailedCourse?.path || courseId,
      detailedCourse?.properties?.gitlab?.url || null,
      lecturerUser
    );

    this.tree = new LecturerTreeDataProvider(this.context, api);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.lecturer.courses', this.tree));

    const treeView = vscode.window.createTreeView('computor.lecturer.courses', {
      treeDataProvider: this.tree,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: this.tree
    });
    this.disposables.push(treeView);

    this.exampleTree = new LecturerExampleTreeProvider(this.context, api);
    const exampleTreeView = vscode.window.createTreeView('computor.lecturer.examples', {
      treeDataProvider: this.exampleTree,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: this.exampleTree
    });
    this.disposables.push(exampleTreeView);

    const commands = new LecturerCommands(this.context, this.tree, api);
    commands.registerCommands();

    // Register example-related commands (search, upload from ZIP, etc.)
    new LecturerExampleCommands(this.context, api, this.exampleTree);

    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', true);
    await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);

    try { await vscode.commands.executeCommand('workbench.view.extension.computor-main'); } catch {}
    try { await vscode.commands.executeCommand('computor.lecturer.courses.focus'); } catch {}

    // Initialize lecturer assignments repository manager and trigger a background sync
    try {
      const { LecturerRepositoryManager } = await import('./services/LecturerRepositoryManager');
      this.repoManager = new LecturerRepositoryManager(this.context, api);
      // Fire-and-forget sync on login
      void this.repoManager.syncAllAssignments((msg: string) => {
        console.log('[LecturerRepositoryManager]', msg);
      });
    } catch (err) {
      console.warn('LecturerRepositoryManager init failed:', err);
    }
  }
}

class TutorController extends BaseRoleController {
  private tree?: any;

  async activate(client: ReturnType<typeof buildHttpClient>): Promise<void> {
    const api = await this.setupApi(client);

    // Ensure course marker exists / choose course
    const courseId = await ensureCourseMarker('Tutor', api, this.context);
    if (!courseId) throw new Error('Tutor course selection cancelled.');

    const tutorUser = await api.getCurrentUser();

    // Get detailed course information including repository details
    const detailedCourse = await api.getTutorCourse(courseId);

    await ensureCourseProviderAccount(
      api,
      this.context,
      courseId,
      detailedCourse?.title || detailedCourse?.path || courseId,
      detailedCourse?.repository?.provider_url || null,
      tutorUser
    );

    // Register filter panel and tree
    const { TutorFilterPanelProvider } = await import('./ui/panels/TutorFilterPanel');
    const { TutorSelectionService } = await import('./services/TutorSelectionService');
    const { TutorStatusBarService } = await import('./ui/TutorStatusBarService');
    const selection = TutorSelectionService.initialize(this.context, api);
    const filterProvider = new TutorFilterPanelProvider(this.context.extensionUri, api, selection);
    this.disposables.push(vscode.window.registerWebviewViewProvider(TutorFilterPanelProvider.viewType, filterProvider));

    const { TutorStudentTreeProvider } = await import('./ui/tree/tutor/TutorStudentTreeProvider');
    this.tree = new TutorStudentTreeProvider(api, selection);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.tutor.courses', this.tree));
    const treeView = vscode.window.createTreeView('computor.tutor.courses', { treeDataProvider: this.tree, showCollapseAll: true });
    this.disposables.push(treeView);

    // Status bar: show selection and allow reset
    const tutorStatus = TutorStatusBarService.initialize();
    const updateStatus = async () => {
      const courseLabel = selection.getCurrentCourseLabel() || selection.getCurrentCourseId();
      const groupLabel = selection.getCurrentGroupLabel() || selection.getCurrentGroupId();
      const memberLabel = selection.getCurrentMemberLabel() || selection.getCurrentMemberId();
      tutorStatus.updateSelection(courseLabel, groupLabel, memberLabel);
    };
    this.disposables.push(selection.onDidChangeSelection(() => { void updateStatus(); }));
    void updateStatus();

    // Reset filters command
    this.disposables.push(vscode.commands.registerCommand('computor.tutor.resetFilters', async () => {
      await selection.selectCourse(null);
      await selection.selectGroup(null);
      await selection.selectMember(null);
    }));

    const commands = new TutorCommands(this.context, this.tree as any, api);
    commands.registerCommands();

    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', true);

    try { await vscode.commands.executeCommand('workbench.view.extension.computor-main'); } catch {}
    try { await vscode.commands.executeCommand('computor.tutor.courses.focus'); } catch {}
  }
}

class StudentController extends BaseRoleController {
  private tree?: StudentCourseContentTreeProvider;
  private repositoryManager?: StudentRepositoryManager;
  private courseSelectionService?: CourseSelectionService;

  async activate(client: ReturnType<typeof buildHttpClient>): Promise<void> {
    const api = await this.setupApi(client);

    // Ensure course marker exists / choose course
    const courseId = await ensureCourseMarker('Student', api, this.context);
    if (!courseId) throw new Error('Student course selection cancelled.');

    this.repositoryManager = new StudentRepositoryManager(this.context, api);
    const statusBar = (await import('./ui/StatusBarService')).StatusBarService.initialize(this.context);
    this.courseSelectionService = CourseSelectionService.initialize(this.context, api, statusBar);

    // Initialize tree view
    this.tree = new StudentCourseContentTreeProvider(api, this.courseSelectionService!, this.repositoryManager, this.context);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.student.courses', this.tree));
    const treeView = vscode.window.createTreeView('computor.student.courses', { treeDataProvider: this.tree, showCollapseAll: true });
    this.disposables.push(treeView);

    const currentUser = await api.getCurrentUser();

    // Set selected course into service
    const selectedCourse = await this.courseSelectionService!.selectCourse(courseId);
    const detailedCourse = await api.getStudentCourse(courseId);

    await ensureCourseProviderAccount(
      api,
      this.context,
      courseId,
      selectedCourse?.title || selectedCourse?.path || courseId,
      detailedCourse?.repository?.provider_url || null,
      currentUser
    );

    // Auto-setup repositories
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Preparing course repositories...', cancellable: false }, async (progress) => {
      progress.report({ message: 'Starting...' });
      try { await this.repositoryManager!.autoSetupRepositories(courseId, (msg) => progress.report({ message: msg })); } catch (e) { console.error(e); }
      this.tree?.refresh();
    });

    // Student commands
    const commands = new StudentCommands(this.context, this.tree, api, this.repositoryManager);
    commands.registerCommands();

    // Results panel + tree
    const panelProvider = new TestResultsPanelProvider(this.context.extensionUri);
    this.disposables.push(vscode.window.registerWebviewViewProvider(TestResultsPanelProvider.viewType, panelProvider));
    const resultsTree = new TestResultsTreeDataProvider([]);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.testResultsView', resultsTree));
    TestResultService.getInstance().setApiService(api);
    this.disposables.push(vscode.commands.registerCommand('computor.results.open', async (results: any) => {
      try { resultsTree.refresh(results || {}); await vscode.commands.executeCommand('computor.testResultsPanel.focus'); } catch (e) { console.error(e); }
    }));
    this.disposables.push(vscode.commands.registerCommand('computor.results.panel.update', (item: any) => panelProvider.updateTestResults(item)));

    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.student.show', true);
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);

    try { await vscode.commands.executeCommand('workbench.view.extension.computor-main'); } catch {}
  }
}

let activeSession: ActiveSession | null = null;
let isAuthenticating = false;

const backendConnectionService = BackendConnectionService.getInstance();

async function loginFlow(context: vscode.ExtensionContext, role: Role): Promise<void> {
  if (isAuthenticating) { vscode.window.showInformationMessage('Login already in progress.'); return; }
  isAuthenticating = true;
  // Require an open workspace for all roles before proceeding
  const root = getWorkspaceRoot();
  if (!root) {
    const action = await vscode.window.showErrorMessage('Login requires an open workspace.', 'Open Folder');
    if (action === 'Open Folder') {
      // Let the user select a folder to open as workspace
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select Workspace Folder'
      });
      
      if (folderUri && folderUri.length > 0) {
        // Store pending login info before workspace change
        await context.globalState.update('pendingLogin', { 
          role, 
          timestamp: Date.now() 
        });
        
        // Add the folder to the current workspace
        // This will restart the extension if no workspace was open
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        vscode.workspace.updateWorkspaceFolders(
          workspaceFolders.length,
          0,
          { uri: folderUri[0]!, name: path.basename(folderUri[0]!.fsPath) }
        );
      }
    }
    isAuthenticating = false;
    return;
  }

  const settings = new ComputorSettingsManager(context);
  const baseUrl = await ensureBaseUrl(settings);
  if (!baseUrl) { isAuthenticating = false; return; }

  // Enforce single role at a time
  if (activeSession && activeSession.role !== role) {
    const answer = await vscode.window.showWarningMessage(`You are logged in as ${activeSession.role}. Switch to ${role}?`, 'Switch', 'Cancel');
    if (answer !== 'Switch') return;
    await activeSession.deactivate();
    activeSession = null;
  }

  // Prompt for authentication with stored values prefilled (if any)
  const secretKey = `computor.${role}.auth`;
  const storedRaw = await context.secrets.get(secretKey);
  const previous: StoredAuth | undefined = storedRaw ? JSON.parse(storedRaw) as StoredAuth : undefined;
  const type = await chooseAuthType(settings, previous?.type);
  if (!type) { isAuthenticating = false; return; }
  const creds = await promptCredentials(role, type, settings, previous);
  if (!creds) { isAuthenticating = false; return; }
  const auth: StoredAuth = creds;

  backendConnectionService.setBaseUrl(baseUrl);
  const connectionStatus = await backendConnectionService.checkBackendConnection(baseUrl);
  if (!connectionStatus.isReachable) {
    await backendConnectionService.showConnectionError(connectionStatus);
    isAuthenticating = false;
    return;
  }

  const client = buildHttpClient(baseUrl, auth);

  let controller: BaseRoleController;
  if (role === 'Lecturer') controller = new LecturerController(context);
  else if (role === 'Tutor') controller = new TutorController(context);
  else controller = new StudentController(context);

  try {
    await controller.activate(client as any);
    await GitEnvironmentService.getInstance().validateGitEnvironment();
    backendConnectionService.startHealthCheck(baseUrl);
    activeSession = { role, deactivate: () => controller.dispose().then(async () => {
      await vscode.commands.executeCommand('setContext', 'computor.isLoggedIn', false);
      await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
      await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
      await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);
      backendConnectionService.stopHealthCheck();
    }) };
    await context.secrets.store(secretKey, JSON.stringify(auth));
    await vscode.commands.executeCommand('setContext', 'computor.isLoggedIn', true);
    vscode.window.showInformationMessage(`Logged in as ${role}.`);
  } catch (error: any) {
    await controller.dispose();
    vscode.window.showErrorMessage(`Failed to activate ${role}: ${error?.message || error}`);
    backendConnectionService.stopHealthCheck();
  } finally {
    isAuthenticating = false;
  }
}

// Removed automatic marker-based login prompts per user request

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Computor extension activated');
  IconGenerator.initialize(context);

  // Initialize all view contexts to false to hide views until login
  await vscode.commands.executeCommand('setContext', 'computor.isLoggedIn', false);
  await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
  await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
  await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);

  // Commands: per-role logins
  context.subscriptions.push(vscode.commands.registerCommand('computor.lecturer.login', async () => loginFlow(context, 'Lecturer')));
  context.subscriptions.push(vscode.commands.registerCommand('computor.student.login', async () => loginFlow(context, 'Student')));
  context.subscriptions.push(vscode.commands.registerCommand('computor.tutor.login', async () => loginFlow(context, 'Tutor')));
  context.subscriptions.push(vscode.commands.registerCommand('computor.manageGitLabTokens', async () => {
    await manageGitLabTokens(context);
  }));
  
  // Check for pending login after workspace change
  const pendingLogin = context.globalState.get<{ role: Extract<Role, 'Student' | 'Tutor'>; timestamp: number }>('pendingLogin');
  if (pendingLogin) {
    // Clear the pending login state
    await context.globalState.update('pendingLogin', undefined);
    
    // Check if the login is recent (within 5 seconds)
    if (Date.now() - pendingLogin.timestamp < 5000) {
      // Automatically continue the login flow
      setTimeout(() => {
        vscode.window.showInformationMessage(`Continuing ${pendingLogin.role} login after workspace change...`);
        loginFlow(context, pendingLogin.role);
      }, 1000);
    }
  }

  // Logout command
  context.subscriptions.push(vscode.commands.registerCommand('computor.logout', async () => {
    if (!activeSession) { vscode.window.showInformationMessage('Not logged in.'); return; }
    const role = activeSession.role;
    await activeSession.deactivate();
    activeSession = null;
    await vscode.commands.executeCommand('setContext', 'computor.isLoggedIn', false);
    vscode.window.showInformationMessage(`Logged out from ${role}.`);
  }));

  // Change backend URL command
  context.subscriptions.push(vscode.commands.registerCommand('computor.changeRealmUrl', async () => {
    const settings = new ComputorSettingsManager(context);
    const url = await vscode.window.showInputBox({
      title: 'Set Computor Backend URL',
      value: await settings.getBaseUrl(),
      prompt: 'Enter the base URL of the Computor API',
      ignoreFocusOut: true,
      validateInput: (v) => { try { new URL(v); return undefined; } catch { return 'Enter a valid URL'; } }
    });
    if (!url) return;
    await settings.setBaseUrl(url);
    vscode.window.showInformationMessage('Computor backend URL updated.');
  }));

  // Detect marker files on startup and when workspace changes
  // Disabled: no automatic login prompt based on marker files

  // Maintain legacy settings command to open extension settings scope
  context.subscriptions.push(vscode.commands.registerCommand('computor.settings', async () => {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'computor');
  }));

  // Token management commands
  context.subscriptions.push(vscode.commands.registerCommand('computor.tokens.manage', async () => {
    const { GitLabTokenManager } = await import('./services/GitLabTokenManager');
    const mgr = GitLabTokenManager.getInstance(context);
    const originInput = await vscode.window.showInputBox({
      title: 'GitLab Origin',
      prompt: 'Enter GitLab origin (e.g., http://localhost:8084)',
      value: 'http://',
      ignoreFocusOut: true,
      validateInput: (v) => { try { const u = new URL(v); return u.origin ? undefined : 'Enter a valid origin URL'; } catch { return 'Enter a valid origin URL'; } }
    });
    if (!originInput) return;
    const origin = new URL(originInput).origin;
    const existing = await mgr.getToken(origin);
    if (existing) {
      const choice = await vscode.window.showQuickPick(['Update Token', 'Remove Token', 'Cancel'], { title: `Token for ${origin}` });
      if (choice === 'Update Token') {
        const tok = await vscode.window.showInputBox({ title: `Update Token for ${origin}`, password: true, ignoreFocusOut: true });
        if (tok) await mgr.storeToken(origin, tok);
      } else if (choice === 'Remove Token') {
        await mgr.removeToken(origin);
        vscode.window.showInformationMessage(`Removed token for ${origin}`);
      }
    } else {
      const tok = await vscode.window.showInputBox({ title: `Set Token for ${origin}`, password: true, ignoreFocusOut: true });
      if (tok) await mgr.storeToken(origin, tok);
    }
  }));
}

export function deactivate(): void {
  if (activeSession) {
    void activeSession.deactivate();
    activeSession = null;
  }
  IconGenerator.cleanup();
}
