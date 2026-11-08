import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { CircuitFormatError, CIRCUIT_SCHEMA, CIRCUIT_VERSION, circuitToTrackDefinition, createCircuit, parseCircuitJSON, validateCircuitFormat } from '../src/circuits/CircuitFormat.js';
import { CircuitLibrary, CIRCUIT_LIBRARY_KEY, CIRCUIT_DRAFTS_KEY } from '../src/circuits/CircuitLibrary.js';
import { calculateCircuitCameraFit, CircuitStudio, consumeCircuitEditorWheel, getCircuitBounds } from '../src/circuits/CircuitStudio.js';
import { generateCircuit } from '../src/circuits/CircuitGenerator.js';
import { CIRCUIT_TEMPLATES, circuitPreviewSvg, createCircuitTemplate } from '../src/circuits/CircuitTemplates.js';
import { cumulativeTrackDistances, cyclicArcDistance, validateCircuit } from '../src/circuits/CircuitValidator.js';
import { proposeCircuitImprovement } from '../src/circuits/CircuitImprovement.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { VehicleDynamics } from '../src/physics/VehicleDynamics.js';
import { SteeringController } from '../src/ai/SteeringController.js';
import { NeuralController } from '../src/ai/NeuralController.js';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { SteeringAcademy } from '../src/academy/SteeringAcademy.js';
import { CatmullRomCurve3, Scene, Vector3 } from 'three';
import { Track } from '../src/scene/Track.js';
import { resolveTrackSelection } from '../src/circuits/TrackSelection.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}

describe('Phase 12 Circuit Studio geometry and format', () => {
  it('keeps only the F1 circuit test action and removes laboratory shortcuts from Circuit Studio', async () => {
    const source = await readFile(new URL('../src/circuits/CircuitStudio.js', import.meta.url), 'utf8');
    expect(source).toContain('data-test="race"');
    expect(source).not.toContain('data-test="steering"');
    expect(source).not.toContain('data-test="neural"');
    expect(source).not.toContain('data-test="academy"');
    expect(source).not.toContain('Observer Steering AI');
    expect(source).not.toContain('Observer Neural AI');
    expect(source).not.toContain('Path Following Academy');
  });

  it('provides validated template tracks and thumbnails generated from their real control points', () => {
    expect(CIRCUIT_TEMPLATES.map(({ id }) => id)).toEqual(['oval', 's-flow', 'technical', 'speed', 'grand-prix']);
    for (const template of CIRCUIT_TEMPLATES) {
      const circuit = createCircuitTemplate(template.id);
      expect(validateCircuitFormat(circuit).valid).toBe(true);
      expect(circuit.metadata.templateId).toBe(template.id);
      expect(circuit.controlPoints.length).toBeGreaterThanOrEqual(10);
      expect(circuitPreviewSvg(circuit)).toContain('<path d=');
      const runtime = circuitToTrackDefinition(circuit);
      const world = new RaceWorld(runtime, { carCount: 6, trackHalfWidth: runtime.halfWidth });
      expect(world.cars).toHaveLength(6);
      expect(world.cars.every((car) => world.timing.path.project(car.position).distance < runtime.halfWidth)).toBe(true);
    }
    expect(CIRCUIT_TEMPLATES.some(({ id }) => id === 'figure-eight')).toBe(false);
  });

  it('turns a free-draw control-point draft into a saved race that the AI can complete', () => {
    const template = createCircuitTemplate('oval');
    const draft = createCircuit({ id: 'free-drawn-track', name: 'Free Drawn Track', controlPoints: [], width: template.width, startIndex: 0 });
    draft.closed = false; draft.metadata.draft = true;
    const editor = Object.create(CircuitStudio.prototype);
    Object.assign(editor, { circuit: draft, selectedIndex: -1, pushHistory() {}, validateAndRender() {}, setNotice() {} });
    template.controlPoints.forEach(({ x, z }) => editor.addFreePoint({ x, z }));
    editor.circuit.closed = true;
    expect(validateCircuitFormat(editor.circuit).valid).toBe(true);

    const library = new CircuitLibrary(memoryStorage()); library.save(editor.circuit);
    const loaded = library.load(editor.circuit.id), definition = circuitToTrackDefinition(loaded);
    const world = new RaceWorld(definition, { laps: 3, carCount: 6, trackHalfWidth: definition.halfWidth });
    expect(world.track).toBe(definition);
    world.start();
    for (let step = 0; step < 7200 && world.cars.filter((car) => !car.isPlayer).some((car) => !car.finished); step += 1) world.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
    expect(world.cars.filter((car) => !car.isPlayer).every((car) => car.finished && car.completedLaps === 3)).toBe(true);
  }, 15_000);

  it('frames the complete circuit bounds with aspect-aware camera distance', () => {
    const points = [{ x: -220, z: -80 }, { x: 170, z: -140 }, { x: 260, z: 190 }, { x: -40, z: 230 }];
    expect(getCircuitBounds(points, 10)).toEqual({ minX: -230, maxX: 270, minZ: -150, maxZ: 240 });
    const wide = calculateCircuitCameraFit(points, { width: 1600, height: 900, trackWidth: 20 });
    const portrait = calculateCircuitCameraFit(points, { width: 500, height: 900, trackWidth: 20 });
    expect(wide.x).toBe(20);
    expect(wide.z).toBe(45);
    expect(portrait.distance).toBeGreaterThan(wide.distance);
    expect(calculateCircuitCameraFit(points, { width: 400, height: 0 }).distance).toBeGreaterThan(0);
  });

  it('rejects camera fitting for an empty circuit definition', () => {
    expect(() => getCircuitBounds([])).toThrow(/au moins un point/);
  });

  it('keeps wheel zoom inside the editor and prevents document scrolling', () => {
    const event = { deltaY: -80, preventDefault: vi.fn() };
    const zoom = consumeCircuitEditorWheel(event, 1);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(zoom).toBeGreaterThan(1);
    expect(consumeCircuitEditorWheel({ deltaY: -10000, preventDefault() {} }, 4)).toBe(4);
    expect(consumeCircuitEditorWheel({ deltaY: 10000, preventDefault() {} }, 1)).toBe(0.55);
  });

  it('uses a fixed full-screen editor with independently scrollable inspectors', async () => {
    const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.circuit-studio\{position:fixed!important;inset:0!important/);
    expect(css).toMatch(/grid-template-rows:68px minmax\(0,1fr\) 34px/);
    expect(css).toMatch(/\.cs-inspector-pane\{min-height:0;overflow-y:auto/);
  });

  it('inserts a control point on the nearest segment instead of at the raw pointer location', () => {
    const studio = Object.create(CircuitStudio.prototype);
    Object.assign(studio, {
      circuit: { controlPoints: [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }], startLine: { controlPointIndex: 0 } },
      selectedIndex: -1, pushHistory() {}, worldToCanvas: ({ x, z }) => ({ x, y: z }),
      canvasToWorld: ({ x, y }) => ({ x, z: y }), updateSelectedPointInspector() {}, resizeStartOptions() {}, validateAndRender() {},
    });
    studio.addPointAt({ x: 5, y: 2 });
    expect(studio.circuit.controlPoints[1]).toEqual({ x: 5, z: 0 });
    expect(studio.selectedIndex).toBe(1);
  });
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

  it('uses measured arc distance rather than uniform spline sample indices near a loop closure', () => {
    const sampled = [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 5, z: 0 }, { x: 15, z: 0 }, { x: 16, z: 0 }];
    const cumulative = cumulativeTrackDistances(sampled);
    expect(cumulative).toEqual([0, 1, 5, 15, 16]);
    expect(cyclicArcDistance(0.5, 15.5, 16)).toBe(1);
    expect(cyclicArcDistance(1.5, 8, 16)).toBe(6.5);
    for (const template of CIRCUIT_TEMPLATES) expect(validateCircuitFormat(createCircuitTemplate(template.id)).errors.join(' ')).not.toMatch(/ligne centrale se croise|segments .* trop proches/i);
  });

  it('proposes a validated smoothing and loop-closure preview without mutating the drawing', () => {
    const source = createCircuitTemplate('oval'); source.closed = false;
    const before = structuredClone(source);
    const proposal = proposeCircuitImprovement(source);
    expect(proposal.candidate).not.toBeNull();
    expect(proposal.candidate.closed).toBe(true);
    expect(validateCircuitFormat(proposal.candidate).valid).toBe(true);
    expect(source).toEqual(before);
  });

  it('closes a free-drawn loop by clicking its first control point', () => {
    const circuit = createCircuitTemplate('oval'); circuit.closed = false; circuit.metadata.draft = true;
    const editor = Object.create(CircuitStudio.prototype);
    Object.assign(editor, {
      circuit, freeDrawMode: true, selectedIndex: -1, dragIndex: -1, pushHistory() {},
      pointerPoint: () => ({ x: 0, y: 0 }), worldToCanvas: () => ({ x: 0, y: 0 }),
      setClosed(closed) { this.circuit.closed = closed; this.freeDrawMode = !closed; },
      canvas: { setPointerCapture() {} }, render() {}, updateSelectedPointInspector() {},
    });
    editor.pointerDown({ button: 0, clientX: 0, clientY: 0, pointerId: 1, shiftKey: false });
    expect(editor.circuit.closed).toBe(true);
    expect(editor.dragIndex).toBe(-1);
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
    expect(definition).toMatchObject({ schema: CIRCUIT_SCHEMA, version: CIRCUIT_VERSION, userCircuit: true, closed: true, startLine: { controlPointIndex: 0, direction: 'forward' } });
    expect(definition.halfWidth).toBe(circuit.width / 2);
    expect(definition.waypoints[0].x).toBe(circuit.controlPoints[circuit.startLine.controlPointIndex].x);
    expect(definition.boundaries.length).toBeGreaterThan(1000);
    const world = new RaceWorld(definition, { carCount: 6, trackHalfWidth: definition.halfWidth });
    expect(world.track).toBe(definition);
    expect(world.timing.path.waypoints).toEqual(definition.waypoints);
    expect(world.timing.path.totalLength).toBeCloseTo(definition.waypoints.reduce((sum, point, index) => sum + point.distanceTo(definition.waypoints[(index + 1) % definition.waypoints.length]), 0), 8);
    expect(world.cars).toHaveLength(6);
    for (let index = 0; index < world.cars.length; index++) {
      for (const other of world.cars.slice(index + 1)) expect(world.cars[index].position.distanceTo(other.position)).toBeGreaterThan(3.3);
    }
    const aiPositions = world.cars.filter((car) => !car.isPlayer).map((car) => car.position.clone());
    world.start();
    for (let index = 0; index < 300; index++) world.update(1 / 60, { throttle: 1, brake: 0, steer: 0 });
    expect(world.cars.filter((car) => !car.isPlayer).some((car, index) => car.position.distanceTo(aiPositions[index]) > 5)).toBe(true);
  });

  it('keeps the edited Catmull-Rom spline within the declared race-geometry tolerance', () => {
    const circuit = generateCircuit(990, 'medium');
    const definition = circuitToTrackDefinition(circuit);
    const rotated = [...circuit.controlPoints.slice(circuit.startLine.controlPointIndex), ...circuit.controlPoints.slice(0, circuit.startLine.controlPointIndex)];
    const source = new CatmullRomCurve3(rotated.map(({ x, z }) => new Vector3(x, 0.08, z)), true, 'centripetal');
    const runtime = new CatmullRomCurve3(definition.waypoints, true, 'centripetal');
    let maximumDeviation = 0;
    const runtimePolyline = definition.waypoints.map((point, index) => [point, definition.waypoints[(index + 1) % definition.waypoints.length]]);
    for (let index = 0; index < 2400; index += 1) {
      const point = source.getPointAt(index / 2400);
      const nearest = Math.min(...runtimePolyline.map(([a, b]) => {
        const segment = b.clone().sub(a), lengthSq = segment.lengthSq();
        const t = lengthSq ? Math.max(0, Math.min(1, point.clone().sub(a).dot(segment) / lengthSq)) : 0;
        return point.distanceTo(a.clone().addScaledVector(segment, t));
      }));
      maximumDeviation = Math.max(maximumDeviation, nearest);
    }
    let renderedTrackDeviation = 0;
    for (let index = 0; index < 1200; index += 1) renderedTrackDeviation = Math.max(renderedTrackDeviation, source.getPointAt(index / 1200).distanceTo(runtime.getPointAt(index / 1200)));
    expect(definition.waypoints).toHaveLength(240);
    expect(maximumDeviation).toBeLessThan(0.08);
    expect(renderedTrackDeviation).toBeLessThan(0.08);
    expect(runtime.getLength()).toBeGreaterThan(100);
    expect(definition.controlPoints).toHaveLength(circuit.controlPoints.length);
  });

  it('resolves saved user circuits without replacing their identity or width', () => {
    const library = new CircuitLibrary(memoryStorage()), circuit = generateCircuit(991, 'easy');
    library.save(circuit);
    const resolved = resolveTrackSelection(`user:${circuit.id}`, { library, builtInTracks: createGeneralizationTracks() });
    expect(resolved).toMatchObject({ id: circuit.id, label: circuit.name, userCircuit: true, width: circuit.width });
    expect(resolved.waypoints[0].x).toBeCloseTo(circuit.controlPoints[circuit.startLine.controlPointIndex].x, 8);
    expect(() => resolveTrackSelection('user:missing', { library, builtInTracks: createGeneralizationTracks() })).toThrow(/absent/);
    expect(() => resolveTrackSelection('unknown', { library, builtInTracks: createGeneralizationTracks() })).toThrow(/aucun circuit de remplacement/);
  });

  it('runs the saved editor circuit through the exact race TrackDefinition, six-car grid and validated laps', () => {
    const library = new CircuitLibrary(memoryStorage()), circuit = generateCircuit(610, 'easy');
    library.save(circuit);
    const definition = resolveTrackSelection(`user:${circuit.id}`, { library });
    const raceTrack = new Track(new Scene(), definition);
    const world = new RaceWorld(definition, { laps: 3, trackHalfWidth: definition.halfWidth });
    expect(raceTrack.waypoints).toBe(definition.waypoints);
    expect(world.track).toBe(definition);
    expect(world.cars).toHaveLength(6);
    expect(world.cars.every((car) => world.timing.path.project(car.position).distance < definition.halfWidth - car.radius)).toBe(true);
    for (let index = 0; index < world.cars.length; index += 1) {
      for (const other of world.cars.slice(index + 1)) expect(world.cars[index].position.distanceTo(other.position)).toBeGreaterThan(3.3);
    }
    world.start();
    for (let step = 0; step < 7200 && world.cars.filter((car) => !car.isPlayer).some((car) => !car.finished); step += 1) world.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
    const opponents = world.cars.filter((car) => !car.isPlayer);
    expect(opponents.every((car) => car.finished && car.completedLaps === 3)).toBe(true);
    expect(opponents.every((car) => Number.isFinite(car.finishTime) && car.finishTime >= 0)).toBe(true);
  }, 15_000);

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
    expect(rendered.waypoints).toBe(definition.waypoints);
    expect(rendered.controlPoints).toEqual(definition.controlPoints);
  });

  it('keeps user circuit generation separate from the historical evaluation tracks', () => {
    const before = createGeneralizationTracks().map((track) => ({ id: track.id, waypoints: track.waypoints.map((point) => point.toArray()), boundaryCount: track.boundaries.length }));
    generateCircuit(2026, 'hard');
    const after = createGeneralizationTracks().map((track) => ({ id: track.id, waypoints: track.waypoints.map((point) => point.toArray()), boundaryCount: track.boundaries.length }));
    expect(after).toEqual(before);
  });

  it('sends the validated editor snapshot and its exact runtime definition to the test launcher', () => {
    const circuit = generateCircuit(477, 'easy'), trackDefinition = circuitToTrackDefinition(circuit), onTest = vi.fn();
    const studio = Object.create(CircuitStudio.prototype);
    Object.assign(studio, { circuit, onTest, setNotice: vi.fn() });
    studio.test('race');
    expect(onTest).toHaveBeenCalledOnce();
    expect(onTest).toHaveBeenCalledWith(expect.objectContaining({ mode: 'race', circuit, trackDefinition }));
    expect(onTest.mock.calls[0][0].trackDefinition.waypoints).toEqual(trackDefinition.waypoints);
  });
});

describe('Phase 12 user circuit library', () => {
  it('saves, loads, exports and imports circuits under a dedicated storage key', () => {
    const storage = memoryStorage(), library = new CircuitLibrary(storage);
    const circuit = generateCircuit(404, 'easy');
    library.save(circuit);
    expect(storage.getItem(CIRCUIT_LIBRARY_KEY)).toContain(circuit.id);
    expect(library.load(circuit.id)).toMatchObject(circuit);
    expect(Number.isFinite(Date.parse(library.load(circuit.id).modifiedAt))).toBe(true);
    const exported = library.exportText(circuit.id);
    const imported = library.importText(exported);
    expect(imported).toMatchObject(circuit);
    expect(library.list()).toHaveLength(1);
  });

  it('does not store geometrically invalid or incompatible circuits', () => {
    const library = new CircuitLibrary(memoryStorage());
    const invalid = generateCircuit(404, 'easy'); invalid.controlPoints[2] = invalid.controlPoints[1];
    expect(() => library.save(invalid)).toThrow(/Circuit invalide/);
    expect(library.list()).toEqual([]);
  });

  it('duplicates and removes saved circuits without changing the source circuit', () => {
    const library = new CircuitLibrary(memoryStorage()), source = generateCircuit(177, 'easy');
    library.save(source);
    const duplicate = library.duplicate(source.id, { id: 'copy-of-user-track', name: 'Circuit copie' });
    expect(duplicate).toMatchObject({ id: 'copy-of-user-track', name: 'Circuit copie', controlPoints: source.controlPoints });
    expect(library.load(source.id).controlPoints).toEqual(source.controlPoints);
    library.remove(duplicate.id);
    expect(library.list().map((item) => item.id)).toEqual([source.id]);
  });

  it('loads existing v1 library entries that predate modification timestamps', () => {
    const storage = memoryStorage(), legacy = generateCircuit(510, 'easy');
    storage.setItem(CIRCUIT_LIBRARY_KEY, JSON.stringify([legacy]));
    const library = new CircuitLibrary(storage);
    expect(library.load(legacy.id)).toEqual(legacy);
    expect(validateCircuitFormat(library.load(legacy.id)).valid).toBe(true);
  });

  it('saves and reloads an open draft separately from the playable circuit library', () => {
    const storage = memoryStorage(), library = new CircuitLibrary(storage);
    const draft = createCircuit({ id: 'unfinished-draft', name: 'Unfinished', controlPoints: [], width: 19, startIndex: 0 });
    draft.closed = false;
    expect(validateCircuitFormat(draft).valid).toBe(false);
    library.saveDraft(draft);
    expect(library.listDrafts()).toHaveLength(1);
    expect(library.loadDraft(draft.id).controlPoints).toEqual([]);
    expect(library.list()).toEqual([]);
    expect(JSON.parse(storage.getItem(CIRCUIT_DRAFTS_KEY))).toHaveLength(1);
    expect(storage.getItem(CIRCUIT_LIBRARY_KEY)).toBeNull();
  });
});
