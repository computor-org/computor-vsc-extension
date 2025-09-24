import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { TutorSelectionService } from '../../../services/TutorSelectionService';
import { IconGenerator } from '../../../utils/IconGenerator';
import { CourseContentStudentList, CourseContentKindList, SubmissionGroupStudentList } from '../../../types/generated';
import { deriveTutorRepoDirectoryName, buildTutorStudentRepoRoot } from '../../../utils/repositoryNaming';

export class TutorStudentTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private contentKinds: CourseContentKindList[] = [];

  constructor(private api: ComputorApiService, private selection: TutorSelectionService) {
    selection.onDidChangeSelection(() => this.refresh());
  }

  refresh(): void { this._onDidChangeTreeData.fire(undefined); }

  // Allow targeted refresh of a specific element
  refreshItem(element: vscode.TreeItem): void { this._onDidChangeTreeData.fire(element); }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const courseId = this.selection.getCurrentCourseId();
    const memberId = this.selection.getCurrentMemberId();

    if (!courseId) {
      return [new MessageItem('Select a course to begin', 'info')];
    }
    if (!memberId) {
      return [new MessageItem('Select a member to view content', 'info')];
    }

    // Ensure kinds
    if (this.contentKinds.length === 0) {
      this.contentKinds = await this.api.getCourseContentKinds() || [];
    }

    if (!element) {
      // Root: load course contents for the selected course and member
      const courseContents = await (this.api as any).getTutorCourseContents?.(courseId, memberId) || [];
      if (courseContents.length === 0) return [new MessageItem('No content available', 'info')];
      const tree = this.buildContentTree(courseContents, this.contentKinds);
      return this.createTreeItems(tree, memberId);
    }

    if (element instanceof TutorUnitItem) {
      return this.createTreeItems(element.node, memberId);
    }

    if (element instanceof TutorContentItem) {
      return this.getAssignmentDirectoryChildren(element, courseId, memberId);
    }

    if (element instanceof TutorFsFolderItem) {
      return this.readDirectoryItems(element.absPath, element.courseId, element.memberId, element.repositoryRoot);
    }

    return [];
  }

  // Tree building similar to student provider (simplified)
  private buildContentTree(contents: CourseContentStudentList[], kinds: CourseContentKindList[]): ContentNode {
    const root: ContentNode = { children: new Map(), isUnit: false };
    const kindMap = new Map<string, CourseContentKindList>();
    kinds.forEach(k => kindMap.set(k.id, k));

    // Build a map of nodes; synthesize parent unit nodes if backend doesn't return them
    const nodeMap = new Map<string, ContentNode>();

    for (const c of contents) {
      const parts = c.path.split('.');
      let currentPath = '';
      let parentNode = root;
      for (let i = 0; i < parts.length; i++) {
        const seg = parts[i] ?? '';
        const head = parts[0] ?? '';
        currentPath = i === 0 ? head : `${currentPath}.${seg}`;
        let node = nodeMap.get(currentPath);
        if (!node) {
          node = {
            name: i === parts.length - 1 ? ((c.title ?? seg) as string) : seg,
            children: new Map(),
            isUnit: i !== parts.length - 1,
            unreadMessageCount: 0,
          } as ContentNode;
          nodeMap.set(currentPath, node);
          parentNode.children.set(currentPath, node);
        }
        if (i === parts.length - 1) {
          // Leaf: attach course content and kind info
          const ct: any = (c as any).course_content_type;
          const ck = ct ? kindMap.get(ct.course_content_kind_id) : undefined;
          const groupUnread = c.submission_group?.unread_message_count ?? 0;
          const contentUnread = (c as any).unread_message_count ?? 0;
          node.courseContent = c;
          (node as any).submissionGroup = c.submission_group;
          node.contentKind = ck;
          node.isUnit = ck ? !!ck.has_descendants : false;
          // Ensure the displayed name uses the course content title when available
          node.name = ((c.title as string | undefined) ?? node.name ?? seg) as string;
          node.unreadMessageCount = contentUnread + groupUnread;
        }
        parentNode = node;
      }
    }

    this.aggregateUnreadCounts(root);
    return root;
  }

  private aggregateUnreadCounts(node: ContentNode): number {
    const ownUnread = (node.courseContent?.unread_message_count ?? 0) + ((node as any).submissionGroup?.unread_message_count ?? 0);
    let total = ownUnread;

    node.children.forEach((child) => {
      total += this.aggregateUnreadCounts(child);
    });

    node.unreadMessageCount = total;
    return total;
  }

  private createTreeItems(node: ContentNode, memberId: string): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    const entries = Array.from(node.children.entries()).sort((a, b) => {
      const an = a[1];
      const bn = b[1];
      const ap = an.courseContent?.position;
      const bp = bn.courseContent?.position;
      if (typeof ap === 'number' && typeof bp === 'number') return ap - bp;
      return a[0].localeCompare(b[0]);
    });
    for (const [, child] of entries) {
      if (child.isUnit) {
        items.push(new TutorUnitItem(child));
      } else if (child.courseContent) {
        items.push(new TutorContentItem(child.courseContent, memberId, this.isAssignmentContent(child.courseContent), this.deriveAssignmentDirectory(child.courseContent)));
      }
    }
    return items;
  }

  private isAssignmentContent(content: CourseContentStudentList): boolean {
    const ct: any = (content as any).course_content_type;
    const kindId = ct?.course_content_kind_id;
    if (kindId && typeof kindId === 'string') {
      if (kindId.toLowerCase() === 'assignment') return true;
    }
    const slug = ct?.slug?.toLowerCase?.() || '';
    if (slug.includes('assignment') || slug.includes('exercise') || slug.includes('homework') || slug.includes('task') || slug.includes('lab') || slug.includes('quiz') || slug.includes('exam')) {
      return true;
    }
    const kindTitle = ct?.course_content_kind?.title?.toLowerCase?.() || '';
    if (kindTitle.includes('assignment') || kindTitle.includes('exercise') || kindTitle.includes('homework') || kindTitle.includes('task') || kindTitle.includes('lab') || kindTitle.includes('quiz') || kindTitle.includes('exam')) {
      return true;
    }
    return false;
  }

  private deriveAssignmentDirectory(content: CourseContentStudentList): string | undefined {
    const raw = (content as any)?.directory as string | undefined
      ?? content.submission_group?.example_identifier
      ?? (content.path?.split('.').pop());
    return this.sanitizeAssignmentDirectoryName(raw);
  }

  private sanitizeAssignmentDirectoryName(raw?: string | null): string | undefined {
    if (!raw) return undefined;
    const normalized = path.normalize(raw).replace(/^([\\/]+)/, '');
    if (!normalized || normalized === '.' || normalized === '..') {
      return undefined;
    }
    const segments = normalized.split(/[\\/]+/).filter(seg => seg && seg !== '..');
    return segments.join(path.sep);
  }

  private async getAssignmentDirectoryChildren(element: TutorContentItem, courseId: string, memberId: string): Promise<vscode.TreeItem[]> {
    if (!element.isAssignment) {
      return [];
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      return [new MessageItem('Open a workspace folder to view assignment files.', 'warning')];
    }

    const repoRoot = this.getTutorRepoRoot(workspaceFolder, courseId, memberId, element.content);
    const gitDir = path.join(repoRoot, '.git');
    if (!fs.existsSync(gitDir)) {
      return [new MessageItem('Student repository not found locally. Use “Clone Student Repository” first.', 'warning')];
    }

    const directoryName = element.assignmentDirectory || this.deriveAssignmentDirectory(element.content);
    if (!directoryName) {
      return [new MessageItem('Assignment directory is not specified for this content.', 'info')];
    }

    const assignmentPath = path.join(repoRoot, directoryName);
    if (!fs.existsSync(assignmentPath)) {
      return [new MessageItem('Assignment directory missing locally. Pull the latest student repository.', 'warning')];
    }

    const items = await this.readDirectoryItems(assignmentPath, courseId, memberId, repoRoot);
    return items.length > 0 ? items : [new MessageItem('Assignment directory is empty.', 'info')];
  }

  private getTutorRepoRoot(workspaceRoot: string, courseId: string, memberId: string, content: CourseContentStudentList): string {
    const submissionRepo = content.submission_group?.repository as any;
    let remoteUrl: string | undefined = submissionRepo?.clone_url || submissionRepo?.url || submissionRepo?.web_url;
    if (!remoteUrl && submissionRepo) {
      const base = submissionRepo?.provider_url || submissionRepo?.provider || submissionRepo?.url || '';
      const full = submissionRepo?.full_path || '';
      if (base && full) {
        remoteUrl = `${String(base).replace(/\/$/, '')}/${String(full).replace(/^\//, '')}`;
        if (!remoteUrl.endsWith('.git')) remoteUrl += '.git';
      }
    }

    const repoName = deriveTutorRepoDirectoryName({
      submissionRepo,
      remoteUrl,
      courseId,
      memberId
    });

    return buildTutorStudentRepoRoot(workspaceRoot, repoName);
  }

  private async readDirectoryItems(dir: string, courseId: string, memberId: string, repositoryRoot: string): Promise<vscode.TreeItem[]> {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const items: vscode.TreeItem[] = [];
      for (const entry of entries) {
        if (entry.name === '.git') continue;
        const absPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          items.push(new TutorFsFolderItem(absPath, courseId, memberId, repositoryRoot));
        } else if (entry.isFile()) {
          items.push(new TutorFsFileItem(absPath, courseId, memberId, repositoryRoot));
        }
      }

      items.sort((a, b) => {
        const aIsFolder = a instanceof TutorFsFolderItem;
        const bIsFolder = b instanceof TutorFsFolderItem;
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return String(a.label).localeCompare(String(b.label));
      });

      return items;
    } catch (error) {
      console.warn('Failed to read tutor assignment directory:', error);
      return [new MessageItem('Error reading assignment directory.', 'error')];
    }
  }
}

interface ContentNode {
  name?: string;
  children: Map<string, ContentNode>;
  courseContent?: CourseContentStudentList;
  contentKind?: CourseContentKindList;
  isUnit: boolean;
  unreadMessageCount?: number;
  submissionGroup?: SubmissionGroupStudentList;
}

class MessageItem extends vscode.TreeItem {
  constructor(message: string, severity: 'info' | 'warning' | 'error') {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info'
    );
  }
}

class TutorUnitItem extends vscode.TreeItem {
  constructor(public node: ContentNode) {
    super(node.name || 'Unit', vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'tutorUnit';
    // Try to use a colored circle icon like in the student view
    try {
      const color = this.deriveColor(node) || 'grey';
      this.iconPath = IconGenerator.getColoredIcon(color, 'circle');
    } catch {
      this.iconPath = new vscode.ThemeIcon('folder');
    }
    this.id = node.courseContent ? node.courseContent.id : undefined;
    this.applyCounts();
  }

  private deriveColor(node: ContentNode): string | undefined {
    // Prefer the unit node's own content type color if available.
    if (node.courseContent) {
      const cc: any = node.courseContent as any;
      const ct = cc.course_content_type;
      if (ct?.color) return ct.color as string;
      if (cc.color) return cc.color as string;
    }
    // Otherwise, no reliable unit color from the tutor endpoints; fall back to undefined (grey default)
    return undefined;
  }

  private applyCounts(): void {
    const unread = this.node.unreadMessageCount ?? 0;
    this.description = unread > 0 ? `🔔 ${unread}` : undefined;

    const tooltipLines = [
      `Unit: ${this.label?.toString() ?? 'Unit'}`
    ];
    if (unread > 0) {
      tooltipLines.push(`${unread} unread message${unread === 1 ? '' : 's'}`);
    }
    this.tooltip = tooltipLines.join('\n');
  }
}

class TutorContentItem extends vscode.TreeItem {
  public readonly memberId: string;
  public readonly isAssignment: boolean;
  public readonly assignmentDirectory?: string;

  constructor(
    public content: CourseContentStudentList,
    memberId: string,
    isAssignment: boolean,
    assignmentDirectory?: string
  ) {
    super(content.title || content.path, isAssignment ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    const ct: any = (content as any).course_content_type;
    const color = ct?.color || 'grey';
    const kindId = ct?.course_content_kind_id;
    const shape = kindId === 'assignment' ? 'square' : 'circle';
    const unread = ((content as any).unread_message_count ?? 0) + (content.submission_group?.unread_message_count ?? 0);
    let badge: 'success' | 'failure' | 'none' = 'none';
    let corner: 'corrected' | 'correction_necessary' | 'correction_possible' | 'none' = 'none';
    const submission: SubmissionGroupStudentList = content.submission_group!;
    const status = submission?.status?.toLowerCase?.();
    const grading = submission?.grading;
    if (status === 'corrected') corner = 'corrected';
    else if (status === 'correction_necessary') corner = 'correction_necessary';
    else if (status === 'correction_possible' || status === 'improvement_possible') corner = 'correction_possible';
    // if (typeof grading === 'number') {
    //   badge = grading === 1 ? 'success' : 'failure';
    // }
    const result = content.result?.result as number | undefined;
    if (typeof result === 'number') {
        badge = (result === 1) ? 'success' : 'failure';
    }
    this.iconPath = (badge === 'none' && corner === 'none')
      ? IconGenerator.getColoredIcon(color, shape)
      : IconGenerator.getColoredIconWithBadge(color, shape, badge, corner);
    this.memberId = memberId;
    this.isAssignment = isAssignment;
    this.assignmentDirectory = assignmentDirectory;
    this.contextValue = this.isAssignment ? 'tutorStudentContent.assignment' : 'tutorStudentContent.reading';
    this.description = unread > 0 ? `🔔 ${unread}` : undefined;
    // Tooltip with friendly status label
    const friendlyStatus = (() => {
      if (!status) return undefined;
      if (status === 'corrected') return 'Corrected';
      if (status === 'correction_necessary') return 'Correction Necessary';
      if (status === 'improvement_possible') return 'Improvement Possible';
      if (status === 'correction_possible') return 'Correction Possible';
      // Fallback: capitalize first letter and replace underscores
      const t = status.replace(/_/g, ' ');
      return t.charAt(0).toUpperCase() + t.slice(1);
    })();
    this.tooltip = [
      friendlyStatus ? `Status: ${friendlyStatus}` : undefined,
      (typeof grading === 'number') ? `Grading: ${(grading * 100).toFixed(2)}%` : undefined,
      unread > 0 ? `${unread} unread message${unread === 1 ? '' : 's'}` : undefined
    ].filter(Boolean).join('\n');
    this.id = content.id;
    // No IDs in description per request
  }
}

class TutorFsFolderItem extends vscode.TreeItem {
  constructor(
    public absPath: string,
    public courseId: string,
    public memberId: string,
    public repositoryRoot: string
  ) {
    super(path.basename(absPath), vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'tutorFsFolder';
    this.tooltip = absPath;
    this.id = `tutorFsFolder:${courseId}:${memberId}:${absPath}`;
  }
}

class TutorFsFileItem extends vscode.TreeItem {
  constructor(
    public absPath: string,
    public courseId: string,
    public memberId: string,
    public repositoryRoot: string
  ) {
    super(path.basename(absPath), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'tutorFsFile';
    this.tooltip = absPath;
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(absPath)] };
    this.id = `tutorFsFile:${courseId}:${memberId}:${absPath}`;
  }
}
