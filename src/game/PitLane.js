import { Vector3 } from 'three';

/** Builds an arcade service lane from the actual local track tangent and projected merge point. */
export function createPitRoute(track, timing, position, { trackHalfWidth = 8.2, laneOffset = 4, serviceLength = 18, exitLength = 42 } = {}) {
  const projection = timing.path.project(position);
  const a = track.waypoints[projection.segmentIndex], b = track.waypoints[(projection.segmentIndex + 1) % track.waypoints.length];
  const tangent = b.clone().sub(a).setY(0).normalize();
  const side = new Vector3(-tangent.z, 0, tangent.x);
  const entry = position.clone().addScaledVector(tangent, 3).addScaledVector(side, trackHalfWidth + laneOffset);
  const service = entry.clone().addScaledVector(tangent, serviceLength);
  const exit = entry.clone().addScaledVector(tangent, exitLength);
  const merge = timing.path.project(exit).point.clone();
  return { entry, service, exit, merge, pitSpeedLimit: 12 };
}

export function calculatePitControls(car, target, speedLimit = 12) {
  const direction = target.clone().sub(car.position).setY(0);
  if (direction.lengthSq() < 1e-6) return { throttle: 0, brake: 1, steer: 0 };
  direction.normalize();
  const desiredYaw = Math.atan2(direction.x, -direction.z);
  let difference = desiredYaw - car.yaw;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  const speed = car.velocity.length();
  return { throttle: speed < speedLimit - 1.5 ? 0.55 : 0, brake: speed > speedLimit + 0.6 ? 0.7 : 0, steer: Math.max(-1, Math.min(1, difference * 1.7)) };
}

export function advancePitService(car, stop, dt, state) {
  if (car.position.distanceTo(stop) > 2.8 || car.velocity.length() > 0.65) return { ...state, elapsed: 0 };
  const elapsed = state.elapsed + dt;
  return elapsed >= 3 ? { phase: 'exit', elapsed: 0, completed: true } : { phase: 'service', elapsed, completed: false };
}
