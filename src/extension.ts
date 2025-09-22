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


const computorMarker = '.computor';

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

async function ensureCourseMarker(api: ComputorApiService, context?: vscode.ExtensionContext): Promise<string | undefined> {
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
        if (context) {
          await context.globalState.update('pendingLogin', {
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
          return ensureCourseMarker(api, context);
        }

        // Extension will restart, return undefined
        return undefined;
      }
    }
    return undefined;
  }
  const file = path.join(root, computorMarker);
  const existing = await readMarker(file);

  // Get all courses the user has access to by trying all endpoints
  let allCourses: any[] = [];

  try {
    const studentCourses = await api.getStudentCourses();
    allCourses.push(...(studentCourses || []));
  } catch {
    // User might not have student access
  }

  try {
    const tutorCourses = await api.getTutorCourses(false);
    allCourses.push(...(tutorCourses || []));
  } catch {
    // User might not have tutor access
  }

  try {
    const lecturerCourses = await api.getLecturerCourses();
    allCourses.push(...(lecturerCourses || []));
  } catch {
    // User might not have lecturer access
  }

  // Remove duplicates based on course ID
  const uniqueCourses = allCourses.filter((course, index, arr) =>
    arr.findIndex(c => c.id === course.id) === index
  );

  if (uniqueCourses.length === 0) {
    vscode.window.showWarningMessage('No courses found for your account.');
    return undefined;
  }

  if (existing?.courseId) {
    const match = uniqueCourses.find((course: any) => course.id === existing.courseId);
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
    uniqueCourses.map((c: any) => ({ label: c.title || c.path || c.name || c.id, description: c.path || '', course: c })),
    { title: 'Select Course', placeHolder: 'Pick your course' }
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

class UnifiedController {
  private context: vscode.ExtensionContext;
  private api?: ComputorApiService;
  private disposables: vscode.Disposable[] = [];
  private activeViews: string[] = [];

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async activate(client: ReturnType<typeof buildHttpClient>): Promise<void> {
    const api = await this.setupApi(client);

    // Ensure course marker exists / choose course
    const courseId = await ensureCourseMarker(api, this.context);
    if (!courseId) throw new Error('Course selection cancelled.');

    const currentUser = await api.getCurrentUser();

    // Get available views for this user/course combination
    const availableViews = await api.getUserCourseViews(courseId);

    if (availableViews.length === 0) {
      throw new Error('No views available for this course.');
    }

    // Handle Git provider account setup for any role that needs it
    await this.setupProviderAccount(api, courseId, currentUser, availableViews);

    // Initialize views based on what's available (now with selection)
    await this.initializeViews(api, courseId, availableViews);

    await GitEnvironmentService.getInstance().validateGitEnvironment();

    // Refresh GitLab tokens in workspace repositories after login
    await this.refreshWorkspaceGitLabTokens();

    // Focus on the highest priority view: lecturer > tutor > student
    await this.focusHighestPriorityView(availableViews);
  }

  private async setupApi(client: ReturnType<typeof buildHttpClient>): Promise<ComputorApiService> {
    const api = new ComputorApiService(this.context);
    (api as any).httpClient = client;
    this.api = api;
    return api;
  }

  private async setupProviderAccount(api: ComputorApiService, courseId: string, currentUser: any, views: string[]): Promise<void> {
    // Try multiple approaches to get provider URL, as different views have different data structures
    let providerUrl: string | null = null;
    let courseLabel: string = courseId;
    let courseData: any = null;

    // Try lecturer endpoint first (most comprehensive data)
    if (views.includes('lecturer')) {
      try {
        courseData = await api.getCourse(courseId);
        courseLabel = courseData?.title || courseData?.path || courseId;

        // Try multiple paths for lecturer provider URL
        providerUrl = courseData?.properties?.gitlab?.url ||
                     courseData?.repository?.provider_url ||
                     courseData?.organization?.gitlab?.url || null;

        console.log('Lecturer course data structure:', {
          title: courseData?.title,
          properties: courseData?.properties,
          repository: courseData?.repository,
          organization: courseData?.organization
        });
      } catch (err) {
        console.warn('Failed to get lecturer course details:', err);
      }
    }

    // If no provider URL found, try student endpoint
    if (!providerUrl && views.includes('student')) {
      try {
        courseData = await api.getStudentCourse(courseId);
        courseLabel = courseData?.title || courseData?.path || courseLabel;
        providerUrl = courseData?.repository?.provider_url || null;
        console.log('Student course data structure:', {
          title: courseData?.title,
          repository: courseData?.repository
        });
      } catch (err) {
        console.warn('Failed to get student course details:', err);
      }
    }

    // If still no provider URL, try tutor endpoint
    if (!providerUrl && views.includes('tutor')) {
      try {
        courseData = await api.getTutorCourse(courseId);
        courseLabel = courseData?.title || courseData?.path || courseLabel;
        providerUrl = courseData?.repository?.provider_url || null;
        console.log('Tutor course data structure:', {
          title: courseData?.title,
          repository: courseData?.repository
        });
      } catch (err) {
        console.warn('Failed to get tutor course details:', err);
      }
    }

    // If we still don't have a provider URL, we might need to skip Git setup
    if (!providerUrl) {
      console.warn(`No Git provider found for course "${courseLabel}". Some Git-related features may not work.`);
      // Don't call ensureCourseProviderAccount if there's no provider configured
      return;
    }

    await ensureCourseProviderAccount(
      api,
      this.context,
      courseId,
      courseLabel,
      providerUrl,
      currentUser
    );
  }

  private async initializeViews(api: ComputorApiService, courseId: string, views: string[]): Promise<void> {
    // Store the active views
    this.activeViews = views;

    // Initialize ALL available views - each will get its own activity bar container
    if (views.includes('student')) {
      await this.initializeStudentView(api, courseId);
      await vscode.commands.executeCommand('setContext', 'computor.student.show', true);
    }
    if (views.includes('tutor')) {
      await this.initializeTutorView(api, courseId);
      await vscode.commands.executeCommand('setContext', 'computor.tutor.show', true);
    }
    if (views.includes('lecturer')) {
      await this.initializeLecturerView(api, courseId);
      await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', true);
    }

    // Set context keys for views that are NOT available to false
    if (!views.includes('student')) {
      await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
    }
    if (!views.includes('tutor')) {
      await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);
    }
    if (!views.includes('lecturer')) {
      await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
    }
  }

  private async focusHighestPriorityView(views: string[]): Promise<void> {
    // Priority: lecturer > tutor > student
    let viewToFocus: string | null = null;
    let commandToRun: string | null = null;

    if (views.includes('lecturer')) {
      viewToFocus = 'lecturer';
      commandToRun = 'workbench.view.extension.computor-lecturer';
    } else if (views.includes('tutor')) {
      viewToFocus = 'tutor';
      commandToRun = 'workbench.view.extension.computor-tutor';
    } else if (views.includes('student')) {
      viewToFocus = 'student';
      commandToRun = 'workbench.view.extension.computor-student';
    }

    if (commandToRun) {
      try {
        await vscode.commands.executeCommand(commandToRun);
        console.log(`Focused on ${viewToFocus} view after login`);
      } catch (err) {
        console.warn(`Failed to focus on ${viewToFocus} view:`, err);
      }
    }
  }

  private async refreshWorkspaceGitLabTokens(): Promise<void> {
    try {
      const { GitLabTokenManager } = await import('./services/GitLabTokenManager');
      const tokenManager = GitLabTokenManager.getInstance(this.context);

      // Get all stored GitLab URLs that we have tokens for
      const gitlabUrls = await tokenManager.getStoredGitLabUrls();

      // Refresh tokens for each GitLab instance
      for (const gitlabUrl of gitlabUrls) {
        await tokenManager.refreshWorkspaceGitCredentials(gitlabUrl);
      }

      if (gitlabUrls.length > 0) {
        console.log(`[UnifiedController] Refreshed GitLab tokens for ${gitlabUrls.length} GitLab instances`);
      }
    } catch (error) {
      console.warn('[UnifiedController] Failed to refresh workspace GitLab tokens:', error);
    }
  }

  private async initializeStudentView(api: ComputorApiService, courseId: string): Promise<void> {
    // Initialize student-specific components
    const repositoryManager = new StudentRepositoryManager(this.context, api);
    const statusBar = (await import('./ui/StatusBarService')).StatusBarService.initialize(this.context);
    const courseSelectionService = CourseSelectionService.initialize(this.context, api, statusBar);

    // Initialize tree view
    const tree = new StudentCourseContentTreeProvider(api, courseSelectionService, repositoryManager, this.context);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.student.courses', tree));
    const treeView = vscode.window.createTreeView('computor.student.courses', { treeDataProvider: tree, showCollapseAll: true });
    this.disposables.push(treeView);

    const studentExpandListener = treeView.onDidExpandElement((event) => {
      const element = event.element;
      if (!element) return;
      void tree.onTreeItemExpanded(element);
    });
    const studentCollapseListener = treeView.onDidCollapseElement((event) => {
      const element = event.element;
      if (!element) return;
      void tree.onTreeItemCollapsed(element);
    });
    this.disposables.push(studentExpandListener, studentCollapseListener);

    // Set selected course into service
    await courseSelectionService.selectCourse(courseId);

    // Auto-setup repositories
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Preparing course repositories...', cancellable: false }, async (progress) => {
      progress.report({ message: 'Starting...' });
      try { await repositoryManager.autoSetupRepositories(courseId, (msg) => progress.report({ message: msg })); } catch (e) { console.error(e); }
      tree.refresh();
    });

    // Student commands
    const commands = new StudentCommands(this.context, tree, api, repositoryManager);
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
  }

  private async initializeTutorView(api: ComputorApiService, courseId: string): Promise<void> {
    // Register filter panel and tree
    const { TutorFilterPanelProvider } = await import('./ui/panels/TutorFilterPanel');
    const { TutorSelectionService } = await import('./services/TutorSelectionService');
    const { TutorStatusBarService } = await import('./ui/TutorStatusBarService');
    const selection = TutorSelectionService.initialize(this.context, api);

    const currentCourseId = selection.getCurrentCourseId();
    const currentCourseLabel = selection.getCurrentCourseLabel();
    if (currentCourseId !== courseId || !currentCourseLabel) {
      let resolvedLabel: string | null = null;
      try {
        const tutorCourse = await api.getTutorCourse(courseId);
        resolvedLabel = tutorCourse?.title || tutorCourse?.path || null;
      } catch (err) {
        console.warn('Failed to resolve tutor course label:', err);
      }
      await selection.selectCourse(courseId, resolvedLabel ?? currentCourseLabel ?? courseId);
    }
    const filterProvider = new TutorFilterPanelProvider(this.context.extensionUri, api, selection);
    this.disposables.push(vscode.window.registerWebviewViewProvider(TutorFilterPanelProvider.viewType, filterProvider));

    const { TutorStudentTreeProvider } = await import('./ui/tree/tutor/TutorStudentTreeProvider');
    const tree = new TutorStudentTreeProvider(api, selection);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.tutor.courses', tree));
    const treeView = vscode.window.createTreeView('computor.tutor.courses', { treeDataProvider: tree, showCollapseAll: true });
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
      const id = selection.getCurrentCourseId();
      if (!id) {
        return;
      }
      const label = selection.getCurrentCourseLabel();
      await selection.selectCourse(id, label);
      filterProvider.refreshFilters();
    }));

    const commands = new TutorCommands(this.context, tree, api);
    commands.registerCommands();
  }

  private async initializeLecturerView(api: ComputorApiService, courseId: string): Promise<void> {
    const tree = new LecturerTreeDataProvider(this.context, api);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.lecturer.courses', tree));

    const treeView = vscode.window.createTreeView('computor.lecturer.courses', {
      treeDataProvider: tree,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: tree
    });
    this.disposables.push(treeView);

    const lecturerExpandListener = treeView.onDidExpandElement((event) => {
      const elementId = event.element?.id;
      if (!elementId) return;
      void tree.setNodeExpanded(elementId, true);
    });
    const lecturerCollapseListener = treeView.onDidCollapseElement((event) => {
      const elementId = event.element?.id;
      if (!elementId) return;
      void tree.setNodeExpanded(elementId, false);
    });
    this.disposables.push(lecturerExpandListener, lecturerCollapseListener);

    const exampleTree = new LecturerExampleTreeProvider(this.context, api);
    const exampleTreeView = vscode.window.createTreeView('computor.lecturer.examples', {
      treeDataProvider: exampleTree,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: exampleTree
    });
    this.disposables.push(exampleTreeView);

    const commands = new LecturerCommands(this.context, tree, api);
    commands.registerCommands();

    // Register example-related commands (search, upload from ZIP, etc.)
    new LecturerExampleCommands(this.context, api, exampleTree);

    // Initialize lecturer assignments repository manager and trigger a background sync
    try {
      const { LecturerRepositoryManager } = await import('./services/LecturerRepositoryManager');
      const repoManager = new LecturerRepositoryManager(this.context, api);
      // Fire-and-forget sync on login
      void repoManager.syncAllAssignments((msg: string) => {
        console.log('[LecturerRepositoryManager]', msg);
      });
    } catch (err) {
      console.warn('LecturerRepositoryManager init failed:', err);
    }
  }


  async dispose(): Promise<void> {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    if (this.api) this.api.clearHttpClient();
    this.api = undefined;
  }

  getActiveViews(): string[] {
    return [...this.activeViews];
  }
}



interface UnifiedSession {
  deactivate: () => Promise<void>;
  getActiveViews: () => string[];
}

let activeSession: UnifiedSession | null = null;
let isAuthenticating = false;

const backendConnectionService = BackendConnectionService.getInstance();

async function unifiedLoginFlow(context: vscode.ExtensionContext): Promise<void> {
  if (isAuthenticating) { vscode.window.showInformationMessage('Login already in progress.'); return; }
  isAuthenticating = true;

  try {
    // Require an open workspace before proceeding
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
      return;
    }

    const settings = new ComputorSettingsManager(context);
    const baseUrl = await ensureBaseUrl(settings);
    if (!baseUrl) { return; }

    // If already logged in, ask if user wants to re-login
    if (activeSession) {
      const currentViews = activeSession.getActiveViews();
      const answer = await vscode.window.showWarningMessage(
        `Already logged in with views: ${currentViews.join(', ')}. Re-login?`,
        'Re-login', 'Cancel'
      );
      if (answer !== 'Re-login') { return; }
      await activeSession.deactivate();
      activeSession = null;
    }

    // Prompt for authentication - use generic auth since we don't know roles yet
    const secretKey = 'computor.auth';
    const storedRaw = await context.secrets.get(secretKey);
    const previous: StoredAuth | undefined = storedRaw ? JSON.parse(storedRaw) as StoredAuth : undefined;
    const type = await chooseAuthType(settings, previous?.type);
    if (!type) { return; }
    const creds = await promptCredentials('Student', type, settings, previous);
    if (!creds) { return; }
    const auth: StoredAuth = creds;

    backendConnectionService.setBaseUrl(baseUrl);
    const connectionStatus = await backendConnectionService.checkBackendConnection(baseUrl);
    if (!connectionStatus.isReachable) {
      await backendConnectionService.showConnectionError(connectionStatus);
      return;
    }

    const client = buildHttpClient(baseUrl, auth);
    const controller = new UnifiedController(context);

    try {
      await controller.activate(client as any);
      backendConnectionService.startHealthCheck(baseUrl);

      activeSession = {
        deactivate: () => controller.dispose().then(async () => {
          await vscode.commands.executeCommand('setContext', 'computor.isLoggedIn', false);
          await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
          await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
          await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);
          backendConnectionService.stopHealthCheck();
        }),
        getActiveViews: () => controller.getActiveViews()
      };

      await context.secrets.store(secretKey, JSON.stringify(auth));
      await vscode.commands.executeCommand('setContext', 'computor.isLoggedIn', true);

      const activeViews = controller.getActiveViews();
      vscode.window.showInformationMessage(`Logged in with views: ${activeViews.join(', ')}.`);
    } catch (error: any) {
      await controller.dispose();
      vscode.window.showErrorMessage(`Failed to login: ${error?.message || error}`);
      backendConnectionService.stopHealthCheck();
    }
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

  // Unified login command
  context.subscriptions.push(vscode.commands.registerCommand('computor.login', async () => unifiedLoginFlow(context)));

  context.subscriptions.push(vscode.commands.registerCommand('computor.manageGitLabTokens', async () => {
    await manageGitLabTokens(context);
  }));
  
  // Check for pending login after workspace change
  const pendingLogin = context.globalState.get<{ timestamp: number }>('pendingLogin');
  if (pendingLogin) {
    // Clear the pending login state
    await context.globalState.update('pendingLogin', undefined);

    // Check if the login is recent (within 5 seconds)
    if (Date.now() - pendingLogin.timestamp < 5000) {
      // Automatically continue the login flow
      setTimeout(() => {
        vscode.window.showInformationMessage('Continuing login after workspace change...');
        unifiedLoginFlow(context);
      }, 1000);
    }
  }

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
