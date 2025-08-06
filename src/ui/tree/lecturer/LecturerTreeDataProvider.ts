import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import {
  OrganizationTreeItem,
  CourseFamilyTreeItem,
  CourseTreeItem,
  CourseContentTreeItem,
  ExampleTreeItem
} from './LecturerTreeItems';
import { CourseContentList, CourseContentCreate, CourseContentUpdate } from '../../../types/generated';

type TreeItem = OrganizationTreeItem | CourseFamilyTreeItem | CourseTreeItem | CourseContentTreeItem | ExampleTreeItem;

export class LecturerTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private apiService: ComputorApiService;
  private courseContentsCache: Map<string, CourseContentList[]> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.apiService = new ComputorApiService(context);
  }

  refresh(): void {
    this.courseContentsCache.clear();
    this._onDidChangeTreeData.fire();
  }

  refreshNode(element?: TreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    try {
      if (!element) {
        // Root level - show organizations
        const organizations = await this.apiService.getOrganizations();
        return organizations.map(org => new OrganizationTreeItem(org));
      }

      if (element instanceof OrganizationTreeItem) {
        // Show course families for organization
        const families = await this.apiService.getCourseFamilies(element.organization.id);
        return families.map(family => new CourseFamilyTreeItem(family, element.organization));
      }

      if (element instanceof CourseFamilyTreeItem) {
        // Show courses for course family
        const courses = await this.apiService.getCourses(element.courseFamily.id);
        return courses.map(course => new CourseTreeItem(course, element.courseFamily, element.organization));
      }

      if (element instanceof CourseTreeItem) {
        // Show course contents for course
        const contents = await this.getCourseContents(element.course.id);
        
        // Build tree structure from ltree paths
        const rootContents = this.getRootContents(contents);
        return rootContents.map(content => {
          const hasChildren = this.hasChildContents(content, contents);
          return new CourseContentTreeItem(
            content,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren
          );
        });
      }

      if (element instanceof CourseContentTreeItem) {
        // Show child course contents
        const allContents = await this.getCourseContents(element.course.id);
        const childContents = this.getChildContents(element.courseContent, allContents);
        
        return childContents.map(content => {
          const hasChildren = this.hasChildContents(content, allContents);
          return new CourseContentTreeItem(
            content,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren
          );
        });
      }

      return [];
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to load tree data: ${error}`);
      return [];
    }
  }

  private async getCourseContents(courseId: string): Promise<CourseContentList[]> {
    if (!this.courseContentsCache.has(courseId)) {
      const contents = await this.apiService.getCourseContents(courseId);
      this.courseContentsCache.set(courseId, contents);
    }
    return this.courseContentsCache.get(courseId) || [];
  }

  private getRootContents(contents: CourseContentList[]): CourseContentList[] {
    // Get contents that have no parent (root level)
    return contents.filter(content => {
      const pathParts = content.path.split('.');
      return pathParts.length === 1;
    }).sort((a, b) => a.position - b.position);
  }

  private getChildContents(parent: CourseContentList, allContents: CourseContentList[]): CourseContentList[] {
    // Get direct children of the parent content
    const parentPath = parent.path;
    const parentDepth = parentPath.split('.').length;
    
    return allContents.filter(content => {
      const contentPath = content.path;
      const contentDepth = contentPath.split('.').length;
      
      // Check if this is a direct child (one level deeper and starts with parent path)
      return contentPath.startsWith(parentPath + '.') && contentDepth === parentDepth + 1;
    }).sort((a, b) => a.position - b.position);
  }

  private hasChildContents(content: CourseContentList, allContents: CourseContentList[]): boolean {
    const contentPath = content.path;
    return allContents.some(c => c.path.startsWith(contentPath + '.') && c.path !== contentPath);
  }

  async getParent(element: TreeItem): Promise<TreeItem | undefined> {
    if (element instanceof CourseFamilyTreeItem) {
      return new OrganizationTreeItem(element.organization);
    }
    
    if (element instanceof CourseTreeItem) {
      return new CourseFamilyTreeItem(element.courseFamily, element.organization);
    }
    
    if (element instanceof CourseContentTreeItem) {
      const pathParts = element.courseContent.path.split('.');
      if (pathParts.length === 1) {
        // Root content - parent is course
        return new CourseTreeItem(element.course, element.courseFamily, element.organization);
      } else {
        // Find parent content
        const parentPath = pathParts.slice(0, -1).join('.');
        const allContents = await this.getCourseContents(element.course.id);
        const parentContent = allContents.find(c => c.path === parentPath);
        
        if (parentContent) {
          const hasChildren = this.hasChildContents(parentContent, allContents);
          return new CourseContentTreeItem(
            parentContent,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren
          );
        }
      }
    }
    
    return undefined;
  }

  // Helper methods for course content management
  async createCourseContent(courseItem: CourseTreeItem, title: string, parentPath?: string): Promise<void> {
    try {
      const position = await this.getNextPosition(courseItem.course.id, parentPath);
      const path = parentPath ? `${parentPath}.${position}` : `${position}`;
      
      // Get course content types for this course
      const courseId = courseItem.course.id;
      
      const contentData: CourseContentCreate = {
        title,
        path,
        position,
        course_id: courseId,
        course_content_type_id: '', // This would need to be fetched from the API
      };
      
      await this.apiService.createCourseContent(courseId, contentData);
      
      // Clear cache and refresh
      this.courseContentsCache.delete(courseId);
      this.refreshNode(courseItem);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create course content: ${error}`);
    }
  }

  async updateCourseContent(contentItem: CourseContentTreeItem, updates: CourseContentUpdate): Promise<void> {
    try {
      await this.apiService.updateCourseContent(
        contentItem.course.id,
        contentItem.courseContent.id,
        updates
      );
      
      // Clear cache and refresh
      this.courseContentsCache.delete(contentItem.course.id);
      this.refreshNode(contentItem);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update course content: ${error}`);
    }
  }

  async deleteCourseContent(contentItem: CourseContentTreeItem): Promise<void> {
    try {
      await this.apiService.deleteCourseContent(
        contentItem.course.id,
        contentItem.courseContent.id
      );
      
      // Clear cache and refresh parent
      this.courseContentsCache.delete(contentItem.course.id);
      const parent = await this.getParent(contentItem);
      this.refreshNode(parent);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete course content: ${error}`);
    }
  }

  private async getNextPosition(courseId: string, parentPath?: string): Promise<number> {
    const contents = await this.getCourseContents(courseId);
    
    if (parentPath) {
      const siblings = this.getChildContents({ path: parentPath } as CourseContentList, contents);
      return siblings.length + 1;
    } else {
      const roots = this.getRootContents(contents);
      return roots.length + 1;
    }
  }
}