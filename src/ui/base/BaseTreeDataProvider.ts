import * as vscode from 'vscode';
import { TreeItemData, TreeProviderConfig, TreeRefreshEvent, LoadingState, TreeErrorInfo } from '../../types/TreeTypes';
import { BaseTreeItem } from './BaseTreeItem';

export abstract class BaseTreeDataProvider<T extends BaseTreeItem> implements vscode.TreeDataProvider<T> {
  protected _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  protected context: vscode.ExtensionContext;
  protected treeView: vscode.TreeView<T> | undefined;
  protected config: TreeProviderConfig;
  protected loadingState: LoadingState = LoadingState.IDLE;
  protected errorInfo: TreeErrorInfo | undefined;
  private refreshTimer: NodeJS.Timer | undefined;
  protected rootItems: T[] = [];

  constructor(context: vscode.ExtensionContext, config: TreeProviderConfig = {}) {
    this.context = context;
    this.config = {
      refreshInterval: config.refreshInterval,
      maxDepth: config.maxDepth || 10,
      cacheTimeout: config.cacheTimeout || 60000,
      batchSize: config.batchSize || 50,
      showIcons: config.showIcons !== false,
      expandAll: config.expandAll || false
    };
    
    if (this.config.refreshInterval) {
      this.startAutoRefresh();
    }
  }

  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;
  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;
  
  /**
   * Load data for the tree
   * Must be implemented by subclasses
   */
  protected abstract loadData(element?: T): Promise<T[]>;

  /**
   * Handle errors during data loading
   * Can be overridden by subclasses for custom error handling
   */
  protected async handleError(error: unknown, element?: T): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.errorInfo = {
      message,
      retry: true,
      details: error
    };
    
    this.showErrorMessage(`Failed to load tree data: ${message}`);
    
    // Fire a change event to update the tree with error state
    this._onDidChangeTreeData.fire(element);
  }

  /**
   * Get loading state
   */
  getLoadingState(): LoadingState {
    return this.loadingState;
  }

  /**
   * Get error information
   */
  getErrorInfo(): TreeErrorInfo | undefined {
    return this.errorInfo;
  }

  refresh(element?: T): void {
    const event: TreeRefreshEvent<T> = {
      element,
      recursive: false,
      reason: 'manual'
    };
    this.doRefresh(event);
  }

  refreshAll(): void {
    const event: TreeRefreshEvent<T> = {
      element: undefined,
      recursive: true,
      reason: 'manual'
    };
    this.doRefresh(event);
  }

  private doRefresh(event: TreeRefreshEvent<T>): void {
    // Clear cache for affected items
    if (event.element) {
      event.element.clearCache();
      if (event.recursive) {
        void event.element.refresh(true);
      }
    } else {
      // Clear all root items cache
      this.rootItems.forEach(item => item.clearCache());
    }
    
    this._onDidChangeTreeData.fire(event.element);
  }

  getParent?(element: T): vscode.ProviderResult<T> {
    // Override in subclasses if parent relationships are needed
    return undefined;
  }

  resolveTreeItem?(
    item: vscode.TreeItem,
    element: T,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TreeItem> {
    // Override in subclasses for lazy loading
    return item;
  }

  registerTreeView(viewId: string, options?: Partial<vscode.TreeViewOptions<T>>): vscode.TreeView<T> {
    this.treeView = vscode.window.createTreeView(viewId, {
      treeDataProvider: this,
      showCollapseAll: true,
      canSelectMany: false,
      ...options,
    });

    // Register common event handlers
    this.setupTreeViewEvents();

    this.context.subscriptions.push(this.treeView);
    return this.treeView;
  }

  private setupTreeViewEvents(): void {
    if (!this.treeView) return;

    // Selection change
    this.treeView.onDidChangeSelection(
      (e: vscode.TreeViewSelectionChangeEvent<T>) => {
        this.onSelectionChanged(e.selection);
      }
    );

    // Visibility change
    this.treeView.onDidChangeVisibility(
      (e: vscode.TreeViewVisibilityChangeEvent) => {
        this.onVisibilityChanged(e.visible);
      }
    );

    // Collapse state change
    this.treeView.onDidCollapseElement(
      (e: vscode.TreeViewExpansionEvent<T>) => {
        this.onElementCollapsed(e.element);
      }
    );

    this.treeView.onDidExpandElement(
      (e: vscode.TreeViewExpansionEvent<T>) => {
        this.onElementExpanded(e.element);
      }
    );
  }

  protected onSelectionChanged(selection: readonly T[]): void {
    // Override in subclasses
  }

  protected onVisibilityChanged(visible: boolean): void {
    // Override in subclasses
  }

  protected onElementCollapsed(element: T): void {
    // Override in subclasses
  }

  protected onElementExpanded(element: T): void {
    // Override in subclasses
  }

  protected createTreeItem(
    data: TreeItemData,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ): vscode.TreeItem {
    const item = new vscode.TreeItem(data.label, collapsibleState);
    
    item.id = data.id;
    item.description = data.description;
    item.tooltip = data.tooltip || data.label;
    item.iconPath = data.iconPath;
    item.contextValue = data.contextValue;

    return item;
  }

  protected registerCommand(command: string, callback: (...args: any[]) => any): void {
    const disposable = vscode.commands.registerCommand(command, callback);
    this.context.subscriptions.push(disposable);
  }

  protected showInformationMessage(message: string): void {
    vscode.window.showInformationMessage(message);
  }

  protected showErrorMessage(message: string): void {
    vscode.window.showErrorMessage(message);
  }

  reveal(element: T, options?: { select?: boolean; focus?: boolean; expand?: boolean | number }): Thenable<void> {
    if (!this.treeView) {
      return Promise.resolve();
    }
    return this.treeView.reveal(element, options);
  }

  get selection(): readonly T[] {
    return this.treeView?.selection ?? [];
  }

  get visible(): boolean {
    return this.treeView?.visible ?? false;
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }
    
    if (this.config.refreshInterval && this.config.refreshInterval > 0) {
      this.refreshTimer = setInterval(() => {
        this.refreshAll();
      }, this.config.refreshInterval);
    }
  }

  /**
   * Stop auto-refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<TreeProviderConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart auto-refresh if interval changed
    if ('refreshInterval' in config) {
      this.stopAutoRefresh();
      if (this.config.refreshInterval) {
        this.startAutoRefresh();
      }
    }
  }

  /**
   * Find tree item by predicate
   */
  async findItem(predicate: (item: T) => boolean): Promise<T | undefined> {
    const searchItems = async (items: T[]): Promise<T | undefined> => {
      for (const item of items) {
        if (predicate(item)) {
          return item;
        }
        
        const children = await item.getChildren();
        if (children.length > 0) {
          const found = await searchItems(children as T[]);
          if (found) {
            return found;
          }
        }
      }
      return undefined;
    };
    
    return searchItems(this.rootItems);
  }

  /**
   * Find all tree items by predicate
   */
  async findAllItems(predicate: (item: T) => boolean): Promise<T[]> {
    const results: T[] = [];
    
    const searchItems = async (items: T[]): Promise<void> => {
      for (const item of items) {
        if (predicate(item)) {
          results.push(item);
        }
        
        const children = await item.getChildren();
        if (children.length > 0) {
          await searchItems(children as T[]);
        }
      }
    };
    
    await searchItems(this.rootItems);
    return results;
  }

  /**
   * Expand tree item to specific depth
   */
  async expandToDepth(element: T | undefined, depth: number): Promise<void> {
    if (!this.treeView) {
      return;
    }
    
    const expandRecursive = async (item: T | undefined, currentDepth: number): Promise<void> => {
      if (currentDepth >= depth) {
        return;
      }
      
      const children = await this.getChildren(item);
      if (!children) {
        return;
      }
      
      for (const child of children) {
        if (child.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
          await this.treeView!.reveal(child, { expand: true });
          await expandRecursive(child, currentDepth + 1);
        }
      }
    };
    
    await expandRecursive(element, 0);
  }

  /**
   * Collapse all tree items
   */
  async collapseAll(): Promise<void> {
    if (!this.treeView) {
      return;
    }
    
    // VS Code doesn't have a direct API to collapse all,
    // so we refresh the tree which collapses everything by default
    this.refreshAll();
  }

  /**
   * Export tree data to JSON
   */
  async exportToJson(): Promise<string> {
    const exportItem = async (item: T): Promise<any> => {
      const data = item.toData();
      const children = await item.getChildren();
      
      if (children.length > 0) {
        const childData = await Promise.all(
          children.map(child => exportItem(child as T))
        );
        return { ...data, children: childData };
      }
      
      return data;
    };
    
    const rootData = await Promise.all(
      this.rootItems.map(item => exportItem(item))
    );
    
    return JSON.stringify(rootData, null, 2);
  }

  /**
   * Get statistics about the tree
   */
  async getStatistics(): Promise<{
    totalItems: number;
    maxDepth: number;
    leafItems: number;
    expandableItems: number;
  }> {
    let totalItems = 0;
    let maxDepth = 0;
    let leafItems = 0;
    let expandableItems = 0;
    
    const analyzeItem = async (item: T, depth: number): Promise<void> => {
      totalItems++;
      maxDepth = Math.max(maxDepth, depth);
      
      if (item.collapsibleState === vscode.TreeItemCollapsibleState.None) {
        leafItems++;
      } else {
        expandableItems++;
      }
      
      const children = await item.getChildren();
      await Promise.all(
        children.map(child => analyzeItem(child as T, depth + 1))
      );
    };
    
    await Promise.all(
      this.rootItems.map(item => analyzeItem(item, 1))
    );
    
    return {
      totalItems,
      maxDepth,
      leafItems,
      expandableItems
    };
  }

  dispose(): void {
    this.stopAutoRefresh();
    this._onDidChangeTreeData.dispose();
    if (this.treeView) {
      this.treeView.dispose();
    }
    this.rootItems.forEach(item => item.dispose());
    this.rootItems = [];
  }
}