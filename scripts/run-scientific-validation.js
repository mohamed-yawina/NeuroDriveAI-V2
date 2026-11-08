import { mkdirSync, writeFileSync } from 'node:fs';
import { createTrackDefinition } from '../src/scene/trackGeometry.js';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { GeneticTrainer } from '../src/ai/training/GeneticTrainer.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';
import { ControllerComparison } from '../src/ai/training/ControllerComparison.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';

const arg = (name, fallback) => {
  const value = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
};
const seeds = arg('seeds', '2026,2027,2028').split(',').map(Number);
const generations = Number(arg('generations', '250'));
const populationSize = Number(arg('population', '16'));
if (seeds.length < 3 || seeds.some((seed) => !Number.isInteger(seed))) throw new Error('Provide at least three integer seeds.');

const track = createTrackDefinition();
const runs = [];
for (const [runIndex, seed] of seeds.entries()) {
  console.log(`Starting run ${runIndex + 1}/${seeds.length}: seed=${seed}, generations=${generations}, population=${populationSize}`);
  const environment = new TrainingEnvironment(track, { seed });
  const trainer = new GeneticTrainer({ environment, seed, generations, populationSize, eliteCount: Math.min(4, populationSize - 1) });
  const result = await trainer.train({ onGeneration: (entry) => {
    if (entry.generation === 1 || entry.generation % 10 === 0 || entry.generation === generations) {
      console.log(`seed=${seed} gen=${entry.generation} best=${entry.bestReward.toFixed(2)} global=${entry.globalBestReward.toFixed(2)} mean=${entry.meanReward.toFixed(2)} laps=${entry.successfulLaps}/${populationSize}`);
    }
  } });
  const history = result.history.map(({ bestNetwork, ...metrics }) => metrics);
  const run = { seed, generationsCompleted: result.history.length, evaluations: result.evaluations, stopped: result.stopped, bestReward: result.bestReward, bestNetwork: result.bestNetwork, history };
  runs.push(run);
  console.log(`Finished seed=${seed}: generations=${run.generationsCompleted}, evaluations=${run.evaluations}, best=${run.bestReward.toFixed(2)}`);
}

const comparisonRunner = new ControllerComparison(track);
const comparisons = runs.map((run) => comparisonRunner.run({ network: NeuralNetwork.fromJSON(run.bestNetwork), seed: run.seed }));
const rewards = runs.map((run) => run.bestReward);
const rewardMean = rewards.reduce((sum, value) => sum + value, 0) / rewards.length;
const rewardSd = Math.sqrt(rewards.reduce((sum, value) => sum + (value - rewardMean) ** 2, 0) / (rewards.length - 1));
const output = {
  protocol: { generations, populationSize, eliteCount: Math.min(4, populationSize - 1), seeds, fixedDeltaTime: 1 / 30, lapValidationFraction: 0.95, sameEpisodeSeedForAllIndividuals: true },
  variability: { bestRewardMean: rewardMean, bestRewardSampleSd: rewardSd, runs: runs.length },
  runs,
  comparisons,
};
mkdirSync('results', { recursive: true });
writeFileSync('results/phase4-scientific-validation.json', JSON.stringify(output, null, 2));
writeFileSync('results/phase4-generation-statistics.csv', trainingHistoryToCsv(runs));
console.log(`Saved actual results to results/phase4-scientific-validation.json and results/phase4-generation-statistics.csv`);
