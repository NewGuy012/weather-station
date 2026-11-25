import type { CSSProperties } from 'react';

export interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

type CircleSpec = readonly [cx: number, cy: number, r: number, filled?: 1];

function icon(paths: readonly string[], circles?: readonly CircleSpec[]) {
  return function Icon({ size = 16, className, style }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
        style={style}
      >
        {paths.map((d, i) => (
          <path key={i} d={d} />
        ))}
        {circles?.map(([cx, cy, r, filled], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={filled ? 'currentColor' : undefined} />
        ))}
      </svg>
    );
  };
}

export const AlertTriangle = icon([
  'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
  'M12 9v4',
  'M12 17h.01',
]);
export const ArrowLeftRight = icon(['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4']);
export const ArrowUpRight = icon(['M7 7h10v10', 'M7 17 17 7']);
export const Calendar = icon([
  'M8 2v4',
  'M16 2v4',
  'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  'M3 10h18',
]);
export const Check = icon(['M20 6 9 17l-5-5']);
export const ChevronDown = icon(['m6 9 6 6 6-6']);
export const ChevronUp = icon(['m18 15-6-6-6 6']);
export const CloudRain = icon([
  'M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242',
  'M16 14v6',
  'M8 14v6',
  'M12 16v6',
]);
export const Compass = icon(
  ['m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z'],
  [[12, 12, 10]],
);
export const Download = icon([
  'M12 15V3',
  'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  'm7 10 5 5 5-5',
]);
export const Droplets = icon([
  'M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z',
  'M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97',
]);
export const FileJson = icon([
  'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
  'M14 2v4a2 2 0 0 0 2 2h4',
  'M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1',
  'M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1',
]);
export const FileSpreadsheet = icon([
  'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z',
  'M14 2v4a2 2 0 0 0 2 2h4',
  'M8 13h2',
  'M14 13h2',
  'M8 17h2',
  'M14 17h2',
]);
export const Flame = icon([
  'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
]);
export const Gauge = icon(['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0']);
export const GitCompare = icon(
  ['M13 6h3a2 2 0 0 1 2 2v7', 'M11 18H8a2 2 0 0 1-2-2V9'],
  [
    [18, 18, 3],
    [6, 6, 3],
  ],
);
export const Image = icon(
  [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
  ],
  [[9, 9, 2]],
);
export const MapPin = icon(
  ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0'],
  [[12, 10, 3]],
);
export const MapPinned = icon(
  [
    'M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0',
    'M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712',
  ],
  [[12, 8, 2]],
);
export const Moon = icon(['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']);
export const Palette = icon(
  [
    'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
  ],
  [
    [13.5, 6.5, 0.5, 1],
    [17.5, 10.5, 0.5, 1],
    [6.5, 12.5, 0.5, 1],
    [8.5, 7.5, 0.5, 1],
  ],
);
export const Pause = icon([
  'M15 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
  'M7 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
]);
export const Play = icon(['M6 3L20 12L6 21Z']);
export const Plus = icon(['M5 12h14', 'M12 5v14']);
export const Printer = icon([
  'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
  'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6',
  'M7 14h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1Z',
]);
export const Radar = icon(
  [
    'M19.07 4.93A10 10 0 0 0 6.99 3.34',
    'M4 6h.01',
    'M2.29 9.62A10 10 0 1 0 21.31 8.35',
    'M16.24 7.76A6 6 0 1 0 8.23 16.67',
    'M12 18h.01',
    'M17.99 11.66A6 6 0 0 1 15.77 16.67',
    'm13.41 10.59 5.66-5.66',
  ],
  [[12, 12, 2]],
);
export const Radio = icon(
  [
    'M4.9 19.1C1 15.2 1 8.8 4.9 4.9',
    'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5',
    'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5',
    'M19.1 4.9C23 8.8 23 15.1 19.1 19',
  ],
  [[12, 12, 2]],
);
export const RefreshCw = icon([
  'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
  'M21 3v5h-5',
  'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
  'M8 16H3v5',
]);
export const RotateCcw = icon([
  'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
  'M3 3v5h5',
]);
export const Search = icon(['m21 21-4.34-4.34'], [[11, 11, 8]]);
export const SkipBack = icon(['M19 20L9 12L19 4Z', 'M5 19V5']);
export const SkipForward = icon(['M5 4L15 12L5 20Z', 'M19 5V19']);
export const Snowflake = icon([
  'm10 20-1.25-2.5L6 18',
  'M10 4 8.75 6.5 6 6',
  'm14 20 1.25-2.5L18 18',
  'm14 4 1.25 2.5L18 6',
  'm17 21-3-6h-4',
  'm17 3-3 6 1.5 3',
  'M2 12h6.5L10 9',
  'm20 10-1.5 2 1.5 2',
  'M22 12h-6.5L14 15',
  'm4 10 1.5 2L4 14',
  'm7 21 3-6-1.5-3',
  'm7 3 3 6h4',
]);
export const Sparkles = icon([
  'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  'M20 3v4',
  'M22 5h-4',
  'M4 17v2',
  'M5 18H3',
]);
export const Sun = icon(
  [
    'M12 2v2',
    'M12 20v2',
    'm4.93 4.93 1.41 1.41',
    'm17.66 17.66 1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'm6.34 17.66-1.41 1.41',
    'm19.07 4.93-1.41 1.41',
  ],
  [[12, 12, 4]],
);
export const Sunrise = icon([
  'M12 2v8',
  'm4.93 10.93 1.41 1.41',
  'M2 18h2',
  'M20 18h2',
  'm19.07 10.93-1.41 1.41',
  'M22 22H2',
  'm8 6 4-4 4 4',
  'M16 18a4 4 0 0 0-8 0',
]);
export const Sunset = icon([
  'M12 10V2',
  'm4.93 10.93 1.41 1.41',
  'M2 18h2',
  'M20 18h2',
  'm19.07 10.93-1.41 1.41',
  'M22 22H2',
  'm16 6-4 4-4-4',
  'M16 18a4 4 0 0 0-8 0',
]);
export const Wind = icon([
  'M12.8 19.6A2 2 0 1 0 14 16H2',
  'M17.5 8a2.5 2.5 0 1 1 2 4H2',
  'M9.8 4.4A2 2 0 1 1 11 8H2',
]);
export const X = icon(['M18 6 6 18', 'm6 6 12 12']);
