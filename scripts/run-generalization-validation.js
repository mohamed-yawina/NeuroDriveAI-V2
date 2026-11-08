import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { RobustnessEvaluator } from '../src/ai/training/RobustnessEvaluator.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { generalizationResultsToCsv } from '../src/ai/training/GeneralizationCsv.js';

const saved = JSON.parse(readFileSync('results/phase4-scientific-validation.json', 'utf8'));
if (!saved.runs || saved.runs.length < 3) throw new Error('Expected the three saved phase 4 trained networks.');
const networks = saved.runs.map((run) => ({ seed: run.seed, network: NeuralNetwork.fromJSON(run.bestNetwork) }));
const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 93001, maxEpisodeTime: 60 });
const tracks = createGeneralizationTracks();
console.log(`Evaluating ${networks.length} frozen networks on ${tracks.length} circuits × 30 paired scenarios...`);
const result = evaluator.run({ tracks, networks });
if (result.circuits.some((circuit) => circuit.neuralNetworks.some((entry) => !entry.networkWeightsUnchanged))) {
  throw new Error('A trained network changed during evaluation.');
}
mkdirSync('results', { recursive: true });
writeFileSync('results/phase6-generalization-validation.json', JSON.stringify(result, null, 2));
writeFileSync('results/phase6-generalization-validation.csv', generalizationResultsToCsv(result));
for (const circuit of result.circuits) {
  console.log(`${circuit.track.id}: Steering ${(100 * circuit.steering.completion.rate).toFixed(1)}% completion; ${circuit.neuralNetworks.map((run) => `Neural seed ${run.trainingSeed} ${(100 * run.neural.completion.rate).toFixed(1)}%`).join(', ')}`);
}
console.log('Saved actual results to results/phase6-generalization-validation.json and results/phase6-generalization-validation.csv');
