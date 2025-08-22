import * as vscode from 'vscode';
import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { ComputorApiService } from './services/ComputorApiService';
import { BasicAuthHttpClient } from './http/BasicAuthHttpClient';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { TutorTreeDataProvider } from './ui/tree/tutor/TutorTreeDataProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { StudentCommands } from './commands/StudentCommands';
import { TutorCommands } from './commands/TutorCommands';

interface RoleConfiguration {
  role: 'student' | 'tutor' | 'lecturer';
  endpoint: string;
  viewContainer: string;
  commands: string[];
}

interface AuthenticationData {
  backendUrl: string;
  username: string;
  password: string;
}

class ComputorExtension {
  private context: vscode.ExtensionContext;
  private settingsManager: ComputorSettingsManager;
  private apiService?: ComputorApiService;
  private statusBar: vscode.StatusBarItem;
  private activeRoles: Set<string> = new Set();
  private roleDisposables: Map<string, vscode.Disposable[]> = new Map();
  private authData?: AuthenticationData;
  private httpClient?: BasicAuthHttpClient;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.settingsManager = new ComputorSettingsManager(context);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.show();
    this.context.subscriptions.push(this.statusBar);
  }

  async activate(): Promise<void> {
    console.log('Computor extension is activating...');

    // Register base commands that are always available
    this.registerBaseCommands();

    // Try to restore previous session
    const restored = await this.restoreSession();
    if (restored) {
      await this.initializeRoles();
    } else {
      // Show login prompt if no previous session
      await vscode.commands.executeCommand('computor.login');
    }
  }

  private registerBaseCommands(): void {
    // Login command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.login', async () => {
        await this.login();
      })
    );

    // Logout command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.logout', async () => {
        await this.logout();
      })
    );

    // Refresh command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.refresh', async () => {
        await this.refresh();
      })
    );

    // Settings command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.settings', async () => {
        await this.openSettings();
      })
    );
  }

  private async login(): Promise<void> {
    try {
      // Prompt for backend URL
      const backendUrl = await vscode.window.showInputBox({
        title: 'Computor Backend URL',
        prompt: 'Enter the backend API URL (realm)',
        placeHolder: 'http://localhost:8000',
        value: (await this.settingsManager.getSettings()).authentication.baseUrl || 'http://localhost:8000',
        validateInput: (value) => {
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
        return;
      }

      // Prompt for username
      const username = await vscode.window.showInputBox({
        title: 'Computor Authentication',
        prompt: 'Enter your username',
        placeHolder: 'Username',
        validateInput: (value) => {
          if (!value) {
            return 'Username is required';
          }
          return null;
        }
      });

      if (!username) {
        return;
      }

      // Prompt for password
      const password = await vscode.window.showInputBox({
        title: 'Computor Authentication',
        prompt: 'Enter your password',
        placeHolder: 'Password',
        password: true,
        validateInput: (value) => {
          if (!value) {
            return 'Password is required';
          }
          return null;
        }
      });

      if (!password) {
        return;
      }

      // Store authentication data
      this.authData = { backendUrl, username, password };

      // Create HTTP client with basic auth
      this.httpClient = new BasicAuthHttpClient(backendUrl, username, password, 5000);

      // Save settings
      const settings = await this.settingsManager.getSettings();
      settings.authentication.baseUrl = backendUrl;
      await this.settingsManager.saveSettings(settings);

      // Save credentials securely
      await this.context.secrets.store('computor.username', username);
      await this.context.secrets.store('computor.password', password);

      // Initialize roles based on available courses
      await this.initializeRoles();

      vscode.window.showInformationMessage('Successfully logged in to Computor');
    } catch (error) {
      console.error('Login failed:', error);
      vscode.window.showErrorMessage(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async logout(): Promise<void> {
    // Clear all role views
    this.clearAllRoles();

    // Clear stored credentials
    await this.context.secrets.delete('computor.username');
    await this.context.secrets.delete('computor.password');

    // Clear authentication data
    this.authData = undefined;
    this.httpClient = undefined;
    this.apiService = undefined;

    // Update status bar
    this.statusBar.text = '$(sign-out) Logged out';

    vscode.window.showInformationMessage('Successfully logged out from Computor');
  }

  private async restoreSession(): Promise<boolean> {
    try {
      const settings = await this.settingsManager.getSettings();
      const backendUrl = settings.authentication.baseUrl;
      const username = await this.context.secrets.get('computor.username');
      const password = await this.context.secrets.get('computor.password');

      if (!backendUrl || !username || !password) {
        return false;
      }

      this.authData = { backendUrl, username, password };
      this.httpClient = new BasicAuthHttpClient(backendUrl, username, password, 5000);
      
      // Test the connection
      await this.httpClient.get('/health');
      
      return true;
    } catch {
      return false;
    }
  }

  private async initializeRoles(): Promise<void> {
    if (!this.httpClient || !this.authData) {
      vscode.window.showErrorMessage('Not authenticated. Please login first.');
      return;
    }

    // Clear existing roles
    this.clearAllRoles();

    const roleConfigurations: RoleConfiguration[] = [
      {
        role: 'student',
        endpoint: '/students/courses',
        viewContainer: 'computor-student',
        commands: ['computor.student.refresh', 'computor.student.startWorkSession']
      },
      {
        role: 'tutor',
        endpoint: '/tutors/courses',
        viewContainer: 'computor-tutor',
        commands: ['computor.tutor.refresh']
      },
      {
        role: 'lecturer',
        endpoint: '/lecturers/courses',
        viewContainer: 'computor-lecturer',
        commands: ['computor.lecturer.refresh']
      }
    ];

    // Check each role endpoint
    for (const config of roleConfigurations) {
      try {
        const response = await this.httpClient.get<any[]>(config.endpoint);
        const courses = response.data as any[];

        if (courses && courses.length > 0) {
          console.log(`User has ${courses.length} courses for role: ${config.role}`);
          await this.activateRole(config);
        } else {
          console.log(`No courses found for role: ${config.role}`);
        }
      } catch (error) {
        console.log(`Role ${config.role} not available:`, error);
      }
    }

    // Update status bar
    const activeRolesText = Array.from(this.activeRoles).join(', ');
    if (activeRolesText) {
      this.statusBar.text = `$(account) Active: ${activeRolesText}`;
    } else {
      this.statusBar.text = '$(warning) No active roles';
      vscode.window.showWarningMessage('No courses found for any role. Please check your enrollment status.');
    }
  }

  private async activateRole(config: RoleConfiguration): Promise<void> {
    if (this.activeRoles.has(config.role)) {
      return;
    }

    console.log(`Activating role: ${config.role}`);
    const disposables: vscode.Disposable[] = [];

    try {
      // Create API service if not exists
      if (!this.apiService) {
        this.apiService = new ComputorApiService(this.context);
        // Configure API service with auth data
        if (this.httpClient) {
          (this.apiService as any).httpClient = this.httpClient;
        }
      }

      switch (config.role) {
        case 'lecturer':
          await this.activateLecturerRole(disposables);
          break;
        case 'student':
          await this.activateStudentRole(disposables);
          break;
        case 'tutor':
          await this.activateTutorRole(disposables);
          break;
      }

      this.activeRoles.add(config.role);
      this.roleDisposables.set(config.role, disposables);
      console.log(`Role ${config.role} activated successfully`);
    } catch (error) {
      console.error(`Failed to activate role ${config.role}:`, error);
      disposables.forEach(d => d.dispose());
      vscode.window.showErrorMessage(`Failed to activate ${config.role} role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async activateLecturerRole(disposables: vscode.Disposable[]): Promise<void> {
    // Create tree data provider
    const treeDataProvider = new LecturerTreeDataProvider(this.context);
    
    // Register tree view
    const treeView = vscode.window.createTreeView('computor.lecturer.courses', {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    disposables.push(treeView);

    // Register commands
    const commands = new LecturerCommands(this.context, treeDataProvider);
    commands.registerCommands();

    // Track tree expansion state
    treeView.onDidExpandElement(async (e) => {
      const item = e.element as any;
      if (item.id) {
        await treeDataProvider.setNodeExpanded(item.id, true);
      }
    });

    treeView.onDidCollapseElement(async (e) => {
      const item = e.element as any;
      if (item.id) {
        await treeDataProvider.setNodeExpanded(item.id, false);
      }
    });
  }

  private async activateStudentRole(disposables: vscode.Disposable[]): Promise<void> {
    if (!this.apiService) {
      throw new Error('API service not initialized');
    }

    // Create a minimal course selection service for now
    // The full implementation would require StatusBarService which we're not using yet
    const courseSelection = {
      getCurrentCourse: () => null,
      selectCourse: async (courseId: string) => { console.log('Selected course:', courseId); },
      getWorkspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''
    } as any;
    
    // Create tree data provider
    const treeDataProvider = new StudentCourseContentTreeProvider(this.apiService, courseSelection);
    
    // Register tree view
    const treeView = vscode.window.createTreeView('computor.student.courseContent', {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    disposables.push(treeView);

    // Register commands
    const commands = new StudentCommands(this.context, treeDataProvider);
    commands.registerCommands();

    // Track tree expansion state
    treeView.onDidExpandElement(async (e) => {
      await treeDataProvider.onTreeItemExpanded(e.element as any);
    });

    treeView.onDidCollapseElement(async (e) => {
      await treeDataProvider.onTreeItemCollapsed(e.element as any);
    });
  }

  private async activateTutorRole(disposables: vscode.Disposable[]): Promise<void> {
    // Create tree data provider
    const treeDataProvider = new TutorTreeDataProvider(this.context);
    
    // Register tree view
    const treeView = vscode.window.createTreeView('computor.tutor.courses', {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    disposables.push(treeView);

    // Register commands
    const commands = new TutorCommands(this.context, treeDataProvider);
    commands.registerCommands();
  }

  private clearAllRoles(): void {
    for (const [role, disposables] of this.roleDisposables) {
      console.log(`Deactivating role: ${role}`);
      disposables.forEach(d => d.dispose());
    }
    this.roleDisposables.clear();
    this.activeRoles.clear();
  }

  private async refresh(): Promise<void> {
    console.log('Refreshing all active roles...');
    await this.initializeRoles();
    vscode.window.showInformationMessage('Computor views refreshed');
  }

  private async openSettings(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.openSettings', 'computor');
  }

  deactivate(): void {
    this.clearAllRoles();
  }
}

let extension: ComputorExtension | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Computor extension is now active');
  
  extension = new ComputorExtension(context);
  await extension.activate();
}

export function deactivate(): void {
  if (extension) {
    extension.deactivate();
  }
}