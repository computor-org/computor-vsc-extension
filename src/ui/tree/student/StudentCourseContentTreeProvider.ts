import * as vscode from 'vscode';
import * as fs from 'fs';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { StudentRepositoryManager } from '../../../services/StudentRepositoryManager';
import { SubmissionGroupStudent, CourseList } from '../../../types/generated';

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
    private courseContents: any[] = [];
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
        if (!this.currentCourseId || !this.currentCourse) {
            return [new MessageItem('No course selected', 'Select a course to view its content')];
        }
        
        if (!element) {
            // Root level - show course contents organized by path
            return this.buildContentTree();
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
                if (sg.repository) {
                    const repoStatus = await this.getRepositoryStatus(sg);
                    children.push(new RepositoryItem(sg, repoStatus));
                }
                
                // Add deployment info if available
                if (element.courseContent.example_id) {
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
        const items: TreeItem[] = [];
        const pathMap = new Map<string, TreeItem[]>();
        
        // Group contents by their path prefix
        for (const content of this.courseContents) {
            const pathParts = content.path.split('.');
            const isNested = pathParts.length > 1;
            
            if (!isNested) {
                // Top-level item
                items.push(this.createContentItem(content));
            } else {
                // Nested item - group by first part of path
                const prefix = pathParts[0];
                if (!pathMap.has(prefix)) {
                    pathMap.set(prefix, []);
                }
                pathMap.get(prefix)!.push(this.createContentItem(content));
            }
        }
        
        // Create folders for grouped items
        for (const [prefix, children] of pathMap) {
            if (children.length === 1) {
                // Single item, add directly
                items.push(children[0]!);
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
        
        return items;
    }
    
    /**
     * Create a content item
     */
    private createContentItem(content: any): CourseContentItem {
        const item = new CourseContentItem(content);
        
        // Determine if it has children
        const hasChildren = content.submission_group?.repository || content.example_id;
        if (hasChildren) {
            item.collapsibleState = item.id && this.expandedStates.has(item.id)
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed;
        }
        
        return item;
    }
    
    /**
     * Get repository status
     */
    private async getRepositoryStatus(submissionGroup: SubmissionGroupStudent): Promise<'cloned' | 'not-cloned'> {
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
        collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        this.id = this.generateId();
    }
    
    protected abstract generateId(): string;
}

// Message item for empty states
class MessageItem extends TreeItem {
    constructor(message: string, tooltip?: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
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
        super(folderName, vscode.TreeItemCollapsibleState.Collapsed);
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
    constructor(public readonly courseContent: any) {
        const label = courseContent.title || courseContent.path;
        super(label, vscode.TreeItemCollapsibleState.None);
        
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
        
        if (this.courseContent.example_id) {
            parts.push('withExample');
        }
        
        return parts.join('.');
    }
    
    private determineIcon(): vscode.ThemeIcon {
        const contentType = this.courseContent.course_content_type;
        
        if (contentType?.course_content_kind_id === 'assignment') {
            return new vscode.ThemeIcon('file-code');
        }
        
        if (this.courseContent.example_id) {
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
        
        if (this.courseContent.example_id) {
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
        public readonly submissionGroup: SubmissionGroupStudent,
        status: 'cloned' | 'not-cloned'
    ) {
        const label = status === 'cloned' ? '✓ Repository (Cloned)' : '○ Repository (Not Cloned)';
        super(label, vscode.TreeItemCollapsibleState.None);
        
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
        return `repo-${this.submissionGroup.id}`;
    }
}

// Example/Assignment item
class ExampleItem extends TreeItem {
    constructor(private readonly courseContent: any) {
        super('Assignment', vscode.TreeItemCollapsibleState.None);
        
        this.contextValue = 'studentExample';
        this.iconPath = new vscode.ThemeIcon('beaker');
        this.description = courseContent.example_id || 'Available';
        this.tooltip = 'Assignment available for this content';
    }
    
    protected generateId(): string {
        return `example-${this.courseContent.id}`;
    }
}