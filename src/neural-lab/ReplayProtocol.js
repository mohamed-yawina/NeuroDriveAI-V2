import { PathFollowing } from '../ai/PathFollowing.js';
import { Vector3 } from 'three';

export const RACE_REPLAY_FORMAT = 'neurodrive-arcade-race-replay';
export const RACE_REPLAY_VERSION = 2;

export function createReplayFrame(world, step) {
  return {
    step,
    time: step / 60,
    cars: world.cars.map((car) => {
      const telemetry = world.getDriverTelemetry(car);
      return {
        id: car.id,
        name: car.name,
        x: car.position.x,
        z: car.position.z,
        yaw: car.yaw,
        progress: car.progress,
        completedLaps: car.completedLaps,
        currentLapTime: car.currentLapTime,
        finished: car.finished,
        finishTime: car.finishTime,
        collisions: telemetry.carCollisions,
        offTrackEvents: telemetry.offTrackEvents,
        offTrackTime: telemetry.offTrackTime,
      };
    }),
  };
}

export function createRaceReplay(track, drivers, { seed, physics, frames, events = [], sampleRate = 10 } = {}) {
  const replay = {
    format: RACE_REPLAY_FORMAT,
    version: RACE_REPLAY_VERSION,
    space: 'game-arcade',
    track: { id: track.id, label: track.label ?? track.id, category: track.userCircuit ? 'user-defined' : 'arcade-built-in-track', waypoints: Array.isArray(track.waypoints) ? track.waypoints.map((p) => ({ x: p.x, z: p.z })) : null, halfWidth: track.halfWidth ?? (Number.isFinite(track.width) ? track.width / 2 : null) },
    seed: seed >>> 0,
    physics: structuredClone(physics),
    drivers: drivers.map((driver, index) => ({ id: `car-${index + 1}`, driverId: driver.id ?? driver.name, name: driver.name, provenance: driver.provenance ?? 'not supplied' })),
    sampleRate,
    frames: structuredClone(frames),
    events: structuredClone(events),
  };
  const validation = validateRaceReplay(replay);
  if (!validation.valid) throw new TypeError(`Invalid replay: ${validation.reason}`);
  return replay;
}

export function validateRaceReplay(replay, { maxFrames = 18000 } = {}) {
  if (replay?.format !== RACE_REPLAY_FORMAT || ![1, RACE_REPLAY_VERSION].includes(replay.version) || replay.space !== 'game-arcade') return { valid: false, reason: 'Unsupported replay format, version, or physics space.' };
  if (!replay.track?.id || !Array.isArray(replay.drivers) || replay.drivers.length < 2) return { valid: false, reason: 'Replay track and roster are required.' };
  if (replay.track.waypoints !== null && replay.track.waypoints !== undefined && (!Array.isArray(replay.track.waypoints) || replay.track.waypoints.length < 3 || replay.track.waypoints.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)))) return { valid: false, reason: 'Replay track geometry is invalid.' };
  if (replay.version >= 2 && (replay.sampleRate !== null && (!Number.isFinite(replay.sampleRate) || replay.sampleRate <= 0) || (replay.track.halfWidth !== null && (!Number.isFinite(replay.track.halfWidth) || replay.track.halfWidth <= 0)))) return { valid: false, reason: 'Replay sampling metadata or track width is invalid.' };
  if (!Number.isInteger(replay.seed) || !Array.isArray(replay.frames) || replay.frames.length < 1 || replay.frames.length > maxFrames) return { valid: false, reason: 'Replay seed or bounded frame list is invalid.' };
  const ids = replay.drivers.map((driver) => driver.id);
  if (new Set(ids).size !== ids.length) return { valid: false, reason: 'Replay driver identifiers must be unique.' };
  let previousStep = -1;
  for (const frame of replay.frames) {
    if (!Number.isInteger(frame.step) || frame.step <= previousStep || !Number.isFinite(frame.time) || !Array.isArray(frame.cars) || frame.cars.length !== ids.length) return { valid: false, reason: 'Replay frames must contain ordered samples for every driver.' };
    previousStep = frame.step;
    if (frame.cars.some((car) => !ids.includes(car.id) || ![car.x, car.z, car.yaw, car.progress].every(Number.isFinite))) return { valid: false, reason: 'Replay contains a missing driver or non-finite pose.' };
  }
  if (replay.events !== undefined && (!Array.isArray(replay.events) || replay.events.some((event) => !Number.isInteger(event.step) || !Number.isFinite(event.time) || typeof event.type !== 'string'))) return { valid: false, reason: 'Replay events are malformed.' };
  return { valid: true, frames: replay.frames.length, drivers: ids.length, version: replay.version };
}

/** Migrates the envelope only; it never synthesizes missing poses, geometry or events. */
export function upgradeRaceReplay(replay, { knownTrack = null } = {}) {
  const validation = validateRaceReplay(replay);
  if (!validation.valid) throw new TypeError(validation.reason);
  if (replay.version === RACE_REPLAY_VERSION) return structuredClone(replay);
  const builtInTrack = replay.track.category === 'user-defined' ? null : knownTrack;
  const waypoints = replay.track.waypoints ?? builtInTrack?.waypoints?.map((p) => ({ x: p.x, z: p.z })) ?? null;
  const halfWidth = replay.track.halfWidth ?? builtInTrack?.halfWidth ?? null;
  const upgraded = { ...structuredClone(replay), version: RACE_REPLAY_VERSION, sourceVersion: 1, sampleRate: null, track: { ...replay.track, waypoints, halfWidth }, events: replay.events ?? [] };
  const upgradedValidation = validateRaceReplay(upgraded);
  if (!upgradedValidation.valid) throw new TypeError(upgradedValidation.reason);
  return upgraded;
}

/** Linearly samples recorded positions between surrounding frames, using their timestamps. */
export function interpolateReplayAtTime(replay, time) {
  const validation = validateRaceReplay(replay);
  if (!validation.valid) throw new TypeError(validation.reason);
  const frames = replay.frames, t = Math.max(frames[0].time, Math.min(frames.at(-1).time, Number(time) || 0));
  let lo = 0, hi = frames.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (frames[mid].time <= t) lo = mid; else hi = mid; }
  const left = frames[lo], right = frames[Math.min(lo + 1, frames.length - 1)], span = right.time - left.time;
  const alpha = span > 0 ? (t - left.time) / span : 0;
  const cars = left.cars.map((a) => {
    const b = right.cars.find((item) => item.id === a.id) ?? a;
    let yawDelta = ((b.yaw - a.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const interpolate = (key) => Number.isFinite(a[key]) && Number.isFinite(b[key]) ? a[key] + (b[key] - a[key]) * alpha : a[key] ?? b[key];
    return { ...a, x: interpolate('x'), z: interpolate('z'), yaw: a.yaw + yawDelta * alpha, progress: interpolate('progress'), currentLapTime: interpolate('currentLapTime'), sampleTime: t };
  });
  return { time: t, step: left.step + (right.step - left.step) * alpha, cars };
}

export class ReplayRecorder {
  constructor({ maxFrames = 1800, sampleEverySteps = 6, fps = 60, maxEvents = 5000 } = {}) {
    this.maxFrames = Math.max(2, Math.trunc(maxFrames)); this.sampleEverySteps = Math.max(1, Math.trunc(sampleEverySteps)); this.fps = fps; this.maxEvents = maxEvents;
    this.frames = []; this.events = []; this.previousCounters = new Map(); this.decimation = 1;
  }
  capture(world, step, { force = false } = {}) {
    if (!force && step % (this.sampleEverySteps * this.decimation) !== 0) return null;
    const frame = createReplayFrame(world, step);
    if (this.frames.at(-1)?.step === step) this.frames[this.frames.length - 1] = frame;
    else this.frames.push(frame);
    for (const car of frame.cars) {
      const prior = this.previousCounters.get(car.id) ?? { collisions: 0, offTrackEvents: 0, finished: false };
      for (const [type, value] of [['collision', car.collisions], ['off-track', car.offTrackEvents]]) if (value > prior[type === 'collision' ? 'collisions' : 'offTrackEvents']) this.events.push({ step, time: frame.time, type, carId: car.id, driver: car.name, count: value - prior[type === 'collision' ? 'collisions' : 'offTrackEvents'] });
      if (car.finished && !prior.finished) this.events.push({ step, time: frame.time, type: 'finish', carId: car.id, driver: car.name });
      this.previousCounters.set(car.id, { collisions: car.collisions, offTrackEvents: car.offTrackEvents, finished: car.finished });
    }
    if (world.director.state === 'finished' && this.events.at(-1)?.type !== 'checkered') this.events.push({ step, time: frame.time, type: 'checkered' });
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
    if (this.frames.length > this.maxFrames) { this.frames = this.frames.filter((_, index) => index % 2 === 0); this.decimation *= 2; }
    return frame;
  }
  get sampleRate() { return this.fps / (this.sampleEverySteps * this.decimation); }
  reset() { this.frames = []; this.events = []; this.previousCounters.clear(); this.decimation = 1; }
}

/** Finds where measured collision/off-track counters increment; it never guesses a cause. */
export function analyzeReplayFailures(replay, track) {
  const validation = validateRaceReplay(replay);
  if (!validation.valid) throw new TypeError(validation.reason);
  const path = new PathFollowing(track.waypoints);
  const previous = new Map();
  const zones = new Map();
  for (const frame of replay.frames) for (const car of frame.cars) {
    const old = previous.get(car.id) ?? { collisions: 0, offTrackEvents: 0 };
    const additions = [];
    if (car.collisions > old.collisions) additions.push(['collision', car.collisions - old.collisions]);
    if (car.offTrackEvents > old.offTrackEvents) additions.push(['off-track', car.offTrackEvents - old.offTrackEvents]);
    previous.set(car.id, { collisions: car.collisions, offTrackEvents: car.offTrackEvents });
    if (!additions.length) continue;
    const projection = path.project(new Vector3(car.x, 0, car.z));
    for (const [type, count] of additions) {
      const key = `${type}:${projection.segmentIndex}`;
      const zone = zones.get(key) ?? { type, segmentIndex: projection.segmentIndex, events: 0, drivers: new Set(), firstTime: frame.time, lastTime: frame.time };
      zone.events += count;
      zone.drivers.add(car.name);
      zone.firstTime = Math.min(zone.firstTime, frame.time);
      zone.lastTime = Math.max(zone.lastTime, frame.time);
      zones.set(key, zone);
    }
  }
  return [...zones.values()].map(({ drivers, ...zone }) => ({ ...zone, drivers: [...drivers], cause: 'not inferred; recorded event and nearest projected path segment only' }));
}
