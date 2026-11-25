import { useEffect, useMemo, useRef } from 'react';
import type { StateWeatherSnapshot } from '../../shared/types';
import { MAP_HEIGHT, MAP_WIDTH, getUsClipPath, getUsStateGeometries } from '../utils/mapGeometry';
import { resolveStateSlice } from '../utils/scales';

interface WindOverlayProps {
  visible: boolean;
  states: Record<string, StateWeatherSnapshot>;
  timelineIndex: number;
  useTimeline: boolean;
  isDark: boolean;
}

interface VectorStation {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
}

interface Particle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

export function WindOverlay({
  visible,
  states,
  timelineIndex,
  useTimeline,
  isDark,
}: WindOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geometries = useMemo(() => getUsStateGeometries(), []);

  const stations = useMemo<VectorStation[]>(() => {
    return geometries
      .map((g) => {
        const snap = states[g.meta.code];
        if (!snap) return null;
        const slice = resolveStateSlice(snap, timelineIndex, useTimeline);
        const rad = (slice.windDirectionDeg * Math.PI) / 180;
        const speed = Math.max(1, slice.windSpeedMph);
        // Meteorological wind direction is FROM deg -> blow vector is (-sin, cos)
        const vx = -Math.sin(rad) * speed;
        const vy = Math.cos(rad) * speed;
        return {
          x: g.centroid[0],
          y: g.centroid[1],
          vx,
          vy,
          speed,
        };
      })
      .filter((s): s is VectorStation => s !== null);
  }, [geometries, states, timelineIndex, useTimeline]);

  const stationsRef = useRef<VectorStation[]>(stations);
  stationsRef.current = stations;

  useEffect(() => {
    if (!visible) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const clipPath = getUsClipPath();
    const PARTICLE_COUNT = 260;

    const spawn = (): Particle => ({
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
      age: Math.floor(Math.random() * 60),
      maxAge: 55 + Math.floor(Math.random() * 55),
    });

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, spawn);

    const sampleWind = (x: number, y: number): { vx: number; vy: number; speed: number } => {
      const list = stationsRef.current;
      let wSum = 0;
      let vxSum = 0;
      let vySum = 0;

      for (let i = 0; i < list.length; i++) {
        const st = list[i]!;
        const dx = x - st.x;
        const dy = y - st.y;
        const d2 = dx * dx + dy * dy + 220;
        const w = 1 / d2;
        wSum += w;
        vxSum += st.vx * w;
        vySum += st.vy * w;
      }

      if (wSum === 0) return { vx: 0, vy: 0, speed: 0 };
      const vx = vxSum / wSum;
      const vy = vySum / wSum;
      return { vx, vy, speed: Math.hypot(vx, vy) };
    };

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // Fade existing trails gently
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      ctx.restore();

      ctx.save();
      ctx.clip(clipPath);
      ctx.lineWidth = 1.35;
      ctx.lineCap = 'round';
      ctx.strokeStyle = isDark ? 'rgba(226, 232, 240, 0.55)' : 'rgba(15, 23, 42, 0.42)';

      ctx.beginPath();
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]!;
        p.age += 1;
        if (p.age >= p.maxAge) {
          particles[i] = spawn();
          continue;
        }

        const { vx, vy } = sampleWind(p.x, p.y);
        const stepScale = 2.6 * dt * 2.2;
        const nx = p.x + vx * stepScale;
        const ny = p.y + vy * stepScale;

        if (nx < 0 || nx > MAP_WIDTH || ny < 0 || ny > MAP_HEIGHT) {
          particles[i] = spawn();
          continue;
        }

        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        p.x = nx;
        p.y = ny;
      }
      ctx.stroke();
      ctx.restore();

      rafId = requestAnimationFrame(tick);
    };

    ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    };
  }, [visible, isDark]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
