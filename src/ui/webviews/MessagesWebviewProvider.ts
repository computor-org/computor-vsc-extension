import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { ComputorApiService } from '../../services/ComputorApiService';
import { MessageList, MessageCreate, MessageUpdate } from '../../types/generated';

export type MessageTargetType = 'course' | 'courseGroup' | 'courseContent' | 'submissionGroup' | 'courseMember';

export interface MessageTargetContext {
  title: string;
  subtitle?: string;
  query: Record<string, string>;
  createPayload: Partial<MessageCreate>;
}

interface MessagesWebviewData {
  target: MessageTargetContext;
  messages: EnrichedMessage[];
  identity?: { id: string; username: string; full_name?: string };
}

type EnrichedMessage = MessageList & {
  author_display?: string;
  author_name?: string;
  can_edit?: boolean;
  can_delete?: boolean;
};

export class MessagesWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService) {
    super(context, 'computor.messagesView');
    this.apiService = apiService;
  }

  async showMessages(target: MessageTargetContext): Promise<void> {
    const [identity, rawMessages] = await Promise.all([
      this.apiService.getCurrentUser().catch(() => undefined),
      this.apiService.listMessages(target.query)
    ]);

    const messages = this.enrichMessages(rawMessages, identity);
    const payload: MessagesWebviewData = { target, messages, identity };
    await this.show(`Messages: ${target.title}`, payload);
  }

  protected async getWebviewContent(data?: MessagesWebviewData): Promise<string> {
    if (!this.panel) {
      return this.getBaseHtml('Messages', '<p>Loading…</p>');
    }

    const webview = this.panel.webview;
    const nonce = this.getNonce();
    const initialState = JSON.stringify(data ?? { target: null, messages: [] });
    const componentsCssUri = this.getWebviewUri(webview, 'webview-ui', 'components', 'components.css');
    const messagesCssUri = this.getWebviewUri(webview, 'webview-ui', 'messages.css');
    const componentsJsUri = this.getWebviewUri(webview, 'webview-ui', 'components.js');
    const messagesJsUri = this.getWebviewUri(webview, 'webview-ui', 'messages.js');
    const markedJsUri = this.getWebviewUri(webview, 'webview-ui', 'lib', 'marked.min.js');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
      <title>Messages</title>
      <link rel="stylesheet" href="${componentsCssUri}">
      <link rel="stylesheet" href="${messagesCssUri}">
    </head>
    <body>
      <div id="app"></div>
      <script nonce="${nonce}">
        window.vscodeApi = window.vscodeApi || acquireVsCodeApi();
        window.__INITIAL_STATE__ = ${initialState};
      </script>
      <script nonce="${nonce}" src="${markedJsUri}"></script>
      <script nonce="${nonce}" src="${componentsJsUri}"></script>
      <script nonce="${nonce}" src="${messagesJsUri}"></script>
    </body>
    </html>`;
  }

  protected async handleMessage(message: any): Promise<void> {
    if (!message) {
      return;
    }

    switch (message.command) {
      case 'createMessage':
        await this.handleCreateMessage(message.data);
        break;
      case 'updateMessage':
        await this.handleUpdateMessage(message.data);
        break;
      case 'deleteMessage':
        await this.handleDeleteMessage(message.data);
        break;
      case 'refreshMessages':
        await this.refreshMessages();
        break;
      case 'showWarning':
        if (message.data) {
          vscode.window.showWarningMessage(String(message.data));
        }
        break;
      default:
        break;
    }
  }

  private getCurrentTarget(): MessageTargetContext | undefined {
    const data = this.currentData as MessagesWebviewData | undefined;
    return data?.target;
  }

  private getIdentity(): { id: string; username: string; full_name?: string } | undefined {
    const data = this.currentData as MessagesWebviewData | undefined;
    return data?.identity;
  }

  private async handleCreateMessage(data: { title: string; content: string; parent_id?: string }): Promise<void> {
    const target = this.getCurrentTarget();
    if (!target) {
      vscode.window.showWarningMessage('Unable to post message: target context missing.');
      return;
    }

    const level = this.resolveMessageLevel(data.parent_id);
    const payload: MessageCreate = {
      title: data.title,
      content: data.content,
      parent_id: data.parent_id ?? null,
      level,
      ...target.createPayload
    } as MessageCreate;

    try {
      this.postLoadingState(true);
      await this.apiService.createMessage(payload);
      await this.refreshMessages();
      vscode.window.showInformationMessage('Message sent.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to send message: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private async handleUpdateMessage(data: { messageId: string; title: string; content: string }): Promise<void> {
    if (!data?.messageId) {
      return;
    }

    const updates: MessageUpdate = {
      title: data.title,
      content: data.content
    };

    try {
      this.postLoadingState(true);
      await this.apiService.updateMessage(data.messageId, updates);
      await this.refreshMessages();
      vscode.window.showInformationMessage('Message updated.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to update message: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private async handleDeleteMessage(data: { messageId: string }): Promise<void> {
    if (!data?.messageId) {
      return;
    }

    try {
      this.postLoadingState(true);
      await this.apiService.deleteMessage(data.messageId);
      await this.refreshMessages();
      vscode.window.showInformationMessage('Message deleted.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to delete message: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private async refreshMessages(): Promise<void> {
    const target = this.getCurrentTarget();
    if (!target || !this.panel) {
      return;
    }

    try {
      this.postLoadingState(true);
      const identity = (await this.apiService.getCurrentUser().catch(() => this.getIdentity())) || this.getIdentity();
      const rawMessages = await this.apiService.listMessages(target.query);
      const messages = this.enrichMessages(rawMessages, identity);
      this.currentData = { target, messages, identity } satisfies MessagesWebviewData;
      this.panel.webview.postMessage({ command: 'updateMessages', data: messages });
      this.postLoadingState(false);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to refresh messages: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private enrichMessages(messages: MessageList[], identity?: { id: string; username: string; full_name?: string }): EnrichedMessage[] {
    const currentUserId = identity?.id;

    return messages.map((message) => {
      const author = message.author;
      const trimmedParts = [author?.given_name, author?.family_name]
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter((part) => part.length > 0);
      const fullName = trimmedParts.join(' ');
      const hasFullName = fullName.length > 0;
      const canEdit = currentUserId ? message.author_id === currentUserId : false;

      return {
        ...message,
        author_display: hasFullName ? fullName : undefined,
        author_name: hasFullName ? fullName : undefined,
        can_edit: canEdit,
        can_delete: canEdit
      } satisfies EnrichedMessage;
    });
  }

  private resolveMessageLevel(parentId?: string): number {
    if (!parentId) {
      return 0;
    }

    const currentMessages = (this.currentData as MessagesWebviewData | undefined)?.messages ?? [];
    const parent = currentMessages.find((message) => message.id === parentId);
    if (!parent) {
      return 1;
    }
    return (parent.level ?? 0) + 1;
  }

  private postLoadingState(loading: boolean): void {
    if (!this.panel) {
      return;
    }
    this.panel.webview.postMessage({ command: 'setLoading', data: { loading } });
  }
}
