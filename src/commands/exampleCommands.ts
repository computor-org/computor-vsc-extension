import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ComputorApiService } from '../services/ComputorApiService';
import { GitLabTokenManager } from '../services/GitLabTokenManager';
import { GitWrapper } from '../git/GitWrapper';
import { ExampleTreeItem } from '../ui/tree/examples/ExampleTreeItems';
import { ExampleTreeProvider } from '../ui/tree/examples/ExampleTreeProvider';

export class ExampleCommands {
  private gitWrapper: GitWrapper;
  private tokenManager: GitLabTokenManager;

  constructor(
    private context: vscode.ExtensionContext,
    private apiService: ComputorApiService,
    private treeProvider: ExampleTreeProvider
  ) {
    this.gitWrapper = new GitWrapper();
    this.tokenManager = GitLabTokenManager.getInstance(context);
    this.registerCommands();
  }

  private registerCommands(): void {
    // Checkout example command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.checkoutExample', async (item: ExampleTreeItem) => {
        await this.checkoutExample(item);
      })
    );

    // Search examples command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.searchExamples', async () => {
        await this.searchExamples();
      })
    );

    // Clear search command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.clearExampleSearch', () => {
        this.treeProvider.clearSearch();
      })
    );

    // Filter by category command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.filterExamplesByCategory', async () => {
        await this.filterByCategory();
      })
    );

    // Filter by tags command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.filterExamplesByTags', async () => {
        await this.filterByTags();
      })
    );

    // Refresh examples command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.refreshExamples', async () => {
        await this.treeProvider.loadData();
      })
    );

    // Checkout multiple examples
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.checkoutMultipleExamples', async () => {
        await this.checkoutMultipleExamples();
      })
    );

    // Upload example command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.uploadExample', async (item: ExampleTreeItem) => {
        await this.uploadExample(item);
      })
    );

    // Scan workspace command
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.scanWorkspace', async () => {
        // First, let's check what workspace folders we have
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          vscode.window.showErrorMessage('No workspace folders found! Please open a folder in VS Code.');
          return;
        }
        
        // Show workspace folders
        const folderPaths = workspaceFolders.map(f => f.uri.fsPath).join(', ');
        vscode.window.showInformationMessage(`Scanning workspace folders: ${folderPaths}`);
        
        // Now scan
        await this.treeProvider.scanWorkspace();
        const count = this.treeProvider.getWorkspaceExamplesCount();
        const examples = this.treeProvider.getWorkspaceExamples();
        
        if (count > 0) {
          const identifiers = Array.from(examples.keys()).join(', ');
          vscode.window.showInformationMessage(
            `Found ${count} example(s) in workspace: ${identifiers}`
          );
        } else {
          // Let's check what directories are in the workspace
          const fs = require('fs');
          let dirInfo = 'Workspace contents:\n';
          
          for (const folder of workspaceFolders) {
            try {
              const entries = await fs.promises.readdir(folder.uri.fsPath);
              dirInfo += `${folder.uri.fsPath}: ${entries.slice(0, 5).join(', ')}...\n`;
            } catch (e) {
              dirInfo += `${folder.uri.fsPath}: Error reading directory\n`;
            }
          }
          
          vscode.window.showErrorMessage(`No examples found. ${dirInfo}`);
        }
      })
    );

    // Debug command to show detailed status
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.debugExamples', async () => {
        const workspaceExamples = this.treeProvider.getWorkspaceExamples();
        const workspaceIds = Array.from(workspaceExamples.keys());
        
        // Create a debug output channel
        const output = vscode.window.createOutputChannel('Computor Examples Debug');
        output.show();
        output.appendLine('=== WORKSPACE EXAMPLES ===');
        output.appendLine(`Found ${workspaceIds.length} examples in workspace:`);
        
        for (const [id, path] of workspaceExamples) {
          output.appendLine(`  - ${id} -> ${path}`);
        }
        
        output.appendLine('\n=== CHECKING TREE ITEMS ===');
        output.appendLine('Check the Developer Console for detailed TreeItem creation logs');
        
        // Force refresh to trigger tree item creation
        this.treeProvider.refresh();
        
        vscode.window.showInformationMessage(
          `Debug info shown in Output panel. Workspace has ${workspaceIds.length} examples.`
        );
      })
    );
  }

  /**
   * Checkout an example to the workspace
   */
  private async checkoutExample(item: ExampleTreeItem): Promise<void> {
    if (item.type !== 'example' || !item.data?.exampleId || !item.data?.repositoryId) {
      vscode.window.showErrorMessage('Invalid example item');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
      return;
    }

    try {
      // Show progress
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Checking out example: ${item.label}`,
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: 'Fetching example details...' });

        // Get repository details
        const repository = await this.apiService.getExampleRepository(item.data!.repositoryId!);
        if (!repository) {
          throw new Error('Repository not found');
        }

        // Determine checkout method based on source type
        const targetDir = path.join(workspaceFolder.uri.fsPath, item.data!.directory!);

        // Check if directory already exists
        if (fs.existsSync(targetDir)) {
          const overwrite = await vscode.window.showWarningMessage(
            `Directory "${item.data!.directory}" already exists. Overwrite?`,
            'Yes', 'No'
          );
          
          if (overwrite !== 'Yes') {
            return;
          }
          
          // Remove existing directory
          await fs.promises.rm(targetDir, { recursive: true, force: true });
        }

        progress.report({ increment: 30, message: 'Downloading example files...' });

        // Method 1: Try to download from API if available
        const downloaded = await this.downloadFromApi(
          item.data!.exampleId!,
          targetDir,
          progress as vscode.Progress<{ message?: string; increment?: number }>
        );

        if (!downloaded) {
          // Method 2: Clone from Git and extract example
          await this.cloneAndExtract(
            repository,
            item.data!.directory!,
            targetDir,
            progress
          );
          
          // For Git clones, ensure the meta.yaml has the correct slug
          progress.report({ increment: 90, message: 'Updating meta.yaml...' });
          await this.updateMetaYaml(targetDir, item.data!.identifier!);
        }

        progress.report({ increment: 100, message: 'Complete!' });
      });

      // Show success message
      vscode.window.showInformationMessage(
        `Example "${item.label}" checked out to ${item.data.directory}`
      );

      // Open the first file in the example
      await this.openExampleFiles(path.join(workspaceFolder.uri.fsPath, item.data.directory!));

    } catch (error) {
      console.error('Failed to checkout example:', error);
      vscode.window.showErrorMessage(`Failed to checkout example: ${error}`);
    }
  }

  /**
   * Download example from API
   */
  private async downloadFromApi(
    exampleId: string,
    targetDir: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<boolean> {
    try {
      // Try to download files from API
      const response = await this.apiService.downloadExample(exampleId);
      if (!response || !response.files) {
        return false;
      }

      progress.report({ message: 'Writing files...' });

      // Create target directory
      await fs.promises.mkdir(targetDir, { recursive: true });

      // Write files
      for (const [filename, content] of Object.entries(response.files)) {
        const filePath = path.join(targetDir, filename);
        const fileDir = path.dirname(filePath);
        
        // Create subdirectories if needed
        await fs.promises.mkdir(fileDir, { recursive: true });
        
        // Write file
        await fs.promises.writeFile(filePath, content, 'utf-8');
      }

      // Write meta.yaml if provided
      if (response.meta_yaml) {
        const metaPath = path.join(targetDir, 'meta.yaml');
        await fs.promises.writeFile(metaPath, response.meta_yaml, 'utf-8');
      }

      // Write test.yaml if provided
      if (response.test_yaml) {
        const testPath = path.join(targetDir, 'test.yaml');
        await fs.promises.writeFile(testPath, response.test_yaml, 'utf-8');
      }

      return true;
    } catch (error) {
      console.error('Failed to download from API:', error);
      return false;
    }
  }

  /**
   * Clone repository and extract specific example
   */
  private async cloneAndExtract(
    repository: any,
    exampleDirectory: string,
    targetDir: string,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    progress.report({ message: 'Cloning repository...' });

    // Create temp directory for cloning
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder available');
    }
    const tempDir = path.join(workspaceFolder.uri.fsPath, '.tmp', `repo-${Date.now()}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // Get authenticated URL if needed
      let cloneUrl = repository.source_url;
      if (this.isGitLabUrl(cloneUrl)) {
        const gitlabHost = this.extractGitLabHost(cloneUrl);
        const token = await this.tokenManager.ensureTokenForUrl(gitlabHost);
        
        if (token) {
          cloneUrl = this.tokenManager.buildAuthenticatedCloneUrl(cloneUrl, token);
        }
      }

      // Clone with sparse checkout to get only the example directory
      await this.gitWrapper.clone(cloneUrl, tempDir, {
        depth: 1,
        branch: repository.default_version
      });

      progress.report({ message: 'Extracting example...' });

      // Copy example directory to target
      const sourceDir = path.join(tempDir, exampleDirectory);
      if (!fs.existsSync(sourceDir)) {
        throw new Error(`Example directory "${exampleDirectory}" not found in repository`);
      }

      await this.copyDirectory(sourceDir, targetDir);

    } finally {
      // Clean up temp directory
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to clean up temp directory:', error);
      }
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.promises.mkdir(target, { recursive: true });
    
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.promises.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * Update meta.yaml with the slug
   */
  private async updateMetaYaml(targetDir: string, identifier: string): Promise<void> {
    const metaPath = path.join(targetDir, 'meta.yaml');
    
    try {
      if (fs.existsSync(metaPath)) {
        const content = await fs.promises.readFile(metaPath, 'utf-8');
        const meta = yaml.load(content) as any || {};
        
        // Ensure slug is set to the identifier
        meta.slug = identifier;
        
        const updatedContent = yaml.dump(meta);
        await fs.promises.writeFile(metaPath, updatedContent, 'utf-8');
      }
    } catch (error) {
      console.error('Failed to update meta.yaml:', error);
    }
  }

  /**
   * Open example files in editor
   */
  private async openExampleFiles(exampleDir: string): Promise<void> {
    try {
      const files = await fs.promises.readdir(exampleDir);
      
      // Priority files to open
      const priorityFiles = ['README.md', 'main.py', 'index.js', 'index.ts', 'main.cpp', 'Main.java'];
      
      for (const priority of priorityFiles) {
        if (files.includes(priority)) {
          const filePath = path.join(exampleDir, priority);
          const doc = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(doc);
          return;
        }
      }
      
      // Open first non-meta file
      for (const file of files) {
        if (!file.startsWith('.') && !file.startsWith('meta')) {
          const filePath = path.join(exampleDir, file);
          const stat = await fs.promises.stat(filePath);
          if (stat.isFile()) {
            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
            return;
          }
        }
      }
    } catch (error) {
      console.error('Failed to open example files:', error);
    }
  }

  /**
   * Search examples
   */
  private async searchExamples(): Promise<void> {
    const query = await vscode.window.showInputBox({
      prompt: 'Search examples',
      placeHolder: 'Enter search query...'
    });
    
    if (query !== undefined) {
      await this.treeProvider.search(query);
    }
  }

  /**
   * Filter by category
   */
  private async filterByCategory(): Promise<void> {
    const categories = this.treeProvider.getAllCategories();
    
    if (categories.length === 0) {
      vscode.window.showInformationMessage('No categories available');
      return;
    }
    
    const selected = await vscode.window.showQuickPick(
      ['All Categories', ...categories],
      { placeHolder: 'Select a category' }
    );
    
    if (selected) {
      this.treeProvider.setCategory(selected === 'All Categories' ? undefined : selected);
    }
  }

  /**
   * Filter by tags
   */
  private async filterByTags(): Promise<void> {
    const allTags = this.treeProvider.getAllTags();
    
    if (allTags.length === 0) {
      vscode.window.showInformationMessage('No tags available');
      return;
    }
    
    const selected = await vscode.window.showQuickPick(
      allTags,
      { 
        placeHolder: 'Select tags to filter by',
        canPickMany: true
      }
    );
    
    if (selected) {
      this.treeProvider.setTags(selected);
    }
  }

  /**
   * Checkout multiple examples at once
   */
  private async checkoutMultipleExamples(): Promise<void> {
    // This would show a multi-select quick pick
    vscode.window.showInformationMessage('Batch checkout not yet implemented');
  }

  /**
   * Upload an example from workspace to repository
   */
  private async uploadExample(item: ExampleTreeItem): Promise<void> {
    if (item.type !== 'example' || !item.data?.exampleId || !item.data?.repositoryId) {
      vscode.window.showErrorMessage('Invalid example item');
      return;
    }

    // Check if example exists in workspace
    if (!item.data.isInWorkspace || !item.data.workspacePath) {
      vscode.window.showErrorMessage('Example not found in workspace. Please checkout first.');
      return;
    }

    try {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Uploading example: ${item.label}`,
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: 'Reading example files...' });

        const examplePath = item.data!.workspacePath!;
        
        // Read all files in the example directory
        const files: { [key: string]: string } = {};
        await this.readExampleFiles(examplePath, examplePath, files);

        // Ensure meta.yaml exists
        if (!files['meta.yaml']) {
          throw new Error('meta.yaml not found in example directory');
        }

        progress.report({ increment: 50, message: 'Uploading to server...' });

        // Upload to server
        const uploadRequest = {
          repository_id: item.data!.repositoryId!,
          directory: item.data!.directory!,
          files
        };

        const response = await this.apiService.uploadExample(uploadRequest);
        
        if (response) {
          progress.report({ increment: 100, message: 'Complete!' });
          vscode.window.showInformationMessage(`Example "${item.label}" uploaded successfully`);
          
          // Refresh tree to show updated status
          await this.treeProvider.loadData();
        } else {
          throw new Error('Upload failed');
        }
      });
    } catch (error) {
      console.error('Failed to upload example:', error);
      vscode.window.showErrorMessage(`Failed to upload example: ${error}`);
    }
  }

  /**
   * Read all files in an example directory
   */
  private async readExampleFiles(
    basePath: string, 
    currentPath: string, 
    files: { [key: string]: string }
  ): Promise<void> {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(basePath, fullPath);
      
      if (entry.isFile() && !entry.name.startsWith('.')) {
        // Read file content
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        files[relativePath] = content;
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        // Recursively read subdirectory
        await this.readExampleFiles(basePath, fullPath, files);
      }
    }
  }

  /**
   * Check if URL is GitLab
   */
  private isGitLabUrl(url: string): boolean {
    return url.includes('gitlab') || url.startsWith('git@');
  }

  /**
   * Extract GitLab host from URL
   */
  private extractGitLabHost(url: string): string {
    try {
      if (url.startsWith('git@')) {
        const match = url.match(/git@([^:]+):/);
        return match ? `https://${match[1]}` : '';
      } else {
        const parsed = new URL(url);
        return parsed.origin;
      }
    } catch {
      return '';
    }
  }
}