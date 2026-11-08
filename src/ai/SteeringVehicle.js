import { Vector3 } from 'three';
export class SteeringVehicle {
  constructor({ position = new Vector3(), maxSpeed = 32, maxForce = 20, mass = 1.4, drag = 0.18 } = {}) {
    this.position = position.clone(); this.velocity = new Vector3(0, 0, -1).multiplyScalar(maxSpeed * 0.45); this.acceleration = new Vector3(); this.forward = new Vector3(0, 0, -1); this.maxSpeed = maxSpeed; this.maxForce = maxForce; this.mass = mass; this.drag = drag; this.steering = new Vector3();
  }
  update(force, deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RangeError('deltaTime must be a finite, non-negative number.');
    if (deltaTime === 0) return this;

    // Keep the full elapsed time while limiting the integration step for stability.
    // Midpoint (trapezoidal) position integration gives the expected 1/2*a*t²
    // displacement for a constant force starting from rest.
    this.steering.copy(force).clampLength(0, this.maxForce);
    this.acceleration.copy(this.steering).divideScalar(this.mass);
    const substeps = Math.ceil(deltaTime / 0.05);
    const dt = deltaTime / substeps;
    for (let step = 0; step < substeps; step++) {
      const previousVelocity = this.velocity.clone();
      this.velocity.addScaledVector(this.acceleration, dt);
      this.velocity.multiplyScalar(Math.max(0, 1 - this.drag * dt)).clampLength(0, this.maxSpeed);
      this.position.addScaledVector(previousVelocity.add(this.velocity).multiplyScalar(0.5), dt);
    }
    if (this.velocity.lengthSq() > 0.001) this.forward.copy(this.velocity).normalize(); return this;
  }
  reset(position, heading = new Vector3(0, 0, -1)) { this.position.copy(position); this.velocity.copy(heading).normalize().multiplyScalar(this.maxSpeed * 0.45); this.forward.copy(heading).normalize(); this.acceleration.set(0, 0, 0); this.steering.set(0, 0, 0); }
}
