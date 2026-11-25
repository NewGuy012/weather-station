import { CloudRain, Pause, Play, Radar, SkipBack, SkipForward, Sparkles } from 'lucide-react';
import type { RadarFrame, WeatherMode } from '../../shared/types';

interface BroadcastDockProps {
  mode: WeatherMode;
  timelineHours: string[];
  timelineIndex: number;
  onTimelineChange: (idx: number) => void;
  isTimelinePlaying: boolean;
  onToggleTimelinePlay: () => void;
  timelineSpeed: number;
  onCycleTimelineSpeed: () => void;
  showRadar: boolean;
  radarFrames: RadarFrame[];
  radarFrameIndex: number;
  onRadarFrameChange: (idx: number) => void;
  isRadarPlaying: boolean;
  onToggleRadarPlay: () => void;
  radarOpacity: number;
  onRadarOpacityChange: (op: number) => void;
  radarLoading: boolean;
  showWeatherFx?: boolean;
  fxShowcase?: boolean;
  onToggleFxShowcase?: () => void;
  activeFxCount?: number;
}

function formatTimelineTick(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

export function BroadcastDock({
  mode,
  timelineHours,
  timelineIndex,
  onTimelineChange,
  isTimelinePlaying,
  onToggleTimelinePlay,
  timelineSpeed,
  onCycleTimelineSpeed,
  showRadar,
  radarFrames,
  radarFrameIndex,
  onRadarFrameChange,
  isRadarPlaying,
  onToggleRadarPlay,
  radarOpacity,
  onRadarOpacityChange,
  radarLoading,
  showWeatherFx = false,
  fxShowcase = false,
  onToggleFxShowcase,
  activeFxCount = 0,
}: BroadcastDockProps) {
  const hasTimeline = timelineHours.length > 1;
  const activeRadarFrame = radarFrames[radarFrameIndex];

  if (!hasTimeline && !showRadar && !showWeatherFx) return null;

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-[540px] flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/90 px-3.5 py-2.5 shadow-lg backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/90">
        {showWeatherFx && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 text-xs ${
              showRadar || hasTimeline
                ? 'border-b border-slate-100 pb-2 dark:border-slate-800'
                : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <CloudRain size={13} className="text-indigo-500 dark:text-indigo-400" />
              <span className="font-semibold text-slate-800 dark:text-slate-100">Weather FX</span>
              {fxShowcase ? (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  Preview Showcase
                </span>
              ) : (
                <span className="tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                  {activeFxCount > 0 ? `${activeFxCount} active` : 'Clear skies'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {onToggleFxShowcase && (
                <button
                  type="button"
                  onClick={onToggleFxShowcase}
                  aria-pressed={fxShowcase}
                  title="Preview all weather animations across US regions for testing"
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold transition ${
                    fxShowcase
                      ? 'bg-amber-500 text-white shadow-xs dark:bg-amber-400 dark:text-slate-950'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  <Sparkles size={11} />
                  <span>FX Showcase</span>
                </button>
              )}
            </div>
          </div>
        )}

        {showRadar && (
          <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-2 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleRadarPlay}
                  aria-label={isRadarPlaying ? 'Pause radar' : 'Play radar'}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-white hover:bg-sky-500 dark:bg-sky-500 dark:text-slate-950"
                >
                  {isRadarPlaying ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <div className="flex items-center gap-1.5">
                  <Radar size={13} className="text-sky-500" />
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {mode === 'live' ? 'NOAA MRMS Radar' : 'NEXRAD Archive'}
                  </span>
                  {radarLoading && (
                    <span className="text-[10px] text-sky-600 dark:text-sky-400">Loading...</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="tabular-nums text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {activeRadarFrame?.label ?? 'Syncing...'}
                </span>
                <label className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min={0.25}
                    max={0.95}
                    step={0.05}
                    value={radarOpacity}
                    onChange={(e) => onRadarOpacityChange(Number(e.target.value))}
                    className="w-14 accent-sky-500"
                  />
                </label>
              </div>
            </div>

            {radarFrames.length > 1 && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={radarFrames.length - 1}
                  value={radarFrameIndex}
                  onChange={(e) => onRadarFrameChange(Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-sky-500"
                />
                <div className="hidden items-center gap-1 text-[9px] text-slate-400 sm:flex">
                  <span>Lt</span>
                  <div
                    className="h-1.5 w-16 rounded-full"
                    style={{
                      background:
                        'linear-gradient(to right, #38bdf8, #22c55e, #facc15, #f97316, #ef4444, #a855f7)',
                    }}
                  />
                  <span>Hvy</span>
                </div>
              </div>
            )}
          </div>
        )}

        {hasTimeline && (
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onTimelineChange(Math.max(0, timelineIndex - 1))}
                aria-label="Previous time step"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <SkipBack size={13} />
              </button>
              <button
                type="button"
                onClick={onToggleTimelinePlay}
                aria-label={isTimelinePlaying ? 'Pause weather animation' : 'Play weather animation'}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
              >
                {isTimelinePlaying ? <Pause size={13} /> : <Play size={13} />}
              </button>
              <button
                type="button"
                onClick={() =>
                  onTimelineChange(Math.min(timelineHours.length - 1, timelineIndex + 1))
                }
                aria-label="Next time step"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <SkipForward size={13} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {mode === 'historical' ? 'Archive Sweep' : '48h Forecast Sweep'}
                </span>
                <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                  {formatTimelineTick(timelineHours[timelineIndex])}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={timelineHours.length - 1}
                value={timelineIndex}
                onChange={(e) => onTimelineChange(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer accent-slate-900 dark:accent-sky-400"
              />
            </div>

            <button
              type="button"
              onClick={onCycleTimelineSpeed}
              title="Animation playback speed"
              className="rounded-lg border border-slate-200 px-2 py-1 tabular-nums text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {timelineSpeed}x
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
