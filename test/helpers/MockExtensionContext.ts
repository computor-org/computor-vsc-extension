import * as vscode from 'vscode';
import * as path from 'path';

export class MockSecretStorage implements vscode.SecretStorage {
  private storage = new Map<string, string>();
  private emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();
  
  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }
  
  async store(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
    this.emitter.fire({ key });
  }
  
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
    this.emitter.fire({ key });
  }
  
  get onDidChange(): vscode.Event<vscode.SecretStorageChangeEvent> {
    return this.emitter.event;
  }
}

export class MockMemento implements vscode.Memento {
  private storage = new Map<string, any>();
  
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.storage.get(key);
    return value !== undefined ? value : defaultValue;
  }
  
  async update(key: string, value: any): Promise<void> {
    if (value === undefined) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, value);
    }
  }
  
  keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }
  
  async setKeysForSync(keys: readonly string[]): Promise<void> {
    // Mock implementation
  }
}

export class MockExtensionContext implements vscode.ExtensionContext {
  subscriptions: { dispose(): any }[] = [];
  workspaceState: vscode.Memento;
  globalState: vscode.Memento & { setKeysForSync(keys: readonly string[]): void };
  secrets: vscode.SecretStorage;
  extensionUri: vscode.Uri;
  extensionPath: string;
  asAbsolutePath(relativePath: string): string {
    return path.join(this.extensionPath, relativePath);
  }
  storageUri: vscode.Uri;
  storagePath: string;
  globalStorageUri: vscode.Uri;
  globalStoragePath: string;
  logUri: vscode.Uri;
  logPath: string;
  extensionMode: vscode.ExtensionMode = vscode.ExtensionMode.Test;
  extension: vscode.Extension<any>;
  environmentVariableCollection: vscode.GlobalEnvironmentVariableCollection;
  languageModelAccessInformation: vscode.LanguageModelAccessInformation;
  
  constructor(extensionPath?: string) {
    this.extensionPath = extensionPath || '/test/extension';
    this.extensionUri = vscode.Uri.file(this.extensionPath);
    this.workspaceState = new MockMemento();
    const globalState = new MockMemento();
    this.globalState = Object.assign(globalState, {
      setKeysForSync: async (keys: readonly string[]) => {
        // Mock implementation
      }
    });
    this.secrets = new MockSecretStorage();
    
    this.storagePath = path.join(this.extensionPath, 'storage');
    this.storageUri = vscode.Uri.file(this.storagePath);
    this.globalStoragePath = path.join(this.extensionPath, 'globalStorage');
    this.globalStorageUri = vscode.Uri.file(this.globalStoragePath);
    this.logPath = path.join(this.extensionPath, 'logs');
    this.logUri = vscode.Uri.file(this.logPath);
    
    // Mock extension
    this.extension = {
      id: 'test.extension',
      extensionUri: this.extensionUri,
      extensionPath: this.extensionPath,
      isActive: true,
      packageJSON: {},
      exports: undefined,
      activate: async () => {},
      extensionKind: vscode.ExtensionKind.Workspace
    };
    
    // Mock environment variable collection
    const envCollection: any = {
      persistent: true,
      description: 'Test environment variables',
      replace: (variable: string, value: string) => {},
      append: (variable: string, value: string) => {},
      prepend: (variable: string, value: string) => {},
      get: (variable: string) => undefined,
      forEach: (callback: Function) => {},
      delete: (variable: string) => {},
      clear: () => {},
      getScoped: (scope: vscode.EnvironmentVariableScope) => envCollection,
      [Symbol.iterator]: function* () {
        yield* [];
      }
    };
    this.environmentVariableCollection = envCollection as vscode.GlobalEnvironmentVariableCollection;
    
    // Mock language model access
    this.languageModelAccessInformation = {
      onDidChange: new vscode.EventEmitter<void>().event,
      canSendRequest: () => true
    } as vscode.LanguageModelAccessInformation;
  }
}