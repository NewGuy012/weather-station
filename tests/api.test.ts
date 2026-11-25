import { describe, expect, test } from 'bun:test';
import { handleApiRequest } from '../src/server/api';
import { WeatherCache } from '../src/server/cache';
import type { WeatherDatasetResponse } from '../src/shared/types';

describe('API Router', () => {
  test('serves health, meta, and default historical seed dataset with 50 states', async () => {
    const cache = new WeatherCache(':memory:');

    const healthRes = await handleApiRequest(new Request('http://localhost/api/health'), cache);
    expect(healthRes?.status).toBe(200);

    const metaRes = await handleApiRequest(new Request('http://localhost/api/meta'), cache);
    expect(metaRes?.status).toBe(200);
    const metaJson = (await metaRes?.json()) as { states: unknown[]; defaultMode: string };
    expect(metaJson.states).toHaveLength(50);
    expect(metaJson.defaultMode).toBe('historical');

    const statesRes = await handleApiRequest(new Request('http://localhost/api/states'), cache);
    expect(statesRes?.status).toBe(200);
    const data = (await statesRes?.json()) as WeatherDatasetResponse;
    expect(data.mode).toBe('historical');
    expect(data.source).toBe('seed-archive');
    expect(Object.keys(data.states)).toHaveLength(50);
    expect(data.timelineHours.length).toBeGreaterThanOrEqual(24);

    cache.close();
  });

  test('validates query parameters and returns proper error codes', async () => {
    const cache = new WeatherCache(':memory:');

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

    cache.close();
  });
});
