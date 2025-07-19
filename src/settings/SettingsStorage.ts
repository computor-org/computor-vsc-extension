export abstract class SettingsStorage<T> {
  protected abstract filePath: string;
  protected cache: Map<string, any> = new Map();
  
  abstract load(): Promise<T>;
  abstract save(settings: T): Promise<void>;
  abstract get<K extends keyof T>(key: K): Promise<T[K] | undefined>;
  abstract set<K extends keyof T>(key: K, value: T[K]): Promise<void>;
  abstract delete<K extends keyof T>(key: K): Promise<void>;
  abstract exists(): Promise<boolean>;
  abstract clear(): Promise<void>;
  
  protected abstract validate(settings: T): boolean;
  protected abstract getDefaultSettings(): T;
  protected abstract migrate(oldVersion: number, newVersion: number): Promise<void>;
}