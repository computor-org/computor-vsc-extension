import * as vscode from 'vscode';
import { BaseTreeDataProvider } from '../base/BaseTreeDataProvider';
import { JsonTreeItem } from './JsonTreeItem';
import { JsonValue, TreeProviderConfig, LoadingState } from '../../types/TreeTypes';

/**
 * Tree data provider for JSON data
 */
export class JsonTreeDataProvider extends BaseTreeDataProvider<JsonTreeItem> {
  private jsonData: JsonValue;
  private rootKey: string;
  private searchResults: JsonTreeItem[] = [];
  private isSearchMode: boolean = false;

  constructor(
    context: vscode.ExtensionContext,
    jsonData: JsonValue,
    rootKey: string = 'root',
    config: TreeProviderConfig = {}
  ) {
    super(context, config);
    this.jsonData = jsonData;
    this.rootKey = rootKey;
    
    // Register commands
    this.registerCommands();
    
    // Initial load
    void this.loadInitialData();
  }

  getTreeItem(element: JsonTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: JsonTreeItem): Promise<JsonTreeItem[]> {
    try {
      // If in search mode and no element, return search results
      if (this.isSearchMode && !element) {
        return this.searchResults;
      }
      
      // If no element, return root items
      if (!element) {
        return this.loadRootItems();
      }
      
      // Get children of the element
      const children = await element.getChildren();
      return children as JsonTreeItem[];
      
    } catch (error) {
      await this.handleError(error, element);
      return [];
    }
  }

  protected async loadData(element?: JsonTreeItem): Promise<JsonTreeItem[]> {
    if (!element) {
      return this.loadRootItems();
    }
    
    const children = await element.getChildren();
    return children as JsonTreeItem[];
  }

  /**
   * Load initial data
   */
  private async loadInitialData(): Promise<void> {
    this.loadingState = LoadingState.LOADING;
    this.errorInfo = undefined;
    
    try {
      this.rootItems = await this.loadRootItems();
      this.loadingState = LoadingState.SUCCESS;
      this._onDidChangeTreeData.fire();
    } catch (error) {
      this.loadingState = LoadingState.ERROR;
      await this.handleError(error);
    }
  }

  /**
   * Load root items from JSON data
   */
  private async loadRootItems(): Promise<JsonTreeItem[]> {
    const items: JsonTreeItem[] = [];
    
    if (this.jsonData === null || this.jsonData === undefined) {
      // Handle null/undefined
      const item = new JsonTreeItem(this.rootKey, null);
      items.push(item);
    } else if (Array.isArray(this.jsonData)) {
      // If root is an array, create items for each element
      this.jsonData.forEach((value, index) => {
        const item = new JsonTreeItem(index, value);
        items.push(item);
      });
    } else if (typeof this.jsonData === 'object') {
      // If root is an object, create items for each property
      Object.entries(this.jsonData).forEach(([key, value]) => {
        const item = new JsonTreeItem(key, value);
        items.push(item);
      });
    } else {
      // For primitive values, create a single item
      const item = new JsonTreeItem(this.rootKey, this.jsonData);
      items.push(item);
    }
    
    this.rootItems = items;
    return items;
  }

  /**
   * Update JSON data and refresh tree
   */
  async updateData(jsonData: JsonValue, rootKey?: string): Promise<void> {
    this.jsonData = jsonData;
    if (rootKey !== undefined) {
      this.rootKey = rootKey;
    }
    
    this.clearSearch();
    await this.loadInitialData();
  }

  /**
   * Search for text in JSON values and keys
   */
  async search(searchText: string, caseSensitive: boolean = false): Promise<void> {
    if (!searchText) {
      this.clearSearch();
      return;
    }
    
    this.loadingState = LoadingState.LOADING;
    this._onDidChangeTreeData.fire();
    
    try {
      const results: JsonTreeItem[] = [];
      
      // Search in all root items
      for (const rootItem of this.rootItems) {
        const itemResults = await rootItem.search(searchText, caseSensitive);
        results.push(...itemResults);
      }
      
      this.searchResults = results;
      this.isSearchMode = true;
      this.loadingState = LoadingState.SUCCESS;
      
      // Update tree
      this._onDidChangeTreeData.fire();
      
      // Show result count
      const message = results.length === 0 
        ? `No results found for "${searchText}"`
        : `Found ${results.length} results for "${searchText}"`;
      this.showInformationMessage(message);
      
    } catch (error) {
      this.loadingState = LoadingState.ERROR;
      await this.handleError(error);
    }
  }

  /**
   * Clear search and restore normal view
   */
  clearSearch(): void {
    this.searchResults = [];
    this.isSearchMode = false;
    this._onDidChangeTreeData.fire();
  }

  /**
   * Filter tree by predicate
   */
  async filter(predicate: (item: JsonTreeItem) => boolean): Promise<void> {
    this.loadingState = LoadingState.LOADING;
    this._onDidChangeTreeData.fire();
    
    try {
      const filteredItems: JsonTreeItem[] = [];
      
      for (const rootItem of this.rootItems) {
        const filtered = await rootItem.filter(predicate);
        if (filtered) {
          filteredItems.push(filtered);
        }
      }
      
      this.searchResults = filteredItems;
      this.isSearchMode = true;
      this.loadingState = LoadingState.SUCCESS;
      
      this._onDidChangeTreeData.fire();
      
    } catch (error) {
      this.loadingState = LoadingState.ERROR;
      await this.handleError(error);
    }
  }

  /**
   * Register commands for the tree
   */
  private registerCommands(): void {
    // Copy value command
    this.registerCommand('computor.copyJsonValue', async (item: JsonTreeItem) => {
      const value = item.getFormattedValue();
      await vscode.env.clipboard.writeText(value);
      this.showInformationMessage('Value copied to clipboard');
    });
    
    // Copy path command
    this.registerCommand('computor.copyJsonPath', async (item: JsonTreeItem) => {
      const path = item.getJsonPath();
      await vscode.env.clipboard.writeText(path);
      this.showInformationMessage('Path copied to clipboard');
    });
    
    // Open in editor
    this.registerCommand('computor.openJsonInEditor', async (item?: JsonTreeItem) => {
      const data = item ? item.getValue() : this.jsonData;
      const content = JSON.stringify(data, null, 2);
      
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'json'
      });
      
      await vscode.window.showTextDocument(doc);
    });
    
    // Search command
    this.registerCommand('computor.searchJson', async () => {
      const searchText = await vscode.window.showInputBox({
        prompt: 'Enter search text',
        placeHolder: 'Search in keys and values...'
      });
      
      if (searchText !== undefined) {
        await this.search(searchText);
      }
    });
    
    // Clear search
    this.registerCommand('computor.clearJsonSearch', () => {
      this.clearSearch();
      this.showInformationMessage('Search cleared');
    });
    
    // Expand all
    this.registerCommand('computor.expandAllJson', async () => {
      await this.expandToDepth(undefined, this.config.maxDepth || 10);
    });
    
    // Collapse all
    this.registerCommand('computor.collapseAllJson', async () => {
      await this.collapseAll();
    });
    
    // Show statistics
    this.registerCommand('computor.jsonStatistics', async () => {
      const stats = await this.getStatistics();
      const message = `JSON Statistics:\n` +
        `Total Items: ${stats.totalItems}\n` +
        `Max Depth: ${stats.maxDepth}\n` +
        `Leaf Items: ${stats.leafItems}\n` +
        `Expandable Items: ${stats.expandableItems}`;
      
      await vscode.window.showInformationMessage(message, { modal: true });
    });
  }

  /**
   * Find item by JSON path
   */
  async findItemByPath(path: string): Promise<JsonTreeItem | undefined> {
    const pathParts = path.split('.');
    
    // Start from root
    let current: JsonTreeItem | undefined;
    const rootItems = await this.loadRootItems();
    
    // Find root item
    current = rootItems.find(item => String(item.key) === pathParts[0]);
    if (!current) {
      return undefined;
    }
    
    // Navigate through path
    for (let i = 1; i < pathParts.length; i++) {
      const children = await current.getChildren();
      current = children.find(child => 
        child instanceof JsonTreeItem && String(child.key) === pathParts[i]
      ) as JsonTreeItem | undefined;
      
      if (!current) {
        return undefined;
      }
    }
    
    return current;
  }

  /**
   * Get all leaf items (non-expandable items)
   */
  async getLeafItems(): Promise<JsonTreeItem[]> {
    return this.findAllItems(item => 
      item.collapsibleState === vscode.TreeItemCollapsibleState.None
    );
  }

  /**
   * Export visible tree to JSON
   */
  async exportVisibleTree(): Promise<string> {
    if (this.isSearchMode) {
      // Export search results
      const data = this.searchResults.map(item => ({
        path: item.getJsonPath(),
        value: item.getValue()
      }));
      return JSON.stringify(data, null, 2);
    }
    
    // Export full tree
    return this.exportToJson();
  }

  /**
   * Get the current JSON data
   */
  getData(): JsonValue {
    return this.jsonData;
  }

  /**
   * Check if currently in search mode
   */
  isInSearchMode(): boolean {
    return this.isSearchMode;
  }
}