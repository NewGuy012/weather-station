import { describe, expect, test } from 'bun:test';
import seedHistorical from '../src/server/data/seedHistorical.json';
import { buildStateDetailCsv, buildStatesCsv } from '../src/client/utils/exporters';
import type { StateDetailResponse, WeatherDatasetResponse } from '../src/shared/types';

describe('CSV Exporters', () => {
  test('generates 50-state CSV with headers and unit conversion', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const linesF = buildStatesCsv(dataset, 'F', 30, true).split('\n');
    expect(linesF).toHaveLength(51);
    expect(linesF[0]).toContain('Temp (F)');
    expect(linesF[1]).toContain('AL,Alabama,Birmingham');

    expect(buildStatesCsv(dataset, 'C', 30, true).split('\n')[0]).toContain('Temp (C)');
  });

  test('generates state hourly CSV and neutralizes spreadsheet formula prefixes', () => {
    const mockDetail: StateDetailResponse = {
      mode: 'historical',
      code: 'CA',
      name: 'California',
      city: '=CMD()',
      lat: 34.05,
      lon: -118.24,
      elevationM: 87,
      timezone: 'America/Los_Angeles',
      fetchedAt: '2026-11-18T18:00:00Z',
      cached: true,
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      current: seedHistorical.states.CA.current,
      hourly: [
        {
          time: '2026-11-15T12:00',
          temperatureF: -5,
          apparentTemperatureF: 67,
          dewPointF: 48,
          humidity: 50,
          precipitationMm: 0,
          precipitationProb: null,
          windSpeedMph: 8,
          windGustMph: 12,
          windDirectionDeg: 270,
          pressureHpa: 1015,
          cloudCoverPct: 10,
          uvIndex: 5,
          weatherCode: 0,
        },
      ],
      daily: [],
      alerts: [],
    };

    const lines = buildStateDetailCsv(mockDetail, 'C').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("CA,'=CMD(),2026-11-15T12:00,-21,");
  });
});
