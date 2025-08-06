import * as vscode from 'vscode';
import { UIShowcaseView } from './ui/views/UIShowcaseView';
import { SettingsView } from './ui/views/SettingsView';
import { ComputorAuthenticationProvider } from './authentication/ComputorAuthenticationProvider';
import { GitManager } from './git/GitManager';
import { LecturerTreeDataProvider } from './ui/tree/lecturer/LecturerTreeDataProvider';
import { LecturerCommands } from './commands/LecturerCommands';
import { ComputorSettingsManager } from './settings/ComputorSettingsManager';
import { GitLabTokenManager } from './services/GitLabTokenManager';
import { ExampleTreeProvider } from './ui/tree/examples/ExampleTreeProvider';
import { ExampleCommands } from './commands/exampleCommands';
import { ComputorApiService } from './services/ComputorApiService';

// Export the GitLab token manager for use by other components
export let gitLabTokenManager: GitLabTokenManager;

export function activate(context: vscode.ExtensionContext) {
  console.log('Computor VS Code Extension is now active!');

  // Initialize GitLab token manager (singleton - shared by all views)
  gitLabTokenManager = GitLabTokenManager.getInstance(context);

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

  // Initialize Lecturer View
  const lecturerTreeDataProvider = new LecturerTreeDataProvider(context);
  const lecturerTreeView = vscode.window.createTreeView('computor.lecturerView', {
    treeDataProvider: lecturerTreeDataProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(lecturerTreeView);

  // Register lecturer commands
  const lecturerCommands = new LecturerCommands(context, lecturerTreeDataProvider);
  lecturerCommands.registerCommands();

  // Initialize API service
  const apiService = new ComputorApiService(context);

  // Initialize Example Tree Provider and View
  const exampleTreeProvider = new ExampleTreeProvider(context, apiService);
  const exampleTreeView = vscode.window.createTreeView('computor.examplesView', {
    treeDataProvider: exampleTreeProvider,
    showCollapseAll: true
  });
  context.subscriptions.push(exampleTreeView);

  // Register example commands
  new ExampleCommands(context, apiService, exampleTreeProvider);

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
    gitStatusCommand
  );
}

export function deactivate() {
  console.log('Computor VS Code Extension is now deactivated!');
}