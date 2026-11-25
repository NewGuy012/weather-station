import { geoAlbersUsa, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import usAtlasStates from 'us-atlas/states-10m.json';
import { STATE_BY_FIPS, US_STATES } from '../../shared/states';
import type { StateMeta } from '../../shared/types';

export const MAP_WIDTH = 975;
export const MAP_HEIGHT = 610;

export const usProjection = geoAlbersUsa().scale(1280).translate([488, 305]);

export interface StateGeometryItem {
  meta: StateMeta;
  pathD: string;
  bounds: [[number, number], [number, number]];
  centroid: [number, number];
  cityPoint: [number, number];
  labelPoint: [number, number];
}

let cachedGeometries: StateGeometryItem[] | null = null;
let cachedUsClipPath: Path2D | null = null;

function buildGeometries(): void {
  if (cachedGeometries) return;

  const topology = usAtlasStates as unknown as Topology<{
    states: GeometryCollection<{ name: string }>;
  }>;

  const pathGen = geoPath(usProjection);
  const statesGeo = feature(topology, topology.objects.states);

  const items: StateGeometryItem[] = [];
  for (const geoFeature of statesGeo.features) {
    const fips = String(geoFeature.id ?? '').padStart(2, '0');
    const meta = STATE_BY_FIPS[fips];
    if (!meta) continue;

    const pathD = pathGen(geoFeature) ?? '';
    if (!pathD) continue;

    const rawBounds = pathGen.bounds(geoFeature);
    const rawCentroid = pathGen.centroid(geoFeature);
    const cityProj = usProjection([meta.lon, meta.lat]);
    const centroid: [number, number] =
      Number.isFinite(rawCentroid[0]) && Number.isFinite(rawCentroid[1])
        ? [rawCentroid[0], rawCentroid[1]]
        : cityProj ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2];

    const cityPoint: [number, number] = cityProj ?? centroid;
    const dx = meta.labelOffset?.[0] ?? 0;
    const dy = meta.labelOffset?.[1] ?? 0;

    // Slight manual nudges for awkward state shapes (MI, FL, LA, ID)
    let baseX = centroid[0];
    let baseY = centroid[1];
    if (meta.code === 'MI') {
      baseX += 14;
      baseY += 16;
    } else if (meta.code === 'FL') {
      baseX += 14;
      baseY += 4;
    } else if (meta.code === 'LA') {
      baseX -= 8;
    } else if (meta.code === 'ID') {
      baseY += 14;
    } else if (meta.code === 'HI') {
      baseX += 4;
      baseY -= 2;
    } else if (meta.code === 'AK') {
      baseY -= 6;
    }

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

  // Keep deterministic order matching US_STATES
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
