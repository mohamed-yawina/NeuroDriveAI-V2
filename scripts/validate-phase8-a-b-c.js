import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { RobustnessEvaluator } from '../src/ai/training/RobustnessEvaluator.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';

const root = process.argv.find((arg) => arg.startsWith('--c-dir='))?.slice('--c-dir='.length) ?? 'results/phase8-c';
const historicalPaths = [
  'results/phase7-multitrack-training.json',
  'results/phase7-multitrack-generation-statistics.csv',
  'results/phase7-multitrack-validation.json',
  'results/phase7-multitrack-validation.csv',
  'results/phase7-multitrack-test.json',
  'results/phase7-multitrack-test.csv',
  'results/phase8-b/training.json',
  'results/phase8-b/generation-statistics.csv',
  'results/phase8-b/generation-statistics.json',
  'results/phase8-b/generation-circuit-statistics.csv',
  'results/phase8-b/validation.json',
  'results/phase8-b/validation.csv',
  'results/phase8-b/comparison-summary.json',
  'results/phase8-b/held-out-final.json',
  'results/phase8-b/held-out-final.csv',
  'results/phase8-b/models/seed-2026.json',
  'results/phase8-b/models/seed-2027.json',
  'results/phase8-b/models/seed-2028.json',
];
const hashFiles = (paths) => Object.fromEntries(paths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
const hashesBefore = hashFiles(historicalPaths);
const A = JSON.parse(readFileSync('results/phase7-multitrack-training.json', 'utf8'));
const B = JSON.parse(readFileSync('results/phase8-b/training.json', 'utf8'));
const C = JSON.parse(readFileSync(`${root}/training.json`, 'utf8'));
if (B.status !== 'training-complete' || C.status !== 'training-complete') throw new Error('A/B/C training must be complete before independent validation.');
const runs = [
  ...A.runs.map((run) => ({ configuration: 'A', seed: run.seed, training: run, evaluationId: run.seed })),
  ...B.runs.map((run) => ({ configuration: 'B', seed: run.seed, training: run, evaluationId: run.seed + 10000 })),
  ...C.runs.map((run) => ({ configuration: 'C', seed: run.seed, training: run, evaluationId: run.seed + 20000 })),
];
const models = runs.map((run) => ({ seed: run.evaluationId, network: NeuralNetwork.fromJSON(run.training.bestNetwork) }));
const modelByEvaluationId = new Map(runs.map((run) => [run.evaluationId, run]));
const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 731001, maxEpisodeTime: 60 });
const tracks = createGeneralizationTracks();
console.log('A/B/C validation: 9 frozen networks × 3 circuits × 30 paired scenarios, plus shared Steering baselines.');
const validation = evaluator.run({ tracks, networks: models });
if (validation.circuits.some((circuit) => circuit.neuralNetworks.some((result) => !result.networkWeightsUnchanged))) throw new Error('A frozen model changed during validation.');

function stats(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const sd = finite.length < 2 ? null : Math.sqrt(finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (finite.length - 1));
  return { n: finite.length, mean, sd, min: Math.min(...finite), max: Math.max(...finite) };
}
const trainingSets = { A, B, C };
const trainingByConfiguration = Object.fromEntries(['A', 'B', 'C'].map((configuration) => {
  const training = trainingSets[configuration];
  const perSeed = training.runs.map((run) => {
    const final = run.history.at(-1);
    const peak = run.history.reduce((best, entry) => entry.globalBestReward > best.fitness
      ? { generation: entry.generation, fitness: entry.globalBestReward }
      : best, { generation: null, fitness: -Infinity });
    return {
      seed: run.seed, generations: run.generationsCompleted,
      candidateEvaluations: run.candidateEvaluations,
      physicalEpisodeEvaluations: run.physicalEpisodeEvaluations,
      wallSeconds: run.elapsedWallSeconds ?? null,
      bestFitness: run.bestFitness,
      lastGenerationMeanFitness: final?.meanReward ?? null,
      lastGenerationBestFitness: final?.bestReward ?? null,
      lastGenerationCompletionRate: final?.meanCandidateSuccessRate ?? null,
      lastGenerationMeanOffTrackEvents: final?.meanOffTrackEventsPerCircuit ?? null,
      peak,
    };
  });
  return [configuration, {
    protocol: { generations: training.protocol.generations, populationSize: training.protocol.populationSize, eliteCount: training.protocol.eliteCount,
      architecture: training.protocol.architecture, mutationRate: training.protocol.mutationRate ?? 0.08,
      mutationSigma: training.protocol.mutationSigma ?? 0.12, fitnessUnchanged: true },
    perSeed,
    acrossSeeds: {
      bestFitness: stats(perSeed.map((run) => run.bestFitness)),
      lastGenerationMeanFitness: stats(perSeed.map((run) => run.lastGenerationMeanFitness)),
      runtimeSeconds: stats(perSeed.map((run) => run.wallSeconds)),
      physicalEpisodeEvaluations: stats(perSeed.map((run) => run.physicalEpisodeEvaluations)),
      lastGenerationCompletionRate: stats(perSeed.map((run) => run.lastGenerationCompletionRate)),
    },
  }];
}));

const validationByCircuit = validation.circuits.map((circuit) => ({
  circuit: circuit.track.id,
  steering: circuit.steering,
  configurations: Object.fromEntries(['A', 'B', 'C'].map((configuration) => {
    const entries = circuit.neuralNetworks.filter((entry) => modelByEvaluationId.get(entry.trainingSeed).configuration === configuration);
    const perSeed = entries.map((entry) => ({ seed: modelByEvaluationId.get(entry.trainingSeed).seed, ...entry.neural }));
    return [configuration, {
      perSeed,
      acrossSeeds: {
        completionRate: stats(perSeed.map((entry) => entry.completion.rate)),
        meanProgressMeters: stats(perSeed.map((entry) => entry.meanSignedProgressMeters.mean)),
        successfulLapTimeSeconds: stats(perSeed.map((entry) => entry.successfulLapTimeSeconds.mean)),
        offTrackEventsPerEpisode: stats(perSeed.map((entry) => entry.offTrackEvents.mean)),
        offTrackSecondsPerEpisode: stats(perSeed.map((entry) => entry.offTrackDurationSeconds.mean)),
        reward: stats(perSeed.map((entry) => entry.reward.mean)),
        totalCompleted: perSeed.reduce((sum, entry) => sum + entry.completion.successes, 0),
        totalScenarios: perSeed.reduce((sum, entry) => sum + entry.completion.n, 0),
      },
    }];
  })),
}));

const summary = {
  protocol: {
    split: 'independent-validation', scenarioSeed: 731001, scenariosPerNetworkPerCircuit: 30,
    fixedDeltaTime: validation.protocol.fixedDeltaTime, maxEpisodeTime: 60,
    sameScenariosAcrossConfigurations: true, networksTrainedDuringEvaluation: false,
    rewardAndFitnessUnchanged: true,
    intervalLimitations: 'Per-network confidence intervals are conditional on 30 generated scenarios. Across-seed standard deviations use n=3 trained networks and are descriptive. Scenarios within the same circuit/network and models across circuits are not independent populations.',
  },
  trainingByConfiguration: trainingByConfiguration,
  validationByCircuit,
  trainingBudget: Object.fromEntries(Object.entries(trainingByConfiguration).map(([configuration, data]) => [configuration, data.acrossSeeds.physicalEpisodeEvaluations.mean * 3])),
};

writeFileSync(`${root}/validation-all.json`, JSON.stringify(validation, null, 2));
writeFileSync(`${root}/comparison-a-b-c.json`, JSON.stringify(summary, null, 2));
const columns = ['configuration','seed','circuit','scenario_id','initial_speed_mps','heading_error_degrees','reason','completed_laps','signed_progress_m','distance_travelled_m','lap_time_s','off_track_events','off_track_duration_s','blocked_time_s','reward','episode_duration_s'];
const rows = [columns];
const scenarioByCircuit = new Map(validation.circuits.map((circuit) => [circuit.track.id, new Map(circuit.scenarios.map((scenario) => [scenario.scenarioId, scenario]))]));
const append = (configuration, seed, circuitId, episode) => {
  const scenario = scenarioByCircuit.get(circuitId).get(episode.scenarioId);
  rows.push([configuration, seed ?? '', circuitId, episode.scenarioId, scenario.initialSpeedMetersPerSecond,
    scenario.headingErrorRadians * 180 / Math.PI, episode.reason, episode.completedLaps,
    episode.signedProgressMeters, episode.distanceTravelledMeters, episode.lapTimeSeconds,
    episode.offTrackEvents, episode.offTrackDurationSeconds, episode.blockedTimeSeconds,
    episode.reward, episode.episodeDurationSeconds]);
};
for (const circuit of validation.circuits) {
  for (const episode of circuit.steeringEpisodes) append('Steering', '', circuit.track.id, episode);
  for (const entry of circuit.neuralNetworks) {
    const run = modelByEvaluationId.get(entry.trainingSeed);
    for (const episode of entry.neuralEpisodes) append(run.configuration, run.seed, circuit.track.id, episode);
  }
}
const csvCell = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
writeFileSync(`${root}/validation-all.csv`, `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`);

const historyRuns = ['A', 'B', 'C'].flatMap((configuration) => trainingSets[configuration].runs.map((run) => ({ configuration, ...run })));
const sections = historyRuns.map(({ configuration, seed, history }) => {
  const lines = trainingHistoryToCsv([{ seed, history }]).replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
  return { configuration, header: lines[0], rows: lines.slice(1) };
});
writeFileSync(`${root}/generation-statistics-a-b-c.csv`, [
  `configuration,${sections[0].header}`,
  ...sections.flatMap(({ configuration, rows: generationRows }) => generationRows.map((row) => `${configuration},${row}`)),
].join('\r\n'));
const generationComparison = Object.fromEntries(['A','B','C'].map((configuration) => [configuration,
  trainingSets[configuration].runs.map(({ seed, history }) => ({ seed, history }))]));
writeFileSync(`${root}/generation-statistics-a-b-c.json`, JSON.stringify(generationComparison, null, 2));
const circuitRows = [['configuration','seed','generation','circuit','mean_performance','mean_success_rate','mean_progress_ratio','mean_off_track_events','mean_normalized_reward_per_100m']];
for (const { configuration, seed, history } of historyRuns) for (const generation of history) {
  for (const metric of generation.meanCircuitMetrics ?? []) circuitRows.push([configuration, seed, generation.generation, metric.trackId,
    metric.meanPerformance, metric.meanSuccessRate, metric.meanProgressRatio, metric.meanOffTrackEventsPerCircuit, metric.meanNormalizedRewardPer100Meters]);
}
writeFileSync(`${root}/generation-circuit-statistics-a-b-c.csv`, `\uFEFF${circuitRows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`);
const hashesAfter = hashFiles(historicalPaths);
summary.historicalArtifactsUnchanged = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);
summary.historicalArtifactSha256 = hashesAfter;
if (!summary.historicalArtifactsUnchanged) throw new Error('A historical phase 7 or phase 8 B artifact changed during C validation.');
writeFileSync(`${root}/comparison-a-b-c.json`, JSON.stringify(summary, null, 2));
for (const circuit of validationByCircuit) {
  const result = ['A','B','C'].map((configuration) => `${configuration}=${circuit.configurations[configuration].acrossSeeds.totalCompleted}/${circuit.configurations[configuration].acrossSeeds.totalScenarios}`).join(' ');
  console.log(`${circuit.circuit}: Steering=${circuit.steering.completion.successes}/${circuit.steering.completion.n}; ${result}`);
}
console.log(`Saved A/B/C validation and generation comparison; historical artifacts unchanged=${summary.historicalArtifactsUnchanged}.`);
