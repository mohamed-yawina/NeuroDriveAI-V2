import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { GeneticTrainer } from '../src/ai/training/GeneticTrainer.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';
import { createGeneralizationTracks, describeTrack } from '../src/ai/training/GeneralizationTracks.js';
import { evaluateTrainingVariants, trainingVariantResultsToCsv } from '../src/ai/training/MultiTrackEvaluation.js';

const arg = (name, fallback) => {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
};
const generations = Number(arg('generations', '50'));
const populationSize = Number(arg('population', '8'));
const seeds = arg('seeds', '2026,2027,2028').split(',').map(Number);
const validationSeed = Number(arg('validation-seed', '731001'));
const testSeed = Number(arg('test-seed', '907001'));
if (!Number.isInteger(generations) || generations < 1 || !Number.isInteger(populationSize) || populationSize < 4) {
  throw new Error('Use positive generations and a population of at least four.');
}
if (seeds.length < 3 || seeds.some((seed) => !Number.isInteger(seed))) throw new Error('Provide at least three integer seeds.');

const previous = JSON.parse(readFileSync('results/phase4-scientific-validation.json', 'utf8'));
const singleTrackRuns = previous.runs.map((run) => ({ seed: run.seed, network: NeuralNetwork.fromJSON(run.bestNetwork) }));
const tracks = createGeneralizationTracks();
const multiTrackRuns = [];
const runArtifacts = [];
for (const [runIndex, seed] of seeds.entries()) {
  console.log(`Multi-track training ${runIndex + 1}/${seeds.length}: seed=${seed}, generations=${generations}, population=${populationSize}, circuits=${tracks.length}`);
  const environment = new TrainingEnvironment(tracks, { seed });
  const trainer = new GeneticTrainer({ environment, generations, populationSize, eliteCount: Math.min(3, populationSize - 1), seed });
  const result = await trainer.train({ onGeneration: (entry) => {
    if (entry.generation === 1 || entry.generation % 10 === 0 || entry.generation === generations) {
      console.log(`seed=${seed} gen=${entry.generation} best=${entry.bestReward.toFixed(2)} mean=${entry.meanReward.toFixed(2)} worst-circuit=${entry.meanWorstCircuitPerformance.toFixed(2)} success=${(100 * entry.meanCandidateSuccessRate).toFixed(1)}%`);
    }
  } });
  const network = NeuralNetwork.fromJSON(result.bestNetwork);
  multiTrackRuns.push({ seed, network });
  runArtifacts.push({
    seed,
    generationsCompleted: result.history.length,
    candidateEvaluations: result.evaluations,
    physicalEpisodeEvaluations: result.history.reduce((sum, entry) => sum + entry.physicalEpisodeEvaluations, 0),
    stopped: result.stopped,
    bestFitness: result.bestReward,
    bestNetwork: result.bestNetwork,
    history: result.history.map(({ bestNetwork, ...entry }) => entry),
  });
}

const training = {
  protocol: {
    generations, populationSize, eliteCount: Math.min(3, populationSize - 1), seeds,
    architecture: [7, 16, 16, 2],
    circuits: tracks.map(describeTrack),
    trainingScenarioSeedFormula: 'uint32(trainingSeed * 65537 + generation * 313 + trackIndex * 7919); same scenario suite for all candidates within a generation.',
    validationScenarioSeed: validationSeed,
    finalTestScenarioSeed: testSeed,
    trainingScenariosUsedForSelection: true,
    validationScenariosUsedForSelection: false,
    finalTestScenariosUsedForSelection: false,
    rewardWeightsChanged: false,
  },
  fitnessDefinition: 'Per-circuit performance = 0.65 * normalized existing reward per 100 m (fixed lap bonus removed) + 0.35 * physical score; physical score combines capped normalized progress (0.30), completed-lap indicator (0.35), normalized pace (0.20), on-track fraction (0.15). Candidate fitness = 0.40 * mean circuit performance + 0.40 * worst circuit performance + 20 * circuit success rate - 3 * mean off-track events per normalized circuit distance.',
  runs: runArtifacts,
};
mkdirSync('results', { recursive: true });
writeFileSync('results/phase7-multitrack-training.json', JSON.stringify(training, null, 2));
writeFileSync('results/phase7-multitrack-generation-statistics.csv', trainingHistoryToCsv(runArtifacts));

console.log('Scoring distinct validation scenarios (not used for selection)...');
const validation = evaluateTrainingVariants({ tracks, singleTrackRuns, multiTrackRuns, scenarioSeed: validationSeed, scenarioCount: 30, split: 'validation' });
writeFileSync('results/phase7-multitrack-validation.json', JSON.stringify(validation, null, 2));
writeFileSync('results/phase7-multitrack-validation.csv', trainingVariantResultsToCsv(validation));

console.log('Scoring final test scenarios (locked; no parameter selection)...');
const test = evaluateTrainingVariants({ tracks, singleTrackRuns, multiTrackRuns, scenarioSeed: testSeed, scenarioCount: 30, split: 'test-final' });
writeFileSync('results/phase7-multitrack-test.json', JSON.stringify(test, null, 2));
writeFileSync('results/phase7-multitrack-test.csv', trainingVariantResultsToCsv(test));
for (const circuit of test.circuits) {
  const summary = (group) => group.map((entry) => `${entry.trainingSeed}:${Math.round(entry.summary.completion.rate * 100)}%`).join(' ');
  console.log(`${circuit.track.id} steering=${Math.round(circuit.steering.completion.rate * 100)}%; single=[${summary(circuit.singleTrackNetworks)}]; multi=[${summary(circuit.multiTrackNetworks)}]`);
}
console.log('Saved phase 7 training, validation, and final test JSON/CSV artifacts.');
