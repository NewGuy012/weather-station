import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_HISTORICAL_PRESET, HISTORICAL_PRESETS } from '../shared/presets';
import type {
  AlertsResponse,
  ColormapId,
  MetricLayer,
  RadarFrame,
  RadarFramesResponse,
  StateCitiesWeatherResponse,
  StateDetailResponse,
  StateMeta,
  TempUnit,
  ThemeMode,
  TopCityMeta,
  WeatherDatasetResponse,
  WeatherMode,
} from '../shared/types';
import { isEditableTarget } from './utils/mapViewport';
import { COLORMAP_BY_ID, getNextColormapId } from './utils/scales';
import { BroadcastDock } from './components/BroadcastDock';
import { DopplerRadarOverlay } from './components/DopplerRadarOverlay';
import { ExportModal } from './components/ExportModal';
import { ExtremesBar } from './components/ExtremesBar';
import { MapCanvas } from './components/MapCanvas';
import { MetricToolbar } from './components/MetricToolbar';
import { PrintSheet } from './components/PrintSheet';
import { StateDrawer } from './components/StateDrawer';
import { TopBar } from './components/TopBar';
import { WindOverlay } from './components/WindOverlay';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem('ws-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialColormap(): ColormapId {
  if (typeof window === 'undefined') return 'default';
  const saved = window.localStorage.getItem('ws-colormap') as ColormapId | null;
  return saved && saved in COLORMAP_BY_ID ? saved : 'default';
}

function getInitialReverseColormap(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem('ws-colormap-reverse') === '1';
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [mode, setMode] = useState<WeatherMode>('historical');
  const [unit, setUnit] = useState<TempUnit>('F');
  const [metric, setMetric] = useState<MetricLayer>('temperature');
  const [colormap, setColormap] = useState<ColormapId>(getInitialColormap);
  const [reverseColormap, setReverseColormap] = useState<boolean>(getInitialReverseColormap);

  const [startDate, setStartDate] = useState(DEFAULT_HISTORICAL_PRESET.startDate);
  const [endDate, setEndDate] = useState(DEFAULT_HISTORICAL_PRESET.endDate);
  const [activePresetId, setActivePresetId] = useState<string | undefined>(
    DEFAULT_HISTORICAL_PRESET.id,
  );

  const [dataset, setDataset] = useState<WeatherDatasetResponse | null>(null);
  const [statesMeta, setStatesMeta] = useState<StateMeta[]>([]);
  const [topCitiesByState, setTopCitiesByState] = useState<Record<string, TopCityMeta[]>>({});
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [stateDetail, setStateDetail] = useState<StateDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [compareCodes, setCompareCodes] = useState<string[]>([]);

  const [detailedStateMode, setDetailedStateMode] = useState(false);
  const [stateCitiesWeather, setStateCitiesWeather] = useState<StateCitiesWeatherResponse | null>(null);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState<string | null>(null);
  const [citiesRefreshCount, setCitiesRefreshCount] = useState(0);
  const lastHandledRefreshRef = useRef(0);

  // Broadcast timeline animation state
  const [timelineIndex, setTimelineIndex] = useState<number>(
    DEFAULT_HISTORICAL_PRESET.defaultFrameIndex ?? 30,
  );
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState<number>(1);

  // Doppler radar & wind flow overlay state
  const [showRadar, setShowRadar] = useState(false);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [isRadarPlaying, setIsRadarPlaying] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.75);
  const [radarLoading, setRadarLoading] = useState(false);

  const [showWind, setShowWind] = useState(false);
  const [showAlertPolygons, setShowAlertPolygons] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'national' | 'state'>('national');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedMeta = useMemo(
    () => (selectedCode ? statesMeta.find((s) => s.code === selectedCode) ?? null : null),
    [selectedCode, statesMeta],
  );

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('ws-theme', theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('ws-colormap', colormap);
  }, [colormap]);

  useEffect(() => {
    window.localStorage.setItem('ws-colormap-reverse', reverseColormap ? '1' : '0');
  }, [reverseColormap]);

  useEffect(() => {
    if (exportOpen) return;
    const handleColormapShortcut = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      if (isEditableTarget(e.target)) return;
      if (e.key.toLowerCase() !== 'c') return;
      e.preventDefault();
      if (e.shiftKey) {
        setReverseColormap((r) => !r);
      } else {
        setColormap((c) => getNextColormapId(c));
      }
    };
    window.addEventListener('keydown', handleColormapShortcut);
    return () => window.removeEventListener('keydown', handleColormapShortcut);
  }, [exportOpen]);

  useEffect(() => {
    fetch('/api/meta')
      .then((r) => r.json())
      .then((data: { states: StateMeta[]; topCitiesByState?: Record<string, TopCityMeta[]> }) => {
        setStatesMeta(data.states);
        if (data.topCitiesByState) {
          setTopCitiesByState(data.topCitiesByState);
        }
      })
      .catch(() => {});
  }, []);

  const loadDataset = useCallback(
    async (opts: {
      targetMode: WeatherMode;
      start?: string;
      end?: string;
      presetId?: string;
      refresh?: boolean;
      defaultFrame?: number;
    }) => {
      setIsLoading(true);
      setErrorMsg(null);
      setIsTimelinePlaying(false);
      try {
        const params = new URLSearchParams({ mode: opts.targetMode });
        if (opts.targetMode === 'historical') {
          if (opts.presetId) params.set('preset', opts.presetId);
          if (opts.start) params.set('startDate', opts.start);
          if (opts.end) params.set('endDate', opts.end);
        }
        if (opts.refresh) params.set('refresh', '1');

        const res = await fetch(`/api/states?${params.toString()}`);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Failed to load weather (${res.status})`);
        }
        const json = (await res.json()) as WeatherDatasetResponse;
        setDataset(json);

        if (opts.targetMode === 'historical') {
          const fallbackIdx =
            opts.defaultFrame ??
            Math.min(Math.floor(json.timelineHours.length / 2), json.timelineHours.length - 1);
          setTimelineIndex(Math.max(0, fallbackIdx));
        } else {
          setTimelineIndex(0);
          fetch(`/api/alerts${opts.refresh ? '?refresh=1' : ''}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((a: AlertsResponse | null) => setAlertsData(a))
            .catch(() => {});
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load weather dataset');
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  // Initial boot in Historical Mode
  useEffect(() => {
    void loadDataset({
      targetMode: 'historical',
      start: DEFAULT_HISTORICAL_PRESET.startDate,
      end: DEFAULT_HISTORICAL_PRESET.endDate,
      presetId: DEFAULT_HISTORICAL_PRESET.id,
      defaultFrame: DEFAULT_HISTORICAL_PRESET.defaultFrameIndex,
    });
  }, [loadDataset]);

  // Weather front broadcast playback timer
  useEffect(() => {
    if (!isTimelinePlaying || !dataset?.timelineHours.length) return;
    const total = dataset.timelineHours.length;
    const intervalMs = Math.round(520 / timelineSpeed);
    const id = window.setInterval(() => {
      setTimelineIndex((prev) => (prev + 1) % total);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isTimelinePlaying, dataset, timelineSpeed]);

  // Fetch Doppler radar frames when Radar layer is active
  const radarAnchor = useMemo(() => {
    if (mode === 'live') return 'live';
    const ts = dataset?.timelineHours[timelineIndex];
    // Re-anchor radar frames per timeline day/6h bucket to avoid excessive refetch during playback
    return ts ? ts.slice(0, 13) + ':00:00Z' : `${startDate}T18:00:00Z`;
  }, [mode, dataset, timelineIndex, startDate]);

  useEffect(() => {
    if (!showRadar) return;
    let cancelled = false;
    setRadarLoading(true);
    const params = new URLSearchParams({ mode });
    if (mode === 'historical') {
      params.set('anchor', radarAnchor);
    }

    fetch(`/api/radar/frames?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((res: RadarFramesResponse) => {
        if (cancelled) return;
        setRadarFrames(res.frames);
        setRadarFrameIndex(Math.max(0, res.frames.length - 1));
      })
      .catch(() => {
        if (!cancelled) setRadarFrames([]);
      })
      .finally(() => {
        if (!cancelled) setRadarLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showRadar, mode, radarAnchor]);

  // Doppler radar animation loop
  useEffect(() => {
    if (!showRadar || !isRadarPlaying || radarFrames.length < 2) return;
    const id = window.setInterval(() => {
      setRadarFrameIndex((prev) => (prev + 1) % radarFrames.length);
    }, 700);
    return () => window.clearInterval(id);
  }, [showRadar, isRadarPlaying, radarFrames.length]);

  const handleSelectState = useCallback(
    (code: string | null) => {
      setSelectedCode(code);
      if (!code) {
        setStateDetail(null);
        setSelectedCity('');
        return;
      }
      const meta = statesMeta.find((s) => s.code === code);
      setSelectedCity(meta?.primaryCity ?? '');
    },
    [statesMeta],
  );

  useEffect(() => {
    if (!selectedCode) return;
    let cancelled = false;
    setDetailLoading(true);
    const params = new URLSearchParams({ mode });
    if (selectedCity) params.set('city', selectedCity);
    if (mode === 'historical') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }

    fetch(`/api/state/${selectedCode}?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: StateDetailResponse) => {
        if (!cancelled) setStateDetail(d);
      })
      .catch(() => {
        if (!cancelled) setStateDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCode, selectedCity, mode, startDate, endDate]);

  useEffect(() => {
    if (!detailedStateMode || !selectedCode) {
      setStateCitiesWeather(null);
      setCitiesLoading(false);
      setCitiesError(null);
      return;
    }

    let cancelled = false;
    setCitiesLoading(true);
    setCitiesError(null);
    const shouldRefresh = citiesRefreshCount > lastHandledRefreshRef.current;
    lastHandledRefreshRef.current = citiesRefreshCount;

    const params = new URLSearchParams({ mode });
    if (mode === 'historical') {
      if (activePresetId) params.set('preset', activePresetId);
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    if (shouldRefresh) params.set('refresh', '1');

    fetch(`/api/state/${selectedCode}/cities?${params.toString()}`)
      .then(async (r) => {
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Failed to load cities (${r.status})`);
        }
        return (await r.json()) as StateCitiesWeatherResponse;
      })
      .then((res) => {
        if (!cancelled) setStateCitiesWeather(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setStateCitiesWeather(null);
          setCitiesError(
            err instanceof Error ? err.message : 'Unable to load top 10 cities weather',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setCitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailedStateMode, selectedCode, mode, startDate, endDate, activePresetId, citiesRefreshCount]);

  const handleToggleDetailedStateMode = useCallback(() => {
    setDetailedStateMode((prev) => !prev);
  }, []);

  const handleToggleCompare = useCallback((code: string) => {
    setCompareCodes((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 3) return [...prev.slice(1), code];
      return [...prev, code];
    });
  }, []);

  const handleModeChange = (nextMode: WeatherMode) => {
    setMode(nextMode);
    if (nextMode === 'live') {
      void loadDataset({ targetMode: 'live' });
    } else {
      void loadDataset({
        targetMode: 'historical',
        start: startDate,
        end: endDate,
        presetId: activePresetId,
      });
    }
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = HISTORICAL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setStartDate(preset.startDate);
    setEndDate(preset.endDate);
    setMode('historical');
    void loadDataset({
      targetMode: 'historical',
      start: preset.startDate,
      end: preset.endDate,
      presetId: preset.id,
      defaultFrame: preset.defaultFrameIndex,
    });
  };

  const handleCustomDates = (s: string, e: string) => {
    setActivePresetId(undefined);
    setStartDate(s);
    setEndDate(e);
    setMode('historical');
    void loadDataset({
      targetMode: 'historical',
      start: s,
      end: e,
    });
  };

  const useTimeline = mode === 'historical' || isTimelinePlaying || timelineIndex > 0;

  const sourceLabel = dataset
    ? mode === 'historical'
      ? dataset.presetLabel ?? 'Historical Archive'
      : `Live NOAA/Open-Meteo ${dataset.cached ? '• Cached' : '• Fresh'}`
    : 'Loading 50-state archive...';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        unit={unit}
        onUnitChange={setUnit}
        theme={theme}
        onThemeToggle={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        startDate={startDate}
        endDate={endDate}
        activePresetId={activePresetId}
        onSelectPreset={handleSelectPreset}
        onSelectCustomDates={handleCustomDates}
        statesMeta={statesMeta}
        onSelectState={(code) => handleSelectState(code)}
        onRefresh={() => {
          setCitiesRefreshCount((c) => c + 1);
          void loadDataset({ targetMode: mode, start: startDate, end: endDate, refresh: true });
        }}
        onOpenExport={() => {
          setExportScope(selectedCode ? 'state' : 'national');
          setExportOpen(true);
        }}
        isLoading={isLoading}
        sourceLabel={sourceLabel}
      />

      {errorMsg && (
        <div className="fixed top-20 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 shadow-md dark:border-rose-500/40 dark:bg-rose-950/90 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Extremes pill positioned cleanly top-right below header when drawer is closed */}
      {dataset && !selectedCode && (
        <div className="pointer-events-none fixed top-20 right-4 z-20">
          <ExtremesBar
            states={dataset.states}
            unit={unit}
            timelineIndex={timelineIndex}
            useTimeline={useTimeline}
            onSelectState={(c) => handleSelectState(c)}
          />
        </div>
      )}

      <main className="h-full w-full pt-16 pb-24">
        {dataset ? (
          <MapCanvas
            states={dataset.states}
            metric={metric}
            colormap={colormap}
            reverseColormap={reverseColormap}
            unit={unit}
            isDark={theme === 'dark'}
            timelineIndex={timelineIndex}
            useTimeline={useTimeline}
            selectedCode={selectedCode}
            onSelectState={handleSelectState}
            alertsByState={mode === 'live' ? alertsData?.byState : undefined}
            alertPolygons={mode === 'live' ? alertsData?.featuresGeoJson : null}
            showAlertPolygons={mode === 'live' && showAlertPolygons}
            shortcutsEnabled={!exportOpen}
            detailedStateMode={detailedStateMode}
            onToggleDetailedStateMode={handleToggleDetailedStateMode}
            stateCitiesWeather={stateCitiesWeather}
            fallbackTopCities={selectedCode ? topCitiesByState[selectedCode] ?? [] : []}
            citiesLoading={citiesLoading}
            selectedCity={selectedCity || selectedMeta?.primaryCity || ''}
            onSelectCity={setSelectedCity}
            mapContainerRef={mapContainerRef}
            overlays={
              <>
                <DopplerRadarOverlay
                  visible={showRadar}
                  mode={mode}
                  frames={radarFrames}
                  activeFrameIndex={radarFrameIndex}
                  opacity={radarOpacity}
                  onLoadingChange={setRadarLoading}
                />
                <WindOverlay
                  visible={showWind}
                  states={dataset.states}
                  timelineIndex={timelineIndex}
                  useTimeline={useTimeline}
                  isDark={theme === 'dark'}
                />
              </>
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Loading 50-state weather map...
          </div>
        )}
      </main>

      {selectedCode && selectedMeta && dataset?.states[selectedCode] && (
        <StateDrawer
          meta={selectedMeta}
          snapshot={dataset.states[selectedCode]!}
          detail={stateDetail}
          isLoading={detailLoading}
          mode={mode}
          unit={unit}
          metric={metric}
          timelineIndex={timelineIndex}
          useTimeline={useTimeline}
          selectedCity={selectedCity || selectedMeta.primaryCity}
          onSelectCity={setSelectedCity}
          compareCodes={compareCodes}
          onToggleCompare={handleToggleCompare}
          allStates={dataset.states}
          onSelectState={(code) => handleSelectState(code)}
          onPrintState={() => {
            setExportScope('state');
            setExportOpen(true);
          }}
          onClose={() => handleSelectState(null)}
          detailedStateMode={detailedStateMode}
          onToggleDetailedStateMode={handleToggleDetailedStateMode}
          citiesWeather={stateCitiesWeather}
          citiesLoading={citiesLoading}
          citiesError={citiesError}
          fallbackTopCities={topCitiesByState[selectedCode] ?? []}
        />
      )}

      <MetricToolbar
        metric={metric}
        onMetricChange={setMetric}
        colormap={colormap}
        onColormapChange={setColormap}
        reverseColormap={reverseColormap}
        onToggleReverseColormap={() => setReverseColormap((r) => !r)}
        unit={unit}
        mode={mode}
        showRadar={showRadar}
        onToggleRadar={() => setShowRadar((v) => !v)}
        showWind={showWind}
        onToggleWind={() => setShowWind((v) => !v)}
        showAlertPolygons={showAlertPolygons}
        onToggleAlertPolygons={() => setShowAlertPolygons((v) => !v)}
        alertsCount={alertsData?.totalActive ?? 0}
      />

      {dataset && (
        <BroadcastDock
          mode={mode}
          timelineHours={dataset.timelineHours}
          timelineIndex={timelineIndex}
          onTimelineChange={(idx) => {
            setIsTimelinePlaying(false);
            setTimelineIndex(idx);
          }}
          isTimelinePlaying={isTimelinePlaying}
          onToggleTimelinePlay={() => setIsTimelinePlaying((p) => !p)}
          timelineSpeed={timelineSpeed}
          onCycleTimelineSpeed={() =>
            setTimelineSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))
          }
          showRadar={showRadar}
          radarFrames={radarFrames}
          radarFrameIndex={radarFrameIndex}
          onRadarFrameChange={(idx) => {
            setIsRadarPlaying(false);
            setRadarFrameIndex(idx);
          }}
          isRadarPlaying={isRadarPlaying}
          onToggleRadarPlay={() => setIsRadarPlaying((p) => !p)}
          radarOpacity={radarOpacity}
          onRadarOpacityChange={setRadarOpacity}
          radarLoading={radarLoading}
        />
      )}

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        scope={exportScope}
        onScopeChange={setExportScope}
        dataset={dataset}
        detail={stateDetail}
        unit={unit}
        timelineIndex={timelineIndex}
        useTimeline={useTimeline}
        isDark={theme === 'dark'}
        mapContainerRef={mapContainerRef}
      />

      <PrintSheet
        scope={exportScope}
        dataset={dataset}
        detail={stateDetail}
        unit={unit}
        timelineIndex={timelineIndex}
        useTimeline={useTimeline}
      />
    </div>
  );
}
