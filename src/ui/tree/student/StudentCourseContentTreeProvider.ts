import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { CourseSelectionService } from '../../../services/CourseSelectionService';
import { GitWorktreeManager } from '../../../services/GitWorktreeManager';
import { SubmissionGroupStudent, CourseContentList, CourseContentTypeList, CourseContentKindList } from '../../../types/generated';
import { IconGenerator } from '../../../utils/IconGenerator';

interface ContentNode {
    name?: string;
    children: Map<string, ContentNode>;
    courseContent?: CourseContentList;
    submissionGroup?: SubmissionGroupStudent;
    contentType?: CourseContentTypeList;
    contentKind?: CourseContentKindList;
    isUnit: boolean;
}

// Interface for repository cloning items  
interface CloneRepositoryItem {
    submissionGroup: SubmissionGroupStudent;
}


export class StudentCourseContentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private apiService: ComputorApiService;
    private courseSelection: CourseSelectionService;
    private submissionGroups: SubmissionGroupStudent[] = [];
    private courseContents: CourseContentList[] = [];
    private contentTypes: CourseContentTypeList[] = [];
    private contentKinds: CourseContentKindList[] = [];
    private expandedStates: Map<string, boolean> = new Map();
    
    constructor(apiService: ComputorApiService, courseSelection: CourseSelectionService) {
        this.apiService = apiService;
        this.courseSelection = courseSelection;
    }
    
    refresh(): void {
        this.submissionGroups = [];
        this.courseContents = [];
        this.contentTypes = [];
        this.contentKinds = [];
        this._onDidChangeTreeData.fire(undefined);
    }
    
    refreshNode(element?: TreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }
    
    /**
     * Refresh only the specific course content item without affecting the entire tree
     */
    refreshContentItem(contentId: string): void {
        // Find and refresh the specific content item without collapsing the tree
        // This is a targeted refresh that preserves tree state
        this._onDidChangeTreeData.fire(null);
    }
    
    /**
     * Handle node expansion/collapse state changes
     */
    async onTreeItemExpanded(element: TreeItem): Promise<void> {
        if (element.id) {
            this.setNodeExpanded(element.id, true);
        }
    }
    
    async onTreeItemCollapsed(element: TreeItem): Promise<void> {
        if (element.id) {
            this.setNodeExpanded(element.id, false);
        }
    }
    
    getTreeItem(element: TreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        const courseId = this.courseSelection.getCurrentCourseId();
        
        if (!courseId) {
            return [new MessageItem('Please select a course first', 'warning')];
        }
        
        if (!element) {
            // Root level - fetch all course content and build comprehensive tree
            try {
                // Fetch all course content, submission groups, content types, and content kinds in parallel
                const [courseContents, submissionGroups, contentTypes, contentKinds] = await Promise.all([
                    this.apiService.getCourseContents(courseId, true),
                    this.apiService.getStudentSubmissionGroups({ course_id: courseId }),
                    this.apiService.getCourseContentTypes(courseId),
                    this.apiService.getCourseContentKinds()
                ]);
                
                this.courseContents = courseContents || [];
                this.submissionGroups = submissionGroups || [];
                this.contentTypes = contentTypes || [];
                this.contentKinds = contentKinds || [];
                
                if (this.courseContents.length === 0) {
                    return [new MessageItem('No course content available', 'info')];
                }
                
                // Build tree structure from ALL course content, not just submission groups
                const tree = this.buildContentTree(this.courseContents, this.submissionGroups, this.contentTypes, this.contentKinds);
                return this.createTreeItems(tree);
            } catch (error: any) {
                console.error('Failed to load student course content:', error);
                const message = error?.response?.data?.message || error?.message || 'Unknown error';
                vscode.window.showErrorMessage(`Failed to load course content: ${message}`);
                return [new MessageItem(`Error loading content: ${message}`, 'error')];
            }
        }
        
        // Handle content items (units/folders)
        if (element instanceof CourseContentPathItem) {
            return this.createTreeItems(element.node);
        }
        
        return [];
    }
    
    private buildContentTree(
        courseContents: CourseContentList[], 
        submissionGroups: SubmissionGroupStudent[], 
        contentTypes: CourseContentTypeList[],
        contentKinds: CourseContentKindList[]
    ): ContentNode {
        const root: ContentNode = { children: new Map(), isUnit: false };
        
        // Create a map of submission groups by course content path for quick lookup
        const submissionGroupMap = new Map<string, SubmissionGroupStudent>();
        for (const sg of submissionGroups) {
            if (sg.course_content_path) {
                submissionGroupMap.set(sg.course_content_path, sg);
            }
        }
        
        // Create a map of content types by ID for quick lookup
        const contentTypeMap = new Map<string, CourseContentTypeList>();
        for (const ct of contentTypes) {
            contentTypeMap.set(ct.id, ct);
        }
        
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
            const contentType = contentTypeMap.get(content.course_content_type_id);
            const contentKind = contentType ? contentKindMap.get(contentType.course_content_kind_id) : undefined;
            const submissionGroup = submissionGroupMap.get(content.path);
            
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
            if (child.isUnit && child.children.size > 0) {
                // Unit node - contains other content items
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
        return this.expandedStates.get(nodeId) || false;
    }
    
    setNodeExpanded(nodeId: string, expanded: boolean): void {
        if (expanded) {
            this.expandedStates.set(nodeId, true);
        } else {
            this.expandedStates.delete(nodeId);
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
        
        this.iconPath = new vscode.ThemeIcon('folder', new vscode.ThemeColor('charts.foreground'));
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
        public readonly courseContent: CourseContentList,
        public readonly submissionGroup: SubmissionGroupStudent | undefined,
        public readonly contentType: CourseContentTypeList | undefined,
        courseSelection: CourseSelectionService,
        expanded: boolean = false
    ) {
        void courseSelection; // Not used but required for type consistency
        const label = courseContent.title || courseContent.path;
        super(label, vscode.TreeItemCollapsibleState.None);
        
        this.id = courseContent.id;
        this.setupIcon();
        this.setupDescription();
        this.setupTooltip();
        this.setupContextValue();
        
        // Add command to open/clone repository if this is an assignment with repository
        if (this.submissionGroup?.repository) {
            const isCloned = this.checkIfCloned();
            if (isCloned) {
                this.command = {
                    command: 'vscode.openFolder',
                    title: 'Open Repository',
                    arguments: [vscode.Uri.file(this.getRepositoryPath()), { forceNewWindow: false }]
                };
            } else {
                this.command = {
                    command: 'computor.student.cloneRepository',
                    title: 'Clone Repository',
                    arguments: [this]
                };
            }
        } else if (this.courseContent.example_id) {
            // For non-repository assignments, show info
            this.command = {
                command: 'computor.student.viewContent',
                title: 'View Assignment Details',
                arguments: [this]
            };
        }
    }
    
    private setupIcon(): void {
        // Use colored icon based on content type (similar to lecturer tree)
        if (this.contentType?.color) {
            try {
                const isAssignment = this.isAssignment();
                const shape = isAssignment ? 'square' : 'circle';
                const coloredIcon = IconGenerator.getColoredIcon(this.contentType.color, shape);
                
                // Check if we got a valid icon (not a fallback ThemeIcon)
                if (coloredIcon instanceof vscode.Uri) {
                    this.iconPath = coloredIcon;
                    return;
                }
                // If it's a ThemeIcon fallback, continue to our fallback logic
            } catch (error) {
                console.warn('Failed to generate colored icon:', error);
                // Fallback to theme icons below
            }
        }
        
        // Fallback to theme icons with status indicators
        if (this.submissionGroup?.repository) {
            const isCloned = this.checkIfCloned();
            if (isCloned) {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
            } else {
                this.iconPath = new vscode.ThemeIcon('cloud-download', new vscode.ThemeColor('terminal.ansiBlue'));
            }
        } else if (this.courseContent.example_id) {
            // Assignment without repository
            this.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('terminal.ansiYellow'));
        } else if (this.isAssignment()) {
            // Assignment type content
            this.iconPath = new vscode.ThemeIcon('tasklist', new vscode.ThemeColor('charts.orange'));
        } else {
            // Reading material or other content
            this.iconPath = new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.blue'));
        }
    }
    
    private isAssignment(): boolean {
        if (!this.contentType) return !!this.courseContent.example_id;
        
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
        
        // Clone status for repository assignments
        if (this.submissionGroup?.repository) {
            const isCloned = this.checkIfCloned();
            parts.push(isCloned ? '✓ Cloned' : 'Clone required');
        }
        
        // Team indicator
        if (this.submissionGroup && this.submissionGroup.max_group_size > 1) {
            parts.push(`👥 ${this.submissionGroup.current_group_size}/${this.submissionGroup.max_group_size}`);
        }
        
        // Grade
        if (this.submissionGroup?.latest_grading) {
            const grade = Math.round(this.submissionGroup.latest_grading.grading * 100);
            parts.push(`📊 ${grade}%`);
        } else if (this.courseContent.example_id) {
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
        
        if (this.courseContent.example_id) {
            lines.push(`Example ID: ${this.courseContent.example_id}`);
            if (this.courseContent.example_version) {
                lines.push(`Example Version: ${this.courseContent.example_version}`);
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
        } else if (this.courseContent.example_id) {
            contexts.push('hasExample');
        }
        
        // Add team context
        if (this.submissionGroup && this.submissionGroup.max_group_size > 1) {
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
        if (!this.submissionGroup) return '';
        
        const courseId = this.submissionGroup.course_id;
        const contentPath = this.submissionGroup.course_content_path || 'unknown';
        
        // Use GitWorktreeManager to get the correct worktree path
        const gitWorktreeManager = GitWorktreeManager.getInstance();
        const workspaceRoot = path.join(os.homedir(), '.computor', 'workspace');
        return gitWorktreeManager.getWorktreePath(workspaceRoot, courseId, contentPath);
    }
}