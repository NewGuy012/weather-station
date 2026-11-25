import { describe, expect, test } from 'bun:test';
import { type GeoPermissibleObjects, geoContains } from 'd3-geo';
import { getUsStateFeatures } from '../src/client/utils/mapGeometry';
import { parseNwsAlerts } from '../src/server/providers/nws';
import {
  type OpenMeteoLocationPayload,
  buildBatchDataset,
  buildCityBatchDataset,
  computeTimelineStride,
  ensureUtcIso,
} from '../src/server/providers/openMeteo';
import { isValidPngBytes, parseNoaaCapabilitiesTimes } from '../src/server/providers/radar';
import { buildHistoricalRadarFrames } from '../src/shared/radar';
import { US_STATES } from '../src/shared/states';
import { TOP_CITIES_BY_STATE } from '../src/shared/topCities';
import { degToCompass, fToC, formatTemp } from '../src/shared/units';
import { getWmoInfo } from '../src/shared/wmoCodes';

function makeLocationPayload(
  lat: number,
  lon: number,
  temps: number[],
  extra?: Partial<OpenMeteoLocationPayload>,
): OpenMeteoLocationPayload {
  return {
    latitude: lat,
    longitude: lon,
    timezone: 'GMT',
    hourly: {
      time: ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-15T02:00'],
      temperature_2m: temps,
      relative_humidity_2m: [70, 68, 65],
      precipitation: [0, 0.2, 0],
      precipitation_probability: [10, 55, 90],
      wind_speed_10m: [5, 7, 9],
      wind_direction_10m: [180, 190, 200],
      weather_code: [0, 61, 71],
    },
    daily: {
      time: ['2026-11-15'],
      temperature_2m_max: [Math.max(...temps) + 2],
      temperature_2m_min: [Math.min(...temps) - 2],
    },
    ...extra,
  };
}

describe('50-State & Top-10 City Registry', () => {
  test('contains 50 unique US states and 10 ranked cities inside each state boundary', () => {
    expect(US_STATES).toHaveLength(50);
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(50);
    expect(new Set(US_STATES.map((s) => s.fips)).size).toBe(50);

    const byFips = new Map(
      getUsStateFeatures().map((f) => [String(f.id ?? '').padStart(2, '0'), f]),
    );

    for (const st of US_STATES) {
      expect(st.cities.length).toBeGreaterThanOrEqual(2);
      const cities = TOP_CITIES_BY_STATE[st.code] ?? [];
      expect(cities).toHaveLength(10);
      expect(new Set(cities.map((c) => c.name)).size).toBe(10);

      const feat = byFips.get(st.fips);
      expect(feat).toBeDefined();
      for (let i = 0; i < cities.length; i++) {
        const city = cities[i]!;
        expect(city.rank).toBe(i + 1);
        expect(city.population).toBeGreaterThan(0);
        if (i > 0) expect(city.population).toBeLessThanOrEqual(cities[i - 1]!.population);
        expect(geoContains(feat as unknown as GeoPermissibleObjects, [city.lon, city.lat])).toBe(true);
      }
    }
  });
});

describe('Providers & Shared Utilities', () => {
  test('parses Open-Meteo historical and live current/hourly data accurately', () => {
    expect(ensureUtcIso('2026-11-15T12:00')).toBe('2026-11-15T12:00Z');
    expect(ensureUtcIso('2026-11-15T12:00Z')).toBe('2026-11-15T12:00Z');
    expect(computeTimelineStride(48)).toBe(1);
    expect(computeTimelineStride(96)).toBe(2);
    expect(computeTimelineStride(120)).toBe(3);

    const hist = buildBatchDataset(
      [makeLocationPayload(33.52, -86.81, [60, 62, 64]), makeLocationPayload(61.22, -149.9, [22, 21, 20])],
      [null, { hourly: { time: ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-15T02:00'], us_aqi: [18, 20, 19], uv_index: [0, 1, 0] } }],
      US_STATES.slice(0, 2),
      { mode: 'historical', source: 'open-meteo-archive', startDate: '2026-11-15', endDate: '2026-11-15', defaultFrameIndex: 1 },
    );
    expect(hist.timelineHours).toEqual(['2026-11-15T00:00Z', '2026-11-15T01:00Z', '2026-11-15T02:00Z']);
    expect(hist.states.AL?.current.temperatureF).toBe(62);
    expect(hist.states.AK?.current.usAqi).toBe(20);
    expect(hist.states.AK?.timeline[2]?.weatherCode).toBe(71);

    const live = buildCityBatchDataset(
      [
        makeLocationPayload(34.05, -118.24, [72, 69, 65], {
          current: {
            time: '2026-11-15T00:15',
            temperature_2m: 72,
            relative_humidity_2m: 45,
            apparent_temperature: 71,
            precipitation: 0,
            weather_code: 1,
            wind_speed_10m: 6,
            wind_direction_10m: 260,
          },
        }),
      ],
      [{ current: { us_aqi: 44, pm2_5: 9.2, uv_index: 4 } }],
      (TOP_CITIES_BY_STATE.CA ?? []).slice(0, 1),
      { code: 'CA', name: 'California' },
      { mode: 'live', startDate: '2026-11-15', endDate: '2026-11-17' },
    );
    expect(live.cities[0]?.name).toBe('Los Angeles');
    expect(live.cities[0]?.current.usAqi).toBe(44);
    expect(live.cities[0]?.current.precipitationProb).toBe(10);
  });

  test('parses NWS alerts, NOAA radar capabilities, PNG headers, and units', () => {
    const parsed = parseNwsAlerts({
      features: [
        {
          id: 'a1',
          type: 'Feature',
          geometry: null,
          properties: { id: 'a1', event: 'Wind Advisory', severity: 'Minor', geocode: { UGC: ['CAZ006', 'PKZ999'] } },
        },
        {
          id: 'a2',
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: { id: 'a2', event: 'Tornado Warning', severity: 'Extreme', geocode: { UGC: ['OKC109', 'CAZ006'] } },
        },
      ],
    });
    expect(parsed.totalActive).toBe(2);
    expect(parsed.byState.CA?.map((a) => a.event)).toEqual(['Tornado Warning', 'Wind Advisory']);
    expect(parsed.byState.OK).toHaveLength(1);
    expect(parsed.featuresGeoJson.features).toHaveLength(1);

    const xml = '<Dimension name="time">2026-11-25T01:00:00Z,2026-11-25T01:15:00Z</Dimension>';
    expect(parseNoaaCapabilitiesTimes(xml, 2)).toEqual(['2026-11-25T01:00:00Z', '2026-11-25T01:15:00Z']);
    const hist = buildHistoricalRadarFrames('2024-01-14T18:00:00Z', 6);
    expect(hist.frames).toHaveLength(6);
    expect(hist.frames[5]?.timestamp).toBe('2024-01-14T18:00:00Z');

    expect(isValidPngBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isValidPngBytes(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0x00, 0x00]))).toBe(false);

    expect(Math.round(fToC(32))).toBe(0);
    expect(formatTemp(77, 'C', true)).toBe('25°C');
    expect(degToCompass(225)).toBe('SW');
    expect(getWmoInfo(95).category).toBe('thunderstorm');
  });
});
