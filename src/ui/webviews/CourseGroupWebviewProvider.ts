import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { ComputorApiService } from '../../services/ComputorApiService';
import { LecturerTreeDataProvider } from '../tree/lecturer/LecturerTreeDataProvider';
import { CourseGroupGet, CourseMemberList } from '../../types/generated';

interface CourseGroupWebviewData {
  group: CourseGroupGet;
  members: CourseMemberList[];
  courseTitle: string;
  organizationTitle: string;
}

export class CourseGroupWebviewProvider extends BaseWebviewProvider {
  constructor(
    context: vscode.ExtensionContext,
    private apiService: ComputorApiService,
    private treeDataProvider: LecturerTreeDataProvider
  ) {
    super(context, 'courseGroupDetails');
  }

  protected async getWebviewContent(data?: CourseGroupWebviewData): Promise<string> {
    if (!data) {
      return '<div>Loading...</div>';
    }
    const group = data.group;
    const members = data.members;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Course Group Details</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            line-height: 1.4;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
          }
          
          .header {
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 16px;
            margin-bottom: 20px;
          }
          
          .title {
            font-size: 24px;
            font-weight: bold;
            margin: 0 0 8px 0;
            color: var(--vscode-textLink-foreground);
          }
          
          .subtitle {
            color: var(--vscode-descriptionForeground);
            margin: 0;
          }
          
          .section {
            margin-bottom: 24px;
          }
          
          .section-title {
            font-size: 16px;
            font-weight: bold;
            margin: 0 0 12px 0;
            color: var(--vscode-textLink-foreground);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .info-grid {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 8px 16px;
            margin-bottom: 16px;
          }
          
          .info-label {
            font-weight: bold;
            color: var(--vscode-textBlockQuote-foreground);
          }
          
          .info-value {
            color: var(--vscode-foreground);
            word-break: break-all;
          }
          
          .members-list {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .member-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px;
            margin-bottom: 4px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            border-left: 3px solid var(--vscode-textLink-foreground);
          }
          
          .member-icon {
            width: 16px;
            height: 16px;
            background-color: var(--vscode-textLink-foreground);
            border-radius: 50%;
            flex-shrink: 0;
          }
          
          .member-info {
            flex: 1;
          }
          
          .member-name {
            font-weight: bold;
            margin-bottom: 2px;
          }
          
          .member-details {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
          }
          
          .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
          }
          
          .actions {
            display: flex;
            gap: 12px;
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--vscode-panel-border);
          }
          
          .btn {
            padding: 8px 16px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          
          .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .btn-secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          
          .btn-secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
          }
          
          .icon {
            display: inline-block;
            width: 16px;
            height: 16px;
          }
          
          .stats {
            display: flex;
            gap: 20px;
            margin-bottom: 16px;
          }
          
          .stat-item {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 12px;
            border-radius: 4px;
            text-align: center;
            min-width: 80px;
          }
          
          .stat-number {
            font-size: 20px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
            display: block;
          }
          
          .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            margin-top: 4px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">📁 ${group.title || `Group ${group.id.slice(0, 8)}`}</h1>
          <p class="subtitle">Course: ${data.courseTitle} • Organization: ${data.organizationTitle}</p>
        </div>

        <div class="section">
          <h2 class="section-title">
            <span class="icon">ℹ️</span>
            Group Information
          </h2>
          <div class="info-grid">
            <div class="info-label">Group ID:</div>
            <div class="info-value">${group.id}</div>
            
            <div class="info-label">Title:</div>
            <div class="info-value">${group.title || 'No title set'}</div>
            
            <div class="info-label">Course ID:</div>
            <div class="info-value">${group.course_id}</div>
            
            ${group.description ? `
              <div class="info-label">Description:</div>
              <div class="info-value">${group.description}</div>
            ` : ''}
            
            ${group.created_at ? `
              <div class="info-label">Created:</div>
              <div class="info-value">${new Date(group.created_at).toLocaleString()}</div>
            ` : ''}
            
            ${group.updated_at ? `
              <div class="info-label">Last Updated:</div>
              <div class="info-value">${new Date(group.updated_at).toLocaleString()}</div>
            ` : ''}
          </div>
        </div>

        <div class="section">
          <h2 class="section-title">
            <span class="icon">👥</span>
            Members (${members.length})
          </h2>
          
          <div class="stats">
            <div class="stat-item">
              <span class="stat-number">${members.length}</span>
              <div class="stat-label">Total Members</div>
            </div>
          </div>

          ${members.length > 0 ? `
            <ul class="members-list">
              ${members.map(member => {
                const userName = member.user?.username || member.user?.email || `User ${member.user_id.slice(0, 8)}`;
                return `
                  <li class="member-item">
                    <div class="member-icon"></div>
                    <div class="member-info">
                      <div class="member-name">${userName}</div>
                      <div class="member-details">
                        User ID: ${member.user_id.slice(0, 16)}${member.user_id.length > 16 ? '...' : ''}
                        ${member.course_role_id ? ` • Role: ${member.course_role_id}` : ''}
                        ${member.user?.email && member.user.email !== userName ? ` • ${member.user.email}` : ''}
                      </div>
                    </div>
                  </li>
                `;
              }).join('')}
            </ul>
          ` : `
            <div class="empty-state">
              <div>👤</div>
              <p>No members in this group yet.</p>
            </div>
          `}
        </div>

        <div class="actions">
          <button class="btn" onclick="editGroup()">
            <span class="icon">✏️</span>
            Edit Group
          </button>
          <button class="btn btn-secondary" onclick="refreshData()">
            <span class="icon">🔄</span>
            Refresh
          </button>
        </div>

        <script nonce="{{NONCE}}">
          const vscode = acquireVsCodeApi();

          function editGroup() {
            vscode.postMessage({
              type: 'editGroup',
              groupId: '${group.id}'
            });
          }

          function refreshData() {
            vscode.postMessage({
              type: 'refresh'
            });
          }

          // Handle messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
              case 'refresh':
                // Refresh the webview content
                location.reload();
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  protected async handleMessage(message: any): Promise<void> {
    const data = this.currentData as CourseGroupWebviewData;
    if (!data) {
      return;
    }
    switch (message.type) {
      case 'editGroup':
        // TODO: Implement group editing
        vscode.window.showInformationMessage('Group editing not yet implemented');
        break;
        
      case 'refresh':
        // Refresh the webview data
        try {
          const updatedGroup = await this.apiService.getCourseGroup(data.group.id);
          if (updatedGroup) {
            const updatedMembers = await this.apiService.getCourseMembers(data.group.course_id, data.group.id);
            const newData = {
              ...data,
              group: updatedGroup,
              members: updatedMembers
            };
            this.currentData = newData;
            if (this.panel) {
              this.panel.webview.html = await this.getWebviewContent(newData);
            }
            this.treeDataProvider.refresh();
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to refresh group data: ${error}`);
        }
        break;
    }
  }
}