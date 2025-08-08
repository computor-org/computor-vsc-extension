import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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

  private constructor(context: vscode.ExtensionContext) {
    // Store context for potential future use
    void context;
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
    submissionGroup: any
  ): Promise<string> {
    if (!this.config) {
      await this.initializeWorkspace();
    }

    // Generate repository folder name based on type and content
    const repoName = this.generateRepositoryName(submissionGroup);
    
    const repoPath = path.join(
      this.workspaceRoot,
      'courses',
      courseId,
      repoName
    );
    
    // Create directory
    await fs.promises.mkdir(path.dirname(repoPath), { recursive: true });
    
    // Clone repository (simplified - would need actual git implementation)
    // For now, create directory structure
    await fs.promises.mkdir(repoPath, { recursive: true });
    
    // Update workspace configuration
    await this.updateStudentRepositoryConfig(courseId, submissionGroup, repoPath);
    
    return repoPath;
  }

  private generateRepositoryName(submissionGroup: any): string {
    if (submissionGroup.max_group_size === 1) {
      return `student-${submissionGroup.course_content_path.replace(/\./g, '-')}`;
    } else {
      return `team-${submissionGroup.course_content_path.replace(/\./g, '-')}`;
    }
  }

  private async updateStudentRepositoryConfig(
    courseId: string,
    submissionGroup: any,
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
      this.config.courses[courseId].studentRepositories[submissionGroup.id] = {
      localPath,
      remoteUrl: submissionGroup.repository?.clone_url || '',
      type: submissionGroup.max_group_size === 1 ? 'individual' : 'team'
      };
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
        this.config.courses[courseId].title = courseTitle;
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
      this.config.courses[courseId].tutorRepository = {
      localPath: repoPath,
      remoteUrl,
      readOnly: true
      };
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
      this.config.courses[courseId].examples[exampleId] = {
      localPath: examplePath,
      title: exampleTitle,
      identifier: exampleIdentifier
      };
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