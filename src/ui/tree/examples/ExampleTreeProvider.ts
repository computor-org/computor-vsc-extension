import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { ExampleTreeItem } from './ExampleTreeItems';
import { 
  ExampleRepositoryList,
  ExampleList
} from '../../../types/generated/examples';

export class ExampleTreeProvider implements vscode.TreeDataProvider<ExampleTreeItem>, vscode.TreeDragAndDropController<ExampleTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ExampleTreeItem | undefined | null | void> = new vscode.EventEmitter<ExampleTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ExampleTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  public readonly dropMimeTypes = ['application/vnd.code.tree.computorexample'];
  public readonly dragMimeTypes = ['application/vnd.code.tree.computorexample'];

  private repositories: ExampleRepositoryList[] = [];
  private examples: Map<string, ExampleList[]> = new Map();
  private workspaceExamples: Map<string, string> = new Map(); // identifier -> workspace path
  private searchQuery: string = '';
  private selectedCategory: string | undefined;
  private selectedTags: string[] = [];

  constructor(
    context: vscode.ExtensionContext,
    private apiService: ComputorApiService
  ) {
    void context;
    // Load data asynchronously after construction
    setTimeout(() => {
      this.loadData().catch(error => {
        console.error('[ExampleTreeProvider] Failed to load initial data:', error);
        vscode.window.showErrorMessage(`Failed to load examples: ${error.message || error}`);
      });
    }, 100);
  }

  async loadData(clearCache: boolean = false): Promise<void> {
    try {
      console.log('[ExampleTreeProvider] Loading data...');
      
      // Clear cache if requested (e.g., after upload)
      if (clearCache) {
        console.log('[ExampleTreeProvider] Clearing cache before reload...');
        this.apiService.clearExamplesCache();
      }
      
      // Load repositories
      this.repositories = await this.apiService.getExampleRepositories();
      console.log(`[ExampleTreeProvider] Loaded ${this.repositories.length} repositories`);
      
      // Clear existing examples
      this.examples.clear();
      
      // Load examples for each repository
      for (const repo of this.repositories) {
        console.log(`[ExampleTreeProvider] Loading examples for repository: ${repo.name} (${repo.id})`);
        const examples = await this.apiService.getExamples(repo.id);
        this.examples.set(repo.id, examples || []);
        console.log(`[ExampleTreeProvider] Loaded ${examples?.length || 0} examples for ${repo.name}`);
      }
      
      // Scan workspace for existing examples
      await this.scanWorkspace();
      
      console.log('[ExampleTreeProvider] Refreshing tree view...');
      this.refresh();
    } catch (error) {
      console.error('Failed to load example data:', error);
      vscode.window.showErrorMessage('Failed to load examples from server');
    }
  }

  async scanWorkspace(): Promise<void> {
    this.workspaceExamples.clear();
    
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      console.log('[ExampleTreeProvider] No workspace folders found');
      return;
    }

    console.log(`[ExampleTreeProvider] Scanning ${workspaceFolders.length} workspace folder(s)`);
    
    for (const folder of workspaceFolders) {
      console.log(`[ExampleTreeProvider] Scanning workspace folder: ${folder.uri.fsPath}`);
      
      // First check if the workspace folder itself has directories with meta.yaml
      try {
        const entries = await fs.promises.readdir(folder.uri.fsPath, { withFileTypes: true });
        console.log(`[ExampleTreeProvider] Found ${entries.length} entries in ${folder.uri.fsPath}`);
        
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('node_modules')) {
            const dirPath = path.join(folder.uri.fsPath, entry.name);
            const metaPath = path.join(dirPath, 'meta.yaml');
            
            console.log(`[ExampleTreeProvider] Checking directory: ${entry.name}`);
            
            // Check if this directory has a meta.yaml
            if (fs.existsSync(metaPath)) {
              console.log(`[ExampleTreeProvider] Found meta.yaml in ${dirPath}`);
              try {
                const content = await fs.promises.readFile(metaPath, 'utf-8');
                const meta = yaml.load(content) as any;
                console.log(`[ExampleTreeProvider] Parsed meta.yaml, slug field: ${meta?.slug}`);
                
                if (meta && meta.slug) {
                  // Store the mapping of slug to workspace path
                  this.workspaceExamples.set(meta.slug, dirPath);
                  console.log(`[ExampleTreeProvider] ✓ Added example: ${meta.slug} at ${dirPath}`);
                } else {
                  console.log(`[ExampleTreeProvider] No slug field in meta.yaml at ${dirPath}`);
                }
              } catch (error) {
                console.error(`[ExampleTreeProvider] Failed to parse meta.yaml in ${dirPath}:`, error);
              }
            } else {
              console.log(`[ExampleTreeProvider] No meta.yaml in ${dirPath}`);
            }
          }
        }
      } catch (error) {
        console.error(`[ExampleTreeProvider] Failed to scan workspace folder ${folder.uri.fsPath}:`, error);
      }
    }
    
    console.log(`[ExampleTreeProvider] Scan complete. Found ${this.workspaceExamples.size} example(s)`);
    
    // Refresh to update status indicators
    this.refresh();
  }


  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ExampleTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ExampleTreeItem): Promise<ExampleTreeItem[]> {
    if (!element) {
      // Root level - show repositories or search results
      if (this.searchQuery) {
        return this.getSearchResults();
      }
      
      return this.repositories.map(repo => 
        new ExampleTreeItem(
          repo.name,
          repo.description || '',
          'repository',
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            repositoryId: repo.id,
            sourceUrl: repo.source_url,
            sourceType: repo.source_type
          }
        )
      );
    }

    // Repository level - show examples
    if (element.type === 'repository' && element.data?.repositoryId) {
      const repoExamples = this.examples.get(element.data.repositoryId) || [];
      
      // Apply filters if any
      let filteredExamples = repoExamples;
      
      if (this.selectedCategory) {
        filteredExamples = filteredExamples.filter(ex => 
          ex.category === this.selectedCategory
        );
      }
      
      if (this.selectedTags.length > 0) {
        filteredExamples = filteredExamples.filter(ex => 
          ex.tags && ex.tags.some(tag => this.selectedTags.includes(tag))
        );
      }
      
      // Group by category if no search
      if (!this.searchQuery && !this.selectedCategory) {
        return this.groupByCategory(filteredExamples, element.data.repositoryId);
      }
      
      return filteredExamples.map(example => {
        const isInWorkspace = this.workspaceExamples.has(example.identifier);
        const workspacePath = this.workspaceExamples.get(example.identifier);
        
        console.log(`[ExampleTreeProvider] Checking example ${example.identifier}:`);
        console.log(`  - isInWorkspace: ${isInWorkspace}`);
        console.log(`  - workspacePath: ${workspacePath}`);
        console.log(`  - workspaceExamples keys: ${Array.from(this.workspaceExamples.keys()).join(', ')}`);
        
        return new ExampleTreeItem(
          example.title,
          example.identifier,
          'example',
          vscode.TreeItemCollapsibleState.None,
          {
            exampleId: example.id,
            repositoryId: element.data!.repositoryId,
            directory: example.directory,
            identifier: example.identifier,
            category: example.category || undefined,
            tags: example.tags,
            isInWorkspace,
            workspacePath
          }
        );
      });
    }

    // Category level - show examples in category
    if (element.type === 'category' && element.data?.repositoryId) {
      const repoExamples = this.examples.get(element.data.repositoryId) || [];
      const categoryExamples = repoExamples.filter(ex => 
        ex.category === element.data!.category
      );
      
      return categoryExamples.map(example => {
        const isInWorkspace = this.workspaceExamples.has(example.identifier);
        const workspacePath = this.workspaceExamples.get(example.identifier);
        
        return new ExampleTreeItem(
          example.title,
          example.identifier,
          'example',
          vscode.TreeItemCollapsibleState.None,
          {
            exampleId: example.id,
            repositoryId: element.data!.repositoryId,
            directory: example.directory,
            identifier: example.identifier,
            category: example.category || undefined,
            tags: example.tags,
            isInWorkspace,
            workspacePath
          }
        );
      });
    }

    return [];
  }

  private groupByCategory(examples: ExampleList[], repositoryId: string): ExampleTreeItem[] {
    const categories = new Map<string, ExampleList[]>();
    const uncategorized: ExampleList[] = [];
    
    for (const example of examples) {
      if (example.category) {
        if (!categories.has(example.category)) {
          categories.set(example.category, []);
        }
        categories.get(example.category)!.push(example);
      } else {
        uncategorized.push(example);
      }
    }
    
    const items: ExampleTreeItem[] = [];
    
    // Add category nodes
    for (const [category, categoryExamples] of categories) {
      items.push(
        new ExampleTreeItem(
          category,
          `${categoryExamples.length} examples`,
          'category',
          vscode.TreeItemCollapsibleState.Collapsed,
          {
            repositoryId,
            category
          }
        )
      );
    }
    
    // Add uncategorized examples directly
    for (const example of uncategorized) {
      const isInWorkspace = this.workspaceExamples.has(example.identifier);
      const workspacePath = this.workspaceExamples.get(example.identifier);
      
      items.push(
        new ExampleTreeItem(
          example.title,
          example.identifier,
          'example',
          vscode.TreeItemCollapsibleState.None,
          {
            exampleId: example.id,
            repositoryId,
            directory: example.directory,
            identifier: example.identifier,
            tags: example.tags,
            isInWorkspace,
            workspacePath
          }
        )
      );
    }
    
    return items;
  }

  private getSearchResults(): ExampleTreeItem[] {
    const results: ExampleTreeItem[] = [];
    const query = this.searchQuery.toLowerCase();
    
    for (const [repoId, repoExamples] of this.examples) {
      const repo = this.repositories.find(r => r.id === repoId);
      if (!repo) continue;
      
      const matchingExamples = repoExamples.filter(example => 
        example.title.toLowerCase().includes(query) ||
        example.identifier.toLowerCase().includes(query) ||
        example.directory.toLowerCase().includes(query) ||
        (example.tags && example.tags.some(tag => tag.toLowerCase().includes(query))) ||
        (example.category && example.category.toLowerCase().includes(query))
      );
      
      for (const example of matchingExamples) {
        const isInWorkspace = this.workspaceExamples.has(example.identifier);
        const workspacePath = this.workspaceExamples.get(example.identifier);
        
        results.push(
          new ExampleTreeItem(
            example.title,
            `${repo.name} / ${example.identifier}`,
            'example',
            vscode.TreeItemCollapsibleState.None,
            {
              exampleId: example.id,
              repositoryId: repoId,
              directory: example.directory,
              identifier: example.identifier,
              category: example.category || undefined,
              tags: example.tags,
              isInWorkspace,
              workspacePath
            }
          )
        );
      }
    }
    
    return results;
  }

  async search(query: string): Promise<void> {
    this.searchQuery = query;
    this.refresh();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.refresh();
  }

  setCategory(category: string | undefined): void {
    this.selectedCategory = category;
    this.refresh();
  }

  setTags(tags: string[]): void {
    this.selectedTags = tags;
    this.refresh();
  }

  getAllCategories(): string[] {
    const categories = new Set<string>();
    for (const examples of this.examples.values()) {
      for (const example of examples) {
        if (example.category) {
          categories.add(example.category);
        }
      }
    }
    return Array.from(categories).sort();
  }

  getAllTags(): string[] {
    const tags = new Set<string>();
    for (const examples of this.examples.values()) {
      for (const example of examples) {
        if (example.tags) {
          for (const tag of example.tags) {
            tags.add(tag);
          }
        }
      }
    }
    return Array.from(tags).sort();
  }

  getWorkspaceExamplesCount(): number {
    return this.workspaceExamples.size;
  }

  getWorkspaceExamples(): Map<string, string> {
    return this.workspaceExamples;
  }

  // Drag and drop implementation
  public async handleDrag(source: readonly ExampleTreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> {
    console.log('handleDrag called with source:', source.length, 'items');
    
    // Only allow dragging example items
    const exampleItems = source.filter(item => item.type === 'example' && item.data?.exampleId);
    console.log('Filtered example items:', exampleItems.length);
    
    if (exampleItems.length > 0) {
      // Store the dragged example data
      const dragData = exampleItems.map(item => ({
        exampleId: item.data?.exampleId,
        identifier: item.data?.identifier,
        title: item.label?.toString().replace('[LOCAL] ', ''),
        repositoryId: item.data?.repositoryId
      }));
      
      console.log('Setting drag data:', dragData);
      console.log('Creating DataTransferItem with:', JSON.stringify(dragData, null, 2));
      
      // Try serializing as JSON string instead of object
      const serializedData = JSON.stringify(dragData);
      const dataTransferItem = new vscode.DataTransferItem(serializedData);
      console.log('Created DataTransferItem with JSON string:', dataTransferItem);
      console.log('DataTransferItem value:', dataTransferItem.value);
      
      treeDataTransfer.set('application/vnd.code.tree.computorexample', dataTransferItem);
      console.log('Drag data set successfully');
      
      // Verify what was set
      const verification = treeDataTransfer.get('application/vnd.code.tree.computorexample');
      console.log('Verification - what was actually set:', verification);
      console.log('Verification value:', verification?.value);
    }
  }

  public async handleDrop(target: ExampleTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    // This tree doesn't accept drops - examples are dragged TO other views
    // The actual drop handling will be in the course content tree
  }
}