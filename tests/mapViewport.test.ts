import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapCanvas } from '../src/client/components/MapCanvas';
import { MetricToolbar } from '../src/client/components/MetricToolbar';
import { StateDrawer } from '../src/client/components/StateDrawer';
import { TopBar } from '../src/client/components/TopBar';
import {
  COLORMAPS,
  getNextColormapId,
  interpolateColor,
  resolveMetricStops,
  stopsToCssGradient,
} from '../src/client/utils/scales';
import seedHistorical from '../src/server/data/seedHistorical.json';
import { STATE_BY_CODE } from '../src/server/data/states';
import { TOP_CITIES_BY_STATE } from '../src/server/data/topCities';
import type { StateCitiesWeatherResponse, WeatherDatasetResponse } from '../src/shared/types';
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

const STAGE = { width: 1000, height: 625 };

describe('Map Viewport Pan & Zoom Helpers', () => {
  test('clamps zoom within allowed bounds', () => {
    expect(clampZoom(0.2)).toBe(MIN_ZOOM);
    expect(clampZoom(0.75)).toBe(0.75);
    expect(clampZoom(1)).toBe(DEFAULT_ZOOM);
    expect(clampZoom(2.345)).toBe(2.35);
    expect(clampZoom(20)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
  });

  test('clamps pan offset within stage bounds proportional to zoom', () => {
    expect(clampPan({ x: 120, y: -80 }, 1, STAGE)).toEqual({ x: 120, y: -80 });
    expect(clampPan({ x: 5000, y: -5000 }, 1, STAGE)).toEqual({ x: 550, y: -343.75 });
    expect(clampPan({ x: -1200, y: 800 }, 2, STAGE)).toEqual({ x: -1100, y: 687.5 });
  });

  test('pans by relative offsets and tracks view modification state', () => {
    expect(isViewModified(INITIAL_MAP_VIEW)).toBe(false);

    const panned = panByOffset(INITIAL_MAP_VIEW, 140, -60, STAGE);
    expect(panned).toEqual({ zoom: 1, pan: { x: 140, y: -60 } });
    expect(isViewModified(panned)).toBe(true);

    const zoomedIn = zoomViewState(INITIAL_MAP_VIEW, 1.25, STAGE);
    expect(isViewModified(zoomedIn)).toBe(true);

    const zoomedOut = zoomViewState(INITIAL_MAP_VIEW, 0.75, STAGE);
    expect(zoomedOut).toEqual({ zoom: 0.75, pan: { x: 0, y: 0 } });
    expect(isViewModified(zoomedOut)).toBe(true);
  });

  test('computes smooth wheel and pinch zoom factors', () => {
    expect(getWheelZoomFactor(0, 0, false)).toBe(1);
    expect(getWheelZoomFactor(-100, 0, false)).toBeGreaterThan(1.1);
    expect(getWheelZoomFactor(100, 0, false)).toBeLessThan(0.9);
    expect(getWheelZoomFactor(-10, 0, true)).toBeGreaterThan(1.05);
  });

  test('preserves pan at 1x zoom when preservePanAtMinZoom is enabled', () => {
    const pannedAt1x = { zoom: 1, pan: { x: -200, y: 50 } };
    const zoomedIn = zoomViewState(pannedAt1x, 2, STAGE, { preservePanAtMinZoom: true });
    expect(zoomedIn).toEqual({ zoom: 2, pan: { x: -400, y: 100 } });

    const zoomedOutPreserved = zoomViewState(zoomedIn, 1, STAGE, {
      preservePanAtMinZoom: true,
    });
    expect(zoomedOutPreserved).toEqual({ zoom: 1, pan: { x: -200, y: 50 } });

    const zoomedOutAutoReset = zoomViewState(zoomedIn, 1, STAGE, {
      preservePanAtMinZoom: false,
    });
    expect(zoomedOutAutoReset).toEqual(INITIAL_MAP_VIEW);
  });

  test('zooms toward a non-zero focal point accurately', () => {
    const zoomed = zoomViewState(INITIAL_MAP_VIEW, 2, STAGE, {
      focalOffset: { x: 150, y: -100 },
    });
    expect(zoomed).toEqual({ zoom: 2, pan: { x: -150, y: 100 } });
  });

  test('computes focus view for large and small states with drawer inset', () => {
    const geometries = getUsStateGeometries();
    expect(geometries).toHaveLength(50);

    const tx = geometries.find((g) => g.meta.code === 'TX')!;
    const ri = geometries.find((g) => g.meta.code === 'RI')!;
    const ak = geometries.find((g) => g.meta.code === 'AK')!;

    const txFocus = computeStateFocusView({
      bounds: tx.bounds,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      stageSize: STAGE,
      viewportSize: { width: 1280, height: 700 },
      rightInsetPx: 436,
    });
    expect(txFocus.zoom).toBeGreaterThanOrEqual(1.6);
    expect(txFocus.zoom).toBeLessThan(5);

    const riFocus = computeStateFocusView({
      bounds: ri.bounds,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      stageSize: STAGE,
      viewportSize: { width: 1280, height: 700 },
      rightInsetPx: 436,
    });
    expect(riFocus.zoom).toBeGreaterThan(6);
    expect(riFocus.zoom).toBeLessThanOrEqual(MAX_ZOOM);

    const akFocus = computeStateFocusView({
      bounds: ak.bounds,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      stageSize: STAGE,
      viewportSize: { width: 1280, height: 700 },
      rightInsetPx: 436,
    });
    expect(akFocus.zoom).toBeGreaterThanOrEqual(1.6);
    // AK is on the bottom-left of the map, so pan shifts right (+x) and up (-y)
    expect(akFocus.pan.x).toBeGreaterThan(0);
    expect(akFocus.pan.y).toBeLessThan(0);
  });
});

describe('Map Shortcut Target Guards & Arrow Panning', () => {
  test('detects editable and interactive targets safely', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);

    expect(isInteractiveTarget({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(true);
    expect(isInteractiveTarget({ tagName: 'A' } as unknown as EventTarget)).toBe(true);
    expect(
      isInteractiveTarget({
        tagName: 'SPAN',
        closest: (sel: string) => (sel.includes('button') ? {} : null),
      } as unknown as EventTarget),
    ).toBe(true);
    expect(isInteractiveTarget({ tagName: 'PATH' } as unknown as EventTarget)).toBe(false);
  });

  test('recognizes Space key and maps arrow keys to pan deltas', () => {
    expect(isSpaceKey({ key: ' ', code: 'Space' })).toBe(true);
    expect(isSpaceKey({ key: 'Spacebar', code: 'Space' })).toBe(true);
    expect(isSpaceKey({ key: 'p', code: 'KeyP' })).toBe(false);

    expect(getArrowPanDelta({ key: 'ArrowRight' })).toEqual({ x: -KEYBOARD_PAN_STEP_PX, y: 0 });
    expect(getArrowPanDelta({ key: 'ArrowLeft' })).toEqual({ x: KEYBOARD_PAN_STEP_PX, y: 0 });
    expect(getArrowPanDelta({ key: 'ArrowDown' })).toEqual({ x: 0, y: -KEYBOARD_PAN_STEP_PX });
    expect(getArrowPanDelta({ key: 'ArrowUp', shiftKey: true })).toEqual({
      x: 0,
      y: KEYBOARD_PAN_FAST_STEP_PX,
    });
    expect(getArrowPanDelta({ key: 'Enter' })).toBeNull();
  });

  test('maps zoom keyboard shortcuts while respecting modifier keys', () => {
    expect(getZoomShortcutAction({ key: '+' })).toBe('in');
    expect(getZoomShortcutAction({ key: '=' })).toBe('in');
    expect(getZoomShortcutAction({ key: '-' })).toBe('out');
    expect(getZoomShortcutAction({ key: '_' })).toBe('out');
    expect(getZoomShortcutAction({ key: '0' })).toBe('reset');
    expect(getZoomShortcutAction({ key: '=', metaKey: true })).toBeNull();
    expect(getZoomShortcutAction({ key: '-', ctrlKey: true })).toBeNull();
    expect(getZoomShortcutAction({ key: '0', altKey: true })).toBeNull();
  });
});

describe('MapCanvas Pan & Zoom Controls Markup', () => {
  test('renders pan and zoom controls horizontally on the top-left away from the right drawer', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const htmlDefault = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        unit: 'F',
        isDark: false,
        timelineIndex: 0,
        useTimeline: true,
        selectedCode: null,
        onSelectState: () => {},
      }),
    );

    expect(htmlDefault).toContain('aria-label="Enable pan mode"');
    expect(htmlDefault).toContain('aria-pressed="false"');
    expect(htmlDefault).toContain('>P</kbd>');
    expect(htmlDefault).toContain('aria-label="Zoom in map"');
    expect(htmlDefault).toContain('>+<');
    expect(htmlDefault).toContain('100%');
    expect(htmlDefault).toContain('aria-label="Zoom out map"');
    expect(htmlDefault).toContain('>-<');
    expect(htmlDefault).toContain('top-4 left-3');
    expect(htmlDefault).not.toContain('right-4');
    expect(htmlDefault).not.toContain('lg:right-[444px]');

    const htmlSelected = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        unit: 'F',
        isDark: true,
        timelineIndex: 0,
        useTimeline: true,
        selectedCode: 'CA',
        onSelectState: () => {},
      }),
    );

    expect(htmlSelected).toContain('top-4 left-3');
    expect(htmlSelected).not.toContain('right-4');
    expect(htmlSelected).not.toContain('lg:right-[444px]');
  });

  test('places nearby city marker labels without colliding at identical positions', () => {
    const offsets = layoutCityMarkerOffsets([
      { id: 'Los Angeles', screenX: 200, screenY: 300, boxWidth: 100, boxHeight: 20 },
      { id: 'Long Beach', screenX: 204, screenY: 305, boxWidth: 100, boxHeight: 20 },
      { id: 'Anaheim', screenX: 210, screenY: 302, boxWidth: 90, boxHeight: 20 },
    ]);

    expect(offsets['Los Angeles']).toBeDefined();
    expect(offsets['Long Beach']).toBeDefined();
    expect(offsets['Anaheim']).toBeDefined();
    // Adjacent dense cities pick distinct anchor directions
    expect(offsets['Los Angeles']).not.toEqual(offsets['Long Beach']);
  });

  test('renders Detailed State Mode toggle, prompt, city markers, and StateDrawer Top 10 list', () => {
    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const caCitiesMeta = TOP_CITIES_BY_STATE.CA ?? [];
    const caCitiesWeather: StateCitiesWeatherResponse = {
      mode: 'historical',
      code: 'CA',
      name: 'California',
      cached: true,
      fetchedAt: '2026-11-24T12:00:00Z',
      startDate: '2024-01-12',
      endDate: '2024-01-16',
      timelineHours: dataset.timelineHours,
      cities: caCitiesMeta.map((c) => ({
        rank: c.rank,
        name: c.name,
        population: c.population,
        lat: c.lat,
        lon: c.lon,
        timezone: 'UTC',
        current: dataset.states.CA!.current,
        timeline: dataset.states.CA!.timeline,
      })),
    };

    const mapArmedHtml = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        unit: 'F',
        isDark: false,
        timelineIndex: 0,
        useTimeline: true,
        selectedCode: null,
        onSelectState: () => {},
        detailedStateMode: true,
        onToggleDetailedStateMode: () => {},
      }),
    );
    expect(mapArmedHtml).toContain('aria-label="Disable detailed state mode"');
    expect(mapArmedHtml).toContain('>D</kbd>');
    expect(mapArmedHtml).toContain('Click any state to zoom &amp; load top 10 cities');

    const mapFocusedHtml = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        unit: 'F',
        isDark: false,
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
    expect(mapFocusedHtml).toContain('1. Los Angeles');
    expect(mapFocusedHtml).toContain('3. San Jose');
    expect(mapFocusedHtml).toContain('10. Anaheim');

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
    expect(drawerHtml).toContain('Top 10 Populated Cities');
    expect(drawerHtml).toContain('Los Angeles');
    expect(drawerHtml).toContain('3.82M');
    expect(drawerHtml).toContain('San Jose');
    expect(drawerHtml).toContain('Anaheim');

    // StateDrawer header should use a city dropdown and not truncate state name, city name, or Top 10 city names
    const headerSlice = drawerHtml.slice(0, drawerHtml.indexOf('Top 10 Populated Cities'));
    expect(headerSlice).toContain('California');
    expect(headerSlice).toContain('aria-label="Select city"');
    expect(headerSlice).toContain('<option');
    expect(headerSlice).toContain('Los Angeles');
    expect(headerSlice).toMatch(/value="San Jose"[^>]*selected=""/);
    expect(headerSlice).toContain('Print');
    expect(headerSlice).not.toContain('truncate');
    expect(drawerHtml).not.toContain('class="truncate font-medium"');

    // Standard view uses the compact city dropdown instead of multi-row city pills
    const standardDrawerHtml = renderToStaticMarkup(
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
        selectedCity: 'San Francisco',
        onSelectCity: () => {},
        compareCodes: [],
        onToggleCompare: () => {},
        allStates: dataset.states,
        onSelectState: () => {},
        onPrintState: () => {},
        onClose: () => {},
        detailedStateMode: false,
        onToggleDetailedStateMode: () => {},
      }),
    );
    expect(standardDrawerHtml).toContain('aria-label="Select city"');
    expect(standardDrawerHtml).toContain('value="Los Angeles"');
    expect(standardDrawerHtml).toMatch(/value="San Francisco"[^>]*selected=""/);
    expect(standardDrawerHtml).toContain('value="Sacramento"');
    expect(standardDrawerHtml).toContain('value="San Diego"');
  });

  test('renders TopBar on a single non-wrapping row with unit, theme, and Print / Export controls', () => {
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
        statesMeta: Object.values(STATE_BY_CODE),
        onSelectState: () => {},
        onRefresh: () => {},
        onOpenExport: () => {},
        isLoading: false,
        sourceLabel: 'Recent 5-Day US Archive',
      }),
    );

    expect(topBarHtml).toContain('flex-nowrap');
    expect(topBarHtml).not.toContain('flex-wrap');
    expect(topBarHtml).toContain('°F');
    expect(topBarHtml).toContain('°C');
    expect(topBarHtml).toContain('Switch to light theme');
    expect(topBarHtml).toContain('Print / Export');
  });

  test('resolves custom and reversed colormaps and applies them to MetricToolbar and MapCanvas', () => {
    const defaultStops = resolveMetricStops('temperature', 'default', false);
    const viridisStops = resolveMetricStops('temperature', 'viridis', false);
    const viridisReversed = resolveMetricStops('temperature', 'viridis', true);

    expect(viridisStops[0]?.rgb).toEqual([68, 1, 84]);
    expect(viridisStops[viridisStops.length - 1]?.rgb).toEqual([253, 231, 37]);
    expect(viridisStops[0]?.label).toBe('0°');
    expect(viridisStops[viridisStops.length - 1]?.label).toBe('105°+');
    expect(viridisReversed[0]?.rgb).toEqual([253, 231, 37]);
    expect(viridisReversed[viridisReversed.length - 1]?.rgb).toEqual([68, 1, 84]);
    expect(interpolateColor(0, viridisStops, false)).toBe('rgb(68, 1, 84)');
    expect(interpolateColor(0, defaultStops, false)).toBe('rgb(30, 58, 138)');
    expect(getNextColormapId('default')).toBe(COLORMAPS[1]!.id);
    expect(getNextColormapId(COLORMAPS[COLORMAPS.length - 1]!.id)).toBe('default');

    const toolbarViridisHtml = renderToStaticMarkup(
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
      }),
    );

    expect(toolbarViridisHtml).toContain('Viridis');
    expect(toolbarViridisHtml).toContain('Flip');
    expect(toolbarViridisHtml).toContain('aria-label="Change colormap (current: Viridis)"');
    expect(toolbarViridisHtml).toContain(stopsToCssGradient(viridisStops));

    const dataset = seedHistorical as unknown as WeatherDatasetResponse;
    const mapDefaultHtml = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        colormap: 'default',
        unit: 'F',
        isDark: true,
        timelineIndex: 0,
        useTimeline: true,
        selectedCode: null,
        onSelectState: () => {},
      }),
    );
    const mapPlasmaHtml = renderToStaticMarkup(
      createElement(MapCanvas, {
        states: dataset.states,
        metric: 'temperature',
        colormap: 'plasma',
        unit: 'F',
        isDark: true,
        timelineIndex: 0,
        useTimeline: true,
        selectedCode: null,
        onSelectState: () => {},
      }),
    );
    expect(mapPlasmaHtml).not.toBe(mapDefaultHtml);
  });
});
