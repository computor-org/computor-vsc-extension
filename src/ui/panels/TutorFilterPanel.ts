import * as vscode from 'vscode';
import { ComputorApiService } from '../../services/ComputorApiService';
import { TutorSelectionService } from '../../services/TutorSelectionService';

export class TutorFilterPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'computor.tutor.filters';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly api: ComputorApiService,
    private readonly selection: TutorSelectionService
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.postCourses();
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'course-select':
          await this.selection.selectCourse(message.id || null, message.label || null);
          await this.postCourseGroups();
          await this.postCourseMembers();
          break;
        case 'course-group-select':
          await this.selection.selectGroup(message.id || null, message.label || null);
          await this.postCourseMembers();
          break;
        case 'course-member-select':
          await this.selection.selectMember(message.id || null, message.label || null);
          break;
      }
    });

    this.updateHtml();
    // Initial data: load courses, then groups and members based on selection
    void this.postCourses();
  }

  private async updateHtml(): Promise<void> {
    if (!this._view) return;
    const nonce = Math.random().toString(36).slice(2);
    const webview = this._view.webview;
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'vscode.css'));
    this._view.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="${styleUri}" rel="stylesheet" />
      </head>
      <body>
        <div>
          <label>Course</label>
          <select id="course"></select>
        </div>
        <div>
          <label>Group</label>
          <select id="group"></select>
        </div>
        <div>
          <label>Member</label>
          <select id="member"></select>
        </div>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const courseSel = document.getElementById('course');
          const groupSel = document.getElementById('group');
          const memberSel = document.getElementById('member');
          window.addEventListener('message', event => {
            const { command, data, selected } = event.data || {};
            if (command === 'courses') {
              courseSel.innerHTML = '<option value="">Select a course</option>' + data.map(c => '<option value="' + c.id + '" ' + (selected===c.id?'selected':'') + '>' + (c.title||c.name||c.path||c.id) + '</option>').join('');
            } else if (command === 'groups') {
              groupSel.innerHTML = '<option value="">All groups</option>' + data.map(c => '<option value="' + c.id + '" ' + (selected===c.id?'selected':'') + '>' + (c.title||c.name||c.id) + '</option>').join('');
            } else if (command === 'members') {
              const label = (m) => (m.user && (m.user.full_name || m.user.username)) || m.id;
              memberSel.innerHTML = data.map(c => '<option value="' + c.id + '" ' + (selected===c.id?'selected':'') + '>' + label(c) + '</option>').join('');
            }
          });
          courseSel.addEventListener('change', () => {
            const label = courseSel.options[courseSel.selectedIndex]?.text || null;
            vscode.postMessage({ command: 'course-select', id: courseSel.value || null, label });
          });
          groupSel.addEventListener('change', () => {
            const label = groupSel.options[groupSel.selectedIndex]?.text || null;
            vscode.postMessage({ command: 'course-group-select', id: groupSel.value || null, label });
          });
          memberSel.addEventListener('change', () => {
            const label = memberSel.options[memberSel.selectedIndex]?.text || null;
            vscode.postMessage({ command: 'course-member-select', id: memberSel.value || null, label });
          });
        </script>
      </body>
      </html>
    `;
  }

  private async postCourses(): Promise<void> {
    const courses = await this.api.getTutorCourses();
    let selected = this.selection.getCurrentCourseId();
    if ((!selected || selected === '') && courses && courses.length > 0) {
      const first = courses[0];
      const label = first.title || first.name || first.path || first.id;
      await this.selection.selectCourse(first.id, label);
      selected = first.id;
    }
    this._view?.webview.postMessage({ command: 'courses', data: courses || [], selected });
    // After courses are posted and selection ensured, load dependent filters
    await this.postCourseGroups();
    await this.postCourseMembers();
  }

  private async postCourseGroups(): Promise<void> {
    const courseId = this.selection.getCurrentCourseId();
    let groups: any[] = [];
    if (courseId) {
      groups = await (this.api as any).getTutorCourseGroups?.(courseId) || [];
    }
    this._view?.webview.postMessage({ command: 'groups', data: groups, selected: this.selection.getCurrentGroupId() });
  }

  private async postCourseMembers(): Promise<void> {
    const courseId = this.selection.getCurrentCourseId();
    const groupId = this.selection.getCurrentGroupId();
    let members: any[] = [];
    if (courseId) {
      members = await this.api.getTutorCourseMembers(courseId, groupId || undefined) || [];
    }
    let selected = this.selection.getCurrentMemberId();
    if ((!selected || selected === '') && members && members.length > 0) {
      const first = members[0];
      const label = (first.user && (first.user.full_name || first.user.username)) || first.id;
      await this.selection.selectMember(first.id, label);
      selected = first.id;
    }
    this._view?.webview.postMessage({ command: 'members', data: members, selected });
  }
}
