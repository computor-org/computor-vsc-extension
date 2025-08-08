# VSCode Extension Development Backlog

This document tracks the VSCode extension development status and next steps.

## 🎯 Current Implementation Status

**Extension Version**: Development  
**Last Update**: 2025-08-08  
**Branch**: `feature/lecturer-view`

## ✅ Completed Features

### Core Infrastructure
- **Multi-tier Caching System** (`src/services/CacheService.ts`)
- **Performance Monitoring** (`src/services/PerformanceMonitoringService.ts`) 
- **Error Recovery Service** (`src/services/ErrorRecoveryService.ts`)
- **Request Batching** (`src/services/RequestBatchingService.ts`)
- **Virtual Scrolling** (`src/services/VirtualScrollingService.ts`)

### Student Workspace
- **StudentTreeDataProvider** (`src/ui/tree/student/StudentTreeDataProvider.ts`)
- **StudentCommands** (`src/commands/StudentCommands.ts`) - Partial implementation
- **Course Selection Service** (`src/services/CourseSelectionService.ts`)

### Tutor Workspace ⭐ **NEW**
- **TutorTreeDataProvider** (`src/ui/tree/tutor/TutorTreeDataProvider.ts`)
- **TutorCommands** (`src/commands/TutorCommands.ts`)
- **WorkspaceManager** (`src/services/WorkspaceManager.ts`) - Filesystem structure only

### Enhanced API Service
- **ComputorApiService** (`src/services/ComputorApiService.ts`)
  - Tutor methods: `getTutorCourses()`, `getExampleRepositories()`, `getExamples()`
  - Student methods: `getStudentSubmissionGroups()`
  - Example methods: `downloadExample()` with dependency support

## 🚨 Critical Implementation Gaps

### 1. Git Integration (High Priority)
**Location**: `src/services/WorkspaceManager.ts`
**Current Status**: Stub implementation using `fs.mkdir()`
**Needs Implementation**:
```typescript
// These methods need actual git operations:
async cloneStudentRepository(courseId: string, submissionGroup: any): Promise<string>
async cloneTutorRepository(courseId: string, providerUrl: string, fullPath: string): Promise<void>

// Add these methods:
async pullRepository(localPath: string): Promise<void>
async pushRepository(localPath: string): Promise<void>
async checkRepositoryStatus(localPath: string): Promise<GitStatus>
```

**Implementation Options**:
1. Use VS Code Git API: `vscode.extensions.getExtension('vscode.git')`
2. Shell git commands via `child_process`
3. Third-party git library like `simple-git`

### 2. Student Assignment Workflow (Medium Priority)
**Location**: `src/commands/StudentCommands.ts:134-177`
**Current Status**: Stub implementation with placeholder messages
**Needs Implementation**:
```typescript
async startAssignment(item: StudentCourseContentTreeItem): Promise<void>
async submitAssignment(item: StudentCourseContentTreeItem): Promise<void>
```

**Requirements**:
- Clone/setup student submission repository
- Download example template if available
- Create merge request for submission
- Integration with GitLab API

### 3. Authentication & Token Management
**Location**: Multiple files
**Current Issues**:
- GitLab token management needs integration testing
- Token refresh logic needs implementation
- Multi-instance authentication handling

## 📋 TODO List (Prioritized)

### Sprint 1: Core Functionality
- [ ] **Implement actual Git operations in WorkspaceManager**
  - Research best approach (VS Code Git API vs shell commands)
  - Implement clone, pull, push operations
  - Add error handling for git failures
  - Test with different authentication methods

- [ ] **Add comprehensive test coverage**
  - Unit tests for all new services (WorkspaceManager, TutorCommands, etc.)
  - Integration tests for API service methods
  - Mock git operations for testing
  - Test workspace directory creation and management

### Sprint 2: User Experience
- [ ] **Implement student assignment workflow**
  - Connect startAssignment to actual repository setup
  - Add submission workflow with merge request creation
  - Add progress indicators for long operations
  - Handle offline scenarios gracefully

- [ ] **Enhance workspace management**
  - Add workspace cleanup commands
  - Implement repository synchronization
  - Add conflict resolution UI
  - Support for multiple workspace configurations

### Sprint 3: Advanced Features
- [ ] **Example version management**
  - Add version selection in tutor download
  - Show version history in tree view
  - Compare different example versions
  - Download specific versions on demand

- [ ] **Collaborative features**
  - Team repository synchronization
  - Conflict detection and resolution
  - Real-time status updates
  - Shared workspace configurations

## 🧪 Testing Strategy

### Unit Tests Needed
```
src/
├── services/
│   ├── WorkspaceManager.test.ts        # ❌ Missing
│   ├── ComputorApiService.test.ts      # ❌ Missing  
│   ├── CacheService.test.ts            # ❌ Missing
│   └── PerformanceMonitoring.test.ts   # ❌ Missing
├── commands/
│   ├── TutorCommands.test.ts           # ❌ Missing
│   └── StudentCommands.test.ts         # ❌ Missing
└── ui/tree/
    ├── tutor/TutorTreeDataProvider.test.ts    # ❌ Missing
    └── student/StudentTreeDataProvider.test.ts # ❌ Missing
```

### Integration Tests Needed
- Full tutor workflow: authenticate → browse → download example
- Student workflow: authenticate → view courses → clone repository
- Error scenarios: network failures, authentication issues, git errors
- Performance: large example downloads, many repositories

### Manual Test Scenarios
1. **Tutor Downloads Example with Dependencies**
   - Open tutor view → expand course → repository → example
   - Right-click → "Download Example with Dependencies"
   - Verify all files and dependencies are downloaded
   - Check workspace structure is correct

2. **Student Repository Cloning**
   - Open student view → expand course → content
   - Trigger repository clone operation
   - Verify repository is cloned with proper authentication
   - Test file editing and git operations

## 🔧 Development Environment

### Required Extensions for Development
- **VS Code Extension Development**: Built-in
- **TypeScript**: Language support
- **GitLens**: For git integration testing

### Debug Configuration
```json
// .vscode/launch.json
{
    "name": "Extension",
    "type": "extensionHost",
    "request": "launch",
    "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
    "outFiles": ["${workspaceFolder}/out/**/*.js"]
}
```

### Build Commands
```bash
# Development
npm run watch          # Watch mode compilation
npm run compile        # One-time compilation

# Testing  
npm run test           # Run tests (when implemented)
npm run lint           # Code linting

# Packaging
npm run package        # Create .vsix file
```

## 📚 Key Files Reference

### Main Extension Entry
- `src/extension.ts` - Extension activation and registration

### Tree Data Providers
- `src/ui/tree/tutor/TutorTreeDataProvider.ts` - Hierarchical example view
- `src/ui/tree/student/StudentTreeDataProvider.ts` - Course content view
- `src/ui/tree/lecturer/LecturerTreeDataProvider.ts` - Course management
- `src/ui/tree/examples/ExampleTreeProvider.ts` - Example library

### Command Handlers
- `src/commands/TutorCommands.ts` - Example download and workspace setup
- `src/commands/StudentCommands.ts` - Repository cloning and assignments
- `src/commands/LecturerCommands.ts` - Course and content management

### Core Services
- `src/services/ComputorApiService.ts` - API communication
- `src/services/WorkspaceManager.ts` - File system and git operations
- `src/services/CacheService.ts` - Multi-tier caching
- `src/services/ErrorRecoveryService.ts` - Resilient error handling

### Configuration
- `package.json` - Extension manifest with commands and views
- `src/settings/ComputorSettingsManager.ts` - User preferences

## 🚀 Next Development Session Startup

1. **Environment Setup**:
   ```bash
   cd /home/theta/computor/computor-vsc-extension
   npm install
   npm run watch &
   code .
   ```

2. **Priority Focus**: Implement Git operations in WorkspaceManager
   - Start with `cloneStudentRepository()` method
   - Use VS Code's built-in Git API if possible
   - Add proper error handling and user feedback

3. **Testing Approach**:
   - Create mock repositories for testing
   - Test both authenticated and public repository cloning
   - Verify workspace directory structure

4. **Key Integration Points**:
   - Backend API: `http://localhost:8000` (start with `bash api.sh`)
   - Authentication: Use existing ComputorAuthenticationProvider
   - Git operations: Integrate with VS Code Git extension

---

**Quick Win**: Start with implementing basic git clone functionality using shell commands and `child_process.spawn()` - this will unblock the main user workflows immediately.