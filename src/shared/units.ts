import type { TempUnit } from './types';

export function fToC(tempF: number): number {
  return ((tempF - 32) * 5) / 9;
}

export function formatTemp(tempF: number, unit: TempUnit, includeUnit = false): string {
  const val = unit === 'C' ? fToC(tempF) : tempF;
  const rounded = Math.round(val);
  return includeUnit ? `${rounded}°${unit}` : `${rounded}°`;
}

export function formatWind(mph: number, unit: TempUnit): string {
  if (unit === 'C') {
    return `${Math.round(mph * 1.60934)} km/h`;
  }
  return `${Math.round(mph)} mph`;
}

export function formatPrecip(mm: number, unit: TempUnit): string {
  if (unit === 'C') {
    return `${mm.toFixed(1)} mm`;
  }
  const inches = mm / 25.4;
  return `${inches.toFixed(2)} in`;
}

export function degToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return dirs[idx] ?? 'N';
}

export function aqiCategory(aqi: number | null): { label: string; color: string } {
  if (aqi === null || !Number.isFinite(aqi)) return { label: 'N/A', color: '#94A3B8' };
  if (aqi <= 50) return { label: 'Good', color: '#10B981' };
  if (aqi <= 100) return { label: 'Moderate', color: '#F59E0B' };
  if (aqi <= 150) return { label: 'Sensitive', color: '#F97316' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#EF4444' };
  if (aqi <= 300) return { label: 'Very Unhealthy', color: '#8B5CF6' };
  return { label: 'Hazardous', color: '#991B1B' };
}

export function uvCategory(uv: number | null): string {
  if (uv === null || !Number.isFinite(uv)) return 'N/A';
  if (uv < 3) return 'Low';
  if (uv < 6) return 'Moderate';
  if (uv < 8) return 'High';
  if (uv < 11) return 'Very High';
  return 'Extreme';
}
