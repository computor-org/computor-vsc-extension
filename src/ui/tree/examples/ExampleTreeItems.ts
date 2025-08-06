import * as vscode from 'vscode';

export type ExampleTreeItemType = 'repository' | 'category' | 'example';

export interface ExampleTreeItemData {
  // Repository data
  repositoryId?: string;
  sourceUrl?: string;
  sourceType?: string;
  
  // Category data
  category?: string;
  
  // Example data
  exampleId?: string;
  directory?: string;
  identifier?: string;
  tags?: string[];
  
  // Workspace status
  isInWorkspace?: boolean;
  workspacePath?: string;
}

export class ExampleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly type: ExampleTreeItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data?: ExampleTreeItemData
  ) {
    // Debug logging
    if (type === 'example') {
      console.log(`[ExampleTreeItem] Creating item for: ${label}`);
      console.log(`  - identifier: ${data?.identifier}`);
      console.log(`  - isInWorkspace: ${data?.isInWorkspace}`);
      console.log(`  - workspacePath: ${data?.workspacePath}`);
    }
    
    // Modify label for examples in workspace
    const displayLabel = (type === 'example' && data?.isInWorkspace === true) 
      ? `[LOCAL] ${label}` 
      : label;
    
    super(displayLabel, collapsibleState);
    
    this.tooltip = this.getTooltip();
    this.contextValue = type;
    
    // Set description with workspace indicator
    if (type === 'example' && data?.isInWorkspace === true) {
      this.description = `${description} (in workspace)`;
    } else {
      this.description = description;
    }
    
    // Set icons based on type
    switch (type) {
      case 'repository':
        this.iconPath = new vscode.ThemeIcon('database');
        break;
      case 'category':
        this.iconPath = new vscode.ThemeIcon('folder');
        break;
      case 'example':
        // Use different icons based on workspace status
        if (data?.isInWorkspace) {
          // Use check icon for examples in workspace
          this.iconPath = new vscode.ThemeIcon('check');
          // Add to tooltip
          this.tooltip = `${this.tooltip}\n✓ Available in workspace at: ${data.workspacePath}`;
        } else {
          // Use regular file icon for examples not in workspace
          this.iconPath = new vscode.ThemeIcon('file-code');
        }
        break;
    }
  }

  private getTooltip(): string {
    switch (this.type) {
      case 'repository':
        return `Repository: ${this.label}\n${this.description}\nSource: ${this.data?.sourceUrl || 'Unknown'}`;
      
      case 'category':
        return `Category: ${this.label}\n${this.description}`;
      
      case 'example':
        const tags = this.data?.tags?.join(', ') || 'None';
        return `Example: ${this.label}\nIdentifier: ${this.data?.identifier || 'Unknown'}\nDirectory: ${this.data?.directory || 'Unknown'}\nTags: ${tags}`;
      
      default:
        return this.label;
    }
  }
}