import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { ComputorApiService } from '../../services/ComputorApiService';
import { MessageList, MessageCreate } from '../../types/generated';

export type MessageTargetType = 'course' | 'courseGroup' | 'courseContent' | 'submissionGroup' | 'courseMember';

export interface MessageTargetContext {
  title: string;
  subtitle?: string;
  query: Record<string, string>;
  createPayload: Partial<MessageCreate>;
}

interface MessagesWebviewData {
  target: MessageTargetContext;
  messages: MessageList[];
}

export class MessagesWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService) {
    super(context, 'computor.messagesView');
    this.apiService = apiService;
  }

  async showMessages(target: MessageTargetContext): Promise<void> {
    const messages = await this.apiService.listMessages(target.query);
    await this.show(`Messages: ${target.title}`, { target, messages } as MessagesWebviewData);
  }

  protected async getWebviewContent(data?: MessagesWebviewData): Promise<string> {
    const heading = data?.target?.title ?? 'Messages';
    const subtitle = data?.target?.subtitle ? `<p class="subtitle">${data.target.subtitle}</p>` : '';
    const initialState = JSON.stringify(data ?? { target: null, messages: [] });
    const contentLines = [
      `<h1>${heading}</h1>`,
      subtitle,
      '<div class="actions">',
      '  <button class="button" id="refreshButton">Refresh</button>',
      '</div>',
      '<section class="messages" id="messagesContainer"></section>',
      '<section class="form-section">',
      '  <h2>New Message</h2>',
      '  <form id="messageForm">',
      '    <div class="form-group">',
      '      <label for="messageTitle">Title</label>',
      '      <input id="messageTitle" name="messageTitle" type="text" required />',
      '    </div>',
      '    <div class="form-group">',
      '      <label for="messageBody">Message</label>',
      '      <textarea id="messageBody" name="messageBody" rows="6" required></textarea>',
      '    </div>',
      '    <div class="actions">',
      '      <button class="button" type="submit">Send Message</button>',
      '    </div>',
      '  </form>',
      '</section>',
      '<script nonce="{{NONCE}}">',
      `const state = ${initialState};`,
      'function escapeHtml(value) {',
      '  if (value === undefined || value === null) { return \'\'; }',
      '  return String(value)',
      '    .replace(/&/g, \'&amp;\')',
      '    .replace(/</g, \'&lt;\')',
      '    .replace(/>/g, \'&gt;\')',
      '    .replace(/"/g, \'&quot;\')',
      '    .replace(/\'/g, \'&#39;\');',
      '}',
      'function renderMessages(messages) {',
      '  const container = document.getElementById("messagesContainer");',
      '  if (!container) { return; }',
      '  if (!messages || messages.length === 0) {',
      '    container.innerHTML = \'<p class="muted">No messages yet.</p>\';',
      '    return;',
      '  }',
      '  const items = messages.map(function(message) {',
      '    const timestamp = message.updated_at || message.created_at;',
      '    const formattedTime = timestamp ? new Date(timestamp).toLocaleString() : \'\';',
      '    return [',
      '      \'<article class="message">\'',
      '      \'  <header class="message-header">\'',
      '      \'    <span class="message-author">\' + escapeHtml(message.author_id || \'unknown\') + \'</span>\'',
      '      \'    <span class="message-time">\' + escapeHtml(formattedTime) + \'</span>\'',
      '      \'  </header>\'',
      '      \'  <h3 class="message-title">\' + escapeHtml(message.title) + \'</h3>\'',
      '      \'  <div class="message-body">\' + escapeHtml((message.content || \'\').replace(/\n/g, \'<br/>\')) + \'</div>\'',
      '      \'</article>\'',
      '    ].join("\\n");',
      '  });',
      '  container.innerHTML = items.join("\\n");',
      '}',
      'function updateView(data) {',
      '  if (!data) { return; }',
      '  state.target = data.target || state.target;',
      '  state.messages = data.messages || [];',
      '  renderMessages(state.messages);',
      '}',
      'document.getElementById("refreshButton")?.addEventListener("click", function() {',
      '  sendMessage(\'refreshMessages\', { target: state.target });',
      '});',
      'document.getElementById("messageForm")?.addEventListener("submit", function(event) {',
      '  event.preventDefault();',
      '  const titleInput = document.getElementById("messageTitle");',
      '  const bodyInput = document.getElementById("messageBody");',
      '  if (!titleInput || !bodyInput) { return; }',
      '  const title = titleInput.value.trim();',
      '  const content = bodyInput.value.trim();',
      '  if (!title || !content) { return; }',
      '  sendMessage(\'createMessage\', { target: state.target, title, content });',
      '  bodyInput.value = \'\';',
      '});',
      'window.addEventListener("message", function(event) {',
      '  const message = event.data;',
      '  if (!message) { return; }',
      '  if (message.command === "updateMessages") {',
      '    updateView({ target: state.target, messages: message.data });',
      '  } else if (message.command === "update") {',
      '    updateView(message.data);',
      '  }',
      '});',
      'updateView(state);',
      '</script>',
      '<style>',
      '  .subtitle {',
      '    color: var(--vscode-descriptionForeground);',
      '    margin-top: -12px;',
      '  }',
      '  .messages {',
      '    margin: 16px 0;',
      '    display: flex;',
      '    flex-direction: column;',
      '    gap: 12px;',
      '  }',
      '  .message {',
      '    border: 1px solid var(--vscode-editorWidget-border);',
      '    border-radius: 4px;',
      '    padding: 12px;',
      '    background: var(--vscode-editorWidget-background);',
      '  }',
      '  .message-header {',
      '    display: flex;',
      '    justify-content: space-between;',
      '    font-size: 12px;',
      '    color: var(--vscode-descriptionForeground);',
      '    margin-bottom: 8px;',
      '  }',
      '  .message-title {',
      '    margin: 4px 0 8px;',
      '    font-size: 14px;',
      '  }',
      '  .message-body {',
      '    white-space: pre-wrap;',
      '    line-height: 1.5;',
      '  }',
      '  .muted {',
      '    color: var(--vscode-descriptionForeground);',
      '  }',
      '</style>'
    ];

    const content = contentLines.join('\n');
    return this.getBaseHtml(`Messages: ${heading}`, content);
  }

  protected async handleMessage(message: any): Promise<void> {
    if (!message) {
      return;
    }

    switch (message.command) {
      case 'createMessage':
        await this.handleCreateMessage(message.data);
        break;
      case 'refreshMessages':
        await this.refreshMessages();
        break;
    }
  }

  private getCurrentTarget(): MessageTargetContext | undefined {
    const data = this.currentData as MessagesWebviewData | undefined;
    return data?.target;
  }

  private async handleCreateMessage(data: { target: MessageTargetContext; title: string; content: string; parent_id?: string }): Promise<void> {
    const target = data?.target || this.getCurrentTarget();
    if (!target) {
      vscode.window.showWarningMessage('Unable to post message: target context missing.');
      return;
    }

    const payload: MessageCreate = {
      title: data.title,
      content: data.content,
      parent_id: data.parent_id ?? null,
      level: data.parent_id ? 1 : 0,
      ...target.createPayload
    } as MessageCreate;

    try {
      await this.apiService.createMessage(payload);
      await this.refreshMessages();
      vscode.window.showInformationMessage('Message sent.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to send message: ${error?.message || error}`);
    }
  }

  private async refreshMessages(): Promise<void> {
    const target = this.getCurrentTarget();
    if (!target || !this.panel) {
      return;
    }

    try {
      const messages = await this.apiService.listMessages(target.query);
      this.currentData = { target, messages } satisfies MessagesWebviewData;
      this.panel.webview.postMessage({ command: 'updateMessages', data: messages });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to refresh messages: ${error?.message || error}`);
    }
  }
}
