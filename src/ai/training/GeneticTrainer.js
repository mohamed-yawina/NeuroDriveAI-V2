import { NeuralNetwork } from '../neural/NeuralNetwork.js';
import { createSeededRandom } from './random.js';

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Fully evaluates every member before breeding the next generation. */
export class GeneticTrainer {
  constructor({
    environment,
    generations = 250,
    populationSize = 16,
    eliteCount = 4,
    mutationRate = 0.08,
    mutationSigma = 0.12,
    seed = 2026,
    checkpoint = null,
  } = {}) {
    if (!environment) throw new TypeError('GeneticTrainer requires an evaluation environment.');
    if (!Number.isInteger(generations) || generations < 1) throw new RangeError('generations must be a positive integer.');
    if (!Number.isInteger(populationSize) || populationSize < 2) throw new RangeError('populationSize must be at least 2.');
    if (!Number.isInteger(eliteCount) || eliteCount < 1 || eliteCount >= populationSize) throw new RangeError('eliteCount must be positive and smaller than populationSize.');
    this.environment = environment;
    this.generations = generations;
    this.populationSize = populationSize;
    this.eliteCount = eliteCount;
    this.mutationRate = mutationRate;
    this.mutationSigma = mutationSigma;
    this.seed = seed;
    this.random = createSeededRandom(seed);
    this.population = Array.from({ length: populationSize }, () => new NeuralNetwork({ random: this.random }));
    this.bestNetwork = null;
    this.bestReward = -Infinity;
    this.history = [];
    this.evaluations = 0;
    this.stopRequested = false;
    this.generation = 0;
    this.bestGeneration = null;
    if (checkpoint) this.restoreCheckpoint(checkpoint);
  }

  exportCheckpoint() {
    if (!this.random.getState) throw new Error('The random generator cannot export its state.');
    return {
      schemaVersion: 1,
      configuration: {
        generations: this.generations,
        populationSize: this.populationSize,
        eliteCount: this.eliteCount,
        mutationRate: this.mutationRate,
        mutationSigma: this.mutationSigma,
        seed: this.seed,
      },
      generation: this.generation,
      population: this.population.map((network) => network.toJSON()),
      randomState: this.random.getState(),
      bestReward: this.bestReward,
      bestGeneration: this.bestGeneration,
      bestNetwork: this.bestNetwork?.toJSON() ?? null,
      evaluations: this.evaluations,
      history: this.history.map(({ bestNetwork, ...record }) => record),
    };
  }

  restoreCheckpoint(checkpoint) {
    if (!checkpoint || checkpoint.schemaVersion !== 1) throw new TypeError('Unsupported genetic trainer checkpoint.');
    const expected = {
      generations: this.generations,
      populationSize: this.populationSize,
      eliteCount: this.eliteCount,
      mutationRate: this.mutationRate,
      mutationSigma: this.mutationSigma,
      seed: this.seed,
    };
    if (JSON.stringify(checkpoint.configuration) !== JSON.stringify(expected)) throw new Error('Checkpoint training parameters do not match this trainer.');
    if (!Number.isInteger(checkpoint.generation) || checkpoint.generation < 0 || checkpoint.generation > this.generations
      || !Array.isArray(checkpoint.population) || checkpoint.population.length !== this.populationSize
      || !Array.isArray(checkpoint.history) || checkpoint.history.length !== checkpoint.generation
      || checkpoint.evaluations !== checkpoint.generation * this.populationSize
      || !Number.isInteger(checkpoint.randomState) || checkpoint.randomState <= 0 || checkpoint.randomState > 0xffffffff) {
      throw new Error('Checkpoint trainer state is incomplete or inconsistent.');
    }
    if (checkpoint.generation > 0 && (!checkpoint.bestNetwork || !Number.isFinite(checkpoint.bestReward)
      || !Number.isInteger(checkpoint.bestGeneration) || checkpoint.bestGeneration < 1 || checkpoint.bestGeneration > checkpoint.generation)) {
      throw new Error('Checkpoint is missing the global-best state.');
    }
    this.population = checkpoint.population.map((network) => NeuralNetwork.fromJSON(network));
    this.random.setState(checkpoint.randomState);
    this.bestNetwork = checkpoint.bestNetwork ? NeuralNetwork.fromJSON(checkpoint.bestNetwork) : null;
    this.bestReward = checkpoint.bestReward;
    this.bestGeneration = checkpoint.bestGeneration;
    this.evaluations = checkpoint.evaluations;
    this.history = checkpoint.history.map((record) => ({ ...record }));
    this.generation = checkpoint.generation;
    return this;
  }

  stop() { this.stopRequested = true; }

  tournament(ranked, size = 3) {
    let best = null;
    for (let i = 0; i < size; i++) {
      const candidate = ranked[Math.floor(this.random() * ranked.length)];
      if (!best || candidate.reward > best.reward) best = candidate;
    }
    return best.network;
  }

  breed(ranked) {
    const next = [this.bestNetwork.copy()];
    const globalBest = JSON.stringify(this.bestNetwork.toJSON());
    for (const entry of ranked) {
      if (next.length >= this.eliteCount) break;
      if (JSON.stringify(entry.network.toJSON()) !== globalBest) next.push(entry.network.copy());
    }
    while (next.length < this.populationSize) {
      const child = this.tournament(ranked).copy();
      child.mutate({ rate: this.mutationRate, sigma: this.mutationSigma, random: this.random });
      next.push(child);
    }
    return next;
  }

  async train({ onGeneration = () => {}, onCheckpoint = null, shouldStop = () => false, stopAfterGeneration = null } = {}) {
    if (stopAfterGeneration !== null && (!Number.isInteger(stopAfterGeneration) || stopAfterGeneration < this.generation || stopAfterGeneration > this.generations)) {
      throw new RangeError('stopAfterGeneration must be a valid generation boundary.');
    }
    this.stopRequested = false;
    for (let generation = this.generation + 1; generation <= this.generations; generation++) {
      if (this.stopRequested || shouldStop()) break;
      this.generation = generation;
      const ranked = [];
      let successfulLaps = 0;
      let physicalEpisodeEvaluations = 0;
      for (const network of this.population) {
        if (this.stopRequested || shouldStop()) break;
        const result = this.environment.evaluateAcrossTracks
          ? await this.environment.evaluateAcrossTracks({ network, seed: this.seed, generation })
          : await this.environment.runEpisode({ network, seed: this.seed });
        this.evaluations++;
        const reward = result.reward;
        if (!Number.isFinite(reward)) throw new Error(`Episode returned a non-finite reward at generation ${generation}.`);
        ranked.push({ network, reward, result });
        physicalEpisodeEvaluations += result.circuitEpisodes?.length ?? 1;
        successfulLaps += result.telemetry?.completedLaps ?? 0;
        if (reward > this.bestReward) {
          this.bestReward = reward;
          this.bestGeneration = generation;
          this.bestNetwork = network.copy();
        }
        await yieldToEventLoop();
      }
      if (ranked.length !== this.populationSize) break;
      ranked.sort((a, b) => b.reward - a.reward);
      const meanReward = ranked.reduce((sum, entry) => sum + entry.reward, 0) / ranked.length;
      const meanMetric = (read) => ranked.reduce((sum, entry) => sum + (read(entry.result) ?? 0), 0) / ranked.length;
      const physicalResults = ranked.flatMap((entry) => entry.result.circuitEpisodes ?? [entry.result]);
      const reasons = Object.fromEntries(['objective', 'off-track', 'blocked', 'time-limit'].map((reason) => [reason, physicalResults.filter((episode) => episode.reason === reason).length]));
      const bestTelemetry = ranked[0].result.telemetry ?? {};
      const bestFitness = ranked[0].result.fitness ?? null;
      const meanCircuitMetrics = bestFitness?.circuitScores.map((bestCircuit, circuitIndex) => {
        const scores = ranked.map((entry) => entry.result.fitness.circuitScores[circuitIndex]);
        const avg = (read) => scores.reduce((sum, score) => sum + read(score), 0) / scores.length;
        return {
          trackId: bestCircuit.trackId,
          meanPerformance: avg((score) => score.performance),
          meanSuccessRate: avg((score) => Number(score.completed)),
          meanProgressRatio: avg((score) => score.progressRatio),
          meanOffTrackEventsPerCircuit: avg((score) => score.offTrackEventsPerCircuit),
          meanNormalizedRewardPer100Meters: avg((score) => score.normalizedRewardPer100Meters),
        };
      }) ?? null;
      const record = {
        seed: this.seed,
        generation,
        bestReward: ranked[0].reward,
        globalBestReward: this.bestReward,
        meanReward,
        successfulLaps,
        evaluations: ranked.length,
        physicalEpisodeEvaluations,
        fitnessAggregation: bestFitness?.aggregationWeights ?? null,
        bestCandidateFitnessScore: bestFitness?.fitness ?? null,
        meanCircuitPerformance: meanMetric((result) => result.fitness?.meanPerformance),
        meanWorstCircuitPerformance: meanMetric((result) => result.fitness?.worstCircuitPerformance),
        meanCandidateSuccessRate: meanMetric((result) => result.fitness?.successRate),
        meanNormalizedProgressRatio: meanMetric((result) => result.fitness?.meanProgressRatio),
        meanOffTrackEventsPerCircuit: meanMetric((result) => result.fitness?.meanOffTrackEventsPerCircuit),
        bestCandidateFitness: bestFitness,
        meanCircuitMetrics,
        bestEpisodeReason: ranked[0].result.reason ?? 'unknown',
        bestEpisodeCompletedLaps: bestTelemetry.completedLaps ?? 0,
        bestEpisodeSignedProgress: bestTelemetry.signedProgress ?? null,
        bestEpisodeDistanceTravelled: bestTelemetry.distanceTravelled ?? null,
        bestEpisodeOffTrackEvents: bestTelemetry.offTrackEvents ?? 0,
        bestEpisodeOffTrackDuration: bestTelemetry.offTrackDuration ?? 0,
        bestEpisodeBlockedTime: bestTelemetry.blockedTime ?? 0,
        bestEpisodeMeanLateralError: bestTelemetry.meanLateralError ?? 0,
        meanDistanceTravelled: ranked[0].result.circuitEpisodes ? null : meanMetric((result) => result.telemetry?.distanceTravelled),
        meanSignedProgress: ranked[0].result.circuitEpisodes ? null : meanMetric((result) => result.telemetry?.signedProgress),
        meanCompletedLaps: meanMetric((result) => result.telemetry?.completedLaps),
        meanOffTrackEvents: meanMetric((result) => result.telemetry?.offTrackEvents),
        meanOffTrackDuration: meanMetric((result) => result.telemetry?.offTrackDuration),
        meanBlockedTime: meanMetric((result) => result.telemetry?.blockedTime),
        meanLateralError: meanMetric((result) => result.telemetry?.meanLateralError),
        meanAverageSpeed: meanMetric((result) => result.telemetry?.averageSpeed),
        meanMaxSpeed: meanMetric((result) => result.telemetry?.maxSpeed),
        meanEpisodeTime: meanMetric((result) => result.telemetry?.simulatedTime),
        terminationReasons: reasons,
        bestNetwork: this.bestNetwork.toJSON(),
      };
      this.history.push(record);
      onGeneration(record);
      if (generation < this.generations && !this.stopRequested && !shouldStop()) this.population = this.breed(ranked);
      if (onCheckpoint) await onCheckpoint(this.exportCheckpoint());
      if (generation === stopAfterGeneration) break;
    }
    return {
      history: [...this.history],
      bestReward: this.bestReward,
      bestNetwork: this.bestNetwork?.toJSON() ?? null,
      evaluations: this.evaluations,
      generation: this.generation,
      stopped: this.stopRequested || this.history.length < this.generations,
    };
  }
}
