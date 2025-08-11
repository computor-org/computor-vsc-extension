import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { GitLabTokenManager } from '../../../services/GitLabTokenManager';
import { ComputorSettingsManager } from '../../../settings/ComputorSettingsManager';
import { errorRecoveryService } from '../../../services/ErrorRecoveryService';
import { performanceMonitor } from '../../../services/PerformanceMonitoringService';
import { VirtualScrollingService } from '../../../services/VirtualScrollingService';
import {
  OrganizationTreeItem,
  CourseFamilyTreeItem,
  CourseTreeItem,
  CourseContentTreeItem,
  CourseFolderTreeItem,
  CourseContentTypeTreeItem,
  ExampleTreeItem,
  CourseGroupTreeItem,
  NoGroupTreeItem,
  CourseMemberTreeItem,
  LoadMoreTreeItem
} from './LecturerTreeItems';
import { 
  CourseContentList, 
  CourseContentCreate, 
  CourseContentUpdate, 
  CourseList,
  CourseContentTypeList,
  CourseContentKindList,
  CourseGroupList,
  CourseMemberList,
  ExampleGet
} from '../../../types/generated';

type TreeItem = OrganizationTreeItem | CourseFamilyTreeItem | CourseTreeItem | CourseContentTreeItem | CourseFolderTreeItem | CourseContentTypeTreeItem | ExampleTreeItem | CourseGroupTreeItem | NoGroupTreeItem | CourseMemberTreeItem | LoadMoreTreeItem;

interface NodeUpdateData {
  course_id?: string;
  [key: string]: unknown;
}

interface PaginationInfo {
  offset: number;
  limit: number;
  total?: number;
  hasMore: boolean;
}

export class LecturerTreeDataProvider implements vscode.TreeDataProvider<TreeItem>, vscode.TreeDragAndDropController<TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  public readonly dropMimeTypes = ['application/vnd.code.tree.computorexample'];
  public readonly dragMimeTypes: string[] = []; // This tree only accepts drops, doesn't provide drags

  private apiService: ComputorApiService;
  private gitLabTokenManager: GitLabTokenManager;
  private settingsManager: ComputorSettingsManager;
  private courseContentsCache: Map<string, CourseContentList[]> = new Map();
  private coursesCache: Map<string, CourseList[]> = new Map();
  private courseContentTypesCache: Map<string, CourseContentTypeList[]> = new Map();
  private courseContentTypesById: Map<string, CourseContentTypeList> = new Map();
  private courseContentKindsCache: Map<string, CourseContentKindList> = new Map();
  private courseGroupsCache: Map<string, CourseGroupList[]> = new Map();
  private courseMembersCache: Map<string, CourseMemberList[]> = new Map();

  private examplesCache: Map<string, ExampleGet> = new Map();
  private expandedStates: Record<string, boolean> = {};
  
  // Pagination state for different node types
  private paginationState: Map<string, PaginationInfo> = new Map();
  
  // Virtual scrolling services for large datasets
  private virtualScrollServices: Map<string, VirtualScrollingService<any>> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.apiService = new ComputorApiService(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.settingsManager = new ComputorSettingsManager(context);
    
    // Load expanded states on startup
    this.loadExpandedStates();
  }

  async refresh(): Promise<void> {
    console.log('Full tree refresh requested');
    this.courseContentsCache.clear();
    this.coursesCache.clear();
    this.courseContentTypesCache.clear();
    this.courseContentTypesById.clear();
    this.courseContentKindsCache.clear();
    this.courseGroupsCache.clear();
    this.courseMembersCache.clear();
    this.examplesCache.clear();
    this.paginationState.clear(); // Clear pagination state on full refresh
    
    // Clear all virtual scrolling services
    for (const service of this.virtualScrollServices.values()) {
      service.reset();
    }
    this.virtualScrollServices.clear();
    
    // Pre-fetch data for expanded courses to ensure fresh data is loaded
    for (const nodeId of Object.keys(this.expandedStates)) {
      if (nodeId.startsWith('course-') && this.expandedStates[nodeId]) {
        const courseId = nodeId.replace('course-', '');
        try {
          console.log(`Pre-fetching data for expanded course ${courseId}`);
          const contents = await this.apiService.getCourseContents(courseId, true); // skipCache = true
          if (contents) {
            this.courseContentsCache.set(courseId, contents);
          }
        } catch (error) {
          console.error(`Failed to pre-fetch course contents for ${courseId}:`, error);
        }
      }
    }
    
    // Fire with undefined to refresh entire tree
    this._onDidChangeTreeData.fire();
  }

  refreshNode(element?: TreeItem): void {
    this._onDidChangeTreeData.fire(element);
  }
  
  /**
   * Force refresh a specific course by clearing its cache and pre-fetching data
   * This ensures the data is refreshed even if the node is collapsed
   */
  async forceRefreshCourse(courseId: string): Promise<void> {
    console.log(`Force refreshing course ${courseId}`);
    
    // Clear all caches for this course
    this.clearCourseCache(courseId);
    
    // Pre-fetch the course contents to ensure fresh data is loaded
    try {
      const contents = await this.apiService.getCourseContents(courseId, true); // skipCache = true
      if (contents) {
        this.courseContentsCache.set(courseId, contents);
        console.log(`Pre-fetched ${contents.length} course contents for course ${courseId}`);
      }
    } catch (error) {
      console.error(`Failed to pre-fetch course contents for ${courseId}:`, error);
    }
    
    // Fire tree data change event to update the UI
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Load more items for paginated lists
   */
  async loadMore(loadMoreItem: LoadMoreTreeItem): Promise<void> {
    const virtualKey = `${loadMoreItem.parentType}-${loadMoreItem.parentId}`;
    const virtualService = this.virtualScrollServices.get(virtualKey);
    
    if (virtualService) {
      // Load next page using virtual scrolling
      void loadMoreItem.currentOffset; // currentOffset - accessed but not used in this context
      void loadMoreItem.pageSize; // pageSize - accessed but not used in this context
      
      // Trigger refresh to load more items
      this._onDidChangeTreeData.fire(undefined);
    } else {
      // Fallback to pagination state
      const paginationKey = `${loadMoreItem.parentType}-${loadMoreItem.parentId}`;
      const pagination = this.paginationState.get(paginationKey);
      
      if (pagination) {
        // Update offset to load more items
        pagination.offset = loadMoreItem.currentOffset;
        
        // Find the parent element and refresh it
        // This will trigger getChildren again with the updated pagination
        this._onDidChangeTreeData.fire(undefined);
      }
    }
  }

  /**
   * Clear cache for a specific course
   */
  private clearCourseCache(courseId: string): void {
    this.courseContentsCache.delete(courseId);
    this.courseContentTypesCache.delete(courseId);
    this.courseGroupsCache.delete(courseId);
    this.courseMembersCache.delete(courseId);
    
    // Clear content types by ID cache for this course
    const typesToDelete: string[] = [];
    for (const [typeId, type] of this.courseContentTypesById.entries()) {
      if (type.course_id === courseId) {
        typesToDelete.push(typeId);
      }
    }
    typesToDelete.forEach(id => this.courseContentTypesById.delete(id));
    
    // Clear course members cache for this course (including group-specific caches)
    const memberKeysToDelete: string[] = [];
    for (const [cacheKey] of this.courseMembersCache.entries()) {
      if (cacheKey === courseId || cacheKey.startsWith(`${courseId}-`)) {
        memberKeysToDelete.push(cacheKey);
      }
    }
    memberKeysToDelete.forEach(key => this.courseMembersCache.delete(key));
  }

  /**
   * Update a specific node and refresh related parts of the tree
   */
  updateNode(nodeType: string, nodeId: string, updates: NodeUpdateData): void {
    switch (nodeType) {
      case 'organization':
        // Full refresh for organization changes
        this.refresh();
        break;
        
      case 'courseFamily':
        // Clear course family cache and refresh
        this.coursesCache.clear();
        this.refresh();
        break;
        
      case 'course':
        // Clear course-specific caches
        this.clearCourseCache(nodeId);
        this.refresh();
        break;
        
      case 'courseContent':
        // Clear course content cache and refresh affected course
        if (updates.course_id) {
          this.clearCourseCache(updates.course_id);
        }
        this.refresh();
        break;
        
      case 'courseContentType':
        // Clear content type cache and refresh affected course
        if (updates.course_id) {
          this.clearCourseCache(updates.course_id);
          this.courseContentTypesById.delete(nodeId);
        }
        this.refresh();
        break;
        
      default:
        // Default to full refresh
        this.refresh();
    }
  }

  /**
   * Invalidate cache entries related to a specific item
   */
  invalidateCache(itemType: string, itemId?: string, relatedIds?: { courseId?: string; organizationId?: string }): void {
    switch (itemType) {
      case 'course':
        if (itemId) {
          this.clearCourseCache(itemId);
        }
        break;
        
      case 'courseFamily':
        // Clear courses cache when course family changes
        this.coursesCache.clear();
        break;
        
      case 'organization':
        // Clear all caches when organization changes
        this.courseContentsCache.clear();
        this.courseContentTypesCache.clear();
        this.courseContentTypesById.clear();
        this.coursesCache.clear();
        break;
        
      case 'example':
        // Clear examples cache
        if (itemId) {
          this.examplesCache.delete(itemId);
        } else {
          this.examplesCache.clear();
        }
        break;
        
      case 'courseContent':
        // Clear course content cache for related course
        if (relatedIds?.courseId) {
          this.clearCourseCache(relatedIds.courseId);
        }
        break;
        
      case 'courseContentType':
        // Clear content type caches
        if (itemId) {
          this.courseContentTypesById.delete(itemId);
        }
        if (relatedIds?.courseId) {
          this.courseContentTypesCache.delete(relatedIds.courseId);
        }
        break;
        
      case 'courseGroup':
        // Clear course group and member caches
        if (relatedIds?.courseId) {
          this.courseGroupsCache.delete(relatedIds.courseId);
          
          // Clear course members cache for this course (including group-specific caches)
          const memberKeysToDelete: string[] = [];
          for (const [cacheKey] of this.courseMembersCache.entries()) {
            if (cacheKey === relatedIds.courseId || cacheKey.startsWith(`${relatedIds.courseId}-`)) {
              memberKeysToDelete.push(cacheKey);
            }
          }
          memberKeysToDelete.forEach(key => this.courseMembersCache.delete(key));
        }
        break;
    }
  }

  /**
   * Smart refresh - only refreshes the minimal tree parts needed
   */
  smartRefresh(changes: Array<{
    type: 'create' | 'update' | 'delete';
    nodeType: string;
    nodeId: string;
    relatedIds?: { courseId?: string; parentId?: string; organizationId?: string };
  }>): void {
    const affectedCourses = new Set<string>();
    let needsFullRefresh = false;

    changes.forEach(change => {
      switch (change.nodeType) {
        case 'organization':
          needsFullRefresh = true;
          break;
          
        case 'courseFamily':
          this.coursesCache.clear();
          needsFullRefresh = true;
          break;
          
        case 'course':
          if (change.relatedIds?.courseId) {
            affectedCourses.add(change.relatedIds.courseId);
          }
          break;
          
        case 'courseContent':
        case 'courseContentType':
          if (change.relatedIds?.courseId) {
            affectedCourses.add(change.relatedIds.courseId);
          }
          break;
      }
      
      // Invalidate relevant caches
      this.invalidateCache(change.nodeType, change.nodeId, change.relatedIds);
    });

    if (needsFullRefresh) {
      this.refresh();
    } else {
      // Refresh only affected parts
      affectedCourses.forEach(courseId => {
        this.clearCourseCache(courseId);
      });
      this.refresh();
    }
  }

  getTreeItem(element: TreeItem): vscode.TreeItem {
    // Create a new tree item with the correct expanded state
    const nodeId = element.id;
    if (nodeId && this.expandedStates[nodeId] && element.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed) {
      const expandedItem = new vscode.TreeItem(element.label || '', vscode.TreeItemCollapsibleState.Expanded);
      expandedItem.id = element.id;
      expandedItem.contextValue = element.contextValue;
      expandedItem.iconPath = element.iconPath;
      expandedItem.tooltip = element.tooltip;
      expandedItem.description = element.description;
      expandedItem.command = element.command;
      expandedItem.resourceUri = element.resourceUri;
      return expandedItem;
    }
    
    return element;
  }

  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
    return performanceMonitor.measureAsync(
      `getChildren-${element?.contextValue || 'root'}`,
      async () => this.getChildrenInternal(element),
      'tree',
      { elementType: element?.contextValue || 'root' }
    );
  }
  
  private async getChildrenInternal(element?: TreeItem): Promise<TreeItem[]> {
    try {
      if (!element) {
        // Root level - show organizations with error recovery
        const organizations = await errorRecoveryService.executeWithRecovery(
          () => this.apiService.getOrganizations(),
          { 
            maxRetries: 3,
            onRetry: (attempt) => {
              vscode.window.showInformationMessage(`Retrying connection... (attempt ${attempt})`);
            }
          }
        );
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
        // Show three folders: Groups, Content Types, and Contents
        return [
          new CourseFolderTreeItem('groups', element.course, element.courseFamily, element.organization),
          new CourseFolderTreeItem('contentTypes', element.course, element.courseFamily, element.organization),
          new CourseFolderTreeItem('contents', element.course, element.courseFamily, element.organization)
        ];
      }

      if (element instanceof CourseFolderTreeItem) {
        if (element.folderType === 'contents') {
          // Ensure content types are loaded for this course
          await this.getCourseContentTypes(element.course.id);
          
          // Show course contents for course with virtual scrolling for large lists
          const allContents = await this.getCourseContents(element.course.id);
          
          // Build tree structure from ltree paths
          const rootContents = this.getRootContents(allContents);
          
          // Use virtual scrolling for large lists (> 100 items)
          if (rootContents.length > 100) {
            const virtualKey = `contents-${element.course.id}`;
            
            // Get or create virtual scrolling service
            let virtualService = this.virtualScrollServices.get(virtualKey);
            if (!virtualService) {
              virtualService = new VirtualScrollingService(
                async (page: number, pageSize: number) => {
                  const start = page * pageSize;
                  const items = rootContents.slice(start, start + pageSize);
                  
                  // Transform to tree items
                  const treeItems = await Promise.all(items.map(async content => {
                    const hasChildren = this.hasChildContents(content, allContents);
                    let exampleInfo = null;
                    
                    if (content.example_id) {
                      console.log(`[Virtual scroll] Fetching example info for content "${content.title}" with example_id: ${content.example_id}`);
                      exampleInfo = await this.getExampleInfo(content.example_id);
                      console.log(`[Virtual scroll] Example info fetched:`, exampleInfo ? `${exampleInfo.title}` : 'null');
                    }
                    
                    const contentType = this.courseContentTypesById.get(content.course_content_type_id);
                    const isSubmittable = this.isContentSubmittable(contentType);
                    
                    return new CourseContentTreeItem(
                      content,
                      element.course,
                      element.courseFamily,
                      element.organization,
                      hasChildren,
                      exampleInfo,
                      contentType,
                      isSubmittable
                    );
                  }));
                  
                  return { items: treeItems, total: rootContents.length };
                },
                { pageSize: 50, preloadPages: 2, maxCachedPages: 10 }
              );
              
              this.virtualScrollServices.set(virtualKey, virtualService);
            }
            
            // Get first page of items
            const items = await virtualService.getItems(0, 50);
            
            // Add load more if there are more items
            if (rootContents.length > items.length) {
              items.push(new LoadMoreTreeItem(
                element.course.id,
                'contents',
                items.length,
                50
              ));
            }
            
            return items;
          } else {
            // Small list - load all at once
            const contentItems = await Promise.all(rootContents.map(async content => {
              const hasChildren = this.hasChildContents(content, allContents);
              let exampleInfo = null;
              
              if (content.example_id) {
                console.log(`Fetching example info for content "${content.title}" with example_id: ${content.example_id}`);
                exampleInfo = await this.getExampleInfo(content.example_id);
                console.log(`Example info fetched:`, exampleInfo ? `${exampleInfo.title}` : 'null');
              }
              
              // Get content type info
              const contentType = this.courseContentTypesById.get(content.course_content_type_id);
              const isSubmittable = this.isContentSubmittable(contentType);
              
              return new CourseContentTreeItem(
                content,
                element.course,
                element.courseFamily,
                element.organization,
                hasChildren,
                exampleInfo,
                contentType,
                isSubmittable
              );
            }));
            
            return contentItems;
          }
        } else if (element.folderType === 'groups') {
          // Show course groups and ungrouped members
          const groups = await this.getCourseGroups(element.course.id);
          const allMembers = await this.getCourseMembers(element.course.id);
          
          const result: TreeItem[] = [];
          
          // Add group nodes
          for (const group of groups) {
            const groupMembers = allMembers.filter((m: CourseMemberList) => m.course_group_id === group.id);
            result.push(new CourseGroupTreeItem(
              group,
              element.course,
              element.courseFamily,
              element.organization,
              groupMembers.length
            ));
          }
          
          // Add "No Group" node for ungrouped members
          const ungroupedMembers = allMembers.filter((m: CourseMemberList) => !m.course_group_id);
          if (ungroupedMembers.length > 0 || groups.length === 0) {
            result.push(new NoGroupTreeItem(
              element.course,
              element.courseFamily,
              element.organization,
              ungroupedMembers.length
            ));
          }
          
          return result;
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
        
        // Fetch example info for child contents
        const childItems = await Promise.all(childContents.map(async content => {
          const hasChildren = this.hasChildContents(content, allContents);
          let exampleInfo = null;
          
          if (content.example_id) {
            exampleInfo = await this.getExampleInfo(content.example_id);
          }
          
          // Get content type info
          const contentType = this.courseContentTypesById.get(content.course_content_type_id);
          const isSubmittable = this.isContentSubmittable(contentType);
          
          return new CourseContentTreeItem(
            content,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren,
            exampleInfo,
            contentType,
            isSubmittable
          );
        }));
        
        return childItems;
      }

      if (element instanceof CourseGroupTreeItem) {
        // Show members in this group
        const members = await this.getCourseMembers(element.course.id, element.group.id);
        
        // Use virtual scrolling for large member lists (> 100)
        if (members.length > 100) {
          const virtualKey = `members-${element.course.id}-${element.group.id}`;
          
          let virtualService = this.virtualScrollServices.get(virtualKey);
          if (!virtualService) {
            virtualService = new VirtualScrollingService(
              async (page: number, pageSize: number) => {
                const start = page * pageSize;
                const items = members.slice(start, start + pageSize);
                
                const treeItems = items.map((member: CourseMemberList) => new CourseMemberTreeItem(
                  member,
                  element.course,
                  element.courseFamily,
                  element.organization,
                  element.group
                ));
                
                return { items: treeItems, total: members.length };
              },
              { pageSize: 50, preloadPages: 1, maxCachedPages: 5 }
            );
            
            this.virtualScrollServices.set(virtualKey, virtualService);
          }
          
          const items = await virtualService.getItems(0, 50);
          
          if (members.length > items.length) {
            items.push(new LoadMoreTreeItem(
              element.group.id,
              'members',
              items.length,
              50
            ));
          }
          
          return items;
        } else {
          return members.map((member: CourseMemberList) => new CourseMemberTreeItem(
            member,
            element.course,
            element.courseFamily,
            element.organization,
            element.group
          ));
        }
      }

      if (element instanceof NoGroupTreeItem) {
        // Show members not in any group
        const members = await this.getCourseMembers(element.course.id);
        const ungroupedMembers = members.filter((m: CourseMemberList) => !m.course_group_id);
        
        // Use virtual scrolling for large member lists (> 100)
        if (ungroupedMembers.length > 100) {
          const virtualKey = `members-${element.course.id}-ungrouped`;
          
          let virtualService = this.virtualScrollServices.get(virtualKey);
          if (!virtualService) {
            virtualService = new VirtualScrollingService(
              async (page: number, pageSize: number) => {
                const start = page * pageSize;
                const items = ungroupedMembers.slice(start, start + pageSize);
                
                const treeItems = items.map((member: CourseMemberList) => new CourseMemberTreeItem(
                  member,
                  element.course,
                  element.courseFamily,
                  element.organization
                ));
                
                return { items: treeItems, total: ungroupedMembers.length };
              },
              { pageSize: 50, preloadPages: 1, maxCachedPages: 5 }
            );
            
            this.virtualScrollServices.set(virtualKey, virtualService);
          }
          
          const items = await virtualService.getItems(0, 50);
          
          if (ungroupedMembers.length > items.length) {
            items.push(new LoadMoreTreeItem(
              element.course.id,
              'members-ungrouped',
              items.length,
              50
            ));
          }
          
          return items;
        } else {
          return ungroupedMembers.map((member: CourseMemberList) => new CourseMemberTreeItem(
            member,
            element.course,
            element.courseFamily,
            element.organization
          ));
        }
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
      
      // Also cache by ID for quick lookup
      types.forEach(type => {
        this.courseContentTypesById.set(type.id, type);
      });
      
      // Load content kinds if not already loaded
      await this.loadContentKinds();
    }
    return this.courseContentTypesCache.get(courseId) || [];
  }
  
  private async loadContentKinds(): Promise<void> {
    if (this.courseContentKindsCache.size === 0) {
      const kinds = await this.apiService.getCourseContentKinds();
      kinds.forEach(kind => {
        this.courseContentKindsCache.set(kind.id, kind);
      });
    }
  }

  private async getCourseGroups(courseId: string): Promise<CourseGroupList[]> {
    if (!this.courseGroupsCache.has(courseId)) {
      const groups = await this.apiService.getCourseGroups(courseId);
      this.courseGroupsCache.set(courseId, groups);
    }
    return this.courseGroupsCache.get(courseId) || [];
  }

  private async getCourseMembers(courseId: string, groupId?: string): Promise<CourseMemberList[]> {
    const cacheKey = groupId ? `${courseId}-${groupId}` : courseId;
    if (!this.courseMembersCache.has(cacheKey)) {
      const members = await this.apiService.getCourseMembers(courseId, groupId);
      this.courseMembersCache.set(cacheKey, members);
    }
    return this.courseMembersCache.get(cacheKey) || [];
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
          let exampleInfo = null;
          
          if (parentContent.example_id) {
            exampleInfo = await this.getExampleInfo(parentContent.example_id);
          }
          
          // Get content type info
          const contentType = this.courseContentTypesById.get(parentContent.course_content_type_id);
          const isSubmittable = this.isContentSubmittable(contentType);
          
          return new CourseContentTreeItem(
            parentContent,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren,
            exampleInfo,
            contentType,
            isSubmittable
          );
        }
      }
    }
    
    return undefined;
  }

  // Helper methods for course content management
  async createCourseContent(folderItem: CourseFolderTreeItem, title: string, contentTypeId: string, parentPath?: string, slug?: string): Promise<void> {
    try {
      const position = await this.getNextPosition(folderItem.course.id, parentPath);
      
      // Use slug if provided, otherwise fall back to position number
      const pathSegment = slug || `item${position}`;
      const path = parentPath ? `${parentPath}.${pathSegment}` : pathSegment;
      
      // Check if path already exists
      const existingContents = await this.getCourseContents(folderItem.course.id);
      if (existingContents.some(c => c.path === path)) {
        vscode.window.showErrorMessage(`A content item with path '${path}' already exists. Please use a different slug.`);
        return;
      }
      
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
      
      // If creating under a parent, refresh the parent node
      if (parentPath) {
        const parentContent = existingContents.find(c => c.path === parentPath);
        if (parentContent) {
          // Don't need to create new item, just refresh
          this.refreshNode();
        }
      } else {
        this.refreshNode(folderItem);
      }
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
  
  private isContentSubmittable(contentType?: CourseContentTypeList): boolean {
    if (!contentType) return false;
    
    const kind = this.courseContentKindsCache.get(contentType.course_content_kind_id);
    return kind?.submittable || false;
  }

  /**
   * Ensure we have GitLab tokens for all unique GitLab instances in courses
   */
  private async getExampleInfo(exampleId: string): Promise<ExampleGet | null> {
    // Check cache first
    if (this.examplesCache.has(exampleId)) {
      return this.examplesCache.get(exampleId) || null;
    }
    
    try {
      const example = await this.apiService.getExample(exampleId);
      if (example) {
        this.examplesCache.set(exampleId, example);
        return example;
      } else {
        console.warn(`Example ${exampleId} not found or returned undefined`);
      }
    } catch (error) {
      console.error(`Failed to fetch example ${exampleId}:`, error);
      // Show a more user-friendly error message
      vscode.window.showWarningMessage(`Failed to load example information for ID: ${exampleId}`);
    }
    
    return null;
  }

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

  /**
   * Load expanded states from settings
   */
  private async loadExpandedStates(): Promise<void> {
    try {
      this.expandedStates = await this.settingsManager.getTreeExpandedStates();
    } catch (error) {
      console.error('Failed to load expanded states:', error);
      this.expandedStates = {};
    }
  }


  /**
   * Set node expanded state
   */
  public async setNodeExpanded(nodeId: string, expanded: boolean): Promise<void> {
    if (expanded) {
      this.expandedStates[nodeId] = true;
    } else {
      delete this.expandedStates[nodeId];
    }
    
    try {
      await this.settingsManager.setNodeExpandedState(nodeId, expanded);
    } catch (error) {
      console.error('Failed to save node expanded state:', error);
    }
  }

  // Drag and drop implementation
  public async handleDrag(source: readonly TreeItem[], treeDataTransfer: vscode.DataTransfer): Promise<void> {
    void source;
    void treeDataTransfer;
    // This tree doesn't provide drag sources - examples are dragged FROM the example tree
  }

  public async handleDrop(target: TreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
    // Check if we have example data being dropped
    const exampleData = dataTransfer.get('application/vnd.code.tree.computorexample');
    
    if (!exampleData || !target) {
      return;
    }

    // Only allow dropping on course content items
    if (!(target instanceof CourseContentTreeItem)) {
      vscode.window.showErrorMessage('Examples can only be dropped on course content items');
      return;
    }


    // First check: only allow drops on submittable content (assignments, exercises, etc.)
    if (!target.isSubmittable) {
      vscode.window.showErrorMessage(
        `Examples can only be assigned to submittable content like assignments or exercises. "${target.courseContent.title}" is not submittable.`
      );
      return;
    }

    // Second check: if the content already has an example assigned, ask for confirmation
    if (target.courseContent.example_id) {
      const choice = await vscode.window.showWarningMessage(
        `Assignment "${target.courseContent.title}" already has an example assigned. Replace it?`,
        'Replace', 'Cancel'
      );
      if (choice !== 'Replace') {
        return;
      }
    }

    try {
      const rawValue = exampleData.value;
      
      // Parse the JSON string if it's a string, otherwise use as-is
      const draggedExamples = typeof rawValue === 'string' 
        ? JSON.parse(rawValue)
        : rawValue;
      
      if (!Array.isArray(draggedExamples) || draggedExamples.length === 0) {
        return;
      }

      // For simplicity, take the first dragged example
      const example = draggedExamples[0];
      
      if (!example.exampleId) {
        vscode.window.showErrorMessage('Invalid example data');
        return;
      }

      // Assign the example to the course content
      await this.apiService.assignExampleToCourseContent(
        target.course.id,
        target.courseContent.id,
        example.exampleId,
        'latest' // Default to latest version
      );

      // Clear cache and force refresh to show the updated assignment
      this.courseContentsCache.delete(target.course.id);
      await this.forceRefreshCourse(target.course.id);

      vscode.window.showInformationMessage(
        `✅ Example "${example.title}" assigned to "${target.courseContent.title}" successfully!`
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      vscode.window.showErrorMessage(`Failed to assign example: ${errorMessage}`);
    }
  }
}