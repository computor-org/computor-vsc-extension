import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ComputorApiService } from './ComputorApiService';
import { GitLabTokenManager } from './GitLabTokenManager';
import { GitWorktreeManager } from './GitWorktreeManager';
import { execAsync } from '../utils/exec';

interface RepositoryInfo {
  cloneUrl: string;
  assignmentPath: string;
  assignmentTitle: string;
  exampleIdentifier?: string;
  directory?: string;
}

/**
 * Manages student repository cloning and updates
 * Handles automatic cloning when student view is activated
 */
export class StudentRepositoryManager {
  private workspaceRoot: string;
  private gitLabTokenManager: GitLabTokenManager;
  private gitWorktreeManager: GitWorktreeManager;
  private apiService: ComputorApiService;

  constructor(
    context: vscode.ExtensionContext,
    apiService: ComputorApiService
  ) {
    this.apiService = apiService;
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    this.gitWorktreeManager = GitWorktreeManager.getInstance();
    this.workspaceRoot = path.join(os.homedir(), '.computor', 'workspace');
  }

  /**
   * Auto-clone or update all repositories for a student's courses
   */
  async autoSetupRepositories(courseId?: string): Promise<void> {
    console.log('[StudentRepositoryManager] Starting auto-setup of repositories');
    
    try {
      // Ensure workspace directory exists
      await fs.promises.mkdir(this.workspaceRoot, { recursive: true });
      
      // Get course contents
      const courseContents = await this.apiService.getStudentCourseContents(courseId);
      
      if (!courseContents || courseContents.length === 0) {
        console.log('[StudentRepositoryManager] No course contents found');
        return;
      }
      
      // Collect repositories from assignments
      const repositories = this.collectRepositoriesFromContents(courseContents);
      
      if (repositories.length === 0) {
        console.log('[StudentRepositoryManager] No repositories to clone');
        return;
      }
      
      console.log(`[StudentRepositoryManager] Found ${repositories.length} repositories to process`);
      
      // Group by course
      const reposByCourse = new Map<string, RepositoryInfo[]>();
      for (const repo of repositories) {
        // Extract course ID from the assignment data
        const content = courseContents.find(c => c.path === repo.assignmentPath);
        const contentCourseId = content?.submission_group?.course_id || courseId || 'default';
        
        if (!reposByCourse.has(contentCourseId)) {
          reposByCourse.set(contentCourseId, []);
        }
        reposByCourse.get(contentCourseId)!.push(repo);
      }
      
      // Process each course's repositories
      for (const [courseIdForRepo, repos] of reposByCourse) {
        await this.processRepositoriesForCourse(courseIdForRepo, repos, courseContents);
      }
      
      console.log('[StudentRepositoryManager] Repository setup completed');
      
    } catch (error) {
      console.error('[StudentRepositoryManager] Failed to auto-setup repositories:', error);
      // Don't show error to user - this is a background operation
      // They can still manually clone if needed
    }
  }

  /**
   * Collect unique repositories from course contents
   */
  private collectRepositoriesFromContents(courseContents: any[]): RepositoryInfo[] {
    const repoMap = new Map<string, RepositoryInfo>();
    
    for (const content of courseContents) {
      // Check if it's an assignment with a repository
      const isAssignment = content.course_content_type?.course_content_kind_id === 'assignment' || 
                          content.example_id;
      const repo = content.submission_group?.repository;
      
      if (isAssignment && repo?.clone_url) {
        const key = `${repo.clone_url}-${content.path}`;
        if (!repoMap.has(key)) {
          repoMap.set(key, {
            cloneUrl: repo.clone_url,
            assignmentPath: content.path,
            assignmentTitle: content.title || content.path,
            exampleIdentifier: content.submission_group?.example_identifier,
            directory: content.directory
          });
        }
      }
    }
    
    return Array.from(repoMap.values());
  }

  /**
   * Process repositories for a specific course
   */
  private async processRepositoriesForCourse(
    courseId: string, 
    repositories: RepositoryInfo[],
    courseContents: any[]
  ): Promise<void> {
    if (repositories.length === 0) return;
    
    // Get GitLab token
    const firstRepo = repositories[0];
    if (!firstRepo) return;
    
    const gitlabUrl = new URL(firstRepo.cloneUrl).origin;
    const token = await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
    
    if (!token) {
      console.warn('[StudentRepositoryManager] No GitLab token available, skipping clone');
      return;
    }
    
    // Check if shared repository exists
    const sharedRepoPath = path.join(this.workspaceRoot, 'courses', courseId, 'shared-repo');
    const sharedRepoExists = await this.directoryExists(sharedRepoPath);
    
    // Clone or update shared repository
    if (!sharedRepoExists) {
      console.log(`[StudentRepositoryManager] Cloning shared repository for course ${courseId}`);
      const authenticatedUrl = firstRepo.cloneUrl.replace('https://', `https://oauth2:${token}@`);
      await this.gitWorktreeManager.cloneSharedRepository(
        this.workspaceRoot,
        courseId,
        firstRepo.cloneUrl,
        authenticatedUrl
      );
    } else {
      console.log(`[StudentRepositoryManager] Updating shared repository for course ${courseId}`);
      await this.updateRepository(sharedRepoPath);
    }
    
    // Set up worktrees for each assignment
    for (const repo of repositories) {
      await this.setupAssignmentWorktree(courseId, repo, token, courseContents);
    }
  }

  /**
   * Set up or update worktree for an assignment
   */
  private async setupAssignmentWorktree(
    courseId: string,
    repo: RepositoryInfo,
    token: string,
    courseContents: any[]
  ): Promise<void> {
    const worktreePath = this.gitWorktreeManager.getWorktreePath(
      this.workspaceRoot,
      courseId,
      repo.assignmentPath
    );
    
    const worktreeExists = await this.directoryExists(worktreePath);
    
    if (!worktreeExists) {
      console.log(`[StudentRepositoryManager] Creating worktree for ${repo.assignmentTitle}`);
      const authenticatedUrl = repo.cloneUrl.replace('https://', `https://oauth2:${token}@`);
      
      await this.gitWorktreeManager.ensureAssignmentWorktree(
        this.workspaceRoot,
        courseId,
        repo.assignmentPath,
        repo.cloneUrl,
        authenticatedUrl,
        repo.exampleIdentifier
      );
    } else {
      console.log(`[StudentRepositoryManager] Worktree exists for ${repo.assignmentTitle}, updating`);
      await this.updateRepository(worktreePath);
    }
    
    // Update the directory field in memory (not persisted to API)
    // This allows the tree view to find the files
    const content = courseContents.find(c => c.path === repo.assignmentPath);
    if (content) {
      // Set the absolute path to the worktree
      content.directory = worktreePath;
      console.log(`[StudentRepositoryManager] Set directory for ${repo.assignmentTitle} to ${worktreePath}`);
    }
  }

  /**
   * Update an existing repository
   */
  private async updateRepository(repoPath: string): Promise<void> {
    try {
      await execAsync('git fetch --all', {
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0'
        }
      });
      
      // Only pull if we're on a branch (not detached HEAD)
      const { stdout: branch } = await execAsync('git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED"', {
        cwd: repoPath
      });
      
      if (branch.trim() !== 'DETACHED') {
        await execAsync('git pull --ff-only', {
          cwd: repoPath,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0'
          }
        });
      }
    } catch (error) {
      console.warn(`[StudentRepositoryManager] Failed to update repository at ${repoPath}:`, error);
      // Don't throw - continue with other repos
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}