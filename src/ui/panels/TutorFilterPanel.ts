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
    // Initial data
    void this.postCourses();
    void this.postCourseGroups();
    void this.postCourseMembers();
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
              memberSel.innerHTML = '<option value="">All members</option>' + data.map(c => '<option value="' + c.id + '" ' + (selected===c.id?'selected':'') + '>' + label(c) + '</option>').join('');
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
    this._view?.webview.postMessage({ command: 'courses', data: courses || [], selected: this.selection.getCurrentCourseId() });
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
      members = await (this.api as any).getTutorCourseMembers?.(courseId, groupId || undefined) || [];
    }
    this._view?.webview.postMessage({ command: 'members', data: members, selected: this.selection.getCurrentMemberId() });
  }
}
