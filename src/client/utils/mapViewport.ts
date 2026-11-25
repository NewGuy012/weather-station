export const MIN_ZOOM = 0.5;
export const DEFAULT_ZOOM = 1;
export const MAX_ZOOM = 12;
export const ZOOM_BUTTON_STEP = 0.25;
export const DRAG_THRESHOLD_PX = 4;
export const KEYBOARD_PAN_STEP_PX = 40;
export const KEYBOARD_PAN_FAST_STEP_PX = 100;

export interface PanOffset {
  x: number;
  y: number;
}

export interface MapViewState {
  zoom: number;
  pan: PanOffset;
}

export interface StageSize {
  width: number;
  height: number;
}

export interface KeyLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

export const INITIAL_MAP_VIEW: MapViewState = {
  zoom: DEFAULT_ZOOM,
  pan: { x: 0, y: 0 },
};

/** Clamp zoom factor within [MIN_ZOOM, MAX_ZOOM] rounded to 2 decimal places. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(zoom.toFixed(2))));
}

/** Clamp pan translation so a usable portion of the map stage remains visible. */
export function clampPan(pan: PanOffset, zoom: number, stageSize: StageSize): PanOffset {
  const safeWidth = stageSize.width > 0 ? stageSize.width : 1000;
  const safeHeight = stageSize.height > 0 ? stageSize.height : 625;
  const maxX = Math.max(180, safeWidth * 0.55 * zoom);
  const maxY = Math.max(120, safeHeight * 0.55 * zoom);
  return {
    x: Math.min(maxX, Math.max(-maxX, Math.round(pan.x * 10) / 10)),
    y: Math.min(maxY, Math.max(-maxY, Math.round(pan.y * 10) / 10)),
  };
}

/**
 * Compute zoom and pan offset to frame a state's SVG bounding box inside the
 * visible portion of the map viewport (accounting for an optional right drawer inset).
 */
export function computeStateFocusView(params: {
  bounds: [[number, number], [number, number]];
  mapWidth: number;
  mapHeight: number;
  stageSize: StageSize;
  viewportSize: StageSize;
  rightInsetPx?: number;
}): MapViewState {
  const {
    bounds,
    mapWidth,
    mapHeight,
    stageSize,
    viewportSize,
    rightInsetPx = 0,
  } = params;
  const safeStageW = stageSize.width > 0 ? stageSize.width : 1000;
  const safeStageH = stageSize.height > 0 ? stageSize.height : 625;
  const safeVpW = viewportSize.width > 0 ? viewportSize.width : safeStageW;
  const safeVpH = viewportSize.height > 0 ? viewportSize.height : safeStageH;

  const [[x0, y0], [x1, y1]] = bounds;
  const boxW = Math.max(8, ((x1 - x0) / mapWidth) * safeStageW);
  const boxH = Math.max(8, ((y1 - y0) / mapHeight) * safeStageH);

  const availW = Math.max(220, safeVpW - rightInsetPx);
  const availH = Math.max(180, safeVpH);
  const fillRatio = 0.68;

  const zoomX = (availW * fillRatio) / boxW;
  const zoomY = (availH * fillRatio) / boxH;
  const zoom = clampZoom(Math.max(1.6, Math.min(MAX_ZOOM, zoomX, zoomY)));

  const centerSvgX = (x0 + x1) / 2;
  const centerSvgY = (y0 + y1) / 2;
  const localCx = (centerSvgX / mapWidth - 0.5) * safeStageW;
  const localCy = (centerSvgY / mapHeight - 0.5) * safeStageH;

  const targetCenterRelX = -rightInsetPx / 2;
  const pan = clampPan(
    {
      x: targetCenterRelX - zoom * localCx,
      y: -zoom * localCy,
    },
    zoom,
    { width: safeStageW, height: safeStageH },
  );

  return { zoom, pan };
}

/** Shift map view by a pixel delta and clamp within current zoom bounds. */
export function panByOffset(
  view: MapViewState,
  dx: number,
  dy: number,
  stageSize: StageSize,
): MapViewState {
  return {
    zoom: view.zoom,
    pan: clampPan({ x: view.pan.x + dx, y: view.pan.y + dy }, view.zoom, stageSize),
  };
}

/**
 * Transition to a new zoom level while keeping the focal point stationary.
 * Recenters pan at <= 1x zoom unless preservePanAtMinZoom is true (e.g. Pan mode active).
 */
export function zoomViewState(
  view: MapViewState,
  targetZoom: number,
  stageSize: StageSize,
  options: {
    focalOffset?: PanOffset;
    preservePanAtMinZoom?: boolean;
  } = {},
): MapViewState {
  const nextZoom = clampZoom(targetZoom);
  const { focalOffset = { x: 0, y: 0 }, preservePanAtMinZoom = false } = options;

  if (nextZoom <= DEFAULT_ZOOM && !preservePanAtMinZoom) {
    return { zoom: nextZoom, pan: { x: 0, y: 0 } };
  }

  const ratio = view.zoom > 0 ? nextZoom / view.zoom : 1;
  const nextPan: PanOffset = {
    x: focalOffset.x * (1 - ratio) + view.pan.x * ratio,
    y: focalOffset.y * (1 - ratio) + view.pan.y * ratio,
  };

  return {
    zoom: nextZoom,
    pan: clampPan(nextPan, nextZoom, stageSize),
  };
}

/** Compute multiplicative zoom factor from a wheel or trackpad pinch event. */
export function getWheelZoomFactor(deltaY: number, deltaMode: number, ctrlKey: boolean): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const normalizedDelta = deltaMode === 1 ? deltaY * 24 : deltaMode === 2 ? deltaY * 320 : deltaY;
  const sensitivity = ctrlKey ? 0.01 : 0.0012;
  const exponent = Math.min(0.18, Math.max(-0.18, -normalizedDelta * sensitivity));
  return Math.exp(exponent);
}

/** Returns true when zoom or pan differs from the default centered 1x view. */
export function isViewModified(view: MapViewState): boolean {
  return view.zoom !== DEFAULT_ZOOM || view.pan.x !== 0 || view.pan.y !== 0;
}

/** Returns true when the event target is an editable text/form control. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName?.toUpperCase();
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(el.isContentEditable)
  );
}

/** Returns true when Spacebar should trigger the focused UI control instead of panning. */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (isEditableTarget(target)) return true;
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; closest?: (selector: string) => unknown };
  const tag = el.tagName?.toUpperCase();
  if (tag === 'BUTTON' || tag === 'A') return true;
  if (typeof el.closest === 'function') {
    return Boolean(el.closest('button, a, [role="button"], [role="slider"]'));
  }
  return false;
}

export function isSpaceKey(e: KeyLike): boolean {
  return e.code === 'Space' || e.key === ' ';
}

/** Map directional arrow keys to screen-space pan deltas (camera moves in key direction). */
export function getArrowPanDelta(e: KeyLike): PanOffset | null {
  const step = e.shiftKey ? KEYBOARD_PAN_FAST_STEP_PX : KEYBOARD_PAN_STEP_PX;
  switch (e.key) {
    case 'ArrowUp':
      return { x: 0, y: step };
    case 'ArrowDown':
      return { x: 0, y: -step };
    case 'ArrowLeft':
      return { x: step, y: 0 };
    case 'ArrowRight':
      return { x: -step, y: 0 };
    default:
      return null;
  }
}

/** Map keyboard shortcut keys to zoom actions ('in', 'out', 'reset') or null. */
export function getZoomShortcutAction(e: KeyLike): 'in' | 'out' | 'reset' | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === '+' || e.key === '=') return 'in';
  if (e.key === '-' || e.key === '_') return 'out';
  if (e.key === '0') return 'reset';
  return null;
}
