// Simple mock context for unit tests that don't need full VS Code APIs

export class SimpleMockSecretStorage {
  private storage = new Map<string, string>();
  
  async get(key: string): Promise<string | undefined> {
    return this.storage.get(key);
  }
  
  async store(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }
  
  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }
}

export class SimpleMockMemento {
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
}

export class SimpleMockExtensionContext {
  subscriptions: { dispose(): any }[] = [];
  workspaceState: SimpleMockMemento;
  globalState: SimpleMockMemento & { setKeysForSync(keys: readonly string[]): void };
  secrets: SimpleMockSecretStorage;
  extensionPath: string;
  
  constructor(extensionPath?: string) {
    this.extensionPath = extensionPath || '/test/extension';
    this.workspaceState = new SimpleMockMemento();
    const globalState = new SimpleMockMemento();
    this.globalState = Object.assign(globalState, {
      setKeysForSync: async (keys: readonly string[]) => {
        // Mock implementation
      }
    });
    this.secrets = new SimpleMockSecretStorage();
  }
  
  asAbsolutePath(relativePath: string): string {
    return `${this.extensionPath}/${relativePath}`;
  }
}