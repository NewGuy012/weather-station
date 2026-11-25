import { Flame, Snowflake, Wind } from './Icons';
import { Fragment, useMemo } from 'react';
import type { StateWeatherSnapshot, TempUnit } from '../../shared/types';
import { formatTemp, formatWind } from '../../shared/units';
import { resolveStateSlice } from '../utils/scales';

interface ExtremesBarProps {
  states: Record<string, StateWeatherSnapshot>;
  unit: TempUnit;
  timelineIndex: number;
  useTimeline: boolean;
  onSelectState: (code: string) => void;
  dockedToDrawer?: boolean;
}

export function ExtremesBar({
  states,
  unit,
  timelineIndex,
  useTimeline,
  onSelectState,
  dockedToDrawer = false,
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

  const items = [
    {
      key: 'warm',
      label: 'Warm',
      code: summary.warmest.snap.code,
      value: formatTemp(summary.warmest.slice.temperatureF, unit),
      icon: <Flame size={12} className="shrink-0 text-orange-500" />,
      valueClass: 'text-orange-600 dark:text-orange-400',
    },
    {
      key: 'cold',
      label: 'Cold',
      code: summary.coldest.snap.code,
      value: formatTemp(summary.coldest.slice.temperatureF, unit),
      icon: <Snowflake size={12} className="shrink-0 text-sky-500" />,
      valueClass: 'text-sky-600 dark:text-sky-400',
    },
    {
      key: 'wind',
      label: 'Wind',
      code: summary.windiest.snap.code,
      value: formatWind(summary.windiest.slice.windSpeedMph, unit),
      icon: <Wind size={12} className="shrink-0 text-teal-500" />,
      valueClass: 'text-teal-600 dark:text-teal-400',
    },
  ];

  return (
    <div
      aria-label="National weather extremes"
      className={`no-print pointer-events-auto hidden min-w-[164px] flex-col gap-0.5 rounded-2xl border border-slate-200/80 bg-white/85 p-1.5 text-[11px] shadow-sm backdrop-blur-md lg:flex xl:flex-row xl:items-center xl:gap-1.5 xl:px-2.5 xl:py-1.5 dark:border-slate-700/60 dark:bg-slate-900/85 ${
        dockedToDrawer ? 'min-[1440px]:w-[420px] min-[1440px]:justify-between' : ''
      }`}
    >
      {items.map((item, idx) => (
        <Fragment key={item.key}>
          {idx > 0 && (
            <span aria-hidden="true" className="hidden text-slate-300 xl:inline dark:text-slate-700">
              •
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelectState(item.code)}
            title={`Inspect ${item.code} (${item.label}: ${item.value})`}
            className="flex items-center justify-between gap-3 rounded-xl px-2 py-1 text-left transition hover:bg-slate-100 xl:justify-start xl:gap-1 xl:rounded-lg xl:px-1.5 xl:py-0.5 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-1.5 xl:gap-1">
              {item.icon}
              <span className="text-slate-500 dark:text-slate-400">
                {item.label}
                <span className="hidden xl:inline">:</span>
              </span>
            </span>
            <span className="flex items-center gap-1.5 tabular-nums xl:gap-1">
              <span className="font-semibold text-slate-900 dark:text-white">{item.code}</span>
              <span className={`font-medium ${item.valueClass}`}>{item.value}</span>
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}
