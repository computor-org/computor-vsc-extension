import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
// import { exec } from 'child_process'; // Now used in GitWorktreeManager
// import { promisify } from 'util'; // Now used in GitWorktreeManager
// import { GitLabTokenManager } from './GitLabTokenManager';
import { SubmissionGroupStudentList } from '../types/generated';

interface WorkspaceConfig {
  workspaceRoot: string;
  courses: {
    [courseId: string]: {
      title: string;
      studentRepositories: {
        [repoId: string]: {
          localPath: string;
          remoteUrl: string;
          type: 'individual' | 'team';
          readOnly?: boolean;
        }
      };
      tutorRepository?: {
        localPath: string;
        remoteUrl: string;
        readOnly: boolean;
      };
      examples: {
        [exampleId: string]: {
          localPath: string;
          title: string;
          identifier: string;
        }
      };
    }
  };
  lastUpdated: string;
}

export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private workspaceRoot: string;
  private configPath: string;
  private config: WorkspaceConfig | null = null;
  // private gitLabTokenManager: GitLabTokenManager;
  // Worktrees deprecated; keep class for tutor APIs only

  private constructor(context: vscode.ExtensionContext) {
    // this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    // Initialize workspace in user's home directory under .computor
    this.workspaceRoot = path.join(os.homedir(), '.computor', 'workspace');
    this.configPath = path.join(this.workspaceRoot, '.computor', 'workspace.json');
  }

  static getInstance(context: vscode.ExtensionContext): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager(context);
    }
    return WorkspaceManager.instance;
  }

  async initializeWorkspace(): Promise<void> {
    // Create directory structure
    await this.createDirectoryStructure();
    
    // Load or create workspace configuration
    await this.loadWorkspaceConfig();
  }

  private async createDirectoryStructure(): Promise<void> {
    const directories = [
      this.workspaceRoot,
      path.join(this.workspaceRoot, 'workbench'),
      path.join(this.workspaceRoot, 'courses'),
      path.join(this.workspaceRoot, '.computor')
    ];

    for (const dir of directories) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  private async loadWorkspaceConfig(): Promise<void> {
    try {
      const configContent = await fs.promises.readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent);
    } catch (error) {
      // Config doesn't exist, create default
      this.config = {
        workspaceRoot: this.workspaceRoot,
        courses: {},
        lastUpdated: new Date().toISOString()
      };
      await this.saveWorkspaceConfig();
    }
  }

  private async saveWorkspaceConfig(): Promise<void> {
    if (!this.config) return;
    
    this.config.lastUpdated = new Date().toISOString();
    await fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
  }

  async getWorkspaceRoot(): Promise<string> {
    if (!this.config) {
      await this.initializeWorkspace();
    }
    return this.workspaceRoot;
  }

  // Student workspace methods (legacy; worktrees deprecated)
  async cloneStudentRepository(
    courseId: string,
    submissionGroup: SubmissionGroupStudentList,
    directory?: string
  ): Promise<string> {
    throw new Error('cloneStudentRepository is deprecated. Use StudentRepositoryManager instead.');
  }
  
  // No longer needed with worktree approach
  /*
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
  
  private async pullRepository(repoPath: string): Promise<void> {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Updating repository: ${path.basename(repoPath)}`,
      cancellable: false
    }, async (progress) => {
      const terminal = vscode.window.createTerminal({
        name: `Pull: ${path.basename(repoPath)}`,
        cwd: repoPath,
        hideFromUser: true
      });
      
      terminal.sendText('git pull');
      
      // Wait for pull to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      terminal.dispose();
      
      progress.report({ increment: 100, message: 'Repository updated successfully' });
    });
  }

  private generateRepositoryName(submissionGroup: SubmissionGroupStudent): string {
    const pathSlug = submissionGroup.course_content_path?.replace(/\./g, '-') || submissionGroup.id;
    if (submissionGroup.max_group_size === 1) {
      return `student-${pathSlug}`;
    } else {
      return `team-${pathSlug}`;
    }
  }
  */

  // (Deprecated) updateStudentRepositoryConfig removed with worktree deprecation

  async getStudentRepositoryPath(courseId: string, submissionGroupId: string): Promise<string | undefined> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    return this.config?.courses[courseId]?.studentRepositories[submissionGroupId]?.localPath;
  }

  // Tutor workspace methods
  async initializeTutorWorkspace(courseId: string, courseTitle: string): Promise<void> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    const tutorWorkspacePath = await this.getTutorWorkspacePath(courseId);
    
    // Create tutor directory structure
    const directories = [
      tutorWorkspacePath,
      path.join(tutorWorkspacePath, 'examples'),
      path.join(tutorWorkspacePath, 'solutions'),
      path.join(tutorWorkspacePath, 'repository')
    ];

    for (const dir of directories) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    // Update config
    if (!this.config!.courses[courseId]) {
      this.config!.courses[courseId] = {
        title: courseTitle,
        studentRepositories: {},
        examples: {}
      };
    } else {
      if (this.config) {
        const course = this.config.courses[courseId];
        if (course) {
          course.title = courseTitle;
        }
      }
    }

    await this.saveWorkspaceConfig();
  }

  async getTutorWorkspacePath(courseId: string): Promise<string> {
    return path.join(this.workspaceRoot, 'courses', courseId, 'tutor');
  }

  async getTutorRepositoryPath(courseId: string): Promise<string> {
    const tutorWorkspace = await this.getTutorWorkspacePath(courseId);
    return path.join(tutorWorkspace, 'repository');
  }

  async getTutorStudentWorkspacePath(courseId: string, courseMemberId: string): Promise<string> {
    const tutorWorkspace = await this.getTutorWorkspacePath(courseId);
    return path.join(tutorWorkspace, 'students', courseMemberId);
  }

  async ensureTutorStudentWorkspace(courseId: string, courseMemberId: string): Promise<string> {
    const studentPath = await this.getTutorStudentWorkspacePath(courseId, courseMemberId);
    await fs.promises.mkdir(studentPath, { recursive: true });
    return studentPath;
  }

  async registerTutorStudentRepository(courseId: string, courseMemberId: string, remoteUrl: string): Promise<string> {
    if (!this.config) { await this.initializeWorkspace(); }
    const studentPath = await this.ensureTutorStudentWorkspace(courseId, courseMemberId);
    const cfg = this.config as WorkspaceConfig;
    if (!cfg.courses[courseId]) {
      (cfg.courses as any)[courseId] = { title: '', studentRepositories: {}, examples: {} };
    }
    (cfg.courses as any)[courseId].studentRepositories[courseMemberId] = {
        localPath: studentPath,
        remoteUrl,
        type: 'individual',
      } as any;
    await this.saveWorkspaceConfig();
    return studentPath;
  }

  async cloneTutorRepository(
    courseId: string,
    providerUrl: string,
    fullPath: string
  ): Promise<void> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    const repoPath = await this.getTutorRepositoryPath(courseId);
    const remoteUrl = `${providerUrl}/${fullPath}`;

    // Create directory
    await fs.promises.mkdir(repoPath, { recursive: true });

    // Update config
    if (!this.config!.courses[courseId]) {
      this.config!.courses[courseId] = {
        title: '',
        studentRepositories: {},
        examples: {}
      };
    }

    if (this.config) {
      const course = this.config.courses[courseId];
      if (course) {
        course.tutorRepository = {
          localPath: repoPath,
          remoteUrl,
          readOnly: true
        };
      }
    }

    await this.saveWorkspaceConfig();
  }

  async addExampleToWorkspace(
    courseId: string,
    exampleId: string,
    exampleTitle: string,
    exampleIdentifier: string,
    exampleDirectory: string
  ): Promise<string> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    const tutorWorkspace = await this.getTutorWorkspacePath(courseId);
    const examplePath = path.join(tutorWorkspace, 'examples', exampleDirectory);

    // Update config
    if (!this.config!.courses[courseId]) {
      this.config!.courses[courseId] = {
        title: '',
        studentRepositories: {},
        examples: {}
      };
    }

    if (this.config) {
      const course = this.config.courses[courseId];
      if (course) {
        course.examples[exampleId] = {
          localPath: examplePath,
          title: exampleTitle,
          identifier: exampleIdentifier
        };
      }
    }

    await this.saveWorkspaceConfig();
    return examplePath;
  }

  async getExamplePath(courseId: string, exampleId: string): Promise<string | undefined> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    return this.config?.courses[courseId]?.examples[exampleId]?.localPath;
  }

  async getWorkspaceConfig(): Promise<WorkspaceConfig | null> {
    if (!this.config) {
      await this.initializeWorkspace();
    }
    return this.config;
  }

  async getCourseWorkspaces(): Promise<Array<{courseId: string, title: string, hasExamples: boolean, hasRepositories: boolean}>> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    if (!this.config) return [];

    return Object.entries(this.config.courses).map(([courseId, courseConfig]) => ({
      courseId,
      title: courseConfig.title,
      hasExamples: Object.keys(courseConfig.examples).length > 0,
      hasRepositories: Object.keys(courseConfig.studentRepositories).length > 0 || !!courseConfig.tutorRepository
    }));
  }

  async cleanupCourse(courseId: string): Promise<void> {
    if (!this.config) return;

    const coursePath = path.join(this.workspaceRoot, 'courses', courseId);
    
    try {
      // Remove directory
      await fs.promises.rm(coursePath, { recursive: true, force: true });
      
      // Remove from config
      delete this.config.courses[courseId];
      await this.saveWorkspaceConfig();
      
    } catch (error) {
      console.error(`Failed to cleanup course ${courseId}:`, error);
    }
  }

  async exportWorkspaceState(): Promise<string> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    if (!this.config) {
      throw new Error('Failed to initialize workspace configuration');
    }

    return JSON.stringify(this.config, null, 2);
  }

  async importWorkspaceState(configJson: string): Promise<void> {
    try {
      this.config = JSON.parse(configJson);
      await this.saveWorkspaceConfig();
    } catch (error) {
      throw new Error(`Invalid workspace configuration: ${error}`);
    }
  }
}
