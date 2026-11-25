import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ColormapId,
  GeoJsonFeatureCollection,
  MetricLayer,
  StateCitiesWeatherResponse,
  StateWeatherSnapshot,
  TempUnit,
  TopCityMeta,
  WeatherAlert,
} from '../../shared/types';
import { MAP_HEIGHT, MAP_WIDTH, getUsStateGeometries, usPathGen, usProjection } from '../utils/mapGeometry';
import {
  DEFAULT_ZOOM,
  DRAG_THRESHOLD_PX,
  INITIAL_MAP_VIEW,
  type MapViewState,
  type StageSize,
  ZOOM_BUTTON_STEP,
  clampPan,
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
} from '../utils/mapViewport';
import {
  METRIC_SCALES,
  type ResolvedStateSlice,
  interpolateColor,
  isColorLight,
  resolveMetricStops,
  resolveMetricValue,
  resolveStateSlice,
} from '../utils/scales';
import { HoverTooltip, PinnedStateTooltip } from './StateTooltip';
import { WeatherGlyph } from './WeatherIcon';
import {
  type WeatherPhenomenon,
  buildShowcasePhenomena,
  classifySnapshotPhenomenon,
  hasActiveMapFx,
} from '../../shared/weatherPhenomena';

interface MapCanvasProps {
  states: Record<string, StateWeatherSnapshot>;
  metric: MetricLayer;
  colormap?: ColormapId;
  reverseColormap?: boolean;
  unit: TempUnit;
  isDark: boolean;
  timelineIndex: number;
  useTimeline: boolean;
  selectedCode: string | null;
  onSelectState: (code: string | null) => void;
  alertsByState?: Record<string, WeatherAlert[]>;
  alertPolygons?: GeoJsonFeatureCollection | null;
  showAlertPolygons?: boolean;
  /** Disable keyboard shortcuts when a modal dialog is open */
  shortcutsEnabled?: boolean;
  /** Detailed state inspection mode: auto-zoom selected state & render top 10 cities */
  detailedStateMode?: boolean;
  onToggleDetailedStateMode?: () => void;
  stateCitiesWeather?: StateCitiesWeatherResponse | null;
  fallbackTopCities?: TopCityMeta[];
  citiesLoading?: boolean;
  selectedCity?: string;
  onSelectCity?: (cityName: string) => void;
  /** Optional canvas overlays rendered inside the exact 975x610 map coordinate space */
  overlays?: ReactNode;
  /** Whether animated Weather FX are active (adds subtle alert pulse & enables 'A' shortcut) */
  showWeatherFx?: boolean;
  onToggleWeatherFx?: () => void;
  fxShowcase?: boolean;
  /** Called when map zoom factor changes */
  onZoomChange?: (zoom: number) => void;
  /** Incrementing counter to reset pan and zoom back to the default view */
  resetTrigger?: number;
  /** Called when zoom or pan differs from (or returns to) the default view */
  onViewModifiedChange?: (modified: boolean) => void;
  /** Exposed SVG ref for PNG export */
  mapContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function MapCanvas({
  states,
  metric,
  colormap = 'default',
  reverseColormap = false,
  unit,
  isDark,
  timelineIndex,
  useTimeline,
  selectedCode,
  onSelectState,
  alertsByState = {},
  alertPolygons,
  showAlertPolygons = false,
  shortcutsEnabled = true,
  detailedStateMode = false,
  onToggleDetailedStateMode,
  stateCitiesWeather = null,
  fallbackTopCities = [],
  citiesLoading = false,
  selectedCity = '',
  onSelectCity,
  overlays,
  showWeatherFx = false,
  onToggleWeatherFx,
  fxShowcase = false,
  onZoomChange,
  resetTrigger,
  onViewModifiedChange,
  mapContainerRef,
}: MapCanvasProps) {
  const geometries = useMemo(() => getUsStateGeometries(), []);
  const scaleConfig = METRIC_SCALES[metric];
  const calmZero = metric === 'precipitation' || metric === 'windSpeed';
  const activeStops = useMemo(
    () => resolveMetricStops(metric, colormap, reverseColormap),
    [metric, colormap, reverseColormap],
  );
  const stateVisuals = useMemo(() => {
    const fallbackFill = isDark ? 'rgb(30, 41, 59)' : 'rgb(226, 232, 240)';
    const showcaseMap = showWeatherFx && fxShowcase ? buildShowcasePhenomena(states) : null;
    const byCode: Record<
      string,
      {
        slice: ResolvedStateSlice;
        displayVal: string;
        fill: string;
        lightFill: boolean;
        phenomenon: WeatherPhenomenon;
      }
    > = {};
    for (const item of geometries) {
      const snap = states[item.meta.code];
      if (!snap) continue;
      const slice = resolveStateSlice(snap, timelineIndex, useTimeline);
      const rawMetric = resolveMetricValue(scaleConfig, snap.current, slice);
      const fill = interpolateColor(rawMetric, activeStops, isDark, calmZero);
      const phenom = showcaseMap
        ? showcaseMap[item.meta.code]!
        : classifySnapshotPhenomenon(slice, snap.current, alertsByState[item.meta.code], metric);
      byCode[item.meta.code] = {
        slice,
        displayVal: scaleConfig.formatMapValue(rawMetric, unit),
        fill: fill || fallbackFill,
        lightFill: isColorLight(fill),
        phenomenon: phenom.phenomenon,
      };
    }
    return byCode;
  }, [
    geometries,
    states,
    timelineIndex,
    useTimeline,
    scaleConfig,
    activeStops,
    unit,
    isDark,
    calmZero,
    showWeatherFx,
    fxShowcase,
    alertsByState,
    metric,
  ]);

  const [hovered, setHovered] = useState<{ code: string; x: number; y: number } | null>(null);
  const [view, setView] = useState<MapViewState>(INITIAL_MAP_VIEW);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageElRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    startedInPanMode: boolean;
  } | null>(null);
  const spacePanAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const spaceHeldRef = useRef(spaceHeld);
  spaceHeldRef.current = spaceHeld;

  const setStageRef = useCallback(
    (node: HTMLDivElement | null) => {
      stageElRef.current = node;
      if (mapContainerRef) {
        mapContainerRef.current = node;
      }
    },
    [mapContainerRef],
  );

  const getStageSize = useCallback((): StageSize => {
    const el = stageElRef.current;
    return {
      width: el?.clientWidth || 1000,
      height: el?.clientHeight || 625,
    };
  }, []);

  const alertPaths = useMemo(() => {
    if (!showAlertPolygons || !alertPolygons?.features?.length) return [];
    return alertPolygons.features
      .map((feat, idx) => {
        const d = usPathGen(feat as never);
        if (!d) return null;
        return {
          id: feat.properties?.id ?? `poly-${idx}`,
          d,
          severity: feat.properties?.severity ?? 'Moderate',
        };
      })
      .filter((item): item is { id: string; d: string; severity: string } => item !== null);
  }, [alertPolygons, showAlertPolygons]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const factor = getWheelZoomFactor(e.deltaY, e.deltaMode, e.ctrlKey);
      if (factor === 1) return;

      const vpRect = vp.getBoundingClientRect();
      const focalOffset = {
        x: e.clientX - (vpRect.left + vpRect.width / 2),
        y: e.clientY - (vpRect.top + vpRect.height / 2),
      };
      const stageSize = getStageSize();
      setView((prev) =>
        zoomViewState(prev, prev.zoom * factor, stageSize, {
          focalOffset,
          preservePanAtMinZoom: spaceHeldRef.current || prev.zoom <= DEFAULT_ZOOM,
        }),
      );
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [getStageSize]);

  const zoomByStep = useCallback(
    (delta: number) => {
      const stageSize = getStageSize();
      setView((prev) =>
        zoomViewState(prev, prev.zoom + delta, stageSize, {
          preservePanAtMinZoom: spaceHeldRef.current || prev.zoom <= DEFAULT_ZOOM,
        }),
      );
    },
    [getStageSize],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const isMiddleButton = e.button === 1;
      const canStartLeftDrag = e.button === 0;
      if (!isMiddleButton && !canStartLeftDrag) return;
      if (isInteractiveTarget(e.target)) return;

      const startedInPanMode = spaceHeldRef.current || isMiddleButton;
      if (startedInPanMode) {
        e.preventDefault();
      }

      suppressClickRef.current = startedInPanMode;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: view.pan.x,
        origY: view.pan.y,
        moved: false,
        startedInPanMode,
      };
      setDragActive(true);
      if (startedInPanMode) {
        setIsDragging(true);
        setHovered(null);
      }
    },
    [view.pan.x, view.pan.y],
  );

  useEffect(() => {
    if (!dragActive) return;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
        suppressClickRef.current = true;
        setIsDragging(true);
        setHovered(null);
      }

      if (drag.moved || drag.startedInPanMode) {
        const stageSize = getStageSize();
        setView((prev) => ({
          zoom: prev.zoom,
          pan: clampPan({ x: drag.origX + dx, y: drag.origY + dy }, prev.zoom, stageSize),
        }));
      }
    };

    const endDrag = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const shouldSuppress = drag.moved || drag.startedInPanMode;
      dragRef.current = null;
      setIsDragging(false);
      setDragActive(false);
      if (shouldSuppress) {
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };

    const cancelDrag = () => {
      dragRef.current = null;
      suppressClickRef.current = false;
      setIsDragging(false);
      setDragActive(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', cancelDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', cancelDrag);
    };
  }, [dragActive, getStageSize]);

  useEffect(() => {
    if (!spaceHeld) {
      spacePanAnchorRef.current = null;
      return;
    }

    const handleSpaceMove = (e: PointerEvent) => {
      if (dragRef.current) {
        spacePanAnchorRef.current = null;
        return;
      }
      const anchor = spacePanAnchorRef.current;
      if (!anchor) {
        spacePanAnchorRef.current = { x: e.clientX, y: e.clientY };
        setHovered(null);
        return;
      }
      const dx = e.clientX - anchor.x;
      const dy = e.clientY - anchor.y;
      if (dx === 0 && dy === 0) return;
      spacePanAnchorRef.current = { x: e.clientX, y: e.clientY };
      setView((prev) => panByOffset(prev, dx, dy, getStageSize()));
    };

    window.addEventListener('pointermove', handleSpaceMove);
    return () => {
      window.removeEventListener('pointermove', handleSpaceMove);
      spacePanAnchorRef.current = null;
    };
  }, [spaceHeld, getStageSize]);

  useEffect(() => {
    if (!shortcutsEnabled) {
      setSpaceHeld(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (isSpaceKey(e)) {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
        if (!e.repeat) setSpaceHeld(true);
        return;
      }

      if (isEditableTarget(e.target)) return;

      if (e.key.toLowerCase() === 'd' && !e.repeat && onToggleDetailedStateMode) {
        e.preventDefault();
        onToggleDetailedStateMode();
        return;
      }

      if (e.key.toLowerCase() === 'a' && !e.repeat && onToggleWeatherFx) {
        e.preventDefault();
        onToggleWeatherFx();
        return;
      }

      const zoomAction = getZoomShortcutAction(e);
      if (zoomAction) {
        e.preventDefault();
        if (zoomAction === 'in') {
          zoomByStep(ZOOM_BUTTON_STEP);
        } else if (zoomAction === 'out') {
          zoomByStep(-ZOOM_BUTTON_STEP);
        } else {
          setView(INITIAL_MAP_VIEW);
        }
        return;
      }

      if (spaceHeldRef.current) {
        const delta = getArrowPanDelta(e);
        if (delta) {
          e.preventDefault();
          setView((prev) => panByOffset(prev, delta.x, delta.y, getStageSize()));
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isSpaceKey(e)) {
        setSpaceHeld(false);
      }
    };

    const handleBlur = () => {
      setSpaceHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [shortcutsEnabled, getStageSize, zoomByStep, onToggleDetailedStateMode, onToggleWeatherFx]);

  const showReset = isViewModified(view);

  useEffect(() => {
    onViewModifiedChange?.(showReset);
  }, [showReset, onViewModifiedChange]);

  useEffect(() => {
    onZoomChange?.(view.zoom);
  }, [view.zoom, onZoomChange]);

  const prevResetTriggerRef = useRef(resetTrigger);
  useEffect(() => {
    if (resetTrigger !== undefined && resetTrigger !== prevResetTriggerRef.current) {
      prevResetTriggerRef.current = resetTrigger;
      setView(INITIAL_MAP_VIEW);
    }
  }, [resetTrigger]);

  const selectedGeo = useMemo(
    () => (selectedCode ? geometries.find((g) => g.meta.code === selectedCode) ?? null : null),
    [geometries, selectedCode],
  );
  const selectedSnap = selectedCode ? states[selectedCode] : undefined;

  const wasFocusedRef = useRef(false);
  useEffect(() => {
    if (detailedStateMode && selectedGeo) {
      const stageSize = getStageSize();
      const vpEl = viewportRef.current;
      const viewportSize = {
        width: vpEl?.clientWidth || stageSize.width,
        height: vpEl?.clientHeight || stageSize.height,
      };
      const rightInsetPx = viewportSize.width >= 640 ? 436 : 0;
      wasFocusedRef.current = true;
      setView(
        computeStateFocusView({
          bounds: selectedGeo.bounds,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
          stageSize,
          viewportSize,
          rightInsetPx,
        }),
      );
      return;
    }

    if (wasFocusedRef.current) {
      wasFocusedRef.current = false;
      setView(INITIAL_MAP_VIEW);
    }
  }, [detailedStateMode, selectedGeo, getStageSize]);

  const cityMarkers = useMemo(() => {
    if (!detailedStateMode || !selectedCode) return [];

    const activeCities =
      stateCitiesWeather && stateCitiesWeather.code === selectedCode
        ? stateCitiesWeather.cities
        : null;

    const baseItems = activeCities
      ? activeCities.map((c) => {
          const proj = usProjection([c.lon, c.lat]);
          if (!proj) return null;
          const slice = resolveStateSlice(c, timelineIndex, useTimeline);
          const rawMetric = resolveMetricValue(scaleConfig, c.current, slice);
          const displayVal = scaleConfig.formatMapValue(rawMetric, unit);
          const fill = interpolateColor(rawMetric, activeStops, isDark, calmZero);
          const label = `${c.name} ${displayVal}`;
          const boxWidth = Math.max(76, Math.min(138, label.length * 5.6 + 22));
          return {
            rank: c.rank,
            name: c.name,
            population: c.population,
            px: proj[0],
            py: proj[1],
            displayVal,
            fill,
            boxWidth,
            boxHeight: 20,
            loaded: true,
          };
        })
      : fallbackTopCities.map((c) => {
          const proj = usProjection([c.lon, c.lat]);
          if (!proj) return null;
          const boxWidth = Math.max(66, Math.min(120, c.name.length * 5.6 + 18));
          return {
            rank: c.rank,
            name: c.name,
            population: c.population,
            px: proj[0],
            py: proj[1],
            displayVal: '…',
            fill: isDark ? '#38bdf8' : '#0284c7',
            boxWidth,
            boxHeight: 18,
            loaded: false,
          };
        });

    const projected = baseItems.filter((item): item is NonNullable<typeof item> => item !== null);
    const offsets = layoutCityMarkerOffsets(
      projected.map((item) => ({
        id: item.name,
        screenX: item.px * view.zoom,
        screenY: item.py * view.zoom,
        boxWidth: item.boxWidth,
        boxHeight: item.boxHeight,
      })),
    );

    return projected.map((item) => ({
      ...item,
      offset: offsets[item.name] ?? { ox: 0, oy: -18 },
    }));
  }, [
    detailedStateMode,
    selectedCode,
    stateCitiesWeather,
    fallbackTopCities,
    timelineIndex,
    useTimeline,
    scaleConfig,
    activeStops,
    calmZero,
    unit,
    isDark,
    view.zoom,
  ]);

  const hoveredSnap = hovered ? states[hovered.code] : undefined;
  const hoveredVisual = hovered ? stateVisuals[hovered.code] : undefined;
  const selectedVisual = selectedCode ? stateVisuals[selectedCode] : undefined;
  const isPanning = isDragging || spaceHeld;

  return (
    <div
      ref={viewportRef}
      className="relative flex h-full w-full touch-none items-center justify-center overflow-hidden select-none"
      style={{
        cursor: isDragging ? 'grabbing' : spaceHeld ? 'grab' : 'default',
      }}
      onPointerDown={handlePointerDown}
      onMouseLeave={() => {
        setHovered(null);
      }}
      onClick={() => {
        if (suppressClickRef.current || spaceHeld) return;
        if (selectedCode) {
          onSelectState(null);
        }
      }}
    >
      <div
        ref={setStageRef}
        className={`relative w-full max-w-[1180px] ${
          isPanning ? 'transition-none' : 'transition-transform duration-300 ease-out'
        }`}
        style={{
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
        }}
      >
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="Interactive United States 50-state weather map"
        >
          <g
            className="stroke-slate-300/70 dark:stroke-slate-700/70"
            fill="none"
            strokeDasharray="3 3"
            strokeWidth={0.9}
          >
            <rect x={16} y={392} width={220} height={198} rx={10} />
            <rect x={246} y={474} width={132} height={116} rx={10} />
          </g>
          <text
            x={26}
            y={408}
            className="fill-slate-400 text-[9px] font-medium tracking-wider uppercase dark:fill-slate-500"
          >
            Alaska
          </text>
          <text
            x={256}
            y={490}
            className="fill-slate-400 text-[9px] font-medium tracking-wider uppercase dark:fill-slate-500"
          >
            Hawaii
          </text>

          <g>
            {geometries.map((item) => {
              const fill =
                stateVisuals[item.meta.code]?.fill ??
                (isDark ? 'rgb(30, 41, 59)' : 'rgb(226, 232, 240)');
              const isSelected = selectedCode === item.meta.code;
              const isHovered = hovered?.code === item.meta.code;

              return (
                <path
                  key={item.meta.code}
                  d={item.pathD}
                  fill={fill}
                  fillOpacity={detailedStateMode && selectedCode && !isSelected ? 0.35 : 1}
                  stroke={
                    isSelected
                      ? isDark
                        ? '#38bdf8'
                        : '#0284c7'
                      : isHovered
                        ? isDark
                          ? '#f8fafc'
                          : '#0f172a'
                        : isDark
                          ? '#0f172a'
                          : '#ffffff'
                  }
                  strokeWidth={
                    (isSelected ? 2.2 : isHovered ? 1.6 : 0.9) / Math.sqrt(Math.max(1, view.zoom))
                  }
                  className={`${
                    isDragging ? 'cursor-grabbing' : spaceHeld ? 'cursor-grab' : 'cursor-pointer'
                  } transition-[fill,fill-opacity,stroke-width] duration-300`}
                  onMouseEnter={(e) => {
                    if (!isPanning) setHovered({ code: item.meta.code, x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={(e) => {
                    if (!isPanning) setHovered({ code: item.meta.code, x: e.clientX, y: e.clientY });
                  }}
                  onMouseLeave={() => setHovered((prev) => (prev?.code === item.meta.code ? null : prev))}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressClickRef.current || spaceHeld) return;
                    onSelectState(item.meta.code);
                  }}
                />
              );
            })}
          </g>

          {alertPaths.length > 0 && (
            <g className="pointer-events-none">
              {alertPaths.map((poly) => (
                <path
                  key={poly.id}
                  d={poly.d}
                  className={
                    showWeatherFx && (poly.severity === 'Extreme' || poly.severity === 'Severe')
                      ? 'ws-alert-pulse'
                      : undefined
                  }
                  fill={
                    poly.severity === 'Extreme'
                      ? 'rgba(225, 29, 72, 0.34)'
                      : poly.severity === 'Severe'
                        ? 'rgba(249, 115, 22, 0.28)'
                        : 'rgba(234, 179, 8, 0.22)'
                  }
                  stroke={
                    poly.severity === 'Extreme'
                      ? '#e11d48'
                      : poly.severity === 'Severe'
                        ? '#f97316'
                        : '#eab308'
                  }
                  strokeWidth={0.8}
                />
              ))}
            </g>
          )}
        </svg>

        {overlays}

        {/* Rendered above canvas overlays so state labels stay legible over radar */}
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {geometries.map((item) => {
            if (detailedStateMode && item.meta.code === selectedCode) return null;
            const visual = stateVisuals[item.meta.code];
            if (!visual) return null;

            const { displayVal, lightFill, phenomenon } = visual;
            const isCompact = Boolean(item.meta.labelOffset);
            const hasAlerts = (alertsByState[item.meta.code]?.length ?? 0) > 0;
            const isSelected = selectedCode === item.meta.code;
            const showBadge =
              showWeatherFx &&
              phenomenon !== 'cloudy' &&
              hasActiveMapFx(phenomenon, metric);

            const [cx, cy] = item.centroid;
            const [lx, ly] = item.labelPoint;

            return (
              <g key={`label-${item.meta.code}`}>
                {item.meta.labelOffset && (
                  <line
                    x1={cx}
                    y1={cy}
                    x2={lx}
                    y2={ly}
                    stroke={isDark ? 'rgba(226,232,240,0.45)' : 'rgba(51,65,85,0.45)'}
                    strokeWidth={0.8}
                  />
                )}

                {isCompact ? (
                  <g transform={`translate(${lx}, ${ly})`}>
                    <rect
                      x={-22}
                      y={-8.5}
                      width={44}
                      height={17}
                      rx={4.5}
                      fill={
                        isSelected
                          ? '#0284c7'
                          : isDark
                            ? 'rgba(15, 23, 42, 0.88)'
                            : 'rgba(255, 255, 255, 0.9)'
                      }
                      stroke={isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.5)'}
                      strokeWidth={0.7}
                    />
                    <text
                      textAnchor="middle"
                      y={3.2}
                      className="tabular-nums text-[8.5px] font-semibold"
                      fill={isSelected ? '#ffffff' : isDark ? '#f1f5f9' : '#0f172a'}
                    >
                      {item.meta.code} {displayVal}
                    </text>
                    {showBadge && (
                      <g transform="translate(23, -6) scale(0.46)">
                        <WeatherGlyph phenomenon={phenomenon} animated />
                      </g>
                    )}
                  </g>
                ) : (
                  <g transform={`translate(${lx}, ${ly})`}>
                    {showBadge && (
                      <g transform="translate(-6, -21.5) scale(0.5)">
                        <WeatherGlyph phenomenon={phenomenon} animated />
                      </g>
                    )}
                    <text
                      textAnchor="middle"
                      y={-2}
                      className="text-[9px] font-semibold tracking-wide"
                      fill={lightFill ? 'rgba(15,23,42,0.78)' : 'rgba(255,255,255,0.88)'}
                      style={{
                        paintOrder: 'stroke',
                        stroke: lightFill ? 'rgba(255,255,255,0.45)' : 'rgba(15,23,42,0.45)',
                        strokeWidth: '2px',
                      }}
                    >
                      {item.meta.code}
                    </text>
                    <text
                      textAnchor="middle"
                      y={10}
                      className="tabular-nums text-[11px] font-bold"
                      fill={lightFill ? '#0f172a' : '#ffffff'}
                      style={{
                        paintOrder: 'stroke',
                        stroke: lightFill ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)',
                        strokeWidth: '2.4px',
                      }}
                    >
                      {displayVal}
                    </text>
                    {hasAlerts && (
                      <circle cx={14} cy={-5} r={3.2} fill="#ef4444" stroke="#ffffff" strokeWidth={1} />
                    )}
                  </g>
                )}

                {isSelected && !detailedStateMode && (
                  <circle
                    cx={item.cityPoint[0]}
                    cy={item.cityPoint[1]}
                    r={4}
                    fill="#0284c7"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                )}
              </g>
            );
          })}

          {cityMarkers.map((city) => {
            const invScale = 1 / Math.max(0.8, view.zoom);
            const isActiveCity = city.name.toLowerCase() === selectedCity.toLowerCase();
            const { ox, oy } = city.offset;
            const showLeader = Math.hypot(ox, oy) > 14;
            const halfW = city.boxWidth / 2;
            const halfH = city.boxHeight / 2;

            return (
              <g
                key={`top-city-${city.rank}-${city.name}`}
                transform={`translate(${city.px}, ${city.py}) scale(${invScale})`}
                className={spaceHeld ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (suppressClickRef.current || spaceHeld) return;
                  onSelectCity?.(city.name);
                }}
              >
                {showLeader && (
                  <line
                    x1={0}
                    y1={0}
                    x2={ox}
                    y2={oy}
                    stroke={isDark ? 'rgba(148,163,184,0.65)' : 'rgba(51,65,85,0.55)'}
                    strokeWidth={1}
                  />
                )}
                <circle
                  cx={0}
                  cy={0}
                  r={isActiveCity ? 5 : 3.8}
                  fill={isActiveCity ? '#0284c7' : city.fill}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <g transform={`translate(${ox}, ${oy})`}>
                  <rect
                    x={-halfW}
                    y={-halfH}
                    width={city.boxWidth}
                    height={city.boxHeight}
                    rx={6}
                    fill={
                      isActiveCity
                        ? '#0284c7'
                        : isDark
                          ? 'rgba(15, 23, 42, 0.92)'
                          : 'rgba(255, 255, 255, 0.94)'
                    }
                    stroke={
                      isActiveCity
                        ? '#38bdf8'
                        : isDark
                          ? 'rgba(148,163,184,0.4)'
                          : 'rgba(148,163,184,0.55)'
                    }
                    strokeWidth={isActiveCity ? 1.2 : 0.8}
                  />
                  <text
                    textAnchor="middle"
                    y={3.5}
                    className="tabular-nums text-[9.5px] font-semibold"
                    fill={isActiveCity ? '#ffffff' : isDark ? '#f8fafc' : '#0f172a'}
                  >
                    {city.rank}. {city.name} {city.displayVal}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>

        {!detailedStateMode && selectedGeo && selectedSnap && selectedVisual && (
          <PinnedStateTooltip
            snapshot={selectedSnap}
            slice={selectedVisual.slice}
            unit={unit}
            svgX={selectedGeo.centroid[0]}
            svgY={selectedGeo.centroid[1]}
            mapWidth={MAP_WIDTH}
            mapHeight={MAP_HEIGHT}
            alerts={alertsByState[selectedGeo.meta.code]}
            onClose={() => onSelectState(null)}
          />
        )}
      </div>

      {detailedStateMode && (!selectedCode || citiesLoading) && (
        <div
          className="no-print pointer-events-none fixed top-32 left-1/2 z-20 -translate-x-1/2 rounded-full border border-emerald-500/30 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-md md:top-20 dark:border-emerald-400/30 dark:bg-slate-900/90 dark:text-slate-200"
        >
          {citiesLoading
            ? `Loading top 10 cities in ${selectedGeo?.meta.name ?? selectedCode}...`
            : 'Detailed State Mode — Click any state to zoom & load top 10 cities'}
        </div>
      )}

      {!isPanning && hovered && hoveredSnap && hoveredVisual && hovered.code !== selectedCode && (
        <HoverTooltip
          snapshot={hoveredSnap}
          slice={hoveredVisual.slice}
          unit={unit}
          x={hovered.x}
          y={hovered.y}
          alerts={alertsByState[hovered.code]}
          panActive={spaceHeld}
        />
      )}
    </div>
  );
}
