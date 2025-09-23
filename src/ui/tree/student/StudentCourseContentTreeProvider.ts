import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { CourseSelectionService } from '../../../services/CourseSelectionService';
import { StudentRepositoryManager } from '../../../services/StudentRepositoryManager';
import { ComputorSettingsManager } from '../../../settings/ComputorSettingsManager';
import { SubmissionGroupStudentList, CourseContentStudentList, CourseContentTypeList, CourseContentKindList } from '../../../types/generated';
import { IconGenerator } from '../../../utils/IconGenerator';
import { hasExampleAssigned, getExampleVersionId } from '../../../utils/deploymentHelpers';

interface ContentNode {
    name?: string;
    children: Map<string, ContentNode>;
    courseContent?: CourseContentStudentList;
    submissionGroup?: SubmissionGroupStudentList;
    contentType?: CourseContentTypeList;
    contentKind?: CourseContentKindList;
    isUnit: boolean;
    unreadMessageCount?: number;
}

// Interface for repository cloning items  
interface CloneRepositoryItem {
    submissionGroup: SubmissionGroupStudentList;
}


export class StudentCourseContentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private apiService: ComputorApiService;
    private courseSelection: CourseSelectionService;
    private repositoryManager?: StudentRepositoryManager;
    private settingsManager?: ComputorSettingsManager;
    private courseContentsCache: Map<string, CourseContentStudentList[]> = new Map(); // Cache course contents per course
    private contentKinds: CourseContentKindList[] = [];
    private expandedStates: Record<string, boolean> = {};
    private itemIndex: Map<string, TreeItem> = new Map();
    private forceRefresh: boolean = false;
    // private courseCache: { id: string; title: string } | null = null;
    
    constructor(
        apiService: ComputorApiService, 
        courseSelection: CourseSelectionService, 
        repositoryManager?: StudentRepositoryManager,
        context?: vscode.ExtensionContext
    ) {
        this.apiService = apiService;
        this.courseSelection = courseSelection;
        this.repositoryManager = repositoryManager;
        if (context) {
            this.settingsManager = new ComputorSettingsManager(context);
            this.loadExpandedStates();
        }
    }
    
    private async loadExpandedStates(): Promise<void> {
        if (!this.settingsManager) return;
        try {
            this.expandedStates = await this.settingsManager.getStudentTreeExpandedStates();
            console.log('Loaded student tree expanded states:', Object.keys(this.expandedStates));
        } catch (error) {
            console.error('Failed to load student tree expanded states:', error);
            this.expandedStates = {};
        }
    }
    
    refresh(): void {
        this.forceRefresh = true;
        this.courseContentsCache.clear();
        this.contentKinds = [];
        this.itemIndex.clear();
        // Don't clear expanded states on refresh - preserve them
        this._onDidChangeTreeData.fire(undefined);
    }
    
    refreshNode(element?: TreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }
    
    /**
     * Refresh only the specific course content item without affecting the entire tree
     */
    async refreshContentItem(contentId: string): Promise<void> {
        try {
            const selectedCourseId = this.courseSelection.getCurrentCourseId();
            let updated = await this.apiService.getStudentCourseContent(contentId, { force: true });

            if (selectedCourseId) {
                // Always refresh the cached course contents so we preserve
                // enriched fields (type metadata, colors, etc.) that the
                // single-content endpoint omits.
                const refreshedList = await this.apiService.getStudentCourseContents(selectedCourseId, { force: true }) || [];
                this.courseContentsCache.set(selectedCourseId, refreshedList);
                if (this.repositoryManager) {
                    this.repositoryManager.updateExistingRepositoryPaths(selectedCourseId, refreshedList);
                }

                // Prefer the freshly cached entry so we retain content type data.
                const refreshed = refreshedList.find(c => c.id === contentId);
                if (refreshed) {
                    updated = refreshed;
                }
            }

            if (!updated) { this._onDidChangeTreeData.fire(undefined); return; }

            const ti = this.itemIndex.get(contentId);
            if (ti && ti instanceof CourseContentItem) {
                ti.applyUpdate(updated);
                this._onDidChangeTreeData.fire(ti);
                // Also refresh parent unit if possible
                const parentPath = (updated.path || '').split('.').slice(0, -1).join('.');
                if (parentPath && selectedCourseId) {
                    const list = this.courseContentsCache.get(selectedCourseId) || [];
                    const parent = list.find(c => c.path === parentPath);
                    if (parent && parent.id) {
                        const parentItem = this.itemIndex.get(parent.id);
                        if (parentItem && parentItem instanceof CourseContentPathItem) {
                            // Rebuild fresh node and update parent item
                            const tree = this.buildContentTree(list, [], [], this.contentKinds);
                            const freshNode = this.findNodeByPath(tree, parentPath);
                            if (freshNode) {
                                parentItem.updateFromNode(freshNode);
                                this._onDidChangeTreeData.fire(parentItem);
                            }
                        }
                    }
                }
                // Also update course root counts
                const courseId = selectedCourseId;
                if (courseId) {
                    const rootItem = this.itemIndex.get(`course-${courseId}`);
                    if (rootItem && rootItem instanceof CourseRootItem) {
                        const list = this.courseContentsCache.get(courseId) || [];
                        rootItem.updateCounts(list.length);
                        this._onDidChangeTreeData.fire(rootItem);
                    }
                }
                return;
            }
            this._onDidChangeTreeData.fire(undefined);
        } catch (e) {
            console.error('refreshContentItem failed:', e);
            this._onDidChangeTreeData.fire(undefined);
        }
    }
    
    /**
     * Handle node expansion/collapse state changes
     */
    async onTreeItemExpanded(element: TreeItem): Promise<void> {
        if (element.id) {
            await this.setNodeExpanded(element.id, true);
        }
    }
    
    async onTreeItemCollapsed(element: TreeItem): Promise<void> {
        if (element.id) {
            await this.setNodeExpanded(element.id, false);
        }
    }
    
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        // Handle filesystem children for assignment items
        if (element instanceof CourseContentItem) {
            const contentType = element.contentType;
            const isAssignment = contentType?.course_content_kind_id === 'assignment';
            let directory = (element.courseContent as any).directory as string | undefined;
            const hasRepository = !!element.submissionGroup?.repository;
            
            if (isAssignment && hasRepository) {
                let assignmentPath: string | undefined;
                
                // First, check if we need to setup the repository
                // Resolve directory to absolute path if necessary
                const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                // Derive local repo root from repository fields when directory is relative
                const repoNameFromRepository = (repo: any): string | undefined => {
                    if (!repo) return undefined;
                    // Prefer full_path last segment
                    if (typeof repo.full_path === 'string' && repo.full_path.length > 0) {
                        const parts = repo.full_path.split('/');
                        return parts[parts.length - 1] || undefined;
                    }
                    // Then from clone_url
                    if (typeof repo.clone_url === 'string' && repo.clone_url.length > 0) {
                        const clean = repo.clone_url.replace(/\.git$/, '');
                        const parts = clean.split('/');
                        return parts[parts.length - 1] || undefined;
                    }
                    // Then from web_url
                    if (typeof repo.web_url === 'string' && repo.web_url.length > 0) {
                        const parts = repo.web_url.split('/');
                        return parts[parts.length - 1] || undefined;
                    }
                    return undefined;
                };
                const repoName = repoNameFromRepository(element.submissionGroup?.repository);
                const repoRoot = wsRoot && repoName ? path.join(wsRoot, repoName) : wsRoot;
                const resolvePath = (p?: string) => {
                    if (!p) return undefined;
                    if (path.isAbsolute(p)) return p;
                    // If relative, resolve only when we can determine the repo root
                    return repoRoot ? path.join(repoRoot, p) : undefined;
                };
                const absDir = resolvePath(directory);
                if (!absDir || !fs.existsSync(absDir)) {
                    // Repository not set up yet - find the course ID and set it up
                    const courseId = await this.findCourseIdForContent(element.courseContent);
                    if (courseId && this.repositoryManager) {
                        console.log('[StudentTree] Setting up repository for assignment:', element.courseContent.title);
                        
                        // Show progress while setting up
                        await vscode.window.withProgress({
                            location: vscode.ProgressLocation.Notification,
                            title: `Setting up repository for ${element.courseContent.title}...`,
                            cancellable: false
                        }, async () => {
                            await this.repositoryManager!.autoSetupRepositories(courseId);
                            
                            // Re-fetch course contents to get updated directory paths
                            const courseContents = await this.apiService.getStudentCourseContents(courseId, { force: true }) || [];
                            this.courseContentsCache.set(courseId, courseContents);
                            
                            // Update directory paths for existing repositories
                            this.repositoryManager!.updateExistingRepositoryPaths(courseId, courseContents);
                            
                            // Update the directory on the current element directly
                            const updatedContent = courseContents.find(c => c.id === element.courseContent.id);
                            if (updatedContent && updatedContent.directory) {
                                (element.courseContent as any).directory = updatedContent.directory;
                                directory = updatedContent.directory as any;
                            }
                        });
                        
                        // Now that directory is updated, continue to show files
                        // Re-check the directory after setup
                        const updatedDirectory = resolvePath((element.courseContent as any).directory);

                        if (updatedDirectory) {
                            assignmentPath = updatedDirectory;
                            console.log('[StudentTree] Repository setup complete, directory path:', assignmentPath);
                            
                            // If the directory still doesn't exist, it's not available yet
                            if (assignmentPath && !fs.existsSync(assignmentPath)) {
                                console.log('[StudentTree] Assignment subdirectory does not exist:', assignmentPath);
                                // Don't fall back to repository root - the assignment isn't available
                                assignmentPath = undefined;
                            }
                        }
                        
                        if (!assignmentPath || !fs.existsSync(assignmentPath)) {
                            console.log('[StudentTree] Directory not available after setup:', assignmentPath);
                            return [new MessageItem('Assignment not deployed yet - sync repository to get updates', 'info')];
                        }
                    } else {
                        return [new MessageItem('Unable to setup repository', 'error')];
                    }
                } else {
                    // Directory exists, use it
                    assignmentPath = absDir;
                    console.log('[StudentTree] Using existing directory:', assignmentPath);
                }
                
                if (assignmentPath && fs.existsSync(assignmentPath)) {
                    // Repository is cloned - show actual files
                    try {
                        const readdir = promisify(fs.readdir);
                        const stat = promisify(fs.stat);
                        const files = await readdir(assignmentPath);
                        const items: TreeItem[] = [];
                        
                        // First, populate items from existing files
                        for (const file of files) {
                            // Filter out README files and mediaFiles directory
                            if (file === 'mediaFiles' || 
                                file === 'README.md' || 
                                file.startsWith('README_') && file.endsWith('.md')) {
                                continue;
                            }
                            
                            const filePath = path.join(assignmentPath, file);
                            const stats = await stat(filePath);
                            const isDirectory = stats.isDirectory();
                            
                            const fileItem = new FileSystemItem(
                                file,
                                vscode.Uri.file(filePath),
                                isDirectory ? vscode.FileType.Directory : vscode.FileType.File
                            );
                            items.push(fileItem);
                        }
                        
                        // If directory is empty or only contains filtered files, trigger fork update
                        if (items.length === 0) {
                            console.log('[StudentTree] Assignment directory appears empty, triggering fork update...');
                            
                            // Get course ID and trigger repository update
                            const courseId = await this.findCourseIdForContent(element.courseContent);
                            if (courseId && this.repositoryManager) {
                                try {
                                    await vscode.window.withProgress({
                                        location: vscode.ProgressLocation.Notification,
                                        title: `Updating ${element.courseContent.title} from template...`,
                                        cancellable: false
                                    }, async () => {
                                        // Call the repository manager's auto-setup which includes fork sync
                                        await this.repositoryManager!.autoSetupRepositories(courseId);
                                    });
                                    
                                    // Re-read the directory after update
                                    const updatedFiles = await readdir(assignmentPath);
                                    for (const file of updatedFiles) {
                                        // Filter out README files and mediaFiles directory
                                        if (file === 'mediaFiles' || 
                                            file === 'README.md' || 
                                            file.startsWith('README_') && file.endsWith('.md')) {
                                            continue;
                                        }
                                        
                                        const filePath = path.join(assignmentPath, file);
                                        const stats = await stat(filePath);
                                        const isDirectory = stats.isDirectory();
                                        
                                        const fileItem = new FileSystemItem(
                                            file,
                                            vscode.Uri.file(filePath),
                                            isDirectory ? vscode.FileType.Directory : vscode.FileType.File
                                        );
                                        items.push(fileItem);
                                    }
                                    
                                    // If still empty after update
                                    if (items.length === 0) {
                                        return [new MessageItem('Empty assignment - no files available', 'info')];
                                    }
                                } catch (error) {
                                    console.error('[StudentTree] Failed to update from template:', error);
                                    return [new MessageItem('Empty directory - update failed', 'warning')];
                                }
                            } else {
                                return [new MessageItem('Empty directory', 'info')];
                            }
                        }
                        
                        // Sort: directories first, then files, alphabetically
                        items.sort((a, b) => {
                            const aIsDir = (a as FileSystemItem).type === vscode.FileType.Directory;
                            const bIsDir = (b as FileSystemItem).type === vscode.FileType.Directory;
                            if (aIsDir && !bIsDir) return -1;
                            if (!aIsDir && bIsDir) return 1;
                            return a.label!.toString().localeCompare(b.label!.toString());
                        });
                        
                        return items;
                    } catch (error) {
                        console.error('Error reading assignment directory:', error);
                        return [new MessageItem('Error reading repository files', 'error')];
                    }
                } else {
                    // Repository not cloned yet or directory not set
                    console.log('[StudentTree] Directory not available:', {
                        directory,
                        assignmentPath,
                        exists: assignmentPath ? fs.existsSync(assignmentPath) : false
                    });
                    return [new MessageItem('Click course to clone repository', 'info')];
                }
            }
            return [];
        }
        
        // Handle filesystem children for FileSystemItem
        if (element instanceof FileSystemItem && element.type === vscode.FileType.Directory) {
            try {
                const readdir = promisify(fs.readdir);
                const stat = promisify(fs.stat);
                const files = await readdir(element.uri.fsPath);
                const items: TreeItem[] = [];
                
                for (const file of files) {
                    const filePath = path.join(element.uri.fsPath, file);
                    const stats = await stat(filePath);
                    const isDirectory = stats.isDirectory();
                    
                    const fileItem = new FileSystemItem(
                        file,
                        vscode.Uri.file(filePath),
                        isDirectory ? vscode.FileType.Directory : vscode.FileType.File
                    );
                    items.push(fileItem);
                }
                
                // Sort: directories first, then files, alphabetically
                items.sort((a, b) => {
                    const aIsDir = (a as FileSystemItem).type === vscode.FileType.Directory;
                    const bIsDir = (b as FileSystemItem).type === vscode.FileType.Directory;
                    if (aIsDir && !bIsDir) return -1;
                    if (!aIsDir && bIsDir) return 1;
                    return a.label!.toString().localeCompare(b.label!.toString());
                });
                
                return items;
            } catch (error) {
                console.error('Error reading directory:', error);
                return [];
            }
        }
        
        if (!element) {
            // Root level - show a single node representing the current course
            const selectedCourseId = this.courseSelection.getCurrentCourseId();
            if (!selectedCourseId) {
                console.log('[StudentTree] No course selected - tree will be empty');
                return [new MessageItem('No course selected. Please restart the extension.', 'warning')];
            }

            try {
                // Fetch course info for title
                const course = await this.apiService.getStudentCourse(selectedCourseId);
                const title = (course?.title || course?.name || `Course ${selectedCourseId}`) as string;

                // Ensure content kinds cached
                if (this.contentKinds.length === 0) {
                    this.contentKinds = await this.apiService.getCourseContentKinds() || [];
                }

                // Ensure contents cached (for counts)
                const shouldForce = this.forceRefresh;
                let courseContents = this.courseContentsCache.get(selectedCourseId);
                if (!courseContents || shouldForce) {
                    courseContents = await this.apiService.getStudentCourseContents(selectedCourseId, { force: shouldForce }) || [];
                    this.courseContentsCache.set(selectedCourseId, courseContents);
                    if (this.repositoryManager) this.repositoryManager.updateExistingRepositoryPaths(selectedCourseId, courseContents);
                }
                if (shouldForce) {
                    this.forceRefresh = false;
                }

                const itemCount = courseContents.length;
                const courseItem = new CourseRootItem(title, selectedCourseId, itemCount, true);
                const rootId = `course-${selectedCourseId}`;
                courseItem.id = rootId;
                this.itemIndex.set(rootId, courseItem);
                return [courseItem];
            } catch (error: any) {
                console.error('Failed to load course root:', error);
                const message = error?.response?.data?.message || error?.message || 'Unknown error';
                return [new MessageItem(`Error loading course: ${message}`, 'error')];
            }
        }
        
        // Handle course root node
        if (element instanceof CourseRootItem) {
            const selectedCourseId = element.courseId;
            try {
                // Ensure kinds and contents
                if (this.contentKinds.length === 0) this.contentKinds = await this.apiService.getCourseContentKinds() || [];
                const shouldForce = this.forceRefresh;
                let courseContents = this.courseContentsCache.get(selectedCourseId);
                if (!courseContents || shouldForce) {
                    courseContents = await this.apiService.getStudentCourseContents(selectedCourseId, { force: shouldForce }) || [];
                    this.courseContentsCache.set(selectedCourseId, courseContents);
                }
                if (shouldForce) {
                    this.forceRefresh = false;
                }
                if (this.repositoryManager) this.repositoryManager.updateExistingRepositoryPaths(selectedCourseId, courseContents);

                // Build and present under course root
                const tree = this.buildContentTree(courseContents, [], [], this.contentKinds);
                // Optionally update root item description
                element.updateCounts(courseContents.length);
                return this.createTreeItems(tree);
            } catch (e) {
                console.error('Failed to load children for course root:', e);
                return [];
            }
        }

        // Handle content items (units/folders)
        if (element instanceof CourseContentPathItem) {
            try {
                const selectedCourseId = this.courseSelection.getCurrentCourseId();
                if (!selectedCourseId) return this.createTreeItems(element.node);
                let courseContents = this.courseContentsCache.get(selectedCourseId);
                const shouldForce = this.forceRefresh;
                if (!courseContents || shouldForce) {
                    courseContents = await this.apiService.getStudentCourseContents(selectedCourseId, { force: shouldForce }) || [];
                    this.courseContentsCache.set(selectedCourseId, courseContents);
                }
                if (shouldForce) {
                    this.forceRefresh = false;
                }
                const tree = this.buildContentTree(courseContents, [], [], this.contentKinds);
                const targetPath = element.node.courseContent?.path;
                if (!targetPath) return this.createTreeItems(element.node);
                const refreshedNode = this.findNodeByPath(tree, targetPath);
                if (refreshedNode) {
                    element.updateFromNode(refreshedNode);
                    return this.createTreeItems(refreshedNode);
                }
                return this.createTreeItems(element.node);
            } catch (e) {
                console.error('Failed to refresh unit children:', e);
                return this.createTreeItems(element.node);
            }
        }
        
        return [];
    }

    // Find a node in the built tree by its content path
    private findNodeByPath(root: ContentNode, pathStr: string): ContentNode | undefined {
        if (!pathStr) return undefined;
        // Depth-first traversal to match the courseContent.path
        const stack: ContentNode[] = [root];
        while (stack.length > 0) {
            const node = stack.pop()!;
            if (node.courseContent?.path === pathStr) return node;
            for (const child of node.children.values()) stack.push(child);
        }
        return undefined;
    }
    
    /**
     * Find the course ID for a given content item
     */
    private async findCourseIdForContent(content: CourseContentStudentList): Promise<string | undefined> {
        // Check if content has course_id directly
        if ((content as any).course_id) {
            return (content as any).course_id;
        }
        
        // Search through cached course contents
        for (const [courseId, contents] of this.courseContentsCache.entries()) {
            if (contents.some(c => c.id === content.id)) {
                return courseId;
            }
        }
        
        // If not found in cache, we might need to refresh courses
        // This shouldn't happen in normal flow but handle it gracefully
        return undefined;
    }
    
    private buildContentTree(
        courseContents: CourseContentStudentList[], // Student endpoint returns enriched content
        submissionGroups: SubmissionGroupStudentList[], // Unused but kept for API compatibility
        contentTypes: CourseContentTypeList[], // Unused but kept for API compatibility  
        contentKinds: CourseContentKindList[]
    ): ContentNode {
        void submissionGroups; // Suppress unused parameter warning
        void contentTypes; // Suppress unused parameter warning
        const root: ContentNode = { children: new Map(), isUnit: false };
        
        // Create a map of content kinds by ID for quick lookup
        const contentKindMap = new Map<string, CourseContentKindList>();
        for (const ck of contentKinds) {
            contentKindMap.set(ck.id, ck);
        }
        
        // Build tree from course content hierarchically
        // First, sort content by path to ensure parent items come before children
        const sortedContent = [...courseContents].sort((a, b) => {
            // Compare path depth first (shorter paths = higher in tree)
            const aDepth = (a.path.match(/\./g) || []).length;
            const bDepth = (b.path.match(/\./g) || []).length;
            if (aDepth !== bDepth) {
                return aDepth - bDepth;
            }
            // Then by position
            return a.position - b.position;
        });
        
        // Create a map to track all content items by their path for parent-child lookup
        const contentMap = new Map<string, ContentNode>();
        
        for (const content of sortedContent) {
            // Student endpoint has everything embedded
            const contentType = content.course_content_type;
            const contentKind = contentType ? contentKindMap.get(contentType.course_content_kind_id) : undefined;
            const submissionGroup = content.submission_group || undefined;
            
            // Determine if this content is a unit (has descendants)
            const isUnit = contentKind ? contentKind.has_descendants : false;
            const contentUnread = content.unread_message_count ?? 0;
            const submissionUnread = submissionGroup?.unread_message_count ?? 0;
            const totalUnread = contentUnread + submissionUnread;
            
            const node: ContentNode = {
                name: content.title || content.path.split('.').pop() || content.path,
                children: new Map(),
                courseContent: content,
                submissionGroup,
                contentType,
                contentKind,
                isUnit,
                unreadMessageCount: totalUnread
            };
            
            contentMap.set(content.path, node);
            
            // Find parent path and attach to parent or root
            const pathParts = content.path.split('.');
            if (pathParts.length === 1) {
                // Top-level item, add directly to root
                root.children.set(content.path, node);
            } else {
                // Find parent by removing the last part of the path
                const parentPath = pathParts.slice(0, -1).join('.');
                const parentNode = contentMap.get(parentPath);
                if (parentNode) {
                    parentNode.children.set(content.path, node);
                } else {
                    // Parent doesn't exist yet, add to root for now
                    // This shouldn't happen with proper sorting, but it's a fallback
                    root.children.set(content.path, node);
                }
            }
        }
        
        this.aggregateUnreadCounts(root);
        return root;
    }

    private aggregateUnreadCounts(node: ContentNode): number {
        const ownUnread = (node.courseContent?.unread_message_count ?? 0) + (node.submissionGroup?.unread_message_count ?? 0);
        let total = ownUnread;

        node.children.forEach((child) => {
            total += this.aggregateUnreadCounts(child);
        });

        node.unreadMessageCount = total;
        return total;
    }
    
    private createTreeItems(node: ContentNode): TreeItem[] {
        const items: TreeItem[] = [];
        
        // Sort children by position if available, then alphabetically
        const sortedChildren = Array.from(node.children.entries()).sort((a, b) => {
            const contentA = a[1].courseContent;
            const contentB = b[1].courseContent;
            
            // If both have course content, sort by position
            if (contentA && contentB) {
                return contentA.position - contentB.position;
            }
            
            // Otherwise sort alphabetically
            return a[0].localeCompare(b[0]);
        });
        
        sortedChildren.forEach(([name, child]) => {
            if (child.isUnit) {
                // Unit node - containers for other content items
                const nodeId = child.courseContent ? child.courseContent.id : `unit-${name}`;
                const unitItem = new CourseContentPathItem(
                    child.name || name,
                    child,
                    this.getExpandedState(nodeId)
                );
                if (unitItem.id) this.itemIndex.set(unitItem.id, unitItem);
                items.push(unitItem);
            } else if (child.courseContent) {
                // Leaf node - actual course content (assignment, reading, etc.)
                const contentItem = new CourseContentItem(
                    child.courseContent,
                    child.submissionGroup,
                    child.contentType,
                    this.courseSelection,
                    this.getExpandedState(child.courseContent.id)
                );
                if (contentItem.id) this.itemIndex.set(contentItem.id, contentItem);
                items.push(contentItem);
            }
        });
        
        return items;
    }
    
    private getExpandedState(nodeId: string): boolean {
        // Check if we have a saved state for this node
        if (nodeId in this.expandedStates) {
            return this.expandedStates[nodeId] || false;
        }
        // Default to collapsed for better performance
        return false;
    }
    
    async setNodeExpanded(nodeId: string, expanded: boolean): Promise<void> {
        console.log(`Setting student node ${nodeId} expanded state to: ${expanded}`);
        
        if (expanded) {
            this.expandedStates[nodeId] = true;
        } else {
            delete this.expandedStates[nodeId];
        }
        
        if (this.settingsManager) {
            try {
                await this.settingsManager.setStudentNodeExpandedState(nodeId, expanded);
                console.log(`Saved student expanded state for ${nodeId}: ${expanded}`);
                console.log('Current student expanded states:', Object.keys(this.expandedStates));
            } catch (error) {
                console.error('Failed to save student node expanded state:', error);
            }
        }
    }
}

abstract class TreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
    }
}

class CourseRootItem extends TreeItem {
    constructor(
        public readonly title: string,
        public readonly courseId: string,
        itemCount: number,
        expanded: boolean = true
    ) {
        super(title, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('book');
        this.contextValue = 'studentCourseRoot';
        this.updateCounts(itemCount);
        this.tooltip = `Course: ${title}`;
    }

    updateCounts(itemCount: number): void {
        // Intentionally no item count in the root title/description
        this.description = undefined;
    }
}

class MessageItem extends TreeItem {
    constructor(message: string, severity: 'info' | 'warning' | 'error') {
        super(message, vscode.TreeItemCollapsibleState.None);
        
        switch (severity) {
            case 'warning':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

class CourseContentPathItem extends TreeItem {
    constructor(
        public readonly name: string,
        public node: ContentNode,
        expanded: boolean = false
    ) {
        super(name, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
        
        // Use colored icon based on content type, defaulting to grey
        const color = node.contentType?.color || 'grey';
        
        try {
            // Units (folders) always use circle shape
            this.iconPath = IconGenerator.getColoredIcon(color, 'circle');
        } catch {
            // Fallback to default folder icon
            this.iconPath = new vscode.ThemeIcon('folder-opened');
        }
        
        this.contextValue = 'studentCourseUnit';
        this.id = node.courseContent ? node.courseContent.id : `unit-${name}`;
        
        this.applyCounts(node);
    }

    public updateFromNode(node: ContentNode): void {
        this.node = node;
        this.applyCounts(node);
    }

    private countItems(node: ContentNode): number {
        let count = 0;
        Array.from(node.children.values()).forEach(child => {
            if (child.courseContent && !child.isUnit) {
                count++;
            } else if (child.isUnit || child.children.size > 0) {
                count += this.countItems(child);
            }
        });
        return count;
    }

    private applyCounts(node: ContentNode): void {
        const count = this.countItems(node);
        const unread = node.unreadMessageCount ?? 0;
        const itemLabel = `${count} item${count !== 1 ? 's' : ''}`;
        this.description = unread > 0 ? `🔔 ${unread} • ${itemLabel}` : itemLabel;

        const tooltipLines = [
            `Unit: ${this.name}`,
            `${count} item${count !== 1 ? 's' : ''}`
        ];
        if (node.contentType?.title) {
            tooltipLines.push(`Type: ${node.contentType.title}`);
        }
        if (unread > 0) {
            tooltipLines.push(`${unread} unread message${unread === 1 ? '' : 's'}`);
        }
        this.tooltip = tooltipLines.join('\n');
    }
}

class CourseContentItem extends TreeItem implements Partial<CloneRepositoryItem> {
    constructor(
        public readonly courseContent: CourseContentStudentList,
        public readonly submissionGroup: SubmissionGroupStudentList | undefined,
        public readonly contentType: CourseContentTypeList | undefined,
        courseSelection: CourseSelectionService,
        expanded: boolean = false
    ) {
        void courseSelection; // Not used but required for type consistency
        const label = courseContent.title || courseContent.path;
        
        // Make assignments with repositories always expandable
        const isAssignment = contentType?.course_content_kind_id === 'assignment';
        const directory = (courseContent as any).directory;
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const resolvedDirectory = typeof directory === 'string'
            ? (path.isAbsolute(directory)
                ? directory
                : (workspaceFolders[0] ? path.join(workspaceFolders[0].uri.fsPath, directory) : undefined))
            : undefined;
        const hasClonedRepo = Boolean(resolvedDirectory && fs.existsSync(resolvedDirectory));
        void hasClonedRepo; // Suppress unused variable warning

        // Always make assignments expandable so we can attempt to surface their files,
        // even if repository metadata is missing or the directory is not yet available.
        const shouldBeExpandable = isAssignment;
        const collapsibleState = shouldBeExpandable 
            ? (expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed)
            : vscode.TreeItemCollapsibleState.None;
        super(label, collapsibleState);
        
        this.id = courseContent.id;
        this.setupIcon();
        this.setupDescription();
        this.setupTooltip();
        this.setupContextValue();
        
        // Don't add commands to assignments since they are now expandable to show filesystem
        // Commands will be shown as child items when expanded
    }

    // Update this item's data from a fresh course content object
    public applyUpdate(updatedContent: CourseContentStudentList): void {
        // Overwrite backing fields (readonly at type-level only)
        (this as any).courseContent = updatedContent;
        (this as any).submissionGroup = updatedContent.submission_group;
        if ((updatedContent as any)?.course_content_type) {
            (this as any).contentType = (updatedContent as any).course_content_type;
        }
        // Recompute visual aspects
        this.setupIcon();
        this.setupDescription();
        this.setupTooltip();
        this.setupContextValue();
    }
    
    private setupIcon(): void {
        // Use the color from contentType, or grey as default
        const derivedContentType = this.contentType || (this.courseContent as any)?.course_content_type;
        const color = derivedContentType?.color || (this.courseContent as any)?.color || 'grey';

        try {
            // Determine shape based on course_content_kind_id
            // 'assignment' gets square, 'unit' (or anything else) gets circle
            const shape = derivedContentType?.course_content_kind_id === 'assignment' ? 'square' : 'circle';

            // Determine success/failure badge for assignments with grading info
            let badge: 'success' | 'failure' | 'none' = 'none';
            let corner: 'corrected' | 'correction_necessary' | 'correction_possible' | 'none' = 'none';
            if (shape === 'square') {
                // const grade = this.submissionGroup?.grading as number | undefined;
                // if (typeof grade === 'number') {
                //     badge = (grade === 1) ? 'success' : 'failure';
                // }
                const result = this.courseContent?.result?.result as number | undefined;
                if (typeof result === 'number') {
                    badge = (result === 1) ? 'success' : 'failure';
                }
        const status = (this.submissionGroup?.status)?.toLowerCase();
                if (status === 'corrected') corner = 'corrected';
                else if (status === 'correction_necessary') corner = 'correction_necessary';
                else if (status === 'correction_possible' || status === 'improvement_possible') corner = 'correction_possible';
            }

            this.iconPath = (badge === 'none' && corner === 'none')
                ? IconGenerator.getColoredIcon(color, shape)
                : IconGenerator.getColoredIconWithBadge(color, shape, badge, corner);
        } catch {
            // Fallback to default theme icons if icon generation fails
            if (hasExampleAssigned(this.courseContent)) {
                this.iconPath = new vscode.ThemeIcon('file-code');
            } else {
                this.iconPath = new vscode.ThemeIcon('file');
            }
        }
    }
    
    private isAssignment(): boolean {
        const effectiveContentType = this.contentType || (this.courseContent as any)?.course_content_type;
        if (!effectiveContentType) return hasExampleAssigned(this.courseContent);

        // First check the explicit kind_id
        if (effectiveContentType.course_content_kind_id === 'assignment') {
            return true;
        }

        // Fall back to checking slug for assignment-related keywords
        const assignmentTypes = ['assignment', 'exercise', 'homework', 'task', 'lab', 'quiz', 'exam'];
        const slug = effectiveContentType.slug?.toLowerCase() || '';
        return assignmentTypes.some(type => slug.includes(type));
    }
    
    private setupDescription(): void {
        // New compact metrics in brackets: Tests, Submissions, Points
        const entries: string[] = [];

        const unreadCount = (this.courseContent?.unread_message_count ?? 0) + (this.submissionGroup?.unread_message_count ?? 0);
        if (unreadCount > 0) {
            entries.push(`🔔 ${unreadCount}`);
        }

        const testCount = (this.courseContent as any)?.result_count as number | undefined;
        const maxTests = (this.courseContent as any)?.max_test_runs as number | undefined;
        if (typeof testCount === 'number') {
            entries.push(typeof maxTests === 'number' ? `[${testCount}/${maxTests}]` : `[${testCount}]`);
        }

        const submitCount = this.submissionGroup?.count as number | undefined;
        const maxSubmits = this.submissionGroup?.max_submissions as number | undefined;
        if (typeof submitCount === 'number') {
            entries.push(typeof maxSubmits === 'number' ? `[${submitCount}/${maxSubmits}]` : `[${submitCount}]`);
        }

        this.description = entries.length > 0 ? entries.join('') : undefined;

        const testResult = (this.courseContent?.result?.result) as number | undefined;
        if (typeof testResult === 'number') {
            const pts = Math.round(testResult * 100);
            // entries.push(`${pts}%`);
            this.description += ` ${pts}%`;
        }

        const rawGrade = this.submissionGroup?.grading as number | undefined;
        if (typeof rawGrade === 'number') {
            const pts = Math.round(rawGrade * 100);
            // entries.push(`${pts}%`);
            this.description += ` ${pts}%`;
        }
    }
    
    private setupTooltip(): void {
        const lines: string[] = [];
        const unreadCount = (this.courseContent?.unread_message_count ?? 0) + (this.submissionGroup?.unread_message_count ?? 0);
        
        const tooltipContentType = this.contentType || (this.courseContent as any)?.course_content_type;
        if (tooltipContentType) {
            lines.push(`Type: ${tooltipContentType.title || tooltipContentType.slug}`);
        }
        
        if (hasExampleAssigned(this.courseContent)) {
            // Note: We can't easily get the example_id from the new structure
            // Show version ID if available
            const versionId = getExampleVersionId(this.courseContent);
            if (versionId) {
                lines.push(`Example Version ID: ${versionId}`);
            }
        }

        if (unreadCount > 0) {
            lines.push(`Unread messages: ${unreadCount}`);
        }

        if (this.submissionGroup?.repository) {
            lines.push(`Repository: ${this.submissionGroup.repository.full_path}`);
        }

        // Attempts and points
        const testCount = (this.courseContent as any)?.result_count as number | undefined;
        const maxTests = (this.courseContent as any)?.max_test_runs as number | undefined;
        if (typeof testCount === 'number') {
            lines.push(`Tests: ${typeof maxTests === 'number' ? `${testCount} of ${maxTests}` : `${testCount}`}`);
        }

        const submitCount = this.submissionGroup?.count as number | undefined;
        const maxSubmits = this.submissionGroup?.max_submissions as number | undefined;
        if (typeof submitCount === 'number') {
            lines.push(`Submissions: ${typeof maxSubmits === 'number' ? `${submitCount} of ${maxSubmits}` : `${submitCount}`}`);
        }

        // Show result percentage (0..1 -> percent) above grading
        const resultVal = this.courseContent?.result?.result as number | undefined;
        if (typeof resultVal === 'number') {
            lines.push(`Result: ${(resultVal * 100).toFixed(2)}%`);
        }

        // Show grading percentage (0..1 -> percent)
        const rawGrade = this.submissionGroup?.grading as number | undefined;
        if (typeof rawGrade === 'number') {
            lines.push(`Grading: ${(rawGrade * 100).toFixed(2)}%`);
        }

        // Additional grading details and team members
        if (this.submissionGroup?.grading !== undefined && this.submissionGroup?.status) {
            lines.push(`Status: ${this.submissionGroup.status}`);
        }
        if (this.submissionGroup?.members && this.submissionGroup.members.length > 1) {
            lines.push('Team members:');
            for (const member of this.submissionGroup.members) {
                lines.push(`  - ${member.full_name || member.username}`);
            }
        }
        
        this.tooltip = lines.join('\n');
    }
    
    private setupContextValue(): void {
        const contexts: string[] = ['studentCourseContent'];
        
        // Add content type context
        if (this.isAssignment()) {
            contexts.push('assignment');
        } else {
            contexts.push('reading');
        }
        
        // Add repository context
        if (this.submissionGroup?.repository) {
            contexts.push('withRepository');
            if (this.checkIfCloned()) {
                contexts.push('cloned');
            } else {
                contexts.push('notCloned');
            }
        } else if (hasExampleAssigned(this.courseContent)) {
            contexts.push('hasExample');
        }
        
        // Add team context
        if (this.submissionGroup && this.submissionGroup.max_group_size && this.submissionGroup.max_group_size > 1) {
            contexts.push('team');
        } else if (this.submissionGroup) {
            contexts.push('individual');
        }
        
        // Add grading context
        if (this.submissionGroup && typeof (this.submissionGroup as any).grading === "number") {
            contexts.push('graded');
        }
        
        this.contextValue = contexts.join('.');
    }
    
    private checkIfCloned(): boolean {
        if (!this.submissionGroup) return false;
        const repoPath = this.getRepositoryPath();
        return fs.existsSync(repoPath);
    }
    
    getRepositoryPath(): string {
        // Always prefer the directory field from courseContent
        // This is set by StudentRepositoryManager after cloning
        const directory = (this.courseContent as any).directory;
        if (directory) {
            // Resolve relative directory against repository root when possible
            if (path.isAbsolute(directory)) return directory;
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            let repoName: string | undefined;
            const repo = this.submissionGroup?.repository as any;
            if (repo) {
                if (typeof repo.full_path === 'string' && repo.full_path.length > 0) {
                    const parts = repo.full_path.split('/');
                    repoName = parts[parts.length - 1] || undefined;
                } else if (typeof repo.clone_url === 'string' && repo.clone_url.length > 0) {
                    const clean = repo.clone_url.replace(/\.git$/, '');
                    const parts = clean.split('/');
                    repoName = parts[parts.length - 1] || undefined;
                } else if (typeof repo.web_url === 'string' && repo.web_url.length > 0) {
                    const parts = repo.web_url.split('/');
                    repoName = parts[parts.length - 1] || undefined;
                }
            }
            if (ws && repoName) return path.join(ws, repoName, directory);
            // Without a resolvable repo name, avoid guessing a path
            return '';
        }
        
        // If no directory field, we can't determine the path
        // The directory will be set after the repository is cloned
        return '';
    }
}

// File system item for showing files and folders under assignments
class FileSystemItem extends TreeItem {
    constructor(
        public readonly name: string,
        public readonly uri: vscode.Uri,
        public readonly type: vscode.FileType
    ) {
        super(
            name,
            type === vscode.FileType.Directory 
                ? vscode.TreeItemCollapsibleState.Collapsed 
                : vscode.TreeItemCollapsibleState.None
        );
        
        this.id = uri.fsPath;
        this.resourceUri = uri;
        
        if (type === vscode.FileType.File) {
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [uri]
            };
            this.contextValue = 'file';
            
            // Set appropriate icon based on file extension
            const ext = path.extname(name).toLowerCase();
            if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
                this.iconPath = new vscode.ThemeIcon('file-code');
            } else if (['.json', '.xml', '.yaml', '.yml'].includes(ext)) {
                this.iconPath = new vscode.ThemeIcon('file-code');
            } else if (['.md', '.txt'].includes(ext)) {
                this.iconPath = new vscode.ThemeIcon('file-text');
            } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(ext)) {
                this.iconPath = new vscode.ThemeIcon('file-media');
            } else {
                this.iconPath = new vscode.ThemeIcon('file');
            }
        } else {
            this.contextValue = 'folder';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
        
        this.tooltip = uri.fsPath;
    }
}
