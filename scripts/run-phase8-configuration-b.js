import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { GeneticTrainer } from '../src/ai/training/GeneticTrainer.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';
import { createGeneralizationTracks, describeTrack } from '../src/ai/training/GeneralizationTracks.js';

const generations = 100;
const populationSize = 16;
const eliteCount = 6; // preserve the phase 7 elite fraction (3/8 = 37.5%).
const seeds = [2026, 2027, 2028];
const validationSeed = 731001;
const outputDir = 'results/phase8-b';
const trainingPath = `${outputDir}/training.json`;
const csvPath = `${outputDir}/generation-statistics.csv`;
const modelDir = `${outputDir}/models`;

if (existsSync(outputDir)) throw new Error(`Refusing to overwrite existing phase 8 B artifacts at ${outputDir}.`);
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

const tracks = createGeneralizationTracks();
const protocol = {
  configuration: 'B', generations, populationSize, eliteCount, seeds,
  mutationRate: 0.08, mutationSigma: 0.12, tournamentSize: 3,
  architecture: [7, 16, 16, 2],
  circuits: tracks.map(describeTrack),
  trainingScenarioSeedFormula: 'uint32(trainingSeed * 65537 + generation * 313 + trackIndex * 7919); same scenario suite for all candidates within a generation.',
  validationScenarioSeed: validationSeed,
  trainingScenariosUsedForSelection: true,
  validationScenariosUsedForSelection: false,
  finalTestScenariosUsedForSelection: false,
  rewardWeightsChanged: false,
  eliteFractionMatchesPhase7: true,
  expectedPhysicalEpisodes: generations * populationSize * tracks.length * seeds.length,
};
const runs = [];
const started = performance.now();
mkdirSync(modelDir, { recursive: true });

function persist(status = 'running') {
  const document = {
    protocol,
    status,
    elapsedWallSeconds: (performance.now() - started) / 1000,
    completedSeeds: runs.length,
    runs: runs.map(({ history, ...run }) => ({ ...run, history })),
  };
  const temporary = `${trainingPath}.tmp`;
  writeFileSync(temporary, JSON.stringify(document, null, 2));
  renameSync(temporary, trainingPath);
  writeFileSync(csvPath, trainingHistoryToCsv(runs));
}

persist();
for (const [runIndex, seed] of seeds.entries()) {
  console.log(`B start ${runIndex + 1}/3 seed=${seed}; ${generations} generations × ${populationSize} individuals × ${tracks.length} circuits.`);
  const runStarted = performance.now();
  const environment = new TrainingEnvironment(tracks, { seed });
  const trainer = new GeneticTrainer({ environment, generations, populationSize, eliteCount, seed });
  const history = [];
  let currentRun = null;
  const result = await trainer.train({ onGeneration: (entry) => {
    const { bestNetwork: _generationNetwork, ...statistics } = entry;
    history.push(statistics);
    currentRun = {
      seed,
      generationsCompleted: history.length,
      candidateEvaluations: resultSafeEvaluations(history),
      physicalEpisodeEvaluations: history.reduce((sum, generation) => sum + generation.physicalEpisodeEvaluations, 0),
      elapsedWallSeconds: (performance.now() - runStarted) / 1000,
      stopped: false,
      bestFitness: entry.globalBestReward,
      bestNetwork: trainer.bestNetwork.toJSON(),
      history,
    };
    const modelPath = `${modelDir}/seed-${seed}.json`;
    const modelTemporary = `${modelPath}.tmp`;
    writeFileSync(modelTemporary, JSON.stringify({
      phase: '8-B', seed, architecture: protocol.architecture,
      generation: entry.generation, fitness: entry.globalBestReward,
      network: trainer.bestNetwork.toJSON(),
    }, null, 2));
    renameSync(modelTemporary, modelPath);
    const prior = runs.findIndex((run) => run.seed === seed);
    if (prior >= 0) runs[prior] = currentRun;
    else runs.push(currentRun);
    persist();
    if (entry.generation === 1 || entry.generation % 5 === 0 || entry.generation === generations) {
      console.log(`B seed=${seed} gen=${entry.generation}/${generations} best=${entry.globalBestReward.toFixed(2)} genBest=${entry.bestReward.toFixed(2)} mean=${entry.meanReward.toFixed(2)} worst=${entry.meanWorstCircuitPerformance.toFixed(2)} completion=${(100 * entry.meanCandidateSuccessRate).toFixed(1)}% elapsed=${((performance.now() - runStarted) / 1000).toFixed(1)}s`);
    }
  } });

  const finalRun = {
    seed,
    generationsCompleted: result.history.length,
    candidateEvaluations: result.evaluations,
    physicalEpisodeEvaluations: result.history.reduce((sum, generation) => sum + generation.physicalEpisodeEvaluations, 0),
    elapsedWallSeconds: (performance.now() - runStarted) / 1000,
    stopped: result.stopped,
    bestFitness: result.bestReward,
    bestNetwork: result.bestNetwork,
    history,
  };
  const prior = runs.findIndex((run) => run.seed === seed);
  if (prior >= 0) runs[prior] = finalRun;
  else runs.push(finalRun);
  writeFileSync(`${modelDir}/seed-${seed}.json`, JSON.stringify({
    phase: '8-B', seed, architecture: protocol.architecture,
    generation: result.generation, fitness: result.bestReward, network: result.bestNetwork,
  }, null, 2));
  persist(runs.length === seeds.length ? 'training-complete' : 'running');
  console.log(`B complete seed=${seed}; physicalEpisodes=${finalRun.physicalEpisodeEvaluations}; elapsed=${finalRun.elapsedWallSeconds.toFixed(1)}s; best=${finalRun.bestFitness.toFixed(2)}`);
}

const hashesAfter = Object.fromEntries(historicalPaths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
const historicalArtifactsUnchanged = JSON.stringify(hashesBefore) === JSON.stringify(hashesAfter);
if (!historicalArtifactsUnchanged) throw new Error('A phase 7 historical artifact changed during configuration B.');
const finalDocument = JSON.parse(readFileSync(trainingPath, 'utf8'));
finalDocument.status = 'training-complete';
finalDocument.historicalArtifactsUnchanged = historicalArtifactsUnchanged;
finalDocument.historicalArtifactSha256 = hashesAfter;
finalDocument.elapsedWallSeconds = (performance.now() - started) / 1000;
writeFileSync(trainingPath, JSON.stringify(finalDocument, null, 2));
console.log(`B all seeds complete; physicalEpisodes=${runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0)}; elapsed=${finalDocument.elapsedWallSeconds.toFixed(1)}s; historicalArtifactsUnchanged=${historicalArtifactsUnchanged}`);

function resultSafeEvaluations(generationsHistory) {
  return generationsHistory.reduce((sum, generation) => sum + (generation.evaluations ?? 0), 0);
}
