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
    await this.show(`Comments: ${title}`, { courseMemberId, title, comments } as CommentsWebviewData);
  }

  protected async getWebviewContent(data?: CommentsWebviewData): Promise<string> {
    const heading = data?.title ?? 'Course Member Comments';
    const initialState = JSON.stringify(data ?? { courseMemberId: '', title: heading, comments: [] });

    const script = `<script nonce="{{NONCE}}">
const state = ${initialState};
function escapeHtml(value) {
  if (value === undefined || value === null) { return ''; }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderComments(comments) {
  const container = document.getElementById("commentsContainer");
  if (!container) { return; }
  if (!comments || comments.length === 0) {
    container.innerHTML = '<p class="muted">No comments yet.</p>';
    return;
  }
  const items = comments.map(function(comment) {
    const timestamp = comment.updated_at || comment.created_at;
    const formattedTime = timestamp ? new Date(timestamp).toLocaleString() : '';
    const author = comment.transmitter?.user?.given_name && comment.transmitter?.user?.family_name
      ? comment.transmitter.user.given_name + ' ' + comment.transmitter.user.family_name
      : (comment.transmitter_id || 'unknown');
    return [
      '<article class="comment" data-id="' + comment.id + '">',
      '  <header class="comment-header">',
      '    <span class="comment-author">' + escapeHtml(author) + '</span>',
      '    <span class="comment-time">' + escapeHtml(formattedTime) + '</span>',
      '  </header>',
      '  <div class="comment-body">' + escapeHtml((comment.message || '').replace(/\\n/g, '<br/>')) + '</div>',
      '  <div class="comment-actions">',
      '    <button class="button secondary" data-action="edit" data-id="' + comment.id + '">Edit</button>',
      '    <button class="button secondary" data-action="delete" data-id="' + comment.id + '">Delete</button>',
      '  </div>',
      '</article>'
    ].join('\\n');
  });
  container.innerHTML = items.join('\\n');
}
function updateView(data) {
  if (!data) { return; }
  state.courseMemberId = data.courseMemberId || state.courseMemberId;
  state.title = data.title || state.title;
  state.comments = data.comments || [];
  renderComments(state.comments);
}
document.getElementById("refreshButton")?.addEventListener("click", function() {
  sendMessage('refreshComments', { courseMemberId: state.courseMemberId });
});
document.getElementById("commentForm")?.addEventListener("submit", function(event) {
  event.preventDefault();
  const messageInput = document.getElementById("commentMessage");
  if (!messageInput) { return; }
  const message = messageInput.value.trim();
  if (!message) { return; }
  sendMessage('createComment', { courseMemberId: state.courseMemberId, message: message });
  messageInput.value = '';
});
document.getElementById("commentsContainer")?.addEventListener("click", function(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) { return; }
  const action = target.dataset.action;
  const commentId = target.dataset.id;
  if (!action || !commentId) { return; }
  if (action === 'edit') {
    const comment = state.comments.find(function(c) { return c.id === commentId; });
    if (!comment) { return; }
    const updated = prompt('Edit comment', comment.message || '');
    if (updated !== null) {
      sendMessage('updateComment', { courseMemberId: state.courseMemberId, commentId: commentId, message: updated });
    }
  } else if (action === 'delete') {
    const confirmed = confirm('Delete this comment?');
    if (confirmed) {
      sendMessage('deleteComment', { courseMemberId: state.courseMemberId, commentId: commentId });
    }
  }
});
window.addEventListener("message", function(event) {
  const message = event.data;
  if (!message) { return; }
  if (message.command === 'updateComments') {
    updateView({ courseMemberId: state.courseMemberId, title: state.title, comments: message.data });
  } else if (message.command === 'update') {
    updateView(message.data);
  }
});
updateView(state);
</script>`;

    const style = `<style>
  .comments {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 16px 0;
  }
  .comment {
    border: 1px solid var(--vscode-editorWidget-border);
    border-radius: 4px;
    padding: 12px;
    background: var(--vscode-editorWidget-background);
  }
  .comment-header {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 8px;
  }
  .comment-body {
    margin-bottom: 8px;
    white-space: pre-wrap;
  }
  .comment-actions {
    display: flex;
    gap: 8px;
  }
  .muted {
    color: var(--vscode-descriptionForeground);
  }
</style>`;

    const content = `
<h1>${heading}</h1>
<div class="actions">
  <button class="button" id="refreshButton">Refresh</button>
</div>
<section class="comments" id="commentsContainer"></section>
<section class="form-section">
  <h2>New Comment</h2>
  <form id="commentForm">
    <div class="form-group">
      <label for="commentMessage">Comment</label>
      <textarea id="commentMessage" name="commentMessage" rows="5" required></textarea>
    </div>
    <div class="actions">
      <button class="button" type="submit">Add Comment</button>
    </div>
  </form>
</section>
${script}
${style}
`;

    return this.getBaseHtml(`Comments: ${heading}`, content);
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
    }
  }

  private getCourseMemberId(): string | undefined {
    const data = this.currentData as CommentsWebviewData | undefined;
    return data?.courseMemberId;
  }

  private async createComment(data: { courseMemberId: string; message: string }): Promise<void> {
    try {
      const comments = await this.apiService.createCourseMemberComment(data.courseMemberId, data.message);
      this.currentData = { ...(this.currentData as CommentsWebviewData), comments };
      this.panel?.webview.postMessage({ command: 'updateComments', data: comments });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create comment: ${error?.message || error}`);
    }
  }

  private async updateComment(data: { courseMemberId: string; commentId: string; message: string }): Promise<void> {
    try {
      const comments = await this.apiService.updateCourseMemberComment(data.courseMemberId, data.commentId, data.message);
      this.currentData = { ...(this.currentData as CommentsWebviewData), comments };
      this.panel?.webview.postMessage({ command: 'updateComments', data: comments });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to update comment: ${error?.message || error}`);
    }
  }

  private async deleteComment(data: { courseMemberId: string; commentId: string }): Promise<void> {
    try {
      const comments = await this.apiService.deleteCourseMemberComment(data.courseMemberId, data.commentId);
      this.currentData = { ...(this.currentData as CommentsWebviewData), comments };
      this.panel?.webview.postMessage({ command: 'updateComments', data: comments });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to delete comment: ${error?.message || error}`);
    }
  }

  private async refreshComments(): Promise<void> {
    const courseMemberId = this.getCourseMemberId();
    if (!courseMemberId || !this.panel) return;
    try {
      const comments = await this.apiService.listCourseMemberComments(courseMemberId);
      this.currentData = { ...(this.currentData as CommentsWebviewData), comments };
      this.panel.webview.postMessage({ command: 'updateComments', data: comments });
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to refresh comments: ${error?.message || error}`);
    }
  }
}
