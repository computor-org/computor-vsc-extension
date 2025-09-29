import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface WorkspaceDirectories {
  root: string;
  student: string;
  review: string;
  reference: string;
}

export class WorkspaceStructureManager {
  private static instance: WorkspaceStructureManager;
  private workspaceRoot: string;

  private constructor() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder is open');
    }
    this.workspaceRoot = workspaceFolders[0].uri.fsPath;
  }

  static getInstance(): WorkspaceStructureManager {
    if (!WorkspaceStructureManager.instance) {
      WorkspaceStructureManager.instance = new WorkspaceStructureManager();
    }
    return WorkspaceStructureManager.instance;
  }

  /**
   * Get all workspace directories
   */
  getDirectories(): WorkspaceDirectories {
    return {
      root: this.workspaceRoot,
      student: path.join(this.workspaceRoot, 'student'),
      review: path.join(this.workspaceRoot, 'review'),
      reference: path.join(this.workspaceRoot, 'reference')
    };
  }

  /**
   * Ensure workspace directories exist
   */
  async ensureDirectories(): Promise<void> {
    const dirs = this.getDirectories();
    await fs.promises.mkdir(dirs.student, { recursive: true });
    await fs.promises.mkdir(dirs.review, { recursive: true });
    await fs.promises.mkdir(dirs.reference, { recursive: true });
  }

  /**
   * Get student repository path using submission group UUID
   */
  getStudentRepositoryPath(submissionGroupId: string): string {
    const dirs = this.getDirectories();
    return path.join(dirs.student, submissionGroupId);
  }

  /**
   * Get tutor review repository path using submission group UUID
   */
  getReviewRepositoryPath(submissionGroupId: string): string {
    const dirs = this.getDirectories();
    return path.join(dirs.review, submissionGroupId);
  }

  /**
   * Get lecturer reference repository path using course UUID
   */
  getReferenceRepositoryPath(courseId: string): string {
    const dirs = this.getDirectories();
    return path.join(dirs.reference, courseId);
  }

  /**
   * Read backend URL from .computor marker file
   */
  async getBackendUrl(): Promise<string | undefined> {
    try {
      const markerPath = path.join(this.workspaceRoot, '.computor');
      if (!fs.existsSync(markerPath)) {
        return undefined;
      }
      const content = await fs.promises.readFile(markerPath, 'utf8');
      const data = JSON.parse(content);
      return data.backendUrl;
    } catch {
      return undefined;
    }
  }

  /**
   * Write backend URL to .computor marker file
   */
  async setBackendUrl(backendUrl: string): Promise<void> {
    const markerPath = path.join(this.workspaceRoot, '.computor');
    await fs.promises.writeFile(
      markerPath,
      JSON.stringify({ backendUrl }, null, 2),
      'utf8'
    );
  }

  /**
   * Check if a repository exists
   */
  async repositoryExists(repoPath: string): Promise<boolean> {
    try {
      const gitDir = path.join(repoPath, '.git');
      const stats = await fs.promises.stat(gitDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get all existing student repositories
   */
  async getExistingStudentRepositories(): Promise<string[]> {
    const dirs = this.getDirectories();
    try {
      const entries = await fs.promises.readdir(dirs.student, { withFileTypes: true });
      const repos: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const repoPath = path.join(dirs.student, entry.name);
          if (await this.repositoryExists(repoPath)) {
            repos.push(entry.name); // Return the submission group ID
          }
        }
      }
      return repos;
    } catch {
      return [];
    }
  }

  /**
   * Get all existing review repositories
   */
  async getExistingReviewRepositories(): Promise<string[]> {
    const dirs = this.getDirectories();
    try {
      const entries = await fs.promises.readdir(dirs.review, { withFileTypes: true });
      const repos: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const repoPath = path.join(dirs.review, entry.name);
          if (await this.repositoryExists(repoPath)) {
            repos.push(entry.name); // Return the submission group ID
          }
        }
      }
      return repos;
    } catch {
      return [];
    }
  }

  /**
   * Get all existing reference repositories
   */
  async getExistingReferenceRepositories(): Promise<string[]> {
    const dirs = this.getDirectories();
    try {
      const entries = await fs.promises.readdir(dirs.reference, { withFileTypes: true });
      const repos: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const repoPath = path.join(dirs.reference, entry.name);
          if (await this.repositoryExists(repoPath)) {
            repos.push(entry.name); // Return the course ID
          }
        }
      }
      return repos;
    } catch {
      return [];
    }
  }
}