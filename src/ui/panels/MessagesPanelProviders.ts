import * as vscode from 'vscode';
import type { CourseContentStudentList } from '../../types/generated';
import type { SubmissionGroupStudentList } from '../../types/generated';
import type { CourseContentList, CourseList } from '../../types/generated';

interface PanelPayload {
  heading: string;
  description: string;
  infoLines: string[];
  placeholder: string;
}

abstract class BaseInfoPanelProvider implements vscode.WebviewViewProvider {
  protected view?: vscode.WebviewView;
  private currentPayload: PanelPayload;

  constructor(protected readonly extensionUri: vscode.Uri) {
    this.currentPayload = this.createInitialPayload();
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.buildHtml();
    this.postUpdate();
  }

  protected abstract createInitialPayload(): PanelPayload;

  protected updatePayload(partial: Partial<PanelPayload>): void {
    this.currentPayload = { ...this.currentPayload, ...partial };
    this.postUpdate();
  }

  private postUpdate(): void {
    if (!this.view) return;
    this.view.webview.postMessage({
      command: 'update',
      payload: this.currentPayload
    }).then(undefined, (error) => {
      console.warn('[MessagesPanel] postMessage failed:', error);
    });
  }

  private buildHtml(): string {
    const nonce = this.createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.view?.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }
    .description {
      color: var(--vscode-descriptionForeground);
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    .placeholder {
      padding: 12px;
      border-radius: 6px;
      border: 1px dashed var(--vscode-editorWidget-border);
      color: var(--vscode-descriptionForeground);
      background: color-mix(in srgb, var(--vscode-editor-background) 85%, var(--vscode-editorWidget-border) 15%);
    }
  </style>
</head>
<body>
  <h2 id="heading">${this.currentPayload.heading}</h2>
  <div class="description" id="description">${this.currentPayload.description}</div>
  <ul id="info"></ul>
  <div class="placeholder" id="placeholder">${this.currentPayload.placeholder}</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      if (event.data?.command !== 'update') return;
      const payload = event.data.payload;
      document.getElementById('heading').innerText = payload.heading;
      document.getElementById('description').innerText = payload.description;
      const info = document.getElementById('info');
      info.innerHTML = '';
      if (Array.isArray(payload.infoLines) && payload.infoLines.length > 0) {
        for (const line of payload.infoLines) {
          const li = document.createElement('li');
          li.textContent = line;
          info.appendChild(li);
        }
      }
      document.getElementById('placeholder').innerText = payload.placeholder;
    });
  </script>
</body>
</html>`;
  }

  private createNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 32 }, () => possible.charAt(Math.floor(Math.random() * possible.length))).join('');
  }
}

export class StudentMessagesPanelProvider extends BaseInfoPanelProvider {
  public static readonly viewType = 'computor.student.messages';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri);
  }

  public updateSelection(content: CourseContentStudentList | undefined, submissionGroup?: SubmissionGroupStudentList): void {
    if (!content) {
      this.updatePayload({
        heading: 'Student Messages',
        description: 'Select an assignment to view course messages.',
        infoLines: [],
        placeholder: 'Messages will appear here once backend endpoints are available.'
      });
      return;
    }

    const infoLines: string[] = [];
    infoLines.push(`Course item: ${content.title || content.path}`);
    infoLines.push(`Content ID: ${content.id}`);
    if (submissionGroup?.repository?.full_path) {
      infoLines.push(`Repository: ${submissionGroup.repository.full_path}`);
    }

    this.updatePayload({
      heading: content.title || 'Assignment Messages',
      description: 'Conversation between you and the teaching team.',
      infoLines,
      placeholder: 'Message list will load once the backend API is ready.'
    });
  }

  protected createInitialPayload(): PanelPayload {
    return {
      heading: 'Student Messages',
      description: 'Select an assignment to view or send messages.',
      infoLines: [],
      placeholder: 'Messages will appear here when an assignment is selected.'
    };
  }
}

export class TutorMessagesPanelProvider extends BaseInfoPanelProvider {
  public static readonly viewType = 'computor.tutor.messages';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri);
  }

  public updateContext(options: {
    content?: CourseContentStudentList;
    memberLabel?: string | null;
    memberId?: string | null;
  }): void {
    const { content, memberLabel, memberId } = options;
    if (!content || !memberId) {
      this.updatePayload({
        heading: 'Tutor Messages',
        description: 'Select a course member and assignment to view messages.',
        infoLines: [],
        placeholder: 'Messages will appear here when both a member and an assignment are selected.'
      });
      return;
    }

    const infoLines: string[] = [];
    infoLines.push(`Student: ${memberLabel || memberId}`);
    infoLines.push(`Assignment: ${content.title || content.path}`);
    infoLines.push(`Assignment ID: ${content.id}`);

    this.updatePayload({
      heading: content.title || 'Assignment Messages',
      description: 'Tutor ↔ student discussion for the selected assignment.',
      infoLines,
      placeholder: 'Messages will sync once the refreshed backend endpoints are available.'
    });
  }

  protected createInitialPayload(): PanelPayload {
    return {
      heading: 'Tutor Messages',
      description: 'Pick a student and an assignment to review their conversation.',
      infoLines: [],
      placeholder: 'Awaiting selection.'
    };
  }
}

export class LecturerMessagesPanelProvider extends BaseInfoPanelProvider {
  public static readonly viewType = 'computor.lecturer.messages';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri);
  }

  public updateSelection(content: CourseContentList | undefined, course?: CourseList): void {
    if (!content) {
      this.updatePayload({
        heading: 'Lecturer Messages',
        description: 'Select course content to review related messages.',
        infoLines: [],
        placeholder: 'Messages will display here once the backend endpoints are supplied.'
      });
      return;
    }

    const infoLines: string[] = [];
    if (course) {
      infoLines.push(`Course: ${course.title || course.path}`);
    }
    infoLines.push(`Content: ${content.title || content.path}`);
    infoLines.push(`Content ID: ${content.id}`);

    this.updatePayload({
      heading: content.title || 'Course Messages',
      description: 'Lecturer communication for the selected content item.',
      infoLines,
      placeholder: 'Waiting for backend support to load messages.'
    });
  }

  protected createInitialPayload(): PanelPayload {
    return {
      heading: 'Lecturer Messages',
      description: 'Select a course content item to view lecturer messages.',
      infoLines: [],
      placeholder: 'No content selected.'
    };
  }
}

export class TutorCommentsPanelProvider extends BaseInfoPanelProvider {
  public static readonly viewType = 'computor.tutor.comments';

  constructor(extensionUri: vscode.Uri) {
    super(extensionUri);
  }

  public updateMemberContext(member: { id: string; label: string } | null): void {
    if (!member) {
      this.updatePayload({
        heading: 'Course Member Comments',
        description: 'Select a student to view or add tutor comments.',
        infoLines: [],
        placeholder: 'Comments will appear here once a student is selected.'
      });
      return;
    }

    this.updatePayload({
      heading: `Comments for ${member.label}`,
      description: 'Long-form tutor notes for the selected student.',
      infoLines: [
        `Course member ID: ${member.id}`,
        'Changes sync automatically once backend endpoints are available.'
      ],
      placeholder: 'Comments will load once the backend endpoints are updated.'
    });
  }

  protected createInitialPayload(): PanelPayload {
    return {
      heading: 'Course Member Comments',
      description: 'Select a student to review tutor comments.',
      infoLines: [],
      placeholder: 'No student selected.'
    };
  }
}
