import type { SearchResponse, SearchResult } from "./google-search.js";

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  response: SearchResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function saveExtensionSearchResults(query: string, results: SearchResult[]): SearchResponse {
  const normalizedQuery = query.trim();
  const response: SearchResponse = {
    query: normalizedQuery,
    results,
    searchedAt: new Date().toISOString(),
  };

  cache.set(cacheKey(normalizedQuery), {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  for (const [key, entry] of cache) {
    if (entry.expiresAt <= Date.now()) cache.delete(key);
  }

  return response;
}

export function getExtensionSearchResults(query: string): SearchResponse | null {
  const key = cacheKey(query);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.response;
}
