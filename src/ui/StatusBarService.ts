import * as vscode from 'vscode';

export class StatusBarService {
    private static instance: StatusBarService;
    private courseItem: vscode.StatusBarItem;
    private syncItem: vscode.StatusBarItem;
    
    private constructor() {
        // Course selection item
        this.courseItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.courseItem.command = 'computor.student.selectCourse';
        this.courseItem.tooltip = 'Click to switch course';
        this.courseItem.show();
        
        // Sync status item
        this.syncItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            99
        );
        this.syncItem.command = 'computor.student.syncCourseRepositories';
        this.syncItem.tooltip = 'Click to sync all repositories';
    }
    
    static getInstance(): StatusBarService {
        if (!StatusBarService.instance) {
            StatusBarService.instance = new StatusBarService();
        }
        return StatusBarService.instance;
    }
    
    updateCourse(courseName: string): void {
        this.courseItem.text = `$(book) ${courseName}`;
        this.courseItem.backgroundColor = undefined;
        this.syncItem.text = '$(sync) Sync';
        this.syncItem.show();
    }
    
    clearCourse(): void {
        this.courseItem.text = '$(book) No course selected';
        this.courseItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.syncItem.hide();
    }
    
    setSyncing(isSyncing: boolean): void {
        if (isSyncing) {
            this.syncItem.text = '$(sync~spin) Syncing...';
        } else {
            this.syncItem.text = '$(sync) Sync';
        }
    }
    
    dispose(): void {
        this.courseItem.dispose();
        this.syncItem.dispose();
    }
}