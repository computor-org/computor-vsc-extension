import * as vscode from 'vscode';
import { 
  OrganizationList, 
  CourseFamilyList, 
  CourseList, 
  CourseContentList,
  CourseContentTypeList,
  ExampleList 
} from '../../../types/generated';

export class OrganizationTreeItem extends vscode.TreeItem {
  constructor(
    public readonly organization: OrganizationList,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(organization.title || organization.path, collapsibleState);
    this.id = `org-${organization.id}`;
    this.contextValue = 'organization';
    this.iconPath = new vscode.ThemeIcon('organization');
    this.tooltip = organization.title || organization.path;
  }
}

export class CourseFamilyTreeItem extends vscode.TreeItem {
  constructor(
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(courseFamily.title || courseFamily.path, collapsibleState);
    this.id = `family-${courseFamily.id}`;
    this.contextValue = 'courseFamily';
    this.iconPath = new vscode.ThemeIcon('folder-library');
    this.tooltip = courseFamily.title || courseFamily.path;
  }
}

export class CourseTreeItem extends vscode.TreeItem {
  constructor(
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(course.title || course.path, collapsibleState);
    this.id = `course-${course.id}`;
    this.contextValue = 'course';
    this.iconPath = new vscode.ThemeIcon('book');
    this.tooltip = course.title || course.path;
    
    // Add repository URL to description if available
    if (course.properties?.gitlab) {
      this.description = 'GitLab';
    }
  }
}

export class CourseContentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly courseContent: CourseContentList,
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList,
    public readonly hasChildren: boolean
  ) {
    super(
      courseContent.title || courseContent.path,
      hasChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.id = `content-${courseContent.id}`;
    this.contextValue = this.getContextValue();
    this.iconPath = this.getIcon();
    this.tooltip = this.getTooltip();
    this.description = this.getDescription();
  }

  private getContextValue(): string {
    const parts = ['courseContent'];
    
    // Check if it's an assignment based on course_content_kind_id
    // We'll need to check this differently since we don't have the kind details
    if (this.courseContent.course_content_kind_id) {
      parts.push('assignment');
      if (this.courseContent.example_id) {
        parts.push('hasExample');
      } else {
        parts.push('noExample');
      }
    }
    
    if (this.hasChildren) {
      parts.push('hasChildren');
    }
    
    return parts.join('.');
  }

  private getIcon(): vscode.ThemeIcon {
    // We'll check based on whether it has an example_id
    if (this.courseContent.example_id) {
      return new vscode.ThemeIcon('file-code');
    } else if (this.hasChildren) {
      return new vscode.ThemeIcon('folder');
    } else {
      return new vscode.ThemeIcon('file');
    }
  }

  private getTooltip(): string {
    const parts: string[] = [];
    
    if (this.courseContent.title) {
      parts.push(this.courseContent.title);
    }
    
    if (this.courseContent.example_id) {
      parts.push(`Example: ${this.courseContent.example_id}`);
      if (this.courseContent.example_version) {
        parts.push(`Version: ${this.courseContent.example_version}`);
      }
    }
    
    return parts.join('\n') || this.courseContent.path;
  }

  private getDescription(): string | undefined {
    if (this.courseContent.example_id) {
      return this.courseContent.example_version ? 
        `📦 v${this.courseContent.example_version}` : 
        '📦';
    }
    return undefined;
  }
}

export class ExampleTreeItem extends vscode.TreeItem {
  constructor(
    public readonly example: ExampleList,
    public readonly courseContent: CourseContentTreeItem
  ) {
    super(example.title, vscode.TreeItemCollapsibleState.None);
    this.id = `example-${example.id}`;
    this.contextValue = 'example';
    this.iconPath = new vscode.ThemeIcon('package');
    this.tooltip = example.title;
    this.description = 'latest';
  }
}

// Folder nodes for organizing course sub-items
export class CourseFolderTreeItem extends vscode.TreeItem {
  constructor(
    public readonly folderType: 'contents' | 'contentTypes',
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList
  ) {
    super(
      folderType === 'contents' ? 'Contents' : 'Content Types',
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.id = `${folderType}-${course.id}`;
    this.contextValue = `course.${folderType}`;
    this.iconPath = new vscode.ThemeIcon(folderType === 'contents' ? 'folder' : 'symbol-class');
    this.tooltip = folderType === 'contents' ? 
      'Course contents organized in a tree structure' : 
      'Content types define the kinds of content in this course';
  }
}

// Course Content Type item
export class CourseContentTypeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly contentType: CourseContentTypeList,
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList
  ) {
    super(contentType.title || contentType.slug, vscode.TreeItemCollapsibleState.None);
    this.id = `contentType-${contentType.id}`;
    this.contextValue = 'courseContentType';
    this.iconPath = new vscode.ThemeIcon('symbol-enum');
    this.tooltip = `${contentType.title || contentType.slug}\nSlug: ${contentType.slug}`;
    
    // Show color as description if available
    if (contentType.color) {
      this.description = contentType.color;
    }
  }
}