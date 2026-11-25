import type {
  StateDetailResponse,
  TempUnit,
  WeatherDatasetResponse,
} from '../../shared/types';
import { degToCompass, formatPrecip, formatTemp, formatWind } from '../../shared/units';
import { getWmoInfo } from '../../shared/wmoCodes';
import { resolveStateSlice } from './MapCanvas';

interface PrintSheetProps {
  scope: 'national' | 'state';
  dataset: WeatherDatasetResponse | null;
  detail: StateDetailResponse | null;
  unit: TempUnit;
  timelineIndex: number;
  useTimeline: boolean;
}

export function PrintSheet({
  scope,
  dataset,
  detail,
  unit,
  timelineIndex,
  useTimeline,
}: PrintSheetProps) {
  if (!dataset) return null;

  const activeTime = useTimeline
    ? dataset.timelineHours[timelineIndex] ?? dataset.fetchedAt
    : dataset.fetchedAt;

  const showState = scope === 'state' && detail !== null;
  const sortedStates = Object.values(dataset.states).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div className="print-only bg-white p-2 text-slate-900">
      {/* Report Header */}
      <div className="flex items-end justify-between border-b-2 border-slate-900 pb-3">
        <div>
          <div className="text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
            US Weather Station • Meteorological Briefing
          </div>
          <h1 className="mt-0.5 text-2xl font-bold text-slate-900">
            {showState
              ? `${detail.name} (${detail.code}) — ${detail.city}`
              : 'United States 50-State Weather Report'}
          </h1>
        </div>
        <div className="text-right text-xs text-slate-600 tabular-nums">
          <div className="font-semibold">
            {dataset.mode === 'historical' ? 'Historical Archive' : 'Live Observations'}
          </div>
          <div>
            Window: {dataset.startDate} → {dataset.endDate}
          </div>
          <div>Snapshot: {activeTime}</div>
        </div>
      </div>

      {showState ? (
        <div className="mt-4 space-y-4">
          {/* State Summary Card */}
          <div className="print-card grid grid-cols-4 gap-3 rounded-lg border border-slate-300 p-3">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Temperature</div>
              <div className="text-2xl font-bold tabular-nums">
                {formatTemp(detail.current.temperatureF, unit, true)}
              </div>
              <div className="text-xs text-slate-600">
                Feels {formatTemp(detail.current.apparentTemperatureF, unit)} •{' '}
                {getWmoInfo(detail.current.weatherCode).label}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">High / Low</div>
              <div className="text-lg font-semibold tabular-nums">
                {formatTemp(detail.current.tempHighF, unit)} /{' '}
                {formatTemp(detail.current.tempLowF, unit)}
              </div>
              <div className="text-xs text-slate-600">Elev {detail.elevationM}m</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Wind & Precip</div>
              <div className="text-sm font-semibold tabular-nums">
                {formatWind(detail.current.windSpeedMph, unit)}{' '}
                {degToCompass(detail.current.windDirectionDeg)}
              </div>
              <div className="text-xs text-slate-600">
                Precip {formatPrecip(detail.current.precipitationMm, unit)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Humidity & AQI</div>
              <div className="text-sm font-semibold tabular-nums">
                {Math.round(detail.current.humidity)}% RH
              </div>
              <div className="text-xs text-slate-600">
                US AQI: {detail.current.usAqi ?? 'N/A'} • UV: {detail.current.uvIndex ?? 'N/A'}
              </div>
            </div>
          </div>

          {/* NWS Alerts */}
          {detail.alerts.length > 0 && (
            <div className="print-card rounded-lg border border-rose-400 bg-rose-50 p-3">
              <div className="text-xs font-bold text-rose-800 uppercase">
                Active NWS Alerts ({detail.alerts.length})
              </div>
              {detail.alerts.map((al) => (
                <div key={al.id} className="mt-1.5 text-xs">
                  <span className="font-semibold">{al.event}</span> — {al.areaDesc}
                  <p className="mt-0.5 text-[11px] text-slate-700">{al.headline}</p>
                </div>
              ))}
            </div>
          )}

          {/* Daily Summary */}
          <div>
            <h2 className="mb-1.5 text-xs font-bold tracking-wider text-slate-700 uppercase">
              Daily Summary
            </h2>
            <table className="text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-[10px] text-slate-500 uppercase">
                  <th className="py-1">Date</th>
                  <th className="py-1">Condition</th>
                  <th className="py-1">Low</th>
                  <th className="py-1">High</th>
                  <th className="py-1">Precip</th>
                  <th className="py-1">Max Wind</th>
                </tr>
              </thead>
              <tbody>
                {detail.daily.map((d) => (
                  <tr key={d.date} className="border-b border-slate-200">
                    <td className="py-1 font-medium">{d.date}</td>
                    <td className="py-1">{getWmoInfo(d.weatherCode).label}</td>
                    <td className="py-1">{formatTemp(d.tempMinF, unit, true)}</td>
                    <td className="py-1 font-semibold">{formatTemp(d.tempMaxF, unit, true)}</td>
                    <td className="py-1">{formatPrecip(d.precipitationSumMm, unit)}</td>
                    <td className="py-1">{formatWind(d.windSpeedMaxMph, unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hourly Sample Table (first 24h) */}
          <div>
            <h2 className="mb-1.5 text-xs font-bold tracking-wider text-slate-700 uppercase">
              Hourly Observations (24h Sample)
            </h2>
            <table className="text-left text-[11px] tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-[10px] text-slate-500 uppercase">
                  <th className="py-1">Time</th>
                  <th className="py-1">Temp</th>
                  <th className="py-1">Feels</th>
                  <th className="py-1">Condition</th>
                  <th className="py-1">Wind</th>
                  <th className="py-1">RH</th>
                  <th className="py-1">Precip</th>
                </tr>
              </thead>
              <tbody>
                {detail.hourly.slice(0, 24).map((h) => (
                  <tr key={h.time} className="border-b border-slate-200">
                    <td className="py-0.5">{h.time.replace('T', ' ')}</td>
                    <td className="py-0.5 font-semibold">{formatTemp(h.temperatureF, unit, true)}</td>
                    <td className="py-0.5">{formatTemp(h.apparentTemperatureF, unit)}</td>
                    <td className="py-0.5">{getWmoInfo(h.weatherCode).shortLabel}</td>
                    <td className="py-0.5">
                      {formatWind(h.windSpeedMph, unit)} {degToCompass(h.windDirectionDeg)}
                    </td>
                    <td className="py-0.5">{Math.round(h.humidity)}%</td>
                    <td className="py-0.5">{formatPrecip(h.precipitationMm, unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* National 50-State Table */
        <div className="mt-4">
          <table className="text-left text-[10.5px] tabular-nums">
            <thead>
              <tr className="border-b-2 border-slate-400 text-[9.5px] font-bold text-slate-600 uppercase">
                <th className="py-1">State</th>
                <th className="py-1">City</th>
                <th className="py-1">Temp</th>
                <th className="py-1">Hi / Lo</th>
                <th className="py-1">Condition</th>
                <th className="py-1">Wind</th>
                <th className="py-1">RH</th>
                <th className="py-1">Precip</th>
                <th className="py-1">AQI</th>
              </tr>
            </thead>
            <tbody>
              {sortedStates.map((snap) => {
                const s = resolveStateSlice(snap, timelineIndex, useTimeline);
                return (
                  <tr key={snap.code} className="border-b border-slate-200">
                    <td className="py-1 font-semibold">
                      {snap.name} ({snap.code})
                    </td>
                    <td className="py-1 text-slate-600">{snap.city}</td>
                    <td className="py-1 font-bold">{formatTemp(s.temperatureF, unit, true)}</td>
                    <td className="py-1">
                      {formatTemp(snap.current.tempHighF, unit)} /{' '}
                      {formatTemp(snap.current.tempLowF, unit)}
                    </td>
                    <td className="py-1">{getWmoInfo(s.weatherCode).shortLabel}</td>
                    <td className="py-1">
                      {formatWind(s.windSpeedMph, unit)} {degToCompass(s.windDirectionDeg)}
                    </td>
                    <td className="py-1">{Math.round(s.humidity)}%</td>
                    <td className="py-1">{formatPrecip(s.precipitationMm, unit)}</td>
                    <td className="py-1">{snap.current.usAqi ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 border-t border-slate-300 pt-2 text-[9px] text-slate-500">
        Data sources: Open-Meteo (NOAA GFS/HRRR, ERA5 Reanalysis, Air Quality) & NOAA National
        Weather Service (api.weather.gov). Generated by US Weather Station.
      </div>
    </div>
  );
}
