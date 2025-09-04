import * as vscode from 'vscode';
import { ComputorSettingsManager } from '../settings/ComputorSettingsManager';
import { GitLabTokenManager } from '../services/GitLabTokenManager';
import { LecturerTreeDataProvider } from '../ui/tree/lecturer/LecturerTreeDataProvider';
import { OrganizationTreeItem, CourseFamilyTreeItem, CourseTreeItem, CourseContentTreeItem, CourseFolderTreeItem, CourseContentTypeTreeItem, CourseGroupTreeItem, CourseMemberTreeItem } from '../ui/tree/lecturer/LecturerTreeItems';
import { CourseGroupCommands } from './lecturer/courseGroupCommands';
import { ComputorApiService } from '../services/ComputorApiService';
import { CourseWebviewProvider } from '../ui/webviews/CourseWebviewProvider';
import { CourseContentWebviewProvider } from '../ui/webviews/CourseContentWebviewProvider';
import { OrganizationWebviewProvider } from '../ui/webviews/OrganizationWebviewProvider';
import { CourseFamilyWebviewProvider } from '../ui/webviews/CourseFamilyWebviewProvider';
import { CourseContentTypeWebviewProvider } from '../ui/webviews/CourseContentTypeWebviewProvider';
import { CourseGroupWebviewProvider } from '../ui/webviews/CourseGroupWebviewProvider';
import { ExampleGet } from '../types/generated/examples';
import { hasExampleAssigned, getExampleVersionId, getDeploymentStatus } from '../utils/deploymentHelpers';

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
    private treeDataProvider: LecturerTreeDataProvider,
    apiService?: ComputorApiService
  ) {
    this.settingsManager = new ComputorSettingsManager(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
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

    // Tree refresh - register both command names for compatibility
    const refreshHandler = async () => {
      console.log('=== LECTURER TREE REFRESH COMMAND TRIGGERED ===');
      
      // Clear ALL API caches first - this is crucial
      console.log('Clearing all API caches...');
      this.apiService.clearCourseCache(''); // Clear all course caches
      
      // Use the standard refresh mechanism
      console.log('Refreshing lecturer tree...');
      this.treeDataProvider.refresh();
      
      console.log('Tree refresh completed');
      vscode.window.showInformationMessage('✅ Lecturer tree refreshed successfully!');
    };
    
    // Register refresh commands with proper naming convention
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.refresh', refreshHandler)
    );
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.refreshCourses', refreshHandler)
    );

    // Course management commands
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.createCourse', async () => {
        await this.createCourse();
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.manageCourse', async (item: CourseTreeItem) => {
        await this.manageCourse(item);
      })
    );

    // Course content management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.createCourseContent', async (item: CourseFolderTreeItem | CourseContentTreeItem) => {
        await this.createCourseContent(item);
      })
    );

    // Course content type management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.createCourseContentType', async (item: CourseFolderTreeItem) => {
        await this.createCourseContentType(item);
      })
    );

    // Course group management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.createCourseGroup', async (item: CourseFolderTreeItem) => {
        await this.courseGroupCommands.createCourseGroup(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.editCourseContentType', async (item: CourseContentTypeTreeItem) => {
        await this.editCourseContentType(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.deleteCourseContentType', async (item: CourseContentTypeTreeItem) => {
        await this.deleteCourseContentType(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.renameCourseContent', async (item: CourseContentTreeItem) => {
        await this.renameCourseContent(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.renameCourseContentType', async (item: CourseContentTypeTreeItem) => {
        await this.renameCourseContentType(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.deleteCourseContent', async (item: CourseContentTreeItem) => {
        await this.deleteCourseContent(item);
      })
    );

    // Example management
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.assignExample', async (item: CourseContentTreeItem) => {
        await this.assignExample(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.unassignExample', async (item: CourseContentTreeItem) => {
        await this.unassignExample(item);
      })
    );

    // GitLab repository opening
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.openGitLabRepo', async (item: CourseTreeItem | CourseMemberTreeItem) => {
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
      vscode.commands.registerCommand('computor.lecturer.releaseCourseContent', async (item: CourseTreeItem) => {
        await this.releaseCourseContent(item);
      })
    );

    // Release from webview (accepts course data directly)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.releaseCourseContentFromWebview', async (courseData: any) => {
        await this.releaseCourseContentFromWebview(courseData);
      })
    );

    // Webview commands
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.showCourseDetails', async (item: CourseTreeItem) => {
        await this.showCourseDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.showCourseContentDetails', async (item: CourseContentTreeItem) => {
        await this.showCourseContentDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.showOrganizationDetails', async (item: OrganizationTreeItem) => {
        await this.showOrganizationDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.showCourseFamilyDetails', async (item: CourseFamilyTreeItem) => {
        await this.showCourseFamilyDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.showCourseContentTypeDetails', async (item: CourseContentTypeTreeItem) => {
        await this.showCourseContentTypeDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.showCourseGroupDetails', async (item: CourseGroupTreeItem) => {
        await this.showCourseGroupDetails(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.renameCourseGroup', async (item: CourseGroupTreeItem) => {
        await this.renameCourseGroup(item);
      })
    );
  }

  /**
   * Create a new course
   */
  private async createCourse(): Promise<void> {
    // Get organization
    const organizations = await this.apiService.getOrganizations();
    if (!organizations || organizations.length === 0) {
      vscode.window.showErrorMessage('No organizations available');
      return;
    }

    const selectedOrg = await vscode.window.showQuickPick(
      organizations.map(org => ({
        label: org.title || org.path,
        description: org.path,
        organization: org
      })),
      { placeHolder: 'Select organization' }
    );

    if (!selectedOrg) {
      return;
    }

    // Get course family  
    const families = await this.apiService.getCourseFamilies(selectedOrg.organization.id);
    if (!families || families.length === 0) {
      vscode.window.showErrorMessage('No course families available in this organization');
      return;
    }

    const selectedFamily = await vscode.window.showQuickPick(
      families.map(family => ({
        label: family.title || family.path,
        description: family.path,
        family: family
      })),
      { placeHolder: 'Select course family' }
    );

    if (!selectedFamily) {
      return;
    }

    // Get course details
    const coursePath = await vscode.window.showInputBox({
      prompt: 'Enter course path (URL-friendly identifier)',
      placeHolder: 'e.g., cs101-2024, intro-programming-fall',
      validateInput: (value) => {
        if (!value) {
          return 'Course path is required';
        }
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Path must contain only lowercase letters, numbers, and hyphens';
        }
        return null;
      }
    });

    if (!coursePath) {
      return;
    }

    const courseTitle = await vscode.window.showInputBox({
      prompt: 'Enter course title',
      placeHolder: 'e.g., Introduction to Computer Science',
      value: coursePath.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    });

    if (!courseTitle) {
      return;
    }

    try {
      // TODO: Implement createCourse in ComputorApiService
      // For now, show a message that this feature is coming soon
      vscode.window.showInformationMessage(
        `Course creation feature is coming soon! Would create: "${courseTitle}" in ${selectedFamily.family.title}`
      );
      
      // When API is ready, uncomment:
      // await this.apiService.createCourse({
      //   path: coursePath,
      //   title: courseTitle,
      //   course_family_id: selectedFamily.family.id
      // });
      // vscode.window.showInformationMessage(`Course "${courseTitle}" created successfully!`);
      // this.treeDataProvider.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create course: ${error}`);
    }
  }

  /**
   * Manage course settings and properties
   */
  private async manageCourse(item?: CourseTreeItem): Promise<void> {
    let course;
    
    if (item) {
      course = item.course;
    } else {
      // If no item provided, ask user to select a course
      const courses = await this.getAllCourses();
      if (!courses || courses.length === 0) {
        vscode.window.showInformationMessage('No courses available');
        return;
      }

      const selected = await vscode.window.showQuickPick(
        courses.map(c => ({
          label: c.title || c.path,
          description: `${c.organization?.title || ''} > ${c.course_family?.title || ''}`,
          course: c
        })),
        { placeHolder: 'Select course to manage' }
      );

      if (!selected) {
        return;
      }
      course = selected.course;
    }

    // Show management options
    const action = await vscode.window.showQuickPick([
      { label: '$(edit) Edit Course Details', value: 'edit' },
      { label: '$(repo) Configure GitLab Repository', value: 'gitlab' },
      { label: '$(gear) Course Settings', value: 'settings' },
      { label: '$(trash) Delete Course', value: 'delete' }
    ], {
      placeHolder: `Manage: ${course.title || course.path}`
    });

    if (!action) {
      return;
    }

    switch (action.value) {
      case 'edit':
        await this.editCourseDetails(course);
        break;
      case 'gitlab':
        await this.configureGitLabRepository(course);
        break;
      case 'settings':
        await this.showCourseSettings(course);
        break;
      case 'delete':
        await this.deleteCourse(course);
        break;
    }
  }

  private async getAllCourses(): Promise<any[]> {
    const courses: any[] = [];
    const organizations = await this.apiService.getOrganizations();
    
    for (const org of organizations || []) {
      const families = await this.apiService.getCourseFamilies(org.id);
      for (const family of families || []) {
        const familyCourses = await this.apiService.getCourses(family.id);
        courses.push(...(familyCourses || []).map(c => ({
          ...c,
          organization: org,
          course_family: family
        })));
      }
    }
    
    return courses;
  }

  private async editCourseDetails(course: any): Promise<void> {
    const newTitle = await vscode.window.showInputBox({
      prompt: 'Enter new course title',
      value: course.title || course.path
    });

    if (!newTitle || newTitle === course.title) {
      return;
    }

    try {
      await this.apiService.updateCourse(course.id, { title: newTitle });
      vscode.window.showInformationMessage('Course updated successfully');
      this.treeDataProvider.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update course: ${error}`);
    }
  }

  private async configureGitLabRepository(course: any): Promise<void> {
    const repoUrl = await vscode.window.showInputBox({
      prompt: 'Enter GitLab repository URL',
      placeHolder: 'https://gitlab.example.com/org/repo.git',
      value: course.properties?.gitlab?.url || ''
    });

    if (!repoUrl) {
      return;
    }

    try {
      await this.apiService.updateCourse(course.id, {
        properties: {
          ...course.properties,
          gitlab: {
            ...course.properties?.gitlab,
            url: repoUrl
          }
        }
      });
      vscode.window.showInformationMessage('GitLab repository configured successfully');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to configure repository: ${error}`);
    }
  }

  private async showCourseSettings(course: any): Promise<void> {
    // For now, just show the course details webview
    if (course) {
      await this.courseWebviewProvider.show(
        `Course Settings: ${course.title || course.path}`,
        {
          course: course,
          courseFamily: course.course_family,
          organization: course.organization
        }
      );
    }
  }

  private async deleteCourse(course: any): Promise<void> {
    const confirmation = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the course "${course.title || course.path}"? This action cannot be undone.`,
      { modal: true },
      'Delete',
      'Cancel'
    );

    if (confirmation === 'Delete') {
      try {
        // TODO: Implement deleteCourse in ComputorApiService
        // For now, show a message that this feature is coming soon
        vscode.window.showInformationMessage(
          `Course deletion feature is coming soon! Would delete: "${course.title || course.path}"`
        );
        
        // When API is ready, uncomment:
        // await this.apiService.deleteCourse(course.id);
        // vscode.window.showInformationMessage('Course deleted successfully');
        // this.treeDataProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to delete course: ${error}`);
      }
    }
  }

  private async selectWorkspaceDirectory(): Promise<void> {
    const result = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Workspace Directory',
      title: 'Select Workspace Directory'
    });

    if (result && result.length > 0 && result[0]) {
      const directory = result[0].fsPath;
      await this.settingsManager.setWorkspaceDirectory(directory);
      vscode.window.showInformationMessage(`Workspace directory set to: ${directory}`);
      
      // Update file explorers to show new workspace
      await vscode.commands.executeCommand('computor.fileExplorer.goToWorkspace');
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

    // Automatically generate a slug from the title for the path
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

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

    try {
      await this.treeDataProvider.updateCourseContent(item, { title: newTitle });
      vscode.window.showInformationMessage(`Content renamed to "${newTitle}"`);
      
      // Force a full refresh to ensure the tree updates
      await this.treeDataProvider.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename content: ${error}`);
    }
  }

  private async renameCourseContentType(item: CourseContentTypeTreeItem): Promise<void> {
    const currentTitle = item.contentType.title || '';
    const newTitle = await vscode.window.showInputBox({
      prompt: 'Enter new title for content type',
      value: currentTitle
    });

    if (!newTitle || newTitle === currentTitle) {
      return;
    }

    try {
      await this.apiService.updateCourseContentType(item.contentType.id, { title: newTitle });
      vscode.window.showInformationMessage(`Content type renamed to "${newTitle}"`);
      await this.treeDataProvider.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename content type: ${error}`);
    }
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
    // First, get the example with versions if not already loaded
    let exampleWithVersions = example;
    if (!example.versions || example.versions.length === 0) {
      const fullExample = await this.apiService.getExample(example.id);
      if (!fullExample || !fullExample.versions || fullExample.versions.length === 0) {
        throw new Error('Example has no versions available');
      }
      exampleWithVersions = fullExample;
    }

    // Select version - for now use the latest version
    // TODO: In future, allow user to select specific version
    const latestVersion = exampleWithVersions.versions!.reduce((latest, current) => 
      current.version_number > latest.version_number ? current : latest
    );

    // Get the updated content from the API response using the new method
    const updatedContent = await this.apiService.assignExampleVersionToCourseContent(
      item.courseContent.id,
      latestVersion.id
    );
    
    console.log('Assignment API returned updated content:', {
      id: updatedContent.id,
      title: updatedContent.title,
      hasExample: hasExampleAssigned(updatedContent),
      versionId: getExampleVersionId(updatedContent),
      deployment: updatedContent.deployment
    });
    
    // Check deployment status if deployment is included
    if (updatedContent.deployment) {
      const deploymentStatus = updatedContent.deployment.deployment_status;
      if (deploymentStatus !== 'pending' && deploymentStatus !== 'assigned') {
        console.warn(`Unexpected deployment_status: ${deploymentStatus}. Expected 'pending' or 'assigned'.`);
      }
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
          hasExample: hasExampleAssigned(updatedContent),
          deploymentStatus: getDeploymentStatus(updatedContent)
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

  private async openGitLabRepository(item: CourseTreeItem | CourseMemberTreeItem): Promise<void> {
    try {
      let webUrl: string | undefined;
      let itemType: string;
      
      if (item instanceof CourseMemberTreeItem) {
        // For course members, we need to fetch the full member data to get the GitLab project URL
        itemType = 'member project';
        const memberData = await this.apiService.getCourseMember(item.member.id);
        
        if (memberData?.properties?.gitlab?.url && memberData.properties.gitlab.full_path) {
          // Build the full GitLab project URL
          const gitlabHost = memberData.properties.gitlab.url;
          const projectPath = memberData.properties.gitlab.full_path;
          webUrl = `${gitlabHost}/${projectPath}`;
        } else {
          vscode.window.showWarningMessage('No GitLab project found for this course member');
          return;
        }
      } else {
        // For courses, use the course group URL
        itemType = 'course group';
        const courseGitlab = item.course.properties?.gitlab;
        
        if (courseGitlab?.url && courseGitlab.full_path) {
          // Build the full GitLab group URL
          const gitlabHost = courseGitlab.url;
          const groupPath = courseGitlab.full_path;
          webUrl = `${gitlabHost}/${groupPath}`;
        } else {
          vscode.window.showWarningMessage('No GitLab group found for this course');
          return;
        }
      }
      
      if (webUrl) {
        // Ensure the URL has proper protocol
        if (!webUrl.startsWith('http://') && !webUrl.startsWith('https://')) {
          webUrl = `https://${webUrl}`;
        }
        
        // Open the URL in the default browser
        await vscode.env.openExternal(vscode.Uri.parse(webUrl));
        vscode.window.showInformationMessage(`Opening GitLab ${itemType} in browser`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open GitLab repository: ${error}`);
    }
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
        vscode.window.showInformationMessage('Content type deleted successfully');
        
        // Refresh the tree to show the changes
        await this.treeDataProvider.refresh();
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

  private async releaseCourseContentFromWebview(courseData: any): Promise<void> {
    try {
      // Extract course ID from the webview data
      const courseId = courseData?.id || courseData;
      
      if (!courseId) {
        vscode.window.showErrorMessage('Invalid course data: missing course ID');
        return;
      }
      
      // Clear both API and tree caches to get fresh data
      this.apiService.clearCourseCache(courseId);
      this.treeDataProvider.invalidateCache('course', courseId);
      
      const pendingContents = await this.getPendingReleaseContents(courseId);
      
      if (pendingContents.length === 0) {
        await this.handleNoPendingContent(courseId);
        return;
      }
      
      const confirmed = await this.confirmRelease(pendingContents);
      if (!confirmed) {
        return;
      }
      
      await this.executeRelease(courseId);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to release course content: ${error}`);
    }
  }
  
  private async getPendingReleaseContents(courseId: string) {
    const contents = await this.apiService.getCourseContents(courseId, false, true);
    return contents?.filter(c => {
      const status = getDeploymentStatus(c);
      return hasExampleAssigned(c) && (status === 'pending_release' || status === 'pending');
    }) || [];
  }
  
  private async handleNoPendingContent(courseId: string): Promise<void> {
    const contents = await this.apiService.getCourseContents(courseId, false, true);
    const withExamples = contents?.filter(c => hasExampleAssigned(c)) || [];
    
    if (withExamples.length > 0) {
      vscode.window.showInformationMessage(
        `Found ${withExamples.length} content(s) with examples. Their deployment status: ${
          withExamples.map(c => getDeploymentStatus(c) || 'not set').join(', ')
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
    // Fetch fresh data from API
    const freshCourse = await this.apiService.getCourse(item.course.id) || item.course;
    
    await this.courseWebviewProvider.show(
      `Course: ${freshCourse.title || freshCourse.path}`,
      {
        course: freshCourse,
        courseFamily: item.courseFamily,
        organization: item.organization
      }
    );
  }

  private async showCourseContentDetails(item: CourseContentTreeItem): Promise<void> {
    // Fetch full course content data from API (individual GET has all fields)
    const freshContent = await this.apiService.getCourseContent(item.courseContent.id, true) || item.courseContent;
    
    // Fetch example info if the content has an example assigned
    let exampleInfo = item.exampleInfo;
    if (hasExampleAssigned(freshContent) && !exampleInfo) {
      try {
        // Get version ID and fetch the version, then get the example
        const versionId = getExampleVersionId(freshContent);
        if (versionId) {
          const versionInfo = await this.apiService.getExampleVersion(versionId);
          if (versionInfo && versionInfo.example_id) {
            exampleInfo = await this.apiService.getExample(versionInfo.example_id);
          }
        }
      } catch (error) {
        console.error(`Failed to fetch example info:`, error);
      }
    }
    
    await this.courseContentWebviewProvider.show(
      `Content: ${freshContent.title || freshContent.path}`,
      {
        courseContent: freshContent,
        course: item.course,
        contentType: item.contentType,
        exampleInfo: exampleInfo,
        isSubmittable: item.isSubmittable
      }
    );
  }

  private async showOrganizationDetails(item: OrganizationTreeItem): Promise<void> {
    // Fetch fresh data from API
    const freshOrganization = await this.apiService.getOrganization(item.organization.id) || item.organization;
    
    await this.organizationWebviewProvider.show(
      `Organization: ${freshOrganization.title || freshOrganization.path}`,
      {
        organization: freshOrganization
      }
    );
  }

  private async showCourseFamilyDetails(item: CourseFamilyTreeItem): Promise<void> {
    // Fetch fresh data from API
    const freshCourseFamily = await this.apiService.getCourseFamily(item.courseFamily.id) || item.courseFamily;
    
    await this.courseFamilyWebviewProvider.show(
      `Course Family: ${freshCourseFamily.title || freshCourseFamily.path}`,
      {
        courseFamily: freshCourseFamily,
        organization: item.organization
      }
    );
  }

  private async showCourseContentTypeDetails(item: CourseContentTypeTreeItem): Promise<void> {
    // Fetch full content type data from API (individual GET has all fields)
    const freshContentType = await this.apiService.getCourseContentType(item.contentType.id) || item.contentType;
    
    // Get content kind info
    let contentKind;
    try {
      const kinds = await this.apiService.getCourseContentKinds();
      contentKind = kinds.find(k => k.id === freshContentType.course_content_kind_id);
    } catch (error) {
      console.error('Failed to get content kind:', error);
    }

    await this.courseContentTypeWebviewProvider.show(
      `Content Type: ${freshContentType.title || freshContentType.slug}`,
      {
        contentType: freshContentType,
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

  private async renameCourseGroup(item: CourseGroupTreeItem): Promise<void> {
    const currentTitle = item.group.title || '';
    const newTitle = await vscode.window.showInputBox({
      prompt: 'Enter new title for the group',
      value: currentTitle
    });

    if (!newTitle || newTitle === currentTitle) {
      return;
    }

    try {
      await this.apiService.updateCourseGroup(item.group.id, { title: newTitle });
      vscode.window.showInformationMessage(`Group renamed to "${newTitle}"`);
      
      // Refresh the tree to show the changes
      await this.treeDataProvider.refresh();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to rename group: ${error}`);
    }
  }
}