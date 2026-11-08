import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { RaceLabVisuals, drawNeuralNetwork } from '../src/game/RaceLabVisuals.js';
import { RaceSession } from '../src/game/RaceSession.js';

describe('interactive integrated-lab visualizations', () => {
  it('renders only actual Steering force contributions and disposes its 3D helpers', () => {
    const scene = { add: vi.fn(), remove: vi.fn() };
    const visuals = new RaceLabVisuals(scene);
    const car = { position: new Vector3(2, 0, 3), velocity: new Vector3(5, 0, 0) };
    const decision = {
      forces: {
        contributions: [
          { name: 'pathFollowing', weightedForce: new Vector3(3, 0, 0) },
          { name: 'obstacleAvoidance', weightedForce: new Vector3(0, 0, -2) },
          { name: 'separation', weightedForce: new Vector3(1, 0, 0) },
        ],
        resultant: new Vector3(4, 0, -2),
      },
      path: { target: new Vector3(8, 0, 3) },
    };
    expect(visuals.update(car, decision)).toBe(true);
    expect(visuals.arrows.get('pathFollowing').visible).toBe(true);
    expect(visuals.arrows.get('obstacleAvoidance').visible).toBe(true);
    expect(visuals.arrows.get('separation').visible).toBe(true);
    expect(visuals.arrows.get('pursuit').visible).toBe(false);
    expect(visuals.arrows.get('resultant').visible).toBe(true);
    expect(visuals.arrows.get('velocity').visible).toBe(true);
    expect(visuals.arrows.get('desired').visible).toBe(true);
    visuals.setEnabled(false);
    expect(visuals.update(car, decision)).toBe(false);
    expect(visuals.group.visible).toBe(false);
    visuals.dispose();
    expect(scene.remove).toHaveBeenCalledWith(visuals.group);
    expect(visuals.arrows.size).toBe(0);
  });

  it('draws the selected network from its real weights and activation values only', () => {
    const context = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillText: vi.fn() };
    const canvas = { width: 0, height: 0, clientWidth: 500, getBoundingClientRect: () => ({ width: 500 }), getContext: () => context };
    const architecture = [7, 16, 16, 2];
    const network = { architecture, layers: architecture.slice(1).map((count, layer) => ({ weights: Array.from({ length: count }, () => Array(architecture[layer]).fill(0.25)) })) };
    const activations = architecture.map((count) => Array(count).fill(0.5));
    expect(drawNeuralNetwork(canvas, network, activations)).toBe(true);
    expect(context.stroke).toHaveBeenCalledTimes(7 * 16 + 16 * 16 + 16 * 2 + 7 + 16 + 16 + 2);
    expect(context.arc).toHaveBeenCalledTimes(7 + 16 + 16 + 2);
    expect(drawNeuralNetwork(canvas, network, [activations[0]])).toBe(false);
    expect(drawNeuralNetwork(canvas, { ...network, architecture: [7, 8, 8, 2] }, activations)).toBe(false);
  });

  it('shows per-driver telemetry and the actual controller provenance in the live comparison', () => {
    const body = { innerHTML: '' };
    const car = {
      name: 'Neural A · 2', driverId: 'neural-a-slot-2', id: 'car-2', isPlayer: false,
      controller: { network: { architecture: [7, 16, 16, 2] } }, velocity: new Vector3(12, 0, 0),
      validatedProgress: 345.6, completedLaps: 1, finished: true, finishTime: 52.31,
    };
    const session = Object.create(RaceSession.prototype);
    Object.assign(session, {
      ui: { querySelector: (selector) => selector === '#lab-comparison-body' ? body : null },
      world: { cars: [car], director: { state: 'finished' }, getDriverTelemetry: () => ({ carCollisions: 2, offTrackEvents: 1 }) },
      driverAssignments: [{ id: car.driverId, name: 'Neural A' }], laps: 3,
    });
    session.updateLabComparison();
    expect(body.innerHTML).toContain('Neural A · 2');
    expect(body.innerHTML).toContain('Neural A');
    expect(body.innerHTML).toContain('43');
    expect(body.innerHTML).toContain('345.6');
    expect(body.innerHTML).toContain('2 · 1');
    expect(body.innerHTML).toContain('ARRIVÉ');
    expect(body.innerHTML).toContain('00:52.31');
  });
});
