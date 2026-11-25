import { useState } from 'react';
import type { HourlyPoint, TempUnit } from '../../shared/types';
import { fToC, formatPrecip, formatTemp } from '../../shared/units';

interface HourlyChartProps {
  hourly: HourlyPoint[];
  unit: TempUnit;
  maxPoints?: number;
}

export function HourlyChart({ hourly, unit, maxPoints = 36 }: HourlyChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const points = hourly.slice(0, maxPoints);

  if (points.length < 2) {
    return (
      <div className="rounded-xl border border-slate-200/70 p-4 text-center text-xs text-slate-400 dark:border-slate-800">
        Hourly curve unavailable
      </div>
    );
  }

  const width = 360;
  const height = 88;
  const padX = 10;
  const padTop = 12;
  const padBottom = 18;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const temps = points.map((p) => (unit === 'C' ? fToC(p.temperatureF) : p.temperatureF));
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const rangeT = Math.max(4, maxT - minT);

  const maxPrecip = Math.max(2, ...points.map((p) => p.precipitationMm));

  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * plotW;
    const tVal = temps[i] ?? 0;
    const y = padTop + plotH - ((tVal - minT) / rangeT) * plotH;
    const precipH = (p.precipitationMm / maxPrecip) * (plotH * 0.45);
    return { x, y, precipH, point: p, displayTemp: tVal };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1]!.x.toFixed(1)} ${(
    padTop + plotH
  ).toFixed(1)} L ${coords[0]!.x.toFixed(1)} ${(padTop + plotH).toFixed(1)} Z`;

  const active = hoverIdx !== null ? coords[hoverIdx] : null;
  const formatHourLabel = (iso: string) => {
    const hourPart = iso.slice(11, 13);
    const h = Number(hourPart);
    if (Number.isNaN(h)) return iso.slice(11, 16);
    if (h === 0) return '12a';
    if (h === 12) return '12p';
    return h > 12 ? `${h - 12}p` : `${h}a`;
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Hourly Trend ({points.length}h)
        </span>
        {active ? (
          <span className="tabular-nums font-medium text-sky-600 dark:text-sky-400">
            {active.point.time.slice(5, 10)} {formatHourLabel(active.point.time)} •{' '}
            {formatTemp(active.point.temperatureF, unit, true)}
            {active.point.precipitationMm > 0
              ? ` • ${formatPrecip(active.point.precipitationMm, unit)}`
              : ''}
          </span>
        ) : (
          <span className="tabular-nums text-slate-400">
            Low {Math.round(minT)}° / High {Math.round(maxT)}°{unit}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full overflow-visible select-none"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <line
          x1={padX}
          y1={padTop + plotH}
          x2={width - padX}
          y2={padTop + plotH}
          className="stroke-slate-200 dark:stroke-slate-700"
          strokeWidth={1}
        />

        {coords.map((c, idx) =>
          c.precipH > 0.5 ? (
            <rect
              key={`pr-${idx}`}
              x={c.x - 2.5}
              y={padTop + plotH - c.precipH}
              width={5}
              height={c.precipH}
              rx={1.5}
              className="fill-sky-400/55 dark:fill-sky-400/45"
            />
          ) : null,
        )}

        <path d={areaPath} fill="url(#tempAreaGrad)" />
        <path
          d={linePath}
          fill="none"
          stroke="#0284c7"
          className="dark:stroke-sky-400"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {coords.map((c, idx) => {
          if (idx % Math.max(4, Math.floor(coords.length / 5)) !== 0 && idx !== coords.length - 1) {
            return null;
          }
          return (
            <text
              key={`lbl-${idx}`}
              x={c.x}
              y={height - 4}
              textAnchor="middle"
              className="fill-slate-400 text-[9px] tabular-nums"
            >
              {formatHourLabel(c.point.time)}
            </text>
          );
        })}

        {active && (
          <g>
            <line
              x1={active.x}
              y1={padTop - 4}
              x2={active.x}
              y2={padTop + plotH}
              className="stroke-slate-400/70"
              strokeDasharray="2 2"
              strokeWidth={1}
            />
            <circle
              cx={active.x}
              cy={active.y}
              r={3.5}
              fill="#0284c7"
              stroke="#ffffff"
              strokeWidth={1.5}
            />
          </g>
        )}

        {coords.map((c, idx) => {
          const stepW = plotW / coords.length;
          return (
            <rect
              key={`hit-${idx}`}
              x={c.x - stepW / 2}
              y={0}
              width={stepW}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          );
        })}
      </svg>
    </div>
  );
}
