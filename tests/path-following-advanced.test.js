import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PathFollowing, projectPointToSegment } from '../src/ai/PathFollowing.js';
import { VehicleDynamics } from '../src/physics/VehicleDynamics.js';

const square = [
  new Vector3(-10, 0, -10),
  new Vector3(10, 0, -10),
  new Vector3(10, 0, 10),
  new Vector3(-10, 0, 10),
];

describe('Advanced path following', () => {
  it('projects onto a finite segment and clamps beyond its endpoints', () => {
    const result = projectPointToSegment(new Vector3(15, 0, 4), new Vector3(0, 0, 0), new Vector3(10, 0, 0));
    expect(result.point.toArray()).toEqual([10, 0, 0]);
    expect(result.t).toBe(1);
    expect(result.distance).toBeCloseTo(Math.sqrt(41));
  });

  it('follows a closed circuit across the last-to-first segment boundary', () => {
    const follower = new PathFollowing(square, { lookAhead: 0 });
    const target = follower.pointAhead(3, 0.5, 25);
    expect(target.x).toBeCloseTo(5);
    expect(target.z).toBeCloseTo(-10);
    expect(follower.project(new Vector3(0, 0, -10)).segmentIndex).toBe(0);
  });

  it('detects upcoming curvature and lowers speed target progressively to brake', () => {
    const follower = new PathFollowing(square, { maxSpeed: 24, maxDeceleration: 10 });
    expect(follower.analyzeCurvature(0, 0)).toBeCloseTo(Math.PI / 2);
    follower.update(square[0], new Vector3(), undefined, 0.1);
    expect(follower.speedTarget).toBeCloseTo(23);
    for (let i = 0; i < 20; i++) follower.update(square[0], new Vector3(), undefined, 0.1);
    expect(follower.speedTarget).toBeLessThan(15);
    expect(follower.steering.length()).toBeLessThanOrEqual(follower.maxForce);
  });

  it('detects an excursion beyond the permitted track half-width', () => {
    const follower = new PathFollowing(square, { trackHalfWidth: 7.5 });
    follower.update(new Vector3(0, 0, -20), new Vector3(), undefined, 1 / 60);
    expect(follower.lateralDistance).toBeCloseTo(10);
    expect(follower.offTrack).toBe(true);
  });

  it('activates steering recovery after a persistent off-track state', () => {
    const dynamics = new VehicleDynamics(square);
    dynamics.vehicle.position.set(100, 0, 100);
    dynamics.vehicle.velocity.set(0, 0, 0);
    let metrics;
    for (let i = 0; i < 35; i++) metrics = dynamics.update(0.05);
    expect(metrics.offTrack).toBe(true);
    expect(metrics.recovering).toBe(true);
  });
});
