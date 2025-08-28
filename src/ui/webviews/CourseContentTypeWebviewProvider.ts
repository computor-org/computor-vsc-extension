import * as vscode from 'vscode';
import { BaseWebviewProvider } from './BaseWebviewProvider';
import { CourseContentTypeList, CourseList, CourseContentKindList } from '../../types/generated';
import { ComputorApiService } from '../../services/ComputorApiService';
import { LecturerTreeDataProvider } from '../tree/lecturer/LecturerTreeDataProvider';

export class CourseContentTypeWebviewProvider extends BaseWebviewProvider {
  private apiService: ComputorApiService;
  private treeDataProvider?: LecturerTreeDataProvider;

  constructor(context: vscode.ExtensionContext, apiService: ComputorApiService, treeDataProvider?: LecturerTreeDataProvider) {
    super(context, 'computor.courseContentTypeView');
    this.apiService = apiService;
    this.treeDataProvider = treeDataProvider;
  }

  protected async getWebviewContent(data?: {
    contentType: CourseContentTypeList;
    course: CourseList;
    contentKind?: CourseContentKindList;
  }): Promise<string> {
    if (!data) {
      return this.getBaseHtml('Content Type', '<p>No content type data available</p>');
    }

    const { contentType, course, contentKind } = data;
    
    // Get content kind info if not provided
    let kind = contentKind;
    if (!kind) {
      try {
        const kinds = await this.apiService.getCourseContentKinds();
        kind = kinds.find(k => k.id === contentType.course_content_kind_id);
      } catch (error) {
        console.error('Failed to get content kind:', error);
      }
    }
    
    const content = `
      <h1>${contentType.title || contentType.slug}</h1>
      
      <div class="info-section">
        <h2>Content Type Information</h2>
        <p><strong>ID:</strong> ${contentType.id}</p>
        <p><strong>Slug:</strong> ${contentType.slug}</p>
        <p><strong>Course:</strong> ${course.title || course.path}</p>
        <p><strong>Content Kind:</strong> ${kind?.title || 'Unknown'}</p>
        ${kind ? `
          <p><strong>Submittable:</strong> ${kind.submittable ? 'Yes' : 'No'}</p>
          <p><strong>Can have children:</strong> ${kind.has_descendants ? 'Yes' : 'No'}</p>
          <p><strong>Can have parent:</strong> ${kind.has_ascendants ? 'Yes' : 'No'}</p>
        ` : ''}
        <p><strong>Color:</strong> 
          <span style="display: inline-block; width: 20px; height: 20px; background-color: ${contentType.color}; border: 1px solid var(--vscode-input-border); border-radius: 4px; vertical-align: middle; margin-left: 8px;"></span>
          ${contentType.color}
        </p>
      </div>

      <div class="form-section">
        <h2>Edit Content Type</h2>
        <form id="editContentTypeForm">
          <div class="form-group">
            <label for="title">Title</label>
            <input type="text" id="title" name="title" value="${contentType.title || ''}" />
          </div>
          
          <div class="form-group">
            <label for="slug">Slug (Identifier)</label>
            <input type="text" id="slug" name="slug" value="${contentType.slug}" required pattern="[a-z0-9_-]+" />
            <small style="color: var(--vscode-descriptionForeground);">Only lowercase letters, numbers, underscores, and hyphens</small>
          </div>
          
          <div class="form-group">
            <label for="color">Color</label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="color" id="colorPicker" value="${this.normalizeColor(contentType.color)}" style="width: 60px; height: 36px;" />
              <input type="text" id="color" name="color" value="${contentType.color}" required />
            </div>
            <small style="color: var(--vscode-descriptionForeground);">Color name (e.g., red, blue) or hex code (#FF0000)</small>
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
          <button class="button secondary" onclick="findUsage()">Find Usage</button>
          <button class="button secondary" style="background-color: var(--vscode-inputValidation-errorBackground);" onclick="deleteContentType()">Delete</button>
        </div>
      </div>

      <script nonce="{{NONCE}}">
        const contentTypeData = ${JSON.stringify(data)};
        
        // Handle form submission
        document.getElementById('editContentTypeForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const formData = new FormData(e.target);
          sendMessage('updateContentType', {
            typeId: contentTypeData.contentType.id,
            updates: {
              title: formData.get('title'),
              slug: formData.get('slug'),
              color: formData.get('color'),
              description: formData.get('description')
            }
          });
        });
        
        // Color picker sync
        document.getElementById('colorPicker').addEventListener('input', (e) => {
          document.getElementById('color').value = e.target.value;
        });
        
        document.getElementById('color').addEventListener('input', (e) => {
          const normalized = normalizeColor(e.target.value);
          if (normalized) {
            document.getElementById('colorPicker').value = normalized;
          }
        });
        
        function normalizeColor(color) {
          if (color.startsWith('#')) return color;
          const colorMap = {
            'red': '#FF0000', 'green': '#00FF00', 'blue': '#0000FF',
            'yellow': '#FFFF00', 'orange': '#FFA500', 'purple': '#800080',
            'pink': '#FFC0CB', 'brown': '#A52A2A', 'black': '#000000',
            'white': '#FFFFFF', 'gray': '#808080', 'grey': '#808080'
          };
          return colorMap[color.toLowerCase()] || '#000000';
        }
        
        function refreshView() {
          sendMessage('refresh', { typeId: contentTypeData.contentType.id });
        }
        
        function findUsage() {
          sendMessage('findUsage', { 
            courseId: contentTypeData.course.id,
            typeId: contentTypeData.contentType.id 
          });
        }
        
        function deleteContentType() {
          if (confirm('Are you sure you want to delete this content type? This action cannot be undone.')) {
            sendMessage('deleteContentType', { typeId: contentTypeData.contentType.id });
          }
        }
      </script>
    `;

    return this.getBaseHtml(`Content Type: ${contentType.title || contentType.slug}`, content);
  }

  private normalizeColor(color: string): string {
    if (color.startsWith('#')) return color;
    const colorMap: { [key: string]: string } = {
      'red': '#FF0000', 'green': '#00FF00', 'blue': '#0000FF',
      'yellow': '#FFFF00', 'orange': '#FFA500', 'purple': '#800080',
      'pink': '#FFC0CB', 'brown': '#A52A2A', 'black': '#000000',
      'white': '#FFFFFF', 'gray': '#808080', 'grey': '#808080'
    };
    return colorMap[color.toLowerCase()] || '#000000';
  }

  protected async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'updateContentType':
        try {
          await this.apiService.updateCourseContentType(message.data.typeId, message.data.updates);
          vscode.window.showInformationMessage('Content type updated successfully');
          
          // Update tree with changes
          if (this.treeDataProvider) {
            // Get the course ID from the data to provide context for the update
            const courseData = this.currentData as { course: CourseList };
            this.treeDataProvider.updateNode('courseContentType', message.data.typeId, {
              ...message.data.updates,
              course_id: courseData?.course.id
            });
          } else {
            vscode.commands.executeCommand('computor.lecturer.refresh');
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to update content type: ${error}`);
        }
        break;

      case 'refresh':
        vscode.commands.executeCommand('computor.lecturer.refresh');
        break;

      case 'findUsage':
        vscode.window.showInformationMessage('Finding content type usage coming soon!');
        break;

      case 'deleteContentType':
        vscode.commands.executeCommand('computor.deleteCourseContentType', message.data);
        this.panel?.dispose();
        break;
    }
  }
}