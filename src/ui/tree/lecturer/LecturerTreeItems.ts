import * as vscode from 'vscode';
import { 
  OrganizationList, 
  CourseFamilyList, 
  CourseList, 
  CourseContentList,
  CourseContentTypeList,
  ExampleList,
  CourseGroupList,
  CourseMemberList
} from '../../../types/generated';
import { IconGenerator } from '../../../utils/iconGenerator';

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
    public readonly hasChildren: boolean,
    public readonly exampleInfo?: any,
    public readonly contentType?: CourseContentTypeList,
    public readonly isSubmittable: boolean = false
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
    
    // Add submittable/nonSubmittable to make the distinction clear
    if (this.isSubmittable) {
      parts.push('submittable');
    } else {
      parts.push('nonSubmittable');
    }
    
    // Check if it's an assignment based on content type slug or kind
    const isAssignmentLike = this.contentType?.slug?.toLowerCase().includes('assignment') ||
                            this.contentType?.slug?.toLowerCase().includes('exercise') ||
                            this.contentType?.slug?.toLowerCase().includes('homework') ||
                            this.contentType?.slug?.toLowerCase().includes('task') ||
                            this.isSubmittable;
    
    if (isAssignmentLike) {
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

  private getIcon(): vscode.ThemeIcon | vscode.Uri {
    // Use colored icon based on content type
    if (this.contentType?.color) {
      try {
        // Map content type slug to appropriate icon shape
        const isAssignment = this.contentType.slug?.toLowerCase().includes('assignment') ||
                            this.contentType.slug?.toLowerCase().includes('exercise') ||
                            this.contentType.slug?.toLowerCase().includes('homework') ||
                            this.contentType.slug?.toLowerCase().includes('task');
        
        // Use square for assignments, circle for units/others
        const shape = isAssignment ? 'square' : 'circle';
        return IconGenerator.getColoredIcon(this.contentType.color, shape);
      } catch {
        // Fallback to default icons
      }
    }
    
    // Fallback to default theme icons
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
    const parts: string[] = [];
    
    // Show example title and version
    if (this.courseContent.example_id && this.exampleInfo) {
      const exampleTitle = this.exampleInfo.title || 'Unknown Example';
      const versionText = this.courseContent.example_version ? 
        `v${this.courseContent.example_version}` : 
        'latest';
      parts.push(`📦 ${exampleTitle} (${versionText})`);
    } else if (this.courseContent.example_id) {
      // Fallback if example info couldn't be loaded
      const versionText = this.courseContent.example_version ? 
        `v${this.courseContent.example_version}` : 
        'latest';
      parts.push(`📦 ${versionText}`);
    }
    
    // Show deployment status only for submittable content (assignments)
    if (this.isSubmittable && this.courseContent.deployment_status) {
      const statusIcons: { [key: string]: string } = {
        'pending': '⏳',
        'pending_release': '📤',
        'deploying': '🔄',
        'deployed': '✅',
        'released': '🚀',
        'failed': '❌'
      };
      const icon = statusIcons[this.courseContent.deployment_status] || '❓';
      parts.push(`${icon} ${this.courseContent.deployment_status}`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : undefined;
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
    public readonly folderType: 'contents' | 'contentTypes' | 'groups',
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList
  ) {
    const labels = {
      'contents': 'Contents',
      'contentTypes': 'Content Types',
      'groups': 'Groups'
    };
    
    const icons = {
      'contents': 'folder',
      'contentTypes': 'symbol-class',
      'groups': 'organization'
    };
    
    const tooltips = {
      'contents': 'Course contents organized in a tree structure',
      'contentTypes': 'Content types define the kinds of content in this course',
      'groups': 'Course groups and their members'
    };
    
    super(
      labels[folderType],
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.id = `${folderType}-${course.id}`;
    this.contextValue = `course.${folderType}`;
    this.iconPath = new vscode.ThemeIcon(icons[folderType]);
    this.tooltip = tooltips[folderType];
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
    
    // Use colored icon if color is available
    if (contentType.color) {
      try {
        this.iconPath = IconGenerator.getColoredIcon(contentType.color, 'square');
      } catch {
        // Fallback to default icon if color generation fails
        this.iconPath = new vscode.ThemeIcon('symbol-enum');
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-enum');
    }
    
    this.tooltip = `${contentType.title || contentType.slug}\nSlug: ${contentType.slug}`;
    
    // Show color as description if available
    if (contentType.color) {
      this.description = contentType.color;
    }
  }
}

// Course Group item
export class CourseGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly group: CourseGroupList,
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList,
    public readonly memberCount: number = 0
  ) {
    super(
      group.title || `Group ${group.id.slice(0, 8)}`,
      vscode.TreeItemCollapsibleState.Collapsed
    );
    this.id = `group-${group.id}`;
    this.contextValue = 'course.group';
    this.iconPath = new vscode.ThemeIcon('symbol-array');
    this.tooltip = `Group: ${group.title || group.id}\nMembers: ${memberCount}`;
    this.description = memberCount > 0 ? `${memberCount} members` : 'No members';
  }
}

// Virtual "No Group" item for ungrouped members
export class NoGroupTreeItem extends vscode.TreeItem {
  constructor(
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList,
    public readonly memberCount: number = 0
  ) {
    super(
      'No Group',
      memberCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    );
    this.id = `no-group-${course.id}`;
    this.contextValue = 'course.noGroup';
    this.iconPath = new vscode.ThemeIcon('person');
    this.tooltip = `Members not assigned to any group: ${memberCount}`;
    this.description = memberCount > 0 ? `${memberCount} members` : 'No members';
  }
}

// Course Member item
export class CourseMemberTreeItem extends vscode.TreeItem {
  constructor(
    public readonly member: CourseMemberList,
    public readonly course: CourseList,
    public readonly courseFamily: CourseFamilyList,
    public readonly organization: OrganizationList,
    public readonly group?: CourseGroupList
  ) {
    const userName = member.user?.username || member.user?.email || `User ${member.user_id.slice(0, 8)}`;
    super(
      userName,
      vscode.TreeItemCollapsibleState.None
    );
    this.id = `member-${member.id}`;
    this.contextValue = 'course.member';
    this.iconPath = new vscode.ThemeIcon('account');
    
    // Build tooltip with user info
    const tooltipParts = [
      `Member: ${userName}`,
      `User ID: ${member.user_id}`,
      `Role ID: ${member.course_role_id}`
    ];
    
    if (group) {
      tooltipParts.push(`Group: ${group.title || group.id}`);
    } else {
      tooltipParts.push('Group: None');
    }
    
    this.tooltip = tooltipParts.join('\n');
    this.description = member.course_role_id;
  }
}