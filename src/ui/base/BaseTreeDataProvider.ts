import * as vscode from 'vscode';
import { TreeItemData } from '../types';

export abstract class BaseTreeDataProvider<T> implements vscode.TreeDataProvider<T> {
  private _onDidChangeTreeData = new vscode.EventEmitter<T | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  protected context: vscode.ExtensionContext;
  protected treeView: vscode.TreeView<T> | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  abstract getTreeItem(element: T): vscode.TreeItem | Thenable<vscode.TreeItem>;
  abstract getChildren(element?: T): vscode.ProviderResult<T[]>;

  refresh(element?: T): void {
    this._onDidChangeTreeData.fire(element);
  }

  refreshAll(): void {
    this._onDidChangeTreeData.fire();
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

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    if (this.treeView) {
      this.treeView.dispose();
    }
  }
}