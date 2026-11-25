import { Minus, Plus, RotateCcw } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import type {
  GeoJsonFeatureCollection,
  MetricLayer,
  StateWeatherSnapshot,
  TempUnit,
  WeatherAlert,
} from '../../shared/types';
import { MAP_HEIGHT, MAP_WIDTH, getUsStateGeometries, usProjection } from '../utils/mapGeometry';
import { METRIC_SCALES, interpolateColor, isColorLight } from '../utils/scales';
import { HoverTooltip, PinnedStateTooltip } from './StateTooltip';
import { WeatherIcon } from './WeatherIcon';
import { geoPath } from 'd3-geo';

interface MapCanvasProps {
  states: Record<string, StateWeatherSnapshot>;
  metric: MetricLayer;
  unit: TempUnit;
  isDark: boolean;
  timelineIndex: number;
  useTimeline: boolean;
  selectedCode: string | null;
  onSelectState: (code: string | null) => void;
  alertsByState?: Record<string, WeatherAlert[]>;
  alertPolygons?: GeoJsonFeatureCollection | null;
  showAlertPolygons?: boolean;
  /** Optional canvas overlays rendered inside the exact 975x610 map coordinate space */
  overlays?: ReactNode;
  /** Exposed SVG ref for PNG export */
  mapContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const COMPACT_NE_CODES = new Set(['RI', 'DE', 'CT', 'NJ', 'MD', 'MA', 'NH', 'VT']);

export function resolveStateSlice(
  snap: StateWeatherSnapshot,
  timelineIndex: number,
  useTimeline: boolean,
) {
  const t = useTimeline ? snap.timeline[timelineIndex] : undefined;
  return {
    temperatureF: t?.temperatureF ?? snap.current.temperatureF,
    apparentTemperatureF: t?.apparentTemperatureF ?? snap.current.apparentTemperatureF,
    precipitationMm: t?.precipitationMm ?? snap.current.precipitationMm,
    windSpeedMph: t?.windSpeedMph ?? snap.current.windSpeedMph,
    windDirectionDeg: t?.windDirectionDeg ?? snap.current.windDirectionDeg,
    humidity: t?.humidity ?? snap.current.humidity,
    weatherCode: t?.weatherCode ?? snap.current.weatherCode,
    metricSource: t,
  };
}

export function MapCanvas({
  states,
  metric,
  unit,
  isDark,
  timelineIndex,
  useTimeline,
  selectedCode,
  onSelectState,
  alertsByState = {},
  alertPolygons,
  showAlertPolygons = false,
  overlays,
  mapContainerRef,
}: MapCanvasProps) {
  const geometries = useMemo(() => getUsStateGeometries(), []);
  const scaleConfig = METRIC_SCALES[metric];

  const [hovered, setHovered] = useState<{ code: string; x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(
    null,
  );

  const alertPaths = useMemo(() => {
    if (!showAlertPolygons || !alertPolygons?.features?.length) return [];
    const pathGen = geoPath(usProjection);
    return alertPolygons.features
      .map((feat, idx) => {
        const d = pathGen(feat as never);
        if (!d) return null;
        return {
          id: feat.properties?.id ?? `poly-${idx}`,
          d,
          severity: feat.properties?.severity ?? 'Moderate',
        };
      })
      .filter((item): item is { id: string; d: string; severity: string } => item !== null);
  }, [alertPolygons, showAlertPolygons]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => {
      const next = Math.min(3.5, Math.max(1, Number((z * factor).toFixed(2))));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: pan.x,
        origY: pan.y,
        moved: false,
      };
    },
    [zoom, pan],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
    }
    setPan({ x: drag.origX + dx, y: drag.origY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const selectedGeo = useMemo(
    () => (selectedCode ? geometries.find((g) => g.meta.code === selectedCode) ?? null : null),
    [geometries, selectedCode],
  );
  const selectedSnap = selectedCode ? states[selectedCode] : undefined;

  const hoveredSnap = hovered ? states[hovered.code] : undefined;
  const hoveredSlice = hoveredSnap ? resolveStateSlice(hoveredSnap, timelineIndex, useTimeline) : null;
  const selectedSlice = selectedSnap ? resolveStateSlice(selectedSnap, timelineIndex, useTimeline) : null;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setHovered(null);
        handleMouseUp();
      }}
      onClick={() => {
        if (!dragRef.current?.moved && selectedCode) {
          onSelectState(null);
        }
      }}
    >
      {/* Zoomable aspect-locked 975x610 map stage */}
      <div
        ref={mapContainerRef}
        className="relative w-full max-w-[1180px] transition-transform duration-150 ease-out"
        style={{
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          cursor: zoom > 1 ? 'grab' : 'default',
        }}
      >
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="Interactive United States 50-state weather map"
        >
          {/* Subtle inset dividers for Alaska and Hawaii */}
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

          {/* 50 US State Choropleth Polygons */}
          <g>
            {geometries.map((item) => {
              const snap = states[item.meta.code];
              const slice = snap ? resolveStateSlice(snap, timelineIndex, useTimeline) : null;
              const rawMetric =
                snap && slice
                  ? slice.metricSource
                    ? scaleConfig.extractTimeline(slice.metricSource, snap.current)
                    : scaleConfig.extractCurrent(snap.current)
                  : null;
              const fill = interpolateColor(rawMetric, scaleConfig.stops, isDark);
              const isSelected = selectedCode === item.meta.code;
              const isHovered = hovered?.code === item.meta.code;

              return (
                <path
                  key={item.meta.code}
                  d={item.pathD}
                  fill={fill}
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
                  strokeWidth={isSelected ? 2.2 : isHovered ? 1.6 : 0.9}
                  className="cursor-pointer transition-[fill,stroke-width] duration-300"
                  onMouseEnter={(e) => setHovered({ code: item.meta.code, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHovered({ code: item.meta.code, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered((prev) => (prev?.code === item.meta.code ? null : prev))}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectState(item.meta.code);
                  }}
                />
              );
            })}
          </g>

          {/* NWS Severe Alert Polygons (Live Mode) */}
          {alertPaths.length > 0 && (
            <g className="pointer-events-none">
              {alertPaths.map((poly) => (
                <path
                  key={poly.id}
                  d={poly.d}
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

        {/* Slot for Radar & Wind Canvas layers locked identically to 975x610 */}
        {overlays}

        {/* State Labels & Compact Leader Callouts Layer (above radar so readable!) */}
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          {geometries.map((item) => {
            const snap = states[item.meta.code];
            if (!snap) return null;

            const slice = resolveStateSlice(snap, timelineIndex, useTimeline);
            const rawMetric = slice.metricSource
              ? scaleConfig.extractTimeline(slice.metricSource, snap.current)
              : scaleConfig.extractCurrent(snap.current);
            const displayVal = scaleConfig.formatMapValue(rawMetric, unit);
            const fill = interpolateColor(rawMetric, scaleConfig.stops, isDark);
            const lightFill = isColorLight(fill);
            const isCompact = COMPACT_NE_CODES.has(item.meta.code);
            const hasAlerts = (alertsByState[item.meta.code]?.length ?? 0) > 0;
            const isSelected = selectedCode === item.meta.code;

            const [cx, cy] = item.centroid;
            const [lx, ly] = item.labelPoint;

            return (
              <g key={`label-${item.meta.code}`}>
                {item.meta.leaderLine && (
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
                  </g>
                ) : (
                  <g transform={`translate(${lx}, ${ly})`}>
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
                    {/* Tiny weather dot or alert dot */}
                    {hasAlerts && (
                      <circle cx={14} cy={-5} r={3.2} fill="#ef4444" stroke="#ffffff" strokeWidth={1} />
                    )}
                  </g>
                )}

                {isSelected && (
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
        </svg>

        {/* Pinned tooltip shown when a state is clicked */}
        {selectedGeo && selectedSnap && selectedSlice && (
          <PinnedStateTooltip
            data={{
              snapshot: selectedSnap,
              tempF: selectedSlice.temperatureF,
              apparentF: selectedSlice.apparentTemperatureF,
              precipMm: selectedSlice.precipitationMm,
              windMph: selectedSlice.windSpeedMph,
              windDeg: selectedSlice.windDirectionDeg,
              humidity: selectedSlice.humidity,
              weatherCode: selectedSlice.weatherCode,
            }}
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

      {/* Hover Tooltip */}
      {hovered && hoveredSnap && hoveredSlice && hovered.code !== selectedCode && (
        <HoverTooltip
          data={{
            snapshot: hoveredSnap,
            tempF: hoveredSlice.temperatureF,
            apparentF: hoveredSlice.apparentTemperatureF,
            precipMm: hoveredSlice.precipitationMm,
            windMph: hoveredSlice.windSpeedMph,
            windDeg: hoveredSlice.windDirectionDeg,
            humidity: hoveredSlice.humidity,
            weatherCode: hoveredSlice.weatherCode,
          }}
          unit={unit}
          x={hovered.x}
          y={hovered.y}
          alerts={alertsByState[hovered.code]}
        />
      )}

      {/* Minimal Zoom Controls */}
      <div
        className="no-print absolute right-4 bottom-24 z-20 flex flex-col gap-1 rounded-xl border border-slate-200/80 bg-white/85 p-1 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.35).toFixed(2))))}
          aria-label="Zoom in map"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Plus size={14} />
        </button>
        <button
          type="button"
          onClick={() =>
            setZoom((z) => {
              const next = Math.max(1, Number((z - 0.35).toFixed(2)));
              if (next === 1) setPan({ x: 0, y: 0 });
              return next;
            })
          }
          aria-label="Zoom out map"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Minus size={14} />
        </button>
        {zoom > 1 && (
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset map zoom"
            className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-slate-800"
          >
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Unused import silence guard for future inline icon markers */}
      <span className="hidden">
        <WeatherIcon code={0} size={10} />
      </span>
    </div>
  );
}
