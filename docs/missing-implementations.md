# Missing Implementations and TODOs

## Overview
This document catalogs all incomplete features, TODO comments, and missing implementations discovered in the computor-vsc-extension codebase.

## Critical Missing Features

### 1. GitLab Integration
**File:** `src/commands/LecturerCommands.ts`

#### Repository Cloning (Line 433)
```typescript
// Current state: Not implemented
async function cloneGitLabRepository() {
  // TODO: Implement GitLab repository cloning
  vscode.window.showErrorMessage('GitLab repository cloning not yet implemented');
}
```
**Required Implementation:**
- GitLab API authentication
- Repository URL resolution
- Clone with proper credentials
- Progress indication
- Error handling for permissions

#### Token Testing (Line 618)
```typescript
// Current state: Placeholder
async function testGitLabToken() {
  // TODO: Implement token validation
  return { valid: false, message: 'Not implemented' };
}
```
**Required Implementation:**
- Test token against GitLab API
- Check token permissions/scopes
- Validate token expiration
- Return detailed status

### 2. Content Type Validation
**File:** `src/commands/LecturerCommands.ts`

#### Parent Content Type Validation (Lines 204-206)
```typescript
// TODO: Validate that parent content type allows this child type
// Currently missing validation logic
```
**Required Implementation:**
- Define parent-child relationship rules
- Implement validation logic
- Add configuration for allowed relationships
- Provide meaningful error messages

#### Child Content Type Validation (Lines 222-224)
```typescript
// TODO: Check if this content type can have children
// Need to implement hierarchical validation
```
**Required Implementation:**
- Define which content types can have children
- Implement recursive validation
- Handle edge cases (circular dependencies)

### 3. Authentication Features
**File:** `src/authentication/ComputorAuthenticationProvider.ts`

#### Token Refresh Mechanism
```typescript
// Missing: Token refresh implementation
interface MissingTokenRefresh {
  refreshToken: string;
  expiresAt: Date;
  autoRefresh: boolean;
}
```
**Required Implementation:**
- JWT token refresh logic
- Automatic refresh before expiration
- Refresh token storage
- Fallback to re-authentication

#### Token Expiration Handling
```typescript
// Missing: Expiration checking
function isTokenExpired(token: string): boolean {
  // Not implemented
  return false;
}
```
**Required Implementation:**
- Parse JWT expiration claim
- Check expiration before API calls
- Trigger refresh or re-auth
- User notification for expired sessions

### 4. Drag and Drop Features
**File:** `src/ui/tree/lecturer/LecturerTreeDataProvider.ts`

#### Content Reordering (Lines 784-908)
```typescript
// Current: Complex implementation with debug code
// TODO: Clean up and complete drag-drop reordering
```
**Required Implementation:**
- Clean up debug console.log statements
- Implement proper move validation
- Add undo/redo support
- Handle cross-container drops
- Update backend after reordering

### 5. Course Member Management
**Not yet implemented in any file**

**Required Features:**
- View course members (students, tutors, lecturers)
- Add/remove members
- Assign roles and permissions
- Bulk import from CSV/Excel
- Member activity tracking

### 6. Testing and Grading System
**Not yet implemented**

**Required Features:**
- Execute tests on student submissions
- Display grades in tree view
- Feedback system for submissions
- Export grades to various formats
- Automated grading workflows

### 7. Performance Features

#### Lazy Loading
**File:** `src/ui/tree/lecturer/LecturerTreeDataProvider.ts`
```typescript
// TODO: Implement lazy loading for large datasets
// Currently loads all data at once
```
**Required Implementation:**
- Load tree nodes on demand
- Implement virtual scrolling
- Cache loaded nodes
- Progressive loading indicators

#### Request Batching
**File:** `src/services/ComputorApiService.ts`
```typescript
// TODO: Batch multiple API calls
// Currently makes individual requests
```
**Required Implementation:**
- Queue requests for batching
- Combine similar requests
- Implement batch endpoints
- Handle partial failures

### 8. Offline Support
**Not implemented**

**Required Features:**
- Local data caching
- Offline queue for operations
- Sync when connection restored
- Conflict resolution
- Offline mode indicator

## TODO Comments by File

### LecturerCommands.ts
- Line 204: Validate parent content type relationships
- Line 222: Check if content type can have children
- Line 433: Implement GitLab repository cloning
- Line 618: Implement token testing functionality

### LecturerTreeDataProvider.ts
- Line 49: Replace `any` type for examples cache
- Line 779: Fix unused parameter suppression
- Multiple: Implement lazy loading strategy

### ComputorApiService.ts
- Line 59: Remove unsafe `any` casting
- Line 61-67: Replace dummy Keycloak config
- Multiple: Add request batching support

### ComputorAuthenticationProvider.ts
- Line 89: Handle unused scopes parameter properly
- Implement token refresh mechanism
- Add token expiration checking

### BaseWebviewProvider.ts
- Line 8: Replace generic `any` type for currentData
- Implement proper CSP configuration
- Add comprehensive error handling

## Stub Implementations

### 1. Example Assignment
**File:** `src/commands/LecturerCommands.ts`
```typescript
// Lines 330-333: Using any type for example data
const exampleData: any = {
  // Stub implementation
};
```

### 2. Keycloak Configuration
**File:** `src/services/ComputorApiService.ts`
```typescript
// Lines 61-67: Hardcoded dummy config
const keycloakConfig = {
  url: 'http://dummy',
  realm: 'dummy',
  clientId: 'dummy'
};
```

### 3. Repository Detection
**File:** `src/commands/lecturer/courseGroupCommands.ts`
```typescript
// Incomplete repository detection logic
function detectRepositoryType(path: string): string {
  // Stub implementation
  return 'unknown';
}
```

## Missing Error Handling

### 1. API Service
- No retry logic for failed requests
- Missing timeout handling
- No circuit breaker pattern
- Incomplete error recovery

### 2. Tree Provider
- Missing error states in tree
- No fallback for failed data loads
- Incomplete validation error handling

### 3. Authentication
- Missing session recovery
- No fallback authentication methods
- Incomplete credential validation

## Missing UI Features

### 1. Progress Indicators
- Long-running operations lack feedback
- No progress bars for file operations
- Missing loading states in tree

### 2. Search and Filter
- No search functionality in tree
- Missing content filtering options
- No quick navigation features

### 3. Status Indicators
- No sync status badges
- Missing deployment status
- No activity indicators

## Missing Documentation

### 1. API Documentation
- Endpoint documentation incomplete
- Missing request/response examples
- No error code documentation

### 2. User Documentation
- Missing user guide
- No troubleshooting guide
- Incomplete feature documentation

### 3. Developer Documentation
- Missing architecture diagrams
- No contribution guidelines
- Incomplete setup instructions

## Priority Matrix for Implementation

### Critical (Block Release)
1. GitLab repository cloning
2. Token refresh mechanism
3. Content type validation
4. Basic error handling

### High (Next Sprint)
1. Lazy loading
2. Request batching
3. Course member management
4. Progress indicators

### Medium (Future Sprints)
1. Offline support
2. Testing and grading
3. Advanced search
4. Drag and drop polish

### Low (Nice to Have)
1. Activity tracking
2. Advanced filtering
3. Keyboard shortcuts
4. Theme support

## Implementation Estimates

| Feature | Complexity | Estimated Hours | Dependencies |
|---------|------------|-----------------|--------------|
| GitLab Cloning | High | 16-24 | GitLab API setup |
| Token Refresh | Medium | 8-12 | Auth refactoring |
| Content Validation | Low | 4-6 | Type definitions |
| Lazy Loading | Medium | 12-16 | Tree refactoring |
| Request Batching | Medium | 8-12 | API refactoring |
| Member Management | High | 20-30 | New UI components |
| Testing System | High | 30-40 | Backend integration |
| Offline Support | High | 24-32 | Storage layer |

## Next Steps

1. **Immediate Actions:**
   - Complete GitLab repository cloning
   - Implement token refresh mechanism
   - Add content type validation

2. **Short-term Goals:**
   - Add lazy loading to tree provider
   - Implement request batching
   - Complete error handling

3. **Long-term Vision:**
   - Full offline support
   - Comprehensive testing system
   - Advanced UI features

## Notes for Developers

### When Implementing Missing Features:
1. Remove TODO comments after implementation
2. Add unit tests for new features
3. Update documentation
4. Consider backward compatibility
5. Add feature flags for risky changes

### Code Quality Requirements:
- No `any` types in new code
- Comprehensive error handling
- Performance considerations
- Accessibility support
- Internationalization ready

## Conclusion

The extension has significant missing implementations that need to be addressed before production deployment. Priority should be given to completing core features like GitLab integration and authentication, followed by performance optimizations and user experience enhancements.