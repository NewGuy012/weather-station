import { AlertTriangle, Radar, Wind } from 'lucide-react';
import type { MetricLayer, TempUnit, WeatherMode } from '../../shared/types';
import { METRIC_LIST, METRIC_SCALES } from '../utils/scales';

interface MetricToolbarProps {
  metric: MetricLayer;
  onMetricChange: (m: MetricLayer) => void;
  unit: TempUnit;
  mode: WeatherMode;
  showRadar: boolean;
  onToggleRadar: () => void;
  showWind: boolean;
  onToggleWind: () => void;
  showAlertPolygons: boolean;
  onToggleAlertPolygons: () => void;
  alertsCount: number;
}

export function MetricToolbar({
  metric,
  onMetricChange,
  unit,
  mode,
  showRadar,
  onToggleRadar,
  showWind,
  onToggleWind,
  showAlertPolygons,
  onToggleAlertPolygons,
  alertsCount,
}: MetricToolbarProps) {
  const scale = METRIC_SCALES[metric];
  const gradient = `linear-gradient(to right, ${scale.stops
    .map((s) => `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]})`)
    .join(', ')})`;

  return (
    <div className="no-print pointer-events-none fixed bottom-24 left-3 z-20 flex max-w-[272px] flex-col gap-2 xl:bottom-3">
      {/* Broadcast & Radar Overlays */}
      <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-white/85 p-1.5 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85">
        <button
          type="button"
          onClick={onToggleRadar}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
            showRadar
              ? 'bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Radar size={14} className={showRadar ? 'animate-spin' : ''} style={{ animationDuration: '4s' }} />
          <span>Doppler Radar</span>
        </button>

        <button
          type="button"
          onClick={onToggleWind}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
            showWind
              ? 'bg-teal-600 text-white shadow-xs dark:bg-teal-500 dark:text-slate-950'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Wind size={14} />
          <span>Wind Flow</span>
        </button>

        {mode === 'live' && (
          <button
            type="button"
            onClick={onToggleAlertPolygons}
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition ${
              showAlertPolygons
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle size={14} />
            <span>Alerts ({alertsCount})</span>
          </button>
        )}
      </div>

      {/* Metric Pills + Legend */}
      <div className="pointer-events-auto flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/85 p-2 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85">
        <div className="flex flex-wrap gap-1">
          {METRIC_LIST.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onMetricChange(m.id)}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                metric === m.id
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {m.shortLabel}
            </button>
          ))}
        </div>

        {/* Minimal Gradient Legend */}
        <div className="flex items-center gap-2 px-0.5">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            {scale.label} ({scale.unitLabel(unit)})
          </span>
          <div className="flex-1">
            <div className="h-1.5 w-full rounded-full" style={{ background: gradient }} />
            <div className="mt-0.5 flex justify-between text-[9px] text-slate-400 tabular-nums">
              <span>{scale.stops[0]?.label}</span>
              <span>{scale.stops[Math.floor(scale.stops.length / 2)]?.label}</span>
              <span>{scale.stops[scale.stops.length - 1]?.label}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
