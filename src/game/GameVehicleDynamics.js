import { Vector3 } from 'three';

/** Arcade race physics. Kept separate from the scientific VehicleDynamics. */
export class GameVehicleDynamics {
  constructor({ acceleration = 24, braking = 36, drag = 0.14, maxSpeed = 58, maxForce = 28, mass = 1.25, turnRate = 1.8 } = {}) {
    Object.assign(this, { acceleration, braking, drag, maxSpeed, maxForce, mass, turnRate });
  }

  step(vehicle, force, dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const systems = vehicle.raceMechanics;
    const grip = systems?.enabled ? systems.tyreGrip : 1;
    vehicle.velocity.addScaledVector(force, dt / this.mass * grip);
    vehicle.velocity.addScaledVector(vehicle.velocity, -this.drag * (systems?.dragMultiplier ?? 1) * dt);
    vehicle.velocity.clampLength(0, Math.min(vehicle.maxSpeed ?? this.maxSpeed, this.maxSpeed) * (systems?.speedMultiplier ?? 1) * (vehicle.raceFlags?.speedMultiplier ?? 1));
    if (vehicle.velocity.lengthSq() > 1e-5) vehicle.forward.copy(vehicle.velocity).normalize();
    vehicle.position.addScaledVector(vehicle.velocity, dt);
  }

  stepPlayer(vehicle, input, dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const speed = vehicle.velocity.length();
    const signedSpeed = vehicle.velocity.dot(vehicle.forward);
    const throttle = Math.max(-1, Math.min(1, input.throttle ?? 0));
    const brake = Math.max(0, Math.min(1, input.brake ?? 0));
    const systems = vehicle.raceMechanics;
    const grip = systems?.enabled ? systems.tyreGrip : 1;
    const arcadeSpeedMultiplier = Math.max(1, Math.min(1.2, input.arcadeSpeedMultiplier ?? 1));
    const boostSpeedMultiplier = input.turboActive ? 1.06 : 1;
    const boostAccelerationMultiplier = input.turboActive ? 1.22 : 1;
    const acceleration = this.acceleration * (systems?.accelerationMultiplier ?? 1) * grip * boostAccelerationMultiplier;
    const baseLimit = (vehicle.maxSpeed ?? this.maxSpeed) * (systems?.speedMultiplier ?? 1) * (vehicle.raceFlags?.speedMultiplier ?? 1) * arcadeSpeedMultiplier;
    const desiredSpeedLimit = baseLimit * boostSpeedMultiplier;
    let speedLimit = desiredSpeedLimit;
    if (arcadeSpeedMultiplier > 1) {
      vehicle.arcadeSpeedLimit ??= baseLimit;
      vehicle.arcadeSpeedLimit += Math.max(-8 * dt, Math.min(8 * dt, desiredSpeedLimit - vehicle.arcadeSpeedLimit));
      speedLimit = vehicle.arcadeSpeedLimit;
    }
    const targetSpeed = Math.max(-8, Math.min(speedLimit, signedSpeed + throttle * acceleration * dt - brake * this.braking * dt));
    vehicle.steeringInput = Math.max(-1, Math.min(1, input.steer ?? 0));
    vehicle.yaw += (input.steer ?? 0) * this.turnRate * grip * (0.2 + Math.min(speed / 20, 1)) * dt;
    vehicle.forward.set(Math.sin(vehicle.yaw), 0, -Math.cos(vehicle.yaw)).normalize();
    vehicle.velocity.copy(vehicle.forward).multiplyScalar(targetSpeed * (1 - Math.min(this.drag * dt, 0.9)));
    if (speed < 0.25 && Math.abs(targetSpeed) < 0.25) vehicle.velocity.set(0, 0, 0);
    vehicle.position.addScaledVector(vehicle.velocity, dt);
  }

  createForce(throttle, vehicle, out = new Vector3()) {
    return out.copy(vehicle.forward).multiplyScalar(Math.max(-1, Math.min(1, throttle)) * this.maxForce);
  }
}

export function reflectVelocity(velocity, normal, restitution = 0.18) {
  const component = velocity.dot(normal);
  if (component < 0) velocity.addScaledVector(normal, -(1 + restitution) * component);
  return velocity;
}

export function horizontalNormal(vector, out = new Vector3()) {
  out.copy(vector).setY(0);
  if (out.lengthSq() > 1e-10) out.normalize();
  return out;
}
