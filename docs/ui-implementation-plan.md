# UI Implementation Plan - Computor VS Code Extension

## Overview
This document outlines the implementation plan for migrating UI components from the old extension to the new component-based architecture, focusing on chat/messages and comments functionality.

## Dependencies & Setup

### NPM Dependencies to Install
```json
{
  "dependencies": {
    "marked": "^4.3.0"  // Markdown parsing for messages
  }
}
```

### File Structure & Locations
```
computor-vsc-extension/
├── src/
│   ├── commands/              # VS Code command implementations
│   │   └── setup.ts          # Setup wizard command
│   ├── configuration/        # Configuration management
│   │   └── ConfigurationManager.ts
│   ├── git/                  # Git operations
│   │   └── RepositoryAccessManager.ts
│   ├── ui/
│   │   └── views/
│   │       ├── SetupWizardView.ts
│   │       ├── MessagesView.ts
│   │       └── CommentsView.ts
│   └── utils/
│       └── errors.ts         # Error handling utilities
├── webview-ui/
│   ├── components/           # New components
│   │   ├── textarea.js
│   │   ├── avatar.js
│   │   ├── message.js
│   │   └── chat-input.js
│   ├── views/                # View implementations
│   │   ├── setup-wizard.js
│   │   ├── messages.js
│   │   └── comments.js
│   ├── lib/                  # External libraries
│   │   └── marked.min.js
│   └── utils/
│       ├── utils.js          # General utilities
│       └── markdown.js       # Markdown wrapper
└── test/
    └── unit/
        ├── configuration/
        └── components/
```

## Current State Assessment

### Existing New Architecture
- **Component Library**: Well-structured base Component class with lifecycle management
- **Available Components**: Button, Input, Select, Checkbox, Progress, Card
- **Webview Infrastructure**: BaseWebviewPanel with CSP and resource management
- **TypeScript Backend**: Strong typing and proper VS Code integration

### Missing Components for Migration
1. **TextArea** - Multi-line text input for messages
2. **Avatar** - User profile images
3. **Message** - Individual message display
4. **MessageList** - Scrollable message container
5. **ChatInput** - Message input with send functionality

## Implementation Phases

### Phase 0: Initial Setup UI (Week 0.5)
**Priority: Critical | Effort: Medium**

#### 0.1 First-Run Experience
- **Backend Configuration View**
  - Input field for backend URL/realm
  - URL validation and connection testing
  - Save to VS Code SecretStorage
  - Support for changing realm later

#### 0.2 GitLab Authentication
- **PAT Configuration View**
  - Secure input field for GitLab Personal Access Token
  - Token validation against GitLab API
  - Store in VS Code SecretStorage
  - Option to update token later

#### 0.3 Course Directory Selection
- **Directory Picker View**
  - Use VS Code's file picker API
  - Validate directory permissions
  - Create subdirectories if needed
  - Store path in workspace settings

#### 0.4 Settings Management
```typescript
// src/configuration/ConfigurationManager.ts
class ConfigurationManager {
    async getBackendUrl(): Promise<string | undefined>;
    async setBackendUrl(url: string): Promise<void>;
    async validateBackendConnection(url: string): Promise<boolean>;
    
    async getGitLabToken(): Promise<string | undefined>;
    async setGitLabToken(token: string): Promise<void>;
    async validateGitLabToken(token: string): Promise<boolean>;
    
    async getRepositoryToken(repoUrl: string): Promise<string | undefined>;
    async setRepositoryToken(repoUrl: string, token: string): Promise<void>;
    
    async getCourseDirectory(): Promise<string | undefined>;
    async setCourseDirectory(path: string): Promise<void>;
    async ensureDirectoryStructure(basePath: string): Promise<void>;
}
```

#### 0.5 Repository Access Manager
```typescript
// src/git/RepositoryAccessManager.ts
class RepositoryAccessManager {
    async cloneRepository(repoUrl: string, targetPath: string): Promise<void> {
        try {
            // Try with main GitLab PAT
            await this.cloneWithToken(repoUrl, targetPath, await config.getGitLabToken());
        } catch (error) {
            if (error.code === 'AUTH_FAILED') {
                // Prompt for repository-specific token
                const token = await vscode.window.showInputBox({
                    prompt: `Enter access token for ${repoUrl}`,
                    password: true
                });
                
                if (token) {
                    await config.setRepositoryToken(repoUrl, token);
                    await this.cloneWithToken(repoUrl, targetPath, token);
                }
            }
        }
    }
}
```

### Phase 1: Core Infrastructure (Week 1)
**Priority: High | Effort: Low**

#### 1.1 Utility Functions
```javascript
// webview-ui/utils.js
export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function formatDateTime(dateTime) {
    return new Intl.DateTimeFormat('default', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateTime));
}
```

#### 1.2 Markdown Integration
- Add marked.js library to webview-ui/lib/
- Create markdown utility wrapper
```javascript
// webview-ui/markdown.js
export function renderMarkdown(text) {
    return marked(text, { 
        breaks: true,
        sanitize: true 
    });
}
```

#### 1.3 CSS Migration
- Copy and adapt `vscode.css` theme variables
- Integrate with existing component styles
- Ensure consistent theming across all components

### Phase 2: Base Components (Week 2)
**Priority: High | Effort: Medium**

#### 2.1 TextArea Component
```javascript
class TextArea extends Component {
    constructor(options = {}) {
        super();
        this.placeholder = options.placeholder || '';
        this.rows = options.rows || 3;
        this.maxRows = options.maxRows || 10;
        this.value = options.value || '';
        this.onInput = options.onInput || (() => {});
        this.onEnterPress = options.onEnterPress || null;
    }

    render() {
        // Auto-resizing textarea with Enter key support
    }
}
```

#### 2.2 Avatar Component
```javascript
class Avatar extends Component {
    constructor(options = {}) {
        super();
        this.src = options.src || '';
        this.alt = options.alt || 'User';
        this.size = options.size || 'medium'; // small, medium, large
        this.fallback = options.fallback || this.alt.charAt(0);
    }

    render() {
        // Image with fallback to initials
    }
}
```

### Phase 3: Message Components (Week 3)
**Priority: High | Effort: Medium**

#### 3.1 Message Component
```javascript
class Message extends Component {
    constructor(options = {}) {
        super();
        this.author = options.author || {};
        this.content = options.content || '';
        this.timestamp = options.timestamp || new Date();
        this.isMarkdown = options.isMarkdown !== false;
        this.onEdit = options.onEdit || null;
        this.onDelete = options.onDelete || null;
        this.canEdit = options.canEdit || false;
    }

    render() {
        // Avatar + Author + Timestamp header
        // Message content (with markdown support)
        // Edit/Delete actions (if applicable)
    }
}
```

#### 3.2 MessageList Component
```javascript
class MessageList extends Component {
    constructor(options = {}) {
        super();
        this.messages = options.messages || [];
        this.autoScroll = options.autoScroll !== false;
        this.onMessageAction = options.onMessageAction || (() => {});
    }

    render() {
        // Scrollable container
        // Render messages
        // Handle auto-scroll to bottom
    }
}
```

#### 3.3 ChatInput Component
```javascript
class ChatInput extends Component {
    constructor(options = {}) {
        super();
        this.placeholder = options.placeholder || 'Type a message...';
        this.onSend = options.onSend || (() => {});
        this.disabled = options.disabled || false;
    }

    render() {
        // TextArea + Send button
        // Enter to send, Shift+Enter for new line
    }
}
```

### Phase 4: View Implementation (Week 4)
**Priority: Medium | Effort: High**

#### 4.1 Messages View
- Create `webview-ui/messages.js` using new components
- Implement message sending and receiving
- Add loading states and error handling
- Support role-based views (student vs tutor)

#### 4.2 Comments View
- Create `webview-ui/comments.js` with CRUD operations
- Implement edit mode with visual feedback
- Add permission-based UI elements
- Include delete confirmation

#### 4.3 TypeScript View Controllers
- Update `MessagesView.ts` to use new webview
- Update `CommentsView.ts` with new components
- Ensure proper message passing and state management

### Phase 5: Integration & Polish (Week 5)
**Priority: Low | Effort: Low**

#### 5.1 Loading States
- Add loading indicators for API calls
- Implement skeleton screens for initial load
- Handle network errors gracefully

#### 5.2 Empty States
- Design empty state messages
- Add helpful prompts for user actions

#### 5.3 Accessibility
- Add ARIA labels
- Ensure keyboard navigation
- Test with screen readers

## Technical Considerations

### Initial Setup Flow
```typescript
// Extension activation checks
export async function activate(context: vscode.ExtensionContext) {
    const config = new ConfigurationManager(context);
    
    // Check if first run
    if (!await config.getBackendUrl()) {
        // Show setup wizard
        await commands.executeCommand('computor.showSetupWizard');
        return;
    }
    
    // Check if course directory configured
    if (!await config.getCourseDirectory()) {
        await commands.executeCommand('computor.selectCourseDirectory');
        return;
    }
    
    // Normal activation continues...
}
```

### Setup Wizard Implementation
```javascript
// webview-ui/setup-wizard.js
class SetupWizard extends Component {
    constructor() {
        super();
        this.currentStep = 1;
        this.totalSteps = 3;
        this.backendUrl = '';
        this.gitlabToken = '';
        this.courseDirectory = '';
    }
    
    render() {
        // Step 1: Backend URL configuration
        // Step 2: GitLab PAT configuration
        // Step 3: Course directory selection
        // Validation and testing
        // Success confirmation
    }
}
```

### Token Management Flow
```typescript
// Extension handles authentication failures gracefully
interface TokenManager {
    // Primary token for all GitLab operations
    mainToken: string | undefined;
    
    // Repository-specific tokens map
    repositoryTokens: Map<string, string>;
    
    // Smart token selection
    getTokenForRepository(repoUrl: string): Promise<string> {
        // Check repository-specific token first
        // Fall back to main token
        // Prompt if neither works
    }
}
```

### API Integration Pattern
```typescript
// Base message handler pattern
abstract class BaseChatView extends BaseWebviewPanel {
    protected async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'send':
                await this.sendMessage(message.payload);
                break;
            case 'edit':
                await this.editMessage(message.id, message.payload);
                break;
            case 'delete':
                await this.deleteMessage(message.id);
                break;
            case 'refresh':
                await this.refresh();
                break;
        }
    }
}
```

### State Management
- Keep message state in TypeScript controller
- Webview is stateless, receives full state updates
- Use command pattern for all user actions

### Security
- Maintain CSP policies
- Sanitize all user input
- Use nonces for script execution
- Validate permissions server-side

## Migration Checklist

### Immediate Actions (Can Do Now)
- [x] Analyze old code structure
- [ ] Implement setup wizard for first-run experience
- [ ] Create ConfigurationManager for backend URL and directory
- [ ] Copy utility functions
- [ ] Migrate CSS theme files
- [ ] Add marked.js library

### Component Development
- [ ] TextArea component
- [ ] Avatar component
- [ ] Message component
- [ ] MessageList component
- [ ] ChatInput component

### View Implementation
- [ ] Messages webview (student)
- [ ] Messages webview (tutor)
- [ ] Comments webview
- [ ] Results webview (stretch goal)

### Testing & Quality
- [ ] Component unit tests
- [ ] Integration tests
- [ ] Accessibility audit
- [ ] Performance optimization

## Command Registration

### Extension Commands
```typescript
// package.json command contributions
{
  "contributes": {
    "commands": [
      {
        "command": "computor.showSetupWizard",
        "title": "Computor: Setup Wizard"
      },
      {
        "command": "computor.changeBackendUrl", 
        "title": "Computor: Change Backend URL"
      },
      {
        "command": "computor.updateGitLabToken",
        "title": "Computor: Update GitLab Token"
      },
      {
        "command": "computor.selectCourseDirectory",
        "title": "Computor: Select Course Directory"
      },
      {
        "command": "computor.refreshMessages",
        "title": "Refresh",
        "icon": "$(refresh)"
      },
      {
        "command": "computor.refreshComments",
        "title": "Refresh",
        "icon": "$(refresh)"
      },
      {
        "command": "computor.logout",
        "title": "Computor: Logout"
      },
      {
        "command": "computor.refreshAll",
        "title": "Computor: Refresh All Data"
      }
    ],
    "views": {
      "computor": [
        {
          "type": "webview",
          "id": "computor.messages",
          "name": "Messages"
        },
        {
          "type": "webview", 
          "id": "computor.comments",
          "name": "Comments",
          "when": "computor.role == 'tutor'"
        }
      ]
    }
  }
}
```

### Command Implementation Pattern
```typescript
// src/commands/setup.ts
export function registerSetupCommands(context: vscode.ExtensionContext) {
    const showSetupWizard = vscode.commands.registerCommand(
        'computor.showSetupWizard',
        async () => {
            const panel = new SetupWizardView(context);
            await panel.show();
        }
    );
    
    context.subscriptions.push(showSetupWizard);
}

// src/commands/auth.ts
export function registerAuthCommands(context: vscode.ExtensionContext) {
    const logout = vscode.commands.registerCommand(
        'computor.logout',
        async () => {
            // Clear all stored credentials
            await context.secrets.delete('computor.backendUrl');
            await context.secrets.delete('computor.gitlabToken');
            
            // Clear workspace state
            await context.workspaceState.update('computor.courseDirectory', undefined);
            
            // Notify user
            vscode.window.showInformationMessage(
                'Logged out successfully. Reload VS Code to complete the process.',
                'Reload Window'
            ).then(selection => {
                if (selection === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }
    );
    
    context.subscriptions.push(logout);
}
```

### Refresh Strategy
```typescript
// src/utils/refresh.ts
export class RefreshManager {
    private refreshCallbacks: Map<string, () => Promise<void>> = new Map();
    
    register(id: string, callback: () => Promise<void>) {
        this.refreshCallbacks.set(id, callback);
    }
    
    async refreshAll() {
        const promises = Array.from(this.refreshCallbacks.values())
            .map(callback => callback());
        
        await Promise.allSettled(promises);
    }
    
    async refresh(id: string) {
        const callback = this.refreshCallbacks.get(id);
        if (callback) {
            await callback();
        }
    }
}

// Usage in views
class MessagesView extends BaseWebviewPanel {
    constructor(context: vscode.ExtensionContext, refreshManager: RefreshManager) {
        super(context);
        refreshManager.register('messages', () => this.refresh());
    }
}
```

## Error Handling Patterns

### HTTP Error Handling
```typescript
// src/utils/errors.ts
export class ComputorError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode?: number,
        public details?: any
    ) {
        super(message);
        this.name = 'ComputorError';
    }
}

export class AuthenticationError extends ComputorError {
    constructor(message: string, details?: any) {
        super(message, 'AUTH_ERROR', 401, details);
    }
}

export class NetworkError extends ComputorError {
    constructor(message: string, statusCode: number, details?: any) {
        super(message, 'NETWORK_ERROR', statusCode, details);
    }
}

// Error handler utility
export async function handleApiError(error: any): Promise<void> {
    if (error.response) {
        // HTTP error responses
        switch (error.response.status) {
            case 401:
                throw new AuthenticationError('Invalid credentials');
            case 403:
                throw new ComputorError('Access denied', 'FORBIDDEN', 403);
            case 404:
                throw new ComputorError('Resource not found', 'NOT_FOUND', 404);
            default:
                throw new NetworkError(
                    error.response.data?.message || 'Request failed',
                    error.response.status
                );
        }
    } else if (error.code === 'ECONNREFUSED') {
        throw new NetworkError('Cannot connect to backend', 0);
    } else {
        throw new ComputorError('Unknown error occurred', 'UNKNOWN');
    }
}
```

### UI Error Display
```javascript
// webview-ui/utils/errors.js
export function showError(message, details = null) {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.innerHTML = `
            <div class="error-message">
                <span class="codicon codicon-error"></span>
                <span>${message}</span>
                ${details ? `<details><summary>Details</summary>${details}</details>` : ''}
            </div>
        `;
        errorContainer.style.display = 'block';
    }
}

export function clearError() {
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        errorContainer.style.display = 'none';
        errorContainer.innerHTML = '';
    }
}
```

## Testing Approach

### Unit Tests Structure
```typescript
// test/unit/configuration/ConfigurationManager.test.ts
import { ConfigurationManager } from '../../../src/configuration/ConfigurationManager';

describe('ConfigurationManager', () => {
    let manager: ConfigurationManager;
    
    beforeEach(() => {
        // Mock VS Code APIs
        manager = new ConfigurationManager(mockContext);
    });
    
    test('should store and retrieve backend URL', async () => {
        await manager.setBackendUrl('https://api.example.com');
        const url = await manager.getBackendUrl();
        expect(url).toBe('https://api.example.com');
    });
    
    test('should validate backend connection', async () => {
        // Mock HTTP requests
        const isValid = await manager.validateBackendConnection('https://api.example.com');
        expect(isValid).toBe(true);
    });
});
```

### Component Testing (Basic)
```javascript
// test/unit/components/TextArea.test.js
import { TextArea } from '../../../webview-ui/components/textarea.js';

describe('TextArea Component', () => {
    test('should render with placeholder', () => {
        const textarea = new TextArea({ placeholder: 'Type here...' });
        const element = textarea.render();
        expect(element.querySelector('textarea').placeholder).toBe('Type here...');
    });
    
    test('should auto-resize on input', () => {
        const textarea = new TextArea({ rows: 3, maxRows: 10 });
        // Simulate input and verify height changes
    });
});
```

## Success Metrics
- Clean component-based architecture
- Consistent UI/UX with VS Code
- Improved type safety with TypeScript
- Better error handling and loading states
- Maintained feature parity with old extension

## Notes
- Focus on components that provide immediate value
- Prioritize chat/messages over other features
- Ensure backward compatibility with existing API
- Document component APIs for future developers
- Use workspace-specific storage for repository tokens (better for multi-project workflows)
- Trigger setup wizard from command palette initially, add welcome view later if needed