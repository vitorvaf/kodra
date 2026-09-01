export interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  body: string;
}

export interface SetCacheInput {
  key: string;
  body: string;
  etag?: string | null;
  lastModified?: string | null;
}

export interface ETagCache {
  get(key: string): CacheEntry | null;
  set(input: SetCacheInput): unknown;
  delete(key: string): void;
}
