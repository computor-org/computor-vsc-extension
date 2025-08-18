import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { CourseSelectionService } from '../../../services/CourseSelectionService';

interface PathNode {
    name?: string;
    children: Map<string, PathNode>;
    submissionGroup?: any; // SubmissionGroupStudent type
}

export class StudentCourseContentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    private apiService: ComputorApiService;
    private courseSelection: CourseSelectionService;
    private submissionGroups: any[] = [];
    
    constructor(apiService: ComputorApiService, courseSelection: CourseSelectionService) {
        this.apiService = apiService;
        this.courseSelection = courseSelection;
    }
    
    refresh(): void {
        this.submissionGroups = [];
        this._onDidChangeTreeData.fire(undefined);
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
            // Root level - fetch submission groups and build tree
            try {
                this.submissionGroups = await this.apiService.getStudentSubmissionGroups({
                    course_id: courseId
                });
                
                if (this.submissionGroups.length === 0) {
                    return [new MessageItem('No course content available', 'info')];
                }
                
                // Build tree structure from paths
                const tree = this.buildPathTree(this.submissionGroups);
                return this.createTreeItems(tree);
            } catch (error) {
                return [new MessageItem(`Error loading content: ${error}`, 'error')];
            }
        }
        
        // Handle path items (folders)
        if (element instanceof CourseContentPathItem) {
            return this.createTreeItems(element.node);
        }
        
        return [];
    }
    
    private buildPathTree(submissionGroups: any[]): PathNode {
        const root: PathNode = { children: new Map() };
        
        for (const sg of submissionGroups) {
            if (!sg.course_content_path) continue;
            
            const pathParts = sg.course_content_path.split('.');
            let current = root;
            
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                const isLeaf = i === pathParts.length - 1;
                
                if (!current.children.has(part)) {
                    current.children.set(part, {
                        name: part,
                        children: new Map(),
                        submissionGroup: isLeaf ? sg : undefined
                    });
                }
                
                current = current.children.get(part)!;
                
                // Update submission group if this is the leaf
                if (isLeaf && !current.submissionGroup) {
                    current.submissionGroup = sg;
                }
            }
        }
        
        return root;
    }
    
    private createTreeItems(node: PathNode): TreeItem[] {
        const items: TreeItem[] = [];
        
        // Sort children alphabetically
        const sortedChildren = Array.from(node.children.entries()).sort((a, b) => 
            a[0].localeCompare(b[0])
        );
        
        for (const [name, child] of sortedChildren) {
            if (child.submissionGroup) {
                // Leaf node - actual course content
                items.push(new CourseContentItem(child.submissionGroup, this.courseSelection));
            } else {
                // Branch node - path folder
                items.push(new CourseContentPathItem(name, child));
            }
        }
        
        return items;
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
        public readonly node: PathNode
    ) {
        super(name, vscode.TreeItemCollapsibleState.Expanded);
        
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'courseContentPath';
        
        // Count total items under this path
        const count = this.countItems(node);
        this.description = `${count} item${count !== 1 ? 's' : ''}`;
    }
    
    private countItems(node: PathNode): number {
        let count = 0;
        for (const child of node.children.values()) {
            if (child.submissionGroup) {
                count++;
            } else {
                count += this.countItems(child);
            }
        }
        return count;
    }
}

class CourseContentItem extends TreeItem {
    constructor(
        public readonly submissionGroup: any,
        courseSelection: CourseSelectionService
    ) {
        void courseSelection; // Not used but required for type consistency
        const label = submissionGroup.course_content_title || 'Untitled';
        super(label, vscode.TreeItemCollapsibleState.None);
        
        this.setupIcon();
        this.setupDescription();
        this.setupTooltip();
        this.setupContextValue();
        
        // Add command to open/clone repository
        if (submissionGroup.repository) {
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
        }
    }
    
    private setupIcon(): void {
        if (this.submissionGroup.repository) {
            const isCloned = this.checkIfCloned();
            if (isCloned) {
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('terminal.ansiGreen'));
            } else {
                this.iconPath = new vscode.ThemeIcon('cloud-download');
            }
        } else {
            this.iconPath = new vscode.ThemeIcon('file');
        }
    }
    
    private setupDescription(): void {
        const parts: string[] = [];
        
        // Clone status
        if (this.submissionGroup.repository) {
            const isCloned = this.checkIfCloned();
            parts.push(isCloned ? '✓ Cloned' : 'Not cloned');
        }
        
        // Team indicator
        if (this.submissionGroup.max_group_size > 1) {
            parts.push(`👥 ${this.submissionGroup.current_group_size}/${this.submissionGroup.max_group_size}`);
        }
        
        // Grade
        if (this.submissionGroup.latest_grading) {
            const grade = Math.round(this.submissionGroup.latest_grading.grading * 100);
            parts.push(`📊 ${grade}%`);
        }
        
        this.description = parts.join(' • ');
    }
    
    private setupTooltip(): void {
        const lines: string[] = [
            this.submissionGroup.course_content_title || 'Course Content',
            `Path: ${this.submissionGroup.course_content_path}`
        ];
        
        if (this.submissionGroup.repository) {
            lines.push(`Repository: ${this.submissionGroup.repository.full_path}`);
        }
        
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
        
        this.tooltip = lines.join('\n');
    }
    
    private setupContextValue(): void {
        const contexts: string[] = ['courseContent'];
        
        if (this.submissionGroup.repository) {
            contexts.push('withRepository');
            if (this.checkIfCloned()) {
                contexts.push('cloned');
            } else {
                contexts.push('notCloned');
            }
        }
        
        if (this.submissionGroup.max_group_size > 1) {
            contexts.push('team');
        } else {
            contexts.push('individual');
        }
        
        if (this.submissionGroup.latest_grading) {
            contexts.push('graded');
        }
        
        this.contextValue = contexts.join('.');
    }
    
    private checkIfCloned(): boolean {
        const repoPath = this.getRepositoryPath();
        return fs.existsSync(repoPath);
    }
    
    getRepositoryPath(): string {
        const courseId = this.submissionGroup.course_id;
        const contentPath = this.submissionGroup.course_content_path || 'unknown';
        // Using worktree structure: assignment-{path}
        const folderName = `assignment-${contentPath.replace(/\./g, '-')}`;
        
        return path.join(
            os.homedir(),
            '.computor',
            'workspace',
            'courses',
            courseId,
            folderName
        );
    }
}