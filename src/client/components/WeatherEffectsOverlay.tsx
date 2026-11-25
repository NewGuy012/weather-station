import { useEffect, useMemo, useRef } from 'react';
import type {
  MetricLayer,
  StateCitiesWeatherResponse,
  StateWeatherSnapshot,
  WeatherAlert,
} from '../../shared/types';
import {
  type StatePhenomenon,
  type WeatherPhenomenon,
  buildCityShowcasePhenomena,
  classifySnapshotPhenomenon,
  classifyStatesPhenomena,
  hasActiveMapFx,
} from '../../shared/weatherPhenomena';
import { MAP_HEIGHT, MAP_WIDTH, getUsStateGeometries, usProjection } from '../utils/mapGeometry';
import { resolveStateSlice } from '../utils/scales';
import {
  DARK_FX_PALETTE,
  LIGHT_FX_PALETTE,
  type LightningSegment,
  drawCloudCluster,
  drawCycloneVortex,
  drawDiamondGlint,
  drawFogRibbon,
  drawHailStone,
  drawHazeWisp,
  drawHeatShimmerLine,
  drawLightningBolt,
  drawRainStreak,
  drawSnowflake,
  drawSplashRipple,
  drawUvCorona,
  generateLightningSegments,
  lightningFlickerAlpha,
} from '../utils/weatherCanvasPainters';

const CANVAS_SCALE = 2;

interface WeatherEffectsOverlayProps {
  visible: boolean;
  states: Record<string, StateWeatherSnapshot>;
  metric: MetricLayer;
  timelineIndex: number;
  useTimeline: boolean;
  isDark: boolean;
  showcase: boolean;
  statePhenomena?: Record<string, StatePhenomenon>;
  alertsByState?: Record<string, WeatherAlert[]>;
  detailedStateMode?: boolean;
  selectedCode?: string | null;
  stateCitiesWeather?: StateCitiesWeatherResponse | null;
  zoom?: number;
}

interface StateRegionGeom {
  code: string;
  path: Path2D | null;
  minX: number;
  minY: number;
  width: number;
  height: number;
  span: number;
  centroid: [number, number];
  anchors: [number, number][];
  cloudAnchors: [number, number][];
}

interface FxParticle {
  x: number;
  y: number;
  life: number;
  speed: number;
  size: number;
  phase: number;
  crystal: boolean;
}

interface FxSplash {
  x: number;
  y: number;
  progress: number;
  radius: number;
}

interface FxLightning {
  cooldown: number;
  strikeElapsed: number;
  strikeDuration: number;
  segments: LightningSegment[];
}

interface ZoneRuntime {
  phenomenon: WeatherPhenomenon | null;
  alpha: number;
  particles: FxParticle[];
  splashes: FxSplash[];
  lightning: FxLightning;
}

interface ActiveRenderZone {
  key: string;
  clipPath: Path2D | null;
  minX: number;
  minY: number;
  width: number;
  height: number;
  span: number;
  centroid: [number, number];
  anchors: [number, number][];
  cloudAnchors: [number, number][];
  statePhenomenon: StatePhenomenon;
  dimFactor: number;
  isCityCell: boolean;
}

let cachedRegionsByCode: Record<string, StateRegionGeom> | null = null;

function getRegionsMap(): Record<string, StateRegionGeom> {
  if (cachedRegionsByCode) return cachedRegionsByCode;

  const geometries = getUsStateGeometries();
  let probeCtx: CanvasRenderingContext2D | null = null;
  if (typeof document !== 'undefined') {
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    probeCtx = probeCanvas.getContext('2d');
  }

  const regions: StateRegionGeom[] = geometries.map((g) => {
    const path = typeof Path2D !== 'undefined' ? new Path2D(g.pathD) : null;
    const minX = g.bounds[0][0];
    const minY = g.bounds[0][1];
    const maxX = g.bounds[1][0];
    const maxY = g.bounds[1][1];
    const width = Math.max(10, maxX - minX);
    const height = Math.max(10, maxY - minY);
    const span = Math.max(14, Math.min(width, height));

    const anchors: [number, number][] = [];
    const cloudAnchors: [number, number][] = [];

    if (probeCtx && path) {
      if (probeCtx.isPointInPath(path, g.centroid[0], g.centroid[1])) {
        anchors.push([g.centroid[0], g.centroid[1]]);
      }

      // Stratified interior sampling keeps particles inside state borders
      const cols = 6;
      const rows = 5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u = (c + 0.35 + ((r * 7 + c * 3) % 5) * 0.08) / cols;
          const v = (r + 0.35 + ((c * 5 + r * 2) % 5) * 0.08) / rows;
          const px = minX + u * width;
          const py = minY + v * height;
          if (probeCtx.isPointInPath(path, px, py)) {
            anchors.push([px, py]);
            if (v <= 0.56) {
              cloudAnchors.push([px, py]);
            }
          }
        }
      }
    }

    if (anchors.length === 0) {
      anchors.push([g.centroid[0], g.centroid[1]]);
    }
    if (cloudAnchors.length === 0) {
      const upperCandidate = anchors.reduce((best, cur) => (cur[1] < best[1] ? cur : best), anchors[0]!);
      cloudAnchors.push(upperCandidate);
    }

    return {
      code: g.meta.code,
      path,
      minX,
      minY,
      width,
      height,
      span,
      centroid: g.centroid,
      anchors,
      cloudAnchors,
    };
  });

  const byCode = Object.fromEntries(regions.map((r) => [r.code, r]));
  if (typeof Path2D !== 'undefined') {
    cachedRegionsByCode = byCode;
  }
  return byCode;
}

function pickCloudPositions(
  zone: Pick<ActiveRenderZone, 'cloudAnchors' | 'width' | 'span' | 'isCityCell'>,
  count: number,
  timeSec: number,
  windAngleRad: number,
  windSpeedMph: number,
  scale: number,
): Array<{ x: number; y: number; width: number }> {
  const anchors = zone.cloudAnchors;
  const out: Array<{ x: number; y: number; width: number }> = [];
  const step = Math.max(1, Math.floor(anchors.length / count));
  const cloudW = zone.isCityCell
    ? Math.max(16, Math.min(28, zone.span * 0.65)) * scale
    : Math.max(14, Math.min(38, zone.span * 0.48)) * scale;
  const driftDir = -Math.sin(windAngleRad) || 1;
  const driftRate = 0.25 + Math.min(0.4, windSpeedMph * 0.012);

  for (let i = 0; i < count; i++) {
    const pt = anchors[(i * step) % anchors.length]!;
    const phase = i * 2.1 + pt[0] * 0.05;
    const driftRange = Math.min(12, zone.width * 0.14) * scale;
    const dx = Math.sin(timeSec * driftRate + phase) * driftRange * driftDir;
    const dy = Math.cos(timeSec * 0.5 + phase) * 1.4 * scale;
    out.push({
      x: pt[0] + dx,
      y: pt[1] + dy,
      width: cloudW * (i === 0 ? 1.05 : 0.88),
    });
  }
  return out;
}

function createParticle(zone: ActiveRenderZone, randomLife: boolean): FxParticle {
  const pool =
    zone.statePhenomenon.phenomenon === 'rain' ||
    zone.statePhenomenon.phenomenon === 'drizzle' ||
    zone.statePhenomenon.phenomenon === 'thunderstorm' ||
    zone.statePhenomenon.phenomenon === 'hail' ||
    zone.statePhenomenon.phenomenon === 'freezing-rain'
      ? zone.cloudAnchors
      : zone.anchors;
  const anchor = pool[Math.floor(Math.random() * pool.length)] ?? zone.centroid;
  const spreadX = Math.min(24, zone.width * 0.28);
  const spreadY = Math.min(14, zone.height * 0.22);
  return {
    x: anchor[0] + (Math.random() - 0.5) * spreadX,
    y: anchor[1] + (Math.random() - 0.5) * spreadY,
    life: randomLife ? Math.random() : 0,
    speed: 0.78 + Math.random() * 0.48,
    size: 0.8 + Math.random() * 0.65,
    phase: Math.random() * Math.PI * 2,
    crystal: Math.random() < 0.48,
  };
}

function stepParticles(
  rt: ZoneRuntime,
  zone: ActiveRenderZone,
  dt: number,
  reducedMotion: boolean,
  rate: number,
  draw: (p: FxParticle, index: number) => void,
  onExpire?: (p: FxParticle) => void,
): void {
  for (let i = 0; i < rt.particles.length; i++) {
    const p = rt.particles[i]!;
    if (!reducedMotion) {
      p.life += dt * rate * p.speed;
      if (p.life >= 1) {
        onExpire?.(p);
        rt.particles[i] = createParticle(zone, false);
        continue;
      }
    }
    draw(p, i);
  }
}

function targetParticleCount(zone: ActiveRenderZone): number {
  const { phenomenon, strength } = zone.statePhenomenon;
  const areaScale = Math.max(0.45, Math.min(1.6, Math.sqrt(zone.width * zone.height) / 55));

  switch (phenomenon) {
    case 'thunderstorm':
    case 'hail':
    case 'blizzard':
      return Math.max(4, Math.min(24, Math.round((8 + strength * 8) * areaScale)));
    case 'rain':
    case 'snow':
    case 'freezing-rain':
      return Math.max(3, Math.min(20, Math.round((6 + strength * 7) * areaScale)));
    case 'drizzle':
    case 'cyclone':
      return Math.max(3, Math.min(16, Math.round((5 + strength * 5) * areaScale)));
    case 'fog':
      return Math.max(2, Math.min(6, Math.round(2 + strength * 2.2)));
    case 'heat':
    case 'frost':
    case 'aqi':
    case 'humidity':
      return Math.max(3, Math.min(12, Math.round((4 + strength * 4) * areaScale)));
    case 'uv':
    case 'cloudy':
      return 0;
    default:
      return 0;
  }
}

export function WeatherEffectsOverlay({
  visible,
  states,
  metric,
  timelineIndex,
  useTimeline,
  isDark,
  showcase,
  statePhenomena,
  alertsByState = {},
  detailedStateMode = false,
  selectedCode = null,
  stateCitiesWeather = null,
  zoom = 1,
}: WeatherEffectsOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeZones = useMemo<ActiveRenderZone[]>(() => {
    if (!visible) return [];
    const regionsByCode = getRegionsMap();
    const zones: ActiveRenderZone[] = [];
    const resolvedStates =
      statePhenomena ??
      classifyStatesPhenomena(states, timelineIndex, useTimeline, alertsByState, metric, showcase);

    for (const [code, region] of Object.entries(regionsByCode)) {
      const snap = states[code];
      if (!snap) continue;

      const isSelected = Boolean(detailedStateMode && selectedCode === code);
      const dimFactor = detailedStateMode && selectedCode && !isSelected ? 0.2 : 1;

      if (isSelected && stateCitiesWeather && stateCitiesWeather.code === code) {
        const cityShowcase = showcase ? buildCityShowcasePhenomena(stateCitiesWeather.cities) : null;
        for (const city of stateCitiesWeather.cities) {
          const proj = usProjection([city.lon, city.lat]);
          if (!proj) continue;

          const slice = resolveStateSlice(city, timelineIndex, useTimeline);
          const statePhenom = cityShowcase
            ? cityShowcase[city.name]!
            : classifySnapshotPhenomenon(slice, city.current, alertsByState[code], metric);

          if (!hasActiveMapFx(statePhenom.phenomenon, metric)) continue;

          const cellRadius = 26;
          const cx = proj[0];
          const cy = proj[1];
          zones.push({
            key: `city:${code}:${city.name}`,
            clipPath: region.path,
            minX: cx - cellRadius,
            minY: cy - cellRadius,
            width: cellRadius * 2,
            height: cellRadius * 2,
            span: cellRadius * 1.4,
            centroid: [cx, cy],
            anchors: [
              [cx, cy],
              [cx - 8, cy + 4],
              [cx + 8, cy + 5],
            ],
            cloudAnchors: [
              [cx, cy - 8],
              [cx - 7, cy - 6],
              [cx + 7, cy - 6],
            ],
            statePhenomenon: statePhenom,
            dimFactor: 1,
            isCityCell: true,
          });
        }
        continue;
      }

      const statePhenom = resolvedStates[code];
      if (!statePhenom || !hasActiveMapFx(statePhenom.phenomenon, metric)) continue;

      zones.push({
        key: `state:${code}`,
        clipPath: region.path,
        minX: region.minX,
        minY: region.minY,
        width: region.width,
        height: region.height,
        span: region.span,
        centroid: region.centroid,
        anchors: region.anchors,
        cloudAnchors: region.cloudAnchors,
        statePhenomenon: statePhenom,
        dimFactor,
        isCityCell: false,
      });
    }

    return zones;
  }, [
    visible,
    states,
    statePhenomena,
    metric,
    timelineIndex,
    useTimeline,
    showcase,
    alertsByState,
    detailedStateMode,
    selectedCode,
    stateCitiesWeather,
  ]);

  const configRef = useRef({ activeZones, isDark, zoom });
  configRef.current = { activeZones, isDark, zoom };

  const runtimeMapRef = useRef<Map<string, ZoneRuntime>>(new Map());
  const drawStaticRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!visible) return;
    const activeKeys = new Set(activeZones.map((z) => z.key));
    for (const key of runtimeMapRef.current.keys()) {
      if (!activeKeys.has(key)) runtimeMapRef.current.delete(key);
    }
  }, [visible, activeZones]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!visible) {
      runtimeMapRef.current.clear();
      drawStaticRef.current = null;
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, MAP_WIDTH * CANVAS_SCALE, MAP_HEIGHT * CANVAS_SCALE);
      }
      return;
    }
    if (!canvas || !ctx) return;

    const reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    let rafId = 0;
    let lastTime = performance.now();

    const syncZoneRuntime = (zone: ActiveRenderZone): ZoneRuntime => {
      let rt = runtimeMapRef.current.get(zone.key);
      const targetCount = targetParticleCount(zone);
      if (!rt) {
        rt = {
          phenomenon: zone.statePhenomenon.phenomenon,
          alpha: reducedMotion ? 1 : 0.05,
          particles: Array.from({ length: targetCount }, () => createParticle(zone, true)),
          splashes: [],
          lightning: {
            cooldown: reducedMotion ? 0 : 0.25 + Math.random() * 2.2,
            strikeElapsed: reducedMotion ? 0.06 : -1,
            strikeDuration: 0.42,
            segments: reducedMotion
              ? generateLightningSegments(
                  zone.cloudAnchors[0]![0],
                  zone.cloudAnchors[0]![1],
                  Math.max(18, Math.min(48, zone.height * 0.48)),
                  4,
                )
              : [],
          },
        };
        runtimeMapRef.current.set(zone.key, rt);
        return rt;
      }

      if (rt.phenomenon !== zone.statePhenomenon.phenomenon) {
        rt.phenomenon = zone.statePhenomenon.phenomenon;
        rt.splashes = [];
        rt.lightning.strikeElapsed = -1;
        rt.lightning.cooldown = 0.2 + Math.random() * 1.4;
      }

      while (rt.particles.length < targetCount) {
        rt.particles.push(createParticle(zone, true));
      }
      if (rt.particles.length > targetCount) {
        rt.particles.length = targetCount;
      }

      return rt;
    };

    const drawFrame = (now: number, dt: number) => {
      const { activeZones: zones, isDark: dark, zoom: mapZoom } = configRef.current;
      const palette = dark ? DARK_FX_PALETTE : LIGHT_FX_PALETTE;
      const zoomScale = 1 / Math.sqrt(Math.max(1, mapZoom));
      const timeSec = now / 1000;

      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

      for (let zIdx = 0; zIdx < zones.length; zIdx++) {
        const zone = zones[zIdx]!;
        const rt = syncZoneRuntime(zone);
        rt.alpha = reducedMotion ? 1 : Math.min(1, rt.alpha + dt * 3.0);

        const zoneAlpha = rt.alpha * zone.dimFactor;
        if (zoneAlpha <= 0.02) continue;

        const { phenomenon, strength, windAngleRad, windSpeedMph } = zone.statePhenomenon;
        const windX = -Math.sin(windAngleRad);
        const windY = Math.cos(windAngleRad);
        const hasClouds =
          phenomenon === 'rain' ||
          phenomenon === 'drizzle' ||
          phenomenon === 'thunderstorm' ||
          phenomenon === 'hail' ||
          phenomenon === 'snow' ||
          phenomenon === 'blizzard' ||
          phenomenon === 'freezing-rain' ||
          phenomenon === 'cloudy';

        const cloudCount = zone.isCityCell
          ? 1
          : zone.span < 35
            ? 1
            : zone.span < 72
              ? 2
              : 3;
        const clouds = hasClouds
          ? pickCloudPositions(zone, cloudCount, timeSec, windAngleRad, windSpeedMph, zoomScale)
          : [];
        const zoneFallH = Math.max(22, Math.min(48, zone.height * 0.42)) * zoomScale;

        ctx.save();
        if (zone.clipPath) {
          ctx.clip(zone.clipPath);
        }
        ctx.globalAlpha = zoneAlpha;

        // 1. Lightning updates & sheet flash (underneath clouds & rain)
        let flashAlpha = 0;
        if (
          phenomenon === 'thunderstorm' ||
          phenomenon === 'hail' ||
          (phenomenon === 'cyclone' && strength > 0.7)
        ) {
          const lt = rt.lightning;
          if (!reducedMotion) {
            if (lt.strikeElapsed >= 0) {
              lt.strikeElapsed += dt;
              if (lt.strikeElapsed >= lt.strikeDuration) {
                lt.strikeElapsed = -1;
                const baseDelay =
                  phenomenon === 'thunderstorm' ? 2.4 : phenomenon === 'hail' ? 3.2 : 4.2;
                lt.cooldown = baseDelay * (0.45 + Math.random() * 0.9);
              }
            } else {
              lt.cooldown -= dt;
              if (lt.cooldown <= 0) {
                const cloudPick = clouds[Math.floor(Math.random() * clouds.length)];
                const originX = cloudPick ? cloudPick.x : zone.centroid[0];
                const originY = cloudPick ? cloudPick.y + cloudPick.width * 0.08 : zone.centroid[1];
                const boltLen =
                  Math.max(16, Math.min(54, zone.height * 0.48)) * zoomScale;
                lt.segments = generateLightningSegments(
                  originX,
                  originY,
                  boltLen,
                  windX * 8 * zoomScale,
                );
                lt.strikeElapsed = 0;
              }
            }
          }

          if (lt.strikeElapsed >= 0) {
            flashAlpha = lightningFlickerAlpha(lt.strikeElapsed / lt.strikeDuration);
            if (flashAlpha > 0.04) {
              ctx.save();
              ctx.globalAlpha *= flashAlpha * (phenomenon === 'thunderstorm' ? 0.85 : 0.6);
              ctx.fillStyle = palette.lightningSheet;
              ctx.fillRect(zone.minX - 6, zone.minY - 6, zone.width + 12, zone.height + 12);
              ctx.restore();
            }
          }
        }

        // 2. Heat thermal base glow
        if (phenomenon === 'heat') {
          ctx.save();
          const pulse = 0.75 + 0.25 * Math.sin(timeSec * 1.8 + zone.centroid[0]);
          ctx.globalAlpha *= (0.55 + strength * 0.45) * pulse;
          ctx.fillStyle = palette.heatGlow;
          ctx.fillRect(zone.minX - 4, zone.minY - 4, zone.width + 8, zone.height + 8);
          ctx.restore();
        }

        // 3. Cyclone spiral rainbands
        if (phenomenon === 'cyclone') {
          const vortexR = Math.max(18, Math.min(52, zone.span * 0.56)) * zoomScale;
          drawCycloneVortex(
            ctx,
            zone.centroid[0],
            zone.centroid[1],
            vortexR,
            timeSec,
            strength,
            palette,
          );
        }

        // 4. UV solar corona
        if (phenomenon === 'uv') {
          const uvR = Math.max(12, Math.min(30, zone.span * 0.34)) * zoomScale;
          drawUvCorona(ctx, zone.centroid[0], zone.centroid[1], uvR, timeSec, strength, palette);
        }

        // 5. Particles & phenomenon motion
        const drawFallStreak = (
          p: FxParticle,
          tilt: number,
          fallH: number,
          streakLen: number,
          lineWidth: number,
          color: string,
        ) => {
          drawRainStreak(
            ctx,
            p.x + tilt * p.life * zoomScale,
            p.y + fallH * p.life,
            (tilt / Math.max(1, fallH)) * streakLen * zoomScale,
            streakLen * zoomScale,
            lineWidth * zoomScale,
            color,
          );
        };

        if (phenomenon === 'rain' || phenomenon === 'drizzle' || phenomenon === 'thunderstorm') {
          const isDrizzle = phenomenon === 'drizzle';
          const tilt = Math.min(24, Math.max(3, windSpeedMph * 0.75)) * windX;
          const fallH = isDrizzle ? zoneFallH * 0.72 : zoneFallH;
          const streakLen = isDrizzle ? 4.5 : 8.5;
          const strokeColor = isDrizzle ? palette.drizzleStroke : palette.rainStroke;

          stepParticles(
            rt,
            zone,
            dt,
            reducedMotion,
            isDrizzle ? 0.95 : 1.55,
            (p) => drawFallStreak(p, tilt, fallH, streakLen, isDrizzle ? 0.85 : 1.25, strokeColor),
            (p) => {
              if (!isDrizzle && Math.random() < 0.55) {
                rt.splashes.push({
                  x: p.x + tilt * p.life * 0.9,
                  y: p.y + fallH * 0.92,
                  progress: 0,
                  radius: (2.2 + strength * 1.5) * zoomScale,
                });
              }
            },
          );

          for (let s = rt.splashes.length - 1; s >= 0; s--) {
            const sp = rt.splashes[s]!;
            if (!reducedMotion) {
              sp.progress += dt * 2.4;
              if (sp.progress >= 1) {
                rt.splashes.splice(s, 1);
                continue;
              }
            }
            drawSplashRipple(ctx, sp.x, sp.y, sp.progress, sp.radius, palette.rainSplash);
          }
        } else if (phenomenon === 'hail') {
          const tilt = Math.min(18, Math.max(4, windSpeedMph * 0.55)) * windX;
          const impactThreshold = 0.72;
          stepParticles(rt, zone, dt, reducedMotion, 1.75, (p, i) => {
            if (p.life < impactThreshold) {
              if (i % 3 === 0) {
                drawFallStreak(p, tilt, zoneFallH, 6, 1.05, palette.rainStroke);
              } else {
                drawHailStone(
                  ctx,
                  p.x + tilt * p.life * zoomScale,
                  p.y + zoneFallH * p.life,
                  (1.7 + p.size * 0.75) * zoomScale,
                  0,
                  palette,
                );
              }
            } else {
              const bounceU = (p.life - impactThreshold) / (1 - impactThreshold);
              const bx =
                p.x +
                tilt * impactThreshold * zoomScale +
                (windX * 4 + (p.phase > Math.PI ? 2.5 : -2.5)) * bounceU * zoomScale;
              const by = zoneFallH * impactThreshold + p.y - Math.sin(bounceU * Math.PI) * 5.8 * zoomScale;
              drawHailStone(ctx, bx, by, (1.6 + p.size * 0.7) * zoomScale, bounceU, palette);
            }
          });
        } else if (phenomenon === 'snow') {
          const fallH = zoneFallH * 0.9;
          stepParticles(rt, zone, dt, reducedMotion, 0.42, (p) => {
            const sway = Math.sin(timeSec * 1.9 + p.phase) * 5.5 * zoomScale;
            drawSnowflake(
              ctx,
              p.x + sway + windX * windSpeedMph * 0.35 * p.life * zoomScale,
              p.y + fallH * p.life,
              (p.crystal ? 2.6 : 1.55) * p.size * zoomScale,
              timeSec * 0.9 + p.phase,
              p.crystal,
              palette,
            );
          });
        } else if (phenomenon === 'blizzard') {
          const driftX = (windX || 0.8) * Math.max(24, windSpeedMph * 1.05);
          const fallH = zoneFallH * 0.68;
          stepParticles(rt, zone, dt, reducedMotion, 1.65, (p) => {
            const curX = p.x + driftX * p.life * zoomScale;
            const curY = p.y + fallH * p.life + Math.sin(p.life * 6 + p.phase) * 2 * zoomScale;
            if (p.crystal) {
              drawRainStreak(
                ctx,
                curX,
                curY,
                (driftX / 3) * 0.32 * zoomScale,
                2.8 * zoomScale,
                1.4 * zoomScale,
                palette.blizzardStreak,
              );
            } else {
              drawSnowflake(ctx, curX, curY, 1.8 * p.size * zoomScale, p.phase, false, palette);
            }
          });
        } else if (phenomenon === 'freezing-rain') {
          const tilt = Math.min(20, Math.max(4, windSpeedMph * 0.65)) * windX;
          const fallH = zoneFallH * 0.92;
          stepParticles(rt, zone, dt, reducedMotion, 1.35, (p, i) => {
            if (i % 3 === 0) {
              const twinkle = Math.pow(Math.max(0, Math.sin(timeSec * 3.1 + p.phase)), 2.5);
              drawDiamondGlint(
                ctx,
                p.x,
                p.y + 10 * zoomScale,
                3.4 * p.size * zoomScale,
                twinkle,
                palette.iceGlint,
              );
            } else {
              drawFallStreak(p, tilt, fallH, 7, 1.25, palette.freezingStroke);
            }
          });
        } else if (phenomenon === 'fog') {
          for (const p of rt.particles) {
            const drift = Math.sin(timeSec * 0.45 + p.phase) * Math.min(14, zone.width * 0.16) * zoomScale;
            const ribW = Math.max(18, Math.min(54, zone.width * 0.56)) * p.size * zoomScale;
            const ribH = Math.max(5.5, Math.min(11, zone.height * 0.14)) * zoomScale;
            const alpha = 0.55 + 0.35 * Math.cos(timeSec * 0.6 + p.phase);
            drawFogRibbon(ctx, p.x + drift, p.y, ribW, ribH, alpha, palette);
          }
        } else if (phenomenon === 'cyclone') {
          const vortexR = Math.max(16, Math.min(44, zone.span * 0.48)) * zoomScale;
          for (let i = 0; i < rt.particles.length; i++) {
            const p = rt.particles[i]!;
            if (!reducedMotion) {
              p.life = (p.life + dt * 1.45 * p.speed) % 1;
            }
            const theta = p.phase - timeSec * (2.6 + strength) - p.life * Math.PI * 1.4;
            const r = vortexR * (0.28 + ((i % 5) / 5) * 0.68);
            drawRainStreak(
              ctx,
              zone.centroid[0] + Math.cos(theta) * r,
              zone.centroid[1] + Math.sin(theta) * r,
              Math.sin(theta) * 5.5 * zoomScale,
              -Math.cos(theta) * 5.5 * zoomScale,
              1.2 * zoomScale,
              palette.rainStroke,
            );
          }
        } else if (phenomenon === 'heat') {
          stepParticles(rt, zone, dt, reducedMotion, 0.55, (p) => {
            drawHeatShimmerLine(
              ctx,
              p.x,
              p.y + (8 - p.life * 16) * zoomScale,
              14 * p.size * zoomScale,
              2.2 * zoomScale,
              timeSec * 4.2 + p.phase,
              Math.sin(p.life * Math.PI) * (0.55 + strength * 0.35),
              palette,
            );
          });
        } else if (phenomenon === 'frost') {
          for (const p of rt.particles) {
            const twinkle = Math.pow(Math.max(0, Math.sin(timeSec * 2.2 + p.phase)), 2);
            drawDiamondGlint(
              ctx,
              p.x,
              p.y,
              (2.8 + p.size * 1.4) * zoomScale,
              twinkle * (0.65 + strength * 0.35),
              palette.frostGlint,
            );
          }
        } else if (phenomenon === 'aqi' || phenomenon === 'humidity') {
          const fill = phenomenon === 'aqi' ? palette.aqiFill : palette.humidityFill;
          stepParticles(rt, zone, dt, reducedMotion, 0.35, (p) => {
            const dx = (windX || 0.6) * p.life * 18 * zoomScale;
            const dy = (phenomenon === 'humidity' ? -10 : windY * 6) * p.life * zoomScale;
            drawHazeWisp(
              ctx,
              p.x + dx,
              p.y + dy,
              (16 + p.size * 10) * zoomScale,
              (8 + p.size * 4) * zoomScale,
              Math.sin(p.life * Math.PI),
              fill,
            );
          });
        }

        // 6. Clouds drawn over upper precipitation origin
        if (hasClouds) {
          if (phenomenon === 'cloudy') {
            ctx.save();
            ctx.globalAlpha *= 0.36;
            for (const cl of clouds) {
              drawCloudCluster(ctx, cl.x, cl.y, cl.width, 'drizzle', palette, 0);
            }
            ctx.restore();
          } else {
            for (const cl of clouds) {
              drawCloudCluster(ctx, cl.x, cl.y, cl.width, phenomenon, palette, flashAlpha);
            }
          }
        }

        if (flashAlpha > 0.02 && rt.lightning.segments.length > 0) {
          drawLightningBolt(ctx, rt.lightning.segments, flashAlpha, zoomScale, palette, dark);
        }

        ctx.restore();
      }
    };

    const tick = (now: number) => {
      if (document.hidden) {
        lastTime = now;
        rafId = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      drawFrame(now, dt);
      rafId = requestAnimationFrame(tick);
    };

    if (reducedMotion) {
      drawStaticRef.current = () => drawFrame(performance.now(), 0.016);
      drawStaticRef.current();
      return () => {
        drawStaticRef.current = null;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, MAP_WIDTH * CANVAS_SCALE, MAP_HEIGHT * CANVAS_SCALE);
      };
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        lastTime = performance.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibility);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, MAP_WIDTH * CANVAS_SCALE, MAP_HEIGHT * CANVAS_SCALE);
    };
  }, [visible]);

  // Re-draw static snapshot on state updates when prefers-reduced-motion is enabled
  useEffect(() => {
    if (visible && drawStaticRef.current) {
      drawStaticRef.current();
    }
  }, [visible, activeZones, isDark, zoom]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH * CANVAS_SCALE}
      height={MAP_HEIGHT * CANVAS_SCALE}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
