import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { GitLabTokenManager } from '../../../services/GitLabTokenManager';
import {
  OrganizationTreeItem,
  CourseFamilyTreeItem,
  CourseTreeItem,
  CourseContentTreeItem,
  CourseFolderTreeItem,
  CourseContentTypeTreeItem,
  ExampleTreeItem
} from './LecturerTreeItems';
import { 
  CourseContentList, 
  CourseContentCreate, 
  CourseContentUpdate, 
  CourseList,
  CourseContentTypeList
} from '../../../types/generated';

type TreeItem = OrganizationTreeItem | CourseFamilyTreeItem | CourseTreeItem | CourseContentTreeItem | CourseFolderTreeItem | CourseContentTypeTreeItem | ExampleTreeItem;

export class LecturerTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private apiService: ComputorApiService;
  private gitLabTokenManager: GitLabTokenManager;
  private courseContentsCache: Map<string, CourseContentList[]> = new Map();
  private coursesCache: Map<string, CourseList[]> = new Map();
  private courseContentTypesCache: Map<string, CourseContentTypeList[]> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.apiService = new ComputorApiService(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
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
        
        // Check for unique GitLab URLs and ensure we have tokens
        await this.ensureGitLabTokensForCourses(courses);
        
        // Cache courses for later use
        this.coursesCache.set(element.courseFamily.id, courses);
        
        return courses.map(course => new CourseTreeItem(course, element.courseFamily, element.organization));
      }

      if (element instanceof CourseTreeItem) {
        // Show two folders: Contents and Content Types
        return [
          new CourseFolderTreeItem('contents', element.course, element.courseFamily, element.organization),
          new CourseFolderTreeItem('contentTypes', element.course, element.courseFamily, element.organization)
        ];
      }

      if (element instanceof CourseFolderTreeItem) {
        if (element.folderType === 'contents') {
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
        } else {
          // Show course content types
          const contentTypes = await this.getCourseContentTypes(element.course.id);
          return contentTypes.map(type => new CourseContentTypeTreeItem(
            type,
            element.course,
            element.courseFamily,
            element.organization
          ));
        }
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

  private async getCourseContentTypes(courseId: string): Promise<CourseContentTypeList[]> {
    if (!this.courseContentTypesCache.has(courseId)) {
      const types = await this.apiService.getCourseContentTypes(courseId);
      this.courseContentTypesCache.set(courseId, types);
    }
    return this.courseContentTypesCache.get(courseId) || [];
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
    
    if (element instanceof CourseFolderTreeItem) {
      return new CourseTreeItem(element.course, element.courseFamily, element.organization);
    }
    
    if (element instanceof CourseContentTypeTreeItem) {
      return new CourseFolderTreeItem('contentTypes', element.course, element.courseFamily, element.organization);
    }
    
    if (element instanceof CourseContentTreeItem) {
      const pathParts = element.courseContent.path.split('.');
      if (pathParts.length === 1) {
        // Root content - parent is contents folder
        return new CourseFolderTreeItem('contents', element.course, element.courseFamily, element.organization);
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
  async createCourseContent(folderItem: CourseFolderTreeItem, title: string, contentTypeId: string, parentPath?: string): Promise<void> {
    try {
      const position = await this.getNextPosition(folderItem.course.id, parentPath);
      const path = parentPath ? `${parentPath}.${position}` : `${position}`;
      
      const contentData: CourseContentCreate = {
        title,
        path,
        position,
        course_id: folderItem.course.id,
        course_content_type_id: contentTypeId,
      };
      
      await this.apiService.createCourseContent(folderItem.course.id, contentData);
      
      // Clear cache and refresh
      this.courseContentsCache.delete(folderItem.course.id);
      this.refreshNode(folderItem);
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

  /**
   * Ensure we have GitLab tokens for all unique GitLab instances in courses
   */
  private async ensureGitLabTokensForCourses(courses: CourseList[]): Promise<void> {
    const gitlabUrls = new Set<string>();
    
    // Extract unique GitLab URLs from courses
    for (const course of courses) {
      const url = this.gitLabTokenManager.extractGitLabUrlFromCourse(course);
      if (url) {
        gitlabUrls.add(url);
      }
    }
    
    // Prompt for tokens for each unique URL
    for (const url of gitlabUrls) {
      await this.gitLabTokenManager.ensureTokenForUrl(url);
    }
  }

  /**
   * Get GitLab token for a course
   */
  async getGitLabTokenForCourse(course: CourseList): Promise<string | undefined> {
    const gitlabUrl = this.gitLabTokenManager.extractGitLabUrlFromCourse(course);
    if (!gitlabUrl) {
      return undefined;
    }
    
    return await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
  }
}