import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { StudentCourseContentTreeProvider } from '../ui/tree/student/StudentCourseContentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { GitBranchManager } from '../services/GitBranchManager';
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
    this.workspaceManager = WorkspaceManager.getInstance(context);
    this.gitBranchManager = GitBranchManager.getInstance();
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

    // Clone course repository - collects all assignment repos
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.student.cloneCourseRepository', async (item: any) => {
        if (!item || !item.course) {
          vscode.window.showErrorMessage('No course selected');
          return;
        }

        const courseId = item.course.id;
        const courseTitle = item.course.title || item.course.path;
        
        try {
          // Fetch all course contents for this course
          const courseContents = await this.apiService.getStudentCourseContents(courseId);
          
          if (!courseContents || courseContents.length === 0) {
            vscode.window.showInformationMessage(`No course contents found for ${courseTitle}`);
            return;
          }

          for (const a of courseContents) {
            console.log("content: " + JSON.stringify(a,null,2) + "\n--------\n");
          }
          
          // Filter for assignments that have repositories
          const assignmentsWithRepos = courseContents.filter(content => {
            // Check if it's an assignment (has example_id or is marked as assignment)
            const isAssignment = content.course_content_type?.course_content_kind_id === 'assignment' || 
                                content.example_id;
            // Check if it has a submission group with repository
            const hasRepo = content.submission_group?.repository?.clone_url;
            return isAssignment && hasRepo;
          });
          
          if (assignmentsWithRepos.length === 0) {
            vscode.window.showInformationMessage(`No assignment repositories found for ${courseTitle}`);
            return;
          }
          
          // Collect unique repository URLs
          const repoMap = new Map<string, any>();
          for (const assignment of assignmentsWithRepos) {
            const repo = assignment.submission_group.repository;
            const cloneUrl = repo.clone_url;
            if (cloneUrl && !repoMap.has(cloneUrl)) {
              repoMap.set(cloneUrl, {
                url: cloneUrl,
                name: repo.name || repo.path || 'repository',
                fullPath: repo.full_path,
                assignment: assignment.title || assignment.path,
                contentPath: assignment.path
              });
            }
          }
          
          const uniqueRepos = Array.from(repoMap.values());
          
          // Show the user what will be cloned
          const repoList = uniqueRepos.map(repo => 
            `• ${repo.name} (${repo.assignment})`
          ).join('\n');
          
          const message = `Found ${uniqueRepos.length} repository${uniqueRepos.length > 1 ? 'ies' : ''} to clone for course "${courseTitle}":\n\n${repoList}`;
          
          await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'OK'
          );
          
          // For now, just show the information
          // TODO: Next step will be to actually clone these repositories
          console.log('Repositories to clone:', uniqueRepos);
          
        } catch (error: any) {
          console.error('Failed to fetch course contents:', error);
          const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
          vscode.window.showErrorMessage(`Failed to fetch assignment repositories: ${errorMessage}`);
        }
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
      vscode.commands.registerCommand('computor.student.syncAllRepositories', async (item?: any) => {
        try {
          // Extract course ID from tree item if provided
          let courseId: string | undefined;
          if (item?.course?.id) {
            courseId = item.course.id;
          } else if (typeof item === 'string') {
            courseId = item;
          }
          
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
                  // Use the courseId we have, or try to get it from the group
                  const groupCourseId = courseId || group.course_id;
                  if (!groupCourseId) {
                    console.error(`No course ID available for ${group.course_content_title}`);
                    continue;
                  }
                  await this.workspaceManager.cloneStudentRepository(groupCourseId, group);
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
}