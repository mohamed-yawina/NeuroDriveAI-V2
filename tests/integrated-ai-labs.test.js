import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';
import { GameCar } from '../src/game/GameCar.js';
import { RaceController } from '../src/game/RaceController.js';
import { NEURAL_ACTIVATION_LAYER_LABELS, RaceSession } from '../src/game/RaceSession.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { classifyIntegratedTrack, createIntegratedNeuralDrivers, createSixCarLabRoster } from '../src/neural-lab/IntegratedLab.js';
import { createRosterRaceWorld } from '../src/game/createRosterRaceWorld.js';
import { MAIN_MENU_ENTRIES } from '../src/ui/MainMenuSections.js';
import { bindMainMenuEntries } from '../src/ui/MainMenuSections.js';
import { createIntegratedLabEntryActions, launchNeuralLab, launchSteeringLab } from '../src/ui/IntegratedLabLaunch.js';
import { SessionNavigation } from '../src/ui/SessionNavigation.js';
import { generateCircuit } from '../src/circuits/CircuitGenerator.js';
import { circuitToTrackDefinition } from '../src/circuits/CircuitFormat.js';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { HistoricalBrainAdapter } from '../src/neural-lab/ExperimentProtocol.js';

describe('integrated AI laboratories', () => {
  it('routes both primary laboratory cards to the shared F1 race scene', () => {
    expect(MAIN_MENU_ENTRIES['steering-lab'].route).toBe('f1-session-steering');
    expect(MAIN_MENU_ENTRIES['neural-lab'].route).toBe('f1-session-neural');
    expect(Object.keys(MAIN_MENU_ENTRIES).filter((key) => key.includes('lab'))).toEqual(['steering-lab', 'neural-lab']);
  });

  it('dispatches real menu entry actions into RaceSession factories configured for each F1 lab mode', async () => {
    const root = new EventTarget();
    const documentRef = { querySelector: (selector) => selector === '#menu-track' ? { value: 'technical' } : selector === '#menu-laps' ? { value: '5' } : null };
    const navigation = { launch: async (create) => create() };
    const createSession = async (options) => options;
    let launched;
    const steeringAction = () => { launched = launchSteeringLab(navigation, { documentRef, livery: '#e10600', onReturn: () => {}, createSession }); };
    const neuralAction = () => { launched = launchNeuralLab(navigation, {
      documentRef, configurations: ['A'], seed: 19, onReturn: () => {}, createSession,
      trackFactory: createGeneralizationTracks,
      modelLoader: async () => ({
        network: { architecture: [7, 16, 16, 2], forward: () => new Float32Array([0, 0]) },
        provenance: { configuration: 'A', seed: 2026, source: '/phase8-model-a.json' },
      }),
    }); };
    const actions = createIntegratedLabEntryActions({ steering: steeringAction, neural: neuralAction });
    bindMainMenuEntries(root, actions);
    const invoke = async (entry) => {
      const button = new EventTarget();
      button.dataset = { menuEntry: entry };
      button.closest = (selector) => selector === '[data-menu-entry]' ? button : null;
      const click = new Event('click', { bubbles: true });
      Object.defineProperty(click, 'target', { configurable: true, value: button });
      root.dispatchEvent(click);
      return launched;
    };

    const steering = await invoke('steering-lab');
    expect(steering).toMatchObject({ trackId: 'technical', laps: 5, laboratory: { type: 'steering' } });
    expect(steering).toHaveProperty('onReturn');
    const neural = await invoke('neural-lab');
    expect(neural).toMatchObject({ raceSeed: 19, laboratory: { type: 'neural' }, trackDefinition: { id: 'technical' } });
    expect(neural.laboratory.methodNote).toContain('56 m/s');
    expect(neural.laboratory.methodNote).toContain('30 Hz');
    expect(neural.driverAssignments).toHaveLength(6);
    expect(neural.driverAssignments.some((driver) => driver.name.startsWith('Neural A'))).toBe(true);
    expect(neural.driverAssignments.every((driver) => typeof driver.createController === 'function')).toBe(true);
  });

  it('uses the resolved saved user TrackDefinition in both integrated laboratory launch paths', async () => {
    const custom = circuitToTrackDefinition(generateCircuit(812, 'easy'));
    const documentRef = { querySelector: (selector) => selector === '#menu-track' ? { value: `user:${custom.id}` } : null };
    const createSession = async (options) => options;
    const steering = await launchSteeringLab(new SessionNavigation(), {
      documentRef, createSession, trackResolver: (id) => id === `user:${custom.id}` ? custom : null,
    });
    expect(steering.trackDefinition).toBe(custom);
    expect(steering.trackDefinition.waypoints).toEqual(custom.waypoints);
    const neural = await launchNeuralLab(new SessionNavigation(), {
      documentRef, configurations: ['A'], trackResolver: (id) => id === `user:${custom.id}` ? custom : null,
      createSession, modelLoader: async () => ({
        network: { architecture: [7, 16, 16, 2], forward: () => new Float32Array([0, 0]) },
        provenance: { configuration: 'A', seed: 2026, source: '/phase8-model-a.json' },
      }),
    });
    expect(neural.trackDefinition).toBe(custom);
  });

  it('rejects an unknown circuit identifier before touching the menu DOM instead of substituting a built-in track', () => {
    expect(() => new RaceSession({ trackId: 'user:deleted-circuit' })).toThrow(/aucun circuit de remplacement/);
  });

  it('keeps Circuit Studio race tests out of career persistence', () => {
    const session = Object.create(RaceSession.prototype), saveRace = vi.fn();
    Object.assign(session, { persistResults: false, laboratory: null, replaySaved: false, careerStore: { saveRace } });
    expect(session.saveCareerRace()).toBeUndefined();
    expect(saveRace).not.toHaveBeenCalled();
  });

  it('routes the professor Steering demonstration into the shared F1 RaceSession', async () => {
    const navigation = { launch: async (create) => create() };
    const options = await launchSteeringLab(navigation, {
      documentRef: { querySelector: (selector) => selector === '#menu-track' ? { value: 'technical' } : null },
      professorMode: true, createSession: async (sessionOptions) => sessionOptions,
    });
    expect(options).toMatchObject({ laboratory: { type: 'steering' }, professorMode: true, trackId: 'technical' });
  });

  it('restores the menu after a rejected Neural load and allows a new Steering session', async () => {
    const navigation = new SessionNavigation();
    const documentRef = { querySelector: (selector) => selector === '#menu-track' ? { value: 'original' } : null };
    await expect(launchNeuralLab(navigation, {
      documentRef, configurations: ['B'], createSession: async () => ({ dispose() {} }),
      modelLoader: async () => { throw new Error('simulated unavailable model artifact'); },
    })).rejects.toThrow('simulated unavailable model artifact');
    expect(navigation.state).toBe('menu');

    const session = { dispose() {} };
    const started = await launchSteeringLab(navigation, {
      documentRef, createSession: async (options) => Object.assign(session, options), onReturn: () => {},
    });
    expect(started).toBe(session);
    expect(started.laboratory.type).toBe('steering');
    expect(navigation.state).toBe('simulation');
    await navigation.returnToMenu();
    expect(navigation.state).toBe('menu');
  });

  it('locks navigation while Neural artifacts are loading and rejects a duplicate launch', async () => {
    const navigation = new SessionNavigation();
    const documentRef = { querySelector: (selector) => selector === '#menu-track' ? { value: 'original' } : null };
    let finishModelLoad;
    const modelLoad = new Promise((resolve) => { finishModelLoad = resolve; });
    const pendingNeural = launchNeuralLab(navigation, {
      documentRef, configurations: ['A'], createSession: async (options) => ({ ...options, dispose() {} }),
      modelLoader: () => modelLoad,
    });
    expect(navigation.state).toBe('loading');
    await expect(launchSteeringLab(navigation, { documentRef, createSession: async (options) => options })).resolves.toBeNull();
    finishModelLoad({
      network: { architecture: [7, 16, 16, 2], forward: () => new Float32Array([0, 0]) },
      provenance: { configuration: 'A', seed: 2026, source: '/phase8-model-a.json' },
    });
    const session = await pendingNeural;
    expect(session.laboratory.type).toBe('neural');
    expect(session.driverAssignments).toHaveLength(6);
    await navigation.returnToMenu();
  });

  it('labels circuits only from checked Phase 8 protocol metadata', () => {
    const tracks = createGeneralizationTracks();
    expect(classifyIntegratedTrack(tracks[0])).toMatchObject({ category: 'training-and-validation', historicalProtocolCompatible: true });
    expect(classifyIntegratedTrack(tracks[1]).label).toContain('validation');
    expect(classifyIntegratedTrack({ id: 'phase8-chicane-test' })).toMatchObject({ category: 'held-out-test', historicalProtocolCompatible: false });
    expect(classifyIntegratedTrack({ id: 'unknown-circuit' })).toMatchObject({ category: 'unclassified', historicalProtocolCompatible: false });
    expect(classifyIntegratedTrack({ id: 'user-1', userCircuit: true }).historicalProtocolCompatible).toBe(false);
  });

  it('exposes only the four steering behaviors the F1 RaceController actually calculates', () => {
    const track = createGeneralizationTracks()[0];
    const car = new GameCar({ id: 'steering-ai', position: track.waypoints[0].clone(), forward: track.waypoints[1].clone().sub(track.waypoints[0]).normalize() });
    const controller = new RaceController(track, { car });
    const force = controller.compute({ car, cars: [car], deltaTime: 1 / 60 });
    const active = controller.getBehaviorConfiguration().filter((entry) => entry.active).map((entry) => entry.name);
    expect(active).toEqual(['pathFollowing', 'obstacleAvoidance', 'separation', 'pursuit']);
    expect(force.isVector3).toBe(true);
    expect(car.debugForces.contributions.map((entry) => entry.name)).toEqual(['pathFollowing', 'obstacleAvoidance', 'separation']);
    const beforeWeight = car.debugForces.contributions.find((entry) => entry.name === 'pathFollowing');
    controller.configureBehavior('pathFollowing', { weight: 2 });
    controller.compute({ car, cars: [car], deltaTime: 1 / 60 });
    const afterWeight = car.debugForces.contributions.find((entry) => entry.name === 'pathFollowing');
    expect(afterWeight.weight).toBe(2);
    expect(afterWeight.weightedForce.length()).toBeCloseTo(afterWeight.force.length() * 2, 5);
    controller.configureBehavior('obstacleAvoidance', { active: false, weight: 1.25 });
    expect(controller.getBehaviorConfiguration().find((entry) => entry.name === 'obstacleAvoidance')).toMatchObject({ active: false, weight: 1.25 });
  });

  it('applies the Path Following look-ahead slider to the actual steering force', () => {
    const track = createGeneralizationTracks()[1];
    const start = track.waypoints[0], next = track.waypoints[1];
    const forward = next.clone().sub(start).setY(0).normalize();
    const car = new GameCar({ id: 'lookahead-probe', position: start, forward });
    car.velocity.copy(forward).multiplyScalar(24);
    const controller = new RaceController(track, { car });
    controller.compute({ car, cars: [car], deltaTime: 1 / 60 });
    const before = car.debugForces.contributions.find((entry) => entry.name === 'pathFollowing').force.clone();
    controller.configureBehavior('pathFollowing', { parameters: { lookAhead: 30 } });
    controller.compute({ car, cars: [car], deltaTime: 1 / 60 });
    const after = car.debugForces.contributions.find((entry) => entry.name === 'pathFollowing').force;
    expect(after.distanceTo(before)).toBeGreaterThan(1);
  });

  it('applies the conditional Pursuit prediction slider when the overtaking planner activates it', () => {
    const track = createGeneralizationTracks()[1];
    const start = track.waypoints[10], forward = track.waypoints[11].clone().sub(start).normalize();
    const car = new GameCar({ id: 'pursuer', position: start, forward });
    car.velocity.copy(forward).multiplyScalar(12);
    const target = new GameCar({ id: 'target', position: start.clone().add(new Vector3(0, 0, -30)), forward: new Vector3(1, 0, 0) });
    target.velocity.set(12, 0, 0);
    const controller = new RaceController(track, { car });
    controller.overtaking.update = () => ({ active: true, safe: true, pursuitTarget: target });
    controller.compute({ car, cars: [car, target] });
    const before = car.debugForces.contributions.find((entry) => entry.name === 'pursuit').force.clone();
    controller.configureBehavior('pursuit', { parameters: { predictionSeconds: 0.8 } });
    controller.compute({ car, cars: [car, target] });
    const after = car.debugForces.contributions.find((entry) => entry.name === 'pursuit').force;
    expect(after.distanceTo(before)).toBeGreaterThan(1);
  });

  it('creates real 7-16-16-2 historical adapters and keeps model provenance attached', () => {
    const inputs = [];
    const fakeNetwork = { architecture: [7, 16, 16, 2], forward(values, { onActivations } = {}) { inputs.push(Array.from(values)); onActivations?.(0, new Float32Array(16)); onActivations?.(1, new Float32Array(16)); onActivations?.(2, new Float32Array([0.2, -0.4])); return new Float32Array([0.2, -0.4]); } };
    const entries = new Map(['A', 'C'].map((configuration) => [configuration, { network: fakeNetwork, provenance: { configuration, seed: configuration === 'A' ? 2026 : 2028, source: `/phase8-model-${configuration.toLowerCase()}.json` } }]));
    const drivers = createIntegratedNeuralDrivers(['A', 'C'], entries);
    expect(drivers.map(({ id }) => id)).toEqual(['steering', 'neural-a', 'neural-c']);
    expect(drivers[2].provenance).toContain('2028');
    const track = createGeneralizationTracks()[0], car = new GameCar({ id: 'probe', position: track.waypoints[0].clone(), forward: track.waypoints[1].clone().sub(track.waypoints[0]).normalize() });
    car.velocity.copy(car.forward).multiplyScalar(10);
    const adapter = drivers[1].createController(track);
    const force = adapter.compute({ car, deltaTime: 1 / 60 });
    expect(inputs[0]).toHaveLength(7);
    expect(adapter.lastObservation).toHaveLength(7);
    expect(adapter.controller.lastCommands.steering).toBeCloseTo(0.2, 5);
    expect(adapter.controller.lastCommands.throttleBrake).toBeCloseTo(-0.4, 5);
    expect(adapter.controller.lastActivations).toHaveLength(4);
    expect(adapter.mass).toBeCloseTo(1.25);
    expect([force.x, force.y, force.z].every(Number.isFinite)).toBe(true);
  });

  it('captures the real input vector and all three tanh activation layers for the selected car', () => {
    const track = createGeneralizationTracks()[0];
    const car = new GameCar({ id: 'activation-probe', position: track.waypoints[0], forward: track.waypoints[1].clone().sub(track.waypoints[0]).normalize() });
    car.velocity.copy(car.forward).multiplyScalar(17);
    const network = new NeuralNetwork({ random: () => 0.5 });
    const adapter = new HistoricalBrainAdapter(network, track);
    adapter.compute({ car, deltaTime: 1 / 60 });
    expect(adapter.lastObservation).toHaveLength(7);
    expect(adapter.controller.lastActivations.map((layer) => layer.length)).toEqual([7, 16, 16, 2]);
    expect(adapter.controller.lastActivations[0]).toEqual(adapter.lastObservation);
    expect(adapter.controller.lastActivations[0][5]).toBeCloseTo(17 / car.maxSpeed, 4);
    expect(NEURAL_ACTIVATION_LAYER_LABELS).toEqual(['ENTRÉES', 'COUCHE CACHÉE 1', 'COUCHE CACHÉE 2', 'SORTIES']);
  });

  it('runs Steering and Neural adapters on a validated Circuit Studio user circuit', () => {
    const customTrack = circuitToTrackDefinition(generateCircuit(4412, 'easy'));
    const start = customTrack.waypoints[0], forward = customTrack.waypoints[1].clone().sub(start).normalize();
    const car = new GameCar({ id: 'custom-track-car', position: start, forward });
    const steering = new RaceController(customTrack, { car });
    expect(steering.compute({ car, cars: [car] }).toArray().every(Number.isFinite)).toBe(true);
    const network = new NeuralNetwork({ random: () => 0.5 });
    const assignment = createIntegratedNeuralDrivers(['B'], new Map([['B', { network, provenance: { configuration: 'B', seed: 2027, source: '/phase8-model-b.json' } }]]))[1];
    const neuralCar = new GameCar({ id: 'custom-neural-car', position: start, forward });
    const adapter = assignment.createController(customTrack, { car: neuralCar });
    expect(adapter.compute({ car: neuralCar }).toArray().every(Number.isFinite)).toBe(true);
    expect(adapter.lastObservation).toHaveLength(7);
  });

  it('keeps the followed car, camera and Steering controls on the same selected driver', () => {
    const options = (ids, selected) => ({ value: selected, options: ids.map((value) => ({ value })) });
    const elements = new Map([
      ['#race-car-select', options(['human', 'ai-2'], 'human')],
      ['#lab-follow-car', options(['human', 'ai-2'], 'human')],
      ['#race-coach-driver', options(['ai-2'], 'ai-2')],
      ['#race-coach', { classList: { contains: () => true } }],
    ]);
    const ai = { id: 'ai-2', controller: { getBehaviorConfiguration: () => [] } };
    const human = { id: 'human', isPlayer: true };
    const setTarget = vi.fn(), renderCoachControls = vi.fn(), updateIntegratedLabPanel = vi.fn();
    const session = Object.create(RaceSession.prototype);
    Object.assign(session, {
      world: { cars: [human, ai] },
      ui: { querySelector: (selector) => elements.get(selector) },
      cameras: { setTarget }, renderCoachControls, updateIntegratedLabPanel,
    });
    expect(session.syncLabCarSelection('ai-2')).toBe(true);
    expect(elements.get('#lab-follow-car').value).toBe('ai-2');
    expect(elements.get('#race-coach-driver').value).toBe('ai-2');
    expect(setTarget).toHaveBeenLastCalledWith('ai-2');
    expect(renderCoachControls).toHaveBeenCalled();
    expect(session.syncLabCarSelection('human')).toBe(true);
    expect(elements.get('#race-coach-driver').value).toBe('');
    expect(updateIntegratedLabPanel).toHaveBeenCalledTimes(2);
  });

  it('does not persist laboratory race results to the local career record', () => {
    const saveRace = vi.fn();
    const session = Object.create(RaceSession.prototype);
    Object.assign(session, { laboratory: { type: 'neural' }, replaySaved: false, careerStore: { saveRace } });
    expect(session.saveCareerRace()).toBeUndefined();
    expect(saveRace).not.toHaveBeenCalled();
  });

  it('runs the selected A/B/C controllers in a six-car F1 RaceWorld and exposes live race telemetry', () => {
    const network = { architecture: [7, 16, 16, 2], forward: (_inputs, { onActivations } = {}) => { onActivations?.(0, new Float32Array(16)); onActivations?.(1, new Float32Array(16)); onActivations?.(2, new Float32Array([0, 0.4])); return new Float32Array([0, 0.4]); } };
    const entries = new Map(['A', 'B', 'C'].map((configuration, index) => [configuration, { network, provenance: { configuration, seed: 2026 + index, source: `/phase8-model-${configuration.toLowerCase()}.json` } }]));
    const drivers = createSixCarLabRoster(createIntegratedNeuralDrivers(['A', 'B', 'C'], entries));
    expect(drivers).toHaveLength(6);
    expect(new Set(drivers.map((driver) => driver.id)).size).toBe(6);
    expect(drivers.some((driver) => driver.id.startsWith('neural-a'))).toBe(true);
    expect(drivers.some((driver) => driver.id.startsWith('neural-b'))).toBe(true);
    expect(drivers.some((driver) => driver.id.startsWith('neural-c'))).toBe(true);

    const track = createGeneralizationTracks()[0];
    const world = createRosterRaceWorld(track, drivers, { laps: 1, seed: 101 });
    world.start();
    for (let step = 0; step < 240; step += 1) world.update(1 / 60);
    const observedCar = world.cars.find((car) => car.driverId.startsWith('neural-a'));
    const telemetry = world.getDriverTelemetry(observedCar);
    expect(telemetry.driverId).toBe(observedCar.driverId);
    expect(Number.isFinite(telemetry.progress)).toBe(true);
    expect(telemetry.completedLaps).toBeGreaterThanOrEqual(0);
    expect(observedCar.controller.lastObservation).toHaveLength(7);
    expect(observedCar.controller.controller.lastActivations).toHaveLength(4);
  });

  it('rejects missing, mislabeled and wrong-architecture historical models instead of substituting a controller', () => {
    expect(() => createIntegratedNeuralDrivers(['B'], new Map())).toThrow(/missing/);
    const incompatible = new Map([['B', { network: { architecture: [7, 8, 2] }, provenance: { configuration: 'B', seed: 1 } }]]);
    expect(() => createIntegratedNeuralDrivers(['B'], incompatible)).toThrow(/incompatible/);
    expect(() => createIntegratedNeuralDrivers(['A', 'A'], new Map())).toThrow(/unique/);
  });
});
