import * as vscode from 'vscode';
import { TreeItemData, CacheEntry } from '../../types/TreeTypes';

/**
 * Abstract base class for tree items that extends VS Code's TreeItem
 * Provides common functionality for all tree item types
 */
export abstract class BaseTreeItem extends vscode.TreeItem {
  protected _children: BaseTreeItem[] | undefined;
  protected _parent: BaseTreeItem | undefined;
  protected _data: any;
  protected _metadata: Record<string, any> = {};
  private _cache: Map<string, CacheEntry<any>> = new Map();

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    data?: any
  ) {
    super(label, collapsibleState);
    this._data = data;
    this.contextValue = this.getContextValue();
  }

  /**
   * Get children of this tree item
   * Must be implemented by subclasses
   */
  abstract getChildren(): Promise<BaseTreeItem[]> | BaseTreeItem[];

  /**
   * Get the context value for this tree item
   * Used for command enablement and context menus
   */
  abstract getContextValue(): string;

  /**
   * Get the parent of this tree item
   */
  get parent(): BaseTreeItem | undefined {
    return this._parent;
  }

  /**
   * Set the parent of this tree item
   */
  set parent(parent: BaseTreeItem | undefined) {
    this._parent = parent;
  }

  /**
   * Get the underlying data for this tree item
   */
  get data(): any {
    return this._data;
  }

  /**
   * Get metadata for this tree item
   */
  get metadata(): Record<string, any> {
    return this._metadata;
  }

  /**
   * Set metadata for this tree item
   */
  setMetadata(key: string, value: any): void {
    this._metadata[key] = value;
  }

  /**
   * Get cached children if available
   */
  protected getCachedChildren(): BaseTreeItem[] | undefined {
    const cached = this._cache.get('children');
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    this._cache.delete('children');
    return undefined;
  }

  /**
   * Cache children for future use
   */
  protected setCachedChildren(children: BaseTreeItem[], ttl: number = 60000): void {
    this._cache.set('children', {
      data: children,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this._cache.clear();
    this._children = undefined;
  }

  /**
   * Refresh this tree item and optionally its children
   */
  async refresh(recursive: boolean = false): Promise<void> {
    this.clearCache();
    
    if (recursive && this.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
      const children = await this.getChildren();
      for (const child of children) {
        if (child instanceof BaseTreeItem) {
          await child.refresh(recursive);
        }
      }
    }
  }

  /**
   * Find a child tree item by predicate
   */
  async findChild(predicate: (item: BaseTreeItem) => boolean): Promise<BaseTreeItem | undefined> {
    const children = await this.getChildren();
    return children.find(predicate);
  }

  /**
   * Find all descendant tree items by predicate
   */
  async findDescendants(predicate: (item: BaseTreeItem) => boolean): Promise<BaseTreeItem[]> {
    const results: BaseTreeItem[] = [];
    const children = await this.getChildren();
    
    for (const child of children) {
      if (predicate(child)) {
        results.push(child);
      }
      if (child instanceof BaseTreeItem && child.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
        const descendants = await child.findDescendants(predicate);
        results.push(...descendants);
      }
    }
    
    return results;
  }

  /**
   * Get the path from root to this item
   */
  getPath(): BaseTreeItem[] {
    const path: BaseTreeItem[] = [this];
    let current = this.parent;
    
    while (current) {
      path.unshift(current);
      current = current.parent;
    }
    
    return path;
  }

  /**
   * Get the depth of this item in the tree
   */
  getDepth(): number {
    let depth = 0;
    let current = this.parent;
    
    while (current) {
      depth++;
      current = current.parent;
    }
    
    return depth;
  }

  /**
   * Check if this item is an ancestor of another item
   */
  isAncestorOf(item: BaseTreeItem): boolean {
    let current = item.parent;
    
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parent;
    }
    
    return false;
  }

  /**
   * Check if this item is a descendant of another item
   */
  isDescendantOf(item: BaseTreeItem): boolean {
    return item.isAncestorOf(this);
  }

  /**
   * Sort children by a comparator function
   */
  async sortChildren(compareFn: (a: BaseTreeItem, b: BaseTreeItem) => number): Promise<void> {
    const children = await this.getChildren();
    children.sort(compareFn);
    this.setCachedChildren(children);
  }

  /**
   * Convert this tree item to a plain data object
   */
  toData(): TreeItemData {
    return {
      id: this.id || '',
      label: this.label?.toString() || '',
      description: this.description?.toString(),
      tooltip: this.tooltip?.toString(),
      iconPath: this.iconPath as any,
      contextValue: this.contextValue,
      command: this.command,
      resourceUri: this.resourceUri,
      metadata: this._metadata
    };
  }

  /**
   * Create a copy of this tree item
   */
  abstract clone(): BaseTreeItem;

  /**
   * Dispose of any resources held by this tree item
   */
  dispose(): void {
    this.clearCache();
    this._parent = undefined;
    this._children = undefined;
    this._data = undefined;
    this._metadata = {};
  }
}