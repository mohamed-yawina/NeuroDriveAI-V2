import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GameCar } from '../src/game/GameCar.js';
import { GameVehicleDynamics } from '../src/game/GameVehicleDynamics.js';
import { RaceCarMechanics, deriveDRSZones } from '../src/game/RaceCarMechanics.js';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { RaceDirector } from '../src/game/RaceDirector.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { advancePitService, calculatePitControls, createPitRoute } from '../src/game/PitLane.js';

const track = () => createGeneralizationTracks()[0];
const car = () => new GameCar({ id: 'player', isPlayer: true, position: new Vector3(), forward: new Vector3(0, 0, -1) });

describe('Ultimate Edition lot 3: arcade gameplay systems', () => {
  it('keeps the formation lap outside the race timing, then resets to a staggered grid and countdown', () => {
    const world = new RaceWorld(track(), { laps: 3 });
    const originalSpeed = world.cars.map((entry) => entry.maxSpeed);
    expect(world.start({ formationLap: true })).toBe(true);
    expect(world.director.state).toBe('formation');
    expect(world.cars.every((entry) => entry.maxSpeed <= world.formationSpeed)).toBe(true);
    world.cars.forEach((entry) => { entry.completedLaps = 1; });
    world.update(1 / 60);
    expect(world.director.state).toBe('countdown');
    expect(world.cars.map((entry) => entry.maxSpeed)).toEqual(originalSpeed);
    expect(world.cars.every((entry) => entry.completedLaps === 0)).toBe(true);
    expect(new Set(world.cars.map((entry) => `${entry.position.x.toFixed(2)}:${entry.position.z.toFixed(2)}`)).size).toBe(world.cars.length);
  });

  it('moves a stuck formation to the grid after its configured safety limit', () => {
    const director = new RaceDirector({ maxFormationSeconds: 1 });
    director.start({ formationLap: true });
    expect(director.update(1, [{ completedLaps: 0 }])).toBe('countdown');
    expect(director.formationTimedOut).toBe(true);
  });

  it('handles sequential/manual and automatic gears and feeds gear efficiency into arcade acceleration', () => {
    const systems = new RaceCarMechanics({ gearbox: 'manual' }); systems.setEnabled(true);
    expect(systems.shift(1)).toBe(true); expect(systems.gear).toBe(2);
    expect(systems.shift(-1)).toBe(true); expect(systems.gear).toBe(1);
    systems.setGearboxMode('automatic'); systems.advance(1 / 60, { speed: 26 });
    expect(systems.gear).toBe(4); expect(systems.engineRpm).toBeGreaterThan(2500);
    const player = car(); player.raceMechanics = systems;
    const dynamics = new GameVehicleDynamics(); dynamics.stepPlayer(player, { throttle: 1 }, 1 / 60);
    expect(player.velocity.length()).toBeGreaterThan(0);
    expect(() => systems.setGearboxMode('unsupported')).toThrow(RangeError);
  });

  it('opens DRS only in a derived straight zone with a rival inside the one-second window', () => {
    const straightTrack = { waypoints: [new Vector3(0, 0, 0), new Vector3(80, 0, 0), new Vector3(160, 0, 0), new Vector3(160, 0, 100), new Vector3(0, 0, 100)] };
    const zones = deriveDRSZones(straightTrack, { minLength: 50 });
    expect(zones).toHaveLength(1); expect(zones[0].length).toBeGreaterThanOrEqual(50);
    const systems = new RaceCarMechanics(); systems.setEnabled(true); systems.requestDRS(true);
    systems.advance(1 / 60, { inDRSZone: true, rivalGapSeconds: 1.2 }); expect(systems.drsActive).toBe(false);
    systems.advance(1 / 60, { inDRSZone: true, rivalGapSeconds: 0.8 }); expect(systems.drsActive).toBe(true); expect(systems.dragMultiplier).toBeLessThan(1);
    systems.advance(1 / 60, { inDRSZone: false, rivalGapSeconds: 0.8 }); expect(systems.drsActive).toBe(false);
  });

  it('recovers ERS under braking, spends charge while deployed, and changes arcade thrust', () => {
    const systems = new RaceCarMechanics(); systems.setEnabled(true); systems.ersCharge = 0.5; systems.requestERS(true);
    const deployedMultiplier = systems.accelerationMultiplier;
    systems.advance(1, { throttle: 1, brake: 0 }); expect(systems.ersCharge).toBeCloseTo(0.22); expect(deployedMultiplier).toBeGreaterThan(1);
    systems.requestERS(false); systems.advance(1, { brake: 1 }); expect(systems.ersCharge).toBeCloseTo(0.38);
  });

  it('models tyre compound, temperature and wear as arcade grip changes', () => {
    const soft = new RaceCarMechanics({ compound: 'soft' }); const hard = new RaceCarMechanics({ compound: 'hard' });
    soft.setEnabled(true); hard.setEnabled(true); soft.tyreTemperature = 92; hard.tyreTemperature = 79;
    expect(soft.tyreGrip).toBeGreaterThan(hard.tyreGrip);
    const grip = soft.tyreGrip; soft.advance(10, { speed: 45, brake: 1, steering: 1 });
    expect(soft.tyreWear).toBeGreaterThan(0); expect(soft.tyreTemperature).toBeGreaterThan(75); expect(soft.tyreGrip).toBeLessThan(grip);
    expect(RaceCarMechanics.compounds()).toHaveProperty('medium.durability');
  });

  it('builds an arcade pit route, limits its controls, services for three seconds and repairs the car', () => {
    const circuit = track(); const world = new RaceWorld(circuit); const player = world.cars[0]; world.setGameplayMechanics(true); world.director.state = 'racing';
    player.raceMechanics.applyImpact(35);
    const route = createPitRoute(circuit, world.timing, player.position, { trackHalfWidth: world.trackHalfWidth });
    expect(route.entry.distanceTo(player.position)).toBeGreaterThan(5);
    expect(calculatePitControls(player, route.service, route.pitSpeedLimit).steer).toBeTypeOf('number');
    const atStop = { ...player, position: route.service.clone(), velocity: new Vector3() };
    let service = advancePitService(atStop, route.service, 2.9, { phase: 'service', elapsed: 0 });
    expect(service.completed).toBe(false);
    service = advancePitService(atStop, route.service, 0.2, service);
    expect(service).toMatchObject({ phase: 'exit', completed: true });
    expect(world.requestPitStop(player.id, 'hard')).toBe(true);
    expect(world.requestPitStop(player.id, 'soft')).toBe(false);
    expect(world.pitStops.get(player.id).compound).toBe('hard');
    expect(() => player.raceMechanics.setCompound('intermediate')).toThrow(RangeError);
  });

  it('applies collision damage to arcade speed and grip and allows pit repairs', () => {
    const systems = new RaceCarMechanics(); systems.setEnabled(true);
    const speedBefore = systems.speedMultiplier, gripBefore = systems.tyreGrip;
    systems.applyImpact(30);
    expect(systems.damage).toBeGreaterThan(0); expect(systems.speedMultiplier).toBeLessThan(speedBefore); expect(systems.tyreGrip).toBeLessThan(gripBefore);
    systems.repair(); expect(systems.damage).toBe(0); expect(systems.tyreWear).toBe(0);
    const world = new RaceWorld(track()); world.setGameplayMechanics(true); expect(world.requestPitStop('car-1', 'bad')).toBe(false);
  });

  it('preserves the base arcade dynamics when the optional mechanics are disabled', () => {
    const a = car(), b = car(); a.position.set(5, 0, 8); b.position.copy(a.position);
    const dynamics = new GameVehicleDynamics();
    dynamics.stepPlayer(a, { throttle: 1, steer: 0.3 }, 1 / 60);
    b.raceMechanics.setEnabled(false); dynamics.stepPlayer(b, { throttle: 1, steer: 0.3 }, 1 / 60);
    expect(a.position.toArray()).toEqual(b.position.toArray()); expect(a.velocity.toArray()).toEqual(b.velocity.toArray());
    const director = new RaceDirector(); expect(director.start({ formationLap: true })).toBe(true); expect(director.state).toBe('formation');
  });
});
