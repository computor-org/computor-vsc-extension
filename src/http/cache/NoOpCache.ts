import { CacheStrategy, CacheEntry, CacheKey } from './CacheStrategy';

export class NoOpCache extends CacheStrategy {
  async get<T>(_key: CacheKey): Promise<CacheEntry<T> | null> {
    return null;
  }

  async set<T>(_key: CacheKey, _entry: CacheEntry<T>): Promise<void> {
    // No operation
  }

  async delete(_key: CacheKey): Promise<void> {
    // No operation
  }

  async clear(): Promise<void> {
    // No operation
  }

  async has(_key: CacheKey): Promise<boolean> {
    return false;
  }
}