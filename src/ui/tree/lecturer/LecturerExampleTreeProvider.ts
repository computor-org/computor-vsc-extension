import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { 
  ExampleRepositoryList,
  ExampleList
} from '../../../types/generated';

// Export tree items for use in commands
export { ExampleRepositoryTreeItem, ExampleTreeItem };

// Tree items for example view
class ExampleRepositoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repository: ExampleRepositoryList,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(repository.name, collapsibleState);
    this.id = `example-repo-${repository.id}`;
    this.contextValue = 'exampleRepository';
    this.iconPath = new vscode.ThemeIcon('repo');
    this.tooltip = repository.description || repository.name;
    this.description = repository.source_type;
  }
}

class ExampleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly example: ExampleList,
    public readonly repository: ExampleRepositoryList
  ) {
    super(example.title, vscode.TreeItemCollapsibleState.None);
    this.id = `example-${example.id}`;
    this.contextValue = 'example';
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
    
    // Make it draggable for drag & drop to course content
    this.command = undefined; // No default action on click
  }

  private getTooltip(): string {
    const parts = [
      `Title: ${this.example.title}`,
      `Identifier: ${this.example.identifier}`,
      `Directory: ${this.example.directory}`
    ];
    
    if (this.example.subject) {
      parts.push(`Subject: ${this.example.subject}`);
    }
    
    if (this.example.category) {
      parts.push(`Category: ${this.example.category}`);
    }
    
    if (this.example.tags && this.example.tags.length > 0) {
      parts.push(`Tags: ${this.example.tags.join(', ')}`);
    }
    
    return parts.join('\n');
  }

  private getDescription(): string {
    const parts = [];
    
    if (this.example.category) {
      parts.push(this.example.category);
    }
    
    if (this.example.tags && this.example.tags.length > 0) {
      const tagStr = this.example.tags.slice(0, 2).join(', ');
      parts.push(`[${tagStr}${this.example.tags.length > 2 ? '...' : ''}]`);
    }
    
    return parts.join(' ');
  }
}

export class LecturerExampleTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.TreeDragAndDropController<ExampleTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  public readonly dropMimeTypes: string[] = [];
  public readonly dragMimeTypes = ['application/vnd.code.tree.computorexample'];

  private apiService: ComputorApiService;
  private searchQuery: string = '';
  private selectedCategory: string | undefined;
  private selectedTags: string[] = [];
  
  // Caches
  private repositoriesCache: ExampleRepositoryList[] | null = null;
  private examplesCache: Map<string, ExampleList[]> = new Map();

  constructor(
    context: vscode.ExtensionContext,
    providedApiService?: ComputorApiService
  ) {
    this.apiService = providedApiService || new ComputorApiService(context);
  }

  refresh(): void {
    // Clear caches
    this.repositoriesCache = null;
    this.examplesCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  refreshNode(element?: vscode.TreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      if (!element) {
        // Root level - show search filter if active, then example repositories
        const items: vscode.TreeItem[] = [];
        
        // Add search filter indicator if search is active
        if (this.searchQuery) {
          const searchItem = new vscode.TreeItem(
            `🔍 Search: "${this.searchQuery}"`,
            vscode.TreeItemCollapsibleState.None
          );
          searchItem.contextValue = 'searchFilter';
          searchItem.tooltip = `Current search filter: ${this.searchQuery}\nClick to clear`;
          searchItem.command = {
            command: 'computor.lecturer.clearSearch',
            title: 'Clear Search',
            arguments: []
          };
          items.push(searchItem);
        }
        
        // Add category filter indicator if active
        if (this.selectedCategory) {
          const categoryItem = new vscode.TreeItem(
            `📁 Category: ${this.selectedCategory}`,
            vscode.TreeItemCollapsibleState.None
          );
          categoryItem.contextValue = 'categoryFilter';
          categoryItem.tooltip = `Current category filter: ${this.selectedCategory}\nClick to clear`;
          categoryItem.command = {
            command: 'computor.lecturer.clearCategoryFilter',
            title: 'Clear Category Filter',
            arguments: []
          };
          items.push(categoryItem);
        }
        
        // Add tags filter indicator if active
        if (this.selectedTags.length > 0) {
          const tagsItem = new vscode.TreeItem(
            `🏷️ Tags: ${this.selectedTags.join(', ')}`,
            vscode.TreeItemCollapsibleState.None
          );
          tagsItem.contextValue = 'tagsFilter';
          tagsItem.tooltip = `Current tags filter: ${this.selectedTags.join(', ')}\nClick to clear`;
          tagsItem.command = {
            command: 'computor.lecturer.clearTagsFilter',
            title: 'Clear Tags Filter',
            arguments: []
          };
          items.push(tagsItem);
        }
        
        // Add repositories
        const repositories = await this.getExampleRepositories();
        items.push(...repositories);
        
        return items;
      }

      if (element instanceof ExampleRepositoryTreeItem) {
        // Show examples in this repository
        return this.getExamplesForRepository(element.repository);
      }

      return [];
    } catch (error) {
      console.error('Failed to load example tree data:', error);
      vscode.window.showErrorMessage(`Failed to load examples: ${error}`);
      return [];
    }
  }

  private async getExampleRepositories(): Promise<ExampleRepositoryTreeItem[]> {
    if (!this.repositoriesCache) {
      try {
        // Fetch example repositories from API
        this.repositoriesCache = await this.apiService.getExampleRepositories();
        console.log(`Loaded ${this.repositoriesCache.length} example repositories`);
      } catch (error) {
        console.error('Failed to load example repositories:', error);
        vscode.window.showErrorMessage(`Failed to load example repositories: ${error}`);
        this.repositoriesCache = [];
      }
    }

    return this.repositoriesCache.map(repo => 
      new ExampleRepositoryTreeItem(repo)
    );
  }

  private async getExamplesForRepository(repository: ExampleRepositoryList): Promise<ExampleTreeItem[]> {
    const cacheKey = repository.id;
    
    if (!this.examplesCache.has(cacheKey)) {
      try {
        // Fetch examples for this repository from API
        const examples = await this.apiService.getExamples(repository.id);
        console.log(`Loaded ${examples.length} examples for repository ${repository.name}`);
        this.examplesCache.set(cacheKey, examples);
      } catch (error) {
        console.error(`Failed to load examples for repository ${repository.name}:`, error);
        vscode.window.showErrorMessage(`Failed to load examples: ${error}`);
        this.examplesCache.set(cacheKey, []);
      }
    }

    const examples = this.examplesCache.get(cacheKey) || [];
    
    // Apply filters if any
    let filteredExamples = examples;
    
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filteredExamples = filteredExamples.filter(ex =>
        ex.title.toLowerCase().includes(query) ||
        ex.identifier.toLowerCase().includes(query) ||
        ex.directory.toLowerCase().includes(query) ||
        (ex.tags && ex.tags.some(tag => tag.toLowerCase().includes(query)))
      );
    }
    
    if (this.selectedCategory) {
      filteredExamples = filteredExamples.filter(ex =>
        ex.category === this.selectedCategory
      );
    }
    
    if (this.selectedTags.length > 0) {
      filteredExamples = filteredExamples.filter(ex =>
        ex.tags && this.selectedTags.every(tag => ex.tags?.includes(tag))
      );
    }

    return filteredExamples.map(example =>
      new ExampleTreeItem(example, repository)
    );
  }

  // Search and filter methods
  getSearchQuery(): string {
    return this.searchQuery;
  }

  setSearchQuery(query: string): void {
    this.searchQuery = query;
    this._onDidChangeTreeData.fire(undefined);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this._onDidChangeTreeData.fire(undefined);
  }

  getSelectedCategory(): string | undefined {
    return this.selectedCategory;
  }

  setCategory(category: string | undefined): void {
    this.selectedCategory = category;
    this._onDidChangeTreeData.fire(undefined);
  }

  clearCategoryFilter(): void {
    this.selectedCategory = undefined;
    this._onDidChangeTreeData.fire(undefined);
  }

  getSelectedTags(): string[] {
    return this.selectedTags;
  }

  setTags(tags: string[]): void {
    this.selectedTags = tags;
    this._onDidChangeTreeData.fire(undefined);
  }

  clearTagsFilter(): void {
    this.selectedTags = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  // Drag and drop implementation
  public async handleDrag(source: readonly ExampleTreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> {
    // Prepare example data for drag
    const draggedExamples = source.map(item => ({
      exampleId: item.example.id,
      title: item.example.title,
      repositoryId: item.example.example_repository_id
    }));
    
    treeDataTransfer.set('application/vnd.code.tree.computorexample', 
      new vscode.DataTransferItem(draggedExamples)
    );
  }

  public async handleDrop(target: vscode.TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    // Examples tree doesn't accept drops
    void target;
    void dataTransfer;
  }
}