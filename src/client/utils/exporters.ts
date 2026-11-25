import type { StateDetailResponse, TempUnit, WeatherDatasetResponse } from '../../shared/types';
import {
  convertTemp,
  convertWind,
  degToCompass,
  formatPrecip,
  formatPrecipValue,
  formatWind,
} from '../../shared/units';
import { getWmoInfo } from '../../shared/wmoCodes';
import { resolveStateSlice } from './scales';

function escapeCsv(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildStatesCsv(
  dataset: WeatherDatasetResponse,
  unit: TempUnit,
  timelineIndex: number,
  useTimeline: boolean,
): string {
  const header = [
    'Code',
    'State',
    'City',
    `Temp (${unit})`,
    `Feels Like (${unit})`,
    `High (${unit})`,
    `Low (${unit})`,
    'Condition',
    unit === 'C' ? 'Wind (km/h)' : 'Wind (mph)',
    'Wind Direction',
    'Humidity (%)',
    unit === 'C' ? 'Precip (mm)' : 'Precip (in)',
    'US AQI',
    'UV Index',
    'Timestamp',
  ];

  const rows = Object.values(dataset.states)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((snap) => {
      const slice = resolveStateSlice(snap, timelineIndex, useTimeline);
      const wmo = getWmoInfo(slice.weatherCode);
      const ts = useTimeline ? dataset.timelineHours[timelineIndex] ?? dataset.fetchedAt : dataset.fetchedAt;
      const windNum = convertWind(slice.windSpeedMph, unit);
      const precipVal = formatPrecipValue(slice.precipitationMm, unit);

      return [
        snap.code,
        snap.name,
        snap.city,
        convertTemp(slice.temperatureF, unit),
        convertTemp(slice.apparentTemperatureF, unit),
        convertTemp(snap.current.tempHighF, unit),
        convertTemp(snap.current.tempLowF, unit),
        wmo.label,
        windNum,
        degToCompass(slice.windDirectionDeg),
        Math.round(slice.humidity),
        precipVal,
        snap.current.usAqi ?? '',
        snap.current.uvIndex ?? '',
        ts,
      ]
        .map(escapeCsv)
        .join(',');
    });

  return [header.map(escapeCsv).join(','), ...rows].join('\n');
}

export function buildStateDetailCsv(detail: StateDetailResponse, unit: TempUnit): string {
  const header = [
    'State',
    'City',
    'Local Time',
    `Temp (${unit})`,
    `Feels Like (${unit})`,
    `Dew Point (${unit})`,
    'Condition',
    'Humidity (%)',
    'Wind',
    'Wind Dir',
    'Precip',
    'Pressure (hPa)',
  ];

  const rows = detail.hourly.map((h) =>
    [
      detail.code,
      detail.city,
      h.time,
      convertTemp(h.temperatureF, unit),
      convertTemp(h.apparentTemperatureF, unit),
      convertTemp(h.dewPointF, unit),
      getWmoInfo(h.weatherCode).label,
      Math.round(h.humidity),
      formatWind(h.windSpeedMph, unit),
      degToCompass(h.windDirectionDeg),
      formatPrecip(h.precipitationMm, unit),
      h.pressureHpa ?? '',
    ]
      .map(escapeCsv)
      .join(','),
  );

  return [header.map(escapeCsv).join(','), ...rows].join('\n');
}

export function triggerDownload(filename: string, content: BlobPart, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportMapAsPng(
  mapStageEl: HTMLDivElement,
  title: string,
  subtitle: string,
  isDark: boolean,
): Promise<void> {
  const outW = 1950;
  const headerH = 110;
  const mapH = 1220;
  const outH = headerH + mapH;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = isDark ? '#090e1a' : '#f5f7fa';
  ctx.fillRect(0, 0, outW, outH);

  // Header
  ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
  ctx.font = '600 34px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
  ctx.fillText(title, 54, 56);

  ctx.fillStyle = isDark ? '#94a3b8' : '#475569';
  ctx.font = '400 22px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
  ctx.fillText(subtitle, 54, 90);

  // Draw SVGs and Canvases inside mapStageEl in DOM paint order
  const svgs = Array.from(mapStageEl.querySelectorAll('svg'));
  const canvases = Array.from(mapStageEl.querySelectorAll('canvas'));

  const drawSvg = async (svg: SVGSVGElement) => {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('width', String(outW));
    clone.setAttribute('height', String(mapH));
    const xml = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const img = new Image();
      img.width = outW;
      img.height = mapH;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG rasterize failed'));
        img.src = url;
      });
      ctx.drawImage(img, 0, headerH, outW, mapH);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  if (svgs[0]) await drawSvg(svgs[0]);
  for (const layerCanvas of canvases) {
    const op = Number(layerCanvas.style.opacity || '1');
    ctx.save();
    ctx.globalAlpha = Number.isFinite(op) ? op : 1;
    ctx.drawImage(layerCanvas, 0, headerH, outW, mapH);
    ctx.restore();
  }
  if (svgs[1]) await drawSvg(svgs[1]);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  triggerDownload('us-weather-station.png', blob, 'image/png');
}
