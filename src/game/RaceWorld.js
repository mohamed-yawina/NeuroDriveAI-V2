import { Vector3 } from 'three';
import { GameCar } from './GameCar.js';
import { GameVehicleDynamics } from './GameVehicleDynamics.js';
import { RaceDirector } from './RaceDirector.js';
import { RaceTiming } from './RaceTiming.js';
import { RaceController } from './RaceController.js';
import { deriveDRSZones } from './RaceCarMechanics.js';
import { calculatePitControls, createPitRoute, advancePitService } from './PitLane.js';
import { RaceFlagSystem } from './RaceFlagSystem.js';
import { PathFollowing } from '../ai/PathFollowing.js';
import { RaceLeaderboard } from './RaceLeaderboard.js';

const TEAM_COLORS = [0xe83c48, 0x42a5f5, 0xffc43d, 0x42d392, 0xb58af5, 0xff884d, 0xeeeeee, 0xf16f9e];
const MAX_SAFE_GRID_ROW_SPACING = 6.5;

function pointAtStation(path, station) {
  let remaining = ((station % path.totalLength) + path.totalLength) % path.totalLength;
  for (let index = 0; index < path.segmentLengths.length; index += 1) {
    const length = path.segmentLengths[index];
    if (remaining <= length) return path.waypoints[index].clone().lerp(path.waypoints[(index + 1) % path.waypoints.length], remaining / length);
    remaining -= length;
  }
  return path.waypoints[0].clone();
}

export class RaceWorld {
  constructor(track, { carCount = 6, laps = 3, playerIndex = 0, gridSpacing = 8, gridWidth = 5.4, trackHalfWidth = 7.5, dynamics = new GameVehicleDynamics(), director = new RaceDirector({ laps }), cars = null, gameplayMechanics = false, onDiagnostic = null } = {}) {
    if (!track?.waypoints || track.waypoints.length < 3) throw new TypeError('RaceWorld needs a closed waypoint track.');
    if (carCount < 2) throw new RangeError('A race needs at least two cars.');
    this.track = track;
    this.onDiagnostic = typeof onDiagnostic === 'function' ? onDiagnostic : null;
    this.gameplayMechanics = Boolean(gameplayMechanics);
    this.dynamics = dynamics;
    this.director = director;
    this.trackHalfWidth = trackHalfWidth;
    this.drsZones = track.drsZones ?? deriveDRSZones(track);
    this.cars = cars ?? RaceWorld.createGrid(track, { carCount, playerIndex, gridSpacing, gridWidth });
    this.timing = new RaceTiming(track, { laps, trackHalfWidth });
    for (const car of this.cars) {
      this.timing.register(car);
      car.raceMechanics?.setEnabled(gameplayMechanics);
      if (!car.isPlayer && !car.controller) car.controller = new RaceController(track, { car, trackHalfWidth });
    }
    this.collisionCount = 0;
    this.activeCollisionPairs = new Set();
    this.driverTelemetry = new Map(this.cars.map((car) => [car.id, { driverId: car.driverId ?? car.id, collisions: 0, carCollisions: 0, trackContacts: 0, offTrackEvents: 0, offTrackTime: 0, offTrack: false }]));
    this.paused = false;
    this.lastForces = new Map();
    this.pitStops = new Map(); this.formationSpeed = 25; this.savedFormationSpeeds = null;
    this.flags = new RaceFlagSystem(); this.flagState = this.flags.update({ cars: this.cars, director: this.director });
  }

  static createGrid(track, { carCount = 6, playerIndex = 0, gridSpacing = 8, gridWidth = 5.4 } = {}) {
    const start = track.waypoints[0];
    const path = new PathFollowing(track.waypoints);
    const slotSpacing = Math.min(gridSpacing, MAX_SAFE_GRID_ROW_SPACING);
    return Array.from({ length: carCount }, (_, index) => {
      const row = Math.floor(index / 2);
      const side = index % 2 === 0 ? -0.5 : 0.5;
      const station = path.totalLength - (4 + row * slotSpacing);
      const position = pointAtStation(path, station);
      const projection = path.project(position);
      const segmentStart = track.waypoints[projection.segmentIndex];
      const segmentEnd = track.waypoints[(projection.segmentIndex + 1) % track.waypoints.length];
      const forward = segmentEnd.clone().sub(segmentStart).setY(0).normalize();
      const lateral = new Vector3(-forward.z, 0, forward.x).normalize();
      position.addScaledVector(lateral, side * gridWidth);
      return new GameCar({
        id: `car-${index + 1}`, driverId: `car-${index + 1}`, gridPosition: index + 1, number: index + 1,
        name: index === playerIndex ? 'Joueur' : `IA ${index + 1}`,
        color: TEAM_COLORS[index % TEAM_COLORS.length], position, forward,
        isPlayer: index === playerIndex,
      });
    });
  }

  start({ formationLap = false } = {}) {
    const started = this.director.start({ formationLap });
    if (started && formationLap) {
      this.timing.laps = this.director.laps + 1;
      this.savedFormationSpeeds = new Map();
      for (const car of this.cars) {
        this.savedFormationSpeeds.set(car.id, car.maxSpeed);
        car.maxSpeed = Math.min(car.maxSpeed, this.formationSpeed);
        if (!car.controller) car.formationController = new RaceController(this.track, { car, trackHalfWidth: this.trackHalfWidth });
      }
    }
    return started;
  }

  update(dt, playerInput = { throttle: 0, brake: 0, steer: 0 }) {
    if (!(dt > 0) || !Number.isFinite(dt) || dt > 0.1) throw new RangeError('RaceWorld expects a positive fixed simulation step no larger than 0.1 seconds.');
    if (this.paused || this.director.state === 'grid' || this.director.state === 'finished') return this.director.state;
    this.director.update(dt, this.cars);
    if (this.director.state === 'countdown' && this.savedFormationSpeeds) this.restoreFormationGrid();
    if (this.director.state === 'formation') return this.updateFormation(dt);
    if (this.director.state !== 'racing') return this.director.state;
    const obstacles = this.cars;
    for (const car of this.cars) {
      if (car.finished) continue;
      if (car.isPlayer) {
        const pitInput = this.pitStops.has(car.id) ? this.updatePitStop(car, dt) : null;
        const input = pitInput ?? playerInput;
        this.updateCarMechanics(car, input, dt);
        this.dynamics.stepPlayer(car, input, dt);
        this.lastForces.set(car.id, new Vector3());
      } else {
        this.updateCarMechanics(car, null, dt);
        const force = car.controller?.compute?.({
          car, vehicle: car, cars: obstacles, track: this.track, world: this, deltaTime: dt,
        }) ?? new Vector3().set(0, 0, 0);
        this.lastForces.set(car.id, force.clone());
        this.dynamics.step(car, force, dt);
      }
    }
    this.resolveTrackLimits(dt);
    this.resolveCarCollisions();
    this.finishPitService(dt);
    const timingEvents = this.timing.update(this.cars, dt);
    this.emitTimingDiagnostics(timingEvents);
    this.updateRaceFlags(dt);
    this.director.update(0, this.cars);
    this.updateRaceFlags(0);
    return this.director.state;
  }

  updateFormation(dt) {
    for (const car of this.cars) {
      const controller = car.controller ?? car.formationController;
      const force = controller?.compute?.({ car, cars: this.cars, track: this.track, world: this, deltaTime: dt }) ?? new Vector3();
      this.dynamics.step(car, force, dt);
    }
    this.resolveTrackLimits(dt); this.resolveCarCollisions(); const timingEvents = this.timing.update(this.cars, dt); this.emitTimingDiagnostics(timingEvents); this.updateRaceFlags(dt); this.director.update(0, this.cars); this.updateRaceFlags(0);
    if (this.director.state === 'countdown') this.restoreFormationGrid();
    return this.director.state;
  }

  emitTimingDiagnostics(events = []) {
    if (!this.onDiagnostic || events.length === 0) return;
    const ranked = RaceLeaderboard.rank(this.cars);
    const ranks = new Map(ranked.map((car) => [car.id, car.position]));
    for (const event of events) {
      const car = this.cars.find((entry) => entry.id === event.carId);
      if (!car) continue;
      const liveRank = ranks.get(car.id) ?? null;
      this.onDiagnostic({
        event: event.type, driverId: car.driverId ?? car.id, carId: car.id, isHuman: car.isPlayer === true,
        gridPosition: car.gridPosition, completedLaps: car.completedLaps,
        validatedProgress: car.validatedProgress, totalProgress: car.validatedProgress,
        finishTime: car.finishTime, liveRank, finalRank: car.finished ? liveRank : null,
        displayedRank: null, raceState: this.director.state,
      });
    }
  }

  updateRaceFlags(dt) {
    const values = [...this.driverTelemetry.values()];
    this.flagState = this.flags.update({ cars: this.cars, director: this.director, collisionCount: values.reduce((sum, item) => sum + item.carCollisions, 0), offTrackEvents: values.reduce((sum, item) => sum + item.offTrackEvents, 0) }, dt);
    return this.flagState;
  }

  restoreFormationGrid() {
    const grid = RaceWorld.createGrid(this.track, { carCount: this.cars.length, playerIndex: this.cars.findIndex((car) => car.isPlayer) });
    this.cars.forEach((car, index) => {
      car.position.copy(grid[index].position); car.forward.copy(grid[index].forward); car.velocity.set(0, 0, 0); car.yaw = grid[index].yaw;
      car.maxSpeed = this.savedFormationSpeeds.get(car.id); car.completedLaps = 0; car.lapTimes = []; car.currentLapTime = 0; car.bestLapTime = null; car.finishTime = null; car.raceTime = 0; car.progress = 0; car.finished = false;
      car.formationController = null; car.controller?.reset?.();
    });
    this.timing = new RaceTiming(this.track, { laps: this.director.laps, trackHalfWidth: this.trackHalfWidth }); this.cars.forEach((car) => this.timing.register(car));
    this.driverTelemetry = new Map(this.cars.map((car) => [car.id, { driverId: car.driverId ?? car.id, collisions: 0, carCollisions: 0, trackContacts: 0, offTrackEvents: 0, offTrackTime: 0, offTrack: false }]));
    this.activeCollisionPairs.clear();
    this.flags.reset(); this.flagState = this.flags.update({ cars: this.cars, director: this.director });
    this.savedFormationSpeeds = null;
  }

  updateCarMechanics(car, input, dt) {
    const systems = car.raceMechanics;
    if (!systems?.enabled) return;
    const station = (car.progress ?? 0) * this.timing.path.totalLength;
    const totalLength = this.timing.path.totalLength;
    const inDRSZone = this.drsZones.some((zone) => zone.end <= totalLength ? station >= zone.start && station <= zone.end : station >= zone.start || station <= zone.end - totalLength);
    const rivalGaps = this.cars.filter((other) => other !== car && !other.finished).map((other) => {
      const distance = ((other.progress - car.progress + 1) % 1) * this.timing.path.totalLength;
      return distance > 0 && distance < this.timing.path.totalLength / 2 ? distance / Math.max(car.velocity.length(), 1) : Infinity;
    });
    const rivalGapSeconds = Math.min(...rivalGaps, Infinity);
    systems.advance(dt, { speed: car.velocity.length(), brake: input?.brake ?? 0, throttle: input?.throttle ?? 0, steering: input?.steer ?? 0, drsRequested: input?.drsRequested ?? systems.drsRequested, ersDeploy: input?.ersDeploy ?? systems.ersDeploy, inDRSZone, rivalGapSeconds });
  }

  setGameplayMechanics(enabled) {
    this.gameplayMechanics = Boolean(enabled);
    for (const car of this.cars) car.raceMechanics?.setEnabled(enabled);
    if (!enabled) { for (const [id] of this.pitStops) { const car = this.cars.find((candidate) => candidate.id === id); if (car?.raceMechanics) car.raceMechanics.pitState = 'track'; } this.pitStops.clear(); }
    return Boolean(enabled);
  }

  requestPitStop(carId, compound = 'medium') {
    const car = this.cars.find((candidate) => candidate.id === carId);
    if (this.director.state !== 'racing' || !car?.isPlayer || !car.raceMechanics?.enabled || this.pitStops.has(car.id) || !['soft', 'medium', 'hard'].includes(compound)) return false;
    const route = createPitRoute(this.track, this.timing, car.position, { trackHalfWidth: this.trackHalfWidth });
    this.pitStops.set(car.id, { route, compound, phase: 'entry', elapsed: 0 }); car.raceMechanics.pitState = 'entry'; return true;
  }

  updatePitStop(car, dt) {
    const stop = this.pitStops.get(car.id); if (!stop) return null;
    if (stop.phase === 'entry' && car.position.distanceTo(stop.route.entry) < 2.5) stop.phase = 'service-approach';
    if (stop.phase === 'service-approach') {
      if (car.position.distanceTo(stop.route.service) < 2.8) { stop.phase = 'service'; stop.elapsed = 0; }
      return calculatePitControls(car, stop.route.service, stop.route.pitSpeedLimit);
    }
    if (stop.phase === 'service') return { throttle: 0, brake: 1, steer: 0 };
    if (stop.phase === 'exit' && car.position.distanceTo(stop.route.exit) < 3) stop.phase = 'merge';
    if (stop.phase === 'merge') {
      if (car.position.distanceTo(stop.route.merge) < 4) { this.pitStops.delete(car.id); car.raceMechanics.pitState = 'track'; return { throttle: 0, brake: 0, steer: 0 }; }
      return calculatePitControls(car, stop.route.merge, stop.route.pitSpeedLimit);
    }
    return calculatePitControls(car, stop.phase === 'entry' ? stop.route.entry : stop.route.exit, stop.route.pitSpeedLimit);
  }

  finishPitService(dt) {
    for (const [id, stop] of this.pitStops) {
      if (stop.phase !== 'service') continue;
      const car = this.cars.find((candidate) => candidate.id === id);
      const next = advancePitService(car, stop.route.service, dt, stop);
      Object.assign(stop, next);
      if (next.completed) { car.raceMechanics.setCompound(stop.compound); car.raceMechanics.repair(); car.raceMechanics.pitState = 'exit'; }
    }
  }

  resolveTrackLimits(dt = 1 / 60) {
    const projection = new Vector3();
    for (const car of this.cars) {
      const nearest = this.timing.path.project(car.position, projection);
      const offset = car.position.clone().sub(nearest.point).setY(0);
      const distance = offset.length();
      const allowed = Math.max(1, this.trackHalfWidth - car.radius * 0.45);
      const telemetry = this.driverTelemetry.get(car.id);
      if (this.pitStops.has(car.id)) continue;
      const outside = distance > allowed;
      if (outside) {
        if (telemetry && !telemetry.offTrack) telemetry.offTrackEvents += 1;
        if (telemetry) { telemetry.offTrack = true; telemetry.offTrackTime += dt; telemetry.trackContacts += 1; telemetry.collisions += 1; }
      } else if (telemetry) telemetry.offTrack = false;
      if (!outside) continue;
      const normal = offset.lengthSq() > 1e-8 ? offset.normalize() : new Vector3(-car.forward.z, 0, car.forward.x);
      car.position.copy(nearest.point).addScaledVector(normal, allowed);
      const outwardSpeed = car.velocity.dot(normal);
      car.raceMechanics?.applyImpact(Math.abs(outwardSpeed));
      if (outwardSpeed > 0) car.velocity.addScaledVector(normal, -outwardSpeed * 1.15);
      this.collisionCount += 1;
    }
  }

  resolveCarCollisions() {
    const currentCollisionPairs = new Set();
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        const delta = b.position.clone().sub(a.position).setY(0);
        const minimum = a.radius + b.radius;
        const distance = delta.length();
        if (distance >= minimum) continue;
        const pairKey = `${a.id}\u0000${b.id}`;
        currentCollisionPairs.add(pairKey);
        const newContact = !this.activeCollisionPairs.has(pairKey);
        const normal = distance > 1e-6 ? delta.multiplyScalar(1 / distance) : new Vector3(i % 2 ? -1 : 1, 0, 0);
        const overlap = minimum - distance + 0.002;
        a.position.addScaledVector(normal, -overlap * 0.5);
        b.position.addScaledVector(normal, overlap * 0.5);
        const relativeSpeed = b.velocity.clone().sub(a.velocity).dot(normal);
        if (relativeSpeed < 0) {
          const impulse = -(1 + 0.16) * relativeSpeed * 0.5;
          a.velocity.addScaledVector(normal, -impulse);
          b.velocity.addScaledVector(normal, impulse);
        }
        if (newContact) {
          a.raceMechanics?.applyImpact(Math.abs(relativeSpeed)); b.raceMechanics?.applyImpact(Math.abs(relativeSpeed));
          this.collisionCount += 1;
          const telemetryA = this.driverTelemetry.get(a.id), telemetryB = this.driverTelemetry.get(b.id);
          for (const telemetry of [telemetryA, telemetryB]) if (telemetry) { telemetry.collisions += 1; telemetry.carCollisions += 1; }
        }
      }
    }
    this.activeCollisionPairs = currentCollisionPairs;
  }

  getDriverTelemetry(carOrId) {
    const car = typeof carOrId === 'string' ? this.cars.find((candidate) => candidate.id === carOrId) : carOrId;
    if (!car) throw new TypeError('Unknown race car.');
    const telemetry = this.driverTelemetry.get(car.id);
    return {
      driverId: telemetry?.driverId ?? car.driverId ?? car.id,
      progress: car.progress,
      validatedProgress: car.validatedProgress,
      completedLaps: car.completedLaps,
      lapTimes: [...(car.lapTimes ?? [])],
      bestLapTime: car.bestLapTime,
      collisions: telemetry?.collisions ?? 0,
      carCollisions: telemetry?.carCollisions ?? 0,
      trackContacts: telemetry?.trackContacts ?? 0,
      offTrackEvents: telemetry?.offTrackEvents ?? 0,
      offTrackTime: telemetry?.offTrackTime ?? 0,
      status: car.finished ? 'finished' : this.director.state === 'finished' ? 'race-ended' : this.director.state,
      success: car.finished,
    };
  }

  reset() {
    this.director = new RaceDirector({ countdownSeconds: this.director.countdownSeconds, laps: this.director.laps, maxFinishDelay: this.director.maxFinishDelay, maxFormationSeconds: this.director.maxFormationSeconds });
    const grid = RaceWorld.createGrid(this.track, { carCount: this.cars.length, playerIndex: this.cars.findIndex((car) => car.isPlayer) });
    this.cars.forEach((car, index) => {
      const fresh = grid[index];
      car.position.copy(fresh.position); car.forward.copy(fresh.forward); car.velocity.set(0, 0, 0); car.yaw = fresh.yaw;
      car.completedLaps = 0; car.lapTimes = []; car.currentLapTime = 0; car.bestLapTime = null; car.finishTime = null; car.raceTime = 0;
      car.progress = 0; car.finished = false; car.station = 0; car.totalTrackLength = this.timing.path.totalLength;
      car.controller?.reset?.();
      car.raceMechanics?.reset?.();
    });
    this.timing = new RaceTiming(this.track, { laps: this.director.laps, trackHalfWidth: this.trackHalfWidth });
    this.cars.forEach((car) => this.timing.register(car));
    this.paused = false;
    this.collisionCount = 0;
    this.activeCollisionPairs.clear();
    this.driverTelemetry = new Map(this.cars.map((car) => [car.id, { driverId: car.driverId ?? car.id, collisions: 0, carCollisions: 0, trackContacts: 0, offTrackEvents: 0, offTrackTime: 0, offTrack: false }]));
    this.lastForces.clear();
    this.pitStops.clear();
    this.flags.reset(); this.flagState = this.flags.update({ cars: this.cars, director: this.director });
  }
}
