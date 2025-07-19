# Login Data Storage

## Overview
This document outlines secure storage options for login data in the computor VS Code extension. The extension stores authentication credentials securely across different platforms while maintaining security best practices.

## Implementation Status
✅ **Fully Implemented** - The authentication system is complete using VS Code's native AuthenticationProvider and SecretStorage APIs.

## Storage Options

### 1. VS Code SecretStorage API (Primary)
**Built-in secure storage provided by VS Code**

#### Advantages
- Native VS Code integration
- Cross-platform compatibility
- Automatic encryption
- No additional dependencies
- Integrates with OS keyring systems

#### Implementation
**Note: This implementation uses VS Code's built-in `vscode.SecretStorage` API accessed via `context.secrets`**

```typescript
class VscodeCredentialStorage implements CredentialStorage {
  private secretStorage: vscode.SecretStorage;
  
  constructor(context: vscode.ExtensionContext) {
    this.secretStorage = context.secrets;
  }
  
  async store(key: string, credentials: LoginCredentials): Promise<void> {
    const encrypted = JSON.stringify(credentials);
    await this.secretStorage.store(`computor.${key}`, encrypted);
  }
  
  async retrieve(key: string): Promise<LoginCredentials | undefined> {
    const encrypted = await this.secretStorage.get(`computor.${key}`);
    return encrypted ? JSON.parse(encrypted) : undefined;
  }
  
  async delete(key: string): Promise<void> {
    await this.secretStorage.delete(`computor.${key}`);
  }
}
```

### 2. System Keyring (Secondary)
**Platform-specific secure storage using keyring libraries**

#### Libraries
- **keytar**: Node.js module for keychain/keyring access
- **node-keytar**: Alternative keyring implementation
- **@vscode/keytar**: VS Code's own keyring wrapper (recommended)

#### Platform Support
- **Windows**: Windows Credential Manager
- **macOS**: Keychain Access
- **Linux**: libsecret/gnome-keyring

#### Implementation
```typescript
import * as keytar from 'keytar';

class KeyringCredentialStorage implements CredentialStorage {
  private serviceName: string = 'computor-vscode-extension';
  
  async store(key: string, credentials: LoginCredentials): Promise<void> {
    const accountName = `${key}@${credentials.realm || 'default'}`;
    const password = JSON.stringify(credentials);
    await keytar.setPassword(this.serviceName, accountName, password);
  }
  
  async retrieve(key: string): Promise<LoginCredentials | undefined> {
    const accountName = `${key}@${credentials.realm || 'default'}`;
    const password = await keytar.getPassword(this.serviceName, accountName);
    return password ? JSON.parse(password) : undefined;
  }
  
  async delete(key: string): Promise<void> {
    const accountName = `${key}@${credentials.realm || 'default'}`;
    await keytar.deletePassword(this.serviceName, accountName);
  }
  
  async findCredentials(): Promise<Array<{ account: string; password: string }>> {
    return await keytar.findCredentials(this.serviceName);
  }
}
```

### 3. Encrypted File Storage (Fallback)
**AES-encrypted JSON files for systems without keyring support**

#### Implementation
```typescript
import * as crypto from 'crypto';

class EncryptedFileStorage implements CredentialStorage {
  private filePath: string;
  private encryptionKey: Buffer;
  
  constructor(filePath: string, masterPassword: string) {
    this.filePath = filePath;
    this.encryptionKey = crypto.scryptSync(masterPassword, 'salt', 32);
  }
  
  async store(key: string, credentials: LoginCredentials): Promise<void> {
    const data = await this.loadEncryptedData();
    data[key] = credentials;
    await this.saveEncryptedData(data);
  }
  
  async retrieve(key: string): Promise<LoginCredentials | undefined> {
    const data = await this.loadEncryptedData();
    return data[key];
  }
  
  async delete(key: string): Promise<void> {
    const data = await this.loadEncryptedData();
    delete data[key];
    await this.saveEncryptedData(data);
  }
  
  private async loadEncryptedData(): Promise<Record<string, LoginCredentials>> {
    try {
      const encryptedData = await fs.readFile(this.filePath, 'utf8');
      return this.decrypt(encryptedData);
    } catch (error) {
      return {};
    }
  }
  
  private async saveEncryptedData(data: Record<string, LoginCredentials>): Promise<void> {
    const encryptedData = this.encrypt(data);
    await fs.writeFile(this.filePath, encryptedData, 'utf8');
  }
  
  private encrypt(data: any): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(encryptedData: string): any {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}
```

## Architecture

### Abstract Base Classes

#### CredentialStorage (Base Interface)
```typescript
interface CredentialStorage {
  store(key: string, credentials: LoginCredentials): Promise<void>;
  retrieve(key: string): Promise<LoginCredentials | undefined>;
  delete(key: string): Promise<void>;
  list?(): Promise<string[]>;
  clear?(): Promise<void>;
}
```

#### LoginCredentials (Data Structure)
```typescript
interface LoginCredentials {
  type: 'basic' | 'token' | 'oauth' | 'jwt';
  realm?: string;
  username?: string;
  password?: string;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

interface BasicAuthCredentials extends LoginCredentials {
  type: 'basic';
  username: string;
  password: string;
}

interface TokenCredentials extends LoginCredentials {
  type: 'token';
  token: string;
}

interface OAuthCredentials extends LoginCredentials {
  type: 'oauth';
  token: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface JwtCredentials extends LoginCredentials {
  type: 'jwt';
  token: string;
  refreshToken?: string;
  expiresAt?: Date;
}
```

### Credential Manager

#### ComputorCredentialManager
```typescript
class ComputorCredentialManager {
  private primaryStorage: CredentialStorage;
  private fallbackStorage: CredentialStorage;
  
  constructor(context: vscode.ExtensionContext) {
    this.primaryStorage = new VscodeCredentialStorage(context);
    
    // Fallback storage selection based on platform capabilities
    if (this.isKeytarAvailable()) {
      this.fallbackStorage = new KeyringCredentialStorage();
    } else {
      const encryptedPath = path.join(os.homedir(), '.computor', 'credentials.enc');
      this.fallbackStorage = new EncryptedFileStorage(encryptedPath, this.getMasterPassword());
    }
  }
  
  async storeCredentials(profileName: string, credentials: LoginCredentials): Promise<void> {
    try {
      await this.primaryStorage.store(profileName, credentials);
    } catch (error) {
      console.warn('Primary storage failed, using fallback:', error);
      await this.fallbackStorage.store(profileName, credentials);
    }
  }
  
  async retrieveCredentials(profileName: string): Promise<LoginCredentials | undefined> {
    try {
      return await this.primaryStorage.retrieve(profileName);
    } catch (error) {
      console.warn('Primary storage failed, using fallback:', error);
      return await this.fallbackStorage.retrieve(profileName);
    }
  }
  
  async deleteCredentials(profileName: string): Promise<void> {
    await Promise.allSettled([
      this.primaryStorage.delete(profileName),
      this.fallbackStorage.delete(profileName)
    ]);
  }
  
  async listStoredProfiles(): Promise<string[]> {
    const profiles = new Set<string>();
    
    try {
      const primaryProfiles = await this.primaryStorage.list?.() || [];
      primaryProfiles.forEach(profile => profiles.add(profile));
    } catch (error) {
      console.warn('Failed to list primary storage profiles:', error);
    }
    
    try {
      const fallbackProfiles = await this.fallbackStorage.list?.() || [];
      fallbackProfiles.forEach(profile => profiles.add(profile));
    } catch (error) {
      console.warn('Failed to list fallback storage profiles:', error);
    }
    
    return Array.from(profiles);
  }
  
  private isKeytarAvailable(): boolean {
    try {
      require('keytar');
      return true;
    } catch {
      return false;
    }
  }
  
  private getMasterPassword(): string {
    // Generate or retrieve master password for encryption
    // This could be derived from machine ID, user ID, or stored separately
    return crypto.createHash('sha256').update(os.userInfo().username + os.hostname()).digest('hex');
  }
}
```

## Security Features

### Token Management
```typescript
class TokenManager {
  private credentialManager: ComputorCredentialManager;
  
  constructor(credentialManager: ComputorCredentialManager) {
    this.credentialManager = credentialManager;
  }
  
  async storeToken(profileName: string, token: string, expiresAt?: Date): Promise<void> {
    const credentials: TokenCredentials = {
      type: 'token',
      token: token,
      expiresAt: expiresAt,
      metadata: {
        storedAt: new Date().toISOString()
      }
    };
    
    await this.credentialManager.storeCredentials(profileName, credentials);
  }
  
  async retrieveValidToken(profileName: string): Promise<string | undefined> {
    const credentials = await this.credentialManager.retrieveCredentials(profileName);
    
    if (!credentials || credentials.type !== 'token') {
      return undefined;
    }
    
    const tokenCredentials = credentials as TokenCredentials;
    
    // Check token expiration
    if (tokenCredentials.expiresAt && new Date() >= tokenCredentials.expiresAt) {
      await this.credentialManager.deleteCredentials(profileName);
      return undefined;
    }
    
    return tokenCredentials.token;
  }
  
  async refreshToken(profileName: string): Promise<string | undefined> {
    const credentials = await this.credentialManager.retrieveCredentials(profileName);
    
    if (!credentials || !credentials.refreshToken) {
      return undefined;
    }
    
    try {
      // Implement token refresh logic
      const newToken = await this.performTokenRefresh(credentials.refreshToken);
      await this.storeToken(profileName, newToken.accessToken, newToken.expiresAt);
      return newToken.accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      await this.credentialManager.deleteCredentials(profileName);
      return undefined;
    }
  }
  
  private async performTokenRefresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
    // Implementation depends on the authentication provider
    throw new Error('Token refresh not implemented');
  }
}
```

### Password Utilities
```typescript
class PasswordUtilities {
  static generateSecurePassword(length: number = 32): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
  
  static hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }
  
  static verifyPassword(password: string, hash: string, salt: string): boolean {
    const hashVerify = this.hashPassword(password, salt);
    return hash === hashVerify;
  }
  
  static generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }
}
```

## Error Handling

### Custom Errors
```typescript
class CredentialStorageError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'CredentialStorageError';
  }
}

class CredentialNotFoundError extends CredentialStorageError {
  constructor(key: string) {
    super(`Credentials not found for key: ${key}`);
    this.name = 'CredentialNotFoundError';
  }
}

class CredentialEncryptionError extends CredentialStorageError {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialEncryptionError';
  }
}

class TokenExpiredError extends CredentialStorageError {
  constructor() {
    super('Token has expired');
    this.name = 'TokenExpiredError';
  }
}
```

## Platform-Specific Considerations

### Windows
- Uses Windows Credential Manager
- Supports Windows Hello integration
- Registry-based fallback options

### macOS
- Uses Keychain Access
- Supports Touch ID/Face ID integration
- Keychain sharing between apps

### Linux
- Uses libsecret/gnome-keyring
- Supports KDE Wallet integration
- Encrypted file fallback for headless systems

## Usage Examples

### Basic Usage
```typescript
const credentialManager = new ComputorCredentialManager(context);

// Store credentials
await credentialManager.storeCredentials('production', {
  type: 'basic',
  username: 'user@example.com',
  password: 'securepassword',
  realm: 'production'
});

// Retrieve credentials
const credentials = await credentialManager.retrieveCredentials('production');

// Delete credentials
await credentialManager.deleteCredentials('production');
```

### Token Management
```typescript
const tokenManager = new TokenManager(credentialManager);

// Store token
await tokenManager.storeToken('gitlab-token', 'glpat-xxxxxxxxxxxx', new Date(Date.now() + 3600000));

// Retrieve valid token
const token = await tokenManager.retrieveValidToken('gitlab-token');

// Refresh token
const newToken = await tokenManager.refreshToken('gitlab-token');
```

## Security Best Practices

### Data Protection
- Never store credentials in plain text
- Use strong encryption for file-based storage
- Implement secure key derivation
- Clear sensitive data from memory

### Access Control
- Validate all credential access attempts
- Implement rate limiting for authentication
- Log security events (without sensitive data)
- Provide secure credential deletion

### Token Management
- Implement proper token expiration
- Support token refresh mechanisms
- Validate token integrity
- Secure token transmission

## Testing Strategy

### Unit Tests
- Test each storage implementation
- Test credential encryption/decryption
- Test token expiration handling
- Test error scenarios

### Integration Tests
- Test with real keyring systems
- Test cross-platform compatibility
- Test VS Code SecretStorage integration
- Test credential migration

### Security Tests
- Test encryption strength
- Test credential isolation
- Test access control
- Test secure deletion

## Performance Considerations

### Optimization
- Cache frequently accessed credentials
- Use lazy loading for credential lists
- Implement credential prefetching
- Optimize encryption operations

### Memory Management
- Clear sensitive data from memory
- Use secure memory allocation
- Implement proper garbage collection
- Monitor memory usage for leaks

## Current Implementation

### VS Code Native Authentication
The extension uses VS Code's built-in authentication framework:

```typescript
export class ComputorAuthenticationProvider implements vscode.AuthenticationProvider {
  // Implements VS Code's AuthenticationProvider interface
  // Provides automatic session management
  // Integrates with VS Code's Accounts UI
}
```

### Key Components
1. **ComputorAuthenticationProvider**
   - Main authentication provider implementing `vscode.AuthenticationProvider`
   - Handles sign-in/sign-out flow
   - Manages authentication sessions
   - Integrates with VS Code's account management UI

2. **VscodeCredentialStorage**
   - Uses VS Code's `SecretStorage` API exclusively
   - No external dependencies (no keytar required)
   - Automatic encryption and platform-specific keyring integration
   - Maintains credential index for listing profiles

3. **ComputorCredentialManager**
   - High-level credential operations
   - Session caching for performance
   - Automatic expiration handling
   - Support for multiple credential types

4. **TokenManager**
   - Token lifecycle management
   - JWT parsing and expiration detection
   - Token revocation support
   - Secure token generation utilities

### Authentication Flow
1. User triggers sign-in via command or VS Code Accounts menu
2. Authentication provider prompts for credentials based on settings
3. Credentials are validated and stored securely
4. Session is created and managed by VS Code
5. Authentication headers are generated for API requests

### Integration with Settings
The authentication system seamlessly integrates with the settings storage:
- Reads authentication configuration from settings
- Determines auth method (token vs basic auth)
- Uses base URL from settings for API endpoints

### Security Features
- All credentials stored using VS Code's SecretStorage
- Automatic encryption by VS Code
- Platform-specific keyring integration
- No plain text storage
- Session-based caching with expiration

### Usage Example
```typescript
// Sign in using VS Code authentication
const session = await vscode.authentication.getSession('computor', [], { createIfNone: true });

// Get authentication headers
const headers = ComputorAuthenticationProvider.getAuthHeaders(session);

// Use headers for API requests
const response = await fetch(url, { headers });
```