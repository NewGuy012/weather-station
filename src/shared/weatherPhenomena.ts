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

export type WeatherFxIntensity = 'subtle' | 'normal' | 'dramatic';

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

export const INTENSITY_MULTIPLIERS: Record<WeatherFxIntensity, number> = {
  subtle: 0.6,
  normal: 1,
  dramatic: 1.45,
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

interface AlertClassification {
  phenomenon: WeatherPhenomenon;
  strength: number;
  isSevere: boolean;
}

function classifyFromAlerts(
  alerts: WeatherAlert[] | undefined,
  windSpeedMph: number,
): AlertClassification | null {
  if (!alerts || alerts.length === 0) return null;

  let thermalFallback: AlertClassification | null = null;

  for (const al of alerts) {
    const text = `${al.event} ${al.headline}`.toLowerCase();
    if (/tornado|hurricane|tropical storm|typhoon/.test(text)) {
      return { phenomenon: 'cyclone', strength: 1, isSevere: true };
    }
    if (/blizzard/.test(text)) {
      return { phenomenon: 'blizzard', strength: 0.95, isSevere: true };
    }
    if (/ice storm|freezing rain|sleet/.test(text)) {
      return { phenomenon: 'freezing-rain', strength: 0.9, isSevere: true };
    }
    if (/hail/.test(text)) {
      return { phenomenon: 'hail', strength: 0.95, isSevere: true };
    }
    if (/severe thunderstorm|thunderstorm warning/.test(text)) {
      return { phenomenon: 'thunderstorm', strength: 0.9, isSevere: true };
    }
    if (/winter storm|snow squall|lake effect snow/.test(text)) {
      return {
        phenomenon: windSpeedMph >= 22 ? 'blizzard' : 'snow',
        strength: 0.85,
        isSevere: true,
      };
    }
    if (/dense fog|freezing fog/.test(text)) {
      return { phenomenon: 'fog', strength: 0.75, isSevere: false };
    }
    if (!thermalFallback && /excessive heat|heat advisory|heat warning/.test(text)) {
      thermalFallback = { phenomenon: 'heat', strength: 0.85, isSevere: al.severity === 'Extreme' };
    } else if (!thermalFallback && /wind chill|extreme cold|arctic/.test(text)) {
      thermalFallback = { phenomenon: 'frost', strength: 0.85, isSevere: al.severity === 'Extreme' };
    }
  }

  return thermalFallback;
}

/**
 * Classifies weather telemetry, WMO codes, and NWS alerts into a map animation phenomenon.
 * Augments ERA5 historical WMO subsets (which omit 95-99, 56-67, and 45) using physical thresholds.
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

  const alertHit = classifyFromAlerts(alerts, wind);
  if (alertHit && PRECIP_AND_STORM_SET.has(alertHit.phenomenon)) {
    return makeStatePhenomenon(
      alertHit.phenomenon,
      alertHit.strength,
      windDeg,
      wind,
      Math.max(precip, 2),
      alertHit.isSevere,
    );
  }

  // Intense cyclonic gale + heavy rain (e.g. Superstorm Sandy, coastal hurricanes)
  if ((wmo.category === 'rain' || wmo.category === 'thunderstorm' || precip >= 2.5) && wind >= 34) {
    return makeStatePhenomenon(
      'cyclone',
      0.75 + (wind - 34) / 35 + precip / 25,
      windDeg,
      wind,
      precip,
      true,
    );
  }

  // Hail-bearing thunderstorms (WMO 96, 99)
  if (telemetry.weatherCode === 96 || telemetry.weatherCode === 99) {
    return makeStatePhenomenon(
      'hail',
      telemetry.weatherCode === 99 ? 1 : 0.78 + precip / 15,
      windDeg,
      wind,
      Math.max(precip, 2.5),
      true,
    );
  }

  // Thunderstorms (WMO 95) or heavy warm-sector convective downpours
  if (wmo.category === 'thunderstorm' || (precip >= 4.5 && temp >= 56 && wmo.category !== 'snow')) {
    return makeStatePhenomenon(
      'thunderstorm',
      0.65 + precip / 14,
      windDeg,
      wind,
      Math.max(precip, 1.5),
      true,
    );
  }

  // Freezing rain / sleet (WMO 56-57, 66-67, or sub-freezing rain)
  if (
    wmo.category === 'freezing-rain' ||
    ((wmo.category === 'rain' || wmo.category === 'drizzle' || precip >= 0.25) &&
      temp <= 32 &&
      wmo.category !== 'snow')
  ) {
    return makeStatePhenomenon(
      'freezing-rain',
      0.45 + precip / 6,
      windDeg,
      wind,
      Math.max(precip, 0.4),
      precip >= 2,
    );
  }

  // Snow & Blizzards (WMO 71-77, 85-86, or sub-freezing precip)
  if (wmo.category === 'snow' || (precip >= 0.3 && temp <= 30)) {
    if (wind >= 22) {
      return makeStatePhenomenon(
        'blizzard',
        0.6 + (wind - 22) / 25 + precip / 8,
        windDeg,
        wind,
        Math.max(precip, 0.5),
        true,
      );
    }
    const heavyBonus = telemetry.weatherCode === 75 || telemetry.weatherCode === 86 ? 0.3 : 0;
    return makeStatePhenomenon(
      'snow',
      0.35 + precip / 5 + heavyBonus,
      windDeg,
      wind,
      Math.max(precip, 0.3),
      precip >= 3,
    );
  }

  // Rain (WMO 61-65, 80-82, or measurable precip >= 0.4 mm/h)
  if (wmo.category === 'rain' || precip >= 0.4) {
    return makeStatePhenomenon(
      'rain',
      0.35 + Math.min(1, precip / 8) * 0.65,
      windDeg,
      wind,
      Math.max(precip, 0.5),
      precip >= 6,
    );
  }

  // Drizzle (WMO 51-55, or light precip >= 0.05 mm/h)
  if (wmo.category === 'drizzle' || precip >= 0.05) {
    return makeStatePhenomenon(
      'drizzle',
      0.28 + Math.min(0.6, precip * 0.9),
      windDeg,
      wind,
      Math.max(precip, 0.1),
      false,
    );
  }

  // Fog (WMO 45, 48)
  if (wmo.category === 'fog') {
    return makeStatePhenomenon(
      'fog',
      telemetry.weatherCode === 48 ? 0.85 : 0.65,
      windDeg,
      wind,
      0,
      false,
    );
  }

  // Thermal NWS alerts for dry states
  if (alertHit) {
    return makeStatePhenomenon(alertHit.phenomenon, alertHit.strength, windDeg, wind, 0, alertHit.isSevere);
  }

  // Metric-contextual atmospheric effects for dry states
  if (metric === 'temperature' || metric === 'apparentTemperature') {
    const hotVal = Math.max(temp, apparent);
    if (hotVal >= 94) {
      return makeStatePhenomenon('heat', 0.4 + (hotVal - 94) / 18, windDeg, wind, 0, hotVal >= 105);
    }
    const coldVal = Math.min(temp, apparent);
    if (coldVal <= 12) {
      return makeStatePhenomenon('frost', 0.4 + (12 - coldVal) / 25, windDeg, wind, 0, coldVal <= 0);
    }
  }

  if (metric === 'uvIndex' && (telemetry.uvIndex ?? 0) >= 7.5) {
    return makeStatePhenomenon(
      'uv',
      0.4 + ((telemetry.uvIndex ?? 7.5) - 7.5) / 4.5,
      windDeg,
      wind,
      0,
      (telemetry.uvIndex ?? 0) >= 10.5,
    );
  }

  if (metric === 'aqi' && (telemetry.usAqi ?? 0) >= 100) {
    return makeStatePhenomenon(
      'aqi',
      0.4 + ((telemetry.usAqi ?? 100) - 100) / 120,
      windDeg,
      wind,
      0,
      (telemetry.usAqi ?? 0) >= 150,
    );
  }

  if (metric === 'humidity' && (telemetry.humidity ?? 0) >= 85) {
    return makeStatePhenomenon('humidity', 0.35 + ((telemetry.humidity ?? 85) - 85) / 15, windDeg, wind, 0);
  }

  if (wmo.category === 'cloudy') {
    const cover = telemetry.cloudCoverPct ?? 85;
    return makeStatePhenomenon('cloudy', 0.25 + (cover / 100) * 0.2, windDeg, wind, 0);
  }

  return makeStatePhenomenon(
    wmo.category === 'partly-cloudy' ? 'partly-cloudy' : 'clear',
    0,
    windDeg,
    wind,
    0,
  );
}

/**
 * Convenience helper to classify a resolved timeline/current weather snapshot slice.
 */
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
      weatherCode: slice.weatherCode,
      precipitationMm: slice.precipitationMm,
      temperatureF: slice.temperatureF,
      apparentTemperatureF: slice.apparentTemperatureF,
      windSpeedMph: slice.windSpeedMph,
      windDirectionDeg: slice.windDirectionDeg,
      humidity: slice.humidity,
      uvIndex: supplements?.uvIndex,
      usAqi: supplements?.usAqi,
      cloudCoverPct: supplements?.cloudCoverPct,
    },
    alerts,
    metric,
  );
}

/**
 * Returns whether a classified phenomenon should render canvas FX on the map for the given metric.
 * In precipitation mode, dry overcast states stay clean so rain clouds stand out unambiguously.
 */
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

/**
 * Generates a curated regional storm showcase across the 50 states so users can preview
 * every map weather animation simultaneously when FX Showcase mode is toggled on.
 */
export function buildShowcasePhenomena(
  states: Record<string, StateWeatherSnapshot>,
): Record<string, StatePhenomenon> {
  const out: Record<string, StatePhenomenon> = {};
  for (const code of Object.keys(states)) {
    const spec = SHOWCASE_BY_STATE[code];
    if (!spec) {
      out[code] = makeStatePhenomenon('clear', 0, 240, 6, 0, false);
      continue;
    }
    out[code] = makeStatePhenomenon(
      spec.phenomenon,
      spec.strength,
      spec.windDeg,
      spec.windMph,
      spec.precipMm,
      Boolean(spec.severe),
    );
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

/**
 * Generates localized showcase phenomena for Top 10 populated cities in Detailed State Mode.
 */
export function buildCityShowcasePhenomena(
  cities: Pick<CityWeatherSnapshot, 'rank' | 'name'>[],
): Record<string, StatePhenomenon> {
  const out: Record<string, StatePhenomenon> = {};
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i]!;
    const spec = CITY_SHOWCASE_CYCLE[i % CITY_SHOWCASE_CYCLE.length]!;
    out[city.name] = makeStatePhenomenon(
      spec.phenomenon,
      spec.strength,
      spec.windDeg,
      spec.windMph,
      spec.precipMm,
      Boolean(spec.severe),
    );
  }
  return out;
}
