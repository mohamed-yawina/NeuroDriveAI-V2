import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { performance } from 'node:perf_hooks';
import { GeneticTrainer } from '../src/ai/training/GeneticTrainer.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';

const inputRoot = 'results/phase8-c';
const attemptId = process.argv.find((arg) => arg.startsWith('--attempt='))?.slice('--attempt='.length)
  ?? new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
if (!/^[0-9A-Za-z_-]+$/.test(attemptId)) throw new Error('Invalid --attempt identifier.');
const outputRoot = `results/phase8-c-recovered-${attemptId}`;
const checkpointRoot = join(outputRoot, 'checkpoints');
const modelRoot = join(outputRoot, 'models');
const input = JSON.parse(readFileSync(join(inputRoot, 'training.json'), 'utf8'));
const sourceRun = input.runs.find((run) => run.seed === 2028);
if (!sourceRun || sourceRun.generationsCompleted !== 94 || sourceRun.history?.length !== 94) {
  throw new Error('Expected the preserved seed 2028 checkpoint at generation 94.');
}
if (sourceRun.candidateEvaluations !== 94 * 16 || sourceRun.physicalEpisodeEvaluations !== 94 * 16 * 3) {
  throw new Error('Seed 2028 counters do not match the recorded generation history.');
}
if (input.protocol.configuration !== 'C' || input.protocol.generations !== 250 || input.protocol.populationSize !== 16
  || input.protocol.eliteCount !== 6 || input.protocol.mutationRate !== 0.08 || input.protocol.mutationSigma !== 0.12
  || input.protocol.tournamentSize !== 3 || input.protocol.seeds.join(',') !== '2026,2027,2028'
  || input.protocol.architecture.join(',') !== '7,16,16,2') {
  throw new Error('The preserved C protocol does not match the authorized experiment.');
}
for (const seed of [2026, 2027]) {
  const run = input.runs.find((entry) => entry.seed === seed);
  if (!run || run.generationsCompleted !== 250 || run.history?.length !== 250) throw new Error(`Seed ${seed} is not complete; refusing to run it.`);
}
const savedModel = JSON.parse(readFileSync(join(inputRoot, 'models', 'seed-2028.json'), 'utf8'));
if (savedModel.seed !== 2028 || savedModel.generation !== 94
  || savedModel.fitness !== sourceRun.bestFitness || !isDeepStrictEqual(savedModel.network, sourceRun.bestNetwork)
  || sourceRun.history.at(-1).globalBestReward !== sourceRun.bestFitness) {
  throw new Error('The seed 2028 model, fitness, and training checkpoint disagree.');
}
for (const [index, row] of sourceRun.history.entries()) {
  if (row.seed !== 2028 || row.generation !== index + 1 || row.evaluations !== 16 || row.physicalEpisodeEvaluations !== 48) {
    throw new Error(`Seed 2028 history has invalid evaluation order/count at generation ${index + 1}.`);
  }
}

const archiveRoot = join(inputRoot, 'checkpoints', `recovery-source-${attemptId}`);
if (!existsSync(archiveRoot)) {
  mkdirSync(archiveRoot, { recursive: true });
  for (const path of ['training.json', 'generation-statistics.csv', 'models/seed-2028.json']) {
    const target = join(archiveRoot, path);
    mkdirSync(join(target, '..'), { recursive: true });
    copyFileSync(join(inputRoot, path), target);
  }
} else {
  for (const path of ['training.json', 'generation-statistics.csv', 'models/seed-2028.json']) {
    if (!existsSync(join(archiveRoot, path))) throw new Error(`Incomplete source archive: ${path}`);
  }
}

const historicalPaths = [
  'results/phase7-multitrack-training.json', 'results/phase7-multitrack-generation-statistics.csv',
  'results/phase7-multitrack-validation.json', 'results/phase7-multitrack-validation.csv',
  'results/phase7-multitrack-test.json', 'results/phase7-multitrack-test.csv',
  'results/phase8-b/training.json', 'results/phase8-b/generation-statistics.csv',
  'results/phase8-b/generation-statistics.json', 'results/phase8-b/generation-circuit-statistics.csv',
  'results/phase8-b/validation.json', 'results/phase8-b/validation.csv',
  'results/phase8-b/comparison-summary.json', 'results/phase8-b/held-out-final.json',
  'results/phase8-b/held-out-final.csv', 'results/phase8-b/models/seed-2026.json',
  'results/phase8-b/models/seed-2027.json', 'results/phase8-b/models/seed-2028.json',
];
const hashFiles = () => Object.fromEntries(historicalPaths.map((path) => [path,
  createHash('sha256').update(readFileSync(path)).digest('hex')]));
const hashesBefore = hashFiles();
const tracks = createGeneralizationTracks();
const environment = new TrainingEnvironment(tracks, { seed: 2028 });
const scenarioTrace = [];
const candidateIndexes = new Map();
let activeEvaluation = null;
const createScenario = environment.createScenario.bind(environment);
environment.createScenario = (args) => {
  const scenario = createScenario(args);
  if (activeEvaluation) scenarioTrace.push({
    generation: activeEvaluation.generation,
    candidateIndex: activeEvaluation.candidateIndex,
    trackIndex: args.trackIndex,
    trackId: tracks[args.trackIndex].id,
    seed: args.seed >>> 0,
    arcFraction: scenario.arcFraction,
    initialSpeedMetersPerSecond: scenario.initialSpeedMetersPerSecond,
    headingErrorRadians: scenario.headingErrorRadians,
  });
  return scenario;
};
const evaluateAcrossTracks = environment.evaluateAcrossTracks.bind(environment);
environment.evaluateAcrossTracks = async (args) => {
  const candidateIndex = candidateIndexes.get(args.generation) ?? 0;
  candidateIndexes.set(args.generation, candidateIndex + 1);
  activeEvaluation = { generation: args.generation, candidateIndex };
  try { return await evaluateAcrossTracks(args); }
  finally { activeEvaluation = null; }
};
const config = { environment, generations: 250, populationSize: 16, eliteCount: 6, mutationRate: 0.08, mutationSigma: 0.12, seed: 2028 };
const started = performance.now();

function atomicCreate(path, content) {
  mkdirSync(join(path, '..'), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  const fd = openSync(temporary, 'wx');
  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

function writeImmutable(path, content) {
  if (existsSync(path)) {
    if (readFileSync(path, 'utf8') !== content) throw new Error(`Refusing to overwrite non-matching recovery output: ${path}`);
    return;
  }
  atomicCreate(path, content);
}

function saveCheckpoint(state) {
  const name = `seed-2028-generation-${String(state.generation).padStart(3, '0')}.json`;
  const path = join(checkpointRoot, name);
  const completeState = { ...state, scenarioTrace, totalRecoveryWallSeconds: priorRecoverySeconds + (performance.now() - started) / 1000 };
  if (!existsSync(path)) atomicCreate(path, JSON.stringify(completeState));
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const { totalRecoveryWallSeconds: _oldElapsed, scenarioTrace: oldTrace, ...oldState } = parsed;
  if (!isDeepStrictEqual(oldState, state) || !isDeepStrictEqual(oldTrace, scenarioTrace)) {
    throw new Error(`Conflicting checkpoint already exists at generation ${state.generation}.`);
  }
}

function verifyScenarioTrace(trace, generationCount) {
  if (!Array.isArray(trace) || trace.length !== generationCount * 16 * 3) return false;
  for (let i = 0; i < trace.length; i++) {
    const generation = Math.floor(i / 48) + 1;
    const candidateIndex = Math.floor((i % 48) / 3);
    const trackIndex = i % 3;
    const entry = trace[i];
    const seed = (2028 * 65537 + generation * 313 + trackIndex * 7919) >>> 0;
    if (entry.generation !== generation || entry.candidateIndex !== candidateIndex || entry.trackIndex !== trackIndex
      || entry.trackId !== tracks[trackIndex].id || entry.seed !== seed) return false;
    const expected = createScenario({ seed, trackIndex });
    if (entry.arcFraction !== expected.arcFraction || entry.initialSpeedMetersPerSecond !== expected.initialSpeedMetersPerSecond
      || entry.headingErrorRadians !== expected.headingErrorRadians) return false;
  }
  return true;
}

function writeProgress(state, phase) {
  const run = {
    seed: 2028,
    generationsCompleted: state.generation,
    candidateEvaluations: state.evaluations,
    physicalEpisodeEvaluations: state.history.reduce((sum, row) => sum + row.physicalEpisodeEvaluations, 0),
    elapsedWallSeconds: priorRecoverySeconds + (performance.now() - started) / 1000,
    stopped: state.generation < 250,
    bestFitness: state.bestReward,
    bestNetwork: state.bestNetwork,
    bestGeneration: state.bestGeneration,
    history: state.history,
  };
  const doc = {
    protocol: input.protocol,
    status: phase === 'complete' ? 'training-complete' : 'running',
    recovery: { method: 'deterministic-replay-then-exact-checkpoint-restore', phase, attemptId, replayValidated: phase !== 'replay' },
    completedSeeds: 2 + Number(phase === 'complete'),
    runs: [...input.runs.filter((entry) => entry.seed !== 2028), run],
  };
  const progressPath = join(outputRoot, `progress-${phase}-generation-${String(state.generation).padStart(3, '0')}.json`);
  if (!existsSync(progressPath)) atomicCreate(progressPath, JSON.stringify(doc, null, 2));
  const modelPath = join(modelRoot, `seed-2028-generation-${String(state.generation).padStart(3, '0')}.json`);
  if (!existsSync(modelPath)) atomicCreate(modelPath, JSON.stringify({ phase: '8-C', seed: 2028, architecture: [7, 16, 16, 2],
    generation: state.generation, fitness: state.bestReward, network: state.bestNetwork }, null, 2));
}

mkdirSync(checkpointRoot, { recursive: true });
mkdirSync(modelRoot, { recursive: true });
const availableCheckpoints = readdirSync(checkpointRoot)
  .map((name) => ({ name, generation: Number(name.match(/^seed-2028-generation-(\d+)\.json$/)?.[1]) }))
  .filter((entry) => Number.isInteger(entry.generation))
  .sort((a, b) => b.generation - a.generation);
let trainer;
let replayValidated = false;
let priorRecoverySeconds = 0;
if (availableCheckpoints.length) {
  const latest = JSON.parse(readFileSync(join(checkpointRoot, availableCheckpoints[0].name), 'utf8'));
  if (!verifyScenarioTrace(latest.scenarioTrace, latest.generation)) throw new Error('Saved scenario order/seed audit is incomplete or inconsistent.');
  scenarioTrace.push(...latest.scenarioTrace);
  trainer = new GeneticTrainer({ ...config, checkpoint: latest });
  priorRecoverySeconds = latest.totalRecoveryWallSeconds ?? 0;
  const markerPath = join(outputRoot, 'replay-validation.json');
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (marker.result !== 'validated' || marker.generation !== 94 || marker.historyEntriesCompared !== 94
      || !isDeepStrictEqual(marker.protocol, input.protocol)) throw new Error('Replay-validation marker failed integrity checks.');
    replayValidated = true;
  }
  console.log(`Restored versioned full checkpoint at generation ${latest.generation}; replayValidated=${replayValidated}.`);
} else {
  trainer = new GeneticTrainer(config);
}

for (const seed of [2026, 2027]) {
  const source = join(inputRoot, 'models', `seed-${seed}.json`);
  const target = join(modelRoot, `seed-${seed}.json`);
  if (!existsSync(target)) copyFileSync(source, target);
  if (createHash('sha256').update(readFileSync(source)).digest('hex') !== createHash('sha256').update(readFileSync(target)).digest('hex')) {
    throw new Error(`Preserved seed ${seed} model differs in the recovery output.`);
  }
}

function validateReplay() {
  const computedHistory = trainer.history;
  if (computedHistory.length < 94) throw new Error(`Replay stopped at generation ${computedHistory.length}; expected 94.`);
  for (let i = 0; i < 94; i++) {
    const { bestNetwork: _network, ...actual } = computedHistory[i];
    if (!isDeepStrictEqual(actual, sourceRun.history[i])) {
      throw new Error(`Deterministic replay mismatch at generation ${i + 1}; continuation aborted.`);
    }
  }
  const recordedPeakGeneration = sourceRun.history.find((row) => row.globalBestReward === sourceRun.bestFitness)?.generation;
  if (!isDeepStrictEqual(trainer.bestNetwork.toJSON(), sourceRun.bestNetwork)
    || trainer.bestReward !== sourceRun.bestFitness
    || trainer.bestGeneration !== recordedPeakGeneration
    || trainer.evaluations !== sourceRun.candidateEvaluations
    || trainer.generation !== 94) {
    throw new Error('Replayed best network, fitness/generation, or evaluation counters differ; continuation aborted.');
  }
  if (savedModel.generation !== 94 || savedModel.fitness !== trainer.bestReward
    || !isDeepStrictEqual(savedModel.network, trainer.bestNetwork.toJSON())) {
    throw new Error('Replayed generation-94 model differs from the saved checkpoint; continuation aborted.');
  }
  if (!verifyScenarioTrace(scenarioTrace, 94)) throw new Error('Scenario seeds, order, or initial conditions differ; continuation aborted.');
  const validation = {
    result: 'validated', generation: 94, historyEntriesCompared: 94,
    comparedFields: 'every serialized statistic and fitness field in every generation row',
    bestNetworkExact: true, bestFitnessExact: true, bestGeneration: trainer.bestGeneration,
    candidateEvaluations: trainer.evaluations, physicalEpisodeEvaluations: sourceRun.physicalEpisodeEvaluations,
    scenarioOrder: 'verified all 4,512 calls: 16 candidates in population order, each on original/technical/fast-oval track order, with the recorded generation/track seed formula and exact initial conditions',
    scenarioTraceSha256: createHash('sha256').update(JSON.stringify(scenarioTrace)).digest('hex'),
    rng: 'same seed-2028 xorshift stream replayed from initialization; full uint32 state retained in the continuation checkpoint',
    protocol: input.protocol,
  };
  const path = join(outputRoot, 'replay-validation.json');
  if (!existsSync(path)) atomicCreate(path, JSON.stringify(validation, null, 2));
  replayValidated = true;
  console.log('REPLAY VALIDATED: generations 1-94, all history rows, best network/reward/generation, and counters match exactly.');
}

if (!replayValidated) {
  if (trainer.generation > 94) throw new Error('A checkpoint beyond generation 94 lacks its replay-validation marker.');
  const replayResult = await trainer.train({
    stopAfterGeneration: 94,
    onCheckpoint: (state) => { if (state.generation % 5 === 0 || state.generation === 94) saveCheckpoint(state); },
  });
  if (replayResult.generation !== 94) throw new Error(`Replay ended at generation ${replayResult.generation}, not 94.`);
  validateReplay();
  saveCheckpoint(trainer.exportCheckpoint());
}

if (trainer.generation < 94) throw new Error('Validated continuation state is earlier than generation 94.');
const result = await trainer.train({
  onGeneration: (entry) => {
    if (entry.generation === 95 || entry.generation % 10 === 0 || entry.generation === 250) {
      console.log(`C seed=2028 gen=${entry.generation}/250 best=${entry.globalBestReward.toFixed(2)} mean=${entry.meanReward.toFixed(2)} elapsed=${((performance.now() - started) / 1000).toFixed(1)}s`);
    }
  },
  onCheckpoint: (state) => {
    if (state.generation % 5 === 0 || state.generation === 250) {
      saveCheckpoint(state);
      writeProgress(state, 'continuation');
    }
  },
});
if (result.generation !== 250 || result.history.length !== 250 || result.evaluations !== 4000 || result.stopped) {
  throw new Error('Seed 2028 did not complete exactly 250 generations and 4,000 candidate evaluations.');
}
const physicalEpisodes = result.history.reduce((sum, row) => sum + row.physicalEpisodeEvaluations, 0);
if (physicalEpisodes !== 12000) throw new Error(`Expected 12,000 physical episodes for seed 2028, got ${physicalEpisodes}.`);
const hashesAfter = hashFiles();
if (!isDeepStrictEqual(hashesBefore, hashesAfter)) throw new Error('A historical phase 7 or phase 8 B artifact changed during recovery.');

const finalRun = {
  seed: 2028, generationsCompleted: 250, candidateEvaluations: result.evaluations,
  physicalEpisodeEvaluations: physicalEpisodes, elapsedWallSeconds: priorRecoverySeconds + (performance.now() - started) / 1000,
  stopped: false, bestFitness: result.bestReward, bestNetwork: result.bestNetwork,
  bestGeneration: trainer.bestGeneration, history: result.history.map(({ bestNetwork, ...row }) => row),
};
const finalDocument = {
  ...input, status: 'training-complete', completedSeeds: 3,
  recovery: {
    method: 'deterministic-replay-then-exact-checkpoint-restore', attemptId,
    replayValidated: true, replayedGenerations: 94, continuationStartedAt: 95,
    recoveryWallSeconds: finalRun.elapsedWallSeconds,
  },
  elapsedWallSeconds: input.elapsedWallSeconds + finalRun.elapsedWallSeconds,
  runs: [...input.runs.filter((run) => run.seed !== 2028), finalRun],
  historicalArtifactsUnchanged: true,
  historicalArtifactSha256: hashesAfter,
};
writeImmutable(join(modelRoot, 'seed-2028.json'), JSON.stringify({ phase: '8-C', seed: 2028, architecture: [7, 16, 16, 2],
  generation: 250, fitness: result.bestReward, network: result.bestNetwork }, null, 2));
writeImmutable(join(outputRoot, 'training.json'), JSON.stringify(finalDocument, null, 2));
writeImmutable(join(outputRoot, 'generation-statistics.csv'), trainingHistoryToCsv(finalDocument.runs));
writeImmutable(join(outputRoot, 'completion-manifest.json'), JSON.stringify({ attemptId, status: 'training-complete',
  seed2028Generations: 250, seed2028CandidateEvaluations: 4000, seed2028PhysicalEpisodes: 12000,
  replayValidation: JSON.parse(readFileSync(join(outputRoot, 'replay-validation.json'), 'utf8')),
  historicalArtifactSha256: hashesAfter }, null, 2));
console.log(`C seed=2028 complete; 250 generations, 4,000 candidates, ${physicalEpisodes} physical episodes; elapsed=${finalRun.elapsedWallSeconds.toFixed(1)}s; historical A/B unchanged=true.`);
