import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execAsync } from '../utils/exec';
import { GitLabTokenManager } from './GitLabTokenManager';
import { ComputorApiService } from './ComputorApiService';

export class LecturerRepositoryManager {
  private workspaceRoot: string;
  private gitLabTokenManager: GitLabTokenManager;
  private api: ComputorApiService;

  constructor(context: vscode.ExtensionContext, api: ComputorApiService) {
    this.api = api;
    this.gitLabTokenManager = GitLabTokenManager.getInstance(context);
    const ws = vscode.workspace.workspaceFolders;
    this.workspaceRoot = ws && ws[0] ? ws[0].uri.fsPath : path.join(os.homedir(), '.computor', 'lecturer-workspace');
  }

  async syncAllAssignments(onProgress?: (message: string) => void): Promise<void> {
    const report = onProgress || (() => {});
    await fs.promises.mkdir(this.workspaceRoot, { recursive: true });
    try {
      const client = await (this.api as any).getHttpClient?.();
      const resp: any = client ? await client.get('/lecturers/courses') : { data: [] };
      const courses: any[] = (resp && resp.data) || [];
      if (courses.length === 0) { report('No lecturer courses to sync'); return; }

      for (const c of courses) {
        const courseId = c.id || c.course_id || c.courseId;
        if (!courseId) continue;
        try {
          await this.syncAssignmentsForCourse(courseId, report);
        } catch (e) {
          console.warn(`[LecturerRepo] Failed to sync assignments for course ${courseId}:`, e);
        }
      }
    } catch (e) {
      console.warn('[LecturerRepo] Could not fetch lecturer courses:', e);
    }
  }

  async syncAssignmentsForCourse(courseId: string, onProgress?: (message: string) => void): Promise<void> {
    const report = onProgress || (() => {});
    const course: any = await this.api.getCourse(courseId);
    if (!course) { report(`Course ${courseId} not found`); return; }
    // Ensure we have organization to derive provider URL when assignments_url is absent
    if (!course.organization) {
      try {
        if (course.organization_id) {
          const org = await (this.api as any).getOrganization(course.organization_id);
          if (org) course.organization = org;
        }
      } catch {}
    }
    const info = this.getAssignmentsRepoInfo(course);
    if (!info) { report(`No GitLab info for ${course.title || course.path}`); return; }

    const { repoUrl, repoDir } = info;
    await fs.promises.mkdir(this.workspaceRoot, { recursive: true });
    const target = path.join(this.workspaceRoot, repoDir);
    const exists = await this.directoryExists(target);

    const token = await this.gitLabTokenManager.ensureTokenForUrl(new URL(repoUrl).origin);
    const authUrl = this.addTokenToUrl(repoUrl, token);

    if (!exists) {
      report(`Cloning ${repoDir}...`);
      await execAsync(`git clone "${authUrl}" "${target}"`, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    } else {
      report(`Pulling ${repoDir}...`);
      await execAsync('git pull --ff-only', { cwd: target, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    }
  }

  private getAssignmentsRepoInfo(course: any): { repoUrl: string; repoDir: string } | null {
    const props = (course.properties || {}) as any;
    const gitlab = props.gitlab || {};
    let repoUrl: string | undefined = gitlab.assignments_url as string | undefined;
    if (!repoUrl) {
      const orgUrl = (((course.organization || {}).properties || {}).gitlab || {}).url as string | undefined;
      const fullPath = gitlab.full_path as string | undefined;
      if (orgUrl && fullPath) repoUrl = `${orgUrl}/${fullPath}/assignments.git`;
    }
    if (!repoUrl) return null;
    // Use last path segment of course.full_path if available to name folder uniquely
    const lastSeg = (gitlab.full_path && String(gitlab.full_path).split('/').pop()) || (course.path) || 'course';
    const repoDir = `${lastSeg}-assignments`;
    return { repoUrl, repoDir };
  }

  public getAssignmentFolderPath(course: any, deploymentPath: string): string | null {
    const info = this.getAssignmentsRepoInfo(course);
    if (!info) return null;
    return path.join(this.workspaceRoot, info.repoDir, deploymentPath || '');
  }

  private async directoryExists(dir: string): Promise<boolean> {
    try { return (await fs.promises.stat(dir)).isDirectory(); } catch { return false; }
  }

  private addTokenToUrl(url: string, token?: string): string {
    try {
      const u = new URL(url);
      if (!token) return url;
      u.username = 'oauth2';
      u.password = token;
      return u.toString();
    } catch {
      return url;
    }
  }
}
