# Git Integration

## Overview
This document outlines the Git integration strategy for the computor VS Code extension. The extension uses a Git wrapper library to provide controlled access to Git operations.

## Library Choice
We use **simple-git** as the primary Git integration library. This provides:
- Promise-based API
- TypeScript support
- Comprehensive Git command coverage
- Error handling
- Cross-platform compatibility

## Implementation Status
✅ **Phase 1 Complete** - Basic Git operations are fully implemented including:
- Repository detection and initialization
- Status and diff operations
- Commit, push, and pull functionality
- Branch management
- Error handling with user-friendly messages

## Architecture

### Components

#### 1. GitWrapper Service (`src/git/GitWrapper.ts`)
A service layer that wraps the simple-git library and provides:
- Standardized error handling
- Repository instance management
- Type-safe Git operations
- Command validation and sanitization

#### 2. GitManager (`src/git/GitManager.ts`)
High-level Git operations integrated with VS Code:
- Workspace repository scanning
- Status bar integration
- VS Code command integration
- User prompts and notifications
- Repository state tracking

#### 3. GitErrorHandler (`src/git/GitErrorHandler.ts`)
Specialized error handling for Git operations:
- Error code classification
- User-friendly error messages
- Recoverable error detection
- Detailed error logging

### Core Operations
The Git wrapper supports:
- Repository initialization and cloning
- Branch management (create, switch, merge, delete)
- Commit operations (stage, commit, push, pull)
- Status and diff operations
- Remote management
- Tag operations
- Commit history viewing
- Stash operations (stash, pop, apply, drop, list, clear)

### Error Handling
- Graceful handling of Git errors with specific error codes
- User-friendly error messages for common scenarios
- Automatic error classification and recovery suggestions
- Validation of repository state before operations

## Implementation Strategy

### Phase 1: Basic Operations
- Repository detection and initialization
- Basic status and diff operations
- Simple commit and push functionality

### Phase 2: Advanced Features
- Branch management
- Merge conflict resolution
- Remote repository operations
- Tag and release management

### Phase 3: Integration Features
- VS Code integration (status bar, commands)
- Authentication handling
- Background operations and progress tracking

## Security Considerations
- Validate all Git commands before execution
- Sanitize user input for Git operations
- Handle credentials securely
- Prevent execution of arbitrary commands

## Usage Example

```typescript
// Initialize Git manager in extension
const gitManager = new GitManager(context);

// Get repository info
const repo = await gitManager.getActiveRepository();
if (repo?.isRepo) {
  // Commit changes
  await gitManager.commitChanges(repo.path, 'Update feature');
  
  // Push to remote
  await gitManager.pushChanges(repo.path);
  
  // Stash changes with message
  await gitManager.stashChanges(repo.path, 'Work in progress');
  
  // Show stash list UI
  await gitManager.showStashList(repo.path);
}

// Show Git status UI (includes stash options)
await gitManager.showGitStatus();
```

## Testing Strategy
- Unit tests for all Git wrapper methods
- Integration tests with actual Git repositories  
- Mock Git operations for isolated testing
- Error scenario testing
- Tests located in `test/git/` directory