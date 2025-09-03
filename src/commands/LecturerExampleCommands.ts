import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import JSZip from 'jszip';
import { ComputorApiService } from '../services/ComputorApiService';
import { ExampleTreeItem, ExampleRepositoryTreeItem, LecturerExampleTreeProvider } from '../ui/tree/lecturer/LecturerExampleTreeProvider';
import { ExampleUploadRequest } from '../types/generated';

/**
 * Simplified example commands for the lecturer view
 */
export class LecturerExampleCommands {
  constructor(
    private context: vscode.ExtensionContext,
    private apiService: ComputorApiService,
    private treeProvider: LecturerExampleTreeProvider
  ) {
    this.registerCommands();
  }

  private registerCommands(): void {
    // Search examples - already registered in extension.ts but we'll override with better implementation
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.searchExamples', async () => {
        // Get current search query to prefill the input
        const currentQuery = this.treeProvider.getSearchQuery();
        
        const query = await vscode.window.showInputBox({
          prompt: 'Search examples by title, identifier, or tags',
          placeHolder: 'Enter search query',
          value: currentQuery  // Prefill with current search
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
      vscode.commands.registerCommand('computor.lecturer.clearExampleSearch', () => {
        this.treeProvider.clearSearch();
        vscode.window.showInformationMessage('Search cleared');
      })
    );

    // Also register clearSearch for the tree item click
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.clearSearch', () => {
        this.treeProvider.clearSearch();
        vscode.window.showInformationMessage('Search cleared');
      })
    );

    // Filter by category
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.filterExamplesByCategory', async () => {
        const currentCategory = this.treeProvider.getSelectedCategory();
        const category = await vscode.window.showInputBox({
          prompt: 'Enter category to filter by (leave empty to clear)',
          placeHolder: 'e.g., Introduction, Advanced',
          value: currentCategory || ''
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
      vscode.commands.registerCommand('computor.lecturer.filterExamplesByTags', async () => {
        const currentTags = this.treeProvider.getSelectedTags();
        const tagsInput = await vscode.window.showInputBox({
          prompt: 'Enter tags to filter by (comma-separated, leave empty to clear)',
          placeHolder: 'e.g., beginner, loops, functions',
          value: currentTags.join(', ')
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

    // Clear category filter
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.clearCategoryFilter', () => {
        this.treeProvider.clearCategoryFilter();
        vscode.window.showInformationMessage('Category filter cleared');
      })
    );

    // Clear tags filter
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.clearTagsFilter', () => {
        this.treeProvider.clearTagsFilter();
        vscode.window.showInformationMessage('Tags filter cleared');
      })
    );

    // Checkout example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.checkoutExample', async (item: ExampleTreeItem) => {
        await this.checkoutExample(item);
      })
    );

    // Upload example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.uploadExample', async (item?: ExampleTreeItem) => {
        await this.uploadExample(item);
      })
    );

    // Create new example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.createNewExample', async () => {
        await this.createNewExample();
      })
    );

    // Upload new example
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.uploadNewExample', async () => {
        await this.uploadNewExample();
      })
    );

    // Checkout multiple examples
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.checkoutMultipleExamples', async () => {
        vscode.window.showInformationMessage('Checkout multiple examples - not yet implemented');
      })
    );

    // Upload examples from ZIP
    this.context.subscriptions.push(
      vscode.commands.registerCommand('computor.lecturer.uploadExamplesFromZip', async (item?: ExampleRepositoryTreeItem) => {
        await this.uploadExamplesFromZip(item);
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
      // Use the example directory name directly in the workspace
      const examplePath = path.join(workspaceFolder.uri.fsPath, item.example.directory);
      
      // Check if directory already exists
      if (fs.existsSync(examplePath)) {
        const overwrite = await vscode.window.showWarningMessage(
          `Directory '${item.example.directory}' already exists. Overwrite?`,
          'Yes', 'No'
        );
        
        if (overwrite !== 'Yes') {
          return;
        }
        
        // Remove existing directory
        fs.rmSync(examplePath, { recursive: true, force: true });
      }

      // Download the example
      const exampleData = await this.apiService.downloadExample(item.example.id, false);
      if (!exampleData) {
        vscode.window.showErrorMessage('Failed to download example');
        return;
      }

      // Create directory
      fs.mkdirSync(examplePath, { recursive: true });

      // TODO: Extract downloaded content to the directory
      // This depends on the format of the downloaded data

      vscode.window.showInformationMessage(`Example '${item.example.title}' checked out to workspace root: ${item.example.directory}`);
    } catch (error) {
      console.error('Failed to checkout example:', error);
      vscode.window.showErrorMessage(`Failed to checkout example: ${error}`);
    }
  }

  /**
   * Upload an existing example
   */
  private async uploadExample(item?: ExampleTreeItem): Promise<void> {
    void item; // Currently unused - keeping for future enhancement
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

    // Create example directly in workspace root
    const examplePath = path.join(workspaceFolder.uri.fsPath, directory);
    
    try {
      // Check if directory already exists
      if (fs.existsSync(examplePath)) {
        vscode.window.showErrorMessage(`Directory '${directory}' already exists in workspace`);
        return;
      }
      
      // Create directory
      fs.mkdirSync(examplePath, { recursive: true });

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

  /**
   * Upload examples from a ZIP file to a repository
   */
  private async uploadExamplesFromZip(item?: ExampleRepositoryTreeItem): Promise<void> {
    try {
      // Get repository - either from selected item or ask user
      let repositoryId: string;
      let repositoryName: string;
      
      if (item && item.repository) {
        repositoryId = item.repository.id;
        repositoryName = item.repository.name;
      } else {
        // Ask user to select a repository
        const repositories = await this.apiService.getExampleRepositories();
        if (repositories.length === 0) {
          vscode.window.showErrorMessage('No example repositories available');
          return;
        }
        
        const selected = await vscode.window.showQuickPick(
          repositories.map(r => ({
            label: r.name,
            description: r.description || undefined,
            id: r.id
          })),
          { placeHolder: 'Select repository to upload examples to' }
        );
        
        if (!selected) {
          return;
        }
        
        repositoryId = selected.id;
        repositoryName = selected.label;
      }

      // Show file picker for ZIP file
      const zipFileUri = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'ZIP Archives': ['zip']
        },
        title: 'Select ZIP file containing examples'
      });

      if (!zipFileUri || zipFileUri.length === 0) {
        return;
      }

      const firstFile = zipFileUri[0];
      if (!firstFile) {
        return;
      }
      const zipFilePath = firstFile.fsPath;
      const zipFileName = path.basename(zipFilePath);

      // Read the ZIP file
      const zipContent = await fs.promises.readFile(zipFilePath);
      const zip = new JSZip();

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Processing ${zipFileName}`,
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: 'Loading ZIP file...' });

        // Load the ZIP content
        const loadedZip = await zip.loadAsync(zipContent);

        // Find all directories that contain meta.yaml files
        const allPaths = Object.keys(loadedZip.files).filter(path => 
          !path.startsWith('__MACOSX/') && !path.includes('/.')
        );
        
        const metaYamlPaths = allPaths.filter(path => path.endsWith('meta.yaml'));
        
        if (metaYamlPaths.length === 0) {
          throw new Error('No meta.yaml files found in the ZIP archive');
        }

        progress.report({ increment: 20, message: `Found ${metaYamlPaths.length} example(s)...` });

        // Process each example
        const examples: Array<{
          directory: string;
          title: string;
          identifier: string;
          files: { [key: string]: string };
        }> = [];

        for (const metaPath of metaYamlPaths) {
          const directoryPath = metaPath.replace('/meta.yaml', '');
          const directoryName = directoryPath.includes('/') ? 
            directoryPath.split('/').pop()! : directoryPath;

          // Read meta.yaml content
          const metaFile = loadedZip.files[metaPath];
          if (!metaFile) {
            console.warn(`Skipping ${directoryPath}: meta.yaml file not found in ZIP`);
            continue;
          }
          const metaContent = await metaFile.async('string');
          const metaData = yaml.load(metaContent) as any;

          if (!metaData) {
            console.warn(`Skipping ${directoryPath}: Failed to parse meta.yaml`);
            continue;
          }

          // Collect all files in this directory
          const files: { [key: string]: string } = {};
          const directoryPrefix = directoryPath === directoryName ? directoryName + '/' : directoryPath + '/';

          for (const [filePath, zipEntry] of Object.entries(loadedZip.files)) {
            const entry = zipEntry as JSZip.JSZipObject;
            if (!entry.dir && filePath.startsWith(directoryPrefix) && 
                !filePath.startsWith('__MACOSX/') && !filePath.includes('/.')) {
              
              const relativePath = filePath.substring(directoryPrefix.length);
              
              try {
                const content = await entry.async('string');
                files[relativePath] = content;
              } catch (err) {
                console.warn(`Failed to extract ${filePath}:`, err);
              }
            }
          }

          examples.push({
            directory: directoryName,
            title: metaData.title || directoryName,
            identifier: metaData.identifier || metaData.slug || directoryName,
            files
          });
        }

        if (examples.length === 0) {
          throw new Error('No valid examples found in ZIP file');
        }

        // Show selection dialog with all items preselected
        const quickPickItems = examples.map(ex => ({
          label: ex.title,
          description: ex.identifier,
          detail: `${Object.keys(ex.files).length} files`,
          example: ex,
          picked: true  // Preselect all items
        }));

        const selectedItems = await vscode.window.showQuickPick(
          quickPickItems,
          {
            canPickMany: true,
            placeHolder: `Select examples to upload to ${repositoryName}`,
            title: 'Select Examples to Upload'
          }
        );

        if (!selectedItems || selectedItems.length === 0) {
          return;
        }

        progress.report({ increment: 40, message: `Uploading ${selectedItems.length} example(s)...` });

        // Upload selected examples
        let successCount = 0;
        const errors: string[] = [];

        for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i];
          if (!item) continue;
          const example = item.example;
          
          progress.report({ 
            increment: 40 + (40 * i / selectedItems.length), 
            message: `Uploading ${example.title}...` 
          });

          try {
            const uploadRequest: ExampleUploadRequest = {
              repository_id: repositoryId,
              directory: example.directory,
              files: example.files
            };

            await this.apiService.uploadExample(uploadRequest);
            successCount++;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            errors.push(`${example.title}: ${errorMsg}`);
            console.error(`Failed to upload ${example.title}:`, error);
          }
        }

        progress.report({ increment: 100, message: 'Complete!' });

        // Show results
        if (successCount === selectedItems.length) {
          vscode.window.showInformationMessage(
            `Successfully uploaded ${successCount} example(s) to ${repositoryName}`
          );
        } else if (successCount > 0) {
          vscode.window.showWarningMessage(
            `Uploaded ${successCount} of ${selectedItems.length} examples. Errors: ${errors.join('; ')}`
          );
        } else {
          vscode.window.showErrorMessage(
            `Failed to upload examples. Errors: ${errors.join('; ')}`
          );
        }

        // Refresh the tree to show new examples
        if (successCount > 0) {
          // Add a small delay to ensure the backend has processed the uploads
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Refresh the tree
          this.treeProvider.refresh();
          
          console.log(`Refreshed tree after uploading ${successCount} examples`);
        }
      });

    } catch (error) {
      console.error('Failed to upload examples from ZIP:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to upload examples: ${errorMessage}`);
    }
  }
}