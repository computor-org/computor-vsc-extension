import * as vscode from 'vscode';
import { UIShowcaseView } from './ui/views/UIShowcaseView';
import { SettingsView } from './ui/views/SettingsView';
import { ComputorAuthenticationProvider } from './authentication/ComputorAuthenticationProvider';
import { GitManager } from './git/GitManager';

export function activate(context: vscode.ExtensionContext) {
  console.log('Computor VS Code Extension is now active!');

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