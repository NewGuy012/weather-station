import type { HistoricalPreset } from './types';

export const HISTORICAL_PRESETS: HistoricalPreset[] = [
  {
    id: 'recent-nov-2026',
    label: 'Recent 5-Day US Archive',
    subtitle: 'Nov 15 – Nov 19, 2026 • Full 50-state baseline',
    startDate: '2026-11-15',
    endDate: '2026-11-19',
    defaultFrameIndex: 30,
  },
  {
    id: 'jan-2024-arctic',
    label: 'Jan 2024 Arctic Outbreak',
    subtitle: 'Jan 13 – Jan 16, 2024 • Coast-to-coast polar plunge',
    startDate: '2024-01-13',
    endDate: '2024-01-16',
    defaultFrameIndex: 14,
  },
  {
    id: 'jul-2023-heat',
    label: 'July 2023 Heat Dome',
    subtitle: 'Jul 17 – Jul 20, 2023 • Historic Southwest & Plains heat',
    startDate: '2023-07-17',
    endDate: '2023-07-20',
    defaultFrameIndex: 15,
  },
  {
    id: 'feb-2021-freeze',
    label: 'Feb 2021 Deep Freeze',
    subtitle: 'Feb 14 – Feb 17, 2021 • Historic Texas & Central US freeze',
    startDate: '2021-02-14',
    endDate: '2021-02-17',
    defaultFrameIndex: 14,
  },
  {
    id: 'oct-2012-sandy',
    label: 'Oct 2012 Superstorm Sandy',
    subtitle: 'Oct 28 – Oct 30, 2012 • Historic East Coast landfall',
    startDate: '2012-10-28',
    endDate: '2012-10-30',
    defaultFrameIndex: 15,
  },
];

export const DEFAULT_HISTORICAL_PRESET = HISTORICAL_PRESETS[0]!;
