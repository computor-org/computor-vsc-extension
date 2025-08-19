import * as vscode from 'vscode';
import * as path from 'path';
import { StudentTreeDataProvider, StudentCourseTreeItem, StudentCourseContentTreeItem } from '../ui/tree/student/StudentTreeDataProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitLabTokenManager } from '../services/GitLabTokenManager';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { GitBranchManager } from '../services/GitBranchManager';
import { SubmissionGroupStudent } from '../types/generated';

export class StudentCommands {
  private context: vscode.ExtensionContext;
  private treeDataProvider: StudentTreeDataProvider;
  private apiService: ComputorApiService;
  private gitLabTokenManager: GitLabTokenManager;
  private workspaceManager: WorkspaceManager;
  private gitBranchManager: GitBranchManager;

  constructor(context: vscode.ExtensionContext, treeDataProvider: StudentTreeDataProvider) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    this.apiService = new ComputorApiService(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.workspaceManager = WorkspaceManager.getInstance(context);
    this.gitBranchManager = GitBranchManager.getInstance();
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

        if (!folderUri || folderUri.length === 0 || !folderUri[0]) {
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

    // Clone repository from course content tree
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.cloneRepository', async (item: any) => {
        // The item is a CourseContentItem from StudentCourseContentTreeProvider
        if (!item || !item.submissionGroup || !item.submissionGroup.repository) {
          vscode.window.showErrorMessage('No repository available for this assignment');
          return;
        }

        const submissionGroup = item.submissionGroup as SubmissionGroupStudent;
        const courseId = submissionGroup.course_id;

        try {
          const repoPath = await this.workspaceManager.cloneStudentRepository(courseId, submissionGroup);
          
          // Open the cloned repository in a new window or add to workspace
          const openInNewWindow = await vscode.window.showQuickPick(['Open in New Window', 'Add to Workspace'], {
            placeHolder: 'How would you like to open the repository?'
          });

          if (openInNewWindow === 'Open in New Window') {
            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(repoPath), true);
          } else if (openInNewWindow === 'Add to Workspace') {
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            const name = path.basename(repoPath);
            vscode.workspace.updateWorkspaceFolders(
              workspaceFolders.length,
              0,
              { uri: vscode.Uri.file(repoPath), name }
            );
          }

          vscode.window.showInformationMessage(`Repository cloned successfully to ${repoPath}`);
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to clone repository: ${error.message}`);
        }
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

    // Clone submission group repository
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.cloneSubmissionGroupRepository', async (submissionGroup: SubmissionGroupStudent, courseId: string) => {
        if (!submissionGroup || !submissionGroup.repository) {
          vscode.window.showErrorMessage('No repository available for this submission group');
          return;
        }

        try {
          const repoPath = await this.workspaceManager.cloneStudentRepository(courseId, submissionGroup);
          
          // Add to workspace
          const workspaceFolder = vscode.workspace.workspaceFolders?.find(
            folder => folder.uri.fsPath === repoPath
          );
          
          if (!workspaceFolder) {
            vscode.workspace.updateWorkspaceFolders(
              vscode.workspace.workspaceFolders?.length || 0,
              0,
              { uri: vscode.Uri.file(repoPath), name: `${submissionGroup.course_content_title}` }
            );
          }
          
          vscode.window.showInformationMessage(`Repository cloned successfully to ${repoPath}`);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to clone repository: ${error}`);
        }
      })
    );

    // Sync all repositories for a course
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.syncAllRepositories', async (courseId?: string) => {
        try {
          // Get all submission groups
          const submissionGroups = await this.apiService.getStudentSubmissionGroups(
            courseId ? { course_id: courseId } : undefined
          );
          
          if (submissionGroups.length === 0) {
            vscode.window.showInformationMessage('No repositories to sync');
            return;
          }
          
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Syncing repositories...',
            cancellable: false
          }, async (progress) => {
            let synced = 0;
            for (const group of submissionGroups) {
              if (group.repository) {
                try {
                  await this.workspaceManager.cloneStudentRepository(group.course_id, group);
                  synced++;
                  progress.report({ 
                    increment: (100 / submissionGroups.length),
                    message: `Synced ${synced}/${submissionGroups.length} repositories`
                  });
                } catch (error) {
                  console.error(`Failed to sync repository for ${group.course_content_title}:`, error);
                }
              }
            }
          });
          
          vscode.window.showInformationMessage('Repository sync completed');
          this.treeDataProvider.refresh();
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to sync repositories: ${error}`);
        }
      })
    );

    // Select assignment - main handler for tree item click
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.selectAssignment', async (submissionGroup: SubmissionGroupStudent, course: any) => {
        if (!submissionGroup || !submissionGroup.repository) {
          vscode.window.showErrorMessage('No repository available for this assignment');
          return;
        }

        try {
          // First ensure repository is cloned
          let repoPath = await this.workspaceManager.getStudentRepositoryPath(course.id, submissionGroup.id);
          
          if (!repoPath || !await this.directoryExists(repoPath)) {
            // Clone the repository if not exists
            repoPath = await this.workspaceManager.cloneStudentRepository(course.id, submissionGroup);
          }
          
          // Note: Worktree is already created with the correct assignment branch
          // No need to switch branches manually
          
          // Use the actual repository path since sparse-checkout handles directory filtering
          const assignmentDir = repoPath;
          
          // Open assignment directory in workspace
          const workspaceFolder = vscode.workspace.workspaceFolders?.find(
            folder => folder.uri.fsPath === repoPath
          );
          
          if (!workspaceFolder) {
            vscode.workspace.updateWorkspaceFolders(
              vscode.workspace.workspaceFolders?.length || 0,
              0,
              { uri: vscode.Uri.file(repoPath), name: `${submissionGroup.course_content_title}` }
            );
          }
          
          // Open the assignment directory
          const assignmentDirUri = vscode.Uri.file(assignmentDir);
          await vscode.commands.executeCommand('revealInExplorer', assignmentDirUri);
          
          // Open README if exists
          const readmePath = path.join(assignmentDir, 'README.md');
          if (await this.fileExists(readmePath)) {
            const doc = await vscode.workspace.openTextDocument(readmePath);
            await vscode.window.showTextDocument(doc);
          }
          
          const assignmentPath = submissionGroup.course_content_path;
          const exampleIdentifier = submissionGroup.example_identifier;
          
          let message = `Opened assignment: ${submissionGroup.course_content_title}`;
          
          if (exampleIdentifier) {
            message += ` (${exampleIdentifier})`;
          }
          
          if (assignmentPath) {
            message += ` [branch: assignment/${assignmentPath.replace(/\./g, '-')}]`;
          }
          
          vscode.window.showInformationMessage(message);
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to select assignment: ${error}`);
        }
      })
    );

    // Submit assignment
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.submitAssignment', async (submissionGroup: SubmissionGroupStudent, course: any) => {
        if (!submissionGroup || !submissionGroup.repository) {
          vscode.window.showErrorMessage('No repository available for this assignment');
          return;
        }

        try {
          const repoPath = await this.workspaceManager.getStudentRepositoryPath(course.id, submissionGroup.id);
          
          if (!repoPath || !await this.directoryExists(repoPath)) {
            vscode.window.showErrorMessage('Repository not found. Please select the assignment first.');
            return;
          }
          
          const assignmentPath = submissionGroup.course_content_path;
          
          // Ensure we're on the assignment branch
          const branchInfo = assignmentPath ? await this.gitBranchManager.checkAssignmentBranch(repoPath, assignmentPath) : null;
          if (assignmentPath && branchInfo && !branchInfo.isCurrent) {
            await this.gitBranchManager.switchToAssignmentBranch(repoPath, assignmentPath);
          }
          
          // Commit changes
          const commitMessage = await vscode.window.showInputBox({
            prompt: 'Enter commit message for submission',
            value: `Submit assignment ${assignmentPath}: ${submissionGroup.course_content_title}`
          });
          
          if (!commitMessage) {
            return;
          }
          
          await this.gitBranchManager.commitChanges(repoPath, commitMessage);
          
          // Push to remote
          if (assignmentPath) {
            await this.gitBranchManager.pushAssignmentBranch(repoPath, assignmentPath);
          } else {
            throw new Error('Assignment path is required for submission');
          }
          
          // Create merge request
          const createMR = await vscode.window.showInformationMessage(
            'Assignment pushed successfully. Create merge request?',
            'Yes',
            'No'
          );
          
          if (createMR === 'Yes') {
            if (assignmentPath) {
              await this.gitBranchManager.createMergeRequest(repoPath, assignmentPath);
            }
          }
          
          // TODO: Call API to notify submission
          // await this.apiService.submitAssignment(submissionGroup.id, branchName, commitHash);
          
          vscode.window.showInformationMessage('Assignment submitted successfully!');
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to submit assignment: ${error}`);
        }
      })
    );

    // View submission group details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.viewSubmissionGroup', async (submissionGroup: SubmissionGroupStudent) => {
        if (!submissionGroup) {
          return;
        }

        const info = [
          `**${submissionGroup.course_content_title}**`,
          '',
          `Path: ${submissionGroup.course_content_path}`,
          `Group Size: ${submissionGroup.current_group_size}/${submissionGroup.max_group_size}`,
          submissionGroup.repository ? `Repository: ${submissionGroup.repository.web_url}` : 'No repository',
          '',
          '**Members:**',
          ...submissionGroup.members?.map(m => `- ${m.full_name || m.username}`) || [],
          '',
          submissionGroup.latest_grading ? 
            `**Latest Grade:** ${submissionGroup.latest_grading.grading}` : 
            'Not graded yet'
        ].join('\n');

        vscode.window.showInformationMessage(info, { modal: true });
      })
    );
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(dirPath));
      return (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
      return false;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return (stat.type & vscode.FileType.File) !== 0;
    } catch {
      return false;
    }
  }
}