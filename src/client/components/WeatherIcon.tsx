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
import { getWmoInfo } from '../../shared/wmoCodes';

interface WeatherIconProps {
  code: number | null | undefined;
  size?: number;
  className?: string;
}

export function WeatherIcon({ code, size = 16, className = '' }: WeatherIconProps) {
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
