import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GitLabTokenManager } from './GitLabTokenManager';
import { SubmissionGroupStudent } from '../types/generated';

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

  private constructor(context: vscode.ExtensionContext) {
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
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

  // Student workspace methods
  async cloneStudentRepository(
    courseId: string,
    submissionGroup: SubmissionGroupStudent
  ): Promise<string> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    if (!submissionGroup.repository?.clone_url) {
      throw new Error('No repository URL available for this submission group');
    }

    // Generate repository folder name based on type and content
    const repoName = this.generateRepositoryName(submissionGroup);
    
    const repoPath = path.join(
      this.workspaceRoot,
      'courses',
      courseId,
      repoName
    );
    
    // Check if repository already exists
    if (await this.directoryExists(repoPath)) {
      // Repository already exists, perform git pull instead
      await this.pullRepository(repoPath);
      return repoPath;
    }
    
    // Create parent directory
    await fs.promises.mkdir(path.dirname(repoPath), { recursive: true });
    
    // Get GitLab token for authentication
    // Extract the GitLab instance URL from the clone URL
    const cloneUrl = submissionGroup.repository.clone_url;
    let gitlabInstanceUrl: string;
    try {
      const url = new URL(cloneUrl);
      gitlabInstanceUrl = url.origin; // e.g., "http://172.17.0.1:8084"
    } catch {
      // Fallback to the base URL if provided
      gitlabInstanceUrl = submissionGroup.repository.url || '';
    }
    
    const token = await this.gitLabTokenManager.ensureTokenForUrl(gitlabInstanceUrl);
    
    if (!token) {
      throw new Error(`GitLab authentication required for ${gitlabInstanceUrl}`);
    }
    
    // Clone repository with authentication
    const authenticatedUrl = this.gitLabTokenManager.buildAuthenticatedCloneUrl(cloneUrl, token);
    
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Cloning repository: ${repoName}`,
      cancellable: false
    }, async (progress) => {
      try {
        const execAsync = promisify(exec);
        
        progress.report({ increment: 30, message: 'Authenticating...' });
        
        // Execute git clone command
        const cloneCommand = `git clone "${authenticatedUrl}" "${repoName}"`;
        const options = {
          cwd: path.dirname(repoPath),
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0', // Disable Git password prompts
            GIT_ASKPASS: '/bin/echo', // Provide empty password if asked
          }
        };
        
        progress.report({ increment: 30, message: 'Cloning repository...' });
        
        try {
          const { stderr } = await execAsync(cloneCommand, options);
          if (stderr && !stderr.includes('Cloning into')) {
            console.warn('Git clone warning:', stderr);
          }
        } catch (error: any) {
          // Check if it's an authentication error
          if (error.message.includes('Authentication failed') || 
              error.message.includes('could not read Username')) {
            throw new Error('Authentication failed. Please check your GitLab Personal Access Token.');
          }
          throw error;
        }
        
        progress.report({ increment: 40, message: 'Repository cloned successfully' });
      } catch (error: any) {
        throw new Error(`Failed to clone repository: ${error.message}`);
      }
    });
    
    // Update workspace configuration
    await this.updateStudentRepositoryConfig(courseId, submissionGroup, repoPath);
    
    return repoPath;
  }
  
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

  private async updateStudentRepositoryConfig(
    courseId: string,
    submissionGroup: SubmissionGroupStudent,
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
        course.studentRepositories[submissionGroup.id] = {
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