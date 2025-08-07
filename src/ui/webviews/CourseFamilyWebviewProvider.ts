import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { CourseFamilyList, OrganizationList } from '../../types/generated';
import { ComputorApiService } from '../../services/ComputorApiService';

export class CourseFamilyWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService) {
    super(context, 'computor.courseFamilyView');
    this.apiService = apiService;
  }

  protected async getWebviewContent(data?: {
    courseFamily: CourseFamilyList;
    organization: OrganizationList;
  }): Promise<string> {
    if (!data) {
      return this.getBaseHtml('Course Family', '<p>No course family data available</p>');
    }

    const { courseFamily, organization } = data;
    
    // Get courses count
    let coursesCount = 0;
    try {
      const courses = await this.apiService.getCourses(courseFamily.id);
      coursesCount = courses.length;
    } catch (error) {
      console.error('Failed to get courses:', error);
    }
    
    const content = `
      <h1>${courseFamily.title || courseFamily.path}</h1>
      
      <div class="info-section">
        <h2>Course Family Information</h2>
        <p><strong>ID:</strong> ${courseFamily.id}</p>
        <p><strong>Path:</strong> ${courseFamily.path}</p>
        <p><strong>Organization:</strong> ${organization.title || organization.path}</p>
        <p><strong>Courses:</strong> ${coursesCount}</p>
      </div>

      <div class="form-section">
        <h2>Edit Course Family</h2>
        <form id="editCourseFamilyForm">
          <div class="form-group">
            <label for="title">Title</label>
            <input type="text" id="title" name="title" value="${courseFamily.title || ''}" required />
          </div>
          
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="4"></textarea>
          </div>
          
          <div class="form-group">
            <label for="path">Path</label>
            <input type="text" id="path" name="path" value="${courseFamily.path}" required />
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
          <button class="button" onclick="createCourse()">Create Course</button>
          <button class="button secondary" onclick="cloneFamily()">Clone Course Family</button>
          <button class="button secondary" onclick="archiveFamily()">Archive Family</button>
        </div>
      </div>

      <script>
        const familyData = ${JSON.stringify(data)};
        
        // Handle form submission
        document.getElementById('editCourseFamilyForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          sendMessage('updateCourseFamily', {
            familyId: familyData.courseFamily.id,
            updates: {
              title: formData.get('title'),
              description: formData.get('description'),
              path: formData.get('path')
            }
          });
        });
        
        function refreshView() {
          sendMessage('refresh', { familyId: familyData.courseFamily.id });
        }
        
        function createCourse() {
          sendMessage('createCourse', { 
            familyId: familyData.courseFamily.id,
            organizationId: familyData.organization.id 
          });
        }
        
        function cloneFamily() {
          sendMessage('cloneFamily', { familyId: familyData.courseFamily.id });
        }
        
        function archiveFamily() {
          if (confirm('Are you sure you want to archive this course family?')) {
            sendMessage('archiveFamily', { familyId: familyData.courseFamily.id });
          }
        }
      </script>
    `;

    return this.getBaseHtml(`Course Family: ${courseFamily.title || courseFamily.path}`, content);
  }

  protected async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'updateCourseFamily':
        try {
          await this.apiService.updateCourseFamily(message.data.familyId, message.data.updates);
          vscode.window.showInformationMessage('Course family updated successfully');
          this.panel?.webview.postMessage({ command: 'updateSuccess' });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update course family: ${error}`);
        }
        break;

      case 'refresh':
        vscode.commands.executeCommand('computor.refreshLecturerTree');
        break;

      case 'createCourse':
        vscode.window.showInformationMessage('Course creation coming soon!');
        break;

      case 'cloneFamily':
        vscode.window.showInformationMessage('Course family cloning coming soon!');
        break;

      case 'archiveFamily':
        vscode.window.showInformationMessage('Archive functionality coming soon!');
        break;
    }
  }
}