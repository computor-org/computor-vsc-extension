# Student Workspace Design Documentation

## Overview
This document describes the design for organizing student workspaces in VSCode and updating the student API endpoints to properly handle CourseSubmissionGroup and CourseSubmissionGroupMember models.

## Problem Statement
1. Students can have multiple repositories in a single course:
   - 1 personal repository for individual assignments
   - Multiple team repositories for group assignments
   - Each repository needs to be trackable and accessible

2. Current `/students/*` endpoints don't properly filter CourseContents based on actual submission groups
3. Repository URLs need to be stored and retrievable for VSCode extension

## Data Model Relationships

```
Course
  ├── CourseContent (assignments/exercises)
  │   └── CourseSubmissionGroup
  │       ├── properties: { gitlab: { url, full_path, clone_url, web_url } }
  │       └── CourseSubmissionGroupMember
  │           └── CourseMember (student)
```

## Proposed Directory Structure

### Flat Repository Organization (Recommended)
```
computor/
├── workbench/           # Shared workspace for current work
│   └── [active files]
├── courses/
│   ├── {course-uuid-1}/
│   │   ├── student-individual/     # Personal assignment repo
│   │   ├── team-project-1/         # Team repository 1
│   │   ├── team-project-2/         # Team repository 2
│   │   └── tutor/                  # Tutor's repository (read-only for students)
│   └── {course-uuid-2}/
│       ├── student-assignments/    # Personal work
│       ├── team-final-project/     # Team repository
│       └── tutor/                  # Tutor's repository
└── .computor/           # Extension metadata
    └── workspace.json   # Workspace configuration
```

### Benefits of Flat Structure:
- Simple, linear organization
- Each repository is directly accessible under the course
- Repository names are descriptive (from submission group or course content)
- No unnecessary nesting
- Easy to navigate and understand
- Tutor repository provides reference implementation/solutions (read-only access)

## API Endpoint Updates

### 1. Update `/students/courses` Endpoint
```python
# Current: Returns all courses where user is a student
# Proposed: Include submission group information

@student_router.get("/courses", response_model=list[CourseStudentList])
async def student_list_courses(...):
    # Query courses with submission group counts
    courses = db.query(
        Course,
        func.count(distinct(CourseSubmissionGroup.id)).label('submission_group_count')
    ).join(
        CourseMember, 
        and_(
            CourseMember.course_id == Course.id,
            CourseMember.user_id == user_id,
            CourseMember.course_role_id == '_student'
        )
    ).outerjoin(
        CourseSubmissionGroupMember,
        CourseSubmissionGroupMember.course_member_id == CourseMember.id
    ).outerjoin(
        CourseSubmissionGroup,
        CourseSubmissionGroup.id == CourseSubmissionGroupMember.course_submission_group_id
    ).group_by(Course.id)
    
    # Return with submission group info
```

### 2. New `/students/submission-groups` Endpoint
```python
@student_router.get("/submission-groups", response_model=list[SubmissionGroupStudent])
async def student_list_submission_groups(
    course_id: Optional[UUID] = None,
    permissions: Annotated[Principal, Depends(get_current_permissions)],
    db: Session = Depends(get_db)
):
    """
    Get all submission groups for the current student.
    Optionally filter by course.
    """
    user_id = permissions.get_user_id_or_throw()
    
    query = db.query(CourseSubmissionGroup).join(
        CourseSubmissionGroupMember,
        CourseSubmissionGroup.id == CourseSubmissionGroupMember.course_submission_group_id
    ).join(
        CourseMember,
        CourseSubmissionGroupMember.course_member_id == CourseMember.id
    ).filter(
        CourseMember.user_id == user_id
    )
    
    if course_id:
        query = query.filter(CourseSubmissionGroup.course_id == course_id)
    
    return query.all()
```

### 3. Update `/students/course-contents` Endpoint
```python
@student_router.get("/course-contents", response_model=list[CourseContentStudentList])
def student_list_course_contents(...):
    """
    Returns only course contents that the student has access to
    via submission groups.
    """
    # Query course contents through submission groups
    course_contents = db.query(CourseContent).join(
        CourseSubmissionGroup,
        CourseContent.id == CourseSubmissionGroup.course_content_id
    ).join(
        CourseSubmissionGroupMember,
        CourseSubmissionGroup.id == CourseSubmissionGroupMember.course_submission_group_id
    ).join(
        CourseMember,
        CourseSubmissionGroupMember.course_member_id == CourseMember.id
    ).filter(
        CourseMember.user_id == user_id
    ).distinct()
    
    # Include repository URLs from submission group properties
    for content in course_contents:
        submission_group = db.query(CourseSubmissionGroup).filter(
            CourseSubmissionGroup.course_content_id == content.id,
            # ... member filter
        ).first()
        
        if submission_group and submission_group.properties.get('gitlab'):
            content.repository_url = submission_group.properties['gitlab'].get('clone_url')
```

### 4. New Response Models
```python
# In student_course_contents.py

class SubmissionGroupRepository(BaseModel):
    """Repository information for a submission group"""
    provider: str = "gitlab"  # gitlab, github, etc.
    url: str                  # Base URL
    full_path: str            # Organization/project path
    clone_url: str            # Full clone URL
    web_url: str              # Web interface URL
    
class SubmissionGroupStudent(BaseModel):
    """Student's view of a submission group"""
    id: str
    course_id: str
    course_content_id: str
    course_content_title: str
    course_content_path: str
    max_group_size: int
    current_group_size: int
    members: list[CourseMemberBasic]  # Other members if team
    repository: Optional[SubmissionGroupRepository]
    latest_grading: Optional[CourseSubmissionGroupGradingStudent]
    
class CourseContentStudentList(BaseModel):
    # ... existing fields ...
    submission_group: Optional[SubmissionGroupStudent]
    repository_url: Optional[str]  # Direct clone URL for convenience
```

## VSCode Extension Updates

### 1. Workspace Manager Service
```typescript
// src/services/WorkspaceManager.ts

export class WorkspaceManager {
    private workspaceRoot: string;
    
    async initializeWorkspace() {
        // Create directory structure
        await this.createDirectoryStructure();
        // Load workspace configuration
        await this.loadWorkspaceConfig();
    }
    
    async cloneStudentRepository(
        courseId: string,
        submissionGroup: SubmissionGroupStudent
    ) {
        // Generate repository folder name based on type and content
        const repoName = this.generateRepositoryName(submissionGroup);
        
        const repoPath = path.join(
            this.workspaceRoot,
            'courses',
            courseId,
            repoName
        );
        
        // Clone repository
        await git.clone(submissionGroup.repository.clone_url, repoPath);
        
        // Update workspace configuration
        await this.updateWorkspaceConfig(courseId, submissionGroup, repoPath);
    }
    
    private generateRepositoryName(submissionGroup: SubmissionGroupStudent): string {
        // Generate descriptive folder name
        if (submissionGroup.max_group_size === 1) {
            return `student-${submissionGroup.course_content_path.replace(/\./g, '-')}`;
        } else {
            return `team-${submissionGroup.course_content_path.replace(/\./g, '-')}`;
        }
    }
    
    async cloneTutorRepository(courseId: string, tutorRepoUrl: string) {
        const repoPath = path.join(
            this.workspaceRoot,
            'courses',
            courseId,
            'tutor'
        );
        
        // Clone as read-only (shallow clone for efficiency)
        await git.clone(tutorRepoUrl, repoPath, { depth: 1 });
        
        // Mark as read-only in workspace config
        await this.updateWorkspaceConfig(courseId, { type: 'tutor', readOnly: true }, repoPath);
    }
    
    getRepositoryPath(courseId: string, submissionGroupId: string): string {
        // Return the local path for a submission group repository
        const config = this.getWorkspaceConfig();
        return config.repositories[submissionGroupId]?.localPath;
    }
}
```

### 2. Updated Student Tree Provider
```typescript
// src/ui/tree/student/StudentTreeDataProvider.ts

class StudentCourseContentItem extends vscode.TreeItem {
    constructor(
        public readonly content: CourseContentStudent,
        public readonly submissionGroup?: SubmissionGroupStudent
    ) {
        super(content.title, vscode.TreeItemCollapsibleState.None);
        
        // Add repository indicator
        if (submissionGroup?.repository) {
            this.contextValue = 'studentCourseContentWithRepo';
            this.iconPath = new vscode.ThemeIcon('git-branch');
            
            // Store repository URL for clone command
            this.command = {
                command: 'computor.student.cloneRepository',
                title: 'Clone Repository',
                arguments: [content, submissionGroup]
            };
        }
    }
}
```

### 3. Repository Management Commands
```typescript
// src/commands/StudentCommands.ts

export function registerStudentCommands(context: vscode.ExtensionContext) {
    // Clone repository command
    vscode.commands.registerCommand(
        'computor.student.cloneRepository',
        async (content: CourseContentStudent, submissionGroup: SubmissionGroupStudent) => {
            const workspaceManager = WorkspaceManager.getInstance();
            
            // Clone repository to flat structure
            await workspaceManager.cloneStudentRepository(
                content.course_id,
                submissionGroup
            );
            
            // Open in workspace
            const repoPath = workspaceManager.getRepositoryPath(
                content.course_id,
                submissionGroup.id
            );
            
            // Add to workspace
            vscode.workspace.updateWorkspaceFolders(
                vscode.workspace.workspaceFolders?.length || 0,
                0,
                { uri: vscode.Uri.file(repoPath), name: path.basename(repoPath) }
            );
        }
    );
    
    // Sync all repositories command
    vscode.commands.registerCommand(
        'computor.student.syncAllRepositories',
        async () => {
            // Fetch all submission groups
            const submissionGroups = await apiService.getStudentSubmissionGroups();
            
            // Clone/pull each repository
            for (const group of submissionGroups) {
                if (group.repository) {
                    await syncRepository(group);
                }
            }
        }
    );
}
```

## Implementation Plan

### Phase 1: Backend API Updates
1. ✅ Update CourseSubmissionGroup model to store repository URLs in properties
2. ✅ Add CourseSubmissionGroupGrading for tracking grades
3. ⏳ Update student endpoints to filter by submission groups
4. ⏳ Add new `/students/submission-groups` endpoint
5. ⏳ Update DTOs with repository information

### Phase 2: VSCode Extension Updates
1. ⏳ Implement WorkspaceManager service
2. ⏳ Update StudentTreeDataProvider to show repositories
3. ⏳ Add repository clone/sync commands
4. ⏳ Implement workspace configuration persistence

### Phase 3: Testing & Polish
1. ⏳ Test multi-repository workflows
2. ⏳ Add status indicators for repository sync
3. ⏳ Implement conflict resolution for team repositories
4. ⏳ Add repository health checks

## Migration Strategy

For existing data:
1. Populate CourseSubmissionGroup.properties with repository URLs
2. Create submission groups for existing student work
3. Migrate existing grades to CourseSubmissionGroupGrading

## Benefits

1. **Clear Organization**: Students can easily navigate between different repositories
2. **Team Support**: Proper handling of team repositories
3. **Grade Tracking**: Complete audit trail of grades through CourseSubmissionGroupGrading
4. **Scalability**: Structure supports multiple courses and repository types
5. **Offline Work**: Local clones allow offline development

## Tutor Workspace (Future Implementation)

### Example Integration via API
For the tutor workspace, instead of cloning repositories, we can:
1. **Download examples via API** - Use the existing example endpoints to fetch content
2. **Dynamic content loading** - Load examples on-demand when tutors need them
3. **Structured example storage** - Store downloaded examples in a structured way:
   ```
   courses/
   ├── {course-uuid}/
   │   └── tutor/
   │       ├── examples/
   │       │   ├── example-1/
   │       │   └── example-2/
   │       └── solutions/
   ```
4. **API Endpoints to use** (from examples.py):
   - `GET /examples` - List all available examples
   - `GET /examples/{example_id}` - Get specific example details
   - `GET /examples/{example_id}/download` - Download latest version with files
   - `GET /examples/download/{version_id}` - Download specific version
   - `GET /examples/{example_id}/versions` - List all versions of an example
   - `GET /examples/{example_id}/dependencies` - Get example dependencies
   
   **Tutor endpoints** (from tutor.py - needs refactoring):
   - `GET /tutors/courses/{course_id}` - Get course with tutor repository path
   - `GET /tutors/course-members/{id}/course-contents` - List course contents for member

This approach is better because:
- No need to manage Git repositories for examples
- Examples can be versioned and managed centrally
- Tutors can download only what they need
- Reduces storage and bandwidth requirements

## Open Questions

1. Should we auto-sync repositories on VSCode startup?
2. How to handle repository access permissions (read-only for tutor repos)?
3. Should workbench be per-course or global?
4. How to handle large repositories (shallow clones)?
5. Conflict resolution strategy for team repositories?
6. Should tutor examples be cached locally or fetched on-demand?

## Next Steps

1. Review and approve directory structure design
2. Implement backend API changes
3. Update VSCode extension with WorkspaceManager
4. Create migration scripts for existing data
5. Test with sample student data