# Settings Storage

## Overview
This document outlines the local settings storage system for the computor VS Code extension. The extension will store configuration settings locally in the user's home directory, including backend URLs, realm configurations, and other persistent settings.

## Storage Strategy

### Storage Locations
1. **User Home Directory**: `~/.computor/` for cross-platform compatibility
2. **VS Code Settings**: Integration with VS Code's configuration system
3. **Secure Storage**: VS Code's SecretStorage for sensitive data

### File Structure
```
~/.computor/
├── config.json          # Main configuration file
├── profiles/             # Different environment profiles
│   ├── development.json
│   ├── staging.json
│   └── production.json
├── cache/               # Temporary cache files
└── logs/                # Application logs
```

## Architecture

### Abstract Base Classes

#### SettingsStorage (Base Class)
```typescript
abstract class SettingsStorage<T> {
  protected abstract filePath: string;
  protected cache: Map<string, any> = new Map();
  
  abstract load(): Promise<T>;
  abstract save(settings: T): Promise<void>;
  abstract get<K extends keyof T>(key: K): T[K] | undefined;
  abstract set<K extends keyof T>(key: K, value: T[K]): Promise<void>;
  abstract delete<K extends keyof T>(key: K): Promise<void>;
  abstract exists(): Promise<boolean>;
  abstract clear(): Promise<void>;
  
  protected abstract validate(settings: T): boolean;
  protected abstract getDefaultSettings(): T;
  protected abstract migrate(oldVersion: number, newVersion: number): Promise<void>;
}
```

#### SecureStorage (Base Class)
```typescript
abstract class SecureStorage {
  protected secretStorage: vscode.SecretStorage;
  
  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }
  
  abstract store(key: string, value: string): Promise<void>;
  abstract retrieve(key: string): Promise<string | undefined>;
  abstract delete(key: string): Promise<void>;
  abstract list(): Promise<string[]>;
}
```

### Concrete Implementations

#### JsonSettingsStorage
```typescript
class JsonSettingsStorage<T> extends SettingsStorage<T> {
  protected filePath: string;
  private schema: any;
  
  constructor(filePath: string, schema?: any) {
    super();
    this.filePath = filePath;
    this.schema = schema;
  }
  
  async load(): Promise<T> {
    try {
      if (!(await this.exists())) {
        const defaultSettings = this.getDefaultSettings();
        await this.save(defaultSettings);
        return defaultSettings;
      }
      
      const data = await fs.readFile(this.filePath, 'utf8');
      const settings = JSON.parse(data);
      
      if (!this.validate(settings)) {
        throw new SettingsValidationError('Invalid settings format');
      }
      
      return settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      return this.getDefaultSettings();
    }
  }
  
  async save(settings: T): Promise<void> {
    if (!this.validate(settings)) {
      throw new SettingsValidationError('Invalid settings format');
    }
    
    await this.ensureDirectoryExists();
    await fs.writeFile(this.filePath, JSON.stringify(settings, null, 2));
    this.cache.clear();
  }
  
  async get<K extends keyof T>(key: K): Promise<T[K] | undefined> {
    if (this.cache.has(key as string)) {
      return this.cache.get(key as string);
    }
    
    const settings = await this.load();
    const value = settings[key];
    this.cache.set(key as string, value);
    return value;
  }
  
  async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
    const settings = await this.load();
    settings[key] = value;
    await this.save(settings);
    this.cache.set(key as string, value);
  }
  
  async delete<K extends keyof T>(key: K): Promise<void> {
    const settings = await this.load();
    delete settings[key];
    await this.save(settings);
    this.cache.delete(key as string);
  }
  
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async clear(): Promise<void> {
    await this.save(this.getDefaultSettings());
    this.cache.clear();
  }
  
  protected validate(settings: T): boolean {
    if (this.schema) {
      // JSON schema validation
      return this.validateAgainstSchema(settings, this.schema);
    }
    return true;
  }
  
  protected abstract getDefaultSettings(): T;
  
  private async ensureDirectoryExists(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
  }
}
```

#### VscodeSecureStorage
**Note: This implementation uses VS Code's built-in `vscode.SecretStorage` API for secure credential storage**

```typescript
class VscodeSecureStorage extends SecureStorage {
  private keyPrefix: string;
  
  constructor(secretStorage: vscode.SecretStorage, keyPrefix: string = 'computor') {
    super(secretStorage);
    this.keyPrefix = keyPrefix;
  }
  
  async store(key: string, value: string): Promise<void> {
    const prefixedKey = `${this.keyPrefix}.${key}`;
    await this.secretStorage.store(prefixedKey, value);
  }
  
  async retrieve(key: string): Promise<string | undefined> {
    const prefixedKey = `${this.keyPrefix}.${key}`;
    return await this.secretStorage.get(prefixedKey);
  }
  
  async delete(key: string): Promise<void> {
    const prefixedKey = `${this.keyPrefix}.${key}`;
    await this.secretStorage.delete(prefixedKey);
  }
  
  async list(): Promise<string[]> {
    // VS Code doesn't provide a direct way to list keys
    // This would need to be implemented by maintaining a separate index
    const indexKey = `${this.keyPrefix}.index`;
    const indexData = await this.secretStorage.get(indexKey);
    return indexData ? JSON.parse(indexData) : [];
  }
}
```

### Settings Types

#### ComputorSettings
```typescript
interface ComputorSettings {
  version: string;
  backend: BackendSettings;
  authentication: AuthenticationSettings;
  ui: UiSettings;
  advanced: AdvancedSettings;
  profiles: ProfileSettings;
}

interface BackendSettings {
  baseUrl: string;
  realm: string;
  timeout: number;
  retryAttempts: number;
  apiVersion: string;
}

interface AuthenticationSettings {
  defaultProvider: 'token' | 'keycloak';
  tokenSettings: {
    headerName: string;
    headerPrefix: string;
  };
  keycloakSettings: {
    realm: string;
    clientId: string;
    serverUrl: string;
    redirectUri: string;
  };
}

interface UiSettings {
  theme: 'light' | 'dark' | 'auto';
  treeRefreshInterval: number;
  showNotifications: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

interface AdvancedSettings {
  cacheTimeout: number;
  maxCacheSize: number;
  enableTelemetry: boolean;
  debugMode: boolean;
}

interface ProfileSettings {
  activeProfile: string;
  profiles: Record<string, BackendSettings>;
}
```

### Settings Manager

#### ComputorSettingsManager
```typescript
class ComputorSettingsManager {
  private settingsStorage: JsonSettingsStorage<ComputorSettings>;
  private secureStorage: VscodeSecureStorage;
  private profileManager: ProfileManager;
  
  constructor(context: vscode.ExtensionContext) {
    const settingsPath = path.join(os.homedir(), '.computor', 'config.json');
    this.settingsStorage = new JsonSettingsStorage(settingsPath, ComputorSettingsSchema);
    this.secureStorage = new VscodeSecureStorage(context.secrets); // Uses VS Code SecretStorage API
    this.profileManager = new ProfileManager(settingsStorage, secureStorage);
  }
  
  async getBackendUrl(): Promise<string> {
    const settings = await this.settingsStorage.load();
    return settings.backend.baseUrl;
  }
  
  async setBackendUrl(url: string): Promise<void> {
    await this.settingsStorage.set('backend', { 
      ...(await this.getBackendSettings()), 
      baseUrl: url 
    });
  }
  
  async getRealm(): Promise<string> {
    const settings = await this.settingsStorage.load();
    return settings.backend.realm;
  }
  
  async setRealm(realm: string): Promise<void> {
    await this.settingsStorage.set('backend', { 
      ...(await this.getBackendSettings()), 
      realm 
    });
  }
  
  async getActiveProfile(): Promise<string> {
    const settings = await this.settingsStorage.load();
    return settings.profiles.activeProfile;
  }
  
  async switchProfile(profileName: string): Promise<void> {
    const profile = await this.profileManager.getProfile(profileName);
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }
    
    await this.settingsStorage.set('profiles', {
      ...(await this.getProfileSettings()),
      activeProfile: profileName
    });
    
    await this.settingsStorage.set('backend', profile);
  }
  
  private async getBackendSettings(): Promise<BackendSettings> {
    return (await this.settingsStorage.load()).backend;
  }
  
  private async getProfileSettings(): Promise<ProfileSettings> {
    return (await this.settingsStorage.load()).profiles;
  }
}
```

### Profile Management

#### ProfileManager
```typescript
class ProfileManager {
  private settingsStorage: JsonSettingsStorage<ComputorSettings>;
  private secureStorage: VscodeSecureStorage;
  
  constructor(
    settingsStorage: JsonSettingsStorage<ComputorSettings>,
    secureStorage: VscodeSecureStorage
  ) {
    this.settingsStorage = settingsStorage;
    this.secureStorage = secureStorage;
  }
  
  async createProfile(name: string, settings: BackendSettings): Promise<void> {
    const currentSettings = await this.settingsStorage.load();
    currentSettings.profiles.profiles[name] = settings;
    await this.settingsStorage.save(currentSettings);
  }
  
  async getProfile(name: string): Promise<BackendSettings | undefined> {
    const settings = await this.settingsStorage.load();
    return settings.profiles.profiles[name];
  }
  
  async deleteProfile(name: string): Promise<void> {
    const settings = await this.settingsStorage.load();
    delete settings.profiles.profiles[name];
    
    if (settings.profiles.activeProfile === name) {
      settings.profiles.activeProfile = 'default';
    }
    
    await this.settingsStorage.save(settings);
  }
  
  async listProfiles(): Promise<string[]> {
    const settings = await this.settingsStorage.load();
    return Object.keys(settings.profiles.profiles);
  }
}
```

## Default Settings

### Default Configuration
```typescript
const DEFAULT_SETTINGS: ComputorSettings = {
  version: '1.0.0',
  backend: {
    baseUrl: 'http://localhost:8000',
    realm: 'default',
    timeout: 5000,
    retryAttempts: 3,
    apiVersion: 'v1'
  },
  authentication: {
    defaultProvider: 'token',
    tokenSettings: {
      headerName: 'X-API-Key',
      headerPrefix: ''
    },
    keycloakSettings: {
      realm: 'computor',
      clientId: 'computor-vscode',
      serverUrl: 'http://localhost:8080',
      redirectUri: 'http://localhost:3000/callback'
    }
  },
  ui: {
    theme: 'auto',
    treeRefreshInterval: 30000,
    showNotifications: true,
    logLevel: 'info'
  },
  advanced: {
    cacheTimeout: 300000,
    maxCacheSize: 50,
    enableTelemetry: false,
    debugMode: false
  },
  profiles: {
    activeProfile: 'default',
    profiles: {
      default: {
        baseUrl: 'http://localhost:8000',
        realm: 'default',
        timeout: 5000,
        retryAttempts: 3,
        apiVersion: 'v1'
      }
    }
  }
};
```

## Migration Strategy

### Version Migration
```typescript
class SettingsMigrator {
  private static migrations: Map<string, (settings: any) => any> = new Map([
    ['1.0.0', (settings) => settings],
    ['1.1.0', (settings) => ({
      ...settings,
      profiles: {
        activeProfile: 'default',
        profiles: { default: settings.backend }
      }
    })]
  ]);
  
  static migrate(settings: any, fromVersion: string, toVersion: string): any {
    // Implement migration logic
    return settings;
  }
}
```

## Error Handling

### Custom Errors
```typescript
class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

class SettingsValidationError extends SettingsError {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

class SettingsNotFoundError extends SettingsError {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsNotFoundError';
  }
}
```

## Usage Examples

### Basic Usage
```typescript
const settingsManager = new ComputorSettingsManager(context);

// Get backend URL
const backendUrl = await settingsManager.getBackendUrl();

// Set new realm
await settingsManager.setRealm('production');

// Switch to different profile
await settingsManager.switchProfile('staging');
```

### Profile Management
```typescript
const profileManager = new ProfileManager(settingsStorage, secureStorage);

// Create new profile
await profileManager.createProfile('staging', {
  baseUrl: 'https://staging.example.com',
  realm: 'staging',
  timeout: 10000,
  retryAttempts: 5,
  apiVersion: 'v2'
});

// List all profiles
const profiles = await profileManager.listProfiles();
```

## Testing Strategy

### Unit Tests
- Test settings loading and saving
- Test profile management
- Test validation logic
- Test migration functionality

### Integration Tests
- Test file system operations
- Test VS Code SecretStorage integration
- Test cross-platform compatibility
- Test concurrent access scenarios

### Security Tests
- Test secure storage of sensitive data
- Test file permissions
- Test data encryption
- Test credential handling

## Security Considerations

### File Permissions
- Set appropriate file permissions for config files
- Ensure sensitive data is not world-readable
- Use secure storage for authentication tokens

### Data Validation
- Validate all settings before saving
- Sanitize user input
- Implement schema validation
- Handle malformed configuration files

### Backup and Recovery
- Implement settings backup functionality
- Provide recovery mechanisms for corrupted settings
- Support settings export/import