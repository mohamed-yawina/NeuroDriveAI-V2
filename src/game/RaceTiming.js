import { Vector3 } from 'three';
import { PathFollowing } from '../ai/PathFollowing.js';

function crossingFraction(a, b) { return Math.abs(a - b) < 1e-9 ? 0 : a / (a - b); }
const MIN_VALID_LAP_ROUTE_FRACTION = 0.9;
const MAX_PROJECTION_JUMP_METERS = 0.75;

export class RaceTiming {
  constructor(track, { laps = 3, trackHalfWidth = 7.5 } = {}) {
    if (!track?.waypoints || track.waypoints.length < 3) throw new TypeError('Race timing needs a closed waypoint track.');
    this.track = track;
    this.laps = laps;
    this.trackHalfWidth = trackHalfWidth;
    this.path = new PathFollowing(track.waypoints);
    this.cumulativeLengths = new Array(this.path.segmentLengths.length + 1).fill(0);
    for (let index = 0; index < this.path.segmentLengths.length; index += 1) {
      this.cumulativeLengths[index + 1] = this.cumulativeLengths[index] + this.path.segmentLengths[index];
    }
    this.start = track.waypoints[0].clone();
    this.tangent = new Vector3().subVectors(track.waypoints[1], track.waypoints[0]).setY(0).normalize();
    this.normal = new Vector3(-this.tangent.z, 0, this.tangent.x).normalize();
    this.cars = new Map();
    this.elapsed = 0;
  }

  register(car) {
    const side = car.position.clone().sub(this.start).dot(this.tangent);
    const progress = this.progressAt(car.position);
    car.lapTimes = [];
    car.raceStarted = false;
    this.cars.set(car.id, {
      lastPosition: car.position.clone(), lastSide: side, lastStation: progress.station,
      distanceSinceLine: 0, gridProgress: progress.station - this.path.totalLength,
      started: false, lapStart: null, lap: 0, bestLapTime: null, finishTime: null,
    });
  }

  progressAt(position) {
    const projection = this.path.project(position);
    const segment = projection.segmentIndex;
    const station = this.cumulativeLengths[segment] + this.path.segmentLengths[segment] * projection.t;
    return { station, ratio: station / this.path.totalLength, projection };
  }

  update(cars, dt) {
    this.elapsed += dt;
    const events = [];
    for (const car of cars) {
      const state = this.cars.get(car.id);
      if (!state) { this.register(car); continue; }
      car.raceTime = this.elapsed;
      const currentSide = car.position.clone().sub(this.start).dot(this.tangent);
      const lateral = car.position.clone().sub(this.start).dot(this.normal);
      const currentProgress = this.progressAt(car.position);
      const routeDelta = currentProgress.station - state.lastStation;
      const halfLap = this.path.totalLength / 2;
      const signedRouteDelta = routeDelta > halfLap ? routeDelta - this.path.totalLength
        : routeDelta < -halfLap ? routeDelta + this.path.totalLength : routeDelta;
      const movementDistance = state.lastPosition.distanceTo(car.position);
      // Reject projection jumps caused by teleporting/cutting across the circuit.
      if (Math.abs(signedRouteDelta) <= movementDistance + MAX_PROJECTION_JUMP_METERS) {
        state.distanceSinceLine = Math.max(0, state.distanceSinceLine + signedRouteDelta);
        if (!state.started) state.gridProgress += signedRouteDelta;
      }
      const crossesForward = state.lastSide < 0 && currentSide >= 0;
      const fraction = crossesForward ? crossingFraction(state.lastSide, currentSide) : 0;
      const crossingLateral = crossesForward
        ? state.lastPosition.clone().lerp(car.position, fraction).sub(this.start).dot(this.normal)
        : Infinity;
      if (crossesForward && Math.abs(crossingLateral) <= this.trackHalfWidth && !car.finished) {
        if (!state.started) {
          state.started = true;
          car.raceStarted = true;
          state.lapStart = this.elapsed - dt + dt * fraction;
          state.distanceSinceLine = Math.max(0, signedRouteDelta * (1 - fraction));
          events.push({ type: 'start-line-crossing', carId: car.id });
        } else {
          const crossingTime = this.elapsed - dt + dt * fraction;
          const lapTime = crossingTime - state.lapStart;
          if (state.distanceSinceLine >= this.path.totalLength * MIN_VALID_LAP_ROUTE_FRACTION && lapTime > 1) {
            car.lapTimes.push(lapTime);
            if (state.bestLapTime === null || lapTime < state.bestLapTime) state.bestLapTime = lapTime;
            state.lap += 1;
            state.lapStart = crossingTime;
            state.distanceSinceLine = Math.max(0, signedRouteDelta * (1 - fraction));
            events.push({ type: 'lap-validated', carId: car.id });
            if (state.lap >= this.laps) {
              state.finishTime = crossingTime;
              events.push({ type: 'arrival', carId: car.id });
            }
          }
        }
      }
      state.lastSide = currentSide;
      state.lastPosition.copy(car.position);
      state.lastStation = currentProgress.station;
      car.completedLaps = state.lap;
      car.bestLapTime = state.bestLapTime;
      car.currentLapTime = state.started && state.lapStart !== null ? Math.max(0, this.elapsed - state.lapStart) : 0;
      car.finished = state.finishTime !== null;
      car.finishTime = state.finishTime;
      const progress = this.progressAt(car.position);
      car.progress = progress.ratio;
      car.station = progress.station;
      car.totalTrackLength = this.path.totalLength;
      car.validatedProgress = state.started
        ? state.lap * this.path.totalLength + state.distanceSinceLine
        : state.gridProgress;
      car.lapsToGo = Math.max(0, this.laps - car.completedLaps);
    }
    return events;
  }
}
