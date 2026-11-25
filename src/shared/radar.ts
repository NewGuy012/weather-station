import type { RadarFrame, RadarFramesResponse } from './types';

export type RadarRegion = 'conus' | 'alaska' | 'hawaii';

export const RADAR_BBOX_4326: Record<
  RadarRegion,
  { minLon: number; minLat: number; maxLon: number; maxLat: number; width: number; height: number }
> = {
  conus: { minLon: -126, minLat: 24, maxLon: -66, maxLat: 50, width: 900, height: 450 },
  alaska: { minLon: -172, minLat: 50, maxLon: -129, maxLat: 72, width: 420, height: 240 },
  hawaii: { minLon: -161, minLat: 18, maxLon: -154, maxLat: 23, width: 320, height: 220 },
};

export function formatRadarFrameLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC'
  );
}

export function buildHistoricalRadarFrames(anchorIso: string, count = 12): RadarFramesResponse {
  const parsed = Date.parse(anchorIso.endsWith('Z') ? anchorIso : `${anchorIso}Z`);
  const anchorMs = Number.isNaN(parsed)
    ? Date.now() - 5 * 86_400_000
    : Math.floor(parsed / 300_000) * 300_000;

  // 15-min steps spanning 3h leading up to anchor time for clear front motion
  const intervalMs = 15 * 60_000;
  const frames: RadarFrame[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const ts = new Date(anchorMs - i * intervalMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
    frames.push({
      id: `hist-${ts}`,
      timestamp: ts,
      label: formatRadarFrameLabel(ts),
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
