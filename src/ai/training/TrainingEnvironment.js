import { CatmullRomCurve3, Vector3 } from 'three';
import { VehicleDynamics } from '../../physics/VehicleDynamics.js';
import { NeuralController } from '../NeuralController.js';
import { RewardCalculator } from './RewardCalculator.js';
import { createSeededRandom } from './random.js';
import { aggregateMultiTrackFitness } from './MultiTrackFitness.js';

/** Fixed-step episode runner. It uses Three.js math, but creates no scene or renderer. */
export class TrainingEnvironment {
  constructor(trackDefinition, {
    seed = 2026,
    fixedDeltaTime = 1 / 30,
    maxEpisodeTime = 45,
    offTrackLimit = 3.5,
    blockedLimit = 4,
    targetLaps = 1,
    randomizeSpawn = true,
    rewardCalculatorFactory = () => new RewardCalculator(),
  } = {}) {
    const trackDefinitions = Array.isArray(trackDefinition) ? trackDefinition : [trackDefinition];
    if (!trackDefinitions.length || trackDefinitions.some((track) => !track?.waypoints || !track?.boundaries)) throw new TypeError('TrainingEnvironment requires one or more track definitions.');
    if (!(fixedDeltaTime > 0) || !(maxEpisodeTime > 0)) throw new RangeError('Episode timestep and time limit must be positive.');
    this.trackDefinitions = trackDefinitions;
    this.trackDefinition = trackDefinitions[0];
    this.seed = seed;
    this.fixedDeltaTime = fixedDeltaTime;
    this.maxEpisodeTime = maxEpisodeTime;
    this.offTrackLimit = offTrackLimit;
    this.blockedLimit = blockedLimit;
    this.targetLaps = targetLaps;
    this.randomizeSpawn = randomizeSpawn;
    this.rewardCalculatorFactory = rewardCalculatorFactory;
    this.controller = new NeuralController();
    this.activeTrackIndex = -1;
    this.dynamics = null;
    this.dynamicsByTrack = new Map();
    this.random = createSeededRandom(seed);
    this.reset({ seed });
  }

  selectTrack(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.trackDefinitions.length) throw new RangeError(`Unknown training circuit index: ${index}`);
    if (this.activeTrackIndex !== index) {
      this.activeTrackIndex = index;
      this.trackDefinition = this.trackDefinitions[index];
      if (!this.dynamicsByTrack.has(index)) {
        this.dynamicsByTrack.set(index, new VehicleDynamics(this.trackDefinition.waypoints, {
          boundaries: this.trackDefinition.boundaries,
          controller: this.controller,
        }));
      }
      this.dynamics = this.dynamicsByTrack.get(index);
    }
  }

  createScenario({ seed = this.seed, trackIndex = 0 } = {}) {
    const track = this.trackDefinitions[trackIndex];
    const random = createSeededRandom(seed);
    const curve = new CatmullRomCurve3(track.waypoints, true, 'centripetal');
    const arcFraction = random();
    const position = curve.getPointAt(arcFraction).setY(0.08);
    const tangent = curve.getTangentAt(arcFraction).setY(0).normalize();
    const headingErrorRadians = (random() * 2 - 1) * Math.PI / 18;
    const heading = tangent.clone().applyAxisAngle(new Vector3(0, 1, 0), headingErrorRadians).normalize();
    const speeds = [0, 7, 14, 21];
    const initialSpeedMetersPerSecond = speeds[Math.floor(random() * speeds.length)];
    return { seed, arcFraction, position: position.toArray(), heading: heading.toArray(), headingErrorRadians, initialSpeedMetersPerSecond };
  }

  reset({ seed = this.seed, network, trackIndex = 0, scenario = null } = {}) {
    this.seed = seed;
    this.random = createSeededRandom(seed);
    this.selectTrack(trackIndex);
    this.dynamics.reset();
    this.controller.setNetwork(network);
    const points = this.trackDefinition.waypoints;
    let index = 0;
    let spawn;
    let heading;
    let initialSpeed = null;
    if (scenario) {
      spawn = new Vector3(...scenario.position);
      heading = new Vector3(...scenario.heading).normalize();
      initialSpeed = scenario.initialSpeedMetersPerSecond;
    } else {
      index = this.randomizeSpawn ? Math.floor(this.random() * points.length) : 0;
      const next = points[(index + 1) % points.length];
      const previous = points[(index - 1 + points.length) % points.length];
      const t = this.randomizeSpawn ? 0.2 + this.random() * 0.6 : 0;
      spawn = points[index].clone().lerp(next, t);
      heading = new Vector3().subVectors(next, previous).setY(0).normalize();
    }
    this.dynamics.vehicle.reset(spawn, heading);
    if (initialSpeed !== null) this.dynamics.vehicle.velocity.copy(heading).multiplyScalar(initialSpeed);
    this.dynamics.path.reset(index);
    this.dynamics.telemetry.reset();
    this.dynamics.telemetry.initialize(spawn);
    this.rewardCalculator = this.rewardCalculatorFactory();
    this.elapsed = 0;
    this.steps = 0;
    this.done = false;
    this.doneReason = null;
    this.lastMetrics = null;
    this.lastReward = 0;
    return this;
  }

  step() {
    if (this.done) return { done: true, reward: this.lastReward, metrics: this.lastMetrics, reason: this.doneReason };
    const metrics = this.dynamics.update(this.fixedDeltaTime);
    this.elapsed += this.fixedDeltaTime;
    this.steps++;
    this.lastReward = this.rewardCalculator.update(metrics, this.controller.lastCommands, this.fixedDeltaTime);
    this.lastMetrics = metrics;

    if (metrics.completedLaps >= this.targetLaps) this.finish('objective');
    else if (this.dynamics.offTrackTime >= this.offTrackLimit) this.finish('off-track');
    else if (this.dynamics.stuckTime >= this.blockedLimit) this.finish('blocked');
    else if (this.elapsed >= this.maxEpisodeTime) this.finish('time-limit');
    return { done: this.done, reward: this.lastReward, metrics, reason: this.doneReason };
  }

  finish(reason) {
    this.done = true;
    this.doneReason = reason;
  }

  runEpisode({ network, seed = this.seed, trackIndex = 0, scenario = null } = {}) {
    this.reset({ network, seed, trackIndex, scenario });
    while (!this.done) this.step();
    return {
      reward: this.rewardCalculator.value(),
      reason: this.doneReason,
      steps: this.steps,
      metrics: this.lastMetrics,
      telemetry: this.dynamics.telemetry.snapshot(),
      trackId: this.trackDefinition.id ?? `track-${trackIndex}`,
      trackLength: this.dynamics.telemetry.trackLength,
      lapRewardValue: this.rewardCalculator.weights.lap,
      initialConditions: scenario ? { ...scenario } : null,
    };
  }

  /** One individual receives a matched scenario on every selected circuit each generation. */
  async evaluateAcrossTracks({ network, seed = this.seed, generation = 1 } = {}) {
    if (this.trackDefinitions.length < 2) throw new Error('Multi-track evaluation requires at least two circuits.');
    const episodes = [];
    for (let trackIndex = 0; trackIndex < this.trackDefinitions.length; trackIndex++) {
      const scenarioSeed = (seed * 65537 + generation * 313 + trackIndex * 7919) >>> 0;
      const scenario = this.createScenario({ seed: scenarioSeed, trackIndex });
      episodes.push(await this.runEpisode({ network, seed: scenarioSeed, trackIndex, scenario }));
    }
    const aggregate = aggregateMultiTrackFitness(episodes);
    return {
      reward: aggregate.fitness,
      fitness: aggregate,
      circuitEpisodes: episodes,
      telemetry: {
        completedLaps: episodes.reduce((sum, episode) => sum + episode.telemetry.completedLaps, 0),
        offTrackEvents: episodes.reduce((sum, episode) => sum + episode.telemetry.offTrackEvents, 0),
        offTrackDuration: episodes.reduce((sum, episode) => sum + episode.telemetry.offTrackDuration, 0),
        blockedTime: episodes.reduce((sum, episode) => sum + episode.telemetry.blockedTime, 0),
      },
      reason: episodes.every((episode) => episode.reason === 'objective') ? 'objective' : 'multi-track-mixed',
    };
  }
}
