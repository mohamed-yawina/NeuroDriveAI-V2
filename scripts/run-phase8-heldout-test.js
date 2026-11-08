import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { NeuralController } from '../src/ai/NeuralController.js';
import { RobustnessEvaluator, summarizeScenarioEpisodes, compareScenarioEpisodes } from '../src/ai/training/RobustnessEvaluator.js';
import { createPhase8HeldOutTrack } from '../src/ai/training/Phase8HeldOutTrack.js';
import { SteeringController } from '../src/ai/SteeringController.js';

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
const trainingA = JSON.parse(readFileSync('results/phase7-multitrack-training.json', 'utf8'));
const trainingB = JSON.parse(readFileSync(`${root}/training.json`, 'utf8'));
if (trainingB.status !== 'training-complete') throw new Error('Configuration B training is not complete.');
const runs = [
  ...trainingA.runs.map((run) => ({ configuration: 'A', seed: run.seed, network: NeuralNetwork.fromJSON(run.bestNetwork) })),
  ...trainingB.runs.map((run) => ({ configuration: 'B', seed: run.seed, network: NeuralNetwork.fromJSON(run.bestNetwork) })),
];
const track = createPhase8HeldOutTrack();
const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 731001, maxEpisodeTime: 60 });
const scenarios = evaluator.createScenarios(track, 3);
console.log(`Testing locked fourth circuit: ${runs.length} frozen models × ${scenarios.length} scenarios + Steering baseline.`);
const steeringEpisodes = scenarios.map((scenario) => evaluator.evaluateEpisode(track, scenario, new SteeringController()));
const models = runs.map((run) => {
  const before = JSON.stringify(run.network.toJSON());
  const neuralEpisodes = scenarios.map((scenario) => evaluator.evaluateEpisode(track, scenario,
    new NeuralController({ network: run.network.copy() })));
  return { ...run, networkWeightsUnchanged: before === JSON.stringify(run.network.toJSON()), neuralEpisodes };
});
if (models.some((model) => !model.networkWeightsUnchanged)) throw new Error('A held-out test network changed during inference.');

const result = {
  protocol: {
    split: 'locked-final-test', scenarioSeed: 731001, scenarioCountPerModel: 30,
    circuit: { id: track.id, label: track.label, waypointCount: track.waypoints.length },
    initialSpeedsMetersPerSecond: [0, 7, 14, 21], headingPerturbationDegrees: [-15, 15],
    fixedDeltaTime: evaluator.fixedDeltaTime, maxEpisodeTimeSeconds: evaluator.maxEpisodeTime,
    networksTrainedDuringEvaluation: false, thisCircuitUsedForHyperparameterSelection: false,
  },
  scenarios,
  steering: summarizeScenarioEpisodes(steeringEpisodes),
  steeringEpisodes,
  networks: models.map((model, index) => ({
    configuration: model.configuration, trainingSeed: model.seed,
    networkWeightsUnchanged: model.networkWeightsUnchanged,
    summary: summarizeScenarioEpisodes(model.neuralEpisodes),
    pairedAgainstSteering: compareScenarioEpisodes(steeringEpisodes, model.neuralEpisodes, 731001 + index),
    neuralEpisodes: model.neuralEpisodes,
  })),
  limits: 'One newly generated held-out circuit and 30 paired scenarios per network; results are conditional on this test sample and do not estimate performance across all possible tracks.',
};
writeFileSync(`${root}/held-out-final.json`, JSON.stringify(result, null, 2));
const csvRows = [['configuration','seed','circuit','scenario_id','initial_speed_mps','heading_error_degrees','reason','completed_laps','signed_progress_m','distance_travelled_m','lap_time_s','off_track_events','off_track_duration_s','blocked_time_s','reward','episode_duration_s']];
const scenarioById = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
const appendEpisodes = (configuration, seed, episodes) => episodes.forEach((episode) => {
  const scenario = scenarioById.get(episode.scenarioId);
  csvRows.push([configuration, seed ?? '', track.id, episode.scenarioId, scenario.initialSpeedMetersPerSecond,
    scenario.headingErrorRadians * 180 / Math.PI, episode.reason, episode.completedLaps,
    episode.signedProgressMeters, episode.distanceTravelledMeters, episode.lapTimeSeconds,
    episode.offTrackEvents, episode.offTrackDurationSeconds, episode.blockedTimeSeconds,
    episode.reward, episode.episodeDurationSeconds]);
});
appendEpisodes('Steering', null, steeringEpisodes);
for (const model of models) appendEpisodes(model.configuration, model.seed, model.neuralEpisodes);
const csvCell = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
writeFileSync(`${root}/held-out-final.csv`, `\uFEFF${csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`);
const hashesAfter = Object.fromEntries(historicalPaths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
result.historicalArtifactsUnchanged = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);
if (!result.historicalArtifactsUnchanged) throw new Error('A phase 7 artifact changed during the held-out evaluation.');
writeFileSync(`${root}/held-out-final.json`, JSON.stringify(result, null, 2));
for (const model of result.networks) {
  console.log(`${model.configuration} seed=${model.trainingSeed}: ${model.summary.completion.successes}/${model.summary.completion.n}; progress=${model.summary.meanSignedProgressMeters.mean.toFixed(1)}m; off-track=${model.summary.offTrackEvents.mean.toFixed(2)}/episode.`);
}
console.log(`Steering ${result.steering.completion.successes}/${result.steering.completion.n}; historical phase 7 artifacts unchanged=${result.historicalArtifactsUnchanged}.`);
