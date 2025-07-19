import * as vscode from 'vscode';
import { UIShowcaseView } from './ui/views/UIShowcaseView';
import { SettingsView } from './ui/views/SettingsView';

export function activate(context: vscode.ExtensionContext) {
  console.log('Computor VS Code Extension is now active!');

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

  context.subscriptions.push(activateCommand, uiShowcaseCommand, settingsCommand);
}

export function deactivate() {
  console.log('Computor VS Code Extension is now deactivated!');
}