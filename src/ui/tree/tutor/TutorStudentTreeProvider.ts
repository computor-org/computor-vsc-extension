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
      const courseContents = await (this.api as any).getTutorCourseContents?.(courseId, memberId) || [];
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
          } as ContentNode;
          nodeMap.set(currentPath, node);
          parentNode.children.set(currentPath, node);
        }
        if (i === parts.length - 1) {
          // Leaf: attach course content and kind info
          const ct: any = (c as any).course_content_type;
          const ck = ct ? kindMap.get(ct.course_content_kind_id) : undefined;
          node.courseContent = c;
          node.contentKind = ck;
          node.isUnit = ck ? !!ck.has_descendants : false;
          // Ensure the displayed name uses the course content title when available
          node.name = ((c.title as string | undefined) ?? node.name ?? seg) as string;
        }
        parentNode = node;
      }
    }

    return root;
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
    // Try to use a colored circle icon like in the student view
    try {
      const color = this.deriveColor(node) || 'grey';
      this.iconPath = IconGenerator.getColoredIcon(color, 'circle');
    } catch {
      this.iconPath = new vscode.ThemeIcon('folder');
    }
    this.id = node.courseContent ? node.courseContent.id : undefined;
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
    // No IDs in description per request
  }
}
