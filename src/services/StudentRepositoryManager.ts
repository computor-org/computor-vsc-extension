import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { ComputorApiService } from './ComputorApiService';
import { GitLabTokenManager } from './GitLabTokenManager';
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
  private apiService: ComputorApiService;

  constructor(
    context: vscode.ExtensionContext,
    apiService: ComputorApiService
  ) {
    this.apiService = apiService;
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
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
          // Use example_identifier as the subdirectory within the repo
          // Do NOT use content.directory here as it might already be a full path
          const subdirectory = content.submission_group?.example_identifier;
          console.log(`[StudentRepositoryManager] Subdirectory for ${content.title}: "${subdirectory}"`);
          
          repoMap.set(key, {
            cloneUrl: repo.clone_url,
            assignmentPath: content.path,
            assignmentTitle: content.title || content.path,
            directory: subdirectory  // This should be just the subdirectory, not a full path
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
    
    // Group repositories by unique clone URL
    const uniqueRepos = new Map<string, RepositoryInfo[]>();
    for (const repo of repositories) {
      if (!uniqueRepos.has(repo.cloneUrl)) {
        uniqueRepos.set(repo.cloneUrl, []);
      }
      uniqueRepos.get(repo.cloneUrl)!.push(repo);
    }
    
    console.log(`[StudentRepositoryManager] Found ${uniqueRepos.size} unique repositories for course ${courseId}`);
    
    // Clone/update each unique repository only once
    for (const [cloneUrl, repoInfos] of uniqueRepos) {
      await this.setupUniqueRepository(courseId, cloneUrl, repoInfos, token, courseContents, upstreamUrl);
    }
    
    // Also check for any existing repositories that might not have their directory field set
    // This handles the case where repositories were cloned in a previous session
    this.updateExistingRepositoryPaths(courseId, courseContents);
  }

  /**
   * Set up or update a unique repository and link assignments to it
   */
  private async setupUniqueRepository(
    courseId: string,
    cloneUrl: string,
    repoInfos: RepositoryInfo[],
    token: string,
    courseContents: any[],
    upstreamUrl?: string
  ): Promise<void> {
    // Create a unique directory name for this repository based on the URL
    // Extract repository name from clone URL
    const urlParts = cloneUrl.replace(/\.git$/, '').split('/');
    // Use just the last part of the URL as the repo name (e.g., "admin" from "students/admin")
    const repoName = urlParts[urlParts.length - 1] || 'repository';
    const repoPath = path.join(this.workspaceRoot, 'courses', courseId, repoName);
    
    const repoExists = await this.directoryExists(repoPath);
    
    if (!repoExists) {
      console.log(`[StudentRepositoryManager] Cloning repository ${cloneUrl}`);
      const authenticatedUrl = this.addTokenToUrl(cloneUrl, token);
      
      try {
        // Simple clone
        await execAsync(`git clone "${authenticatedUrl}" "${repoPath}"`, {
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0'
          }
        });
        console.log(`[StudentRepositoryManager] Successfully cloned to ${repoPath}`);
      } catch (error: any) {
        console.error('[StudentRepositoryManager] Clone failed:', error);
        
        // If authentication failed, clear token and prompt for new one
        if (this.isAuthenticationError(error)) {
          console.log('[StudentRepositoryManager] Authentication failed, prompting for new token');
          const gitlabUrl = new URL(cloneUrl).origin;
          await this.gitLabTokenManager.removeToken(gitlabUrl);
          
          // Prompt for new token
          const newToken = await this.gitLabTokenManager.ensureTokenForUrl(gitlabUrl);
          if (newToken) {
            // Retry with new token
            const newAuthUrl = this.addTokenToUrl(cloneUrl, newToken);
            await execAsync(`git clone "${newAuthUrl}" "${repoPath}"`, {
              env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: '0'
              }
            });
          } else {
            throw new Error('GitLab authentication required');
          }
        } else {
          throw error;
        }
      }
    } else {
      console.log(`[StudentRepositoryManager] Repository exists at ${repoPath}, updating`);
      await this.updateRepository(repoPath);
    }
    
    // Sync fork with upstream if available
    if (upstreamUrl) {
      console.log('[StudentRepositoryManager] Checking if fork needs update from upstream');
      const updated = await this.syncForkWithUpstream(repoPath, upstreamUrl, token);
      
      if (updated) {
        console.log('[StudentRepositoryManager] Fork was updated');
        // Push the update to origin
        try {
          await execAsync('git push origin', {
            cwd: repoPath,
            env: {
              ...process.env,
              GIT_TERMINAL_PROMPT: '0'
            }
          });
          console.log('[StudentRepositoryManager] Pushed fork update to origin');
        } catch (error) {
          console.error('[StudentRepositoryManager] Failed to push fork update:', error);
        }
      }
    }
    
    // Now update the directory field for each assignment in this repository
    for (const repo of repoInfos) {
      const content = courseContents.find(c => c.path === repo.assignmentPath);
      if (content) {
        // If we have a subdirectory specified, append it to the repo path
        let finalPath = repoPath;
        if (repo.directory) {
          finalPath = path.join(repoPath, repo.directory);
        }
        
        console.log(`[StudentRepositoryManager] Setting directory for ${repo.assignmentTitle}:`, {
          repoPath,
          subdirectory: repo.directory,
          finalPath,
          exists: fs.existsSync(finalPath)
        });
        
        // Set the absolute path to the assignment directory
        content.directory = finalPath;
        console.log(`[StudentRepositoryManager] Set directory for ${repo.assignmentTitle} to ${finalPath}`);
      }
    }
  }

  /**
   * Update directory paths for existing repositories
   */
  public updateExistingRepositoryPaths(courseId: string, courseContents: any[]): void {
    const coursePath = path.join(this.workspaceRoot, 'courses', courseId);
    
    // Check if course directory exists
    if (!fs.existsSync(coursePath)) {
      return;
    }
    
    // List all directories in the course folder
    try {
      const dirs = fs.readdirSync(coursePath).filter(file => {
        const filePath = path.join(coursePath, file);
        return fs.statSync(filePath).isDirectory() && fs.existsSync(path.join(filePath, '.git'));
      });
      
      console.log(`[StudentRepositoryManager] Found existing repositories: ${dirs.join(', ')}`);
      
      // For each content item, check if its directory exists
      for (const content of courseContents) {
        // Skip if directory is already set and exists
        if (content.directory && fs.existsSync(content.directory)) {
          continue;
        }
        
        // Try to find the repository for this content
        const isAssignment = content.course_content_type?.course_content_kind_id === 'assignment' || 
                            content.example_id;
        
        if (isAssignment && content.submission_group?.repository) {
          // Look for a matching repository directory
          for (const dir of dirs) {
            const repoPath = path.join(coursePath, dir);
            
            // Check if this content's subdirectory exists within this repository
            // Use only example_identifier as the subdirectory, not content.directory which might be a full path
            if (content.submission_group?.example_identifier) {
              const subdirectory = content.submission_group.example_identifier;
              const fullPath = path.join(repoPath, subdirectory);
              
              if (fs.existsSync(fullPath)) {
                content.directory = fullPath;
                console.log(`[StudentRepositoryManager] Found existing directory for ${content.title}: ${fullPath}`);
                break;
              }
            } else {
              // No subdirectory specified, use the repository root
              content.directory = repoPath;
              console.log(`[StudentRepositoryManager] Set directory for ${content.title} to repository root: ${repoPath}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('[StudentRepositoryManager] Error updating existing repository paths:', error);
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