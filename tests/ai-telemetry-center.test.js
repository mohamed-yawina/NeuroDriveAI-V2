import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { RaceController } from '../src/game/RaceController.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { createRosterRaceWorld } from '../src/game/createRosterRaceWorld.js';
import { HistoricalBrainAdapter } from '../src/neural-lab/ExperimentProtocol.js';
import { AITelemetryBuffer, AITelemetryCenter, collectAITelemetry } from '../src/game/AITelemetryCenter.js';
import { PROFESSOR_DEMO_STEPS } from '../src/game/ProfessorDemo.js';
import { RaceSession } from '../src/game/RaceSession.js';

function makeWorld() {
  const track = createGeneralizationTracks()[0];
  const world = createRosterRaceWorld(track, [
    { id: 'steer-1', name: 'Steering 1', createController: (raceTrack) => new RaceController(raceTrack) },
    { id: 'neural-1', name: 'Neural A', createController: (raceTrack) => new HistoricalBrainAdapter(new NeuralNetwork({ random: () => 0.6 }), raceTrack) },
  ], { laps: 2, seed: 44 });
  return { track, world };
}

describe('AI Telemetry Center', () => {
  it('reads actual Steering contributions, weights, directions and the applied force per selected car', () => {
    const { world } = makeWorld();
    const car = world.cars[0];
    const force = car.controller.compute({ car, cars: world.cars, deltaTime: 1 / 60 });
    world.lastForces.set(car.id, force);
    const telemetry = collectAITelemetry(car, world);
    expect(telemetry.controllerKind).toBe('steering');
    expect(telemetry.forceDetails.pathFollowing.magnitude).toBeGreaterThan(0);
    expect(telemetry.forceDetails.pathFollowing.weight).toBeGreaterThan(0);
    expect(telemetry.forceDetails.pathFollowing.direction).toHaveLength(2);
    expect(telemetry.appliedForceMagnitude).toBeCloseTo(force.length());
    expect(telemetry.observations).toBeNull();
  });

  it('publishes real model observations, hidden activations, raw outputs and arcade motion separately', () => {
    const { world } = makeWorld();
    const car = world.cars[1];
    const force = car.controller.compute({ car, deltaTime: 1 / 60 });
    world.lastForces.set(car.id, force);
    const telemetry = collectAITelemetry(car, world, { modelName: 'Neural A · seed 2026' });
    expect(telemetry.controllerKind).toBe('neural');
    expect(telemetry.modelName).toBe('Neural A · seed 2026');
    expect(telemetry.architecture).toEqual([7, 16, 16, 2]);
    expect(telemetry.observations).toHaveLength(7);
    expect(telemetry.activations.map((layer) => layer.length)).toEqual([7, 16, 16, 2]);
    expect(telemetry.rawOutputs).toHaveLength(2);
    expect(telemetry.directionValue).toBe(telemetry.rawOutputs[0]);
    expect(telemetry.appliedForceMagnitude).toBeCloseTo(force.length());
    expect(telemetry.forceContributions.pathFollowing).toBeNull();
  });

  it('does not expose initialized zero outputs as a neural inference before observations exist', () => {
    const { world } = makeWorld();
    const car = world.cars[1];
    const telemetry = collectAITelemetry(car, world, { modelName: 'Neural A' });
    expect(telemetry.controllerKind).toBe('neural');
    expect(telemetry.observations).toBeNull();
    expect(telemetry.rawOutputs).toBeNull();
    expect(Number.isFinite(telemetry.directionValue)).toBe(false);
  });

  it('marks human controls and Steering forces as not applicable, never fabricating them', () => {
    const { world } = makeWorld();
    const car = world.cars[0]; car.isPlayer = true;
    const telemetry = collectAITelemetry(car, world);
    expect(telemetry.controllerKind).toBe('human');
    expect(telemetry.directionValue).toBeNaN();
    expect(telemetry.throttleValue).toBeNaN();
    expect(telemetry.forceContributions.pathFollowing).toBeNull();
  });

  it('bounds history, samples at the configured interval, pauses chart capture and resets on a new session', () => {
    const buffer = new AITelemetryBuffer({ capacity: 3, sampleInterval: 0.1 });
    const sample = (time, speedMps) => buffer.push({ speedMps, speedKmh: speedMps * 3.6, directionValue: 0, throttleValue: .5, brakeValue: 0 }, time);
    expect(sample(0, 1)).toBe(true);
    expect(sample(.05, 2)).toBe(false);
    expect(sample(.1, 2)).toBe(true);
    expect(buffer.latest('acceleration')).toBeCloseTo(10);
    sample(.2, 3); sample(.3, 4);
    expect(buffer.count).toBe(3);
    expect(buffer.values.time[buffer.oldestIndex()]).toBeCloseTo(.1);
    buffer.reset(); expect(buffer.count).toBe(0);

    const makeElement = () => ({ textContent: '', dataset: {}, setAttribute: vi.fn(), addEventListener: vi.fn(), closest: () => ({ classList: { contains: () => false, toggle: vi.fn() } }) });
    const canvas = { width: 0, height: 0, clientWidth: 220, getBoundingClientRect: () => ({ width: 220 }), getContext: () => ({ setTransform: vi.fn(), clearRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() }), closest: () => ({ classList: { contains: () => false } }) };
    const elements = new Map([['#ai-telemetry-speed-chart', canvas], ['#ai-telemetry-controls-chart', canvas], ['#ai-telemetry-forces-chart', canvas], ['[data-ai-telemetry="pause"]', makeElement()], ['[data-ai-telemetry="reset"]', makeElement()]]);
    const root = { dataset: {}, querySelector: (selector) => elements.get(selector) ?? makeElement(), querySelectorAll: () => [] };
    const center = new AITelemetryCenter(root, { capacity: 3 });
    const snapshot = { carId: 'one', driverName: 'Steering 1', controllerLabel: 'Steering AI', controllerKind: 'steering', status: 'RACING', speedKmh: 3.6, speedMps: 1, directionValue: 2, throttleValue: .3, brakeValue: 0, completedLaps: 0, totalLaps: 2, simulationTime: 0, forceContributions: {}, forceDetails: {}, hasSteeringForces: false };
    center.update(snapshot); expect(center.buffer.count).toBe(1);
    center.setPaused(true); center.update({ ...snapshot, simulationTime: .2, speedMps: 2 }); expect(center.buffer.count).toBe(1);
    center.setPaused(false); center.update({ ...snapshot, carId: 'two', simulationTime: .3 }); expect(center.buffer.count).toBe(1);
    center.reset(); expect(center.buffer.count).toBe(0); center.dispose();
  });

  it('adds the professor explanation to the existing guided route', () => {
    const step = PROFESSOR_DEMO_STEPS.find((entry) => entry.id === 'ai-telemetry');
    expect(step.title).toBe('Comprendre les décisions de l’IA');
    expect(step.mode).toBe('steering-lab');
    expect(step.concept).toMatch(/observations.*activations.*sorties/i);
  });

  it('connects RaceSession selection, provenance and the observed neural car to the center', () => {
    const { world } = makeWorld();
    const car = world.cars[1];
    const applied = car.controller.compute({ car, deltaTime: 1 / 60 });
    world.lastForces.set(car.id, applied);
    const nodes = new Map();
    const node = (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, { value: selector === '#lab-follow-car' ? car.id : '', textContent: '', innerHTML: '', classList: { contains: () => selector === '#integrated-lab-panel' }, });
      return nodes.get(selector);
    };
    const telemetryUpdates = [];
    const session = Object.create(RaceSession.prototype);
    Object.assign(session, {
      laboratory: { type: 'neural' },
      ui: { querySelector: node },
      world: Object.assign(world, { getDriverTelemetry: () => ({ carCollisions: 0, offTrackEvents: 0, offTrackTime: 0 }) }),
      driverAssignments: [{ id: car.driverId, name: 'Neural A · seed 2026' }],
      laps: 2,
      aiTelemetryCenter: { update: (snapshot) => telemetryUpdates.push(snapshot) },
      updateLabComparison: vi.fn(),
    });
    session.updateIntegratedLabPanel();
    expect(telemetryUpdates).toHaveLength(1);
    expect(telemetryUpdates[0]).toMatchObject({ carId: car.id, driverId: car.driverId, modelName: 'Neural A · seed 2026', controllerKind: 'neural' });
    expect(node('#lab-neural-outputs').textContent).toContain('Sorties brutes');
  });
});
