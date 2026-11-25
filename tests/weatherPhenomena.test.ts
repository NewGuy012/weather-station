import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BroadcastDock } from '../src/client/components/BroadcastDock';
import { DrawerWeatherBackdrop } from '../src/client/components/DrawerWeatherBackdrop';
import { MapCanvas } from '../src/client/components/MapCanvas';
import { WeatherEffectsOverlay } from '../src/client/components/WeatherEffectsOverlay';
import { WeatherIcon } from '../src/client/components/WeatherIcon';
import seedHistorical from '../src/server/data/seedHistorical.json';
import type { MetricLayer, WeatherAlert, WeatherDatasetResponse } from '../src/shared/types';
import {
  type PhenomenonTelemetry,
  buildCityShowcasePhenomena,
  buildShowcasePhenomena,
  classifyWeatherPhenomenon,
  hasActiveMapFx,
} from '../src/shared/weatherPhenomena';

function classify(
  overrides: Partial<PhenomenonTelemetry>,
  alerts?: WeatherAlert[],
  metric?: MetricLayer,
) {
  return classifyWeatherPhenomenon(
    {
      weatherCode: 0,
      precipitationMm: 0,
      temperatureF: 62,
      windSpeedMph: 6,
      windDirectionDeg: 225,
      ...overrides,
    },
    alerts,
    metric,
  );
}

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
  test('classifies WMO codes, ERA5 upgrades, prioritized alerts, and metric-contextual FX', () => {
    const cases: Array<[string, ReturnType<typeof classify>]> = [
      ['rain', classify({ weatherCode: 63, precipitationMm: 2.5 })],
      ['drizzle', classify({ weatherCode: 51, precipitationMm: 0.2 })],
      ['fog', classify({ weatherCode: 45 })],
      ['thunderstorm', classify({ weatherCode: 95, precipitationMm: 4, temperatureF: 74 })],
      ['hail', classify({ weatherCode: 99, precipitationMm: 8, temperatureF: 70 })],
      ['blizzard', classify({ weatherCode: 73, precipitationMm: 1.5, temperatureF: 18, windSpeedMph: 28 })],
      ['snow', classify({ weatherCode: 73, precipitationMm: 1.5, temperatureF: 24, windSpeedMph: 9 })],
      ['freezing-rain', classify({ weatherCode: 61, precipitationMm: 1.2, temperatureF: 29, windSpeedMph: 14 })],
      ['thunderstorm', classify({ weatherCode: 65, precipitationMm: 7.2, temperatureF: 76, windSpeedMph: 18 })],
      ['cyclone', classify({ weatherCode: 65, precipitationMm: 9, temperatureF: 55, windSpeedMph: 45 })],
      ['cyclone', classify({ weatherCode: 3 }, [makeAlert('Dense Fog Advisory', 'Minor'), makeAlert('Tornado Warning', 'Extreme')])],
      ['hail', classify({ weatherCode: 63, precipitationMm: 3 }, [makeAlert('Severe Thunderstorm Warning (Large Hail)')])],
      ['heat', classify({ temperatureF: 103 }, undefined, 'temperature')],
      ['frost', classify({ temperatureF: -4 }, undefined, 'temperature')],
      ['aqi', classify({ usAqi: 165 }, undefined, 'aqi')],
      ['uv', classify({ uvIndex: 10.5 }, undefined, 'uvIndex')],
    ];
    for (const [expected, result] of cases) {
      expect(result.phenomenon).toBe(expected as never);
    }

    expect(hasActiveMapFx('cloudy', 'precipitation')).toBe(false);
    expect(hasActiveMapFx('cloudy', 'temperature')).toBe(true);
    expect(hasActiveMapFx('rain', 'precipitation')).toBe(true);
  });

  test('builds regional and city FX showcase sets', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const showcase = buildShowcasePhenomena(dataset.states);
    expect(Object.keys(showcase)).toHaveLength(50);

    const activeTypes = new Set(Object.values(showcase).map((s) => s.phenomenon));
    for (const p of ['rain', 'fog', 'blizzard', 'hail', 'thunderstorm', 'cyclone', 'heat', 'frost', 'uv', 'aqi'] as const) {
      expect(activeTypes.has(p)).toBe(true);
    }

    const cityShowcase = buildCityShowcasePhenomena([
      { rank: 1, name: 'Los Angeles' },
      { rank: 2, name: 'San Diego' },
    ]);
    expect(Object.keys(cityShowcase)).toEqual(['Los Angeles', 'San Diego']);
  });
});

describe('Weather FX Rendering Smoke Tests', () => {
  test('renders WeatherIcon glyphs, DrawerWeatherBackdrop, overlay canvas, and FX controls', () => {
    const rainSvg = renderToStaticMarkup(createElement(WeatherIcon, { code: 63, animated: true }));
    expect(rainSvg).toContain('ws-anim-rain');
    const staticHailSvg = renderToStaticMarkup(createElement(WeatherIcon, { code: 99 }));
    expect(staticHailSvg).not.toContain('ws-anim-');

    const backdropHtml = renderToStaticMarkup(
      createElement(DrawerWeatherBackdrop, { phenomenon: 'thunderstorm' }),
    );
    expect(backdropHtml).toContain('ws-anim-sheet-flash');

    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    expect(
      renderToStaticMarkup(
        createElement(WeatherEffectsOverlay, {
          visible: false,
          states: dataset.states,
          metric: 'precipitation',
          timelineIndex: 30,
          useTimeline: true,
          isDark: false,
          showcase: false,
        }),
      ),
    ).toBe('');

    const visibleOverlayHtml = renderToStaticMarkup(
      createElement(WeatherEffectsOverlay, {
        visible: true,
        states: dataset.states,
        metric: 'precipitation',
        timelineIndex: 30,
        useTimeline: true,
        isDark: true,
        showcase: true,
      }),
    );
    expect(visibleOverlayHtml).toContain('width="1950"');

    const dockHtml = renderToStaticMarkup(
      createElement(BroadcastDock, {
        mode: 'historical',
        timelineHours: ['2026-11-15T00:00Z'],
        timelineIndex: 0,
        onTimelineChange: () => {},
        isTimelinePlaying: false,
        onToggleTimelinePlay: () => {},
        timelineSpeed: 1,
        onCycleTimelineSpeed: () => {},
        showRadar: false,
        radarFrames: [],
        radarFrameIndex: 0,
        onRadarFrameChange: () => {},
        isRadarPlaying: false,
        onToggleRadarPlay: () => {},
        radarOpacity: 0.75,
        onRadarOpacityChange: () => {},
        radarLoading: false,
        showWeatherFx: true,
        fxShowcase: true,
        onToggleFxShowcase: () => {},
      }),
    );
    expect(dockHtml).toContain('FX Showcase');

    const mapBadgesHtml = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'precipitation',
        unit: 'F',
        isDark: false,
        timelineIndex: 30,
        useTimeline: true,
        selectedCode: null,
        onSelectState: () => {},
        showWeatherFx: true,
        fxShowcase: true,
      }),
    );
    expect(mapBadgesHtml).toContain('ws-anim-vortex');
  });
});
