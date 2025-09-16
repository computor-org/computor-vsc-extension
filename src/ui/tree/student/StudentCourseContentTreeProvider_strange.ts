import * as vscode from 'vscode';
import * as fs from 'fs';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { StudentRepositoryManager } from '../../../services/StudentRepositoryManager';
import { CourseList, CourseContentStudentList, SubmissionGroupStudentList } from '../../../types/generated';

/**
 * Tree provider for student course content - works with a single selected course
 */
export class StudentCourseContentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private apiService: ComputorApiService;
    private repositoryManager?: StudentRepositoryManager;
    private currentCourseId?: string;
    private currentCourse?: CourseList;
    private courseContents: CourseContentStudentList[] = [];
    private expandedStates: Set<string> = new Set();
    
    constructor(
        apiService: ComputorApiService,
        repositoryManager?: StudentRepositoryManager
    ) {
        this.apiService = apiService;
        this.repositoryManager = repositoryManager;
    }
    
    /**
     * Set the current course to display
     */
    async setCurrentCourse(courseId: string | undefined): Promise<void> {
        this.currentCourseId = courseId;
        this.courseContents = [];
        this.currentCourse = undefined;
        
        if (courseId) {
            try {
                // Get course info
                const courses = await this.apiService.getStudentCourses();
                this.currentCourse = courses.find(c => c.id === courseId);
                
                // Get course contents
                this.courseContents = await this.apiService.getStudentCourseContents(courseId) || [];
                console.log(`Loaded ${this.courseContents.length} content items for course ${this.currentCourse?.title || courseId}`);
                
                // Debug: Check for any invalid content
                for (const content of this.courseContents) {
                    if (!content.id) {
                        console.warn('Course content missing id:', content);
                    }
                    if (content.submission_group && !content.submission_group.id) {
                        console.warn('Submission group missing id for content:', content.path);
                    }
                }
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
    
    /**
     * Refresh a specific node
     */
    refreshNode(element?: TreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }
    
    /**
     * Handle node expansion
     */
    async onTreeItemExpanded(element: TreeItem): Promise<void> {
        if (element.id) {
            this.expandedStates.add(element.id);
        }
    }
    
    /**
     * Handle node collapse
     */
    async onTreeItemCollapsed(element: TreeItem): Promise<void> {
        if (element.id) {
            this.expandedStates.delete(element.id);
        }
    }
    
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        console.log('[TreeProvider] getChildren called, element:', element?.label, 'currentCourseId:', this.currentCourseId, 'currentCourse:', this.currentCourse?.title, 'courseContents:', this.courseContents.length);
        
        if (!this.currentCourseId || !this.currentCourse) {
            console.log('[TreeProvider] No course selected - courseId:', this.currentCourseId, 'course:', this.currentCourse);
            return [new MessageItem('No course selected', 'Select a course to view its content')];
        }
        
        if (!element) {
            // Root level - show course contents organized by path
            console.log('[TreeProvider] Building content tree for root level');
            const tree = this.buildContentTree();
            console.log('[TreeProvider] Built tree with', tree.length, 'items');
            return tree;
        }
        
        if (element instanceof ContentFolderItem) {
            return element.children;
        }
        
        if (element instanceof CourseContentItem) {
            // Show submission group info if available
            const children: TreeItem[] = [];
            
            if (element.courseContent.submission_group) {
                const sg = element.courseContent.submission_group;
                
                // Add repository info if available
                if (sg && sg.repository) {
                    const repoStatus = await this.getRepositoryStatus(sg);
                    children.push(new RepositoryItem(sg, repoStatus));
                }
                
                // Add deployment info if available
                if (element.courseContent.submission_group?.example_identifier) {
                    children.push(new ExampleItem(element.courseContent));
                }
            }
            
            return children;
        }
        
        return [];
    }
    
    /**
     * Build content tree organized by path structure
     */
    private buildContentTree(): TreeItem[] {
        console.log('[TreeProvider] buildContentTree called with', this.courseContents.length, 'contents');
        const items: TreeItem[] = [];
        const pathMap = new Map<string, TreeItem[]>();
        
        // Check if we have contents
        if (this.courseContents.length === 0) {
            console.log('[TreeProvider] No course contents available');
            return [new MessageItem('No content available', 'This course has no content yet')];
        }
        
        // Group contents by their path prefix
        for (const content of this.courseContents) {
            console.log('[TreeProvider] Processing content:', content.path, content.title);
            const pathParts = content.path.split('.');
            const isNested = pathParts.length > 1;
            
            if (!isNested) {
                // Top-level item
                const item = this.createContentItem(content);
                console.log('[TreeProvider] Added top-level item:', item.label);
                items.push(item);
            } else {
                // Nested item - group by first part of path
                const prefix = pathParts[0] || '';
                if (!pathMap.has(prefix)) {
                    pathMap.set(prefix, []);
                }
                const groupItems = pathMap.get(prefix);
                if (groupItems) {
                    const item = this.createContentItem(content);
                    console.log('[TreeProvider] Added nested item to group:', prefix, item.label);
                    groupItems.push(item);
                }
            }
        }
        console.log('[TreeProvider] After processing, items:', items.length, 'pathMap groups:', pathMap.size);
        
        // Create folders for grouped items
        console.log('[TreeProvider] Creating folders for grouped items...');
        for (const [prefix, children] of pathMap) {
            if (children.length === 1) {
                // Single item, add directly
                const firstChild = children[0];
                if (firstChild) {
                    console.log('[TreeProvider] Adding single child directly:', firstChild.label);
                    items.push(firstChild);
                }
            } else {
                // Multiple items, create folder
                const folder = new ContentFolderItem(prefix, children);
                if (folder.id && this.expandedStates.has(folder.id)) {
                    folder.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                }
                items.push(folder);
            }
        }
        
        // Sort items: folders first, then by path
        items.sort((a, b) => {
            const aIsFolder = a instanceof ContentFolderItem;
            const bIsFolder = b instanceof ContentFolderItem;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return (a.label as string).localeCompare(b.label as string);
        });
        
        console.log('[TreeProvider] Returning', items.length, 'tree items');
        return items;
    }
    
    /**
     * Create a content item
     */
    private createContentItem(content: CourseContentStudentList): CourseContentItem {
        try {
            const item = new CourseContentItem(content);
            
            // Determine if it has children
            const hasChildren = content.submission_group?.repository || content.submission_group?.example_identifier;
            if (hasChildren) {
                item.collapsibleState = item.id && this.expandedStates.has(item.id)
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed;
            }
            
            return item;
        } catch (error) {
            console.error('[TreeProvider] Error creating content item:', error, 'for content:', content);
            throw error;
        }
    }
    
    /**
     * Get repository status
     */
    private async getRepositoryStatus(submissionGroup: SubmissionGroupStudentList): Promise<'cloned' | 'not-cloned'> {
        if (!this.repositoryManager || !submissionGroup.repository) {
            return 'not-cloned';
        }
        
        try {
            // Check if repository exists in workspace
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            const repoPath = workspaceFolder?.uri.fsPath || '';
            return fs.existsSync(repoPath) ? 'cloned' : 'not-cloned';
        } catch {
            return 'not-cloned';
        }
    }
}

// Tree item base class
abstract class TreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        id?: string
    ) {
        super(label, collapsibleState);
        this.id = id || this.generateId();
    }
    
    protected abstract generateId(): string;
}

// Message item for empty states
class MessageItem extends TreeItem {
    constructor(message: string, tooltip?: string) {
        const id = `message-${message}`;
        super(message, vscode.TreeItemCollapsibleState.None, id);
        this.contextValue = 'message';
        this.iconPath = new vscode.ThemeIcon('info');
        if (tooltip) {
            this.tooltip = tooltip;
        }
    }
    
    protected generateId(): string {
        return `message-${this.label}`;
    }
}

// Content folder item
class ContentFolderItem extends TreeItem {
    constructor(
        public readonly folderName: string,
        public readonly children: TreeItem[]
    ) {
        const id = `folder-${folderName}`;
        super(folderName, vscode.TreeItemCollapsibleState.Collapsed, id);
        this.contextValue = 'contentFolder';
        this.iconPath = new vscode.ThemeIcon('folder');
        this.description = `${children.length} items`;
    }
    
    protected generateId(): string {
        return `folder-${this.folderName}`;
    }
}

// Course content item
class CourseContentItem extends TreeItem {
    constructor(public readonly courseContent: CourseContentStudentList) {
        const label = courseContent.title || courseContent.path;
        const id = `content-${courseContent.id}`;
        super(label, vscode.TreeItemCollapsibleState.None, id);
        
        this.contextValue = this.determineContextValue();
        this.iconPath = this.determineIcon();
        this.description = this.determineDescription();
        this.tooltip = this.buildTooltip();
        
        // Add command to open content
        if (courseContent.submission_group?.repository) {
            this.command = {
                command: 'computor.student.openRepository',
                title: 'Open Repository',
                arguments: [courseContent]
            };
        }
    }
    
    protected generateId(): string {
        return `content-${this.courseContent.id}`;
    }
    
    private determineContextValue(): string {
        const parts = ['studentCourseContent'];
        
        if (this.courseContent.course_content_type?.course_content_kind_id === 'assignment') {
            parts.push('assignment');
        }
        
        if (this.courseContent.submission_group?.repository) {
            parts.push('withRepository');
        }
        
        if (this.courseContent.submission_group?.example_identifier) {
            parts.push('withExample');
        }
        
        return parts.join('.');
    }
    
    private determineIcon(): vscode.ThemeIcon {
        const contentType = this.courseContent.course_content_type;
        
        if (contentType?.course_content_kind_id === 'assignment') {
            return new vscode.ThemeIcon('file-code');
        }
        
        if (this.courseContent.submission_group?.example_identifier) {
            return new vscode.ThemeIcon('beaker');
        }
        
        return new vscode.ThemeIcon('file');
    }
    
    private determineDescription(): string {
        const parts: string[] = [];
        
        if (this.courseContent.course_content_type?.title) {
            parts.push(this.courseContent.course_content_type.title);
        }
        
        if (this.courseContent.submission_group?.repository) {
            parts.push('📁');
        }
        
        if (this.courseContent.submission_group?.example_identifier) {
            parts.push('🧪');
        }
        
        return parts.join(' ');
    }
    
    private buildTooltip(): string {
        const lines: string[] = [
            this.courseContent.title || this.courseContent.path,
            `Path: ${this.courseContent.path}`
        ];
        
        if (this.courseContent.course_content_type?.title) {
            lines.push(`Type: ${this.courseContent.course_content_type.title}`);
        }
        
        if (this.courseContent.submission_group?.repository) {
            lines.push(`Repository: ${this.courseContent.submission_group.repository.full_path}`);
        }
        
        return lines.join('\n');
    }
}

// Repository item
class RepositoryItem extends TreeItem {
    constructor(
        public readonly submissionGroup: SubmissionGroupStudentList,
        status: 'cloned' | 'not-cloned'
    ) {
        const label = status === 'cloned' ? '✓ Repository (Cloned)' : '○ Repository (Not Cloned)';
        const id = `repo-${submissionGroup.id || 'unknown'}`;
        super(label, vscode.TreeItemCollapsibleState.None, id);
        
        this.contextValue = `studentRepository.${status}`;
        this.iconPath = new vscode.ThemeIcon(status === 'cloned' ? 'check' : 'cloud-download');
        
        if (submissionGroup.repository) {
            this.description = submissionGroup.repository.full_path;
            this.tooltip = `Repository: ${submissionGroup.repository.full_path}\nStatus: ${status}`;
            
            if (status === 'not-cloned') {
                this.command = {
                    command: 'computor.student.cloneRepository',
                    title: 'Clone Repository',
                    arguments: [submissionGroup]
                };
            }
        }
    }
    
    protected generateId(): string {
        return `repo-${this.submissionGroup.id || 'unknown'}`;
    }
}

// Example/Assignment item
class ExampleItem extends TreeItem {
    constructor(private readonly courseContent: CourseContentStudentList) {
        const id = `example-${courseContent.id}`;
        super('Assignment', vscode.TreeItemCollapsibleState.None, id);
        
        this.contextValue = 'studentExample';
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.description = courseContent.submission_group?.example_identifier || 'Available';
        this.tooltip = 'Assignment available for this content';
    }
    
    protected generateId(): string {
        return `example-${this.courseContent.id}`;
    }
}