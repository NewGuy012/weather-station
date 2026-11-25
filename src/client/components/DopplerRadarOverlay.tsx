import { useEffect, useRef } from 'react';
import type { RadarFrame, WeatherMode } from '../../shared/types';
import { MAP_HEIGHT, MAP_WIDTH, getUsStateGeometries, usProjection } from '../utils/mapGeometry';

export type RadarRegion = 'conus' | 'alaska' | 'hawaii';

const RADAR_BOXES: Record<
  RadarRegion,
  { minLon: number; minLat: number; maxLon: number; maxLat: number; width: number; height: number }
> = {
  conus: { minLon: -126, minLat: 24, maxLon: -66, maxLat: 50, width: 900, height: 450 },
  alaska: { minLon: -172, minLat: 50, maxLon: -129, maxLat: 72, width: 420, height: 240 },
  hawaii: { minLon: -161, minLat: 18, maxLon: -154, maxLat: 23, width: 320, height: 220 },
};

// Work at 650x407 (~264k pixels) for <40ms one-time LUT build & <2ms frame reprojection
const WORK_W = 650;
const WORK_H = 407;

interface RadarLut {
  regions: Uint8Array; // 0 = none, 1 = conus, 2 = alaska, 3 = hawaii
  srcIndex: Int32Array;
}

let cachedLut: RadarLut | null = null;
let cachedUsClipPath: Path2D | null = null;

function getUsClipPath(): Path2D {
  if (cachedUsClipPath) return cachedUsClipPath;
  const combined = new Path2D();
  for (const g of getUsStateGeometries()) {
    combined.addPath(new Path2D(g.pathD));
  }
  cachedUsClipPath = combined;
  return combined;
}

function getRadarLut(): RadarLut {
  if (cachedLut) return cachedLut;

  const total = WORK_W * WORK_H;
  const regions = new Uint8Array(total);
  const srcIndex = new Int32Array(total);

  const scaleX = MAP_WIDTH / WORK_W;
  const scaleY = MAP_HEIGHT / WORK_H;

  for (let y = 0; y < WORK_H; y++) {
    const svgY = (y + 0.5) * scaleY;
    for (let x = 0; x < WORK_W; x++) {
      const svgX = (x + 0.5) * scaleX;
      const idx = y * WORK_W + x;
      const lonLat = usProjection.invert?.([svgX, svgY]);
      if (!lonLat) continue;

      const [lon, lat] = lonLat;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      let regionCode = 0;
      let box = RADAR_BOXES.conus;

      if (
        lon >= RADAR_BOXES.conus.minLon &&
        lon <= RADAR_BOXES.conus.maxLon &&
        lat >= RADAR_BOXES.conus.minLat &&
        lat <= RADAR_BOXES.conus.maxLat &&
        !(svgX < 245 && svgY > 385) &&
        !(svgX >= 240 && svgX <= 390 && svgY > 465)
      ) {
        regionCode = 1;
        box = RADAR_BOXES.conus;
      } else if (
        lon >= RADAR_BOXES.alaska.minLon &&
        lon <= RADAR_BOXES.alaska.maxLon &&
        lat >= RADAR_BOXES.alaska.minLat &&
        lat <= RADAR_BOXES.alaska.maxLat &&
        svgX < 245 &&
        svgY > 385
      ) {
        regionCode = 2;
        box = RADAR_BOXES.alaska;
      } else if (
        lon >= RADAR_BOXES.hawaii.minLon &&
        lon <= RADAR_BOXES.hawaii.maxLon &&
        lat >= RADAR_BOXES.hawaii.minLat &&
        lat <= RADAR_BOXES.hawaii.maxLat &&
        svgX >= 240 &&
        svgX <= 390 &&
        svgY > 465
      ) {
        regionCode = 3;
        box = RADAR_BOXES.hawaii;
      }

      if (regionCode === 0) continue;

      const u = (lon - box.minLon) / (box.maxLon - box.minLon);
      const v = (box.maxLat - lat) / (box.maxLat - box.minLat);
      const sx = Math.min(box.width - 1, Math.max(0, Math.floor(u * box.width)));
      const sy = Math.min(box.height - 1, Math.max(0, Math.floor(v * box.height)));

      regions[idx] = regionCode;
      srcIndex[idx] = sy * box.width + sx;
    }
  }

  cachedLut = { regions, srcIndex };
  return cachedLut;
}

async function loadImagePixels(url: string, w: number, h: number): Promise<Uint32Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const data = ctx.getImageData(0, 0, w, h).data;
    return new Uint32Array(data.buffer);
  } catch {
    return null;
  }
}

interface DopplerRadarOverlayProps {
  visible: boolean;
  mode: WeatherMode;
  frames: RadarFrame[];
  activeFrameIndex: number;
  opacity: number;
  onLoadingChange?: (loading: boolean) => void;
}

export function DopplerRadarOverlay({
  visible,
  mode,
  frames,
  activeFrameIndex,
  opacity,
  onLoadingChange,
}: DopplerRadarOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!visible || frames.length === 0) return;
    let cancelled = false;
    const lut = getRadarLut();

    const buildCompositeForFrame = async (frame: RadarFrame): Promise<ImageBitmap | null> => {
      const cacheKey = `${mode}:${frame.timestamp}`;
      const existing = frameCacheRef.current.get(cacheKey);
      if (existing) return existing;
      if (inFlightRef.current.has(cacheKey)) return null;
      inFlightRef.current.add(cacheKey);

      try {
        const conusPromise = loadImagePixels(
          `/api/radar/image?mode=${mode}&region=conus&ts=${encodeURIComponent(frame.timestamp)}`,
          RADAR_BOXES.conus.width,
          RADAR_BOXES.conus.height,
        );
        const akPromise = frame.hasAlaska
          ? loadImagePixels(
              `/api/radar/image?mode=${mode}&region=alaska&ts=${encodeURIComponent(frame.timestamp)}`,
              RADAR_BOXES.alaska.width,
              RADAR_BOXES.alaska.height,
            )
          : Promise.resolve(null);
        const hiPromise = frame.hasHawaii
          ? loadImagePixels(
              `/api/radar/image?mode=${mode}&region=hawaii&ts=${encodeURIComponent(frame.timestamp)}`,
              RADAR_BOXES.hawaii.width,
              RADAR_BOXES.hawaii.height,
            )
          : Promise.resolve(null);

        const [conusPx, akPx, hiPx] = await Promise.all([conusPromise, akPromise, hiPromise]);
        if (cancelled) return null;
        if (!conusPx && !akPx && !hiPx) return null;

        const outImg = new ImageData(WORK_W, WORK_H);
        const dst32 = new Uint32Array(outImg.data.buffer);
        const total = WORK_W * WORK_H;

        for (let i = 0; i < total; i++) {
          const rCode = lut.regions[i];
          if (rCode === 0) continue;
          const sIdx = lut.srcIndex[i]!;
          let px = 0;
          if (rCode === 1 && conusPx) px = conusPx[sIdx] ?? 0;
          else if (rCode === 2 && akPx) px = akPx[sIdx] ?? 0;
          else if (rCode === 3 && hiPx) px = hiPx[sIdx] ?? 0;
          if (px !== 0) {
            dst32[i] = px;
          }
        }

        const off = new OffscreenCanvas(WORK_W, WORK_H);
        const octx = off.getContext('2d');
        if (!octx) return null;
        octx.putImageData(outImg, 0, 0);
        const bitmap = await createImageBitmap(off);
        frameCacheRef.current.set(cacheKey, bitmap);
        return bitmap;
      } finally {
        inFlightRef.current.delete(cacheKey);
      }
    };

    const renderActive = async () => {
      const frame = frames[activeFrameIndex] ?? frames[0];
      if (!frame) return;

      const cacheKey = `${mode}:${frame.timestamp}`;
      let bmp: ImageBitmap | null = frameCacheRef.current.get(cacheKey) ?? null;
      if (!bmp) {
        onLoadingChange?.(true);
        bmp = await buildCompositeForFrame(frame);
        onLoadingChange?.(false);
      }
      if (cancelled || !bmp) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      ctx.clip(getUsClipPath());
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bmp, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      ctx.restore();
    };

    void renderActive();

    // Background-preload neighboring frames so looping is flicker-free
    const preloadOrder = frames
      .map((_, i) => i)
      .sort((a, b) => Math.abs(a - activeFrameIndex) - Math.abs(b - activeFrameIndex));
    for (const idx of preloadOrder.slice(0, 5)) {
      const f = frames[idx];
      if (f && !frameCacheRef.current.has(`${mode}:${f.timestamp}`)) {
        void buildCompositeForFrame(f);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [visible, mode, frames, activeFrameIndex, onLoadingChange]);

  // Clear canvas when hidden
  useEffect(() => {
    if (visible) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      width={MAP_WIDTH}
      height={MAP_HEIGHT}
      style={{ opacity }}
      className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-200"
    />
  );
}
