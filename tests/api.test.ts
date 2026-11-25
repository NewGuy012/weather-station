import { describe, expect, test } from 'bun:test';
import { handleApiRequest } from '../src/server/api';
import type { StateCitiesWeatherResponse, WeatherDatasetResponse } from '../src/shared/types';
import { WorkerWeatherCache, clearWorkerMemoryCache } from '../src/worker/cache';
import workerApp from '../src/worker/index';

describe('API Router & Security', () => {
  test('serves health, removes /api/meta, and returns 50-state baseline seed', async () => {
    clearWorkerMemoryCache();
    const cache = new WorkerWeatherCache();

    const healthRes = await handleApiRequest(new Request('http://localhost/api/health'), cache);
    expect(healthRes?.status).toBe(200);
    expect(healthRes?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(healthRes?.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(healthRes?.headers.get('Cache-Control')).toBe('no-store');

    const metaRes = await handleApiRequest(new Request('http://localhost/api/meta'), cache);
    expect(metaRes?.status).toBe(404);
    expect(((await metaRes?.json()) as { error: string }).error).toBe('Unknown endpoint');

    const statesRes = await handleApiRequest(new Request('http://localhost/api/states'), cache);
    const data = (await statesRes?.json()) as WeatherDatasetResponse;
    expect(statesRes?.status).toBe(200);
    expect(data.source).toBe('seed-archive');
    expect(Object.keys(data.states)).toHaveLength(50);
    expect(data.timelineHours.length).toBeGreaterThanOrEqual(24);
  });

  test('enforces HTTP methods, bounded inputs, no path reflection, and cache hits', async () => {
    clearWorkerMemoryCache();
    const cache = new WorkerWeatherCache();

    const badMethod = await handleApiRequest(
      new Request('http://localhost/api/states', { method: 'POST' }),
      cache,
    );
    expect(badMethod?.status).toBe(405);
    expect(badMethod?.headers.get('Allow')).toBe('GET, HEAD');

    const badRequests = [
      'http://localhost/api/states?mode=historical&startDate=2024-02-10&endDate=2024-02-01',
      'http://localhost/api/states?mode=historical&startDate=2024-01-01&endDate=2024-01-25',
      'http://localhost/api/states?mode=historical&startDate=2024-99-99',
      'http://localhost/api/states?mode=historical&startDate=1939-12-31&endDate=1939-12-31',
      'http://localhost/api/states?mode=historical&startDate=2099-01-01&endDate=2099-01-02',
      'http://localhost/api/state/CA?city=NotARealCity',
      'http://localhost/api/radar/frames?mode=historical&anchor=invalid-ts',
      'http://localhost/api/radar/frames?mode=historical&anchor=2099-01-01T00:00:00Z',
      'http://localhost/api/radar/image?region=mars&ts=2026-11-18T18:00:00Z',
      'http://localhost/api/radar/image?region=conus&ts=not-a-timestamp',
      'http://localhost/api/radar/image?mode=live&region=conus&ts=2020-01-01T00:00:00Z',
    ];
    for (const url of badRequests) {
      const res = await handleApiRequest(new Request(url), cache);
      expect(res?.status).toBe(400);
    }

    for (const url of [
      'http://localhost/api/state/ZZ',
      'http://localhost/api/state/CA/unknown-probe',
    ]) {
      const res = await handleApiRequest(new Request(url), cache);
      expect(res?.status).toBe(404);
      const body = (await res?.json()) as { error: string };
      expect(body.error).not.toContain('unknown-probe');
    }

    const cachedCitiesPayload: StateCitiesWeatherResponse = {
      mode: 'live',
      code: 'CA',
      name: 'California',
      cached: false,
      fetchedAt: '2026-11-24T12:00:00Z',
      startDate: '2026-11-24',
      endDate: '2026-11-26',
      timelineHours: ['2026-11-24T12:00Z'],
      cities: [],
    };
    await cache.setJson('live:cities:CA', cachedCitiesPayload, 60_000);
    const hitRes = await handleApiRequest(
      new Request('http://localhost/api/state/CA/cities?mode=live'),
      cache,
    );
    expect(hitRes?.status).toBe(200);
    expect(((await hitRes?.json()) as StateCitiesWeatherResponse).cached).toBe(true);

    // Stale-on-error: if forced refresh fails upstream after cooldown, return stale cache
    await cache.setJson('live:alerts', { fetchedAt: 't', cached: false, totalActive: 0, byState: {}, featuresGeoJson: { type: 'FeatureCollection', features: [] } }, 300_000, Date.now() - 120_000);
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;
    try {
      const staleRes = await handleApiRequest(
        new Request('http://localhost/api/alerts?refresh=1'),
        cache,
      );
      expect(staleRes?.status).toBe(200);
      expect(((await staleRes?.json()) as { cached: boolean }).cached).toBe(true);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe('Cloudflare Worker Entrypoint & Cache', () => {
  test('enforces TTLs, 16MB blob memory cap, and Worker routing', async () => {
    clearWorkerMemoryCache();
    const cache = new WorkerWeatherCache();
    const now = 2_000_000;

    await cache.setJson('live:sample', { temp: 74 }, 5_000, now);
    expect((await cache.getJson<{ temp: number }>('live:sample', now + 1000))?.value.temp).toBe(74);
    expect(await cache.getJson('live:sample', now + 6000)).toBeNull();

    await cache.setJson('hist:sample', { temp: 31 }, null, now);
    expect((await cache.getJson<{ temp: number }>('hist:sample', now + 999_999_999))?.value.temp).toBe(31);

    // 3 x 6MB blobs exceed 16MB budget -> oldest evicted
    const bigBlob = new Uint8Array(6 * 1024 * 1024);
    await cache.setBlob('b1', bigBlob, 'image/png', 10_000, now);
    await cache.setBlob('b2', bigBlob, 'image/png', 10_000, now);
    await cache.setBlob('b3', bigBlob, 'image/png', 10_000, now);
    expect(cache.stats()).toEqual({ jsonCount: 1, blobCount: 2, backend: 'cloudflare-workers' });
    expect(await cache.getBlob('b1', now)).toBeNull();

    clearWorkerMemoryCache();

    const statesRes = await workerApp.fetch(new Request('http://localhost/api/states'));
    expect(statesRes.status).toBe(200);
    const statesJson = (await statesRes.json()) as WeatherDatasetResponse;
    expect(Object.keys(statesJson.states)).toHaveLength(50);

    const unknownRes = await workerApp.fetch(new Request('http://localhost/api/does-not-exist'));
    expect(unknownRes.status).toBe(404);
    expect(unknownRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
