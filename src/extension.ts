import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { IconGenerator } from './utils/IconGenerator';

import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { ComputorApiService } from './services/ComputorApiService';

import { BasicAuthHttpClient } from './http/BasicAuthHttpClient';
import { ApiKeyHttpClient } from './http/ApiKeyHttpClient';
import { JwtHttpClient } from './http/JwtHttpClient';

import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerExampleTreeProvider } from './ui/tree/lecturer/LecturerExampleTreeProvider';
import { LecturerCommands } from './commands/LecturerCommands';
// import { LecturerExampleCommands } from './commands/LecturerExampleCommands';

import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { StudentRepositoryManager } from './services/StudentRepositoryManager';
import { CourseSelectionService } from './services/CourseSelectionService';
import { StudentCommands } from './commands/StudentCommands';

// import { TutorTreeDataProvider } from './ui/tree/tutor/TutorTreeDataProvider';
import { TutorCommands } from './commands/TutorCommands';

import { TestResultsPanelProvider, TestResultsTreeDataProvider } from './ui/panels/TestResultsPanel';
import { TestResultService } from './services/TestResultService';

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

async function ensureCourseMarker(role: Extract<Role, 'Student' | 'Tutor'>, api: ComputorApiService): Promise<string | undefined> {
  const root = getWorkspaceRoot();
  if (!root) {
    const action = await vscode.window.showErrorMessage(`${role} login requires an open workspace.`, 'Open Folder');
    if (action === 'Open Folder') {
      await vscode.commands.executeCommand('vscode.openFolder');
    }
    return undefined;
  }
  const file = path.join(root, role === 'Student' ? STUDENT_MARKER : TUTOR_MARKER);
  const existing = await readMarker(file);
  if (role === 'Tutor') {
    // For Tutor: just ensure marker file exists; no course binding here.
    if (!existing) {
      await writeMarker(file, { courseId: '' as any });
    }
    return undefined;
  }
  if (existing?.courseId) return existing.courseId;

  const courses = await api.getStudentCourses();
  if (!courses || courses.length === 0) {
    vscode.window.showWarningMessage(`No ${role.toLowerCase()} courses found for your account.`);
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    courses.map((c: any) => ({ label: c.title || c.path || c.name || c.id, description: c.path || '', course: c })),
    { title: `${role}: Select Course`, placeHolder: 'Pick your course' }
  );
  if (!pick) return undefined;
  await writeMarker(file, { courseId: pick.course.id });
  return pick.course.id as string;
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

  async activate(client: ReturnType<typeof buildHttpClient>): Promise<void> {
    const api = await this.setupApi(client);
    try {
      const resp = await client.get<any[]>('/lecturers/courses');
      if (!resp.data || resp.data.length === 0) {
        vscode.window.showWarningMessage('No lecturer courses found.');
      }
    } catch (e) {
      vscode.window.showErrorMessage('Lecturer role not available.');
      throw e;
    }

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

    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', true);
    await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);

    try { await vscode.commands.executeCommand('workbench.view.extension.computor-lecturer'); } catch {}
    try { await vscode.commands.executeCommand('computor.lecturer.courses.focus'); } catch {}
  }
}

class TutorController extends BaseRoleController {
  private tree?: any;

  async activate(client: ReturnType<typeof buildHttpClient>): Promise<void> {
    const api = await this.setupApi(client);

    try {
      const courses = await api.getTutorCourses();
      if (!courses || courses.length === 0) {
        vscode.window.showWarningMessage('No tutor courses found.');
      }
    } catch (e) {
      vscode.window.showErrorMessage('Tutor role not available.');
      throw e;
    }

    // Ensure tutor marker exists (no course binding)
    await ensureCourseMarker('Tutor', api);

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

    try { await vscode.commands.executeCommand('workbench.view.extension.computor-tutor'); } catch {}
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
    const courseId = await ensureCourseMarker('Student', api);
    if (!courseId) throw new Error('Student course selection cancelled.');

    this.repositoryManager = new StudentRepositoryManager(this.context, api);
    const statusBar = (await import('./ui/StatusBarService')).StatusBarService.initialize(this.context);
    this.courseSelectionService = CourseSelectionService.initialize(this.context, api, statusBar);

    // Initialize tree view
    this.tree = new StudentCourseContentTreeProvider(api, this.courseSelectionService!, this.repositoryManager, this.context);
    this.disposables.push(vscode.window.registerTreeDataProvider('computor.student.courses', this.tree));
    const treeView = vscode.window.createTreeView('computor.student.courses', { treeDataProvider: this.tree, showCollapseAll: true });
    this.disposables.push(treeView);

    // Set selected course into service
    await this.courseSelectionService!.selectCourse(courseId);

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

    try { await vscode.commands.executeCommand('workbench.view.extension.computor-student'); } catch {}
  }
}

let activeSession: ActiveSession | null = null;
let isAuthenticating = false;

async function loginFlow(context: vscode.ExtensionContext, role: Role): Promise<void> {
  if (isAuthenticating) { vscode.window.showInformationMessage('Login already in progress.'); return; }
  isAuthenticating = true;
  // Require an open workspace for all roles before proceeding
  const root = getWorkspaceRoot();
  if (!root) {
    const action = await vscode.window.showErrorMessage('Login requires an open workspace.', 'Open Folder');
    if (action === 'Open Folder') {
      await vscode.commands.executeCommand('vscode.openFolder');
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

  const client = buildHttpClient(baseUrl, auth);
  // Try a light probe to verify connectivity
  try { await client.get('/health'); } catch {
    // continue; some backends may not expose /health, validation occurs lazily
  }

  let controller: BaseRoleController;
  if (role === 'Lecturer') controller = new LecturerController(context);
  else if (role === 'Tutor') controller = new TutorController(context);
  else controller = new StudentController(context);

  try {
    await controller.activate(client as any);
    activeSession = { role, deactivate: () => controller.dispose().then(async () => {
      await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
      await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
      await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);
    }) };
    await context.secrets.store(secretKey, JSON.stringify(auth));
    vscode.window.showInformationMessage(`Logged in as ${role}.`);
  } catch (error: any) {
    await controller.dispose();
    vscode.window.showErrorMessage(`Failed to activate ${role}: ${error?.message || error}`);
  } finally {
    isAuthenticating = false;
  }
}

// Removed automatic marker-based login prompts per user request

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Computor extension activated');
  IconGenerator.initialize(context);

  // Commands: per-role logins
  context.subscriptions.push(vscode.commands.registerCommand('computor.lecturer.login', async () => loginFlow(context, 'Lecturer')));
  context.subscriptions.push(vscode.commands.registerCommand('computor.student.login', async () => loginFlow(context, 'Student')));
  context.subscriptions.push(vscode.commands.registerCommand('computor.tutor.login', async () => loginFlow(context, 'Tutor')));

  // Logout command
  context.subscriptions.push(vscode.commands.registerCommand('computor.logout', async () => {
    if (!activeSession) { vscode.window.showInformationMessage('Not logged in.'); return; }
    const role = activeSession.role;
    await activeSession.deactivate();
    activeSession = null;
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
