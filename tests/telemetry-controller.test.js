import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TelemetryRecorder } from '../src/ai/TelemetryRecorder.js';
import { VehicleDynamics } from '../src/physics/VehicleDynamics.js';

const square = [
  new Vector3(0, 0, 0),
  new Vector3(20, 0, 0),
  new Vector3(20, 0, 20),
  new Vector3(0, 0, 20),
];
const sample = (position, deltaTime = 0.1, speed = 5, extra = {}) => ({ deltaTime, position, speed, lateralError: 1, ...extra });

describe('Circuit telemetry', () => {
  it('measures along-track signed progress and distance separately from Euclidean jumps', () => {
    const recorder = new TelemetryRecorder(square);
    recorder.update(sample(new Vector3(0, 0, 0)));
    const result = recorder.update(sample(new Vector3(10, 0, 0)));
    expect(result.signedProgress).toBeCloseTo(10);
    expect(result.distanceTravelled).toBeCloseTo(10);
    expect(result.progressStation).toBeCloseTo(10);
  });

  it('validates forward start-line crossings only after a full-lap distance threshold', () => {
    const recorder = new TelemetryRecorder(square);
    const station = (x, z) => recorder.update(sample(new Vector3(x, 0, z), 0.1)).completedLaps;
    station(0, 1);
    for (let i = 0; i < 8; i++) { station(0, 0); station(0, 1); }
    expect(recorder.snapshot().completedLaps).toBe(0);

    recorder.reset();
    station(0, 0);
    station(10, 0); station(20, 0); station(20, 10); station(20, 20);
    station(10, 20); station(0, 20); station(0, 5); station(0, 0);
    expect(recorder.snapshot().completedLaps).toBe(1);
  });

  it('measures lap time between start-line crossings rather than returning only the crossing frame', () => {
    const recorder = new TelemetryRecorder(square);
    recorder.initialize(new Vector3(0, 0, 0));
    for (const position of [
      new Vector3(20, 0, 0), new Vector3(20, 0, 20), new Vector3(0, 0, 20), new Vector3(0, 0, 5), new Vector3(0, 0, 0),
    ]) recorder.update(sample(position, 0.25));
    expect(recorder.snapshot().completedLaps).toBe(1);
    expect(recorder.snapshot().lastCompletedLapTime).toBeCloseTo(1.25);
    expect(recorder.snapshot().lapTime).toBe(0);
  });

  it('does not count the initial partial trip to the start line as a completed lap', () => {
    const recorder = new TelemetryRecorder(square);
    expect(recorder.snapshot().lapValidationDistance).toBeCloseTo(76);
    const visit = (x, z) => recorder.update(sample(new Vector3(x, 0, z), 0.1)).completedLaps;
    visit(20, 0); // Randomized spawn at 25% of this closed loop.
    visit(20, 10); visit(20, 20); visit(10, 20); visit(0, 20); visit(0, 5);
    expect(visit(0, 0)).toBe(0); // Only 75% of the lap was travelled.
    expect(recorder.snapshot().signedDistanceSinceStartCrossing).toBeCloseTo(0);
    expect(recorder.snapshot().lastStartLineIntervalTime).toBeGreaterThan(0);
    expect(recorder.snapshot().lastCompletedLapTime).toBeNull();
    expect(recorder.snapshot().lapTime).toBe(0); // Current-lap clock resets on the start-line crossing.
    visit(10, 0); visit(20, 0); visit(20, 10); visit(20, 20); visit(10, 20); visit(0, 20); visit(0, 5);
    expect(visit(0, 0)).toBe(1);
  });

  it('uses deltaTime for weighted speed, off-track, blocked, and lateral-error statistics', () => {
    const recorder = new TelemetryRecorder(square);
    recorder.update(sample(new Vector3(1, 0, 1), 0.25, 2, { offTrack: true, blocked: false, lateralError: 2 }));
    const result = recorder.update(sample(new Vector3(1, 0, 1), 0.75, 6, { offTrack: true, blocked: true, lateralError: 4, state: 'recovering' }));
    expect(result.simulatedTime).toBeCloseTo(1);
    expect(result.averageSpeed).toBeCloseTo(5);
    expect(result.maxSpeed).toBe(6);
    expect(result.offTrackEvents).toBe(1);
    expect(result.offTrackDuration).toBeCloseTo(1);
    expect(result.blockedTime).toBeCloseTo(0.75);
    expect(result.meanLateralError).toBeCloseTo(3.5);
    expect(result.state).toBe('recovering');
  });

  it('keeps time accounting correct under different deltaTime partitions', () => {
    const recorder = new TelemetryRecorder(square);
    recorder.update(sample(new Vector3(0, 0, 0), 0.25, 4, { blocked: false }));
    recorder.update(sample(new Vector3(1, 0, 0), 0.25, 4, { blocked: false }));
    recorder.update(sample(new Vector3(2, 0, 0), 0.5, 4, { blocked: false }));
    expect(recorder.snapshot().simulatedTime).toBeCloseTo(1);
    expect(recorder.snapshot().signedProgress).toBeCloseTo(2);
  });

  it('runs with the interchangeable classic steering controller and emits seven observations', () => {
    const dynamics = new VehicleDynamics(square);
    const metrics = dynamics.update(1 / 60);
    expect(metrics.controller).toBe('SteeringController');
    expect(metrics.observations).toHaveLength(7);
    expect(metrics.sensors).toHaveLength(5);
    expect(metrics.speed).toBeGreaterThan(0);
    expect(metrics.telemetry.state).toBe('SteeringController');
  });
});
