import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TutorTreeDataProvider, TutorCourseTreeItem, TutorExampleRepositoryTreeItem, TutorExampleTreeItem } from '../ui/tree/tutor/TutorTreeDataProvider';
import { ComputorApiService } from '../services/ComputorApiService';
import { WorkspaceManager } from '../services/WorkspaceManager';
// Import interfaces from generated types (interfaces removed to avoid duplication)

export class TutorCommands {
  private context: vscode.ExtensionContext;
  private treeDataProvider: TutorTreeDataProvider;
  private apiService: ComputorApiService;
  private workspaceManager: WorkspaceManager;

  constructor(context: vscode.ExtensionContext, treeDataProvider: TutorTreeDataProvider) {
    this.context = context;
    this.treeDataProvider = treeDataProvider;
    this.apiService = new ComputorApiService(context);
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
  }

  private async downloadExample(item: TutorExampleTreeItem, withDependencies: boolean): Promise<void> {
    const example = item.example;
    const course = item.course;

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Downloading example "${example.title}"${withDependencies ? ' with dependencies' : ''}...`,
      cancellable: false
    }, async (progress) => {
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