import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ComputorApiService } from './ComputorApiService';
import { StatusBarService } from '../ui/StatusBarService';

export interface CourseInfo {
    id: string;
    title: string;
    path: string;
    organizationId: string;
    courseFamilyId: string;
}

export class CourseSelectionService {
    private static instance: CourseSelectionService;
    private currentCourseId: string | undefined;
    private currentCourseInfo: CourseInfo | undefined;
    private workspaceRoot: string;
    private context: vscode.ExtensionContext;
    private apiService: ComputorApiService;
    private statusBarService: StatusBarService;

    private constructor(
        context: vscode.ExtensionContext,
        apiService: ComputorApiService,
        statusBarService: StatusBarService
    ) {
        this.context = context;
        this.apiService = apiService;
        this.statusBarService = statusBarService;
        this.workspaceRoot = path.join(os.homedir(), 'computor');
        
        // Load last selected course
        this.loadLastSelectedCourse();
    }

    static initialize(
        context: vscode.ExtensionContext,
        apiService: ComputorApiService,
        statusBarService: StatusBarService
    ): CourseSelectionService {
        if (!CourseSelectionService.instance) {
            CourseSelectionService.instance = new CourseSelectionService(
                context,
                apiService,
                statusBarService
            );
        }
        return CourseSelectionService.instance;
    }

    static getInstance(): CourseSelectionService {
        if (!CourseSelectionService.instance) {
            throw new Error('CourseSelectionService not initialized');
        }
        return CourseSelectionService.instance;
    }

    private async loadLastSelectedCourse(): Promise<void> {
        const savedCourseId = this.context.globalState.get<string>('selectedCourseId');
        const savedCourseInfo = this.context.globalState.get<CourseInfo>('selectedCourseInfo');
        
        if (savedCourseId && savedCourseInfo) {
            this.currentCourseId = savedCourseId;
            this.currentCourseInfo = savedCourseInfo;
            this.statusBarService.updateCourse(savedCourseInfo.title);
            // Set context to make course content view visible
            vscode.commands.executeCommand('setContext', 'computor.courseSelected', true);
        } else {
            this.statusBarService.clearCourse();
            vscode.commands.executeCommand('setContext', 'computor.courseSelected', false);
        }
    }

    async selectCourse(): Promise<CourseInfo | undefined> {
        try {
            // Fetch available courses for student
            const courses = await this.apiService.getStudentCourses();
            
            if (!courses || courses.length === 0) {
                vscode.window.showInformationMessage('No courses available');
                return undefined;
            }

            // Prepare quick pick items
            const quickPickItems = courses.map(course => ({
                label: course.title,
                description: course.path,
                detail: `Organization: ${course.organization_id}`,
                courseInfo: {
                    id: course.id,
                    title: course.title,
                    path: course.path,
                    organizationId: course.organization_id,
                    courseFamilyId: course.course_family_id
                } as CourseInfo
            }));

            // Show quick pick
            const selected = await vscode.window.showQuickPick(quickPickItems, {
                placeHolder: 'Select a course to work on',
                title: 'Course Selection',
                ignoreFocusOut: true
            });

            if (selected) {
                await this.switchToCourse(selected.courseInfo);
                return selected.courseInfo;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to fetch courses: ${error}`);
        }

        return undefined;
    }

    async switchToCourse(course: CourseInfo): Promise<void> {
        this.currentCourseId = course.id;
        this.currentCourseInfo = course;

        // Update workspace folder
        const courseWorkspace = path.join(this.workspaceRoot, 'courses', course.id);
        
        // Ensure directory exists
        try {
            await fs.mkdir(courseWorkspace, { recursive: true });
        } catch (error) {
            // Directory might already exist, that's fine
        }

        // Update VSCode workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const existingIndex = workspaceFolders.findIndex(
            folder => folder.uri.fsPath === courseWorkspace
        );

        if (existingIndex === -1) {
            // Add new workspace folder
            vscode.workspace.updateWorkspaceFolders(
                workspaceFolders.length,
                0,
                { 
                    uri: vscode.Uri.file(courseWorkspace), 
                    name: `📚 ${course.title}` 
                }
            );
        }

        // Save selection to global state
        await this.context.globalState.update('selectedCourseId', course.id);
        await this.context.globalState.update('selectedCourseInfo', course);

        // Update status bar
        this.statusBarService.updateCourse(course.title);

        // Set context to make course content view visible
        vscode.commands.executeCommand('setContext', 'computor.courseSelected', true);

        // Fire event for other components
        vscode.commands.executeCommand('computor.courseChanged', course);

        vscode.window.showInformationMessage(`Switched to course: ${course.title}`);
    }

    getCurrentCourseId(): string | undefined {
        return this.currentCourseId;
    }

    getCurrentCourseInfo(): CourseInfo | undefined {
        return this.currentCourseInfo;
    }

    getCourseWorkspacePath(): string | undefined {
        if (!this.currentCourseId) {
            return undefined;
        }
        return path.join(this.workspaceRoot, 'courses', this.currentCourseId);
    }

    async ensureCourseSelected(): Promise<CourseInfo | undefined> {
        if (this.currentCourseInfo) {
            return this.currentCourseInfo;
        }

        const result = await vscode.window.showInformationMessage(
            'No course selected. Would you like to select one now?',
            'Select Course',
            'Cancel'
        );

        if (result === 'Select Course') {
            return await this.selectCourse();
        }

        return undefined;
    }

    async clearSelection(): Promise<void> {
        this.currentCourseId = undefined;
        this.currentCourseInfo = undefined;
        
        await this.context.globalState.update('selectedCourseId', undefined);
        await this.context.globalState.update('selectedCourseInfo', undefined);
        
        this.statusBarService.clearCourse();
        vscode.commands.executeCommand('setContext', 'computor.courseSelected', false);
    }
}