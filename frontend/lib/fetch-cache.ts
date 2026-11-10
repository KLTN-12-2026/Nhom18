/**
 * Enhanced fetch wrapper with in-memory caching and request deduplication
 * Prevents duplicate concurrent requests and caches responses
 */

interface CacheEntry {
  data: any;
  timestamp: number;
  expiresAt: number;
}

// In-memory cache
const cache = new Map<string, CacheEntry>();

// Track ongoing requests to prevent duplicates
const ongoingRequests = new Map<string, Promise<any>>();

interface FetchOptions extends RequestInit {
  ttl?: number; // Time to live in seconds
  skipCache?: boolean;
}

/**
 * Cached fetch with request deduplication
 * @param url - API endpoint URL
 * @param options - Fetch options with optional TTL
 * @returns Promise with API response data
 */
export async function cachedFetch<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { ttl = 60, skipCache = false, ...fetchOptions } = options;
  const cacheKey = `${url}_${JSON.stringify(fetchOptions)}`;

  // Return cached data if valid
  if (!skipCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  // Return ongoing request if exists (request deduplication)
  if (ongoingRequests.has(cacheKey)) {
    return ongoingRequests.get(cacheKey)!;
  }

  // Create new request
  const requestPromise = fetch(url, {
    ...fetchOptions,
    cache: 'default',
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      return res.json();
    })
    .then((data) => {
      // Cache the result
      if (!skipCache) {
        cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          expiresAt: Date.now() + ttl * 1000,
        });
      }

      // Remove from ongoing requests
      ongoingRequests.delete(cacheKey);

      return data;
    })
    .catch((error) => {
      // Remove from ongoing requests on error
      ongoingRequests.delete(cacheKey);
      throw error;
    });

  // Track ongoing request
  ongoingRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Clear cache for specific URL pattern
 * @param pattern - RegExp or string to match URLs
 */
export function clearCache(pattern?: string | RegExp): void {
  if (!pattern) {
    cache.clear();
    return;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
    }
  }
}

/**
 * Preload data into cache
 * @param url - API endpoint URL
 * @param options - Fetch options
 */
export async function prefetchData<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<void> {
  try {
    await cachedFetch<T>(url, options);
  } catch (error) {
    console.warn('Prefetch failed:', error);
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: cache.size,
    ongoingRequests: ongoingRequests.size,
    entries: Array.from(cache.entries()).map(([key, value]) => ({
      key,
      age: Date.now() - value.timestamp,
      ttl: value.expiresAt - Date.now(),
    })),
  };
}
