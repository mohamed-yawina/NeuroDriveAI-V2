import { Vector3 } from 'three';
import { wrapIndex } from '../utils/math.js';
import { seek } from './SeekBehavior.js';

const EPSILON = 1e-8;

export function projectPointToSegment(point, start, end, out = new Vector3()) {
  const segment = new Vector3().subVectors(end, start);
  const lengthSquared = segment.lengthSq();
  const t = lengthSquared < EPSILON ? 0 : Math.max(0, Math.min(1, new Vector3().subVectors(point, start).dot(segment) / lengthSquared));
  out.copy(start).addScaledVector(segment, t);
  return { point: out, t, distance: point.distanceTo(out) };
}

/** Cyclic path follower using predictive projection and steering forces. */
export class PathFollowing {
  constructor(waypoints, {
    lookAhead = 12,
    lookAheadTime = 0.35,
    predictionTime = 0.3,
    trackHalfWidth = 7.5,
    maxSpeed = 24,
    maxForce = 18,
    steeringResponse = 5,
    maxDeceleration = 16,
    curvatureSegments = 4,
  } = {}) {
    if (waypoints.length < 3) throw new Error('Path following needs at least three waypoints.');
    this.waypoints = waypoints.map((point) => point.clone());
    this.lookAhead = lookAhead;
    this.lookAheadTime = lookAheadTime;
    this.predictionTime = predictionTime;
    this.trackHalfWidth = trackHalfWidth;
    this.maxSpeed = maxSpeed;
    this.maxForce = maxForce;
    this.steeringResponse = steeringResponse;
    this.maxDeceleration = maxDeceleration;
    this.curvatureSegments = curvatureSegments;
    this.segmentLengths = this.waypoints.map((point, i) => point.distanceTo(this.waypoints[wrapIndex(i + 1, this.waypoints.length)]));
    this.totalLength = this.segmentLengths.reduce((sum, length) => sum + length, 0);
    this.index = 0;
    this.target = new Vector3();
    this.recoveryTarget = new Vector3();
    this.predictedPosition = new Vector3();
    this.projection = new Vector3();
    this.steering = new Vector3();
    this.curvature = 0;
    this.speedTarget = maxSpeed;
    this.lateralDistance = 0;
    this.offTrack = false;
    this.recovery = false;
  }

  project(position, out = new Vector3()) {
    let best = null;
    for (let i = 0; i < this.waypoints.length; i++) {
      const candidate = projectPointToSegment(position, this.waypoints[i], this.waypoints[wrapIndex(i + 1, this.waypoints.length)]);
      if (!best || candidate.distance < best.distance) best = { ...candidate, segmentIndex: i };
    }
    out.copy(best.point);
    return { point: out, t: best.t, distance: best.distance, segmentIndex: best.segmentIndex };
  }

  pointAhead(segmentIndex, t, distance, out = new Vector3()) {
    let index = segmentIndex;
    let remaining = distance + this.segmentLengths[index] * (1 - t);
    while (remaining > this.segmentLengths[index]) {
      remaining -= this.segmentLengths[index];
      index = wrapIndex(index + 1, this.waypoints.length);
    }
    const start = this.waypoints[index];
    const end = this.waypoints[wrapIndex(index + 1, this.waypoints.length)];
    return out.copy(start).lerp(end, remaining / this.segmentLengths[index]);
  }

  analyzeCurvature(segmentIndex, t) {
    let maxAngle = 0;
    for (let offset = 0; offset < this.curvatureSegments; offset++) {
      const i = wrapIndex(segmentIndex + offset, this.waypoints.length);
      const next = wrapIndex(i + 1, this.waypoints.length);
      const after = wrapIndex(i + 2, this.waypoints.length);
      const incoming = new Vector3().subVectors(this.waypoints[next], this.waypoints[i]).normalize();
      const outgoing = new Vector3().subVectors(this.waypoints[after], this.waypoints[next]).normalize();
      // Ignore a turn that is already behind the projection point.
      if (offset === 0 && t > 0.8) continue;
      maxAngle = Math.max(maxAngle, incoming.angleTo(outgoing));
    }
    this.curvature = maxAngle;
    return maxAngle;
  }

  update(position, velocity, out = new Vector3(), deltaTime = 1 / 60, { recovery = false } = {}) {
    this.predictedPosition.copy(position).addScaledVector(velocity, this.predictionTime);
    const predictedProjection = this.project(this.predictedPosition, this.projection);
    const currentProjection = this.project(position);
    this.index = predictedProjection.segmentIndex;
    this.lateralDistance = currentProjection.distance;
    this.offTrack = this.lateralDistance > this.trackHalfWidth;
    this.recovery = recovery;

    this.analyzeCurvature(predictedProjection.segmentIndex, predictedProjection.t);
    const severity = Math.max(0, Math.min(1, this.curvature / (Math.PI * 0.55)));
    const desiredSpeed = this.maxSpeed * (1 - 0.62 * severity);
    // Rate-limited speed changes provide gradual braking and prevent snap turns.
    const speedChange = Math.max(-this.maxDeceleration * deltaTime, Math.min(5 * deltaTime, desiredSpeed - this.speedTarget));
    this.speedTarget = Math.max(this.maxSpeed * 0.3, Math.min(this.maxSpeed, this.speedTarget + speedChange));

    const travel = this.lookAhead + velocity.length() * this.lookAheadTime;
    this.pointAhead(predictedProjection.segmentIndex, predictedProjection.t, travel, this.target);
    const steeringTarget = recovery
      ? this.pointAhead(currentProjection.segmentIndex, currentProjection.t, Math.max(5, this.lookAhead * 0.5), this.recoveryTarget)
      : this.target;
    const force = seek(position, steeringTarget, velocity, this.speedTarget, this.maxForce, out);
    const smoothing = 1 - Math.exp(-this.steeringResponse * deltaTime);
    this.steering.lerp(force, smoothing);
    return out.copy(this.steering);
  }

  reset(index = 0) {
    this.index = wrapIndex(index, this.waypoints.length);
    this.speedTarget = this.maxSpeed;
    this.steering.set(0, 0, 0);
    this.offTrack = false;
    this.recovery = false;
  }
}
