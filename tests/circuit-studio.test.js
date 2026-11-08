import { describe, expect, it } from 'vitest';
import { CircuitFormatError, CIRCUIT_SCHEMA, CIRCUIT_VERSION, circuitToTrackDefinition, createCircuit, parseCircuitJSON, validateCircuitFormat } from '../src/circuits/CircuitFormat.js';
import { CircuitLibrary, CIRCUIT_LIBRARY_KEY } from '../src/circuits/CircuitLibrary.js';
import { generateCircuit } from '../src/circuits/CircuitGenerator.js';
import { validateCircuit } from '../src/circuits/CircuitValidator.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { VehicleDynamics } from '../src/physics/VehicleDynamics.js';
import { SteeringController } from '../src/ai/SteeringController.js';
import { NeuralController } from '../src/ai/NeuralController.js';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { SteeringAcademy } from '../src/academy/SteeringAcademy.js';
import { Scene } from 'three';
import { Track } from '../src/scene/Track.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

describe('Phase 12 Circuit Studio geometry and format', () => {
  it('generates the same fully validated geometry for a fixed seed and difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const first = generateCircuit(2026, difficulty), second = generateCircuit(2026, difficulty);
      expect(first).toEqual(second);
      expect(validateCircuitFormat(first).valid).toBe(true);
      expect(first.metadata).toMatchObject({ generator: 'radial-v1', seed: 2026, difficulty });
    }
    expect(generateCircuit(0, 'hard')).not.toEqual(generateCircuit(1, 'hard'));
    expect(validateCircuitFormat(generateCircuit(0xffffffff, 'easy')).valid).toBe(true);
    expect(() => generateCircuit(-1, 'easy')).toThrow(RangeError);
    expect(() => generateCircuit(2026, 'impossible')).toThrow(RangeError);
  });

  it('rejects degenerate segments, impossible width and non-finite geometry', () => {
    const circuit = generateCircuit(17, 'easy');
    circuit.controlPoints[1] = { ...circuit.controlPoints[0] };
    expect(validateCircuit(circuit).errors.join(' ')).toMatch(/Segment dégénéré|trop court/);
    const narrow = generateCircuit(17, 'easy'); narrow.width = 2;
    expect(validateCircuitFormat(narrow).errors.join(' ')).toMatch(/largeur/);
    const nonFinite = generateCircuit(17, 'easy'); nonFinite.controlPoints[3].x = NaN;
    expect(validateCircuitFormat(nonFinite).errors.join(' ')).toMatch(/coordonnées/);
    const discontinuous = generateCircuit(17, 'easy'); discontinuous.controlPoints[4].x += 300;
    expect(validateCircuitFormat(discontinuous).errors.join(' ')).toMatch(/Segment discontinu/);
    const tight = generateCircuit(17, 'easy');
    tight.controlPoints[0] = { x: -6.1, z: 0 };
    tight.controlPoints[1] = { x: 0, z: 0 };
    tight.controlPoints[2] = { x: 3.05, z: 5.282 };
    expect(validateCircuitFormat(tight).errors.join(' ')).toMatch(/Courbure trop serrée/);
  });

  it('rejects a self-crossing control path even when the JSON structure is valid', () => {
    const points = Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2;
      return { x: 55 * Math.sin(angle), z: 42 * Math.sin(2 * angle) };
    });
    const crossed = createCircuit({ id: 'crossed-track', name: 'Crossed Track', controlPoints: points, width: 19 });
    const report = validateCircuitFormat(crossed);
    expect(report.valid).toBe(false);
    expect(report.errors.join(' ')).toMatch(/se croise|bandes de piste se chevaucheraient/);
  });

  it('rejects a dangerous six-car grid and a start marker outside the point list', () => {
    const circuit = generateCircuit(2026, 'medium');
    circuit.width = 12;
    expect(validateCircuitFormat(circuit).errors.join(' ')).toMatch(/Grille dangereuse/);
    const invalidStart = generateCircuit(2026, 'medium');
    invalidStart.startLine.controlPointIndex = 900;
    expect(validateCircuitFormat(invalidStart).errors.join(' ')).toMatch(/point inexistant/);
  });

  it('round-trips the versioned JSON and rejects an incompatible version', () => {
    const original = generateCircuit(81, 'hard');
    const serialized = JSON.stringify(original);
    expect(parseCircuitJSON(serialized).circuit).toEqual(original);
    const incompatible = { ...original, version: CIRCUIT_VERSION + 1 };
    expect(() => parseCircuitJSON(JSON.stringify(incompatible))).toThrow(CircuitFormatError);
    expect(() => parseCircuitJSON(JSON.stringify(incompatible))).toThrow(/Version incompatible/);
    const wrongDirection = { ...original, startLine: { ...original.startLine, direction: 'reverse' } };
    expect(() => parseCircuitJSON(JSON.stringify(wrongDirection))).toThrow(/direction/);
    expect(original.schema).toBe(CIRCUIT_SCHEMA);
  });

  it('converts start-line ordering, width and sampled boundaries to race-engine geometry', () => {
    const circuit = generateCircuit(243, 'medium');
    const definition = circuitToTrackDefinition(circuit);
    expect(definition.userCircuit).toBe(true);
    expect(definition.halfWidth).toBe(circuit.width / 2);
    expect(definition.waypoints[0].x).toBe(circuit.controlPoints[circuit.startLine.controlPointIndex].x);
    expect(definition.boundaries.length).toBeGreaterThan(1000);
    const world = new RaceWorld(definition, { carCount: 6, trackHalfWidth: definition.halfWidth });
    expect(world.cars).toHaveLength(6);
    for (let index = 0; index < world.cars.length; index++) {
      for (const other of world.cars.slice(index + 1)) expect(world.cars[index].position.distanceTo(other.position)).toBeGreaterThan(3.3);
    }
    const aiPositions = world.cars.filter((car) => !car.isPlayer).map((car) => car.position.clone());
    world.start();
    for (let index = 0; index < 300; index++) world.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
    expect(world.cars.filter((car) => !car.isPlayer).some((car, index) => car.position.distanceTo(aiPositions[index]) > 5)).toBe(true);
  });

  it('runs a user circuit through Steering and a prepared Neural controller without training', () => {
    const definition = circuitToTrackDefinition(generateCircuit(610, 'easy'));
    const steering = new VehicleDynamics(definition.waypoints, {
      boundaries: definition.boundaries, trackHalfWidth: definition.halfWidth - 0.7, controller: new SteeringController(),
    });
    const network = new NeuralNetwork({ random: () => 0.5 });
    const neural = new VehicleDynamics(definition.waypoints, {
      boundaries: definition.boundaries, trackHalfWidth: definition.halfWidth - 0.7, controller: new NeuralController({ network }),
    });
    for (let index = 0; index < 120; index++) {
      expect(Number.isFinite(steering.update(1 / 60).speed)).toBe(true);
      expect(Number.isFinite(neural.update(1 / 60).speed)).toBe(true);
    }
    expect(network.architecture).toEqual([7, 16, 16, 2]);
  });

  it('adapts the same circuit waypoints to Steering Academy and scales the rendered track', () => {
    const definition = circuitToTrackDefinition(generateCircuit(222, 'medium'));
    const academy = Object.create(SteeringAcademy.prototype);
    Object.assign(academy, { width: 820, height: 520, trackDefinition: definition });
    const path = academy.createPath();
    expect(path).toHaveLength(definition.waypoints.length);
    expect(path.every((point) => point.x >= 35 && point.x <= 785 && point.z >= 35 && point.z <= 485)).toBe(true);
    const rendered = new Track(new Scene(), definition);
    expect(rendered.halfWidth).toBe(definition.halfWidth);
    expect(rendered.label).toBe(definition.label);
  });

  it('keeps user circuit generation separate from the historical evaluation tracks', () => {
    const before = createGeneralizationTracks().map((track) => ({ id: track.id, waypoints: track.waypoints.map((point) => point.toArray()), boundaryCount: track.boundaries.length }));
    generateCircuit(2026, 'hard');
    const after = createGeneralizationTracks().map((track) => ({ id: track.id, waypoints: track.waypoints.map((point) => point.toArray()), boundaryCount: track.boundaries.length }));
    expect(after).toEqual(before);
  });
});

describe('Phase 12 user circuit library', () => {
  it('saves, loads, exports and imports circuits under a dedicated storage key', () => {
    const storage = memoryStorage(), library = new CircuitLibrary(storage);
    const circuit = generateCircuit(404, 'easy');
    library.save(circuit);
    expect(storage.getItem(CIRCUIT_LIBRARY_KEY)).toContain(circuit.id);
    expect(library.load(circuit.id)).toEqual(circuit);
    const exported = library.exportText(circuit.id);
    const imported = library.importText(exported);
    expect(imported).toEqual(circuit);
    expect(library.list()).toHaveLength(1);
  });

  it('does not store geometrically invalid or incompatible circuits', () => {
    const library = new CircuitLibrary(memoryStorage());
    const invalid = generateCircuit(404, 'easy'); invalid.controlPoints[2] = invalid.controlPoints[1];
    expect(() => library.save(invalid)).toThrow(/Circuit invalide/);
    expect(library.list()).toEqual([]);
  });
});
