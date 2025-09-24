import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { LecturerRepositoryManager } from './LecturerRepositoryManager';
import { ComputorApiService } from './ComputorApiService';
import type { ExampleRepositoryList } from '../types/generated/examples';

interface StoredTarget {
  courseId: string;
  repoRoot: string;
  courseTitle?: string;
}

interface CandidateTarget {
  course: any;
  repoRoot: string;
}

interface ResolveOptions {
  promptIfMissing?: boolean;
}

export class LecturerExampleWorkspaceResolver {
  private static readonly STORAGE_KEY = 'computor.lecturer.exampleRepoTargets';

  private repositoryManager: LecturerRepositoryManager;
  private storedTargets: Map<string, StoredTarget>;
  private cachedCourses: any[] | undefined;
  private fullCourseCache: Map<string, any> = new Map();
  private workspaceRoot: string | undefined;

  constructor(private context: vscode.ExtensionContext, private apiService: ComputorApiService) {
    this.repositoryManager = new LecturerRepositoryManager(context, apiService);
    const initial = context.workspaceState.get<Record<string, StoredTarget>>(LecturerExampleWorkspaceResolver.STORAGE_KEY, {});
    this.storedTargets = new Map<string, StoredTarget>(Object.entries(initial));
    this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  /**
   * Return the stored assignments repo root if known and available.
   */
  getStoredRepoRoot(repository: ExampleRepositoryList): string | undefined {
    return this.getStoredTarget(repository.id)?.repoRoot;
  }

  /**
   * Ensure we have a stored target when there is exactly one available candidate (no prompts).
   */
  async ensureDefaultTarget(repository: ExampleRepositoryList): Promise<StoredTarget | undefined> {
    const stored = this.getStoredTarget(repository.id);
    if (stored) {
      return stored;
    }

    return this.autoAssignUniqueCandidate(repository);
  }

  /**
   * Resolve the assignments repository for the given example repository, prompting if needed.
   */
  async resolveTarget(repository: ExampleRepositoryList, options: ResolveOptions = {}): Promise<StoredTarget | undefined> {
    const { promptIfMissing = true } = options;

    const stored = this.getStoredTarget(repository.id);
    if (stored) {
      return stored;
    }

    const auto = await this.autoAssignUniqueCandidate(repository);
    if (auto) {
      return auto;
    }

    if (!promptIfMissing) {
      return undefined;
    }

    const candidates = await this.findCandidates(repository);
    const available = candidates.filter(candidate => this.isRepoRootAvailable(candidate.repoRoot));

    if (available.length === 0) {
      vscode.window.showErrorMessage('No assignments repository found locally. Run “Computor: Sync Assignments” and try again.');
      return undefined;
    }

    let chosen: CandidateTarget | undefined;

    if (available.length === 1) {
      chosen = available[0];
    } else {
      const picks = available.map(candidate => ({
        label: candidate.course.title || candidate.course.path || candidate.course.id,
        description: candidate.course.path,
        detail: candidate.repoRoot,
        target: candidate
      }));

      const selection = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Select the assignments repository that should receive downloaded examples'
      });

      if (!selection) {
        return undefined;
      }

      chosen = selection.target;
    }

    if (!chosen) {
      return undefined;
    }

    const ensured = await this.ensureRepositoryAvailable(chosen);
    if (!ensured) {
      vscode.window.showErrorMessage('Assignments repository is not available locally. Please sync and retry.');
      return undefined;
    }

    const storedTarget: StoredTarget = {
      courseId: chosen.course.id,
      repoRoot: chosen.repoRoot,
      courseTitle: chosen.course.title || chosen.course.path || chosen.course.id
    };

    this.storedTargets.set(repository.id, storedTarget);
    await this.persistTargets();
    return storedTarget;
  }

  async clearStoredTarget(repositoryId: string): Promise<void> {
    if (this.storedTargets.delete(repositoryId)) {
      await this.persistTargets();
    }
  }

  private getStoredTarget(repositoryId: string): StoredTarget | undefined {
    const target = this.storedTargets.get(repositoryId);
    if (!target) {
      return undefined;
    }

    if (!this.isRepoRootAvailable(target.repoRoot)) {
      this.storedTargets.delete(repositoryId);
      void this.persistTargets();
      return undefined;
    }

    return target;
  }

  private async autoAssignUniqueCandidate(repository: ExampleRepositoryList): Promise<StoredTarget | undefined> {
    const candidates = await this.findCandidates(repository);
    const available = candidates.filter(candidate => this.isRepoRootAvailable(candidate.repoRoot));

    if (available.length !== 1) {
      return undefined;
    }

    const candidate = available[0];
    const storedTarget: StoredTarget = {
      courseId: candidate.course.id,
      repoRoot: candidate.repoRoot,
      courseTitle: candidate.course.title || candidate.course.path || candidate.course.id
    };

    this.storedTargets.set(repository.id, storedTarget);
    await this.persistTargets();
    return storedTarget;
  }

  private async ensureRepositoryAvailable(candidate: CandidateTarget): Promise<boolean> {
    if (this.isRepoRootAvailable(candidate.repoRoot)) {
      return true;
    }

    const courseTitle = candidate.course.title || candidate.course.path || candidate.course.id;
    const choice = await vscode.window.showWarningMessage(
      `Assignments repository for "${courseTitle}" is not available locally. Run a sync now?`,
      'Sync Now',
      'Cancel'
    );

    if (choice !== 'Sync Now') {
      return false;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Syncing assignments for ${courseTitle}`,
      cancellable: false
    }, async progress => {
      await this.repositoryManager.syncAssignmentsForCourse(candidate.course.id, message => {
        progress.report({ message });
      });
    });

    return this.isRepoRootAvailable(candidate.repoRoot);
  }

  private isRepoRootAvailable(repoRoot: string): boolean {
    if (!repoRoot) {
      return false;
    }

    if (!fs.existsSync(repoRoot)) {
      return false;
    }

    const gitDir = path.join(repoRoot, '.git');
    return fs.existsSync(gitDir);
  }

  private async findCandidates(repository: ExampleRepositoryList): Promise<CandidateTarget[]> {
    const organizationId = repository.organization_id;
    const candidates: CandidateTarget[] = [];
    const courseFromMarker = await this.getCourseIdFromMarker();

    if (courseFromMarker) {
      const fullCourse = await this.getFullCourse(courseFromMarker);
      if (fullCourse && (!organizationId || this.getOrganizationId(fullCourse) === organizationId)) {
        const repoRoot = this.repositoryManager.getAssignmentsRepoRoot(fullCourse);
        if (repoRoot) {
          candidates.push({ course: fullCourse, repoRoot });
        }
      }
    }

    if (candidates.length > 0) {
      return candidates;
    }

    const courses = await this.loadLecturerCourses();
    const filtered = organizationId
      ? courses.filter(course => this.getOrganizationId(course) === organizationId)
      : courses;

    for (const courseSummary of filtered) {
      const courseId = courseSummary?.id || courseSummary?.course_id || courseSummary?.courseId;
      if (!courseId) {
        continue;
      }

      const fullCourse = await this.getFullCourse(courseId);
      if (!fullCourse) {
        continue;
      }

      const repoRoot = this.repositoryManager.getAssignmentsRepoRoot(fullCourse);
      if (!repoRoot) {
        continue;
      }

      candidates.push({ course: fullCourse, repoRoot });
    }

    return candidates;
  }

  private getOrganizationId(course: any): string | undefined {
    return course?.organization_id || course?.organizationId || course?.organization?.id;
  }

  private async loadLecturerCourses(): Promise<any[]> {
    if (this.cachedCourses) {
      return this.cachedCourses;
    }

    const courses = await this.apiService.getLecturerCourses();
    this.cachedCourses = courses || [];
    return this.cachedCourses;
  }

  private async getCourseIdFromMarker(): Promise<string | undefined> {
    const root = this.workspaceRoot || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
      return undefined;
    }

    const markerPath = path.join(root, '.computor');
    try {
      if (!fs.existsSync(markerPath)) {
        return undefined;
      }
      const raw = await fs.promises.readFile(markerPath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data.courseId === 'string') {
        return data.courseId;
      }
    } catch (error) {
      console.warn('[LecturerExampleWorkspaceResolver] Failed to read course marker:', error);
    }
    return undefined;
  }

  private async getFullCourse(courseId: string): Promise<any | undefined> {
    if (this.fullCourseCache.has(courseId)) {
      return this.fullCourseCache.get(courseId);
    }

    try {
      const course = await this.apiService.getCourse(courseId);
      if (course) {
        this.fullCourseCache.set(courseId, course);
      }
      return course;
    } catch (error) {
      console.warn(`Failed to fetch course ${courseId}:`, error);
      return undefined;
    }
  }

  private async persistTargets(): Promise<void> {
    const data: Record<string, StoredTarget> = {};
    for (const [repoId, target] of this.storedTargets.entries()) {
      data[repoId] = target;
    }
    await this.context.workspaceState.update(LecturerExampleWorkspaceResolver.STORAGE_KEY, data);
  }
}
