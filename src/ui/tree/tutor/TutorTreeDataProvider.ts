import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { performanceMonitor } from '../../../services/PerformanceMonitoringService';
import { errorRecoveryService } from '../../../services/ErrorRecoveryService';

// Tutor-specific interfaces (until we generate proper types)
interface TutorCourse {
  id: string;
  title: string;
  course_family_id: string;
  organization_id: string;
  path: string;
  repository?: {
    provider_url: string;
    full_path: string;
  };
}


interface Example {
  id: string;
  directory: string;
  identifier: string;
  title: string;
  subject?: string | null;
  category?: string | null;
  tags: string[];
  example_repository_id: string;
}

interface ExampleRepository {
  id: string;
  name: string;
  description?: string | null;
  source_type: string;
  source_url: string;
  organization_id?: string | null;
}

// Tree items for tutor view
export class TutorCourseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly course: TutorCourse,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(course.title, collapsibleState);
    this.id = `tutor-course-${course.id}`;
    this.contextValue = 'tutorCourse';
    this.tooltip = `Course: ${course.title}\\nPath: ${course.path}`;
    this.iconPath = new vscode.ThemeIcon('book');
    
    if (course.repository) {
      this.description = 'Has Repository';
    }
  }
}

export class TutorExampleRepositoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly repository: ExampleRepository,
    public readonly course: TutorCourse,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(repository.name, collapsibleState);
    this.id = `tutor-repository-${repository.id}`;
    this.contextValue = 'tutorExampleRepository';
    this.tooltip = `Repository: ${repository.name}\\nType: ${repository.source_type}\\nURL: ${repository.source_url}`;
    this.iconPath = new vscode.ThemeIcon('repo');
    this.description = `${repository.source_type.toUpperCase()}`;
  }
}

export class TutorExampleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly example: Example,
    public readonly repository: ExampleRepository,
    public readonly course: TutorCourse,
    public readonly hasChildren: boolean = false
  ) {
    super(
      example.title,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.id = `tutor-example-${example.id}`;
    this.contextValue = 'tutorExample';
    this.tooltip = `${example.title}\\nIdentifier: ${example.identifier}\\nDirectory: ${example.directory}`;
    this.iconPath = new vscode.ThemeIcon('file-code');
    
    if (example.category) {
      this.description = example.category;
    }
    
    // Add tags as suffix if available
    if (example.tags && example.tags.length > 0) {
      this.description = (this.description || '') + ` [${example.tags.slice(0, 2).join(', ')}${example.tags.length > 2 ? '...' : ''}]`;
    }
  }
}

export class TutorTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private apiService: ComputorApiService;
  
  // Caches
  private coursesCache: TutorCourse[] | null = null;
  private repositoriesCache: Map<string, ExampleRepository[]> = new Map();
  private examplesCache: Map<string, Example[]> = new Map();

  constructor(context: vscode.ExtensionContext, apiService?: ComputorApiService) {
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
  }

  refresh(): void {
    // Clear caches
    this.coursesCache = null;
    this.repositoriesCache.clear();
    this.examplesCache.clear();
    this._onDidChangeTreeData.fire();
  }

  refreshNode(element?: vscode.TreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    return performanceMonitor.measureAsync(
      `tutor-getChildren-${element?.id || 'root'}`,
      async () => this.getChildrenInternal(element),
      'tree',
      { elementType: element?.contextValue || 'root' }
    );
  }

  private async getChildrenInternal(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      if (!element) {
        // Root level - show courses where user is a tutor
        const courses = await this.getTutorCourses();
        return courses.map(course => new TutorCourseTreeItem(course));
      }

      if (element instanceof TutorCourseTreeItem) {
        // Show example repositories for this course's organization
        const repositories = await this.getExampleRepositories(element.course.organization_id);
        return repositories.map(repo => new TutorExampleRepositoryTreeItem(repo, element.course));
      }

      if (element instanceof TutorExampleRepositoryTreeItem) {
        // Show examples in this repository
        const examplesList = await this.getExamples(element.repository.id);
        const examples = examplesList as Example[];
        
        // Build tree structure from identifiers (hierarchical with dots)
        const rootExamples = this.getRootExamples(examples);
        
        return rootExamples.map(example => {
          const hasChildren = this.hasChildExamples(example, examples);
          return new TutorExampleTreeItem(example, element.repository, element.course, hasChildren);
        });
      }

      if (element instanceof TutorExampleTreeItem) {
        // Show child examples
        const allExamplesList = await this.getExamples(element.repository.id);
        const allExamples = allExamplesList as Example[];
        const childExamples = this.getChildExamples(element.example, allExamples);
        
        return childExamples.map(example => {
          const hasChildren = this.hasChildExamples(example, allExamples);
          return new TutorExampleTreeItem(example, element.repository, element.course, hasChildren);
        });
      }

      return [];
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load tutor data: ${error}`);
      return [];
    }
  }

  private async getTutorCourses(): Promise<TutorCourse[]> {
    if (this.coursesCache) {
      return this.coursesCache;
    }

    try {
      const courses = await errorRecoveryService.executeWithRecovery(
        () => this.apiService.getTutorCourses(),
        {
          maxRetries: 3,
          exponentialBackoff: true,
          onRetry: (attempt) => {
            vscode.window.showInformationMessage(`Retrying to fetch tutor courses... (attempt ${attempt})`);
          }
        }
      );
      
      this.coursesCache = courses || [];
      return this.coursesCache;
    } catch (error) {
      console.error('Failed to get tutor courses:', error);
      return [];
    }
  }

  private async getExampleRepositories(organizationId: string): Promise<ExampleRepository[]> {
    if (this.repositoriesCache.has(organizationId)) {
      return this.repositoriesCache.get(organizationId) || [];
    }

    try {
      const repositories = await this.apiService.getExampleRepositories(organizationId);
      const typedRepositories = repositories as ExampleRepository[];
      this.repositoriesCache.set(organizationId, typedRepositories || []);
      return typedRepositories || [];
    } catch (error) {
      console.error('Failed to get example repositories:', error);
      return [];
    }
  }

  private async getExamples(repositoryId: string): Promise<Example[]> {
    if (this.examplesCache.has(repositoryId)) {
      return this.examplesCache.get(repositoryId) || [];
    }

    try {
      const examples = await this.apiService.getExamples(repositoryId);
      const typedExamples = examples as Example[];
      this.examplesCache.set(repositoryId, typedExamples || []);
      return typedExamples || [];
    } catch (error) {
      console.error('Failed to get examples:', error);
      return [];
    }
  }

  private getRootExamples(examples: Example[]): Example[] {
    return examples.filter(example => {
      const identifierParts = example.identifier.split('.');
      return identifierParts.length === 1;
    }).sort((a, b) => a.identifier.localeCompare(b.identifier));
  }

  private getChildExamples(parent: Example, allExamples: Example[]): Example[] {
    const parentIdentifier = parent.identifier;
    const parentDepth = parentIdentifier.split('.').length;
    
    return allExamples.filter(example => {
      const exampleIdentifier = example.identifier;
      const exampleDepth = exampleIdentifier.split('.').length;
      
      return exampleIdentifier.startsWith(parentIdentifier + '.') && exampleDepth === parentDepth + 1;
    }).sort((a, b) => a.identifier.localeCompare(b.identifier));
  }

  private hasChildExamples(example: Example, allExamples: Example[]): boolean {
    const exampleIdentifier = example.identifier;
    return allExamples.some(e => e.identifier.startsWith(exampleIdentifier + '.') && e.identifier !== exampleIdentifier);
  }

  async getParent(element: vscode.TreeItem): Promise<vscode.TreeItem | undefined> {
    if (element instanceof TutorExampleTreeItem) {
      const identifierParts = element.example.identifier.split('.');
      if (identifierParts.length === 1) {
        // Root example - parent is repository
        return new TutorExampleRepositoryTreeItem(element.repository, element.course);
      } else {
        // Find parent example
        const parentIdentifier = identifierParts.slice(0, -1).join('.');
        const allExamples = await this.getExamples(element.repository.id);
        const parentExample = allExamples.find(e => e.identifier === parentIdentifier);
        
        if (parentExample) {
          const hasChildren = this.hasChildExamples(parentExample, allExamples);
          return new TutorExampleTreeItem(parentExample, element.repository, element.course, hasChildren);
        }
      }
    }
    
    if (element instanceof TutorExampleRepositoryTreeItem) {
      // Parent is course
      return new TutorCourseTreeItem(element.course);
    }
    
    return undefined;
  }
}