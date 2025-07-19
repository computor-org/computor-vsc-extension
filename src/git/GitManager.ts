import * as vscode from 'vscode';
import { GitWrapper } from './GitWrapper';
import { GitRepositoryInfo, GitStatus, GitCommit } from '../types/GitTypes';
import { GitErrorHandler } from './GitErrorHandler';

export interface GitWorkspace {
  workspace: vscode.WorkspaceFolder;
  repositoryInfo: GitRepositoryInfo;
}

export class GitManager {
  private gitWrapper: GitWrapper;
  private statusBarItem: vscode.StatusBarItem;
  private repositories: Map<string, GitRepositoryInfo> = new Map();
  private disposables: vscode.Disposable[] = [];

  constructor(context: vscode.ExtensionContext) {
    void context;
    this.gitWrapper = new GitWrapper();
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = 'computor.showGitStatus';
    this.disposables.push(this.statusBarItem);
    
    this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.scanWorkspaces();
    this.setupFileWatcher();
    this.updateStatusBar();
  }

  async scanWorkspaces(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      await this.checkRepository(folder.uri.fsPath);
    }
  }

  private async checkRepository(folderPath: string): Promise<void> {
    try {
      const info = await this.gitWrapper.getRepositoryInfo(folderPath);
      if (info.isRepo) {
        this.repositories.set(folderPath, info);
      }
    } catch (error) {
      console.error(`Failed to check repository at ${folderPath}:`, error);
    }
  }

  private setupFileWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/**');
    
    watcher.onDidCreate(async (uri) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (workspaceFolder) {
        await this.checkRepository(workspaceFolder.uri.fsPath);
        this.updateStatusBar();
      }
    });

    watcher.onDidDelete(async (uri) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (workspaceFolder) {
        this.repositories.delete(workspaceFolder.uri.fsPath);
        this.updateStatusBar();
      }
    });

    this.disposables.push(watcher);
  }

  private async updateStatusBar(): Promise<void> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      this.statusBarItem.hide();
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (!workspaceFolder) {
      this.statusBarItem.hide();
      return;
    }

    const repoInfo = this.repositories.get(workspaceFolder.uri.fsPath);
    if (!repoInfo || !repoInfo.isRepo) {
      this.statusBarItem.hide();
      return;
    }

    try {
      const status = await this.gitWrapper.status(workspaceFolder.uri.fsPath);
      const icon = status.isClean ? '$(check)' : '$(git-commit)';
      const branch = status.current || 'detached';
      const dirty = status.isClean ? '' : '*';
      
      this.statusBarItem.text = `${icon} ${branch}${dirty}`;
      this.statusBarItem.tooltip = this.getStatusTooltip(status);
      this.statusBarItem.show();
    } catch (error) {
      this.statusBarItem.hide();
    }
  }

  private getStatusTooltip(status: GitStatus): string {
    const parts: string[] = [`Branch: ${status.current || 'detached'}`];
    
    if (status.tracking) {
      parts.push(`Tracking: ${status.tracking}`);
    }
    
    if (status.ahead > 0 || status.behind > 0) {
      parts.push(`Ahead: ${status.ahead}, Behind: ${status.behind}`);
    }
    
    if (!status.isClean) {
      parts.push('');
      if (status.modified.length > 0) {
        parts.push(`Modified: ${status.modified.length}`);
      }
      if (status.created.length > 0) {
        parts.push(`Added: ${status.created.length}`);
      }
      if (status.deleted.length > 0) {
        parts.push(`Deleted: ${status.deleted.length}`);
      }
      if (status.staged.length > 0) {
        parts.push(`Staged: ${status.staged.length}`);
      }
    }
    
    return parts.join('\n');
  }

  async getActiveRepository(): Promise<GitRepositoryInfo | undefined> {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
    if (!workspaceFolder) {
      return undefined;
    }

    return this.repositories.get(workspaceFolder.uri.fsPath);
  }

  async getRepositoryForPath(filePath: string): Promise<GitRepositoryInfo | undefined> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
    if (!workspaceFolder) {
      return undefined;
    }

    return this.repositories.get(workspaceFolder.uri.fsPath);
  }

  async getAllRepositories(): Promise<GitWorkspace[]> {
    const result: GitWorkspace[] = [];
    
    for (const [folderPath, info] of this.repositories) {
      const workspaceFolder = vscode.workspace.workspaceFolders?.find(
        folder => folder.uri.fsPath === folderPath
      );
      
      if (workspaceFolder) {
        result.push({
          workspace: workspaceFolder,
          repositoryInfo: info
        });
      }
    }
    
    return result;
  }

  async commitChanges(repositoryPath: string, message: string, files?: string[]): Promise<void> {
    try {
      if (files && files.length > 0) {
        await this.gitWrapper.add(repositoryPath, files);
      } else {
        await this.gitWrapper.add(repositoryPath, '.');
      }
      
      await this.gitWrapper.commit(repositoryPath, message);
      await this.updateStatusBar();
      
      vscode.window.showInformationMessage('Changes committed successfully');
    } catch (error) {
      this.handleGitError(error, 'Failed to commit changes');
    }
  }

  async pushChanges(repositoryPath: string, remote?: string, branch?: string): Promise<void> {
    try {
      const result = await this.gitWrapper.push(repositoryPath, remote, branch);
      
      if (result.pushed.length > 0) {
        vscode.window.showInformationMessage('Changes pushed successfully');
      } else {
        vscode.window.showInformationMessage('Everything up-to-date');
      }
      
      await this.updateStatusBar();
    } catch (error) {
      this.handleGitError(error, 'Failed to push changes');
    }
  }

  async pullChanges(repositoryPath: string, remote?: string, branch?: string): Promise<void> {
    try {
      await this.gitWrapper.pull(repositoryPath, remote, branch);
      vscode.window.showInformationMessage('Changes pulled successfully');
      await this.updateStatusBar();
    } catch (error) {
      this.handleGitError(error, 'Failed to pull changes');
    }
  }

  async createBranch(repositoryPath: string, branchName: string): Promise<void> {
    try {
      await this.gitWrapper.createBranch(repositoryPath, branchName);
      vscode.window.showInformationMessage(`Branch '${branchName}' created and checked out`);
      await this.updateStatusBar();
    } catch (error) {
      this.handleGitError(error, 'Failed to create branch');
    }
  }

  async switchBranch(repositoryPath: string, branchName: string): Promise<void> {
    try {
      await this.gitWrapper.checkoutBranch(repositoryPath, branchName);
      vscode.window.showInformationMessage(`Switched to branch '${branchName}'`);
      await this.updateStatusBar();
    } catch (error) {
      this.handleGitError(error, 'Failed to switch branch');
    }
  }

  async getRecentCommits(repositoryPath: string, maxCount: number = 10): Promise<GitCommit[]> {
    try {
      return await this.gitWrapper.getLog(repositoryPath, { maxCount });
    } catch (error) {
      this.handleGitError(error, 'Failed to get commit history');
      return [];
    }
  }

  async showGitStatus(): Promise<void> {
    const repo = await this.getActiveRepository();
    if (!repo || !repo.isRepo) {
      vscode.window.showWarningMessage('No Git repository found in current workspace');
      return;
    }

    try {
      const status = await this.gitWrapper.status(repo.path);
      const quickPick = vscode.window.createQuickPick();
      
      quickPick.title = `Git Status - ${repo.currentBranch || 'detached'}`;
      quickPick.items = this.getStatusQuickPickItems(status);
      
      quickPick.onDidChangeSelection(async (selection) => {
        if (selection.length > 0 && selection[0]) {
          const item = selection[0];
          if (item.label.startsWith('$(git-commit)')) {
            await this.promptCommit(repo.path);
          } else if (item.label.startsWith('$(cloud-upload)')) {
            await this.pushChanges(repo.path);
          } else if (item.label.startsWith('$(cloud-download)')) {
            await this.pullChanges(repo.path);
          }
        }
      });
      
      quickPick.onDidHide(() => quickPick.dispose());
      quickPick.show();
    } catch (error) {
      this.handleGitError(error, 'Failed to get repository status');
    }
  }

  private getStatusQuickPickItems(status: GitStatus): vscode.QuickPickItem[] {
    const items: vscode.QuickPickItem[] = [];

    if (!status.isClean) {
      items.push({
        label: '$(git-commit) Commit changes',
        description: 'Stage and commit all changes'
      });
    }

    if (status.ahead > 0) {
      items.push({
        label: '$(cloud-upload) Push changes',
        description: `${status.ahead} commits ahead of remote`
      });
    }

    if (status.behind > 0) {
      items.push({
        label: '$(cloud-download) Pull changes',
        description: `${status.behind} commits behind remote`
      });
    }

    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });

    if (status.modified.length > 0) {
      items.push({
        label: `$(edit) Modified files (${status.modified.length})`,
        description: status.modified.slice(0, 3).join(', ') + (status.modified.length > 3 ? '...' : '')
      });
    }

    if (status.created.length > 0) {
      items.push({
        label: `$(add) Added files (${status.created.length})`,
        description: status.created.slice(0, 3).join(', ') + (status.created.length > 3 ? '...' : '')
      });
    }

    if (status.deleted.length > 0) {
      items.push({
        label: `$(remove) Deleted files (${status.deleted.length})`,
        description: status.deleted.slice(0, 3).join(', ') + (status.deleted.length > 3 ? '...' : '')
      });
    }

    return items;
  }

  private async promptCommit(repositoryPath: string): Promise<void> {
    const message = await vscode.window.showInputBox({
      prompt: 'Commit message',
      placeHolder: 'Enter commit message',
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Commit message cannot be empty';
        }
        return null;
      }
    });

    if (message) {
      await this.commitChanges(repositoryPath, message);
    }
  }

  private handleGitError(error: any, message: string): void {
    const gitError = GitErrorHandler.parseError(error);
    const userMessage = GitErrorHandler.getUserFriendlyMessage(gitError);
    
    vscode.window.showErrorMessage(`${message}: ${userMessage}`);
    console.error(message, error);
    
    if (GitErrorHandler.isRecoverable(gitError)) {
      console.log('Error is recoverable, user can retry the operation');
    }
  }

  dispose(): void {
    this.gitWrapper.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}