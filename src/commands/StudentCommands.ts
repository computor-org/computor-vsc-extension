import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StudentCourseContentTreeProvider } from '../ui/tree/student/StudentCourseContentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitLabTokenManager } from '../services/GitLabTokenManager';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { GitBranchManager } from '../services/GitBranchManager';
import { GitWorktreeManager } from '../services/GitWorktreeManager';
import { CourseSelectionService } from '../services/CourseSelectionService';
import { SubmissionGroupStudent } from '../types/generated';

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
  private apiService: ComputorApiService;
  private gitLabTokenManager: GitLabTokenManager;
  private workspaceManager: WorkspaceManager;
  private gitBranchManager: GitBranchManager;

  constructor(
    context: vscode.ExtensionContext, 
    treeDataProvider: StudentCourseContentTreeProvider,
    apiService?: ComputorApiService
  ) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.workspaceManager = WorkspaceManager.getInstance(context);
    this.gitBranchManager = GitBranchManager.getInstance();
    void this.courseContentTreeProvider; // Unused for now
  }
  
  setCourseContentTreeProvider(provider: any): void {
    this.courseContentTreeProvider = provider;
  }

  registerCommands(): void {
    // Start work session - prompt for course and setup workspace
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.startWorkSession', async () => {
        await this.startWorkSession();
      })
    );
    
    // Refresh student view
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.refresh', () => {
        this.treeDataProvider.refresh();
      })
    );

    // View course details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.viewCourse', async (item: any) => {
        if (!item) {
          return;
        }

        try {
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
          } else {
            vscode.window.showErrorMessage('Course details not found');
          }
        } catch (error: any) {
          console.error('Failed to load course details:', error);
          const message = error?.response?.data?.message || error?.message || 'Unknown error';
          vscode.window.showErrorMessage(`Failed to load course details: ${message}`);
        }
      })
    );

    // Clone course repository
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.cloneCourseRepository', async (item: any) => {
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
      vscode.commands.registerCommand('computor.student.viewContent', async (item: any) => {
        if (!item) {
          return;
        }

        try {
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
          } else {
            vscode.window.showErrorMessage('Content details not found');
          }
        } catch (error: any) {
          console.error('Failed to load content details:', error);
          const message = error?.response?.data?.message || error?.message || 'Unknown error';
          vscode.window.showErrorMessage(`Failed to load content details: ${message}`);
        }
      })
    );

    // Start working on assignment (content with example)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.startAssignment', async (item: any) => {
        if (!item || !item.content.example_id) {
          vscode.window.showErrorMessage('This content does not have an assignment');
          return;
        }

        try {
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
        } catch (error: any) {
          console.error('Failed to start assignment:', error);
          const message = error?.response?.data?.message || error?.message || 'Unknown error';
          vscode.window.showErrorMessage(`Failed to start assignment: ${message}`);
        }
      })
    );

    // Open assignment directory in file explorer
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.openAssignment', async (item: any) => {
        if (!item) {
          return;
        }
        
        let targetPath: string | undefined;
        
        // Check if repository is cloned
        if (item.submissionGroup?.repository) {
          const repoPath = item.getRepositoryPath?.();
          if (repoPath && fs.existsSync(repoPath)) {
            targetPath = repoPath;
          }
        } else if (item.courseContent?.directory && fs.existsSync(item.courseContent.directory)) {
          targetPath = item.courseContent.directory;
        }
        
        if (targetPath) {
          // Update file explorer to show this directory
          await vscode.commands.executeCommand('computor.fileExplorer.goToWorkspace');
          
          // Open the first file in the directory if exists
          const files = fs.readdirSync(targetPath).filter(f => !f.startsWith('.'));
          if (files.length > 0 && files[0]) {
            const firstFile = path.join(targetPath, files[0]);
            if (fs.statSync(firstFile).isFile()) {
              await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(firstFile));
            }
          }
          
          vscode.window.showInformationMessage(`Assignment opened: ${path.basename(targetPath)}`);
        } else {
          vscode.window.showWarningMessage('Assignment directory not found. Please clone the repository first.');
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

    // Submit assignment - REMOVED: duplicate registration, see line 441 for the actual implementation
    // this.context.subscriptions.push(
    //   vscode.commands.registerCommand('computor.student.submitAssignment', async (item: any) => {
    //     if (!item || !item.content.example_id) {
    //       vscode.window.showErrorMessage('This content does not have an assignment');
    //       return;
    //     }

    //     // Here we would typically:
    //     // 1. Commit and push changes
    //     // 2. Create a merge request
    //     // 3. Notify the system of submission
        
    //     vscode.window.showInformationMessage(
    //       `Assignment submission functionality coming soon!`,
    //       'OK'
    //     );
    //   })
    // );

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
      vscode.commands.registerCommand('computor.student.selectAssignment', async (submissionGroup: SubmissionGroupStudent, course: CourseCommandData) => {
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
      vscode.commands.registerCommand('computor.student.submitAssignment', async (submissionGroup: SubmissionGroupStudent, course: CourseCommandData) => {
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
  
  /**
   * Start a new work session by selecting a course and setting up the workspace
   */
  private async startWorkSession(): Promise<void> {
    try {
      // Fetch available courses for the student
      const courses = await this.apiService.getStudentCourses();
      
      if (!courses || courses.length === 0) {
        vscode.window.showInformationMessage('No courses available');
        return;
      }
      
      // Prepare quick pick items
      const quickPickItems = courses.map(course => ({
        label: course.title,
        description: course.path,
        detail: `Organization: ${course.organization_id}`,
        course
      }));
      
      // Show course selection dropdown
      const selected = await vscode.window.showQuickPick(quickPickItems, {
        placeHolder: 'Select a course to work on',
        title: 'Course Selection',
        ignoreFocusOut: true
      });
      
      if (!selected) {
        return;
      }
      
      const course = selected.course;
      
      // Clone the student's repository
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Setting up workspace for ${course.title}...`,
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 10, message: 'Fetching course contents...' });
        
        // Fetch the student's course contents to get their repository information
        const courseContents = await this.apiService.getStudentCourseContents(course.id);
        
        if (!courseContents || courseContents.length === 0) {
          vscode.window.showErrorMessage('No course contents available');
          return;
        }
        
        progress.report({ increment: 10, message: 'Checking repository...' });
        
        // Find unique student repositories from submission groups
        const studentRepositories = new Map<string, any>();
        
        for (const content of courseContents) {
          if (content.submission_group?.repository) {
            const repo = content.submission_group.repository;
            if (repo.full_path) {
              // Use full_path as unique key to avoid duplicates
              studentRepositories.set(repo.full_path, repo);
            }
          }
        }
        
        if (studentRepositories.size === 0) {
          vscode.window.showErrorMessage('No student repository available. Please contact your instructor.');
          return;
        }
        
        // For now, use the first repository (later we might handle multiple repositories)
        const studentRepo = Array.from(studentRepositories.values())[0];
        
        if (studentRepositories.size > 1) {
          // Log a warning if there are multiple repositories
          console.warn(`Found ${studentRepositories.size} different student repositories for course ${course.id}. Using: ${studentRepo.full_path}`);
        }
        
        // Use the student's repository clone URL
        const cloneUrl = studentRepo.clone_url || 
          (studentRepo.full_path && studentRepo.url 
            ? `${studentRepo.url}/${studentRepo.full_path}.git`
            : undefined);
        
        if (!cloneUrl) {
          vscode.window.showErrorMessage('Student repository URL is incomplete');
          return;
        }
        
        // Get GitLab token
        const gitlabUrl = studentRepo.url || studentRepo.provider_url;
        const token = await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
        
        if (!token) {
          vscode.window.showErrorMessage('GitLab authentication required');
          return;
        }
        
        progress.report({ increment: 30, message: 'Cloning student repository...' });
        
        // Build authenticated URL
        const authenticatedUrl = this.gitLabTokenManager.buildAuthenticatedCloneUrl(cloneUrl, token);
        
        // Create workspace path
        const workspaceRoot = await this.workspaceManager.getWorkspaceRoot();
        
        // Check if repository already exists
        const gitWorktreeManager = GitWorktreeManager.getInstance();
        const repoExists = await gitWorktreeManager.sharedRepoExists(workspaceRoot, course.id);
        
        if (!repoExists) {
          // Clone the student's repository
          await gitWorktreeManager.cloneSharedRepository(
            workspaceRoot,
            course.id,
            cloneUrl,
            authenticatedUrl
          );
        }
        
        progress.report({ increment: 40, message: 'Setting up workspace...' });
        
        // Store current course info
        await this.context.globalState.update('selectedCourseId', course.id);
        await this.context.globalState.update('selectedCourseInfo', {
          id: course.id,
          title: course.title,
          path: course.path,
          organizationId: course.organization_id,
          courseFamilyId: course.course_family_id
        });
        
        progress.report({ increment: 10, message: 'Workspace ready!' });
        
        // Refresh the student tree view to show the new course content
        await vscode.commands.executeCommand('computor.student.refresh');
        
        // Show success message
        vscode.window.showInformationMessage(`Workspace ready for ${course.title}. Check the Student View to see your assignments.`);
      });
    } catch (error: any) {
      console.error('Failed to start work session:', error);
      const message = error?.message || 'Unknown error';
      vscode.window.showErrorMessage(`Failed to start work session: ${message}`);
    }
  }
}