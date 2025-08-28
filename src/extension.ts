import * as vscode from 'vscode';
import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { ComputorApiService } from './services/ComputorApiService';
import { BasicAuthHttpClient } from './http/BasicAuthHttpClient';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerExampleTreeProvider } from './ui/tree/lecturer/LecturerExampleTreeProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { LecturerExampleCommands } from './commands/LecturerExampleCommands';
import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { StudentCommands } from './commands/StudentCommands';
import { StudentRepositoryManager } from './services/StudentRepositoryManager';
import { TestResultsPanelProvider, TestResultsTreeDataProvider } from './ui/panels/TestResultsPanel';
import { TestResultService } from './services/TestResultService';
import { TutorTreeDataProvider } from './ui/tree/tutor/TutorTreeDataProvider';
import { TutorCommands } from './commands/TutorCommands';
import { IconGenerator } from './utils/IconGenerator';

interface AuthenticationData {
  backendUrl: string;
  username: string;
  password: string;
}

abstract class ComputorExtension {
  protected context: vscode.ExtensionContext;
  protected settingsManager: ComputorSettingsManager;
  protected apiService?: ComputorApiService;
  protected httpClient?: BasicAuthHttpClient;
  protected authData?: AuthenticationData;
  protected disposables: vscode.Disposable[] = [];
  protected statusBar: vscode.StatusBarItem;
  protected roleIdentifier: string;

  constructor(context: vscode.ExtensionContext, roleIdentifier: string) {
    this.context = context;
    this.roleIdentifier = roleIdentifier;
    this.settingsManager = new ComputorSettingsManager(context);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.show();
    this.context.subscriptions.push(this.statusBar);
  }

  abstract activate(): Promise<void>;

  abstract deactivate(): Promise<void>;

  async initialize(): Promise<void> {
    const restored = await this.restoreSession();
    if (restored) {
      this.statusBar.text = `$(account) ${this.roleIdentifier}: Restored`;
      this.statusBar.command = undefined;
      this.statusBar.tooltip = `Session restored. Click to activate ${this.roleIdentifier} view`;
    } else {
      this.statusBar.text = `$(sign-in) ${this.roleIdentifier}: Click to login`;
      this.statusBar.command = `computor.${this.roleIdentifier.toLowerCase()}.login`;
      this.statusBar.tooltip = `Click to sign in to Computor as ${this.roleIdentifier}`;
    }
  }

  protected async performLogin(): Promise<boolean> {
    try {
      const backendUrl = await vscode.window.showInputBox({
        title: `Computor ${this.roleIdentifier} Login`,
        prompt: 'Enter the backend API URL (realm)',
        placeHolder: 'http://localhost:8000',
        value: (await this.settingsManager.getSettings()).authentication.baseUrl || 'http://localhost:8000',
        validateInput: (value: string | URL) => {
          if (!value) {
            return 'Backend URL is required';
          }
          try {
            new URL(value);
            return null;
          } catch {
            return 'Please enter a valid URL';
          }
        }
      });

      if (!backendUrl) {
        return false;
      }

      const username = await vscode.window.showInputBox({
        title: `Computor ${this.roleIdentifier} Login`,
        prompt: 'Enter your username',
        placeHolder: 'Username',
        validateInput: (value: any) => {
          if (!value) {
            return 'Username is required';
          }
          return null;
        }
      });

      if (!username) {
        return false;
      }

      const password = await vscode.window.showInputBox({
        title: `Computor ${this.roleIdentifier} Login`,
        prompt: 'Enter your password',
        placeHolder: 'Password',
        password: true,
        validateInput: (value: any) => {
          if (!value) {
            return 'Password is required';
          }
          return null;
        }
      });

      if (!password) {
        return false;
      }

      this.authData = { backendUrl, username, password };

      if (this.apiService) {
        this.apiService.clearHttpClient();
      }

      this.httpClient = new BasicAuthHttpClient(backendUrl, username, password, 5000);

      const settings = await this.settingsManager.getSettings();
      settings.authentication.baseUrl = backendUrl;
      await this.settingsManager.saveSettings(settings);

      await this.context.secrets.store(`computor.${this.roleIdentifier}.username`, username);
      await this.context.secrets.store(`computor.${this.roleIdentifier}.password`, password);

      vscode.window.showInformationMessage(`Successfully logged in to Computor as ${this.roleIdentifier}`);
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      vscode.window.showErrorMessage(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  protected async restoreSession(): Promise<boolean> {
    try {
      const settings = await this.settingsManager.getSettings();
      const backendUrl = settings.authentication.baseUrl;
      const username = await this.context.secrets.get(`computor.${this.roleIdentifier}.username`);
      const password = await this.context.secrets.get(`computor.${this.roleIdentifier}.password`);

      if (!backendUrl || !username || !password) {
        return false;
      }

      this.authData = { backendUrl, username, password };
      this.httpClient = new BasicAuthHttpClient(backendUrl, username, password, 5000);
      
      await this.httpClient.get('/health');
      
      return true;
    } catch {
      return false;
    }
  }

  protected async logout(): Promise<void> {
    console.log(`[${this.roleIdentifier}] Logging out...`);
    
    await vscode.commands.executeCommand('setContext', `computor.${this.roleIdentifier.toLowerCase()}.show`, false);
    
    await this.context.secrets.delete(`computor.${this.roleIdentifier}.username`);
    await this.context.secrets.delete(`computor.${this.roleIdentifier}.password`);

    this.authData = undefined;
    this.httpClient = undefined;
    if (this.apiService) {
      this.apiService.clearHttpClient();
    }
    this.apiService = undefined;

    this.statusBar.text = `$(sign-in) ${this.roleIdentifier}: Click to login`;
    this.statusBar.command = `computor.${this.roleIdentifier.toLowerCase()}.login`;
    this.statusBar.tooltip = `Click to sign in to Computor as ${this.roleIdentifier}`;

    vscode.window.showInformationMessage(`Successfully logged out from Computor ${this.roleIdentifier}`);
  }

  protected disposeAll(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

class ComputorLecturerExtension extends ComputorExtension {
  private treeDataProvider?: LecturerTreeDataProvider;
  private exampleTreeProvider?: LecturerExampleTreeProvider;

  constructor(context: vscode.ExtensionContext) {
    super(context, 'Lecturer');
  }

  async activate(): Promise<void> {
    console.log('Activating Lecturer extension...');
    
    const restored = await this.restoreSession();
    if (restored) {
      await this.initializeLecturerView();
      this.registerCommands();
    } else {
      const success = await this.performLogin();
      if (success) {
        await this.initializeLecturerView();
        this.registerCommands();
      }
    }
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('computor.lecturer.logout', async () => {
        await this.logout();
        await this.deactivate();
      })
    );
  }

  private async initializeLecturerView(): Promise<void> {
    if (!this.httpClient) return;

    try {
      console.log('Checking lecturer role...');
      const response = await this.httpClient.get<any[]>('/lecturers/courses');
      const courses = response.data as any[];

      if (!courses || courses.length === 0) {
        vscode.window.showWarningMessage('No lecturer courses found');
        return;
      }

      console.log(`User has ${courses.length} lecturer courses`);
    } catch (error) {
      console.log('Lecturer role not available:', error);
      vscode.window.showErrorMessage('Lecturer role not available');
      return;
    }

    if (!this.apiService) {
      this.apiService = new ComputorApiService(this.context);
      if (this.httpClient) {
        (this.apiService as any).httpClient = this.httpClient;
      }
    }

    this.treeDataProvider = new LecturerTreeDataProvider(this.context, this.apiService);

    this.disposables.push(vscode.window.registerTreeDataProvider(
      "computor.lecturer.courses",
      this.treeDataProvider
    ));
    
    const treeView = vscode.window.createTreeView('computor.lecturer.courses', {
      treeDataProvider: this.treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: this.treeDataProvider
    });
    this.disposables.push(treeView);

    this.exampleTreeProvider = new LecturerExampleTreeProvider(this.context, this.apiService);
    
    const exampleTreeView = vscode.window.createTreeView('computor.lecturer.examples', {
      treeDataProvider: this.exampleTreeProvider,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: this.exampleTreeProvider
    });
    this.disposables.push(exampleTreeView);

    const commands = new LecturerCommands(this.context, this.treeDataProvider, this.apiService);
    commands.registerCommands();
    
    const exampleCommands = new LecturerExampleCommands(this.context, this.apiService, this.exampleTreeProvider);
    void exampleCommands;

    treeView.onDidExpandElement(async (e: { element: any; }) => {
      const item = e.element as any;
      if (item.id) {
        await this.treeDataProvider?.setNodeExpanded(item.id, true);
      }
    });

    treeView.onDidCollapseElement(async (e: { element: any; }) => {
      const item = e.element as any;
      if (item.id) {
        await this.treeDataProvider?.setNodeExpanded(item.id, false);
      }
    });

    console.log('[Lecturer] Setting context and showing view...');
    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await vscode.commands.executeCommand('workbench.view.extension.computor-lecturer');
      console.log('[Lecturer] View container shown');
    } catch (error) {
      console.error('[Lecturer] Failed to show view container:', error);
    }
    
    try {
      await vscode.commands.executeCommand('computor.lecturer.courses.focus');
      console.log('[Lecturer] View focused');
    } catch (error) {
      console.error('[Lecturer] Failed to focus view:', error);
    }

    this.statusBar.text = '$(account) Active: Lecturer';
    this.statusBar.command = undefined;
    this.statusBar.tooltip = 'Logged in as Lecturer';
  }

  async deactivate(): Promise<void> {
    console.log('Deactivating Lecturer extension...');
    this.disposeAll();
    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
  }
}

class ComputorTutorExtension extends ComputorExtension {
  private treeDataProvider?: TutorTreeDataProvider;

  constructor(context: vscode.ExtensionContext) {
    super(context, 'Tutor');
  }

  async activate(): Promise<void> {
    console.log('Activating Tutor extension...');
    
    const restored = await this.restoreSession();
    if (restored) {
      await this.initializeTutorView();
      this.registerCommands();
    } else {
      const success = await this.performLogin();
      if (success) {
        await this.initializeTutorView();
        this.registerCommands();
      }
    }
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('computor.tutor.logout', async () => {
        await this.logout();
        await this.deactivate();
      })
    );
  }

  private async initializeTutorView(): Promise<void> {
    if (!this.httpClient) return;

    try {
      console.log('Checking tutor role...');
      const response = await this.httpClient.get<any[]>('/tutors/courses');
      const courses = response.data as any[];

      if (!courses || courses.length === 0) {
        vscode.window.showWarningMessage('No tutor courses found');
        return;
      }

      console.log(`User has ${courses.length} tutor courses`);
    } catch (error) {
      console.log('Tutor role not available:', error);
      vscode.window.showErrorMessage('Tutor role not available');
      return;
    }

    if (!this.apiService) {
      this.apiService = new ComputorApiService(this.context);
      if (this.httpClient) {
        (this.apiService as any).httpClient = this.httpClient;
      }
    }

    this.treeDataProvider = new TutorTreeDataProvider(this.context, this.apiService);

    this.disposables.push(vscode.window.registerTreeDataProvider(
      "computor.tutor.courses",
      this.treeDataProvider
    ));
    
    const treeView = vscode.window.createTreeView('computor.tutor.courses', {
      treeDataProvider: this.treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    this.disposables.push(treeView);

    const commands = new TutorCommands(this.context, this.treeDataProvider, this.apiService);
    commands.registerCommands();

    console.log('[Tutor] Setting context and showing view...');
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await vscode.commands.executeCommand('workbench.view.extension.computor-tutor');
      console.log('[Tutor] View container shown');
    } catch (error) {
      console.error('[Tutor] Failed to show view container:', error);
    }
    
    try {
      await vscode.commands.executeCommand('computor.tutor.courses.focus');
      console.log('[Tutor] View focused');
    } catch (error) {
      console.error('[Tutor] Failed to focus view:', error);
    }

    this.statusBar.text = '$(account) Active: Tutor';
    this.statusBar.command = undefined;
    this.statusBar.tooltip = 'Logged in as Tutor';
  }

  async deactivate(): Promise<void> {
    console.log('Deactivating Tutor extension...');
    this.disposeAll();
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);
  }
}

class ComputorStudentExtension extends ComputorExtension {
  private treeDataProvider?: StudentCourseContentTreeProvider;
  private repoManager?: StudentRepositoryManager;

  constructor(context: vscode.ExtensionContext) {
    super(context, 'Student');
  }

  async activate(): Promise<void> {
    console.log('Activating Student extension...');
    
    const restored = await this.restoreSession();
    if (restored) {
      await this.initializeStudentView();
      this.registerCommands();
    } else {
      const success = await this.performLogin();
      if (success) {
        await this.initializeStudentView();
        this.registerCommands();
      }
    }
  }

  private registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand('computor.student.logout', async () => {
        await this.logout();
        await this.deactivate();
      })
    );
  }

  private async initializeStudentView(): Promise<void> {
    if (!this.httpClient) return;

    try {
      console.log('Checking student role...');
      const response = await this.httpClient.get<any[]>('/students/courses');
      const courses = response.data as any[];

      if (!courses || courses.length === 0) {
        vscode.window.showWarningMessage('No student courses found');
        return;
      }

      console.log(`User has ${courses.length} student courses`);
    } catch (error) {
      console.log('Student role not available:', error);
      vscode.window.showErrorMessage('Student role not available');
      return;
    }

    if (!this.apiService) {
      this.apiService = new ComputorApiService(this.context);
      if (this.httpClient) {
        (this.apiService as any).httpClient = this.httpClient;
      }
    }

    this.repoManager = new StudentRepositoryManager(this.context, this.apiService);

    const courseSelection = {
      getCurrentCourse: () => null,
      getCurrentCourseId: () => undefined,
      getCurrentCourseInfo: () => undefined,
      getCourseWorkspacePath: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
      selectCourse: async (courseId?: string) => { 
        console.log('Selected course:', courseId); 
        return undefined;
      },
      ensureCourseSelected: async () => undefined,
      clearSelection: async () => { console.log('Cleared course selection'); }
    } as any;
    
    this.treeDataProvider = new StudentCourseContentTreeProvider(
      this.apiService, 
      courseSelection, 
      this.repoManager, 
      this.context
    );

    this.disposables.push(vscode.window.registerTreeDataProvider(
      "computor.student.courses",
      this.treeDataProvider
    ));
    
    const treeView = vscode.window.createTreeView('computor.student.courses', {
      treeDataProvider: this.treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    this.disposables.push(treeView);

    const commands = new StudentCommands(this.context, this.treeDataProvider, this.apiService);
    commands.registerCommands();

    const testResultsPanelProvider = new TestResultsPanelProvider(this.context.extensionUri);
    
    this.disposables.push(
      vscode.window.registerWebviewViewProvider(
        TestResultsPanelProvider.viewType,
        testResultsPanelProvider
      )
    );
    
    const testResultsTreeProvider = new TestResultsTreeDataProvider([]);
    
    this.disposables.push(vscode.window.registerTreeDataProvider(
      'computor.testResultsView',
      testResultsTreeProvider
    ));

    const testResultService = TestResultService.getInstance();
    testResultService.setApiService(this.apiService);
    testResultService.setTestResultsPanelProvider(testResultsPanelProvider);
    testResultService.setTestResultsTreeProvider(testResultsTreeProvider);
    
    this.disposables.push(
      vscode.commands.registerCommand('computor.results.panel.update', (item: any) => {
        testResultsPanelProvider.updateTestResults(item);
      })
    );

    treeView.onDidExpandElement(async (e: { element: any; }) => {
      const element = e.element as any;
      await this.treeDataProvider?.onTreeItemExpanded(element);
    });

    treeView.onDidCollapseElement(async (e: { element: any; }) => {
      await this.treeDataProvider?.onTreeItemCollapsed(e.element as any);
    });

    console.log('[Student] Setting context and showing view...');
    await vscode.commands.executeCommand('setContext', 'computor.student.show', true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      await vscode.commands.executeCommand('workbench.view.extension.computor-student');
      console.log('[Student] View container shown');
    } catch (error) {
      console.error('[Student] Failed to show view container:', error);
    }
    
    try {
      await vscode.commands.executeCommand('computor.student.courses.focus');
      console.log('[Student] View focused');
    } catch (error) {
      console.error('[Student] Failed to focus view:', error);
    }

    this.statusBar.text = '$(account) Active: Student';
    this.statusBar.command = undefined;
    this.statusBar.tooltip = 'Logged in as Student';
  }

  async deactivate(): Promise<void> {
    console.log('Deactivating Student extension...');
    this.disposeAll();
    await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
  }
}

let extensions: Array<{id: string, extension: ComputorExtension}> = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Computor extension is now active');

  IconGenerator.initialize(context);

  extensions.push({id: "computor.lecturer.login", extension: new ComputorLecturerExtension(context)});
  extensions.push({id: "computor.tutor.login", extension: new ComputorTutorExtension(context)});
  extensions.push({id: "computor.student.login", extension: new ComputorStudentExtension(context)});

  for (const { id, extension } of extensions) {
    await extension.initialize();
    
    context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
      await extension.activate();
    }));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('computor.logout', async () => {
      for (const { extension } of extensions) {
        await extension.deactivate();
      }
      vscode.window.showInformationMessage('Logged out from all Computor roles');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('computor.settings', async () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'computor');
    })
  );
}

export function deactivate(): void {

  for (const { extension } of extensions) {
    extension.deactivate();
  }

  IconGenerator.cleanup();
}