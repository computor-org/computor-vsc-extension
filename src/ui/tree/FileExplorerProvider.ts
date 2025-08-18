import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileExplorerProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | null | void> = new vscode.EventEmitter<FileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private workspaceRoot: string;
  private currentPath: string;
  private showHiddenFiles: boolean = false;
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  constructor(private context: vscode.ExtensionContext) {
    // Default to workspace root or home directory
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.env.HOME || '';
    this.currentPath = this.workspaceRoot;
    
    // Watch for file changes
    this.setupFileWatcher();
  }

  private setupFileWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
    }

    if (this.currentPath) {
      const pattern = new vscode.RelativePattern(this.currentPath, '**/*');
      this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);
      
      this.fileWatcher.onDidCreate(() => this.refresh());
      this.fileWatcher.onDidChange(() => this.refresh());
      this.fileWatcher.onDidDelete(() => this.refresh());
      
      this.context.subscriptions.push(this.fileWatcher);
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setRootPath(path: string): void {
    this.currentPath = path;
    this.setupFileWatcher();
    this.refresh();
  }

  toggleHiddenFiles(): void {
    this.showHiddenFiles = !this.showHiddenFiles;
    this.refresh();
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FileItem): Thenable<FileItem[]> {
    if (!this.currentPath) {
      vscode.window.showInformationMessage('No workspace folder open');
      return Promise.resolve([]);
    }

    const dirPath = element ? element.resourceUri.fsPath : this.currentPath;
    return this.getFilesInDirectory(dirPath);
  }

  private async getFilesInDirectory(dirPath: string): Promise<FileItem[]> {
    try {
      const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      // Filter hidden files if needed
      const filteredFiles = this.showHiddenFiles 
        ? files 
        : files.filter(f => !f.name.startsWith('.'));

      // Sort directories first, then files
      filteredFiles.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      return filteredFiles.map(file => {
        const filePath = path.join(dirPath, file.name);
        const isDirectory = file.isDirectory();
        
        return new FileItem(
          file.name,
          vscode.Uri.file(filePath),
          isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
          isDirectory
        );
      });
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      return [];
    }
  }

  getParent(element: FileItem): vscode.ProviderResult<FileItem> {
    const parent = path.dirname(element.resourceUri.fsPath);
    if (parent === element.resourceUri.fsPath || parent === this.currentPath) {
      return undefined;
    }
    
    return new FileItem(
      path.basename(parent),
      vscode.Uri.file(parent),
      vscode.TreeItemCollapsibleState.Collapsed,
      true
    );
  }

  // Navigate up one directory
  goUp(): void {
    if (this.currentPath !== '/') {
      const parent = path.dirname(this.currentPath);
      this.setRootPath(parent);
    }
  }

  // Navigate to home directory
  goHome(): void {
    const home = process.env.HOME || process.env.USERPROFILE || '/';
    this.setRootPath(home);
  }

  // Navigate to workspace root
  goToWorkspace(): void {
    if (this.workspaceRoot) {
      this.setRootPath(this.workspaceRoot);
    }
  }

  getCurrentPath(): string {
    return this.currentPath;
  }
}

export class FileItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly resourceUri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isDirectory: boolean
  ) {
    super(resourceUri, collapsibleState);
    
    this.tooltip = this.resourceUri.fsPath;
    this.contextValue = isDirectory ? 'directory' : 'file';
    
    // Set appropriate icons
    if (isDirectory) {
      this.iconPath = vscode.ThemeIcon.Folder;
    } else {
      this.iconPath = vscode.ThemeIcon.File;
    }
    
    // Add command to open files
    if (!isDirectory) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri]
      };
    }
    
    // Add decorations for special files
    this.description = this.getDescription();
  }

  private getDescription(): string | undefined {
    if (!this.isDirectory) {
      // const ext = path.extname(this.label); // Reserved for future use
      const stats = fs.statSync(this.resourceUri.fsPath);
      const size = this.formatFileSize(stats.size);
      return `${size}`;
    }
    
    try {
      const files = fs.readdirSync(this.resourceUri.fsPath);
      return `${files.length} items`;
    } catch {
      return undefined;
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}