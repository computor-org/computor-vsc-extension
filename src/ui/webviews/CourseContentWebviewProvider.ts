import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { CourseContentList, CourseList, CourseContentTypeList } from '../../types/generated';
import { ComputorApiService } from '../../services/ComputorApiService';
import { LecturerTreeDataProvider } from '../tree/lecturer/LecturerTreeDataProvider';

export class CourseContentWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;
  private treeDataProvider?: LecturerTreeDataProvider;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService, treeDataProvider?: LecturerTreeDataProvider) {
    super(context, 'computor.courseContentView');
    this.apiService = apiService;
    this.treeDataProvider = treeDataProvider;
  }

  protected async getWebviewContent(data?: {
    courseContent: CourseContentList;
    course: CourseList;
    contentType?: CourseContentTypeList;
    exampleInfo?: any;
    isSubmittable: boolean;
  }): Promise<string> {
    if (!data) {
      return this.getBaseHtml('Course Content', '<p>No content data available</p>');
    }

    const { courseContent, contentType, exampleInfo, isSubmittable } = data;
    
    const content = `
      <h1>${courseContent.title || courseContent.path}</h1>
      
      <div class="info-section">
        <h2>Content Information</h2>
        <p><strong>ID:</strong> ${courseContent.id}</p>
        <p><strong>Path:</strong> ${courseContent.path}</p>
        <p><strong>Position:</strong> ${courseContent.position}</p>
        <p><strong>Type:</strong> ${contentType?.title || 'Unknown'} 
          ${contentType?.color ? `<span style="display: inline-block; width: 16px; height: 16px; background-color: ${contentType.color}; border-radius: 50%; vertical-align: middle; margin-left: 8px;"></span>` : ''}
        </p>
        <p><strong>Submittable:</strong> ${isSubmittable ? 'Yes' : 'No'}</p>
        ${courseContent.max_group_size ? `<p><strong>Max Group Size:</strong> ${courseContent.max_group_size}</p>` : ''}
      </div>

      ${courseContent.example_id ? `
        <div class="info-section">
          <h2>Assigned Example</h2>
          <p><strong>Example:</strong> ${exampleInfo?.title || 'Unknown'}</p>
          <p><strong>Version:</strong> ${courseContent.example_version || 'latest'}</p>
          ${isSubmittable && courseContent.deployment_status ? `
            <p><strong>Deployment Status:</strong> 
              <span class="status ${courseContent.deployment_status === 'deployed' ? 'success' : 'pending'}">
                ${courseContent.deployment_status}
              </span>
            </p>
          ` : ''}
          <div class="actions">
            <button class="button secondary" onclick="unassignExample()">Unassign Example</button>
            <button class="button" onclick="updateExample()">Update Example</button>
          </div>
        </div>
      ` : `
        <div class="info-section">
          <h2>No Example Assigned</h2>
          <p>This content does not have an example assigned yet.</p>
          <button class="button" onclick="assignExample()">Assign Example</button>
        </div>
      `}

      <div class="form-section">
        <h2>Edit Content</h2>
        <form id="editContentForm">
          <div class="form-group">
            <label for="title">Title</label>
            <input type="text" id="title" name="title" value="${courseContent.title || ''}" required />
          </div>
          
          <div class="form-group">
            <label for="description">Description</label>
            <textarea id="description" name="description" rows="4"></textarea>
          </div>
          
          ${isSubmittable ? `
            <div class="form-group">
              <label for="maxGroupSize">Max Group Size</label>
              <input type="number" id="maxGroupSize" name="maxGroupSize" min="1" value="${courseContent.max_group_size || ''}" />
            </div>
          ` : ''}
          
          <div class="actions">
            <button type="submit" class="button">Save Changes</button>
            <button type="button" class="button secondary" onclick="refreshView()">Refresh</button>
          </div>
        </form>
      </div>

      <div class="actions-section">
        <h2>Actions</h2>
        <div class="actions">
          <button class="button" onclick="createChild()">Create Child Content</button>
          <button class="button secondary" onclick="moveContent()">Move/Reorder</button>
          <button class="button secondary" style="background-color: var(--vscode-inputValidation-errorBackground);" onclick="deleteContent()">Delete</button>
        </div>
      </div>

      <script>
        const contentData = ${JSON.stringify(data)};
        
        // Handle form submission
        document.getElementById('editContentForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          const updates = {
            title: formData.get('title'),
            description: formData.get('description')
          };
          
          if (contentData.isSubmittable) {
            const maxGroupSize = formData.get('maxGroupSize');
            if (maxGroupSize) {
              updates.max_group_size = parseInt(maxGroupSize);
            }
          }
          
          sendMessage('updateContent', {
            courseId: contentData.course.id,
            contentId: contentData.courseContent.id,
            updates
          });
        });
        
        function refreshView() {
          sendMessage('refresh', { 
            courseId: contentData.course.id,
            contentId: contentData.courseContent.id 
          });
        }
        
        function assignExample() {
          sendMessage('assignExample', { 
            courseId: contentData.course.id,
            contentId: contentData.courseContent.id 
          });
        }
        
        function unassignExample() {
          sendMessage('unassignExample', { 
            courseId: contentData.course.id,
            contentId: contentData.courseContent.id 
          });
        }
        
        function updateExample() {
          sendMessage('updateExample', { 
            courseId: contentData.course.id,
            contentId: contentData.courseContent.id 
          });
        }
        
        function createChild() {
          sendMessage('createChild', { 
            courseId: contentData.course.id,
            parentContent: contentData.courseContent 
          });
        }
        
        function moveContent() {
          sendMessage('moveContent', { 
            courseId: contentData.course.id,
            contentId: contentData.courseContent.id 
          });
        }
        
        function deleteContent() {
          if (confirm('Are you sure you want to delete this content? This action cannot be undone.')) {
            sendMessage('deleteContent', { 
              courseId: contentData.course.id,
              contentId: contentData.courseContent.id 
            });
          }
        }
      </script>
    `;

    return this.getBaseHtml(`Content: ${courseContent.title || courseContent.path}`, content);
  }

  protected async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'updateContent':
        try {
          await this.apiService.updateCourseContent(
            message.data.courseId,
            message.data.contentId,
            message.data.updates
          );
          vscode.window.showInformationMessage('Content updated successfully');
          
          // Update tree with changes
          if (this.treeDataProvider) {
            this.treeDataProvider.updateNode('courseContent', message.data.contentId, {
              ...message.data.updates,
              course_id: message.data.courseId
            });
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update content: ${error}`);
        }
        break;

      case 'refresh':
        // Trigger tree refresh
        vscode.commands.executeCommand('computor.refreshLecturerTree');
        break;

      case 'assignExample':
        vscode.commands.executeCommand('computor.assignExample', message.data);
        break;

      case 'unassignExample':
        vscode.commands.executeCommand('computor.unassignExample', message.data);
        break;

      case 'updateExample':
        vscode.window.showInformationMessage('Example update functionality coming soon!');
        break;

      case 'createChild':
        vscode.commands.executeCommand('computor.createCourseContent', message.data);
        break;

      case 'moveContent':
        vscode.window.showInformationMessage('Content reordering coming soon!');
        break;

      case 'deleteContent':
        vscode.commands.executeCommand('computor.deleteCourseContent', message.data);
        // Close the webview after deletion
        this.panel?.dispose();
        break;
    }
  }
}