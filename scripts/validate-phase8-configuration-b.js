import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { RobustnessEvaluator } from '../src/ai/training/RobustnessEvaluator.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';

const root = 'results/phase8-b';
const historicalPaths = [
  'results/phase7-multitrack-training.json',
  'results/phase7-multitrack-generation-statistics.csv',
  'results/phase7-multitrack-validation.json',
  'results/phase7-multitrack-validation.csv',
  'results/phase7-multitrack-test.json',
  'results/phase7-multitrack-test.csv',
];
const hashesBefore = Object.fromEntries(historicalPaths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
const trainingB = JSON.parse(readFileSync(`${root}/training.json`, 'utf8'));
if (trainingB.status !== 'training-complete' || trainingB.runs.length !== 3 || trainingB.runs.some((run) => run.generationsCompleted !== 100)) {
  throw new Error('Configuration B must finish all 100 generations for all three seeds before validation.');
}
const trainingA = JSON.parse(readFileSync('results/phase7-multitrack-training.json', 'utf8'));
const models = [
  ...trainingA.runs.map((run) => ({ seed: run.seed, evaluationId: run.seed, configuration: 'A', network: NeuralNetwork.fromJSON(run.bestNetwork) })),
  ...trainingB.runs.map((run) => ({ seed: run.seed + 10000, evaluationId: run.seed + 10000, originalSeed: run.seed, configuration: 'B', network: NeuralNetwork.fromJSON(run.bestNetwork) })),
];
const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 731001, maxEpisodeTime: 60 });
const tracks = createGeneralizationTracks();
console.log('Starting independent paired validation: 6 frozen networks × 3 circuits × 30 scenarios, plus shared Steering baselines.');
const validation = evaluator.run({ tracks, networks: models });
if (validation.circuits.some((circuit) => circuit.neuralNetworks.some((entry) => !entry.networkWeightsUnchanged))) {
  throw new Error('A frozen model changed during phase 8 validation.');
}

function stats(values) {
  if (!values.length) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = values.length < 2 ? null : Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
  return { n: values.length, mean, sd, min: Math.min(...values), max: Math.max(...values) };
}
const trainingRuns = ['A', 'B'].flatMap((configuration) => {
  const source = configuration === 'A' ? trainingA : trainingB;
  return source.runs.map((run) => {
    const final = run.history.at(-1);
    return {
      configuration,
      seed: run.seed,
      generations: run.generationsCompleted,
      candidateEvaluations: run.candidateEvaluations,
      physicalEpisodeEvaluations: run.physicalEpisodeEvaluations,
      wallSeconds: run.elapsedWallSeconds ?? null,
      bestFitness: run.bestFitness,
      lastGenerationMeanFitness: final?.meanReward ?? null,
      lastGenerationBestFitness: final?.bestReward ?? null,
      peakGeneration: run.history.reduce((best, entry) => entry.globalBestReward > best.fitness
        ? { generation: entry.generation, fitness: entry.globalBestReward }
        : best, { generation: null, fitness: -Infinity }),
      lastGenerationSuccessRate: final?.meanCandidateSuccessRate ?? null,
      lastGenerationMeanOffTrackEvents: final?.meanOffTrackEventsPerCircuit ?? null,
    };
  });
});

const byCircuit = validation.circuits.map((circuit) => ({
  circuit: circuit.track.id,
  steering: circuit.steering,
  configurations: Object.fromEntries(['A', 'B'].map((configuration) => {
    const entries = circuit.neuralNetworks.filter((entry) => models.find((model) => model.evaluationId === entry.trainingSeed)?.configuration === configuration);
    const perSeed = entries.map((entry) => ({ seed: models.find((model) => model.evaluationId === entry.trainingSeed).originalSeed ?? entry.trainingSeed, ...entry.neural }));
    return [configuration, {
      seeds: perSeed,
      acrossSeed: {
        completionRate: stats(perSeed.map((entry) => entry.completion.rate)),
        meanProgressMeters: stats(perSeed.map((entry) => entry.meanSignedProgressMeters.mean)),
        meanSuccessfulLapTimeSeconds: stats(perSeed.map((entry) => entry.successfulLapTimeSeconds.mean).filter(Number.isFinite)),
        meanOffTrackEvents: stats(perSeed.map((entry) => entry.offTrackEvents.mean)),
        meanOffTrackDurationSeconds: stats(perSeed.map((entry) => entry.offTrackDurationSeconds.mean)),
        meanReward: stats(perSeed.map((entry) => entry.reward.mean)),
      },
    }];
  })),
}));

const comparison = {
  protocol: {
    validationScenarioSeed: 731001,
    scenariosPerCircuit: 30,
    circuitCount: tracks.length,
    pairedScenariosAcrossControllers: true,
    maxEpisodeTimeSeconds: 60,
    fixedDeltaTime: 1 / 30,
    trainingNetworkWeightsFrozen: true,
    finalTestUsedForSelection: false,
    confidenceInterpretation: 'Scenario-level spread is reported per trained seed. There are three networks per configuration, and the same seeds are paired across A and B. The 30 scenarios on a circuit are a fixed generated sample; results do not establish population-wide generalization.',
  },
  trainingBySeed: trainingRuns,
  trainingAcrossSeeds: Object.fromEntries(['A', 'B'].map((configuration) => {
    const runs = trainingRuns.filter((run) => run.configuration === configuration);
    return [configuration, {
      bestFitness: stats(runs.map((run) => run.bestFitness)),
      lastGenerationMeanFitness: stats(runs.map((run) => run.lastGenerationMeanFitness)),
      elapsedWallSeconds: stats(runs.map((run) => run.wallSeconds).filter(Number.isFinite)),
      physicalEpisodeEvaluations: stats(runs.map((run) => run.physicalEpisodeEvaluations)),
    }];
  })),
  validationByCircuit: byCircuit,
  historicalArtifactsUnchanged: false,
};

mkdirSync(root, { recursive: true });
writeFileSync(`${root}/validation.json`, JSON.stringify(validation, null, 2));
const rows = [['configuration','seed','circuit','scenario_id','initial_speed_mps','heading_error_degrees','reason','completed_laps','signed_progress_m','distance_travelled_m','lap_time_s','off_track_events','off_track_duration_s','blocked_time_s','reward','episode_duration_s']];
for (const circuit of validation.circuits) {
  const scenarioById = new Map(circuit.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  for (const episode of circuit.steeringEpisodes) {
    const scenario = scenarioById.get(episode.scenarioId);
    rows.push(['Steering','',circuit.track.id,episode.scenarioId,scenario.initialSpeedMetersPerSecond,scenario.headingErrorRadians * 180 / Math.PI,episode.reason,episode.completedLaps,episode.signedProgressMeters,episode.distanceTravelledMeters,episode.lapTimeSeconds,episode.offTrackEvents,episode.offTrackDurationSeconds,episode.blockedTimeSeconds,episode.reward,episode.episodeDurationSeconds]);
  }
  for (const entry of circuit.neuralNetworks) {
    const model = models.find((candidate) => candidate.evaluationId === entry.trainingSeed);
    const configuration = model.configuration;
    for (const episode of entry.neuralEpisodes) {
      const scenario = scenarioById.get(episode.scenarioId);
      rows.push([configuration,model.originalSeed ?? model.seed,circuit.track.id,episode.scenarioId,scenario.initialSpeedMetersPerSecond,scenario.headingErrorRadians * 180 / Math.PI,episode.reason,episode.completedLaps,episode.signedProgressMeters,episode.distanceTravelledMeters,episode.lapTimeSeconds,episode.offTrackEvents,episode.offTrackDurationSeconds,episode.blockedTimeSeconds,episode.reward,episode.episodeDurationSeconds]);
    }
  }
}
const cell = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
writeFileSync(`${root}/validation.csv`, `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`);
writeFileSync(`${root}/comparison-summary.json`, JSON.stringify(comparison, null, 2));
const generationRuns = [
  ...trainingA.runs.map((run) => ({ configuration: 'A', ...run })),
  ...trainingB.runs.map((run) => ({ configuration: 'B', ...run })),
];
writeFileSync(`${root}/generation-statistics.json`, JSON.stringify({ configurations: {
  A: trainingA.runs.map(({ seed, history }) => ({ seed, history })),
  B: trainingB.runs.map(({ seed, history }) => ({ seed, history })),
} }, null, 2));
const csvSections = generationRuns.map(({ configuration, seed, history }) => {
  const lines = trainingHistoryToCsv([{ seed, history }]).replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  return { configuration, header: lines[0], rows: lines.slice(1) };
});
writeFileSync(`${root}/generation-statistics.csv`, [
  `configuration,${csvSections[0].header}`,
  ...csvSections.flatMap(({ configuration, rows }) => rows.map((row) => `${configuration},${row}`)),
].join('\r\n'));
const circuitRows = [['configuration','seed','generation','circuit','mean_performance','mean_success_rate','mean_progress_ratio','mean_off_track_events','mean_normalized_reward_per_100m']];
for (const { configuration, seed, history } of generationRuns) for (const generation of history) {
  for (const metric of generation.meanCircuitMetrics ?? []) circuitRows.push([
    configuration, seed, generation.generation, metric.trackId, metric.meanPerformance,
    metric.meanSuccessRate, metric.meanProgressRatio, metric.meanOffTrackEventsPerCircuit,
    metric.meanNormalizedRewardPer100Meters,
  ]);
}
writeFileSync(`${root}/generation-circuit-statistics.csv`, `\uFEFF${circuitRows.map((row) => row.map(cell).join(',')).join('\r\n')}`);

const hashesAfter = Object.fromEntries(historicalPaths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
comparison.historicalArtifactsUnchanged = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);
comparison.historicalArtifactSha256 = hashesAfter;
if (!comparison.historicalArtifactsUnchanged) throw new Error('A historical artifact changed during phase 8 B validation.');
writeFileSync(`${root}/comparison-summary.json`, JSON.stringify(comparison, null, 2));

for (const circuit of byCircuit) {
  const format = (group) => `${(100 * group.completionRate.mean).toFixed(1)}% ± ${(100 * group.completionRate.sd).toFixed(1)} pp`;
  console.log(`${circuit.circuit}: Steering ${(100 * circuit.steering.completion.rate).toFixed(1)}%; A ${format(circuit.configurations.A.acrossSeed)}; B ${format(circuit.configurations.B.acrossSeed)}; B progress ${circuit.configurations.B.acrossSeed.meanProgressMeters.mean.toFixed(1)} m; off-track ${circuit.configurations.B.acrossSeed.meanOffTrackEvents.mean.toFixed(2)} events/episode.`);
}
console.log(`Saved validation results; phase 7 artifact hashes unchanged=${comparison.historicalArtifactsUnchanged}.`);
