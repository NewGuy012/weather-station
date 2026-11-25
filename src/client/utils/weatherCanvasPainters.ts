import type { WeatherPhenomenon } from '../../shared/weatherPhenomena';

export interface ThemeFxPalette {
  cloudFill: string;
  cloudBelly: string;
  cloudHighlight: string;
  stormCloudFill: string;
  stormCloudBelly: string;
  hailCloudFill: string;
  hailCloudBelly: string;
  snowCloudFill: string;
  snowCloudBelly: string;
  drizzleStroke: string;
  rainStroke: string;
  rainSplash: string;
  lightningGlow: string;
  lightningCore: string;
  lightningSheet: string;
  hailFill: string;
  hailStroke: string;
  snowFill: string;
  snowHalo: string;
  blizzardStreak: string;
  freezingStroke: string;
  iceGlint: string;
  fogFill: string;
  cycloneArm: string;
  cycloneCore: string;
  heatStroke: string;
  heatGlow: string;
  frostGlint: string;
  uvStroke: string;
  aqiFill: string;
  humidityFill: string;
}

const SHARED_FX_BASE = {
  hailFill: 'rgba(224, 242, 254, 0.96)',
  snowFill: 'rgba(248, 250, 252, 0.95)',
  blizzardStreak: 'rgba(248, 250, 252, 0.84)',
  iceGlint: 'rgba(224, 242, 254, 0.96)',
  heatGlow: 'rgba(249, 115, 22, 0.16)',
};

export const LIGHT_FX_PALETTE: ThemeFxPalette = {
  ...SHARED_FX_BASE,
  cloudFill: 'rgba(148, 163, 184, 0.72)',
  cloudBelly: 'rgba(71, 85, 105, 0.52)',
  cloudHighlight: 'rgba(248, 250, 252, 0.55)',
  stormCloudFill: 'rgba(51, 65, 85, 0.84)',
  stormCloudBelly: 'rgba(30, 27, 75, 0.65)',
  hailCloudFill: 'rgba(17, 94, 89, 0.80)',
  hailCloudBelly: 'rgba(15, 23, 42, 0.62)',
  snowCloudFill: 'rgba(226, 232, 240, 0.90)',
  snowCloudBelly: 'rgba(100, 116, 139, 0.44)',
  drizzleStroke: 'rgba(2, 132, 199, 0.65)',
  rainStroke: 'rgba(29, 78, 216, 0.82)',
  rainSplash: 'rgba(29, 78, 216, 0.45)',
  lightningGlow: 'rgba(245, 158, 11, 0.82)',
  lightningCore: 'rgba(255, 251, 235, 0.98)',
  lightningSheet: 'rgba(253, 224, 71, 0.24)',
  hailStroke: 'rgba(14, 116, 144, 0.85)',
  snowHalo: 'rgba(51, 65, 85, 0.28)',
  freezingStroke: 'rgba(6, 182, 212, 0.82)',
  fogFill: 'rgba(148, 163, 184, 0.44)',
  cycloneArm: 'rgba(51, 65, 85, 0.56)',
  cycloneCore: 'rgba(56, 189, 248, 0.72)',
  heatStroke: 'rgba(234, 88, 12, 0.48)',
  frostGlint: 'rgba(14, 165, 233, 0.78)',
  uvStroke: 'rgba(234, 88, 12, 0.54)',
  aqiFill: 'rgba(180, 83, 9, 0.28)',
  humidityFill: 'rgba(14, 165, 233, 0.30)',
};

export const DARK_FX_PALETTE: ThemeFxPalette = {
  ...SHARED_FX_BASE,
  cloudFill: 'rgba(148, 163, 184, 0.46)',
  cloudBelly: 'rgba(30, 41, 59, 0.62)',
  cloudHighlight: 'rgba(241, 245, 249, 0.34)',
  stormCloudFill: 'rgba(30, 41, 59, 0.84)',
  stormCloudBelly: 'rgba(49, 46, 129, 0.66)',
  hailCloudFill: 'rgba(19, 78, 74, 0.82)',
  hailCloudBelly: 'rgba(15, 23, 42, 0.70)',
  snowCloudFill: 'rgba(203, 213, 225, 0.62)',
  snowCloudBelly: 'rgba(71, 85, 105, 0.50)',
  drizzleStroke: 'rgba(125, 211, 252, 0.72)',
  rainStroke: 'rgba(56, 189, 248, 0.90)',
  rainSplash: 'rgba(125, 211, 252, 0.55)',
  lightningGlow: 'rgba(250, 204, 21, 0.88)',
  lightningCore: 'rgba(255, 255, 255, 1)',
  lightningSheet: 'rgba(167, 139, 250, 0.28)',
  hailStroke: 'rgba(56, 189, 248, 0.9)',
  snowHalo: 'rgba(15, 23, 42, 0.32)',
  freezingStroke: 'rgba(103, 232, 249, 0.88)',
  fogFill: 'rgba(203, 213, 225, 0.34)',
  cycloneArm: 'rgba(148, 163, 184, 0.52)',
  cycloneCore: 'rgba(125, 211, 252, 0.82)',
  heatStroke: 'rgba(251, 146, 60, 0.52)',
  frostGlint: 'rgba(125, 211, 252, 0.86)',
  uvStroke: 'rgba(250, 204, 21, 0.58)',
  aqiFill: 'rgba(245, 158, 11, 0.24)',
  humidityFill: 'rgba(56, 189, 248, 0.26)',
};

export interface LightningSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isBranch: boolean;
}

/**
 * Generates a jagged branching lightning bolt path downward from `(startX, startY)`.
 */
export function generateLightningSegments(
  startX: number,
  startY: number,
  length: number,
  driftX: number,
): LightningSegment[] {
  const segments: LightningSegment[] = [];
  const steps = 6;
  let px = startX;
  let py = startY;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const jitterX = (Math.random() - 0.5) * (length * 0.34);
    const nx = startX + driftX * t + jitterX;
    const ny = startY + length * t;
    segments.push({ x1: px, y1: py, x2: nx, y2: ny, isBranch: false });

    // Spawn 1–2 jagged secondary forks in the upper-middle span
    if (i >= 2 && i <= 4 && Math.random() < 0.65) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const bx1 = nx + side * length * (0.14 + Math.random() * 0.14);
      const by1 = ny + length * (0.14 + Math.random() * 0.1);
      segments.push({ x1: nx, y1: ny, x2: bx1, y2: by1, isBranch: true });

      if (Math.random() < 0.55) {
        const bx2 = bx1 + side * length * (0.08 + Math.random() * 0.12);
        const by2 = by1 + length * (0.1 + Math.random() * 0.08);
        segments.push({ x1: bx1, y1: by1, x2: bx2, y2: by2, isBranch: true });
      }
    }

    px = nx;
    py = ny;
  }

  return segments;
}

/**
 * Realistic double-flicker return-stroke brightness curve over normalized age `u in [0, 1]`.
 */
export function lightningFlickerAlpha(u: number): number {
  if (u < 0 || u > 1) return 0;
  if (u < 0.16) return 1;
  if (u < 0.3) return 0.22;
  if (u < 0.52) return 0.88;
  return Math.max(0, 1 - (u - 0.52) / 0.48);
}

/**
 * Draws a sculpted multi-lobe weather cloud silhouette with soft underbelly shading.
 */
export function drawCloudCluster(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  phenomenon: WeatherPhenomenon,
  palette: ThemeFxPalette,
  flashGlow = 0,
): void {
  const r = width * 0.24;
  let fill = palette.cloudFill;
  let belly = palette.cloudBelly;

  if (phenomenon === 'thunderstorm' || phenomenon === 'cyclone') {
    fill = palette.stormCloudFill;
    belly = palette.stormCloudBelly;
  } else if (phenomenon === 'hail') {
    fill = palette.hailCloudFill;
    belly = palette.hailCloudBelly;
  } else if (phenomenon === 'snow' || phenomenon === 'blizzard') {
    fill = palette.snowCloudFill;
    belly = palette.snowCloudBelly;
  }

  ctx.save();
  // Soft base shadow belly
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.42, width * 0.46, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  // Fluffy multi-lobe cloud body
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx - width * 0.24, cy + r * 0.14, r * 0.82, 0, Math.PI * 2);
  ctx.arc(cx - width * 0.05, cy - r * 0.25, r * 1.05, 0, Math.PI * 2);
  ctx.arc(cx + width * 0.19, cy - r * 0.08, r * 0.88, 0, Math.PI * 2);
  ctx.arc(cx + width * 0.28, cy + r * 0.2, r * 0.66, 0, Math.PI * 2);
  ctx.ellipse(cx, cy + r * 0.28, width * 0.42, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // Upper highlight ridge
  ctx.fillStyle = palette.cloudHighlight;
  ctx.beginPath();
  ctx.arc(cx - width * 0.05, cy - r * 0.34, r * 0.62, Math.PI * 1.05, Math.PI * 1.92);
  ctx.fill();

  // Internal cloud-base lightning glow during strikes
  if (flashGlow > 0.02) {
    ctx.fillStyle = `rgba(253, 224, 71, ${Math.min(0.65, flashGlow * 0.55)})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.25, width * 0.36, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawRainStreak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  lineWidth: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + dx, y + dy);
  ctx.stroke();
}

export function drawSplashRipple(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  radius: number,
  color: string,
): void {
  const alpha = Math.max(0, 1 - progress);
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  const rx = radius * (0.35 + progress * 1.15);
  ctx.ellipse(x, y, rx, rx * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawLightningBolt(
  ctx: CanvasRenderingContext2D,
  segments: LightningSegment[],
  alpha: number,
  scale: number,
  palette: ThemeFxPalette,
  isDark: boolean,
): void {
  if (alpha <= 0.02 || segments.length === 0) return;

  ctx.save();
  if (isDark) {
    ctx.globalCompositeOperation = 'lighter';
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer luminous glow
  ctx.globalAlpha *= alpha * 0.65;
  ctx.strokeStyle = palette.lightningGlow;
  ctx.beginPath();
  for (const s of segments) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.lineWidth = 4.2 * scale;
  ctx.stroke();

  // Sharp bright core
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.strokeStyle = palette.lightningCore;
  ctx.beginPath();
  for (const s of segments) {
    if (s.isBranch) continue;
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.lineWidth = 1.65 * scale;
  ctx.stroke();

  // Thinner branch cores
  ctx.beginPath();
  for (const s of segments) {
    if (!s.isBranch) continue;
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.lineWidth = 1.05 * scale;
  ctx.stroke();

  ctx.restore();
}

export function drawHailStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  bounceProgress: number,
  palette: ThemeFxPalette,
): void {
  ctx.save();
  ctx.fillStyle = palette.hailFill;
  ctx.strokeStyle = palette.hailStroke;
  ctx.lineWidth = Math.max(0.7, radius * 0.35);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Impact shard flash right as hail hits & rebounds
  if (bounceProgress > 0 && bounceProgress < 0.32) {
    const sparkAlpha = 1 - bounceProgress / 0.32;
    ctx.globalAlpha *= sparkAlpha;
    ctx.strokeStyle = palette.iceGlint;
    ctx.lineWidth = 0.85;
    const span = radius * 2.1 * (0.6 + bounceProgress * 2);
    ctx.beginPath();
    ctx.moveTo(x - span, y + radius * 0.4);
    ctx.lineTo(x - span * 0.35, y - span * 0.45);
    ctx.moveTo(x + span, y + radius * 0.4);
    ctx.lineTo(x + span * 0.35, y - span * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  crystal: boolean,
  palette: ThemeFxPalette,
): void {
  ctx.save();
  if (!crystal || radius < 1.9) {
    ctx.fillStyle = palette.snowHalo;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.32, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.snowFill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = palette.snowHalo;
  ctx.lineWidth = Math.max(1.2, radius * 0.42);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const dx = Math.cos(a) * radius;
    const dy = Math.sin(a) * radius;
    ctx.moveTo(-dx, -dy);
    ctx.lineTo(dx, dy);
  }
  ctx.stroke();

  ctx.strokeStyle = palette.snowFill;
  ctx.lineWidth = Math.max(0.75, radius * 0.25);
  ctx.stroke();
  ctx.restore();
}

export function drawDiamondGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string,
): void {
  if (alpha <= 0.03) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + radius * 0.34, y - radius * 0.34);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x + radius * 0.34, y + radius * 0.34);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - radius * 0.34, y + radius * 0.34);
  ctx.lineTo(x - radius, y);
  ctx.lineTo(x - radius * 0.34, y - radius * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawFogRibbon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  thickness: number,
  alpha: number,
  palette: ThemeFxPalette,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = palette.fogFill;
  ctx.beginPath();
  ctx.roundRect(cx - width / 2, cy - thickness / 2, width, thickness, thickness / 2);
  ctx.fill();
  ctx.restore();
}

export function drawCycloneVortex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  maxRadius: number,
  timeSec: number,
  strength: number,
  palette: ThemeFxPalette,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  // Counter-clockwise Northern Hemisphere cyclonic rotation
  ctx.rotate(-timeSec * (1.2 + strength * 0.9));

  const arms = 3;
  for (let a = 0; a < arms; a++) {
    const baseAngle = (a * Math.PI * 2) / arms;
    ctx.beginPath();
    const steps = 16;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const radius = maxRadius * (0.18 + t * 0.82);
      const theta = baseAngle + t * Math.PI * 1.45;
      const px = Math.cos(theta) * radius;
      const py = Math.sin(theta) * radius;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = palette.cycloneArm;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2.2, maxRadius * 0.16);
    ctx.stroke();
  }

  // Pulsing inner eyewall ring
  const eyePulse = 0.85 + 0.15 * Math.sin(timeSec * 3.2);
  ctx.strokeStyle = palette.cycloneCore;
  ctx.lineWidth = Math.max(1.3, maxRadius * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, maxRadius * 0.17 * eyePulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawHeatShimmerLine(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  height: number,
  amplitude: number,
  phase: number,
  alpha: number,
  palette: ThemeFxPalette,
): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = palette.heatStroke;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const py = baseY - u * height;
    const px = baseX + Math.sin(u * Math.PI * 3 + phase) * amplitude;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawUvCorona(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  timeSec: number,
  strength: number,
  palette: ThemeFxPalette,
): void {
  const pulse = 0.9 + 0.12 * Math.sin(timeSec * 2.1);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(timeSec * 0.45);
  ctx.strokeStyle = palette.uvStroke;
  ctx.lineWidth = 1.3;
  ctx.globalAlpha *= 0.55 + strength * 0.3;

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.45 * pulse, 0, Math.PI * 2);
  ctx.stroke();

  const rays = 8;
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a = (i * Math.PI * 2) / rays;
    const r0 = radius * 0.62 * pulse;
    const r1 = radius * 0.95 * pulse;
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawHazeWisp(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  alpha: number,
  color: string,
): void {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width * 0.5, height * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
