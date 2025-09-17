import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { ComputorApiService } from '../../services/ComputorApiService';
import { CourseMemberCommentList } from '../../types/generated';

interface CommentsWebviewData {
  courseMemberId: string;
  title: string;
  comments: CourseMemberCommentList[];
}

export class CourseMemberCommentsWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService) {
    super(context, 'computor.courseMemberComments');
    this.apiService = apiService;
  }

  async showComments(courseMemberId: string, title: string): Promise<void> {
    const comments = await this.apiService.listCourseMemberComments(courseMemberId);
    const payload: CommentsWebviewData = { courseMemberId, title, comments };
    await this.show(`Comments: ${title}`, payload);
  }

  protected async getWebviewContent(data?: CommentsWebviewData): Promise<string> {
    if (!this.panel) {
      return this.getBaseHtml('Comments', '<p>Loading…</p>');
    }

    const webview = this.panel.webview;
    const nonce = this.getNonce();
    const initialState = JSON.stringify(data ?? { courseMemberId: '', title: 'Comments', comments: [] });
    const componentsCssUri = this.getWebviewUri(webview, 'webview-ui', 'components', 'components.css');
    const commentsCssUri = this.getWebviewUri(webview, 'webview-ui', 'comments.css');
    const componentsJsUri = this.getWebviewUri(webview, 'webview-ui', 'components.js');
    const commentsJsUri = this.getWebviewUri(webview, 'webview-ui', 'comments.js');
    const markedJsUri = this.getWebviewUri(webview, 'webview-ui', 'lib', 'marked.min.js');

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">
      <title>Course Member Comments</title>
      <link rel="stylesheet" href="${componentsCssUri}">
      <link rel="stylesheet" href="${commentsCssUri}">
    </head>
    <body>
      <div id="app"></div>
      <script nonce="${nonce}">
        window.vscodeApi = window.vscodeApi || acquireVsCodeApi();
        window.__INITIAL_STATE__ = ${initialState};
      </script>
      <script nonce="${nonce}" src="${markedJsUri}"></script>
      <script nonce="${nonce}" src="${componentsJsUri}"></script>
      <script nonce="${nonce}" src="${commentsJsUri}"></script>
    </body>
    </html>`;
  }

  protected async handleMessage(message: any): Promise<void> {
    if (!message) { return; }

    switch (message.command) {
      case 'createComment':
        await this.createComment(message.data);
        break;
      case 'updateComment':
        await this.updateComment(message.data);
        break;
      case 'deleteComment':
        await this.deleteComment(message.data);
        break;
      case 'refreshComments':
        await this.refreshComments();
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

  private getCourseMemberId(): string | undefined {
    const data = this.currentData as CommentsWebviewData | undefined;
    return data?.courseMemberId;
  }

  private updateCurrentData(comments: CourseMemberCommentList[]): void {
    const current = this.currentData as CommentsWebviewData | undefined;
    if (!current) {
      return;
    }
    this.currentData = { ...current, comments } satisfies CommentsWebviewData;
  }

  private postLoadingState(loading: boolean): void {
    if (!this.panel) {
      return;
    }
    this.panel.webview.postMessage({ command: 'setLoading', data: { loading } });
  }

  private postComments(comments: CourseMemberCommentList[]): void {
    if (!this.panel) {
      return;
    }
    this.panel.webview.postMessage({ command: 'updateComments', data: comments });
  }

  private async createComment(data: { message: string }): Promise<void> {
    const courseMemberId = this.getCourseMemberId();
    if (!courseMemberId) {
      vscode.window.showWarningMessage('Unable to create comment: missing course member context.');
      return;
    }

    try {
      this.postLoadingState(true);
      const comments = await this.apiService.createCourseMemberComment(courseMemberId, data.message);
      this.updateCurrentData(comments);
      this.postComments(comments);
      this.postLoadingState(false);
      vscode.window.showInformationMessage('Comment added.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create comment: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private async updateComment(data: { commentId: string; message: string }): Promise<void> {
    const courseMemberId = this.getCourseMemberId();
    if (!courseMemberId || !data?.commentId) {
      return;
    }

    try {
      this.postLoadingState(true);
      const comments = await this.apiService.updateCourseMemberComment(courseMemberId, data.commentId, data.message);
      this.updateCurrentData(comments);
      this.postComments(comments);
      this.postLoadingState(false);
      vscode.window.showInformationMessage('Comment updated.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to update comment: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private async deleteComment(data: { commentId: string }): Promise<void> {
    const courseMemberId = this.getCourseMemberId();
    if (!courseMemberId || !data?.commentId) {
      return;
    }

    try {
      this.postLoadingState(true);
      const comments = await this.apiService.deleteCourseMemberComment(courseMemberId, data.commentId);
      this.updateCurrentData(comments);
      this.postComments(comments);
      this.postLoadingState(false);
      vscode.window.showInformationMessage('Comment deleted.');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to delete comment: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }

  private async refreshComments(): Promise<void> {
    const courseMemberId = this.getCourseMemberId();
    if (!courseMemberId || !this.panel) {
      return;
    }

    try {
      this.postLoadingState(true);
      const comments = await this.apiService.listCourseMemberComments(courseMemberId);
      this.updateCurrentData(comments);
      this.postComments(comments);
      this.postLoadingState(false);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to refresh comments: ${error?.message || error}`);
      this.postLoadingState(false);
    }
  }
}
