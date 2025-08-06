import * as vscode from 'vscode';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import { LecturerTreeDataProvider } from '../ui/tree/lecturer/LecturerTreeDataProvider';
import { CourseTreeItem, CourseContentTreeItem } from '../ui/tree/lecturer/LecturerTreeItems';
import { ComputorApiService } from '../services/ComputorApiService';

export class LecturerCommands {
  private settingsManager: ComputorSettingsManager;
  private apiService: ComputorApiService;

  constructor(
    private context: vscode.ExtensionContext,
    private treeDataProvider: LecturerTreeDataProvider
  ) {
    this.settingsManager = new ComputorSettingsManager(context);
    this.apiService = new ComputorApiService(context);
  }

  registerCommands(): void {
    // Workspace directory selection
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.selectWorkspaceDirectory', async () => {
        await this.selectWorkspaceDirectory();
      })
    );

    // Tree refresh
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.refreshLecturerTree', () => {
        this.treeDataProvider.refresh();
      })
    );

    // Course content management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.createCourseContent', async (item: CourseTreeItem | CourseContentTreeItem) => {
        await this.createCourseContent(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.renameCourseContent', async (item: CourseContentTreeItem) => {
        await this.renameCourseContent(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.deleteCourseContent', async (item: CourseContentTreeItem) => {
        await this.deleteCourseContent(item);
      })
    );

    // Example management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.assignExample', async (item: CourseContentTreeItem) => {
        await this.assignExample(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.unassignExample', async (item: CourseContentTreeItem) => {
        await this.unassignExample(item);
      })
    );

    // GitLab repository opening
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.openGitLabRepo', async (item: CourseTreeItem) => {
        await this.openGitLabRepository(item);
      })
    );

    // GitLab token management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.manageGitLabTokens', async () => {
        await this.manageGitLabTokens();
      })
    );
  }

  private async selectWorkspaceDirectory(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Repository Directory',
      title: 'Select Directory for Cloned Repositories'
    });

    if (result && result.length > 0 && result[0]) {
      const directory = result[0].fsPath;
      await this.settingsManager.setWorkspaceDirectory(directory);
      vscode.window.showInformationMessage(`Repository directory set to: ${directory}`);
    }
  }

  private async createCourseContent(item: CourseTreeItem | CourseContentTreeItem): Promise<void> {
    const title = await vscode.window.showInputBox({
      prompt: 'Enter course content title',
      placeHolder: 'e.g., Week 1: Introduction'
    });

    if (!title) {
      return;
    }

    if (item instanceof CourseTreeItem) {
      await this.treeDataProvider.createCourseContent(item, title);
    } else if (item instanceof CourseContentTreeItem) {
      await this.treeDataProvider.createCourseContent(
        new CourseTreeItem(item.course, item.courseFamily, item.organization),
        title,
        item.courseContent.path
      );
    }
  }

  private async renameCourseContent(item: CourseContentTreeItem): Promise<void> {
    const currentTitle = item.courseContent.title || '';
    const newTitle = await vscode.window.showInputBox({
      prompt: 'Enter new title',
      value: currentTitle
    });

    if (!newTitle || newTitle === currentTitle) {
      return;
    }

    await this.treeDataProvider.updateCourseContent(item, { title: newTitle });
  }

  private async deleteCourseContent(item: CourseContentTreeItem): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${item.courseContent.title}"?`,
      'Yes',
      'No'
    );

    if (confirmation === 'Yes') {
      await this.treeDataProvider.deleteCourseContent(item);
    }
  }

  private async assignExample(item: CourseContentTreeItem): Promise<void> {
    try {
      // Get available examples
      const examples = await this.apiService.getExamples();
      
      if (examples.length === 0) {
        vscode.window.showWarningMessage('No examples available');
        return;
      }

      // Create quick pick items
      const quickPickItems = examples.map(example => ({
        label: example.title,
        description: 'latest',
        detail: example.identifier || '',
        example: example
      }));

      // Show quick pick
      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select an example to assign',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selected) {
        return;
      }

      // Assign the example
      await this.apiService.assignExampleToCourseContent(
        item.course.id,
        item.courseContent.id,
        selected.example.id,
        undefined // ExampleList doesn't have version
      );

      // Refresh the tree
      this.treeDataProvider.refreshNode(item);
      vscode.window.showInformationMessage(`Example "${selected.label}" assigned successfully`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to assign example: ${error}`);
    }
  }

  private async unassignExample(item: CourseContentTreeItem): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `Remove example assignment from "${item.courseContent.title}"?`,
      'Yes',
      'No'
    );

    if (confirmation === 'Yes') {
      try {
        await this.apiService.unassignExampleFromCourseContent(
          item.course.id,
          item.courseContent.id
        );
        this.treeDataProvider.refreshNode(item);
        vscode.window.showInformationMessage('Example unassigned successfully');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to unassign example: ${error}`);
      }
    }
  }

  private async openGitLabRepository(item: CourseTreeItem): Promise<void> {
    const repoUrl = item.course.properties?.gitlab?.url;
    
    if (!repoUrl) {
      vscode.window.showWarningMessage('No GitLab repository URL found for this course');
      return;
    }

    // Check if we need a GitLab token
    const gitlabUrl = new URL(repoUrl).origin;
    let token = await this.settingsManager.getGitLabToken(gitlabUrl);
    
    if (!token) {
      token = await vscode.window.showInputBox({
        prompt: `Enter GitLab personal access token for ${gitlabUrl}`,
        password: true,
        placeHolder: 'GitLab Personal Access Token'
      });

      if (token) {
        await this.settingsManager.setGitLabToken(gitlabUrl, token);
      } else {
        return;
      }
    }

    // Get workspace directory
    const workspaceDir = await this.settingsManager.getWorkspaceDirectory();
    
    if (!workspaceDir) {
      await this.selectWorkspaceDirectory();
      return;
    }

    // Open the repository
    vscode.env.openExternal(vscode.Uri.parse(repoUrl));
  }

  private async manageGitLabTokens(): Promise<void> {
    const settings = await this.settingsManager.getSettings();
    const tokens = settings.workspace?.gitlabTokens || {};
    
    if (Object.keys(tokens).length === 0) {
      vscode.window.showInformationMessage('No GitLab tokens configured');
      return;
    }

    const items = Object.keys(tokens).map(url => ({
      label: url,
      description: 'GitLab Instance',
      detail: 'Click to manage token'
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select GitLab instance to manage'
    });

    if (!selected) {
      return;
    }

    const action = await vscode.window.showQuickPick(
      ['Update Token', 'Remove Token'],
      { placeHolder: `Manage token for ${selected.label}` }
    );

    if (action === 'Update Token') {
      const newToken = await vscode.window.showInputBox({
        prompt: `Enter new token for ${selected.label}`,
        password: true
      });
      
      if (newToken) {
        await this.settingsManager.setGitLabToken(selected.label, newToken);
        vscode.window.showInformationMessage('Token updated successfully');
      }
    } else if (action === 'Remove Token') {
      await this.settingsManager.setGitLabToken(selected.label, '');
      vscode.window.showInformationMessage('Token removed successfully');
    }
  }
}