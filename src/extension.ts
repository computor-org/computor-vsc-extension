import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { ComputorApiService } from './services/ComputorApiService';
import { BasicAuthHttpClient } from './http/BasicAuthHttpClient';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerExampleTreeProvider } from './ui/tree/lecturer/LecturerExampleTreeProvider';
import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { TutorTreeDataProvider } from './ui/tree/tutor/TutorTreeDataProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { StudentCommands } from './commands/StudentCommands';
import { TutorCommands } from './commands/TutorCommands';
import { LecturerExampleCommands } from './commands/LecturerExampleCommands';
import { IconGenerator } from './utils/IconGenerator';
import { StudentRepositoryManager } from './services/StudentRepositoryManager';

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
  private authData?: AuthenticationData;
  private httpClient?: BasicAuthHttpClient;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.settingsManager = new ComputorSettingsManager(context);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.show();
    this.context.subscriptions.push(this.statusBar);
    void this.authData; // Used for storing authentication data
  }

  async activate(): Promise<void> {
    console.log('Computor extension is activating...');

    // Initialize IconGenerator for colored icons
    IconGenerator.initialize(this.context);

    // Register base commands that are always available
    this.registerBaseCommands();

    // Try to restore previous session silently
    const restored = await this.restoreSession();
    if (restored) {
      //await this.initializeRoles();
    } else {
      // Show status that user needs to login
      this.statusBar.text = '$(sign-in) Computor: Click to login';
      this.statusBar.command = 'computor.login';
      this.statusBar.tooltip = 'Click to sign in to Computor';
    }
    // Don't prompt for login automatically - user must run the login command manually
  }

  private registerBaseCommands(): void {
    // Student login command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.login', async () => {
        await this.loginAndActivateStudent();
      })
    );

    // Tutor login command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.login', async () => {
        await this.loginAndActivateTutor();
      })
    );

    // Lecturer login command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.login', async () => {
        await this.loginAndActivateLecturer();
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

  private async loginAndActivateStudent(): Promise<void> {
    // Check if we're in the correct workspace directory
    const workspaceRoot = path.join(os.homedir(), '.computor', 'workspace');
    const coursesPath = path.join(workspaceRoot, 'courses');
    
    // Ensure the directory exists
    await fs.promises.mkdir(coursesPath, { recursive: true });
    
    // Check current workspace
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    const isInStudentWorkspace = workspaceFolders.some(folder => 
      folder.uri.fsPath === coursesPath || 
      folder.uri.fsPath.startsWith(coursesPath)
    );
    
    // Check if in any Computor workspace (could be tutor or lecturer)
    const isInComputorWorkspace = workspaceFolders.some(folder =>
      folder.uri.fsPath.includes('.computor/workspace')
    );
    
    if (isInStudentWorkspace) {
      // Already in the correct workspace
      vscode.window.showInformationMessage(
        'Already in Computor student workspace. Proceeding with login...'
      );
    } else if (isInComputorWorkspace) {
      // In a different Computor workspace
      const switchWorkspace = await vscode.window.showInformationMessage(
        'You are in a different Computor workspace. Switch to student workspace?',
        'Yes',
        'No'
      );
      
      if (switchWorkspace !== 'Yes') {
        return;
      }
      
      // Open the courses folder as workspace
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(coursesPath), false);
      // Extension will reinitialize
      return;
    } else if (workspaceFolders.length > 0) {
      // In a non-Computor workspace
      const switchWorkspace = await vscode.window.showInformationMessage(
        'Student login requires the Computor workspace. Switch to student workspace?',
        'Switch Workspace',
        'Cancel'
      );
      
      if (switchWorkspace !== 'Switch Workspace') {
        return;
      }
      
      // Open the courses folder as workspace
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(coursesPath), false);
      // Extension will reinitialize
      return;
    } else {
      // No workspace open
      const openWorkspace = await vscode.window.showInformationMessage(
        'No workspace open. Open Computor student workspace?',
        'Open Workspace',
        'Cancel'
      );
      
      if (openWorkspace !== 'Open Workspace') {
        return;
      }
      
      // Open the courses folder as workspace
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(coursesPath), false);
      // Extension will reinitialize
      return;
    }
    
    // We're in the correct workspace, proceed with login
    const loginSuccess = await this.performLogin();
    if (!loginSuccess) return;

    // Then specifically activate student role
    await this.activateStudentRole();
    
    // Update status bar
    this.statusBar.text = '$(account) Active: student';
  }

  private async loginAndActivateTutor(): Promise<void> {
    // First perform the login
    const loginSuccess = await this.performLogin();
    if (!loginSuccess) return;

    // Then specifically activate tutor role
    await this.activateTutorRole();
    
    // Update status bar
    this.statusBar.text = '$(account) Active: tutor';
  }

  private async loginAndActivateLecturer(): Promise<void> {
    // First perform the login
    const loginSuccess = await this.performLogin();
    if (!loginSuccess) return;

    // Then specifically activate lecturer role
    await this.activateLecturerRole();
    
    // Update status bar
    this.statusBar.text = '$(account) Active: lecturer';
  }

  private async performLogin(): Promise<boolean> {
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
        return false;
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
        return false;
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
        return false;
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

      vscode.window.showInformationMessage('Successfully logged in to Computor');
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      vscode.window.showErrorMessage(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async logout(): Promise<void> {
    console.log('[Logout] Starting logout process...');
    
    // Clear all role views and hide view containers
    this.clearAllRoles();

    // Clear context keys to hide view containers
    await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', false);
    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', false);
    
    // Clear stored credentials
    await this.context.secrets.delete('computor.username');
    await this.context.secrets.delete('computor.password');

    // Clear authentication data
    this.authData = undefined;
    this.httpClient = undefined;
    this.apiService = undefined;

    // Update status bar to show login prompt
    this.statusBar.text = '$(sign-in) Computor: Click to login';
    this.statusBar.command = undefined; // Remove any command
    this.statusBar.tooltip = 'Use role-specific login commands';

    vscode.window.showInformationMessage('Successfully logged out from Computor');
    console.log('[Logout] Logout complete');
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

  private async activateLecturerRole(): Promise<void> {

    if (!this.httpClient) return;

    if (!this.apiService) {
      this.apiService = new ComputorApiService(this.context);
      // Configure API service with auth data
      if (this.httpClient) {
        (this.apiService as any).httpClient = this.httpClient;
      }
    }

    try {
      console.log('Checking lecturer role...');
      const response = await this.httpClient.get<any[]>('/lecturers/courses');
      const courses = response.data as any[];

      if (courses && courses.length > 0) {
        console.log(`User has ${courses.length} lecturer courses`);
      } else {
        console.log('No lecturer courses found');
        return;
      }
    } catch (error) {
      console.log('Lecturer role not available:', error);
      return;
    }

    if (!this.apiService) {
      throw new Error('API service not initialized');
    }
    
    // Create tree data provider with shared API service
    const treeDataProvider = new LecturerTreeDataProvider(this.context, this.apiService);

    this.context.subscriptions.push(vscode.window.registerTreeDataProvider(
      "computor.lecturer.courses",
      treeDataProvider
    ));
    
    // Register tree view
    const treeView = vscode.window.createTreeView('computor.lecturer.courses', {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false,
      dragAndDropController: treeDataProvider
    });
    this.context.subscriptions.push(treeView);

    // Create example tree provider
    const exampleTreeProvider = new LecturerExampleTreeProvider(this.context, this.apiService);
    
    // Register example tree view with drag support
    const exampleTreeView = vscode.window.createTreeView('computor.lecturer.examples', {
      treeDataProvider: exampleTreeProvider,
      showCollapseAll: true,
      canSelectMany: true,
      dragAndDropController: exampleTreeProvider
    });
    this.context.subscriptions.push(exampleTreeView);

    // Register commands with shared API service
    const commands = new LecturerCommands(this.context, treeDataProvider, this.apiService);
    commands.registerCommands();
    
    // Register example commands (includes all example-related commands)
    const exampleCommands = new LecturerExampleCommands(this.context, this.apiService, exampleTreeProvider);
    // Note: LecturerExampleCommands registers its own commands in the constructor
    void exampleCommands; // Commands are registered in constructor
    
    // Register the refresh command here since it's simple and used by multiple places
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.refreshExamples', () => {
        exampleTreeProvider.refresh();
      })
    );

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

    // Show and focus the lecturer view
    console.log('[Lecturer] Setting context and showing view...');
    await vscode.commands.executeCommand('setContext', 'computor.lecturer.show', true);
    
    // Small delay to ensure tree view is registered
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
  }

  private async activateStudentRole(): Promise<void> {

    if (!this.httpClient) return;

    if (!this.apiService) {
      this.apiService = new ComputorApiService(this.context);
      // Configure API service with auth data
      if (this.httpClient) {
        (this.apiService as any).httpClient = this.httpClient;
      }
    }

    try {
      console.log('Checking student role...');
      const response = await this.httpClient.get<any[]>('/students/courses');
      const courses = response.data as any[];

      if (courses && courses.length > 0) {
        console.log(`User has ${courses.length} student courses`);
      } else {
        console.log('No student courses found');
        return;
      }
    } catch (error) {
      console.log('Student role not available:', error);
      return;
    }

    if (!this.apiService) {
      throw new Error('API service not initialized');
    }

    // Create repository manager for auto-cloning
    const repoManager = new StudentRepositoryManager(this.context, this.apiService);

    // Create a minimal course selection service for now
    // The full implementation would require StatusBarService which we're not using yet
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
    
    // Create tree data provider with repository manager
    const treeDataProvider = new StudentCourseContentTreeProvider(this.apiService, courseSelection, repoManager);

    this.context.subscriptions.push(vscode.window.registerTreeDataProvider(
      "computor.student.courses",
      treeDataProvider
    ));
    
    // Register tree view
    const treeView = vscode.window.createTreeView('computor.student.courses', {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    this.context.subscriptions.push(treeView);

    // Register commands with shared API service
    const commands = new StudentCommands(this.context, treeDataProvider, this.apiService);
    commands.registerCommands();

    // Track tree expansion state
    treeView.onDidExpandElement(async (e) => {
      const element = e.element as any;
      await treeDataProvider.onTreeItemExpanded(element);
    });

    treeView.onDidCollapseElement(async (e) => {
      await treeDataProvider.onTreeItemCollapsed(e.element as any);
    });

    // Show and focus the student view
    console.log('[Student] Setting context and showing view...');
    await vscode.commands.executeCommand('setContext', 'computor.student.show', true);
    
    // Small delay to ensure tree view is registered
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
  }

  private async activateTutorRole(): Promise<void> {

    if (!this.httpClient) return;

    if (!this.apiService) {
      this.apiService = new ComputorApiService(this.context);
      // Configure API service with auth data
      if (this.httpClient) {
        (this.apiService as any).httpClient = this.httpClient;
      }
    }

    try {
      console.log('Checking tutor role...');
      const response = await this.httpClient.get<any[]>('/tutors/courses');
      const courses = response.data as any[];

      if (courses && courses.length > 0) {
        console.log(`User has ${courses.length} tutor courses`);
      } else {
        console.log('No tutor courses found');
        return;
      }
    } catch (error) {
      console.log('Tutor role not available:', error);
      return;
    }

    if (!this.apiService) {
      throw new Error('API service not initialized');
    }
    
    // Create tree data provider with shared API service
    const treeDataProvider = new TutorTreeDataProvider(this.context, this.apiService);

    this.context.subscriptions.push(vscode.window.registerTreeDataProvider(
      "computor.tutor.courses",
      treeDataProvider
    ));
    
    // Register tree view
    const treeView = vscode.window.createTreeView('computor.tutor.courses', {
      treeDataProvider,
      showCollapseAll: true,
      canSelectMany: false
    });
    this.context.subscriptions.push(treeView);

    // Register commands with shared API service
    const commands = new TutorCommands(this.context, treeDataProvider, this.apiService);
    commands.registerCommands();

    // Show and focus the tutor view
    console.log('[Tutor] Setting context and showing view...');
    await vscode.commands.executeCommand('setContext', 'computor.tutor.show', true);
    
    // Small delay to ensure tree view is registered
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
  }

  private clearAllRoles(): void {
    console.log('[ClearRoles] Deactivating all roles...');
    
    // Note: Since we're not tracking disposables individually anymore,
    // we'll rely on VSCode to clean up tree views when the extension deactivates.
    // The context keys will be cleared in the logout method.
    
    // Clear any references
    this.apiService = undefined;
    
    console.log('[ClearRoles] All roles cleared');
  }

  private async refresh(): Promise<void> {
    console.log('Refreshing all active roles...');
    //await this.initializeRoles();
    vscode.window.showInformationMessage('Computor views refreshed');
  }

  private async openSettings(): Promise<void> {
    vscode.commands.executeCommand('workbench.action.openSettings', 'computor');
  }

  deactivate(): void {
    this.clearAllRoles();
    // Clean up generated icons
    IconGenerator.cleanup();
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