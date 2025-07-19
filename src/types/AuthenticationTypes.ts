import * as vscode from 'vscode';

export interface ComputorCredentials {
  baseUrl: string;
  realm?: string;
  username?: string;
  password?: string;
  token?: string;
  expiresAt?: Date;
}

export interface ComputorAuthenticationSession extends vscode.AuthenticationSession {
  credentials: ComputorCredentials;
}

export interface AuthenticationProviderOptions {
  supportsMultipleAccounts?: boolean;
  label?: string;
}

export interface CredentialStorage {
  store(key: string, credentials: ComputorCredentials): Promise<void>;
  retrieve(key: string): Promise<ComputorCredentials | undefined>;
  delete(key: string): Promise<void>;
  list?(): Promise<string[]>;
  clear?(): Promise<void>;
}

export interface LoginCredentials {
  type: 'basic' | 'token' | 'oauth' | 'jwt';
  realm?: string;
  username?: string;
  password?: string;
  token?: string;
  refreshToken?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface BasicAuthCredentials extends LoginCredentials {
  type: 'basic';
  username: string;
  password: string;
}

export interface TokenCredentials extends LoginCredentials {
  type: 'token';
  token: string;
}

export interface OAuthCredentials extends LoginCredentials {
  type: 'oauth';
  token: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface JwtCredentials extends LoginCredentials {
  type: 'jwt';
  token: string;
  refreshToken?: string;
  expiresAt?: Date;
}