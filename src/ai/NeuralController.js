import { Vector3 } from 'three';

/** Converts neural outputs into bounded forces; position always remains physics-integrated. */
export class NeuralController {
  constructor({ network = null } = {}) {
    this.name = 'NeuralController';
    this.network = network;
    this.lastCommands = { steering: 0, throttleBrake: 0 };
    this.force = new Vector3();
    this.captureActivations = false;
    this.lastActivations = [];
  }

  setNetwork(network) { this.network = network; this.reset(); }

  compute({ vehicle, observations, deltaTime = 1 / 60 }) {
    if (!this.network) throw new Error('NeuralController requires an imported or trained NeuralNetwork.');
    this.lastActivations = [];
    const output = this.captureActivations
      ? this.network.forward(observations, { onActivations: (layer, values) => { this.lastActivations[layer + 1] = Array.from(values); } })
      : this.network.forward(observations);
    const steering = Math.max(-1, Math.min(1, output[0]));
    const throttleBrake = Math.max(-1, Math.min(1, output[1]));
    this.lastCommands = { steering, throttleBrake };

    const forward = new Vector3(vehicle.forward.x, 0, vehicle.forward.z);
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    forward.normalize();
    const right = new Vector3(-forward.z, 0, forward.x);
    const velocityDirection = new Vector3(vehicle.velocity.x, 0, vehicle.velocity.z);
    if (velocityDirection.lengthSq() < 1e-8) velocityDirection.copy(forward);
    velocityDirection.normalize();
    const speedRatio = Math.max(0, Math.min(1, vehicle.velocity.length() / vehicle.maxSpeed));
    const brakingForce = Math.min(-throttleBrake * vehicle.maxForce,
      vehicle.velocity.length() * vehicle.mass / Math.max(deltaTime, 1e-3));
    const longitudinal = throttleBrake >= 0
      ? forward.multiplyScalar(throttleBrake * vehicle.maxForce)
      : velocityDirection.multiplyScalar(-brakingForce);
    const lateral = right.multiplyScalar(steering * vehicle.maxForce * (0.25 + 0.75 * speedRatio));
    return this.force.copy(longitudinal).add(lateral).clampLength(0, vehicle.maxForce);
  }

  reset() { this.lastCommands = { steering: 0, throttleBrake: 0 }; this.lastActivations = []; this.force.set(0, 0, 0); }
}
