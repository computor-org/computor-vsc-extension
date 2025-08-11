import * as vscode from 'vscode';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import { GitLabTokenManager } from '../services/GitLabTokenManager';
import { LecturerTreeDataProvider } from '../ui/tree/lecturer/LecturerTreeDataProvider';
import { OrganizationTreeItem, CourseFamilyTreeItem, CourseTreeItem, CourseContentTreeItem, CourseFolderTreeItem, CourseContentTypeTreeItem, CourseGroupTreeItem } from '../ui/tree/lecturer/LecturerTreeItems';
import { CourseGroupCommands } from './lecturer/courseGroupCommands';
import { ComputorApiService } from '../services/ComputorApiService';
import { CourseWebviewProvider } from '../ui/webviews/CourseWebviewProvider';
import { CourseContentWebviewProvider } from '../ui/webviews/CourseContentWebviewProvider';
import { OrganizationWebviewProvider } from '../ui/webviews/OrganizationWebviewProvider';
import { CourseFamilyWebviewProvider } from '../ui/webviews/CourseFamilyWebviewProvider';
import { CourseContentTypeWebviewProvider } from '../ui/webviews/CourseContentTypeWebviewProvider';
import { CourseGroupWebviewProvider } from '../ui/webviews/CourseGroupWebviewProvider';
import { ExampleGet } from '../types/generated/examples';
import { GitWrapper } from '../git/GitWrapper';
import * as path from 'path';

interface ExampleQuickPickItem extends vscode.QuickPickItem {
  example: ExampleGet;
}

export class LecturerCommands {
  private settingsManager: ComputorSettingsManager;
  private gitLabTokenManager: GitLabTokenManager;
  private apiService: ComputorApiService;
  private courseWebviewProvider: CourseWebviewProvider;
  private courseContentWebviewProvider: CourseContentWebviewProvider;
  private organizationWebviewProvider: OrganizationWebviewProvider;
  private courseFamilyWebviewProvider: CourseFamilyWebviewProvider;
  private courseContentTypeWebviewProvider: CourseContentTypeWebviewProvider;
  private courseGroupWebviewProvider: CourseGroupWebviewProvider;
  private courseGroupCommands: CourseGroupCommands;

  constructor(
    private context: vscode.ExtensionContext,
    private treeDataProvider: LecturerTreeDataProvider
  ) {
    this.settingsManager = new ComputorSettingsManager(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.apiService = new ComputorApiService(context);
    this.courseWebviewProvider = new CourseWebviewProvider(context, this.apiService, this.treeDataProvider);
    this.courseContentWebviewProvider = new CourseContentWebviewProvider(context, this.apiService, this.treeDataProvider);
    this.organizationWebviewProvider = new OrganizationWebviewProvider(context, this.apiService, this.treeDataProvider);
    this.courseFamilyWebviewProvider = new CourseFamilyWebviewProvider(context, this.apiService, this.treeDataProvider);
    this.courseContentTypeWebviewProvider = new CourseContentTypeWebviewProvider(context, this.apiService, this.treeDataProvider);
    this.courseGroupWebviewProvider = new CourseGroupWebviewProvider(context, this.apiService, this.treeDataProvider);
    this.courseGroupCommands = new CourseGroupCommands(this.apiService, this.treeDataProvider);
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
      vscode.commands.registerCommand('computor.refreshLecturerTree', async () => {
        console.log('=== LECTURER TREE REFRESH COMMAND TRIGGERED ===');
        
        // Clear ALL API caches first - this is crucial
        console.log('Clearing all API caches...');
        this.apiService.clearCourseCache(''); // Clear all course caches
        
        // Use the standard refresh mechanism
        console.log('Refreshing lecturer tree...');
        this.treeDataProvider.refresh();
        
        console.log('Tree refresh completed');
        vscode.window.showInformationMessage('✅ Lecturer tree refreshed successfully!');
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

    // Course group management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.createCourseGroup', async (item: CourseFolderTreeItem) => {
        await this.courseGroupCommands.createCourseGroup(item);
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

    // Release/deployment commands
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.releaseCourseContent', async (item: CourseTreeItem) => {
        await this.releaseCourseContent(item);
      })
    );

    // Webview commands
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showCourseDetails', async (item: CourseTreeItem) => {
        await this.showCourseDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showCourseContentDetails', async (item: CourseContentTreeItem) => {
        await this.showCourseContentDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showOrganizationDetails', async (item: OrganizationTreeItem) => {
        await this.showOrganizationDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showCourseFamilyDetails', async (item: CourseFamilyTreeItem) => {
        await this.showCourseFamilyDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showCourseContentTypeDetails', async (item: CourseContentTypeTreeItem) => {
        await this.showCourseContentTypeDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showCourseGroupDetails', async (item: CourseGroupTreeItem) => {
        await this.showCourseGroupDetails(item);
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
    let parentPath: string | undefined;
    let courseId: string;
    
    if (item instanceof CourseFolderTreeItem && item.folderType === 'contents') {
      // Creating at root level
      parentPath = undefined;
      courseId = item.course.id;
    } else if (item instanceof CourseContentTreeItem) {
      // Creating under parent content
      parentPath = item.courseContent.path;
      courseId = item.course.id;
      
      // TODO: Check if parent content type allows children
      // This would require fetching the full content type with course_content_kind details
      // For now, we'll allow creating children under any content item
    } else {
      vscode.window.showErrorMessage('Course contents can only be created under the Contents folder or another content item');
      return;
    }

    // Get available content types
    const contentTypes = await this.apiService.getCourseContentTypes(courseId);
    if (contentTypes.length === 0) {
      vscode.window.showWarningMessage('No content types available. Please create a content type first.');
      return;
    }

    // Filter content types if creating under parent
    let availableTypes = contentTypes;
    if (parentPath) {
      // TODO: Only show content types that can have ancestors
      // This would require fetching the full content type with course_content_kind details
      // For now, we'll show all content types
      availableTypes = contentTypes;
    }

    if (availableTypes.length === 0) {
      vscode.window.showWarningMessage('No suitable content types available for child content.');
      return;
    }

    // Select content type
    const selectedType = await vscode.window.showQuickPick(
      availableTypes.map(t => ({
        label: t.title || t.slug,
        description: t.slug,
        id: t.id,
        contentType: t
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

    // Generate a slug from the title for the path
    const slug = await vscode.window.showInputBox({
      prompt: 'Enter a URL-friendly identifier (slug) for this content',
      placeHolder: 'e.g., week1, intro, assignment1',
      value: title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      validateInput: (value) => {
        if (!/^[a-z0-9_]+$/.test(value)) {
          return 'Slug must contain only lowercase letters, numbers, and underscores';
        }
        return null;
      }
    });

    if (!slug) {
      return;
    }

    await this.treeDataProvider.createCourseContent(
      item instanceof CourseFolderTreeItem ? item : new CourseFolderTreeItem('contents', item.course, item.courseFamily, item.organization), 
      title, 
      selectedType.id,
      parentPath,
      slug
    );
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
    console.log('Delete command called with item:', item);
    console.log('Item type:', item.constructor.name);
    console.log('Item courseContent:', item.courseContent);
    
    // Validate that we have the required data
    if (!item.courseContent || !item.courseContent.id) {
      vscode.window.showErrorMessage('Invalid course content item - missing required data');
      console.error('Invalid item passed to deleteCourseContent:', item);
      return;
    }
    
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete "${item.courseContent.title || item.courseContent.path}"?`,
      'Yes',
      'No'
    );

    if (confirmation === 'Yes') {
      await this.treeDataProvider.deleteCourseContent(item);
    }
  }

  private async assignExample(item: CourseContentTreeItem): Promise<void> {
    try {
      const searchQuery = await this.promptForExampleSearch();
      const examples = await this.searchExamples(item.course.id, searchQuery);
      
      if (!examples || examples.length === 0) {
        vscode.window.showWarningMessage('No examples found matching your search');
        return;
      }

      const selected = await this.selectExample(examples);
      if (!selected) {
        return;
      }

      await this.performExampleAssignment(item, selected.example);
      
      vscode.window.showInformationMessage(
        `✅ Example "${selected.label}" assigned successfully!`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to assign example: ${error}`);
    }
  }
  
  private async promptForExampleSearch(): Promise<string | undefined> {
    return vscode.window.showInputBox({
      prompt: 'Search for examples (optional)',
      placeHolder: 'Enter search terms or leave empty to see all'
    });
  }
  
  private async searchExamples(courseId: string, searchQuery?: string): Promise<ExampleGet[]> {
    void courseId; // courseId - parameter kept for compatibility
    void searchQuery; // searchQuery - not used in current implementation
    return this.apiService.getAvailableExamples() || [];
  }
  
  private async selectExample(examples: ExampleGet[]): Promise<ExampleQuickPickItem | undefined> {
    const quickPickItems: ExampleQuickPickItem[] = examples.map((example: ExampleGet) => ({
      label: example.title,
      description: [
        example.identifier && `🔖 ${example.identifier}`,
        example.repository && `📦 latest`
      ].filter(Boolean).join(' • '),
      detail: example.description || '',
      example: example
    }));

    return vscode.window.showQuickPick(quickPickItems, {
      placeHolder: `Select an example to assign (${examples.length} found)`,
      matchOnDescription: true,
      matchOnDetail: true
    });
  }
  
  private async performExampleAssignment(item: CourseContentTreeItem, example: ExampleGet): Promise<void> {
    const version = 'latest';
    
    // Get the updated content from the API response
    const updatedContent = await this.apiService.assignExampleToCourseContent(
      item.course.id,
      item.courseContent.id,
      example.id,
      version
    );
    
    console.log('Assignment API returned updated content:', {
      id: updatedContent.id,
      title: updatedContent.title,
      example_id: updatedContent.example_id,
      deployment_status: updatedContent.deployment_status,
      example_version: updatedContent.example_version
    });
    
    // Check if the deployment_status is what we expect
    if (updatedContent.deployment_status !== 'pending_release' && updatedContent.deployment_status !== 'pending') {
      console.warn(`Unexpected deployment_status: ${updatedContent.deployment_status}. Expected 'pending_release' or 'pending'.`);
    }

    console.log('Example assignment completed, refreshing tree...');
    
    // Clear cache and refresh the specific item
    this.apiService.clearCourseCache(item.course.id);
    
    // Refresh the parent of the content item to properly update the display
    // This ensures the item's visual state (icon, description) is updated
    const parent = await this.treeDataProvider.getParent(item);
    if (parent) {
      console.log(`Refreshing parent node: ${parent.id}`);
      (this.treeDataProvider as any).refreshNode(parent);
    } else {
      console.log('No parent found, refreshing the item itself');
      (this.treeDataProvider as any).refreshNode(item);
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
        // Get the updated content from the API response
        const updatedContent = await this.apiService.unassignExampleFromCourseContent(
          item.course.id,
          item.courseContent.id
        );
        
        console.log('Unassign API returned updated content:', {
          id: updatedContent.id,
          title: updatedContent.title,
          example_id: updatedContent.example_id,
          deployment_status: updatedContent.deployment_status
        });
        
        // Clear cache and refresh the specific item
        this.apiService.clearCourseCache(item.course.id);
        
        // Refresh the parent of the content item to properly update the display
        const parent = await this.treeDataProvider.getParent(item);
        if (parent) {
          console.log(`Refreshing parent node after unassign: ${parent.id}`);
          (this.treeDataProvider as any).refreshNode(parent);
        } else {
          console.log('No parent found, refreshing the item itself');
          (this.treeDataProvider as any).refreshNode(item);
        }
        
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

    // Parse repository details
    const repoName = repoUrl.split('/').pop()?.replace('.git', '') || 'course-repo';
    const targetPath = path.join(workspaceDir, repoName);
    
    // Check if directory already exists
    const fs = require('fs');
    if (fs.existsSync(targetPath)) {
      const action = await vscode.window.showWarningMessage(
        `Directory "${repoName}" already exists. What would you like to do?`,
        'Open in VS Code',
        'Delete and Re-clone',
        'Cancel'
      );
      
      if (action === 'Open in VS Code') {
        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), true);
        return;
      } else if (action === 'Delete and Re-clone') {
        // Remove existing directory
        await vscode.workspace.fs.delete(vscode.Uri.file(targetPath), { recursive: true });
      } else {
        return;
      }
    }
    
    // Show progress while cloning
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Cloning ${repoName}...`,
      cancellable: false
    }, async (progress) => {
      try {
        // Create authenticated URL with token
        const urlParts = new URL(repoUrl);
        urlParts.username = 'oauth2';
        urlParts.password = token;
        const authenticatedUrl = urlParts.toString();
        
        // Clone the repository
        const gitWrapper = new GitWrapper();
        await gitWrapper.clone(authenticatedUrl, targetPath);
        
        progress.report({ increment: 100 });
        
        // Ask if user wants to open the cloned repository
        const openAction = await vscode.window.showInformationMessage(
          `Repository "${repoName}" cloned successfully!`,
          'Open in New Window',
          'Open in This Window',
          'Close'
        );
        
        if (openAction === 'Open in New Window') {
          vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), true);
        } else if (openAction === 'Open in This Window') {
          vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Failed to clone repository: ${errorMessage}`);
      }
    });
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

  private async releaseCourseContent(item: CourseTreeItem): Promise<void> {
    try {
      // Clear both API and tree caches to get fresh data
      this.apiService.clearCourseCache(item.course.id);
      this.treeDataProvider.invalidateCache('course', item.course.id);
      
      const pendingContents = await this.getPendingReleaseContents(item.course.id);
      
      if (pendingContents.length === 0) {
        await this.handleNoPendingContent(item.course.id);
        return;
      }
      
      const confirmed = await this.confirmRelease(pendingContents);
      if (!confirmed) {
        return;
      }
      
      await this.executeRelease(item.course.id);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to release course content: ${error}`);
    }
  }
  
  private async getPendingReleaseContents(courseId: string) {
    const contents = await this.apiService.getCourseContents(courseId);
    return contents?.filter(c => 
      c.example_id && (c.deployment_status === 'pending_release' || c.deployment_status === 'pending')
    ) || [];
  }
  
  private async handleNoPendingContent(courseId: string): Promise<void> {
    const contents = await this.apiService.getCourseContents(courseId);
    const withExamples = contents?.filter(c => c.example_id) || [];
    
    if (withExamples.length > 0) {
      vscode.window.showInformationMessage(
        `Found ${withExamples.length} content(s) with examples. Their deployment status: ${
          withExamples.map(c => c.deployment_status || 'not set').join(', ')
        }`
      );
    } else {
      vscode.window.showInformationMessage('No pending content to release. Assign examples to course contents first.');
    }
  }
  
  private async confirmRelease(pendingContents: any[]): Promise<boolean> {
    const pendingList = pendingContents.map(c => `• ${c.title || c.path}`).join('\n');
    const confirmation = await vscode.window.showWarningMessage(
      `Release ${pendingContents.length} content items to students?\n\n${pendingList}`,
      { modal: true },
      'Release',
      'Cancel'
    );
    return confirmation === 'Release';
  }
  
  private async executeRelease(courseId: string): Promise<void> {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Releasing course content",
      cancellable: false
    }, async (progress) => {
      progress.report({ increment: 0, message: "Starting release process..." });
      
      const result = await this.apiService.generateStudentTemplate(courseId);
      console.log('Release started, response:', result);
      
      // Handle both possible response formats
      const taskId = result?.task_id || (result as any)?.id;
      if (!taskId) {
        console.error('No task ID in response:', result);
        // If no task ID but the request succeeded (200 OK), consider it a synchronous success
        if (result) {
          vscode.window.showInformationMessage('✅ Course content released successfully!');
          // Clear API cache and force refresh the course data
          this.apiService.clearCourseCache(courseId);
          await this.treeDataProvider.forceRefreshCourse(courseId);
          return;
        }
        throw new Error('Failed to start release process - no task ID returned');
      }
      
      const taskStatus = await this.pollTaskStatus(taskId, progress);
      
      if (taskStatus?.status === 'completed') {
        vscode.window.showInformationMessage('✅ Course content released successfully!');
        // Clear API cache and force refresh the course data
        this.apiService.clearCourseCache(courseId);
        await this.treeDataProvider.forceRefreshCourse(courseId);
      } else if (taskStatus?.status === 'failed') {
        throw new Error(taskStatus.error || 'Release process failed');
      } else {
        throw new Error('Release process timed out');
      }
    });
  }
  
  private async pollTaskStatus(taskId: string, progress: vscode.Progress<{ message?: string; increment?: number }>): Promise<any> {
    let taskStatus = await this.apiService.getTaskStatus(taskId);
    let pollCount = 0;
    const maxPolls = 60; // 5 minutes max
    
    while (taskStatus?.status === 'running' && pollCount < maxPolls) {
      progress.report({ 
        increment: (100 / maxPolls), 
        message: `Processing... ${taskStatus.message || ''}` 
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      taskStatus = await this.apiService.getTaskStatus(taskId);
      pollCount++;
    }
    
    return taskStatus;
  }

  private async showCourseDetails(item: CourseTreeItem): Promise<void> {
    await this.courseWebviewProvider.show(
      `Course: ${item.course.title || item.course.path}`,
      {
        course: item.course,
        courseFamily: item.courseFamily,
        organization: item.organization
      }
    );
  }

  private async showCourseContentDetails(item: CourseContentTreeItem): Promise<void> {
    // Fetch example info if the content has an example_id
    let exampleInfo = item.exampleInfo;
    if (item.courseContent.example_id && !exampleInfo) {
      try {
        exampleInfo = await this.apiService.getExample(item.courseContent.example_id);
      } catch (error) {
        console.error(`Failed to fetch example ${item.courseContent.example_id}:`, error);
      }
    }
    
    await this.courseContentWebviewProvider.show(
      `Content: ${item.courseContent.title || item.courseContent.path}`,
      {
        courseContent: item.courseContent,
        course: item.course,
        contentType: item.contentType,
        exampleInfo: exampleInfo,
        isSubmittable: item.isSubmittable
      }
    );
  }

  private async showOrganizationDetails(item: OrganizationTreeItem): Promise<void> {
    await this.organizationWebviewProvider.show(
      `Organization: ${item.organization.title || item.organization.path}`,
      {
        organization: item.organization
      }
    );
  }

  private async showCourseFamilyDetails(item: CourseFamilyTreeItem): Promise<void> {
    await this.courseFamilyWebviewProvider.show(
      `Course Family: ${item.courseFamily.title || item.courseFamily.path}`,
      {
        courseFamily: item.courseFamily,
        organization: item.organization
      }
    );
  }

  private async showCourseContentTypeDetails(item: CourseContentTypeTreeItem): Promise<void> {
    // Get content kind info
    let contentKind;
    try {
      const kinds = await this.apiService.getCourseContentKinds();
      contentKind = kinds.find(k => k.id === item.contentType.course_content_kind_id);
    } catch (error) {
      console.error('Failed to get content kind:', error);
    }

    await this.courseContentTypeWebviewProvider.show(
      `Content Type: ${item.contentType.title || item.contentType.slug}`,
      {
        contentType: item.contentType,
        course: item.course,
        contentKind
      }
    );
  }

  private async showCourseGroupDetails(item: CourseGroupTreeItem): Promise<void> {
    try {
      // Get detailed group information
      const detailedGroup = await this.apiService.getCourseGroup(item.group.id);
      if (!detailedGroup) {
        vscode.window.showErrorMessage('Failed to load group details');
        return;
      }

      // Get group members
      const members = await this.apiService.getCourseMembers(item.course.id, item.group.id);

      await this.courseGroupWebviewProvider.show(
        `Group: ${item.group.title || item.group.id}`,
        {
          group: detailedGroup,
          members: members,
          courseTitle: item.course.title || item.course.path,
          organizationTitle: item.organization.title || item.organization.path
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to show group details: ${error}`);
    }
  }
}