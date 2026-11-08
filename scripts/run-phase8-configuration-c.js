import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { GeneticTrainer } from '../src/ai/training/GeneticTrainer.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';
import { createGeneralizationTracks, describeTrack } from '../src/ai/training/GeneralizationTracks.js';

const generations = 250;
const populationSize = 16;
const eliteCount = 6;
const seeds = [2026, 2027, 2028];
const validationSeed = 731001;
const outputDir = 'results/phase8-c';
const trainingPath = `${outputDir}/training.json`;
const csvPath = `${outputDir}/generation-statistics.csv`;
const modelDir = `${outputDir}/models`;
if (existsSync(outputDir)) throw new Error(`Refusing to overwrite existing phase 8 C artifacts at ${outputDir}.`);

const phase7 = JSON.parse(readFileSync('results/phase7-multitrack-training.json', 'utf8'));
const phase8B = JSON.parse(readFileSync('results/phase8-b/training.json', 'utf8'));
if (phase8B.status !== 'training-complete') throw new Error('Phase 8 B must be complete before starting C.');
if (phase7.protocol.populationSize !== 8 || phase7.protocol.eliteCount !== 3
  || phase8B.protocol.populationSize !== 16 || phase8B.protocol.eliteCount !== 6
  || phase8B.protocol.mutationRate !== 0.08 || phase8B.protocol.mutationSigma !== 0.12
  || phase8B.protocol.tournamentSize !== 3
  || JSON.stringify(phase8B.protocol.architecture) !== JSON.stringify([7, 16, 16, 2])
  || JSON.stringify(phase8B.protocol.seeds) !== JSON.stringify(seeds)
  || phase8B.protocol.validationScenarioSeed !== validationSeed
  || phase8B.protocol.rewardWeightsChanged !== false) {
  throw new Error('A/B reference protocol does not match the authorized C experiment.');
}

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
function hashes(paths) {
  return Object.fromEntries(paths.map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
}
const historicalHashesBefore = hashes(historicalPaths);

const tracks = createGeneralizationTracks();
const protocol = {
  configuration: 'C', generations, populationSize, eliteCount, seeds,
  mutationRate: phase8B.protocol.mutationRate,
  mutationSigma: phase8B.protocol.mutationSigma,
  tournamentSize: phase8B.protocol.tournamentSize,
  architecture: [7, 16, 16, 2],
  circuits: tracks.map(describeTrack),
  trainingScenarioSeedFormula: phase8B.protocol.trainingScenarioSeedFormula,
  validationScenarioSeed: validationSeed,
  trainingScenariosUsedForSelection: true,
  validationScenariosUsedForSelection: false,
  heldOutFinalTrackUsedForSelection: false,
  rewardWeightsChanged: false,
  eliteFractionMatchesPhase7: true,
  comparisonBudgetEpisodesA: phase7.runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0),
  comparisonBudgetEpisodesB: phase8B.runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0),
  expectedPhysicalEpisodes: generations * populationSize * tracks.length * seeds.length,
  fitnessDefinition: phase7.fitnessDefinition,
};
const runs = [];
const started = performance.now();
mkdirSync(modelDir, { recursive: true });

function persist(status = 'running') {
  const document = {
    protocol, status,
    elapsedWallSeconds: (performance.now() - started) / 1000,
    completedSeeds: runs.filter((run) => run.generationsCompleted === generations).length,
    runs,
  };
  const temporary = `${trainingPath}.tmp`;
  writeFileSync(temporary, JSON.stringify(document, null, 2));
  renameSync(temporary, trainingPath);
  writeFileSync(csvPath, trainingHistoryToCsv(runs));
}
persist();

for (const [runIndex, seed] of seeds.entries()) {
  console.log(`C start ${runIndex + 1}/3 seed=${seed}; ${generations} generations × ${populationSize} individuals × ${tracks.length} circuits.`);
  const runStarted = performance.now();
  const environment = new TrainingEnvironment(tracks, { seed });
  const trainer = new GeneticTrainer({ environment, generations, populationSize, eliteCount, seed });
  const history = [];
  runs.push({ seed, generationsCompleted: 0, candidateEvaluations: 0, physicalEpisodeEvaluations: 0,
    elapsedWallSeconds: 0, stopped: false, bestFitness: null, bestNetwork: null, history });
  const result = await trainer.train({ onGeneration: (entry) => {
    const { bestNetwork: _generationNetwork, ...statistics } = entry;
    history.push(statistics);
    const run = runs.at(-1);
    run.generationsCompleted = history.length;
    run.candidateEvaluations = history.reduce((sum, generation) => sum + generation.evaluations, 0);
    run.physicalEpisodeEvaluations = history.reduce((sum, generation) => sum + generation.physicalEpisodeEvaluations, 0);
    run.elapsedWallSeconds = (performance.now() - runStarted) / 1000;
    run.bestFitness = entry.globalBestReward;
    run.bestNetwork = trainer.bestNetwork.toJSON();
    const modelPath = `${modelDir}/seed-${seed}.json`;
    const modelTemporary = `${modelPath}.tmp`;
    writeFileSync(modelTemporary, JSON.stringify({ phase: '8-C', seed, architecture: protocol.architecture,
      generation: entry.generation, fitness: entry.globalBestReward, network: trainer.bestNetwork.toJSON() }, null, 2));
    renameSync(modelTemporary, modelPath);
    persist();
    if (entry.generation === 1 || entry.generation % 10 === 0 || entry.generation === generations) {
      console.log(`C seed=${seed} gen=${entry.generation}/${generations} best=${entry.globalBestReward.toFixed(2)} genBest=${entry.bestReward.toFixed(2)} mean=${entry.meanReward.toFixed(2)} worst=${entry.meanWorstCircuitPerformance.toFixed(2)} completion=${(100 * entry.meanCandidateSuccessRate).toFixed(1)}% elapsed=${run.elapsedWallSeconds.toFixed(1)}s`);
    }
  } });
  const run = runs.at(-1);
  run.generationsCompleted = result.history.length;
  run.candidateEvaluations = result.evaluations;
  run.physicalEpisodeEvaluations = result.history.reduce((sum, generation) => sum + generation.physicalEpisodeEvaluations, 0);
  run.elapsedWallSeconds = (performance.now() - runStarted) / 1000;
  run.stopped = result.stopped;
  run.bestFitness = result.bestReward;
  run.bestNetwork = result.bestNetwork;
  writeFileSync(`${modelDir}/seed-${seed}.json`, JSON.stringify({ phase: '8-C', seed,
    architecture: protocol.architecture, generation: result.generation, fitness: result.bestReward,
    network: result.bestNetwork }, null, 2));
  persist(runs.length === seeds.length ? 'training-complete' : 'running');
  console.log(`C complete seed=${seed}; physicalEpisodes=${run.physicalEpisodeEvaluations}; elapsed=${run.elapsedWallSeconds.toFixed(1)}s; best=${run.bestFitness.toFixed(2)}`);
}

const historicalHashesAfter = hashes(historicalPaths);
const historicalArtifactsUnchanged = JSON.stringify(historicalHashesBefore) === JSON.stringify(historicalHashesAfter);
if (!historicalArtifactsUnchanged) throw new Error('A phase 7 or phase 8 A/B artifact changed during C training.');
const finalPath = JSON.parse(readFileSync(trainingPath, 'utf8'));
finalPath.status = 'training-complete';
finalPath.historicalArtifactsUnchanged = historicalArtifactsUnchanged;
finalPath.historicalArtifactSha256 = historicalHashesAfter;
finalPath.elapsedWallSeconds = (performance.now() - started) / 1000;
writeFileSync(trainingPath, JSON.stringify(finalPath, null, 2));
console.log(`C all seeds complete; physicalEpisodes=${runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0)}; elapsed=${finalPath.elapsedWallSeconds.toFixed(1)}s; historicalArtifactsUnchanged=${historicalArtifactsUnchanged}`);
