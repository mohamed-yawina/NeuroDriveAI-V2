import phase4Url from '../../results/phase4-generation-statistics.csv?url';
import phase8BUrl from '../../results/phase8-b/generation-statistics.csv?url';
import phase8CUrl from '../../results/phase8-c-recovered-resume-20261102-2231/generation-statistics-a-b-c.csv?url';

const SOURCES = Object.freeze({ A: phase4Url, B: phase8BUrl, C: phase8CUrl });

export function parseCsvRecords(text) {
  const records = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((value) => value !== '')) records.push(row);
      row = [];
    } else cell += character;
  }
  if (cell !== '' || row.length) { row.push(cell); records.push(row); }
  const [headers, ...values] = records;
  if (!headers?.length) throw new TypeError('Fitness CSV is empty.');
  return values.map((valuesRow) => Object.fromEntries(headers.map((key, index) => [key.replace(/^\uFEFF/, ''), valuesRow[index] ?? ''])));
}

export async function loadHistoricalFitness(configuration, { fetchImpl = fetch, seed = 'all' } = {}) {
  const url = SOURCES[configuration];
  if (!url) throw new TypeError('Choose historical configuration A, B, or C.');
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Could not load historical fitness CSV for ${configuration} (${response.status}).`);
  const records = parseCsvRecords(await response.text()).filter((row) => !row.configuration || row.configuration === configuration);
  const seeds = [...new Set(records.map((row) => row.seed).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
  const chosen = seed === 'all' ? records : records.filter((row) => row.seed === String(seed));
  const groups = new Map();
  for (const row of chosen) {
    const generation = Number(row.generation);
    if (!Number.isInteger(generation)) continue;
    const key = `${generation}`;
    const entry = groups.get(key) ?? { generation, best: [], mean: [], worst: [], seeds: new Set() };
    const best = Number(row.best_candidate_fitness ?? row.best_reward_generation);
    const mean = Number(row.mean_circuit_performance ?? row.mean_reward);
    const worst = Number(row.mean_worst_circuit_performance);
    if (Number.isFinite(best)) entry.best.push(best);
    if (Number.isFinite(mean)) entry.mean.push(mean);
    if (Number.isFinite(worst)) entry.worst.push(worst);
    entry.seeds.add(row.seed);
    groups.set(key, entry);
  }
  const curve = [...groups.values()].sort((a, b) => a.generation - b.generation).map((entry) => ({
    generation: entry.generation,
    bestFitness: average(entry.best),
    meanFitness: average(entry.mean),
    meanWorstPerformance: average(entry.worst),
    seeds: [...entry.seeds].sort((a, b) => Number(a) - Number(b)),
  }));
  return {
    configuration,
    source: url,
    metricLabels: configuration === 'A'
      ? { best: 'meilleur score de génération', mean: 'récompense moyenne' }
      : { best: 'fitness du meilleur candidat', mean: 'performance moyenne sur circuits' },
    seedSelection: seed,
    availableSeeds: seeds,
    curve,
  };
}

const average = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
