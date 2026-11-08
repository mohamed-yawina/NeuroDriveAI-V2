import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const phase8CDir = process.argv.find((argument) => argument.startsWith('--phase8-c-dir='))?.split('=').slice(1).join('=')
  ?? 'results/phase8-c-recovered-resume-20261102-2231';
const phase8CTrainingPath = resolve(phase8CDir, 'training.json');
const phase8CComparisonPath = resolve(phase8CDir, 'comparison-a-b-c.json');

const phase7 = JSON.parse(readFileSync('results/phase7-multitrack-training.json', 'utf8'));
const phase8 = JSON.parse(readFileSync('results/phase8-b/training.json', 'utf8'));
const comparison = JSON.parse(readFileSync('results/phase8-b/comparison-summary.json', 'utf8'));
const phase8C = JSON.parse(readFileSync(phase8CTrainingPath, 'utf8'));
const comparisonABC = JSON.parse(readFileSync(phase8CComparisonPath, 'utf8'));
if (phase8.status !== 'training-complete' || phase8C.status !== 'training-complete'
  || !comparison.historicalArtifactsUnchanged || !comparisonABC.historicalArtifactsUnchanged) {
  throw new Error('Cannot publish an incomplete comparison or one with changed historical artifacts.');
}

function summarizeTraining(training) {
  const generations = Math.max(...training.runs.map((run) => run.history.length));
  const fitnessCurve = Array.from({ length: generations }, (_, index) => {
    const entries = training.runs.map((run) => run.history[index]).filter(Boolean);
    return {
      generation: index + 1,
      meanPopulationFitness: entries.reduce((sum, entry) => sum + entry.meanReward, 0) / entries.length,
      meanBestSoFarFitness: entries.reduce((sum, entry) => sum + entry.globalBestReward, 0) / entries.length,
    };
  });
  const bestRun = training.runs.reduce((best, run) => run.bestFitness > best.bestFitness ? run : best, training.runs[0]);
  return { fitnessCurve, bestSeed: bestRun.seed, bestFitness: bestRun.bestFitness, bestModel: bestRun.bestNetwork };
}

const a = summarizeTraining(phase7);
const b = summarizeTraining(phase8);
const c = summarizeTraining(phase8C);
const { bestModel: bestModelA, ...aSummary } = a;
const { bestModel: bestModelB, ...bSummary } = b;
const { bestModel: bestModelC, ...cSummary } = c;
const validationCircuits = comparisonABC.validationByCircuit.map((circuit) => ({
  circuit: circuit.circuit,
  steeringCompletion: circuit.steering.completion.rate,
  A: {
    completionRate: circuit.configurations.A.acrossSeeds.completionRate.mean,
    completionSd: circuit.configurations.A.acrossSeeds.completionRate.sd,
    completed: circuit.configurations.A.acrossSeeds.totalCompleted,
    total: circuit.configurations.A.acrossSeeds.totalScenarios,
  },
  B: {
    completionRate: circuit.configurations.B.acrossSeeds.completionRate.mean,
    completionSd: circuit.configurations.B.acrossSeeds.completionRate.sd,
    completed: circuit.configurations.B.acrossSeeds.totalCompleted,
    total: circuit.configurations.B.acrossSeeds.totalScenarios,
  },
  C: {
    completionRate: circuit.configurations.C.acrossSeeds.completionRate.mean,
    completionSd: circuit.configurations.C.acrossSeeds.completionRate.sd,
    completed: circuit.configurations.C.acrossSeeds.totalCompleted,
    total: circuit.configurations.C.acrossSeeds.totalScenarios,
  },
}));
const summary = {
  validationSeed: comparisonABC.protocol.scenarioSeed,
  scenariosPerSeedPerCircuit: comparisonABC.protocol.scenariosPerNetworkPerCircuit,
  validationCircuits,
  configurations: {
    A: {
      generations: phase7.protocol.generations,
      populationSize: phase7.protocol.populationSize,
      physicalEpisodes: phase7.runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0),
      trainingSeconds: null,
      trainingTimeNote: 'Not recorded in the phase 7 artifact.',
      ...aSummary,
    },
    B: {
      generations: phase8.protocol.generations,
      populationSize: phase8.protocol.populationSize,
      physicalEpisodes: phase8.runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0),
      trainingSeconds: phase8.elapsedWallSeconds,
      ...bSummary,
    },
    C: {
      generations: phase8C.protocol.generations,
      populationSize: phase8C.protocol.populationSize,
      physicalEpisodes: phase8C.runs.reduce((sum, run) => sum + run.physicalEpisodeEvaluations, 0),
      trainingSeconds: phase8C.elapsedWallSeconds,
      ...cSummary,
    },
  },
};
mkdirSync('public', { recursive: true });
writeFileSync('public/phase8-comparison.json', JSON.stringify(summary));
writeFileSync('public/phase8-model-a.json', JSON.stringify({ configuration: 'A', seed: a.bestSeed, fitness: a.bestFitness, network: bestModelA }));
writeFileSync('public/phase8-model-b.json', JSON.stringify({ configuration: 'B', seed: b.bestSeed, fitness: b.bestFitness, network: bestModelB }));
writeFileSync('public/phase8-model-c.json', JSON.stringify({ configuration: 'C', seed: c.bestSeed, fitness: c.bestFitness, network: bestModelC }));
console.log(`Published AI Lab summary. Best seeds: A ${a.bestSeed}, B ${b.bestSeed}, C ${c.bestSeed}.`);
