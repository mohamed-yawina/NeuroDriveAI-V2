import { Vector3 } from 'three';
import { seek } from '../SeekBehavior.js';
import { PathFollowing } from '../PathFollowing.js';

const EPSILON = 1e-8;
const zero = () => new Vector3();
const horizontal = (vector) => new Vector3(vector?.x ?? 0, 0, vector?.z ?? 0);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function parameters(context) {
  const vehicle = context.vehicle;
  if (!vehicle?.position || !vehicle?.velocity) throw new TypeError('A steering behavior needs a vehicle with position and velocity.');
  return {
    vehicle,
    position: horizontal(vehicle.position),
    velocity: horizontal(vehicle.velocity),
    maxSpeed: context.maxSpeed ?? vehicle.maxSpeed ?? 0,
    maxForce: context.maxForce ?? vehicle.maxForce ?? 0,
    deltaTime: context.deltaTime ?? 1 / 60,
  };
}

function steer(desiredVelocity, velocity, maxForce) {
  return desiredVelocity.sub(velocity).clampLength(0, maxForce);
}

function seekForce(context, target) {
  if (!target) return zero();
  const { position, velocity, maxSpeed, maxForce } = parameters(context);
  return seek(position, horizontal(target), velocity, maxSpeed, maxForce);
}

function fleeForce(context, target) {
  if (!target) return zero();
  const { position, velocity, maxSpeed, maxForce } = parameters(context);
  const away = position.sub(horizontal(target));
  if (away.lengthSq() < EPSILON) return zero();
  away.normalize().multiplyScalar(maxSpeed);
  // Flee inverts the desired velocity, not the already-subtracted Seek force.
  return steer(away, velocity, maxForce);
}

function arriveForce(context, target, slowRadius) {
  if (!target) return zero();
  const { position, velocity, maxSpeed, maxForce } = parameters(context);
  const offset = horizontal(target).sub(position);
  const distance = offset.length();
  if (distance < EPSILON) return steer(zero(), velocity, maxForce);
  const speed = maxSpeed * Math.min(1, distance / Math.max(slowRadius, EPSILON));
  return steer(offset.multiplyScalar(speed / distance), velocity, maxForce);
}

function targetPosition(target) { return target?.position ?? target; }
function targetVelocity(target) { return target?.velocity ?? zero(); }

export class SeekBehavior {
  constructor({ name = 'seek' } = {}) { this.name = name; }
  compute(context) { return seekForce(context, context.target); }
}

export class FleeBehavior {
  constructor({ name = 'flee', targetKey = 'threat' } = {}) { this.name = name; this.targetKey = targetKey; }
  compute(context) { return fleeForce(context, context[this.targetKey] ?? context.target); }
}

export class ArriveBehavior {
  constructor({ slowRadius = 90 } = {}) { this.name = 'arrive'; this.slowRadius = slowRadius; }
  compute(context) { return arriveForce(context, context.target, context.slowRadius ?? this.slowRadius); }
}

export class PursuitBehavior {
  constructor({ predictionSeconds = 0.5, maxPredictionSeconds = 2 } = {}) {
    this.name = 'pursuit'; this.predictionSeconds = predictionSeconds; this.maxPredictionSeconds = maxPredictionSeconds;
  }
  predictedTarget(context) {
    const target = context.targetAgent ?? context.target;
    if (!target) return null;
    const { position, maxSpeed } = parameters(context);
    const targetPos = horizontal(targetPosition(target));
    const targetVel = horizontal(targetVelocity(target));
    const horizon = context.predictionSeconds ?? this.predictionSeconds;
    const time = Number.isFinite(horizon)
      ? clamp(horizon, 0, context.maxPredictionSeconds ?? this.maxPredictionSeconds)
      : Math.min(this.maxPredictionSeconds, position.distanceTo(targetPos) / Math.max(maxSpeed, EPSILON));
    return targetPos.addScaledVector(targetVel, time);
  }
  compute(context) { return seekForce(context, this.predictedTarget(context)); }
}

export class EvadeBehavior extends PursuitBehavior {
  constructor(options = {}) { super(options); this.name = 'evade'; }
  compute(context) { return fleeForce(context, this.predictedTarget(context)); }
}

export class WanderBehavior {
  constructor({ circleDistance = 52, circleRadius = 24, angularJitter = 1.8 } = {}) {
    this.name = 'wander'; this.circleDistance = circleDistance; this.circleRadius = circleRadius;
    this.angularJitter = angularJitter; this.angles = new WeakMap(); this.targets = new WeakMap();
  }
  wanderTarget(context) {
    const { vehicle, position, velocity, maxSpeed, deltaTime } = parameters(context);
    let angle = this.angles.get(vehicle) ?? 0;
    const random = context.random ?? Math.random;
    angle += (random() * 2 - 1) * (context.angularJitter ?? this.angularJitter) * deltaTime;
    this.angles.set(vehicle, angle);
    const forward = velocity.lengthSq() > EPSILON ? velocity.normalize() : horizontal(vehicle.forward).normalize();
    if (forward.lengthSq() < EPSILON) forward.set(0, 0, -1);
    const center = position.clone().addScaledVector(forward, context.circleDistance ?? this.circleDistance);
    const radial = forward.clone().applyAxisAngle(new Vector3(0, 1, 0), angle).multiplyScalar(context.circleRadius ?? this.circleRadius);
    const target = center.add(radial).setY(0);
    this.targets.set(vehicle, target.clone());
    return target;
  }
  compute(context) { return seekForce(context, this.wanderTarget(context)); }
  getTarget(vehicle) { return this.targets.get(vehicle)?.clone() ?? null; }
}

function closestPointOnSegment(point, start, end) {
  const segment = end.clone().sub(start);
  const lengthSq = segment.lengthSq();
  const t = lengthSq < EPSILON ? 0 : clamp(point.clone().sub(start).dot(segment) / lengthSq, 0, 1);
  return start.clone().addScaledVector(segment, t);
}

export class ObstacleAvoidanceBehavior {
  constructor({ lookAhead = 90, minimumLookAhead = 18, secondAheadRatio = 0.45 } = {}) {
    this.name = 'obstacleAvoidance'; this.lookAhead = lookAhead; this.minimumLookAhead = minimumLookAhead;
    this.secondAheadRatio = secondAheadRatio; this.diagnostics = new WeakMap();
  }
  compute(context) {
    const { vehicle, position, velocity, maxSpeed, maxForce } = parameters(context);
    const obstacles = context.obstacles ?? [];
    const forward = velocity.lengthSq() > EPSILON ? velocity.normalize() : horizontal(vehicle.forward).normalize();
    if (forward.lengthSq() < EPSILON) forward.set(0, 0, -1);
    const ratio = maxSpeed > EPSILON ? clamp(velocity.length() / maxSpeed, 0, 1) : 0;
    const lookAhead = Math.max(this.minimumLookAhead, (context.lookAhead ?? this.lookAhead) * ratio);
    const ahead = position.clone().addScaledVector(forward, lookAhead);
    const ahead2 = position.clone().addScaledVector(forward, lookAhead * this.secondAheadRatio);
    const radius = vehicle.radius ?? context.vehicleRadius ?? 8;
    let nearest = null;
    for (const [index, obstacle] of obstacles.entries()) {
      const center = horizontal(obstacle.position ?? obstacle);
      const obstacleRadius = obstacle.radius ?? 0;
      const currentDistance = position.distanceTo(center);
      const hitPoint = currentDistance <= obstacleRadius + radius
        ? position.clone()
        : [ahead, ahead2].map((point) => closestPointOnSegment(point, position, ahead))
          .reduce((best, point) => point.distanceTo(center) < best.distanceTo(center) ? point : best);
      const clearance = hitPoint.distanceTo(center) - obstacleRadius - radius;
      if (clearance < 0 && (!nearest || clearance < nearest.clearance)) nearest = { center, hitPoint, clearance, index };
    }
    if (!nearest) {
      this.diagnostics.set(vehicle, { ahead, ahead2, obstacle: null, predictedCollision: false });
      return zero();
    }
    let away = nearest.hitPoint.clone().sub(nearest.center);
    if (away.lengthSq() < EPSILON) away.set(-forward.z, 0, forward.x).multiplyScalar(nearest.index % 2 ? -1 : 1);
    const desired = away.normalize().multiplyScalar(maxSpeed);
    const force = steer(desired, velocity, maxForce);
    this.diagnostics.set(vehicle, { ahead, ahead2, obstacle: nearest.center, predictedCollision: true });
    return force;
  }
}

function neighborsFor(context, radius) {
  const { vehicle, position } = parameters(context);
  return (context.neighbors ?? []).filter((neighbor) => {
    if (neighbor === vehicle) return false;
    const point = horizontal(neighbor.position ?? neighbor);
    return position.distanceToSquared(point) <= radius * radius;
  });
}

export class SeparationBehavior {
  constructor({ neighborRadius = 62 } = {}) { this.name = 'separation'; this.neighborRadius = neighborRadius; }
  compute(context) {
    const { position, maxForce } = parameters(context);
    const neighbors = neighborsFor(context, context.neighborRadius ?? this.neighborRadius);
    const repulsion = zero();
    for (const neighbor of neighbors) {
      const away = position.clone().sub(horizontal(neighbor.position ?? neighbor));
      const distance = away.length();
      if (distance > EPSILON) repulsion.add(away.multiplyScalar(1 / (distance * distance)));
    }
    return repulsion.clampLength(0, maxForce);
  }
}

export class AlignmentBehavior {
  constructor({ neighborRadius = 105 } = {}) { this.name = 'alignment'; this.neighborRadius = neighborRadius; }
  compute(context) {
    const { vehicle, velocity, maxSpeed, maxForce } = parameters(context);
    const neighbors = neighborsFor(context, context.neighborRadius ?? this.neighborRadius);
    if (!neighbors.length) return zero();
    const desired = neighbors.reduce((sum, neighbor) => sum.add(horizontal(neighbor.velocity ?? zero())), zero()).divideScalar(neighbors.length);
    if (desired.lengthSq() < EPSILON) return zero();
    return steer(desired.normalize().multiplyScalar(maxSpeed), velocity, maxForce);
  }
}

export class CohesionBehavior {
  constructor({ neighborRadius = 105 } = {}) { this.name = 'cohesion'; this.neighborRadius = neighborRadius; }
  compute(context) {
    const neighbors = neighborsFor(context, context.neighborRadius ?? this.neighborRadius);
    if (!neighbors.length) return zero();
    const center = neighbors.reduce((sum, neighbor) => sum.add(horizontal(neighbor.position ?? neighbor)), zero()).divideScalar(neighbors.length);
    return seekForce(context, center);
  }
}

export class PathFollowingBehavior {
  constructor(options = {}) { this.name = 'pathFollowing'; this.options = options; this.followers = new WeakMap(); }
  compute(context) {
    const { vehicle, maxSpeed, maxForce, deltaTime } = parameters(context);
    if (!context.waypoints || context.waypoints.length < 3) return zero();
    let follower = this.followers.get(vehicle);
    if (!follower) {
      follower = new PathFollowing(context.waypoints, { ...this.options, maxSpeed, maxForce });
      this.followers.set(vehicle, follower);
    }
    follower.maxSpeed = maxSpeed; follower.maxForce = maxForce;
    return follower.update(vehicle.position, vehicle.velocity, zero(), deltaTime);
  }
}

export class LeaderFollowingBehavior {
  constructor({ behindDistance = 46, forwardZoneRadius = 42, separationRadius = 54, separationWeight = 0.7, evadeWeight = 1 } = {}) {
    this.name = 'leaderFollowing'; this.behindDistance = behindDistance; this.forwardZoneRadius = forwardZoneRadius;
    this.separationRadius = separationRadius; this.separationWeight = separationWeight; this.evadeWeight = evadeWeight;
    this.diagnostics = new WeakMap();
  }
  compute(context) {
    const { vehicle, position, velocity, maxSpeed, maxForce } = parameters(context);
    if (context.isLeader) {
      const force = arriveForce(context, context.target, context.slowRadius ?? 90);
      this.diagnostics.set(vehicle, { role: 'leader', target: context.target, arrive: force.clone(), evade: zero(), separation: zero() });
      return force;
    }
    const leader = context.leader;
    if (!leader) return zero();
    const leaderPosition = horizontal(leader.position);
    const leaderForward = horizontal(leader.forward ?? leader.velocity).normalize();
    if (leaderForward.lengthSq() < EPSILON) leaderForward.set(0, 0, -1);
    const behindTarget = leaderPosition.clone().addScaledVector(leaderForward, -(context.behindDistance ?? this.behindDistance));
    const zoneRadius = context.forwardZoneRadius ?? this.forwardZoneRadius;
    const frontZoneCenter = leaderPosition.clone().addScaledVector(leaderForward, zoneRadius * 0.65);
    const relative = position.clone().sub(leaderPosition);
    const isAhead = relative.dot(leaderForward) > 0;
    const inFrontZone = isAhead && position.distanceTo(frontZoneCenter) <= zoneRadius;
    const arrive = arriveForce(context, behindTarget, context.slowRadius ?? 90);
    const evade = inFrontZone ? fleeForce(context, frontZoneCenter) : zero();
    const separation = new SeparationBehavior({ neighborRadius: context.separationRadius ?? this.separationRadius }).compute({
      ...context, neighbors: (context.neighbors ?? []).filter((neighbor) => neighbor !== vehicle),
    }).multiplyScalar(context.separationWeight ?? this.separationWeight);
    const arriveDebug = arrive.clone(), evadeDebug = evade.clone(), separationDebug = separation.clone();
    const force = arrive.addScaledVector(evade, context.evadeWeight ?? this.evadeWeight).add(separation).clampLength(0, maxForce);
    this.diagnostics.set(vehicle, { role: inFrontZone ? 'evading' : 'following', target: behindTarget, arrive: arriveDebug, evade: evadeDebug, separation: separationDebug });
    return force;
  }
}

export const STEERING_BEHAVIOR_FACTORIES = Object.freeze({
  seek: () => new SeekBehavior(),
  flee: () => new FleeBehavior(),
  arrive: () => new ArriveBehavior(),
  pursuit: () => new PursuitBehavior(),
  evade: () => new EvadeBehavior(),
  wander: () => new WanderBehavior(),
  obstacleAvoidance: () => new ObstacleAvoidanceBehavior(),
  separation: () => new SeparationBehavior(),
  alignment: () => new AlignmentBehavior(),
  cohesion: () => new CohesionBehavior(),
  leaderFollowing: () => new LeaderFollowingBehavior(),
  pathFollowing: () => new PathFollowingBehavior(),
});
