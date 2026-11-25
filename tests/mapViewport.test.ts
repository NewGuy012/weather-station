import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExtremesBar } from '../src/client/components/ExtremesBar';
import { MapCanvas } from '../src/client/components/MapCanvas';
import { MetricToolbar } from '../src/client/components/MetricToolbar';
import { StateDrawer } from '../src/client/components/StateDrawer';
import { TopBar } from '../src/client/components/TopBar';
import { MAP_HEIGHT, MAP_WIDTH, getUsStateGeometries } from '../src/client/utils/mapGeometry';
import {
  DEFAULT_ZOOM,
  INITIAL_MAP_VIEW,
  KEYBOARD_PAN_FAST_STEP_PX,
  KEYBOARD_PAN_STEP_PX,
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
import { TOP_CITIES_BY_STATE } from '../src/server/data/topCities';
import { STATE_BY_CODE, US_STATES } from '../src/shared/states';
import type { StateCitiesWeatherResponse, WeatherDatasetResponse } from '../src/shared/types';

const STAGE = { width: 1000, height: 625 };

describe('Map Viewport & Shortcut Helpers', () => {
  test('clamps zoom and pan bounds and tracks modifications', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(2.345)).toBe(2.35);
    expect(clampZoom(20)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);

    expect(clampPan({ x: 5000, y: -5000 }, 1, STAGE)).toEqual({ x: 550, y: -343.75 });
    expect(isViewModified(INITIAL_MAP_VIEW)).toBe(false);

    const panned = panByOffset(INITIAL_MAP_VIEW, 140, -60, STAGE);
    expect(panned).toEqual({ zoom: 1, pan: { x: 140, y: -60 } });
    expect(isViewModified(panned)).toBe(true);
  });

  test('zooms around focal points and preserves pan at 1x when requested', () => {
    expect(getWheelZoomFactor(0, 0, false)).toBe(1);
    expect(getWheelZoomFactor(-100, 0, false)).toBeGreaterThan(1.1);
    expect(getWheelZoomFactor(100, 0, false)).toBeLessThan(0.9);

    const zoomedFocal = zoomViewState(INITIAL_MAP_VIEW, 2, STAGE, { focalOffset: { x: 150, y: -100 } });
    expect(zoomedFocal).toEqual({ zoom: 2, pan: { x: -150, y: 100 } });

    const pannedAt1x = { zoom: 1, pan: { x: -200, y: 50 } };
    const zoomedIn = zoomViewState(pannedAt1x, 2, STAGE, { preservePanAtMinZoom: true });
    expect(zoomViewState(zoomedIn, 1, STAGE, { preservePanAtMinZoom: true })).toEqual(pannedAt1x);
    expect(zoomViewState(zoomedIn, 1, STAGE, { preservePanAtMinZoom: false })).toEqual(INITIAL_MAP_VIEW);
  });

  test('computes focus views for states with drawer inset', () => {
    const geometries = getUsStateGeometries();
    expect(geometries).toHaveLength(50);

    const focus = (code: string) => {
      const geo = geometries.find((g) => g.meta.code === code)!;
      return computeStateFocusView({
        bounds: geo.bounds,
        mapWidth: MAP_WIDTH,
        mapHeight: MAP_HEIGHT,
        stageSize: STAGE,
        viewportSize: { width: 1280, height: 700 },
        rightInsetPx: 436,
      });
    };

    const tx = focus('TX');
    expect(tx.zoom).toBeGreaterThanOrEqual(1.6);
    expect(tx.zoom).toBeLessThan(5);

    const ri = focus('RI');
    expect(ri.zoom).toBeGreaterThan(6);
    expect(ri.zoom).toBeLessThanOrEqual(MAX_ZOOM);

    const ak = focus('AK');
    expect(ak.pan.x).toBeGreaterThan(0);
    expect(ak.pan.y).toBeLessThan(0);
  });

  test('guards editable/interactive targets and maps keyboard shortcuts', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isInteractiveTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(true);
    expect(isInteractiveTarget({ tagName: 'PATH' } as unknown as EventTarget)).toBe(false);

    expect(isSpaceKey({ key: ' ', code: 'Space' })).toBe(true);
    expect(getArrowPanDelta({ key: 'ArrowUp', shiftKey: true })).toEqual({
      x: 0,
      y: KEYBOARD_PAN_FAST_STEP_PX,
    });
    expect(getArrowPanDelta({ key: 'ArrowRight' })).toEqual({ x: -KEYBOARD_PAN_STEP_PX, y: 0 });
    expect(getZoomShortcutAction({ key: '+' })).toBe('in');
    expect(getZoomShortcutAction({ key: '-' })).toBe('out');
    expect(getZoomShortcutAction({ key: '0' })).toBe('reset');
    expect(getZoomShortcutAction({ key: '=', metaKey: true })).toBeNull();
  });

  test('places nearby city marker labels without identical offsets', () => {
    const offsets = layoutCityMarkerOffsets([
      { id: 'Los Angeles', screenX: 200, screenY: 300, boxWidth: 100, boxHeight: 20 },
      { id: 'Long Beach', screenX: 204, screenY: 305, boxWidth: 100, boxHeight: 20 },
      { id: 'Anaheim', screenX: 210, screenY: 302, boxWidth: 90, boxHeight: 20 },
    ]);
    expect(offsets['Los Angeles']).not.toEqual(offsets['Long Beach']);
  });
});

describe('Colormaps & UI Render Smoke Tests', () => {
  test('resolves custom and reversed colormaps and applies dark calm-zero tinting', () => {
    const viridisStops = resolveMetricStops('temperature', 'viridis', false);
    const viridisReversed = resolveMetricStops('temperature', 'viridis', true);

    expect(viridisStops[0]?.rgb).toEqual([68, 1, 84]);
    expect(viridisStops[0]?.label).toBe('0°');
    expect(viridisReversed[0]?.rgb).toEqual([253, 231, 37]);
    expect(interpolateColor(0, viridisStops, false)).toBe('rgb(68, 1, 84)');
    expect(interpolateColor(0, resolveMetricStops('precipitation', 'default', true), true, true)).toBe(
      'rgb(24, 34, 52)',
    );
    expect(getNextColormapId('default')).toBe(COLORMAPS[1]!.id);
    expect(getNextColormapId(COLORMAPS[COLORMAPS.length - 1]!.id)).toBe('default');
  });

  test('renders TopBar, MetricToolbar, MapCanvas, and StateDrawer without errors', () => {
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
    expect(topBarHtml).toContain('Print / Export');

    const extremesHtml = renderToStaticMarkup(
      createElement(ExtremesBar, {
        states: dataset.states,
        unit: 'F',
        timelineIndex: 0,
        useTimeline: true,
        onSelectState: () => {},
        dockedToDrawer: true,
      }),
    );
    expect(extremesHtml).toContain('aria-label="National weather extremes"');
    expect(extremesHtml).toContain('xl:flex-row');
    expect(extremesHtml).toContain('min-[1440px]:w-[420px]');
    expect(extremesHtml).toContain('Warm');
    expect(extremesHtml).toContain('Cold');
    expect(extremesHtml).toContain('Wind');

    const toolbarHtml = renderToStaticMarkup(
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
    );
    expect(toolbarHtml).toContain('Viridis');
    expect(toolbarHtml).toContain('aria-label="Reset map view"');
    expect(toolbarHtml).toContain(stopsToCssGradient(resolveMetricStops('temperature', 'viridis', false)));

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
    expect(mapHtml).toContain('1. Los Angeles');
    expect(mapHtml).toContain('3. San Jose');
    expect(mapHtml).toContain('10. Anaheim');
    expect(mapHtml).not.toContain('Map navigation controls');
    expect(mapHtml).not.toContain('Enable pan mode');

    const drawerHtml = renderToStaticMarkup(
      createElement(StateDrawer, {
        meta: STATE_BY_CODE.CA!,
        snapshot: dataset.states.CA!,
        detail: null,
        isLoading: false,
        mode: 'historical',
        unit: 'F',
        metric: 'temperature',
        timelineIndex: 0,
        useTimeline: true,
        selectedCity: 'San Jose',
        onSelectCity: () => {},
        compareCodes: [],
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
    expect(drawerHtml).toContain('xl:bottom-14');
    expect(drawerHtml).toContain('Top 10 Populated Cities');
    expect(drawerHtml).toContain('Compare States (0/3)');
    expect(drawerHtml).toContain('Print');
    expect(drawerHtml).toMatch(/value="San Jose"[^>]*selected=""/);
    expect(drawerHtml).toMatch(
      /aria-label="Select city"[\s\S]*title="Print state weather report"[\s\S]*AQI &amp; UV[\s\S]*Top 10 Populated Cities[\s\S]*Compare States \(0\/3\)/,
    );

    const collapsedTop10DrawerHtml = renderToStaticMarkup(
      createElement(StateDrawer, {
        meta: STATE_BY_CODE.CA!,
        snapshot: dataset.states.CA!,
        detail: null,
        isLoading: false,
        mode: 'historical',
        unit: 'F',
        metric: 'temperature',
        timelineIndex: 0,
        useTimeline: true,
        selectedCity: 'Los Angeles',
        onSelectCity: () => {},
        compareCodes: ['TX'],
        onToggleCompare: () => {},
        allStates: dataset.states,
        onSelectState: () => {},
        onPrintState: () => {},
        onClose: () => {},
        detailedStateMode: false,
        onToggleDetailedStateMode: () => {},
        citiesWeather: caCitiesWeather,
      }),
    );
    expect(collapsedTop10DrawerHtml).toContain('Top 10 Populated Cities');
    expect(collapsedTop10DrawerHtml).not.toContain('Click city for chart');
    expect(collapsedTop10DrawerHtml).toContain('Compare States (1/3)');
    expect(collapsedTop10DrawerHtml).toContain('Pin California (CA)');
    expect(collapsedTop10DrawerHtml).toContain('TX');
  });
});
