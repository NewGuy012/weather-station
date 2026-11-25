import type {
  ColormapId,
  MetricLayer,
  StateCurrentMetrics,
  StateWeatherSnapshot,
  TempUnit,
  TimelinePoint,
} from '../../shared/types';
import { convertWind, formatPrecipValue, formatTemp } from '../../shared/units';

export interface ColorStop {
  value: number;
  rgb: [number, number, number];
  label: string;
}

export interface ColormapOption {
  id: ColormapId;
  label: string;
  description: string;
  palette?: [number, number, number][];
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
    formatMapValue: (v, u) => (v === null ? '—' : formatTemp(v, u)),
    extractCurrent: (m) => m.temperatureF,
    extractTimeline: (t) => t.temperatureF,
  },
  apparentTemperature: {
    id: 'apparentTemperature',
    label: 'Feels Like',
    shortLabel: 'Feels',
    unitLabel: (u) => `°${u}`,
    stops: TEMP_STOPS,
    formatMapValue: (v, u) => (v === null ? '—' : formatTemp(v, u)),
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
      return formatPrecipValue(v, u);
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
    formatMapValue: (v, u) => (v === null ? '—' : `${convertWind(v, u)}`),
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

export const COLORMAPS: ColormapOption[] = [
  {
    id: 'default',
    label: 'Classic',
    description: 'Metric-tailored scale',
  },
  {
    id: 'viridis',
    label: 'Viridis',
    description: 'Perceptual • Colorblind-safe',
    palette: [
      [68, 1, 84],
      [72, 40, 120],
      [62, 74, 137],
      [49, 104, 142],
      [38, 130, 142],
      [53, 183, 121],
      [144, 215, 67],
      [253, 231, 37],
    ],
  },
  {
    id: 'plasma',
    label: 'Plasma',
    description: 'High-contrast sequential',
    palette: [
      [13, 8, 135],
      [84, 2, 163],
      [139, 10, 165],
      [185, 50, 137],
      [219, 92, 104],
      [244, 136, 73],
      [254, 188, 43],
      [240, 249, 33],
    ],
  },
  {
    id: 'inferno',
    label: 'Inferno',
    description: 'Dark-to-warm luminance',
    palette: [
      [12, 8, 38],
      [66, 10, 104],
      [128, 31, 108],
      [187, 55, 84],
      [233, 98, 44],
      [251, 155, 6],
      [247, 211, 64],
      [252, 255, 164],
    ],
  },
  {
    id: 'cividis',
    label: 'Cividis',
    description: 'Deuteranopia-safe scale',
    palette: [
      [0, 32, 76],
      [42, 63, 108],
      [87, 92, 109],
      [124, 123, 120],
      [166, 156, 117],
      [211, 192, 103],
      [253, 231, 55],
    ],
  },
  {
    id: 'coolwarm',
    label: 'Cool–Warm',
    description: 'Diverging blue-to-red',
    palette: [
      [59, 76, 192],
      [98, 130, 234],
      [141, 176, 254],
      [221, 221, 221],
      [244, 154, 123],
      [221, 95, 75],
      [180, 4, 38],
    ],
  },
  {
    id: 'turbo',
    label: 'Turbo',
    description: 'Vivid full spectrum',
    palette: [
      [48, 18, 59],
      [65, 69, 171],
      [40, 188, 235],
      [72, 240, 127],
      [164, 252, 60],
      [250, 186, 57],
      [234, 79, 13],
      [122, 4, 3],
    ],
  },
];

export const COLORMAP_BY_ID: Record<ColormapId, ColormapOption> = Object.fromEntries(
  COLORMAPS.map((c) => [c.id, c]),
) as Record<ColormapId, ColormapOption>;

export function getNextColormapId(current: ColormapId): ColormapId {
  const idx = COLORMAPS.findIndex((c) => c.id === current);
  return COLORMAPS[(idx + 1) % COLORMAPS.length]?.id ?? 'default';
}

export interface ResolvedStateSlice {
  temperatureF: number;
  apparentTemperatureF: number;
  precipitationMm: number;
  windSpeedMph: number;
  windDirectionDeg: number;
  humidity: number;
  weatherCode: number;
  metricSource: TimelinePoint | undefined;
}

export function resolveStateSlice(
  snap: Pick<StateWeatherSnapshot, 'current' | 'timeline'>,
  timelineIndex: number,
  useTimeline: boolean,
): ResolvedStateSlice {
  const t = useTimeline ? snap.timeline[timelineIndex] : undefined;
  return {
    temperatureF: t?.temperatureF ?? snap.current.temperatureF,
    apparentTemperatureF: t?.apparentTemperatureF ?? snap.current.apparentTemperatureF,
    precipitationMm: t?.precipitationMm ?? snap.current.precipitationMm,
    windSpeedMph: t?.windSpeedMph ?? snap.current.windSpeedMph,
    windDirectionDeg: t?.windDirectionDeg ?? snap.current.windDirectionDeg,
    humidity: t?.humidity ?? snap.current.humidity,
    weatherCode: t?.weatherCode ?? snap.current.weatherCode,
    metricSource: t,
  };
}

export function resolveMetricValue(
  scale: MetricScaleConfig,
  current: StateCurrentMetrics,
  slice: ResolvedStateSlice,
): number | null {
  return slice.metricSource
    ? scale.extractTimeline(slice.metricSource, current)
    : scale.extractCurrent(current);
}

function samplePalette<T>(items: T[], normalizedPos: number): { a: T; b: T; frac: number } {
  const t = Math.max(0, Math.min(1, normalizedPos));
  const scaled = t * (items.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(items.length - 1, Math.ceil(scaled));
  return { a: items[lo]!, b: items[hi]!, frac: scaled - lo };
}

function samplePaletteRgb(
  palette: [number, number, number][],
  normalizedPos: number,
): [number, number, number] {
  const { a, b, frac } = samplePalette(palette, normalizedPos);
  return [
    Math.round(a[0] + (b[0] - a[0]) * frac),
    Math.round(a[1] + (b[1] - a[1]) * frac),
    Math.round(a[2] + (b[2] - a[2]) * frac),
  ];
}

function sampleStopValue(stops: ColorStop[], normalizedPos: number): number {
  const { a, b, frac } = samplePalette(stops, normalizedPos);
  return a.value + (b.value - a.value) * frac;
}

/**
 * Resolve color stops for a metric under the active colormap and direction.
 * Preserves the metric's piecewise perceptual domain breakpoints and labels.
 */
export function resolveMetricStops(
  metric: MetricLayer,
  colormap: ColormapId = 'default',
  reverse = false,
): ColorStop[] {
  const baseStops = METRIC_SCALES[metric].stops;
  const option = COLORMAP_BY_ID[colormap] ?? COLORMAPS[0]!;

  if (!option.palette) {
    if (!reverse) return baseStops;
    return baseStops.map((stop, idx) => ({
      ...stop,
      rgb: baseStops[baseStops.length - 1 - idx]!.rgb,
    }));
  }

  const palette = reverse ? [...option.palette].reverse() : option.palette;
  const count = Math.max(baseStops.length, palette.length);
  const midIdx = Math.floor(count / 2);
  const baseMidLabel = baseStops[Math.floor(baseStops.length / 2)]?.label ?? '';

  return Array.from({ length: count }, (_, idx) => {
    const u = count === 1 ? 0 : idx / (count - 1);
    const label =
      idx === 0
        ? baseStops[0]!.label
        : idx === midIdx
          ? baseMidLabel
          : idx === count - 1
            ? baseStops[baseStops.length - 1]!.label
            : '';
    return {
      value: sampleStopValue(baseStops, u),
      rgb: samplePaletteRgb(palette, u),
      label,
    };
  });
}

export function stopsToCssGradient(stops: ColorStop[]): string {
  return `linear-gradient(to right, ${stops
    .map((s) => `rgb(${s.rgb[0]}, ${s.rgb[1]}, ${s.rgb[2]})`)
    .join(', ')})`;
}

export function interpolateColor(
  value: number | null,
  stops: ColorStop[],
  isDark: boolean,
  calmZero = false,
): string {
  if (value === null || !Number.isFinite(value)) {
    return isDark ? 'rgb(30, 41, 59)' : 'rgb(226, 232, 240)';
  }

  // Soften zero precipitation/wind so calm regions stay subdued
  if (value <= (stops[0]?.value ?? 0)) {
    if (calmZero || stops === PRECIP_STOPS || stops === WIND_STOPS) {
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
