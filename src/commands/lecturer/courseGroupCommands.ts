import * as vscode from 'vscode';
import { ComputorApiService } from '../../services/ComputorApiService';
import { LecturerTreeDataProvider } from '../../ui/tree/lecturer/LecturerTreeDataProvider';
import { CourseFolderTreeItem } from '../../ui/tree/lecturer/LecturerTreeItems';

export class CourseGroupCommands {
  constructor(
    private apiService: ComputorApiService,
    private treeDataProvider: LecturerTreeDataProvider
  ) {}

  async createCourseGroup(folderItem?: CourseFolderTreeItem): Promise<void> {
    try {
      if (!folderItem || folderItem.folderType !== 'groups') {
        vscode.window.showErrorMessage('Please select a Groups folder to create a new group.');
        return;
      }

      // Prompt for group title
      const title = await vscode.window.showInputBox({
        prompt: 'Enter the title for the new course group',
        placeHolder: 'e.g., Team Alpha, Group 1, etc.',
        validateInput: (value: string) => {
          if (!value || value.trim().length === 0) {
            return 'Group title cannot be empty';
          }
          if (value.trim().length > 100) {
            return 'Group title must be less than 100 characters';
          }
          return null;
        }
      });

      if (!title) {
        return; // User cancelled
      }

      // Create the course group
      const newGroup = await this.apiService.createCourseGroup(
        folderItem.course.id,
        title.trim()
      );

      // Clear cache to ensure fresh data
      this.treeDataProvider.invalidateCache('courseGroup', newGroup.id, { 
        courseId: folderItem.course.id 
      });

      // Refresh the groups folder
      this.treeDataProvider.refreshNode(folderItem);

      vscode.window.showInformationMessage(
        `Course group "${newGroup.title || newGroup.id}" created successfully.`
      );

    } catch (error) {
      console.error('Failed to create course group:', error);
      vscode.window.showErrorMessage(`Failed to create course group: ${error}`);
    }
  }
}