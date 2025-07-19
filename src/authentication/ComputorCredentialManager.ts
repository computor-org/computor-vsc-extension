import * as vscode from 'vscode';
import { 
  CredentialStorage, 
  LoginCredentials,
  ComputorCredentials 
} from '../types/AuthenticationTypes';
import { VscodeCredentialStorage } from './VscodeCredentialStorage';

export class ComputorCredentialManager {
  private primaryStorage: CredentialStorage;
  private sessionCache: Map<string, LoginCredentials> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.primaryStorage = new VscodeCredentialStorage(context);
  }

  async storeCredentials(profileName: string, credentials: LoginCredentials): Promise<void> {
    try {
      // Convert LoginCredentials to ComputorCredentials for storage
      const computorCreds: ComputorCredentials = {
        baseUrl: credentials.metadata?.baseUrl || '',
        realm: credentials.realm,
        username: credentials.username,
        password: credentials.password,
        token: credentials.token,
        expiresAt: credentials.expiresAt
      };
      
      await this.primaryStorage.store(profileName, computorCreds);
      this.sessionCache.set(profileName, credentials);
    } catch (error) {
      console.error('Failed to store credentials:', error);
      throw new CredentialStorageError('Failed to store credentials', error as Error);
    }
  }

  async retrieveCredentials(profileName: string): Promise<LoginCredentials | undefined> {
    try {
      // Check cache first
      if (this.sessionCache.has(profileName)) {
        const cached = this.sessionCache.get(profileName)!;
        
        // Check if cached credentials are still valid
        if (!this.isExpired(cached)) {
          return cached;
        } else {
          this.sessionCache.delete(profileName);
        }
      }

      // Retrieve from storage
      const computorCreds = await this.primaryStorage.retrieve(profileName);
      if (!computorCreds) {
        return undefined;
      }

      // Convert back to LoginCredentials
      const credentials: LoginCredentials = {
        type: computorCreds.token ? 'token' : 'basic',
        realm: computorCreds.realm,
        username: computorCreds.username,
        password: computorCreds.password,
        token: computorCreds.token,
        expiresAt: computorCreds.expiresAt,
        metadata: { baseUrl: computorCreds.baseUrl }
      };

      // Cache if not expired
      if (!this.isExpired(credentials)) {
        this.sessionCache.set(profileName, credentials);
      }

      return credentials;
    } catch (error) {
      console.error('Failed to retrieve credentials:', error);
      throw new CredentialStorageError('Failed to retrieve credentials', error as Error);
    }
  }

  async deleteCredentials(profileName: string): Promise<void> {
    try {
      await this.primaryStorage.delete(profileName);
      this.sessionCache.delete(profileName);
    } catch (error) {
      console.error('Failed to delete credentials:', error);
      throw new CredentialStorageError('Failed to delete credentials', error as Error);
    }
  }

  async listStoredProfiles(): Promise<string[]> {
    try {
      return await this.primaryStorage.list?.() || [];
    } catch (error) {
      console.error('Failed to list profiles:', error);
      return [];
    }
  }

  async clearAllCredentials(): Promise<void> {
    try {
      await this.primaryStorage.clear?.();
      this.sessionCache.clear();
    } catch (error) {
      console.error('Failed to clear credentials:', error);
      throw new CredentialStorageError('Failed to clear credentials', error as Error);
    }
  }

  private isExpired(credentials: LoginCredentials): boolean {
    if (!credentials.expiresAt) {
      return false;
    }
    
    const expiresAt = credentials.expiresAt instanceof Date 
      ? credentials.expiresAt 
      : new Date(credentials.expiresAt);
      
    return new Date() >= expiresAt;
  }

  // Generate authentication headers based on credentials
  static generateAuthHeaders(credentials: LoginCredentials): Record<string, string> {
    const headers: Record<string, string> = {};
    
    switch (credentials.type) {
      case 'token':
        // Use custom header if specified in metadata
        const headerName = credentials.metadata?.headerName || 'Authorization';
        const headerPrefix = credentials.metadata?.headerPrefix || 'Bearer';
        headers[headerName] = headerPrefix 
          ? `${headerPrefix} ${credentials.token}` 
          : credentials.token!;
        break;
        
      case 'basic':
        if (credentials.username && credentials.password) {
          const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        break;
        
      case 'oauth':
      case 'jwt':
        headers['Authorization'] = `Bearer ${credentials.token}`;
        break;
    }
    
    headers['Content-Type'] = 'application/json; charset=utf-8';
    return headers;
  }
}

// Custom error classes
export class CredentialStorageError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'CredentialStorageError';
  }
}

export class CredentialNotFoundError extends CredentialStorageError {
  constructor(key: string) {
    super(`Credentials not found for key: ${key}`);
    this.name = 'CredentialNotFoundError';
  }
}

export class TokenExpiredError extends CredentialStorageError {
  constructor() {
    super('Token has expired');
    this.name = 'TokenExpiredError';
  }
}