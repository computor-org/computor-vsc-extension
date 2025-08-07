import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { OrganizationList } from '../../types/generated';
import { ComputorApiService } from '../../services/ComputorApiService';
import { LecturerTreeDataProvider } from '../tree/lecturer/LecturerTreeDataProvider';

export class OrganizationWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;
  private treeDataProvider?: LecturerTreeDataProvider;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService, treeDataProvider?: LecturerTreeDataProvider) {
    super(context, 'computor.organizationView');
    this.apiService = apiService;
    this.treeDataProvider = treeDataProvider;
  }

  protected async getWebviewContent(data?: {
    organization: OrganizationList;
  }): Promise<string> {
    if (!data) {
      return this.getBaseHtml('Organization', '<p>No organization data available</p>');
    }

    const { organization } = data;
    
    // Get course families count
    let familiesCount = 0;
    try {
      const families = await this.apiService.getCourseFamilies(organization.id);
      familiesCount = families.length;
    } catch (error) {
      console.error('Failed to get course families:', error);
    }
    
    const content = `
      <h1>${organization.title || organization.path}</h1>
      
      <div class="info-section">
        <h2>Organization Information</h2>
        <p><strong>ID:</strong> ${organization.id}</p>
        <p><strong>Path:</strong> ${organization.path}</p>
        <p><strong>Course Families:</strong> ${familiesCount}</p>
      </div>

      <div class="form-section">
        <h2>Edit Organization</h2>
        <form id="editOrganizationForm">
          <div class="form-group">
            <label for="title">Title</label>
            <input type="text" id="title" name="title" value="${organization.title || ''}" required />
          </div>
          
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="4"></textarea>
          </div>
          
          <div class="actions">
            <button type="submit" class="button">Save Changes</button>
            <button type="button" class="button secondary" onclick="refreshView()">Refresh</button>
          </div>
        </form>
      </div>

      <div class="actions-section">
        <h2>Actions</h2>
        <div class="actions">
          <button class="button" onclick="createCourseFamily()">Create Course Family</button>
          <button class="button secondary" onclick="showStatistics()">View Statistics</button>
          <button class="button secondary" onclick="exportData()">Export Data</button>
        </div>
      </div>

      <script>
        const organizationData = ${JSON.stringify(data)};
        
        // Handle form submission
        document.getElementById('editOrganizationForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          sendMessage('updateOrganization', {
            organizationId: organizationData.organization.id,
            updates: {
              title: formData.get('title'),
              description: formData.get('description')
            }
          });
        });
        
        function refreshView() {
          sendMessage('refresh', { organizationId: organizationData.organization.id });
        }
        
        function createCourseFamily() {
          sendMessage('createCourseFamily', { organizationId: organizationData.organization.id });
        }
        
        function showStatistics() {
          sendMessage('showStatistics', { organizationId: organizationData.organization.id });
        }
        
        function exportData() {
          sendMessage('exportData', { organizationId: organizationData.organization.id });
        }
      </script>
    `;

    return this.getBaseHtml(`Organization: ${organization.title || organization.path}`, content);
  }

  protected async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'updateOrganization':
        try {
          await this.apiService.updateOrganization(message.data.organizationId, message.data.updates);
          vscode.window.showInformationMessage('Organization updated successfully');
          this.panel?.webview.postMessage({ command: 'updateSuccess' });
          
          // Update tree with changes
          if (this.treeDataProvider) {
            this.treeDataProvider.updateNode('organization', message.data.organizationId, message.data.updates);
          } else {
            vscode.commands.executeCommand('computor.refreshLecturerTree');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update organization: ${error}`);
        }
        break;

      case 'refresh':
        vscode.commands.executeCommand('computor.refreshLecturerTree');
        break;

      case 'createCourseFamily':
        vscode.window.showInformationMessage('Course family creation coming soon!');
        break;

      case 'showStatistics':
        vscode.window.showInformationMessage('Organization statistics coming soon!');
        break;

      case 'exportData':
        vscode.window.showInformationMessage('Data export functionality coming soon!');
        break;
    }
  }
}