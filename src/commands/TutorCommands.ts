import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TutorTreeDataProvider, TutorCourseTreeItem, TutorExampleRepositoryTreeItem, TutorExampleTreeItem } from '../ui/tree/tutor/TutorTreeDataProvider';
import { TutorStudentTreeProvider } from '../ui/tree/tutor/TutorStudentTreeProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { TutorSelectionService } from '../services/TutorSelectionService';
import simpleGit from 'simple-git';
// Import interfaces from generated types (interfaces removed to avoid duplication)

export class TutorCommands {
  private context: vscode.ExtensionContext;
  private treeDataProvider: TutorTreeDataProvider | TutorStudentTreeProvider;
  private apiService: ComputorApiService;
  private workspaceManager: WorkspaceManager;

  constructor(
    context: vscode.ExtensionContext, 
    treeDataProvider: TutorTreeDataProvider | TutorStudentTreeProvider,
    apiService?: ComputorApiService
  ) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
    this.workspaceManager = WorkspaceManager.getInstance(context);
  }

  registerCommands(): void {
    // Refresh tutor view
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.refresh', () => {
        this.treeDataProvider.refresh();
      })
    );

    // View course details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.viewCourse', async (item: TutorCourseTreeItem) => {
        if (!item) {
          return;
        }

        const course = item.course;
        const info = [
          `**Course: ${course.title}**`,
          '',
          `ID: ${course.id}`,
          `Path: ${course.path}`,
          `Organization: ${course.organization_id}`,
          course.repository ? `Repository: ${course.repository.provider_url}/${course.repository.full_path}` : 'No repository assigned'
        ].join('\n');

        vscode.window.showInformationMessage(info, { modal: true });
      })
    );

    // View repository details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.viewRepository', async (item: TutorExampleRepositoryTreeItem) => {
        if (!item) {
          return;
        }

        const repo = item.repository;
        const info = [
          `**Repository: ${repo.name}**`,
          '',
          `ID: ${repo.id}`,
          `Type: ${repo.source_type}`,
          `URL: ${repo.source_url}`,
          repo.description ? `Description: ${repo.description}` : ''
        ].filter(line => line).join('\n');

        vscode.window.showInformationMessage(info, { modal: true });
      })
    );

    // View example details
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.viewExample', async (item: TutorExampleTreeItem) => {
        if (!item) {
          return;
        }

        const example = item.example;
        const info = [
          `**Example: ${example.title}**`,
          '',
          `ID: ${example.id}`,
          `Identifier: ${example.identifier}`,
          `Directory: ${example.directory}`,
          example.subject ? `Subject: ${example.subject}` : '',
          example.category ? `Category: ${example.category}` : '',
          example.tags.length > 0 ? `Tags: ${example.tags.join(', ')}` : ''
        ].filter(line => line).join('\n');

        vscode.window.showInformationMessage(info, { modal: true });
      })
    );

    // Download example (latest version)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.downloadExample', async (item: TutorExampleTreeItem) => {
        if (!item) {
          return;
        }

        await this.downloadExample(item, false);
      })
    );

    // Download example with dependencies
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.downloadExampleWithDependencies', async (item: TutorExampleTreeItem) => {
        if (!item) {
          return;
        }

        await this.downloadExample(item, true);
      })
    );

    // Open example in browser (if GitLab/GitHub)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.openExampleInBrowser', async (item: TutorExampleTreeItem) => {
        if (!item || item.repository.source_type !== 'git') {
          vscode.window.showErrorMessage('Browser viewing is only available for Git repositories');
          return;
        }

        // Construct URL based on repository URL and example directory
        const baseUrl = item.repository.source_url;
        let webUrl = baseUrl;
        
        // Convert Git URL to web URL if necessary
        if (baseUrl.endsWith('.git')) {
          webUrl = baseUrl.slice(0, -4);
        }
        
        // Add path to specific example directory
        webUrl = `${webUrl}/tree/main/${item.example.directory}`;
        
        vscode.env.openExternal(vscode.Uri.parse(webUrl));
      })
    );

    // Setup tutor workspace for course
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.setupWorkspace', async (item: TutorCourseTreeItem) => {
        if (!item) {
          return;
        }

        await this.setupTutorWorkspace(item.course);
      })
    );

    // Bulk download all examples from repository
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.downloadAllExamples', async (item: TutorExampleRepositoryTreeItem) => {
        if (!item) {
          return;
        }

        await this.downloadAllExamples(item);
      })
    );

    // Tutor: Clone student repository (scaffold)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.cloneStudentRepository', async (item: any) => {
        try {
          // Prefer repository information from the clicked assignment's submission_group
          const content: any = item?.content || item?.courseContent || item;
          const contentCourseId: string | undefined = content?.course_id;
          const submissionRepo = content?.submission_group?.repository;

          const sel = TutorSelectionService.getInstance();
          let courseId = contentCourseId || sel.getCurrentCourseId() || '';
          let memberId = sel.getCurrentMemberId() || '';
          if (!courseId || !memberId) {
            // Fallback prompts only if selection is missing
            if (!courseId) courseId = (await vscode.window.showInputBox({ title: 'Course ID', prompt: 'Enter course ID', ignoreFocusOut: true })) || '';
            if (!memberId) memberId = (await vscode.window.showInputBox({ title: 'Course Member ID', prompt: 'Enter course member ID', ignoreFocusOut: true })) || '';
          }
          if (!courseId || !memberId) { return; }

          // Build remote URL: prefer clone_url, fallback to url/web_url
          let remoteUrl: string | undefined = submissionRepo?.clone_url || submissionRepo?.url || submissionRepo?.web_url;
          if (!remoteUrl) {
            // Try backend member repository endpoint
            const repoMeta = await this.apiService.getTutorStudentRepository(courseId, memberId);
            remoteUrl = repoMeta?.remote_url;
          }
          if (!remoteUrl) {
            // Last resort: ask the user
            remoteUrl = await vscode.window.showInputBox({ title: 'Student Repo URL', prompt: 'Enter remote URL', ignoreFocusOut: true }) || undefined;
          }
          if (!remoteUrl) { return; }

          const dir = await this.workspaceManager.registerTutorStudentRepository(courseId, memberId, remoteUrl);
          // Git clone into the student workspace path if empty
          const exists = await fs.promises.readdir(dir).then(list => list.length > 0).catch(() => false);
          if (exists) {
            vscode.window.showWarningMessage(`Directory not empty: ${dir}. Skipping clone.`);
          } else {
            await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Cloning student repository...', cancellable: false }, async () => {
              await simpleGit().clone(remoteUrl!, dir);
            });
            vscode.window.showInformationMessage(`Student repository cloned to ${dir}`);
          }
          // Optionally add to workspace
          const folders = vscode.workspace.workspaceFolders || [];
          if (!folders.some(f => f.uri.fsPath === dir)) {
            vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri: vscode.Uri.file(dir), name: `Student ${memberId}` });
          }
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to clone student repository: ${e?.message || e}`);
        }
      })
    );

    // Tutor: Checkout assignment submission into workspace root (scaffold)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.checkoutAssignment', async (_item: any) => {
        try {
          const sel = TutorSelectionService.getInstance();
          const courseId = sel.getCurrentCourseId() || (await vscode.window.showInputBox({ title: 'Course ID', prompt: 'Enter course ID', ignoreFocusOut: true })) || '';
          const memberId = sel.getCurrentMemberId() || (await vscode.window.showInputBox({ title: 'Course Member ID', prompt: 'Enter course member ID', ignoreFocusOut: true })) || '';
          if (!courseId || !memberId) return;
          const repoPath = await this.workspaceManager.getTutorStudentWorkspacePath(courseId, memberId);
          const git = simpleGit(repoPath);
          await git.fetch();
          const inferredBranch = await this.apiService.getTutorSubmissionBranch(courseId, memberId, _item?.id || '');
          const branch = inferredBranch || await vscode.window.showInputBox({ title: 'Submission Branch', prompt: 'Enter submission branch to checkout', value: 'main', ignoreFocusOut: true });
          if (!branch) return;
          await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Checking out ${branch}...`, cancellable: false }, async () => {
            await git.checkout(branch);
          });
          const src = await vscode.window.showInputBox({ title: 'Assignment Path', prompt: 'Relative path in repo to copy', ignoreFocusOut: true });
          const dest = await vscode.window.showInputBox({ title: 'Destination Path', prompt: 'Destination directory (workspace root)', value: (vscode.workspace.workspaceFolders?.[0]?.uri.fsPath) || '', ignoreFocusOut: true });
          if (!src || !dest) return;
          const absSrc = path.isAbsolute(src) ? src : path.join(repoPath, src);
          await fs.promises.mkdir(dest, { recursive: true });
          await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Checking out assignment...', cancellable: false }, async () => {
            // Shallow copy directory (simple implementation)
            const copy = async (s: string, d: string) => {
              const entries = await fs.promises.readdir(s, { withFileTypes: true });
              for (const e of entries) {
                const sp = path.join(s, e.name);
                const dp = path.join(d, e.name);
                if (e.isDirectory()) { await fs.promises.mkdir(dp, { recursive: true }); await copy(sp, dp); }
                else if (e.isFile()) { await fs.promises.copyFile(sp, dp); }
              }
            };
            await copy(absSrc, dest);
          });
          vscode.window.showInformationMessage('Assignment checked out to workspace.');
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to checkout assignment: ${e?.message || e}`);
        }
      })
    );

    // Tutor: Download example for comparison (scaffold)
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.tutor.downloadStudentExample', async (_item: any) => {
        try {
          // TODO: Implement endpoint to download example matching assignment for comparison
          vscode.window.showInformationMessage('Download Example: backend route TBD.');
        } catch (e: any) {
          vscode.window.showErrorMessage(`Failed to download example: ${e?.message || e}`);
        }
      })
    );
  }

  private async downloadExample(item: TutorExampleTreeItem, withDependencies: boolean): Promise<void> {
    const example = item.example;
    const course = item.course;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Downloading example "${example.title}"${withDependencies ? ' with dependencies' : ''}...`,
      cancellable: false
    }, async (progress) => {
      void progress; // Progress not used in current implementation
      try {
        // Download example from API
        const downloadResponse = await this.apiService.downloadExample(example.id, withDependencies);
        
        if (!downloadResponse) {
          throw new Error('Failed to download example');
        }
        
        // Create example directory structure in tutor workspace
        const tutorWorkspacePath = await this.workspaceManager.getTutorWorkspacePath(course.id);
        const examplePath = path.join(tutorWorkspacePath, 'examples', example.directory);
        
        // Create directories
        await fs.promises.mkdir(examplePath, { recursive: true });
        
        // Write main example files
        for (const [filename, content] of Object.entries(downloadResponse.files)) {
          const filePath = path.join(examplePath, filename);
          await fs.promises.writeFile(filePath, content, 'utf-8');
        }
        
        // Write meta.yaml
        if (downloadResponse.meta_yaml) {
          await fs.promises.writeFile(
            path.join(examplePath, 'meta.yaml'),
            downloadResponse.meta_yaml,
            'utf-8'
          );
        }
        
        // Write test.yaml if available
        if (downloadResponse.test_yaml) {
          await fs.promises.writeFile(
            path.join(examplePath, 'test.yaml'),
            downloadResponse.test_yaml,
            'utf-8'
          );
        }
        
        // Example is already saved to workspace using saveExampleToWorkspace above
        
        // Handle dependencies if downloaded
        if (withDependencies && downloadResponse.dependencies) {
          const dependenciesPath = path.join(examplePath, 'dependencies');
          await fs.promises.mkdir(dependenciesPath, { recursive: true });
          
          for (const dep of downloadResponse.dependencies) {
            const depPath = path.join(dependenciesPath, dep.directory);
            await fs.promises.mkdir(depPath, { recursive: true });
            
            // Write dependency files
            for (const [filename, content] of Object.entries(dep.files)) {
              const filePath = path.join(depPath, filename);
              await fs.promises.writeFile(filePath, content, 'utf-8');
            }
            
            // Write dependency meta files
            if (dep.meta_yaml) {
              await fs.promises.writeFile(
                path.join(depPath, 'meta.yaml'),
                dep.meta_yaml,
                'utf-8'
              );
            }
            
            if (dep.test_yaml) {
              await fs.promises.writeFile(
                path.join(depPath, 'test.yaml'),
                dep.test_yaml,
                'utf-8'
              );
            }
          }
        }
        
        // Add to workspace if not already added
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const isAlreadyInWorkspace = workspaceFolders.some(folder => 
          folder.uri.fsPath === examplePath
        );
        
        if (!isAlreadyInWorkspace) {
          const folderName = `${example.title} (${example.identifier})`;
          vscode.workspace.updateWorkspaceFolders(
            workspaceFolders.length,
            0,
            { uri: vscode.Uri.file(examplePath), name: folderName }
          );
        }
        
        vscode.window.showInformationMessage(
          `Example "${example.title}" downloaded successfully to tutor workspace`
        );
        
        // Open the main file if it exists (common patterns)
        const mainFiles = ['main.py', 'index.js', 'main.js', 'app.py', 'README.md'];
        for (const mainFile of mainFiles) {
          const mainFilePath = path.join(examplePath, mainFile);
          try {
            await fs.promises.access(mainFilePath);
            const document = await vscode.workspace.openTextDocument(mainFilePath);
            await vscode.window.showTextDocument(document);
            break;
          } catch {
            // File doesn't exist, try next
          }
        }
        
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to download example: ${error}`);
        console.error('Download error:', error);
      }
    });
  }

  private async setupTutorWorkspace(course: any): Promise<void> {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Setting up tutor workspace for "${course.title}"...`,
      cancellable: false
    }, async (progress) => {
      try {
        // Initialize tutor workspace structure
        await this.workspaceManager.initializeTutorWorkspace(course.id, course.title);
        
        // Clone tutor repository if available
        if (course.repository) {
          const tutorRepoPath = await this.workspaceManager.getTutorRepositoryPath(course.id);
          
          // Check if already cloned
          const gitPath = path.join(tutorRepoPath, '.git');
          try {
            await fs.promises.access(gitPath);
            vscode.window.showInformationMessage('Tutor repository already exists');
          } catch {
            // Clone repository
            progress.report({ message: 'Cloning tutor repository...' });
            await this.workspaceManager.cloneTutorRepository(
              course.id,
              course.repository.provider_url,
              course.repository.full_path
            );
          }
        }
        
        // Add tutor workspace root to VS Code workspace
        const tutorWorkspacePath = await this.workspaceManager.getTutorWorkspacePath(course.id);
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const isAlreadyInWorkspace = workspaceFolders.some(folder => 
          folder.uri.fsPath === tutorWorkspacePath
        );
        
        if (!isAlreadyInWorkspace) {
          const folderName = `Tutor: ${course.title}`;
          vscode.workspace.updateWorkspaceFolders(
            0, // Add at beginning
            0,
            { uri: vscode.Uri.file(tutorWorkspacePath), name: folderName }
          );
        }
        
        vscode.window.showInformationMessage(
          `Tutor workspace setup complete for "${course.title}"`
        );
        
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to setup tutor workspace: ${error}`);
        console.error('Workspace setup error:', error);
      }
    });
  }

  private async downloadAllExamples(item: TutorExampleRepositoryTreeItem): Promise<void> {
    const repository = item.repository;
    const course = item.course;

    const result = await vscode.window.showInformationMessage(
      `Download all examples from repository "${repository.name}"? This may take some time.`,
      'Yes',
      'Cancel'
    );

    if (result !== 'Yes') {
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Downloading all examples from "${repository.name}"...`,
      cancellable: false
    }, async (progress) => {
      try {
        // Get all examples in repository
        const examples = await this.apiService.getExamples(repository.id);
        
        if (!examples || examples.length === 0) {
          vscode.window.showInformationMessage('No examples found in this repository');
          return;
        }

        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < examples.length; i++) {
          const example = examples[i];
          if (example) {
            progress.report({ 
              message: `Downloading ${example.title} (${i + 1}/${examples.length})`,
              increment: (100 / examples.length)
            });

            try {
              // Convert ExampleList to Example type for the tree item
              const typedExample = {
                ...example,
                tags: example.tags || [],
                subject: example.subject || null,
                category: example.category || null
              };
              const exampleItem = new TutorExampleTreeItem(typedExample, repository, course, false);
              await this.downloadExample(exampleItem, false);
              successCount++;
            } catch (error) {
              console.error(`Failed to download example ${example.title}:`, error);
              failureCount++;
            }
          }
        }

        const message = `Download complete: ${successCount} successful, ${failureCount} failed`;
        if (failureCount > 0) {
          vscode.window.showWarningMessage(message);
        } else {
          vscode.window.showInformationMessage(message);
        }

      } catch (error) {
        vscode.window.showErrorMessage(`Failed to download examples: ${error}`);
        console.error('Bulk download error:', error);
      }
    });
  }
}
