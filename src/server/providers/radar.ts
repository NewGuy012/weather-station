import type { RadarFrame, RadarFramesResponse, WeatherMode } from '../../shared/types';

export type RadarRegion = 'conus' | 'alaska' | 'hawaii';

export const RADAR_BBOX_4326: Record<
  RadarRegion,
  { minLon: number; minLat: number; maxLon: number; maxLat: number; width: number; height: number }
> = {
  conus: { minLon: -126, minLat: 24, maxLon: -66, maxLat: 50, width: 900, height: 450 },
  alaska: { minLon: -172, minLat: 50, maxLon: -129, maxLat: 72, width: 420, height: 240 },
  hawaii: { minLon: -161, minLat: 18, maxLon: -154, maxLat: 23, width: 320, height: 220 },
};

const NOAA_CAPS_URL =
  'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/wms?service=WMS&request=GetCapabilities';

function formatFrameLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }) + ' UTC';
}

export function parseNoaaCapabilitiesTimes(xml: string, maxFrames = 12): string[] {
  const match = xml.match(/<Dimension[^>]*name="time"[^>]*>([\s\S]*?)<\/Dimension>/i);
  if (!match?.[1]) return [];
  const rawList = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawList.length <= maxFrames) return rawList;

  // Pick evenly spaced frames across the last ~60 minutes (tail of capabilities list)
  const recent = rawList.slice(-Math.min(rawList.length, 30));
  const selected: string[] = [];
  const step = Math.max(1, (recent.length - 1) / (maxFrames - 1));
  for (let i = 0; i < maxFrames; i++) {
    const idx = Math.min(recent.length - 1, Math.round(i * step));
    const ts = recent[idx];
    if (ts && selected[selected.length - 1] !== ts) {
      selected.push(ts);
    }
  }
  return selected;
}

export async function fetchLiveRadarFrames(): Promise<RadarFramesResponse> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(NOAA_CAPS_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const xml = await res.text();
      const times = parseNoaaCapabilitiesTimes(xml, 12);
      if (times.length > 0) {
        return {
          mode: 'live',
          source: 'noaa-mrms',
          frames: times.map((ts, idx) => ({
            id: `live-${idx}-${ts}`,
            timestamp: ts,
            label: formatFrameLabel(ts),
            source: 'noaa-mrms',
            hasAlaska: true,
            hasHawaii: true,
          })),
        };
      }
    }
  } catch {
    // Fallback to synthetic 5-minute UTC steps below
  }

  const now = Math.floor(Date.now() / 300_000) * 300_000 - 300_000;
  const frames: RadarFrame[] = [];
  for (let i = 11; i >= 0; i--) {
    const ts = new Date(now - i * 300_000).toISOString();
    frames.push({
      id: `live-fallback-${i}`,
      timestamp: ts,
      label: formatFrameLabel(ts),
      source: 'noaa-mrms',
      hasAlaska: true,
      hasHawaii: true,
    });
  }
  return { mode: 'live', source: 'noaa-mrms', frames };
}

export function buildHistoricalRadarFrames(anchorIso: string, count = 12): RadarFramesResponse {
  const parsed = Date.parse(anchorIso.endsWith('Z') ? anchorIso : `${anchorIso}Z`);
  const anchorMs = Number.isNaN(parsed)
    ? Date.now() - 5 * 86_400_000
    : Math.floor(parsed / 300_000) * 300_000;

  // Build 12 frames spanning 3 hours leading up to anchor time (15-min intervals for clear front movement)
  const intervalMs = 15 * 60_000;
  const frames: RadarFrame[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ts = new Date(anchorMs - i * intervalMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    frames.push({
      id: `hist-${ts}`,
      timestamp: ts,
      label: formatFrameLabel(ts),
      source: 'iem-historical',
      hasAlaska: false,
      hasHawaii: false,
    });
  }

  return {
    mode: 'historical',
    source: 'iem-historical',
    frames,
  };
}

export function buildUpstreamRadarUrl(opts: {
  mode: WeatherMode;
  region: RadarRegion;
  timestamp: string;
}): string | null {
  const box = RADAR_BBOX_4326[opts.region];
  if (opts.mode === 'historical') {
    if (opts.region !== 'conus') return null;
    const params = new URLSearchParams({
      SERVICE: 'WMS',
      VERSION: '1.1.1',
      REQUEST: 'GetMap',
      LAYERS: 'nexrad-n0q-wmst',
      SRS: 'EPSG:4326',
      BBOX: `${box.minLon},${box.minLat},${box.maxLon},${box.maxLat}`,
      WIDTH: String(box.width),
      HEIGHT: String(box.height),
      FORMAT: 'image/png',
      TRANSPARENT: 'TRUE',
      TIME: opts.timestamp,
    });
    return `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q-t.cgi?${params.toString()}`;
  }

  const layerMap: Record<RadarRegion, { workspace: string; layer: string }> = {
    conus: { workspace: 'conus', layer: 'conus_bref_qcd' },
    alaska: { workspace: 'alaska', layer: 'alaska_bref_qcd' },
    hawaii: { workspace: 'hawaii', layer: 'hawaii_bref_qcd' },
  };
  const target = layerMap[opts.region];
  // WMS 1.3.0 with EPSG:4326 expects lat-lon axis ordering: minLat,minLon,maxLat,maxLon
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: target.layer,
    styles: '',
    crs: 'EPSG:4326',
    bbox: `${box.minLat},${box.minLon},${box.maxLat},${box.maxLon}`,
    width: String(box.width),
    height: String(box.height),
    format: 'image/png',
    transparent: 'true',
    time: opts.timestamp,
  });
  return `https://opengeo.ncep.noaa.gov/geoserver/${target.workspace}/${target.layer}/wms?${params.toString()}`;
}

export async function fetchRadarImagePng(opts: {
  mode: WeatherMode;
  region: RadarRegion;
  timestamp: string;
}): Promise<Uint8Array | null> {
  const url = buildUpstreamRadarUrl(opts);
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('image/png')) return null;
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}
