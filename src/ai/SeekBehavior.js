import { Vector3 } from 'three';
export function seek(position, target, velocity, maxSpeed, maxForce, out = new Vector3()) {
  const desired = new Vector3().subVectors(target, position);
  if (desired.lengthSq() === 0) return out.set(0, 0, 0);
  desired.normalize().multiplyScalar(maxSpeed);
  return out.subVectors(desired, velocity).clampLength(0, maxForce);
}
export function desiredVelocity(position, target, maxSpeed, out = new Vector3()) { return out.subVectors(target, position).setY(0).normalize().multiplyScalar(maxSpeed); }
