/** Incremental reward uses signed track progress, never waypoint distance. */
export class RewardCalculator {
  constructor({
    progress = 1,
    reverse = 1.8,
    lap = 180,
    onTrackPerSecond = 0.2,
    offTrackPerSecond = 2.5,
    offTrackEvent = 5,
    blockedPerSecond = 3,
    smoothness = 0.08,
    steeringReversal = 0.08,
    maxSpeed = 31,
    speedPerSecond = 0.025,
  } = {}) {
    this.weights = { progress, reverse, lap, onTrackPerSecond, offTrackPerSecond, offTrackEvent, blockedPerSecond, smoothness, steeringReversal, maxSpeed, speedPerSecond };
    this.reset();
  }

  reset() {
    this.reward = 0;
    this.lastProgress = null;
    this.lastLaps = 0;
    this.lastOffTrackEvents = 0;
    this.lastBlockedTime = 0;
    this.previousSteering = 0;
    this.hasPreviousSteering = false;
    this.steps = 0;
  }

  update(metrics, commands = {}, deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) throw new RangeError('deltaTime must be finite and non-negative.');
    const telemetry = metrics.telemetry;
    const progress = telemetry.signedProgress;
    let validatedProgressDelta = 0;
    if (this.lastProgress !== null) {
      const rawDelta = progress - this.lastProgress;
      const maxPlausible = Math.max(0.1, (metrics.speed / 3.6) * deltaTime * 1.5 + 0.05);
      const delta = Math.max(-maxPlausible, Math.min(maxPlausible, rawDelta));
      validatedProgressDelta = delta;
      this.reward += delta >= 0 ? delta * this.weights.progress : delta * this.weights.reverse;
    }
    this.lastProgress = progress;

    const completedLaps = telemetry.completedLaps - this.lastLaps;
    if (completedLaps > 0) this.reward += completedLaps * this.weights.lap;
    this.lastLaps = telemetry.completedLaps;

    const offTrackEvents = telemetry.offTrackEvents - this.lastOffTrackEvents;
    if (offTrackEvents > 0) this.reward -= offTrackEvents * this.weights.offTrackEvent;
    this.lastOffTrackEvents = telemetry.offTrackEvents;
    if (metrics.offTrack) this.reward -= this.weights.offTrackPerSecond * deltaTime;
    else if (validatedProgressDelta > 0) this.reward += this.weights.onTrackPerSecond * deltaTime;

    const blockedDelta = Math.max(0, telemetry.blockedTime - this.lastBlockedTime);
    this.reward -= blockedDelta * this.weights.blockedPerSecond;
    this.lastBlockedTime = telemetry.blockedTime;
    const forwardSpeed = Math.max(0, (metrics.speed / 3.6) * Math.cos(metrics.orientationError));
    if (validatedProgressDelta > 0) this.reward += (forwardSpeed / this.weights.maxSpeed) * this.weights.speedPerSecond * deltaTime;

    const steering = Number.isFinite(commands.steering) ? Math.max(-1, Math.min(1, commands.steering)) : 0;
    if (this.hasPreviousSteering) {
      const change = Math.abs(steering - this.previousSteering);
      this.reward -= change * this.weights.smoothness;
      if (steering * this.previousSteering < -0.04) this.reward -= this.weights.steeringReversal;
    }
    this.previousSteering = steering;
    this.hasPreviousSteering = true;
    this.steps++;
    return this.reward;
  }

  value() { return this.reward; }
}
