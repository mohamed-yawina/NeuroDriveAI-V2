import { Vector3 } from 'three';
import { RaceCarMechanics } from './RaceCarMechanics.js';

export class GameCar {
  constructor({ id, driverId = id, gridPosition = null, number, name, color = 0xe83c48, position, forward, isPlayer = false, maxSpeed = 56, maxForce = 28, radius = 1.65 }) {
    if (!id || !position || !forward) throw new TypeError('GameCar needs an id, position and forward vector.');
    this.id = id;
    this.driverId = driverId;
    this.gridPosition = Number.isInteger(gridPosition) && gridPosition > 0 ? gridPosition : null;
    this.number = number ?? 1;
    this.name = name ?? `Driver ${this.number}`;
    this.color = color;
    this.isPlayer = Boolean(isPlayer);
    this.position = position.clone();
    this.forward = forward.clone().setY(0).normalize();
    this.velocity = new Vector3();
    this.yaw = Math.atan2(this.forward.x, -this.forward.z);
    this.maxSpeed = maxSpeed;
    this.maxForce = maxForce;
    this.radius = radius;
    this.vehicle = this;
    this.completedLaps = 0;
    this.raceStarted = false;
    this.lapTimes = [];
    this.currentLapTime = 0;
    this.bestLapTime = null;
    this.finishTime = null;
    this.raceTime = 0;
    this.progress = 0;
    this.finished = false;
    this.controller = null;
    this.debugForces = null;
    this.raceMechanics = new RaceCarMechanics();
  }
}
