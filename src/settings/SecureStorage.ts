import * as vscode from 'vscode';

export abstract class SecureStorage {
  protected secretStorage: vscode.SecretStorage;
  
  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }
  
  abstract store(key: string, value: string): Promise<void>;
  abstract retrieve(key: string): Promise<string | undefined>;
  abstract delete(key: string): Promise<void>;
  abstract list(): Promise<string[]>;
}