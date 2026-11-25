export type RadarRegion = 'conus' | 'alaska' | 'hawaii';

export const RADAR_BBOX_4326: Record<
  RadarRegion,
  { minLon: number; minLat: number; maxLon: number; maxLat: number; width: number; height: number }
> = {
  conus: { minLon: -126, minLat: 24, maxLon: -66, maxLat: 50, width: 900, height: 450 },
  alaska: { minLon: -172, minLat: 50, maxLon: -129, maxLat: 72, width: 420, height: 240 },
  hawaii: { minLon: -161, minLat: 18, maxLon: -154, maxLat: 23, width: 320, height: 220 },
};
