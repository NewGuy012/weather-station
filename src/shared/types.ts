export type WeatherMode = 'historical' | 'live';

export type MetricLayer =
  | 'temperature'
  | 'apparentTemperature'
  | 'precipitation'
  | 'windSpeed'
  | 'humidity'
  | 'uvIndex'
  | 'aqi';

export type TempUnit = 'F' | 'C';

export type ThemeMode = 'light' | 'dark';

export type ColormapId =
  | 'default'
  | 'viridis'
  | 'plasma'
  | 'inferno'
  | 'cividis'
  | 'coolwarm'
  | 'turbo';

export type USRegion =
  | 'Northeast'
  | 'Southeast'
  | 'Midwest'
  | 'Southwest'
  | 'West'
  | 'Pacific';

export interface CityLocation {
  name: string;
  lat: number;
  lon: number;
  isPrimary?: boolean;
  population?: number;
}

export interface TopCityMeta {
  rank: number;
  name: string;
  population: number;
  lat: number;
  lon: number;
}

export interface StateMeta {
  code: string;
  fips: string;
  name: string;
  region: USRegion;
  lat: number;
  lon: number;
  primaryCity: string;
  cities: CityLocation[];
  /** Optional SVG offset for dense Northeast labels */
  labelOffset?: [number, number];
  /** Whether to draw a minimal leader line from centroid to offset label */
  leaderLine?: boolean;
}

export interface StateCurrentMetrics {
  temperatureF: number;
  apparentTemperatureF: number;
  humidity: number;
  dewPointF: number;
  precipitationMm: number;
  precipitationProb: number | null;
  windSpeedMph: number;
  windGustMph: number | null;
  windDirectionDeg: number;
  pressureHpa: number | null;
  cloudCoverPct: number | null;
  weatherCode: number;
  uvIndex: number | null;
  usAqi: number | null;
  pm25: number | null;
  tempHighF: number;
  tempLowF: number;
  sunrise?: string;
  sunset?: string;
}

export interface TimelinePoint {
  time: string;
  temperatureF: number;
  apparentTemperatureF: number;
  precipitationMm: number;
  windSpeedMph: number;
  windDirectionDeg: number;
  humidity: number;
  weatherCode: number;
}

export interface HourlyPoint extends TimelinePoint {
  dewPointF: number;
  precipitationProb: number | null;
  pressureHpa: number | null;
  cloudCoverPct: number | null;
  windGustMph: number | null;
  uvIndex: number | null;
}

export interface DailyPoint {
  date: string;
  tempMaxF: number;
  tempMinF: number;
  precipitationSumMm: number;
  precipitationProbMax: number | null;
  windSpeedMaxMph: number;
  windDirectionDomDeg: number;
  uvIndexMax: number | null;
  weatherCode: number;
  sunrise?: string;
  sunset?: string;
}

export interface StateWeatherSnapshot {
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  timezone: string;
  current: StateCurrentMetrics;
  timeline: TimelinePoint[];
}

export interface WeatherDatasetResponse {
  mode: WeatherMode;
  source: 'seed-archive' | 'open-meteo-archive' | 'open-meteo-forecast';
  cached: boolean;
  fetchedAt: string;
  startDate: string;
  endDate: string;
  presetId?: string;
  presetLabel?: string;
  alertsCount?: number;
  timelineHours: string[];
  states: Record<string, StateWeatherSnapshot>;
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: 'Extreme' | 'Severe' | 'Moderate' | 'Minor' | 'Unknown';
  urgency: string;
  headline: string;
  description: string;
  instruction: string | null;
  effective: string;
  expires: string;
  areaDesc: string;
  states: string[];
}

export interface GeoJsonFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, string>;
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

export interface AlertsResponse {
  fetchedAt: string;
  cached: boolean;
  totalActive: number;
  byState: Record<string, WeatherAlert[]>;
  featuresGeoJson: GeoJsonFeatureCollection;
}

export interface StateDetailResponse {
  mode: WeatherMode;
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  elevationM: number;
  timezone: string;
  fetchedAt: string;
  cached: boolean;
  startDate: string;
  endDate: string;
  current: StateCurrentMetrics;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  alerts: WeatherAlert[];
}

export interface CityWeatherSnapshot {
  rank: number;
  name: string;
  population: number;
  lat: number;
  lon: number;
  timezone: string;
  current: StateCurrentMetrics;
  timeline: TimelinePoint[];
}

export interface StateCitiesWeatherResponse {
  mode: WeatherMode;
  code: string;
  name: string;
  cached: boolean;
  fetchedAt: string;
  startDate: string;
  endDate: string;
  timelineHours: string[];
  cities: CityWeatherSnapshot[];
}

export interface RadarFrame {
  id: string;
  timestamp: string;
  label: string;
  source: 'noaa-mrms' | 'iem-historical';
  hasAlaska: boolean;
  hasHawaii: boolean;
}

export interface RadarFramesResponse {
  mode: WeatherMode;
  source: 'noaa-mrms' | 'iem-historical';
  frames: RadarFrame[];
}

export interface HistoricalPreset {
  id: string;
  label: string;
  subtitle: string;
  startDate: string;
  endDate: string;
  defaultFrameIndex?: number;
}
