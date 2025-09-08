import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { CourseSelectionService } from '../../../services/CourseSelectionService';
import { StudentRepositoryManager } from '../../../services/StudentRepositoryManager';
import { ComputorSettingsManager } from '../../../settings/ComputorSettingsManager';
import { SubmissionGroupStudentList, CourseContentStudentList, CourseContentTypeList, CourseContentKindList, CourseList } from '../../../types/generated';
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
    private courses: CourseList[] = [];
    private courseContentsCache: Map<string, CourseContentStudentList[]> = new Map(); // Cache course contents per course
    private contentKinds: CourseContentKindList[] = [];
    private expandedStates: Record<string, boolean> = {};
    
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
        this.courses = [];
        this.courseContentsCache.clear();
        this.contentKinds = [];
        // Don't clear expanded states on refresh - preserve them
        this._onDidChangeTreeData.fire(undefined);
    }
    
    refreshNode(element?: TreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }
    
    /**
     * Refresh only the specific course content item without affecting the entire tree
     */
    refreshContentItem(contentId: string): void {
        void contentId; // TODO: Implement targeted refresh using contentId
        // Find and refresh the specific content item without collapsing the tree
        // This is a targeted refresh that preserves tree state
        this._onDidChangeTreeData.fire(null);
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
            const directory = (element.courseContent as any).directory;
            const hasRepository = !!element.submissionGroup?.repository;
            
            if (isAssignment && hasRepository) {
                let assignmentPath: string | undefined;
                
                // First, check if we need to setup the repository
                if (!directory || !fs.existsSync(directory)) {
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
                            const courseContents = await this.apiService.getStudentCourseContents(courseId) || [];
                            this.courseContentsCache.set(courseId, courseContents);
                            
                            // Update directory paths for existing repositories
                            this.repositoryManager!.updateExistingRepositoryPaths(courseId, courseContents);
                            
                            // Update the directory on the current element directly
                            const updatedContent = courseContents.find(c => c.id === element.courseContent.id);
                            if (updatedContent && updatedContent.directory) {
                                (element.courseContent as any).directory = updatedContent.directory;
                            }
                        });
                        
                        // Now that directory is updated, continue to show files
                        // Re-check the directory after setup
                        const updatedDirectory = (element.courseContent as any).directory;
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
                    assignmentPath = directory;
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
            // Root level - check if we have a selected course (when running in course workspace)
            const selectedCourseId = this.courseSelection.getCurrentCourseId();
            console.log('[StudentTree] Getting children for root, selected course ID:', selectedCourseId);
            
            if (selectedCourseId) {
                // We're in a course workspace - show course contents directly
                try {
                    // Fetch content kinds if not already loaded
                    if (this.contentKinds.length === 0) {
                        this.contentKinds = await this.apiService.getCourseContentKinds() || [];
                    }
                    
                    // Fetch course contents for the selected course
                    let courseContents = this.courseContentsCache.get(selectedCourseId);
                    
                    if (!courseContents) {
                        console.log('[StudentTree] Fetching course contents from API for course:', selectedCourseId);
                        courseContents = await this.apiService.getStudentCourseContents(selectedCourseId) || [];
                        console.log('[StudentTree] Received course contents:', courseContents.length, 'items');
                        this.courseContentsCache.set(selectedCourseId, courseContents);
                        
                        // Update directory paths for existing repositories
                        if (this.repositoryManager) {
                            this.repositoryManager.updateExistingRepositoryPaths(selectedCourseId, courseContents);
                        }
                    } else {
                        console.log('[StudentTree] Using cached course contents:', courseContents.length, 'items');
                    }
                    
                    if (courseContents.length === 0) {
                        console.log('[StudentTree] No course content available for course:', selectedCourseId);
                        return [new MessageItem('No course content available', 'info')];
                    }
                    
                    // Build tree structure from course content
                    const tree = this.buildContentTree(courseContents, [], [], this.contentKinds);
                    return this.createTreeItems(tree);
                } catch (error: any) {
                    console.error('Failed to load course content:', error);
                    const message = error?.response?.data?.message || error?.message || 'Unknown error';
                    return [new MessageItem(`Error loading content: ${message}`, 'error')];
                }
            } else {
                // No course selected - show all courses
                try {
                    // Fetch courses and content kinds in parallel
                    const [courses, contentKinds] = await Promise.all([
                        this.apiService.getStudentCourses(),
                        this.apiService.getCourseContentKinds()
                    ]);
                    
                    this.courses = courses || [];
                    this.contentKinds = contentKinds || [];
                    
                    if (this.courses.length === 0) {
                        return [new MessageItem('No courses available', 'info')];
                    }
                    
                    // Show courses directly without the start session message
                    const items: TreeItem[] = [];
                    
                    // Add course items
                    items.push(...this.courses.map(course => {
                        const courseId = `course-${course.id}`;
                        return new CourseTreeItem(course, this.getExpandedState(courseId));
                    }));
                    return items;
                } catch (error: any) {
                    console.error('Failed to load student courses:', error);
                    const message = error?.response?.data?.message || error?.message || 'Unknown error';
                    vscode.window.showErrorMessage(`Failed to load courses: ${message}`);
                    return [new MessageItem(`Error loading courses: ${message}`, 'error')];
                }
            }
        }
        
        // Handle course item - fetch course contents
        if (element instanceof CourseTreeItem) {
            try {
                // Check cache first
                let courseContents = this.courseContentsCache.get(element.course.id);
                
                if (!courseContents) {
                    // Fetch course contents for this specific course
                    courseContents = await this.apiService.getStudentCourseContents(element.course.id) || [];
                    this.courseContentsCache.set(element.course.id, courseContents);
                    
                    // Update directory paths for existing repositories
                    if (this.repositoryManager) {
                        this.repositoryManager.updateExistingRepositoryPaths(element.course.id, courseContents);
                    }
                }
                
                if (courseContents.length === 0) {
                    return [new MessageItem('No course content available', 'info')];
                }
                
                // Build tree structure from course content
                const tree = this.buildContentTree(courseContents, [], [], this.contentKinds);
                return this.createTreeItems(tree);
            } catch (error: any) {
                console.error('Failed to load course content:', error);
                const message = error?.response?.data?.message || error?.message || 'Unknown error';
                return [new MessageItem(`Error loading content: ${message}`, 'error')];
            }
        }
        
        // Handle content items (units/folders)
        if (element instanceof CourseContentPathItem) {
            return this.createTreeItems(element.node);
        }
        
        return [];
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
            
            const node: ContentNode = {
                name: content.title || content.path.split('.').pop() || content.path,
                children: new Map(),
                courseContent: content,
                submissionGroup,
                contentType,
                contentKind,
                isUnit
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
        
        return root;
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
                items.push(new CourseContentPathItem(
                    child.name || name, 
                    child,
                    this.getExpandedState(nodeId)
                ));
            } else if (child.courseContent) {
                // Leaf node - actual course content (assignment, reading, etc.)
                items.push(new CourseContentItem(
                    child.courseContent,
                    child.submissionGroup,
                    child.contentType,
                    this.courseSelection,
                    this.getExpandedState(child.courseContent.id)
                ));
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

class CourseTreeItem extends TreeItem {
    constructor(
        public readonly course: CourseList,
        expanded: boolean = false
    ) {
        super(
            course.title || course.path, 
            expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
        );
        
        this.id = `course-${course.id}`;
        this.contextValue = 'studentCourse';
        this.iconPath = new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));
        
        // Add description with course info
        const parts: string[] = [];
        if (course.path) {
            parts.push(course.path);
        }
        this.description = parts.join(' • ');
        
        // Add tooltip
        const tooltipParts: string[] = [
            course.title || 'Course',
            `ID: ${course.id}`
        ];
        if (course.path) {
            tooltipParts.push(`Path: ${course.path}`);
        }
        this.tooltip = tooltipParts.join('\n');
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
        public readonly node: ContentNode,
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
        
        // Count total items under this path
        const count = this.countItems(node);
        this.description = `${count} item${count !== 1 ? 's' : ''}`;
        this.tooltip = `Unit: ${name}\n${count} items`;
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
        const hasRepository = !!submissionGroup?.repository;
        const directory = (courseContent as any).directory;
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        let hasClonedRepo = false;
        if (isAssignment && directory && workspaceFolders.length > 0 && workspaceFolders[0]) {
            const assignmentPath = path.join(workspaceFolders[0].uri.fsPath, directory);
            hasClonedRepo = fs.existsSync(assignmentPath);
        }
        void hasClonedRepo; // Suppress unused variable warning
        
        // Always make assignments with repositories expandable, regardless of clone status
        const shouldBeExpandable = isAssignment && hasRepository;
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
    
    private setupIcon(): void {
        // Use the color from contentType, or grey as default
        const color = this.contentType?.color || 'grey';
        
        try {
            // Determine shape based on course_content_kind_id
            // 'assignment' gets square, 'unit' (or anything else) gets circle
            const shape = this.contentType?.course_content_kind_id === 'assignment' ? 'square' : 'circle';
            this.iconPath = IconGenerator.getColoredIcon(color, shape);
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
        if (!this.contentType) return hasExampleAssigned(this.courseContent);
        
        // First check the explicit kind_id
        if (this.contentType.course_content_kind_id === 'assignment') {
            return true;
        }
        
        // Fall back to checking slug for assignment-related keywords
        const assignmentTypes = ['assignment', 'exercise', 'homework', 'task', 'lab', 'quiz', 'exam'];
        const slug = this.contentType.slug?.toLowerCase() || '';
        return assignmentTypes.some(type => slug.includes(type));
    }
    
    private setupDescription(): void {
        const parts: string[] = [];
        
        // Content type
        if (this.contentType?.title) {
            parts.push(this.contentType.title);
        }
        
        // Team indicator
        if (this.submissionGroup && this.submissionGroup.max_group_size && this.submissionGroup.max_group_size > 1) {
            parts.push(`👥 ${this.submissionGroup.current_group_size}/${this.submissionGroup.max_group_size}`);
        }
        
        // Grade
        if (this.submissionGroup?.latest_grading) {
            const grade = Math.round(this.submissionGroup.latest_grading.grading * 100);
            parts.push(`📊 ${grade}%`);
        } else if (hasExampleAssigned(this.courseContent)) {
            parts.push('📝 Assignment');
        }
        
        this.description = parts.length > 0 ? parts.join(' • ') : undefined;
    }
    
    private setupTooltip(): void {
        const lines: string[] = [
            this.courseContent.title || 'Course Content',
            `Path: ${this.courseContent.path}`
        ];
        
        if (this.contentType) {
            lines.push(`Type: ${this.contentType.title || this.contentType.slug}`);
        }
        
        if (hasExampleAssigned(this.courseContent)) {
            // Note: We can't easily get the example_id from the new structure
            // Show version ID if available
            const versionId = getExampleVersionId(this.courseContent);
            if (versionId) {
                lines.push(`Example Version ID: ${versionId}`);
            }
        }
        
        if (this.submissionGroup?.repository) {
            lines.push(`Repository: ${this.submissionGroup.repository.full_path}`);
            
            if (this.submissionGroup.latest_grading) {
                const grade = Math.round(this.submissionGroup.latest_grading.grading * 100);
                lines.push(`Grade: ${grade}%`);
                if (this.submissionGroup.latest_grading.status) {
                    lines.push(`Status: ${this.submissionGroup.latest_grading.status}`);
                }
                if (this.submissionGroup.latest_grading.graded_by) {
                    lines.push(`Graded by: ${this.submissionGroup.latest_grading.graded_by}`);
                }
            }
            
            if (this.submissionGroup.members && this.submissionGroup.members.length > 1) {
                lines.push('Team members:');
                for (const member of this.submissionGroup.members) {
                    lines.push(`  - ${member.full_name || member.username}`);
                }
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
        if (this.submissionGroup?.latest_grading) {
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
            // Use the directory field directly - it's the actual file path
            return directory;
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