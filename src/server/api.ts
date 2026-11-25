import { DEFAULT_HISTORICAL_PRESET, HISTORICAL_PRESETS } from '../shared/presets';
import {
  RADAR_BBOX_4326,
  type RadarRegion,
  buildHistoricalRadarFrames,
} from '../shared/radar';
import { STATE_BY_CODE } from '../shared/states';
import { findStateCity } from '../shared/topCities';
import type {
  HistoricalPreset,
  RadarFramesResponse,
  StateCitiesWeatherResponse,
  StateDetailResponse,
  WeatherDatasetResponse,
  WeatherMode,
} from '../shared/types';
import type { WeatherCacheStore } from '../worker/cache';
import seedHistorical from './data/seedHistorical.json';
import { fetchActiveNwsAlerts } from './providers/nws';
import {
  fetchAllStatesHistorical,
  fetchAllStatesLive,
  fetchStateDetail,
  fetchStateTopCitiesWeather,
  isoDateDaysAgo,
  shouldUseArchiveEndpoint,
} from './providers/openMeteo';
import { fetchLiveRadarFrames, fetchRadarImagePng } from './providers/radar';

const LIVE_STATES_TTL_MS = 15 * 60_000;
const LIVE_DETAIL_TTL_MS = 15 * 60_000;
const ALERTS_TTL_MS = 5 * 60_000;
const RADAR_FRAMES_TTL_MS = 3 * 60_000;
const LIVE_RADAR_IMAGE_TTL_MS = 10 * 60_000;
const LIVE_REFRESH_COOLDOWN_MS = 60_000;
const MIN_ARCHIVE_DATE = '1940-01-01';
const MIN_RADAR_MS = Date.UTC(1995, 0, 1);

const inFlight = new Map<string, Promise<unknown>>();

function securityHeaders(cacheControl: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Cache-Control', cacheControl);
  return headers;
}

function jsonResponse(
  data: unknown,
  status = 200,
  cacheControl = 'no-store',
  extraHeaders?: HeadersInit,
): Response {
  return Response.json(data, { status, headers: securityHeaders(cacheControl, extraHeaders) });
}

function jsonError(status: number, message: string, extraHeaders?: HeadersInit): Response {
  return jsonResponse({ error: message }, status, 'no-store', extraHeaders);
}

function pngResponse(bytes: Uint8Array, contentType: string, cacheStatus: 'hit' | 'miss'): Response {
  return new Response(new Uint8Array(bytes), {
    headers: securityHeaders('public, max-age=300', {
      'Content-Type': contentType,
      'X-Radar-Cache': cacheStatus,
    }),
  });
}

function parseMode(url: URL): WeatherMode {
  return url.searchParams.get('mode') === 'live' ? 'live' : 'historical';
}

function isValidIsoDate(value: string | null): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (value < MIN_ARCHIVE_DATE || value > isoDateDaysAgo(-2)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
}

function isValidUtcTimestamp(value: string | null, liveWindowOnly = false): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z$/.test(value)) return false;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return false;
  const now = Date.now();
  if (ms < MIN_RADAR_MS || ms > now + 10 * 60_000) return false;
  if (liveWindowOnly && ms < now - 6 * 3_600_000) return false;
  return true;
}

function resolveHistoricalRange(url: URL):
  | { ok: true; startDate: string; endDate: string; preset?: HistoricalPreset }
  | { ok: false; error: Response } {
  const presetId = url.searchParams.get('preset');
  const preset = HISTORICAL_PRESETS.find((p) => p.id === presetId);
  const startParam = url.searchParams.get('startDate');
  const endParam = url.searchParams.get('endDate');

  if (!preset) {
    if (startParam !== null && !isValidIsoDate(startParam)) {
      return { ok: false, error: jsonError(400, 'Invalid startDate (expected YYYY-MM-DD in 1940..present)') };
    }
    if (endParam !== null && !isValidIsoDate(endParam)) {
      return { ok: false, error: jsonError(400, 'Invalid endDate (expected YYYY-MM-DD in 1940..present)') };
    }
  }

  const startDate = preset ? preset.startDate : startParam ?? DEFAULT_HISTORICAL_PRESET.startDate;
  const endDate = preset ? preset.endDate : endParam ?? startParam ?? DEFAULT_HISTORICAL_PRESET.endDate;

  if (startDate > endDate) {
    return { ok: false, error: jsonError(400, 'startDate must be before or equal to endDate') };
  }

  // Cap custom ranges at 10 days to keep Open-Meteo payloads lean
  const daySpan = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
  if (daySpan > 10) {
    return { ok: false, error: jsonError(400, 'Historical range cannot exceed 10 days') };
  }

  return { ok: true, startDate, endDate, preset };
}

function coalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

async function getOrCache<T>(
  cache: WeatherCacheStore,
  key: string,
  ttlMs: number | null,
  fetcher: () => Promise<T>,
  forceRefresh = false,
): Promise<{ value: T; fromCache: boolean }> {
  const allowRefresh = forceRefresh && ttlMs !== null;
  const hit = await cache.getJson<T>(key);
  if (hit && (!allowRefresh || Date.now() - hit.createdAt < LIVE_REFRESH_COOLDOWN_MS)) {
    return { value: hit.value, fromCache: true };
  }

  return coalesce(key, async () => {
    try {
      const fresh = await fetcher();
      await cache.setJson(key, fresh, ttlMs);
      return { value: fresh, fromCache: false };
    } catch (err) {
      if (hit) return { value: hit.value, fromCache: true };
      throw err;
    }
  });
}

async function cachedJson<T extends { cached?: boolean }>(
  cache: WeatherCacheStore,
  key: string,
  ttlMs: number | null,
  fetcher: () => Promise<T>,
  forceRefresh = false,
): Promise<T> {
  const res = await getOrCache(cache, key, ttlMs, fetcher, forceRefresh);
  return res.fromCache ? { ...res.value, cached: true } : res.value;
}

function historicalTtl(endDate: string): number | null {
  return shouldUseArchiveEndpoint(endDate) ? null : LIVE_STATES_TTL_MS;
}

export async function handleApiRequest(
  req: Request,
  cache: WeatherCacheStore,
): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (!path.startsWith('/api/')) {
    return null;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonError(405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  try {
    if (path === '/api/health') {
      return jsonResponse({
        ok: true,
        cache: cache.stats(),
        timestamp: new Date().toISOString(),
      });
    }

    if (path === '/api/states') {
      const mode = parseMode(url);
      const forceRefresh = url.searchParams.get('refresh') === '1';

      if (mode === 'live') {
        const dataset = await cachedJson(
          cache,
          'live:states',
          LIVE_STATES_TTL_MS,
          fetchAllStatesLive,
          forceRefresh,
        );
        return jsonResponse(dataset, 200, 'public, max-age=300');
      }

      const range = resolveHistoricalRange(url);
      if (!range.ok) return range.error;
      const { startDate, endDate, preset } = range;

      if (
        startDate === DEFAULT_HISTORICAL_PRESET.startDate &&
        endDate === DEFAULT_HISTORICAL_PRESET.endDate
      ) {
        return jsonResponse(
          { ...(seedHistorical as unknown as WeatherDatasetResponse), cached: true },
          200,
          'public, max-age=86400',
        );
      }

      const ttl = historicalTtl(endDate);
      const dataset = await cachedJson(
        cache,
        `hist:states:${startDate}:${endDate}`,
        ttl,
        () =>
          fetchAllStatesHistorical({
            startDate,
            endDate,
            presetId: preset?.id,
            presetLabel: preset?.label,
            defaultFrameIndex: preset?.defaultFrameIndex,
          }),
      );
      return jsonResponse(dataset, 200, ttl === null ? 'public, max-age=86400' : 'public, max-age=300');
    }

    if (path.startsWith('/api/state/')) {
      const segments = path.slice('/api/state/'.length).split('/').filter(Boolean);
      const code = (segments[0] ?? '').trim().toUpperCase();
      if (!STATE_BY_CODE[code] || segments.length > 2) {
        return jsonError(404, 'Unknown state endpoint');
      }

      const mode = parseMode(url);
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const range = mode === 'historical' ? resolveHistoricalRange(url) : null;
      if (range && !range.ok) return range.error;
      const ttl = mode === 'live' ? LIVE_DETAIL_TTL_MS : historicalTtl(range!.endDate);
      const cacheCtrl = ttl === null ? 'public, max-age=86400' : 'public, max-age=300';

      if (segments.length === 2) {
        if (segments[1] !== 'cities') {
          return jsonError(404, 'Unknown state endpoint');
        }

        const cacheKey =
          mode === 'live'
            ? `live:cities:${code}`
            : `hist:cities:${code}:${range!.startDate}:${range!.endDate}`;

        const citiesWeather = await cachedJson<StateCitiesWeatherResponse>(
          cache,
          cacheKey,
          ttl,
          () =>
            fetchStateTopCitiesWeather({
              code,
              mode,
              startDate: range?.ok ? range.startDate : undefined,
              endDate: range?.ok ? range.endDate : undefined,
              defaultFrameIndex: range?.ok ? range.preset?.defaultFrameIndex : undefined,
            }),
          forceRefresh,
        );
        return jsonResponse(citiesWeather, 200, cacheCtrl);
      }

      const city = findStateCity(code, url.searchParams.get('city'))?.name ?? null;
      if (!city) {
        return jsonError(400, `Unknown city for state ${code}`);
      }

      const cacheKey =
        mode === 'live'
          ? `live:detail:${code}:${city}`
          : `hist:detail:${code}:${city}:${range!.startDate}:${range!.endDate}`;

      const detail = await cachedJson<StateDetailResponse>(
        cache,
        cacheKey,
        ttl,
        () =>
          fetchStateDetail({
            code,
            cityName: city,
            mode,
            startDate: range?.ok ? range.startDate : undefined,
            endDate: range?.ok ? range.endDate : undefined,
          }),
        forceRefresh,
      );

      if (mode === 'live' && url.searchParams.get('alerts') !== '0') {
        const alerts = await cachedJson(
          cache,
          'live:alerts',
          ALERTS_TTL_MS,
          fetchActiveNwsAlerts,
        ).catch(() => null);
        return jsonResponse({ ...detail, alerts: alerts?.byState[code] ?? [] }, 200, cacheCtrl);
      }
      return jsonResponse(detail, 200, cacheCtrl);
    }

    if (path === '/api/alerts') {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const alerts = await cachedJson(
        cache,
        'live:alerts',
        ALERTS_TTL_MS,
        fetchActiveNwsAlerts,
        forceRefresh,
      );
      return jsonResponse(alerts, 200, 'public, max-age=180');
    }

    if (path === '/api/radar/frames') {
      const mode = parseMode(url);
      if (mode === 'historical') {
        const anchorParam = url.searchParams.get('anchor');
        if (anchorParam !== null && !isValidUtcTimestamp(anchorParam)) {
          return jsonError(400, 'Invalid anchor timestamp');
        }
        return jsonResponse(
          buildHistoricalRadarFrames(anchorParam ?? '2026-11-18T18:00:00Z', 12),
          200,
          'public, max-age=3600',
        );
      }

      const { value: frames } = await getOrCache<RadarFramesResponse>(
        cache,
        'live:radar:frames',
        RADAR_FRAMES_TTL_MS,
        fetchLiveRadarFrames,
      );
      return jsonResponse(frames, 200, 'public, max-age=180');
    }

    if (path === '/api/radar/image') {
      const mode = parseMode(url);
      const regionParam = url.searchParams.get('region') ?? 'conus';
      if (!(regionParam in RADAR_BBOX_4326)) {
        return jsonError(400, 'Invalid radar region');
      }
      const region = regionParam as RadarRegion;
      const ts = url.searchParams.get('ts');
      if (!isValidUtcTimestamp(ts, mode === 'live')) {
        return jsonError(400, 'Invalid ts query parameter');
      }

      const key = `radar:${mode}:${region}:${ts}`;
      const hit = await cache.getBlob(key);
      if (hit) {
        return pngResponse(hit.data, hit.contentType, 'hit');
      }

      const png = await coalesce(key, async () => {
        const bytes = await fetchRadarImagePng({ mode, region, timestamp: ts });
        if (bytes) {
          await cache.setBlob(key, bytes, 'image/png', mode === 'live' ? LIVE_RADAR_IMAGE_TTL_MS : null);
        }
        return bytes;
      });

      if (!png) {
        return jsonError(404, 'Radar frame unavailable for region/timestamp');
      }
      return pngResponse(png, 'image/png', 'miss');
    }

    return jsonError(404, 'Unknown endpoint');
  } catch (err) {
    console.error('API request failed:', path, err);
    return jsonError(502, 'Upstream weather service unavailable');
  }
}
