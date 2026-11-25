import type { MetricLayer, StateCurrentMetrics, TempUnit, TimelinePoint } from '../../shared/types';
import { fToC } from '../../shared/units';

export interface ColorStop {
  value: number;
  rgb: [number, number, number];
  label: string;
}

export interface MetricScaleConfig {
  id: MetricLayer;
  label: string;
  shortLabel: string;
  unitLabel: (unit: TempUnit) => string;
  stops: ColorStop[];
  formatMapValue: (val: number | null, unit: TempUnit) => string;
  extractCurrent: (m: StateCurrentMetrics) => number | null;
  extractTimeline: (t: TimelinePoint, fallback: StateCurrentMetrics) => number | null;
}

const TEMP_STOPS: ColorStop[] = [
  { value: 0, rgb: [30, 58, 138], label: '0°' },
  { value: 20, rgb: [37, 99, 235], label: '20°' },
  { value: 35, rgb: [56, 189, 248], label: '35°' },
  { value: 50, rgb: [45, 212, 191], label: '50°' },
  { value: 65, rgb: [163, 230, 53], label: '65°' },
  { value: 78, rgb: [250, 204, 21], label: '78°' },
  { value: 90, rgb: [249, 115, 22], label: '90°' },
  { value: 105, rgb: [220, 38, 38], label: '105°+' },
];

const PRECIP_STOPS: ColorStop[] = [
  { value: 0, rgb: [226, 232, 240], label: '0' },
  { value: 0.5, rgb: [125, 211, 252], label: 'Lt' },
  { value: 2, rgb: [56, 189, 248], label: '2' },
  { value: 5, rgb: [37, 99, 235], label: '5' },
  { value: 10, rgb: [109, 40, 217], label: '10+' },
];

const WIND_STOPS: ColorStop[] = [
  { value: 0, rgb: [226, 232, 240], label: '0' },
  { value: 8, rgb: [94, 234, 212], label: '8' },
  { value: 16, rgb: [56, 189, 248], label: '16' },
  { value: 25, rgb: [245, 158, 11], label: '25' },
  { value: 38, rgb: [225, 29, 72], label: '38+' },
];

const HUMIDITY_STOPS: ColorStop[] = [
  { value: 15, rgb: [253, 230, 138], label: '15%' },
  { value: 40, rgb: [167, 243, 208], label: '40%' },
  { value: 65, rgb: [56, 189, 248], label: '65%' },
  { value: 90, rgb: [59, 130, 246], label: '90%+' },
];

const UV_STOPS: ColorStop[] = [
  { value: 0, rgb: [134, 239, 172], label: '0' },
  { value: 3, rgb: [253, 224, 71], label: '3' },
  { value: 6, rgb: [251, 146, 60], label: '6' },
  { value: 8, rgb: [239, 68, 68], label: '8' },
  { value: 11, rgb: [147, 51, 234], label: '11+' },
];

const AQI_STOPS: ColorStop[] = [
  { value: 0, rgb: [52, 211, 153], label: '0' },
  { value: 50, rgb: [163, 230, 53], label: '50' },
  { value: 100, rgb: [251, 191, 36], label: '100' },
  { value: 150, rgb: [249, 115, 22], label: '150' },
  { value: 200, rgb: [220, 38, 38], label: '200+' },
];

export const METRIC_SCALES: Record<MetricLayer, MetricScaleConfig> = {
  temperature: {
    id: 'temperature',
    label: 'Temperature',
    shortLabel: 'Temp',
    unitLabel: (u) => `°${u}`,
    stops: TEMP_STOPS,
    formatMapValue: (v, u) => (v === null ? '—' : `${Math.round(u === 'C' ? fToC(v) : v)}°`),
    extractCurrent: (m) => m.temperatureF,
    extractTimeline: (t) => t.temperatureF,
  },
  apparentTemperature: {
    id: 'apparentTemperature',
    label: 'Feels Like',
    shortLabel: 'Feels',
    unitLabel: (u) => `°${u}`,
    stops: TEMP_STOPS,
    formatMapValue: (v, u) => (v === null ? '—' : `${Math.round(u === 'C' ? fToC(v) : v)}°`),
    extractCurrent: (m) => m.apparentTemperatureF,
    extractTimeline: (t) => t.apparentTemperatureF,
  },
  precipitation: {
    id: 'precipitation',
    label: 'Precipitation',
    shortLabel: 'Precip',
    unitLabel: (u) => (u === 'C' ? 'mm/h' : 'in/h'),
    stops: PRECIP_STOPS,
    formatMapValue: (v, u) => {
      if (v === null) return '—';
      if (v < 0.05) return '0';
      return u === 'C' ? `${v.toFixed(1)}` : `${(v / 25.4).toFixed(2)}`;
    },
    extractCurrent: (m) => m.precipitationMm,
    extractTimeline: (t) => t.precipitationMm,
  },
  windSpeed: {
    id: 'windSpeed',
    label: 'Wind Speed',
    shortLabel: 'Wind',
    unitLabel: (u) => (u === 'C' ? 'km/h' : 'mph'),
    stops: WIND_STOPS,
    formatMapValue: (v, u) =>
      v === null ? '—' : `${Math.round(u === 'C' ? v * 1.60934 : v)}`,
    extractCurrent: (m) => m.windSpeedMph,
    extractTimeline: (t) => t.windSpeedMph,
  },
  humidity: {
    id: 'humidity',
    label: 'Relative Humidity',
    shortLabel: 'Humidity',
    unitLabel: () => '%',
    stops: HUMIDITY_STOPS,
    formatMapValue: (v) => (v === null ? '—' : `${Math.round(v)}%`),
    extractCurrent: (m) => m.humidity,
    extractTimeline: (t) => t.humidity,
  },
  aqi: {
    id: 'aqi',
    label: 'US Air Quality (AQI)',
    shortLabel: 'AQI',
    unitLabel: () => 'US AQI',
    stops: AQI_STOPS,
    formatMapValue: (v) => (v === null ? '—' : `${Math.round(v)}`),
    extractCurrent: (m) => m.usAqi,
    extractTimeline: (_t, fallback) => fallback.usAqi,
  },
  uvIndex: {
    id: 'uvIndex',
    label: 'UV Index',
    shortLabel: 'UV',
    unitLabel: () => 'UV',
    stops: UV_STOPS,
    formatMapValue: (v) => (v === null ? '—' : v.toFixed(1).replace(/\.0$/, '')),
    extractCurrent: (m) => m.uvIndex,
    extractTimeline: (_t, fallback) => fallback.uvIndex,
  },
};

export const METRIC_LIST: MetricScaleConfig[] = [
  METRIC_SCALES.temperature,
  METRIC_SCALES.apparentTemperature,
  METRIC_SCALES.precipitation,
  METRIC_SCALES.windSpeed,
  METRIC_SCALES.humidity,
  METRIC_SCALES.aqi,
  METRIC_SCALES.uvIndex,
];

export function interpolateColor(
  value: number | null,
  stops: ColorStop[],
  isDark: boolean,
): string {
  if (value === null || !Number.isFinite(value)) {
    return isDark ? 'rgb(30, 41, 59)' : 'rgb(226, 232, 240)';
  }

  // Soften zero precipitation/wind in dark mode so map remains calm
  if (value <= (stops[0]?.value ?? 0)) {
    if (stops === PRECIP_STOPS || stops === WIND_STOPS) {
      return isDark ? 'rgb(24, 34, 52)' : 'rgb(235, 240, 247)';
    }
    const [r, g, b] = stops[0]!.rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }

  const last = stops[stops.length - 1]!;
  if (value >= last.value) {
    const [r, g, b] = last.rgb;
    return `rgb(${r}, ${g}, ${b})`;
  }

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    if (value >= a.value && value <= b.value) {
      const span = b.value - a.value || 1;
      const t = (value - a.value) / span;
      const r = Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t);
      const g = Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t);
      const bl = Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t);
      return `rgb(${r}, ${g}, ${bl})`;
    }
  }

  return isDark ? 'rgb(30, 41, 59)' : 'rgb(226, 232, 240)';
}

export function isColorLight(rgbStr: string): boolean {
  const m = rgbStr.match(/\d+/g);
  if (!m || m.length < 3) return true;
  const r = Number(m[0]);
  const g = Number(m[1]);
  const b = Number(m[2]);
  // Relative luminance heuristic
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.57;
}
