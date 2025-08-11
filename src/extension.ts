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
import { ExampleCommands } from './commands/exampleCommands';
import { ExampleCodeLensProvider } from './providers/ExampleCodeLensProvider';
import { YamlSchemaOverrideProvider } from './providers/YamlSchemaOverrideProvider';
import { MetaYamlCompletionProvider } from './providers/MetaYamlCompletionProvider';
import { ComputorApiService } from './services/ComputorApiService';
import { IconGenerator } from './utils/iconGenerator';
import { performanceMonitor } from './services/PerformanceMonitoringService';

export function activate(context: vscode.ExtensionContext) {
  console.log('Computor VS Code Extension is now active!');

  // Initialize Icon Generator
  IconGenerator.initialize(context);

  // Initialize GitLab token manager (singleton - shared by all views)
  GitLabTokenManager.getInstance(context);

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
  
  // Override YAML schemas to prevent Conda conflicts
  const yamlSchemaOverride = new YamlSchemaOverrideProvider(context);
  context.subscriptions.push(yamlSchemaOverride);
  
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
  
  // Command to manually disable Conda schema
  context.subscriptions.push(
    vscode.commands.registerCommand('computor.disableCondaSchema', async () => {
      const yamlConfig = vscode.workspace.getConfiguration('yaml');
      const schemas = yamlConfig.get<any>('schemas') || {};
      
      // Remove all Conda-related schemas
      const condaSchemas = [
        'https://raw.githubusercontent.com/conda-forge/conda-smithy/master/conda_smithy/data/conda-forge.json',
        'https://json.schemastore.org/conda.json'
      ];
      
      let removed = false;
      for (const schemaUrl of condaSchemas) {
        if (schemas[schemaUrl]) {
          delete schemas[schemaUrl];
          removed = true;
        }
      }
      
      if (removed) {
        await yamlConfig.update('schemas', schemas, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage('Conda schema disabled for meta.yaml files');
      } else {
        vscode.window.showInformationMessage('No Conda schema found to disable');
      }
    })
  );

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