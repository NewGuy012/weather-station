import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtremesBar } from '../src/client/components/ExtremesBar';
import { MapCanvas } from '../src/client/components/MapCanvas';
import { MetricToolbar } from '../src/client/components/MetricToolbar';
import { StateDrawer } from '../src/client/components/StateDrawer';
import { TopBar } from '../src/client/components/TopBar';
import { buildStateDetailCsv, buildStatesCsv } from '../src/client/utils/exporters';
import { MAP_HEIGHT, MAP_WIDTH, getUsStateGeometries } from '../src/client/utils/mapGeometry';
import {
  DEFAULT_ZOOM,
  INITIAL_MAP_VIEW,
  KEYBOARD_PAN_FAST_STEP_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  clampPan,
  clampZoom,
  computeStateFocusView,
  getArrowPanDelta,
  getWheelZoomFactor,
  getZoomShortcutAction,
  isEditableTarget,
  isInteractiveTarget,
  isSpaceKey,
  isViewModified,
  layoutCityMarkerOffsets,
  panByOffset,
  zoomViewState,
} from '../src/client/utils/mapViewport';
import {
  COLORMAPS,
  getNextColormapId,
  interpolateColor,
  resolveMetricStops,
  stopsToCssGradient,
} from '../src/client/utils/scales';
import seedHistorical from '../src/server/data/seedHistorical.json';
import { STATE_BY_CODE, US_STATES } from '../src/shared/states';
import { TOP_CITIES_BY_STATE } from '../src/shared/topCities';
import type {
  StateCitiesWeatherResponse,
  StateDetailResponse,
  WeatherDatasetResponse,
} from '../src/shared/types';

const STAGE = { width: 1000, height: 625 };

describe('Map Viewport & Shortcut Helpers', () => {
  test('clamps zoom/pan, focuses states, and handles shortcuts & label placement', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(20)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
    expect(clampPan({ x: 5000, y: -5000 }, 1, STAGE)).toEqual({ x: 550, y: -343.75 });
    expect(isViewModified(INITIAL_MAP_VIEW)).toBe(false);

    const panned = panByOffset(INITIAL_MAP_VIEW, 140, -60, STAGE);
    expect(isViewModified(panned)).toBe(true);
    expect(getWheelZoomFactor(-100, 0, false)).toBeGreaterThan(1.1);
    expect(zoomViewState(INITIAL_MAP_VIEW, 2, STAGE, { focalOffset: { x: 150, y: -100 } })).toEqual({
      zoom: 2,
      pan: { x: -150, y: 100 },
    });

    const pannedAt1x = { zoom: 1, pan: { x: -200, y: 50 } };
    const zoomedIn = zoomViewState(pannedAt1x, 2, STAGE, { preservePanAtMinZoom: true });
    expect(zoomViewState(zoomedIn, 1, STAGE, { preservePanAtMinZoom: true })).toEqual(pannedAt1x);
    expect(zoomViewState(zoomedIn, 1, STAGE, { preservePanAtMinZoom: false })).toEqual(INITIAL_MAP_VIEW);

    const geometries = getUsStateGeometries();
    expect(geometries).toHaveLength(50);
    const txGeo = geometries.find((g) => g.meta.code === 'TX')!;
    const txFocus = computeStateFocusView({
      bounds: txGeo.bounds,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      stageSize: STAGE,
      viewportSize: { width: 1280, height: 700 },
      rightInsetPx: 436,
    });
    expect(txFocus.zoom).toBeGreaterThanOrEqual(1.6);

    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isInteractiveTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(true);
    expect(isSpaceKey({ key: ' ', code: 'Space' })).toBe(true);
    expect(getArrowPanDelta({ key: 'ArrowUp', shiftKey: true })).toEqual({
      x: 0,
      y: KEYBOARD_PAN_FAST_STEP_PX,
    });
    expect(getZoomShortcutAction({ key: '0' })).toBe('reset');
    expect(getZoomShortcutAction({ key: '=', metaKey: true })).toBeNull();

    const offsets = layoutCityMarkerOffsets([
      { id: 'Los Angeles', screenX: 200, screenY: 300, boxWidth: 100, boxHeight: 20 },
      { id: 'Long Beach', screenX: 204, screenY: 305, boxWidth: 100, boxHeight: 20 },
    ]);
    expect(offsets['Los Angeles']).not.toEqual(offsets['Long Beach']);
  });
});

describe('Colormaps, CSV Exporters & UI Smoke Tests', () => {
  test('resolves colormaps and exports sanitized CSVs', () => {
    const viridis = resolveMetricStops('temperature', 'viridis', false);
    const reversed = resolveMetricStops('temperature', 'viridis', true);
    expect(viridis[0]?.rgb).toEqual([68, 1, 84]);
    expect(reversed[0]?.rgb).toEqual([253, 231, 37]);
    expect(interpolateColor(0, resolveMetricStops('precipitation', 'default', true), true, true)).toBe(
      'rgb(24, 34, 52)',
    );
    expect(getNextColormapId(COLORMAPS[COLORMAPS.length - 1]!.id)).toBe('default');

    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const csvLines = buildStatesCsv(dataset, 'F', 30, true).split('\n');
    expect(csvLines).toHaveLength(51);
    expect(csvLines[1]).toContain('AL,Alabama,Birmingham');

    const mockDetail: StateDetailResponse = {
      mode: 'historical',
      code: 'CA',
      name: 'California',
      city: ' =CMD()',
      lat: 34.05,
      lon: -118.24,
      elevationM: 87,
      timezone: 'America/Los_Angeles',
      fetchedAt: '2026-11-18T18:00:00Z',
      cached: true,
      startDate: '2026-11-15',
      endDate: '2026-11-15',
      current: dataset.states.CA!.current,
      hourly: [
        {
          time: '|calc',
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
    const detailCsv = buildStateDetailCsv(mockDetail, 'C').split('\n');
    expect(detailCsv[1]).toContain("CA,' =CMD(),'|calc,-21,");
  });

  test('renders core UI views without errors', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const caCitiesWeather: StateCitiesWeatherResponse = {
      mode: 'historical',
      code: 'CA',
      name: 'California',
      cached: true,
      fetchedAt: '2026-11-24T12:00:00Z',
      startDate: '2026-11-15',
      endDate: '2026-11-19',
      timelineHours: dataset.timelineHours,
      cities: (TOP_CITIES_BY_STATE.CA ?? []).map((c) => ({
        ...c,
        timezone: 'UTC',
        current: dataset.states.CA!.current,
        timeline: dataset.states.CA!.timeline,
      })),
    };

    const topBarHtml = renderToStaticMarkup(
      createElement(TopBar, {
        mode: 'historical',
        onModeChange: () => {},
        unit: 'F',
        onUnitChange: () => {},
        theme: 'dark',
        onThemeToggle: () => {},
        startDate: '2026-11-15',
        endDate: '2026-11-19',
        activePresetId: 'recent-nov-2026',
        onSelectPreset: () => {},
        onSelectCustomDates: () => {},
        statesMeta: US_STATES,
        onSelectState: () => {},
        onRefresh: () => {},
        onOpenExport: () => {},
        isLoading: false,
        sourceLabel: 'Recent 5-Day US Archive',
      }),
    );
    expect(topBarHtml).toContain('US Weather Station');
    expect(topBarHtml).toMatch(
      /<h1[^>]*class="[^"]*whitespace-nowrap[^"]*"[^>]*>US Weather Station<\/h1>/,
    );
    expect(topBarHtml).not.toMatch(
      /<h1[^>]*class="[^"]*truncate[^"]*"[^>]*>US Weather Station<\/h1>/,
    );

    expect(
      renderToStaticMarkup(
        createElement(ExtremesBar, {
          states: dataset.states,
          unit: 'F',
          timelineIndex: 0,
          useTimeline: true,
          onSelectState: () => {},
          dockedToDrawer: true,
        }),
      ),
    ).toContain('National weather extremes');

    expect(
      renderToStaticMarkup(
        createElement(MetricToolbar, {
          metric: 'temperature',
          onMetricChange: () => {},
          colormap: 'viridis',
          onColormapChange: () => {},
          reverseColormap: false,
          onToggleReverseColormap: () => {},
          unit: 'F',
          mode: 'historical',
          showRadar: false,
          onToggleRadar: () => {},
          showWind: false,
          onToggleWind: () => {},
          showAlertPolygons: false,
          onToggleAlertPolygons: () => {},
          alertsCount: 0,
          canResetView: true,
          onResetView: () => {},
        }),
      ),
    ).toContain(stopsToCssGradient(resolveMetricStops('temperature', 'viridis', false)));

    const mapHtml = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        colormap: 'plasma',
        unit: 'F',
        isDark: true,
        timelineIndex: 0,
        useTimeline: true,
        selectedCode: 'CA',
        onSelectState: () => {},
        detailedStateMode: true,
        onToggleDetailedStateMode: () => {},
        stateCitiesWeather: caCitiesWeather,
        selectedCity: 'San Jose',
        onSelectCity: () => {},
      }),
    );
    expect(mapHtml).toContain('3. San Jose');

    const drawerHtml = renderToStaticMarkup(
      createElement(StateDrawer, {
        meta: STATE_BY_CODE.CA!,
        snapshot: dataset.states.CA!,
        detail: {
          mode: 'historical',
          code: 'CA',
          name: 'California',
          city: 'San Jose',
          lat: 37.34,
          lon: -121.89,
          elevationM: 87,
          timezone: 'America/Los_Angeles',
          fetchedAt: dataset.fetchedAt,
          cached: true,
          startDate: '2026-11-15',
          endDate: '2026-11-19',
          current: dataset.states.CA!.current,
          hourly: [],
          daily: [],
          alerts: [],
        },
        isLoading: false,
        mode: 'historical',
        unit: 'F',
        metric: 'temperature',
        timelineIndex: 0,
        useTimeline: true,
        selectedCity: 'San Jose',
        onSelectCity: () => {},
        compareCodes: ['TX'],
        onToggleCompare: () => {},
        allStates: dataset.states,
        onSelectState: () => {},
        onPrintState: () => {},
        onClose: () => {},
        detailedStateMode: true,
        onToggleDetailedStateMode: () => {},
        citiesWeather: caCitiesWeather,
      }),
    );
    expect(drawerHtml).toContain('California');
    expect(drawerHtml).toContain('Elev 87m • America/Los_Angeles');
    expect(drawerHtml).not.toMatch(/<span[^>]*class="[^"]*truncate[^"]*"[^>]*>Elev 87m/);
    expect(drawerHtml).not.toMatch(/<select[^>]*class="[^"]*truncate[^"]*"/);
    expect(drawerHtml).toContain('Compare States (1/3)');
    expect(drawerHtml).toMatch(/value="San Jose"[^>]*selected=""/);
  });
});
