import { describe, expect, it, vi } from 'vitest';
import { createRaceReplay, interpolateReplayAtTime, ReplayRecorder, upgradeRaceReplay, validateRaceReplay } from '../src/neural-lab/ReplayProtocol.js';
import { RaceTutorial, TUTORIAL_KEY, TUTORIAL_STEPS } from '../src/game/RaceTutorial.js';
import { CareerStore } from '../src/game/CareerStore.js';
import { PROFESSOR_DEMO_STEPS, ProfessorDemoTimeline } from '../src/game/ProfessorDemo.js';
import { COMPLIANCE_ROWS } from '../src/game/ComplianceReport.js';
import { RaceReplayViewer } from '../src/game/RaceReplayViewer.js';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
}

function sampleReplay() {
  return createRaceReplay({ id: 'original', label: 'Azur', waypoints: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 100 }], halfWidth: 10 }, [{ name: 'One' }, { name: 'Two' }], {
    seed: 9, physics: { fixedStep: 1 / 60 }, frames: [
      { step: 0, time: 0, cars: [{ id: 'car-1', x: 0, z: 0, yaw: 3.1, progress: 0 }, { id: 'car-2', x: 5, z: 0, yaw: 0, progress: 0 }] },
      { step: 6, time: 0.1, cars: [{ id: 'car-1', x: 10, z: 0, yaw: -3.1, progress: 0.1 }, { id: 'car-2', x: 5, z: 10, yaw: 0.2, progress: 0.1 }] },
    ],
  });
}

describe('LOT 5.1 replay, tutorial, professor demo and conformance', () => {
  it('interpolates poses and heading across the shortest angular arc', () => {
    const replay = sampleReplay();
    const middle = interpolateReplayAtTime(replay, 0.05);
    expect(middle.cars[0].x).toBe(5);
    expect(Math.abs(middle.cars[0].yaw)).toBeCloseTo(Math.PI, 1);
  });

  it('records at the fixed-step cadence and bounds frame storage through decimation', () => {
    const world = {
      cars: [{ id: 'car-1', name: 'One', position: { x: 1, z: 2 }, yaw: 0, progress: 0, completedLaps: 0, currentLapTime: 0, finished: false }],
      director: { state: 'racing' },
      getDriverTelemetry: () => ({ carCollisions: 0, offTrackEvents: 0, offTrackTime: 0 }),
    };
    const recorder = new ReplayRecorder({ maxFrames: 3, sampleEverySteps: 1 });
    for (let step = 0; step < 12; step += 1) recorder.capture(world, step);
    expect(recorder.frames.length).toBeLessThanOrEqual(3);
    expect(recorder.sampleRate).toBeLessThan(60);
  });

  it('records collision and finish events only when measured counters/state change', () => {
    let collisions = 0;
    const world = {
      cars: [{ id: 'car-1', name: 'One', position: { x: 1, z: 2 }, yaw: 0, progress: 0, completedLaps: 0, currentLapTime: 0, finished: false }],
      director: { state: 'racing' }, getDriverTelemetry: () => ({ carCollisions: collisions, offTrackEvents: 0, offTrackTime: 0 }),
    };
    const recorder = new ReplayRecorder();
    recorder.capture(world, 0);
    collisions = 1; recorder.capture(world, 6);
    world.cars[0].finished = true; world.director.state = 'finished'; recorder.capture(world, 12);
    expect(recorder.sampleRate).toBe(10);
    expect(recorder.events.map((event) => event.type)).toEqual(['collision', 'finish', 'checkered']);
  });

  it('keeps version 1 imports readable without inventing sampling cadence or custom geometry', () => {
    const legacy = sampleReplay();
    legacy.version = 1;
    legacy.sampleRate = 10;
    delete legacy.track.waypoints;
    delete legacy.track.halfWidth;
    const upgraded = upgradeRaceReplay(legacy);
    expect(validateRaceReplay(upgraded).valid).toBe(true);
    expect(upgraded.sourceVersion).toBe(1);
    expect(upgraded.sampleRate).toBeNull();
    expect(upgraded.track.waypoints).toBeNull();
    expect(upgraded.events).toEqual([]);
    const customLegacy = structuredClone(legacy); customLegacy.track.category = 'user-defined';
    expect(upgradeRaceReplay(customLegacy, { knownTrack: { waypoints: [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 2, z: 2 }], halfWidth: 9 } }).track.waypoints).toBeNull();
    const store = new CareerStore(new MemoryStorage());
    const id = store.importReplay(legacy);
    expect(store.exportReplay(id)).toMatchObject({ version: 2, sourceVersion: 1, sampleRate: null });
  });

  it('cleans replay animation, listeners, scene and DOM exactly once on close', () => {
    const control = () => ({ value: '', addEventListener: vi.fn() });
    const time = { textContent: '' }, events = { innerHTML: '', dataset: {} }, toggle = { textContent: '' };
    const nodes = new Map([
      ['.replay-viewport', {}], ['[data-events]', events], ['[data-control="timeline"]', control()],
      ['[data-control="camera"]', control()], ['[data-control="car"]', control()], ['[data-control="speed"]', control()],
      ['[data-time]', time], ['[data-action="toggle"]', toggle],
    ]);
    const root = { className: '', innerHTML: '', setAttribute: vi.fn(), addEventListener: vi.fn(), querySelector: (key) => nodes.get(key), remove: vi.fn() };
    const append = vi.fn(), disposeScene = vi.fn(), setMode = vi.fn(), setTarget = vi.fn(), updateCamera = vi.fn();
    vi.stubGlobal('document', { createElement: () => root });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 123));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onClose = vi.fn();
    const viewer = new RaceReplayViewer({ app: { append }, replay: sampleReplay(), onClose,
      sceneFactory: () => ({ car: { root: { visible: true } }, scene: {}, camera: {}, render: vi.fn(), dispose: disposeScene }),
      carFactory: () => ({ root: { position: { set: vi.fn() }, rotation: {} } }),
      cameraFactory: () => ({ mode: 'overview', setMode, setTarget, update: updateCamera }),
    });
    const signal = viewer.listeners.signal;
    viewer.dispose(); viewer.dispose();
    expect(disposeScene).toHaveBeenCalledTimes(1);
    expect(globalThis.cancelAnimationFrame).toHaveBeenCalledWith(123);
    expect(root.remove).toHaveBeenCalledTimes(1);
    expect(signal.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('keeps tutorial progress across sessions and validates observations in the required mode', () => {
    const storage = new MemoryStorage();
    storage.setItem(TUTORIAL_KEY, JSON.stringify({ version: 1, index: 13 }));
    const tutorial = new RaceTutorial(storage);
    expect(tutorial.current.mode).toBe('academy');
    expect(tutorial.observe('combined', { mode: 'academy', activeBehaviors: 1 }).advanced).toBe(false);
    expect(tutorial.observe('combined', { mode: 'academy', activeBehaviors: 3 }).advanced).toBe(true);
    expect(new RaceTutorial(storage).index).toBe(14);
    expect(tutorial.observe('forces-observed', { mode: 'academy', magnitude: 0 }).advanced).toBe(false);
    expect(tutorial.observe('forces-observed', { mode: 'academy', magnitude: 4 }).advanced).toBe(true);
    expect(tutorial.reset().index).toBe(0);
    expect(new RaceTutorial(storage).index).toBe(0);
    expect(TUTORIAL_STEPS).toHaveLength(20);
  });

  it('requires the concrete condition for each remaining tutorial checkpoint', () => {
    const cases = [
      [1, 'brake', { value: 0 }, { value: 1 }], [2, 'steer', { value: 0 }, { value: -1 }],
      [3, 'camera', { changed: false }, { changed: true }], [5, 'manual-gearbox', { value: 'automatic' }, { value: 'manual' }],
      [6, 'gear-shift', { changed: false }, { changed: true }], [7, 'drs-active', { active: false }, { active: true }],
      [8, 'ers-used', { chargeBefore: 10, chargeAfter: 10 }, { chargeBefore: 10, chargeAfter: 9 }],
      [9, 'compound', { value: 'intermediate' }, { value: 'soft' }], [10, 'tyre-wear', { wear: 0 }, { wear: 0.01 }],
      [11, 'pit-service', { completed: false }, { completed: true }], [12, 'damage', { amount: 0 }, { amount: 1 }],
      [13, 'combined', { activeBehaviors: 1 }, { activeBehaviors: 2 }], [14, 'forces-observed', { magnitude: 0 }, { magnitude: 1 }],
      [15, 'decision-observed', {}, { decision: 'yield' }], [16, 'circuit-saved', { valid: false }, { valid: true }],
      [17, 'brain-inspected', { architecture: [7, 16, 16, 2], sensorCount: 0 }, { architecture: [7, 16, 16, 2], sensorCount: 5 }],
    ];
    for (const [index, event, invalid, valid] of cases) {
      const storage = new MemoryStorage(); storage.setItem(TUTORIAL_KEY, JSON.stringify({ version: 1, index }));
      const tutorial = new RaceTutorial(storage), mode = TUTORIAL_STEPS[index].mode;
      expect(tutorial.observe(event, { mode: 'wrong-mode', ...valid }).advanced, `${event}: wrong mode`).toBe(false);
      expect(tutorial.observe(event, { mode, ...invalid }).advanced, `${event}: invalid`).toBe(false);
      expect(tutorial.observe(event, { mode, ...valid }).advanced, `${event}: valid`).toBe(true);
    }
    const storage = new MemoryStorage(); storage.setItem(TUTORIAL_KEY, JSON.stringify({ version: 1, index: 4 }));
    const pauseTutorial = new RaceTutorial(storage);
    expect(pauseTutorial.observe('pause-cycle', { mode: 'race', paused: false }).advanced).toBe(false);
    pauseTutorial.observe('pause-cycle', { mode: 'race', paused: true });
    expect(pauseTutorial.observe('pause-cycle', { mode: 'race', paused: false }).advanced).toBe(true);
  });

  it('runs a controllable ten-step professor timeline totaling three minutes inside integrated F1 labs', () => {
    expect(PROFESSOR_DEMO_STEPS).toHaveLength(10);
    expect(PROFESSOR_DEMO_STEPS.reduce((sum, step) => sum + step.seconds, 0)).toBe(180);
    expect(PROFESSOR_DEMO_STEPS.map((step) => step.id)).toEqual(['intro', 'path', 'obstacle', 'separation', 'combined', 'architecture', 'decisions', 'comparison', 'limits', 'conclusion']);
    expect(PROFESSOR_DEMO_STEPS.every((step) => !['academy', 'academy-combined', 'ai-lab', 'race-professor'].includes(step.mode))).toBe(true);
    const timeline = new ProfessorDemoTimeline();
    expect(timeline.tick(5)).toBe(false);
    timeline.togglePause();
    expect(timeline.tick(60)).toBe(false);
    timeline.togglePause();
    expect(timeline.tick(7)).toBe(true);
    expect(timeline.steps[timeline.index].id).toBe('path');
    expect(timeline.previous().id).toBe('intro');
    expect(timeline.next().id).toBe('path');
  });

  it('maps required course notions to source, tests, demonstrations, and explicit caveats', () => {
    const notions = COMPLIANCE_ROWS.map(([name]) => name);
    for (const name of ['Seek', 'Flee', 'Arrive', 'Pursuit / Evade', 'Wander', 'Path Following / scalar projection', 'Obstacle Avoidance', 'Separation', 'Alignment', 'Cohesion', 'BehaviorManager', 'Neural network', 'Genetic algorithm / neuroevolution', 'Fitness function', 'Generalization', 'Model save/load', 'Reproducibility']) expect(notions).toContain(name);
    expect(COMPLIANCE_ROWS.every((row) => row.length === 6 && row.slice(2, 5).every(Boolean))).toBe(true);
    expect(COMPLIANCE_ROWS.find(([name]) => name === 'BehaviorManager')[5]).toContain('not a Casablanca G1 requirement');
  });
});
