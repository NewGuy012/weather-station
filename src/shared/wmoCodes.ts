export type WeatherCategory =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing-rain'
  | 'snow'
  | 'thunderstorm';

export interface WmoInfo {
  code: number;
  label: string;
  shortLabel: string;
  category: WeatherCategory;
}

const WMO_TABLE: Record<number, Omit<WmoInfo, 'code'>> = {
  0: { label: 'Clear Sky', shortLabel: 'Clear', category: 'clear' },
  1: { label: 'Mainly Clear', shortLabel: 'Mostly Clear', category: 'clear' },
  2: { label: 'Partly Cloudy', shortLabel: 'Partly Cloudy', category: 'partly-cloudy' },
  3: { label: 'Overcast', shortLabel: 'Overcast', category: 'cloudy' },
  45: { label: 'Fog', shortLabel: 'Fog', category: 'fog' },
  48: { label: 'Depositing Rime Fog', shortLabel: 'Rime Fog', category: 'fog' },
  51: { label: 'Light Drizzle', shortLabel: 'Lt Drizzle', category: 'drizzle' },
  53: { label: 'Moderate Drizzle', shortLabel: 'Drizzle', category: 'drizzle' },
  55: { label: 'Dense Drizzle', shortLabel: 'Hvy Drizzle', category: 'drizzle' },
  56: { label: 'Light Freezing Drizzle', shortLabel: 'Frz Drizzle', category: 'freezing-rain' },
  57: { label: 'Dense Freezing Drizzle', shortLabel: 'Frz Drizzle', category: 'freezing-rain' },
  61: { label: 'Slight Rain', shortLabel: 'Light Rain', category: 'rain' },
  63: { label: 'Moderate Rain', shortLabel: 'Rain', category: 'rain' },
  65: { label: 'Heavy Rain', shortLabel: 'Heavy Rain', category: 'rain' },
  66: { label: 'Light Freezing Rain', shortLabel: 'Frz Rain', category: 'freezing-rain' },
  67: { label: 'Heavy Freezing Rain', shortLabel: 'Frz Rain', category: 'freezing-rain' },
  71: { label: 'Slight Snowfall', shortLabel: 'Light Snow', category: 'snow' },
  73: { label: 'Moderate Snowfall', shortLabel: 'Snow', category: 'snow' },
  75: { label: 'Heavy Snowfall', shortLabel: 'Heavy Snow', category: 'snow' },
  77: { label: 'Snow Grains', shortLabel: 'Snow Grains', category: 'snow' },
  80: { label: 'Slight Rain Showers', shortLabel: 'Showers', category: 'rain' },
  81: { label: 'Moderate Rain Showers', shortLabel: 'Showers', category: 'rain' },
  82: { label: 'Violent Rain Showers', shortLabel: 'Heavy Showers', category: 'rain' },
  85: { label: 'Slight Snow Showers', shortLabel: 'Snow Showers', category: 'snow' },
  86: { label: 'Heavy Snow Showers', shortLabel: 'Hvy Snow Shwr', category: 'snow' },
  95: { label: 'Thunderstorm', shortLabel: 'T-Storm', category: 'thunderstorm' },
  96: { label: 'Thunderstorm with Slight Hail', shortLabel: 'T-Storm/Hail', category: 'thunderstorm' },
  99: { label: 'Thunderstorm with Heavy Hail', shortLabel: 'Severe Storm', category: 'thunderstorm' },
};

export function getWmoInfo(code: number | null | undefined): WmoInfo {
  const safeCode = typeof code === 'number' && Number.isFinite(code) ? Math.round(code) : 0;
  const match = WMO_TABLE[safeCode];
  if (match) {
    return { code: safeCode, ...match };
  }
  return { code: safeCode, label: 'Partly Cloudy', shortLabel: 'Cloudy', category: 'partly-cloudy' };
}
