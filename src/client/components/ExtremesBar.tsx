import { Flame, Snowflake, Wind } from 'lucide-react';
import { useMemo } from 'react';
import type { StateWeatherSnapshot, TempUnit } from '../../shared/types';
import { formatTemp, formatWind } from '../../shared/units';
import { resolveStateSlice } from './MapCanvas';

interface ExtremesBarProps {
  states: Record<string, StateWeatherSnapshot>;
  unit: TempUnit;
  timelineIndex: number;
  useTimeline: boolean;
  onSelectState: (code: string) => void;
}

export function ExtremesBar({
  states,
  unit,
  timelineIndex,
  useTimeline,
  onSelectState,
}: ExtremesBarProps) {
  const summary = useMemo(() => {
    const entries = Object.values(states).map((snap) => ({
      snap,
      slice: resolveStateSlice(snap, timelineIndex, useTimeline),
    }));
    if (entries.length === 0) return null;

    let warmest = entries[0]!;
    let coldest = entries[0]!;
    let windiest = entries[0]!;

    for (const item of entries) {
      if (item.slice.temperatureF > warmest.slice.temperatureF) warmest = item;
      if (item.slice.temperatureF < coldest.slice.temperatureF) coldest = item;
      if (item.slice.windSpeedMph > windiest.slice.windSpeedMph) windiest = item;
    }
    return { warmest, coldest, windiest };
  }, [states, timelineIndex, useTimeline]);

  if (!summary) return null;

  return (
    <div className="no-print pointer-events-auto hidden items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/85 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur-md lg:flex dark:border-slate-700/60 dark:bg-slate-900/85">
      <button
        type="button"
        onClick={() => onSelectState(summary.warmest.snap.code)}
        className="flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Flame size={12} className="text-orange-500" />
        <span className="text-slate-500 dark:text-slate-400">Warm:</span>
        <span className="font-semibold text-slate-900 dark:text-white">
          {summary.warmest.snap.code}
        </span>
        <span className="tabular-nums text-orange-600 dark:text-orange-400">
          {formatTemp(summary.warmest.slice.temperatureF, unit)}
        </span>
      </button>

      <span className="text-slate-300 dark:text-slate-700">•</span>

      <button
        type="button"
        onClick={() => onSelectState(summary.coldest.snap.code)}
        className="flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Snowflake size={12} className="text-sky-500" />
        <span className="text-slate-500 dark:text-slate-400">Cold:</span>
        <span className="font-semibold text-slate-900 dark:text-white">
          {summary.coldest.snap.code}
        </span>
        <span className="tabular-nums text-sky-600 dark:text-sky-400">
          {formatTemp(summary.coldest.slice.temperatureF, unit)}
        </span>
      </button>

      <span className="text-slate-300 dark:text-slate-700">•</span>

      <button
        type="button"
        onClick={() => onSelectState(summary.windiest.snap.code)}
        className="flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Wind size={12} className="text-teal-500" />
        <span className="text-slate-500 dark:text-slate-400">Wind:</span>
        <span className="font-semibold text-slate-900 dark:text-white">
          {summary.windiest.snap.code}
        </span>
        <span className="tabular-nums text-teal-600 dark:text-teal-400">
          {formatWind(summary.windiest.slice.windSpeedMph, unit)}
        </span>
      </button>
    </div>
  );
}
