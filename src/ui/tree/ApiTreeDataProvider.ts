import * as vscode from 'vscode';
import { BaseTreeDataProvider } from '../base/BaseTreeDataProvider';
import { ApiTreeItem } from './ApiTreeItem';
import { HttpClient } from '../../http/HttpClient';
import { ApiTreeData, TreeProviderConfig, LoadingState, TreeItemType } from '../../types/TreeTypes';

/**
 * Tree data provider for API-based data
 */
export class ApiTreeDataProvider extends BaseTreeDataProvider<ApiTreeItem> {
  private httpClient: HttpClient;
  private apiEndpoint: string;

  constructor(
    context: vscode.ExtensionContext,
    httpClient: HttpClient,
    apiEndpoint: string,
    config: TreeProviderConfig = {}
  ) {
    super(context, config);
    this.httpClient = httpClient;
    this.apiEndpoint = apiEndpoint;
    
    // Register commands
    this.registerCommands();
  }

  getTreeItem(element: ApiTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ApiTreeItem): Promise<ApiTreeItem[]> {
    try {
      // If no element, load root items
      if (!element) {
        return this.loadRootItems();
      }
      
      // Otherwise, get children of the element
      const children = await element.getChildren();
      return children as ApiTreeItem[];
      
    } catch (error) {
      await this.handleError(error, element);
      return [];
    }
  }

  protected async loadData(element?: ApiTreeItem): Promise<ApiTreeItem[]> {
    if (!element) {
      return this.loadRootItems();
    }
    
    const children = await element.getChildren();
    return children as ApiTreeItem[];
  }

  /**
   * Load root items from API
   */
  private async loadRootItems(): Promise<ApiTreeItem[]> {
    // Show loading state
    this.loadingState = LoadingState.LOADING;
    this.errorInfo = undefined;
    
    // Fire change event to show loading state
    if (this.config.showIcons !== false) {
      this._onDidChangeTreeData.fire();
    }
    
    try {
      const response = await this.httpClient.get<ApiTreeData[]>(this.apiEndpoint);
      
      const items: ApiTreeItem[] = [];
      
      if (Array.isArray(response.data)) {
        for (const data of response.data) {
          const item = this.createApiTreeItem(data);
          items.push(item);
        }
      } else if (response.data && typeof response.data === 'object') {
        // Handle single object response
        const item = this.createApiTreeItem(response.data as ApiTreeData);
        items.push(item);
      }
      
      // Update state
      this.loadingState = LoadingState.SUCCESS;
      this.rootItems = items;
      
      return items;
      
    } catch (error) {
      this.loadingState = LoadingState.ERROR;
      
      // Create error item
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data';
      const errorItem = this.createErrorItem(errorMessage);
      
      return [errorItem];
    }
  }

  /**
   * Create a tree item from API data
   */
  private createApiTreeItem(data: ApiTreeData): ApiTreeItem {
    const hasChildren = (data.children && data.children.length > 0) || 
                       data.metadata?.hasChildren || 
                       data.hasMore || 
                       false;
    
    const collapsibleState = hasChildren 
      ? vscode.TreeItemCollapsibleState.Collapsed 
      : vscode.TreeItemCollapsibleState.None;
    
    // Build child endpoint if pattern is provided
    let childEndpoint: string | undefined;
    if (data.metadata?.childEndpointPattern) {
      childEndpoint = data.metadata.childEndpointPattern
        .replace('{id}', data.id)
        .replace('{type}', data.type);
    } else if (data.metadata?.childEndpoint) {
      childEndpoint = data.metadata.childEndpoint;
    }
    
    return new ApiTreeItem(
      data.name,
      collapsibleState,
      data,
      this.httpClient,
      childEndpoint
    );
  }


  /**
   * Create an error item
   */
  private createErrorItem(message: string): ApiTreeItem {
    const errorData: ApiTreeData = {
      id: 'error',
      name: 'Error',
      type: TreeItemType.ERROR,
      metadata: {
        error: message
      }
    };
    
    const item = new ApiTreeItem(
      'Error loading data',
      vscode.TreeItemCollapsibleState.None,
      errorData,
      this.httpClient
    );
    
    item.description = message;
    item.tooltip = `Error: ${message}\nClick to retry`;
    item.command = {
      title: 'Retry',
      command: 'computor.retryApiLoad',
      arguments: []
    };
    
    return item;
  }

  /**
   * Register commands for the tree
   */
  private registerCommands(): void {
    // Load more command
    this.registerCommand('computor.loadMoreApiItems', async (item: ApiTreeItem) => {
      await item.loadMore();
      this._onDidChangeTreeData.fire(item);
    });
    
    // Retry command
    this.registerCommand('computor.retryApiLoad', async () => {
      await this.refresh();
    });
    
    // Refresh command
    this.registerCommand('computor.refreshApiTree', async () => {
      await this.refreshAll();
    });
    
    // Copy item data
    this.registerCommand('computor.copyApiItemData', async (item: ApiTreeItem) => {
      const data = item.data;
      await vscode.env.clipboard.writeText(JSON.stringify(data, null, 2));
      this.showInformationMessage('API data copied to clipboard');
    });
    
    // Open in editor
    this.registerCommand('computor.openApiDataInEditor', async (item: ApiTreeItem) => {
      const data = item.data;
      const content = JSON.stringify(data, null, 2);
      
      const doc = await vscode.workspace.openTextDocument({
        content,
        language: 'json'
      });
      
      await vscode.window.showTextDocument(doc);
    });
  }

  /**
   * Update the API endpoint and refresh
   */
  async updateEndpoint(newEndpoint: string): Promise<void> {
    this.apiEndpoint = newEndpoint;
    await this.refreshAll();
  }

  /**
   * Set HTTP client headers
   */
  setHeaders(headers: Record<string, string>): void {
    this.httpClient.setDefaultHeaders(headers);
  }

  /**
   * Get current loading state
   */
  getLoadingState(): LoadingState {
    return this.loadingState;
  }

  /**
   * Find item by API ID
   */
  async findItemById(id: string): Promise<ApiTreeItem | undefined> {
    return this.findItem(item => {
      const data = item.data as ApiTreeData;
      return data.id === id;
    });
  }

  /**
   * Find items by type
   */
  async findItemsByType(type: string): Promise<ApiTreeItem[]> {
    return this.findAllItems(item => {
      const data = item.data as ApiTreeData;
      return data.type === type;
    });
  }

  /**
   * Expand all items of a specific type
   */
  async expandItemsByType(type: string): Promise<void> {
    const items = await this.findItemsByType(type);
    
    for (const item of items) {
      if (item.collapsibleState !== vscode.TreeItemCollapsibleState.None) {
        await this.reveal(item, { expand: true });
      }
    }
  }

  /**
   * Get total item count
   */
  async getItemCount(): Promise<number> {
    const stats = await this.getStatistics();
    return stats.totalItems;
  }

  dispose(): void {
    // Clean up - HttpClient doesn't have a cancelAll method
    // Individual requests are cancelled via AbortController
    super.dispose();
  }
}