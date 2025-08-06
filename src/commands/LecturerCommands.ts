import * as vscode from 'vscode';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import { GitLabTokenManager } from '../services/GitLabTokenManager';
import { LecturerTreeDataProvider } from '../ui/tree/lecturer/LecturerTreeDataProvider';
import { CourseTreeItem, CourseContentTreeItem, CourseFolderTreeItem, CourseContentTypeTreeItem } from '../ui/tree/lecturer/LecturerTreeItems';
import { ComputorApiService } from '../services/ComputorApiService';

export class LecturerCommands {
  private settingsManager: ComputorSettingsManager;
  private gitLabTokenManager: GitLabTokenManager;
  private apiService: ComputorApiService;

  constructor(
    private context: vscode.ExtensionContext,
    private treeDataProvider: LecturerTreeDataProvider
  ) {
    this.settingsManager = new ComputorSettingsManager(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
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
      vscode.commands.registerCommand('computor.createCourseContent', async (item: CourseFolderTreeItem | CourseContentTreeItem) => {
        await this.createCourseContent(item);
      })
    );

    // Course content type management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.createCourseContentType', async (item: CourseFolderTreeItem) => {
        await this.createCourseContentType(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.editCourseContentType', async (item: CourseContentTypeTreeItem) => {
        await this.editCourseContentType(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.deleteCourseContentType', async (item: CourseContentTypeTreeItem) => {
        await this.deleteCourseContentType(item);
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

  private async createCourseContent(item: CourseFolderTreeItem | CourseContentTreeItem): Promise<void> {
    if (!(item instanceof CourseFolderTreeItem) || item.folderType !== 'contents') {
      vscode.window.showErrorMessage('Course contents can only be created under the Contents folder');
      return;
    }

    // Get available content types
    const contentTypes = await this.apiService.getCourseContentTypes(item.course.id);
    if (contentTypes.length === 0) {
      vscode.window.showWarningMessage('No content types available. Please create a content type first.');
      return;
    }

    // Select content type
    const selectedType = await vscode.window.showQuickPick(
      contentTypes.map(t => ({
        label: t.title || t.slug,
        description: t.slug,
        id: t.id
      })),
      { placeHolder: 'Select content type' }
    );

    if (!selectedType) {
      return;
    }

    const title = await vscode.window.showInputBox({
      prompt: 'Enter course content title',
      placeHolder: 'e.g., Week 1: Introduction'
    });

    if (!title) {
      return;
    }

    await this.treeDataProvider.createCourseContent(item, title, selectedType.id);
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
      
      if (!examples || examples.length === 0) {
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

    // Get GitLab token using the token manager
    const gitlabUrl = this.gitLabTokenManager.extractGitLabUrlFromCourse(item.course);
    if (!gitlabUrl) {
      vscode.window.showErrorMessage('Could not extract GitLab URL from course');
      return;
    }

    const token = await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
    if (!token) {
      vscode.window.showWarningMessage('GitLab token is required to access the repository');
      return;
    }

    // Get workspace directory
    const workspaceDir = await this.settingsManager.getWorkspaceDirectory();
    
    if (!workspaceDir) {
      const selected = await vscode.window.showInformationMessage(
        'Please select a workspace directory first',
        'Select Directory'
      );
      if (selected === 'Select Directory') {
        await this.selectWorkspaceDirectory();
      }
      return;
    }

    // TODO: Here we could clone the repository using the token
    // For now, just open the URL in browser
    vscode.env.openExternal(vscode.Uri.parse(repoUrl));
    
    // Show info about cloning
    vscode.window.showInformationMessage(
      `Repository URL: ${repoUrl}\nYou can clone it with your GitLab token.`
    );
  }

  private async createCourseContentType(item: CourseFolderTreeItem): Promise<void> {
    if (item.folderType !== 'contentTypes') {
      return;
    }

    // Get available content kinds
    const contentKinds = await this.apiService.getCourseContentKinds();
    if (contentKinds.length === 0) {
      vscode.window.showErrorMessage('No content kinds available in the system');
      return;
    }

    // Select content kind
    const kindItems = contentKinds.map(k => ({
      label: k.title || k.id,
      description: `ID: ${k.id}`,
      kindData: k
    }));
    
    const selectedKind = await vscode.window.showQuickPick(
      kindItems,
      { placeHolder: 'Select content kind' }
    );

    if (!selectedKind) {
      return;
    }

    const slug = await vscode.window.showInputBox({
      prompt: 'Enter a unique slug for this content type',
      placeHolder: 'e.g., lecture, assignment, exercise'
    });

    if (!slug) {
      return;
    }

    const title = await vscode.window.showInputBox({
      prompt: 'Enter content type title',
      placeHolder: 'e.g., Lecture, Assignment'
    });

    const color = await vscode.window.showInputBox({
      prompt: 'Enter color (optional)',
      placeHolder: 'e.g., #FF5733, blue, rgb(255,87,51)',
      value: 'green'
    });

    try {
      await this.apiService.createCourseContentType({
        slug,
        title: title || slug,
        color: color || 'green',
        course_id: item.course.id,
        course_content_kind_id: selectedKind.kindData.id
      });
      
      // Clear cache and refresh
      this.treeDataProvider.refreshNode(item);
      vscode.window.showInformationMessage(`Content type "${title || slug}" created successfully`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create content type: ${error}`);
    }
  }

  private async editCourseContentType(item: CourseContentTypeTreeItem): Promise<void> {
    const title = await vscode.window.showInputBox({
      prompt: 'Enter new title',
      value: item.contentType.title || item.contentType.slug
    });

    if (!title) {
      return;
    }

    const color = await vscode.window.showInputBox({
      prompt: 'Enter new color',
      value: item.contentType.color
    });

    try {
      await this.apiService.updateCourseContentType(item.contentType.id, {
        title,
        color: color || item.contentType.color
      });
      
      // Refresh parent folder
      const parent = new CourseFolderTreeItem('contentTypes', item.course, item.courseFamily, item.organization);
      this.treeDataProvider.refreshNode(parent);
      vscode.window.showInformationMessage('Content type updated successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update content type: ${error}`);
    }
  }

  private async deleteCourseContentType(item: CourseContentTypeTreeItem): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete content type "${item.contentType.title || item.contentType.slug}"?`,
      'Yes',
      'No'
    );

    if (confirmation === 'Yes') {
      try {
        await this.apiService.deleteCourseContentType(item.contentType.id);
        
        // Refresh parent folder
        const parent = new CourseFolderTreeItem('contentTypes', item.course, item.courseFamily, item.organization);
        this.treeDataProvider.refreshNode(parent);
        vscode.window.showInformationMessage('Content type deleted successfully');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete content type: ${error}`);
      }
    }
  }

  private async manageGitLabTokens(): Promise<void> {
    // Get stored GitLab URLs from settings (for now)
    const settings = await this.settingsManager.getSettings();
    const urls = Object.keys(settings.workspace?.gitlabTokens || {});
    
    if (urls.length === 0) {
      vscode.window.showInformationMessage('No GitLab tokens configured yet. Tokens will be requested when needed.');
      return;
    }

    const items = urls.map(url => ({
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
      // Add new token
      const url = await vscode.window.showInputBox({
        prompt: 'Enter GitLab instance URL',
        placeHolder: 'https://gitlab.example.com'
      });
      
      if (url) {
        const token = await this.gitLabTokenManager.ensureTokenForUrl(url);
        if (token) {
          vscode.window.showInformationMessage(`Token added for ${url}`);
        }
      }
    } else {
      // Manage existing token
      const action = await vscode.window.showQuickPick(
        ['Update Token', 'Remove Token', 'Test Token'],
        { placeHolder: `Manage token for ${selected.label}` }
      );

      if (action === 'Update Token') {
        const token = await this.gitLabTokenManager.ensureTokenForUrl(selected.label);
        if (token) {
          vscode.window.showInformationMessage('Token updated successfully');
        }
      } else if (action === 'Remove Token') {
        await this.gitLabTokenManager.removeToken(selected.label);
        vscode.window.showInformationMessage('Token removed successfully');
      } else if (action === 'Test Token') {
        // TODO: Implement token testing
        vscode.window.showInformationMessage('Token testing not yet implemented');
      }
    }
  }
}