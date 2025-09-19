import * as vscode from 'vscode';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import { GitLabTokenManager } from '../services/GitLabTokenManager';

export async function manageGitLabTokens(context: vscode.ExtensionContext): Promise<void> {
  const settingsManager = new ComputorSettingsManager(context);
  const gitLabTokenManager = GitLabTokenManager.getInstance(context);

  const settings = await settingsManager.getSettings();
  const urls = Object.keys(settings.workspace?.gitlabTokens || {});

  if (urls.length === 0) {
    vscode.window.showInformationMessage('No GitLab tokens configured yet. Tokens will be requested when needed.');
    return;
  }

  const items: vscode.QuickPickItem[] = urls.map((url) => ({
    label: url,
    description: 'GitLab Instance',
    detail: 'Click to manage token'
  }));

  items.push({
    label: '$(add) Add New GitLab Instance',
    description: 'Manually add a GitLab token',
    detail: ''
  });

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select GitLab instance to manage'
  });

  if (!selected) {
    return;
  }

  if (selected.label.startsWith('$(add)')) {
    const url = await vscode.window.showInputBox({
      prompt: 'Enter GitLab instance URL',
      placeHolder: 'https://gitlab.example.com'
    });

    if (url) {
      const token = await gitLabTokenManager.ensureTokenForUrl(url);
      if (token) {
        vscode.window.showInformationMessage(`Token added for ${url}`);
      }
    }

    return;
  }

  const action = await vscode.window.showQuickPick(
    ['Update Token', 'Remove Token', 'Test Token'],
    { placeHolder: `Manage token for ${selected.label}` }
  );

  if (action === 'Update Token') {
    const token = await gitLabTokenManager.ensureTokenForUrl(selected.label);
    if (token) {
      vscode.window.showInformationMessage('Token updated successfully');
    }
  } else if (action === 'Remove Token') {
    await gitLabTokenManager.removeToken(selected.label);
    vscode.window.showInformationMessage('Token removed successfully');
  } else if (action === 'Test Token') {
    vscode.window.showInformationMessage('Token testing not yet implemented');
  }
}
