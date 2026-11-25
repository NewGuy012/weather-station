import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { BlobCacheHit, CacheHit, CacheStats, WeatherCacheStore } from './cacheTypes';

export type { BlobCacheHit, CacheHit, CacheStats, WeatherCacheStore };

export class WeatherCache implements WeatherCacheStore {
  private db: Database;

  constructor(dbPath = '.data/weather-cache.sqlite') {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS json_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS blob_cache (
        key TEXT PRIMARY KEY,
        content_type TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );
    `);
  }

  getJson<T>(key: string, now = Date.now()): CacheHit<T> | null {
    const row = this.db
      .query<{ value: string; created_at: number; expires_at: number | null }, [string]>(
        'SELECT value, created_at, expires_at FROM json_cache WHERE key = ?',
      )
      .get(key);

    if (!row) return null;
    if (row.expires_at !== null && row.expires_at <= now) {
      this.db.query('DELETE FROM json_cache WHERE key = ?').run(key);
      return null;
    }

    return {
      value: JSON.parse(row.value) as T,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  setJson<T>(key: string, value: T, ttlMs: number | null, now = Date.now()): void {
    const expiresAt = ttlMs === null ? null : now + ttlMs;
    this.db
      .query(
        `INSERT INTO json_cache (key, value, created_at, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
      )
      .run(key, JSON.stringify(value), now, expiresAt);
  }

  getBlob(
    key: string,
    now = Date.now(),
  ): { data: Uint8Array; contentType: string; createdAt: number } | null {
    const row = this.db
      .query<
        { data: Uint8Array; content_type: string; created_at: number; expires_at: number | null },
        [string]
      >('SELECT data, content_type, created_at, expires_at FROM blob_cache WHERE key = ?')
      .get(key);

    if (!row) return null;
    if (row.expires_at !== null && row.expires_at <= now) {
      this.db.query('DELETE FROM blob_cache WHERE key = ?').run(key);
      return null;
    }

    return {
      data: row.data,
      contentType: row.content_type,
      createdAt: row.created_at,
    };
  }

  setBlob(
    key: string,
    data: Uint8Array,
    contentType: string,
    ttlMs: number | null,
    now = Date.now(),
  ): void {
    const expiresAt = ttlMs === null ? null : now + ttlMs;
    this.db
      .query(
        `INSERT INTO blob_cache (key, content_type, data, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           content_type = excluded.content_type,
           data = excluded.data,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at`,
      )
      .run(key, contentType, data, now, expiresAt);
  }

  pruneExpired(now = Date.now()): void {
    this.db.query('DELETE FROM json_cache WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
    this.db.query('DELETE FROM blob_cache WHERE expires_at IS NOT NULL AND expires_at <= ?').run(now);
  }

  stats(): CacheStats {
    const jsonRow = this.db.query<{ c: number }, []>('SELECT COUNT(*) AS c FROM json_cache').get();
    const blobRow = this.db.query<{ c: number }, []>('SELECT COUNT(*) AS c FROM blob_cache').get();
    return {
      jsonCount: jsonRow?.c ?? 0,
      blobCount: blobRow?.c ?? 0,
      backend: 'sqlite',
    };
  }

  close(): void {
    this.db.close();
  }
}
