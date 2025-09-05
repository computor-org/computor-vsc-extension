# Computor Lecture Management System - VS Code Extension

## System Overview

The Computor VS Code Extension is the interactive frontend component of a comprehensive lecture management system that facilitates programming course delivery, assignment management, and student collaboration.

## System Architecture

### Components
- **VS Code Extension** (this project) - Interactive frontend for lecturers, students, and tutors
- **FastAPI Backend** - Course structure management, assignment metadata, and API services
- **React Frontend** - Administrative interface for statistics and course management

### Initial Setup & Configuration

#### Backend Realm Configuration
**First-Time Setup:**
- On initial extension launch, users must configure the backend URL (realm)
- Backend URL is stored securely in VS Code settings
- Supports multiple backend environments (development, staging, production)
- Configuration persists across VS Code sessions

#### Authentication & Repository Access
**GitLab Personal Access Token (PAT):**
- Users provide GitLab PAT during setup for repository cloning
- Token stored securely in VS Code's SecretStorage
- Used for all repository operations (clone, fetch, push)
- Single token can access all authorized repositories

**Repository-Specific Tokens:**
- If main PAT lacks access to specific repositories
- Extension prompts for repository-specific tokens on-demand
- Each token stored securely with repository identifier
- Automatic token selection based on repository URL

**Token Management Flow:**
1. Try cloning with main GitLab PAT
2. If access denied, prompt for repository-specific token
3. Store and associate token with repository
4. Reuse token for future operations on same repository

#### Course Directory Management
**Local Storage Configuration:**

**Lecturers:**
- Work directly in their current workspace directory
- No additional directory management required upon login
- Course content managed in-place where lecturer is working

**Students:**
- Can be enrolled in multiple courses simultaneously
- On login, students must choose a directory where ALL course repositories will be stored
- Course can have multiple repositories (found via CourseContentStudentList → SubmissionGroupStudentList → SubmissionGroupRepository)
- Repository directory naming:
  - Uses the last segment of SubmissionGroupRepository.full_path (after final "/" delimiter)
  - Each unique repository gets its own subdirectory within the chosen course directory
- Repository management:
  - All repositories for a course are cloned into subdirectories of the selected course directory
  - Repositories can be cloned or fork updated as needed
- After successful setup:
  - Student course content tree displays based on StudentCourseContentTreeProvider
  - Tree structure uses CourseContentStudentList data model
  
**Tutors:**
- Implementation planned for future release
- Directory management strategy to be determined

## User Roles & Workflows

### 📚 Lecturers
**Course Creation & Management:**
- Create new course structures according to backend-defined rules via API calls
- Import existing assignments into the tree structure
- Manage assignment metadata through `meta.yaml` files
- Release courses, triggering automatic repository generation:
  - **Student Template Repository** - Clean version for student forks (solutions removed based on metadata)
  - **Reference Repository** - Complete version with solutions for tutor comparison

**Git Integration:**
- Local git handling for course content management
- Automated repository creation and deployment

### 👨‍🎓 Students
**Assignment Navigation:**
- Tree view displaying course structure from backend database
- Filesystem integration: assignment directories mounted below tree nodes
- Git branch management: automatic switching/creation of assignment-specific branches
- Each assignment gets its own branch for isolated work

**Assignment Workflow:**
1. Navigate tree structure to find assignments
2. Work in assignment directory (real filesystem)
3. Submit via commit + push + API test call (using commit hash + assignment directory/ID)

### 👨‍🏫 Tutors
**Assignment Review:**
- Access to student submission branches for each assignment
- Compare student work against reference repository solutions
- Review submitted assignments through branch checkout system

## Technical Implementation

### Tree View Architecture
- **Virtual Tree Structure** - Rendered from backend database (not filesystem structure)
- **Multi-Repository Mounting** - Each assignment can mount from different repositories
- **Dynamic Repository Management** - Extension handles cloning, fetching, and switching between repos
- **Hybrid Approach** - Provides structured navigation across distributed repositories

### Git Workflow Complexity
- **Multi-Repository Management** - Each assignment may require different repository operations
- **Repository Discovery** - Extension must resolve repository URLs from backend metadata
- **Branch-per-Assignment** - Each assignment uses dedicated git branches (per repository)
- **Cross-Repository Submission** - Submissions may span multiple repositories
- **Repository Synchronization** - Keep multiple repositories in sync with upstream changes

### Implementation Challenges
- **Repository Lifecycle Management** - Clone, update, cleanup of multiple repos
- **Workspace Organization** - Managing multiple repository checkouts in VS Code
- **Git State Management** - Track branches, commits, and changes across repositories
- **Authentication Handling** - Manage credentials for multiple repository sources

### Repository Structure

**Multi-Repository Architecture:**
Each assignment can have its own repository, enabling:
- **Team-based assignments** with shared repositories
- **External assignments** from different sources
- **Modular course content** distributed across repositories

```
Tree View (Virtual Structure from Backend)
├── Module 1: Basics
│   ├── 1.1 Introduction     → repo-intro/assignment-01/
│   └── 1.2 Variables        → main-course-repo/assignment-02/
├── Module 2: Control Flow
│   ├── 2.1 Conditionals     → main-course-repo/assignment-03/
│   └── 2.2 Team Project     → team-repo-shared/group-assignment/
└── Module 3: Advanced
    └── 3.1 External Lab      → external-lab-repo/lab-exercise/
```

**Repository Types:**
- **Main Course Repository** - Primary course content
- **Assignment-Specific Repositories** - Individual assignment repos
- **Team Repositories** - Shared repositories for group work
- **External Repositories** - Third-party or imported content

### Assignment Submission Process
1. Student works in assignment directory
2. Commits changes locally
3. Pushes to assignment-specific branch
4. Extension triggers API test call with:
   - Commit hash
   - Assignment directory name/ID
5. Backend processes submission and provides feedback

## Communication Features

### 💬 Chat/Messages System
**Purpose:** Real-time communication between students, tutors, and lecturers

**Implementation:**
- **Role-Based Views:** Separate implementations for students and tutors
- **Context-Aware:** Messages associated with specific assignments
- **Markdown Support:** Rich text formatting for messages
- **System Messages:** Filtered automated messages from user messages

**Message Flow:**
- Students: Direct messaging on assignment level
- Tutors: Access to all student messages for an assignment
- Assignment-specific conversation threads

### 💭 Comments System
**Purpose:** Feedback and review system for tutors

**Implementation:**
- **Tutor-Only Feature:** Comments on student work and progress
- **CRUD Operations:** Create, read, update, and delete comments
- **Student Association:** Comments linked to specific course members
- **Timestamp Tracking:** Creation and modification times

**Features:**
- Edit mode with visual highlighting
- Permission-based operations
- Persistent feedback on student progress

### Technical Architecture for Communication
- **Webview Panels:** Integrated into VS Code sidebar
- **API Integration:** RESTful endpoints for all operations
- **Pull-Based Updates:** Manual refresh (no WebSocket implementation yet)
- **Markdown Rendering:** Using marked.js for rich content
- **Security:** CSP policies and server-side permission checks

## Session Management

### Logout Functionality
**User-Initiated Logout:**
- Command palette action: "Computor: Logout"
- Clears all stored credentials (backend URL, GitLab tokens)
- Removes workspace-specific settings
- Prompts user to reload VS Code window
- Returns to initial setup state on next launch

**Note on VS Code Extensions:**
- VS Code doesn't support true extension "unloading" during runtime
- Extensions remain loaded until VS Code restarts
- Logout effectively resets the extension state
- Full cleanup requires window reload

### Data Refresh Strategy
**Manual Refresh:**
- Individual view refresh buttons (messages, comments, tree views)
- Global "Refresh All Data" command
- Refresh after critical operations (submit, git push)

**Refresh Points:**
- After assignment submission
- When switching between assignments
- On user request via refresh buttons
- After authentication changes
- On view focus (optional, configurable)

## Future Extensibility
The system is designed to accommodate additional features and workflows as the platform evolves, with a flexible architecture supporting new user roles, assignment types, and integration patterns.