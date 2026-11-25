import { RADAR_BBOX_4326, type RadarRegion, formatRadarFrameLabel } from '../../shared/radar';
import type { RadarFrame, RadarFramesResponse, WeatherMode } from '../../shared/types';

const NOAA_CAPS_URL =
  'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/wms?service=WMS&request=GetCapabilities';
const MAX_RADAR_PNG_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isValidPngBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.length || bytes.byteLength > MAX_RADAR_PNG_BYTES) {
    return false;
  }
  return PNG_SIGNATURE.every((b, idx) => bytes[idx] === b);
}

export function parseNoaaCapabilitiesTimes(xml: string, maxFrames = 12): string[] {
  const match = xml.match(/<Dimension[^>]*name="time"[^>]*>([\s\S]*?)<\/Dimension>/i);
  if (!match?.[1]) return [];
  const rawList = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawList.length <= maxFrames) return rawList;

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
    const res = await fetch(NOAA_CAPS_URL, { signal: AbortSignal.timeout(10_000) });
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
            label: formatRadarFrameLabel(ts),
            source: 'noaa-mrms',
            hasAlaska: true,
            hasHawaii: true,
          })),
        };
      }
    }
  } catch {
    // Fall back to synthetic 5-minute UTC steps below
  }

  const now = Math.floor(Date.now() / 300_000) * 300_000 - 300_000;
  const frames: RadarFrame[] = [];
  for (let i = 11; i >= 0; i--) {
    const ts = new Date(now - i * 300_000).toISOString();
    frames.push({
      id: `live-fallback-${i}`,
      timestamp: ts,
      label: formatRadarFrameLabel(ts),
      source: 'noaa-mrms',
      hasAlaska: true,
      hasHawaii: true,
    });
  }
  return { mode: 'live', source: 'noaa-mrms', frames };
}

function buildUpstreamRadarUrl(opts: {
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
  // WMS 1.3.0 with EPSG:4326 uses lat-lon axis ordering
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

  const res = await fetch(url, { signal: AbortSignal.timeout(14_000) });
  if (!res.ok) return null;
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('image/png')) return null;

  const declaredLen = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLen) && declaredLen > MAX_RADAR_PNG_BYTES) return null;

  const bytes = new Uint8Array(await res.arrayBuffer());
  return isValidPngBytes(bytes) ? bytes : null;
}
