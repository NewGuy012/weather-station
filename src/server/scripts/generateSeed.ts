import { DEFAULT_HISTORICAL_PRESET } from '../../shared/presets';
import { fetchAllStatesHistorical } from '../providers/openMeteo';

const outPath = new URL('../data/seedHistorical.json', import.meta.url).pathname;

console.log(`Fetching 50-state historical seed for ${DEFAULT_HISTORICAL_PRESET.startDate}..${DEFAULT_HISTORICAL_PRESET.endDate}...`);
const dataset = await fetchAllStatesHistorical({
  startDate: DEFAULT_HISTORICAL_PRESET.startDate,
  endDate: DEFAULT_HISTORICAL_PRESET.endDate,
  presetId: DEFAULT_HISTORICAL_PRESET.id,
  presetLabel: DEFAULT_HISTORICAL_PRESET.label,
  defaultFrameIndex: DEFAULT_HISTORICAL_PRESET.defaultFrameIndex,
});

dataset.source = 'seed-archive';
dataset.cached = true;

await Bun.write(outPath, JSON.stringify(dataset));
const stat = Bun.file(outPath);
console.log(
  `Wrote ${Object.keys(dataset.states).length} states, ${dataset.timelineHours.length} timeline steps to ${outPath} (${(stat.size / 1024).toFixed(1)} KB)`,
);
