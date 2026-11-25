import {
  Calendar,
  Compass,
  Moon,
  Printer,
  Radio,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HISTORICAL_PRESETS } from '../../shared/presets';
import type { StateMeta, TempUnit, ThemeMode, WeatherMode } from '../../shared/types';
import { isEditableTarget } from '../utils/mapViewport';

interface TopBarProps {
  mode: WeatherMode;
  onModeChange: (mode: WeatherMode) => void;
  unit: TempUnit;
  onUnitChange: (unit: TempUnit) => void;
  theme: ThemeMode;
  onThemeToggle: () => void;
  startDate: string;
  endDate: string;
  activePresetId?: string;
  onSelectPreset: (presetId: string) => void;
  onSelectCustomDates: (startDate: string, endDate: string) => void;
  statesMeta: StateMeta[];
  onSelectState: (code: string) => void;
  onRefresh: () => void;
  onOpenExport: () => void;
  isLoading: boolean;
  sourceLabel: string;
}

export function TopBar({
  mode,
  onModeChange,
  unit,
  onUnitChange,
  theme,
  onThemeToggle,
  startDate,
  endDate,
  activePresetId,
  onSelectPreset,
  onSelectCustomDates,
  statesMeta,
  onSelectState,
  onRefresh,
  onOpenExport,
  isLoading,
  sourceLabel,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomStart(startDate);
    setCustomEnd(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!dateMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target as Node)) {
        setDateMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [dateMenuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 20);
      } else if (e.key === '/' && !isEditableTarget(e.target)) {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 20);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setDateMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return statesMeta.slice(0, 8);
    return statesMeta
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase() === q ||
          s.primaryCity.toLowerCase().includes(q) ||
          s.cities.some((c) => c.name.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [searchQuery, statesMeta]);

  return (
    <header className="no-print pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-[1380px] flex-nowrap items-center justify-between gap-1.5 rounded-2xl border border-slate-200/80 bg-white/85 px-2.5 py-2 shadow-sm backdrop-blur-md lg:gap-2 lg:px-3 dark:border-slate-700/60 dark:bg-slate-900/85">
        <div className="flex min-w-0 shrink items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950">
            <Compass size={17} />
          </div>
          <div className="hidden min-w-0 md:block">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight text-slate-900 dark:text-white">
                US Weather Station
              </h1>
              <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 xl:inline-block dark:bg-slate-800 dark:text-slate-300">
                50 States
              </span>
            </div>
            <p className="hidden truncate text-[11px] text-slate-500 lg:block dark:text-slate-400">
              {sourceLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 lg:gap-2">
          <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onModeChange('historical')}
              aria-label="Historical mode"
              title="Historical mode"
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap transition ${
                mode === 'historical'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Calendar size={13} />
              <span className="hidden md:inline">Historical</span>
            </button>
            <button
              type="button"
              onClick={() => onModeChange('live')}
              aria-label="Live mode"
              title="Live mode"
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap transition ${
                mode === 'live'
                  ? 'bg-white text-sky-700 shadow-xs dark:bg-sky-500/20 dark:text-sky-300'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <Radio size={13} className={mode === 'live' ? 'animate-pulse text-emerald-500' : ''} />
              <span className="hidden md:inline">Live</span>
            </button>
          </div>

          {mode === 'historical' && (
            <div ref={dateMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setDateMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 lg:px-2.5 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Calendar size={13} className="shrink-0 text-sky-500" />
                <span className="tabular-nums">
                  {startDate} → {endDate}
                </span>
              </button>

              {dateMenuOpen && (
                <div className="absolute top-11 left-0 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                    Curated Archive Events
                  </div>
                  <div className="mt-1.5 flex flex-col gap-1">
                    {HISTORICAL_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectPreset(p.id);
                          setDateMenuOpen(false);
                        }}
                        className={`rounded-xl px-2.5 py-2 text-left transition ${
                          activePresetId === p.id
                            ? 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:ring-sky-500/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="text-xs font-semibold">{p.label}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {p.subtitle}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                      Custom Date Range (1940–Present, ≤10d)
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        value={customStart}
                        min="1940-01-01"
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                      <input
                        type="date"
                        value={customEnd}
                        min="1940-01-01"
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCustomDates(customStart, customEnd);
                        setDateMenuOpen(false);
                      }}
                      className="mt-2 w-full rounded-lg bg-slate-900 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                    >
                      Load Historical Window
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative shrink-0">
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs lg:px-2.5 dark:border-slate-700 dark:bg-slate-800/80">
              <Search size={13} className="shrink-0 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 160)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Find state or city..."
                className="w-20 bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none lg:w-32 xl:w-40 dark:text-slate-100"
              />
              <kbd className="hidden rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-400 xl:inline dark:bg-slate-700">
                ⌘K
              </kbd>
            </div>

            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-10 right-0 z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {searchResults.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelectState(s.code);
                      setSearchQuery('');
                      setSearchOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{s.name}</span>
                      <span className="ml-1.5 text-[11px] text-slate-400">{s.primaryCity}</span>
                    </div>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {s.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1 lg:gap-1.5">
          {mode === 'live' && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh live weather data"
              className="shrink-0 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            </button>
          )}

          <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-0.5 text-xs font-semibold dark:bg-slate-800">
            <button
              type="button"
              onClick={() => onUnitChange('F')}
              className={`rounded-lg px-2 py-1 transition ${
                unit === 'F'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              °F
            </button>
            <button
              type="button"
              onClick={() => onUnitChange('C')}
              className={`rounded-lg px-2 py-1 transition ${
                unit === 'C'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              °C
            </button>
          </div>

          <button
            type="button"
            onClick={onThemeToggle}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
            title={`Switch to ${theme === 'light' ? 'Dark Broadcast' : 'Light Minimal'} theme`}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium whitespace-nowrap text-slate-700 hover:bg-slate-50 lg:px-2.5 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {theme === 'light' ? <Moon size={14} /> : <Sun size={14} className="text-amber-400" />}
            <span className="hidden lg:inline">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenExport}
            aria-label="Print / Export"
            title="Print / Export"
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-slate-800 lg:px-3 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
          >
            <Printer size={14} />
            <span className="hidden lg:inline">Print / Export</span>
          </button>
        </div>
      </div>
    </header>
  );
}
