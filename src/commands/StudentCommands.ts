import * as vscode from 'vscode';
import { StudentTreeDataProvider, StudentCourseTreeItem, StudentCourseContentTreeItem } from '../ui/tree/student/StudentTreeDataProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitLabTokenManager } from '../services/GitLabTokenManager';

export class StudentCommands {
  private context: vscode.ExtensionContext;
  private treeDataProvider: StudentTreeDataProvider;
  private apiService: ComputorApiService;
  private gitLabTokenManager: GitLabTokenManager;

  constructor(context: vscode.ExtensionContext, treeDataProvider: StudentTreeDataProvider) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    this.apiService = new ComputorApiService(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
  }

  registerCommands(): void {
    // Refresh student view
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.refresh', () => {
        this.treeDataProvider.refresh();
      })
    );

    // View course details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.viewCourse', async (item: StudentCourseTreeItem) => {
        if (!item) {
          return;
        }

        const course = await this.apiService.getStudentCourse(item.course.id);
        if (course) {
          // Show course information
          const info = [
            `**Course: ${course.title}**`,
            '',
            `ID: ${course.id}`,
            `Path: ${course.path}`,
            course.repository ? `Repository: ${course.repository.provider_url}/${course.repository.full_path}` : 'No repository assigned'
          ].join('\n');

          vscode.window.showInformationMessage(info, { modal: true });
        }
      })
    );

    // Clone course repository
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.cloneCourseRepository', async (item: StudentCourseTreeItem) => {
        if (!item || !item.course.repository) {
          vscode.window.showErrorMessage('No repository available for this course');
          return;
        }

        const repo = item.course.repository;
        const repoUrl = `${repo.provider_url}/${repo.full_path}`;
        
        // Get GitLab token if needed
        const gitlabUrl = repo.provider_url;
        const token = await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
        
        if (!token) {
          vscode.window.showErrorMessage('GitLab authentication required');
          return;
        }

        // Prompt for local directory
        const folderUri = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select Clone Location'
        });

        if (!folderUri || folderUri.length === 0) {
          return;
        }

        const targetPath = folderUri[0].fsPath;
        const repoName = repo.full_path.split('/').pop() || 'repository';
        
        // Clone with authentication
        const authenticatedUrl = repoUrl.replace('https://', `https://oauth2:${token}@`);
        
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Cloning ${repoName}...`,
          cancellable: false
        }, async (progress) => {
          try {
            const terminal = vscode.window.createTerminal({
              name: `Clone: ${repoName}`,
              cwd: targetPath
            });
            
            terminal.sendText(`git clone ${authenticatedUrl} ${repoName}`);
            terminal.show();
            
            vscode.window.showInformationMessage(`Repository cloned to ${targetPath}/${repoName}`);
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to clone repository: ${error}`);
          }
        });
      })
    );

    // View content details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.viewContent', async (item: StudentCourseContentTreeItem) => {
        if (!item) {
          return;
        }

        const content = await this.apiService.getStudentCourseContent(item.content.id);
        if (content) {
          const info = [
            `**${content.title}**`,
            '',
            `Path: ${content.path}`,
            `Position: ${content.position}`,
            content.example_id ? `Has Assignment: Yes` : `Type: Reading Material`
          ].join('\n');

          vscode.window.showInformationMessage(info, { modal: true });
        }
      })
    );

    // Start working on assignment (content with example)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.startAssignment', async (item: StudentCourseContentTreeItem) => {
        if (!item || !item.content.example_id) {
          vscode.window.showErrorMessage('This content does not have an assignment');
          return;
        }

        // Get the full content details
        const content = await this.apiService.getStudentCourseContent(item.content.id);
        if (!content) {
          vscode.window.showErrorMessage('Failed to load assignment details');
          return;
        }

        // Here we would typically:
        // 1. Clone/setup the student's submission repository
        // 2. Download the example template
        // 3. Set up the working environment
        
        vscode.window.showInformationMessage(
          `Assignment "${item.content.title}" setup functionality coming soon!`,
          'OK'
        );
      })
    );

    // Submit assignment
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.submitAssignment', async (item: StudentCourseContentTreeItem) => {
        if (!item || !item.content.example_id) {
          vscode.window.showErrorMessage('This content does not have an assignment');
          return;
        }

        // Here we would typically:
        // 1. Commit and push changes
        // 2. Create a merge request
        // 3. Notify the system of submission
        
        vscode.window.showInformationMessage(
          `Assignment submission functionality coming soon!`,
          'OK'
        );
      })
    );

    // Open course in browser (if GitLab URL exists)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.openInBrowser', async (item: StudentCourseTreeItem) => {
        if (!item || !item.course.repository) {
          vscode.window.showErrorMessage('No repository URL available');
          return;
        }

        const url = `${item.course.repository.provider_url}/${item.course.repository.full_path}`;
        vscode.env.openExternal(vscode.Uri.parse(url));
      })
    );
  }
}