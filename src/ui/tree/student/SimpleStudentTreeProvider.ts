import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';

/**
 * Simple tree provider for student course content
 */
export class SimpleStudentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  
  private apiService: ComputorApiService;
  private courseId?: string;
  private courseTitle?: string;
  private courseContents: any[] = [];

  constructor(apiService: ComputorApiService) {
    this.apiService = apiService;
  }

  /**
   * Set the current course
   */
  async setCourse(courseId: string | undefined): Promise<void> {
    this.courseId = courseId;
    this.courseContents = [];
    
    if (courseId) {
      try {
        // Get course info
        const courses = await this.apiService.getStudentCourses();
        const course = courses.find(c => c.id === courseId);
        this.courseTitle = course?.title || course?.path || 'Course';
        
        // Get course contents
        this.courseContents = await this.apiService.getStudentCourseContents(courseId) || [];
        console.log(`Loaded ${this.courseContents.length} content items for course ${this.courseTitle}`);
      } catch (error) {
        console.error('Failed to load course contents:', error);
        vscode.window.showErrorMessage('Failed to load course contents');
      }
    }
    
    this.refresh();
  }

  /**
   * Refresh the tree
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    if (!this.courseId) {
      return [new MessageItem('No course selected')];
    }

    if (!element) {
      // Root level - show course and its contents
      const items: TreeItem[] = [];
      
      // Add course header
      items.push(new CourseItem(this.courseId, this.courseTitle || 'Course'));
      
      // Group contents by path structure
      const contentsByPath = new Map<string, any[]>();
      
      for (const content of this.courseContents) {
        const pathParts = content.path.split('.');
        const topLevel = pathParts[0];
        
        if (!contentsByPath.has(topLevel)) {
          contentsByPath.set(topLevel, []);
        }
        contentsByPath.get(topLevel)!.push(content);
      }
      
      // Create items for each path group
      for (const [path, contents] of contentsByPath) {
        if (contents.length === 1 && contents[0].path === path) {
          // Single item at this level
          items.push(new ContentItem(contents[0]));
        } else {
          // Multiple items, create a folder
          items.push(new FolderItem(path, contents));
        }
      }
      
      return items;
    }

    if (element instanceof FolderItem) {
      // Show contents of a folder
      return element.contents.map(content => new ContentItem(content));
    }

    return [];
  }
}

abstract class TreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState);
  }
}

class CourseItem extends TreeItem {
  constructor(
    public readonly courseId: string,
    public readonly courseTitle: string
  ) {
    super(courseTitle, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('book');
    this.contextValue = 'course';
    this.description = 'Current Course';
    this.tooltip = `Course: ${courseTitle}\nID: ${courseId}`;
  }
}

class FolderItem extends TreeItem {
  constructor(
    public readonly path: string,
    public readonly contents: any[]
  ) {
    super(path, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'folder';
    this.description = `${contents.length} items`;
  }
}

class ContentItem extends TreeItem {
  constructor(
    public readonly content: any
  ) {
    super(content.title || content.path, vscode.TreeItemCollapsibleState.None);
    
    // Determine icon based on content type
    const isAssignment = content.course_content_type?.course_content_kind_id === 'assignment' ||
                        content.example_id;
    
    if (isAssignment) {
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.contextValue = 'assignment';
      
      // Check if has repository
      if (content.submission_group?.repository) {
        this.description = '📁 Repository';
      } else if (content.example_id) {
        this.description = '📝 Assignment';
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('file-text');
      this.contextValue = 'content';
      this.description = content.course_content_type?.title || 'Content';
    }
    
    // Build tooltip
    const tooltipParts: string[] = [
      content.title || 'Content',
      `Path: ${content.path}`
    ];
    
    if (content.course_content_type?.title) {
      tooltipParts.push(`Type: ${content.course_content_type.title}`);
    }
    
    if (content.submission_group?.repository) {
      tooltipParts.push(`Repository: ${content.submission_group.repository.full_path}`);
    }
    
    this.tooltip = tooltipParts.join('\n');
  }
}

class MessageItem extends TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'message';
  }
}