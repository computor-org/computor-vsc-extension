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
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'tutor-filters.css'));
    this._view.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="${stylesUri}" rel="stylesheet" />
      </head>
      <body>
        <section class="filter-fields" data-state="loading">
          <label class="filter-field" for="course">
            <span class="filter-field__label">Course</span>
            <div class="filter-field__control">
              <select id="course" aria-label="Course">
                <option value="" disabled selected>Loading…</option>
              </select>
            </div>
            <span class="filter-field__hint">Updates groups and members.</span>
          </label>
          <label class="filter-field" for="group">
            <span class="filter-field__label">Group</span>
            <div class="filter-field__control">
              <select id="group" aria-label="Group" disabled>
                <option value="" selected>All groups</option>
              </select>
            </div>
            <span class="filter-field__hint">Optional — narrow to a single group.</span>
          </label>
          <label class="filter-field" for="member">
            <span class="filter-field__label">Member</span>
            <div class="filter-field__control">
              <select id="member" aria-label="Member" disabled>
                <option value="" disabled selected>Waiting for members…</option>
              </select>
            </div>
            <span class="filter-field__hint">Choose who to inspect in the tree.</span>
          </label>
        </section>
        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          const courseSel = document.getElementById('course');
          const groupSel = document.getElementById('group');
          const memberSel = document.getElementById('member');
          const fieldsWrapper = document.querySelector('.filter-fields');

          const state = {
            courses: false,
            groups: false,
            members: false
          };

          const toStringOrEmpty = (value) => (value == null ? '' : String(value));
          const escapeHtml = (value) => toStringOrEmpty(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
          const getCourseLabel = (course) => course.title || course.name || course.path || course.id;
          const getGroupLabel = (group) => group.title || group.name || group.id;
          const getMemberLabel = (member) => {
            const user = member?.user;
            return (user?.full_name) || (user?.username) || member.id;
          };

          const updatePanelState = () => {
            if (!fieldsWrapper) return;
            const loading = !state.courses || !state.members;
            fieldsWrapper.dataset.state = loading ? 'loading' : 'ready';
          };

          const buildOptions = (items, selectedId, labelSelector) => items.map((item) => {
            const value = toStringOrEmpty(item.id);
            const label = escapeHtml(labelSelector(item));
            const selected = selectedId === value ? ' selected' : '';
            return '<option value="' + escapeHtml(value) + '"' + selected + '>' + label + '</option>';
          });

          window.addEventListener('message', (event) => {
            const { command, data = [], selected } = event.data || {};
            const selectedId = toStringOrEmpty(selected);
            if (command === 'courses') {
              state.courses = true;
              const options = ['<option value=""' + (selectedId ? '' : ' selected') + '>Select a course</option>'];
              options.push(...buildOptions(data ?? [], selectedId, getCourseLabel));
              courseSel.innerHTML = options.join('');
              courseSel.disabled = (data ?? []).length === 0;
              if (selectedId) {
                courseSel.value = selectedId;
              }
              updatePanelState();
            } else if (command === 'groups') {
              state.groups = true;
              const options = ['<option value=""' + (selectedId ? '' : ' selected') + '>All groups</option>'];
              options.push(...buildOptions(data ?? [], selectedId, getGroupLabel));
              groupSel.innerHTML = options.join('');
              groupSel.disabled = courseSel.disabled || !courseSel.value;
              if (selectedId) {
                groupSel.value = selectedId;
              }
            } else if (command === 'members') {
              state.members = true;
              const items = data ?? [];
              if (!items.length) {
                memberSel.innerHTML = '<option value="" disabled selected>No members found</option>';
                memberSel.disabled = true;
              } else {
                memberSel.innerHTML = buildOptions(items, selectedId, getMemberLabel).join('');
                memberSel.disabled = false;
                if (selectedId) {
                  memberSel.value = selectedId;
                } else {
                  memberSel.selectedIndex = 0;
                }
              }
              updatePanelState();
            }
          });

          courseSel.addEventListener('change', () => {
            if (courseSel.disabled) {
              return;
            }
            const label = courseSel.options[courseSel.selectedIndex]?.text || null;
            state.groups = false;
            state.members = false;
            groupSel.disabled = true;
            groupSel.innerHTML = '<option value="" disabled selected>Loading…</option>';
            memberSel.disabled = true;
            memberSel.innerHTML = '<option value="" disabled selected>Waiting for members…</option>';
            updatePanelState();
            vscode.postMessage({ command: 'course-select', id: courseSel.value || null, label });
          });

          groupSel.addEventListener('change', () => {
            if (groupSel.disabled) {
              return;
            }
            const label = groupSel.options[groupSel.selectedIndex]?.text || null;
            state.members = false;
            memberSel.disabled = true;
            memberSel.innerHTML = '<option value="" disabled selected>Loading…</option>';
            updatePanelState();
            vscode.postMessage({ command: 'course-group-select', id: groupSel.value || null, label });
          });

          memberSel.addEventListener('change', () => {
            if (memberSel.disabled) {
              return;
            }
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
