const wrapIndex = (index, length) => ((index % length) + length) % length;
const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Rendering-independent telemetry and cyclic track progress accounting. */
export class TelemetryRecorder {
  constructor(waypoints, { lapValidationFraction = 0.95, blockedSpeed = 1.5 } = {}) {
    if (waypoints.length < 3) throw new Error('TelemetryRecorder needs a closed path with at least three points.');
    this.points = waypoints.map(({ x, z }) => ({ x, z }));
    this.segmentLengths = this.points.map((p, i) => {
      const q = this.points[wrapIndex(i + 1, this.points.length)];
      return Math.hypot(q.x - p.x, q.z - p.z);
    });
    this.prefixLengths = [0];
    for (const length of this.segmentLengths) this.prefixLengths.push(this.prefixLengths.at(-1) + length);
    this.trackLength = this.prefixLengths.at(-1);
    this.lapValidationFraction = lapValidationFraction;
    this.blockedSpeed = blockedSpeed;
    this.reset();
  }

  project(position) {
    let best = { distance: Infinity, station: 0, segmentIndex: 0, t: 0 };
    for (let i = 0; i < this.points.length; i++) {
      const a = this.points[i], b = this.points[wrapIndex(i + 1, this.points.length)];
      const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz;
      const t = lengthSq === 0 ? 0 : clamp01(((position.x - a.x) * dx + (position.z - a.z) * dz) / lengthSq);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const distance = Math.hypot(position.x - px, position.z - pz);
      if (distance < best.distance) best = { distance, station: this.prefixLengths[i] + this.segmentLengths[i] * t, segmentIndex: i, t };
    }
    return best;
  }

  initialize(position) {
    const projection = this.project(position);
    this.lastStation = projection.station;
    this.progressStation = projection.station;
    return projection;
  }

  update({ deltaTime, position, velocity, speed, lateralError = 0, offTrack = false, blocked, state = 'steering' }) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RangeError('deltaTime must be a finite, non-negative number.');
    const current = this.project(position);
    const currentSpeed = Number.isFinite(speed) ? Math.max(0, speed) : Math.hypot(velocity?.x ?? 0, velocity?.y ?? 0, velocity?.z ?? 0);
    let crossedStartForward = false;
    let completedLap = false;
    if (this.lastStation === null) {
      this.lastStation = current.station;
      this.progressStation = current.station;
    } else {
      let delta = current.station - this.lastStation;
      if (delta > this.trackLength / 2) delta -= this.trackLength;
      else if (delta < -this.trackLength / 2) delta += this.trackLength;
      this.signedProgress += delta;
      this.distanceTravelled += Math.abs(delta);
      this.progressSinceLap += delta;
      crossedStartForward = delta > 0
        && this.lastStation > this.trackLength * 0.9
        && current.station < this.trackLength * 0.1;
      if (crossedStartForward) {
        // Each forward crossing starts a fresh validation window. Without this
        // reset, two sub-95% fragments separated by a start-line crossing
        // could be combined and falsely credited as one lap.
        completedLap = this.progressSinceLap >= this.trackLength * this.lapValidationFraction;
        if (completedLap) this.completedLaps++;
        this.progressSinceLap = 0;
      }
      this.lastStation = current.station;
      this.progressStation = current.station;
    }

    this.simulatedTime += deltaTime;
    this.currentLapTime += deltaTime;
    if (crossedStartForward) {
      this.lastStartLineIntervalTime = this.currentLapTime;
      if (completedLap) this.lastCompletedLapTime = this.currentLapTime;
      this.currentLapTime = 0;
    }
    this.speedIntegral += currentSpeed * deltaTime;
    this.maxSpeed = Math.max(this.maxSpeed, currentSpeed);
    this.lateralErrorIntegral += Math.abs(lateralError) * deltaTime;
    if (offTrack && !this.wasOffTrack) this.offTrackEvents++;
    if (offTrack) this.offTrackDuration += deltaTime;
    this.wasOffTrack = offTrack;
    const isBlocked = blocked ?? currentSpeed <= this.blockedSpeed;
    if (isBlocked) this.blockedTime += deltaTime;
    this.state = state;
    this.lastProjection = current;
    return this.snapshot();
  }

  snapshot() {
    return {
      simulatedTime: this.simulatedTime,
      lapTime: this.currentLapTime,
      lastStartLineIntervalTime: this.lastStartLineIntervalTime,
      lastCompletedLapTime: this.lastCompletedLapTime,
      distanceTravelled: this.distanceTravelled,
      signedProgress: this.signedProgress,
      progressStation: this.progressStation,
      progressRatio: this.trackLength > 0 ? this.progressStation / this.trackLength : 0,
      trackLength: this.trackLength,
      lapValidationDistance: this.trackLength * this.lapValidationFraction,
      signedDistanceSinceStartCrossing: this.progressSinceLap,
      completedLaps: this.completedLaps,
      averageSpeed: this.simulatedTime > 0 ? this.speedIntegral / this.simulatedTime : 0,
      maxSpeed: this.maxSpeed,
      offTrackEvents: this.offTrackEvents,
      offTrackDuration: this.offTrackDuration,
      blockedTime: this.blockedTime,
      meanLateralError: this.simulatedTime > 0 ? this.lateralErrorIntegral / this.simulatedTime : 0,
      state: this.state,
    };
  }

  reset() {
    this.simulatedTime = 0;
    this.currentLapTime = 0;
    this.lastStartLineIntervalTime = null;
    this.lastCompletedLapTime = null;
    this.distanceTravelled = 0;
    this.signedProgress = 0;
    this.progressStation = 0;
    this.completedLaps = 0;
    this.speedIntegral = 0;
    this.maxSpeed = 0;
    this.offTrackEvents = 0;
    this.offTrackDuration = 0;
    this.blockedTime = 0;
    this.lateralErrorIntegral = 0;
    this.lastStation = null;
    this.progressSinceLap = 0;
    this.wasOffTrack = false;
    this.state = 'idle';
    this.lastProjection = null;
  }
}
