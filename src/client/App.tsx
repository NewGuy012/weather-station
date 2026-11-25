import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_HISTORICAL_PRESET, HISTORICAL_PRESETS } from '../shared/presets';
import { STATE_BY_CODE, US_STATES } from '../shared/states';
import type {
  AlertsResponse,
  ColormapId,
  MetricLayer,
  RadarFrame,
  RadarFramesResponse,
  StateCitiesWeatherResponse,
  StateDetailResponse,
  TempUnit,
  ThemeMode,
  TopCityMeta,
  WeatherDatasetResponse,
  WeatherMode,
} from '../shared/types';
import {
  classifySnapshotPhenomenon,
  hasActiveMapFx,
} from '../shared/weatherPhenomena';
import { isEditableTarget } from './utils/mapViewport';
import { COLORMAP_BY_ID, getNextColormapId, resolveStateSlice } from './utils/scales';
import { BroadcastDock } from './components/BroadcastDock';
import { DopplerRadarOverlay } from './components/DopplerRadarOverlay';
import { ExportModal } from './components/ExportModal';
import { ExtremesBar } from './components/ExtremesBar';
import { MapCanvas } from './components/MapCanvas';
import { MetricToolbar } from './components/MetricToolbar';
import { PrintSheet } from './components/PrintSheet';
import { StateDrawer } from './components/StateDrawer';
import { TopBar } from './components/TopBar';
import { WeatherEffectsOverlay } from './components/WeatherEffectsOverlay';
import { WindOverlay } from './components/WindOverlay';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted browsing contexts
  }
}

function getInitialTheme(): ThemeMode {
  const saved = readStorage('ws-theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function getInitialColormap(): ColormapId {
  const saved = readStorage('ws-colormap') as ColormapId | null;
  return saved && saved in COLORMAP_BY_ID ? saved : 'default';
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

async function fetchApiJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [mode, setMode] = useState<WeatherMode>('historical');
  const [unit, setUnit] = useState<TempUnit>('F');
  const [metric, setMetric] = useState<MetricLayer>('temperature');
  const [colormap, setColormap] = useState<ColormapId>(getInitialColormap);
  const [reverseColormap, setReverseColormap] = useState(() => readStorage('ws-colormap-reverse') === '1');

  const [startDate, setStartDate] = useState(DEFAULT_HISTORICAL_PRESET.startDate);
  const [endDate, setEndDate] = useState(DEFAULT_HISTORICAL_PRESET.endDate);
  const [activePresetId, setActivePresetId] = useState<string | undefined>(
    DEFAULT_HISTORICAL_PRESET.id,
  );

  const [dataset, setDataset] = useState<WeatherDatasetResponse | null>(null);
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
  const refreshCitiesPendingRef = useRef(false);
  const [mapViewModified, setMapViewModified] = useState(false);
  const [mapResetTrigger, setMapResetTrigger] = useState(0);

  const [timelineIndex, setTimelineIndex] = useState<number>(
    DEFAULT_HISTORICAL_PRESET.defaultFrameIndex ?? 30,
  );
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [timelineSpeed, setTimelineSpeed] = useState<number>(1);

  const [showRadar, setShowRadar] = useState(false);
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [isRadarPlaying, setIsRadarPlaying] = useState(true);
  const [radarOpacity, setRadarOpacity] = useState(0.75);
  const [radarLoading, setRadarLoading] = useState(false);

  const [showWind, setShowWind] = useState(false);
  const [showWeatherFx, setShowWeatherFx] = useState(false);
  const [fxShowcase, setFxShowcase] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [showAlertPolygons, setShowAlertPolygons] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'national' | 'state'>('national');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const datasetAbortRef = useRef<AbortController | null>(null);

  const selectedMeta = selectedCode ? STATE_BY_CODE[selectedCode] ?? null : null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    writeStorage('ws-theme', theme);
  }, [theme]);

  useEffect(() => {
    writeStorage('ws-colormap', colormap);
  }, [colormap]);

  useEffect(() => {
    writeStorage('ws-colormap-reverse', reverseColormap ? '1' : '0');
  }, [reverseColormap]);

  useEffect(() => {
    if (exportOpen) return;
    const handleColormapShortcut = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isEditableTarget(e.target)) return;
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
    const controller = new AbortController();
    fetchApiJson<{ topCitiesByState?: Record<string, TopCityMeta[]> }>('/api/meta', controller.signal)
      .then((data) => {
        if (data.topCitiesByState) setTopCitiesByState(data.topCitiesByState);
      })
      .catch(() => {});
    return () => controller.abort();
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
      datasetAbortRef.current?.abort();
      const controller = new AbortController();
      datasetAbortRef.current = controller;

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

        const json = await fetchApiJson<WeatherDatasetResponse>(
          `/api/states?${params.toString()}`,
          controller.signal,
        );
        setDataset(json);

        if (opts.targetMode === 'historical') {
          const fallbackIdx =
            opts.defaultFrame ??
            Math.min(Math.floor(json.timelineHours.length / 2), json.timelineHours.length - 1);
          setTimelineIndex(Math.max(0, fallbackIdx));
        } else {
          setTimelineIndex(0);
          fetchApiJson<AlertsResponse>(
            `/api/alerts${opts.refresh ? '?refresh=1' : ''}`,
            controller.signal,
          )
            .then(setAlertsData)
            .catch(() => {});
        }
      } catch (err) {
        if (!isAbortError(err)) {
          setErrorMsg(err instanceof Error ? err.message : 'Unable to load weather dataset');
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadDataset({
      targetMode: 'historical',
      start: DEFAULT_HISTORICAL_PRESET.startDate,
      end: DEFAULT_HISTORICAL_PRESET.endDate,
      presetId: DEFAULT_HISTORICAL_PRESET.id,
      defaultFrame: DEFAULT_HISTORICAL_PRESET.defaultFrameIndex,
    });
    return () => datasetAbortRef.current?.abort();
  }, [loadDataset]);

  useEffect(() => {
    if (!isTimelinePlaying || !dataset?.timelineHours.length) return;
    const total = dataset.timelineHours.length;
    const id = window.setInterval(() => {
      setTimelineIndex((prev) => (prev + 1) % total);
    }, Math.round(520 / timelineSpeed));
    return () => window.clearInterval(id);
  }, [isTimelinePlaying, dataset, timelineSpeed]);

  // Bucket historical radar anchor to 6h intervals to avoid refetching on every 1h frame step
  const radarAnchor = useMemo(() => {
    if (mode === 'live') return 'live';
    const ts = dataset?.timelineHours[timelineIndex];
    if (!ts) return `${startDate}T18:00:00Z`;
    const bucketHour = Math.floor(Number(ts.slice(11, 13)) / 6) * 6;
    return `${ts.slice(0, 11)}${String(bucketHour).padStart(2, '0')}:00:00Z`;
  }, [mode, dataset, timelineIndex, startDate]);

  useEffect(() => {
    if (!showRadar) return;
    const controller = new AbortController();
    setRadarLoading(true);
    const params = new URLSearchParams({ mode });
    if (mode === 'historical') params.set('anchor', radarAnchor);

    fetchApiJson<RadarFramesResponse>(`/api/radar/frames?${params.toString()}`, controller.signal)
      .then((res) => {
        setRadarFrames(res.frames);
        setRadarFrameIndex(Math.max(0, res.frames.length - 1));
      })
      .catch((err) => {
        if (!isAbortError(err)) setRadarFrames([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRadarLoading(false);
      });

    return () => controller.abort();
  }, [showRadar, mode, radarAnchor]);

  useEffect(() => {
    if (!showRadar || !isRadarPlaying || radarFrames.length < 2) return;
    const id = window.setInterval(() => {
      setRadarFrameIndex((prev) => (prev + 1) % radarFrames.length);
    }, 700);
    return () => window.clearInterval(id);
  }, [showRadar, isRadarPlaying, radarFrames.length]);

  const handleSelectState = useCallback((code: string | null) => {
    setSelectedCode(code);
    if (!code) {
      setStateDetail(null);
      setSelectedCity('');
      return;
    }
    setSelectedCity(STATE_BY_CODE[code]?.primaryCity ?? '');
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    const controller = new AbortController();
    setDetailLoading(true);
    const params = new URLSearchParams({ mode });
    if (selectedCity) params.set('city', selectedCity);
    if (mode === 'historical') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }

    fetchApiJson<StateDetailResponse>(
      `/api/state/${selectedCode}?${params.toString()}`,
      controller.signal,
    )
      .then(setStateDetail)
      .catch((err) => {
        if (!isAbortError(err)) setStateDetail(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [selectedCode, selectedCity, mode, startDate, endDate]);

  useEffect(() => {
    if (!detailedStateMode || !selectedCode) {
      setStateCitiesWeather(null);
      setCitiesLoading(false);
      setCitiesError(null);
      return;
    }

    const controller = new AbortController();
    setCitiesLoading(true);
    setCitiesError(null);

    const params = new URLSearchParams({ mode });
    if (mode === 'historical') {
      if (activePresetId) params.set('preset', activePresetId);
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    if (refreshCitiesPendingRef.current) {
      params.set('refresh', '1');
    }

    fetchApiJson<StateCitiesWeatherResponse>(
      `/api/state/${selectedCode}/cities?${params.toString()}`,
      controller.signal,
    )
      .then((res) => {
        refreshCitiesPendingRef.current = false;
        setStateCitiesWeather(res);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        refreshCitiesPendingRef.current = false;
        setStateCitiesWeather(null);
        setCitiesError(
          err instanceof Error ? err.message : 'Unable to load top 10 cities weather',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCitiesLoading(false);
      });

    return () => controller.abort();
  }, [detailedStateMode, selectedCode, mode, startDate, endDate, activePresetId, citiesRefreshCount]);

  const handleToggleDetailedStateMode = useCallback(() => {
    setDetailedStateMode((prev) => !prev);
  }, []);

  const handleToggleWeatherFx = useCallback(() => {
    setShowWeatherFx((prev) => !prev);
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

  const activeFxCount = useMemo(() => {
    if (!showWeatherFx || !dataset || fxShowcase) return 0;
    const alerts = mode === 'live' ? alertsData?.byState : undefined;
    let count = 0;
    for (const snap of Object.values(dataset.states)) {
      const slice = resolveStateSlice(snap, timelineIndex, useTimeline);
      const res = classifySnapshotPhenomenon(slice, snap.current, alerts?.[snap.code], metric);
      if (hasActiveMapFx(res.phenomenon, metric)) count++;
    }
    return count;
  }, [showWeatherFx, dataset, fxShowcase, mode, alertsData, timelineIndex, useTimeline, metric]);

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
        statesMeta={US_STATES}
        onSelectState={(code) => handleSelectState(code)}
        onRefresh={() => {
          if (detailedStateMode && selectedCode) {
            refreshCitiesPendingRef.current = true;
            setCitiesRefreshCount((c) => c + 1);
          }
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

      {dataset && (
        <div className="pointer-events-none fixed right-3 bottom-3 z-20">
          <ExtremesBar
            states={dataset.states}
            unit={unit}
            timelineIndex={timelineIndex}
            useTimeline={useTimeline}
            onSelectState={(c) => handleSelectState(c)}
            dockedToDrawer={Boolean(selectedCode && selectedMeta && dataset.states[selectedCode])}
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
            resetTrigger={mapResetTrigger}
            onViewModifiedChange={setMapViewModified}
            onZoomChange={setMapZoom}
            showWeatherFx={showWeatherFx}
            onToggleWeatherFx={handleToggleWeatherFx}
            fxShowcase={fxShowcase}
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
                <WeatherEffectsOverlay
                  visible={showWeatherFx}
                  states={dataset.states}
                  metric={metric}
                  timelineIndex={timelineIndex}
                  useTimeline={useTimeline}
                  isDark={theme === 'dark'}
                  showcase={fxShowcase}
                  alertsByState={mode === 'live' ? alertsData?.byState : undefined}
                  detailedStateMode={detailedStateMode}
                  selectedCode={selectedCode}
                  stateCitiesWeather={stateCitiesWeather}
                  zoom={mapZoom}
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
        showWeatherFx={showWeatherFx}
        onToggleWeatherFx={handleToggleWeatherFx}
        fxShowcase={fxShowcase}
        showAlertPolygons={showAlertPolygons}
        onToggleAlertPolygons={() => setShowAlertPolygons((v) => !v)}
        alertsCount={alertsData?.totalActive ?? 0}
        canResetView={mapViewModified}
        onResetView={() => setMapResetTrigger((n) => n + 1)}
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
          showWeatherFx={showWeatherFx}
          fxShowcase={fxShowcase}
          onToggleFxShowcase={() => setFxShowcase((v) => !v)}
          activeFxCount={activeFxCount}
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
