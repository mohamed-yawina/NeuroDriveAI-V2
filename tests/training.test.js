import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { GeneticTrainer } from '../src/ai/training/GeneticTrainer.js';
import { RewardCalculator } from '../src/ai/training/RewardCalculator.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';
import { createSeededRandom } from '../src/ai/training/random.js';
import { trainingHistoryToCsv } from '../src/ai/training/TrainingCsv.js';
import { ControllerComparison } from '../src/ai/training/ControllerComparison.js';
import { aggregateMultiTrackFitness } from '../src/ai/training/MultiTrackFitness.js';

const waypoints = [
  new Vector3(0, 0, 0), new Vector3(20, 0, 0), new Vector3(20, 0, 20), new Vector3(0, 0, 20),
];
const boundaries = [
  { start: new Vector3(-8, 0, -8), end: new Vector3(28, 0, -8) },
  { start: new Vector3(28, 0, -8), end: new Vector3(28, 0, 28) },
  { start: new Vector3(28, 0, 28), end: new Vector3(-8, 0, 28) },
  { start: new Vector3(-8, 0, 28), end: new Vector3(-8, 0, -8) },
];
const definition = { waypoints, boundaries };

function scoreFixture() {
  return {
    async runEpisode({ network }) {
      const score = network.layers[0].weights.flat().reduce((sum, value) => sum + value, 0);
      return { reward: score, telemetry: { completedLaps: score > 0 ? 1 : 0 } };
    },
  };
}

describe('Training environment and rewards', () => {
  it('runs fixed-step physical episodes without constructing a renderer and resets all episode state', () => {
    const environment = new TrainingEnvironment(definition, { seed: 17, fixedDeltaTime: 0.05, maxEpisodeTime: 0.1, randomizeSpawn: false });
    expect(environment.renderer).toBeUndefined();
    const network = new NeuralNetwork({ random: createSeededRandom(2) });
    const first = environment.runEpisode({ network, seed: 17 });
    expect(first.steps).toBe(2);
    expect(first.reason).toBe('time-limit');
    expect(environment.dynamics.telemetry.snapshot().simulatedTime).toBeCloseTo(0.1);
    environment.reset({ network, seed: 17 });
    expect(environment.dynamics.telemetry.snapshot().simulatedTime).toBe(0);
    expect(environment.dynamics.telemetry.snapshot().completedLaps).toBe(0);
    expect(environment.dynamics.path.steering.length()).toBe(0);
    expect(environment.dynamics.sensors.readings).toHaveLength(0);
    expect(environment.dynamics.observationBuilder.orientationError).toBe(0);
    expect(environment.controller.lastCommands).toEqual({ steering: 0, throttleBrake: 0 });
  });

  it('repeats an episode with the same seed, network, and environment settings', () => {
    const environment = new TrainingEnvironment(definition, { seed: 9, fixedDeltaTime: 0.05, maxEpisodeTime: 0.2, randomizeSpawn: true });
    const network = new NeuralNetwork({ random: createSeededRandom(8) });
    const a = environment.runEpisode({ network, seed: 44 });
    const b = environment.runEpisode({ network, seed: 44 });
    expect(a.reward).toBeCloseTo(b.reward, 10);
    expect(a.steps).toBe(b.steps);
    expect(a.metrics.telemetry.signedProgress).toBeCloseTo(b.metrics.telemetry.signedProgress, 10);
  });

  it('evaluates each candidate on all selected circuits with generation-matched randomized starts', async () => {
    const tracks = [
      { ...definition, id: 'circuit-a' },
      { ...definition, id: 'circuit-b' },
      { ...definition, id: 'circuit-c' },
    ];
    const environment = new TrainingEnvironment(tracks, { seed: 17, fixedDeltaTime: 0.05, maxEpisodeTime: 0.1 });
    const network = new NeuralNetwork({ random: createSeededRandom(3) });
    const a = await environment.evaluateAcrossTracks({ network, seed: 17, generation: 4 });
    const b = await environment.evaluateAcrossTracks({ network, seed: 17, generation: 4 });
    expect(a.circuitEpisodes.map((episode) => episode.trackId)).toEqual(['circuit-a', 'circuit-b', 'circuit-c']);
    expect(a.circuitEpisodes.map((episode) => episode.initialConditions)).toEqual(b.circuitEpisodes.map((episode) => episode.initialConditions));
    expect(new Set(a.circuitEpisodes.map((episode) => episode.initialConditions.initialSpeedMetersPerSecond)).size).toBeGreaterThan(1);
    expect(a.fitness.circuitScores).toHaveLength(3);
    expect(Number.isFinite(a.reward)).toBe(true);
    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
      const scenario = environment.createScenario({ seed: 1700 + trackIndex, trackIndex });
      environment.reset({ seed: scenario.seed, network, trackIndex, scenario });
      const observations = environment.dynamics.update(1 / 60).observations;
      expect(observations.every(Number.isFinite)).toBe(true);
      expect(observations.slice(0, 6).every((value) => value >= 0 && value <= 1)).toBe(true);
      expect(observations[6]).toBeGreaterThanOrEqual(-1);
      expect(observations[6]).toBeLessThanOrEqual(1);
    }
  });

  it('rewards validated progress and laps while penalizing reverse, excursions, blocking, and steering oscillation', () => {
    const calculator = new RewardCalculator();
    const makeMetrics = ({ progress, laps = 0, offTrack = false, events = 0, blocked = 0, heading = 0 }) => ({
      telemetry: { signedProgress: progress, completedLaps: laps, offTrackEvents: events, blockedTime: blocked },
      speed: 20, orientationError: heading, offTrack,
    });
    calculator.update(makeMetrics({ progress: 0 }), { steering: 0 }, 0.1);
    const forward = calculator.update(makeMetrics({ progress: 5, laps: 1 }), { steering: 0.2 }, 0.1);
    expect(forward).toBeGreaterThan(180);
    const afterReverse = calculator.update(makeMetrics({ progress: 3, laps: 1, offTrack: true, events: 1, blocked: 0.1, heading: Math.PI }), { steering: -1 }, 0.1);
    expect(afterReverse).toBeLessThan(forward);
  });

  it('does not reward back-and-forth progress oscillation as useful distance', () => {
    const calculator = new RewardCalculator();
    const metrics = (progress) => ({
      telemetry: { signedProgress: progress, completedLaps: 0, offTrackEvents: 0, blockedTime: 0 },
      speed: 0, orientationError: 0, offTrack: false,
    });
    calculator.update(metrics(0), { steering: 1 }, 1);
    calculator.update(metrics(1), { steering: -1 }, 1);
    const rewardAfterOscillation = calculator.update(metrics(0), { steering: 1 }, 1);
    expect(rewardAfterOscillation).toBeLessThan(0);
  });
});

describe('Genetic trainer', () => {
  it('normalizes fitness by track length and penalizes a weak circuit and excursions', () => {
    const episode = ({ trackId, trackLength, reward, completedLaps, progress, lapTime, offTrackEvents = 0 }) => ({
      trackId, trackLength, reward, lapRewardValue: 180, reason: completedLaps ? 'objective' : 'off-track',
      telemetry: {
        completedLaps, signedProgress: progress, lastCompletedLapTime: lapTime, averageSpeed: 20,
        offTrackDuration: offTrackEvents * 0.5, simulatedTime: 10,
        offTrackEvents, distanceTravelled: progress,
      },
    });
    const samePerMeter = aggregateMultiTrackFitness([
      episode({ trackId: 'short', trackLength: 100, reward: 280, completedLaps: 1, progress: 100, lapTime: 4 }),
      episode({ trackId: 'long', trackLength: 200, reward: 380, completedLaps: 1, progress: 200, lapTime: 8 }),
    ]);
    expect(samePerMeter.circuitScores[0].normalizedRewardPer100Meters).toBeCloseTo(100);
    expect(samePerMeter.circuitScores[1].normalizedRewardPer100Meters).toBeCloseTo(100);
    const weakCircuit = aggregateMultiTrackFitness([
      episode({ trackId: 'short', trackLength: 100, reward: 280, completedLaps: 1, progress: 100, lapTime: 4 }),
      episode({ trackId: 'long', trackLength: 200, reward: 70, completedLaps: 0, progress: 70, lapTime: null, offTrackEvents: 2 }),
    ]);
    expect(weakCircuit.worstCircuitPerformance).toBeLessThan(samePerMeter.worstCircuitPerformance);
    expect(weakCircuit.successRate).toBe(0.5);
    expect(weakCircuit.meanOffTrackEventsPerCircuit).toBeGreaterThan(0);
    expect(weakCircuit.fitness).toBeLessThan(samePerMeter.fitness);
  });

  it('evaluates every network through the physical TrainingEnvironment', async () => {
    const environment = new TrainingEnvironment(definition, { seed: 31, fixedDeltaTime: 0.05, maxEpisodeTime: 0.1, randomizeSpawn: false });
    const evaluations = [];
    const physicalEnvironment = { runEpisode: async (args) => { const result = environment.runEpisode(args); evaluations.push(result); return result; } };
    const result = await new GeneticTrainer({ environment: physicalEnvironment, generations: 1, populationSize: 2, eliteCount: 1, seed: 31 }).train();
    expect(result.evaluations).toBe(2);
    expect(result.history).toHaveLength(1);
    expect(result.bestNetwork.architecture).toEqual([7, 16, 16, 2]);
    expect(Number.isFinite(result.bestReward)).toBe(true);
    expect(result.history[0].bestReward).toBe(Math.max(...evaluations.map((episode) => episode.reward)));
    expect(result.history[0].meanReward).toBeCloseTo(evaluations.reduce((sum, episode) => sum + episode.reward, 0) / evaluations.length);
    expect(result.history[0].meanSignedProgress).toBeCloseTo(evaluations.reduce((sum, episode) => sum + episode.telemetry.signedProgress, 0) / evaluations.length);
    const winningEpisode = evaluations.reduce((best, episode) => episode.reward > best.reward ? episode : best);
    expect(result.history[0].bestEpisodeReason).toBe(winningEpisode.reason);
    expect(result.history[0].bestEpisodeSignedProgress).toBeCloseTo(winningEpisode.telemetry.signedProgress);
  });

  it('ranks multi-track candidates with aggregate fitness and logs all circuit evaluations', async () => {
    const tracks = [{ ...definition, id: 'a' }, { ...definition, id: 'b' }, { ...definition, id: 'c' }];
    const environment = new TrainingEnvironment(tracks, { seed: 19, fixedDeltaTime: 0.05, maxEpisodeTime: 0.1 });
    const result = await new GeneticTrainer({ environment, generations: 1, populationSize: 4, eliteCount: 1, seed: 19 }).train();
    const row = result.history[0];
    expect(result.evaluations).toBe(4);
    expect(row.physicalEpisodeEvaluations).toBe(12);
    expect(row.meanCircuitMetrics.map((circuit) => circuit.trackId)).toEqual(['a', 'b', 'c']);
    expect(row.bestCandidateFitness.circuitScores).toHaveLength(3);
    expect(Number.isFinite(row.bestCandidateFitnessScore)).toBe(true);
    expect(row.meanCircuitPerformance).toBeGreaterThanOrEqual(row.meanWorstCircuitPerformance);
    expect(row.meanCandidateSuccessRate).toBeGreaterThanOrEqual(0);
    expect(row.meanCandidateSuccessRate).toBeLessThanOrEqual(1);
  });

  it('is reproducible from a seed and evaluates every member of every generation', async () => {
    const config = { environment: scoreFixture(), generations: 3, populationSize: 6, eliteCount: 2, mutationRate: 0.2, mutationSigma: 0.1, seed: 1234 };
    const a = await new GeneticTrainer(config).train();
    const b = await new GeneticTrainer(config).train();
    expect(a.evaluations).toBe(18);
    expect(a.history.map(({ bestReward, meanReward }) => [bestReward, meanReward])).toEqual(b.history.map(({ bestReward, meanReward }) => [bestReward, meanReward]));
    expect(a.bestNetwork).toEqual(b.bestNetwork);
  });

  it('resumes a full generation-boundary checkpoint with the same population and random stream', async () => {
    const config = { environment: scoreFixture(), generations: 4, populationSize: 6, eliteCount: 2, mutationRate: 0.2, mutationSigma: 0.1, seed: 723 };
    const uninterrupted = await new GeneticTrainer(config).train();
    const firstPartTrainer = new GeneticTrainer(config);
    let checkpoint;
    await firstPartTrainer.train({ stopAfterGeneration: 2, onCheckpoint: (state) => { checkpoint = state; } });
    expect(checkpoint.generation).toBe(2);
    expect(checkpoint.population).toHaveLength(6);
    expect(checkpoint.randomState).toBeGreaterThan(0);
    const resumed = await new GeneticTrainer({ ...config, checkpoint }).train();
    const withoutGenerationNetworks = (history) => history.map(({ bestNetwork, ...row }) => row);
    expect(withoutGenerationNetworks(resumed.history)).toEqual(withoutGenerationNetworks(uninterrupted.history));
    expect(resumed.bestNetwork).toEqual(uninterrupted.bestNetwork);
    expect(resumed.bestReward).toBe(uninterrupted.bestReward);
    expect(resumed.evaluations).toBe(uninterrupted.evaluations);
  });

  it('exports and restores the xorshift generator state exactly', () => {
    const random = createSeededRandom(991);
    random(); random();
    const state = random.getState();
    const expected = [random(), random(), random()];
    const restored = createSeededRandom(1);
    restored.setState(state);
    expect([restored(), restored(), restored()]).toEqual(expected);
    expect(() => restored.setState(0)).toThrow(RangeError);
  });

  it('retains the global best network through elitism while selecting and mutating offspring', async () => {
    const trainer = new GeneticTrainer({ environment: scoreFixture(), generations: 4, populationSize: 5, eliteCount: 2, mutationRate: 0.5, mutationSigma: 0.3, seed: 55 });
    const result = await trainer.train();
    expect(result.evaluations).toBe(20);
    expect(result.bestReward).toBe(Math.max(...result.history.map(({ globalBestReward }) => globalBestReward)));
    expect(result.bestNetwork.architecture).toEqual([7, 16, 16, 2]);
    expect(result.history.at(-1).globalBestReward).toBe(result.bestReward);
  });

  it('exports observed generation metrics as CSV rows keyed by seed', () => {
    const csv = trainingHistoryToCsv([{ seed: 41, history: [{
      generation: 1, evaluations: 16, bestReward: 12.5, globalBestReward: 12.5, meanReward: 3,
      successfulLaps: 2, bestEpisodeReason: 'objective', bestEpisodeCompletedLaps: 1, bestEpisodeSignedProgress: 500,
      bestEpisodeDistanceTravelled: 510, bestEpisodeOffTrackEvents: 0, bestEpisodeOffTrackDuration: 0,
      bestEpisodeBlockedTime: 0, bestEpisodeMeanLateralError: 1, meanCompletedLaps: 0.125, meanSignedProgress: 22, meanDistanceTravelled: 26,
      meanEpisodeTime: 5, meanAverageSpeed: 8, meanMaxSpeed: 13, meanOffTrackEvents: 1,
      meanOffTrackDuration: 2, meanBlockedTime: 0.2, meanLateralError: 4,
      terminationReasons: { objective: 2, 'off-track': 10, blocked: 1, 'time-limit': 3 },
    }] }]);
    expect(csv).toContain('seed,generation,evaluations,best_reward_generation');
    expect(csv).toContain('41,1,16,12.5,12.5,3,2');
    expect(csv).toContain(',2,10,1,3');
  });

  it('compares Steering and Neural on identical initial conditions for a seed', () => {
    const comparison = new ControllerComparison(definition, { fixedDeltaTime: 0.05, maxEpisodeTime: 0.1 });
    const network = new NeuralNetwork({ random: createSeededRandom(5) });
    const result = comparison.run({ network, seed: 37 });
    expect(result.conditionsMatched).toBe(true);
    expect(result.steering.seed).toBe(37);
    expect(result.neural.seed).toBe(37);
    expect(Number.isFinite(result.rewardDifference)).toBe(true);
    expect(result.steering.telemetry.simulatedTime).toBeCloseTo(0.1);
    expect(result.neural.telemetry.simulatedTime).toBeCloseTo(0.1);
  });
});
