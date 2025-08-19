import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { performanceMonitor } from '../../../services/PerformanceMonitoringService';
import { errorRecoveryService } from '../../../services/ErrorRecoveryService';
import { SubmissionGroupStudent } from '../../../types/generated';
import { IconGenerator } from '../../../utils/IconGenerator';

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

export class StudentSubmissionGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly submissionGroup: SubmissionGroupStudent,
    public readonly course: StudentCourse
  ) {
    super(
      submissionGroup.course_content_title || 'Unnamed Assignment',
      vscode.TreeItemCollapsibleState.None
    );
    this.id = `student-submission-group-${submissionGroup.id}`;
    this.contextValue = submissionGroup.repository ? 'studentSubmissionGroupWithRepo' : 'studentSubmissionGroup';
    
    // Build tooltip
    const tooltipParts = [
      `Assignment: ${submissionGroup.course_content_title}`,
      `Path: ${submissionGroup.course_content_path}`
    ];
    
    if (submissionGroup.max_group_size > 1) {
      tooltipParts.push(`Team Size: ${submissionGroup.current_group_size}/${submissionGroup.max_group_size}`);
    }
    
    if (submissionGroup.latest_grading) {
      tooltipParts.push(`Grade: ${(submissionGroup.latest_grading.grading * 100).toFixed(0)}%`);
    }
    
    this.tooltip = tooltipParts.join('\n');
    
    // Set icon based on type and status
    if (submissionGroup.repository) {
      this.iconPath = new vscode.ThemeIcon('git-branch');
      this.description = submissionGroup.max_group_size > 1 ? 'Team Repository' : 'Repository';
    } else {
      this.iconPath = new vscode.ThemeIcon('file-code');
      this.description = 'No Repository';
    }
    
    // Add command to select assignment
    if (submissionGroup.repository) {
      this.command = {
        command: 'computor.student.selectAssignment',
        title: 'Select Assignment',
        arguments: [submissionGroup, course]
      };
    }
  }
}

export class StudentUnitTreeItem extends vscode.TreeItem {
  constructor(
    public readonly content: StudentCourseContent,
    public readonly course: StudentCourse,
    public readonly submissionGroups: SubmissionGroupStudent[] = [],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(content.title, collapsibleState);
    this.id = `student-unit-${content.id}`;
    this.contextValue = 'studentUnit';
    this.tooltip = `Unit: ${content.title}\nPath: ${content.path}\nAssignments: ${submissionGroups.length}`;
    
    // Use colored folder icon for units
    this.iconPath = IconGenerator.getColoredIcon('#4CAF50', 'square'); // Green folder icon
    this.description = `${submissionGroups.length} assignment${submissionGroups.length !== 1 ? 's' : ''}`;
  }
}

export class StudentAssignmentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly content: StudentCourseContent,
    public readonly course: StudentCourse,
    public readonly submissionGroup?: SubmissionGroupStudent
  ) {
    super(
      content.title,
      vscode.TreeItemCollapsibleState.None
    );
    this.id = `student-assignment-${content.id}`;
    this.contextValue = submissionGroup?.repository ? 'studentAssignmentWithRepo' : 'studentAssignment';
    
    // Build tooltip
    const tooltipParts = [
      `Assignment: ${content.title}`,
      `Path: ${content.path}`
    ];
    
    if (submissionGroup) {
      if (submissionGroup.max_group_size > 1) {
        tooltipParts.push(`Team Size: ${submissionGroup.current_group_size}/${submissionGroup.max_group_size}`);
      }
      
      if (submissionGroup.latest_grading) {
        tooltipParts.push(`Grade: ${(submissionGroup.latest_grading.grading * 100).toFixed(0)}%`);
      }
    }
    
    this.tooltip = tooltipParts.join('\n');
    
    // Set icon and description based on submission group status
    if (submissionGroup?.repository) {
      this.iconPath = IconGenerator.getColoredIcon('#2196F3'); // Blue for active assignments
      this.description = submissionGroup.max_group_size > 1 ? 'Team Repository' : 'Repository';
      
      // Add command to select assignment
      this.command = {
        command: 'computor.student.selectAssignment',
        title: 'Select Assignment',
        arguments: [submissionGroup, course]
      };
    } else if (submissionGroup) {
      this.iconPath = IconGenerator.getColoredIcon('#FF9800'); // Orange for assignments without repos
      this.description = 'No Repository';
    } else {
      this.iconPath = IconGenerator.getColoredIcon('#9E9E9E'); // Gray for content without submission groups
      this.description = 'No Submission';
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
  private submissionGroupsCache: Map<string, SubmissionGroupStudent[]> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.apiService = new ComputorApiService(context);
    IconGenerator.initialize(context);
  }

  refresh(): void {
    // Clear caches
    this.coursesCache = null;
    this.courseContentsCache.clear();
    this.submissionGroupsCache.clear();
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
        // Fetch both course contents and submission groups
        const [contents, submissionGroups] = await Promise.all([
          this.getStudentCourseContents(element.course.id),
          this.getStudentSubmissionGroups(element.course.id)
        ]);
        
        // Build tree structure from course contents with proper hierarchy
        const rootContents = this.getRootContents(contents);
        
        return rootContents.map(content => {
          const hasChildren = this.hasChildContents(content, contents);
          
          if (hasChildren) {
            // This is a unit (has children) - find its submission groups
            const unitSubmissionGroups = this.findSubmissionGroupsForUnit(content, contents, submissionGroups);
            return new StudentUnitTreeItem(content, element.course, unitSubmissionGroups);
          } else {
            // This is a standalone assignment - find its submission group
            const submissionGroup = this.findSubmissionGroupForContent(content, submissionGroups);
            return new StudentAssignmentTreeItem(content, element.course, submissionGroup);
          }
        });
      }

      if (element instanceof StudentUnitTreeItem) {
        // Show assignments within this unit
        const [allContents, submissionGroups] = await Promise.all([
          this.getStudentCourseContents(element.course.id),
          this.getStudentSubmissionGroups(element.course.id)
        ]);
        
        const childContents = this.getChildContents(element.content, allContents);
        
        return childContents.map(content => {
          const hasChildren = this.hasChildContents(content, allContents);
          
          if (hasChildren) {
            // This is a sub-unit
            const unitSubmissionGroups = this.findSubmissionGroupsForUnit(content, allContents, submissionGroups);
            return new StudentUnitTreeItem(content, element.course, unitSubmissionGroups);
          } else {
            // This is an assignment within the unit
            const submissionGroup = this.findSubmissionGroupForContent(content, submissionGroups);
            return new StudentAssignmentTreeItem(content, element.course, submissionGroup);
          }
        });
      }

      if (element instanceof StudentCourseContentTreeItem) {
        // Show child contents (fallback for legacy structure)
        const allContents = await this.getStudentCourseContents(element.course.id);
        const childContents = this.getChildContents(element.content, allContents);
        
        return childContents.map(content => {
          const hasChildren = this.hasChildContents(content, allContents);
          return new StudentCourseContentTreeItem(content, element.course, hasChildren);
        });
      }

      return [];
    } catch (error: any) {
      console.error('Failed to load student tree data:', error);
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      vscode.window.showErrorMessage(`Failed to load student data: ${message}`);
      return [new StudentCourseTreeItem({
        id: 'error',
        title: `Error loading student data: ${message}`,
        course_family_id: '',
        organization_id: '',
        path: ''
      } as any)];
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
    } catch (error: any) {
      console.error('Failed to get course contents:', error);
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      vscode.window.showErrorMessage(`Failed to load course contents: ${message}`);
      return [];
    }
  }
  
  private async getStudentSubmissionGroups(courseId: string): Promise<SubmissionGroupStudent[]> {
    if (this.submissionGroupsCache.has(courseId)) {
      return this.submissionGroupsCache.get(courseId) || [];
    }

    try {
      const submissionGroups = await this.apiService.getStudentSubmissionGroups({ course_id: courseId });
      this.submissionGroupsCache.set(courseId, submissionGroups || []);
      return submissionGroups || [];
    } catch (error: any) {
      console.error('Failed to get submission groups:', error);
      const message = error?.response?.data?.message || error?.message || 'Unknown error';
      vscode.window.showErrorMessage(`Failed to load submission groups: ${message}`);
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
    if (element instanceof StudentAssignmentTreeItem) {
      const pathParts = element.content.path.split('.');
      if (pathParts.length === 1) {
        // Root assignment - parent is course
        return new StudentCourseTreeItem(element.course);
      } else {
        // Find parent unit
        const parentPath = pathParts.slice(0, -1).join('.');
        const [allContents, submissionGroups] = await Promise.all([
          this.getStudentCourseContents(element.course.id),
          this.getStudentSubmissionGroups(element.course.id)
        ]);
        const parentContent = allContents.find(c => c.path === parentPath);
        
        if (parentContent) {
          const hasChildren = this.hasChildContents(parentContent, allContents);
          if (hasChildren) {
            const unitSubmissionGroups = this.findSubmissionGroupsForUnit(parentContent, allContents, submissionGroups);
            return new StudentUnitTreeItem(parentContent, element.course, unitSubmissionGroups);
          }
        }
      }
    }
    
    if (element instanceof StudentUnitTreeItem) {
      const pathParts = element.content.path.split('.');
      if (pathParts.length === 1) {
        // Root unit - parent is course
        return new StudentCourseTreeItem(element.course);
      } else {
        // Find parent unit
        const parentPath = pathParts.slice(0, -1).join('.');
        const [allContents, submissionGroups] = await Promise.all([
          this.getStudentCourseContents(element.course.id),
          this.getStudentSubmissionGroups(element.course.id)
        ]);
        const parentContent = allContents.find(c => c.path === parentPath);
        
        if (parentContent) {
          const hasChildren = this.hasChildContents(parentContent, allContents);
          if (hasChildren) {
            const unitSubmissionGroups = this.findSubmissionGroupsForUnit(parentContent, allContents, submissionGroups);
            return new StudentUnitTreeItem(parentContent, element.course, unitSubmissionGroups);
          }
        }
      }
    }
    
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

  /**
   * Find submission groups for all assignments within a unit (including nested units)
   */
  private findSubmissionGroupsForUnit(
    unitContent: StudentCourseContent,
    allContents: StudentCourseContent[],
    submissionGroups: SubmissionGroupStudent[]
  ): SubmissionGroupStudent[] {
    const unitPath = unitContent.path;
    
    // Find all assignments within this unit (including nested)
    const assignmentsInUnit = allContents.filter(content => 
      content.path.startsWith(unitPath + '.') && content.example_id
    );
    
    // Find submission groups for these assignments
    const unitSubmissionGroups: SubmissionGroupStudent[] = [];
    for (const assignment of assignmentsInUnit) {
      const sg = this.findSubmissionGroupForContent(assignment, submissionGroups);
      if (sg) {
        unitSubmissionGroups.push(sg);
      }
    }
    
    return unitSubmissionGroups;
  }

  /**
   * Find the submission group for a specific course content item
   */
  private findSubmissionGroupForContent(
    content: StudentCourseContent,
    submissionGroups: SubmissionGroupStudent[]
  ): SubmissionGroupStudent | undefined {
    // Match by course content path
    return submissionGroups.find(sg => sg.course_content_path === content.path);
  }
}