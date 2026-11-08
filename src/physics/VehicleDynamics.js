import { SteeringVehicle } from '../ai/SteeringVehicle.js';
import { PathFollowing } from '../ai/PathFollowing.js';
import { TrackSensors } from '../ai/TrackSensors.js';
import { ObservationBuilder } from '../ai/ObservationBuilder.js';
import { TelemetryRecorder } from '../ai/TelemetryRecorder.js';
import { SteeringController } from '../ai/SteeringController.js';

function waypointBoundaries(waypoints, halfWidth) {
  const edges = [];
  const left = [], right = [];
  for (let i = 0; i < waypoints.length; i++) {
    const before = waypoints[(i - 1 + waypoints.length) % waypoints.length];
    const after = waypoints[(i + 1) % waypoints.length];
    const dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length, nz = dx / length;
    left.push({ x: waypoints[i].x + nx * halfWidth, y: waypoints[i].y, z: waypoints[i].z + nz * halfWidth });
    right.push({ x: waypoints[i].x - nx * halfWidth, y: waypoints[i].y, z: waypoints[i].z - nz * halfWidth });
  }
  for (let i = 0; i < waypoints.length; i++) {
    const next = (i + 1) % waypoints.length;
    edges.push({ start: left[i], end: left[next] }, { start: right[i], end: right[next] });
  }
  return edges;
}

/** Simulation engine accepts any controller implementing compute(context). */
export class VehicleDynamics {
  constructor(waypoints, { trackHalfWidth = 7.5, boundaries, controller = new SteeringController(), sensorMaxDistance = 45 } = {}) {
    this.spawn = waypoints[0].clone();
    this.trackHalfWidth = trackHalfWidth;
    this.vehicle = new SteeringVehicle({ position: this.spawn });
    this.path = new PathFollowing(waypoints, {
      lookAhead: 12,
      predictionTime: 0.3,
      lookAheadTime: 0.35,
      trackHalfWidth,
      maxSpeed: 31,
      maxForce: 22,
      steeringResponse: 4.5,
    });
    this.sensors = new TrackSensors(boundaries ?? waypointBoundaries(waypoints, trackHalfWidth + 0.7), { maxDistance: sensorMaxDistance });
    this.observationBuilder = new ObservationBuilder();
    this.telemetry = new TelemetryRecorder(waypoints);
    this.controller = controller;
    this.totalLaps = 5;
    this.offTrackTime = 0;
    this.stuckTime = 0;
    this.recoveryTime = 0;
    this.recovery = false;
  }

  update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RangeError('deltaTime must be a finite, non-negative number.');
    const before = this.path.project(this.vehicle.position);
    const offTrackBefore = before.distance > this.trackHalfWidth;
    const speedBefore = this.vehicle.velocity.length();
    this.offTrackTime = offTrackBefore ? this.offTrackTime + deltaTime : 0;
    this.stuckTime = speedBefore < 1.5 ? this.stuckTime + deltaTime : 0;
    this.recovery = this.offTrackTime >= 1.5 || this.stuckTime >= 2.5;

    const sensorReadings = this.sensors.update(this.vehicle.position, this.vehicle.forward);
    const observations = this.observationBuilder.build(this.vehicle, this.path, sensorReadings);
    const force = this.controller.compute({
      vehicle: this.vehicle,
      path: this.path,
      deltaTime,
      observations,
      sensors: sensorReadings,
      recovery: this.recovery,
    });
    this.vehicle.update(force, deltaTime);

    const projection = this.path.project(this.vehicle.position);
    const offTrack = projection.distance > this.trackHalfWidth;
    const currentSensors = this.sensors.update(this.vehicle.position, this.vehicle.forward);
    const currentObservations = this.observationBuilder.build(this.vehicle, this.path, currentSensors);
    const state = this.recovery ? 'recovering' : offTrack ? 'off-track' : this.controller.name;
    const telemetry = this.telemetry.update({
      deltaTime,
      position: this.vehicle.position,
      velocity: this.vehicle.velocity,
      lateralError: projection.distance,
      offTrack,
      blocked: this.stuckTime > 0,
      state,
    });
    this.recoveryTime = this.recovery ? this.recoveryTime + deltaTime : 0;

    return {
      speed: this.vehicle.velocity.length() * 3.6,
      targetSpeed: this.path.speedTarget * 3.6,
      lap: Math.min(this.totalLaps, telemetry.completedLaps + 1),
      completedLaps: telemetry.completedLaps,
      lapTime: telemetry.lapTime,
      distance: projection.distance,
      offTrack,
      recovering: this.recovery,
      curvature: this.path.curvature,
      predictedPosition: this.path.predictedPosition,
      projection: this.path.projection,
      target: this.path.target,
      steering: this.vehicle.steering,
      sensors: currentSensors,
      observations: currentObservations,
      orientationError: this.observationBuilder.orientationError,
      telemetry,
      controller: this.controller.name,
    };
  }

  reset() {
    this.vehicle.reset(this.spawn);
    this.path.reset();
    this.sensors.reset();
    this.observationBuilder.reset();
    this.telemetry.reset();
    this.telemetry.initialize(this.spawn);
    this.offTrackTime = 0;
    this.stuckTime = 0;
    this.recoveryTime = 0;
    this.recovery = false;
    this.controller.reset?.();
  }
}
