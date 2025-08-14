import * as vscode from 'vscode';
import { UIShowcaseView } from './ui/views/UIShowcaseView';
import { SettingsView } from './ui/views/SettingsView';
import { ComputorAuthenticationProvider } from './authentication/ComputorAuthenticationProvider';
import { GitManager } from './git/GitManager';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { StudentTreeDataProvider } from './ui/tree/student/StudentTreeDataProvider';
import { StudentCommands } from './commands/StudentCommands';
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
  
  // Initialize Student View
  const studentTreeDataProvider = new StudentTreeDataProvider(context);
  const studentTreeView = vscode.window.createTreeView('computor.studentView', {
    treeDataProvider: studentTreeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(studentTreeView);
  
  // Register student commands
  const studentCommands = new StudentCommands(context, studentTreeDataProvider);
  studentCommands.registerCommands();

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

  // Initialize API service
  const apiService = new ComputorApiService(context);

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