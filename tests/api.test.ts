import { describe, expect, test } from 'bun:test';
import { handleApiRequest } from '../src/server/api';
import type { StateCitiesWeatherResponse, WeatherDatasetResponse } from '../src/shared/types';
import { WorkerWeatherCache, clearWorkerMemoryCache } from '../src/worker/cache';
import workerApp from '../src/worker/index';

describe('API Router', () => {
  test('serves health, meta, and default historical seed dataset with 50 states', async () => {
    clearWorkerMemoryCache();
    const cache = new WorkerWeatherCache();

    const healthRes = await handleApiRequest(new Request('http://localhost/api/health'), cache);
    expect(healthRes?.status).toBe(200);

    const metaRes = await handleApiRequest(new Request('http://localhost/api/meta'), cache);
    expect(metaRes?.status).toBe(200);
    const metaJson = (await metaRes?.json()) as {
      states: unknown[];
      topCitiesByState: Record<string, unknown[]>;
      defaultMode: string;
    };
    expect(metaJson.states).toHaveLength(50);
    expect(Object.keys(metaJson.topCitiesByState)).toHaveLength(50);
    expect(metaJson.topCitiesByState.CA).toHaveLength(10);
    expect(metaJson.defaultMode).toBe('historical');

    const statesRes = await handleApiRequest(new Request('http://localhost/api/states'), cache);
    expect(statesRes?.status).toBe(200);
    const data = (await statesRes?.json()) as WeatherDatasetResponse;
    expect(data.mode).toBe('historical');
    expect(data.source).toBe('seed-archive');
    expect(Object.keys(data.states)).toHaveLength(50);
    expect(data.timelineHours.length).toBeGreaterThanOrEqual(24);
  });

  test('validates query parameters and returns proper error codes', async () => {
    clearWorkerMemoryCache();
    const cache = new WorkerWeatherCache();

    const badRange = await handleApiRequest(
      new Request('http://localhost/api/states?mode=historical&startDate=2024-02-10&endDate=2024-02-01'),
      cache,
    );
    expect(badRange?.status).toBe(400);

    const tooLong = await handleApiRequest(
      new Request('http://localhost/api/states?mode=historical&startDate=2024-01-01&endDate=2024-01-25'),
      cache,
    );
    expect(tooLong?.status).toBe(400);

    const unknownState = await handleApiRequest(
      new Request('http://localhost/api/state/ZZ'),
      cache,
    );
    expect(unknownState?.status).toBe(404);

    const badRegion = await handleApiRequest(
      new Request('http://localhost/api/radar/image?region=mars&ts=2026-11-18T18:00:00Z'),
      cache,
    );
    expect(badRegion?.status).toBe(400);

    const histFrames = await handleApiRequest(
      new Request('http://localhost/api/radar/frames?mode=historical&anchor=2026-11-18T18:00:00Z'),
      cache,
    );
    expect(histFrames?.status).toBe(200);
    const framesBody = (await histFrames?.json()) as { frames: unknown[] };
    expect(framesBody.frames).toHaveLength(12);

    const unknownCitiesState = await handleApiRequest(
      new Request('http://localhost/api/state/ZZ/cities'),
      cache,
    );
    expect(unknownCitiesState?.status).toBe(404);

    const unknownSubpath = await handleApiRequest(
      new Request('http://localhost/api/state/CA/unknown'),
      cache,
    );
    expect(unknownSubpath?.status).toBe(404);

    const badCitiesRange = await handleApiRequest(
      new Request('http://localhost/api/state/CA/cities?mode=historical&startDate=2024-02-10&endDate=2024-02-01'),
      cache,
    );
    expect(badCitiesRange?.status).toBe(400);

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
    const cachedCitiesRes = await handleApiRequest(
      new Request('http://localhost/api/state/CA/cities?mode=live'),
      cache,
    );
    expect(cachedCitiesRes?.status).toBe(200);
    const cachedCitiesJson = (await cachedCitiesRes?.json()) as StateCitiesWeatherResponse;
    expect(cachedCitiesJson.cached).toBe(true);
    expect(cachedCitiesJson.code).toBe('CA');
  });
});

describe('Cloudflare Worker Entrypoint & Cache', () => {
  test('WorkerWeatherCache stores, retrieves, and expires JSON and binary entries', async () => {
    clearWorkerMemoryCache();
    const cache = new WorkerWeatherCache();
    const now = 2_000_000;

    await cache.setJson('live:sample', { temp: 74 }, 5_000, now);
    expect((await cache.getJson<{ temp: number }>('live:sample', now + 1000))?.value.temp).toBe(74);
    expect(await cache.getJson('live:sample', now + 6000)).toBeNull();

    await cache.setJson('hist:sample', { temp: 31 }, null, now);
    expect((await cache.getJson<{ temp: number }>('hist:sample', now + 999_999_999))?.value.temp).toBe(31);

    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    await cache.setBlob('radar:sample', pngBytes, 'image/png', 10_000, now);
    const blobHit = await cache.getBlob('radar:sample', now + 500);
    expect(blobHit?.contentType).toBe('image/png');
    expect(Array.from(blobHit?.data ?? [])).toEqual([137, 80, 78, 71]);

    expect(cache.stats()).toEqual({
      jsonCount: 1,
      blobCount: 1,
      backend: 'cloudflare-workers',
    });

    clearWorkerMemoryCache();
  });

  test('Worker entrypoint routes /api/* requests and serves 50-state baseline dataset', async () => {
    clearWorkerMemoryCache();

    const healthRes = await workerApp.fetch(new Request('http://localhost/api/health'));
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as {
      ok: boolean;
      cache: { backend?: string };
    };
    expect(healthJson.ok).toBe(true);
    expect(healthJson.cache.backend).toBe('cloudflare-workers');

    const metaRes = await workerApp.fetch(new Request('http://localhost/api/meta'));
    expect(metaRes.status).toBe(200);
    const metaJson = (await metaRes.json()) as { states: unknown[] };
    expect(metaJson.states).toHaveLength(50);

    const statesRes = await workerApp.fetch(new Request('http://localhost/api/states'));
    expect(statesRes.status).toBe(200);
    const statesJson = (await statesRes.json()) as WeatherDatasetResponse;
    expect(statesJson.source).toBe('seed-archive');
    expect(Object.keys(statesJson.states)).toHaveLength(50);

    const unknownRes = await workerApp.fetch(new Request('http://localhost/api/does-not-exist'));
    expect(unknownRes.status).toBe(404);
  });
});
