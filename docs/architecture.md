# Computor VS Code Extension Architecture

## Overview

The Computor VS Code Extension is built using TypeScript and follows a layered architecture pattern with clear separation of concerns. The extension integrates with a FastAPI backend to provide comprehensive course management capabilities for lecturers, students, and tutors.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     VS Code Extension Host                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │                 Presentation Layer                  │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │     │
│  │  │ Commands │  │Tree Views│  │   Webviews   │    │     │
│  │  └──────────┘  └──────────┘  └──────────────┘    │     │
│  └────────────────────────────────────────────────────┘     │
│                           │                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │                  Business Logic Layer               │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │     │
│  │  │ Services │  │ Managers │  │  Validators  │    │     │
│  │  └──────────┘  └──────────┘  └──────────────┘    │     │
│  └────────────────────────────────────────────────────┘     │
│                           │                                  │
│  ┌────────────────────────────────────────────────────┐     │
│  │                    Data Access Layer                │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │     │
│  │  │   HTTP   │  │   Git    │  │   Storage    │    │     │
│  │  │  Clients │  │  Wrapper │  │   Managers   │    │     │
│  │  └──────────┘  └──────────┘  └──────────────┘    │     │
│  └────────────────────────────────────────────────────┘     │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │   External Services   │
                │  ┌─────┐  ┌────────┐ │
                │  │ API │  │ GitLab │ │
                │  └─────┘  └────────┘ │
                └───────────────────────┘
```

## Core Components

### 1. Extension Entry Point (`extension.ts`)

The main entry point that:
- Registers all commands with VS Code
- Initializes services and managers
- Sets up tree data providers
- Manages extension lifecycle

**Current Issues:**
- Global state management (needs refactoring to DI)
- Missing comprehensive error handling

### 2. Presentation Layer

#### Commands (`src/commands/`)
- **LecturerCommands**: Course management operations
- **ExampleCommands**: Example-related functionality
- **CourseGroupCommands**: Group management

**Responsibilities:**
- Handle user interactions
- Validate user input
- Delegate to business logic
- Show feedback to users

#### Tree Views (`src/ui/tree/`)
- **LecturerTreeDataProvider**: Main tree for lecturers
- **ApiTreeDataProvider**: Generic API-backed tree
- **JsonTreeDataProvider**: JSON-based tree
- **TestResultTreeDataProvider**: Test results display

**Responsibilities:**
- Display hierarchical data
- Handle tree interactions (click, drag, drop)
- Refresh on data changes
- Provide context menus

#### Webviews (`src/ui/webviews/`)
- **BaseWebviewProvider**: Abstract base class
- **OrganizationWebviewProvider**: Organization management
- **CourseWebviewProvider**: Course details
- **CourseContentWebviewProvider**: Content management

**Responsibilities:**
- Rich HTML UI for complex interactions
- Form handling and validation
- Real-time updates via messaging

### 3. Business Logic Layer

#### Services (`src/services/`)
- **ComputorApiService**: Backend API integration
- **GitLabTokenManager**: GitLab token management

**Responsibilities:**
- Business rule implementation
- Data transformation
- Orchestration of operations
- Caching strategies

#### Managers
- **GitManager**: High-level Git operations
- **ComputorSettingsManager**: Settings management
- **TokenManager**: Authentication token handling

**Responsibilities:**
- Coordinate multiple services
- Implement workflows
- Manage state
- Handle complex operations

### 4. Data Access Layer

#### HTTP Clients (`src/http/`)
- **HttpClient**: Base HTTP client
- **BasicAuthHttpClient**: Basic authentication
- **ApiKeyHttpClient**: API key authentication
- **JwtHttpClient**: JWT/OAuth authentication

**Features:**
- Multiple authentication strategies
- Request/response interceptors
- Caching support
- Error handling

#### Git Integration (`src/git/`)
- **GitWrapper**: Low-level Git operations
- **GitManager**: High-level Git workflows
- **GitErrorHandler**: Git-specific error handling

**Features:**
- Repository management
- Branch operations
- Commit/push/pull
- Stash management

#### Storage (`src/settings/`)
- **JsonSettingsStorage**: JSON file storage
- **VscodeSecureStorage**: Secure credential storage
- **SettingsStorage**: Abstract storage interface

**Features:**
- Persistent configuration
- Secure credential storage
- Workspace-specific settings

## Authentication Architecture

### Authentication Flow
```
User Login
    │
    ├─→ Basic Auth ──→ Base64 Encode ──→ API
    │
    ├─→ API Key ────→ Header Token ───→ API
    │
    └─→ SSO/JWT ────→ OAuth Flow ────→ Keycloak ──→ API
```

### Current Implementation
- **ComputorAuthenticationProvider**: Main auth provider
- **VscodeCredentialStorage**: Credential persistence
- **TokenManager**: Token lifecycle management

### Issues
- Missing token refresh mechanism
- Basic auth stored insecurely
- No token expiration handling

## Data Flow

### Tree View Data Flow
```
User Action → Command → Service → API Call → Response
    ↓                                           ↓
Tree Refresh ← Cache Update ← Data Transform ←─┘
```

### Webview Communication
```
Extension ←──[postMessage]──→ Webview
    │                            │
    ├─ Send Command ────────────→│
    │                            │
    │←──── Handle Response ──────┤
    │                            │
    └─ Update State ─────────────┘
```

## Caching Strategy

### Current Implementation
- **InMemoryCache**: LRU/FIFO cache strategies
- **NoOpCache**: Disabled caching

### Cache Layers
1. **HTTP Response Cache**: API responses
2. **Tree Data Cache**: Processed tree nodes
3. **Authentication Cache**: Token storage

### Issues
- No cache size limits
- Missing eviction policies
- Potential memory leaks

## Error Handling

### Error Types
```typescript
interface ErrorHierarchy {
  Error
    ├── HttpError (Network/API errors)
    ├── AuthenticationError (Auth failures)
    ├── GitError (Git operations)
    ├── SettingsError (Configuration)
    └── ValidationError (User input)
}
```

### Current Issues
- Inconsistent error handling
- Missing error recovery
- Poor user feedback

## Type System

### Generated Types (`src/types/generated/`)
Auto-generated from backend Pydantic models:
- Organizations
- Courses
- Users
- Tasks
- Examples

### Custom Types
- **TreeTypes**: Tree view interfaces
- **HttpTypes**: HTTP client types
- **GitTypes**: Git operation types
- **SettingsTypes**: Configuration types

### Issues
- Extensive use of `any` types
- Missing type definitions
- Unsafe type casting

## Dependency Management

### External Dependencies
- **vscode**: VS Code API
- **simple-git**: Git operations
- **node-fetch**: HTTP requests (considering axios)

### Internal Dependencies
```
Commands → Services → HTTP Clients → External APIs
         ↘         ↗
          Managers
```

### Circular Dependencies
Currently none identified, but risk exists with global state.

## Performance Considerations

### Current Issues
1. **N+1 Queries**: Multiple API calls in loops
2. **No Lazy Loading**: All data loaded eagerly
3. **Missing Pagination**: Large datasets loaded entirely
4. **Synchronous Operations**: Blocking UI operations

### Optimization Opportunities
- Implement request batching
- Add lazy loading for tree nodes
- Implement virtual scrolling
- Use web workers for heavy operations

## Security Architecture

### Credential Storage
```
User Credentials
    │
    ├─→ VS Code SecretStorage (Secure)
    │     └─→ OS Keychain
    │
    └─→ Settings.json (Insecure - only non-sensitive)
```

### Security Issues
- Basic auth in base64 (needs encryption)
- Missing CSP for webviews
- No input sanitization in places
- Token validation incomplete

## Testing Architecture

### Test Structure
```
test/
├── unit/           # Isolated component tests
├── integration/    # Component interaction tests
├── e2e/           # Full workflow tests
└── manual/        # Manual testing scripts
```

### Current Coverage
- Limited unit tests
- Some integration tests
- No E2E tests
- Manual test scripts for Git/GitLab

## Build and Deployment

### Build Process
```
TypeScript Source → TSC Compilation → JavaScript Output
                          ↓
                    Type Checking
                          ↓
                      Bundle → VSIX Package
```

### Configuration Files
- `tsconfig.json`: TypeScript configuration
- `package.json`: Extension manifest
- `.eslintrc.json`: Linting rules
- `.mocharc.json`: Test configuration

## Future Architecture Improvements

### 1. Dependency Injection
Replace global state with DI container:
```typescript
class DIContainer {
  register<T>(token: Token<T>, factory: Factory<T>): void;
  resolve<T>(token: Token<T>): T;
}
```

### 2. Event-Driven Architecture
Implement event bus for loose coupling:
```typescript
class EventBus {
  emit(event: Event): void;
  on(eventType: string, handler: Handler): void;
}
```

### 3. Plugin Architecture
Support for extensibility:
```typescript
interface Plugin {
  activate(context: ExtensionContext): void;
  deactivate(): void;
}
```

### 4. Microservices Pattern
Split into smaller, focused services:
- Authentication Service
- Course Management Service
- Git Operations Service
- UI Service

## Migration Strategy

### Phase 1: Foundation (Current)
- Fix type safety issues
- Implement proper error handling
- Complete missing features

### Phase 2: Refactoring
- Implement DI container
- Extract service interfaces
- Add comprehensive testing

### Phase 3: Optimization
- Add caching layers
- Implement lazy loading
- Optimize performance

### Phase 4: Enhancement
- Add plugin support
- Implement event bus
- Add monitoring

## Monitoring and Observability

### Proposed Telemetry
```typescript
interface Telemetry {
  performance: PerformanceMetrics;
  errors: ErrorTracking;
  usage: UsageAnalytics;
  diagnostics: SystemDiagnostics;
}
```

### Logging Strategy
- Debug: Detailed operation logs
- Info: Important state changes
- Warning: Recoverable issues
- Error: Failures requiring attention

## Conclusion

The Computor VS Code Extension has a solid architectural foundation but requires significant refactoring to address type safety, performance, and maintainability issues. The proposed improvements will transform it into a robust, scalable, and maintainable system suitable for production use.