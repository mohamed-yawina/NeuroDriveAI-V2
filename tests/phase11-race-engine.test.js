import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { GameVehicleDynamics } from '../src/game/GameVehicleDynamics.js';
import { RaceDirector } from '../src/game/RaceDirector.js';
import { RaceLeaderboard } from '../src/game/RaceLeaderboard.js';
import { RaceTiming } from '../src/game/RaceTiming.js';
import { RaceCameras } from '../src/game/RaceCameras.js';
import { PerspectiveCamera } from 'three';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { GameCar } from '../src/game/GameCar.js';
import { OvertakingPlanner } from '../src/game/OvertakingPlanner.js';
import { racePointAhead } from '../src/game/RaceController.js';
import { generateCircuit } from '../src/circuits/CircuitGenerator.js';
import { circuitToTrackDefinition } from '../src/circuits/CircuitFormat.js';

const track = () => createGeneralizationTracks()[0];
const straightTrack = () => ({ waypoints: [new Vector3(0, 0, 0), new Vector3(100, 0, 0), new Vector3(100, 0, 100), new Vector3(0, 0, 100)] });
const gameCar = (id, x, z, number = 1) => new GameCar({ id, number, position: new Vector3(x, 0, z), forward: new Vector3(1, 0, 0) });

describe('Phase 11 race engine and starting grid', () => {
  it('creates six separated cars within the roadway width', () => {
    for (const circuit of createGeneralizationTracks()) {
      const world = new RaceWorld(circuit, { trackHalfWidth: circuit.halfWidth ?? 8.2 });
      expect(world.cars).toHaveLength(6);
      for (let i = 0; i < world.cars.length; i++) {
        const a = world.cars[i];
        expect(world.timing.path.project(a.position).distance).toBeLessThan(world.trackHalfWidth - a.radius * 0.45);
        for (const b of world.cars.slice(i + 1)) expect(a.position.distanceTo(b.position)).toBeGreaterThan(a.radius + b.radius);
      }
      expect(world.cars.filter((car) => car.isPlayer)).toHaveLength(1);
    }
  });

  it('holds the grid during the lights and releases every car on the same step', () => {
    const world = new RaceWorld(track());
    const start = world.cars.map((car) => car.position.clone());
    expect(world.start()).toBe(true);
    expect(world.director.redLights).toBe(5);
    for (let i = 0; i < 179; i++) world.update(1 / 60, { throttle: 1 });
    expect(world.director.state).toBe('countdown');
    expect(world.cars.map((car) => car.position.distanceTo(start[world.cars.indexOf(car)]))).toEqual([0, 0, 0, 0, 0, 0]);
    world.update(1 / 60, { throttle: 1 });
    expect(world.director.state).toBe('racing');
    expect(world.cars[0].position.distanceTo(start[0])).toBeGreaterThan(0);
  });

  it('keeps the player human-controlled after a direct start and applies input only after the lights', () => {
    const world = new RaceWorld(track());
    const player = world.cars.find((car) => car.isPlayer);
    const startPosition = player.position.clone();
    expect(player.controller).toBeNull();
    expect(player.formationController ?? null).toBeNull();
    expect(world.start({ formationLap: false })).toBe(true);
    for (let index = 0; index < 179; index += 1) world.update(1 / 60, { throttle: 1, steer: 1 });
    expect(world.director.state).toBe('countdown');
    expect(player.position.distanceTo(startPosition)).toBe(0);
    world.update(1 / 60, { throttle: 0, steer: 0 });
    expect(world.director.state).toBe('racing');
    expect(player.position.distanceTo(startPosition)).toBe(0);
    world.update(1 / 60, { throttle: 1, steer: 1 });
    expect(player.position.distanceTo(startPosition)).toBeGreaterThan(0);
    expect(player.velocity.length()).toBeGreaterThan(0);
    const afterDrive = player.position.clone();
    world.paused = true; world.update(1 / 60, { throttle: 1, steer: 1 });
    expect(player.position.toArray()).toEqual(afterDrive.toArray());
    world.paused = false; world.update(1 / 60, { throttle: 1, steer: 0 });
    expect(player.position.distanceTo(afterDrive)).toBeGreaterThan(0);
    expect(player.controller).toBeNull();
  });

  it('keeps automatic formation explicitly assisted and blocks keyboard input until countdown', () => {
    const world = new RaceWorld(track());
    const player = world.cars.find((car) => car.isPlayer);
    expect(world.start({ formationLap: true })).toBe(true);
    world.director.maxFormationSeconds = 0.2;
    expect(world.director.state).toBe('formation');
    expect(player.formationController).toBeDefined();
    const start = player.position.clone();
    world.update(1 / 60, { throttle: 1, steer: 1 });
    expect(player.position.distanceTo(start)).toBeGreaterThan(0);
    const afterFormation = player.position.clone();
    for (let index = 0; index < 30 && world.director.state === 'formation'; index += 1) world.update(1 / 60, { throttle: 1, steer: 1 });
    expect(world.director.state).toBe('countdown');
    expect(player.formationController ?? null).toBeNull();
    expect(player.position.distanceTo(afterFormation)).toBeGreaterThan(0);
  });

  it('resolves an overlap with a stable separating impulse', () => {
    const world = new RaceWorld(track());
    const [a, b] = world.cars;
    b.position.copy(a.position).add(new Vector3(2, 0, 0));
    a.velocity.set(4, 0, 0); b.velocity.set(-2, 0, 0);
    world.resolveCarCollisions();
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(a.radius + b.radius);
    expect(a.velocity.x).toBeLessThan(4);
    expect(b.velocity.x).toBeGreaterThan(-2);
    expect(world.collisionCount).toBe(1);
  });

  it('counts one collision event during sustained contact and a new event after separation', () => {
    const world = new RaceWorld(track());
    const [a, b] = world.cars;
    b.position.copy(a.position).add(new Vector3(2, 0, 0));
    world.resolveCarCollisions();
    b.position.copy(a.position).add(new Vector3(2, 0, 0));
    world.resolveCarCollisions();
    expect(world.collisionCount).toBe(1);
    expect(world.getDriverTelemetry(a).carCollisions).toBe(1);
    world.resolveCarCollisions();
    b.position.copy(a.position).add(new Vector3(2, 0, 0));
    world.resolveCarCollisions();
    expect(world.collisionCount).toBe(2);
    expect(world.getDriverTelemetry(a).carCollisions).toBe(2);
  });

  it('keeps cars inside the track and removes outward velocity', () => {
    const world = new RaceWorld(track());
    const car = world.cars[0];
    const edge = world.timing.path.project(car.position);
    const normal = new Vector3().subVectors(car.position, edge.point).normalize();
    car.position.copy(edge.point).addScaledVector(normal, 20);
    car.velocity.copy(normal).multiplyScalar(10);
    world.resolveTrackLimits();
    expect(world.timing.path.project(car.position).distance).toBeLessThan(7.5);
    expect(car.velocity.dot(normal)).toBeLessThanOrEqual(0.001);
  });

  it('ranks completed cars before running cars and then by lap progress', () => {
    const ranked = RaceLeaderboard.rank([
      { id: 'back', finished: false, completedLaps: 1, station: 40 },
      { id: 'winner', finished: true, finishTime: 91, completedLaps: 3 },
      { id: 'front', finished: false, completedLaps: 1, station: 80 },
    ]);
    expect(ranked.map((car) => car.id)).toEqual(['winner', 'front', 'back']);
    expect(ranked.map((car) => car.position)).toEqual([1, 2, 3]);
  });

  it('keeps independent game dynamics bounded at fixed time steps', () => {
    const physics = new GameVehicleDynamics({ maxSpeed: 25 });
    const vehicle = { position: new Vector3(), forward: new Vector3(0, 0, -1), velocity: new Vector3(), maxSpeed: 25 };
    for (let i = 0; i < 600; i++) physics.step(vehicle, new Vector3(500, 0, -500), 1 / 60);
    expect(vehicle.position.toArray().every(Number.isFinite)).toBe(true);
    expect(vehicle.velocity.length()).toBeLessThanOrEqual(25.001);
  });

  it('does not accept variable or zero simulation steps', () => {
    const world = new RaceWorld(track());
    world.start();
    expect(() => world.update(0)).toThrow(RangeError);
    expect(() => world.update(0.2)).toThrow(RangeError);
    const director = new RaceDirector({ countdownSeconds: 1 });
    expect(director.start()).toBe(true);
    director.update(0.5);
    expect(director.redLights).toBeGreaterThan(0);
  });

  it('selects a clear passing lane and accelerates the lateral transition', () => {
    const track = straightTrack(), player = gameCar('player', 10, 0), rival = gameCar('rival', 21, 0, 2);
    const planner = new OvertakingPlanner(track);
    const plan = planner.update(player, [player, rival], 0.1);
    expect(plan.active).toBe(true);
    expect(Math.abs(plan.desiredOffset)).toBeCloseTo(4.55, 1);
    expect(Math.abs(player.laneOffset)).toBeLessThan(Math.abs(plan.desiredOffset));
    expect(plan.pursuitTarget.position.x).toBeGreaterThan(rival.position.x);
  });

  it('rejects overtaking when both alternative lanes are occupied', () => {
    const player = gameCar('player', 10, 0), rival = gameCar('rival', 21, 0, 2);
    const left = gameCar('left', 15, 4.55, 3), right = gameCar('right', 15, -4.55, 4);
    const planner = new OvertakingPlanner(straightTrack());
    const plan = planner.update(player, [player, rival, left, right], 0.1);
    expect(plan.targetCar).toBe(rival);
    expect(plan.safe).toBe(false);
    expect(plan.desiredOffset).toBe(0);
    expect(plan.pursuitTarget).toBeNull();
  });

  it('returns to the racing line gradually after clearing the rival', () => {
    const player = gameCar('player', 10, 0), rival = gameCar('rival', 21, 0, 2);
    const planner = new OvertakingPlanner(straightTrack());
    planner.update(player, [player, rival], 0.2);
    const offsetBefore = player.laneOffset;
    player.position.x = 35;
    const plan = planner.update(player, [player, rival], 0.1);
    expect(plan.returning).toBe(true);
    expect(Math.abs(player.laneOffset)).toBeLessThan(Math.abs(offsetBefore));
  });

  it('combines path following, obstacle avoidance and separation under the force limit', () => {
    const world = new RaceWorld(track());
    const ai = world.cars.find((car) => !car.isPlayer);
    const force = ai.controller.compute({ car: ai, cars: world.cars, deltaTime: 1 / 60 });
    expect(force.length()).toBeLessThanOrEqual(ai.maxForce + 1e-6);
    expect(force.toArray().every(Number.isFinite)).toBe(true);
    expect(ai.debugForces.contributions.map((entry) => entry.name)).toContain('pathFollowing');
    expect(ai.debugForces.contributions.map((entry) => entry.name)).toContain('obstacleAvoidance');
    expect(ai.debugForces.contributions.map((entry) => entry.name)).toContain('separation');
  });

  it('looks ahead from the projected position and crosses a segment boundary in the forward direction', () => {
    const points = [new Vector3(0, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 10)];
    const target = racePointAhead(points, [10, 10, 20], 0, 0.8, 5);
    expect(target.x).toBeCloseTo(10);
    expect(target.z).toBeCloseTo(3);
  });

  it('rejects shortcut and reverse crossings, then requires a full forward circuit for a lap', () => {
    const circuit = { waypoints: Array.from({ length: 128 }, (_, index) => {
      const angle = index / 128 * Math.PI * 2;
      return new Vector3(40 * Math.cos(angle), 0, 40 * Math.sin(angle));
    }) };
    const tangent = circuit.waypoints[1].clone().sub(circuit.waypoints[0]).setY(0).normalize();
    const car = gameCar('timed', 0, 0);
    car.position.copy(circuit.waypoints[0]).addScaledVector(tangent, -0.5);
    car.forward.copy(tangent);
    const timing = new RaceTiming(circuit, { laps: 1, trackHalfWidth: 8 });
    timing.register(car);
    car.position.copy(circuit.waypoints[0]).addScaledVector(tangent, 0.5);
    timing.update([car], 1 / 60);
    expect(car.completedLaps).toBe(0);
    car.position.copy(circuit.waypoints[0]).addScaledVector(tangent, -0.5);
    timing.update([car], 1 / 60);
    car.position.copy(circuit.waypoints[0]).addScaledVector(tangent, 0.5);
    timing.update([car], 1 / 60);
    expect(car.completedLaps).toBe(0);
    for (let index = 1; index < circuit.waypoints.length; index += 1) {
      car.position.copy(circuit.waypoints[index]);
      timing.update([car], 1 / 60);
    }
    car.position.copy(circuit.waypoints[0]).addScaledVector(tangent, -0.5);
    timing.update([car], 1 / 60);
    car.position.copy(circuit.waypoints[0]).addScaledVector(tangent, 0.5);
    timing.update([car], 1 / 60);
    expect(car.completedLaps).toBe(1);
    expect(car.finished).toBe(true);
    expect(car.bestLapTime).toBeGreaterThan(1);
  });

  it('ignores finish-line crossings outside the track width', () => {
    const car = gameCar('off-line', -2, 12), timing = new RaceTiming(straightTrack());
    timing.register(car);
    car.position.x = 2;
    timing.update([car], 1);
    expect(car.completedLaps).toBe(0);
  });

  it('checks the interpolated crossing point when a car moves diagonally over the finish line', () => {
    const car = gameCar('diagonal', -1, 12), timing = new RaceTiming(straightTrack());
    timing.register(car);
    car.position.set(3, 0, 0);
    timing.update([car], 1);
    expect(car.completedLaps).toBe(0);
  });

  it('keeps the six-car simulation finite for fixed steps and resets to a fresh grid', () => {
    const world = new RaceWorld(track());
    const aiStarts = world.cars.filter((car) => !car.isPlayer).map((car) => car.position.clone());
    world.start();
    for (let index = 0; index < 900; index++) world.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
    expect(world.cars.filter((car) => !car.isPlayer).some((car, index) => car.position.distanceTo(aiStarts[index]) > 10)).toBe(true);
    for (const car of world.cars) {
      expect(car.position.toArray().every(Number.isFinite)).toBe(true);
      expect(car.velocity.length()).toBeLessThanOrEqual(car.maxSpeed + 1e-5);
    }
    world.reset();
    expect(world.director.state).toBe('grid');
    expect(world.cars.every((car) => car.completedLaps === 0 && !car.finished && car.velocity.lengthSq() === 0)).toBe(true);
    expect(world.collisionCount).toBe(0);
  });

  it('cycles through chase, trackside, cockpit and overview cameras while following a selected car', () => {
    const cameras = new RaceCameras(new PerspectiveCamera(), straightTrack());
    expect(cameras.nextMode()).toBe('trackside');
    expect(cameras.nextMode()).toBe('cockpit');
    expect(cameras.nextMode()).toBe('overview');
    expect(cameras.nextMode()).toBe('chase');
    cameras.setTarget('car-4');
    expect(cameras.targetId).toBe('car-4');
  });

  it('ends the race after a winner and configured finish delay', () => {
    const director = new RaceDirector({ countdownSeconds: 0.1, maxFinishDelay: 2 });
    const cars = [{ id: 'winner', finished: false, finishTime: null }];
    director.start();
    expect(director.update(0.1, cars)).toBe('racing');
    cars[0].finished = true; cars[0].finishTime = 0.12;
    director.update(1 / 60, cars);
    expect(director.winnerId).toBe('winner');
    expect(director.update(2, cars)).toBe('finished');
  });

  it('selects the earliest actual finish time when multiple cars finish within one simulation step', () => {
    const director = new RaceDirector({ countdownSeconds: 0.1 });
    const cars = [
      { id: 'later', finished: false, finishTime: null },
      { id: 'earlier', finished: false, finishTime: null },
    ];
    director.start();
    director.update(0.1, cars);
    cars[0].finished = true; cars[0].finishTime = 10.02;
    cars[1].finished = true; cars[1].finishTime = 10.01;
    director.update(1 / 60, cars);
    expect(director.winnerId).toBe('earlier');
  });

  it('accepts keyboard throttle, braking and steering through game-only dynamics', () => {
    const physics = new GameVehicleDynamics();
    const vehicle = { position: new Vector3(), forward: new Vector3(0, 0, -1), velocity: new Vector3(), maxSpeed: 58, yaw: 0 };
    for (let index = 0; index < 60; index++) physics.stepPlayer(vehicle, { throttle: 1, brake: 0, steer: 0 }, 1 / 60);
    expect(vehicle.velocity.z).toBeLessThan(-10);
    const speedBeforeBrake = vehicle.velocity.length();
    physics.stepPlayer(vehicle, { throttle: 0, brake: 1, steer: 1 }, 1 / 60);
    expect(vehicle.velocity.length()).toBeLessThan(speedBeforeBrake);
    expect(vehicle.forward.x).toBeGreaterThan(0);
  });

  it('lets autonomous pilots finish the configured race without a neural retraining run', () => {
    const world = new RaceWorld(track(), { laps: 3 });
    world.start();
    for (let index = 0; index < 3600; index++) world.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
    expect(world.cars.filter((car) => !car.isPlayer).some((car) => car.finished && car.completedLaps === 3)).toBe(true);
    expect(world.cars.filter((car) => car.finished).every((car) => Number.isFinite(car.finishTime))).toBe(true);
  });

  it('completes three laps with all five deterministic arcade opponents on built-in and a valid generated circuit', () => {
    const circuits = [
      ...createGeneralizationTracks(),
      circuitToTrackDefinition(generateCircuit(610, 'easy')),
    ];
    for (const circuit of circuits) {
      const world = new RaceWorld(circuit, { laps: 3, trackHalfWidth: circuit.halfWidth ?? 8.2 });
      world.start();
      for (let step = 0; step < 7200 && world.cars.filter((car) => !car.isPlayer).some((car) => !car.finished); step += 1) {
        world.update(1 / 60, { throttle: 0, brake: 0, steer: 0 });
      }
      const opponents = world.cars.filter((car) => !car.isPlayer);
      expect(opponents.every((car) => car.finished && car.completedLaps === 3), circuit.id).toBe(true);
      expect(opponents.every((car) => Number.isFinite(car.finishTime) && car.finishTime >= 0), circuit.id).toBe(true);
      expect(opponents.every((car) => world.getDriverTelemetry(car).carCollisions < 60), circuit.id).toBe(true);
    }
  }, 15_000);
});
