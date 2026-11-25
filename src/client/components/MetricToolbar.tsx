import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChevronDown,
  Palette,
  Radar,
  Wind,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColormapId, MetricLayer, TempUnit, WeatherMode } from '../../shared/types';
import {
  COLORMAPS,
  COLORMAP_BY_ID,
  METRIC_LIST,
  METRIC_SCALES,
  resolveMetricStops,
  stopsToCssGradient,
} from '../utils/scales';

interface MetricToolbarProps {
  metric: MetricLayer;
  onMetricChange: (m: MetricLayer) => void;
  colormap?: ColormapId;
  onColormapChange?: (c: ColormapId) => void;
  reverseColormap?: boolean;
  onToggleReverseColormap?: () => void;
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
  colormap = 'default',
  onColormapChange,
  reverseColormap = false,
  onToggleReverseColormap,
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!paletteOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setPaletteOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [paletteOpen]);

  const scale = METRIC_SCALES[metric];
  const activeStops = useMemo(
    () => resolveMetricStops(metric, colormap, reverseColormap),
    [metric, colormap, reverseColormap],
  );
  const gradient = stopsToCssGradient(activeStops);
  const activeColormapOption = COLORMAP_BY_ID[colormap] ?? COLORMAPS[0]!;

  return (
    <div
      ref={toolbarRef}
      className="no-print pointer-events-none fixed bottom-24 left-3 z-20 flex max-w-[380px] flex-col gap-1.5 xl:bottom-3"
    >
      {/* Colormap Picker Popover */}
      {paletteOpen && onColormapChange && (
        <div
          role="dialog"
          aria-label="Choose map colormap"
          className="pointer-events-auto absolute bottom-full left-0 z-40 mb-2 w-64 rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-xl backdrop-blur-lg dark:border-slate-700/80 dark:bg-slate-900/95"
        >
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Colormap
            </span>
            {onToggleReverseColormap && (
              <button
                type="button"
                onClick={onToggleReverseColormap}
                aria-pressed={reverseColormap}
                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium transition ${
                  reverseColormap
                    ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <ArrowLeftRight size={10} />
                <span>Reversed</span>
              </button>
            )}
          </div>

          <div className="space-y-1">
            {COLORMAPS.map((opt) => {
              const selected = opt.id === colormap;
              const previewStops = resolveMetricStops(metric, opt.id, reverseColormap);
              const previewGradient = stopsToCssGradient(previewStops);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onColormapChange(opt.id);
                    setPaletteOpen(false);
                  }}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition ${
                    selected
                      ? 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30'
                      : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span
                    className="h-2.5 w-11 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                    style={{ background: previewGradient }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold leading-tight text-slate-900 dark:text-white">
                      {opt.label}
                    </div>
                    <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {opt.description}
                    </div>
                  </div>
                  {selected && <Check size={13} className="shrink-0 text-sky-600 dark:text-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
      <div className="pointer-events-auto flex flex-col gap-1.5 rounded-2xl border border-slate-200/80 bg-white/85 p-2 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85">
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
            {onColormapChange ? (
              <button
                type="button"
                onClick={() => setPaletteOpen((v) => !v)}
                aria-label={`Change colormap (current: ${activeColormapOption.label})`}
                title="Change colormap (C)"
                className="block h-2 w-full cursor-pointer rounded-full ring-1 ring-black/5 transition hover:ring-sky-500/60 dark:ring-white/10"
                style={{ background: gradient }}
              />
            ) : (
              <div className="h-1.5 w-full rounded-full" style={{ background: gradient }} />
            )}
            <div className="mt-0.5 flex justify-between text-[9px] text-slate-400 tabular-nums">
              <span>{activeStops[0]?.label}</span>
              <span>{activeStops[Math.floor(activeStops.length / 2)]?.label}</span>
              <span>{activeStops[activeStops.length - 1]?.label}</span>
            </div>
          </div>
        </div>

        {/* Colormap Selector Row */}
        {onColormapChange && (
          <div className="flex items-center justify-between gap-1.5 border-t border-slate-100 pt-1.5 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setPaletteOpen((v) => !v)}
              aria-expanded={paletteOpen}
              title="Choose colormap (C to cycle)"
              className="flex min-w-0 flex-1 items-center justify-between gap-1.5 rounded-lg bg-slate-100/80 px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-200/70 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Palette size={12} className="shrink-0 text-sky-500" />
                <span className="truncate">{activeColormapOption.label}</span>
                {reverseColormap && (
                  <span className="shrink-0 text-[9px] text-slate-400">(Rev)</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <kbd className="rounded bg-white/80 px-1 py-0.5 text-[9px] leading-none font-semibold text-slate-400 dark:bg-slate-900/70 dark:text-slate-500">
                  C
                </kbd>
                <ChevronDown
                  size={12}
                  className={`text-slate-400 transition-transform ${paletteOpen ? 'rotate-180' : ''}`}
                />
              </span>
            </button>

            {onToggleReverseColormap && (
              <button
                type="button"
                onClick={onToggleReverseColormap}
                aria-label="Reverse colormap"
                aria-pressed={reverseColormap}
                title="Reverse color scale (Shift+C)"
                className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                  reverseColormap
                    ? 'bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <ArrowLeftRight size={11} />
                <span>Flip</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
