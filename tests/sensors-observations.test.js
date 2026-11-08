import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TrackSensors, raySegmentIntersection } from '../src/ai/TrackSensors.js';
import { ObservationBuilder, signedOrientationError } from '../src/ai/ObservationBuilder.js';
import { PathFollowing } from '../src/ai/PathFollowing.js';

describe('Virtual track sensors', () => {
  it('intersects forward rays with finite XZ segments and rejects misses', () => {
    const origin = new Vector3(0, 0, 0), forward = new Vector3(0, 0, -1);
    expect(raySegmentIntersection(origin, forward, new Vector3(-2, 0, -5), new Vector3(2, 0, -5))).toBeCloseTo(5);
    expect(raySegmentIntersection(origin, forward, new Vector3(-2, 0, 5), new Vector3(2, 0, 5))).toBeNull();
    expect(raySegmentIntersection(origin, forward, new Vector3(2, 0, -5), new Vector3(2, 0, -8))).toBeNull();
  });

  it('measures the real supplied boundary and returns normalized max range on a miss', () => {
    const sensors = new TrackSensors([{ start: new Vector3(-20, 0, -10), end: new Vector3(20, 0, -10) }], { maxDistance: 20 });
    const readings = sensors.update(new Vector3(), new Vector3(0, 0, -1));
    expect(readings).toHaveLength(5);
    expect(readings[2].distance).toBeCloseTo(10);
    expect(readings[2].normalized).toBeCloseTo(0.5);
    expect(readings.every((reading) => reading.normalized >= 0 && reading.normalized <= 1)).toBe(true);
    expect(readings[0].distance).toBe(20);
  });
});

describe('Driver observations', () => {
  it('builds five range values, normalized speed, and signed normalized heading error', () => {
    const points = [new Vector3(0, 0, 0), new Vector3(20, 0, 0), new Vector3(20, 0, 20), new Vector3(0, 0, 20)];
    const path = new PathFollowing(points);
    const vehicle = { position: new Vector3(5, 0, 0), velocity: new Vector3(0, 0, -5), maxSpeed: 10, forward: new Vector3(0, 0, -1) };
    const readings = [0, 0.25, 0.5, 0.75, 1].map((normalized) => ({ normalized }));
    const builder = new ObservationBuilder();
    const observations = builder.build(vehicle, path, readings);
    expect(Array.from(observations.slice(0, 6))).toEqual([0, 0.25, 0.5, 0.75, 1, 0.5]);
    expect(observations[6]).toBeCloseTo(0.5);
    expect(builder.orientationError).toBeCloseTo(Math.PI / 2);
    expect(Array.from(observations).every(Number.isFinite)).toBe(true);
    expect(Array.from(observations.slice(0, 6)).every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(observations[6]).toBeGreaterThanOrEqual(-1);
    expect(observations[6]).toBeLessThanOrEqual(1);
  });

  it('returns zero heading error when the vehicle aligns with the local tangent', () => {
    expect(signedOrientationError(new Vector3(1, 0, 0), new Vector3(2, 0, 0))).toBeCloseTo(0);
  });
});
