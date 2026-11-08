import { Vector3 } from 'three';
import { NeuralController } from '../NeuralController.js';
import { SteeringController } from '../SteeringController.js';
import { VehicleDynamics } from '../../physics/VehicleDynamics.js';
import { RewardCalculator } from './RewardCalculator.js';
import { createSeededRandom } from './random.js';

/** Paired evaluation: both controllers receive identical track, spawn, heading and timestep. */
export class ControllerComparison {
  constructor(trackDefinition, { fixedDeltaTime = 1 / 30, maxEpisodeTime = 45, offTrackLimit = 3.5, blockedLimit = 4 } = {}) {
    this.trackDefinition = trackDefinition;
    this.fixedDeltaTime = fixedDeltaTime;
    this.maxEpisodeTime = maxEpisodeTime;
    this.offTrackLimit = offTrackLimit;
    this.blockedLimit = blockedLimit;
  }

  initialState(seed) {
    const random = createSeededRandom(seed);
    const points = this.trackDefinition.waypoints;
    const segmentIndex = Math.floor(random() * points.length);
    const t = 0.2 + random() * 0.6;
    const position = points[segmentIndex].clone().lerp(points[(segmentIndex + 1) % points.length], t);
    const heading = new Vector3().subVectors(points[(segmentIndex + 1) % points.length], points[(segmentIndex - 1 + points.length) % points.length]).setY(0).normalize();
    return { segmentIndex, position, heading };
  }

  evaluate(controller, initial, network) {
    const { waypoints, boundaries } = this.trackDefinition;
    const dynamics = new VehicleDynamics(waypoints, { boundaries, controller });
    dynamics.reset();
    dynamics.vehicle.reset(initial.position, initial.heading);
    dynamics.path.reset(initial.segmentIndex);
    dynamics.telemetry.reset();
    dynamics.telemetry.initialize(initial.position);
    let rewardCalculator = new RewardCalculator();
    let metrics = null, elapsed = 0, steps = 0, reason = 'time-limit';
    while (elapsed < this.maxEpisodeTime) {
      metrics = dynamics.update(this.fixedDeltaTime);
      elapsed += this.fixedDeltaTime;
      steps++;
      let commands = controller.lastCommands;
      if (!commands && controller instanceof SteeringController) {
        const right = new Vector3(-dynamics.vehicle.forward.z, 0, dynamics.vehicle.forward.x);
        commands = { steering: dynamics.vehicle.steering.dot(right) / dynamics.vehicle.maxForce };
      }
      rewardCalculator.update(metrics, commands, this.fixedDeltaTime);
      if (metrics.completedLaps >= 1) { reason = 'objective'; break; }
      if (dynamics.offTrackTime >= this.offTrackLimit) { reason = 'off-track'; break; }
      if (dynamics.stuckTime >= this.blockedLimit) { reason = 'blocked'; break; }
    }
    return {
      controller: controller.name,
      seed: this.seed,
      reward: rewardCalculator.value(),
      reason,
      steps,
      initialState: { segmentIndex: initial.segmentIndex, position: initial.position.toArray(), heading: initial.heading.toArray() },
      telemetry: dynamics.telemetry.snapshot(),
    };
  }

  run({ network, seed = 2026 }) {
    if (!network) throw new TypeError('ControllerComparison requires a trained NeuralNetwork.');
    this.seed = seed;
    const initial = this.initialState(seed);
    const steering = this.evaluate(new SteeringController(), initial);
    const neural = this.evaluate(new NeuralController({ network }), initial);
    return {
      seed,
      conditionsMatched: JSON.stringify(steering.initialState) === JSON.stringify(neural.initialState),
      steering,
      neural,
      rewardDifference: neural.reward - steering.reward,
      progressDifference: neural.telemetry.signedProgress - steering.telemetry.signedProgress,
      lapDifference: neural.telemetry.completedLaps - steering.telemetry.completedLaps,
    };
  }
}
