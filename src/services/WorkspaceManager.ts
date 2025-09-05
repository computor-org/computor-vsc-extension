import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
// import { exec } from 'child_process'; // Now used in GitWorktreeManager
// import { promisify } from 'util'; // Now used in GitWorktreeManager
import { GitLabTokenManager } from './GitLabTokenManager';
import { GitWorktreeManager } from './GitWorktreeManager';
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
  private gitLabTokenManager: GitLabTokenManager;
  private gitWorktreeManager: GitWorktreeManager;

  private constructor(context: vscode.ExtensionContext) {
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.gitWorktreeManager = GitWorktreeManager.getInstance();
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

  // Student workspace methods using Git worktrees
  async cloneStudentRepository(
    courseId: string,
    submissionGroup: SubmissionGroupStudentList,
    directory?: string
  ): Promise<string> {
    console.log('[WorkspaceManager] cloneStudentRepository called with:');
    console.log('[WorkspaceManager] courseId:', courseId);
    console.log('[WorkspaceManager] directory:', directory);
    console.log('[WorkspaceManager] submissionGroup.course_content_path:', submissionGroup.course_content_path);
    
    if (!this.config) {
      await this.initializeWorkspace();
    }

    if (!submissionGroup.repository?.clone_url) {
      throw new Error('No repository URL available for this submission group');
    }

    // Use the provided directory if available, otherwise fall back to course_content_path for the assignment identifier
    const assignmentPath = submissionGroup.course_content_path;
    if (!assignmentPath) {
      throw new Error('No assignment path available for this submission group');
    }
    
    // Get the example identifier for sparse-checkout
    const exampleIdentifier = submissionGroup.example_identifier;
    
    // Get GitLab token for authentication
    const cloneUrl = submissionGroup.repository.clone_url;
    console.log('Clone URL:', cloneUrl);
    console.log('Assignment path:', assignmentPath);
    console.log('Example identifier:', exampleIdentifier || 'not provided');
    
    let gitlabInstanceUrl: string;
    try {
      const url = new URL(cloneUrl);
      gitlabInstanceUrl = url.origin;
    } catch (error) {
      console.error('Failed to parse clone URL:', error);
      gitlabInstanceUrl = submissionGroup.repository.url || '';
    }
    
    const token = await this.gitLabTokenManager.ensureTokenForUrl(gitlabInstanceUrl);
    
    if (!token) {
      throw new Error(`GitLab authentication required for ${gitlabInstanceUrl}`);
    }
    
    // Build authenticated URL
    const authenticatedUrl = this.gitLabTokenManager.buildAuthenticatedCloneUrl(cloneUrl, token);
    
    // If we have a directory, use it directly, otherwise use worktree approach
    const worktreePath = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Setting up assignment: ${submissionGroup.course_content_title || assignmentPath}`,
      cancellable: false
    }, async (progress) => {
      try {
        progress.report({ increment: 30, message: 'Preparing workspace...' });
        
        // If directory is provided and exists, we might already have the repo cloned
        if (directory && fs.existsSync(directory)) {
          progress.report({ increment: 70, message: 'Repository already exists!' });
          return directory;
        }
        
        // Otherwise, ensure assignment worktree exists
        console.log('[WorkspaceManager] About to call ensureAssignmentWorktree with:');
        console.log('[WorkspaceManager] - workspaceRoot:', this.workspaceRoot);
        console.log('[WorkspaceManager] - courseId:', courseId);
        console.log('[WorkspaceManager] - assignmentPath:', assignmentPath);
        
        if (!this.workspaceRoot) {
          throw new Error('Workspace root is not initialized');
        }
        if (!courseId) {
          throw new Error('Course ID is undefined');
        }
        if (!assignmentPath) {
          throw new Error('Assignment path is undefined');
        }
        
        const resultPath = await this.gitWorktreeManager.ensureAssignmentWorktree(
          this.workspaceRoot,
          courseId,
          assignmentPath,
          cloneUrl,
          authenticatedUrl,
          exampleIdentifier || undefined
        );
        
        progress.report({ increment: 70, message: 'Workspace ready!' });
        
        return resultPath;
      } catch (error: any) {
        console.error('Worktree setup error:', error);
        
        // Check if it's an authentication error
        const errorStr = error.message || '';
        if (errorStr.includes('Authentication failed') || 
            errorStr.includes('could not read Username') ||
            errorStr.includes('fatal: Authentication') ||
            errorStr.includes('remote: HTTP Basic: Access denied')) {
          // Clear the cached token so user will be prompted again
          await this.gitLabTokenManager.removeToken(gitlabInstanceUrl);
          throw new Error('Authentication failed. Please check your GitLab Personal Access Token.');
        }
        throw error;
      }
    });
    
    // Update workspace configuration
    await this.updateStudentRepositoryConfig(courseId, submissionGroup, worktreePath);
    
    return worktreePath;
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

  private async updateStudentRepositoryConfig(
    courseId: string,
    submissionGroup: SubmissionGroupStudentList,
    localPath: string
  ): Promise<void> {
    if (!this.config) return;

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
        course.studentRepositories[submissionGroup.id!] = {
          localPath,
          remoteUrl: submissionGroup.repository?.clone_url || '',
          type: submissionGroup.max_group_size === 1 ? 'individual' : 'team'
        };
      }
    }

    await this.saveWorkspaceConfig();
  }

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