import * as vscode from 'vscode';
import { ComputorApiService } from '../../services/ComputorApiService';
import type { MessageCreate, MessageList, MessageQuery } from '../../types/generated';
import type {
  CourseContentList,
  CourseContentStudentList,
  CourseList,
  SubmissionGroupStudentList
} from '../../types/generated';

interface DisplayMessage {
  id: string;
  title: string;
  content: string;
  authorId: string;
  createdAt?: string;
  updatedAt?: string;
  level: number;
}

interface PanelState {
  heading: string;
  description: string;
  infoLines: string[];
  placeholder: string;
  loading: boolean;
  canPost: boolean;
  messages: DisplayMessage[];
  error?: string | null;
}

interface MessageInput {
  title?: string;
  content: string;
}

interface ContextDetails {
  contextKey: string | null;
  heading: string;
  description: string;
  infoLines: string[];
  placeholder: string;
  canPost: boolean;
}

abstract class BaseMessagesPanelProvider implements vscode.WebviewViewProvider {
  protected view?: vscode.WebviewView;
  private state: PanelState;
  private contextKey: string | null = null;
  private shouldRefreshOnResolve = false;
  private refreshToken = 0;

  protected constructor(
    protected readonly extensionUri: vscode.Uri,
    protected readonly api: ComputorApiService
  ) {
    this.state = this.createInitialState();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = this.buildHtml();

    webviewView.webview.onDidReceiveMessage((message) => {
      void this.handleWebviewMessage(message);
    });

    this.postState();

    if (this.contextKey && (this.shouldRefreshOnResolve || this.state.messages.length === 0)) {
      this.shouldRefreshOnResolve = false;
      void this.refreshMessages(true);
    }
  }

  protected abstract buildQuery(): MessageQuery | null;
  protected abstract buildCreatePayload(input: MessageInput): MessageCreate | null;
  protected abstract emptyStateDetails(): ContextDetails;

  protected applyContextDetails(details: ContextDetails): void {
    const changed = details.contextKey !== this.contextKey;
    this.contextKey = details.contextKey;
    this.setState({
      heading: details.heading,
      description: details.description,
      infoLines: details.infoLines,
      placeholder: details.placeholder,
      canPost: details.canPost,
      error: null
    });

    if (!details.contextKey) {
      this.setState({ messages: [] });
      return;
    }

    if (!this.view) {
      if (changed) {
        this.shouldRefreshOnResolve = true;
      }
      return;
    }

    if (changed) {
      void this.refreshMessages(true);
    }
  }

  protected setEmptyContext(): void {
    this.applyContextDetails(this.emptyStateDetails());
  }

  protected async refreshMessages(force = false): Promise<void> {
    if (!this.contextKey) {
      this.setEmptyContext();
      return;
    }

    const query = this.buildQuery();
    if (!query) {
      this.setEmptyContext();
      return;
    }

    if (!force && this.state.loading) {
      return;
    }

    const token = ++this.refreshToken;
    this.setState({ loading: true, error: null });

    try {
      const { messages } = await this.api.listMessages(query);
      if (token !== this.refreshToken) {
        return;
      }
      const mapped = this.mapMessages(messages);
      this.setState({
        messages: mapped,
        loading: false,
        placeholder: mapped.length === 0 ? 'No messages yet. Be the first to post.' : ''
      });
    } catch (error) {
      if (token !== this.refreshToken) {
        return;
      }
      this.setState({
        loading: false,
        error: this.extractError(error)
      });
    }
  }

  protected setState(partial: Partial<PanelState>): void {
    this.state = { ...this.state, ...partial };
    this.postState();
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({
      command: 'state',
      state: this.state
    });
  }

  private createInitialState(): PanelState {
    const details = this.emptyStateDetails();
    return {
      heading: details.heading,
      description: details.description,
      infoLines: details.infoLines,
      placeholder: details.placeholder,
      canPost: details.canPost,
      loading: false,
      messages: [],
      error: null
    };
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message?.command) {
      case 'refresh':
        await this.refreshMessages(true);
        break;
      case 'create':
        await this.handleCreate(message.payload as MessageInput);
        break;
      case 'markRead':
        await this.handleMarkRead(message.id as string);
        break;
      case 'markUnread':
        await this.handleMarkUnread(message.id as string);
        break;
      case 'delete':
        await this.handleDelete(message.id as string);
        break;
      default:
        break;
    }
  }

  private async handleCreate(input: MessageInput): Promise<void> {
    const trimmedContent = input.content?.trim();
    if (!trimmedContent) {
      this.setState({ error: 'Message content cannot be empty.' });
      return;
    }

    const payload = this.buildCreatePayload({
      title: input.title?.trim(),
      content: trimmedContent
    });

    if (!payload) {
      this.setEmptyContext();
      return;
    }

    if (!payload.title || payload.title.trim() === '') {
      payload.title = this.deriveTitle(trimmedContent);
    }

    try {
      this.setState({ loading: true, error: null });
      await this.api.createMessage(payload);
      await this.refreshMessages(true);
    } catch (error) {
      this.setState({ loading: false, error: this.extractError(error) });
    }
  }

  private async handleMarkRead(id: string): Promise<void> {
    try {
      await this.api.markMessageRead(id);
    } catch (error) {
      this.setState({ error: this.extractError(error) });
      return;
    }
    await this.refreshMessages(true);
  }

  private async handleMarkUnread(id: string): Promise<void> {
    try {
      await this.api.markMessageUnread(id);
    } catch (error) {
      this.setState({ error: this.extractError(error) });
      return;
    }
    await this.refreshMessages(true);
  }

  private async handleDelete(id: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Delete this message permanently?',
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }

    try {
      await this.api.deleteMessage(id);
    } catch (error) {
      this.setState({ error: this.extractError(error) });
      return;
    }

    await this.refreshMessages(true);
  }

  protected deriveTitle(content: string): string {
    const trimmed = content.trim();
    if (trimmed.length <= 50) {
      return trimmed || 'Message';
    }
    return `${trimmed.slice(0, 47)}...`;
  }

  private mapMessages(items: MessageList[]): DisplayMessage[] {
    return [...items]
      .sort((a, b) => {
        const aTime = a.created_at ? Date.parse(a.created_at) : 0;
        const bTime = b.created_at ? Date.parse(b.created_at) : 0;
        return aTime - bTime;
      })
      .map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        authorId: item.author_id,
        createdAt: item.created_at || undefined,
        updatedAt: item.updated_at || undefined,
        level: item.level ?? 0
      }));
  }

  private extractError(error: unknown): string {
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object') {
      const err = error as { message?: string; response?: any };
      if (err.response?.detail) {
        if (typeof err.response.detail === 'string') {
          return err.response.detail;
        }
        if (Array.isArray(err.response.detail)) {
          return err.response.detail.map((d: any) => d?.msg || String(d)).join(', ');
        }
      }
      if (err.response?.message && typeof err.response.message === 'string') {
        return err.response.message;
      }
      if (err.message) {
        return err.message;
      }
    }
    return 'Unexpected error while processing messages.';
  }

  private buildHtml(): string {
    const nonce = this.createNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${this.view?.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    :root {
      color-scheme: var(--vscode-color-scheme, light dark);
    }
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
      height: 100vh;
      box-sizing: border-box;
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    h2 {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }
    .description {
      color: var(--vscode-descriptionForeground);
    }
    ul.info-list {
      margin: 0;
      padding-left: 18px;
      color: var(--vscode-descriptionForeground);
    }
    .messages-container {
      flex: 1;
      overflow-y: auto;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px;
      padding: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, var(--vscode-panel-border) 8%);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message-card {
      border-radius: 6px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 70%, var(--vscode-panel-border) 30%);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .message-card h3 {
      font-size: 13px;
      font-weight: 600;
      margin: 0;
    }
    .message-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .message-content {
      white-space: pre-wrap;
      font-size: 13px;
    }
    .message-actions {
      display: flex;
      gap: 8px;
    }
    .message-actions button {
      background: transparent;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      padding: 2px 6px;
      color: var(--vscode-button-foreground);
      background-color: color-mix(in srgb, var(--vscode-button-background) 20%, transparent 80%);
      cursor: pointer;
      font-size: 11px;
    }
    .message-actions button:hover {
      background-color: color-mix(in srgb, var(--vscode-button-background) 35%, transparent 65%);
    }
    .error {
      color: var(--vscode-errorForeground);
    }
    .hidden {
      display: none !important;
    }
    form.message-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 12px;
    }
    form.message-form input,
    form.message-form textarea {
      font-family: inherit;
      font-size: 13px;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    form.message-form textarea {
      min-height: 80px;
      resize: vertical;
    }
    form.message-form .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    form.message-form button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 4px;
      border: 1px solid var(--vscode-button-border, transparent);
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      padding: 4px 12px;
      cursor: pointer;
    }
    form.message-form button[disabled] {
      opacity: 0.6;
      cursor: default;
    }
    .placeholder {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      border-radius: 4px;
      border: 1px dashed var(--vscode-panel-border);
      padding: 10px;
    }
  </style>
</head>
<body>
  <div class="panel-header">
    <h2 id="heading"></h2>
    <div>
      <button id="refreshButton" type="button">Refresh</button>
    </div>
  </div>
  <div class="description" id="description"></div>
  <ul class="info-list" id="info"></ul>
  <div class="error hidden" id="error"></div>
  <div class="messages-container" id="messages"></div>
  <div class="placeholder hidden" id="placeholder"></div>
  <form class="message-form" id="messageForm">
    <input id="messageTitle" type="text" placeholder="Title (optional)" />
    <textarea id="messageContent" placeholder="Write a message…"></textarea>
    <div class="actions">
      <button id="sendButton" type="button">Send</button>
    </div>
  </form>
  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      let currentState = {
        heading: '',
        description: '',
        infoLines: [],
        placeholder: '',
        loading: false,
        canPost: false,
        messages: [],
        error: null
      };

      const headingEl = document.getElementById('heading');
      const descriptionEl = document.getElementById('description');
      const infoEl = document.getElementById('info');
      const errorEl = document.getElementById('error');
      const messagesEl = document.getElementById('messages');
      const placeholderEl = document.getElementById('placeholder');
      const formEl = document.getElementById('messageForm');
      const titleInput = document.getElementById('messageTitle');
      const contentInput = document.getElementById('messageContent');
      const sendButton = document.getElementById('sendButton');
      const refreshButton = document.getElementById('refreshButton');

      function setLoading(isLoading) {
        if (isLoading) {
          document.body.classList.add('loading');
        } else {
          document.body.classList.remove('loading');
        }
        sendButton.disabled = isLoading || !currentState.canPost;
        refreshButton.disabled = isLoading;
      }

      function render(state) {
        currentState = state;
        headingEl.textContent = state.heading;
        descriptionEl.textContent = state.description;

        infoEl.innerHTML = '';
        if (Array.isArray(state.infoLines) && state.infoLines.length > 0) {
          infoEl.classList.remove('hidden');
          state.infoLines.forEach(line => {
            const li = document.createElement('li');
            li.textContent = line;
            infoEl.appendChild(li);
          });
        } else {
          infoEl.classList.add('hidden');
        }

        if (state.error) {
          errorEl.textContent = state.error;
          errorEl.classList.remove('hidden');
        } else {
          errorEl.classList.add('hidden');
        }

        messagesEl.innerHTML = '';
        if (state.messages.length > 0) {
          state.messages.forEach((message) => {
            const card = document.createElement('div');
            card.className = 'message-card';
            card.style.marginLeft = Math.min(message.level * 12, 48) + 'px';

            const title = document.createElement('h3');
            title.textContent = message.title || 'Message';
            card.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'message-meta';
            const author = document.createElement('span');
            author.textContent = 'Author: ' + message.authorId;
            meta.appendChild(author);
            if (message.createdAt) {
              const created = document.createElement('span');
              created.textContent = 'Created: ' + new Date(message.createdAt).toLocaleString();
              meta.appendChild(created);
            }
            if (message.updatedAt && message.updatedAt !== message.createdAt) {
              const updated = document.createElement('span');
              updated.textContent = 'Updated: ' + new Date(message.updatedAt).toLocaleString();
              meta.appendChild(updated);
            }
            card.appendChild(meta);

            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = message.content;
            card.appendChild(content);

            const actions = document.createElement('div');
            actions.className = 'message-actions';

            const markRead = document.createElement('button');
            markRead.textContent = 'Mark read';
            markRead.dataset.action = 'markRead';
            markRead.dataset.id = message.id;
            actions.appendChild(markRead);

            const markUnread = document.createElement('button');
            markUnread.textContent = 'Mark unread';
            markUnread.dataset.action = 'markUnread';
            markUnread.dataset.id = message.id;
            actions.appendChild(markUnread);

            const del = document.createElement('button');
            del.textContent = 'Delete';
            del.dataset.action = 'delete';
            del.dataset.id = message.id;
            actions.appendChild(del);

            actions.addEventListener('click', (event) => {
              const target = event.target;
              if (!target || !(target instanceof HTMLElement)) {
                return;
              }
              const action = target.dataset.action;
              const id = target.dataset.id;
              if (!action || !id) {
                return;
              }
              vscode.postMessage({ command: action, id });
            });

            card.appendChild(actions);
            messagesEl.appendChild(card);
          });
        }

        if (state.messages.length === 0 && state.placeholder) {
          placeholderEl.textContent = state.placeholder;
          placeholderEl.classList.remove('hidden');
        } else {
          placeholderEl.classList.add('hidden');
        }

        if (state.canPost) {
          formEl.classList.remove('hidden');
        } else {
          formEl.classList.add('hidden');
        }

        setLoading(state.loading);
      }

      window.addEventListener('message', (event) => {
        if (event.data?.command === 'state') {
          render(event.data.state);
        }
      });

      refreshButton.addEventListener('click', () => {
        vscode.postMessage({ command: 'refresh' });
      });

      sendButton.addEventListener('click', () => {
        if (!currentState.canPost) {
          return;
        }
        const titleValue = titleInput instanceof HTMLInputElement ? titleInput.value : '';
        const contentValue = contentInput instanceof HTMLTextAreaElement ? contentInput.value : '';
        const payload = { title: titleValue, content: contentValue };
        vscode.postMessage({ command: 'create', payload });
      });

      formEl.addEventListener('submit', (event) => {
        event.preventDefault();
        sendButton.click();
      });

      render(currentState);
    })();
  </script>
</body>
</html>`;
  }

  private createNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}

export class StudentMessagesPanelProvider extends BaseMessagesPanelProvider {
  public static readonly viewType = 'computor.student.messages';
  private context: { courseContentId: string; submissionGroupId?: string | null } | null = null;

  constructor(extensionUri: vscode.Uri, api: ComputorApiService) {
    super(extensionUri, api);
    this.setEmptyContext();
  }

  updateSelection(
    content: CourseContentStudentList | undefined,
    submissionGroup?: SubmissionGroupStudentList
  ): void {
    if (!content) {
      this.context = null;
      this.setEmptyContext();
      return;
    }

    this.context = {
      courseContentId: content.id,
      submissionGroupId: submissionGroup?.id || null
    };

    const infoLines: string[] = [`Course item: ${content.title || content.path}`];
    if (submissionGroup?.repository?.full_path) {
      infoLines.push(`Repository: ${submissionGroup.repository.full_path}`);
    }

    const contextKey = `${content.id}|${this.context.submissionGroupId ?? ''}`;
    this.applyContextDetails({
      contextKey,
      heading: content.title || 'Assignment Messages',
      description: 'Conversation between you and the teaching staff for this assignment.',
      infoLines,
      placeholder: 'No messages yet. Be the first to post.',
      canPost: true
    });
  }

  protected buildQuery(): MessageQuery | null {
    if (!this.context) {
      return null;
    }
    const query: MessageQuery = {
      course_content_id: this.context.courseContentId
    };
    if (this.context.submissionGroupId) {
      query.course_submission_group_id = this.context.submissionGroupId;
    }
    return query;
  }

  protected buildCreatePayload(input: MessageInput): MessageCreate | null {
    if (!this.context) {
      return null;
    }
    const payload: MessageCreate = {
      title: input.title || this.deriveTitle(input.content),
      content: input.content,
      course_content_id: this.context.courseContentId
    };
    if (this.context.submissionGroupId) {
      payload.course_submission_group_id = this.context.submissionGroupId;
    }
    return payload;
  }

  protected emptyStateDetails(): ContextDetails {
    return {
      contextKey: null,
      heading: 'Student Messages',
      description: 'Select an assignment to view the message history.',
      infoLines: [],
      placeholder: 'No assignment selected.',
      canPost: false
    };
  }
}

export class TutorMessagesPanelProvider extends BaseMessagesPanelProvider {
  public static readonly viewType = 'computor.tutor.messages';
  private context: {
    courseContentId: string;
    courseMemberId: string;
    memberLabel?: string | null;
  } | null = null;

  constructor(extensionUri: vscode.Uri, api: ComputorApiService) {
    super(extensionUri, api);
    this.setEmptyContext();
  }

  updateContext(options: {
    content?: CourseContentStudentList;
    memberId?: string | null;
    memberLabel?: string | null;
  }): void {
    const { content, memberId, memberLabel } = options;

    if (!content || !memberId) {
      this.context = null;
      this.setEmptyContext();
      return;
    }

    this.context = {
      courseContentId: content.id,
      courseMemberId: memberId,
      memberLabel
    };

    const infoLines: string[] = [
      `Student: ${memberLabel || memberId}`,
      `Assignment: ${content.title || content.path}`
    ];

    const contextKey = `${content.id}|${memberId}`;
    this.applyContextDetails({
      contextKey,
      heading: content.title || 'Assignment Messages',
      description: 'Tutor and student conversation for this assignment.',
      infoLines,
      placeholder: 'No messages yet. Start the discussion.',
      canPost: true
    });
  }

  protected buildQuery(): MessageQuery | null {
    if (!this.context) {
      return null;
    }
    return {
      course_content_id: this.context.courseContentId,
      course_member_id: this.context.courseMemberId
    };
  }

  protected buildCreatePayload(input: MessageInput): MessageCreate | null {
    if (!this.context) {
      return null;
    }
    return {
      title: input.title || this.deriveTitle(input.content),
      content: input.content,
      course_content_id: this.context.courseContentId,
      course_member_id: this.context.courseMemberId
    };
  }

  protected emptyStateDetails(): ContextDetails {
    return {
      contextKey: null,
      heading: 'Tutor Messages',
      description: 'Select both a student and an assignment to see their conversation.',
      infoLines: [],
      placeholder: 'Waiting for a selection.',
      canPost: false
    };
  }
}

export class LecturerMessagesPanelProvider extends BaseMessagesPanelProvider {
  public static readonly viewType = 'computor.lecturer.messages';
  private context: {
    courseContentId: string;
    courseLabel?: string | null;
  } | null = null;

  constructor(extensionUri: vscode.Uri, api: ComputorApiService) {
    super(extensionUri, api);
    this.setEmptyContext();
  }

  updateSelection(content: CourseContentList | undefined, course?: CourseList): void {
    if (!content) {
      this.context = null;
      this.setEmptyContext();
      return;
    }

    this.context = {
      courseContentId: content.id,
      courseLabel: course?.title || course?.path
    };

    const infoLines: string[] = [`Content: ${content.title || content.path}`];
    if (this.context.courseLabel) {
      infoLines.unshift(`Course: ${this.context.courseLabel}`);
    }

    const contextKey = content.id;
    this.applyContextDetails({
      contextKey,
      heading: content.title || 'Course Content Messages',
      description: 'Messages for this course content item.',
      infoLines,
      placeholder: 'No messages yet.',
      canPost: true
    });
  }

  protected buildQuery(): MessageQuery | null {
    if (!this.context) {
      return null;
    }
    return {
      course_content_id: this.context.courseContentId
    };
  }

  protected buildCreatePayload(input: MessageInput): MessageCreate | null {
    if (!this.context) {
      return null;
    }
    return {
      title: input.title || this.deriveTitle(input.content),
      content: input.content,
      course_content_id: this.context.courseContentId
    };
  }

  protected emptyStateDetails(): ContextDetails {
    return {
      contextKey: null,
      heading: 'Lecturer Messages',
      description: 'Select a course content item to review messages.',
      infoLines: [],
      placeholder: 'No content selected.',
      canPost: false
    };
  }
}

export class TutorCommentsPanelProvider extends BaseMessagesPanelProvider {
  public static readonly viewType = 'computor.tutor.comments';
  private context: { courseMemberId: string; memberLabel?: string | null } | null = null;

  constructor(extensionUri: vscode.Uri, api: ComputorApiService) {
    super(extensionUri, api);
    this.setEmptyContext();
  }

  updateMemberContext(member: { id: string; label: string } | null): void {
    if (!member) {
      this.context = null;
      this.setEmptyContext();
      return;
    }

    this.context = {
      courseMemberId: member.id,
      memberLabel: member.label
    };

    this.applyContextDetails({
      contextKey: member.id,
      heading: `Comments for ${member.label}`,
      description: 'Tutor-only notes for this course member.',
      infoLines: [`Course member ID: ${member.id}`],
      placeholder: 'No comments yet. Record your first note.',
      canPost: true
    });
  }

  protected buildQuery(): MessageQuery | null {
    if (!this.context) {
      return null;
    }
    return {
      course_member_id: this.context.courseMemberId
    };
  }

  protected buildCreatePayload(input: MessageInput): MessageCreate | null {
    if (!this.context) {
      return null;
    }
    return {
      title: input.title || this.deriveTitle(input.content),
      content: input.content,
      course_member_id: this.context.courseMemberId
    };
  }

  protected emptyStateDetails(): ContextDetails {
    return {
      contextKey: null,
      heading: 'Course Member Comments',
      description: 'Select a student to view tutor comments.',
      infoLines: [],
      placeholder: 'No student selected.',
      canPost: false
    };
  }
}
