# Student Course Selection and Workspace Design

## Overview
Students need to select a course after login to set up their workspace context. This ensures the workbench is course-specific with all relevant repositories available.

## User Flow

### 1. Login → Course Selection
```
1. Student logs in
2. Extension fetches available courses via `/students/courses`
3. Quick Pick menu shows course selection
4. Student selects a course
5. Workspace switches to selected course context
```

### 2. Course Context Switch
When a course is selected:
- Workbench root changes to `~/computor/courses/{course-uuid}/`
- All repositories for that course are available
- Tree view shows only that course's content
- Status bar shows current course

## Implementation Design

### A. Course Selection Service
```typescript
// src/services/CourseSelectionService.ts
export class CourseSelectionService {
    private currentCourseId: string | undefined;
    private workspaceRoot: string;
    
    async selectCourse(): Promise<void> {
        // Fetch available courses
        const courses = await apiService.getStudentCourses();
        
        // Show quick pick
        const selected = await vscode.window.showQuickPick(
            courses.map(c => ({
                label: c.title,
                description: c.path,
                detail: `${c.organization_name} / ${c.course_family_title}`,
                course: c
            })),
            {
                placeHolder: 'Select a course to work on',
                title: 'Course Selection'
            }
        );
        
        if (selected) {
            await this.switchToCourse(selected.course);
        }
    }
    
    async switchToCourse(course: CourseStudent): Promise<void> {
        this.currentCourseId = course.id;
        
        // Update workspace folders
        const courseWorkspace = path.join(this.workspaceRoot, 'courses', course.id);
        
        // Ensure directory exists
        await fs.mkdir(courseWorkspace, { recursive: true });
        
        // Update VSCode workspace
        vscode.workspace.updateWorkspaceFolders(
            0,
            vscode.workspace.workspaceFolders?.length || 0,
            { uri: vscode.Uri.file(courseWorkspace), name: course.title }
        );
        
        // Save selection
        await globalState.update('selectedCourseId', course.id);
        
        // Update status bar
        statusBarService.updateCourse(course.title);
        
        // Refresh tree views
        studentTreeProvider.setCourse(course.id);
    }
    
    getCurrentCourseId(): string | undefined {
        return this.currentCourseId;
    }
}
```

### B. Student Tree Provider (Course Content Focus)
```typescript
// src/ui/tree/student/StudentCourseContentTreeProvider.ts
export class StudentCourseContentTreeProvider implements vscode.TreeDataProvider<TreeItem> {
    private courseId: string | undefined;
    private _onDidChangeTreeData = new vscode.EventEmitter<TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    setCourse(courseId: string): void {
        this.courseId = courseId;
        this.refresh();
    }
    
    async getChildren(element?: TreeItem): Promise<TreeItem[]> {
        if (!this.courseId) {
            return [new MessageItem('Please select a course first')];
        }
        
        if (!element) {
            // Root level - show course content tree structure
            return this.getCourseContentTree();
        }
        
        // Handle different element types
        if (element instanceof CourseContentPathItem) {
            return this.getPathChildren(element);
        }
        
        return [];
    }
    
    private async getCourseContentTree(): Promise<TreeItem[]> {
        // Fetch submission groups for this course
        const submissionGroups = await apiService.getStudentSubmissionGroups({
            course_id: this.courseId
        });
        
        // Build tree structure from course content paths
        const tree = this.buildPathTree(submissionGroups);
        return this.createTreeItems(tree);
    }
    
    private buildPathTree(submissionGroups: SubmissionGroupStudent[]): PathNode {
        const root: PathNode = { children: new Map() };
        
        for (const sg of submissionGroups) {
            const pathParts = sg.course_content_path.split('.');
            let current = root;
            
            for (let i = 0; i < pathParts.length; i++) {
                const part = pathParts[i];
                
                if (!current.children.has(part)) {
                    current.children.set(part, {
                        name: part,
                        children: new Map(),
                        submissionGroup: i === pathParts.length - 1 ? sg : undefined
                    });
                }
                
                current = current.children.get(part)!;
            }
        }
        
        return root;
    }
    
    private createTreeItems(node: PathNode, level: number = 0): TreeItem[] {
        const items: TreeItem[] = [];
        
        for (const [name, child] of node.children) {
            if (child.submissionGroup) {
                // Leaf node - actual course content with submission group
                items.push(new CourseContentItem(child.submissionGroup));
            } else {
                // Branch node - path segment
                items.push(new CourseContentPathItem(name, child));
            }
        }
        
        return items;
    }
}

// Tree item for actual course content
class CourseContentItem extends vscode.TreeItem {
    constructor(public readonly submissionGroup: SubmissionGroupStudent) {
        const label = submissionGroup.course_content_title || 'Untitled';
        const state = vscode.TreeItemCollapsibleState.None;
        
        super(label, state);
        
        // Add repository indicator
        if (submissionGroup.repository) {
            this.iconPath = new vscode.ThemeIcon('git-branch');
            this.contextValue = 'courseContentWithRepo';
            
            // Show clone status
            const isCloned = this.checkIfCloned(submissionGroup);
            if (isCloned) {
                this.description = '✓ Cloned';
            } else {
                this.description = 'Click to clone';
            }
        }
        
        // Add grading indicator
        if (submissionGroup.latest_grading) {
            const grade = Math.round(submissionGroup.latest_grading.grading * 100);
            this.tooltip = `Grade: ${grade}%`;
            this.description = `${this.description || ''} [${grade}%]`.trim();
        }
        
        // Add team indicator
        if (submissionGroup.max_group_size > 1) {
            this.contextValue = `${this.contextValue || 'courseContent'}Team`;
            this.label = `👥 ${this.label}`;
        }
    }
    
    private checkIfCloned(sg: SubmissionGroupStudent): boolean {
        const repoPath = this.getRepositoryPath(sg);
        return fs.existsSync(repoPath);
    }
    
    private getRepositoryPath(sg: SubmissionGroupStudent): string {
        const courseId = sg.course_id;
        const repoName = sg.max_group_size === 1 
            ? `student-${sg.course_content_path.replace(/\./g, '-')}`
            : `team-${sg.course_content_path.replace(/\./g, '-')}`;
        
        return path.join(
            os.homedir(),
            'computor',
            'courses',
            courseId,
            repoName
        );
    }
}

// Tree item for path segments (branches)
class CourseContentPathItem extends vscode.TreeItem {
    constructor(
        public readonly name: string,
        public readonly node: PathNode
    ) {
        super(name, vscode.TreeItemCollapsibleState.Expanded);
        
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'courseContentPath';
    }
}
```

### C. Status Bar Integration
```typescript
// src/ui/StatusBarService.ts
export class StatusBarService {
    private courseItem: vscode.StatusBarItem;
    
    constructor() {
        this.courseItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.courseItem.command = 'computor.student.selectCourse';
        this.courseItem.tooltip = 'Click to switch course';
    }
    
    updateCourse(courseName: string): void {
        this.courseItem.text = `$(book) ${courseName}`;
        this.courseItem.show();
    }
    
    clearCourse(): void {
        this.courseItem.text = '$(book) No course selected';
        this.courseItem.show();
    }
}
```

### D. Commands Integration
```typescript
// src/commands/StudentCommands.ts
export function registerStudentCommands(context: vscode.ExtensionContext) {
    const courseSelection = new CourseSelectionService();
    const workspaceManager = new WorkspaceManager();
    
    // Course selection command
    vscode.commands.registerCommand('computor.student.selectCourse', async () => {
        await courseSelection.selectCourse();
    });
    
    // Clone repository command
    vscode.commands.registerCommand('computor.student.cloneRepository', 
        async (item: CourseContentItem) => {
            const sg = item.submissionGroup;
            
            if (!sg.repository) {
                vscode.window.showWarningMessage('No repository available for this content');
                return;
            }
            
            const courseId = courseSelection.getCurrentCourseId();
            if (!courseId) {
                vscode.window.showErrorMessage('Please select a course first');
                return;
            }
            
            // Clone repository
            await workspaceManager.cloneStudentRepository(courseId, sg);
            
            // Refresh tree
            studentTreeProvider.refresh();
            
            // Open in editor
            const repoPath = workspaceManager.getRepositoryPath(courseId, sg.id);
            if (repoPath) {
                const uri = vscode.Uri.file(repoPath);
                vscode.commands.executeCommand('vscode.openFolder', uri, true);
            }
        }
    );
    
    // Sync all repositories for current course
    vscode.commands.registerCommand('computor.student.syncCourseRepositories', 
        async () => {
            const courseId = courseSelection.getCurrentCourseId();
            if (!courseId) {
                vscode.window.showErrorMessage('Please select a course first');
                return;
            }
            
            const submissionGroups = await apiService.getStudentSubmissionGroups({
                course_id: courseId,
                has_repository: true
            });
            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Syncing repositories',
                cancellable: false
            }, async (progress) => {
                for (let i = 0; i < submissionGroups.length; i++) {
                    const sg = submissionGroups[i];
                    progress.report({
                        increment: (100 / submissionGroups.length),
                        message: `Syncing ${sg.course_content_title}`
                    });
                    
                    await workspaceManager.syncRepository(courseId, sg);
                }
            });
            
            studentTreeProvider.refresh();
        }
    );
}
```

## Benefits of This Approach

1. **Clear Context**: Students work in one course at a time
2. **Organized Workspace**: Each course has its own workspace root
3. **Familiar Tree Structure**: Course content organized by path (like lecturer view)
4. **Repository Management**: Easy to see what's cloned and what's not
5. **Team Support**: Clear indicators for team vs individual work
6. **Grade Visibility**: See grades directly in the tree
7. **Quick Switching**: Can switch courses via status bar

## Alternative: Multi-Course View

If you want to show all courses in the tree:
- Root level: Organizations
- Level 2: Course Families  
- Level 3: Courses
- Level 4+: Course content tree

But this has disadvantages:
- Workspace root becomes unclear
- Repository paths become complex
- Harder to focus on one course
- More clicking to get to content

## Recommendation

Use the **Course Selection approach** because:
1. Students typically work on one course at a time
2. Cleaner workspace organization
3. Better focus and less clutter
4. Repositories are course-scoped
5. Can still switch courses easily via status bar

## Migration Path

1. On first login after update:
   - Prompt user to select a course
   - Migrate any existing repositories to new structure

2. Remember last selected course:
   - Store in global state
   - Auto-select on next session

3. Quick course switch:
   - Status bar shows current course
   - Click to switch to different course