import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { NeuralController } from '../src/ai/NeuralController.js';
import { RobustnessEvaluator, summarizeScenarioEpisodes, compareScenarioEpisodes } from '../src/ai/training/RobustnessEvaluator.js';
import { createPhase8HeldOutTrack } from '../src/ai/training/Phase8HeldOutTrack.js';

const root = process.argv.find((arg) => arg.startsWith('--c-dir='))?.slice('--c-dir='.length) ?? 'results/phase8-c';
const previousPath = 'results/phase8-b/held-out-final.json';
const historicalPaths = [
  'results/phase7-multitrack-training.json',
  'results/phase7-multitrack-generation-statistics.csv',
  'results/phase7-multitrack-validation.json',
  'results/phase7-multitrack-validation.csv',
  'results/phase7-multitrack-test.json',
  'results/phase7-multitrack-test.csv',
  'results/phase8-b/training.json', 'results/phase8-b/generation-statistics.csv',
  'results/phase8-b/generation-statistics.json', 'results/phase8-b/generation-circuit-statistics.csv',
  'results/phase8-b/validation.json', 'results/phase8-b/validation.csv',
  'results/phase8-b/comparison-summary.json', 'results/phase8-b/held-out-final.json', 'results/phase8-b/held-out-final.csv',
  'results/phase8-b/models/seed-2026.json', 'results/phase8-b/models/seed-2027.json', 'results/phase8-b/models/seed-2028.json',
];
const hashes = (paths) => Object.fromEntries(paths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
const before = hashes(historicalPaths);
const oldResult = JSON.parse(readFileSync(previousPath, 'utf8'));
const trainingC = JSON.parse(readFileSync(`${root}/training.json`, 'utf8'));
if (trainingC.status !== 'training-complete') throw new Error('Configuration C training must be complete before final testing.');
const track = createPhase8HeldOutTrack();
const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 731001, maxEpisodeTime: 60 });
const scenarios = evaluator.createScenarios(track, 3);
if (JSON.stringify(scenarios) !== JSON.stringify(oldResult.scenarios)) throw new Error('The held-out final scenarios differ from the A/B test.');
console.log('C final evaluation uses the exact locked scenario records from the A/B fourth-circuit test.');

const networkRuns = trainingC.runs.map((run) => {
  const network = NeuralNetwork.fromJSON(run.bestNetwork);
  const beforeWeights = JSON.stringify(network.toJSON());
  const neuralEpisodes = scenarios.map((scenario) => evaluator.evaluateEpisode(track, scenario,
    new NeuralController({ network: network.copy() })));
  return {
    configuration: 'C', trainingSeed: run.seed,
    networkWeightsUnchanged: beforeWeights === JSON.stringify(network.toJSON()),
    summary: summarizeScenarioEpisodes(neuralEpisodes),
    pairedAgainstSteering: compareScenarioEpisodes(oldResult.steeringEpisodes, neuralEpisodes, 731001 + run.seed),
    neuralEpisodes,
  };
});
if (networkRuns.some((run) => !run.networkWeightsUnchanged)) throw new Error('A C network changed during final evaluation.');
const result = {
  protocol: { ...oldResult.protocol, configurationUnderTest: 'C', networkWeightsSelectedUsingThisCircuit: false,
    exactScenariosMatchedToAB: true, networkTrainedDuringEvaluation: false },
  scenarios,
  steering: oldResult.steering,
  steeringEpisodes: oldResult.steeringEpisodes,
  networks: [...oldResult.networks, ...networkRuns],
  limitations: `${oldResult.limits} Configuration C results were appended without reusing this circuit for selection.`,
};
writeFileSync(`${root}/held-out-final-a-b-c.json`, JSON.stringify(result, null, 2));
const columns = ['configuration','seed','circuit','scenario_id','initial_speed_mps','heading_error_degrees','reason','completed_laps','signed_progress_m','distance_travelled_m','lap_time_s','off_track_events','off_track_duration_s','blocked_time_s','reward','episode_duration_s'];
const rows = [columns];
const scenarioById = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
const appendEpisodes = (configuration, seed, episodes) => episodes.forEach((episode) => {
  const scenario = scenarioById.get(episode.scenarioId);
  rows.push([configuration, seed ?? '', track.id, episode.scenarioId, scenario.initialSpeedMetersPerSecond,
    scenario.headingErrorRadians * 180 / Math.PI, episode.reason, episode.completedLaps,
    episode.signedProgressMeters, episode.distanceTravelledMeters, episode.lapTimeSeconds,
    episode.offTrackEvents, episode.offTrackDurationSeconds, episode.blockedTimeSeconds, episode.reward, episode.episodeDurationSeconds]);
});
appendEpisodes('Steering', '', result.steeringEpisodes);
for (const model of result.networks) appendEpisodes(model.configuration, model.trainingSeed, model.neuralEpisodes);
const cell = (value) => { const text = value === null || value === undefined ? '' : String(value); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
writeFileSync(`${root}/held-out-final-a-b-c.csv`, `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`);
const after = hashes(historicalPaths);
result.historicalArtifactsUnchanged = JSON.stringify(before) === JSON.stringify(after);
if (!result.historicalArtifactsUnchanged) throw new Error('A historical artifact changed during C final evaluation.');
writeFileSync(`${root}/held-out-final-a-b-c.json`, JSON.stringify(result, null, 2));
for (const run of networkRuns) console.log(`C seed=${run.trainingSeed}: ${run.summary.completion.successes}/30; progress=${run.summary.meanSignedProgressMeters.mean.toFixed(1)}m; off-track=${run.summary.offTrackEvents.mean.toFixed(2)}/episode.`);
console.log(`Held-out test complete; previous A/B artifacts unchanged=${result.historicalArtifactsUnchanged}.`);
