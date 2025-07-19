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
✅ **Fully Implemented** - All Git operations are complete including:
- Repository detection and initialization
- Status and diff operations
- Commit, push, and pull functionality
- Branch management (create, switch, merge, delete)
- Tag operations (create, delete, list)
- Stash operations (stash, pop, apply, drop, list, clear)
- Remote management (add, remove, list)
- Clone operations with options
- Commit history viewing
- Error handling with user-friendly messages
- Input validation with GitValidator utility
- Support for authenticated HTTP(S) URLs

## Architecture

### Components

#### 1. GitWrapper Service (`src/git/GitWrapper.ts`)
A service layer that wraps the simple-git library and provides:
- Standardized error handling
- Repository instance management
- Type-safe Git operations
- Command validation and sanitization
- Integration with GitValidator for input validation

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

#### 4. GitValidator (`src/utils/GitValidator.ts`)
Input validation and sanitization utilities:
- Branch name validation and sanitization
- Tag name validation
- Remote name and URL validation (including authenticated HTTP(S) URLs)
- Commit message validation
- File path validation
- Detailed validation error messages

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

## Implementation Phases (Completed)

### ✅ Phase 1: Basic Operations
- Repository detection and initialization
- Basic status and diff operations
- Simple commit and push functionality
- File staging and commit operations

### ✅ Phase 2: Advanced Features
- Branch management (create, switch, merge, delete)
- Remote repository operations
- Tag and release management
- Stash operations (stash, pop, apply, drop, list, clear)
- Commit history viewing

### ✅ Phase 3: Integration Features
- VS Code integration (status bar, commands)
- Authentication handling (PAT, username/password)
- Error handling with user-friendly messages
- Input validation with GitValidator
- Support for GitLab and GitHub authentication

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
- Unit tests for all Git wrapper methods (`test/git/`, `test/utils/`)
- Integration tests with actual Git repositories (`test/integration/git/`)
- Manual integration tests for external services (`test/integration/manual/`)
- Mock Git operations for isolated testing
- Error scenario testing
- Comprehensive test coverage including:
  - GitWrapper operations
  - GitValidator utilities
  - GitErrorHandler
  - Stash operations
  - Remote authentication

### Manual Test Scripts
Available in `test/integration/manual/`:
- `test-git-basic.ts` - Tests all local Git operations
- `test-gitlab-integration.ts` - Interactive GitLab testing
- `test-gitlab-auto.ts` - Automated GitLab testing with environment variables

Run with:
```bash
npm run test:git-basic
npm run test:gitlab       # Interactive
npm run test:gitlab-auto  # With env vars: GITLAB_HTTP_PREFIX, GITLAB_HOST, GITLAB_PORT, GITLAB_PAT
```