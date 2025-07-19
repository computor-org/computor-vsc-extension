import { expect } from 'chai';
import { InMemoryCache } from '../../../http/cache/InMemoryCache';
import { CacheKey } from '../../../http/cache/CacheStrategy';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache(3); // Small size for testing eviction
  });

  describe('basic operations', () => {
    it('should store and retrieve entries', async () => {
      const key: CacheKey = { method: 'GET', url: 'https://api.example.com/users' };
      const entry = {
        data: { users: [] },
        timestamp: Date.now(),
        ttl: 60000,
      };

      await cache.set(key, entry);
      const retrieved = await cache.get(key);

      expect(retrieved).to.deep.equal(entry);
    });

    it('should return null for non-existent entries', async () => {
      const key: CacheKey = { method: 'GET', url: 'https://api.example.com/unknown' };
      const retrieved = await cache.get(key);

      expect(retrieved).to.be.null;
    });

    it('should delete entries', async () => {
      const key: CacheKey = { method: 'GET', url: 'https://api.example.com/users' };
      const entry = {
        data: { users: [] },
        timestamp: Date.now(),
        ttl: 60000,
      };

      await cache.set(key, entry);
      await cache.delete(key);
      const retrieved = await cache.get(key);

      expect(retrieved).to.be.null;
    });

    it('should clear all entries', async () => {
      const key1: CacheKey = { method: 'GET', url: 'https://api.example.com/users' };
      const key2: CacheKey = { method: 'GET', url: 'https://api.example.com/posts' };

      await cache.set(key1, { data: {}, timestamp: Date.now(), ttl: 60000 });
      await cache.set(key2, { data: {}, timestamp: Date.now(), ttl: 60000 });

      await cache.clear();

      expect(await cache.get(key1)).to.be.null;
      expect(await cache.get(key2)).to.be.null;
      expect(cache.getSize()).to.equal(0);
    });
  });

  describe('expiration', () => {
    it('should return null for expired entries', async () => {
      const key: CacheKey = { method: 'GET', url: 'https://api.example.com/users' };
      const entry = {
        data: { users: [] },
        timestamp: Date.now() - 2000, // 2 seconds ago
        ttl: 1000, // 1 second TTL
      };

      await cache.set(key, entry);
      const retrieved = await cache.get(key);

      expect(retrieved).to.be.null;
    });

    it('should not expire entries with ttl of 0', async () => {
      const key: CacheKey = { method: 'GET', url: 'https://api.example.com/users' };
      const entry = {
        data: { users: [] },
        timestamp: Date.now() - 1000000, // Very old
        ttl: 0, // No expiration
      };

      await cache.set(key, entry);
      const retrieved = await cache.get(key);

      expect(retrieved).to.deep.equal(entry);
    });
  });

  describe('eviction', () => {
    it('should evict oldest entry when cache is full (FIFO)', async () => {
      const cache = new InMemoryCache(2, 'fifo');
      
      const key1: CacheKey = { method: 'GET', url: 'https://api.example.com/1' };
      const key2: CacheKey = { method: 'GET', url: 'https://api.example.com/2' };
      const key3: CacheKey = { method: 'GET', url: 'https://api.example.com/3' };

      await cache.set(key1, { data: 1, timestamp: Date.now(), ttl: 60000 });
      await cache.set(key2, { data: 2, timestamp: Date.now(), ttl: 60000 });
      await cache.set(key3, { data: 3, timestamp: Date.now(), ttl: 60000 });

      expect(await cache.get(key1)).to.be.null; // Evicted
      expect(await cache.get(key2)).to.not.be.null;
      expect(await cache.get(key3)).to.not.be.null;
    });

    it('should update access order for LRU', async () => {
      const cache = new InMemoryCache(2, 'lru');
      
      const key1: CacheKey = { method: 'GET', url: 'https://api.example.com/1' };
      const key2: CacheKey = { method: 'GET', url: 'https://api.example.com/2' };
      const key3: CacheKey = { method: 'GET', url: 'https://api.example.com/3' };

      await cache.set(key1, { data: 1, timestamp: Date.now(), ttl: 60000 });
      await cache.set(key2, { data: 2, timestamp: Date.now(), ttl: 60000 });
      
      // Access key1 to make it recently used
      await cache.get(key1);
      
      // Now add key3, which should evict key2 (least recently used)
      await cache.set(key3, { data: 3, timestamp: Date.now(), ttl: 60000 });

      expect(await cache.get(key1)).to.not.be.null; // Still there
      expect(await cache.get(key2)).to.be.null; // Evicted
      expect(await cache.get(key3)).to.not.be.null;
    });
  });

  describe('cache key generation', () => {
    it('should differentiate by method', async () => {
      const getKey: CacheKey = { method: 'GET', url: 'https://api.example.com/users' };
      const postKey: CacheKey = { method: 'POST', url: 'https://api.example.com/users' };

      await cache.set(getKey, { data: 'get', timestamp: Date.now(), ttl: 60000 });
      await cache.set(postKey, { data: 'post', timestamp: Date.now(), ttl: 60000 });

      const getResult = await cache.get(getKey);
      const postResult = await cache.get(postKey);

      expect(getResult?.data).to.equal('get');
      expect(postResult?.data).to.equal('post');
    });

    it('should differentiate by params', async () => {
      const key1: CacheKey = { 
        method: 'GET', 
        url: 'https://api.example.com/users',
        params: 'page=1'
      };
      const key2: CacheKey = { 
        method: 'GET', 
        url: 'https://api.example.com/users',
        params: 'page=2'
      };

      await cache.set(key1, { data: 'page1', timestamp: Date.now(), ttl: 60000 });
      await cache.set(key2, { data: 'page2', timestamp: Date.now(), ttl: 60000 });

      expect((await cache.get(key1))?.data).to.equal('page1');
      expect((await cache.get(key2))?.data).to.equal('page2');
    });
  });
});