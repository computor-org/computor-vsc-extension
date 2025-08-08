import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { performanceMonitor } from '../../../services/PerformanceMonitoringService';
import { errorRecoveryService } from '../../../services/ErrorRecoveryService';

// Student-specific interfaces (until we generate proper types)
interface StudentCourse {
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

interface StudentCourseContent {
  id: string;
  title: string;
  path: string;
  course_id: string;
  course_content_type_id: string;
  example_id?: string;
  example_version?: string;
  position: number;
}

// Tree items for student view
export class StudentCourseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly course: StudentCourse,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(course.title, collapsibleState);
    this.id = `student-course-${course.id}`;
    this.contextValue = 'studentCourse';
    this.tooltip = `Course: ${course.title}\nPath: ${course.path}`;
    this.iconPath = new vscode.ThemeIcon('book');
    
    if (course.repository) {
      this.description = 'Has Repository';
    }
  }
}

export class StudentCourseContentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly content: StudentCourseContent,
    public readonly course: StudentCourse,
    public readonly hasChildren: boolean = false
  ) {
    super(
      content.title,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.id = `student-content-${content.id}`;
    this.contextValue = content.example_id ? 'studentContentWithExample' : 'studentContent';
    this.tooltip = `${content.title}\nPath: ${content.path}`;
    
    // Set icon based on whether it has an example
    if (content.example_id) {
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.description = 'Assignment';
    } else {
      this.iconPath = new vscode.ThemeIcon('file-text');
    }
  }
}

export class StudentTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private apiService: ComputorApiService;
  
  // Caches
  private coursesCache: StudentCourse[] | null = null;
  private courseContentsCache: Map<string, StudentCourseContent[]> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.apiService = new ComputorApiService(context);
  }

  refresh(): void {
    // Clear caches
    this.coursesCache = null;
    this.courseContentsCache.clear();
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
      `student-getChildren-${element?.id || 'root'}`,
      async () => this.getChildrenInternal(element),
      'tree',
      { elementType: element?.contextValue || 'root' }
    );
  }

  private async getChildrenInternal(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      if (!element) {
        // Root level - show enrolled courses
        const courses = await this.getStudentCourses();
        return courses.map(course => new StudentCourseTreeItem(course));
      }

      if (element instanceof StudentCourseTreeItem) {
        // Show course contents for this course
        const contents = await this.getStudentCourseContents(element.course.id);
        
        // Build tree structure from paths
        const rootContents = this.getRootContents(contents);
        
        return rootContents.map(content => {
          const hasChildren = this.hasChildContents(content, contents);
          return new StudentCourseContentTreeItem(content, element.course, hasChildren);
        });
      }

      if (element instanceof StudentCourseContentTreeItem) {
        // Show child contents
        const allContents = await this.getStudentCourseContents(element.course.id);
        const childContents = this.getChildContents(element.content, allContents);
        
        return childContents.map(content => {
          const hasChildren = this.hasChildContents(content, allContents);
          return new StudentCourseContentTreeItem(content, element.course, hasChildren);
        });
      }

      return [];
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load student data: ${error}`);
      return [];
    }
  }

  private async getStudentCourses(): Promise<StudentCourse[]> {
    if (this.coursesCache) {
      return this.coursesCache;
    }

    try {
      const courses = await errorRecoveryService.executeWithRecovery(
        () => this.apiService.getStudentCourses(),
        {
          maxRetries: 3,
          exponentialBackoff: true,
          onRetry: (attempt) => {
            vscode.window.showInformationMessage(`Retrying to fetch courses... (attempt ${attempt})`);
          }
        }
      );
      
      this.coursesCache = courses || [];
      return this.coursesCache;
    } catch (error) {
      console.error('Failed to get student courses:', error);
      return [];
    }
  }

  private async getStudentCourseContents(courseId: string): Promise<StudentCourseContent[]> {
    if (this.courseContentsCache.has(courseId)) {
      return this.courseContentsCache.get(courseId) || [];
    }

    try {
      const contents = await this.apiService.getStudentCourseContents(courseId);
      this.courseContentsCache.set(courseId, contents || []);
      return contents || [];
    } catch (error) {
      console.error('Failed to get course contents:', error);
      return [];
    }
  }

  private getRootContents(contents: StudentCourseContent[]): StudentCourseContent[] {
    return contents.filter(content => {
      const pathParts = content.path.split('.');
      return pathParts.length === 1;
    }).sort((a, b) => a.position - b.position);
  }

  private getChildContents(parent: StudentCourseContent, allContents: StudentCourseContent[]): StudentCourseContent[] {
    const parentPath = parent.path;
    const parentDepth = parentPath.split('.').length;
    
    return allContents.filter(content => {
      const contentPath = content.path;
      const contentDepth = contentPath.split('.').length;
      
      return contentPath.startsWith(parentPath + '.') && contentDepth === parentDepth + 1;
    }).sort((a, b) => a.position - b.position);
  }

  private hasChildContents(content: StudentCourseContent, allContents: StudentCourseContent[]): boolean {
    const contentPath = content.path;
    return allContents.some(c => c.path.startsWith(contentPath + '.') && c.path !== contentPath);
  }

  async getParent(element: vscode.TreeItem): Promise<vscode.TreeItem | undefined> {
    if (element instanceof StudentCourseContentTreeItem) {
      const pathParts = element.content.path.split('.');
      if (pathParts.length === 1) {
        // Root content - parent is course
        return new StudentCourseTreeItem(element.course);
      } else {
        // Find parent content
        const parentPath = pathParts.slice(0, -1).join('.');
        const allContents = await this.getStudentCourseContents(element.course.id);
        const parentContent = allContents.find(c => c.path === parentPath);
        
        if (parentContent) {
          const hasChildren = this.hasChildContents(parentContent, allContents);
          return new StudentCourseContentTreeItem(parentContent, element.course, hasChildren);
        }
      }
    }
    
    return undefined;
  }
}