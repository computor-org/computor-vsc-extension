import * as vscode from 'vscode';
import { BaseTreeItem } from '../base/BaseTreeItem';
import { JsonValue, TreeItemType, TreeItemIcons } from '../../types/TreeTypes';

/**
 * Tree item for displaying JSON data
 */
export class JsonTreeItem extends BaseTreeItem {
  private jsonValue: JsonValue;
  private path: string[];
  public readonly key: string | number;

  constructor(
    key: string | number,
    value: JsonValue,
    path: string[] = [],
    collapsibleState?: vscode.TreeItemCollapsibleState
  ) {
    // Determine label and collapsible state
    const label = JsonTreeItem.createLabel(key, value);
    const state = collapsibleState ?? JsonTreeItem.getCollapsibleState(value);
    
    super(label, state, value);
    
    this.key = key;
    this.jsonValue = value;
    this.path = [...path, String(key)];
    
    // Set icon and description
    this.setIconAndDescription();
    
    // Set tooltip
    this.tooltip = this.createTooltip();
  }

  /**
   * Create label for the tree item
   */
  private static createLabel(key: string | number, value: JsonValue): string {
    const keyStr = String(key);
    
    if (value === null) {
      return `${keyStr}: null`;
    }
    
    if (typeof value === 'boolean') {
      return `${keyStr}: ${value}`;
    }
    
    if (typeof value === 'number') {
      return `${keyStr}: ${value}`;
    }
    
    if (typeof value === 'string') {
      const preview = value.length > 50 ? value.substring(0, 50) + '...' : value;
      return `${keyStr}: "${preview}"`;
    }
    
    if (Array.isArray(value)) {
      return keyStr;
    }
    
    if (typeof value === 'object') {
      return keyStr;
    }
    
    return keyStr;
  }

  /**
   * Get collapsible state based on value type
   */
  private static getCollapsibleState(value: JsonValue): vscode.TreeItemCollapsibleState {
    if (Array.isArray(value) && value.length > 0) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }
    
    if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
      return vscode.TreeItemCollapsibleState.Collapsed;
    }
    
    return vscode.TreeItemCollapsibleState.None;
  }

  /**
   * Set icon and description based on value type
   */
  private setIconAndDescription(): void {
    const value = this.jsonValue;
    
    if (value === null) {
      this.iconPath = TreeItemIcons[TreeItemType.VALUE];
      this.description = 'null';
    } else if (typeof value === 'boolean') {
      this.iconPath = TreeItemIcons[TreeItemType.VALUE];
      this.description = 'boolean';
    } else if (typeof value === 'number') {
      this.iconPath = TreeItemIcons[TreeItemType.VALUE];
      this.description = 'number';
    } else if (typeof value === 'string') {
      this.iconPath = TreeItemIcons[TreeItemType.VALUE];
      this.description = 'string';
    } else if (Array.isArray(value)) {
      this.iconPath = TreeItemIcons[TreeItemType.ARRAY];
      this.description = `[${value.length}]`;
    } else if (typeof value === 'object') {
      this.iconPath = TreeItemIcons[TreeItemType.OBJECT];
      const keys = Object.keys(value);
      this.description = `{${keys.length}}`;
    }
  }

  /**
   * Create tooltip for the tree item
   */
  private createTooltip(): string {
    const value = this.jsonValue;
    const path = this.path.join('.');
    
    if (typeof value === 'string' && value.length > 50) {
      return `Path: ${path}\nType: string\nValue: ${value}`;
    }
    
    if (Array.isArray(value)) {
      return `Path: ${path}\nType: array\nLength: ${value.length}`;
    }
    
    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      return `Path: ${path}\nType: object\nKeys: ${keys.length}`;
    }
    
    return `Path: ${path}\nType: ${typeof value}\nValue: ${value}`;
  }

  getContextValue(): string {
    const contexts = ['jsonTreeItem'];
    
    if (this.jsonValue === null) {
      contexts.push('null');
    } else if (Array.isArray(this.jsonValue)) {
      contexts.push('array');
    } else {
      contexts.push(typeof this.jsonValue);
    }
    
    // Add copyable context for leaf nodes
    if (this.collapsibleState === vscode.TreeItemCollapsibleState.None) {
      contexts.push('copyable');
    }
    
    return contexts.join('.');
  }

  async getChildren(): Promise<BaseTreeItem[]> {
    // Check cache first
    const cached = this.getCachedChildren();
    if (cached) {
      return cached;
    }
    
    const children: JsonTreeItem[] = [];
    const value = this.jsonValue;
    
    if (Array.isArray(value)) {
      // Handle array
      value.forEach((item, index) => {
        const child = new JsonTreeItem(index, item, this.path);
        child.parent = this;
        children.push(child);
      });
    } else if (typeof value === 'object' && value !== null) {
      // Handle object
      Object.entries(value).forEach(([key, val]) => {
        const child = new JsonTreeItem(key, val, this.path);
        child.parent = this;
        children.push(child);
      });
      
      // Sort object keys alphabetically
      children.sort((a, b) => String(a.key).localeCompare(String(b.key)));
    }
    
    // Cache the children
    this.setCachedChildren(children);
    
    return children;
  }

  /**
   * Get the JSON path to this item
   */
  getJsonPath(): string {
    return this.path.join('.');
  }

  /**
   * Get the JSON value at this node
   */
  getValue(): JsonValue {
    return this.jsonValue;
  }

  /**
   * Get value as formatted string
   */
  getFormattedValue(): string {
    if (typeof this.jsonValue === 'string') {
      return this.jsonValue;
    }
    
    return JSON.stringify(this.jsonValue, null, 2);
  }

  /**
   * Search for items containing the given text
   */
  async search(searchText: string, caseSensitive: boolean = false): Promise<JsonTreeItem[]> {
    const results: JsonTreeItem[] = [];
    const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
    
    const searchInItem = async (item: JsonTreeItem): Promise<void> => {
      const value = item.getValue();
      let matches = false;
      
      if (typeof value === 'string') {
        const compareValue = caseSensitive ? value : value.toLowerCase();
        matches = compareValue.includes(searchLower);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        matches = String(value).includes(searchText);
      }
      
      // Check key name
      const keyStr = String(item.key);
      const compareKey = caseSensitive ? keyStr : keyStr.toLowerCase();
      if (compareKey.includes(searchLower)) {
        matches = true;
      }
      
      if (matches) {
        results.push(item);
      }
      
      // Search children
      const children = await item.getChildren();
      for (const child of children) {
        if (child instanceof JsonTreeItem) {
          await searchInItem(child);
        }
      }
    };
    
    await searchInItem(this);
    return results;
  }

  /**
   * Filter tree to show only matching items
   */
  async filter(predicate: (item: JsonTreeItem) => boolean): Promise<JsonTreeItem | undefined> {
    if (predicate(this)) {
      return this;
    }
    
    const children = await this.getChildren();
    const filteredChildren: JsonTreeItem[] = [];
    
    for (const child of children) {
      if (child instanceof JsonTreeItem) {
        const filtered = await child.filter(predicate);
        if (filtered) {
          filteredChildren.push(filtered);
        }
      }
    }
    
    if (filteredChildren.length > 0) {
      // Create a new item with filtered children
      const filtered = new JsonTreeItem(this.key, this.jsonValue, this.path.slice(0, -1));
      filtered.setCachedChildren(filteredChildren);
      return filtered;
    }
    
    return undefined;
  }

  clone(): JsonTreeItem {
    return new JsonTreeItem(
      this.key,
      this.jsonValue,
      this.path.slice(0, -1),
      this.collapsibleState
    );
  }
}