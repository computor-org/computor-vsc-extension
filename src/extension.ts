import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { ComputorApiService } from './services/ComputorApiService';
import { BasicAuthHttpClient } from './http/BasicAuthHttpClient';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerExampleTreeProvider } from './ui/tree/lecturer/LecturerExampleTreeProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { LecturerExampleCommands } from './commands/LecturerExampleCommands';
// Student-related imports
import { StudentWorkspaceManager } from './services/StudentWorkspaceManager';
import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { StudentRepositoryManager } from './services/StudentRepositoryManager';
import { CourseSelectionService } from './services/CourseSelectionService';
import { StatusBarService } from './ui/StatusBarService';
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
    await vscode.commands.executeCommand('workbench.view.extension.computor-lecturer');
    
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

/**
 * Student Extension with course selection, repository management, and tree view
 */
class ComputorStudentExtension extends ComputorExtension {
  private workspaceManager?: StudentWorkspaceManager;
  private treeProvider?: StudentCourseContentTreeProvider;
  private repositoryManager?: StudentRepositoryManager;
  private courseSelectionService?: CourseSelectionService;
  private statusBarService?: StatusBarService;

  constructor(context: vscode.ExtensionContext) {
    super(context, 'Student');
  }

  async activate(): Promise<void> {
    console.log('Activating Student extension...');
    
    // Check if a workspace is open - required for students
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      const action = await vscode.window.showErrorMessage(
        'Student login requires an open workspace folder. This folder will be used to store all your course repositories.',
        'Open Folder',
        'Cancel'
      );
      
      if (action === 'Open Folder') {
        // Ask user to select a folder for course repositories
        const folderUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select Course Workspace',
          title: 'Select a folder where all course repositories will be stored'
        });
        
        if (folderUri && folderUri[0]) {
          const selectedPath = folderUri[0].fsPath;
          
          // Create marker file to indicate this is a student workspace
          const markerFile = path.join(selectedPath, '.computor_student');
          try {
            fs.writeFileSync(markerFile, JSON.stringify({
              created: new Date().toISOString(),
              type: 'student_workspace',
              version: '1.0'
            }, null, 2));
            console.log(`Created student marker file at: ${markerFile}`);
          } catch (error) {
            console.error('Failed to create marker file:', error);
          }
          
          // Open the folder as workspace
          await vscode.commands.executeCommand('vscode.openFolder', folderUri[0], false);
        }
      }
      
      console.error('No workspace folder open - student login cancelled');
      vscode.window.showInformationMessage(
        'To use Computor as a student: 1) Open a folder (File → Open Folder), 2) Try logging in again'
      );
      return;
    }
    
    const workspaceRoot = workspaceFolders[0]?.uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage('Unable to determine workspace folder path');
      return;
    }
    console.log(`Student workspace root: ${workspaceRoot}`);
    
    // Try to restore session first
    const restored = await this.restoreSession();
    if (restored) {
      console.log('Student session restored');
      // Create initial marker file if it doesn't exist (without course ID yet)
      this.createStudentMarkerFile(workspaceRoot);
      await this.initializeStudentView();
    } else {
      // Perform login
      const success = await this.performLogin();
      if (success) {
        console.log('Student login successful');
        // Create initial marker file if it doesn't exist (without course ID yet)
        this.createStudentMarkerFile(workspaceRoot);
        await this.initializeStudentView();
      }
    }
  }

  private createStudentMarkerFile(workspaceRoot: string, courseId?: string): void {
    const markerFile = path.join(workspaceRoot, '.computor_student');
    try {
      let markerData: any = {
        type: 'student_workspace',
        version: '1.0',
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      // If file exists, preserve some data
      if (fs.existsSync(markerFile)) {
        try {
          const existing = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
          markerData.created = existing.created || markerData.created;
          // Preserve existing course ID if no new one provided
          if (!courseId && existing.courseId) {
            markerData.courseId = existing.courseId;
          }
        } catch (e) {
          // If can't parse existing file, use new data
        }
      }

      // Add or update course ID if provided
      if (courseId) {
        markerData.courseId = courseId;
      }

      fs.writeFileSync(markerFile, JSON.stringify(markerData, null, 2));
      console.log(`Updated student marker file at: ${markerFile} with course ID: ${courseId || 'none'}`);
    } catch (error) {
      console.error('Failed to create/update marker file:', error);
    }
  }

  private async initializeStudentView(): Promise<void> {
    if (!this.httpClient) {
      console.error('No HTTP client available');
      return;
    }

    try {
      // Verify student role and get courses
      console.log('Checking student role...');
      const response = await this.httpClient.get<any[]>('/students/courses');
      const courses = response.data as any[];

      if (!courses || courses.length === 0) {
        vscode.window.showWarningMessage('No student courses found');
        return;
      }

      console.log(`Student has ${courses.length} courses available`);
      
      // Initialize API service
      if (!this.apiService) {
        this.apiService = new ComputorApiService(this.context);
        if (this.httpClient) {
          (this.apiService as any).httpClient = this.httpClient;
        }
      }

      // Initialize services and managers
      this.statusBarService = StatusBarService.initialize(this.context);
      this.courseSelectionService = CourseSelectionService.initialize(this.context, this.apiService, this.statusBarService);
      this.workspaceManager = new StudentWorkspaceManager(this.context, this.apiService);
      this.repositoryManager = new StudentRepositoryManager(this.context, this.apiService);

      // First, check if we have a saved course ID in the marker file
      let selectedCourseId: string | undefined;
      const workspaceFolders = vscode.workspace.workspaceFolders;
      
      if (workspaceFolders && workspaceFolders.length > 0 && workspaceFolders[0]) {
        const markerFile = path.join(workspaceFolders[0].uri.fsPath, '.computor_student');
        if (fs.existsSync(markerFile)) {
          try {
            const markerData = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
            if (markerData.courseId && courses.find(c => c.id === markerData.courseId)) {
              selectedCourseId = markerData.courseId;
              const course = courses.find(c => c.id === selectedCourseId);
              console.log(`Auto-selected course from marker file: ${course?.title || course?.path} (${selectedCourseId})`);
              
              // Show info message about which course was auto-selected
              vscode.window.showInformationMessage(
                `Working with course: ${course?.title || course?.path}`
              );
            }
          } catch (e) {
            console.error('Failed to read course ID from marker file:', e);
          }
        }
      }
      
      // If no course selected yet, prompt user to select one
      if (!selectedCourseId) {
        // Show course selection
        const courseItems = courses.map(course => ({
          label: course.title || course.path,
          description: course.path,
          detail: `Course ID: ${course.id}`,
          course
        }));
        
        const selected = await vscode.window.showQuickPick(courseItems, {
          placeHolder: 'Select a course to work on',
          title: 'Course Selection'
        });
        
        if (!selected) {
          vscode.window.showWarningMessage('No course selected. You must select a course to continue.');
          return;
        }
        
        selectedCourseId = selected.course.id;
      }

      // Save the selected course
      if (selectedCourseId) {
        this.workspaceManager.setCurrentCourseId(selectedCourseId);
        // Update marker file with course ID - this is critical!
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0 && workspaceFolders[0]) {
          this.createStudentMarkerFile(workspaceFolders[0].uri.fsPath, selectedCourseId);
          console.log(`Updated marker file with course ID: ${selectedCourseId}`);
        } else {
          console.error('Failed to update marker file - no workspace folder found!');
        }
      } else {
        console.error('No course selected - marker file not updated');
      }

      // Initialize tree view with proper styling
      this.treeProvider = new StudentCourseContentTreeProvider(this.apiService, this.courseSelectionService, this.repositoryManager, this.context);
      
      // Register tree data provider
      this.disposables.push(
        vscode.window.registerTreeDataProvider('computor.student.courses', this.treeProvider)
      );

      // Create tree view
      const treeView = vscode.window.createTreeView('computor.student.courses', {
        treeDataProvider: this.treeProvider,
        showCollapseAll: true
      });
      this.disposables.push(treeView);

      // Set the course in course selection service
      if (selectedCourseId) {
        const course = courses.find(c => c.id === selectedCourseId);
        if (course) {
          await this.courseSelectionService.selectCourse(course);
        }
        // Force a refresh after setting the course
        this.treeProvider.refresh();
      }

      // Register refresh command
      this.disposables.push(
        vscode.commands.registerCommand('computor.student.refresh', () => {
          this.treeProvider?.refresh();
        })
      );

      // Show student view
      await vscode.commands.executeCommand('setContext', 'computor.student.show', true);
      
      // Try to focus the view
      setTimeout(async () => {
        try {
          await vscode.commands.executeCommand('workbench.view.extension.computor-student');
        } catch (error) {
          console.log('Could not focus student view:', error);
        }
      }, 100);

      // Update status bar
      this.statusBar.text = '$(account) Active: Student';
      this.statusBar.command = undefined;
      this.statusBar.tooltip = 'Logged in as Student';

    } catch (error) {
      console.error('Failed to initialize student view:', error);
      vscode.window.showErrorMessage('Failed to initialize student view');
    }
  }

  async deactivate(): Promise<void> {
    console.log('Deactivating Student extension...');
    this.disposeAll();
    await vscode.commands.executeCommand('setContext', 'computor.student.show', false);
  }
}

type ComputorExtensionConstructor = new (context: any) => ComputorExtension;

let extensionClasses: Array<{id: string, extensionClass: ComputorExtensionConstructor}> = [];
let extensions: Array<ComputorExtension> = [];

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Computor extension is now active');

  IconGenerator.initialize(context);

  // Check if this is a student workspace
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0 && workspaceFolders[0]) {
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const markerFile = path.join(workspaceRoot, '.computor_student');
    
    if (fs.existsSync(markerFile)) {
      console.log('Detected student workspace marker file');
      
      // Auto-trigger student login after a short delay
      setTimeout(async () => {
        const answer = await vscode.window.showInformationMessage(
          'Student workspace detected. Would you like to login as a student?',
          'Login as Student',
          'Not Now'
        );
        
        if (answer === 'Login as Student') {
          await vscode.commands.executeCommand('computor.student.login');
        }
      }, 1000);
    }
  }

  extensionClasses.push({id: "computor.lecturer.login", extensionClass: ComputorLecturerExtension});
  extensionClasses.push({id: "computor.tutor.login", extensionClass: ComputorTutorExtension});
  extensionClasses.push({id: "computor.student.login", extensionClass: ComputorStudentExtension});

  for (const { id, extensionClass } of extensionClasses) {
    context.subscriptions.push(vscode.commands.registerCommand(id, async () => {
      const extension = new extensionClass(context);
      await extension.initialize();
      await extension.activate();
      extensions.push(extension);
    }));
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('computor.logout', async () => {
      for (const extension of extensions) {
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

  for (const extension of extensions) {
    extension.deactivate();
  }

  IconGenerator.cleanup();
}