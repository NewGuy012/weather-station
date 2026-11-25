import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DEFAULT_HISTORICAL_PRESET, HISTORICAL_PRESETS } from '../shared/presets';
import { buildHistoricalRadarFrames } from '../shared/radar';
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
  WeatherDatasetResponse,
  WeatherMode,
} from '../shared/types';
import { classifyStatesPhenomena, hasActiveMapFx } from '../shared/weatherPhenomena';
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

const LIVE_CLIENT_TTL_MS = 5 * 60_000;
const MAX_CLIENT_CACHE_ENTRIES = 30;
const apiClientCache = new Map<string, { data: unknown; fetchedAt: number; ttlMs: number | null }>();

async function fetchApiJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

async function fetchCachedApiJson<T>(
  url: string,
  opts: { signal?: AbortSignal; ttlMs?: number | null; forceRefresh?: boolean } = {},
): Promise<T> {
  const { signal, ttlMs = null, forceRefresh = false } = opts;
  const hit = !forceRefresh ? apiClientCache.get(url) : undefined;
  if (hit && (hit.ttlMs === null || Date.now() - hit.fetchedAt < hit.ttlMs)) {
    return hit.data as T;
  }

  const reqUrl = forceRefresh ? `${url}${url.includes('?') ? '&' : '?'}refresh=1` : url;
  const data = await fetchApiJson<T>(reqUrl, signal);
  if (apiClientCache.has(url)) apiClientCache.delete(url);
  apiClientCache.set(url, { data, fetchedAt: Date.now(), ttlMs });
  while (apiClientCache.size > MAX_CLIENT_CACHE_ENTRIES) {
    const oldest = apiClientCache.keys().next().value;
    if (oldest === undefined) break;
    apiClientCache.delete(oldest);
  }
  return data;
}

export interface ModeWeatherFxState {
  mode: WeatherMode;
  showWeatherFx: boolean;
}

export type ModeWeatherFxAction =
  | { type: 'setMode'; mode: WeatherMode }
  | { type: 'toggleWeatherFx' };

export const INITIAL_MODE_WEATHER_FX_STATE: ModeWeatherFxState = {
  mode: 'historical',
  showWeatherFx: false,
};

/**
 * Transitions weather mode and applies each mode's Weather FX default
 * (on for live mode, off for historical mode) whenever the mode changes.
 */
export function modeWeatherFxReducer(
  state: ModeWeatherFxState,
  action: ModeWeatherFxAction,
): ModeWeatherFxState {
  switch (action.type) {
    case 'setMode':
      if (action.mode === state.mode) return state;
      return {
        mode: action.mode,
        showWeatherFx: action.mode === 'live',
      };
    case 'toggleWeatherFx':
      return {
        ...state,
        showWeatherFx: !state.showWeatherFx,
      };
  }
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [{ mode, showWeatherFx }, dispatchModeFx] = useReducer(
    modeWeatherFxReducer,
    INITIAL_MODE_WEATHER_FX_STATE,
  );
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
  const [refreshTick, setRefreshTick] = useState(0);
  const detailRefreshRef = useRef({ tick: 0, key: '' });
  const citiesRefreshRef = useRef({ tick: 0, key: '' });
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
        const ttlMs = opts.targetMode === 'live' ? LIVE_CLIENT_TTL_MS : null;
        const alertsPromise =
          opts.targetMode === 'live'
            ? fetchCachedApiJson<AlertsResponse>('/api/alerts', {
                signal: controller.signal,
                ttlMs: LIVE_CLIENT_TTL_MS,
                forceRefresh: opts.refresh,
              })
                .then(setAlertsData)
                .catch(() => {})
            : null;

        const json = await fetchCachedApiJson<WeatherDatasetResponse>(
          `/api/states?${params.toString()}`,
          { signal: controller.signal, ttlMs, forceRefresh: opts.refresh },
        );
        setDataset(json);

        if (opts.targetMode === 'historical') {
          const fallbackIdx =
            opts.defaultFrame ??
            Math.min(Math.floor(json.timelineHours.length / 2), json.timelineHours.length - 1);
          setTimelineIndex(Math.max(0, fallbackIdx));
        } else {
          setTimelineIndex(0);
          await alertsPromise;
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
    if (mode === 'historical') {
      setRadarLoading(false);
      const { frames } = buildHistoricalRadarFrames(radarAnchor, 12);
      setRadarFrames(frames);
      setRadarFrameIndex(Math.max(0, frames.length - 1));
      return;
    }

    const controller = new AbortController();
    setRadarLoading(true);
    fetchCachedApiJson<RadarFramesResponse>('/api/radar/frames?mode=live', {
      signal: controller.signal,
      ttlMs: 3 * 60_000,
    })
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
    const params = new URLSearchParams({ mode });
    if (selectedCity) params.set('city', selectedCity);
    if (mode === 'live') {
      params.set('alerts', '0');
    } else {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    const url = `/api/state/${selectedCode}?${params.toString()}`;
    const forceRefresh =
      refreshTick !== detailRefreshRef.current.tick && detailRefreshRef.current.key === url;
    detailRefreshRef.current = { tick: refreshTick, key: url };

    setStateDetail((prev) => (prev?.code === selectedCode ? prev : null));
    setDetailLoading(true);

    fetchCachedApiJson<StateDetailResponse>(url, {
      signal: controller.signal,
      ttlMs: mode === 'live' ? LIVE_CLIENT_TTL_MS : null,
      forceRefresh,
    })
      .then(setStateDetail)
      .catch((err) => {
        if (!isAbortError(err)) setStateDetail(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailLoading(false);
      });

    return () => controller.abort();
  }, [selectedCode, selectedCity, mode, startDate, endDate, refreshTick]);

  useEffect(() => {
    if (!detailedStateMode || !selectedCode) {
      setStateCitiesWeather(null);
      setCitiesLoading(false);
      setCitiesError(null);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ mode });
    if (mode === 'historical') {
      if (activePresetId) params.set('preset', activePresetId);
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    const url = `/api/state/${selectedCode}/cities?${params.toString()}`;
    const forceRefresh =
      refreshTick !== citiesRefreshRef.current.tick && citiesRefreshRef.current.key === url;
    citiesRefreshRef.current = { tick: refreshTick, key: url };

    setCitiesLoading(true);
    setCitiesError(null);

    fetchCachedApiJson<StateCitiesWeatherResponse>(url, {
      signal: controller.signal,
      ttlMs: mode === 'live' ? LIVE_CLIENT_TTL_MS : null,
      forceRefresh,
    })
      .then(setStateCitiesWeather)
      .catch((err) => {
        if (isAbortError(err)) return;
        setStateCitiesWeather(null);
        setCitiesError(
          err instanceof Error ? err.message : 'Unable to load top 10 cities weather',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setCitiesLoading(false);
      });

    return () => controller.abort();
  }, [detailedStateMode, selectedCode, mode, startDate, endDate, activePresetId, refreshTick]);

  const handleToggleDetailedStateMode = useCallback(() => {
    setDetailedStateMode((prev) => !prev);
  }, []);

  const handleToggleWeatherFx = useCallback(() => {
    dispatchModeFx({ type: 'toggleWeatherFx' });
  }, []);

  const handleToggleCompare = useCallback((code: string) => {
    setCompareCodes((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 3) return [...prev.slice(1), code];
      return [...prev, code];
    });
  }, []);

  const handleModeChange = (nextMode: WeatherMode) => {
    if (nextMode === mode) return;
    dispatchModeFx({ type: 'setMode', mode: nextMode });
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
    dispatchModeFx({ type: 'setMode', mode: 'historical' });
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
    dispatchModeFx({ type: 'setMode', mode: 'historical' });
    void loadDataset({
      targetMode: 'historical',
      start: s,
      end: e,
    });
  };

  const useTimeline = mode === 'historical' || isTimelinePlaying || timelineIndex > 0;
  const activeAlertsByState = mode === 'live' ? alertsData?.byState : undefined;
  const activeDetail = stateDetail?.code === selectedCode ? stateDetail : null;
  const selectedAlerts = selectedCode ? activeAlertsByState?.[selectedCode] ?? [] : [];

  const statePhenomena = useMemo(
    () =>
      dataset
        ? classifyStatesPhenomena(
            dataset.states,
            timelineIndex,
            useTimeline,
            activeAlertsByState,
            metric,
            showWeatherFx && fxShowcase,
          )
        : {},
    [dataset, timelineIndex, useTimeline, activeAlertsByState, metric, showWeatherFx, fxShowcase],
  );

  const activeFxCount = useMemo(() => {
    if (!showWeatherFx || !dataset || fxShowcase) return 0;
    let count = 0;
    for (const p of Object.values(statePhenomena)) {
      if (hasActiveMapFx(p.phenomenon, metric)) count++;
    }
    return count;
  }, [showWeatherFx, dataset, fxShowcase, statePhenomena, metric]);

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
          setRefreshTick((t) => t + 1);
          void loadDataset({
            targetMode: mode,
            start: startDate,
            end: endDate,
            presetId: activePresetId,
            refresh: true,
          });
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
            citiesLoading={citiesLoading}
            selectedCity={selectedCity || selectedMeta?.primaryCity || ''}
            onSelectCity={setSelectedCity}
            resetTrigger={mapResetTrigger}
            onViewModifiedChange={setMapViewModified}
            onZoomChange={setMapZoom}
            showWeatherFx={showWeatherFx}
            onToggleWeatherFx={handleToggleWeatherFx}
            fxShowcase={fxShowcase}
            statePhenomena={statePhenomena}
            mapContainerRef={mapContainerRef}
            overlays={
              <>
                <DopplerRadarOverlay
                  visible={showRadar}
                  mode={mode}
                  frames={radarFrames}
                  activeFrameIndex={radarFrameIndex}
                  isPlaying={isRadarPlaying}
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
                  statePhenomena={statePhenomena}
                  alertsByState={activeAlertsByState}
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
          detail={activeDetail}
          alerts={selectedAlerts}
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
        detail={activeDetail}
        alerts={selectedAlerts}
        unit={unit}
        timelineIndex={timelineIndex}
        useTimeline={useTimeline}
        isDark={theme === 'dark'}
        mapContainerRef={mapContainerRef}
      />

      <PrintSheet
        scope={exportScope}
        dataset={dataset}
        detail={activeDetail}
        alerts={selectedAlerts}
        unit={unit}
        timelineIndex={timelineIndex}
        useTimeline={useTimeline}
      />
    </div>
  );
}
