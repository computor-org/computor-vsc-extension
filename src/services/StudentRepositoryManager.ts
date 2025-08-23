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
  assignmentPath: string;  // Path in course structure (e.g., "assignment1")
  assignmentTitle: string;
  directory?: string;       // Directory path inside the git repository for sparse-checkout
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
          console.log(`[StudentRepositoryManager] Repository info for ${content.title}:`, {
            cloneUrl: repo.clone_url,
            assignmentPath: content.path,
            directory: content.directory,
            exampleIdentifier: content.submission_group?.example_identifier
          });
          repoMap.set(key, {
            cloneUrl: repo.clone_url,
            assignmentPath: content.path,
            assignmentTitle: content.title || content.path,
            directory: content.directory || content.submission_group?.example_identifier
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
    
    // Get course information to find upstream repository
    let upstreamUrl: string | undefined;
    try {
      const course = await this.apiService.getStudentCourse(courseId);
      console.log('[StudentRepositoryManager] Course data:', JSON.stringify(course, null, 2));
      if (course?.repository) {
        // Construct upstream URL from provider_url and full_path
        // The upstream is always the student-template repository in the course namespace
        const providerUrl = course.repository.provider_url.replace(/\/$/, ''); // Remove trailing slash if present
        const fullPath = course.repository.full_path.replace(/^\//, ''); // Remove leading slash if present
        upstreamUrl = `${providerUrl}/${fullPath}/student-template.git`;
        console.log(`[StudentRepositoryManager] Upstream repository: ${upstreamUrl}`);
      } else {
        console.log('[StudentRepositoryManager] No repository field in course data');
      }
    } catch (error) {
      console.warn('[StudentRepositoryManager] Could not get course information for upstream:', error);
    }
    
    // Check if shared repository exists (use the same path as GitWorktreeManager)
    const sharedRepoPath = this.gitWorktreeManager.getSharedRepoPath(this.workspaceRoot, courseId);
    const sharedRepoExists = await this.directoryExists(sharedRepoPath);
    
    // Clone or update shared repository
    if (!sharedRepoExists) {
      console.log(`[StudentRepositoryManager] Cloning shared repository for course ${courseId}`);
      // Handle both http and https URLs
      const authenticatedUrl = this.addTokenToUrl(firstRepo.cloneUrl, token);
      console.log(`[StudentRepositoryManager] Using authenticated URL for clone`);
      
      try {
        await this.gitWorktreeManager.cloneSharedRepository(
          this.workspaceRoot,
          courseId,
          firstRepo.cloneUrl,
          authenticatedUrl
        );
      } catch (error: any) {
        console.error('[StudentRepositoryManager] Clone failed:', error);
        
        // If authentication failed, clear token and prompt for new one
        if (this.isAuthenticationError(error)) {
          console.log('[StudentRepositoryManager] Authentication failed, prompting for new token');
          await this.gitLabTokenManager.removeToken(gitlabUrl);
          
          // Prompt for new token
          const newToken = await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
          if (newToken) {
            // Retry with new token
            const newAuthUrl = this.addTokenToUrl(firstRepo.cloneUrl, newToken);
            await this.gitWorktreeManager.cloneSharedRepository(
              this.workspaceRoot,
              courseId,
              firstRepo.cloneUrl,
              newAuthUrl
            );
          } else {
            throw new Error('GitLab authentication required');
          }
        } else {
          throw error;
        }
      }
    } else {
      console.log(`[StudentRepositoryManager] Updating shared repository for course ${courseId}`);
      await this.updateRepository(sharedRepoPath);
    }
    
    // Sync fork with upstream if available
    if (upstreamUrl) {
      console.log('[StudentRepositoryManager] Checking if fork needs update from upstream');
      const updated = await this.syncForkWithUpstream(sharedRepoPath, upstreamUrl, token);
      
      if (updated) {
        // If fork was updated, we need to update all worktrees
        console.log('[StudentRepositoryManager] Fork was updated, updating worktrees');
        // The worktrees will be updated when we process them below
      }
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
      const authenticatedUrl = this.addTokenToUrl(repo.cloneUrl, token);
      
      await this.gitWorktreeManager.ensureAssignmentWorktree(
        this.workspaceRoot,
        courseId,
        repo.assignmentPath,
        repo.cloneUrl,
        authenticatedUrl,
        repo.directory  // Use directory field for sparse-checkout path
      );
    } else {
      console.log(`[StudentRepositoryManager] Worktree exists for ${repo.assignmentTitle}, updating`);
      await this.updateRepository(worktreePath);
    }
    
    // Update the directory field in memory (not persisted to API)
    // This allows the tree view to find the files
    const content = courseContents.find(c => c.path === repo.assignmentPath);
    if (content) {
      // If we have a subdirectory specified, append it to the worktree path
      let finalPath = worktreePath;
      if (repo.directory) {
        finalPath = path.join(worktreePath, repo.directory);
      }
      // Set the absolute path to the assignment directory
      content.directory = finalPath;
      console.log(`[StudentRepositoryManager] Set directory for ${repo.assignmentTitle} to ${finalPath}`);
    }
  }

  /**
   * Sync fork with upstream repository
   */
  private async syncForkWithUpstream(
    repoPath: string,
    upstreamUrl: string,
    token?: string
  ): Promise<boolean> {
    try {
      // Add upstream remote if it doesn't exist
      const { stdout: remotes } = await execAsync('git remote', { cwd: repoPath });
      
      const authenticatedUpstreamUrl = token ? this.addTokenToUrl(upstreamUrl, token) : upstreamUrl;
      console.log('[StudentRepositoryManager] Authenticated upstream URL:', authenticatedUpstreamUrl);
      
      if (!remotes.includes('upstream')) {
        console.log('[StudentRepositoryManager] Adding upstream remote');
        await execAsync(`git remote add upstream "${authenticatedUpstreamUrl}"`, { cwd: repoPath });
      } else {
        // Update upstream URL in case it changed
        console.log('[StudentRepositoryManager] Updating upstream remote URL');
        await execAsync(`git remote set-url upstream "${authenticatedUpstreamUrl}"`, { cwd: repoPath });
      }
      
      // Fetch from upstream
      console.log('[StudentRepositoryManager] Fetching from upstream');
      await execAsync('git fetch upstream', {
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0'
        }
      });
      
      // Check if there are differences
      let diffCount = '0';
      try {
        // Try main branch first
        const result = await execAsync('git rev-list --count HEAD..upstream/main', { cwd: repoPath });
        diffCount = result.stdout;
        console.log('[StudentRepositoryManager] Checking against upstream/main, commits behind:', diffCount.trim());
      } catch {
        // If main doesn't exist, try master
        try {
          const result = await execAsync('git rev-list --count HEAD..upstream/master', { cwd: repoPath });
          diffCount = result.stdout;
          console.log('[StudentRepositoryManager] Checking against upstream/master, commits behind:', diffCount.trim());
        } catch (error) {
          console.error('[StudentRepositoryManager] Failed to check differences with upstream:', error);
          return false;
        }
      }
      
      const needsUpdate = parseInt(diffCount.trim()) > 0;
      console.log('[StudentRepositoryManager] Fork needs update:', needsUpdate);
      
      if (needsUpdate) {
        console.log('[StudentRepositoryManager] Fork needs update from upstream');
        
        // Ask user for permission
        const choice = await vscode.window.showInformationMessage(
          'Your repository fork is behind the upstream template. Would you like to update it?',
          'Yes, Update',
          'Skip'
        );
        
        if (choice === 'Yes, Update') {
          // Merge upstream changes
          console.log('[StudentRepositoryManager] Merging upstream changes');
          const currentBranch = await this.getCurrentBranch(repoPath);
          
          if (currentBranch !== 'DETACHED') {
            try {
              // Try fast-forward merge first
              console.log('[StudentRepositoryManager] Attempting fast-forward merge with upstream/main');
              await execAsync('git merge upstream/main --ff-only', { cwd: repoPath });
              console.log('[StudentRepositoryManager] Successfully merged upstream/main');
            } catch (mainError) {
              console.log('[StudentRepositoryManager] upstream/main merge failed, trying upstream/master');
              try {
                await execAsync('git merge upstream/master --ff-only', { cwd: repoPath });
                console.log('[StudentRepositoryManager] Successfully merged upstream/master');
              } catch (mergeError) {
                console.log('[StudentRepositoryManager] Fast-forward merge failed:', mergeError);
                // If fast-forward fails, we need a regular merge
                const mergeChoice = await vscode.window.showWarningMessage(
                  'Cannot fast-forward merge. This will create a merge commit. Continue?',
                  'Yes, Merge',
                  'Cancel'
                );
                
                if (mergeChoice === 'Yes, Merge') {
                  try {
                    await execAsync('git merge upstream/main', { cwd: repoPath });
                  } catch {
                    await execAsync('git merge upstream/master', { cwd: repoPath });
                  }
                  
                  // Push the merge to origin
                  await execAsync('git push origin', { 
                    cwd: repoPath,
                    env: {
                      ...process.env,
                      GIT_TERMINAL_PROMPT: '0'
                    }
                  });
                }
              }
            }
          }
          return true;
        }
      } else {
        console.log('[StudentRepositoryManager] Fork is up to date with upstream');
      }
      
      return false;
    } catch (error) {
      console.error('[StudentRepositoryManager] Failed to sync fork:', error);
      return false;
    }
  }
  
  /**
   * Get current branch name
   */
  private async getCurrentBranch(repoPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync('git symbolic-ref --short HEAD', { cwd: repoPath });
      return stdout.trim();
    } catch {
      return 'DETACHED';
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

  /**
   * Add authentication token to Git URL
   */
  private addTokenToUrl(url: string, token: string): string {
    // Handle both http and https URLs
    if (url.startsWith('https://')) {
      return url.replace('https://', `https://oauth2:${token}@`);
    } else if (url.startsWith('http://')) {
      return url.replace('http://', `http://oauth2:${token}@`);
    }
    return url;
  }

  /**
   * Check if error is an authentication error
   */
  private isAuthenticationError(error: any): boolean {
    const message = error?.message || error?.toString() || '';
    return message.includes('Authentication failed') ||
           message.includes('Access denied') ||
           message.includes('HTTP Basic') ||
           message.includes('401') ||
           message.includes('403');
  }
}