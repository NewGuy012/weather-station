import type {
  CityWeatherSnapshot,
  MetricLayer,
  StateCurrentMetrics,
  StateWeatherSnapshot,
  TimelinePoint,
  WeatherAlert,
} from './types';
import { getWmoInfo } from './wmoCodes';

export type WeatherPhenomenon =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'snow'
  | 'blizzard'
  | 'thunderstorm'
  | 'hail'
  | 'cyclone'
  | 'heat'
  | 'frost'
  | 'uv'
  | 'aqi'
  | 'humidity';

export interface PhenomenonTelemetry {
  weatherCode: number;
  precipitationMm: number;
  temperatureF: number;
  apparentTemperatureF?: number;
  windSpeedMph: number;
  windDirectionDeg: number;
  humidity?: number;
  uvIndex?: number | null;
  usAqi?: number | null;
  cloudCoverPct?: number | null;
}

export interface StatePhenomenon {
  phenomenon: WeatherPhenomenon;
  /** Normalized strength 0..1 controlling particle density, cloud opacity, and flash cadence */
  strength: number;
  /** Meteorological wind blow angle in radians; blow vector is (-sin(rad), cos(rad)) */
  windAngleRad: number;
  windSpeedMph: number;
  precipitationMm: number;
  isSevere: boolean;
  label: string;
}

export const PHENOMENON_LABELS: Record<WeatherPhenomenon, string> = {
  clear: 'Clear',
  'partly-cloudy': 'Partly Cloudy',
  cloudy: 'Overcast',
  fog: 'Fog & Mist',
  drizzle: 'Drizzle',
  rain: 'Rain',
  'freezing-rain': 'Freezing Rain',
  snow: 'Snowfall',
  blizzard: 'Blizzard',
  thunderstorm: 'Thunderstorm',
  hail: 'Hailstorm',
  cyclone: 'Cyclone / Gale',
  heat: 'Extreme Heat',
  frost: 'Arctic Frost',
  uv: 'High UV',
  aqi: 'Haze / Smoke',
  humidity: 'Humid Mist',
};

const PRECIP_AND_STORM_SET = new Set<WeatherPhenomenon>([
  'fog',
  'drizzle',
  'rain',
  'freezing-rain',
  'snow',
  'blizzard',
  'thunderstorm',
  'hail',
  'cyclone',
]);

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, val));
}

function makeStatePhenomenon(
  phenomenon: WeatherPhenomenon,
  strength: number,
  windDirectionDeg: number,
  windSpeedMph: number,
  precipitationMm: number,
  isSevere = false,
): StatePhenomenon {
  return {
    phenomenon,
    strength: clamp01(strength),
    windAngleRad: (windDirectionDeg * Math.PI) / 180,
    windSpeedMph: Math.max(0, windSpeedMph),
    precipitationMm: Math.max(0, precipitationMm),
    isSevere,
    label: PHENOMENON_LABELS[phenomenon],
  };
}

interface AlertRule {
  pattern: RegExp;
  phenomenon: WeatherPhenomenon;
  strength: number;
  severe: boolean;
}

const ALERT_RULES: readonly AlertRule[] = [
  { pattern: /tornado|hurricane|tropical storm|typhoon/, phenomenon: 'cyclone', strength: 1, severe: true },
  { pattern: /blizzard/, phenomenon: 'blizzard', strength: 0.95, severe: true },
  { pattern: /ice storm|freezing rain|sleet/, phenomenon: 'freezing-rain', strength: 0.9, severe: true },
  { pattern: /hail/, phenomenon: 'hail', strength: 0.95, severe: true },
  { pattern: /severe thunderstorm|thunderstorm warning/, phenomenon: 'thunderstorm', strength: 0.9, severe: true },
  { pattern: /winter storm|snow squall|lake effect snow/, phenomenon: 'snow', strength: 0.85, severe: true },
  { pattern: /dense fog|freezing fog/, phenomenon: 'fog', strength: 0.75, severe: false },
];

function classifyFromAlerts(
  alerts: WeatherAlert[] | undefined,
  windSpeedMph: number,
): { phenomenon: WeatherPhenomenon; strength: number; isSevere: boolean } | null {
  if (!alerts?.length) return null;

  let bestRuleIdx = ALERT_RULES.length;
  let thermalFallback: { phenomenon: WeatherPhenomenon; strength: number; isSevere: boolean } | null = null;

  for (const al of alerts) {
    const text = `${al.event} ${al.headline}`.toLowerCase();
    const matchedIdx = ALERT_RULES.findIndex((r) => r.pattern.test(text));
    if (matchedIdx >= 0 && matchedIdx < bestRuleIdx) {
      bestRuleIdx = matchedIdx;
    } else if (!thermalFallback && /excessive heat|heat advisory|heat warning/.test(text)) {
      thermalFallback = { phenomenon: 'heat', strength: 0.85, isSevere: al.severity === 'Extreme' };
    } else if (!thermalFallback && /wind chill|extreme cold|arctic/.test(text)) {
      thermalFallback = { phenomenon: 'frost', strength: 0.85, isSevere: al.severity === 'Extreme' };
    }
  }

  if (bestRuleIdx < ALERT_RULES.length) {
    const rule = ALERT_RULES[bestRuleIdx]!;
    return {
      phenomenon: rule.phenomenon === 'snow' && windSpeedMph >= 22 ? 'blizzard' : rule.phenomenon,
      strength: rule.strength,
      isSevere: rule.severe,
    };
  }
  return thermalFallback;
}

/**
 * Classifies telemetry, WMO codes, and NWS alerts into a map phenomenon.
 * Augments ERA5 historical WMO subsets (omitting 95-99, 56-67, 45) via physical thresholds.
 */
export function classifyWeatherPhenomenon(
  telemetry: PhenomenonTelemetry,
  alerts?: WeatherAlert[],
  metric: MetricLayer = 'temperature',
): StatePhenomenon {
  const wmo = getWmoInfo(telemetry.weatherCode);
  const precip = Math.max(0, Number.isFinite(telemetry.precipitationMm) ? telemetry.precipitationMm : 0);
  const wind = Math.max(0, Number.isFinite(telemetry.windSpeedMph) ? telemetry.windSpeedMph : 0);
  const windDeg = Number.isFinite(telemetry.windDirectionDeg) ? telemetry.windDirectionDeg : 240;
  const temp = Number.isFinite(telemetry.temperatureF) ? telemetry.temperatureF : 60;
  const apparent =
    telemetry.apparentTemperatureF !== undefined && Number.isFinite(telemetry.apparentTemperatureF)
      ? telemetry.apparentTemperatureF
      : temp;
  const emit = (phenomenon: WeatherPhenomenon, strength: number, precipMm = 0, isSevere = false) =>
    makeStatePhenomenon(phenomenon, strength, windDeg, wind, precipMm, isSevere);

  const alertHit = classifyFromAlerts(alerts, wind);
  if (alertHit && PRECIP_AND_STORM_SET.has(alertHit.phenomenon)) {
    return emit(alertHit.phenomenon, alertHit.strength, Math.max(precip, 2), alertHit.isSevere);
  }

  if ((wmo.category === 'rain' || wmo.category === 'thunderstorm' || precip >= 2.5) && wind >= 34) {
    return emit('cyclone', 0.75 + (wind - 34) / 35 + precip / 25, precip, true);
  }
  if (telemetry.weatherCode === 96 || telemetry.weatherCode === 99) {
    return emit('hail', telemetry.weatherCode === 99 ? 1 : 0.78 + precip / 15, Math.max(precip, 2.5), true);
  }
  if (wmo.category === 'thunderstorm' || (precip >= 4.5 && temp >= 56 && wmo.category !== 'snow')) {
    return emit('thunderstorm', 0.65 + precip / 14, Math.max(precip, 1.5), true);
  }
  if (
    wmo.category === 'freezing-rain' ||
    ((wmo.category === 'rain' || wmo.category === 'drizzle' || precip >= 0.25) &&
      temp <= 32 &&
      wmo.category !== 'snow')
  ) {
    return emit('freezing-rain', 0.45 + precip / 6, Math.max(precip, 0.4), precip >= 2);
  }
  if (wmo.category === 'snow' || (precip >= 0.3 && temp <= 30)) {
    if (wind >= 22) {
      return emit('blizzard', 0.6 + (wind - 22) / 25 + precip / 8, Math.max(precip, 0.5), true);
    }
    const heavyBonus = telemetry.weatherCode === 75 || telemetry.weatherCode === 86 ? 0.3 : 0;
    return emit('snow', 0.35 + precip / 5 + heavyBonus, Math.max(precip, 0.3), precip >= 3);
  }
  if (wmo.category === 'rain' || precip >= 0.4) {
    return emit('rain', 0.35 + Math.min(1, precip / 8) * 0.65, Math.max(precip, 0.5), precip >= 6);
  }
  if (wmo.category === 'drizzle' || precip >= 0.05) {
    return emit('drizzle', 0.28 + Math.min(0.6, precip * 0.9), Math.max(precip, 0.1));
  }
  if (wmo.category === 'fog') {
    return emit('fog', telemetry.weatherCode === 48 ? 0.85 : 0.65);
  }
  if (alertHit) {
    return emit(alertHit.phenomenon, alertHit.strength, 0, alertHit.isSevere);
  }

  if (metric === 'temperature' || metric === 'apparentTemperature') {
    const hotVal = Math.max(temp, apparent);
    if (hotVal >= 94) return emit('heat', 0.4 + (hotVal - 94) / 18, 0, hotVal >= 105);
    const coldVal = Math.min(temp, apparent);
    if (coldVal <= 12) return emit('frost', 0.4 + (12 - coldVal) / 25, 0, coldVal <= 0);
  }
  if (metric === 'uvIndex' && (telemetry.uvIndex ?? 0) >= 7.5) {
    const uv = telemetry.uvIndex ?? 7.5;
    return emit('uv', 0.4 + (uv - 7.5) / 4.5, 0, uv >= 10.5);
  }
  if (metric === 'aqi' && (telemetry.usAqi ?? 0) >= 100) {
    const aqi = telemetry.usAqi ?? 100;
    return emit('aqi', 0.4 + (aqi - 100) / 120, 0, aqi >= 150);
  }
  if (metric === 'humidity' && (telemetry.humidity ?? 0) >= 85) {
    return emit('humidity', 0.35 + ((telemetry.humidity ?? 85) - 85) / 15);
  }
  if (wmo.category === 'cloudy') {
    return emit('cloudy', 0.25 + ((telemetry.cloudCoverPct ?? 85) / 100) * 0.2);
  }

  return emit(wmo.category === 'partly-cloudy' ? 'partly-cloudy' : 'clear', 0);
}

export function classifySnapshotPhenomenon(
  slice: Pick<
    TimelinePoint,
    | 'weatherCode'
    | 'precipitationMm'
    | 'temperatureF'
    | 'apparentTemperatureF'
    | 'windSpeedMph'
    | 'windDirectionDeg'
    | 'humidity'
  >,
  supplements?: Partial<Pick<StateCurrentMetrics, 'uvIndex' | 'usAqi' | 'cloudCoverPct'>>,
  alerts?: WeatherAlert[],
  metric: MetricLayer = 'temperature',
): StatePhenomenon {
  return classifyWeatherPhenomenon(
    {
      ...slice,
      uvIndex: supplements?.uvIndex,
      usAqi: supplements?.usAqi,
      cloudCoverPct: supplements?.cloudCoverPct,
    },
    alerts,
    metric,
  );
}

export function classifyStatesPhenomena(
  states: Record<string, StateWeatherSnapshot>,
  timelineIndex: number,
  useTimeline: boolean,
  alertsByState: Record<string, WeatherAlert[]> | undefined,
  metric: MetricLayer,
  showcase = false,
): Record<string, StatePhenomenon> {
  if (showcase) return buildShowcasePhenomena(states);
  const out: Record<string, StatePhenomenon> = {};
  for (const [code, snap] of Object.entries(states)) {
    const t = useTimeline ? snap.timeline[timelineIndex] : undefined;
    out[code] = classifySnapshotPhenomenon(
      t ?? snap.current,
      snap.current,
      alertsByState?.[code],
      metric,
    );
  }
  return out;
}

/** Suppress dry overcast clouds in precipitation mode so rain bands stand out clearly. */
export function hasActiveMapFx(phenomenon: WeatherPhenomenon, metric: MetricLayer): boolean {
  if (phenomenon === 'clear' || phenomenon === 'partly-cloudy') return false;
  if (phenomenon === 'cloudy') return metric !== 'precipitation';
  return true;
}

interface ShowcaseSpec {
  phenomenon: WeatherPhenomenon;
  strength: number;
  windDeg: number;
  windMph: number;
  precipMm: number;
  severe?: boolean;
}

function specToPhenomenon(spec?: ShowcaseSpec): StatePhenomenon {
  if (!spec) return makeStatePhenomenon('clear', 0, 240, 6, 0, false);
  return makeStatePhenomenon(
    spec.phenomenon,
    spec.strength,
    spec.windDeg,
    spec.windMph,
    spec.precipMm,
    Boolean(spec.severe),
  );
}

const SHOWCASE_BY_STATE: Record<string, ShowcaseSpec> = {
  WA: { phenomenon: 'rain', strength: 0.9, windDeg: 235, windMph: 16, precipMm: 4.5 },
  OR: { phenomenon: 'rain', strength: 0.72, windDeg: 230, windMph: 13, precipMm: 2.8 },
  CA: { phenomenon: 'fog', strength: 0.8, windDeg: 280, windMph: 8, precipMm: 0 },
  ID: { phenomenon: 'blizzard', strength: 0.85, windDeg: 295, windMph: 28, precipMm: 2.2, severe: true },
  MT: { phenomenon: 'blizzard', strength: 0.95, windDeg: 300, windMph: 34, precipMm: 3.1, severe: true },
  WY: { phenomenon: 'blizzard', strength: 0.88, windDeg: 290, windMph: 30, precipMm: 2.4, severe: true },
  CO: { phenomenon: 'snow', strength: 0.8, windDeg: 260, windMph: 11, precipMm: 2.0 },
  AK: { phenomenon: 'snow', strength: 0.85, windDeg: 45, windMph: 12, precipMm: 1.8 },
  AZ: { phenomenon: 'heat', strength: 0.9, windDeg: 190, windMph: 7, precipMm: 0 },
  NV: { phenomenon: 'heat', strength: 0.78, windDeg: 210, windMph: 9, precipMm: 0 },
  NM: { phenomenon: 'uv', strength: 0.85, windDeg: 200, windMph: 8, precipMm: 0 },
  OK: { phenomenon: 'hail', strength: 0.95, windDeg: 215, windMph: 26, precipMm: 6.5, severe: true },
  KS: { phenomenon: 'hail', strength: 0.9, windDeg: 210, windMph: 24, precipMm: 5.8, severe: true },
  NE: { phenomenon: 'hail', strength: 0.8, windDeg: 220, windMph: 22, precipMm: 4.6, severe: true },
  TX: { phenomenon: 'thunderstorm', strength: 0.95, windDeg: 185, windMph: 24, precipMm: 8.2, severe: true },
  LA: { phenomenon: 'thunderstorm', strength: 0.88, windDeg: 175, windMph: 21, precipMm: 6.8, severe: true },
  FL: { phenomenon: 'cyclone', strength: 1, windDeg: 135, windMph: 48, precipMm: 11.5, severe: true },
  GA: { phenomenon: 'rain', strength: 0.8, windDeg: 145, windMph: 20, precipMm: 4.2 },
  MN: { phenomenon: 'freezing-rain', strength: 0.88, windDeg: 30, windMph: 15, precipMm: 2.1, severe: true },
  WI: { phenomenon: 'freezing-rain', strength: 0.84, windDeg: 35, windMph: 14, precipMm: 1.9, severe: true },
  MI: { phenomenon: 'freezing-rain', strength: 0.78, windDeg: 40, windMph: 14, precipMm: 1.7 },
  ND: { phenomenon: 'frost', strength: 0.88, windDeg: 350, windMph: 14, precipMm: 0 },
  SD: { phenomenon: 'frost', strength: 0.8, windDeg: 345, windMph: 12, precipMm: 0 },
  OH: { phenomenon: 'aqi', strength: 0.82, windDeg: 250, windMph: 10, precipMm: 0 },
  IN: { phenomenon: 'aqi', strength: 0.75, windDeg: 245, windMph: 9, precipMm: 0 },
  NY: { phenomenon: 'rain', strength: 0.78, windDeg: 205, windMph: 14, precipMm: 3.1 },
  PA: { phenomenon: 'rain', strength: 0.68, windDeg: 210, windMph: 12, precipMm: 2.4 },
  ME: { phenomenon: 'drizzle', strength: 0.75, windDeg: 165, windMph: 10, precipMm: 0.4 },
  MA: { phenomenon: 'drizzle', strength: 0.7, windDeg: 170, windMph: 11, precipMm: 0.3 },
  HI: { phenomenon: 'rain', strength: 0.75, windDeg: 75, windMph: 14, precipMm: 2.4 },
};

export function buildShowcasePhenomena(
  states: Record<string, StateWeatherSnapshot>,
): Record<string, StatePhenomenon> {
  const out: Record<string, StatePhenomenon> = {};
  for (const code of Object.keys(states)) {
    out[code] = specToPhenomenon(SHOWCASE_BY_STATE[code]);
  }
  return out;
}

const CITY_SHOWCASE_CYCLE: ShowcaseSpec[] = [
  { phenomenon: 'thunderstorm', strength: 0.92, windDeg: 210, windMph: 22, precipMm: 7.2, severe: true },
  { phenomenon: 'rain', strength: 0.84, windDeg: 225, windMph: 15, precipMm: 3.8 },
  { phenomenon: 'hail', strength: 0.88, windDeg: 200, windMph: 24, precipMm: 5.5, severe: true },
  { phenomenon: 'snow', strength: 0.8, windDeg: 315, windMph: 11, precipMm: 1.9 },
  { phenomenon: 'fog', strength: 0.75, windDeg: 270, windMph: 6, precipMm: 0 },
  { phenomenon: 'drizzle', strength: 0.65, windDeg: 240, windMph: 9, precipMm: 0.3 },
  { phenomenon: 'blizzard', strength: 0.86, windDeg: 300, windMph: 29, precipMm: 2.3, severe: true },
  { phenomenon: 'freezing-rain', strength: 0.8, windDeg: 40, windMph: 13, precipMm: 1.6, severe: true },
  { phenomenon: 'heat', strength: 0.82, windDeg: 185, windMph: 7, precipMm: 0 },
  { phenomenon: 'cyclone', strength: 0.92, windDeg: 140, windMph: 42, precipMm: 9.0, severe: true },
];

export function buildCityShowcasePhenomena(
  cities: Pick<CityWeatherSnapshot, 'rank' | 'name'>[],
): Record<string, StatePhenomenon> {
  const out: Record<string, StatePhenomenon> = {};
  for (let i = 0; i < cities.length; i++) {
    out[cities[i]!.name] = specToPhenomenon(CITY_SHOWCASE_CYCLE[i % CITY_SHOWCASE_CYCLE.length]);
  }
  return out;
}
