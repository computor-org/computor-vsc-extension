# Authentication

## Overview
This document outlines the authentication strategy for the computor VS Code extension. The extension will support multiple authentication methods to connect with the FastAPI backend.

## Authentication Methods

### 1. API Token Authentication
**Primary method for GitLab Personal Access Tokens**

#### Features
- Simple token-based authentication
- Support for GitLab Personal Access Tokens
- Secure token storage in VS Code settings
- Token validation and refresh mechanisms

#### Implementation
```typescript
interface TokenAuthProvider {
  authenticate(token: string): Promise<AuthResult>;
  validateToken(token: string): Promise<boolean>;
  refreshToken?(): Promise<string>;
}
```

#### Security Considerations
- Store tokens securely using VS Code's SecretStorage API
- Implement token expiration handling
- Provide clear token revocation mechanisms
- Validate token format and permissions

### 2. SSO with Keycloak
**Enterprise authentication solution**

#### Features
- OAuth 2.0 / OpenID Connect flow
- Single Sign-On capabilities
- Role-based access control
- Token refresh and management

#### Implementation
```typescript
interface SSOAuthProvider {
  initiateLogin(): Promise<void>;
  handleCallback(code: string): Promise<AuthResult>;
  refreshToken(): Promise<string>;
  logout(): Promise<void>;
}
```

#### Flow
1. User initiates authentication
2. Redirect to Keycloak login page
3. User authenticates with Keycloak
4. Keycloak redirects back with authorization code
5. Exchange code for access token
6. Store token securely

## Architecture

### Abstract Base Classes

#### AuthProvider (Base Class)
```typescript
abstract class AuthProvider {
  abstract authenticate(...args: any[]): Promise<AuthResult>;
  abstract isAuthenticated(): boolean;
  abstract getAccessToken(): string | null;
  abstract logout(): Promise<void>;
}
```

#### AuthResult Interface
```typescript
interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  user?: UserInfo;
  error?: string;
}
```

### Concrete Implementations

#### TokenAuthProvider
- Extends AuthProvider
- Implements token-based authentication
- Handles GitLab Personal Access Tokens
- Provides token validation

#### KeycloakAuthProvider
- Extends AuthProvider
- Implements OAuth 2.0 flow
- Handles Keycloak integration
- Manages token refresh

### Authentication Manager
Central service that:
- Manages different authentication providers
- Handles provider selection and switching
- Provides unified authentication interface
- Manages token storage and retrieval

## Configuration

### Settings Structure
```typescript
interface AuthConfig {
  provider: 'token' | 'keycloak';
  tokenAuth?: {
    tokenType: 'gitlab' | 'generic';
  };
  keycloakAuth?: {
    realm: string;
    clientId: string;
    serverUrl: string;
  };
}
```

### VS Code Settings
- `computor.auth.provider`: Authentication provider selection
- `computor.auth.keycloak.*`: Keycloak configuration
- Tokens stored in VS Code SecretStorage

## Security Best Practices

### Token Security
- Use VS Code's SecretStorage for sensitive data
- Implement token expiration checks
- Provide secure token transmission
- Support token revocation

### OAuth Security
- Implement PKCE for OAuth flows
- Validate state parameters
- Use secure redirect URIs
- Implement proper logout flows

### General Security
- Validate all authentication responses
- Implement rate limiting for authentication attempts
- Log authentication events (without sensitive data)
- Provide clear error messages without exposing internals

## Testing Strategy

### Unit Tests
- Test each authentication provider in isolation
- Mock external authentication services
- Test token validation and refresh logic
- Test error handling scenarios

### Integration Tests
- Test actual authentication flows
- Test token storage and retrieval
- Test provider switching
- Test authentication with backend API

### Security Tests
- Test token security and storage
- Test authentication bypass attempts
- Test token expiration handling
- Test logout and session cleanup