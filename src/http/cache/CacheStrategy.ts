export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  etag?: string;
  lastModified?: string;
}

export interface CacheKey {
  method: string;
  url: string;
  params?: string;
  body?: string;
}

export abstract class CacheStrategy {
  abstract get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  abstract set<T>(key: CacheKey, entry: CacheEntry<T>): Promise<void>;
  abstract delete(key: CacheKey): Promise<void>;
  abstract clear(): Promise<void>;
  abstract has(key: CacheKey): Promise<boolean>;
  
  protected createKeyString(key: CacheKey): string {
    return `${key.method}:${key.url}:${key.params || ''}:${key.body || ''}`;
  }
  
  isExpired(entry: CacheEntry): boolean {
    if (entry.ttl === 0) return false; // 0 means no expiration
    return Date.now() > entry.timestamp + entry.ttl;
  }
}