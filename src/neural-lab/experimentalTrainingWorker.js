import { ExperimentalNetwork, ExperimentalBrainAdapter, TrainingStopConditions, builtInTracks, runRaceHeat } from './ExperimentProtocol.js';
import { RaceController } from '../game/RaceController.js';
import { ExperimentalGeneticTrainer } from './ExperimentalGeneticTrainer.js';

let trainer = null;
self.onmessage = async ({ data }) => {
  if (data?.type === 'stop') { trainer?.stop(); return; }
  if (data?.type !== 'start' || trainer) return;
  try {
    const config = data.config;
    const track = builtInTracks().find((entry) => entry.id === config.trackId);
    if (!track) throw new Error('Experimental training requires a supported built-in track.');
    const stopConditions = new TrainingStopConditions(config.stopConditions);
    if (config.generations > 5 || config.populationSize > 8 || config.stopConditions.maxEpisodes > 40 || config.maxSteps > 1800) throw new RangeError('Worker validation budget exceeds its short-run limits.');
    trainer = new ExperimentalGeneticTrainer({ networkConfig: config.networkConfig, trainingProtocol: { trackId: config.trackId, maxSteps: config.maxSteps }, stopConfiguration: config.stopConditions, generations: config.generations, populationSize: config.populationSize, eliteCount: Math.min(2, config.populationSize - 1), seed: config.seed, checkpoint: data.checkpoint ?? null });
    const result = await trainer.train({
      evaluate: async (network, episode) => {
        const experimentalFirst = episode.episode % 2 === 1;
        const neural = { name: 'Experimental candidate', createController: () => new ExperimentalBrainAdapter(network, track) };
        const steering = { name: 'Steering baseline', createController: (t) => new RaceController(t) };
        const roster = experimentalFirst ? [neural, steering] : [steering, neural];
        const heat = await runRaceHeat(track, roster, { seed: episode.seed, laps: 1, maxSteps: config.maxSteps ?? 1800 });
        const own = heat.results.find((item) => item.driver === neural.name);
        return { fitness: own.laps * 1000 + own.progress * 100 - own.collisions * 2 - own.offTrackTime * 5, success: own.success, trackId: track.id };
      },
      stopConditions,
      onGeneration: (generation) => self.postMessage({ type: 'generation', generation }),
      onCheckpoint: (checkpoint) => self.postMessage({ type: 'checkpoint', checkpoint }),
    });
    self.postMessage({ type: 'complete', result });
  } catch (error) { self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }); }
  finally { trainer = null; }
};
