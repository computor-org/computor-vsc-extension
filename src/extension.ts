import * as vscode from 'vscode';
import { UIShowcaseView } from './ui/views/UIShowcaseView';
import { SettingsView } from './ui/views/SettingsView';
import { ComputorAuthenticationProvider } from './authentication/ComputorAuthenticationProvider';
import { GitManager } from './git/GitManager';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { StudentTreeDataProvider } from './ui/tree/student/StudentTreeDataProvider';
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

  // Initialize GitLab token manager (singleton - shared by all views)
  GitLabTokenManager.getInstance(context);
  
  // Initialize backend connection monitoring
  const backendConnectionService = BackendConnectionService.getInstance();
  context.subscriptions.push(backendConnectionService);
  
  // Start backend health checks after a short delay to allow settings to load
  setTimeout(async () => {
    const settingsManager = new ComputorSettingsManager(context);
    const settings = await settingsManager.getSettings();
    const baseUrl = settings.authentication.baseUrl;
    backendConnectionService.startHealthCheck(baseUrl, 30000); // Check every 30 seconds
  }, 2000);

  // Initialize authentication provider
  const authProvider = new ComputorAuthenticationProvider(context);
  context.subscriptions.push(authProvider);

  // Initialize Git manager
  const gitManager = new GitManager(context);
  context.subscriptions.push(gitManager);

  // Original activation command
  const activateCommand = vscode.commands.registerCommand('computor.activate', () => {
    vscode.window.showInformationMessage('Computor VS Code Extension activated!');
  });
  
  // Backend connection check command
  const checkBackendCommand = vscode.commands.registerCommand('computor.checkBackendConnection', async () => {
    const settingsManager = new ComputorSettingsManager(context);
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

  // Authentication commands
  const signInCommand = vscode.commands.registerCommand('computor.signIn', async () => {
    try {
      const session = await vscode.authentication.getSession('computor', [], { createIfNone: true });
      if (session) {
        vscode.window.showInformationMessage(`Signed in as ${session.account.label}`);
        // Set context to show authenticated views
        vscode.commands.executeCommand('setContext', 'computor.authenticated', true);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Sign in failed: ${error}`);
    }
  });

  const signOutCommand = vscode.commands.registerCommand('computor.signOut', async () => {
    try {
      const sessions = await vscode.authentication.getSession('computor', [], { createIfNone: false });
      if (sessions) {
        await authProvider.removeSession(sessions.id);
        vscode.window.showInformationMessage('Signed out successfully');
        // Clear context to hide authenticated views
        vscode.commands.executeCommand('setContext', 'computor.authenticated', false);
      } else {
        vscode.window.showInformationMessage('No active session');
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Sign out failed: ${error}`);
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
  
  // Initialize API service
  const apiService = new ComputorApiService(context);

  // Initialize Status Bar Service
  const statusBarService = StatusBarService.initialize(context);
  context.subscriptions.push(statusBarService);

  // Initialize Course Selection Service
  const courseSelectionService = CourseSelectionService.initialize(context, apiService, statusBarService);
  
  // Initialize Student View
  const studentTreeDataProvider = new StudentTreeDataProvider(context);
  const studentTreeView = vscode.window.createTreeView('computor.studentView', {
    treeDataProvider: studentTreeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(studentTreeView);
  
  // Initialize Student Course Content View
  const studentCourseContentProvider = new StudentCourseContentTreeProvider(apiService, courseSelectionService);
  const studentCourseContentView = vscode.window.createTreeView('computor.studentCourseContentView', {
    treeDataProvider: studentCourseContentProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(studentCourseContentView);
  
  // Register tree view event handlers to preserve expansion state
  studentCourseContentView.onDidExpandElement(async (event) => {
    await studentCourseContentProvider.onTreeItemExpanded(event.element);
  });
  
  studentCourseContentView.onDidCollapseElement(async (event) => {
    await studentCourseContentProvider.onTreeItemCollapsed(event.element);
  });
  
  // Register student commands
  const studentCommands = new StudentCommands(context, studentTreeDataProvider);
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
  
  // Register course selection command
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.student.selectCourse', async () => {
      const course = await courseSelectionService.selectCourse();
      if (course) {
        // Refresh both views
        studentTreeDataProvider.refresh();
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

  // Initialize Example Tree Provider and View
  const exampleTreeProvider = new ExampleTreeProvider(context, apiService);
  const exampleTreeView = vscode.window.createTreeView('computor.examplesView', {
    treeDataProvider: exampleTreeProvider,
    showCollapseAll: true,
    dragAndDropController: exampleTreeProvider
  });
  context.subscriptions.push(exampleTreeView);

  // Register example commands
  new ExampleCommands(context, apiService, exampleTreeProvider);

  // Initialize File Explorers for each role
  const fileExplorerLecturer = new FileExplorerProvider(context);
  const fileExplorerStudent = new FileExplorerProvider(context);
  const fileExplorerTutor = new FileExplorerProvider(context);
  
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
    vscode.commands.registerCommand('computor.fileExplorer.goToWorkspace', () => {
      fileExplorerLecturer.goToWorkspace();
      fileExplorerStudent.goToWorkspace();
      fileExplorerTutor.goToWorkspace();
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

  // Check for existing authentication session
  vscode.authentication.getSession('computor', [], { createIfNone: false }).then(session => {
    if (session) {
      vscode.commands.executeCommand('setContext', 'computor.authenticated', true);
    }
  });

  // Check and prompt for workspace directory if not set
  const settingsManager = new ComputorSettingsManager(context);
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
    signInCommand,
    signOutCommand,
    gitStatusCommand,
    performanceReportCommand
  );
}

export function deactivate() {
  console.log('Computor VS Code Extension is now deactivated!');
  
  // Cleanup generated icons
  IconGenerator.cleanup();
}