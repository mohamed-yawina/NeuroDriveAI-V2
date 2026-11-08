import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';

const load = (file) => JSON.parse(readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8'));
const loadResult = (file) => JSON.parse(readFileSync(new URL(`../results/${file}`, import.meta.url), 'utf8'));

describe('Phase 9 presentation assets', () => {
  it('ships a valid, unchanged public network for each Phase 8 configuration', () => {
    const sources = {
      A: loadResult('phase7-multitrack-training.json'),
      B: loadResult('phase8-b/training.json'),
      C: loadResult('phase8-c-recovered-resume-20261102-2231/training.json'),
    };
    for (const configuration of ['A', 'B', 'C']) {
      const preset = load(`phase8-model-${configuration.toLowerCase()}.json`);
      expect(preset.configuration).toBe(configuration);
      expect(preset.seed).toBeTypeOf('number');
      expect(NeuralNetwork.fromJSON(preset.network).toJSON()).toEqual(preset.network);
      const bestRun = sources[configuration].runs.reduce((best, run) => run.bestFitness > best.bestFitness ? run : best);
      expect(preset.seed).toBe(bestRun.seed);
      expect(preset.fitness).toBe(bestRun.bestFitness);
      expect(preset.network).toEqual(bestRun.bestNetwork);
    }
  });

  it('contains independent validation data for A, B and C on every known circuit', () => {
    const summary = load('phase8-comparison.json');
    expect(summary.configurations.C.fitnessCurve).toHaveLength(250);
    expect(summary.validationCircuits.length).toBeGreaterThanOrEqual(3);
    for (const circuit of summary.validationCircuits) {
      for (const configuration of ['A', 'B', 'C']) {
        expect(circuit[configuration].total).toBeGreaterThan(0);
        expect(circuit[configuration].completed).toBeGreaterThanOrEqual(0);
      }
    }
    const recoveredC = loadResult('phase8-c-recovered-resume-20261102-2231/training.json');
    expect(recoveredC.status).toBe('training-complete');
    expect(recoveredC.runs.map((run) => run.history.length)).toEqual([250, 250, 250]);
  });
});
