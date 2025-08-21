import * as vscode from 'vscode';
import { CredentialStorage, ComputorCredentials } from '../types/AuthenticationTypes';

export class VscodeCredentialStorage implements CredentialStorage {
  private static readonly KEY_PREFIX = 'computor.auth.';
  private static readonly INDEX_KEY = 'computor.auth.index';
  private secretStorage: vscode.SecretStorage;
  private rolePrefix: string;

  constructor(context: vscode.ExtensionContext, role?: string) {
    this.secretStorage = context.secrets;
    this.rolePrefix = role ? `${role}.` : '';
  }

  async store(key: string, credentials: ComputorCredentials): Promise<void> {
    const fullKey = this.getFullKey(key);
    const encrypted = JSON.stringify(credentials);
    await this.secretStorage.store(fullKey, encrypted);
    
    // Update index
    await this.updateIndex(key, 'add');
  }

  async retrieve(key: string): Promise<ComputorCredentials | undefined> {
    const fullKey = this.getFullKey(key);
    const encrypted = await this.secretStorage.get(fullKey);
    return encrypted ? JSON.parse(encrypted) : undefined;
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    await this.secretStorage.delete(fullKey);
    
    // Update index
    await this.updateIndex(key, 'remove');
  }

  async list(): Promise<string[]> {
    const indexKey = this.getIndexKey();
    const indexData = await this.secretStorage.get(indexKey);
    return indexData ? JSON.parse(indexData) : [];
  }

  async clear(): Promise<void> {
    const keys = await this.list();
    for (const key of keys) {
      await this.delete(key);
    }
    const indexKey = this.getIndexKey();
    await this.secretStorage.delete(indexKey);
  }

  private getFullKey(key: string): string {
    return `${VscodeCredentialStorage.KEY_PREFIX}${this.rolePrefix}${key}`;
  }

  private getIndexKey(): string {
    return `${VscodeCredentialStorage.INDEX_KEY}.${this.rolePrefix}index`;
  }

  private async updateIndex(key: string, action: 'add' | 'remove'): Promise<void> {
    const keys = await this.list();
    const keySet = new Set(keys);
    
    if (action === 'add') {
      keySet.add(key);
    } else {
      keySet.delete(key);
    }
    
    const indexKey = this.getIndexKey();
    await this.secretStorage.store(
      indexKey, 
      JSON.stringify(Array.from(keySet))
    );
  }
}