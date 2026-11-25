import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Droplets,
  Gauge,
  GitCompare,
  MapPinned,
  Printer,
  Sunrise,
  Sunset,
  Users,
  Wind,
  X,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import type {
  MetricLayer,
  StateCitiesWeatherResponse,
  StateDetailResponse,
  StateMeta,
  StateWeatherSnapshot,
  TempUnit,
  TopCityMeta,
  WeatherMode,
} from '../../shared/types';
import {
  aqiCategory,
  degToCompass,
  formatPrecip,
  formatTemp,
  formatWind,
  uvCategory,
} from '../../shared/units';
import { getWmoInfo } from '../../shared/wmoCodes';
import { METRIC_SCALES } from '../utils/scales';
import { HourlyChart } from './HourlyChart';
import { resolveStateSlice } from './MapCanvas';
import { WeatherIcon } from './WeatherIcon';

interface StateDrawerProps {
  meta: StateMeta;
  snapshot: StateWeatherSnapshot;
  detail: StateDetailResponse | null;
  isLoading: boolean;
  mode: WeatherMode;
  unit: TempUnit;
  metric?: MetricLayer;
  timelineIndex?: number;
  useTimeline?: boolean;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  compareCodes: string[];
  onToggleCompare: (code: string) => void;
  allStates: Record<string, StateWeatherSnapshot>;
  onSelectState: (code: string) => void;
  onPrintState: () => void;
  onClose: () => void;
  detailedStateMode?: boolean;
  onToggleDetailedStateMode?: () => void;
  citiesWeather?: StateCitiesWeatherResponse | null;
  citiesLoading?: boolean;
  citiesError?: string | null;
  fallbackTopCities?: TopCityMeta[];
}

function formatPopulation(pop: number): string {
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(2)}M`;
  if (pop >= 10_000) return `${Math.round(pop / 1_000)}k`;
  return `${(pop / 1_000).toFixed(1)}k`;
}

export function StateDrawer({
  meta,
  snapshot,
  detail,
  isLoading,
  mode,
  unit,
  metric = 'temperature',
  timelineIndex = 0,
  useTimeline = false,
  selectedCity,
  onSelectCity,
  compareCodes,
  onToggleCompare,
  allStates,
  onSelectState,
  onPrintState,
  onClose,
  detailedStateMode = false,
  onToggleDetailedStateMode,
  citiesWeather = null,
  citiesLoading = false,
  citiesError = null,
  fallbackTopCities = [],
}: StateDrawerProps) {
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);

  const current = detail?.current ?? snapshot.current;
  const wmo = getWmoInfo(current.weatherCode);
  const aqiInfo = aqiCategory(current.usAqi);
  const isComparing = compareCodes.includes(meta.code);

  const daily = detail?.daily ?? [];
  const weekMin = daily.length > 0 ? Math.min(...daily.map((d) => d.tempMinF)) : current.tempLowF;
  const weekMax = daily.length > 0 ? Math.max(...daily.map((d) => d.tempMaxF)) : current.tempHighF;
  const weekSpan = Math.max(1, weekMax - weekMin);

  const formatSunTime = (iso: string | undefined) => {
    if (!iso) return '—';
    const timePart = iso.slice(11, 16);
    return timePart || iso;
  };

  const cityOptions = useMemo(() => {
    const baseCities =
      detailedStateMode && citiesWeather?.code === meta.code
        ? citiesWeather.cities.map((c) => c.name)
        : detailedStateMode && fallbackTopCities.length > 0
          ? fallbackTopCities.map((c) => c.name)
          : meta.cities.map((c) => c.name);
    const seen = new Set(baseCities.map((n) => n.toLowerCase()));
    const result = [...baseCities];
    const currentCity = selectedCity || detail?.city || snapshot.city;
    if (currentCity && !seen.has(currentCity.toLowerCase())) {
      result.unshift(currentCity);
    }
    return result;
  }, [
    detailedStateMode,
    citiesWeather,
    fallbackTopCities,
    meta.code,
    meta.cities,
    selectedCity,
    detail?.city,
    snapshot.city,
  ]);

  const activeCityValue = useMemo(() => {
    const target = (selectedCity || detail?.city || snapshot.city).toLowerCase();
    return cityOptions.find((n) => n.toLowerCase() === target) ?? cityOptions[0] ?? '';
  }, [cityOptions, selectedCity, detail?.city, snapshot.city]);

  return (
    <aside className="no-print fixed top-20 right-3 bottom-4 z-30 flex w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-lg sm:w-[420px] dark:border-slate-700/70 dark:bg-slate-900/95">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{meta.name}</h2>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {meta.code}
            </span>
            <span className="shrink-0 text-[11px] text-slate-400">{meta.region}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close state details"
            className="-mt-0.5 -mr-1 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="relative inline-flex items-center">
            <select
              aria-label="Select city"
              value={activeCityValue}
              onChange={(e) => onSelectCity(e.target.value)}
              className="appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1 pr-6 pl-2 text-xs font-medium text-slate-800 transition hover:border-slate-300 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:border-slate-600"
            >
              {cityOptions.map((cityName) => (
                <option
                  key={cityName}
                  value={cityName}
                  className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                >
                  {cityName}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="pointer-events-none absolute right-2 text-slate-400 dark:text-slate-400"
            />
          </div>

          {detail && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Elev {detail.elevationM}m • {detail.timezone}
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {onToggleDetailedStateMode && (
            <button
              type="button"
              onClick={onToggleDetailedStateMode}
              aria-pressed={detailedStateMode}
              title={
                detailedStateMode
                  ? 'Exit Detailed State Mode (D)'
                  : 'Zoom in & load top 10 populated cities (D)'
              }
              className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                detailedStateMode
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <MapPinned size={12} />
              <span>Top 10</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleCompare(meta.code)}
            title={isComparing ? 'Remove from comparison' : 'Compare state'}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
              isComparing
                ? 'bg-sky-600 text-white'
                : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <GitCompare size={12} />
            <span>{isComparing ? 'Pinned' : 'Compare'}</span>
          </button>
          <button
            type="button"
            onClick={onPrintState}
            title="Print state weather report"
            className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Printer size={12} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-2.5">
        {/* Hero Readout */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <WeatherIcon code={current.weatherCode} size={24} />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="tabular-nums text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px] dark:text-white">
                  {formatTemp(current.temperatureF, unit, true)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Feels {formatTemp(current.apparentTemperatureF, unit)}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {wmo.label}
              </div>
            </div>
          </div>

          <div className="text-right tabular-nums text-xs">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              H {formatTemp(current.tempHighF, unit)} / L {formatTemp(current.tempLowF, unit)}
            </div>
            <div className="text-[11px] text-slate-400">
              {mode === 'historical' ? 'Window Range' : 'Today'}
            </div>
          </div>
        </div>

        {/* Top 10 Populated Cities Card (Detailed State Mode) */}
        {detailedStateMode && (
          <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-500/25 dark:bg-emerald-950/20">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users size={13} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-[11px] font-semibold tracking-wider text-emerald-800 uppercase dark:text-emerald-300">
                  Top 10 Populated Cities
                </span>
              </div>
              <span className="text-[10px] text-slate-400">
                {citiesLoading ? 'Fetching...' : 'Click city for chart'}
              </span>
            </div>

            {citiesError ? (
              <div className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {citiesError}
              </div>
            ) : citiesWeather && citiesWeather.code === meta.code ? (
              <div className="space-y-1">
                {citiesWeather.cities.map((c) => {
                  const slice = resolveStateSlice(c, timelineIndex, useTimeline);
                  const active = c.name.toLowerCase() === selectedCity.toLowerCase();
                  const scaleConfig = METRIC_SCALES[metric];
                  const rawMetric = slice.metricSource
                    ? scaleConfig.extractTimeline(slice.metricSource, c.current)
                    : scaleConfig.extractCurrent(c.current);
                  const metricDisplay = scaleConfig.formatMapValue(rawMetric, unit);

                  return (
                    <button
                      key={`${c.rank}-${c.name}`}
                      type="button"
                      onClick={() => onSelectCity(c.name)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition sm:px-2.5 ${
                        active
                          ? 'bg-sky-600 text-white shadow-xs dark:bg-sky-500 dark:text-slate-950'
                          : 'bg-white/85 text-slate-800 hover:bg-white dark:bg-slate-900/75 dark:text-slate-100 dark:hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                        <span
                          className={`w-4 shrink-0 text-right tabular-nums text-[10px] font-semibold ${
                            active ? 'text-white/80 dark:text-slate-950/75' : 'text-slate-400'
                          }`}
                        >
                          {c.rank}
                        </span>
                        <span className="leading-tight font-medium">{c.name}</span>
                        <span
                          className={`shrink-0 tabular-nums text-[10px] ${
                            active ? 'text-white/75 dark:text-slate-950/70' : 'text-slate-400'
                          }`}
                        >
                          {formatPopulation(c.population)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 tabular-nums sm:gap-2">
                        <WeatherIcon code={slice.weatherCode} size={14} />
                        <span className="font-semibold">
                          {formatTemp(slice.temperatureF, unit, true)}
                        </span>
                        <span
                          className={`w-12 text-right text-[10px] sm:w-14 ${
                            active ? 'text-white/85 dark:text-slate-950/80' : 'text-slate-400'
                          }`}
                        >
                          {metric === 'temperature'
                            ? formatWind(slice.windSpeedMph, unit)
                            : metricDisplay}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1">
                {(fallbackTopCities.length > 0
                  ? fallbackTopCities
                  : Array.from({ length: 10 }, (_, idx) => ({
                      rank: idx + 1,
                      name: `City ${idx + 1}`,
                      population: 0,
                      lat: 0,
                      lon: 0,
                    }))
                ).map((c) => (
                  <div
                    key={c.rank}
                    className="flex items-center justify-between rounded-lg bg-white/60 px-2.5 py-1.5 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-right tabular-nums text-[10px]">{c.rank}</span>
                      <span>{c.name}</span>
                    </div>
                    <span className="h-3 w-12 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active NWS Alerts (Live Mode) */}
        {mode === 'live' && detail?.alerts && detail.alerts.length > 0 && (
          <div className="space-y-1.5">
            {detail.alerts.slice(0, 4).map((al) => {
              const expanded = expandedAlertId === al.id;
              return (
                <div
                  key={al.id}
                  className="rounded-xl border border-rose-200 bg-rose-50/80 p-2.5 dark:border-rose-500/30 dark:bg-rose-950/40"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedAlertId(expanded ? null : al.id)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className="shrink-0 text-rose-600 dark:text-rose-400" />
                      <span className="text-xs font-semibold text-rose-800 dark:text-rose-200">
                        {al.event}
                      </span>
                    </div>
                    {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <p className="mt-1 text-[11px] text-rose-700/90 dark:text-rose-300/90">
                    {al.areaDesc}
                  </p>
                  {expanded && (
                    <div className="mt-2 space-y-1 border-t border-rose-200/70 pt-2 text-[11px] text-rose-900/90 dark:border-rose-800/50 dark:text-rose-100/90">
                      <p className="whitespace-pre-line">{al.description.slice(0, 600)}</p>
                      {al.instruction && (
                        <p className="font-medium text-rose-950 dark:text-rose-200">
                          Action: {al.instruction}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Loading skeleton or Hourly Chart */}
        {isLoading && !detail ? (
          <div className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
        ) : detail?.hourly?.length ? (
          <HourlyChart hourly={detail.hourly} unit={unit} />
        ) : null}

        {/* Daily Forecast / Window Breakdown */}
        {daily.length > 0 && (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              {mode === 'historical' ? 'Daily Archive Summary' : '7-Day Forecast'}
            </div>
            <div className="grid grid-cols-[max-content_16px_minmax(28px,auto)_1fr_minmax(28px,auto)] items-center gap-x-2 gap-y-1 text-xs">
              {daily.map((d) => {
                const leftPct = ((d.tempMinF - weekMin) / weekSpan) * 100;
                const widthPct = Math.max(8, ((d.tempMaxF - d.tempMinF) / weekSpan) * 100);
                const dayLabel = new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                });

                return (
                  <Fragment key={d.date}>
                    <span className="whitespace-nowrap text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {dayLabel}
                    </span>
                    <WeatherIcon code={d.weatherCode} size={14} />
                    <span className="text-right tabular-nums text-[11px] text-slate-400">
                      {formatTemp(d.tempMinF, unit)}
                    </span>
                    <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="absolute top-0 h-1.5 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-orange-500"
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="text-right tabular-nums text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                      {formatTemp(d.tempMaxF, unit)}
                    </span>
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Atmospheric Metrics Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-xl border border-slate-200/80 px-2.5 py-1.5 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Wind size={12} />
              <span>Wind</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 tabular-nums text-[13px] font-semibold">
              <ArrowUpRight
                size={13}
                style={{ transform: `rotate(${(current.windDirectionDeg + 180) % 360}deg)` }}
                className="text-sky-500"
              />
              <span>
                {formatWind(current.windSpeedMph, unit)} {degToCompass(current.windDirectionDeg)}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              {current.windGustMph !== null
                ? `Gusts ${formatWind(current.windGustMph, unit)}`
                : 'Steady flow'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 px-2.5 py-1.5 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Droplets size={12} />
              <span>Humidity</span>
            </div>
            <div className="mt-0.5 tabular-nums text-[13px] font-semibold">
              {Math.round(current.humidity)}%
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              Dew pt {formatTemp(current.dewPointF, unit, true)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 px-2.5 py-1.5 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Gauge size={12} />
              <span>Pressure</span>
            </div>
            <div className="mt-0.5 tabular-nums text-[13px] font-semibold">
              {current.pressureHpa !== null ? `${Math.round(current.pressureHpa)} hPa` : '—'}
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              Precip {formatPrecip(current.precipitationMm, unit)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 px-2.5 py-1.5 dark:border-slate-800">
            <div className="text-[11px] text-slate-400">AQI & UV</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
              <span>{current.usAqi !== null ? `${Math.round(current.usAqi)} AQI` : 'N/A'}</span>
              {current.usAqi !== null && (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: aqiInfo.color }}
                >
                  {aqiInfo.label}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums">
              UV {current.uvIndex !== null ? `${current.uvIndex.toFixed(1)} (${uvCategory(current.uvIndex)})` : 'N/A'}
            </div>
          </div>
        </div>

        {/* Sunrise / Sunset */}
        {(current.sunrise || current.sunset) && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200/80 px-3 py-1.5 text-xs dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Sunrise size={13} className="text-amber-500" />
              <span>Sunrise</span>
              <span className="tabular-nums font-semibold">{formatSunTime(current.sunrise)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <Sunset size={13} className="text-orange-500" />
              <span>Sunset</span>
              <span className="tabular-nums font-semibold">{formatSunTime(current.sunset)}</span>
            </div>
          </div>
        )}

        {/* Side-by-Side State Comparison Card */}
        {compareCodes.length > 0 && (
          <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3 dark:border-sky-500/25 dark:bg-sky-950/30">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-sky-700 uppercase dark:text-sky-300">
                State Comparison ({compareCodes.length}/3)
              </span>
              <span className="text-[10px] text-slate-400">Click state to jump</span>
            </div>
            <div className="space-y-1.5">
              {compareCodes.map((c) => {
                const s = allStates[c];
                if (!s) return null;
                return (
                  <div
                    key={c}
                    className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 text-xs dark:bg-slate-900/80"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectState(c)}
                      className="flex items-center gap-1.5 font-medium hover:text-sky-600"
                    >
                      <span className="font-semibold">{s.code}</span>
                      <span className="text-slate-500 dark:text-slate-400">{s.city}</span>
                    </button>
                    <div className="flex items-center gap-2.5 tabular-nums">
                      <span className="font-semibold">{formatTemp(s.current.temperatureF, unit)}</span>
                      <span className="text-[11px] text-slate-400">
                        {formatWind(s.current.windSpeedMph, unit)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleCompare(c)}
                        className="text-slate-400 hover:text-rose-500"
                        aria-label={`Remove ${c}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
