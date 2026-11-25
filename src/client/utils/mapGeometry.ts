import { type GeoPermissibleObjects, geoAlbersUsa, geoPath } from 'd3-geo';
import usAtlasStates from 'us-atlas/states-10m.json';
import { STATE_BY_FIPS, US_STATES } from '../../shared/states';
import type { StateMeta } from '../../shared/types';

export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 610;

export const usProjection = geoAlbersUsa().scale(1280).translate([488, 305]);
export const usPathGen = geoPath(usProjection);

export interface StateFeature {
  type: 'Feature';
  id?: string | number;
  properties: Record<string, unknown>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface TopoStatesJson {
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: {
    states: {
      geometries: Array<{
        id?: string;
        type: 'Polygon' | 'MultiPolygon';
        properties?: Record<string, unknown>;
        arcs: number[][] | number[][][];
      }>;
    };
  };
}

function decodeUsStateFeatures(): StateFeature[] {
  const { transform, arcs, objects } = usAtlasStates as unknown as TopoStatesJson;
  const [kx, ky] = transform.scale;
  const [dx, dy] = transform.translate;

  const decodedArcs = arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([ax = 0, ay = 0]) => {
      x += ax;
      y += ay;
      return [x * kx + dx, y * ky + dy];
    });
  });

  const decodeRing = (arcRefs: number[]): number[][] => {
    const pts: number[][] = [];
    for (const ref of arcRefs) {
      if (pts.length) pts.pop();
      const seg = decodedArcs[ref < 0 ? ~ref : ref] ?? [];
      if (ref < 0) {
        for (let i = seg.length - 1; i >= 0; i--) pts.push(seg[i]!);
      } else {
        for (let i = 0; i < seg.length; i++) pts.push(seg[i]!);
      }
    }
    while (pts.length > 0 && pts.length < 4) pts.push(pts[0]!);
    return pts;
  };

  return objects.states.geometries.map((geom) => ({
    type: 'Feature',
    id: geom.id,
    properties: geom.properties ?? {},
    geometry:
      geom.type === 'Polygon'
        ? { type: 'Polygon', coordinates: (geom.arcs as number[][]).map(decodeRing) }
        : {
            type: 'MultiPolygon',
            coordinates: (geom.arcs as number[][][]).map((poly) => poly.map(decodeRing)),
          },
  }));
}

export interface StateGeometryItem {
  meta: StateMeta;
  pathD: string;
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
  cityPoint: [number, number];
  labelPoint: [number, number];
}

let cachedFeatures: StateFeature[] | null = null;
let cachedGeometries: StateGeometryItem[] | null = null;
let cachedUsClipPath: Path2D | null = null;

export function getUsStateFeatures(): StateFeature[] {
  if (!cachedFeatures) cachedFeatures = decodeUsStateFeatures();
  return cachedFeatures;
}

const CENTROID_NUDGES: Record<string, [number, number]> = {
  MI: [14, 16],
  FL: [14, 4],
  LA: [-8, 0],
  ID: [0, 14],
  HI: [4, -2],
  AK: [0, -6],
};

function buildGeometries(): void {
  if (cachedGeometries) return;

  const items: StateGeometryItem[] = [];
  for (const geoFeature of getUsStateFeatures()) {
    const fips = String(geoFeature.id ?? '').padStart(2, '0');
    const meta = STATE_BY_FIPS[fips];
    if (!meta) continue;

    const geoObj = geoFeature as unknown as GeoPermissibleObjects;
    const pathD = usPathGen(geoObj) ?? '';
    if (!pathD) continue;

    const rawBounds = usPathGen.bounds(geoObj);
    const rawCentroid = usPathGen.centroid(geoObj);
    const cityProj = usProjection([meta.lon, meta.lat]);
    const centroid: [number, number] =
      Number.isFinite(rawCentroid[0]) && Number.isFinite(rawCentroid[1])
        ? [rawCentroid[0], rawCentroid[1]]
        : cityProj ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2];

    const cityPoint: [number, number] = cityProj ?? centroid;
    const [nx, ny] = CENTROID_NUDGES[meta.code] ?? [0, 0];
    const baseX = centroid[0] + nx;
    const baseY = centroid[1] + ny;
    const dx = meta.labelOffset?.[0] ?? 0;
    const dy = meta.labelOffset?.[1] ?? 0;

    const bounds: [[number, number], [number, number]] =
      Number.isFinite(rawBounds[0][0]) &&
      Number.isFinite(rawBounds[0][1]) &&
      Number.isFinite(rawBounds[1][0]) &&
      Number.isFinite(rawBounds[1][1])
        ? [
            [rawBounds[0][0], rawBounds[0][1]],
            [rawBounds[1][0], rawBounds[1][1]],
          ]
        : [
            [baseX - 24, baseY - 24],
            [baseX + 24, baseY + 24],
          ];

    items.push({
      meta,
      pathD,
      bounds,
      centroid: [baseX, baseY],
      cityPoint,
      labelPoint: [baseX + dx, baseY + dy],
    });
  }

  const order = new Map(US_STATES.map((s, i) => [s.code, i]));
  items.sort((a, b) => (order.get(a.meta.code) ?? 99) - (order.get(b.meta.code) ?? 99));

  cachedGeometries = items;
}

export function getUsStateGeometries(): StateGeometryItem[] {
  buildGeometries();
  return cachedGeometries!;
}

export function getUsClipPath(): Path2D {
  if (cachedUsClipPath) return cachedUsClipPath;
  const combined = new Path2D();
  for (const g of getUsStateGeometries()) {
    combined.addPath(new Path2D(g.pathD));
  }
  cachedUsClipPath = combined;
  return combined;
}
