import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapCanvas } from '../src/client/components/MapCanvas';
import seedHistorical from '../src/server/data/seedHistorical.json';
import type { WeatherDatasetResponse } from '../src/shared/types';
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
  test('renders pan and zoom controls with shortcut badges and shifts when drawer opens', () => {
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

    expect(htmlSelected).toContain('lg:right-[444px]');
  });
});
