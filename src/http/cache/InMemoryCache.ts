import { CacheStrategy, CacheEntry, CacheKey } from './CacheStrategy';

export class InMemoryCache extends CacheStrategy {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private evictionPolicy: 'lru' | 'fifo';

  constructor(maxSize: number = 100, evictionPolicy: 'lru' | 'fifo' = 'lru') {
    super();
    this.maxSize = maxSize;
    this.evictionPolicy = evictionPolicy;
  }

  async get<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
    const keyString = this.createKeyString(key);
    const entry = this.cache.get(keyString);
    
    if (!entry) {
      return null;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(keyString);
      return null;
    }
    
    // Update access order for LRU
    if (this.evictionPolicy === 'lru') {
      this.cache.delete(keyString);
      this.cache.set(keyString, entry);
    }
    
    return entry as CacheEntry<T>;
  }

  async set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void> {
    const keyString = this.createKeyString(key);
    
    // Check if we need to evict
    if (this.cache.size >= this.maxSize && !this.cache.has(keyString)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(keyString, entry);
  }

  async delete(key: CacheKey): Promise<void> {
    const keyString = this.createKeyString(key);
    this.cache.delete(keyString);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async has(key: CacheKey): Promise<boolean> {
    const keyString = this.createKeyString(key);
    const entry = this.cache.get(keyString);
    
    if (!entry) {
      return false;
    }
    
    if (this.isExpired(entry)) {
      this.cache.delete(keyString);
      return false;
    }
    
    return true;
  }

  getSize(): number {
    return this.cache.size;
  }

  getStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Could track hits/misses for real stats
    };
  }
}