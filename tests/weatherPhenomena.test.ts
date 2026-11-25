import { describe, expect, test } from 'bun:test';
import seedHistorical from '../src/server/data/seedHistorical.json';
import type { WeatherAlert, WeatherDatasetResponse } from '../src/shared/types';
import {
  buildCityShowcasePhenomena,
  buildShowcasePhenomena,
  classifyWeatherPhenomenon,
  hasActiveMapFx,
} from '../src/shared/weatherPhenomena';

function makeAlert(event: string, severity: WeatherAlert['severity'] = 'Severe'): WeatherAlert {
  return {
    id: `alert-${event}`,
    event,
    severity,
    urgency: 'Immediate',
    headline: event,
    description: event,
    instruction: null,
    effective: '2026-11-25T00:00:00Z',
    expires: '2026-11-25T06:00:00Z',
    areaDesc: 'Test County',
    states: ['TX'],
  };
}

describe('Weather Phenomena Classifier', () => {
  test('classifies core WMO precipitation, fog, hail, and thunderstorm codes', () => {
    expect(
      classifyWeatherPhenomenon({
        weatherCode: 63,
        precipitationMm: 2.5,
        temperatureF: 58,
        windSpeedMph: 12,
        windDirectionDeg: 225,
      }).phenomenon,
    ).toBe('rain');

    expect(
      classifyWeatherPhenomenon({
        weatherCode: 51,
        precipitationMm: 0.2,
        temperatureF: 52,
        windSpeedMph: 6,
        windDirectionDeg: 180,
      }).phenomenon,
    ).toBe('drizzle');

    expect(
      classifyWeatherPhenomenon({
        weatherCode: 45,
        precipitationMm: 0,
        temperatureF: 44,
        windSpeedMph: 3,
        windDirectionDeg: 90,
      }).phenomenon,
    ).toBe('fog');

    expect(
      classifyWeatherPhenomenon({
        weatherCode: 95,
        precipitationMm: 4.0,
        temperatureF: 74,
        windSpeedMph: 20,
        windDirectionDeg: 200,
      }).phenomenon,
    ).toBe('thunderstorm');

    const hail = classifyWeatherPhenomenon({
      weatherCode: 99,
      precipitationMm: 8.0,
      temperatureF: 70,
      windSpeedMph: 25,
      windDirectionDeg: 210,
    });
    expect(hail.phenomenon).toBe('hail');
    expect(hail.isSevere).toBe(true);
    expect(hail.strength).toBe(1);
  });

  test('upgrades ERA5 historical telemetry to blizzard, freezing-rain, thunderstorm, and cyclone', () => {
    // Blizzard: snow WMO + high wind
    expect(
      classifyWeatherPhenomenon({
        weatherCode: 73,
        precipitationMm: 1.5,
        temperatureF: 18,
        windSpeedMph: 28,
        windDirectionDeg: 310,
      }).phenomenon,
    ).toBe('blizzard');

    // Calm snow stays snow
    expect(
      classifyWeatherPhenomenon({
        weatherCode: 73,
        precipitationMm: 1.5,
        temperatureF: 24,
        windSpeedMph: 9,
        windDirectionDeg: 310,
      }).phenomenon,
    ).toBe('snow');

    // Freezing rain: sub-freezing rain in ERA5
    expect(
      classifyWeatherPhenomenon({
        weatherCode: 61,
        precipitationMm: 1.2,
        temperatureF: 29,
        windSpeedMph: 14,
        windDirectionDeg: 30,
      }).phenomenon,
    ).toBe('freezing-rain');

    // Convective thunderstorm in warm heavy ERA5 rain
    expect(
      classifyWeatherPhenomenon({
        weatherCode: 65,
        precipitationMm: 7.2,
        temperatureF: 76,
        windSpeedMph: 18,
        windDirectionDeg: 190,
      }).phenomenon,
    ).toBe('thunderstorm');

    // Cyclonic storm (Superstorm Sandy signature: heavy rain + >= 34 mph gale)
    const cyclone = classifyWeatherPhenomenon({
      weatherCode: 65,
      precipitationMm: 9.0,
      temperatureF: 55,
      windSpeedMph: 45,
      windDirectionDeg: 120,
    });
    expect(cyclone.phenomenon).toBe('cyclone');
    expect(cyclone.isSevere).toBe(true);
  });

  test('applies live NWS alerts and metric-contextual dry phenomena accurately', () => {
    expect(
      classifyWeatherPhenomenon(
        {
          weatherCode: 3,
          precipitationMm: 0.4,
          temperatureF: 72,
          windSpeedMph: 22,
          windDirectionDeg: 180,
        },
        [makeAlert('Tornado Warning', 'Extreme')],
      ).phenomenon,
    ).toBe('cyclone');

    expect(
      classifyWeatherPhenomenon(
        {
          weatherCode: 63,
          precipitationMm: 3,
          temperatureF: 75,
          windSpeedMph: 24,
          windDirectionDeg: 210,
        },
        [makeAlert('Severe Thunderstorm Warning (Large Hail)', 'Severe')],
      ).phenomenon,
    ).toBe('hail');

    expect(
      classifyWeatherPhenomenon(
        {
          weatherCode: 0,
          precipitationMm: 0,
          temperatureF: 103,
          windSpeedMph: 6,
          windDirectionDeg: 180,
        },
        undefined,
        'temperature',
      ).phenomenon,
    ).toBe('heat');

    expect(
      classifyWeatherPhenomenon(
        {
          weatherCode: 0,
          precipitationMm: 0,
          temperatureF: -4,
          windSpeedMph: 12,
          windDirectionDeg: 350,
        },
        undefined,
        'temperature',
      ).phenomenon,
    ).toBe('frost');

    expect(
      classifyWeatherPhenomenon(
        {
          weatherCode: 0,
          precipitationMm: 0,
          temperatureF: 82,
          windSpeedMph: 5,
          windDirectionDeg: 250,
          usAqi: 165,
        },
        undefined,
        'aqi',
      ).phenomenon,
    ).toBe('aqi');

    expect(
      classifyWeatherPhenomenon(
        {
          weatherCode: 0,
          precipitationMm: 0,
          temperatureF: 88,
          windSpeedMph: 5,
          windDirectionDeg: 200,
          uvIndex: 10.5,
        },
        undefined,
        'uvIndex',
      ).phenomenon,
    ).toBe('uv');

    // In precipitation mode, dry overcast does not trigger rain clouds
    expect(hasActiveMapFx('cloudy', 'precipitation')).toBe(false);
    expect(hasActiveMapFx('cloudy', 'temperature')).toBe(true);
    expect(hasActiveMapFx('rain', 'precipitation')).toBe(true);
  });

  test('builds regional and city FX showcase covering every animated phenomenon', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const showcase = buildShowcasePhenomena(dataset.states);
    expect(Object.keys(showcase)).toHaveLength(50);

    const activeTypes = new Set(Object.values(showcase).map((s) => s.phenomenon));
    for (const expected of [
      'rain',
      'drizzle',
      'fog',
      'snow',
      'blizzard',
      'freezing-rain',
      'thunderstorm',
      'hail',
      'cyclone',
      'heat',
      'frost',
      'uv',
      'aqi',
    ] as const) {
      expect(activeTypes.has(expected)).toBe(true);
    }

    const cityShowcase = buildCityShowcasePhenomena([
      { rank: 1, name: 'Los Angeles' },
      { rank: 2, name: 'San Diego' },
      { rank: 3, name: 'San Jose' },
    ]);
    expect(Object.keys(cityShowcase)).toEqual(['Los Angeles', 'San Diego', 'San Jose']);
  });
});
