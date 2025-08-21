import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UIShowcaseView } from './ui/views/UIShowcaseView';
import { SettingsView } from './ui/views/SettingsView';
import { LecturerAuthenticationProvider } from './authentication/LecturerAuthenticationProvider';
import { TutorAuthenticationProvider } from './authentication/TutorAuthenticationProvider';
import { StudentAuthenticationProvider } from './authentication/StudentAuthenticationProvider';
import { GitManager } from './git/GitManager';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { StudentCourseContentTreeProvider } from './ui/tree/student/StudentCourseContentTreeProvider';
import { StudentCommands } from './commands/StudentCommands';
import { CourseSelectionService } from './services/CourseSelectionService';
import { StatusBarService } from './ui/StatusBarService';
import { TutorTreeDataProvider } from './ui/tree/tutor/TutorTreeDataProvider';
import { TutorCommands } from './commands/TutorCommands';
import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { GitLabTokenManager } from './services/GitLabTokenManager';
import { ExampleTreeProvider } from './ui/tree/examples/ExampleTreeProvider';
import { ExampleCommands } from './commands/ExampleCommands';
import { ExampleCodeLensProvider } from './providers/ExampleCodeLensProvider';
import { MetaYamlCompletionProvider } from './providers/MetaYamlCompletionProvider';
import { MetaYamlStatusBarProvider } from './providers/MetaYamlStatusBarProvider';
import { ComputorApiService } from './services/ComputorApiService';
import { IconGenerator } from './utils/IconGenerator';
import { performanceMonitor } from './services/PerformanceMonitoringService';
import { BackendConnectionService } from './services/BackendConnectionService';
import { FileExplorerProvider } from './ui/tree/FileExplorerProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Computor VS Code Extension is now active!');

  // Initialize Icon Generator
  IconGenerator.initialize(context);

  // Initialize Settings Manager (used throughout the extension)
  const settingsManager = new ComputorSettingsManager(context);

  // Initialize GitLab token manager (singleton - shared by all views)
  GitLabTokenManager.getInstance(context);
  
  // Initialize backend connection monitoring
  const backendConnectionService = BackendConnectionService.getInstance();
  context.subscriptions.push(backendConnectionService);
  
  // Start backend health checks after a short delay to allow settings to load
  setTimeout(async () => {
    const settings = await settingsManager.getSettings();
    const baseUrl = settings.authentication.baseUrl;
    backendConnectionService.startHealthCheck(baseUrl, 30000); // Check every 30 seconds
  }, 2000);

  // Initialize lecturer authentication provider
  const lecturerAuthProvider = new LecturerAuthenticationProvider(context);
  context.subscriptions.push(lecturerAuthProvider);
  
  // Initialize tutor authentication provider
  const tutorAuthProvider = new TutorAuthenticationProvider(context);
  context.subscriptions.push(tutorAuthProvider);
  
  // Initialize student authentication provider
  const studentAuthProvider = new StudentAuthenticationProvider(context);
  context.subscriptions.push(studentAuthProvider);

  // Initialize Git manager
  const gitManager = new GitManager(context);
  context.subscriptions.push(gitManager);
  
  // Initialize API service (needed for course selection)
  const apiService = new ComputorApiService(context);
  
  // Initialize Status Bar Service
  const statusBarService = StatusBarService.initialize(context);
  context.subscriptions.push(statusBarService);

  // Initialize Course Selection Service (needed for student sign-in)
  const courseSelectionService = CourseSelectionService.initialize(context, apiService, statusBarService);

  // Original activation command
  const activateCommand = vscode.commands.registerCommand('computor.activate', () => {
    vscode.window.showInformationMessage('Computor VS Code Extension activated!');
  });
  
  // Backend connection check command
  const checkBackendCommand = vscode.commands.registerCommand('computor.checkBackendConnection', async () => {
    const settings = await settingsManager.getSettings();
    const baseUrl = settings.authentication.baseUrl;
    
    const status = await backendConnectionService.checkBackendConnection(baseUrl);
    
    if (status.isReachable) {
      vscode.window.showInformationMessage('Backend is connected and responding normally');
    } else {
      await backendConnectionService.showConnectionError(status);
    }
  });

  // UI Showcase command
  const uiShowcaseCommand = vscode.commands.registerCommand('computor.showUIComponents', () => {
    const showcaseView = new UIShowcaseView(context);
    showcaseView.render();
  });

  // Settings management command
  const settingsCommand = vscode.commands.registerCommand('computor.showSettings', () => {
    const settingsView = new SettingsView(context);
    settingsView.render();
  });

  // Lecturer authentication commands
  const lecturerSignInCommand = vscode.commands.registerCommand('computor.lecturer.signIn', async () => {
    try {
      const session = await vscode.authentication.getSession('computor-lecturer', [], { createIfNone: true });
      if (session) {
        vscode.window.showInformationMessage(`Signed in as Lecturer: ${session.account.label}`);
        // Set context to show lecturer views and hide others (await to ensure they complete)
        await vscode.commands.executeCommand('setContext', 'computor.lecturer.authenticated', true);
        await vscode.commands.executeCommand('setContext', 'computor.tutor.authenticated', false);
        await vscode.commands.executeCommand('setContext', 'computor.student.authenticated', false);
        
        // Check if we need to open the workspace
        const workspacePath = path.join(os.homedir(), '.computor', 'workspace');
        const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        // If not in the computor workspace, open it
        if (!currentWorkspace || !currentWorkspace.startsWith(workspacePath)) {
          // Ensure workspace directory exists
          if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
          }
          
          // Open the workspace folder (false = in same window)
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspacePath), false);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Lecturer sign in failed: ${error}`);
    }
  });

  const lecturerSignOutCommand = vscode.commands.registerCommand('computor.lecturer.signOut', async () => {
    try {
      const sessions = await vscode.authentication.getSession('computor-lecturer', [], { createIfNone: false });
      if (sessions) {
        await lecturerAuthProvider.removeSession(sessions.id);
        vscode.window.showInformationMessage('Lecturer signed out successfully');
        // Clear context to hide lecturer views
        vscode.commands.executeCommand('setContext', 'computor.lecturer.authenticated', false);
      } else {
        vscode.window.showInformationMessage('No active lecturer session');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Lecturer sign out failed: ${error}`);
    }
  });

  // Tutor authentication commands
  const tutorSignInCommand = vscode.commands.registerCommand('computor.tutor.signIn', async () => {
    try {
      const session = await vscode.authentication.getSession('computor-tutor', [], { createIfNone: true });
      if (session) {
        vscode.window.showInformationMessage(`Signed in as Tutor: ${session.account.label}`);
        // Set context to show tutor views and hide others (await to ensure they complete)
        await vscode.commands.executeCommand('setContext', 'computor.tutor.authenticated', true);
        await vscode.commands.executeCommand('setContext', 'computor.lecturer.authenticated', false);
        await vscode.commands.executeCommand('setContext', 'computor.student.authenticated', false);
        
        // Check if we need to open the workspace
        const workspacePath = path.join(os.homedir(), '.computor', 'workspace');
        const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        // If not in the computor workspace, open it
        if (!currentWorkspace || !currentWorkspace.startsWith(workspacePath)) {
          // Ensure workspace directory exists
          if (!fs.existsSync(workspacePath)) {
            fs.mkdirSync(workspacePath, { recursive: true });
          }
          
          // Open the workspace folder (false = in same window)
          await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspacePath), false);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Tutor sign in failed: ${error}`);
    }
  });

  const tutorSignOutCommand = vscode.commands.registerCommand('computor.tutor.signOut', async () => {
    try {
      const sessions = await vscode.authentication.getSession('computor-tutor', [], { createIfNone: false });
      if (sessions) {
        await tutorAuthProvider.removeSession(sessions.id);
        vscode.window.showInformationMessage('Tutor signed out successfully');
        // Clear context to hide tutor views
        vscode.commands.executeCommand('setContext', 'computor.tutor.authenticated', false);
      } else {
        vscode.window.showInformationMessage('No active tutor session');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Tutor sign out failed: ${error}`);
    }
  });

  // Student authentication commands
  const studentSignInCommand = vscode.commands.registerCommand('computor.student.signIn', async () => {
    try {
      const session = await vscode.authentication.getSession('computor-student', [], { createIfNone: true });
      if (session) {
        vscode.window.showInformationMessage(`Signed in as Student: ${session.account.label}`);
        // Set context to show student views and hide others (await to ensure they complete)
        await vscode.commands.executeCommand('setContext', 'computor.student.authenticated', true);
        await vscode.commands.executeCommand('setContext', 'computor.lecturer.authenticated', false);
        await vscode.commands.executeCommand('setContext', 'computor.tutor.authenticated', false);
        
        // Clear any persisted course selection to force fresh selection
        await context.globalState.update('selectedCourseId', undefined);
        await context.globalState.update('selectedCourseInfo', undefined);
        
        // After authentication, immediately ask for course selection
        try {
          // Fetch available courses for the student
          const courses = await apiService.getStudentCourses();
          
          if (!courses || courses.length === 0) {
            vscode.window.showInformationMessage('No courses available for your account');
            return;
          }
          
          // Prepare quick pick items
          const quickPickItems = courses.map(course => ({
            label: course.title,
            description: course.path,
            detail: `Organization: ${course.organization_id}`,
            course
          }));
          
          // Show course selection dropdown
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: 'Select a course to work on',
            title: 'Course Selection',
            ignoreFocusOut: true
          });
          
          if (!selected) {
            vscode.window.showWarningMessage('No course selected. Please select a course to continue.');
            return;
          }
          
          const selectedCourse = selected.course;
          
          // Update course selection
          const courseInfo = {
            id: selectedCourse.id,
            title: selectedCourse.title,
            path: selectedCourse.path,
            organizationId: selectedCourse.organization_id,
            courseFamilyId: selectedCourse.course_family_id
          };
          
          // Switch to course workspace
          await courseSelectionService.switchToCourse(courseInfo);
          
          // Use the same workspace root as assignments
          const courseWorkspace = path.join(os.homedir(), '.computor', 'workspace');
          
          // Ensure directory exists
          if (!fs.existsSync(courseWorkspace)) {
            fs.mkdirSync(courseWorkspace, { recursive: true });
          }
          
          // Update workspace folders instead of opening new folder to avoid extension reload
          const workspaceFolders = vscode.workspace.workspaceFolders || [];
          const courseWorkspaceUri = vscode.Uri.file(courseWorkspace);
          const existingIndex = workspaceFolders.findIndex(
            folder => folder.uri.fsPath === courseWorkspace
          );
          
          if (existingIndex === -1) {
            // Add the course workspace as a new workspace folder
            const newName = `📚 ${selectedCourse.title}`;
            vscode.workspace.updateWorkspaceFolders(
              workspaceFolders.length,
              0,
              { uri: courseWorkspaceUri, name: newName }
            );
          }
          
          // Refresh the student view to show course content
          studentCourseContentProvider.refresh();
          
          vscode.window.showInformationMessage(`Successfully connected to course: ${selectedCourse.title}`);
          
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to select course: ${error}`);
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Student sign in failed: ${error}`);
    }
  });

  const studentSignOutCommand = vscode.commands.registerCommand('computor.student.signOut', async () => {
    try {
      const sessions = await vscode.authentication.getSession('computor-student', [], { createIfNone: false });
      if (sessions) {
        await studentAuthProvider.removeSession(sessions.id);
        vscode.window.showInformationMessage('Student signed out successfully');
        // Clear context to hide student views
        await vscode.commands.executeCommand('setContext', 'computor.student.authenticated', false);
      } else {
        vscode.window.showInformationMessage('No active student session');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Student sign out failed: ${error}`);
    }
  });

  // Git status command
  const gitStatusCommand = vscode.commands.registerCommand('computor.showGitStatus', async () => {
    await gitManager.showGitStatus();
  });
  
  // Performance monitoring command
  const performanceReportCommand = vscode.commands.registerCommand('computor.showPerformanceReport', () => {
    performanceMonitor.showReport();
  });

  // Initialize Lecturer View
  const lecturerTreeDataProvider = new LecturerTreeDataProvider(context);
  const lecturerTreeView = vscode.window.createTreeView('computor.lecturerView', {
    treeDataProvider: lecturerTreeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(lecturerTreeView);
  
  // Store tree view reference in the provider for refresh operations
  (lecturerTreeDataProvider as any).treeView = lecturerTreeView;
  
  // Register load more command for pagination
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.loadMoreItems', async (loadMoreItem) => {
      if (loadMoreItem) {
        await lecturerTreeDataProvider.loadMore(loadMoreItem);
      }
    })
  );

  // Listen to tree view expansion/collapse events
  lecturerTreeView.onDidExpandElement((e) => {
    if (e.element.id) {
      lecturerTreeDataProvider.setNodeExpanded(e.element.id, true);
    }
  });

  lecturerTreeView.onDidCollapseElement((e) => {
    if (e.element.id) {
      lecturerTreeDataProvider.setNodeExpanded(e.element.id, false);
    }
  });

  // Register lecturer commands
  const lecturerCommands = new LecturerCommands(context, lecturerTreeDataProvider);
  lecturerCommands.registerCommands();
  
  // Initialize Student View (single tree for all student content)
  const studentCourseContentProvider = new StudentCourseContentTreeProvider(apiService, courseSelectionService);
  const studentTreeView = vscode.window.createTreeView('computor.studentView', {
    treeDataProvider: studentCourseContentProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(studentTreeView);
  
  // Register tree view event handlers to preserve expansion state
  studentTreeView.onDidExpandElement(async (event) => {
    await studentCourseContentProvider.onTreeItemExpanded(event.element);
  });
  
  studentTreeView.onDidCollapseElement(async (event) => {
    await studentCourseContentProvider.onTreeItemCollapsed(event.element);
  });
  
  // Register student commands
  const studentCommands = new StudentCommands(context, studentCourseContentProvider);
  studentCommands.setCourseContentTreeProvider(studentCourseContentProvider);
  studentCommands.registerCommands();
  
  // Register course content refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.student.refreshCourseContent', () => {
      studentCourseContentProvider.refresh();
    })
  );
  
  // Listen for course changes
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.courseChanged', (courseInfo) => {
      void courseInfo; // Parameter not used but required for API compatibility
      // Update context to show course content view
      vscode.commands.executeCommand('setContext', 'computor.courseSelected', true);
      // Refresh course content
      studentCourseContentProvider.refresh();
    })
  );
  
  // Register course selection command (legacy)
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.student.selectCourse', async () => {
      const course = await courseSelectionService.selectCourse();
      if (course) {
        // Refresh the student view
        studentCourseContentProvider.refresh();
      }
    })
  );

  // Initialize Tutor View
  const tutorTreeDataProvider = new TutorTreeDataProvider(context);
  const tutorTreeView = vscode.window.createTreeView('computor.tutorView', {
    treeDataProvider: tutorTreeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(tutorTreeView);
  
  // Register tutor commands
  const tutorCommands = new TutorCommands(context, tutorTreeDataProvider);
  tutorCommands.registerCommands();

  // Initialize Example Tree Provider
  const exampleTreeProvider = new ExampleTreeProvider(context, apiService);
  
  // DIRECTLY register the refresh command here to ensure it's available
  console.log('[Extension] Registering computor.refreshExamples directly...');
  const refreshCommand = vscode.commands.registerCommand('computor.refreshExamples', async () => {
    console.log('[Extension] refreshExamples command executed');
    await exampleTreeProvider.loadData();
  });
  context.subscriptions.push(refreshCommand);
  console.log('[Extension] computor.refreshExamples registered directly');
  
  // Test if the command is available
  vscode.commands.getCommands(true).then(commands => {
    if (commands.includes('computor.refreshExamples')) {
      console.log('[Extension] ✓ computor.refreshExamples is in command list');
    } else {
      console.error('[Extension] ✗ computor.refreshExamples NOT in command list!');
    }
  });
  
  // Register other example commands
  console.log('[Extension] Creating ExampleCommands...');
  try {
    new ExampleCommands(context, apiService, exampleTreeProvider);
    console.log('[Extension] ExampleCommands created successfully');
  } catch (error) {
    console.error('[Extension] Failed to create ExampleCommands:', error);
    vscode.window.showErrorMessage(`Failed to initialize Example commands: ${error}`);
  }
  
  // Create the tree view AFTER commands are registered
  const exampleTreeView = vscode.window.createTreeView('computor.examplesView', {
    treeDataProvider: exampleTreeProvider,
    showCollapseAll: true,
    dragAndDropController: exampleTreeProvider
  });
  context.subscriptions.push(exampleTreeView);

  // Initialize File Explorers for each role
  const fileExplorerLecturer = new FileExplorerProvider(context);
  const fileExplorerStudent = new FileExplorerProvider(context);
  const fileExplorerTutor = new FileExplorerProvider(context);
  
  // Set initial workspace directory from settings
  settingsManager.getWorkspaceDirectory().then(workspaceDir => {
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fileExplorerLecturer.setRootPath(workspaceDir);
      fileExplorerStudent.setRootPath(workspaceDir);
      fileExplorerTutor.setRootPath(workspaceDir);
    }
  });
  
  // Create tree views for file explorers
  const lecturerFileExplorer = vscode.window.createTreeView('computor.fileExplorerLecturer', {
    treeDataProvider: fileExplorerLecturer,
    showCollapseAll: true
  });
  const studentFileExplorer = vscode.window.createTreeView('computor.fileExplorerStudent', {
    treeDataProvider: fileExplorerStudent,
    showCollapseAll: true
  });
  const tutorFileExplorer = vscode.window.createTreeView('computor.fileExplorerTutor', {
    treeDataProvider: fileExplorerTutor,
    showCollapseAll: true
  });
  
  context.subscriptions.push(lecturerFileExplorer, studentFileExplorer, tutorFileExplorer);
  
  // Register file explorer commands
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.fileExplorer.refresh', () => {
      fileExplorerLecturer.refresh();
      fileExplorerStudent.refresh();
      fileExplorerTutor.refresh();
    }),
    vscode.commands.registerCommand('computor.fileExplorer.goUp', () => {
      // Navigate up in all file explorers
      fileExplorerLecturer.goUp();
      fileExplorerStudent.goUp();
      fileExplorerTutor.goUp();
    }),
    vscode.commands.registerCommand('computor.fileExplorer.goHome', () => {
      fileExplorerLecturer.goHome();
      fileExplorerStudent.goHome();
      fileExplorerTutor.goHome();
    }),
    vscode.commands.registerCommand('computor.fileExplorer.goToWorkspace', async () => {
      // Get the selected workspace directory from settings
      const workspaceDir = await settingsManager.getWorkspaceDirectory();
      if (workspaceDir && fs.existsSync(workspaceDir)) {
        fileExplorerLecturer.setRootPath(workspaceDir);
        fileExplorerStudent.setRootPath(workspaceDir);
        fileExplorerTutor.setRootPath(workspaceDir);
      } else {
        vscode.window.showWarningMessage('No workspace directory selected. Please select one first.');
        vscode.commands.executeCommand('computor.selectWorkspaceDirectory');
      }
    }),
    vscode.commands.registerCommand('computor.fileExplorer.toggleHidden', () => {
      fileExplorerLecturer.toggleHiddenFiles();
      fileExplorerStudent.toggleHiddenFiles();
      fileExplorerTutor.toggleHiddenFiles();
    }),
    vscode.commands.registerCommand('computor.fileExplorer.openFolder', async () => {
      const folderUri = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: 'Select Folder'
      });
      
      if (folderUri && folderUri[0]) {
        fileExplorerLecturer.setRootPath(folderUri[0].fsPath);
        fileExplorerStudent.setRootPath(folderUri[0].fsPath);
        fileExplorerTutor.setRootPath(folderUri[0].fsPath);
      }
    })
  );

  // Register CodeLens provider for meta.yaml files
  const exampleCodeLensProvider = new ExampleCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { language: 'yaml', pattern: '**/meta.yaml' },
        { language: 'yaml', pattern: '**/meta.yml' }
      ],
      exampleCodeLensProvider
    )
  );
  
  // Register custom completion provider for meta.yaml files
  const metaYamlCompletionProvider = new MetaYamlCompletionProvider(context);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      [
        { language: 'yaml', pattern: '**/meta.yaml' },
        { language: 'yaml', pattern: '**/meta.yml' }
      ],
      metaYamlCompletionProvider,
      ' ', ':', '\n'  // Trigger characters
    )
  );
  
  // Register status bar buttons for meta.yaml files
  const metaYamlStatusBarProvider = new MetaYamlStatusBarProvider(context);
  context.subscriptions.push(metaYamlStatusBarProvider);

  // Check for existing authentication sessions (only one should be active)
  Promise.all([
    vscode.authentication.getSession('computor-lecturer', [], { createIfNone: false }),
    vscode.authentication.getSession('computor-tutor', [], { createIfNone: false }),
    vscode.authentication.getSession('computor-student', [], { createIfNone: false })
  ]).then(async ([lecturerSession, tutorSession, studentSession]) => {
    // Set all contexts based on which session exists
    await vscode.commands.executeCommand('setContext', 'computor.lecturer.authenticated', !!lecturerSession);
    await vscode.commands.executeCommand('setContext', 'computor.tutor.authenticated', !!tutorSession);
    await vscode.commands.executeCommand('setContext', 'computor.student.authenticated', !!studentSession);
    
    // Warn if multiple sessions exist (shouldn't happen normally)
    const activeSessions = [lecturerSession, tutorSession, studentSession].filter(s => s).length;
    if (activeSessions > 1) {
      vscode.window.showWarningMessage('Multiple role sessions detected. Please sign out and sign in with a single role.');
    }
  });

  // Check and prompt for workspace directory if not set
  settingsManager.getWorkspaceDirectory().then(dir => {
    if (!dir) {
      vscode.window.showInformationMessage(
        'Please select a directory for storing repositories',
        'Select Directory'
      ).then(selection => {
        if (selection === 'Select Directory') {
          vscode.commands.executeCommand('computor.selectWorkspaceDirectory');
        }
      });
    }
  });

  context.subscriptions.push(
    activateCommand,
    checkBackendCommand,
    uiShowcaseCommand, 
    settingsCommand,
    lecturerSignInCommand,
    lecturerSignOutCommand,
    tutorSignInCommand,
    tutorSignOutCommand,
    studentSignInCommand,
    studentSignOutCommand,
    gitStatusCommand,
    performanceReportCommand
  );
}

export function deactivate() {
  console.log('Computor VS Code Extension is now deactivated!');
  
  // Cleanup generated icons
  IconGenerator.cleanup();
}