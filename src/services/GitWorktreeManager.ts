// import * as vscode from 'vscode'; // Reserved for future use
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitWorktreeManager {
  private static instance: GitWorktreeManager;

  private constructor() {}

  static getInstance(): GitWorktreeManager {
    if (!GitWorktreeManager.instance) {
      GitWorktreeManager.instance = new GitWorktreeManager();
    }
    return GitWorktreeManager.instance;
  }

  /**
   * Get the path for the shared repository (.git-repo)
   */
  getSharedRepoPath(workspaceRoot: string, courseId: string): string {
    if (!workspaceRoot) {
      throw new Error('Workspace root is undefined');
    }
    if (!courseId) {
      throw new Error('Course ID is undefined');
    }
    return path.join(workspaceRoot, 'courses', courseId, '.git-repo');
  }

  /**
   * Get the path for an assignment worktree
   */
  getWorktreePath(workspaceRoot: string, courseId: string, assignmentPath: string): string {
    console.log('[GitWorktreeManager] getWorktreePath called with:', { workspaceRoot, courseId, assignmentPath });
    
    if (!assignmentPath) {
      throw new Error('Assignment path is required for worktree path');
    }
    
    // Convert assignment path (e.g., "1.basics") to folder name (e.g., "1-basics")
    const folderName = assignmentPath.replace(/\./g, '-');
    return path.join(workspaceRoot, 'courses', courseId, `assignment-${folderName}`);
  }

  /**
   * Check if the shared repository exists
   */
  async sharedRepoExists(workspaceRoot: string, courseId: string): Promise<boolean> {
    const repoPath = this.getSharedRepoPath(workspaceRoot, courseId);
    try {
      const stats = await fs.promises.stat(repoPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Clone repository for sharing between worktrees
   * Using regular clone for the main repository since worktrees need a working tree
   */
  async cloneSharedRepository(
    workspaceRoot: string,
    courseId: string,
    cloneUrl: string,
    authenticatedUrl: string
  ): Promise<void> {
    const repoPath = this.getSharedRepoPath(workspaceRoot, courseId);
    const parentDir = path.dirname(repoPath);

    // Create parent directory
    await fs.promises.mkdir(parentDir, { recursive: true });

    // Clone normally - we need a working tree for the main repository
    // The worktrees will handle sparse-checkout individually
    const cloneCommand = `git clone "${authenticatedUrl}" "${path.basename(repoPath)}"`;
    const options = {
      cwd: parentDir,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_ASKPASS: '/bin/echo',
      }
    };

    console.log(`Cloning shared repository to ${repoPath}`);
    
    try {
      const { stderr } = await execAsync(cloneCommand, options);
      if (stderr && !stderr.includes('Cloning into')) {
        console.warn('Git clone warning:', stderr);
      }
      console.log('Shared repository cloned successfully');
    } catch (error: any) {
      console.error('Failed to clone shared repository:', error);
      throw new Error(`Failed to clone shared repository: ${error.message}`);
    }

    // Configure the repository to fetch all branches
    await this.configureSharedRepository(repoPath);
  }

  /**
   * Configure shared repository for worktree usage
   */
  private async configureSharedRepository(repoPath: string): Promise<void> {
    try {
      // Set fetch to get all branches
      await execAsync(
        'git config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"',
        { cwd: repoPath }
      );
      
      // Fetch all branches
      await execAsync('git fetch origin', { 
        cwd: repoPath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        }
      });
    } catch (error: any) {
      console.error('Failed to configure bare repository:', error);
    }
  }

  /**
   * Create or switch to assignment worktree
   */
  async ensureAssignmentWorktree(
    workspaceRoot: string,
    courseId: string,
    assignmentPath: string,
    cloneUrl: string,
    authenticatedUrl: string,
    exampleIdentifier?: string
  ): Promise<string> {
    console.log('[GitWorktreeManager] ensureAssignmentWorktree called with:', {
      workspaceRoot,
      courseId,
      assignmentPath,
      cloneUrl: cloneUrl?.substring(0, 50) + '...',
      exampleIdentifier
    });
    
    if (!assignmentPath) {
      throw new Error('Assignment path is required for creating worktree');
    }
    
    // Ensure shared repository exists
    if (!await this.sharedRepoExists(workspaceRoot, courseId)) {
      await this.cloneSharedRepository(workspaceRoot, courseId, cloneUrl, authenticatedUrl);
    }

    const sharedRepoPath = this.getSharedRepoPath(workspaceRoot, courseId);
    const worktreePath = this.getWorktreePath(workspaceRoot, courseId, assignmentPath);
    const branchName = `assignment/${assignmentPath.replace(/\./g, '-')}`;

    // Check if worktree already exists
    if (await this.worktreeExists(sharedRepoPath, worktreePath)) {
      console.log(`Worktree already exists at ${worktreePath}`);
      return worktreePath;
    }

    // Create the worktree with sparse-checkout if we have the example identifier
    await this.createWorktree(sharedRepoPath, worktreePath, branchName, exampleIdentifier);
    
    // Return the worktree path
    return worktreePath;
  }

  /**
   * Check if a worktree exists
   */
  private async worktreeExists(sharedRepoPath: string, worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: sharedRepoPath });
      return stdout.includes(worktreePath);
    } catch {
      return false;
    }
  }

  /**
   * Create a new worktree for an assignment with sparse-checkout
   */
  private async createWorktree(
    sharedRepoPath: string,
    worktreePath: string,
    branchName: string,
    assignmentPath?: string
  ): Promise<void> {
    try {
      // Check if branch exists remotely
      const { stdout: remoteBranches } = await execAsync(
        'git branch -r',
        { cwd: sharedRepoPath }
      );
      
      const remoteBranchExists = remoteBranches.includes(`origin/${branchName}`);
      
      let command: string;
      if (remoteBranchExists) {
        // Checkout existing remote branch
        command = `git worktree add "${worktreePath}" -b "${branchName}" "origin/${branchName}"`;
      } else {
        // Create new branch from main/master
        const { stdout: branches } = await execAsync('git branch -r', { cwd: sharedRepoPath });
        const baseBranch = branches.includes('origin/main') ? 'origin/main' : 'origin/master';
        command = `git worktree add "${worktreePath}" -b "${branchName}" "${baseBranch}"`;
      }

      console.log(`Creating worktree: ${command}`);
      const { stderr } = await execAsync(command, { cwd: sharedRepoPath });
      
      if (stderr && !stderr.includes('Preparing worktree')) {
        console.warn('Git worktree warning:', stderr);
      }
      
      console.log(`Worktree created at ${worktreePath}`);
      
      // Configure sparse-checkout to only include assignment directory if we have the identifier
      if (assignmentPath) {
        await this.configureSparseCheckout(worktreePath, assignmentPath);
      } else {
        console.log('No example identifier provided - full repository checked out');
      }
    } catch (error: any) {
      console.error('Failed to create worktree:', error);
      throw new Error(`Failed to create worktree: ${error.message}`);
    }
  }

  /**
   * Configure sparse-checkout for a worktree to only include specific assignment files
   */
  private async configureSparseCheckout(
    worktreePath: string,
    exampleIdentifier: string
  ): Promise<void> {
    try {
      console.log(`Configuring sparse-checkout for ${exampleIdentifier} in ${worktreePath}`);
      
      // Check if the worktree has a proper working tree
      try {
        await execAsync('git status', { cwd: worktreePath });
      } catch (statusError) {
        console.error('Worktree does not have a valid working tree, skipping sparse-checkout');
        return;
      }
      
      // Enable sparse-checkout
      await execAsync('git sparse-checkout init --cone', { cwd: worktreePath });
      
      // The example identifier is the actual directory name in the repository
      const patterns: string[] = [];
      
      // Always include essential root files
      patterns.push('README.md');
      patterns.push('.gitignore');
      patterns.push('requirements.txt');
      patterns.push('package.json');
      patterns.push('pyproject.toml');
      
      // Include the specific assignment directory (using example.identifier)
      patterns.push(exampleIdentifier);
      
      // Set sparse-checkout patterns
      const sparseCheckoutCommand = `git sparse-checkout set ${patterns.map(p => `"${p}"`).join(' ')}`;
      console.log(`Setting sparse-checkout patterns: ${sparseCheckoutCommand}`);
      
      await execAsync(sparseCheckoutCommand, { cwd: worktreePath });
      
      // Reapply checkout to update working directory
      await execAsync('git checkout', { cwd: worktreePath });
      
      console.log(`Sparse-checkout configured for ${exampleIdentifier}`);
    } catch (error: any) {
      console.error('Failed to configure sparse-checkout:', error);
      // If sparse-checkout fails, continue with full checkout
      console.warn('Continuing with full repository checkout');
    }
  }

  /**
   * Remove a worktree
   */
  async removeWorktree(
    sharedRepoPath: string,
    worktreePath: string
  ): Promise<void> {
    try {
      await execAsync(`git worktree remove "${worktreePath}" --force`, { cwd: sharedRepoPath });
      console.log(`Worktree removed: ${worktreePath}`);
    } catch (error: any) {
      console.error('Failed to remove worktree:', error);
      // Try to clean up manually if git command fails
      try {
        await fs.promises.rmdir(worktreePath, { recursive: true });
      } catch {}
    }
  }

  /**
   * List all worktrees for a course
   */
  async listWorktrees(workspaceRoot: string, courseId: string): Promise<Array<{path: string, branch: string}>> {
    const sharedRepoPath = this.getSharedRepoPath(workspaceRoot, courseId);
    
    if (!await this.sharedRepoExists(workspaceRoot, courseId)) {
      return [];
    }

    try {
      const { stdout } = await execAsync('git worktree list --porcelain', { cwd: sharedRepoPath });
      const worktrees: Array<{path: string, branch: string}> = [];
      
      const lines = stdout.split('\n');
      let currentWorktree: any = {};
      
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          currentWorktree.path = line.substring(9);
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line.substring(7);
          worktrees.push({ ...currentWorktree });
          currentWorktree = {};
        }
      }
      
      return worktrees;
    } catch (error: any) {
      console.error('Failed to list worktrees:', error);
      return [];
    }
  }

  /**
   * Pull updates for a specific worktree
   */
  async pullWorktree(worktreePath: string): Promise<void> {
    try {
      await execAsync('git pull', { 
        cwd: worktreePath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        }
      });
      console.log(`Pulled updates for worktree: ${worktreePath}`);
    } catch (error: any) {
      console.error('Failed to pull worktree:', error);
      throw new Error(`Failed to pull updates: ${error.message}`);
    }
  }

  /**
   * Push changes from a worktree
   */
  async pushWorktree(worktreePath: string, token: string): Promise<void> {
    try {
      // Set remote URL with token for this push
      const { stdout: remoteUrl } = await execAsync('git remote get-url origin', { cwd: worktreePath });
      const authenticatedUrl = remoteUrl.trim().replace('https://', `https://oauth2:${token}@`);
      
      await execAsync(`git push "${authenticatedUrl}"`, {
        cwd: worktreePath,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
        }
      });
      
      console.log(`Pushed changes from worktree: ${worktreePath}`);
    } catch (error: any) {
      console.error('Failed to push worktree:', error);
      throw new Error(`Failed to push changes: ${error.message}`);
    }
  }

  // Helper method - may be used in future
  /* private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  } */
}