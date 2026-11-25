import { describe, expect, test } from 'bun:test';
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import usAtlasStates from 'us-atlas/states-10m.json';
import { US_STATES } from '../src/shared/states';
import { TOP_CITIES_BY_STATE } from '../src/server/data/topCities';
import { parseNwsAlerts } from '../src/server/providers/nws';
import {
  buildBatchDataset,
  buildCityBatchDataset,
  computeTimelineStride,
  ensureUtcIso,
} from '../src/server/providers/openMeteo';
import { buildHistoricalRadarFrames, parseNoaaCapabilitiesTimes } from '../src/server/providers/radar';
import { degToCompass, fToC, formatTemp } from '../src/shared/units';
import { getWmoInfo } from '../src/shared/wmoCodes';

describe('50-State Registry & Seed Integrity', () => {
  test('contains exactly 50 unique US states with unique FIPS and codes', () => {
    expect(US_STATES).toHaveLength(50);
    const codes = new Set(US_STATES.map((s) => s.code));
    const fips = new Set(US_STATES.map((s) => s.fips));
    expect(codes.size).toBe(50);
    expect(fips.size).toBe(50);
    for (const s of US_STATES) {
      expect(s.cities.length).toBeGreaterThanOrEqual(2);
    }
  });

  test('contains 10 ranked populated cities inside every state boundary', () => {
    const topology = usAtlasStates as unknown as Topology<{
      states: GeometryCollection<{ name: string }>;
    }>;
    const statesGeo = feature(topology, topology.objects.states);
    const byFips = new Map(statesGeo.features.map((f) => [String(f.id ?? '').padStart(2, '0'), f]));

    for (const st of US_STATES) {
      const cities = TOP_CITIES_BY_STATE[st.code] ?? [];
      expect(cities).toHaveLength(10);
      const uniqueNames = new Set(cities.map((c) => c.name));
      expect(uniqueNames.size).toBe(10);

      const feat = byFips.get(st.fips);
      expect(feat).toBeDefined();

      for (let i = 0; i < cities.length; i++) {
        const city = cities[i]!;
        expect(city.rank).toBe(i + 1);
        expect(city.population).toBeGreaterThan(0);
        if (i > 0) {
          expect(city.population).toBeLessThanOrEqual(cities[i - 1]!.population);
        }
        expect(geoContains(feat!, [city.lon, city.lat])).toBe(true);
      }
    }
  });
});

describe('Open-Meteo Parsers & Helpers', () => {
  test('normalizes UTC timestamps and chooses timeline stride cleanly', () => {
    expect(ensureUtcIso('2026-11-15T12:00')).toBe('2026-11-15T12:00Z');
    expect(ensureUtcIso('2026-11-15T12:00Z')).toBe('2026-11-15T12:00Z');
    expect(computeTimelineStride(48)).toBe(1);
    expect(computeTimelineStride(96)).toBe(2);
    expect(computeTimelineStride(120)).toBe(3);
  });

  test('builds batch dataset from location payloads', () => {
    const subset = US_STATES.slice(0, 2);
    const dataset = buildBatchDataset(
      [
        {
          latitude: 33.52,
          longitude: -86.81,
          timezone: 'GMT',
          hourly: {
            time: ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-15T02:00'],
            temperature_2m: [60, 62, 64],
            apparent_temperature: [59, 61, 63],
            relative_humidity_2m: [70, 68, 65],
            precipitation: [0, 0.2, 0],
            wind_speed_10m: [5, 7, 9],
            wind_direction_10m: [180, 190, 200],
            weather_code: [0, 61, 2],
          },
          daily: {
            time: ['2026-11-15'],
            temperature_2m_max: [66],
            temperature_2m_min: [52],
          },
        },
        {
          latitude: 61.22,
          longitude: -149.9,
          timezone: 'GMT',
          hourly: {
            time: ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-15T02:00'],
            temperature_2m: [22, 21, 20],
            relative_humidity_2m: [80, 82, 85],
            precipitation: [0, 0, 0.5],
            wind_speed_10m: [12, 14, 15],
            wind_direction_10m: [350, 355, 5],
            weather_code: [3, 3, 71],
          },
          daily: {
            time: ['2026-11-15'],
            temperature_2m_max: [25],
            temperature_2m_min: [15],
          },
        },
      ],
      [null, { hourly: { time: ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-15T02:00'], us_aqi: [18, 20, 19], uv_index: [0, 1, 0] } }],
      subset,
      {
        mode: 'historical',
        source: 'open-meteo-archive',
        startDate: '2026-11-15',
        endDate: '2026-11-15',
        defaultFrameIndex: 1,
      },
    );

    expect(dataset.timelineHours).toEqual(['2026-11-15T00:00Z', '2026-11-15T01:00Z', '2026-11-15T02:00Z']);
    expect(dataset.states.AL?.current.temperatureF).toBe(62);
    expect(dataset.states.AK?.current.usAqi).toBe(20);
    expect(dataset.states.AK?.timeline[2]?.weatherCode).toBe(71);
  });

  test('builds city batch dataset for top 10 cities in a state', () => {
    const caCities = (TOP_CITIES_BY_STATE.CA ?? []).slice(0, 2);
    const result = buildCityBatchDataset(
      [
        {
          latitude: 34.05,
          longitude: -118.24,
          timezone: 'GMT',
          current: {
            time: '2026-11-24T12:00',
            temperature_2m: 72,
            relative_humidity_2m: 45,
            apparent_temperature: 71,
            precipitation: 0,
            weather_code: 1,
            wind_speed_10m: 6,
            wind_direction_10m: 260,
          },
          hourly: {
            time: ['2026-11-24T12:00'],
            temperature_2m: [72],
            relative_humidity_2m: [45],
            precipitation: [0],
            wind_speed_10m: [6],
            wind_direction_10m: [260],
            weather_code: [1],
          },
          daily: {
            time: ['2026-11-24'],
            temperature_2m_max: [76],
            temperature_2m_min: [58],
          },
        },
        {
          latitude: 32.72,
          longitude: -117.16,
          timezone: 'GMT',
          current: {
            time: '2026-11-24T12:00',
            temperature_2m: 69,
            relative_humidity_2m: 60,
            apparent_temperature: 69,
            precipitation: 0,
            weather_code: 2,
            wind_speed_10m: 9,
            wind_direction_10m: 280,
          },
          hourly: {
            time: ['2026-11-24T12:00'],
            temperature_2m: [69],
            relative_humidity_2m: [60],
            precipitation: [0],
            wind_speed_10m: [9],
            wind_direction_10m: [280],
            weather_code: [2],
          },
          daily: {
            time: ['2026-11-24'],
            temperature_2m_max: [72],
            temperature_2m_min: [59],
          },
        },
      ],
      [{ current: { us_aqi: 44, pm2_5: 9.2, uv_index: 4 } }, null],
      caCities,
      { code: 'CA', name: 'California' },
      { mode: 'live', startDate: '2026-11-24', endDate: '2026-11-26' },
    );

    expect(result.code).toBe('CA');
    expect(result.cities).toHaveLength(2);
    expect(result.cities[0]?.name).toBe('Los Angeles');
    expect(result.cities[0]?.rank).toBe(1);
    expect(result.cities[0]?.current.temperatureF).toBe(72);
    expect(result.cities[0]?.current.usAqi).toBe(44);
    expect(result.cities[1]?.name).toBe('San Diego');
    expect(result.cities[1]?.current.windSpeedMph).toBe(9);
  });
});

describe('NWS Alerts & Radar Parsers', () => {
  test('groups NWS alerts by 2-letter state UGC codes and sorts by severity', () => {
    const parsed = parseNwsAlerts({
      features: [
        {
          id: 'a1',
          type: 'Feature',
          geometry: null,
          properties: {
            id: 'a1',
            event: 'Wind Advisory',
            severity: 'Minor',
            geocode: { UGC: ['CAZ006', 'PKZ999'] },
            areaDesc: 'San Francisco',
          },
        },
        {
          id: 'a2',
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          properties: {
            id: 'a2',
            event: 'Tornado Warning',
            severity: 'Extreme',
            geocode: { UGC: ['OKC109', 'CAZ006'] },
            areaDesc: 'Oklahoma County',
          },
        },
      ],
    });

    expect(parsed.totalActive).toBe(2);
    expect(parsed.byState.CA?.map((a) => a.event)).toEqual(['Tornado Warning', 'Wind Advisory']);
    expect(parsed.byState.OK).toHaveLength(1);
    expect(parsed.featuresGeoJson.features).toHaveLength(1);
  });

  test('parses NOAA WMS Capabilities timestamps and builds historical frames', () => {
    const xml = `<Dimension name="time" default="2026-11-25T02:30:00Z">2026-11-25T01:00:00Z,2026-11-25T01:15:00Z,2026-11-25T01:30:00Z,2026-11-25T02:00:00Z</Dimension>`;
    expect(parseNoaaCapabilitiesTimes(xml, 4)).toEqual([
      '2026-11-25T01:00:00Z',
      '2026-11-25T01:15:00Z',
      '2026-11-25T01:30:00Z',
      '2026-11-25T02:00:00Z',
    ]);

    const hist = buildHistoricalRadarFrames('2024-01-14T18:00:00Z', 6);
    expect(hist.frames).toHaveLength(6);
    expect(hist.frames[5]?.timestamp).toBe('2024-01-14T18:00:00Z');
  });

  test('formats units and WMO codes cleanly', () => {
    expect(Math.round(fToC(32))).toBe(0);
    expect(formatTemp(77, 'C', true)).toBe('25°C');
    expect(degToCompass(225)).toBe('SW');
    expect(getWmoInfo(95).category).toBe('thunderstorm');
  });
});
