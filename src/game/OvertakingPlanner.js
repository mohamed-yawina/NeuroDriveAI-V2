import { Vector3 } from 'three';
import { PathFollowing } from '../ai/PathFollowing.js';

const clampStep = (value, target, amount) => value + Math.max(-amount, Math.min(amount, target - value));

export class OvertakingPlanner {
  constructor(track, { trackHalfWidth = 8.2, laneOffset = 4.55, lookAhead = 32, triggerDistance = 26, clearDistance = 9, lateralRate = 4.2, minimumGap = 4.05 } = {}) {
    this.track = track;
    this.trackHalfWidth = trackHalfWidth;
    this.laneOffset = laneOffset;
    this.lookAhead = lookAhead;
    this.triggerDistance = triggerDistance;
    this.clearDistance = clearDistance;
    this.lateralRate = lateralRate;
    this.minimumGap = minimumGap;
    this.path = new PathFollowing(track.waypoints, { trackHalfWidth });
    this.segmentLengths = this.path.segmentLengths;
    this.totalLength = this.path.totalLength;
    this.defenseEnabled = false;
    this.defenseCar = null;
    this.defenseSide = 0;
  }

  update(car, cars, dt) {
    const count = this.track.waypoints.length;
    const project = (position) => {
      const result = this.path.project(position);
      const station = this.segmentLengths.slice(0, result.segmentIndex).reduce((sum, value) => sum + value, 0) + this.segmentLengths[result.segmentIndex] * result.t;
      return { ...result, station };
    };
    const current = project(car.position);
    const start = this.track.waypoints[current.segmentIndex], end = this.track.waypoints[(current.segmentIndex + 1) % count];
    const tangent = end.clone().sub(start).setY(0).normalize();
    const normal = new Vector3(-tangent.z, 0, tangent.x).normalize();
    const nearby = cars.filter((other) => other !== car && !other.finished).map((other) => {
      const point = project(other.position);
      let delta = (point.station - current.station + this.totalLength) % this.totalLength;
      if (delta > this.totalLength / 2) delta -= this.totalLength;
      const lateral = other.position.clone().sub(point.point).dot(normal);
      return { car: other, point, delta, lateral };
    });
    let target = this.targetCar ? nearby.find(({ car: other }) => other.id === this.targetCar.id) : null;
    if (target && target.delta < -this.clearDistance) {
      this.targetCar = null;
      target = null;
    }
    if (!target) {
      target = nearby
        .filter((other) => other.delta > 4 && other.delta < this.triggerDistance && Math.abs(other.lateral) < 3.2)
        .sort((a, b) => a.delta - b.delta)[0] ?? null;
      if (target) this.targetCar = target.car;
    }

    let desiredOffset = 0;
    let side = 0;
    let defense = null;
    if (target) {
      const maxOffset = Math.min(this.laneOffset, this.trackHalfWidth - car.radius - 1.25);
      const options = [-1, 1].map((direction) => {
        const offset = direction * maxOffset;
        const blockers = nearby.filter((other) => other.delta > -6 && other.delta < this.lookAhead && Math.abs(other.lateral - offset) < this.minimumGap);
        return { direction, offset, clear: blockers.length === 0, clearance: blockers.length ? Math.min(...blockers.map((blocker) => Math.abs(blocker.lateral - offset))) : Infinity };
      }).sort((a, b) => Number(b.clear) - Number(a.clear) || b.clearance - a.clearance || (car.number % 2 ? a.direction - b.direction : b.direction - a.direction));
      const selected = options.find((option) => option.clear);
      if (selected) { desiredOffset = selected.offset; side = selected.direction; }
      this.clearDefense();
    } else if (this.defenseEnabled) {
      let threat = this.defenseCar ? nearby.find(({ car: rival }) => rival.id === this.defenseCar.id) : null;
      if (threat && (threat.delta > this.clearDistance || threat.delta < -this.triggerDistance * 1.35)) {
        this.clearDefense();
        threat = null;
      }
      if (!threat) {
        threat = nearby
          .filter((other) => other.delta < -this.clearDistance && other.delta > -this.triggerDistance && Math.abs(other.lateral) < 3.2)
          .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0] ?? null;
        if (threat) {
          this.defenseCar = threat.car;
          this.defenseSide = threat.lateral > 0.15 ? -1 : threat.lateral < -0.15 ? 1 : (car.number % 2 ? 1 : -1);
        }
      }
      if (threat) {
        const maxOffset = Math.min(this.laneOffset, this.trackHalfWidth - car.radius - 1.25);
        const candidate = this.defenseSide * maxOffset;
        const blocked = nearby.some((other) => other.car !== threat.car
          && other.delta > -6 && other.delta < this.lookAhead
          && Math.abs(other.lateral - candidate) < this.minimumGap);
        if (!blocked && maxOffset > 0) {
          desiredOffset = candidate;
          side = this.defenseSide;
          defense = { active: true, targetCar: threat.car, side, desiredOffset, safe: true };
        } else {
          defense = { active: true, targetCar: threat.car, side: 0, desiredOffset: 0, safe: false };
        }
      }
    }
    car.laneOffset = clampStep(car.laneOffset ?? 0, desiredOffset, this.lateralRate * dt);
    const pursuitTarget = target && side
      ? { position: target.car.position.clone().addScaledVector(target.car.forward, 11).addScaledVector(normal, desiredOffset), velocity: target.car.velocity }
      : null;
    return {
      active: Boolean(target && side), targetCar: target?.car ?? null,
      side, desiredOffset, laneOffset: car.laneOffset, pursuitTarget,
      currentStation: current.station, totalLength: this.totalLength,
      returning: !target && Math.abs(car.laneOffset) > 1e-4,
      safe: Boolean(target && side),
      defense,
    };
  }

  clearDefense() { this.defenseCar = null; this.defenseSide = 0; }
  reset(car = null) { this.targetCar = null; this.clearDefense(); if (car) car.laneOffset = 0; }
}
