import { AlertTriangle, Droplets, MapPin, Wind, X } from 'lucide-react';
import type { StateWeatherSnapshot, TempUnit, WeatherAlert } from '../../shared/types';
import { degToCompass, formatPrecip, formatTemp, formatWind } from '../../shared/units';
import { getWmoInfo } from '../../shared/wmoCodes';
import { WeatherIcon } from './WeatherIcon';

interface TooltipData {
  snapshot: StateWeatherSnapshot;
  tempF: number;
  apparentF: number;
  precipMm: number;
  windMph: number;
  windDeg: number;
  humidity: number;
  weatherCode: number;
}

interface HoverTooltipProps {
  data: TooltipData;
  unit: TempUnit;
  x: number;
  y: number;
  alerts?: WeatherAlert[];
  panActive?: boolean;
}

export function HoverTooltip({
  data,
  unit,
  x,
  y,
  alerts = [],
  panActive = false,
}: HoverTooltipProps) {
  const wmo = getWmoInfo(data.weatherCode);
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const flipX = x > vw - 260;
  const flipY = y > vh - 190;
  const left = flipX ? x - 236 : x + 16;
  const top = flipY ? y - 160 : y + 16;

  return (
    <div
      className="pointer-events-none fixed z-40 w-56 rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/95"
      style={{ left, top }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold tracking-wide text-slate-900 dark:text-slate-100">
              {data.snapshot.name}
            </span>
            <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {data.snapshot.code}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{data.snapshot.city}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <WeatherIcon code={data.weatherCode} size={18} />
          <span className="tabular-nums text-lg font-semibold text-slate-900 dark:text-white">
            {formatTemp(data.tempF, unit)}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
        <span>{wmo.shortLabel}</span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">
          Feels {formatTemp(data.apparentF, unit)}
        </span>
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <Wind size={11} />
          <span className="tabular-nums">
            {formatWind(data.windMph, unit, false)} {degToCompass(data.windDeg)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Droplets size={11} />
          <span className="tabular-nums">{Math.round(data.humidity)}%</span>
        </div>
        <div className="text-right tabular-nums">{formatPrecip(data.precipMm, unit)}</div>
      </div>

      {alerts.length > 0 && (
        <div className="mt-2 flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">
          <AlertTriangle size={11} />
          <span className="truncate">{alerts[0]?.event}</span>
        </div>
      )}

      <div className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
        {panActive ? 'Drag to pan • Press P to exit pan mode' : 'Click state for forecast & details'}
      </div>
    </div>
  );
}

interface PinnedStateTooltipProps {
  data: TooltipData;
  unit: TempUnit;
  svgX: number;
  svgY: number;
  mapWidth: number;
  mapHeight: number;
  alerts?: WeatherAlert[];
  onClose: () => void;
}

export function PinnedStateTooltip({
  data,
  unit,
  svgX,
  svgY,
  mapWidth,
  mapHeight,
  alerts = [],
  onClose,
}: PinnedStateTooltipProps) {
  const wmo = getWmoInfo(data.weatherCode);
  const leftPct = (svgX / mapWidth) * 100;
  const topPct = (svgY / mapHeight) * 100;
  const placeLeft = leftPct > 65;
  const placeAbove = topPct > 62;

  return (
    <div
      className="pointer-events-auto absolute z-20 w-52 rounded-xl border border-sky-500/40 bg-white/95 p-2.5 shadow-xl backdrop-blur-md transition-all duration-200 dark:border-sky-400/40 dark:bg-slate-900/95"
      style={{
        left: `${Math.min(Math.max(leftPct, 8), 92)}%`,
        top: `${Math.min(Math.max(topPct, 10), 88)}%`,
        transform: `translate(${placeLeft ? 'calc(-100% - 12px)' : '12px'}, ${
          placeAbove ? 'calc(-100% - 10px)' : '10px'
        })`,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <MapPin size={12} className="shrink-0 text-sky-500" />
          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            {data.snapshot.name}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Clear selected state"
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X size={12} />
        </button>
      </div>

      <div className="mt-1 flex items-baseline justify-between">
        <div className="flex items-center gap-1.5">
          <WeatherIcon code={data.weatherCode} size={16} />
          <span className="tabular-nums text-base font-bold text-slate-900 dark:text-white">
            {formatTemp(data.tempF, unit, true)}
          </span>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">{wmo.shortLabel}</span>
      </div>

      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
        <span>{data.snapshot.city}</span>
        <span className="tabular-nums">
          {formatWind(data.windMph, unit)} {degToCompass(data.windDeg)}
        </span>
      </div>

      {alerts.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
          <AlertTriangle size={10} />
          <span className="truncate">
            {alerts.length} active {alerts.length === 1 ? 'alert' : 'alerts'}
          </span>
        </div>
      )}
    </div>
  );
}
