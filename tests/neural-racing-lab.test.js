import { describe, expect, it } from 'vitest';
import { ExperimentalNetwork, ExperimentalBrainAdapter, HistoricalBrainAdapter, createBalancedHeats, validateFairness, TrainingStopConditions, loadHistoricalBrain } from '../src/neural-lab/ExperimentProtocol.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { Vector3 } from 'three';
import { ExperimentalGeneticTrainer } from '../src/neural-lab/ExperimentalGeneticTrainer.js';
import { TrainingWorkerClient } from '../src/neural-lab/TrainingWorkerClient.js';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { runRaceHeat } from '../src/neural-lab/ExperimentProtocol.js';

describe('Neural Racing Lab contracts', () => {
  it('configures sensor dimensions, validates imported experimental models and deterministic forward pass', () => {
    const a = new ExperimentalNetwork({ sensorAngles: [-70, 0, 70], hiddenLayers: [8, 4], random: () => 0.6 });
    const b = ExperimentalNetwork.fromJSON(a.toJSON());
    expect(a.architecture).toEqual([4, 8, 4, 2]);
    expect([...a.forward([1, 0.5, 0.2, 0.8])]).toEqual([...b.forward([1, 0.5, 0.2, 0.8])]);
    expect(() => ExperimentalNetwork.fromJSON({ format: 'neurodrive-experimental-brain', version: 1, config: a.config, architecture: [7, 2], layers: [] })).toThrow(/dimensions/);
    expect(() => a.forward([0])).toThrow(/finite inputs/);
  });
  it('adapts historical 7-input networks and configurable experimental sensors to game-force outputs', () => {
    const track = createGeneralizationTracks()[0];
    const car = { position: track.waypoints[0].clone(), forward: new Vector3(0, 0, -1), velocity: new Vector3(), maxSpeed: 58, maxForce: 28, mass: 1.25 };
    const historical = new HistoricalBrainAdapter(new NeuralNetwork({ random: () => 0.5 }), track);
    const experimental = new ExperimentalBrainAdapter(new ExperimentalNetwork({ sensorAngles: [-45, 0, 45], random: () => 0.5 }), track);
    expect(historical.compute({ car }).length()).toBeLessThanOrEqual(28.00001);
    expect(experimental.compute({ car }).length()).toBeLessThanOrEqual(28.00001);
    historical.reset(); experimental.reset();
  });
  it('loads A/B/C only from source artifacts and checks their provenance and fixed dimensions', async () => {
    const artifact = { configuration: 'C', seed: 2028, fitness: 12, network: new NeuralNetwork({ random: () => .5 }).toJSON() };
    const loaded = await loadHistoricalBrain('C', async (url) => ({ ok: true, json: async () => artifact }));
    expect(loaded.provenance).toMatchObject({ configuration: 'C', seed: 2028, source: '/phase8-model-c.json' });
    expect(loaded.network.architecture).toEqual([7, 16, 16, 2]);
    await expect(loadHistoricalBrain('A', async () => ({ ok: true, json: async () => ({ ...artifact, configuration: 'B' }) }))).rejects.toThrow(/provenance/);
  });
  it('rotates every driver through each grid slot with stable seeded heat schedules', () => {
    const drivers = ['A', 'B', 'C', 'Steering'];
    const schedule = createBalancedHeats(drivers, { seed: 2026 });
    const protocol = { heats: schedule.map((heat) => ({ ...heat, trackId: 'original', physics: { dt: 1 / 60, engine: 'arcade' } })) };
    expect(validateFairness(protocol).valid).toBe(true);
    expect(schedule).toEqual(createBalancedHeats(drivers, { seed: 2026 }));
    expect(new Set(schedule.map((h) => h.seed)).size).toBe(4);
    const unfair = protocol.heats.map((h) => ({ ...h })); unfair[1] = { ...unfair[1], trackId: 'other' };
    expect(validateFairness({ heats: unfair }).valid).toBe(false);
  });
  it('stops experimental generation budgets, episode budgets, thresholds and manual requests', () => {
    const stop = new TrainingStopConditions({ maxGenerations: 5, maxEpisodes: 20, fitnessThreshold: 100, successRateThreshold: .9 });
    expect(stop.stop({ generations: 4, episodes: 10, fitness: 20, successRate: .5 })).toBe(false);
    expect(stop.stop({ generations: 5, episodes: 10, fitness: 20, successRate: .5 })).toBe(true);
    expect(stop.stop({ generations: 2, episodes: 20, fitness: 20, successRate: .5 })).toBe(true);
    expect(stop.stop({ generations: 2, episodes: 2, fitness: 100, successRate: .5 })).toBe(true);
    stop.stopManually(); expect(stop.stop({ generations: 0, episodes: 0, fitness: 0, successRate: 0 })).toBe(true);
  });
  it('reproduces a short experimental GA across a full generation checkpoint and resume', async () => {
    const config = { networkConfig: { sensorAngles: [-30, 30], hiddenLayers: [3] }, generations: 2, populationSize: 4, eliteCount: 2, seed: 987, trainingProtocol: { trackId: 'original', maxSteps: 12 }, stopConfiguration: { maxGenerations: 2, maxEpisodes: 8, fitnessThreshold: null, successRateThreshold: null } };
    const stop = () => new TrainingStopConditions(config.stopConfiguration);
    const evaluate = async (network, episode) => ({ fitness: [...network.forward([0.1, 0.2, 0.3])].reduce((a, b) => a + b, 0) + episode.seed / 10000, success: episode.episode % 2 === 0 });
    const full = new ExperimentalGeneticTrainer(config);
    const expected = await full.train({ evaluate, stopConditions: stop() });
    let partialTrainer;
    partialTrainer = new ExperimentalGeneticTrainer(config);
    const partial = await partialTrainer.train({ evaluate, stopConditions: stop(), onGeneration: (record) => { if (record.generation === 1) partialTrainer.stop(); } });
    expect(partial.generation).toBe(1);
    const resumed = new ExperimentalGeneticTrainer({ ...config, checkpoint: partialTrainer.exportCheckpoint() });
    const actual = await resumed.train({ evaluate, stopConditions: stop() });
    expect(actual.history).toEqual(expected.history);
    expect(actual.bestNetwork).toEqual(expected.bestNetwork);
    expect(actual.evaluations).toBe(8);
  });
  it('records per-driver collisions, track exits and lap timing fields without substituting global counts', () => {
    const track = createGeneralizationTracks()[0];
    const cars = RaceWorld.createGrid(track, { carCount: 2, playerIndex: -1 });
    const world = new RaceWorld(track, { cars, carCount: 2, playerIndex: -1 });
    cars[1].position.copy(cars[0].position);
    world.resolveCarCollisions();
    const first = world.getDriverTelemetry(cars[0]); const second = world.getDriverTelemetry(cars[1]);
    expect(first.collisions).toBe(1); expect(second.collisions).toBe(1);
    expect(first.driverId).toBe(cars[0].id); expect(first).toMatchObject({ completedLaps: 0, lapTimes: [], offTrackEvents: 0, success: false });
    expect(first.collisions).not.toBe(world.collisionCount + 1);
  });
  it('counts an off-track entry and its fixed-step correction time for that driver', () => {
    const track = createGeneralizationTracks()[0]; const cars = RaceWorld.createGrid(track, { carCount: 2, playerIndex: -1 });
    const world = new RaceWorld(track, { cars, carCount: 2, playerIndex: -1 });
    cars[0].position.add(new Vector3(0, 0, 300)); world.resolveTrackLimits(1 / 60);
    const telemetry = world.getDriverTelemetry(cars[0]);
    expect(telemetry.offTrackEvents).toBe(1); expect(telemetry.offTrackTime).toBeCloseTo(1 / 60); expect(telemetry.trackContacts).toBe(1); expect(telemetry.collisions).toBe(1);
  });
  it('terminates its worker once on completion/error and supports explicit cancellation', () => {
    const worker = { terminated: 0, messages: [], postMessage(message) { this.messages.push(message); }, terminate() { this.terminated++; } };
    const received = []; const client = new TrainingWorkerClient(worker, { onMessage: (message) => received.push(message.type) });
    client.send({ type: 'start' }); client.requestStop();
    expect(worker.messages.map((m) => m.type)).toEqual(['start', 'stop']);
    worker.onmessage({ data: { type: 'complete' } }); worker.onmessage?.({ data: { type: 'complete' } });
    expect(received).toEqual(['complete']); expect(worker.terminated).toBe(1);
    client.dispose(); expect(worker.terminated).toBe(1);
  });
  it('runs deterministic short headless roster heats with the same injectable controller contract', async () => {
    const track = createGeneralizationTracks()[0];
    const drivers = ['one', 'two'].map((name) => ({ name, createController: () => ({ compute: () => new Vector3() }) }));
    const a = await runRaceHeat(track, drivers, { seed: 40, laps: 1, maxSteps: 220 });
    const b = await runRaceHeat(track, drivers, { seed: 40, laps: 1, maxSteps: 220 });
    expect(a).toEqual(b);
    expect(a.trackCategory).toBe('known-training-track');
    expect(a.results).toHaveLength(2);
    expect(a.results[0]).toMatchObject({ driverId: 'one', collisions: 0, offTrackEvents: 0, success: false });
    expect(a.results[0].lapTimes).toEqual([]);
  });
});
