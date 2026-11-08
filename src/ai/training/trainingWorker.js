import { GeneticTrainer } from './GeneticTrainer.js';
import { TrainingEnvironment } from './TrainingEnvironment.js';
import { ControllerComparison } from './ControllerComparison.js';
import { NeuralNetwork } from '../neural/NeuralNetwork.js';
import { createGeneralizationTracks } from './GeneralizationTracks.js';
import { createTrackDefinition } from '../../scene/trackGeometry.js';

let trainer = null;

self.onmessage = async ({ data }) => {
  if (data?.type === 'stop') {
    trainer?.stop();
    return;
  }
  if (data?.type === 'compare') {
    try {
      const trackDefinition = createTrackDefinition();
      const comparison = new ControllerComparison(trackDefinition);
      const network = NeuralNetwork.fromJSON(data.network);
      const results = data.seeds.map((seed) => comparison.run({ network, seed }));
      self.postMessage({ type: 'comparison-complete', results });
    } catch (error) {
      self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (data?.type !== 'start') return;
  try {
    const { generations = 250, populationSize = 16, seed = 2026, seeds = [seed], mode = 'single', trackIds = ['original', 'technical', 'fast-oval'] } = data.config ?? {};
    const availableTracks = createGeneralizationTracks();
    const selectedTracks = mode === 'multi' ? availableTracks.filter((track) => trackIds.includes(track.id)) : [availableTracks[0]];
    if (mode === 'multi' && selectedTracks.length < 2) throw new Error('Multi-track mode needs at least two selected circuits.');
    const runs = [];
    for (let runIndex = 0; runIndex < seeds.length; runIndex++) {
      const runSeed = seeds[runIndex];
      const environment = new TrainingEnvironment(mode === 'multi' ? selectedTracks : selectedTracks[0], { seed: runSeed });
      trainer = new GeneticTrainer({ environment, generations, populationSize, eliteCount: Math.min(4, populationSize - 1), seed: runSeed });
      const result = await trainer.train({ onGeneration: (generation) => self.postMessage({ type: 'generation', runIndex, seed: runSeed, generation }) });
      const physicalEpisodeEvaluations = result.history.reduce((sum, generation) => sum + (generation.physicalEpisodeEvaluations ?? generation.evaluations), 0);
      const run = { runIndex, seed: runSeed, mode, trackIds: selectedTracks.map((track) => track.id), bestReward: result.bestReward, evaluations: result.evaluations, physicalEpisodeEvaluations, generationsCompleted: result.history.length, stopped: result.stopped, bestNetwork: result.bestNetwork };
      runs.push(run);
      self.postMessage({ type: 'run-complete', run });
      trainer = null;
      if (result.stopped) break;
    }
    self.postMessage({ type: 'complete', runs });
    trainer = null;
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    trainer = null;
  }
};
