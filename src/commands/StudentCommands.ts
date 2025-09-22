import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as os from 'os';
import { StudentCourseContentTreeProvider } from '../ui/tree/student/StudentCourseContentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitBranchManager } from '../services/GitBranchManager';
import { CourseSelectionService } from '../services/CourseSelectionService';
import { TestResultService } from '../services/TestResultService';
import { SubmissionGroupStudentList, SubmissionGroupStudentGet, MessageCreate, CourseContentStudentList, CourseContentTypeList, CourseSubmissionGroupGradingList, SubmissionGroupMemberBasic, ResultWithGrading, SubmissionUploadResponseModel } from '../types/generated';
import { StudentRepositoryManager } from '../services/StudentRepositoryManager';
import { execAsync } from '../utils/exec';
import { MessagesWebviewProvider, MessageTargetContext } from '../ui/webviews/MessagesWebviewProvider';
import { StudentCourseContentDetailsWebviewProvider, StudentContentDetailsViewState, StudentGradingHistoryEntry, StudentResultHistoryEntry } from '../ui/webviews/StudentCourseContentDetailsWebviewProvider';
import { getExampleVersionId } from '../utils/deploymentHelpers';

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
  private messagesWebviewProvider: MessagesWebviewProvider;
  private contentDetailsWebviewProvider: StudentCourseContentDetailsWebviewProvider;

  constructor(
    context: vscode.ExtensionContext, 
    treeDataProvider: StudentCourseContentTreeProvider,
    apiService?: ComputorApiService,
    repositoryManager?: StudentRepositoryManager
  ) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    // Use provided apiService || create a new one
    this.apiService = apiService || new ComputorApiService(context);
    // this.workspaceManager = WorkspaceManager.getInstance(context);
    this.repositoryManager = repositoryManager;
    this.gitBranchManager = GitBranchManager.getInstance();
    this.testResultService = TestResultService.getInstance();
    // Make sure TestResultService has the API service
    this.testResultService.setApiService(this.apiService);
    this.messagesWebviewProvider = new MessagesWebviewProvider(context, this.apiService);
    this.contentDetailsWebviewProvider = new StudentCourseContentDetailsWebviewProvider(context);
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

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.showMessages', async (item?: any) => {
        await this.showMessages(item);
      })
    );

    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.showTestResults', async (item?: any) => {
        try {
          let resultPayload: any | undefined;

          const courseContent = item?.courseContent as any;
          const result = courseContent?.result;
          if (result) {
            resultPayload = result.result_json ?? result;
          }

          if (resultPayload) {
            await vscode.commands.executeCommand('computor.results.open', resultPayload);
          }

          try {
            await vscode.commands.executeCommand('workbench.view.extension.computor-test-results');
          } catch (focusError) {
            console.warn('[StudentCommands] Failed to focus test results view container:', focusError);
          }

          try {
            await vscode.commands.executeCommand('computor.testResultsPanel.focus');
          } catch (panelError) {
            console.warn('[StudentCommands] Failed to focus test results panel:', panelError);
          }

          if (!resultPayload) {
            vscode.window.showInformationMessage('No stored test results yet. Run tests to generate new results.');
          }
        } catch (error) {
          console.error('[StudentCommands] Failed to show test results:', error);
          vscode.window.showErrorMessage('Failed to open test results. Please run tests again.');
        }
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
          let courseContentId: string | undefined;

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
            courseContentId = typeof item.courseContent?.id === 'string' ? item.courseContent.id : undefined;
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
              if (!courseContentId && match?.id) {
                courseContentId = String(match.id);
              }
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

          // Pre-check: warn if repository has uncommitted changes
          try {
            const dirty = await this.gitBranchManager.hasChanges(repoPath);
            if (dirty) {
              const choice = await vscode.window.showWarningMessage(
                'Repository has uncommitted changes. Submission will stage, commit, and push them automatically.',
                'Continue',
                'Cancel'
              );
              if (choice !== 'Continue') {
                return;
              }
            }
          } catch {
            // If status fails, continue without blocking
          }

          // Perform submission by ensuring latest work is committed and pushed
          let submissionOk = false;
          let submissionVersion: string | undefined;
          let submissionResponse: SubmissionUploadResponseModel | undefined;
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Submitting ${assignmentTitle}...`,
            cancellable: false
          }, async (progress) => {
            try {
              const assignmentId = String(itemOrSubmissionGroup?.courseContent?.id || submissionGroup?.id || assignmentPath);
              const commitLabel = assignmentTitle || assignmentPath || assignmentId;

              progress.report({ message: 'Staging changes...' });
              await execAsync('git add -A', { cwd: repoPath });

              const { stdout: stagedStdout } = await execAsync('git diff --cached --name-only', { cwd: repoPath });
              const stagedFiles = stagedStdout
                .split(/\r?\n/g)
                .map(line => line.trim())
                .filter(line => line.length > 0);

              if (stagedFiles.length > 0) {
                const commitDate = new Date().toISOString();
                const commitMessage = `Submit ${commitLabel} at ${commitDate}`;
                progress.report({ message: 'Committing changes...' });
                await execAsync(`git commit -m ${JSON.stringify(commitMessage)}`, { cwd: repoPath });
              } else {
                progress.report({ message: 'No new changes detected; using latest commit.' });
              }

              const { stdout: branchStdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath });
              const currentBranch = branchStdout.trim();
              if (!currentBranch) {
                throw new Error('Could not determine current branch.');
              }

              progress.report({ message: `Pushing ${currentBranch}...` });
              try {
                await execAsync(`git push origin ${JSON.stringify(currentBranch)}`, { cwd: repoPath });
              } catch (pushError) {
                try {
                  await execAsync(`git push -u origin ${JSON.stringify(currentBranch)}`, { cwd: repoPath });
                } catch (secondaryPushError) {
                  throw pushError instanceof Error ? pushError : secondaryPushError;
                }
              }

              const { stdout: headStdout } = await execAsync('git rev-parse HEAD', { cwd: repoPath });
              submissionVersion = headStdout.trim();

              if (!submissionGroup?.id) {
                throw new Error('Submission group information missing; cannot create submission record.');
              }

              progress.report({ message: 'Creating submission...' });
              submissionResponse = await this.apiService.createStudentSubmission({
                course_submission_group_id: String(submissionGroup.id),
                version_identifier: submissionVersion || undefined
              });

              if (!submissionResponse) {
                throw new Error('Submission API did not return a response.');
              }

              submissionOk = true;
            } catch (e) {
              throw e;
            }
          });
          if (submissionOk) {
            try {
              if (courseContentId) {
                await this.treeDataProvider.refreshContentItem(courseContentId);
              } else {
                this.treeDataProvider.refresh();
              }
            } catch (refreshError) {
              console.warn('[StudentCommands] Failed to refresh course content after submission:', refreshError);
            }

            const actions: string[] = [];
            if (submissionResponse?.result_id) {
              actions.push('Copy Result ID');
            }

            const successMessage = submissionResponse?.version_identifier
              ? `Assignment submitted successfully (version ${submissionResponse.version_identifier}).`
              : 'Assignment submitted successfully.';

            const action = await vscode.window.showInformationMessage(successMessage, ...actions);
            if (action === 'Copy Result ID' && submissionResponse?.result_id) {
              try {
                await vscode.env.clipboard.writeText(submissionResponse.result_id);
                vscode.window.showInformationMessage('Submission result ID copied to clipboard.');
              } catch (clipError) {
                console.warn('[StudentCommands] Failed to copy result ID:', clipError);
              }
            }
          }
        } catch (error: any) {
          console.error('Failed to submit assignment:', error);
          vscode.window.showErrorMessage(`Failed to submit assignment: ${error?.message || error}`);
        }
      })
    );

    // View submission group details (accepts tree item || raw submission group)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.viewSubmissionGroup', async (arg: any) => {
        await this.showContentDetails(arg);
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

            // Find repository root
            const repoPath = await this.findRepoRoot(directory);
            if (!repoPath) {
              throw new Error('Could not determine repository root');
            }

            // Ensure we're on the main branch
            const currentBranch = await this.gitBranchManager.getCurrentBranch(repoPath);
            const mainBranch = await this.gitBranchManager.getMainBranch(repoPath);
            
            if (currentBranch !== mainBranch) {
              progress.report({ increment: 20, message: `Switching to ${mainBranch} branch...` });
              await this.gitBranchManager.checkoutBranch(repoPath, mainBranch);
            }

            progress.report({ increment: 40, message: 'Committing changes...' });
            // Stage only the assignment directory
            const relAssignmentPath = path.relative(repoPath, directory);
            await execAsync(`git add ${JSON.stringify(relAssignmentPath)}`, { cwd: repoPath });
            
            // Commit only if something is staged
            const { stdout: staged } = await execAsync('git diff --cached --name-only', { cwd: repoPath });
            if (staged.trim().length === 0) {
              throw new Error('No changes to commit in the assignment folder');
            }
            await execAsync(`git commit -m ${JSON.stringify(commitMessage)}`, { cwd: repoPath });

            progress.report({ increment: 60, message: 'Pushing to remote...' });
            // Push to main branch
            await this.gitBranchManager.pushCurrentBranch(repoPath);

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
          // Always show a single progress for the entire test flow
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Testing ${assignmentTitle}...`,
            cancellable: true
          }, async (progress, token) => {
            // Check if there are any changes to commit
            const hasChanges = await this.gitBranchManager.hasChanges(directory);
            let commitHash: string | null = null;

            if (hasChanges) {
              progress.report({ message: 'Checking branch...' });
              const currentBranch = await this.gitBranchManager.getCurrentBranch(directory);
              const mainBranch = await this.gitBranchManager.getMainBranch(directory);
              if (currentBranch !== mainBranch) {
                progress.report({ message: `Switching to ${mainBranch} branch...` });
                await this.gitBranchManager.checkoutBranch(directory, mainBranch);
              }

              progress.report({ message: 'Committing changes...' });
              await this.gitBranchManager.stageAll(directory);
              const now = new Date();
              const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
              const commitMessage = `Update ${assignmentTitle} - ${timestamp}`;
              await this.gitBranchManager.commitChanges(directory, commitMessage);

              progress.report({ message: 'Pushing to remote...' });
              await this.gitBranchManager.pushCurrentBranch(directory);
              progress.report({ message: 'Getting commit hash...' });
              commitHash = await this.gitBranchManager.getLatestCommitHash(directory);
            } else {
              // No changes: get current commit hash
              commitHash = await this.gitBranchManager.getLatestCommitHash(directory);
            }

            if (commitHash && item.courseContent.id) {
              // Submit test and reuse the same progress indicator for polling
              await this.testResultService.submitTestAndAwaitResults(
                item.courseContent.id,
                commitHash,
                assignmentTitle,
                false,
                { progress, token, showProgress: false }
              );
            } else {
              vscode.window.showWarningMessage('Could not determine commit hash or content ID for testing');
            }
          });

          // Refresh just this course content from API after results
          await this.treeDataProvider.refreshContentItem(item.courseContent.id);
        } catch (error: any) {
          console.error('Failed to test assignment:', error);
          vscode.window.showErrorMessage(`Failed to test assignment: ${error.message}`);
        }
      })
    );
  }

  private async showMessages(item?: any): Promise<void> {
    try {
      const courseSelection = CourseSelectionService.getInstance();
      const courseInfo = courseSelection.getCurrentCourseInfo();
      const courseId = courseSelection.getCurrentCourseId();
      if (!courseId) {
        vscode.window.showWarningMessage('No course selected.');
        return;
      }

      let target: MessageTargetContext | undefined;

      const content = item?.courseContent as any;
      if (content && typeof content.id === 'string') {
        const submissionGroup = item?.submissionGroup as SubmissionGroupStudentList | undefined;
        const contentTitle: string = content.title || content.path || 'Course content';
        const courseLabel = courseInfo?.title || courseInfo?.path || 'Course';
        const subtitle = courseLabel ? `${courseLabel} › ${content.path || contentTitle}` : undefined;
        const query: Record<string, string> = {
          course_id: content.course_id || courseId,
          course_content_id: content.id
        };
        const createPayload: Partial<MessageCreate> = {
          course_id: content.course_id || courseId,
          course_content_id: content.id
        };

        if (submissionGroup?.id) {
          query.course_submission_group_id = submissionGroup.id;
          createPayload.course_submission_group_id = submissionGroup.id;
        }

        target = {
          title: contentTitle,
          subtitle,
          query,
          createPayload,
          sourceRole: 'student'
        } satisfies MessageTargetContext;
      }

      if (!target) {
        const courseLabel = courseInfo?.title || courseInfo?.path || 'Course messages';
        const subtitle = courseInfo?.path ? `Course • ${courseInfo.path}` : undefined;
        target = {
          title: courseLabel,
          subtitle,
          query: { course_id: courseId },
          createPayload: { course_id: courseId },
          sourceRole: 'student'
        } satisfies MessageTargetContext;
      }

      await this.messagesWebviewProvider.showMessages(target);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open messages: ${error?.message || error}`);
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

  private async showContentDetails(arg: any): Promise<void> {
    try {
      const courseSelection = CourseSelectionService.getInstance();
      const courseInfo = courseSelection.getCurrentCourseInfo();
      const currentCourseId = courseSelection.getCurrentCourseId();

      let courseContentSummary: CourseContentStudentList | undefined;
      let submissionGroupSummary: SubmissionGroupStudentList | undefined;
      let contentType: CourseContentTypeList | undefined;
      let localPath: string | undefined;
      let isCloned = false;

      if (arg && typeof arg === 'object') {
        if ('courseContent' in arg) {
          courseContentSummary = arg.courseContent as CourseContentStudentList;
          contentType = arg.contentType as CourseContentTypeList | undefined;
          submissionGroupSummary = arg.submissionGroup as SubmissionGroupStudentList | undefined;
          if (typeof arg.getRepositoryPath === 'function') {
            const repoPath = arg.getRepositoryPath();
            if (repoPath) {
              localPath = repoPath;
              isCloned = fs.existsSync(repoPath);
            }
          }
        } else if ('id' in arg && 'course_content_path' in arg) {
          submissionGroupSummary = arg as SubmissionGroupStudentList;
        } else if ('id' in arg && 'course_content_type_id' in arg) {
          courseContentSummary = arg as CourseContentStudentList;
        }
      }

      if (!courseContentSummary && submissionGroupSummary) {
        const courseContentId = (submissionGroupSummary as any).course_content_id as string | undefined;
        if (courseContentId) {
          courseContentSummary = await this.apiService.getStudentCourseContent(courseContentId, { force: true });
        }
      }

      if (!courseContentSummary && submissionGroupSummary && currentCourseId) {
        const contents = await this.apiService.getStudentCourseContents(currentCourseId, { force: false }) || [];
        courseContentSummary = contents.find(content => {
          const group = content.submission_group as SubmissionGroupStudentList | undefined;
          return group?.id === submissionGroupSummary?.id
            || group?.course_content_path === submissionGroupSummary?.course_content_path
            || content.id === (submissionGroupSummary as any)?.course_content_id;
        });
      }

      if (!courseContentSummary) {
        vscode.window.showWarningMessage('No detailed information available for this content yet.');
        return;
      }

      const courseContentDetails = await this.apiService.getStudentCourseContentDetails(courseContentSummary.id, { force: true });
      const courseContent = courseContentDetails ?? courseContentSummary;

      if (!submissionGroupSummary) {
        submissionGroupSummary = courseContentSummary.submission_group as SubmissionGroupStudentList | undefined;
      }

      const submissionGroupDetails = courseContentDetails?.submission_group as SubmissionGroupStudentGet | undefined;
      const submissionGroupCombined: SubmissionGroupStudentGet | SubmissionGroupStudentList | undefined = submissionGroupDetails ?? submissionGroupSummary;

      if (!contentType && (courseContent as any).course_content_type) {
        contentType = (courseContent as any).course_content_type as CourseContentTypeList;
      }

      if (!localPath) {
        localPath = this.resolveLocalRepositoryPath(courseContentSummary, submissionGroupSummary);
        if (localPath) {
          isCloned = fs.existsSync(localPath);
        }
      }

      const repo = submissionGroupCombined?.repository as any;

      const resultsHistoryRaw = await this.apiService.getStudentCourseContentResults(courseContent.id, {
        submissionGroupId: submissionGroupCombined?.id ?? undefined,
        limit: 20,
        force: true
      });
      const resultsHistory = this.buildResultHistory(resultsHistoryRaw);

      const gradingHistory = this.buildGradingHistory(submissionGroupDetails?.gradings);
      const latestGrading = (submissionGroupDetails as any)?.latest_grading ?? (submissionGroupSummary as any)?.latest_grading;
      let latestHistoryEntry = gradingHistory[0];

      const fallbackGradingValue = this.normalizeGradeValue(latestGrading?.grading ?? submissionGroupCombined?.grading);
      const candidateStatus = this.mapGradingStatus(latestGrading?.status) || submissionGroupCombined?.status || 'unknown';
      const candidateGrader = this.formatGraderName((latestGrading as any)?.graded_by_course_member, latestGrading?.graded_by);
      const candidateGradedAt = latestGrading?.updated_at || latestGrading?.created_at || null;
      const candidateFeedback = (typeof latestGrading?.feedback === 'string' ? latestGrading.feedback : undefined)
        || (submissionGroupCombined as any)?.latest_grading_feedback
        || (submissionGroupCombined as any)?.feedback
        || null;

      if (!latestHistoryEntry && (fallbackGradingValue !== null || latestGrading)) {
        const fallbackEntry: StudentGradingHistoryEntry = {
          id: latestGrading?.id ? String(latestGrading.id) : `${courseContent.id}-latest-grading`,
          gradePercent: fallbackGradingValue !== null ? fallbackGradingValue * 100 : null,
          rawGrade: fallbackGradingValue,
          status: candidateStatus,
          feedback: candidateFeedback,
          gradedAt: candidateGradedAt || undefined,
          graderName: candidateGrader || undefined
        };
        gradingHistory.unshift(fallbackEntry);
        latestHistoryEntry = fallbackEntry;
      }

      const gradingValue = latestHistoryEntry?.rawGrade ?? fallbackGradingValue;
      const gradeStatus = latestHistoryEntry?.status || candidateStatus || null;
      const gradedByDisplay = latestHistoryEntry?.graderName || candidateGrader || null;
      const gradedAtValue = latestHistoryEntry?.gradedAt || candidateGradedAt || null;
      const feedbackValue = latestHistoryEntry?.feedback ?? candidateFeedback;

      const resultValue = typeof courseContent.result?.result === 'number' ? courseContent.result.result : null;

      const members: SubmissionGroupMemberBasic[] = (submissionGroupCombined?.members as SubmissionGroupMemberBasic[] | undefined) ?? [];

      const viewState: StudentContentDetailsViewState = {
        course: courseInfo,
        content: courseContent,
        contentType,
        submissionGroup: submissionGroupCombined ?? null,
        repository: {
          hasRepository: Boolean(repo),
          fullPath: repo?.full_path || repo?.url || repo?.web_url,
          cloneUrl: repo?.clone_url,
          webUrl: repo?.web_url,
          localPath,
          isCloned
        },
        metrics: {
          testsRun: typeof courseContent.result_count === 'number' ? courseContent.result_count : undefined,
          maxTests: courseContent.max_test_runs ?? null,
          submissions: submissionGroupCombined?.count ?? null,
          maxSubmissions: submissionGroupCombined?.max_submissions ?? null,
          submitted: courseContent.submitted ?? null,
          resultPercent: resultValue !== null ? resultValue * 100 : null,
          gradePercent: gradingValue !== null ? gradingValue * 100 : null,
          gradeStatus,
          gradedBy: gradedByDisplay,
          gradedAt: gradedAtValue,
          status: submissionGroupCombined?.status || null,
          feedback: feedbackValue
        },
        team: {
          maxSize: submissionGroupCombined?.max_group_size ?? null,
          currentSize: submissionGroupCombined?.current_group_size ?? null,
          members: members.map((member) => ({
            id: member.course_member_id || member.id,
            name: member.full_name || member.username,
            username: member.username || null
          }))
        },
        example: {
          identifier: submissionGroupCombined?.example_identifier || null,
          versionId: getExampleVersionId(courseContentSummary)
        },
        actions: {
          localPath,
          webUrl: repo?.web_url,
          cloneUrl: repo?.clone_url
        },
        gradingHistory,
        resultsHistory
      };

      await this.contentDetailsWebviewProvider.showDetails(viewState);
    } catch (error: any) {
      console.error('Failed to show course content details:', error);
      vscode.window.showErrorMessage(`Failed to open details: ${error?.message || error}`);
    }
  }
  
  private buildResultHistory(entries: ResultWithGrading[] | undefined | null): StudentResultHistoryEntry[] {
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const sorted = [...entries].sort((a, b) => {
      const aTime = Date.parse(a.created_at ?? '') || 0;
      const bTime = Date.parse(b.created_at ?? '') || 0;
      return bTime - aTime;
    });

    return sorted.map((entry) => this.createResultHistoryEntry(entry));
  }

  private createResultHistoryEntry(entry: ResultWithGrading): StudentResultHistoryEntry {
    const normalizedResult = this.normalizeGradeValue(entry.result);

    return {
      id: entry.id,
      resultPercent: normalizedResult !== null ? normalizedResult * 100 : null,
      rawResult: normalizedResult,
      status: entry.status ?? null,
      submit: typeof entry.submit === 'boolean' ? entry.submit : null,
      createdAt: entry.created_at ?? null,
      updatedAt: entry.updated_at ?? null,
      versionIdentifier: entry.version_identifier ?? null,
      testSystemId: entry.test_system_id ?? null
    } satisfies StudentResultHistoryEntry;
  }


  private buildGradingHistory(entries: unknown): StudentGradingHistoryEntry[] {
    let normalized: CourseSubmissionGroupGradingList[] = [];

    if (Array.isArray(entries)) {
      normalized = entries.filter((entry): entry is CourseSubmissionGroupGradingList => Boolean(entry));
    } else if (entries && typeof entries === 'object') {
      const maybeItems = (entries as any).items;
      if (Array.isArray(maybeItems)) {
        normalized = maybeItems.filter((entry: any): entry is CourseSubmissionGroupGradingList => Boolean(entry));
      } else {
        normalized = Object.values(entries as Record<string, CourseSubmissionGroupGradingList>)
          .filter((entry): entry is CourseSubmissionGroupGradingList => Boolean(entry));
      }
    }

    if (normalized.length === 0) {
      return [];
    }

    const sorted = [...normalized].sort((a, b) => {
      const aTime = Date.parse(a.created_at ?? '') || 0;
      const bTime = Date.parse(b.created_at ?? '') || 0;
      return bTime - aTime;
    });

    return sorted.map((entry) => this.createHistoryEntry(entry));
  }

  private createHistoryEntry(entry: CourseSubmissionGroupGradingList): StudentGradingHistoryEntry {
    const grade = this.normalizeGradeValue(entry.grading);
    const graderName = this.formatGraderName(entry.graded_by_course_member as any, entry.graded_by_course_member_id);
    const status = this.mapGradingStatus(entry.status) || 'unknown';

    return {
      id: entry.id,
      gradePercent: grade !== null ? grade * 100 : null,
      rawGrade: grade,
      status,
      feedback: entry.feedback ?? null,
      gradedAt: entry.created_at || undefined,
      graderName: graderName || undefined
    } satisfies StudentGradingHistoryEntry;
  }

  private normalizeGradeValue(value: unknown): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
      return null;
    }
    if (numeric > 1) {
      return numeric / 100;
    }
    if (numeric < 0) {
      return 0;
    }
    return numeric;
  }

  private formatGraderName(
    gradedByCourseMember?: { user?: { given_name?: string | null; family_name?: string | null }; user_id?: string | null },
    fallback?: string | null
  ): string | null {
    const user = gradedByCourseMember?.user;
    const parts: string[] = [];

    if (user) {
      const given = typeof user.given_name === 'string' ? user.given_name.trim() : '';
      const family = typeof user.family_name === 'string' ? user.family_name.trim() : '';
      if (given) {
        parts.push(given);
      }
      if (family) {
        parts.push(family);
      }
    }

    if (parts.length > 0) {
      return parts.join(' ');
    }

    const userId = gradedByCourseMember?.user_id?.trim();
    if (userId) {
      return userId;
    }

    const fallbackId = typeof fallback === 'string' ? fallback.trim() : '';
    return fallbackId || null;
  }

  private mapGradingStatus(value: unknown): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }
    const map: Record<string, string> = {
      '0': 'pending',
      '1': 'correction_necessary',
      '2': 'improvement_possible',
      '3': 'corrected'
    };
    const key = String(value);
    return map[key] || key;
  }




  private resolveLocalRepositoryPath(
    courseContent: CourseContentStudentList,
    submissionGroup?: SubmissionGroupStudentList
  ): string | undefined {
    const directory = (courseContent as any)?.directory as string | undefined;
    if (!directory) {
      return undefined;
    }

    if (path.isAbsolute(directory)) {
      return directory;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
      return undefined;
    }

    const repo = submissionGroup?.repository as any;
    let repoName: string | undefined;
    if (repo) {
      if (typeof repo.full_path === 'string' && repo.full_path.length > 0) {
        const parts = repo.full_path.split('/');
        repoName = parts[parts.length - 1] || undefined;
      } else if (typeof repo.clone_url === 'string' && repo.clone_url.length > 0) {
        const clean = repo.clone_url.replace(/\.git$/, '');
        const parts = clean.split('/');
        repoName = parts[parts.length - 1] || undefined;
      } else if (typeof repo.web_url === 'string' && repo.web_url.length > 0) {
        const parts = repo.web_url.split('/');
        repoName = parts[parts.length - 1] || undefined;
      }
    }

    if (repoName) {
      return path.join(workspaceRoot, repoName, directory);
    }

    return path.join(workspaceRoot, directory);
  }
}

// Private helpers
export interface StudentCommands {
  openReadmeIfExists(dir: string, silent?: boolean): Promise<boolean>;
  findRepoRoot(startPath: string): Promise<string | undefined>;
  copyDirectory(src: string, dest: string): Promise<void>;
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

// Extract GitLab origin (protocol + host) from a git remote URL
(StudentCommands.prototype as any).extractGitLabOrigin = function(remote: string): string | undefined {
  try {
    if (remote.startsWith('http://') || remote.startsWith('https://')) {
      const u = new URL(remote);
      return `${u.protocol}//${u.host}`;
    }
    // git@host:group/repo.git
    if (remote.startsWith('git@')) {
      const at = remote.indexOf('@');
      const colon = remote.indexOf(':');
      if (at !== -1 && colon !== -1 && colon > at) {
        const host = remote.substring(at + 1, colon);
        return `https://${host}`;
      }
    }
  } catch {}
  try {
    const u = new URL(remote);
    return `${u.protocol}//${u.host}`;
  } catch {}
  return undefined;
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

StudentCommands.prototype.copyDirectory = async function (src: string, dest: string): Promise<void> {
  const stat = await fs.promises.stat(src);
  if (!stat.isDirectory()) {
    throw new Error('Source is not a directory');
  }
  await fs.promises.rm(dest, { recursive: true, force: true });
  await fs.promises.mkdir(dest, { recursive: true });

  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await this.copyDirectory(s, d);
    } else if (entry.isFile()) {
      await fs.promises.copyFile(s, d);
    }
  }
};
