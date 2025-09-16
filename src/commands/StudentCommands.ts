import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
// import * as os from 'os';
import { StudentCourseContentTreeProvider } from '../ui/tree/student/StudentCourseContentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitBranchManager } from '../services/GitBranchManager';
import { CourseSelectionService } from '../services/CourseSelectionService';
import { TestResultService } from '../services/TestResultService';
import { SubmissionGroupStudentList } from '../types/generated';
import { StudentRepositoryManager } from '../services/StudentRepositoryManager';
import { execAsync } from '../utils/exec';
import { GitLabTokenManager } from '../services/GitLabTokenManager';

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
  private gitlabTokenManager: GitLabTokenManager;

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
    this.gitlabTokenManager = GitLabTokenManager.getInstance(context);
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

          // Pre-check: warn if repository has uncommitted changes
          try {
            const dirty = await this.gitBranchManager.hasChanges(repoPath);
            if (dirty) {
              const choice = await vscode.window.showWarningMessage(
                'Repository has uncommitted changes. Submission will ignore your working directory and restore assignment files from origin/main into a separate submission branch.',
                'Proceed anyway',
                'Cancel'
              );
              if (choice !== 'Proceed anyway') {
                return;
              }
            }
          } catch {
            // If status fails, continue without blocking
          }

          // Auto-generate commit message (no prompt)
          const nowTs = new Date().toISOString().replace('T', ' ').split('.')[0];
          const commitMessage = `Submit ${assignmentTitle} - ${nowTs}`;

          // Perform submission using git worktree to keep main worktree on main branch
          let submissionOk = false;
          await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Submitting ${assignmentTitle}...`,
            cancellable: false
          }, async (progress) => {
            try {
              const relAssignmentPath = path.relative(repoPath, directory!);
              const assignmentId = String(itemOrSubmissionGroup?.courseContent?.id || submissionGroup?.id || assignmentPath);
              const submissionBranch = `submission-${assignmentId}`;

              progress.report({ message: 'Fetching origin/main...' });
              await execAsync('git fetch origin main', { cwd: repoPath });

              const tempRoot = path.join(require('os').tmpdir(), 'computor', 'submit');
              await fs.promises.mkdir(tempRoot, { recursive: true });
              const repoName = path.basename(repoPath);
              const time = Date.now().toString();
              const worktreePath = path.join(tempRoot, `${repoName}-${submissionBranch}-${time}`);

              const { stdout: lsRemote } = await execAsync(`git ls-remote --heads origin ${submissionBranch}`, { cwd: repoPath });
              const existsRemote = lsRemote.trim().length > 0;
              progress.report({ message: existsRemote ? 'Checking out submission branch...' : 'Creating submission branch...' });
              if (existsRemote) {
                await execAsync(`git worktree add "${worktreePath}" "${submissionBranch}"`, { cwd: repoPath });
              } else {
                await execAsync(`git worktree add "${worktreePath}" -b "${submissionBranch}" origin/main`, { cwd: repoPath });
              }

              // Clear worktree contents except .git
              progress.report({ message: 'Clearing worktree...' });
              const entries = await fs.promises.readdir(worktreePath, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.name === '.git') continue;
                await fs.promises.rm(path.join(worktreePath, entry.name), { recursive: true, force: true });
              }

              // Restore assignment folder from origin/main
              progress.report({ message: 'Restoring assignment files...' });
              await execAsync(`git checkout origin/main -- ${JSON.stringify(relAssignmentPath)}`, { cwd: worktreePath });

              // Stage and commit
              await execAsync(`git add ${JSON.stringify(relAssignmentPath)}`, { cwd: worktreePath });
              const { stdout: diffCheck } = await execAsync('git diff --cached --name-only', { cwd: worktreePath });
              if (diffCheck.trim().length > 0) {
                const commitDate = new Date().toISOString();
                progress.report({ message: 'Committing...' });
                await execAsync(`git commit -m ${JSON.stringify(`Submit ${assignmentId} at ${commitDate}`)}`, { cwd: worktreePath });
              } else {
                progress.report({ message: 'No changes to commit' });
              }

              // Push branch
              progress.report({ message: 'Pushing submission branch...' });
              try {
                await execAsync(`git push origin ${submissionBranch}`, { cwd: worktreePath });
              } catch {
                await execAsync(`git push -u origin ${submissionBranch}`, { cwd: worktreePath });
              }

              // Cleanup worktree
              progress.report({ message: 'Cleaning up...' });
              try {
                await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: repoPath });
              } catch {
                await fs.promises.rm(worktreePath, { recursive: true, force: true });
              }

              // Create MR via backend API
              const { stdout: originUrlStdout } = await execAsync('git remote get-url origin', { cwd: repoPath });
              const gitlabOrigin = (this as any).extractGitLabOrigin(originUrlStdout.trim());
              let token: string | undefined;
              if (gitlabOrigin) {
                token = await this.gitlabTokenManager.ensureTokenForUrl(gitlabOrigin);
              }
              if (!token) {
                vscode.window.showWarningMessage('No GitLab token available; cannot create MR automatically');
              } else {
                const mr = await this.apiService.submitStudentAssignment(String(itemOrSubmissionGroup?.courseContent?.id || ""), {
                  branch_name: submissionBranch,
                  gitlab_token: token,
                  title: `Submission: ${assignmentTitle}`,
                  description: commitMessage
                });
                if (mr?.web_url) {
                  submissionOk = true;
                  await vscode.env.openExternal(vscode.Uri.parse(mr.web_url));
                }
              }
            } catch (e) {
              throw e;
            }
          });
          if (submissionOk) {
            vscode.window.showInformationMessage('Assignment submitted successfully.');
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
        try {
          // Resolve submission group from tree item || direct arg
          const submissionGroup: SubmissionGroupStudentList | undefined = arg?.submissionGroup
            ? (arg.submissionGroup as SubmissionGroupStudentList)
            : (arg as SubmissionGroupStudentList);

          if (!submissionGroup) {
            vscode.window.showWarningMessage('No details available for this item');
            return;
          }

          const title = submissionGroup.course_content_title || 'Assignment';
          const pathStr = submissionGroup.course_content_path || '';
          const groupStr = `${submissionGroup.current_group_size || 0}/${submissionGroup.max_group_size || 1}`;
          const repoStr = submissionGroup.repository?.web_url || submissionGroup.repository?.full_path || 'No repository';
          const members = submissionGroup.members || [];
          const gradeVal = submissionGroup.latest_grading?.grading;
          const gradeStr = typeof gradeVal === 'number' ? `${Math.round(gradeVal * 100)}%` : 'Not graded yet';

          const info = [
            `• ${title}`,
            `• Path: ${pathStr}`,
            `• Group: ${groupStr}`,
            `• Repository: ${repoStr}`,
            members.length ? '• Members:' : undefined,
            ...members.map(m => `   - ${m.full_name || m.username}`),
            `• Latest Grade: ${gradeStr}`
          ].filter(Boolean).join('\n');

          vscode.window.showInformationMessage(info, { modal: true });
        } catch (e: any) {
          console.error('Failed to show submission group details:', e);
          vscode.window.showErrorMessage('Failed to show details');
        }
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
