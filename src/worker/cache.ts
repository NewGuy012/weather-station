import type {
  BlobCacheHit,
  CacheHit,
  CacheStats,
  WeatherCacheStore,
} from '../server/cacheTypes';

interface MemoryJsonEntry {
  value: unknown;
  createdAt: number;
  expiresAt: number | null;
}

interface MemoryBlobEntry {
  data: Uint8Array;
  contentType: string;
  createdAt: number;
  expiresAt: number | null;
}

const MAX_MEMORY_JSON_ENTRIES = 32;
const MAX_MEMORY_BLOB_ENTRIES = 32;
const HISTORICAL_EDGE_TTL_SECONDS = 7 * 24 * 60 * 60;

const memoryJsonCache = new Map<string, MemoryJsonEntry>();
const memoryBlobCache = new Map<string, MemoryBlobEntry>();

function setBounded<T>(map: Map<string, T>, key: string, value: T, maxEntries: number): void {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function getDefaultEdgeCache(): Cache | null {
  if (typeof caches === 'undefined') return null;
  const candidate = (caches as unknown as { default?: Cache }).default;
  return candidate ?? null;
}

function makeCacheRequest(kind: 'json' | 'blob', key: string): Request {
  return new Request(
    `https://weather-station-cache.internal/${kind}/${encodeURIComponent(key)}`,
    { method: 'GET' },
  );
}

function resolveMaxAgeSeconds(ttlMs: number | null): number {
  if (ttlMs === null) return HISTORICAL_EDGE_TTL_SECONDS;
  return Math.max(1, Math.floor(ttlMs / 1000));
}

export function clearWorkerMemoryCache(): void {
  memoryJsonCache.clear();
  memoryBlobCache.clear();
}

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export class WorkerWeatherCache implements WeatherCacheStore {
  private readonly ctx?: WaitUntilContext;

  constructor(ctx?: WaitUntilContext) {
    this.ctx = ctx;
  }

  async getJson<T>(key: string, now = Date.now()): Promise<CacheHit<T> | null> {
    const memHit = memoryJsonCache.get(key);
    if (memHit) {
      if (memHit.expiresAt !== null && memHit.expiresAt <= now) {
        memoryJsonCache.delete(key);
      } else {
        return {
          value: memHit.value as T,
          createdAt: memHit.createdAt,
          expiresAt: memHit.expiresAt,
        };
      }
    }

    const edgeCache = getDefaultEdgeCache();
    if (!edgeCache) return null;

    try {
      const res = await edgeCache.match(makeCacheRequest('json', key));
      if (!res) return null;

      const createdAt = Number(res.headers.get('X-Cache-Created-At') ?? now);
      const rawExpires = res.headers.get('X-Cache-Expires-At');
      const expiresAt = rawExpires ? Number(rawExpires) : null;

      if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= now) {
        return null;
      }

      const value = (await res.json()) as T;
      const entry: MemoryJsonEntry = {
        value,
        createdAt: Number.isFinite(createdAt) ? createdAt : now,
        expiresAt: expiresAt !== null && Number.isFinite(expiresAt) ? expiresAt : null,
      };
      setBounded(memoryJsonCache, key, entry, MAX_MEMORY_JSON_ENTRIES);
      return {
        value,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
      };
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, value: T, ttlMs: number | null, now = Date.now()): Promise<void> {
    const expiresAt = ttlMs === null ? null : now + ttlMs;
    setBounded(memoryJsonCache, key, { value, createdAt: now, expiresAt }, MAX_MEMORY_JSON_ENTRIES);

    const edgeCache = getDefaultEdgeCache();
    if (!edgeCache) return;

    const headers = new Headers({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${resolveMaxAgeSeconds(ttlMs)}`,
      'X-Cache-Created-At': String(now),
    });
    if (expiresAt !== null) {
      headers.set('X-Cache-Expires-At', String(expiresAt));
    }

    const putOp = edgeCache
      .put(makeCacheRequest('json', key), new Response(JSON.stringify(value), { headers }))
      .catch(() => {});

    if (this.ctx) {
      this.ctx.waitUntil(putOp);
    } else {
      await putOp;
    }
  }

  async getBlob(key: string, now = Date.now()): Promise<BlobCacheHit | null> {
    const memHit = memoryBlobCache.get(key);
    if (memHit) {
      if (memHit.expiresAt !== null && memHit.expiresAt <= now) {
        memoryBlobCache.delete(key);
      } else {
        return {
          data: memHit.data,
          contentType: memHit.contentType,
          createdAt: memHit.createdAt,
        };
      }
    }

    const edgeCache = getDefaultEdgeCache();
    if (!edgeCache) return null;

    try {
      const res = await edgeCache.match(makeCacheRequest('blob', key));
      if (!res) return null;

      const createdAt = Number(res.headers.get('X-Cache-Created-At') ?? now);
      const rawExpires = res.headers.get('X-Cache-Expires-At');
      const expiresAt = rawExpires ? Number(rawExpires) : null;

      if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt <= now) {
        return null;
      }

      const data = new Uint8Array(await res.arrayBuffer());
      const contentType = res.headers.get('Content-Type') ?? 'application/octet-stream';
      const entry: MemoryBlobEntry = {
        data,
        contentType,
        createdAt: Number.isFinite(createdAt) ? createdAt : now,
        expiresAt: expiresAt !== null && Number.isFinite(expiresAt) ? expiresAt : null,
      };
      setBounded(memoryBlobCache, key, entry, MAX_MEMORY_BLOB_ENTRIES);
      return {
        data,
        contentType,
        createdAt: entry.createdAt,
      };
    } catch {
      return null;
    }
  }

  async setBlob(
    key: string,
    data: Uint8Array,
    contentType: string,
    ttlMs: number | null,
    now = Date.now(),
  ): Promise<void> {
    const expiresAt = ttlMs === null ? null : now + ttlMs;
    const copy = new Uint8Array(data);
    setBounded(
      memoryBlobCache,
      key,
      { data: copy, contentType, createdAt: now, expiresAt },
      MAX_MEMORY_BLOB_ENTRIES,
    );

    const edgeCache = getDefaultEdgeCache();
    if (!edgeCache) return;

    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${resolveMaxAgeSeconds(ttlMs)}`,
      'X-Cache-Created-At': String(now),
    });
    if (expiresAt !== null) {
      headers.set('X-Cache-Expires-At', String(expiresAt));
    }

    const putOp = edgeCache
      .put(makeCacheRequest('blob', key), new Response(new Uint8Array(copy), { headers }))
      .catch(() => {});

    if (this.ctx) {
      this.ctx.waitUntil(putOp);
    } else {
      await putOp;
    }
  }

  stats(): CacheStats {
    return {
      jsonCount: memoryJsonCache.size,
      blobCount: memoryBlobCache.size,
      backend: 'cloudflare-workers',
    };
  }
}
