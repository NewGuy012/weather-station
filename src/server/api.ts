import { DEFAULT_HISTORICAL_PRESET, HISTORICAL_PRESETS } from '../shared/presets';
import type {
  AlertsResponse,
  HistoricalPreset,
  RadarFramesResponse,
  StateCitiesWeatherResponse,
  StateDetailResponse,
  WeatherDatasetResponse,
  WeatherMode,
} from '../shared/types';
import type { WeatherCacheStore } from './cacheTypes';
import seedHistorical from './data/seedHistorical.json';
import { STATE_BY_CODE, US_STATES } from './data/states';
import { TOP_CITIES_BY_STATE } from './data/topCities';
import { fetchActiveNwsAlerts } from './providers/nws';
import {
  fetchAllStatesHistorical,
  fetchAllStatesLive,
  fetchStateDetail,
  fetchStateTopCitiesWeather,
} from './providers/openMeteo';
import {
  buildHistoricalRadarFrames,
  fetchLiveRadarFrames,
  fetchRadarImagePng,
  type RadarRegion,
} from './providers/radar';

const LIVE_STATES_TTL_MS = 15 * 60_000;
const LIVE_DETAIL_TTL_MS = 15 * 60_000;
const ALERTS_TTL_MS = 5 * 60_000;
const RADAR_FRAMES_TTL_MS = 3 * 60_000;
const LIVE_RADAR_IMAGE_TTL_MS = 10 * 60_000;

function isValidIsoDate(value: string | null): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

function resolveHistoricalRange(url: URL):
  | {
      ok: true;
      startDate: string;
      endDate: string;
      preset?: HistoricalPreset;
    }
  | { ok: false; error: Response } {
  const presetId = url.searchParams.get('preset');
  const preset = HISTORICAL_PRESETS.find((p) => p.id === presetId);
  const startParam = url.searchParams.get('startDate');
  const endParam = url.searchParams.get('endDate');

  const startDate = preset
    ? preset.startDate
    : isValidIsoDate(startParam)
      ? startParam
      : DEFAULT_HISTORICAL_PRESET.startDate;
  const endDate = preset
    ? preset.endDate
    : isValidIsoDate(endParam)
      ? endParam
      : isValidIsoDate(startParam)
        ? startParam
        : DEFAULT_HISTORICAL_PRESET.endDate;

  if (startDate > endDate) {
    return { ok: false, error: jsonError(400, 'startDate must be before or equal to endDate') };
  }

  // Cap arbitrary custom date ranges at 10 days to keep response sizes lean
  const daySpan = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
  if (daySpan > 10) {
    return { ok: false, error: jsonError(400, 'Historical range cannot exceed 10 days') };
  }

  return { ok: true, startDate, endDate, preset };
}

export async function getCachedAlerts(
  cache: WeatherCacheStore,
  forceRefresh = false,
): Promise<AlertsResponse> {
  const key = 'live:alerts';
  if (!forceRefresh) {
    const hit = await cache.getJson<AlertsResponse>(key);
    if (hit) {
      return { ...hit.value, cached: true };
    }
  }
  const fresh = await fetchActiveNwsAlerts();
  await cache.setJson(key, fresh, ALERTS_TTL_MS);
  return fresh;
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

  try {
    if (path === '/api/health') {
      return Response.json({
        ok: true,
        cache: await cache.stats(),
        timestamp: new Date().toISOString(),
      });
    }

    if (path === '/api/meta') {
      return Response.json({
        states: US_STATES,
        topCitiesByState: TOP_CITIES_BY_STATE,
        presets: HISTORICAL_PRESETS,
        defaultMode: 'historical',
        defaultPresetId: DEFAULT_HISTORICAL_PRESET.id,
      });
    }

    if (path === '/api/states') {
      const modeParam = url.searchParams.get('mode');
      const mode: WeatherMode = modeParam === 'live' ? 'live' : 'historical';
      const forceRefresh = url.searchParams.get('refresh') === '1';

      if (mode === 'live') {
        const key = 'live:states';
        if (!forceRefresh) {
          const hit = await cache.getJson<WeatherDatasetResponse>(key);
          if (hit) {
            return Response.json({ ...hit.value, cached: true });
          }
        }
        const [dataset, alerts] = await Promise.all([
          fetchAllStatesLive(),
          getCachedAlerts(cache, forceRefresh).catch(() => null),
        ]);
        if (alerts) {
          dataset.alertsCount = alerts.totalActive;
        }
        await cache.setJson(key, dataset, LIVE_STATES_TTL_MS);
        return Response.json(dataset);
      }

      // Historical mode
      const range = resolveHistoricalRange(url);
      if (!range.ok) return range.error;
      const { startDate, endDate, preset } = range;

      const isDefaultRange =
        startDate === DEFAULT_HISTORICAL_PRESET.startDate &&
        endDate === DEFAULT_HISTORICAL_PRESET.endDate;

      if (isDefaultRange && !forceRefresh) {
        return Response.json({
          ...(seedHistorical as unknown as WeatherDatasetResponse),
          cached: true,
        });
      }

      const key = `hist:states:${startDate}:${endDate}`;
      if (!forceRefresh) {
        const hit = await cache.getJson<WeatherDatasetResponse>(key);
        if (hit) {
          return Response.json({ ...hit.value, cached: true });
        }
      }

      const dataset = await fetchAllStatesHistorical({
        startDate,
        endDate,
        presetId: preset?.id,
        presetLabel: preset?.label,
        defaultFrameIndex: preset?.defaultFrameIndex,
      });
      await cache.setJson(key, dataset, null);
      return Response.json(dataset);
    }

    if (path.startsWith('/api/state/')) {
      const segments = path.slice('/api/state/'.length).split('/').filter(Boolean);
      const code = (segments[0] ?? '').trim().toUpperCase();
      const meta = STATE_BY_CODE[code];
      if (!meta || segments.length > 2) {
        return jsonError(404, `Unknown state endpoint: ${path}`);
      }

      const mode: WeatherMode = url.searchParams.get('mode') === 'live' ? 'live' : 'historical';
      const forceRefresh = url.searchParams.get('refresh') === '1';

      if (segments.length === 2) {
        if (segments[1] !== 'cities') {
          return jsonError(404, `Unknown state endpoint: ${path}`);
        }

        const range = mode === 'historical' ? resolveHistoricalRange(url) : null;
        if (range && !range.ok) return range.error;

        const cacheKey =
          mode === 'live'
            ? `live:cities:${code}`
            : `hist:cities:${code}:${range!.startDate}:${range!.endDate}`;

        if (!forceRefresh) {
          const hit = await cache.getJson<StateCitiesWeatherResponse>(cacheKey);
          if (hit) {
            return Response.json({ ...hit.value, cached: true });
          }
        }

        const citiesWeather = await fetchStateTopCitiesWeather({
          code,
          mode,
          startDate: range?.ok ? range.startDate : undefined,
          endDate: range?.ok ? range.endDate : undefined,
          defaultFrameIndex: range?.ok ? range.preset?.defaultFrameIndex : undefined,
        });
        await cache.setJson(cacheKey, citiesWeather, mode === 'live' ? LIVE_DETAIL_TTL_MS : null);
        return Response.json(citiesWeather);
      }

      const city = url.searchParams.get('city') ?? meta.primaryCity;
      const startDate = url.searchParams.get('startDate') ?? DEFAULT_HISTORICAL_PRESET.startDate;
      const endDate = url.searchParams.get('endDate') ?? DEFAULT_HISTORICAL_PRESET.endDate;

      const cacheKey =
        mode === 'live'
          ? `live:detail:${code}:${city}`
          : `hist:detail:${code}:${city}:${startDate}:${endDate}`;

      if (!forceRefresh) {
        const hit = await cache.getJson<StateDetailResponse>(cacheKey);
        if (hit) {
          const detail = { ...hit.value, cached: true };
          if (mode === 'live') {
            const alerts = await getCachedAlerts(cache).catch(() => null);
            detail.alerts = alerts?.byState[code] ?? [];
          }
          return Response.json(detail);
        }
      }

      const detail = await fetchStateDetail({
        code,
        cityName: city,
        mode,
        startDate: mode === 'historical' ? startDate : undefined,
        endDate: mode === 'historical' ? endDate : undefined,
      });

      if (mode === 'live') {
        const alerts = await getCachedAlerts(cache).catch(() => null);
        detail.alerts = alerts?.byState[code] ?? [];
      }

      await cache.setJson(cacheKey, detail, mode === 'live' ? LIVE_DETAIL_TTL_MS : null);
      return Response.json(detail);
    }

    if (path === '/api/alerts') {
      const forceRefresh = url.searchParams.get('refresh') === '1';
      const alerts = await getCachedAlerts(cache, forceRefresh);
      return Response.json(alerts);
    }

    if (path === '/api/radar/frames') {
      const mode: WeatherMode = url.searchParams.get('mode') === 'live' ? 'live' : 'historical';
      if (mode === 'historical') {
        const anchor = url.searchParams.get('anchor') ?? '2026-11-18T18:00:00Z';
        return Response.json(buildHistoricalRadarFrames(anchor, 12));
      }

      const key = 'live:radar:frames';
      const hit = await cache.getJson<RadarFramesResponse>(key);
      if (hit) {
        return Response.json(hit.value);
      }
      const frames = await fetchLiveRadarFrames();
      await cache.setJson(key, frames, RADAR_FRAMES_TTL_MS);
      return Response.json(frames);
    }

    if (path === '/api/radar/image') {
      const mode: WeatherMode = url.searchParams.get('mode') === 'live' ? 'live' : 'historical';
      const regionParam = url.searchParams.get('region') ?? 'conus';
      if (regionParam !== 'conus' && regionParam !== 'alaska' && regionParam !== 'hawaii') {
        return jsonError(400, 'Invalid radar region');
      }
      const region: RadarRegion = regionParam;
      const ts = url.searchParams.get('ts');
      if (!ts) {
        return jsonError(400, 'Missing ts query parameter');
      }

      const key = `radar:${mode}:${region}:${ts}`;
      const hit = await cache.getBlob(key);
      if (hit) {
        return new Response(new Uint8Array(hit.data), {
          headers: {
            'Content-Type': hit.contentType,
            'Cache-Control': 'public, max-age=300',
            'X-Radar-Cache': 'hit',
          },
        });
      }

      const png = await fetchRadarImagePng({ mode, region, timestamp: ts });
      if (!png) {
        return jsonError(404, 'Radar frame unavailable for region/timestamp');
      }
      await cache.setBlob(key, png, 'image/png', mode === 'live' ? LIVE_RADAR_IMAGE_TTL_MS : null);
      return new Response(new Uint8Array(png), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=300',
          'X-Radar-Cache': 'miss',
        },
      });
    }

    return jsonError(404, `Unknown endpoint: ${path}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    return jsonError(502, message);
  }
}
