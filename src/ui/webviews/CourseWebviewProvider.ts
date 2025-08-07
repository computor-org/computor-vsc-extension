import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { CourseList, CourseFamilyList, OrganizationList } from '../../types/generated';
import { ComputorApiService } from '../../services/ComputorApiService';
import { LecturerTreeDataProvider } from '../tree/lecturer/LecturerTreeDataProvider';

export class CourseWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;
  private treeDataProvider?: LecturerTreeDataProvider;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService, treeDataProvider?: LecturerTreeDataProvider) {
    super(context, 'computor.courseView');
    this.apiService = apiService;
    this.treeDataProvider = treeDataProvider;
    void this.treeDataProvider; // Temporarily unused for debugging
  }

  protected async getWebviewContent(data?: {
    course: CourseList;
    courseFamily: CourseFamilyList;
    organization: OrganizationList;
  }): Promise<string> {
    if (!data) {
      return this.getBaseHtml('Course', '<p>No course data available</p>');
    }

    const { course, courseFamily, organization } = data;
    
    const content = `
      <h1>${course.title || course.path}</h1>
      
      <div class="info-section">
        <h2>Course Information</h2>
        <p><strong>ID:</strong> ${course.id}</p>
        <p><strong>Path:</strong> ${course.path}</p>
        <p><strong>Course Family:</strong> ${courseFamily.title || courseFamily.path}</p>
        <p><strong>Organization:</strong> ${organization.title || organization.path}</p>
        ${course.properties?.gitlab ? `
          <p><strong>GitLab Repository:</strong> <a href="${course.properties.gitlab.url}">${course.properties.gitlab.url}</a></p>
        ` : ''}
      </div>

      <div class="form-section">
        <h2>Edit Course</h2>
        <form id="editCourseForm">
          <div class="form-group">
            <label for="title">Title</label>
            <input type="text" id="title" name="title" value="${course.title || ''}" />
          </div>
          
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="4"></textarea>
          </div>
          
          <div class="form-group">
            <label for="gitlabUrl">GitLab Repository URL</label>
            <input type="url" id="gitlabUrl" name="gitlabUrl" value="${course.properties?.gitlab?.url || ''}" />
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
          <button class="button" onclick="openInGitLab()">Open in GitLab</button>
          <button class="button" onclick="cloneRepository()">Clone Repository</button>
          <button class="button" onclick="releaseContent()">Release Content</button>
          <button class="button secondary" onclick="showMembers()">Manage Members</button>
        </div>
      </div>

      <script>
        const courseData = ${JSON.stringify(data)};
        
        // Error handling
        window.addEventListener('error', (e) => {
          console.error('Webview error:', e.error);
        });
        
        // Handle form submission
        document.getElementById('editCourseForm').addEventListener('submit', (e) => {
          try {
            e.preventDefault();
            const formData = new FormData(e.target);
            sendMessage('updateCourse', {
              courseId: courseData.course.id,
              updates: {
                title: formData.get('title'),
                description: formData.get('description'),
                properties: {
                  gitlab: formData.get('gitlabUrl') ? {
                    url: formData.get('gitlabUrl')
                  } : null
                }
              }
            });
          } catch (error) {
            console.error('Form submission error:', error);
          }
        });
        
        function refreshView() {
          sendMessage('refresh', { courseId: courseData.course.id });
        }
        
        function openInGitLab() {
          sendMessage('openInGitLab', { url: courseData.course.properties?.gitlab?.url });
        }
        
        function cloneRepository() {
          sendMessage('cloneRepository', { 
            courseId: courseData.course.id,
            url: courseData.course.properties?.gitlab?.url 
          });
        }
        
        function releaseContent() {
          sendMessage('releaseContent', { courseId: courseData.course.id });
        }
        
        function showMembers() {
          sendMessage('showMembers', { courseId: courseData.course.id });
        }
        
        // Override updateView
        function updateView(data) {
          // Update form fields with new data if provided
          if (data && data.course) {
            document.getElementById('title').value = data.course.title || '';
            document.getElementById('gitlabUrl').value = data.course.properties?.gitlab?.url || '';
            courseData.course = data.course;
          }
        }
      </script>
    `;

    return this.getBaseHtml(`Course: ${course.title || course.path}`, content);
  }

  protected async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'updateCourse':
        try {
          await this.apiService.updateCourse(message.data.courseId, message.data.updates);
          vscode.window.showInformationMessage('Course updated successfully');
          
          // Update tree with changes
          // Temporarily disabled to debug webview content disappearing
          // if (this.treeDataProvider) {
          //   this.treeDataProvider.updateNode('course', message.data.courseId, message.data.updates);
          // }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update course: ${error}`);
        }
        break;

      case 'refresh':
        // Reload the webview with fresh data
        if (message.data.courseId) {
          const course = await this.apiService.getCourse(message.data.courseId);
          if (course && this.panel) {
            this.panel.webview.postMessage({ command: 'update', data: { course } });
          }
        }
        break;

      case 'openInGitLab':
        if (message.data.url) {
          vscode.env.openExternal(vscode.Uri.parse(message.data.url));
        }
        break;

      case 'cloneRepository':
        vscode.commands.executeCommand('computor.cloneCourseRepository', message.data);
        break;

      case 'releaseContent':
        vscode.commands.executeCommand('computor.releaseCourseContent', message.data);
        break;

      case 'showMembers':
        vscode.window.showInformationMessage('Member management coming soon!');
        break;
    }
  }
}