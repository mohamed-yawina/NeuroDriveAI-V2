import { Vector3 } from 'three';
import { PathFollowing } from '../ai/PathFollowing.js';
import { seek } from '../ai/SeekBehavior.js';
import { BehaviorManager } from '../ai/behaviors/BehaviorManager.js';
import { ObstacleAvoidanceBehavior, PursuitBehavior, SeparationBehavior } from '../ai/behaviors/SteeringBehaviors.js';
import { OvertakingPlanner } from './OvertakingPlanner.js';

/** Arcade-only path lookup: distance is measured forward from the current projection. */
export function racePointAhead(waypoints, segmentLengths, segmentIndex, t, distance, out = new Vector3()) {
  if (!Array.isArray(waypoints) || waypoints.length < 2 || !Number.isFinite(distance) || distance < 0) {
    throw new RangeError('Race path lookahead needs a valid path and non-negative distance.');
  }
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  let remaining = distance % totalLength;
  let index = ((segmentIndex % waypoints.length) + waypoints.length) % waypoints.length;
  let cursor = Math.max(0, Math.min(1, t));
  for (let visited = 0; visited <= waypoints.length; visited += 1) {
    const length = segmentLengths[index];
    const available = length * (1 - cursor);
    if (remaining <= available) {
      const end = waypoints[(index + 1) % waypoints.length];
      return out.copy(waypoints[index]).lerp(end, cursor + remaining / length);
    }
    remaining -= available;
    index = (index + 1) % waypoints.length;
    cursor = 0;
  }
  return out.copy(waypoints[index]);
}

class RacePathFollowingBehavior {
  constructor(track) {
    this.name = 'pathFollowing'; this.track = track; this.followers = new WeakMap(); this.diagnostics = new WeakMap();
    this.lookAhead = 11; this.lookAheadTime = 0.25; this.predictionTime = 0.22;
  }
  compute(context) {
    const car = context.vehicle;
    let follower = this.followers.get(car);
    if (!follower) {
      follower = new PathFollowing(this.track.waypoints, { lookAhead: this.lookAhead, lookAheadTime: this.lookAheadTime, predictionTime: this.predictionTime, trackHalfWidth: 7.2, maxSpeed: car.maxSpeed, maxForce: car.maxForce, maxDeceleration: 24, steeringResponse: 6.5 });
      this.followers.set(car, follower);
    }
    follower.maxSpeed = car.maxSpeed;
    follower.maxForce = car.maxForce;
    follower.lookAhead = this.lookAhead;
    follower.lookAheadTime = this.lookAheadTime;
    follower.predictionTime = this.predictionTime;
    follower.update(car.position, car.velocity, new Vector3(), context.deltaTime);
    const projection = follower.project(car.position);
    // Preserve the established arcade racing line while making the exposed
    // look-ahead controls affect its target. The shared PathFollowing instance
    // supplies the projection; offsets are relative to its documented defaults.
    const targetDistance = Math.max(0,
      10 + car.velocity.length() * 0.32
      + (this.lookAhead - 11)
      + (this.lookAheadTime - 0.25) * car.velocity.length(),
    );
    const target = racePointAhead(this.track.waypoints, follower.segmentLengths, projection.segmentIndex, projection.t, targetDistance);
    const start = this.track.waypoints[projection.segmentIndex];
    const end = this.track.waypoints[(projection.segmentIndex + 1) % this.track.waypoints.length];
    const tangent = end.clone().sub(start).setY(0).normalize();
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize();
    target.addScaledVector(normal, car.laneOffset ?? 0);
    const speed = Math.min(car.maxSpeed, follower.speedTarget);
    this.diagnostics.set(car, {
      segmentIndex: projection.segmentIndex,
      distanceToPath: projection.distance,
      curvatureRadians: follower.curvature,
      targetSpeed: speed,
      target: target.clone(),
    });
    return seek(car.position, target, car.velocity, speed, car.maxForce);
  }
  reset(car) { this.followers.get(car)?.reset(0); }
  getDiagnostics(car) { return this.diagnostics.get(car) ?? null; }
}

export const RACE_AI_PROFILES = Object.freeze({
  prudent: Object.freeze({ label: 'Prudent', maxSpeed: 0.9, weights: Object.freeze({ pathFollowing: 1, obstacleAvoidance: 3.1, separation: 22, pursuit: 0.18 }), overtakeDistance: 21 }),
  balanced: Object.freeze({ label: 'Équilibré', maxSpeed: 1, weights: Object.freeze({ pathFollowing: 1, obstacleAvoidance: 2.4, separation: 18, pursuit: 0.36 }), overtakeDistance: 26 }),
  aggressive: Object.freeze({ label: 'Agressif', maxSpeed: 1.035, weights: Object.freeze({ pathFollowing: 1, obstacleAvoidance: 2.2, separation: 15, pursuit: 0.52 }), overtakeDistance: 33 }),
});

export class RaceController {
  constructor(track, { car, trackHalfWidth = 8.2 } = {}) {
    this.track = track;
    this.car = car;
    this.overtaking = new OvertakingPlanner(track, { trackHalfWidth });
    this.pathBehavior = new RacePathFollowingBehavior(track);
    this.obstacleBehavior = new ObstacleAvoidanceBehavior({ lookAhead: 62, minimumLookAhead: 10 });
    this.separationBehavior = new SeparationBehavior({ neighborRadius: 9 });
    this.pursuitBehavior = new PursuitBehavior({ predictionSeconds: 0.35, maxPredictionSeconds: 0.65 });
    this.manager = new BehaviorManager({ maxForce: car?.maxForce ?? 28 });
    this.manager.add(this.pathBehavior, 1.0);
    this.manager.add(this.obstacleBehavior, 2.4);
    this.manager.add(this.separationBehavior, 18);
    this.manager.add(this.pursuitBehavior, 0.36);
    this.manager.deactivate('pursuit');
    this.lastPlan = null;
    this.profile = 'balanced';
    this.baseMaxSpeed = car?.maxSpeed ?? 56;
    this.baseMaxForce = car?.maxForce ?? 28;
    this.defenseEnabled = false;
    this.behaviorEnabled = new Map([['pathFollowing', true], ['obstacleAvoidance', true], ['separation', true], ['pursuit', true]]);
  }

  configureBehavior(name, { active, weight, parameters = {} } = {}) {
    const entry = this.manager.entryFor(name);
    if (!entry) return false;
    const target = {
      pathFollowing: this.pathBehavior,
      obstacleAvoidance: this.obstacleBehavior,
      separation: this.separationBehavior,
      pursuit: this.pursuitBehavior,
    }[name];
    const allowed = {
      pathFollowing: ['lookAhead', 'lookAheadTime', 'predictionTime'],
      obstacleAvoidance: ['lookAhead', 'minimumLookAhead'],
      separation: ['neighborRadius'],
      pursuit: ['predictionSeconds', 'maxPredictionSeconds'],
    }[name];
    for (const [key, value] of Object.entries(parameters)) {
      if (!allowed.includes(key) || !Number.isFinite(value) || value < 0) throw new RangeError(`Invalid ${name} parameter: ${key}`);
    }
    if (active !== undefined) {
      this.behaviorEnabled.set(name, Boolean(active));
      if (name !== 'pursuit') this.manager.setActive(name, active);
    }
    if (weight !== undefined) this.manager.changeWeight(name, weight);
    for (const [key, value] of Object.entries(parameters)) {
      target[key] = value;
    }
    return true;
  }

  getBehaviorConfiguration() {
    return [...this.manager.behaviors].map(([name, entry]) => ({ name, active: this.behaviorEnabled.get(name) ?? entry.active, runtimeActive: entry.active, weight: entry.weight }));
  }

  setProfile(profile) {
    const preset = RACE_AI_PROFILES[profile];
    if (!preset) throw new RangeError(`Unknown race AI profile: ${profile}`);
    this.profile = profile;
    if (this.car) this.car.maxSpeed = Math.min(58, this.baseMaxSpeed * preset.maxSpeed);
    for (const [name, weight] of Object.entries(preset.weights)) this.manager.changeWeight(name, weight);
    this.overtaking.triggerDistance = preset.overtakeDistance;
    return this.profile;
  }

  setMaxSpeed(maxSpeed) {
    if (!Number.isFinite(maxSpeed) || maxSpeed < 0 || maxSpeed > 58 || !this.car) throw new RangeError('Arcade maxSpeed must be between 0 and 58.');
    this.car.maxSpeed = maxSpeed;
    return maxSpeed;
  }

  setMaxForce(maxForce) {
    if (!Number.isFinite(maxForce) || maxForce < 0 || maxForce > 42 || !this.car) throw new RangeError('Arcade maxForce must be between 0 and 42.');
    this.car.maxForce = maxForce;
    this.manager.maxForce = maxForce;
    return maxForce;
  }

  setDefenseEnabled(enabled) {
    this.defenseEnabled = Boolean(enabled);
    this.overtaking.defenseEnabled = this.defenseEnabled;
    if (!this.defenseEnabled) this.overtaking.clearDefense?.();
    return this.defenseEnabled;
  }

  getDecisionSummary() {
    const plan = this.lastPlan;
    const path = this.pathBehavior.getDiagnostics(this.car);
    if (!plan) return 'En attente du premier calcul de contrôle.';
    if (plan.active && plan.safe) return `Dépassement engagé sur le côté latéral ${plan.side > 0 ? '+' : '−'}; cible ${plan.targetCar?.name ?? 'adversaire'} détectée à ${plan.currentStation.toFixed(1)} m sur la projection du circuit.`;
    if (plan.targetCar && !plan.safe) return 'Adversaire détecté devant, mais les trajectoires latérales sont occupées : maintien de la ligne.';
    if (plan.defense?.active) return plan.defense.safe
      ? `Défense activée face à ${plan.defense.targetCar?.name ?? 'un poursuivant'} : décalage stable vers une voie libre.`
      : `Poursuivant détecté (${plan.defense.targetCar?.name ?? 'adversaire'}), mais aucun décalage sûr : maintien de la ligne.`;
    if (plan.returning) return 'L’adversaire est dégagé : retour progressif vers la ligne de course.';
    if (path && path.curvatureRadians > 0.15) return `Courbure anticipée de ${(path.curvatureRadians * 180 / Math.PI).toFixed(0)}°; vitesse cible issue du follower : ${path.targetSpeed.toFixed(1)} m/s.`;
    return path ? `Path Following actif : segment ${path.segmentIndex + 1}, écart latéral ${path.distanceToPath.toFixed(1)} m, vitesse cible ${path.targetSpeed.toFixed(1)} m/s.` : 'Path Following actif.';
  }

  resetConfiguration() {
    this.setProfile('balanced');
    this.setDefenseEnabled(false);
    if (this.car) this.car.maxForce = this.baseMaxForce;
    this.manager.maxForce = this.baseMaxForce;
    this.pathBehavior.lookAhead = 11; this.pathBehavior.lookAheadTime = 0.25; this.pathBehavior.predictionTime = 0.22;
    this.obstacleBehavior.lookAhead = 62; this.obstacleBehavior.minimumLookAhead = 10;
    this.separationBehavior.neighborRadius = 9;
    this.pursuitBehavior.predictionSeconds = 0.35; this.pursuitBehavior.maxPredictionSeconds = 0.65;
    this.behaviorEnabled = new Map([['pathFollowing', true], ['obstacleAvoidance', true], ['separation', true], ['pursuit', true]]);
    for (const name of this.behaviorEnabled.keys()) this.manager.setActive(name, name !== 'pursuit');
  }

  getDecisionData(car = this.car) {
    return {
      profile: this.profile,
      defenseEnabled: this.defenseEnabled,
      maxSpeed: car?.maxSpeed ?? 0,
      maxForce: car?.maxForce ?? 0,
      plan: this.lastPlan,
      path: this.pathBehavior.getDiagnostics(car),
      behaviors: this.getBehaviorConfiguration(),
      forces: car?.debugForces ?? null,
    };
  }

  compute({ car = this.car, cars = [], deltaTime = 1 / 60 } = {}) {
    if (!car) throw new TypeError('RaceController.compute needs its controlled car.');
    this.overtaking.defenseEnabled = this.defenseEnabled && !car.raceFlags?.blue;
    this.lastPlan = this.overtaking.update(car, cars, deltaTime);
    const opponents = cars.filter((other) => other !== car && !other.finished);
    const context = {
      vehicle: car, maxSpeed: car.maxSpeed, maxForce: car.maxForce, deltaTime,
      waypoints: this.track.waypoints, neighbors: opponents, obstacles: opponents,
      // PursuitBehavior reads its configurable predictionSeconds property.
      targetAgent: this.lastPlan.pursuitTarget,
    };
    if (this.lastPlan.active && this.behaviorEnabled.get('pursuit')) this.manager.activate('pursuit');
    else this.manager.deactivate('pursuit');
    const force = this.manager.getSteeringForce(context);
    car.debugForces = this.manager.getDebugData();
    return force;
  }

  reset() {
    this.resetConfiguration();
    this.overtaking.reset(this.car); this.pathBehavior.reset(this.car);
    this.lastPlan = null;
  }
}
