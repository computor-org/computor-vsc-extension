import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StudentCourseContentTreeProvider } from '../ui/tree/student/StudentCourseContentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { GitBranchManager } from '../services/GitBranchManager';
import { CourseSelectionService } from '../services/CourseSelectionService';
import { TestResultService } from '../services/TestResultService';
import { SubmissionGroupStudentList } from '../types/generated';

// Interface for course data used in commands
interface CourseCommandData {
  id: string;
  title?: string;
  path?: string;
}


export class StudentCommands {
  private context: vscode.ExtensionContext;
  private treeDataProvider: StudentCourseContentTreeProvider;
  private courseContentTreeProvider?: any; // Will be set after registration
  private apiService: ComputorApiService; // Used for future API calls
  private workspaceManager: WorkspaceManager;
  private gitBranchManager: GitBranchManager;
  private testResultService: TestResultService;

  constructor(
    context: vscode.ExtensionContext, 
    treeDataProvider: StudentCourseContentTreeProvider,
    apiService?: ComputorApiService
  ) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
    this.workspaceManager = WorkspaceManager.getInstance(context);
    this.gitBranchManager = GitBranchManager.getInstance();
    this.testResultService = TestResultService.getInstance();
    // Make sure TestResultService has the API service
    this.testResultService.setApiService(this.apiService);
    void this.courseContentTreeProvider; // Unused for now
  }
  
  setCourseContentTreeProvider(provider: any): void {
    this.courseContentTreeProvider = provider;
  }

  registerCommands(): void {
    // Refresh student view
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.refresh', () => {
        this.treeDataProvider.refresh();
      })
    );

    // Show README preview for assignments
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.showPreview', async (item: any) => {
        if (!item || !item.courseContent) {
          vscode.window.showErrorMessage('No assignment selected');
          return;
        }

        try {
          // Get the assignment directory path
          const directory = (item.courseContent as any).directory;
          if (!directory) {
            vscode.window.showErrorMessage('Assignment directory not found. Please wait for repository to be cloned.');
            return;
          }

          // Look for README.md in the assignment directory
          const readmePath = path.join(directory, 'README.md');
          
          if (fs.existsSync(readmePath)) {
            // Open the markdown preview
            const readmeUri = vscode.Uri.file(readmePath);
            await vscode.commands.executeCommand('markdown.showPreview', readmeUri, vscode.ViewColumn.Two, { sideBySide: true });
          } else {
            vscode.window.showInformationMessage('No README.md file found in this assignment');
          }
        } catch (error: any) {
          console.error('Failed to show README preview:', error);
          vscode.window.showErrorMessage(`Failed to show README preview: ${error.message}`);
        }
      })
    );

    // Clone repository from course content tree
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.cloneRepository', async (item: any) => {
        console.log('[CloneRepo] Item received:', item);
        console.log('[CloneRepo] Item courseContent:', item?.courseContent);
        console.log('[CloneRepo] Item submissionGroup:', item?.submissionGroup);
        
        // The item is a CourseContentItem from StudentCourseContentTreeProvider
        if (!item || !item.submissionGroup || !item.submissionGroup.repository) {
          vscode.window.showErrorMessage('No repository available for this assignment');
          return;
        }

        const submissionGroup = item.submissionGroup;
        let courseId = submissionGroup.course_id;
        
        // If course_id is not in submission group, try to get it from course selection
        if (!courseId) {
          const courseSelection = CourseSelectionService.getInstance();
          courseId = courseSelection.getCurrentCourseId();
          
          if (!courseId) {
            console.error('[CloneRepo] Course ID is missing from submission group and no course selected:', submissionGroup);
            vscode.window.showErrorMessage('No course selected. Please select a course first.');
            return;
          }
          
          console.log('[CloneRepo] Using course ID from course selection:', courseId);
        }
        
        // Get the directory from courseContent if available
        const directory = item.courseContent?.directory;
        
        console.log('[CloneRepo] CourseId:', courseId);
        console.log('[CloneRepo] Directory from courseContent:', directory);
        console.log('[CloneRepo] SubmissionGroup course_content_path:', submissionGroup.course_content_path);

        try {
          const repoPath = await this.workspaceManager.cloneStudentRepository(courseId, submissionGroup, directory);
          
          // Open the cloned repository in a new window or add to workspace
          const openInNewWindow = await vscode.window.showQuickPick(['Open in New Window', 'Add to Workspace'], {
            placeHolder: 'How would you like to open the repository?'
          });

          if (openInNewWindow === 'Open in New Window') {
            // Refresh the tree view instead of opening new window
            await vscode.commands.executeCommand('computor.student.refresh');
            vscode.window.showInformationMessage(`Assignment ready at: ${repoPath}`);
          } else if (openInNewWindow === 'Add to Workspace') {
            const workspaceFolders = vscode.workspace.workspaceFolders || [];
            const name = path.basename(repoPath);
            vscode.workspace.updateWorkspaceFolders(
              workspaceFolders.length,
              0,
              { uri: vscode.Uri.file(repoPath), name }
            );
          }

          // Refresh the tree to show cloned files
          this.treeDataProvider.refresh();

          vscode.window.showInformationMessage(`Repository cloned successfully to ${repoPath}`);
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to clone repository: ${error.message}`);
        }
      })
    );

    // Open course in browser (if GitLab URL exists)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.openInBrowser', async (item: any) => {
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
      vscode.commands.registerCommand('computor.student.cloneSubmissionGroupRepository', async (submissionGroup: SubmissionGroupStudentList, courseId: string) => {
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

    // Submit assignment
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.submitAssignment', async (submissionGroup: SubmissionGroupStudentList, course: CourseCommandData) => {
        if (!submissionGroup || !submissionGroup.repository) {
          vscode.window.showErrorMessage('No repository available for this assignment');
          return;
        }

        try {
          const repoPath = await this.workspaceManager.getStudentRepositoryPath(course.id, submissionGroup.id!);
          
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
      vscode.commands.registerCommand('computor.student.viewSubmissionGroup', async (submissionGroup: SubmissionGroupStudentList) => {
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

    // Commit and push assignment changes
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.commitAssignment', async (item: any) => {
        console.log('[CommitAssignment] Item received:', item);
        
        // The item is a CourseContentItem from StudentCourseContentTreeProvider
        if (!item || !item.courseContent) {
          vscode.window.showErrorMessage('No assignment selected');
          return;
        }

        // Get the assignment directory
        const directory = (item.courseContent as any).directory;
        if (!directory || !fs.existsSync(directory)) {
          vscode.window.showErrorMessage('Assignment directory not found. Please clone the repository first.');
          return;
        }

        const assignmentPath = item.courseContent.path;
        const assignmentTitle = item.courseContent.title || assignmentPath;

        try {
          // Check if there are any changes to commit
          const hasChanges = await this.gitBranchManager.hasChanges(directory);
          if (!hasChanges) {
            vscode.window.showInformationMessage('No changes to commit in this assignment.');
            return;
          }

          // Generate automatic commit message
          const now = new Date();
          const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
          const commitMessage = `Update ${assignmentTitle} - ${timestamp}`;

          // Show progress while committing and pushing
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Committing and pushing ${assignmentTitle}...`,
            cancellable: false
          }, async (progress) => {
            progress.report({ increment: 0, message: 'Checking branch...' });

            // Ensure we're on the main branch
            const currentBranch = await this.gitBranchManager.getCurrentBranch(directory);
            const mainBranch = await this.gitBranchManager.getMainBranch(directory);
            
            if (currentBranch !== mainBranch) {
              progress.report({ increment: 20, message: `Switching to ${mainBranch} branch...` });
              await this.gitBranchManager.checkoutBranch(directory, mainBranch);
            }

            progress.report({ increment: 40, message: 'Committing changes...' });
            // Stage all changes in the assignment directory
            await this.gitBranchManager.stageAll(directory);
            
            // Commit the changes
            await this.gitBranchManager.commitChanges(directory, commitMessage);

            progress.report({ increment: 60, message: 'Pushing to remote...' });
            // Push to main branch
            await this.gitBranchManager.pushCurrentBranch(directory);

            progress.report({ increment: 100, message: 'Successfully committed and pushed!' });
          });

          // Optionally refresh the tree to update any status indicators
          this.treeDataProvider.refreshNode(item);
        } catch (error: any) {
          console.error('Failed to commit assignment:', error);
          vscode.window.showErrorMessage(`Failed to commit assignment: ${error.message}`);
        }
      })
    );

    // Test assignment (includes commit, push, and test submission)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.testAssignment', async (item: any) => {
        console.log('[TestAssignment] Item received:', item);
        
        // The item is a CourseContentItem from StudentCourseContentTreeProvider
        if (!item || !item.courseContent) {
          vscode.window.showErrorMessage('No assignment selected');
          return;
        }

        // Get the assignment directory
        const directory = (item.courseContent as any).directory;
        if (!directory || !fs.existsSync(directory)) {
          vscode.window.showErrorMessage('Assignment directory not found. Please clone the repository first.');
          return;
        }

        const assignmentPath = item.courseContent.path;
        const assignmentTitle = item.courseContent.title || assignmentPath;

        try {
          // Check if there are any changes to commit
          const hasChanges = await this.gitBranchManager.hasChanges(directory);
          if (!hasChanges) {
            // No changes to commit, but we can still test with the current commit
            const currentCommitHash = await this.gitBranchManager.getLatestCommitHash(directory);
            if (currentCommitHash && item.courseContent.id) {
              // Use TestResultService for polling and displaying results
              await this.testResultService.submitTestAndAwaitResults(
                item.courseContent.id,
                currentCommitHash,
                assignmentTitle,
                false // Don't auto-submit, just test
              );
            } else {
              vscode.window.showWarningMessage('Could not determine commit hash for testing');
            }
            return;
          }

          // Generate automatic commit message
          const now = new Date();
          const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
          const commitMessage = `Update ${assignmentTitle} - ${timestamp}`;

          // Variable to hold commit hash
          let commitHash: string | null = null;

          // Show progress while committing, pushing, and testing
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Testing ${assignmentTitle}...`,
            cancellable: false
          }, async (progress) => {
            progress.report({ increment: 0, message: 'Checking branch...' });

            // Ensure we're on the main branch
            const currentBranch = await this.gitBranchManager.getCurrentBranch(directory);
            const mainBranch = await this.gitBranchManager.getMainBranch(directory);
            
            if (currentBranch !== mainBranch) {
              progress.report({ increment: 10, message: `Switching to ${mainBranch} branch...` });
              await this.gitBranchManager.checkoutBranch(directory, mainBranch);
            }

            progress.report({ increment: 20, message: 'Committing changes...' });
            // Stage all changes in the assignment directory
            await this.gitBranchManager.stageAll(directory);
            
            // Commit the changes
            await this.gitBranchManager.commitChanges(directory, commitMessage);

            progress.report({ increment: 40, message: 'Pushing to remote...' });
            // Push to main branch
            await this.gitBranchManager.pushCurrentBranch(directory);

            progress.report({ increment: 60, message: 'Getting commit hash...' });
            // Get the latest commit hash for test submission
            commitHash = await this.gitBranchManager.getLatestCommitHash(directory);
            
            progress.report({ increment: 100, message: 'Code pushed successfully!' });
          });
          
          // Now submit test and await results with polling
          if (commitHash && item.courseContent.id) {
            await this.testResultService.submitTestAndAwaitResults(
              item.courseContent.id,
              commitHash,
              assignmentTitle,
              false // Don't auto-submit, just test
            );
          } else {
            vscode.window.showWarningMessage('Could not submit test: missing commit hash or content ID');
          }

          // Optionally refresh the tree to update any status indicators
          this.treeDataProvider.refreshNode(item);
        } catch (error: any) {
          console.error('Failed to test assignment:', error);
          vscode.window.showErrorMessage(`Failed to test assignment: ${error.message}`);
        }
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

  // Utility method - currently unused but may be needed in the future
  /*
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return (stat.type & vscode.FileType.File) !== 0;
    } catch {
      return false;
    }
  }
  */
}