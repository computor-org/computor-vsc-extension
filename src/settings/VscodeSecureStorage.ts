import * as vscode from 'vscode';
import { SecureStorage } from './SecureStorage';

export class VscodeSecureStorage extends SecureStorage {
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
  
  async updateIndex(keys: string[]): Promise<void> {
    const indexKey = `${this.keyPrefix}.index`;
    await this.secretStorage.store(indexKey, JSON.stringify(keys));
  }
}