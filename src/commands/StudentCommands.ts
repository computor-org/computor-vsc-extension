import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StudentCourseContentTreeProvider } from '../ui/tree/student/StudentCourseContentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitBranchManager } from '../services/GitBranchManager';
import { CourseSelectionService } from '../services/CourseSelectionService';
import { TestResultService } from '../services/TestResultService';
import { SubmissionGroupStudentList } from '../types/generated';
import { StudentRepositoryManager } from '../services/StudentRepositoryManager';

// (Deprecated legacy types removed)


export class StudentCommands {
  private context: vscode.ExtensionContext;
  private treeDataProvider: StudentCourseContentTreeProvider;
  private courseContentTreeProvider?: any; // Will be set after registration
  private apiService: ComputorApiService; // Used for future API calls
  // private workspaceManager: WorkspaceManager;
  private repositoryManager?: StudentRepositoryManager;
  private gitBranchManager: GitBranchManager;
  private testResultService: TestResultService;

  constructor(
    context: vscode.ExtensionContext, 
    treeDataProvider: StudentCourseContentTreeProvider,
    apiService?: ComputorApiService,
    repositoryManager?: StudentRepositoryManager
  ) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
    // this.workspaceManager = WorkspaceManager.getInstance(context);
    this.repositoryManager = repositoryManager;
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
      vscode.commands.registerCommand('computor.student.showPreview', async (item?: any) => {
        try {
          // If item provided and has a directory, open README from there
          const directoryFromItem: string | undefined = item?.courseContent ? (item.courseContent as any).directory : undefined;
          if (directoryFromItem) {
            await this.openReadmeIfExists(directoryFromItem);
            return;
          }

          // Try to infer from active editor
          const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
          if (activePath) {
            const repoRoot = await this.findRepoRoot(activePath);
            if (repoRoot) {
              const rel = path.relative(repoRoot, activePath);
              const firstSegment = rel.split(path.sep)[0];
              if (firstSegment && firstSegment !== '' && firstSegment !== '..') {
                const candidateDir = path.join(repoRoot, firstSegment);
                const ok = await this.openReadmeIfExists(candidateDir, true);
                if (ok) return;
              }
            }
          }

          // Fallback: let user pick an assignment directory from current course
          const courseId = CourseSelectionService.getInstance().getCurrentCourseId();
          if (!courseId) {
            vscode.window.showWarningMessage('No course selected. Select a course then try again.');
            return;
          }
          const contents = await this.apiService.getStudentCourseContents(courseId);
          if (this.repositoryManager) {
            this.repositoryManager.updateExistingRepositoryPaths(courseId, contents);
          }
          const assignables = contents
            .map(c => ({ content: c, directory: (c as any).directory as string | undefined }))
            .filter(x => !!x.directory && fs.existsSync(x.directory!));

          if (assignables.length === 0) {
            vscode.window.showInformationMessage('No cloned assignments found for this course. Clone an assignment first.');
            return;
          }

          const pick = await vscode.window.showQuickPick(
            assignables.map(a => ({ label: a.content.title || a.content.path, description: a.directory, a })),
            { title: 'Select assignment to preview README.md' }
          );
          if (!pick) return;
          await this.openReadmeIfExists(pick.a.directory!);
        } catch (error: any) {
          console.error('Failed to show README preview:', error);
          vscode.window.showErrorMessage(`Failed to show README preview: ${error.message || error}`);
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
        
        try {
          if (!this.repositoryManager) {
            vscode.window.showErrorMessage('Repository manager not available');
            return;
          }
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Cloning repository for ${submissionGroup.course_content_title}...`,
            cancellable: false
          }, async () => {
            await this.repositoryManager!.autoSetupRepositories(courseId!);
          });

          this.treeDataProvider.refresh();
          vscode.window.showInformationMessage('Repository cloned/updated. Expand the assignment to see files.');
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to clone repository: ${error?.message || error}`);
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
          if (!this.repositoryManager) {
            vscode.window.showErrorMessage('Repository manager not available');
            return;
          }
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Cloning repository for ${submissionGroup.course_content_title}...`,
            cancellable: false
          }, async () => {
            await this.repositoryManager!.autoSetupRepositories(courseId);
          });
          this.treeDataProvider.refresh();
          vscode.window.showInformationMessage('Repository cloned/updated for the submission group.');
        } catch (error: any) {
          vscode.window.showErrorMessage(`Failed to clone repository: ${error?.message || error}`);
        }
      })
    );

    // Submit assignment
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.submitAssignment', async (itemOrSubmissionGroup: any, maybeCourse?: any) => {
        try {
          // Support invocation from tree item (preferred)
          let directory: string | undefined;
          let assignmentPath: string | undefined;
          let assignmentTitle: string | undefined;
          let submissionGroup: SubmissionGroupStudentList | undefined;

          if (itemOrSubmissionGroup?.courseContent) {
            const item = itemOrSubmissionGroup;
            directory = (item.courseContent as any)?.directory as string | undefined;
            {
              const pv: any = (item.courseContent as any)?.path;
              assignmentPath = pv == null ? undefined : String(pv);
            }
            {
              const tv: any = (item.courseContent as any)?.title;
              assignmentTitle = tv == null ? assignmentPath : String(tv);
            }
            submissionGroup = item.submissionGroup as SubmissionGroupStudentList | undefined;
          } else {
            // Backward compatibility with old signature
            submissionGroup = itemOrSubmissionGroup as SubmissionGroupStudentList | undefined;
            {
              const sv: any = submissionGroup?.course_content_path as any;
              assignmentPath = sv == null ? undefined : String(sv);
            }
            {
              const stv: any = submissionGroup?.course_content_title as any;
              assignmentTitle = stv == null ? assignmentPath : String(stv);
            }

            // Try to resolve directory via current course contents
            const courseId = CourseSelectionService.getInstance().getCurrentCourseId();
            if (courseId) {
              const contents = await this.apiService.getStudentCourseContents(courseId);
              if (this.repositoryManager) {
                this.repositoryManager.updateExistingRepositoryPaths(courseId, contents);
              }
              const match = contents.find(c => c.submission_group?.id === submissionGroup?.id);
              directory = (match as any)?.directory as string | undefined;
            }
          }

          if (!directory || !fs.existsSync(directory)) {
            vscode.window.showErrorMessage('Assignment directory not found. Please clone the repository first.');
            return;
          }
          if (!assignmentPath) {
            vscode.window.showErrorMessage('Assignment path is missing.');
            return;
          }

          const repoPath = await this.findRepoRoot(directory);
          if (!repoPath) {
            vscode.window.showErrorMessage('Could not determine repository root.');
            return;
          }

          // Ensure we are on the assignment branch
          const branchInfo = await this.gitBranchManager.checkAssignmentBranch(repoPath, assignmentPath);
          if (!branchInfo.isCurrent) {
            await this.gitBranchManager.switchToAssignmentBranch(repoPath, assignmentPath);
          }

          // Ask for commit message
          const commitMessage = await vscode.window.showInputBox({
            prompt: 'Enter commit message for submission',
            value: `Submit ${assignmentTitle}`
          });
          if (!commitMessage) return;

          // Commit and push
          await this.gitBranchManager.stageAll(repoPath);
          await this.gitBranchManager.commitChanges(repoPath, commitMessage);
          await this.gitBranchManager.pushAssignmentBranch(repoPath, assignmentPath);

          // Offer to create Merge Request
          const createMR = await vscode.window.showInformationMessage(
            'Assignment pushed. Create merge request?',
            'Yes',
            'No'
          );
          if (createMR === 'Yes') {
            await this.gitBranchManager.createMergeRequest(repoPath, assignmentPath);
          }

          vscode.window.showInformationMessage('Assignment submitted successfully.');
        } catch (error: any) {
          console.error('Failed to submit assignment:', error);
          vscode.window.showErrorMessage(`Failed to submit assignment: ${error?.message || error}`);
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

// Private helpers
export interface StudentCommands {
  openReadmeIfExists(dir: string, silent?: boolean): Promise<boolean>;
  findRepoRoot(startPath: string): Promise<string | undefined>;
}

StudentCommands.prototype.openReadmeIfExists = async function (dir: string, silent: boolean = false): Promise<boolean> {
  try {
    const readmePath = path.join(dir, 'README.md');
    if (fs.existsSync(readmePath)) {
      const readmeUri = vscode.Uri.file(readmePath);
      await vscode.commands.executeCommand('markdown.showPreview', readmeUri, vscode.ViewColumn.Two, { sideBySide: true });
      return true;
    }
    if (!silent) {
      vscode.window.showInformationMessage('No README.md found in this assignment');
    }
    return false;
  } catch (e) {
    console.error('openReadmeIfExists failed:', e);
    if (!silent) vscode.window.showErrorMessage('Failed to open README.md');
    return false;
  }
};

StudentCommands.prototype.findRepoRoot = async function (startPath: string): Promise<string | undefined> {
  try {
    let current = startPath;
    while (true) {
      const stat = fs.existsSync(current) ? fs.statSync(current) : undefined;
      const dir = stat && stat.isDirectory() ? current : path.dirname(current);
      const gitDir = path.join(dir, '.git');
      if (fs.existsSync(gitDir)) {
        return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      current = parent;
    }
    return undefined;
  } catch {
    return undefined;
  }
};
