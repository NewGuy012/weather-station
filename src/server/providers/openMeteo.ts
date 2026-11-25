import { US_STATES, STATE_BY_CODE } from '../data/states';
import { TOP_CITIES_BY_STATE } from '../data/topCities';
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

const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_BASE = 'https://archive-api.open-meteo.com/v1/archive';
const AIR_QUALITY_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';

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
  const tempC = ((tempF - 32) * 5) / 9;
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
    timeline.push({
      time: ensureUtcIso(t),
      temperatureF: num(hourly?.temperature_2m?.[h]),
      apparentTemperatureF: num(hourly?.apparent_temperature?.[h], num(hourly?.temperature_2m?.[h])),
      precipitationMm: num(hourly?.precipitation?.[h]),
      windSpeedMph: num(hourly?.wind_speed_10m?.[h]),
      windDirectionDeg: num(hourly?.wind_direction_10m?.[h]),
      humidity: num(hourly?.relative_humidity_2m?.[h], 50),
      weatherCode: num(hourly?.weather_code?.[h], 0),
    });
  }

  // Choose representative snapshot metrics:
  // In live mode, prefer `loc.current`. In historical mode, pick midpoint/default frame.
  const fallbackFrameIdx = Math.min(
    Math.max(0, opts.defaultFrameIndex ?? Math.floor(timeline.length / 2)),
    Math.max(0, timeline.length - 1),
  );
  const rep = timeline[fallbackFrameIdx];
  const repHourIdx = Math.min(fallbackFrameIdx * stride, Math.max(0, times.length - 1));

  const currentTemp =
    opts.mode === 'live' && loc.current
      ? num(loc.current.temperature_2m)
      : rep?.temperatureF ?? 60;
  const currentRh =
    opts.mode === 'live' && loc.current
      ? num(loc.current.relative_humidity_2m, 50)
      : rep?.humidity ?? 50;
  const currentApparent =
    opts.mode === 'live' && loc.current
      ? num(loc.current.apparent_temperature, currentTemp)
      : rep?.apparentTemperatureF ?? currentTemp;

  const aqMidIdx = aq?.hourly?.time
    ? Math.min(repHourIdx, Math.max(0, aq.hourly.time.length - 1))
    : 0;

  const usAqi =
    opts.mode === 'live'
      ? optNum(aq?.current?.us_aqi)
      : optNum(aq?.hourly?.us_aqi?.[aqMidIdx]);
  const pm25 =
    opts.mode === 'live'
      ? optNum(aq?.current?.pm2_5)
      : optNum(aq?.hourly?.pm2_5?.[aqMidIdx]);
  const uvIndex =
    opts.mode === 'live'
      ? optNum(aq?.current?.uv_index) ?? optNum(daily?.uv_index_max?.[0])
      : optNum(aq?.hourly?.uv_index?.[aqMidIdx]) ?? optNum(daily?.uv_index_max?.[0]);

  const dailyHighs = (daily?.temperature_2m_max ?? []).filter((v): v is number => typeof v === 'number');
  const dailyLows = (daily?.temperature_2m_min ?? []).filter((v): v is number => typeof v === 'number');
  const tempHighF =
    opts.mode === 'live'
      ? num(daily?.temperature_2m_max?.[0], currentTemp)
      : dailyHighs.length > 0
        ? Math.max(...dailyHighs)
        : currentTemp;
  const tempLowF =
    opts.mode === 'live'
      ? num(daily?.temperature_2m_min?.[0], currentTemp)
      : dailyLows.length > 0
        ? Math.min(...dailyLows)
        : currentTemp;

  const current: StateCurrentMetrics = {
    temperatureF: currentTemp,
    apparentTemperatureF: currentApparent,
    humidity: currentRh,
    dewPointF:
      opts.mode === 'live' && loc.current?.dew_point_2m !== undefined
        ? num(loc.current.dew_point_2m, estimateDewPointF(currentTemp, currentRh))
        : num(hourly?.dew_point_2m?.[repHourIdx], estimateDewPointF(currentTemp, currentRh)),
    precipitationMm:
      opts.mode === 'live' && loc.current
        ? num(loc.current.precipitation)
        : rep?.precipitationMm ?? 0,
    precipitationProb: optNum(hourly?.precipitation_probability?.[repHourIdx]),
    windSpeedMph:
      opts.mode === 'live' && loc.current
        ? num(loc.current.wind_speed_10m)
        : rep?.windSpeedMph ?? 0,
    windGustMph:
      opts.mode === 'live' && loc.current
        ? optNum(loc.current.wind_gusts_10m)
        : optNum(hourly?.wind_gusts_10m?.[repHourIdx]),
    windDirectionDeg:
      opts.mode === 'live' && loc.current
        ? num(loc.current.wind_direction_10m)
        : rep?.windDirectionDeg ?? 0,
    pressureHpa:
      opts.mode === 'live' && loc.current
        ? optNum(loc.current.surface_pressure)
        : optNum(hourly?.surface_pressure?.[repHourIdx]),
    cloudCoverPct:
      opts.mode === 'live' && loc.current
        ? optNum(loc.current.cloud_cover)
        : optNum(hourly?.cloud_cover?.[repHourIdx]),
    weatherCode:
      opts.mode === 'live' && loc.current
        ? num(loc.current.weather_code, 0)
        : rep?.weatherCode ?? 0,
    uvIndex,
    usAqi,
    pm25,
    tempHighF,
    tempLowF,
    sunrise: daily?.sunrise?.[0] ?? undefined,
    sunset: daily?.sunset?.[0] ?? undefined,
  };

  return {
    timezone: loc.timezone ?? 'UTC',
    current,
    timeline,
  };
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
      timezone: extracted.timezone,
      current: extracted.current,
      timeline: extracted.timeline,
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
      timezone: extracted.timezone,
      current: extracted.current,
      timeline: extracted.timeline,
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
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function shouldUseArchiveEndpoint(endDate: string): boolean {
  const fiveDaysAgo = isoDateDaysAgo(5);
  return endDate <= fiveDaysAgo;
}

async function fetchJson<T>(url: string, timeoutMs = 18_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Open-Meteo HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
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

  if (opts.mode === 'live') {
    const forecastParams = new URLSearchParams({
      latitude: lats,
      longitude: lons,
      current: [
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
      ].join(','),
      hourly: [
        'temperature_2m',
        'apparent_temperature',
        'relative_humidity_2m',
        'dew_point_2m',
        'precipitation',
        'precipitation_probability',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
        'surface_pressure',
        'cloud_cover',
      ].join(','),
      daily: [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'uv_index_max',
        'weather_code',
        'sunrise',
        'sunset',
      ].join(','),
      forecast_days: '3',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: 'UTC',
    });

    const aqParams = new URLSearchParams({
      latitude: lats,
      longitude: lons,
      current: 'us_aqi,pm2_5,uv_index',
      timezone: 'UTC',
    });

    const [forecastRaw, aqResult] = await Promise.all([
      fetchJson<OpenMeteoLocationPayload | OpenMeteoLocationPayload[]>(
        `${FORECAST_BASE}?${forecastParams.toString()}`,
      ),
      fetchJson<OpenMeteoAirQualityPayload | OpenMeteoAirQualityPayload[]>(
        `${AIR_QUALITY_BASE}?${aqParams.toString()}`,
        8_000,
      ).catch(() => null),
    ]);

    return {
      locations: normalizeArrayPayload(forecastRaw),
      aqLocations: aqResult ? normalizeArrayPayload(aqResult) : coords.map(() => null),
      startDate: isoDateDaysAgo(0),
      endDate: isoDateDaysAgo(-2),
    };
  }

  const startDate = opts.startDate ?? isoDateDaysAgo(5);
  const endDate = opts.endDate ?? isoDateDaysAgo(1);
  const useArchive = shouldUseArchiveEndpoint(endDate);
  const baseUrl = useArchive ? ARCHIVE_BASE : FORECAST_BASE;

  const params = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    start_date: startDate,
    end_date: endDate,
    hourly: [
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
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
      'weather_code',
      'sunrise',
      'sunset',
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'UTC',
  });

  // Air quality archive only spans recent years (~2022-08 onward)
  const canQueryAq = startDate >= '2022-08-01';
  const aqParams = new URLSearchParams({
    latitude: lats,
    longitude: lons,
    start_date: startDate,
    end_date: endDate,
    hourly: 'us_aqi,pm2_5,uv_index',
    timezone: 'UTC',
  });

  const [weatherRaw, aqResult] = await Promise.all([
    fetchJson<OpenMeteoLocationPayload | OpenMeteoLocationPayload[]>(
      `${baseUrl}?${params.toString()}`,
      25_000,
    ),
    canQueryAq
      ? fetchJson<OpenMeteoAirQualityPayload | OpenMeteoAirQualityPayload[]>(
          `${AIR_QUALITY_BASE}?${aqParams.toString()}`,
          15_000,
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
    {
      mode: 'historical',
      startDate: opts.startDate,
      endDate: opts.endDate,
      precision: 2,
    },
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
    {
      mode: opts.mode,
      startDate: opts.startDate,
      endDate: opts.endDate,
      precision: 4,
    },
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

  const topCities = TOP_CITIES_BY_STATE[upperCode] ?? [];
  const cityObj =
    meta.cities.find((c) => c.name.toLowerCase() === opts.cityName?.toLowerCase()) ??
    topCities.find((c) => c.name.toLowerCase() === opts.cityName?.toLowerCase()) ??
    meta.cities[0]!;

  const isHistorical = opts.mode === 'historical' && opts.startDate && opts.endDate;
  const useArchive = isHistorical && shouldUseArchiveEndpoint(opts.endDate!);
  const baseUrl = isHistorical ? (useArchive ? ARCHIVE_BASE : FORECAST_BASE) : FORECAST_BASE;

  const params = new URLSearchParams({
    latitude: cityObj.lat.toFixed(4),
    longitude: cityObj.lon.toFixed(4),
    hourly: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'dew_point_2m',
      'precipitation',
      ...(useArchive ? [] : ['precipitation_probability', 'uv_index']),
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'surface_pressure',
      'cloud_cover',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      ...(useArchive ? [] : ['precipitation_probability_max', 'uv_index_max']),
      'wind_speed_10m_max',
      'wind_direction_10m_dominant',
      'weather_code',
      'sunrise',
      'sunset',
    ].join(','),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    timezone: 'auto',
  });

  if (isHistorical) {
    params.set('start_date', opts.startDate!);
    params.set('end_date', opts.endDate!);
  } else {
    params.set(
      'current',
      [
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
      ].join(','),
    );
    params.set('forecast_days', '7');
  }

  const aqParams = new URLSearchParams({
    latitude: cityObj.lat.toFixed(4),
    longitude: cityObj.lon.toFixed(4),
    timezone: 'auto',
  });
  if (isHistorical) {
    aqParams.set('start_date', opts.startDate!);
    aqParams.set('end_date', opts.endDate!);
    aqParams.set('hourly', 'us_aqi,pm2_5,uv_index');
  } else {
    aqParams.set('current', 'us_aqi,pm2_5,uv_index');
  }

  const canQueryAq = !isHistorical || (opts.startDate ?? '') >= '2022-08-01';

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

  const repHourIdx = Math.min(Math.floor(hourly.length / 2), Math.max(0, hourly.length - 1));
  const repHour = hourly[repHourIdx];
  const repDay = daily[0];

  const curTemp =
    !isHistorical && weatherData.current
      ? num(weatherData.current.temperature_2m)
      : repHour?.temperatureF ?? 60;
  const curRh =
    !isHistorical && weatherData.current
      ? num(weatherData.current.relative_humidity_2m, 50)
      : repHour?.humidity ?? 50;

  const current: StateCurrentMetrics = {
    temperatureF: curTemp,
    apparentTemperatureF:
      !isHistorical && weatherData.current
        ? num(weatherData.current.apparent_temperature, curTemp)
        : repHour?.apparentTemperatureF ?? curTemp,
    humidity: curRh,
    dewPointF: repHour?.dewPointF ?? estimateDewPointF(curTemp, curRh),
    precipitationMm:
      !isHistorical && weatherData.current
        ? num(weatherData.current.precipitation)
        : repHour?.precipitationMm ?? 0,
    precipitationProb: repHour?.precipitationProb ?? null,
    windSpeedMph:
      !isHistorical && weatherData.current
        ? num(weatherData.current.wind_speed_10m)
        : repHour?.windSpeedMph ?? 0,
    windGustMph:
      !isHistorical && weatherData.current
        ? optNum(weatherData.current.wind_gusts_10m)
        : repHour?.windGustMph ?? null,
    windDirectionDeg:
      !isHistorical && weatherData.current
        ? num(weatherData.current.wind_direction_10m)
        : repHour?.windDirectionDeg ?? 0,
    pressureHpa:
      !isHistorical && weatherData.current
        ? optNum(weatherData.current.surface_pressure)
        : repHour?.pressureHpa ?? null,
    cloudCoverPct:
      !isHistorical && weatherData.current
        ? optNum(weatherData.current.cloud_cover)
        : repHour?.cloudCoverPct ?? null,
    weatherCode:
      !isHistorical && weatherData.current
        ? num(weatherData.current.weather_code, 0)
        : repHour?.weatherCode ?? 0,
    uvIndex:
      !isHistorical
        ? optNum(aqData?.current?.uv_index) ?? repDay?.uvIndexMax ?? null
        : optNum(aqData?.hourly?.uv_index?.[repHourIdx]) ?? null,
    usAqi:
      !isHistorical
        ? optNum(aqData?.current?.us_aqi)
        : optNum(aqData?.hourly?.us_aqi?.[repHourIdx]),
    pm25:
      !isHistorical
        ? optNum(aqData?.current?.pm2_5)
        : optNum(aqData?.hourly?.pm2_5?.[repHourIdx]),
    tempHighF: repDay?.tempMaxF ?? curTemp,
    tempLowF: repDay?.tempMinF ?? curTemp,
    sunrise: repDay?.sunrise,
    sunset: repDay?.sunset,
  };

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
