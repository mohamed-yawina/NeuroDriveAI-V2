/** Adapter for the current deterministic PathFollowing steering policy. */
export class SteeringController {
  constructor() { this.name = 'SteeringController'; }

  compute({ vehicle, path, deltaTime, recovery = false }) {
    return path.update(vehicle.position, vehicle.velocity, undefined, deltaTime, { recovery });
  }
}
