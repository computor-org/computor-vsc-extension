import * as vscode from 'vscode';
import { ComputorApiService } from '../../../services/ComputorApiService';
import { TutorSelectionService } from '../../../services/TutorSelectionService';
import { IconGenerator } from '../../../utils/IconGenerator';
import { CourseContentStudentList, CourseContentKindList } from '../../../types/generated';

export class TutorStudentTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private contentKinds: CourseContentKindList[] = [];

  constructor(private api: ComputorApiService, private selection: TutorSelectionService) {
    selection.onDidChangeSelection(() => this.refresh());
  }

  refresh(): void { this._onDidChangeTreeData.fire(undefined); }

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
      let courseContents = await (this.api as any).getTutorCourseContents?.(courseId, memberId) || [];
      if (!courseContents || courseContents.length === 0) {
        // Fallback to student endpoint until tutor endpoint is available
        courseContents = await this.api.getStudentCourseContents(courseId) || [];
      }
      if (courseContents.length === 0) return [new MessageItem('No content available', 'info')];
      const tree = this.buildContentTree(courseContents, this.contentKinds);
      return this.createTreeItems(tree, memberId);
    }

    if (element instanceof TutorUnitItem) {
      return this.createTreeItems(element.node, memberId);
    }

    return [];
  }

  // Tree building similar to student provider (simplified)
  private buildContentTree(contents: CourseContentStudentList[], kinds: CourseContentKindList[]): ContentNode {
    const root: ContentNode = { children: new Map(), isUnit: false };
    const kindMap = new Map<string, CourseContentKindList>();
    kinds.forEach(k => kindMap.set(k.id, k));

    const sorted = [...contents].sort((a, b) => {
      const ad = (a.path.match(/\./g) || []).length;
      const bd = (b.path.match(/\./g) || []).length;
      if (ad !== bd) return ad - bd;
      return a.position - b.position;
    });

    const map = new Map<string, ContentNode>();
    for (const c of sorted) {
      const ct = (c as any).course_content_type;
      const ck = ct ? kindMap.get(ct.course_content_kind_id) : undefined;
      const node: ContentNode = {
        name: c.title || c.path.split('.').pop() || c.path,
        children: new Map(),
        courseContent: c,
        contentKind: ck,
        isUnit: ck ? !!ck.has_descendants : false
      } as ContentNode;
      map.set(c.path, node);
      const parts = c.path.split('.');
      if (parts.length === 1) root.children.set(c.path, node);
      else {
        const parentPath = parts.slice(0, -1).join('.');
        const parent = map.get(parentPath);
        if (parent) parent.children.set(c.path, node);
        else root.children.set(c.path, node);
      }
    }
    return root;
  }

  private createTreeItems(node: ContentNode, memberId: string): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];
    const entries = Array.from(node.children.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [, child] of entries) {
      if (child.isUnit) {
        items.push(new TutorUnitItem(child));
      } else if (child.courseContent) {
        items.push(new TutorContentItem(child.courseContent, memberId));
      }
    }
    return items;
  }
}

interface ContentNode {
  name?: string;
  children: Map<string, ContentNode>;
  courseContent?: CourseContentStudentList;
  contentKind?: CourseContentKindList;
  isUnit: boolean;
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
    this.iconPath = new vscode.ThemeIcon('folder');
    this.id = node.courseContent ? node.courseContent.id : undefined;
  }
}

class TutorContentItem extends vscode.TreeItem {
  constructor(public content: CourseContentStudentList, memberId: string) {
    super(content.title || content.path, vscode.TreeItemCollapsibleState.None);
    const ct: any = (content as any).course_content_type;
    const color = ct?.color || 'grey';
    const kindId = ct?.course_content_kind_id;
    const shape = kindId === 'assignment' ? 'square' : 'circle';
    let badge: 'success' | 'failure' | 'none' = 'none';
    let corner: 'corrected' | 'correction_necessary' | 'correction_possible' | 'none' = 'none';
    const submission: any = (content as any).submission_group || (content as any).submission;
    const grade = submission?.latest_grading?.grading ?? submission?.grading;
    if (typeof grade === 'number') {
      if (grade >= 0.999) badge = 'success';
      else if (grade >= 0) badge = 'failure';
    }
    const status = submission?.latest_grading?.status?.toLowerCase?.();
    if (status === 'corrected') corner = 'corrected';
    else if (status === 'correction_necessary') corner = 'correction_necessary';
    else if (status === 'correction_possible' || status === 'improvement_possible') corner = 'correction_possible';
    this.iconPath = (badge === 'none' && corner === 'none')
      ? IconGenerator.getColoredIcon(color, shape)
      : IconGenerator.getColoredIconWithBadge(color, shape, badge, corner);
    this.contextValue = kindId === 'assignment' ? 'tutorStudentContent.assignment' : 'tutorStudentContent.reading';
    this.tooltip = `Path: ${content.path}`;
    this.id = content.id;
    this.description = memberId;
  }
}
