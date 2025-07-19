import * as vscode from 'vscode';
import { BaseTreeItem } from '../base/BaseTreeItem';
import { ApiTreeData, TreeItemType, TreeItemIcons, PaginationOptions } from '../../types/TreeTypes';
import { HttpClient } from '../../http/HttpClient';

/**
 * Tree item for displaying API-based data
 */
export class ApiTreeItem extends BaseTreeItem {
  private httpClient: HttpClient;
  private childEndpoint?: string;
  private paginationOptions?: PaginationOptions;
  private hasMorePages: boolean = false;
  private isLoadingMore: boolean = false;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    apiData: ApiTreeData,
    httpClient: HttpClient,
    childEndpoint?: string
  ) {
    super(label, collapsibleState, apiData);
    this.httpClient = httpClient;
    this.childEndpoint = childEndpoint;
    
    // Set icon based on type
    this.iconPath = apiData.type ? TreeItemIcons[apiData.type as TreeItemType] : TreeItemIcons[TreeItemType.API];
    
    // Set tooltip
    this.tooltip = apiData.metadata?.description || this.label;
    
    // Set description if available
    if (apiData.metadata?.count !== undefined) {
      this.description = `(${apiData.metadata.count})`;
    }
    
    // Check if has more pages
    this.hasMorePages = apiData.hasMore || false;
    if (apiData.nextPage) {
      this.paginationOptions = { cursor: apiData.nextPage };
    }
  }

  getContextValue(): string {
    const apiData = this._data as ApiTreeData;
    const contexts = ['apiTreeItem', apiData.type];
    
    if (this.hasMorePages) {
      contexts.push('hasMore');
    }
    
    if (apiData.metadata?.editable) {
      contexts.push('editable');
    }
    
    if (apiData.metadata?.deletable) {
      contexts.push('deletable');
    }
    
    return contexts.filter(Boolean).join('.');
  }

  async getChildren(): Promise<BaseTreeItem[]> {
    // Check cache first
    const cached = this.getCachedChildren();
    if (cached) {
      return cached;
    }
    
    const children: BaseTreeItem[] = [];
    const apiData = this._data as ApiTreeData;
    
    try {
      // If has static children, use them
      if (apiData.children && apiData.children.length > 0) {
        for (const childData of apiData.children) {
          const child = this.createChildItem(childData);
          child.parent = this;
          children.push(child);
        }
      }
      // If has dynamic endpoint, fetch children
      else if (this.childEndpoint) {
        const response = await this.httpClient.get<ApiTreeData[]>(this.childEndpoint, {
          params: this.paginationOptions
        });
        
        if (Array.isArray(response.data)) {
          for (const childData of response.data) {
            const child = this.createChildItem(childData);
            child.parent = this;
            children.push(child);
          }
        }
      }
      
      // Add "Load More" item if has more pages
      if (this.hasMorePages && !this.isLoadingMore) {
        const loadMoreItem = new LoadMoreTreeItem(this);
        children.push(loadMoreItem);
      }
      
      // Cache the children
      this.setCachedChildren(children);
      
    } catch (error) {
      // Create error item
      const errorItem = new ErrorTreeItem(
        'Failed to load items',
        error instanceof Error ? error.message : String(error)
      );
      errorItem.parent = this;
      children.push(errorItem);
    }
    
    return children;
  }

  /**
   * Create a child tree item from API data
   */
  private createChildItem(childData: ApiTreeData): ApiTreeItem {
    const hasChildren = (childData.children && childData.children.length > 0) || 
                       childData.metadata?.hasChildren || 
                       false;
    
    const collapsibleState = hasChildren 
      ? vscode.TreeItemCollapsibleState.Collapsed 
      : vscode.TreeItemCollapsibleState.None;
    
    // Build child endpoint if pattern is provided
    let childEndpoint: string | undefined;
    if (childData.metadata?.childEndpointPattern) {
      childEndpoint = childData.metadata.childEndpointPattern
        .replace('{id}', childData.id)
        .replace('{type}', childData.type);
    }
    
    return new ApiTreeItem(
      childData.name,
      collapsibleState,
      childData,
      this.httpClient,
      childEndpoint
    );
  }

  /**
   * Load more items (for pagination)
   */
  async loadMore(): Promise<void> {
    if (!this.hasMorePages || this.isLoadingMore) {
      return;
    }
    
    this.isLoadingMore = true;
    
    try {
      const response = await this.httpClient.get<{
        data: ApiTreeData[];
        hasMore?: boolean;
        nextPage?: string;
      }>(this.childEndpoint!, {
        params: this.paginationOptions
      });
      
      const existingChildren = await this.getChildren();
      const newChildren: BaseTreeItem[] = [];
      
      // Remove the "Load More" item
      const filteredChildren = existingChildren.filter(
        child => !(child instanceof LoadMoreTreeItem)
      );
      
      // Add new items
      if (Array.isArray(response.data.data)) {
        for (const childData of response.data.data) {
          const child = this.createChildItem(childData);
          child.parent = this;
          newChildren.push(child);
        }
      }
      
      // Update pagination
      this.hasMorePages = response.data.hasMore || false;
      if (response.data.nextPage) {
        this.paginationOptions = { cursor: response.data.nextPage };
      }
      
      // Add "Load More" item if still has more
      if (this.hasMorePages) {
        const loadMoreItem = new LoadMoreTreeItem(this);
        newChildren.push(loadMoreItem);
      }
      
      // Update cache
      const allChildren = [...filteredChildren, ...newChildren];
      this.setCachedChildren(allChildren);
      
    } finally {
      this.isLoadingMore = false;
    }
  }

  clone(): ApiTreeItem {
    const cloned = new ApiTreeItem(
      this.label?.toString() || '',
      this.collapsibleState || vscode.TreeItemCollapsibleState.None,
      this._data as ApiTreeData,
      this.httpClient,
      this.childEndpoint
    );
    
    cloned.paginationOptions = this.paginationOptions;
    cloned.hasMorePages = this.hasMorePages;
    
    return cloned;
  }
}

/**
 * Special tree item for "Load More" functionality
 */
class LoadMoreTreeItem extends BaseTreeItem {
  private parentItem: ApiTreeItem;

  constructor(parentItem: ApiTreeItem) {
    super('Load More...', vscode.TreeItemCollapsibleState.None);
    this.parentItem = parentItem;
    this.iconPath = TreeItemIcons[TreeItemType.LOADING];
    this.tooltip = 'Click to load more items';
    this.command = {
      title: 'Load More',
      command: 'computor.loadMoreApiItems',
      arguments: [parentItem]
    };
  }

  getContextValue(): string {
    return 'loadMoreTreeItem';
  }

  async getChildren(): Promise<BaseTreeItem[]> {
    return [];
  }

  clone(): LoadMoreTreeItem {
    return new LoadMoreTreeItem(this.parentItem);
  }
}

/**
 * Tree item for displaying errors
 */
class ErrorTreeItem extends BaseTreeItem {
  constructor(label: string, errorMessage: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = TreeItemIcons[TreeItemType.ERROR];
    this.tooltip = errorMessage;
    this.description = 'Error';
  }

  getContextValue(): string {
    return 'errorTreeItem';
  }

  async getChildren(): Promise<BaseTreeItem[]> {
    return [];
  }

  clone(): ErrorTreeItem {
    return new ErrorTreeItem(
      this.label?.toString() || '',
      this.tooltip?.toString() || ''
    );
  }
}