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
  getJson<T>(key: string, now?: number): Promise<CacheHit<T> | null>;
  setJson<T>(key: string, value: T, ttlMs: number | null, now?: number): Promise<void>;
  getBlob(key: string, now?: number): Promise<BlobCacheHit | null>;
  setBlob(
    key: string,
    data: Uint8Array,
    contentType: string,
    ttlMs: number | null,
    now?: number,
  ): Promise<void>;
  stats(): CacheStats;
}

interface MemoryEntry<T> {
  value: T;
  contentType: string;
  createdAt: number;
  expiresAt: number | null;
}

const MAX_MEMORY_ENTRIES = 32;
const HISTORICAL_EDGE_TTL_SECONDS = 7 * 24 * 60 * 60;

const memoryJsonCache = new Map<string, MemoryEntry<unknown>>();
const memoryBlobCache = new Map<string, MemoryEntry<Uint8Array>>();

function setBounded<T>(map: Map<string, T>, key: string, value: T): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > MAX_MEMORY_ENTRIES) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function getDefaultEdgeCache(): Cache | null {
  if (typeof caches === 'undefined') return null;
  return (caches as unknown as { default?: Cache }).default ?? null;
}

function makeCacheRequest(kind: 'json' | 'blob', key: string): Request {
  return new Request(
    `https://weather-station-cache.internal/${kind}/${encodeURIComponent(key)}`,
    { method: 'GET' },
  );
}

export function clearWorkerMemoryCache(): void {
  memoryJsonCache.clear();
  memoryBlobCache.clear();
}

export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void;
}

export class WorkerWeatherCache implements WeatherCacheStore {
  constructor(private readonly ctx?: WaitUntilContext) {}

  private async getEntry<T>(
    kind: 'json' | 'blob',
    map: Map<string, MemoryEntry<T>>,
    key: string,
    decode: (res: Response) => Promise<T>,
    now: number,
  ): Promise<MemoryEntry<T> | null> {
    const memHit = map.get(key);
    if (memHit) {
      if (memHit.expiresAt !== null && memHit.expiresAt <= now) {
        map.delete(key);
      } else {
        return memHit;
      }
    }

    const edgeCache = getDefaultEdgeCache();
    if (!edgeCache) return null;

    try {
      const res = await edgeCache.match(makeCacheRequest(kind, key));
      if (!res) return null;

      const createdAt = Number(res.headers.get('X-Cache-Created-At') ?? now);
      const rawExpires = res.headers.get('X-Cache-Expires-At');
      const parsedExpires = rawExpires ? Number(rawExpires) : null;
      const expiresAt =
        parsedExpires !== null && Number.isFinite(parsedExpires) ? parsedExpires : null;

      if (expiresAt !== null && expiresAt <= now) return null;

      const entry: MemoryEntry<T> = {
        value: await decode(res),
        contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
        createdAt: Number.isFinite(createdAt) ? createdAt : now,
        expiresAt,
      };
      setBounded(map, key, entry);
      return entry;
    } catch {
      return null;
    }
  }

  private async setEntry<T>(
    kind: 'json' | 'blob',
    map: Map<string, MemoryEntry<T>>,
    key: string,
    value: T,
    contentType: string,
    body: BodyInit,
    ttlMs: number | null,
    now: number,
  ): Promise<void> {
    const expiresAt = ttlMs === null ? null : now + ttlMs;
    setBounded(map, key, { value, contentType, createdAt: now, expiresAt });

    const edgeCache = getDefaultEdgeCache();
    if (!edgeCache) return;

    const maxAge =
      ttlMs === null ? HISTORICAL_EDGE_TTL_SECONDS : Math.max(1, Math.floor(ttlMs / 1000));
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': `public, max-age=${maxAge}`,
      'X-Cache-Created-At': String(now),
    });
    if (expiresAt !== null) {
      headers.set('X-Cache-Expires-At', String(expiresAt));
    }

    const putOp = edgeCache
      .put(makeCacheRequest(kind, key), new Response(body, { headers }))
      .catch(() => {});

    if (this.ctx) {
      this.ctx.waitUntil(putOp);
    } else {
      await putOp;
    }
  }

  async getJson<T>(key: string, now = Date.now()): Promise<CacheHit<T> | null> {
    const hit = await this.getEntry('json', memoryJsonCache, key, (r) => r.json(), now);
    if (!hit) return null;
    return { value: hit.value as T, createdAt: hit.createdAt, expiresAt: hit.expiresAt };
  }

  async setJson<T>(key: string, value: T, ttlMs: number | null, now = Date.now()): Promise<void> {
    await this.setEntry(
      'json',
      memoryJsonCache,
      key,
      value,
      'application/json; charset=utf-8',
      JSON.stringify(value),
      ttlMs,
      now,
    );
  }

  async getBlob(key: string, now = Date.now()): Promise<BlobCacheHit | null> {
    const hit = await this.getEntry(
      'blob',
      memoryBlobCache,
      key,
      async (r) => new Uint8Array(await r.arrayBuffer()),
      now,
    );
    if (!hit) return null;
    return { data: hit.value, contentType: hit.contentType, createdAt: hit.createdAt };
  }

  async setBlob(
    key: string,
    data: Uint8Array,
    contentType: string,
    ttlMs: number | null,
    now = Date.now(),
  ): Promise<void> {
    const copy = new Uint8Array(data);
    await this.setEntry(
      'blob',
      memoryBlobCache,
      key,
      copy,
      contentType,
      new Uint8Array(copy),
      ttlMs,
      now,
    );
  }

  stats(): CacheStats {
    return {
      jsonCount: memoryJsonCache.size,
      blobCount: memoryBlobCache.size,
      backend: 'cloudflare-workers',
    };
  }
}
