# HTTP Client

## Overview
This document outlines the HTTP client architecture for the computor VS Code extension. The client will support multiple authentication mechanisms and provide a unified interface for API communication with the FastAPI backend.

## Authentication Methods

### 1. Basic Authentication
- Username/password combination
- Base64 encoded credentials
- Standard HTTP Basic Auth header

### 2. API Key Header Authentication
- Custom header-based authentication
- Support for various header names (X-API-Key, Authorization, etc.)
- Token-based authentication for services like GitLab

### 3. JWT SSO (Keycloak)
- JSON Web Token authentication
- OAuth 2.0 / OpenID Connect integration
- Automatic token refresh
- Bearer token in Authorization header

## Architecture

### Abstract Base Classes

#### HttpClient (Base Class)
```typescript
abstract class HttpClient {
  protected baseUrl: string;
  protected timeout: number;
  protected headers: Record<string, string>;
  
  constructor(baseUrl: string, timeout: number = 5000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'computor-vsc-extension'
    };
  }
  
  abstract authenticate(): Promise<void>;
  abstract isAuthenticated(): boolean;
  abstract getAuthHeaders(): Record<string, string>;
  
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, params);
  }
  
  async post<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('POST', endpoint, data, params);
  }
  
  async put<T>(endpoint: string, data?: any, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', endpoint, data, params);
  }
  
  async delete<T>(endpoint: string, params?: Record<string, any>): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', endpoint, undefined, params);
  }
  
  protected abstract request<T>(
    method: HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<HttpResponse<T>>;
}
```

#### AuthenticationStrategy
```typescript
abstract class AuthenticationStrategy {
  abstract authenticate(credentials: any): Promise<AuthResult>;
  abstract getAuthHeaders(): Record<string, string>;
  abstract isAuthenticated(): boolean;
  abstract refreshAuth?(): Promise<void>;
}
```

### Concrete Implementations

#### BasicAuthHttpClient
```typescript
class BasicAuthHttpClient extends HttpClient {
  private username: string;
  private password: string;
  private isAuth: boolean = false;
  
  constructor(baseUrl: string, username: string, password: string) {
    super(baseUrl);
    this.username = username;
    this.password = password;
  }
  
  async authenticate(): Promise<void> {
    // Validate credentials with a test request
    try {
      await this.get('/auth/validate');
      this.isAuth = true;
    } catch (error) {
      this.isAuth = false;
      throw new AuthenticationError('Invalid credentials');
    }
  }
  
  isAuthenticated(): boolean {
    return this.isAuth;
  }
  
  getAuthHeaders(): Record<string, string> {
    const credentials = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      'Authorization': `Basic ${credentials}`
    };
  }
  
  protected async request<T>(
    method: HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<HttpResponse<T>> {
    const headers = { ...this.headers, ...this.getAuthHeaders() };
    // Implementation using fetch or axios
  }
}
```

#### ApiKeyHttpClient
```typescript
class ApiKeyHttpClient extends HttpClient {
  private apiKey: string;
  private headerName: string;
  private headerPrefix: string;
  
  constructor(
    baseUrl: string,
    apiKey: string,
    headerName: string = 'X-API-Key',
    headerPrefix: string = ''
  ) {
    super(baseUrl);
    this.apiKey = apiKey;
    this.headerName = headerName;
    this.headerPrefix = headerPrefix;
  }
  
  async authenticate(): Promise<void> {
    // Validate API key with a test request
    try {
      await this.get('/auth/validate');
    } catch (error) {
      throw new AuthenticationError('Invalid API key');
    }
  }
  
  isAuthenticated(): boolean {
    return !!this.apiKey;
  }
  
  getAuthHeaders(): Record<string, string> {
    const headerValue = this.headerPrefix ? `${this.headerPrefix} ${this.apiKey}` : this.apiKey;
    return {
      [this.headerName]: headerValue
    };
  }
  
  protected async request<T>(
    method: HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<HttpResponse<T>> {
    const headers = { ...this.headers, ...this.getAuthHeaders() };
    // Implementation using fetch or axios
  }
}
```

#### JwtHttpClient
```typescript
class JwtHttpClient extends HttpClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private keycloakConfig: KeycloakConfig;
  
  constructor(baseUrl: string, keycloakConfig: KeycloakConfig) {
    super(baseUrl);
    this.keycloakConfig = keycloakConfig;
  }
  
  async authenticate(): Promise<void> {
    // Implement OAuth 2.0 flow
    const tokenResponse = await this.performOAuthFlow();
    this.setTokens(tokenResponse);
  }
  
  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }
  
  getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new AuthenticationError('No access token available');
    }
    return {
      'Authorization': `Bearer ${this.accessToken}`
    };
  }
  
  async refreshAuth(): Promise<void> {
    if (!this.refreshToken) {
      throw new AuthenticationError('No refresh token available');
    }
    
    const tokenResponse = await this.refreshAccessToken();
    this.setTokens(tokenResponse);
  }
  
  protected async request<T>(
    method: HttpMethod,
    endpoint: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<HttpResponse<T>> {
    // Check if token needs refresh
    if (this.isTokenExpired() && this.refreshToken) {
      await this.refreshAuth();
    }
    
    const headers = { ...this.headers, ...this.getAuthHeaders() };
    // Implementation using fetch or axios
  }
  
  private isTokenExpired(): boolean {
    return this.tokenExpiry ? new Date() >= this.tokenExpiry : false;
  }
}
```

### Supporting Types

#### HttpResponse
```typescript
interface HttpResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}
```

#### HttpMethod
```typescript
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
```

#### AuthResult
```typescript
interface AuthResult {
  success: boolean;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  error?: string;
}
```

#### KeycloakConfig
```typescript
interface KeycloakConfig {
  realm: string;
  clientId: string;
  serverUrl: string;
  redirectUri: string;
}
```

## Error Handling

### HTTP Errors
```typescript
class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public response?: any
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

### Error Handling Strategy
- Automatic retry for transient errors
- Exponential backoff for rate limiting
- Clear error messages for different failure types
- Logging for debugging purposes

## Request/Response Interceptors

### Request Interceptor
```typescript
interface RequestInterceptor {
  onRequest(config: RequestConfig): RequestConfig | Promise<RequestConfig>;
  onError(error: any): Promise<any>;
}
```

### Response Interceptor
```typescript
interface ResponseInterceptor {
  onResponse<T>(response: HttpResponse<T>): HttpResponse<T> | Promise<HttpResponse<T>>;
  onError(error: any): Promise<any>;
}
```

## Configuration

### Client Configuration
```typescript
interface HttpClientConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  headers: Record<string, string>;
  interceptors?: {
    request?: RequestInterceptor[];
    response?: ResponseInterceptor[];
  };
}
```

### Authentication Configuration
```typescript
interface AuthConfig {
  type: 'basic' | 'apikey' | 'jwt';
  basic?: {
    username: string;
    password: string;
  };
  apikey?: {
    key: string;
    headerName: string;
    headerPrefix: string;
  };
  jwt?: KeycloakConfig;
}
```

## Usage Examples

### Basic Authentication
```typescript
const client = new BasicAuthHttpClient('https://api.example.com', 'user', 'pass');
await client.authenticate();
const response = await client.get('/users');
```

### API Key Authentication
```typescript
const client = new ApiKeyHttpClient('https://api.example.com', 'api-key-123', 'X-API-Key');
await client.authenticate();
const response = await client.post('/data', { key: 'value' });
```

### JWT Authentication
```typescript
const keycloakConfig = {
  realm: 'myrealm',
  clientId: 'myclient',
  serverUrl: 'https://keycloak.example.com',
  redirectUri: 'http://localhost:3000/callback'
};

const client = new JwtHttpClient('https://api.example.com', keycloakConfig);
await client.authenticate();
const response = await client.get('/protected-resource');
```

## Testing Strategy

### Unit Tests
- Test each authentication method
- Test request/response handling
- Test error scenarios
- Mock HTTP responses

### Integration Tests
- Test with real API endpoints
- Test authentication flows
- Test token refresh mechanisms
- Test error handling with actual services

### Security Tests
- Test token security
- Test authentication bypass attempts
- Test credential handling
- Test secure storage integration

## Caching

### Overview
The HTTP client includes a flexible caching system that can significantly improve performance by reducing redundant API calls.

### Cache Strategies

#### InMemoryCache
- LRU (Least Recently Used) or FIFO (First In First Out) eviction policies
- Configurable maximum size
- Automatic expiration based on TTL
- Zero dependencies, pure TypeScript implementation

#### NoOpCache
- Null object pattern for disabled caching
- No performance overhead when caching is disabled

### Configuration

#### Basic Cache Configuration
```typescript
const client = new BasicAuthHttpClient(
  'https://api.example.com',
  'username',
  'password',
  5000, // timeout
  {
    enabled: true,              // Enable caching
    ttl: 300000,               // 5 minutes default TTL
    maxSize: 100,              // Maximum cached entries
    respectCacheHeaders: true   // Honor Cache-Control headers
  }
);
```

#### Advanced Usage
```typescript
// Invalidate specific cache entry
await client.invalidateCacheEntry('/users/123');

// Clear entire cache
await client.clearCache();

// Disable caching at runtime
client.setCacheEnabled(false);

// Re-enable caching
client.setCacheEnabled(true);
```

### Cache Key Generation
Cache keys are generated based on:
- HTTP method
- URL (including base URL)
- Query parameters
- Request body (for POST/PUT requests)

### HTTP Cache Headers Support
When `respectCacheHeaders` is enabled:
- Honors `Cache-Control: max-age=X` directives
- Respects `Cache-Control: no-cache` and `no-store`
- Stores `ETag` and `Last-Modified` for future conditional requests

### Cache-Aware Patterns

#### Pattern 1: Cache Invalidation on Updates
```typescript
async function updateUser(userId: string, data: any) {
  // Update the user
  await client.put(`/users/${userId}`, data);
  
  // Invalidate related cache entries
  await client.invalidateCacheEntry(`/users/${userId}`);
  await client.invalidateCacheEntry('/users'); // List might have changed
}
```

#### Pattern 2: Aggressive Caching for Static Data
```typescript
const staticDataClient = new ApiKeyHttpClient(
  'https://api.example.com',
  'api-key',
  'X-API-Key',
  '',
  5000,
  {
    enabled: true,
    ttl: 3600000,              // 1 hour for static data
    respectCacheHeaders: false  // Ignore server cache directives
  }
);
```

### Implementation Details

#### CacheStrategy Interface
```typescript
abstract class CacheStrategy {
  abstract get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  abstract set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void>;
  abstract delete(key: CacheKey): Promise<void>;
  abstract clear(): Promise<void>;
  abstract has(key: CacheKey): Promise<boolean>;
  
  isExpired(entry: CacheEntry): boolean;
}
```

#### Cache Entry Structure
```typescript
interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  lastModified?: string;
}
```

### Future Enhancements
- Persistent cache using VS Code's storage API
- Conditional requests using ETag/If-None-Match
- Request deduplication for in-flight requests
- Cache warming strategies
- Cache statistics and hit rate monitoring

## Performance Considerations

### Optimization
- Connection pooling
- Request deduplication (with caching)
- Response caching (implemented)
- Retry mechanisms with exponential backoff

### Monitoring
- Request/response logging
- Performance metrics
- Error tracking
- Authentication success rates
- Cache hit/miss statistics