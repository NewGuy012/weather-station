import type { WeatherPhenomenon } from '../../shared/weatherPhenomena';

interface DrawerWeatherBackdropProps {
  phenomenon: WeatherPhenomenon;
}

const BACKDROP_TINTS: Record<WeatherPhenomenon, string> = {
  clear:
    'from-amber-50/90 via-sky-50/70 to-white/60 dark:from-amber-500/12 dark:via-sky-900/20 dark:to-slate-900/40',
  'partly-cloudy':
    'from-sky-50/90 via-amber-50/45 to-slate-50/70 dark:from-sky-900/25 dark:via-slate-800/40 dark:to-slate-900/40',
  cloudy:
    'from-slate-100/90 via-slate-100/60 to-white/60 dark:from-slate-800/70 dark:via-slate-800/40 dark:to-slate-900/40',
  fog: 'from-slate-200/75 via-slate-100/70 to-white/60 dark:from-slate-700/45 dark:via-slate-800/50 dark:to-slate-900/40',
  drizzle:
    'from-sky-100/75 via-slate-100/65 to-white/60 dark:from-sky-900/35 dark:via-slate-800/50 dark:to-slate-900/40',
  rain: 'from-blue-100/80 via-sky-100/60 to-slate-50/70 dark:from-blue-950/55 dark:via-sky-900/35 dark:to-slate-900/40',
  'freezing-rain':
    'from-cyan-100/80 via-sky-50/70 to-slate-50/60 dark:from-cyan-950/55 dark:via-sky-900/35 dark:to-slate-900/40',
  snow: 'from-sky-100/80 via-slate-50/80 to-white/70 dark:from-sky-950/45 dark:via-slate-800/50 dark:to-slate-900/40',
  blizzard:
    'from-slate-200/85 via-sky-100/75 to-white/70 dark:from-slate-700/60 dark:via-sky-950/45 dark:to-slate-900/50',
  thunderstorm:
    'from-indigo-100/85 via-slate-200/70 to-slate-100/60 dark:from-indigo-950/70 dark:via-slate-900/60 dark:to-slate-900/50',
  hail: 'from-teal-100/80 via-slate-200/70 to-slate-100/60 dark:from-teal-950/65 dark:via-slate-900/60 dark:to-slate-900/50',
  cyclone:
    'from-sky-200/75 via-indigo-100/65 to-slate-100/60 dark:from-sky-950/70 dark:via-indigo-950/55 dark:to-slate-900/50',
  heat: 'from-orange-100/85 via-amber-50/70 to-white/60 dark:from-orange-950/45 dark:via-amber-950/25 dark:to-slate-900/40',
  frost:
    'from-cyan-100/75 via-blue-50/70 to-white/70 dark:from-cyan-950/50 dark:via-blue-950/35 dark:to-slate-900/40',
  uv: 'from-yellow-100/80 via-orange-50/65 to-white/60 dark:from-amber-950/45 dark:via-orange-950/25 dark:to-slate-900/40',
  aqi: 'from-amber-100/75 via-stone-100/65 to-white/60 dark:from-amber-950/40 dark:via-stone-900/45 dark:to-slate-900/40',
  humidity:
    'from-teal-50/85 via-sky-50/70 to-white/60 dark:from-teal-950/35 dark:via-sky-950/30 dark:to-slate-900/40',
};

const RAIN_DROPS = [
  { x: 24, y: 8, delay: '0s' },
  { x: 58, y: 4, delay: '0.25s' },
  { x: 96, y: 10, delay: '0.52s' },
  { x: 138, y: 6, delay: '0.18s' },
  { x: 176, y: 12, delay: '0.44s' },
  { x: 214, y: 5, delay: '0.72s' },
  { x: 252, y: 10, delay: '0.33s' },
  { x: 292, y: 7, delay: '0.62s' },
];

const SNOW_FLAKES = [
  { x: 28, y: 14, delay: '0s', r: 2.2 },
  { x: 74, y: 20, delay: '0.6s', r: 1.8 },
  { x: 122, y: 12, delay: '1.1s', r: 2.4 },
  { x: 172, y: 18, delay: '0.3s', r: 1.7 },
  { x: 224, y: 10, delay: '0.9s', r: 2.3 },
  { x: 274, y: 19, delay: '1.4s', r: 1.9 },
];

/**
 * Lightweight ambient sky backdrop inside the StateDrawer hero readout card.
 */
export function DrawerWeatherBackdrop({ phenomenon }: DrawerWeatherBackdropProps) {
  const tintClass = BACKDROP_TINTS[phenomenon];
  const isStorm = phenomenon === 'thunderstorm' || phenomenon === 'hail';
  const isWet =
    phenomenon === 'rain' ||
    phenomenon === 'drizzle' ||
    phenomenon === 'freezing-rain' ||
    isStorm;
  const isWinter = phenomenon === 'snow' || phenomenon === 'blizzard';

  return (
    <div
      aria-hidden="true"
      data-phenomenon={phenomenon}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-br ${tintClass}`}
    >
      <svg
        viewBox="0 0 320 76"
        preserveAspectRatio="none"
        className="h-full w-full opacity-75 dark:opacity-85"
      >
        {isStorm && (
          <rect
            x="0"
            y="0"
            width="320"
            height="76"
            className="ws-anim-sheet-flash fill-amber-200/35 dark:fill-violet-400/25"
          />
        )}

        {isWet &&
          RAIN_DROPS.map((d) => (
            <line
              key={d.x}
              x1={d.x}
              y1={d.y}
              x2={d.x - 4}
              y2={d.y + (phenomenon === 'drizzle' ? 7 : 12)}
              strokeWidth={phenomenon === 'drizzle' ? 1.1 : 1.4}
              strokeLinecap="round"
              className={`ws-anim-rain ${
                phenomenon === 'freezing-rain'
                  ? 'stroke-cyan-500/45 dark:stroke-cyan-300/45'
                  : 'stroke-sky-600/35 dark:stroke-sky-300/40'
              }`}
              style={{ animationDelay: d.delay }}
            />
          ))}

        {phenomenon === 'hail' &&
          [44, 148, 244].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy="18"
              r="2.1"
              className="ws-anim-hail fill-cyan-50 stroke-cyan-500/70 dark:fill-cyan-100"
              strokeWidth="0.8"
              style={{ animationDelay: `${i * 0.36}s` }}
            />
          ))}

        {isWinter &&
          SNOW_FLAKES.map((f) => (
            <circle
              key={f.x}
              cx={f.x}
              cy={f.y}
              r={f.r}
              className={`${
                phenomenon === 'blizzard' ? 'ws-anim-blizzard' : 'ws-anim-snow'
              } fill-sky-600/30 dark:fill-white/45`}
              style={{ animationDelay: f.delay }}
            />
          ))}

        {(phenomenon === 'freezing-rain' || phenomenon === 'frost') &&
          [56, 162, 266].map((x, idx) => (
            <polygon
              key={x}
              points={`${x},16 ${x + 2.5},20 ${x},24 ${x - 2.5},20`}
              className="ws-anim-glint fill-cyan-500/45 dark:fill-cyan-200/55"
              style={{ animationDelay: `${idx * 0.5}s` }}
            />
          ))}

        {(phenomenon === 'fog' || phenomenon === 'aqi' || phenomenon === 'humidity') && (
          <g>
            <rect
              x="18"
              y="16"
              width="120"
              height="9"
              rx="4.5"
              className="ws-anim-fog fill-slate-400/20 dark:fill-slate-300/15"
            />
            <rect
              x="164"
              y="44"
              width="136"
              height="10"
              rx="5"
              className="ws-anim-fog fill-slate-400/20 dark:fill-slate-300/15"
              style={{ animationDelay: '1.2s' }}
            />
          </g>
        )}

        {phenomenon === 'cyclone' && (
          <g transform="translate(278 38)">
            <g className="ws-anim-vortex" opacity="0.35">
              <path
                d="M0 0c7-6 17-4 21 4 5 9-1 22-15 24M0 0c-7 6-17 4-21-4-5-9 1-22 15-24"
                fill="none"
                className="stroke-sky-600 dark:stroke-sky-300"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </g>
          </g>
        )}

        {(phenomenon === 'clear' || phenomenon === 'uv' || phenomenon === 'heat') && (
          <g transform="translate(284 18)">
            <circle
              cx="0"
              cy="0"
              r="26"
              className="fill-amber-300/25 dark:fill-amber-400/15"
            />
            <circle
              cx="0"
              cy="0"
              r="14"
              className="ws-anim-sun fill-amber-400/25 dark:fill-amber-300/20"
            />
          </g>
        )}

        {(phenomenon === 'cloudy' || phenomenon === 'partly-cloudy') && (
          <g className="ws-anim-cloud" opacity="0.35">
            <ellipse
              cx="260"
              cy="22"
              rx="34"
              ry="12"
              className="fill-slate-400/30 dark:fill-slate-400/20"
            />
            <circle cx="250" cy="14" r="12" className="fill-slate-400/25 dark:fill-slate-400/18" />
          </g>
        )}
      </svg>
    </div>
  );
}
