import { Vector3 } from 'three';

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const crossY = (a, b) => a.z * b.x - a.x * b.z;

export function signedOrientationError(forward, tangent) {
  const heading = new Vector3(forward.x, 0, forward.z);
  const pathTangent = new Vector3(tangent.x, 0, tangent.z);
  if (heading.lengthSq() < 1e-8 || pathTangent.lengthSq() < 1e-8) return 0;
  heading.normalize();
  pathTangent.normalize();
  return Math.atan2(crossY(pathTangent, heading), pathTangent.dot(heading));
}

/** Builds [five normalized ranges, normalized speed, signed heading error]. */
export class ObservationBuilder {
  constructor() { this.orientationError = 0; this.orientationErrorNormalized = 0; }

  build(vehicle, path, sensorReadings) {
    const projection = path.project(vehicle.position);
    const start = path.waypoints[projection.segmentIndex];
    const end = path.waypoints[(projection.segmentIndex + 1) % path.waypoints.length];
    const tangent = new Vector3().subVectors(end, start).setY(0).normalize();
    const orientationError = signedOrientationError(vehicle.forward, tangent);
    const observations = new Float32Array(7);
    for (let i = 0; i < 5; i++) {
      const range = Number(sensorReadings[i]?.normalized ?? 1);
      observations[i] = Number.isFinite(range) ? clamp01(range) : 1;
    }
    const speedRatio = vehicle.maxSpeed > 0 ? vehicle.velocity.length() / vehicle.maxSpeed : 0;
    observations[5] = Number.isFinite(speedRatio) ? clamp01(speedRatio) : 0;
    observations[6] = Math.max(-1, Math.min(1, orientationError / Math.PI));
    this.orientationError = orientationError;
    this.orientationErrorNormalized = observations[6];
    return observations;
  }

  reset() { this.orientationError = 0; this.orientationErrorNormalized = 0; }
}
