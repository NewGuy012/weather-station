import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Snowflake,
  Sun,
} from 'lucide-react';
import { type WeatherPhenomenon } from '../../shared/weatherPhenomena';
import { type WeatherCategory, getWmoInfo } from '../../shared/wmoCodes';

interface WeatherIconProps {
  code: number | null | undefined;
  phenomenon?: WeatherPhenomenon;
  size?: number;
  className?: string;
  animated?: boolean;
}

const CLOUD_PATH =
  'M7.5 15.5h9.2a3.3 3.3 0 0 0 .4-6.57A4.6 4.6 0 0 0 8.2 7.5a3.7 3.7 0 0 0-.7 8Z';

function categoryToPhenomenon(code: number | null | undefined, category: WeatherCategory): WeatherPhenomenon {
  if (code === 96 || code === 99) return 'hail';
  switch (category) {
    case 'clear':
      return 'clear';
    case 'partly-cloudy':
      return 'partly-cloudy';
    case 'cloudy':
      return 'cloudy';
    case 'fog':
      return 'fog';
    case 'drizzle':
      return 'drizzle';
    case 'rain':
      return 'rain';
    case 'freezing-rain':
      return 'freezing-rain';
    case 'snow':
      return 'snow';
    case 'thunderstorm':
      return 'thunderstorm';
  }
}

export function resolveIconPhenomenon(
  code: number | null | undefined,
  phenomenon?: WeatherPhenomenon,
): WeatherPhenomenon {
  if (phenomenon) return phenomenon;
  return categoryToPhenomenon(code, getWmoInfo(code).category);
}

interface WeatherGlyphProps {
  phenomenon: WeatherPhenomenon;
  animated?: boolean;
}

/**
 * Vector weather artwork in a 24x24 coordinate box. Shared by WeatherIcon and MapCanvas badges.
 */
export function WeatherGlyph({ phenomenon, animated = true }: WeatherGlyphProps) {
  const anim = (cls: string) => (animated ? cls : undefined);

  switch (phenomenon) {
    case 'clear':
    case 'uv':
      return (
        <g>
          <g className={anim('ws-anim-sun')}>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                x1="12"
                y1="2.2"
                x2="12"
                y2="4.4"
                stroke="#f59e0b"
                strokeWidth="1.9"
                strokeLinecap="round"
                transform={`rotate(${deg} 12 12)`}
              />
            ))}
          </g>
          <circle cx="12" cy="12" r="4.6" fill="#fbbf24" stroke="#f59e0b" strokeWidth="1.2" />
        </g>
      );

    case 'partly-cloudy':
      return (
        <g>
          <g className={anim('ws-anim-sun')} style={{ transformOrigin: '16.5px 7.5px' }}>
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <line
                key={deg}
                x1="16.5"
                y1="3.4"
                x2="16.5"
                y2="4.7"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeLinecap="round"
                transform={`rotate(${deg} 16.5 7.5)`}
              />
            ))}
          </g>
          <circle cx="16.5" cy="7.5" r="2.7" fill="#fbbf24" />
          <g className={anim('ws-anim-cloud')} transform="translate(-0.8 2)">
            <path d={CLOUD_PATH} fill="#cbd5e1" stroke="#64748b" strokeWidth="1.35" strokeLinejoin="round" />
          </g>
        </g>
      );

    case 'cloudy':
      return (
        <g>
          <g transform="translate(2 -1.2) scale(0.84)" opacity="0.72">
            <path d={CLOUD_PATH} fill="#94a3b8" stroke="#64748b" strokeWidth="1.3" strokeLinejoin="round" />
          </g>
          <g className={anim('ws-anim-cloud')} transform="translate(-0.6 1.5)">
            <path d={CLOUD_PATH} fill="#cbd5e1" stroke="#64748b" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
        </g>
      );

    case 'fog':
    case 'aqi':
    case 'humidity': {
      const barColor =
        phenomenon === 'aqi' ? '#d97706' : phenomenon === 'humidity' ? '#0ea5e9' : '#94a3b8';
      return (
        <g>
          <g transform="translate(0 -2.2)">
            <path d={CLOUD_PATH} fill="#cbd5e1" stroke={barColor} strokeWidth="1.3" strokeLinejoin="round" />
          </g>
          <line
            x1="5.5"
            y1="17"
            x2="17.5"
            y2="17"
            stroke={barColor}
            strokeWidth="1.9"
            strokeLinecap="round"
            className={anim('ws-anim-fog')}
          />
          <line
            x1="7"
            y1="20.2"
            x2="19"
            y2="20.2"
            stroke={barColor}
            strokeWidth="1.9"
            strokeLinecap="round"
            className={anim('ws-anim-fog')}
            style={animated ? { animationDelay: '1.1s' } : undefined}
          />
        </g>
      );
    }

    case 'drizzle':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(0 -1.5)">
            <path d={CLOUD_PATH} fill="#cbd5e1" stroke="#64748b" strokeWidth="1.35" strokeLinejoin="round" />
          </g>
          {[8, 12, 16].map((x, idx) => (
            <line
              key={x}
              x1={x}
              y1="16.5"
              x2={x - 0.6}
              y2="18.5"
              stroke="#38bdf8"
              strokeWidth="1.6"
              strokeLinecap="round"
              className={anim('ws-anim-rain')}
              style={animated ? { animationDelay: `${idx * 0.32}s` } : undefined}
            />
          ))}
        </g>
      );

    case 'rain':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(0 -1.8)">
            <path d={CLOUD_PATH} fill="#94a3b8" stroke="#475569" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
          {[7.8, 12, 16.2].map((x, idx) => (
            <line
              key={x}
              x1={x}
              y1="15.8"
              x2={x - 1.1}
              y2="19.6"
              stroke="#2563eb"
              strokeWidth="1.75"
              strokeLinecap="round"
              className={anim('ws-anim-rain')}
              style={animated ? { animationDelay: `${idx * 0.28}s` } : undefined}
            />
          ))}
        </g>
      );

    case 'thunderstorm':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(0 -2)">
            <path d={CLOUD_PATH} fill="#475569" stroke="#312e81" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
          <polygon
            points="12.8,13.5 9.8,17.8 12.1,17.8 10.9,21.8 15.2,16.5 12.8,16.5"
            fill="#facc15"
            stroke="#f59e0b"
            strokeWidth="0.6"
            strokeLinejoin="round"
            className={anim('ws-anim-lightning')}
          />
          <line
            x1="7.5"
            y1="16"
            x2="6.6"
            y2="19"
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={anim('ws-anim-rain')}
          />
        </g>
      );

    case 'hail':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(0 -2)">
            <path d={CLOUD_PATH} fill="#0f766e" stroke="#134e4a" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
          <polygon
            points="13.2,13.4 10.8,16.8 12.6,16.8 11.6,19.8 14.8,15.8 12.9,15.8"
            fill="#fde047"
            className={anim('ws-anim-lightning')}
          />
          {[7.8, 16.4].map((x, idx) => (
            <circle
              key={x}
              cx={x}
              cy="17"
              r="1.45"
              fill="#e0f2fe"
              stroke="#0284c7"
              strokeWidth="0.85"
              className={anim('ws-anim-hail')}
              style={animated ? { animationDelay: `${idx * 0.45}s` } : undefined}
            />
          ))}
        </g>
      );

    case 'snow':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(0 -1.8)">
            <path d={CLOUD_PATH} fill="#e2e8f0" stroke="#64748b" strokeWidth="1.35" strokeLinejoin="round" />
          </g>
          {[8, 12, 16].map((x, idx) => (
            <g
              key={x}
              transform={`translate(${x} 17.6)`}
              className={anim('ws-anim-snow')}
              style={animated ? { animationDelay: `${idx * 0.55}s` } : undefined}
            >
              <line x1="-1.5" y1="0" x2="1.5" y2="0" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="0" y1="-1.5" x2="0" y2="1.5" stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          ))}
        </g>
      );

    case 'blizzard':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(-0.6 -2)">
            <path d={CLOUD_PATH} fill="#cbd5e1" stroke="#475569" strokeWidth="1.4" strokeLinejoin="round" />
          </g>
          {[15.5, 18.2, 20.4].map((y, idx) => (
            <line
              key={y}
              x1={6 + idx * 1.4}
              y1={y}
              x2={12 + idx * 1.4}
              y2={y + 1.2}
              stroke="#38bdf8"
              strokeWidth="1.6"
              strokeLinecap="round"
              className={anim('ws-anim-blizzard')}
              style={animated ? { animationDelay: `${idx * 0.24}s` } : undefined}
            />
          ))}
        </g>
      );

    case 'freezing-rain':
      return (
        <g>
          <g className={anim('ws-anim-cloud')} transform="translate(0 -1.8)">
            <path d={CLOUD_PATH} fill="#bae6fd" stroke="#0284c7" strokeWidth="1.35" strokeLinejoin="round" />
          </g>
          <line
            x1="8.4"
            y1="15.8"
            x2="7.2"
            y2="19.6"
            stroke="#06b6d4"
            strokeWidth="1.65"
            strokeLinecap="round"
            className={anim('ws-anim-rain')}
          />
          <polygon
            points="14.5,16 15.6,17.8 14.5,19.6 13.4,17.8"
            fill="#e0f2fe"
            stroke="#0284c7"
            strokeWidth="0.9"
            className={anim('ws-anim-glint')}
          />
        </g>
      );

    case 'cyclone':
      return (
        <g className={anim('ws-anim-vortex')}>
          <path
            d="M12 12c2.2-1.8 5.2-1.2 6.6 1.2 1.8 3-.2 7.2-4.8 7.8M12 12c-2.2 1.8-5.2 1.2-6.6-1.2-1.8-3 .2-7.2 4.8-7.8"
            fill="none"
            stroke="#0284c7"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="2.2" fill="#38bdf8" stroke="#0f172a" strokeWidth="0.8" />
        </g>
      );

    case 'heat':
      return (
        <g>
          <circle cx="12" cy="10" r="4.2" fill="#fb923c" stroke="#ea580c" strokeWidth="1.2" />
          {[7.5, 12, 16.5].map((x, idx) => (
            <path
              key={x}
              d={`M${x} 20.5 q-1.1-1.6 0-3.2`}
              fill="none"
              stroke="#ea580c"
              strokeWidth="1.5"
              strokeLinecap="round"
              className={anim('ws-anim-heat')}
              style={animated ? { animationDelay: `${idx * 0.35}s` } : undefined}
            />
          ))}
        </g>
      );

    case 'frost':
      return (
        <g>
          {[0, 60, 120].map((deg) => (
            <line
              key={deg}
              x1="12"
              y1="4.5"
              x2="12"
              y2="19.5"
              stroke="#38bdf8"
              strokeWidth="1.65"
              strokeLinecap="round"
              transform={`rotate(${deg} 12 12)`}
            />
          ))}
          <polygon
            points="18,4 18.8,5.8 20.6,6.6 18.8,7.4 18,9.2 17.2,7.4 15.4,6.6 17.2,5.8"
            fill="#7dd3fc"
            className={anim('ws-anim-glint')}
          />
        </g>
      );
  }
}

export function WeatherIcon({
  code,
  phenomenon,
  size = 16,
  className = '',
  animated = false,
}: WeatherIconProps) {
  if (animated) {
    const resolved = resolveIconPhenomenon(code, phenomenon);
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        className={`shrink-0 overflow-visible ${className}`}
      >
        <WeatherGlyph phenomenon={resolved} animated />
      </svg>
    );
  }

  const { category } = getWmoInfo(code);

  switch (category) {
    case 'clear':
      return <Sun size={size} className={`text-amber-500 dark:text-amber-400 ${className}`} />;
    case 'partly-cloudy':
      return <CloudSun size={size} className={`text-amber-500 dark:text-amber-300 ${className}`} />;
    case 'cloudy':
      return <Cloud size={size} className={`text-slate-500 dark:text-slate-400 ${className}`} />;
    case 'fog':
      return <CloudFog size={size} className={`text-slate-400 dark:text-slate-400 ${className}`} />;
    case 'drizzle':
      return <CloudDrizzle size={size} className={`text-sky-500 dark:text-sky-400 ${className}`} />;
    case 'rain':
      return <CloudRain size={size} className={`text-blue-500 dark:text-sky-400 ${className}`} />;
    case 'freezing-rain':
      return <CloudSnow size={size} className={`text-cyan-500 dark:text-cyan-300 ${className}`} />;
    case 'snow':
      return <Snowflake size={size} className={`text-sky-400 dark:text-sky-300 ${className}`} />;
    case 'thunderstorm':
      return (
        <CloudLightning
          size={size}
          className={`text-violet-500 dark:text-amber-300 ${className}`}
        />
      );
  }
}
