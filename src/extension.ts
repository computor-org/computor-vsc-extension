import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Computor VS Code Extension is now active!');

  const disposable = vscode.commands.registerCommand('computor.activate', () => {
    vscode.window.showInformationMessage('Computor VS Code Extension activated!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log('Computor VS Code Extension is now deactivated!');
}