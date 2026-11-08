import { Vector3 } from 'three';
import { GameVehicleDynamics } from '../game/GameVehicleDynamics.js';
import { TrackSensors } from '../ai/TrackSensors.js';
import { ObservationBuilder } from '../ai/ObservationBuilder.js';
import { NeuralController } from '../ai/NeuralController.js';
import { PathFollowing } from '../ai/PathFollowing.js';
import { createGeneralizationTracks } from '../ai/training/GeneralizationTracks.js';
import { createRosterRaceWorld } from '../game/createRosterRaceWorld.js';
import { createRaceReplay, createReplayFrame } from './ReplayProtocol.js';

export const HISTORICAL_ARTIFACTS = Object.freeze({ A: '/phase8-model-a.json', B: '/phase8-model-b.json', C: '/phase8-model-c.json' });

/** Game-side adapter for the historical 7-16-16-2 action contract. Scientific dynamics remain untouched. */
export class HistoricalBrainAdapter {
  constructor(network, track, { sensorRange = 45, mass = 1.25 } = {}) {
    if (!network || network.architecture?.join(',') !== '7,16,16,2') throw new TypeError('Historical brain must use the 7-16-16-2 architecture.');
    if (!(mass > 0) || !Number.isFinite(mass)) throw new RangeError('Historical brain arcade adapter needs a positive vehicle mass.');
    this.network = network; this.track = track;
    this.mass = mass;
    this.sensors = new TrackSensors(track.boundaries, { maxDistance: sensorRange });
    this.observations = new ObservationBuilder(); this.controller = new NeuralController({ network });
    this.controller.captureActivations = true;
    this.path = new PathFollowing(track.waypoints);
    this.lastObservation = null;
    this.vehicleProxy = { position: null, forward: null, velocity: null, maxSpeed: 0, maxForce: 0, mass };
  }
  compute({ car, deltaTime = 1 / 60 }) {
    const readings = this.sensors.update(car.position, car.forward);
    const input = this.observations.build(car, this.path, readings);
    this.lastObservation = Array.from(input);
    Object.assign(this.vehicleProxy, { position: car.position, forward: car.forward, velocity: car.velocity, maxSpeed: car.maxSpeed, maxForce: car.maxForce, mass: this.mass });
    return this.controller.compute({ vehicle: this.vehicleProxy, observations: input, deltaTime });
  }
  reset() { this.sensors.reset(); this.observations.reset(); this.controller.reset(); this.lastObservation = null; }
}

/** Experimental networks are versioned separately from phase 4-8 artifacts. */
export class ExperimentalNetwork {
  constructor({ sensorAngles = [-60, -30, 0, 30, 60], sensorRange = 45, hiddenLayers = [16, 16], activation = 'tanh', random = Math.random } = {}) {
    if (!Array.isArray(sensorAngles) || sensorAngles.length < 1 || sensorAngles.length > 32 || sensorAngles.some((x) => !Number.isFinite(x) || Math.abs(x) > 180)) throw new TypeError('Sensor angles must contain 1-32 finite degrees in [-180, 180].');
    if (!(sensorRange > 0) || !Number.isFinite(sensorRange)) throw new RangeError('Sensor range must be positive.');
    if (!Array.isArray(hiddenLayers) || hiddenLayers.length > 8 || hiddenLayers.some((x) => !Number.isInteger(x) || x < 1 || x > 512)) throw new TypeError('Use at most 8 hidden layers with 1-512 neurons each.');
    if (!['tanh', 'relu', 'sigmoid'].includes(activation)) throw new TypeError('Unsupported activation.');
    this.config = { sensorAngles: [...sensorAngles], sensorRange, hiddenLayers: [...hiddenLayers], activation, outputCount: 2 };
    this.architecture = [sensorAngles.length + 1, ...hiddenLayers, 2];
    const parameterCount = this.architecture.slice(1).reduce((sum, size, index) => sum + size * this.architecture[index] + size, 0);
    if (parameterCount > 100000) throw new RangeError('Experimental brain exceeds 100,000 parameters.');
    this.provenance = { space: 'neural-racing-lab', physics: 'game-arcade' };
    this.layers = this.architecture.slice(1).map((out, i) => ({ weights: Array.from({ length: out }, () => Array.from({ length: this.architecture[i] }, () => (random() * 2 - 1) * Math.sqrt(6 / (out + this.architecture[i])))), biases: Array(out).fill(0) }));
  }
  forward(input, { onActivations = null } = {}) {
    if ((!Array.isArray(input) && !ArrayBuffer.isView(input)) || input.length !== this.architecture[0] || !Array.from(input).every(Number.isFinite)) throw new TypeError(`Expected ${this.architecture[0]} finite inputs.`);
    let values = Array.from(input);
    onActivations?.(-1, Float32Array.from(values));
    for (const [i, layer] of this.layers.entries()) {
      values = layer.biases.map((bias, row) => {
        const sum = bias + layer.weights[row].reduce((acc, weight, col) => acc + weight * values[col], 0);
        if (i === this.layers.length - 1) return Math.tanh(sum);
        if (this.config.activation === 'relu') return Math.max(0, sum);
        if (this.config.activation === 'sigmoid') return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, sum))));
        return Math.tanh(sum);
      });
      onActivations?.(i, Float32Array.from(values));
    }
    return Float32Array.from(values);
  }
  copy() { return ExperimentalNetwork.fromJSON(this.toJSON()); }
  mutate({ rate = 0.08, sigma = 0.12, random = Math.random } = {}) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1 || !Number.isFinite(sigma) || sigma < 0) throw new RangeError('Mutation rate and sigma are invalid.');
    const noise = () => { let total = 0; for (let i = 0; i < 6; i++) total += random(); return (total - 3) * 2; };
    for (const layer of this.layers) {
      for (const row of layer.weights) for (let i = 0; i < row.length; i++) if (random() < rate) row[i] += noise() * sigma;
      for (let i = 0; i < layer.biases.length; i++) if (random() < rate) layer.biases[i] += noise() * sigma;
    }
    return this;
  }
  toJSON() { return { format: 'neurodrive-experimental-brain', version: 1, provenance: structuredClone(this.provenance), config: structuredClone(this.config), architecture: [...this.architecture], layers: structuredClone(this.layers) }; }
  static fromJSON(data) {
    if (typeof data === 'string') data = JSON.parse(data);
    if (data?.format !== 'neurodrive-experimental-brain' || data.version !== 1) throw new TypeError('Unsupported experimental brain format/version.');
    const network = new ExperimentalNetwork({ ...data.config, random: () => 0.5 });
    if (data.architecture?.join(',') !== network.architecture.join(',') || data.layers?.length !== network.layers.length) throw new TypeError('Brain dimensions do not match its configuration.');
    data.layers.forEach((layer, i) => {
      if (layer.weights?.length !== network.architecture[i + 1] || layer.biases?.length !== network.architecture[i + 1] || layer.weights.some((row) => !Array.isArray(row) || row.length !== network.architecture[i] || row.some((v) => !Number.isFinite(v))) || layer.biases.some((v) => !Number.isFinite(v))) throw new TypeError(`Invalid layer ${i}.`);
    });
    network.layers = structuredClone(data.layers); network.provenance = structuredClone(data.provenance ?? { space: 'neural-racing-lab', physics: 'game-arcade' }); return network;
  }
}

export class ExperimentalBrainAdapter {
  constructor(network, track) {
    if (!(network instanceof ExperimentalNetwork)) throw new TypeError('Experimental adapter requires an experimental brain.');
    this.network = network; this.sensors = new TrackSensors(track.boundaries, { maxDistance: network.config.sensorRange, angles: network.config.sensorAngles });
    this.lastActivations = [];
  }
  compute({ car }) {
    const readings = this.sensors.update(car.position, car.forward);
    const input = [...networkSensorValues(readings, this.network.config.sensorAngles), Math.min(1, car.velocity.length() / car.maxSpeed)];
    this.lastActivations = [];
    const [steering, throttle] = this.network.forward(input, { onActivations: (layer, values) => { this.lastActivations[layer + 1] = Array.from(values); } });
    const forward = car.forward.clone().setY(0).normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    return forward.multiplyScalar(throttle * car.maxForce).addScaledVector(right, steering * car.maxForce).clampLength(0, car.maxForce);
  }
  reset() { this.sensors.reset(); this.lastActivations = []; }
}
const networkSensorValues = (readings) => readings.map((reading) => reading.normalized);

export async function loadHistoricalBrain(configuration, fetchImpl = fetch) {
  const url = HISTORICAL_ARTIFACTS[configuration]; if (!url) throw new TypeError('Choose historical model A, B, or C.');
  const response = await fetchImpl(url); if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
  const artifact = await response.json();
  if (artifact.configuration !== configuration || artifact.seed == null) throw new TypeError(`Artifact provenance mismatch for ${configuration}.`);
  const { NeuralNetwork } = await import('../ai/neural/NeuralNetwork.js');
  return { network: NeuralNetwork.fromJSON(artifact.network), provenance: { configuration, seed: artifact.seed, fitness: artifact.fitness, source: url, historicalPhysics: 'VehicleDynamics + TrackSensors v1', evaluationPhysics: 'GameVehicleDynamics arcade' } };
}

/** Paired heats use identical seed/track/physics and rotate model slots. */
export function createBalancedHeats(drivers, { seed = 13, rotations = drivers.length } = {}) {
  if (!Array.isArray(drivers) || drivers.length < 2 || new Set(drivers).size !== drivers.length) throw new TypeError('At least two unique drivers are required.');
  return Array.from({ length: rotations }, (_, heat) => ({ seed: (seed + heat) >>> 0, grid: drivers.map((driver, index) => ({ driver, slot: (index + heat) % drivers.length })) }));
}

export function validateFairness(protocol) {
  const heats = protocol?.heats;
  if (!Array.isArray(heats) || !heats.length) return { valid: false, reason: 'No paired heats.' };
  const track = heats[0].trackId, physics = JSON.stringify(heats[0].physics), drivers = heats[0].grid.map((x) => x.driver);
  if (heats.some((h) => h.trackId !== track || JSON.stringify(h.physics) !== physics || h.grid.length !== drivers.length || h.grid.some((x) => !drivers.includes(x.driver)))) return { valid: false, reason: 'Heats differ in circuit, physics, or roster.' };
  if (new Set(heats.map((heat) => heat.seed)).size !== heats.length) return { valid: false, reason: 'Heat seeds must be unique.' };
  if (heats.some((heat) => new Set(heat.grid.map((entry) => entry.slot)).size !== drivers.length || heat.grid.some((entry) => !Number.isInteger(entry.slot) || entry.slot < 0 || entry.slot >= drivers.length))) return { valid: false, reason: 'Each heat must assign every grid slot exactly once.' };
  const slotCounts = Object.fromEntries(drivers.map((d) => [d, new Set(heats.map((h) => h.grid.find((x) => x.driver === d)?.slot)).size]));
  if (Object.values(slotCounts).some((count) => count !== drivers.length)) return { valid: false, reason: 'Starting positions are not fully rotated.' };
  return { valid: true, slotCounts };
}

export class TrainingStopConditions {
  constructor({ maxGenerations, maxEpisodes, fitnessThreshold = null, successRateThreshold = null }) {
    if (!Number.isInteger(maxGenerations) || maxGenerations < 1 || !Number.isInteger(maxEpisodes) || maxEpisodes < 1) throw new RangeError('Positive generation and episode budgets are required.');
    if (fitnessThreshold !== null && !Number.isFinite(fitnessThreshold)) throw new RangeError('Fitness threshold must be finite or null.');
    if (successRateThreshold !== null && (!Number.isFinite(successRateThreshold) || successRateThreshold < 0 || successRateThreshold > 1)) throw new RangeError('Success-rate threshold must be in [0, 1] or null.');
    Object.assign(this, { maxGenerations, maxEpisodes, fitnessThreshold, successRateThreshold, manuallyStopped: false });
  }
  stop(progress) { return this.manuallyStopped || progress.generations >= this.maxGenerations || progress.episodes >= this.maxEpisodes || (this.fitnessThreshold !== null && progress.fitness >= this.fitnessThreshold) || (this.successRateThreshold !== null && progress.successRate >= this.successRateThreshold); }
  stopManually() { this.manuallyStopped = true; }
}

/** Small deterministic game-domain heat runner; never writes scientific results. */
export async function runRaceHeat(track, drivers, { seed = 1, laps = 1, maxSteps = 18000, onProgress = () => {}, shouldStop = () => false, recordReplay = false, maxReplayFrames = 1800, progressEverySteps = 600 } = {}) {
  if (recordReplay && (!Number.isInteger(maxReplayFrames) || maxReplayFrames < 2 || maxReplayFrames > 1800)) throw new RangeError('Replay frame limit must be in [2, 1800].');
  const world = createRosterRaceWorld(track, drivers, { seed, laps, dynamics: new GameVehicleDynamics() });
  world.start(); let step = 0; const dt = 1 / 60;
  const replayFrames = [], replayEvents = [];
  const sampleEverySteps = recordReplay ? Math.max(1, Math.ceil(maxSteps / maxReplayFrames)) : 0;
  const previousCounters = new Map(world.cars.map((car) => [car.id, { collisions: 0, offTrack: 0, laps: 0 }]));
  while (world.director.state !== 'finished' && step < maxSteps && !shouldStop()) {
    world.update(dt); step++;
    if (recordReplay && step % sampleEverySteps === 0) {
      const frame = createReplayFrame(world, step);
      replayFrames.push(frame);
      for (const car of world.cars) {
        const telemetry = world.getDriverTelemetry(car);
        const previous = previousCounters.get(car.id);
        for (const [type, count, field] of [['collision', telemetry.carCollisions, 'collisions'], ['off-track', telemetry.offTrackEvents, 'offTrack'], ['lap', car.completedLaps, 'laps']]) {
          for (let occurrence = previous[field]; occurrence < count; occurrence++) replayEvents.push({ step, time: step * dt, driverId: car.id, driver: car.name, type });
          previous[field] = count;
        }
      }
    }
    if (Number.isInteger(progressEverySteps) && progressEverySteps > 0 && step % progressEverySteps === 0) {
      const activations = world.cars.map((car) => ({ driver: car.name, values: car.controller?.lastActivations ?? car.controller?.controller?.lastActivations ?? [] })).filter((entry) => entry.values.length);
      onProgress({ step, state: world.director.state, activations });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  if (recordReplay && (!replayFrames.length || replayFrames.at(-1).step !== step)) replayFrames.push(createReplayFrame(world, step));
  const results = world.cars.map((car) => ({ driver: car.name, seed, ...world.getDriverTelemetry(car), finishTime: car.finishTime, fitness: car.completedLaps * 1000 + car.progress * 100 + (car.bestLapTime ? 1000 / car.bestLapTime : 0) }));
  const trackCategory = track.userCircuit ? 'user-defined' : track.id === 'original' ? 'known-training-track' : 'held-out-generalization-track';
  const physics = { engine: 'GameVehicleDynamics', dt, maxSpeed: world.dynamics.maxSpeed, maxForce: world.dynamics.maxForce, trackHalfWidth: world.trackHalfWidth, gridWidth: 5.4, gridSpacing: 8, laps };
  const replay = recordReplay ? createRaceReplay(track, drivers, { seed, physics, frames: replayFrames, events: replayEvents, sampleEverySteps }) : null;
  if (replay) replay.sampleRate = 60 / sampleEverySteps;
  return { seed, trackCategory, steps: step, state: world.director.state, results, physics, reproducibility: 'fixed deterministic race conditions; seed recorded as run identifier, no stochastic dynamics', replay };
}

export function builtInTracks() { return createGeneralizationTracks(); }
