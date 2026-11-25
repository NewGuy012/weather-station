import { STATE_BY_CODE } from '../../shared/states';
import type { AlertsResponse, GeoJsonFeature, WeatherAlert } from '../../shared/types';

const NWS_ALERTS_URL = 'https://api.weather.gov/alerts/active?status=actual';
const USER_AGENT = 'USWeatherStation/1.0 (https://github.com/weather-station)';

interface NwsFeature {
  id?: string;
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties?: {
    id?: string;
    event?: string;
    severity?: string;
    urgency?: string;
    headline?: string | null;
    description?: string | null;
    instruction?: string | null;
    effective?: string;
    expires?: string;
    areaDesc?: string;
    geocode?: {
      UGC?: string[];
      SAME?: string[];
    };
  };
}

interface NwsResponse {
  features?: NwsFeature[];
}

function normalizeSeverity(sev: string | undefined): WeatherAlert['severity'] {
  switch (sev) {
    case 'Extreme':
    case 'Severe':
    case 'Moderate':
    case 'Minor':
      return sev;
    default:
      return 'Unknown';
  }
}

export function extractAlertStates(ugcList: string[] | undefined): string[] {
  if (!ugcList || ugcList.length === 0) return [];
  const found = new Set<string>();
  for (const ugc of ugcList) {
    const prefix = ugc.slice(0, 2).toUpperCase();
    if (STATE_BY_CODE[prefix]) {
      found.add(prefix);
    }
  }
  return Array.from(found);
}

export function parseNwsAlerts(raw: NwsResponse): AlertsResponse {
  const byState: Record<string, WeatherAlert[]> = {};
  const polygonFeatures: GeoJsonFeature[] = [];
  const seenAlertIds = new Set<string>();

  for (const feat of raw.features ?? []) {
    const props = feat.properties;
    if (!props || !props.event) continue;

    const states = extractAlertStates(props.geocode?.UGC);
    if (states.length === 0) continue;

    const id = props.id ?? feat.id ?? `${props.event}-${props.effective ?? ''}`;
    if (seenAlertIds.has(id)) continue;
    seenAlertIds.add(id);

    const alert: WeatherAlert = {
      id,
      event: props.event,
      severity: normalizeSeverity(props.severity),
      urgency: props.urgency ?? 'Unknown',
      headline: props.headline ?? props.event,
      description: props.description ?? '',
      instruction: props.instruction ?? null,
      effective: props.effective ?? '',
      expires: props.expires ?? '',
      areaDesc: props.areaDesc ?? '',
      states,
    };

    for (const st of states) {
      const list = byState[st] ?? [];
      list.push(alert);
      byState[st] = list;
    }

    if (feat.geometry) {
      polygonFeatures.push({
        type: 'Feature',
        geometry: feat.geometry,
        properties: {
          id,
          event: alert.event,
          severity: alert.severity,
          headline: alert.headline,
          states: alert.states.join(','),
        },
      });
    }
  }

  const severityRank: Record<WeatherAlert['severity'], number> = {
    Extreme: 0,
    Severe: 1,
    Moderate: 2,
    Minor: 3,
    Unknown: 4,
  };

  for (const code of Object.keys(byState)) {
    byState[code]!.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  }

  return {
    fetchedAt: new Date().toISOString(),
    cached: false,
    totalActive: seenAlertIds.size,
    byState,
    featuresGeoJson: {
      type: 'FeatureCollection',
      features: polygonFeatures,
    },
  };
}

export async function fetchActiveNwsAlerts(): Promise<AlertsResponse> {
  const res = await fetch(NWS_ALERTS_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`NWS API HTTP ${res.status}`);
  }
  const json = (await res.json()) as NwsResponse;
  return parseNwsAlerts(json);
}
