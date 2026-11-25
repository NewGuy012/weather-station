import { Download, FileJson, FileSpreadsheet, Image, Printer, X } from 'lucide-react';
import { useState } from 'react';
import type { StateDetailResponse, TempUnit, WeatherDatasetResponse } from '../../shared/types';
import { formatTemp, formatWind } from '../../shared/units';
import { getWmoInfo } from '../../shared/wmoCodes';
import {
  buildStateDetailCsv,
  buildStatesCsv,
  exportMapAsPng,
  getSortedStates,
  resolveActiveTimestamp,
  triggerDownload,
} from '../utils/exporters';
import { resolveStateSlice } from '../utils/scales';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  scope: 'national' | 'state';
  onScopeChange: (s: 'national' | 'state') => void;
  dataset: WeatherDatasetResponse | null;
  detail: StateDetailResponse | null;
  unit: TempUnit;
  timelineIndex: number;
  useTimeline: boolean;
  isDark: boolean;
  mapContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function ExportModal({
  open,
  onClose,
  scope,
  onScopeChange,
  dataset,
  detail,
  unit,
  timelineIndex,
  useTimeline,
  isDark,
  mapContainerRef,
}: ExportModalProps) {
  const [pngBusy, setPngBusy] = useState(false);
  const [pngError, setPngError] = useState<string | null>(null);

  if (!open || !dataset) return null;

  const activeScope = scope === 'state' && detail ? 'state' : 'national';
  const sortedStates = getSortedStates(dataset.states);

  const handleDownloadCsv = () => {
    if (activeScope === 'state' && detail) {
      const csv = buildStateDetailCsv(detail, unit);
      triggerDownload(`weather-${detail.code.toLowerCase()}.csv`, csv, 'text/csv;charset=utf-8');
    } else {
      const csv = buildStatesCsv(dataset, unit, timelineIndex, useTimeline);
      triggerDownload('us-50-states-weather.csv', csv, 'text/csv;charset=utf-8');
    }
  };

  const handleDownloadJson = () => {
    const payload = activeScope === 'state' && detail ? detail : dataset;
    const fname =
      activeScope === 'state' && detail
        ? `weather-${detail.code.toLowerCase()}.json`
        : 'us-50-states-weather.json';
    triggerDownload(fname, JSON.stringify(payload, null, 2), 'application/json');
  };

  const handleDownloadPng = async () => {
    if (!mapContainerRef.current) return;
    setPngBusy(true);
    setPngError(null);
    try {
      const ts = resolveActiveTimestamp(dataset, timelineIndex, useTimeline);
      await exportMapAsPng(
        mapContainerRef.current,
        'US Weather Station — 50-State Snapshot',
        `${dataset.mode === 'historical' ? 'Historical Archive' : 'Live Feed'} • ${ts}`,
        isDark,
      );
    } catch (err) {
      setPngError(err instanceof Error ? err.message : 'PNG export failed');
    } finally {
      setPngBusy(false);
    }
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Print & Export Weather Report
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate printable briefings or download structured datasets & map graphics
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scope selector + Quick Exports */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="flex items-center rounded-xl bg-slate-100 p-0.5 text-xs font-medium dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onScopeChange('national')}
              className={`rounded-lg px-3 py-1.5 transition ${
                activeScope === 'national'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              All 50 States (National)
            </button>
            <button
              type="button"
              disabled={!detail}
              onClick={() => onScopeChange('state')}
              className={`rounded-lg px-3 py-1.5 transition disabled:opacity-40 ${
                activeScope === 'state'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {detail ? `${detail.name} (${detail.code})` : 'Select a State to Enable'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet size={13} className="text-emerald-600" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <FileJson size={13} className="text-amber-600" />
              <span>JSON</span>
            </button>
            <button
              type="button"
              disabled={pngBusy}
              onClick={() => void handleDownloadPng()}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Image size={13} className="text-sky-600" />
              <span>{pngBusy ? 'Saving...' : 'Map PNG'}</span>
            </button>
          </div>
        </div>

        {/* Live Print Preview Table */}
        <div className="flex-1 overflow-y-auto bg-slate-50/70 p-5 dark:bg-slate-950/50">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xs">
            <div className="flex items-baseline justify-between border-b border-slate-200 pb-2">
              <div className="text-sm font-bold">
                {activeScope === 'state' && detail
                  ? `${detail.name} (${detail.code}) — ${detail.city}`
                  : '50-State Weather Briefing Preview'}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {dataset.startDate} → {dataset.endDate}
              </div>
            </div>

            {activeScope === 'state' && detail ? (
              <div className="mt-3 space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5">
                  <div>
                    <div className="text-[10px] text-slate-500">Current</div>
                    <div className="text-lg font-bold tabular-nums">
                      {formatTemp(detail.current.temperatureF, unit, true)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Condition</div>
                    <div className="font-medium">{getWmoInfo(detail.current.weatherCode).label}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Wind</div>
                    <div className="font-medium tabular-nums">
                      {formatWind(detail.current.windSpeedMph, unit)}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  Full printable sheet includes {detail.daily.length} daily rows, 24 hourly rows
                  {detail.alerts.length > 0 ? `, and ${detail.alerts.length} NWS alerts` : ''}.
                </p>
              </div>
            ) : (
              <div className="mt-3 max-h-64 overflow-y-auto">
                <table className="w-full text-left text-[11px] tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase">
                      <th className="py-1">State</th>
                      <th className="py-1">City</th>
                      <th className="py-1">Temp</th>
                      <th className="py-1">Condition</th>
                      <th className="py-1">Wind</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStates.slice(0, 15).map((snap) => {
                      const s = resolveStateSlice(snap, timelineIndex, useTimeline);
                      return (
                        <tr key={snap.code} className="border-b border-slate-100">
                          <td className="py-1 font-medium">
                            {snap.name} ({snap.code})
                          </td>
                          <td className="py-1 text-slate-500">{snap.city}</td>
                          <td className="py-1 font-semibold">
                            {formatTemp(s.temperatureF, unit, true)}
                          </td>
                          <td className="py-1">{getWmoInfo(s.weatherCode).shortLabel}</td>
                          <td className="py-1">{formatWind(s.windSpeedMph, unit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-2 text-center text-[10px] text-slate-400">
                  Showing 15 of 50 states in preview • All 50 states included in Print / PDF / CSV
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Download size={12} />
            <span className={pngError ? 'text-rose-500' : undefined}>
              {pngError ?? 'Ink-friendly white paper layout enabled for print'}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
            >
              <Printer size={14} />
              <span>Print / Save as PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
