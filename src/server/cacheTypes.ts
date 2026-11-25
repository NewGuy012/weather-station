export interface CacheHit<T> {
  value: T;
  createdAt: number;
  expiresAt: number | null;
}

export interface BlobCacheHit {
  data: Uint8Array;
  contentType: string;
  createdAt: number;
}

export interface CacheStats {
  jsonCount: number;
  blobCount: number;
  backend?: string;
}

export interface WeatherCacheStore {
  getJson<T>(key: string, now?: number): CacheHit<T> | null | Promise<CacheHit<T> | null>;
  setJson<T>(key: string, value: T, ttlMs: number | null, now?: number): void | Promise<void>;
  getBlob(key: string, now?: number): BlobCacheHit | null | Promise<BlobCacheHit | null>;
  setBlob(
    key: string,
    data: Uint8Array,
    contentType: string,
    ttlMs: number | null,
    now?: number,
  ): void | Promise<void>;
  stats(): CacheStats | Promise<CacheStats>;
}
