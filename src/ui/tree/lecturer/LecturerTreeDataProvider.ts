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
  private expandedStates: Record<string, boolean> = {};
  
  // Pagination state for different node types
  private paginationState: Map<string, PaginationInfo> = new Map();
  
  // Virtual scrolling services for large datasets
  private virtualScrollServices: Map<string, VirtualScrollingService<any>> = new Map();

  constructor(context: vscode.ExtensionContext, apiService?: ComputorApiService) {
    // Use provided apiService or create a new one
    this.apiService = apiService || new ComputorApiService(context);
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.settingsManager = new ComputorSettingsManager(context);
    
    // Load expanded states on startup
    console.log('Loading expanded states on startup...');
    this.loadExpandedStates().then(() => {
      console.log('Expanded states loaded:', Object.keys(this.expandedStates));
    });
  }

  refresh(): void {
    console.log('Full tree refresh requested');
    console.log('Current expanded states before refresh:', Object.keys(this.expandedStates));
    
    // Clear ALL backend API caches - organizations, courses, course families, etc.
    this.clearAllCaches();
    this.paginationState.clear();
    
    // Clear all virtual scrolling services
    for (const service of this.virtualScrollServices.values()) {
      service.reset();
    }
    this.virtualScrollServices.clear();
    
    // NOTE: We do NOT clear expandedStates here - we want to preserve them across refreshes
    
    // Fire with undefined to refresh entire tree
    this._onDidChangeTreeData.fire(undefined);
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
    
    // Clear API cache FIRST, then tree cache
    this.apiService.clearCourseCache(courseId);
    this.clearCourseCache(courseId);
    
    // Fire tree data change event with undefined to refresh entire tree
    this._onDidChangeTreeData.fire(undefined);
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
    // Use backend API cache clearing
    this.apiService.clearCourseCache(courseId);
  }

  /**
   * Clear ALL caches to force a complete refresh
   */
  private clearAllCaches(): void {
    // Clear all cache entries in the API service
    this.apiService.clearAllCaches();
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
        // Courses cache cleared in API
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
          // Content types cache cleared in API
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
        // Courses cache cleared in API
        break;
        
      case 'organization':
        // Clear all caches when organization changes
        // Contents cache cleared in API
        // Content types cache cleared in API
        // Content types by ID cache cleared in API
        // Courses cache cleared in API
        break;
        
      case 'example':
        // Clear examples cache
        if (itemId) {
          // Example cache cleared in API
        } else {
          // Examples cache cleared in API
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
          // Content type cache cleared in API
        }
        if (relatedIds?.courseId) {
          // Content types cache cleared in API
        }
        break;
        
      case 'courseGroup':
        // Clear course group and member caches
        if (relatedIds?.courseId) {
          // Groups cache cleared in API
          
          // Members cache cleared in API
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
          // Courses cache cleared in API
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
    // The expanded state is now handled when creating the tree items
    // This method just returns the element as-is
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
        return organizations.map(org => {
          const nodeId = `org-${org.id}`;
          const expandedState = this.expandedStates[nodeId] ? 
            vscode.TreeItemCollapsibleState.Expanded : 
            vscode.TreeItemCollapsibleState.Collapsed;
          return new OrganizationTreeItem(org, expandedState);
        });
      }

      if (element instanceof OrganizationTreeItem) {
        // Show course families for organization
        const families = await this.apiService.getCourseFamilies(element.organization.id);
        return families.map(family => {
          const nodeId = `family-${family.id}`;
          const expandedState = this.expandedStates[nodeId] ? 
            vscode.TreeItemCollapsibleState.Expanded : 
            vscode.TreeItemCollapsibleState.Collapsed;
          return new CourseFamilyTreeItem(family, element.organization, expandedState);
        });
      }

      if (element instanceof CourseFamilyTreeItem) {
        // Show courses for course family
        const courses = await this.apiService.getCourses(element.courseFamily.id);
        
        // Check for unique GitLab URLs and ensure we have tokens
        await this.ensureGitLabTokensForCourses(courses);
        
        // Cache courses for later use
        // Courses fetched directly from API
        
        return courses.map(course => {
          const nodeId = `course-${course.id}`;
          const expandedState = this.expandedStates[nodeId] ? 
            vscode.TreeItemCollapsibleState.Expanded : 
            vscode.TreeItemCollapsibleState.Collapsed;
          return new CourseTreeItem(course, element.courseFamily, element.organization, expandedState);
        });
      }

      if (element instanceof CourseTreeItem) {
        // Show three folders: Groups, Content Types, and Contents
        const folderTypes: ('groups' | 'contentTypes' | 'contents')[] = ['groups', 'contentTypes', 'contents'];
        return folderTypes.map(folderType => {
          const nodeId = `${folderType}-${element.course.id}`;
          const expandedState = this.expandedStates[nodeId] ? 
            vscode.TreeItemCollapsibleState.Expanded : 
            vscode.TreeItemCollapsibleState.Collapsed;
          return new CourseFolderTreeItem(folderType, element.course, element.courseFamily, element.organization, expandedState);
        });
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
                    
                    // Get content type for this content
                    const contentTypes = await this.getCourseContentTypes(element.course.id);
                    const contentType = contentTypes.find(t => t.id === content.course_content_type_id);
                    const isSubmittable = this.isContentSubmittable(contentType);
                    
                    const nodeId = `content-${content.id}`;
                    const expandedState = hasChildren ? 
                      (this.expandedStates[nodeId] ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
                      vscode.TreeItemCollapsibleState.None;
                    
                    return new CourseContentTreeItem(
                      content,
                      element.course,
                      element.courseFamily,
                      element.organization,
                      hasChildren,
                      exampleInfo,
                      contentType,
                      isSubmittable,
                      expandedState
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
              const contentTypes = await this.getCourseContentTypes(element.course.id);
              const contentType = contentTypes.find(t => t.id === content.course_content_type_id);
              const isSubmittable = this.isContentSubmittable(contentType);
              
              const nodeId = `content-${content.id}`;
              const expandedState = hasChildren ? 
                (this.expandedStates[nodeId] ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
                vscode.TreeItemCollapsibleState.None;
              
              return new CourseContentTreeItem(
                content,
                element.course,
                element.courseFamily,
                element.organization,
                hasChildren,
                exampleInfo,
                contentType,
                isSubmittable,
                expandedState
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
            const nodeId = `group-${group.id}`;
            const expandedState = this.expandedStates[nodeId] ? 
              vscode.TreeItemCollapsibleState.Expanded : 
              vscode.TreeItemCollapsibleState.Collapsed;
            result.push(new CourseGroupTreeItem(
              group,
              element.course,
              element.courseFamily,
              element.organization,
              groupMembers.length,
              expandedState
            ));
          }
          
          // Add "No Group" node for ungrouped members
          const ungroupedMembers = allMembers.filter((m: CourseMemberList) => !m.course_group_id);
          if (ungroupedMembers.length > 0 || groups.length === 0) {
            const nodeId = `no-group-${element.course.id}`;
            const expandedState = ungroupedMembers.length > 0 ? 
              (this.expandedStates[nodeId] ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
              vscode.TreeItemCollapsibleState.None;
            result.push(new NoGroupTreeItem(
              element.course,
              element.courseFamily,
              element.organization,
              ungroupedMembers.length,
              expandedState
            ));
          }
          
          return result;
        } else {
          // Show course content types with content kind titles
          const contentTypes = await this.getCourseContentTypes(element.course.id);
          
          // Fetch content kind information for each type
          const contentTypesWithKinds = await Promise.all(contentTypes.map(async (type) => {
            try {
              const fullType = await this.apiService.getCourseContentType(type.id);
              const kindTitle = fullType?.course_content_kind?.title || undefined;
              return new CourseContentTypeTreeItem(
                type,
                element.course,
                element.courseFamily,
                element.organization,
                kindTitle
              );
            } catch (error) {
              // If fetching full type fails, create without kind title
              console.warn(`Failed to fetch content type details for ${type.id}:`, error);
              return new CourseContentTypeTreeItem(
                type,
                element.course,
                element.courseFamily,
                element.organization
              );
            }
          }));
          
          return contentTypesWithKinds;
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
          const contentTypes = await this.getCourseContentTypes(element.course.id);
          const contentType = contentTypes.find(t => t.id === content.course_content_type_id);
          const isSubmittable = this.isContentSubmittable(contentType);
          
          const nodeId = `content-${content.id}`;
          const expandedState = hasChildren ? 
            (this.expandedStates[nodeId] ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
            vscode.TreeItemCollapsibleState.None;
          
          return new CourseContentTreeItem(
            content,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren,
            exampleInfo,
            contentType,
            isSubmittable,
            expandedState
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
    // Always fetch fresh data from API
    const contents = await this.apiService.getCourseContents(courseId, true);
    return contents || [];
  }

  private async getCourseContentTypes(courseId: string): Promise<CourseContentTypeList[]> {
    // Always fetch fresh data from API
    const types = await this.apiService.getCourseContentTypes(courseId);
    await this.loadContentKinds();
    return types || [];
  }
  
  private async loadContentKinds(): Promise<void> {
    // Content kinds fetched from API on demand
    await this.apiService.getCourseContentKinds();
    // Process kinds if needed
  }

  private async getCourseGroups(courseId: string): Promise<CourseGroupList[]> {
    // Always fetch fresh data from API
    const groups = await this.apiService.getCourseGroups(courseId);
    return groups || [];
  }

  private async getCourseMembers(courseId: string, groupId?: string): Promise<CourseMemberList[]> {
    // Always fetch fresh data from API
    const members = await this.apiService.getCourseMembers(courseId, groupId);
    return members || [];
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
          const contentTypes = await this.getCourseContentTypes(element.course.id);
          const contentType = contentTypes.find(t => t.id === parentContent.course_content_type_id);
          const isSubmittable = this.isContentSubmittable(contentType);
          
          const nodeId = `content-${parentContent.id}`;
          const expandedState = hasChildren ? 
            (this.expandedStates[nodeId] ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed) :
            vscode.TreeItemCollapsibleState.None;
          
          return new CourseContentTreeItem(
            parentContent,
            element.course,
            element.courseFamily,
            element.organization,
            hasChildren,
            exampleInfo,
            contentType,
            isSubmittable,
            expandedState
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
      // Cache cleared via API
      
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
      
      // Clear API cache for this course
      this.apiService.clearCourseCache(contentItem.course.id);
      
      // Refresh the specific item
      this._onDidChangeTreeData.fire(contentItem);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to update course content: ${error}`);
    }
  }

  async deleteCourseContent(contentItem: CourseContentTreeItem): Promise<void> {
    try {
      // Validate input
      if (!contentItem || !contentItem.courseContent || !contentItem.courseContent.id || !contentItem.course || !contentItem.course.id) {
        console.error('Invalid content item passed to deleteCourseContent:', {
          hasContentItem: !!contentItem,
          hasCourseContent: !!contentItem?.courseContent,
          hasCourseContentId: !!contentItem?.courseContent?.id,
          hasCourse: !!contentItem?.course,
          hasCourseId: !!contentItem?.course?.id
        });
        throw new Error('Invalid content item - missing required data');
      }
      
      const title = contentItem.courseContent.title || contentItem.courseContent.path || 'Unknown';
      console.log(`Deleting course content: ${title} (${contentItem.courseContent.id})`);
      
      await this.apiService.deleteCourseContent(
        contentItem.course.id,
        contentItem.courseContent.id
      );
      
      console.log('Delete API call successful, clearing cache and refreshing tree...');
      
      // Clear API cache for this course - this ensures fresh data will be fetched
      this.apiService.clearCourseCache(contentItem.course.id);
      
      this.refresh();
      
      vscode.window.showInformationMessage(`Deleted "${title}" successfully`);
    } catch (error) {
      console.error('Failed to delete course content:', error);
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
    
    // Check if the content type slug indicates it's submittable
    // Common submittable types: assignment, exercise, homework, task, lab, quiz
    const submittableTypes = ['assignment', 'exercise', 'homework', 'task', 'lab', 'quiz', 'exam'];
    const slug = contentType.slug?.toLowerCase() || '';
    
    return submittableTypes.some(type => slug.includes(type));
  }

  /**
   * Ensure we have GitLab tokens for all unique GitLab instances in courses
   */
  private async getExampleInfo(exampleId: string): Promise<ExampleGet | null> {
    // Check cache first
    // Examples fetched from API on demand
    
    try {
      const example = await this.apiService.getExample(exampleId);
      if (example) {
        // Example stored in API cache
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
    console.log(`Setting node ${nodeId} expanded state to: ${expanded}`);
    
    if (expanded) {
      this.expandedStates[nodeId] = true;
    } else {
      delete this.expandedStates[nodeId];
    }
    
    try {
      await this.settingsManager.setNodeExpandedState(nodeId, expanded);
      console.log(`Saved expanded state for ${nodeId}: ${expanded}`);
      console.log('Current expanded states:', Object.keys(this.expandedStates));
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
      // Cache cleared via API
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