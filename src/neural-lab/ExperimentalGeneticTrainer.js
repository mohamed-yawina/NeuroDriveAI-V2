import { createSeededRandom } from '../ai/training/random.js';
import { ExperimentalNetwork, TrainingStopConditions } from './ExperimentProtocol.js';

/** Isolated GA for the configurable arcade brain; checkpoints are generation-boundary complete. */
export class ExperimentalGeneticTrainer {
  constructor({ networkConfig, trainingProtocol = {}, stopConfiguration = {}, generations = 10, populationSize = 8, eliteCount = 2, mutationRate = 0.08, mutationSigma = 0.12, seed = 13013, checkpoint = null } = {}) {
    if (!Number.isInteger(generations) || generations < 1 || !Number.isInteger(populationSize) || populationSize < 2) throw new RangeError('Invalid experimental GA budget.');
    if (!Number.isInteger(eliteCount) || eliteCount < 1 || eliteCount >= populationSize) throw new RangeError('Experimental elite count must be smaller than the population.');
    this.networkConfig = structuredClone(networkConfig ?? {});
    this.configuration = { generations, populationSize, eliteCount, mutationRate, mutationSigma, seed: seed >>> 0, networkConfig: this.networkConfig, trainingProtocol: structuredClone(trainingProtocol), stopConfiguration: structuredClone(stopConfiguration) };
    this.random = createSeededRandom(this.configuration.seed);
    this.population = Array.from({ length: populationSize }, () => new ExperimentalNetwork({ ...this.networkConfig, random: this.random }));
    this.generation = 0; this.evaluations = 0; this.bestFitness = -Infinity; this.bestNetwork = null; this.bestGeneration = null; this.history = []; this.stopRequested = false;
    if (checkpoint) this.restoreCheckpoint(checkpoint);
  }
  exportCheckpoint() {
    return { format: 'neurodrive-experimental-checkpoint', version: 1, configuration: structuredClone(this.configuration), generation: this.generation, population: this.population.map((n) => n.toJSON()), randomState: this.random.getState(), bestFitness: this.bestFitness, bestGeneration: this.bestGeneration, bestNetwork: this.bestNetwork?.toJSON() ?? null, evaluations: this.evaluations, history: structuredClone(this.history) };
  }
  restoreCheckpoint(c) {
    if (c?.format !== 'neurodrive-experimental-checkpoint' || c.version !== 1 || JSON.stringify(c.configuration) !== JSON.stringify(this.configuration)) throw new Error('Checkpoint experimental incompatible (version or parameters).');
    if (!Number.isInteger(c.generation) || c.generation < 0 || c.generation > this.configuration.generations || !Array.isArray(c.population) || c.population.length !== this.configuration.populationSize || c.history?.length !== c.generation || c.evaluations !== c.generation * this.configuration.populationSize || !Number.isInteger(c.randomState)) throw new Error('Checkpoint experimental incomplet ou hors limite génération.');
    this.population = c.population.map((model) => ExperimentalNetwork.fromJSON(model));
    this.random.setState(c.randomState); this.generation = c.generation; this.evaluations = c.evaluations; this.bestFitness = c.bestFitness; this.bestGeneration = c.bestGeneration; this.bestNetwork = c.bestNetwork ? ExperimentalNetwork.fromJSON(c.bestNetwork) : null; this.history = structuredClone(c.history);
    if (this.generation > 0 && (!this.bestNetwork || !Number.isFinite(this.bestFitness) || !Number.isInteger(this.bestGeneration) || this.bestGeneration < 1 || this.bestGeneration > this.generation)) throw new Error('Checkpoint missing global-best network.');
    return this;
  }
  stop() { this.stopRequested = true; }
  breed(ranked) {
    const elites = ranked.slice(0, this.configuration.eliteCount).map(({ network }) => network.copy());
    while (elites.length < this.configuration.populationSize) elites.push(ranked[Math.floor(this.random() * ranked.length)].network.copy().mutate({ rate: this.configuration.mutationRate, sigma: this.configuration.mutationSigma, random: this.random }));
    return elites;
  }
  async train({ evaluate, stopConditions, onGeneration = () => {}, onCheckpoint = () => {} } = {}) {
    if (typeof evaluate !== 'function' || !(stopConditions instanceof TrainingStopConditions)) throw new TypeError('Evaluator and TrainingStopConditions are required.');
    if (stopConditions.maxEpisodes < this.configuration.populationSize) throw new RangeError('Episode budget must fit at least one complete generation.');
    this.stopRequested = false;
    while (this.generation < Math.min(this.configuration.generations, stopConditions.maxGenerations)
      && (this.generation + 1) * this.configuration.populationSize <= stopConditions.maxEpisodes
      && !this.stopRequested) {
      const nextGeneration = this.generation + 1;
      const ranked = [];
      for (const network of this.population) {
        const result = await evaluate(network, { generation: nextGeneration, episode: this.evaluations + 1, seed: (this.configuration.seed + this.evaluations) >>> 0 });
        if (!Number.isFinite(result.fitness)) throw new Error('Experimental evaluator returned non-finite fitness.');
        ranked.push({ network, ...result }); this.evaluations++;
      }
      ranked.sort((a, b) => b.fitness - a.fitness);
      if (ranked[0].fitness > this.bestFitness) { this.bestFitness = ranked[0].fitness; this.bestNetwork = ranked[0].network.copy(); this.bestGeneration = nextGeneration; }
      const record = { generation: nextGeneration, evaluations: ranked.length, episodesTotal: this.evaluations, bestFitness: ranked[0].fitness, globalBestFitness: this.bestFitness, meanFitness: ranked.reduce((sum, item) => sum + item.fitness, 0) / ranked.length, successRate: ranked.reduce((sum, item) => sum + Number(Boolean(item.success)), 0) / ranked.length, trackId: ranked[0].trackId ?? null };
      this.history.push(record); this.generation = nextGeneration; onGeneration(record);
      const shouldStop = stopConditions.stop({ generations: this.generation, episodes: this.evaluations, fitness: this.bestFitness, successRate: record.successRate });
      // A resumable generation-boundary checkpoint must hold the next generation's population,
      // even when a manual stop was requested during the just-finished generation.
      if (this.generation < this.configuration.generations && !shouldStop) this.population = this.breed(ranked);
      onCheckpoint(this.exportCheckpoint());
      if (shouldStop || this.stopRequested) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    let bestNetwork = this.bestNetwork?.toJSON() ?? null;
    if (bestNetwork) bestNetwork.provenance.training = { algorithm: 'experimental-genetic-algorithm-v1', seed: this.configuration.seed, generations: this.generation, evaluations: this.evaluations, bestFitness: this.bestFitness, protocol: this.configuration.trainingProtocol, stopConditions: this.configuration.stopConfiguration };
    return { generation: this.generation, evaluations: this.evaluations, bestFitness: this.bestFitness, bestNetwork, history: structuredClone(this.history), stopped: this.stopRequested || this.generation < this.configuration.generations };
  }
}
