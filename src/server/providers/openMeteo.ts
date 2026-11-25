import { STATE_BY_CODE, US_STATES } from '../../shared/states';
import type {
  CityWeatherSnapshot,
  DailyPoint,
  HourlyPoint,
  StateCitiesWeatherResponse,
  StateCurrentMetrics,
  StateDetailResponse,
  StateMeta,
  StateWeatherSnapshot,
  TimelinePoint,
  TopCityMeta,
  WeatherDatasetResponse,
  WeatherMode,
} from '../../shared/types';
import { fToC } from '../../shared/units';
import { TOP_CITIES_BY_STATE, findStateCity } from '../../shared/topCities';

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

const CURRENT_WEATHER_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'surface_pressure',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
];

const HOURLY_BASE_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'surface_pressure',
  'cloud_cover',
];

const DAILY_BASE_FIELDS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'weather_code',
  'sunrise',
  'sunset',
];

export interface OpenMeteoLocationPayload {
  latitude: number;
  longitude: number;
  elevation?: number;
  timezone?: string;
  current?: {
    time: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
    surface_pressure?: number;
    cloud_cover?: number;
    dew_point_2m?: number;
  };
  hourly?: {
    time: string[];
    temperature_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    dew_point_2m?: (number | null)[];
    precipitation?: (number | null)[];
    precipitation_probability?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    surface_pressure?: (number | null)[];
    cloud_cover?: (number | null)[];
    uv_index?: (number | null)[];
  };
  daily?: {
    time: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    precipitation_probability_max?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    wind_direction_10m_dominant?: (number | null)[];
    uv_index_max?: (number | null)[];
    weather_code?: (number | null)[];
    sunrise?: (string | null)[];
    sunset?: (string | null)[];
  };
}

export interface OpenMeteoAirQualityPayload {
  current?: {
    us_aqi?: number | null;
    pm2_5?: number | null;
    uv_index?: number | null;
  };
  hourly?: {
    time: string[];
    us_aqi?: (number | null)[];
    pm2_5?: (number | null)[];
    uv_index?: (number | null)[];
  };
}

function num(val: number | null | undefined, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function optNum(val: number | null | undefined): number | null {
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

export function ensureUtcIso(timeStr: string): string {
  if (timeStr.endsWith('Z')) return timeStr;
  return timeStr.length === 16 ? `${timeStr}Z` : timeStr;
}

function estimateDewPointF(tempF: number, rh: number): number {
  const tempC = fToC(tempF);
  const clampedRh = Math.max(1, Math.min(100, rh));
  const a = 17.625;
  const b = 243.04;
  const alpha = Math.log(clampedRh / 100) + (a * tempC) / (b + tempC);
  const dewC = (b * alpha) / (a - alpha);
  return (dewC * 9) / 5 + 32;
}

export function computeTimelineStride(totalHours: number): number {
  if (totalHours <= 48) return 1;
  if (totalHours <= 96) return 2;
  return 3;
}

export function normalizeArrayPayload<T>(raw: T | T[]): T[] {
  return Array.isArray(raw) ? raw : [raw];
}

function findLiveHourIndex(times: string[], currentTime: string | undefined): number {
  if (!currentTime || times.length === 0) return 0;
  const hourPrefix = currentTime.slice(0, 13);
  const idx = times.findIndex((t) => t.startsWith(hourPrefix));
  return idx >= 0 ? idx : 0;
}

function resolveTimelineGrid(locations: OpenMeteoLocationPayload[]): {
  stride: number;
  timelineHours: string[];
} {
  const firstHourlyTimes = locations[0]?.hourly?.time ?? [];
  const stride = computeTimelineStride(firstHourlyTimes.length);
  const timelineHours: string[] = [];
  for (let i = 0; i < firstHourlyTimes.length; i += stride) {
    const t = firstHourlyTimes[i];
    if (t) timelineHours.push(ensureUtcIso(t));
  }
  return { stride, timelineHours };
}

function buildCurrentMetrics(params: {
  mode: WeatherMode;
  locCurrent?: OpenMeteoLocationPayload['current'];
  aq: OpenMeteoAirQualityPayload | null;
  aqHourIdx: number;
  repHour?: Partial<HourlyPoint>;
  tempHighF: number;
  tempLowF: number;
  uvFallback?: number | null;
  sunrise?: string;
  sunset?: string;
}): StateCurrentMetrics {
  const { mode, locCurrent, aq, aqHourIdx, repHour, tempHighF, tempLowF, uvFallback, sunrise, sunset } =
    params;
  const useLiveCurrent = mode === 'live' && Boolean(locCurrent);
  const temperatureF = useLiveCurrent
    ? num(locCurrent?.temperature_2m)
    : repHour?.temperatureF ?? 60;
  const humidity = useLiveCurrent
    ? num(locCurrent?.relative_humidity_2m, 50)
    : repHour?.humidity ?? 50;

  return {
    temperatureF,
    apparentTemperatureF: useLiveCurrent
      ? num(locCurrent?.apparent_temperature, temperatureF)
      : repHour?.apparentTemperatureF ?? temperatureF,
    humidity,
    dewPointF:
      useLiveCurrent && locCurrent?.dew_point_2m !== undefined
        ? num(locCurrent.dew_point_2m, estimateDewPointF(temperatureF, humidity))
        : repHour?.dewPointF ?? estimateDewPointF(temperatureF, humidity),
    precipitationMm: useLiveCurrent
      ? num(locCurrent?.precipitation)
      : repHour?.precipitationMm ?? 0,
    precipitationProb: repHour?.precipitationProb ?? null,
    windSpeedMph: useLiveCurrent ? num(locCurrent?.wind_speed_10m) : repHour?.windSpeedMph ?? 0,
    windGustMph: useLiveCurrent
      ? optNum(locCurrent?.wind_gusts_10m)
      : repHour?.windGustMph ?? null,
    windDirectionDeg: useLiveCurrent
      ? num(locCurrent?.wind_direction_10m)
      : repHour?.windDirectionDeg ?? 0,
    pressureHpa: useLiveCurrent
      ? optNum(locCurrent?.surface_pressure)
      : repHour?.pressureHpa ?? null,
    cloudCoverPct: useLiveCurrent
      ? optNum(locCurrent?.cloud_cover)
      : repHour?.cloudCoverPct ?? null,
    weatherCode: useLiveCurrent ? num(locCurrent?.weather_code, 0) : repHour?.weatherCode ?? 0,
    uvIndex:
      mode === 'live'
        ? optNum(aq?.current?.uv_index) ?? uvFallback ?? null
        : optNum(aq?.hourly?.uv_index?.[aqHourIdx]) ?? uvFallback ?? null,
    usAqi:
      mode === 'live'
        ? optNum(aq?.current?.us_aqi)
        : optNum(aq?.hourly?.us_aqi?.[aqHourIdx]),
    pm25:
      mode === 'live'
        ? optNum(aq?.current?.pm2_5)
        : optNum(aq?.hourly?.pm2_5?.[aqHourIdx]),
    tempHighF,
    tempLowF,
    sunrise,
    sunset,
  };
}

function extractLocationSnapshot(
  loc: OpenMeteoLocationPayload,
  aq: OpenMeteoAirQualityPayload | null,
  stride: number,
  opts: { mode: WeatherMode; defaultFrameIndex?: number },
): { timezone: string; current: StateCurrentMetrics; timeline: TimelinePoint[] } {
  const hourly = loc.hourly;
  const daily = loc.daily;
  const times = hourly?.time ?? [];

  const timeline: TimelinePoint[] = [];
  for (let h = 0; h < times.length; h += stride) {
    const t = times[h];
    if (!t) continue;
    const tempF = num(hourly?.temperature_2m?.[h]);
    timeline.push({
      time: ensureUtcIso(t),
      temperatureF: tempF,
      apparentTemperatureF: num(hourly?.apparent_temperature?.[h], tempF),
      precipitationMm: num(hourly?.precipitation?.[h]),
      windSpeedMph: num(hourly?.wind_speed_10m?.[h]),
      windDirectionDeg: num(hourly?.wind_direction_10m?.[h]),
      humidity: num(hourly?.relative_humidity_2m?.[h], 50),
      weatherCode: num(hourly?.weather_code?.[h], 0),
    });
  }

  const repHourIdx =
    opts.mode === 'live'
      ? findLiveHourIndex(times, loc.current?.time)
      : Math.min(
          Math.min(
            Math.max(0, opts.defaultFrameIndex ?? Math.floor(timeline.length / 2)),
            Math.max(0, timeline.length - 1),
          ) * stride,
          Math.max(0, times.length - 1),
        );

  const repTemp = num(hourly?.temperature_2m?.[repHourIdx], 60);
  const repRh = num(hourly?.relative_humidity_2m?.[repHourIdx], 50);
  const repHour: Partial<HourlyPoint> = {
    temperatureF: repTemp,
    apparentTemperatureF: num(hourly?.apparent_temperature?.[repHourIdx], repTemp),
    dewPointF: num(hourly?.dew_point_2m?.[repHourIdx], estimateDewPointF(repTemp, repRh)),
    humidity: repRh,
    precipitationMm: num(hourly?.precipitation?.[repHourIdx]),
    precipitationProb: optNum(hourly?.precipitation_probability?.[repHourIdx]),
    windSpeedMph: num(hourly?.wind_speed_10m?.[repHourIdx]),
    windGustMph: optNum(hourly?.wind_gusts_10m?.[repHourIdx]),
    windDirectionDeg: num(hourly?.wind_direction_10m?.[repHourIdx]),
    pressureHpa: optNum(hourly?.surface_pressure?.[repHourIdx]),
    cloudCoverPct: optNum(hourly?.cloud_cover?.[repHourIdx]),
    weatherCode: num(hourly?.weather_code?.[repHourIdx], 0),
  };

  const aqHourIdx = aq?.hourly?.time
    ? Math.min(repHourIdx, Math.max(0, aq.hourly.time.length - 1))
    : 0;

  const fallbackTemp =
    opts.mode === 'live' && loc.current ? num(loc.current.temperature_2m) : repTemp;
  const dailyHighs = (daily?.temperature_2m_max ?? []).filter((v): v is number => typeof v === 'number');
  const dailyLows = (daily?.temperature_2m_min ?? []).filter((v): v is number => typeof v === 'number');

  const current = buildCurrentMetrics({
    mode: opts.mode,
    locCurrent: loc.current,
    aq,
    aqHourIdx,
    repHour,
    tempHighF:
      opts.mode === 'live'
        ? num(daily?.temperature_2m_max?.[0], fallbackTemp)
        : dailyHighs.length > 0
          ? Math.max(...dailyHighs)
          : fallbackTemp,
    tempLowF:
      opts.mode === 'live'
        ? num(daily?.temperature_2m_min?.[0], fallbackTemp)
        : dailyLows.length > 0
          ? Math.min(...dailyLows)
          : fallbackTemp,
    uvFallback: optNum(daily?.uv_index_max?.[0]),
    sunrise: daily?.sunrise?.[0] ?? undefined,
    sunset: daily?.sunset?.[0] ?? undefined,
  });

  return { timezone: loc.timezone ?? 'UTC', current, timeline };
}

export function buildBatchDataset(
  locations: OpenMeteoLocationPayload[],
  aqLocations: (OpenMeteoAirQualityPayload | null)[],
  statesList: StateMeta[],
  opts: {
    mode: WeatherMode;
    source: WeatherDatasetResponse['source'];
    startDate: string;
    endDate: string;
    presetId?: string;
    presetLabel?: string;
    defaultFrameIndex?: number;
  },
): WeatherDatasetResponse {
  const { stride, timelineHours } = resolveTimelineGrid(locations);
  const states: Record<string, StateWeatherSnapshot> = {};

  for (let idx = 0; idx < statesList.length; idx++) {
    const meta = statesList[idx];
    const loc = locations[idx];
    if (!meta || !loc) continue;

    const extracted = extractLocationSnapshot(loc, aqLocations[idx] ?? null, stride, opts);
    states[meta.code] = {
      code: meta.code,
      name: meta.name,
      city: meta.primaryCity,
      lat: meta.lat,
      lon: meta.lon,
      ...extracted,
    };
  }

  return {
    mode: opts.mode,
    source: opts.source,
    cached: false,
    fetchedAt: new Date().toISOString(),
    startDate: opts.startDate,
    endDate: opts.endDate,
    presetId: opts.presetId,
    presetLabel: opts.presetLabel,
    timelineHours,
    states,
  };
}

export function buildCityBatchDataset(
  locations: OpenMeteoLocationPayload[],
  aqLocations: (OpenMeteoAirQualityPayload | null)[],
  citiesList: TopCityMeta[],
  stateMeta: Pick<StateMeta, 'code' | 'name'>,
  opts: {
    mode: WeatherMode;
    startDate: string;
    endDate: string;
    defaultFrameIndex?: number;
  },
): StateCitiesWeatherResponse {
  const { stride, timelineHours } = resolveTimelineGrid(locations);
  const cities: CityWeatherSnapshot[] = [];

  for (let idx = 0; idx < citiesList.length; idx++) {
    const city = citiesList[idx];
    const loc = locations[idx];
    if (!city || !loc) continue;

    const extracted = extractLocationSnapshot(loc, aqLocations[idx] ?? null, stride, opts);
    cities.push({
      rank: city.rank,
      name: city.name,
      population: city.population,
      lat: city.lat,
      lon: city.lon,
      ...extracted,
    });
  }

  return {
    mode: opts.mode,
    code: stateMeta.code,
    name: stateMeta.name,
    cached: false,
    fetchedAt: new Date().toISOString(),
    startDate: opts.startDate,
    endDate: opts.endDate,
    timelineHours,
    cities,
  };
}

function isoDateDaysAgo(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function shouldUseArchiveEndpoint(endDate: string): boolean {
  return endDate <= isoDateDaysAgo(5);
}

async function fetchJson<T>(url: string, timeoutMs = 18_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function buildAqParams(opts: {
  latitude: string;
  longitude: string;
  timezone: string;
  mode: WeatherMode;
  startDate?: string;
  endDate?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    latitude: opts.latitude,
    longitude: opts.longitude,
    timezone: opts.timezone,
  });
  if (opts.mode === 'live') {
    params.set('current', 'us_aqi,pm2_5,uv_index');
  } else {
    if (opts.startDate) params.set('start_date', opts.startDate);
    if (opts.endDate) params.set('end_date', opts.endDate);
    params.set('hourly', 'us_aqi,pm2_5,uv_index');
  }
  return params;
}

async function fetchBatchedWeatherAndAq(
  coords: Array<{ lat: number; lon: number }>,
  opts: {
    mode: WeatherMode;
    startDate?: string;
    endDate?: string;
    precision?: number;
  },
): Promise<{
  locations: OpenMeteoLocationPayload[];
  aqLocations: (OpenMeteoAirQualityPayload | null)[];
  startDate: string;
  endDate: string;
}> {
  const precision = opts.precision ?? 2;
  const lats = coords.map((c) => c.lat.toFixed(precision)).join(',');
  const lons = coords.map((c) => c.lon.toFixed(precision)).join(',');
  const isLive = opts.mode === 'live';

  const startDate = isLive ? isoDateDaysAgo(0) : opts.startDate ?? isoDateDaysAgo(5);
  const endDate = isLive ? isoDateDaysAgo(-2) : opts.endDate ?? isoDateDaysAgo(1);
  const baseUrl = isLive
    ? FORECAST_BASE
    : shouldUseArchiveEndpoint(endDate)
      ? ARCHIVE_BASE
      : FORECAST_BASE;

  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    hourly: (isLive
      ? [...HOURLY_BASE_FIELDS, 'precipitation_probability']
      : HOURLY_BASE_FIELDS
    ).join(','),
    daily: (isLive
      ? [...DAILY_BASE_FIELDS, 'uv_index_max']
      : [...DAILY_BASE_FIELDS, 'wind_speed_10m_max', 'wind_direction_10m_dominant']
    ).join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
  });

  if (isLive) {
    params.set('current', CURRENT_WEATHER_FIELDS.join(','));
    params.set('forecast_days', '3');
  } else {
    params.set('start_date', startDate);
    params.set('end_date', endDate);
  }

  // Air quality archive starts ~2022-08
  const canQueryAq = isLive || startDate >= '2022-08-01';
  const aqParams = buildAqParams({
    latitude: lats,
    longitude: lons,
    timezone: 'UTC',
    mode: opts.mode,
    startDate,
    endDate,
  });

  const [weatherRaw, aqResult] = await Promise.all([
    fetchJson<OpenMeteoLocationPayload | OpenMeteoLocationPayload[]>(
      `${baseUrl}?${params.toString()}`,
      isLive ? 18_000 : 25_000,
    ),
    canQueryAq
      ? fetchJson<OpenMeteoAirQualityPayload | OpenMeteoAirQualityPayload[]>(
          `${AIR_QUALITY_BASE}?${aqParams.toString()}`,
          isLive ? 8_000 : 15_000,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    locations: normalizeArrayPayload(weatherRaw),
    aqLocations: aqResult ? normalizeArrayPayload(aqResult) : coords.map(() => null),
    startDate,
    endDate,
  };
}

export async function fetchAllStatesLive(): Promise<WeatherDatasetResponse> {
  const { locations, aqLocations, startDate, endDate } = await fetchBatchedWeatherAndAq(
    US_STATES,
    { mode: 'live', precision: 2 },
  );

  return buildBatchDataset(locations, aqLocations, US_STATES, {
    mode: 'live',
    source: 'open-meteo-forecast',
    startDate,
    endDate,
  });
}

export async function fetchAllStatesHistorical(opts: {
  startDate: string;
  endDate: string;
  presetId?: string;
  presetLabel?: string;
  defaultFrameIndex?: number;
}): Promise<WeatherDatasetResponse> {
  const { locations, aqLocations, startDate, endDate } = await fetchBatchedWeatherAndAq(
    US_STATES,
    { mode: 'historical', startDate: opts.startDate, endDate: opts.endDate, precision: 2 },
  );

  return buildBatchDataset(locations, aqLocations, US_STATES, {
    mode: 'historical',
    source: 'open-meteo-archive',
    startDate,
    endDate,
    presetId: opts.presetId,
    presetLabel: opts.presetLabel,
    defaultFrameIndex: opts.defaultFrameIndex,
  });
}

export async function fetchStateTopCitiesWeather(opts: {
  code: string;
  mode: WeatherMode;
  startDate?: string;
  endDate?: string;
  defaultFrameIndex?: number;
}): Promise<StateCitiesWeatherResponse> {
  const upperCode = opts.code.toUpperCase();
  const meta = STATE_BY_CODE[upperCode];
  const citiesList = TOP_CITIES_BY_STATE[upperCode];
  if (!meta || !citiesList?.length) {
    throw new Error(`Unknown state code: ${opts.code}`);
  }

  const { locations, aqLocations, startDate, endDate } = await fetchBatchedWeatherAndAq(
    citiesList,
    { mode: opts.mode, startDate: opts.startDate, endDate: opts.endDate, precision: 4 },
  );

  return buildCityBatchDataset(locations, aqLocations, citiesList, meta, {
    mode: opts.mode,
    startDate,
    endDate,
    defaultFrameIndex: opts.defaultFrameIndex,
  });
}

export async function fetchStateDetail(opts: {
  code: string;
  cityName?: string;
  mode: WeatherMode;
  startDate?: string;
  endDate?: string;
}): Promise<StateDetailResponse> {
  const upperCode = opts.code.toUpperCase();
  const meta = STATE_BY_CODE[upperCode];
  if (!meta) {
    throw new Error(`Unknown state code: ${opts.code}`);
  }

  const cityObj = findStateCity(upperCode, opts.cityName) ?? meta.cities[0]!;

  const isHistorical = opts.mode === 'historical' && Boolean(opts.startDate && opts.endDate);
  const useArchive = isHistorical && shouldUseArchiveEndpoint(opts.endDate!);
  const baseUrl = useArchive ? ARCHIVE_BASE : FORECAST_BASE;

  const latStr = cityObj.lat.toFixed(4);
  const lonStr = cityObj.lon.toFixed(4);

  const params = new URLSearchParams({
    latitude: latStr,
    longitude: lonStr,
    hourly: (useArchive
      ? HOURLY_BASE_FIELDS
      : [...HOURLY_BASE_FIELDS, 'precipitation_probability', 'uv_index']
    ).join(','),
    daily: [
      ...DAILY_BASE_FIELDS,
      ...(useArchive ? [] : ['precipitation_probability_max', 'uv_index_max']),
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
  });

  if (isHistorical) {
    params.set('start_date', opts.startDate!);
    params.set('end_date', opts.endDate!);
  } else {
    params.set('current', CURRENT_WEATHER_FIELDS.join(','));
    params.set('forecast_days', '7');
  }

  const canQueryAq = !isHistorical || (opts.startDate ?? '') >= '2022-08-01';
  const aqParams = buildAqParams({
    latitude: latStr,
    longitude: lonStr,
    timezone: 'auto',
    mode: isHistorical ? 'historical' : 'live',
    startDate: opts.startDate,
    endDate: opts.endDate,
  });

  const [weatherData, aqData] = await Promise.all([
    fetchJson<OpenMeteoLocationPayload>(`${baseUrl}?${params.toString()}`),
    canQueryAq
      ? fetchJson<OpenMeteoAirQualityPayload>(`${AIR_QUALITY_BASE}?${aqParams.toString()}`).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  const hourlyRaw = weatherData.hourly;
  const dailyRaw = weatherData.daily;
  const hTimes = hourlyRaw?.time ?? [];

  const hourly: HourlyPoint[] = hTimes.map((t, idx) => {
    const tempF = num(hourlyRaw?.temperature_2m?.[idx]);
    const rh = num(hourlyRaw?.relative_humidity_2m?.[idx], 50);
    return {
      time: t,
      temperatureF: tempF,
      apparentTemperatureF: num(hourlyRaw?.apparent_temperature?.[idx], tempF),
      dewPointF: num(hourlyRaw?.dew_point_2m?.[idx], estimateDewPointF(tempF, rh)),
      humidity: rh,
      precipitationMm: num(hourlyRaw?.precipitation?.[idx]),
      precipitationProb: optNum(hourlyRaw?.precipitation_probability?.[idx]),
      windSpeedMph: num(hourlyRaw?.wind_speed_10m?.[idx]),
      windGustMph: optNum(hourlyRaw?.wind_gusts_10m?.[idx]),
      windDirectionDeg: num(hourlyRaw?.wind_direction_10m?.[idx]),
      pressureHpa: optNum(hourlyRaw?.surface_pressure?.[idx]),
      cloudCoverPct: optNum(hourlyRaw?.cloud_cover?.[idx]),
      uvIndex: optNum(hourlyRaw?.uv_index?.[idx]) ?? optNum(aqData?.hourly?.uv_index?.[idx]),
      weatherCode: num(hourlyRaw?.weather_code?.[idx], 0),
    };
  });

  const dTimes = dailyRaw?.time ?? [];
  const daily: DailyPoint[] = dTimes.map((date, idx) => ({
    date,
    tempMaxF: num(dailyRaw?.temperature_2m_max?.[idx]),
    tempMinF: num(dailyRaw?.temperature_2m_min?.[idx]),
    precipitationSumMm: num(dailyRaw?.precipitation_sum?.[idx]),
    precipitationProbMax: optNum(dailyRaw?.precipitation_probability_max?.[idx]),
    windSpeedMaxMph: num(dailyRaw?.wind_speed_10m_max?.[idx]),
    windDirectionDomDeg: num(dailyRaw?.wind_direction_10m_dominant?.[idx]),
    uvIndexMax: optNum(dailyRaw?.uv_index_max?.[idx]),
    weatherCode: num(dailyRaw?.weather_code?.[idx], 0),
    sunrise: dailyRaw?.sunrise?.[idx] ?? undefined,
    sunset: dailyRaw?.sunset?.[idx] ?? undefined,
  }));

  const repHourIdx = isHistorical
    ? Math.min(Math.floor(hourly.length / 2), Math.max(0, hourly.length - 1))
    : findLiveHourIndex(hTimes, weatherData.current?.time);
  const repHour = hourly[repHourIdx];
  const repDay = daily[0];
  const curTempFallback = repHour?.temperatureF ?? 60;

  const current = buildCurrentMetrics({
    mode: isHistorical ? 'historical' : 'live',
    locCurrent: weatherData.current,
    aq: aqData,
    aqHourIdx: repHourIdx,
    repHour,
    tempHighF: repDay?.tempMaxF ?? curTempFallback,
    tempLowF: repDay?.tempMinF ?? curTempFallback,
    uvFallback: isHistorical ? null : repDay?.uvIndexMax ?? null,
    sunrise: repDay?.sunrise,
    sunset: repDay?.sunset,
  });

  return {
    mode: opts.mode,
    code: meta.code,
    name: meta.name,
    city: cityObj.name,
    lat: cityObj.lat,
    lon: cityObj.lon,
    elevationM: Math.round(num(weatherData.elevation, 0)),
    timezone: weatherData.timezone ?? 'UTC',
    fetchedAt: new Date().toISOString(),
    cached: false,
    startDate: opts.startDate ?? dTimes[0] ?? isoDateDaysAgo(0),
    endDate: opts.endDate ?? dTimes[dTimes.length - 1] ?? isoDateDaysAgo(0),
    current,
    hourly,
    daily,
    alerts: [],
  };
}
