import { useEffect, useRef } from 'react';
import { RADAR_BBOX_4326, type RadarRegion } from '../../shared/radar';
import type { RadarFrame, WeatherMode } from '../../shared/types';
import { MAP_HEIGHT, MAP_WIDTH, getUsClipPath, usProjection } from '../utils/mapGeometry';

// Work at 650x407 (~264k pixels) for <40ms one-time LUT build & <2ms frame reprojection
const WORK_W = 650;
const WORK_H = 407;
const MAX_FRAME_CACHE = 24;

interface RadarLut {
  regions: Uint8Array; // 0 = none, 1 = conus, 2 = alaska, 3 = hawaii
  srcIndex: Int32Array;
}

let cachedLut: RadarLut | null = null;

function inBox(lon: number, lat: number, region: RadarRegion): boolean {
  const b = RADAR_BBOX_4326[region];
  return lon >= b.minLon && lon <= b.maxLon && lat >= b.minLat && lat <= b.maxLat;
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
      const lonLat = usProjection.invert?.([svgX, svgY]);
      if (!lonLat) continue;

      const [lon, lat] = lonLat;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

      const inAkInset = svgX < 245 && svgY > 385;
      const inHiInset = svgX >= 240 && svgX <= 390 && svgY > 465;

      let regionCode = 0;
      let region: RadarRegion = 'conus';
      if (!inAkInset && !inHiInset && inBox(lon, lat, 'conus')) {
        regionCode = 1;
      } else if (inAkInset && inBox(lon, lat, 'alaska')) {
        regionCode = 2;
        region = 'alaska';
      } else if (inHiInset && inBox(lon, lat, 'hawaii')) {
        regionCode = 3;
        region = 'hawaii';
      }

      if (regionCode === 0) continue;

      const box = RADAR_BBOX_4326[region];
      const u = (lon - box.minLon) / (box.maxLon - box.minLon);
      const v = (box.maxLat - lat) / (box.maxLat - box.minLat);
      const sx = Math.min(box.width - 1, Math.max(0, Math.floor(u * box.width)));
      const sy = Math.min(box.height - 1, Math.max(0, Math.floor(v * box.height)));

      const idx = y * WORK_W + x;
      regions[idx] = regionCode;
      srcIndex[idx] = sy * box.width + sx;
    }
  }

  cachedLut = { regions, srcIndex };
  return cachedLut;
}

function createWorkCanvas(
  w: number,
  h: number,
): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext('2d') };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d') };
}

async function loadImagePixels(
  url: string,
  w: number,
  h: number,
  signal?: AbortSignal,
): Promise<Uint32Array | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const { ctx } = createWorkCanvas(w, h);
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      return new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

interface DopplerRadarOverlayProps {
  visible: boolean;
  mode: WeatherMode;
  frames: RadarFrame[];
  activeFrameIndex: number;
  isPlaying?: boolean;
  opacity: number;
  onLoadingChange?: (loading: boolean) => void;
}

export function DopplerRadarOverlay({
  visible,
  mode,
  frames,
  activeFrameIndex,
  isPlaying = false,
  opacity,
  onLoadingChange,
}: DopplerRadarOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCacheRef = useRef<Map<string, ImageBitmap>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<ImageBitmap | null>>>(new Map());

  useEffect(() => {
    const cache = frameCacheRef.current;
    return () => {
      for (const bmp of cache.values()) bmp.close();
      cache.clear();
    };
  }, []);

  useEffect(() => {
    if (!visible || frames.length === 0) return;
    const controller = new AbortController();
    const lut = getRadarLut();

    const cacheBitmap = (key: string, bmp: ImageBitmap) => {
      const cache = frameCacheRef.current;
      if (cache.has(key)) {
        cache.get(key)?.close();
        cache.delete(key);
      }
      cache.set(key, bmp);
      while (cache.size > MAX_FRAME_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.get(oldest)?.close();
        cache.delete(oldest);
      }
    };

    const loadRegion = (region: RadarRegion, ts: string) => {
      const { width, height } = RADAR_BBOX_4326[region];
      return loadImagePixels(
        `/api/radar/image?mode=${mode}&region=${region}&ts=${encodeURIComponent(ts)}`,
        width,
        height,
        controller.signal,
      );
    };

    const buildCompositeForFrame = (frame: RadarFrame): Promise<ImageBitmap | null> => {
      const cacheKey = `${mode}:${frame.timestamp}`;
      const existing = frameCacheRef.current.get(cacheKey);
      if (existing) return Promise.resolve(existing);
      const pending = inFlightRef.current.get(cacheKey);
      if (pending) return pending;

      const task = (async () => {
        try {
          const [conusPx, akPx, hiPx] = await Promise.all([
            loadRegion('conus', frame.timestamp),
            frame.hasAlaska ? loadRegion('alaska', frame.timestamp) : Promise.resolve(null),
            frame.hasHawaii ? loadRegion('hawaii', frame.timestamp) : Promise.resolve(null),
          ]);
          if (controller.signal.aborted || (!conusPx && !akPx && !hiPx)) return null;

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
            if (px !== 0) dst32[i] = px;
          }

          const { canvas: off, ctx: octx } = createWorkCanvas(WORK_W, WORK_H);
          if (!octx) return null;
          octx.putImageData(outImg, 0, 0);
          const bitmap = await createImageBitmap(off);
          if (controller.signal.aborted) {
            bitmap.close();
            return null;
          }
          cacheBitmap(cacheKey, bitmap);
          return bitmap;
        } finally {
          inFlightRef.current.delete(cacheKey);
        }
      })();

      inFlightRef.current.set(cacheKey, task);
      return task;
    };

    const renderActive = async () => {
      const frame = frames[activeFrameIndex] ?? frames[0];
      if (!frame) return;

      const cacheKey = `${mode}:${frame.timestamp}`;
      let bmp = frameCacheRef.current.get(cacheKey) ?? null;
      if (!bmp) {
        onLoadingChange?.(true);
        try {
          bmp = await buildCompositeForFrame(frame);
        } finally {
          if (!controller.signal.aborted) onLoadingChange?.(false);
        }
      }
      if (controller.signal.aborted || !bmp) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      ctx.save();
      ctx.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      ctx.clip(getUsClipPath());
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bmp, 0, 0, MAP_WIDTH, MAP_HEIGHT);
      ctx.restore();

      // Only look ahead 1 frame when playing; stay completely lazy while paused
      if (isPlaying && frames.length > 1) {
        const nextFrame = frames[(activeFrameIndex + 1) % frames.length];
        if (nextFrame && !frameCacheRef.current.has(`${mode}:${nextFrame.timestamp}`)) {
          void buildCompositeForFrame(nextFrame);
        }
      }
    };

    void renderActive();

    return () => {
      controller.abort();
      onLoadingChange?.(false);
    };
  }, [visible, mode, frames, activeFrameIndex, isPlaying, onLoadingChange]);

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
