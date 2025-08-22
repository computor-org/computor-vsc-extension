import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ComputorApiService } from '../services/ComputorApiService';
import { ExampleTreeItem, LecturerExampleTreeProvider } from '../ui/tree/lecturer/LecturerExampleTreeProvider';
// import { GitWrapper } from '../git/GitWrapper'; // Will be used for git operations
// import { ExampleUploadRequest } from '../types/generated';

/**
 * Simplified example commands for the lecturer view
 */
export class LecturerExampleCommands {
  // private gitWrapper: GitWrapper; // Will be used for git operations

  constructor(
    private context: vscode.ExtensionContext,
    private apiService: ComputorApiService,
    private treeProvider: LecturerExampleTreeProvider
  ) {
    // this.gitWrapper = new GitWrapper(); // Will be used for git operations
    this.registerCommands();
  }

  private registerCommands(): void {
    // Search examples - already registered in extension.ts but we'll override with better implementation
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.searchExamples', async () => {
        const query = await vscode.window.showInputBox({
          prompt: 'Search examples by title, identifier, or tags',
          placeHolder: 'Enter search query',
          value: ''
        });
        
        if (query !== undefined) {
          this.treeProvider.setSearchQuery(query);
          if (query) {
            vscode.window.showInformationMessage(`Searching for: ${query}`);
          } else {
            vscode.window.showInformationMessage('Search cleared');
          }
        }
      })
    );

    // Clear search
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.clearExampleSearch', () => {
        this.treeProvider.clearSearch();
        vscode.window.showInformationMessage('Search cleared');
      })
    );

    // Filter by category
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.filterExamplesByCategory', async () => {
        // For now, show input box. Later we can get categories from API
        const category = await vscode.window.showInputBox({
          prompt: 'Enter category to filter by',
          placeHolder: 'e.g., Introduction, Advanced',
          value: ''
        });
        
        if (category !== undefined) {
          this.treeProvider.setCategory(category || undefined);
          if (category) {
            vscode.window.showInformationMessage(`Filtering by category: ${category}`);
          } else {
            vscode.window.showInformationMessage('Category filter cleared');
          }
        }
      })
    );

    // Filter by tags
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.filterExamplesByTags', async () => {
        const tagsInput = await vscode.window.showInputBox({
          prompt: 'Enter tags to filter by (comma-separated)',
          placeHolder: 'e.g., beginner, loops, functions',
          value: ''
        });
        
        if (tagsInput !== undefined) {
          const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
          this.treeProvider.setTags(tags);
          if (tags.length > 0) {
            vscode.window.showInformationMessage(`Filtering by tags: ${tags.join(', ')}`);
          } else {
            vscode.window.showInformationMessage('Tag filter cleared');
          }
        }
      })
    );

    // Checkout example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.checkoutExample', async (item: ExampleTreeItem) => {
        await this.checkoutExample(item);
      })
    );

    // Upload example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.uploadExample', async (item?: ExampleTreeItem) => {
        await this.uploadExample(item);
      })
    );

    // Create new example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.createNewExample', async () => {
        await this.createNewExample();
      })
    );

    // Upload new example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.uploadNewExample', async () => {
        await this.uploadNewExample();
      })
    );

    // Checkout multiple examples
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.checkoutMultipleExamples', async () => {
        vscode.window.showInformationMessage('Checkout multiple examples - not yet implemented');
      })
    );

    // Upload examples from ZIP
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.uploadExamplesFromZip', async () => {
        vscode.window.showInformationMessage('Upload examples from ZIP - not yet implemented');
      })
    );

    // Scan workspace
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.scanWorkspace', async () => {
        vscode.window.showInformationMessage('Scan workspace for examples - not yet implemented');
      })
    );
  }

  /**
   * Checkout an example to the workspace
   */
  private async checkoutExample(item: ExampleTreeItem): Promise<void> {
    if (!item || !item.example) {
      vscode.window.showErrorMessage('Invalid example item');
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    try {
      // Download the example
      const exampleData = await this.apiService.downloadExample(item.example.id, false);
      if (!exampleData) {
        vscode.window.showErrorMessage('Failed to download example');
        return;
      }

      // Create example directory
      const examplePath = path.join(workspaceFolder.uri.fsPath, 'examples', item.example.directory);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(examplePath)) {
        fs.mkdirSync(examplePath, { recursive: true });
      }

      // TODO: Extract downloaded content to the directory
      // This depends on the format of the downloaded data

      vscode.window.showInformationMessage(`Example '${item.example.title}' checked out to ${examplePath}`);
    } catch (error) {
      console.error('Failed to checkout example:', error);
      vscode.window.showErrorMessage(`Failed to checkout example: ${error}`);
    }
  }

  /**
   * Upload an existing example
   */
  private async uploadExample(item?: ExampleTreeItem): Promise<void> {
    // If no item provided, ask user to select a folder
    const folderUri = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select Example Folder'
    });

    if (!folderUri || folderUri.length === 0) {
      return;
    }

    const folderPath = folderUri[0]?.fsPath;
    if (!folderPath) {
      return;
    }
    const folderName = path.basename(folderPath);

    // Prompt for example details
    const title = await vscode.window.showInputBox({
      prompt: 'Example Title',
      value: folderName
    });

    if (!title) {
      return;
    }

    const identifier = await vscode.window.showInputBox({
      prompt: 'Example Identifier (e.g., hello.world.basic)',
      value: folderName.toLowerCase().replace(/\s+/g, '.')
    });

    if (!identifier) {
      return;
    }

    const repositoryId = await vscode.window.showInputBox({
      prompt: 'Repository ID',
      placeHolder: 'Enter the repository ID where this example should be uploaded'
    });

    if (!repositoryId) {
      return;
    }

    try {
      // TODO: Create upload request
      // This would involve packaging the folder contents and sending to API
      
      vscode.window.showInformationMessage(`Example upload not yet fully implemented`);
    } catch (error) {
      console.error('Failed to upload example:', error);
      vscode.window.showErrorMessage(`Failed to upload example: ${error}`);
    }
  }

  /**
   * Create a new example
   */
  private async createNewExample(): Promise<void> {
    const title = await vscode.window.showInputBox({
      prompt: 'Example Title',
      placeHolder: 'Enter a title for the new example'
    });

    if (!title) {
      return;
    }

    const identifier = await vscode.window.showInputBox({
      prompt: 'Example Identifier',
      placeHolder: 'e.g., hello.world.basic',
      value: title.toLowerCase().replace(/\s+/g, '.')
    });

    if (!identifier) {
      return;
    }

    const directory = await vscode.window.showInputBox({
      prompt: 'Directory Name',
      placeHolder: 'Directory name for the example',
      value: identifier.replace(/\./g, '-')
    });

    if (!directory) {
      return;
    }

    // Create example in workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const examplePath = path.join(workspaceFolder.uri.fsPath, 'examples', directory);
    
    try {
      // Create directory
      if (!fs.existsSync(examplePath)) {
        fs.mkdirSync(examplePath, { recursive: true });
      }

      // Create meta.yaml file
      const metaContent = `title: ${title}
identifier: ${identifier}
directory: ${directory}
category: ""
tags: []
description: |
  Example description here
`;

      fs.writeFileSync(path.join(examplePath, 'meta.yaml'), metaContent);

      // Create README.md
      const readmeContent = `# ${title}

## Description
Add your example description here.

## Usage
Explain how to use this example.
`;

      fs.writeFileSync(path.join(examplePath, 'README.md'), readmeContent);

      vscode.window.showInformationMessage(`Example '${title}' created at ${examplePath}`);
      
      // Open the meta.yaml file
      const doc = await vscode.workspace.openTextDocument(path.join(examplePath, 'meta.yaml'));
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      console.error('Failed to create example:', error);
      vscode.window.showErrorMessage(`Failed to create example: ${error}`);
    }
  }

  /**
   * Upload a new example from meta.yaml
   */
  private async uploadNewExample(): Promise<void> {
    // Find meta.yaml files in workspace
    const metaFiles = await vscode.workspace.findFiles('**/meta.yaml', '**/node_modules/**');
    
    if (metaFiles.length === 0) {
      vscode.window.showErrorMessage('No meta.yaml files found in workspace');
      return;
    }

    let metaFile: vscode.Uri | undefined;
    
    if (metaFiles.length === 1) {
      metaFile = metaFiles[0];
    } else {
      // Let user choose
      const items = metaFiles.map(file => ({
        label: path.basename(path.dirname(file.fsPath)),
        description: file.fsPath,
        uri: file
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select meta.yaml file to upload'
      });

      if (!selected) {
        return;
      }

      if (!selected) {
        return;
      }
      metaFile = selected.uri;
    }

    if (!metaFile) {
      return;
    }
    
    vscode.window.showInformationMessage(`Uploading example from ${metaFile.fsPath} - not yet fully implemented`);
    
    // TODO: Read meta.yaml, package the example, and upload
  }
}