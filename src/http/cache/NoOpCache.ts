import { CacheStrategy, CacheEntry, CacheKey } from './CacheStrategy';

export class NoOpCache extends CacheStrategy {
  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    return null;
  }

  async set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void> {
    // No operation
  }

  async delete(key: CacheKey): Promise<void> {
    // No operation
  }

  async clear(): Promise<void> {
    // No operation
  }

  async has(key: CacheKey): Promise<boolean> {
    return false;
  }
}