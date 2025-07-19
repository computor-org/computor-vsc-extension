import { BasicAuthHttpClient } from '../BasicAuthHttpClient';
import { ApiKeyHttpClient } from '../ApiKeyHttpClient';

// Example 1: Enable caching with default settings
const cachedClient = new BasicAuthHttpClient(
  'https://api.example.com',
  'username',
  'password',
  5000,
  {
    enabled: true, // Enable caching
    ttl: 300000,   // 5 minutes TTL
    maxSize: 100,  // Max 100 cached entries
    respectCacheHeaders: true // Respect Cache-Control headers
  }
);

// Example 2: API Key client with aggressive caching
const apiClient = new ApiKeyHttpClient(
  'https://api.example.com',
  'api-key-123',
  'X-API-Key',
  '',
  5000,
  {
    enabled: true,
    ttl: 3600000, // 1 hour TTL
    maxSize: 500,
    respectCacheHeaders: false // Ignore server cache headers
  }
);

// Example 3: Using cache methods
export async function example() {
  // Normal request - will be cached
  const response1 = await cachedClient.get('/users');
  console.log('First request:', response1.status);
  
  // Second request - served from cache
  const response2 = await cachedClient.get('/users');
  console.log('Cached request:', response2.status);
  
  // Invalidate specific cache entry
  await cachedClient.invalidateCacheEntry('/users');
  
  // Clear entire cache
  await cachedClient.clearCache();
  
  // Disable caching at runtime
  cachedClient.setCacheEnabled(false);
  
  // Re-enable caching
  cachedClient.setCacheEnabled(true);
}

// Example 4: Cache-aware updates
export async function updateUser(userId: string, data: any) {
  // Update the user
  await apiClient.put(`/users/${userId}`, data);
  
  // Invalidate the cached user data
  await apiClient.invalidateCacheEntry(`/users/${userId}`);
  
  // Also invalidate the users list
  await apiClient.invalidateCacheEntry('/users');
}