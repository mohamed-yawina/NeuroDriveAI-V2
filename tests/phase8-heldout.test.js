import { describe, expect, it } from 'vitest';
import { createGeneralizationTracks, describeTrack } from '../src/ai/training/GeneralizationTracks.js';
import { createPhase8HeldOutTrack } from '../src/ai/training/Phase8HeldOutTrack.js';
import { RobustnessEvaluator } from '../src/ai/training/RobustnessEvaluator.js';

describe('Phase 8 held-out track', () => {
  it('creates a distinct closed track with boundaries without adding it to training tracks', () => {
    const trainingTracks = createGeneralizationTracks();
    const heldOut = createPhase8HeldOutTrack();
    expect(trainingTracks.map(({ id }) => id)).toEqual(['original', 'technical', 'fast-oval']);
    expect(heldOut.id).toBe('phase8-chicane-test');
    expect(heldOut.waypoints).toHaveLength(64);
    // Geometry returns two road-edge segments for each of 700 closed-curve samples.
    expect(heldOut.boundaries).toHaveLength(1400);
    expect(describeTrack(heldOut).waypointPolylineLength).toBeGreaterThan(0);
    expect(heldOut.waypoints[0].distanceTo(heldOut.waypoints.at(-1))).toBeLessThan(12);
  });

  it('generates reproducible, stratified final-test scenarios with varied initial conditions', () => {
    const track = createPhase8HeldOutTrack();
    const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 731001 });
    const first = evaluator.createScenarios(track, 3);
    const second = evaluator.createScenarios(track, 3);
    expect(first).toEqual(second);
    expect(first).toHaveLength(30);
    expect(new Set(first.map(({ initialSpeedMetersPerSecond }) => initialSpeedMetersPerSecond))).toEqual(new Set([0, 7, 14, 21]));
    expect(new Set(first.map(({ arcFraction }) => arcFraction)).size).toBe(30);
  });
});
