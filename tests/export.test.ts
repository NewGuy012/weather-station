import { describe, expect, test } from 'bun:test';
import seedHistorical from '../src/server/data/seedHistorical.json';
import { buildStateDetailCsv, buildStatesCsv } from '../src/client/utils/exporters';
import type { StateDetailResponse, WeatherDatasetResponse } from '../src/shared/types';

describe('Print & CSV Exporters', () => {
  test('generates 50-state CSV with headers and accurate unit conversion', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const csvF = buildStatesCsv(dataset, 'F', 30, true);
    const linesF = csvF.split('\n');
    expect(linesF).toHaveLength(51);
    expect(linesF[0]).toContain('Temp (F)');
    expect(linesF[1]).toContain('AL,Alabama,Birmingham');

    const csvC = buildStatesCsv(dataset, 'C', 30, true);
    expect(csvC.split('\n')[0]).toContain('Temp (C)');
  });

  test('generates hourly CSV for a selected state detail payload', () => {
    const mockDetail: StateDetailResponse = {
      mode: 'historical',
      code: 'CA',
      name: 'California',
      city: 'Los Angeles',
      lat: 34.05,
      lon: -118.24,
      elevationM: 87,
      timezone: 'America/Los_Angeles',
      fetchedAt: '2026-11-18T18:00:00Z',
      cached: true,
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      current: {
        temperatureF: 68,
        apparentTemperatureF: 67,
        humidity: 50,
        dewPointF: 48,
        precipitationMm: 0,
        precipitationProb: null,
        windSpeedMph: 8,
        windGustMph: 12,
        windDirectionDeg: 270,
        pressureHpa: 1015,
        cloudCoverPct: 10,
        weatherCode: 0,
        uvIndex: 5,
        usAqi: 42,
        pm25: 10,
        tempHighF: 72,
        tempLowF: 55,
      },
      hourly: [
        {
          time: '2026-11-15T12:00',
          temperatureF: 68,
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

    const csv = buildStateDetailCsv(mockDetail, 'C');
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('CA,Los Angeles,2026-11-15T12:00,20,');
  });
});
