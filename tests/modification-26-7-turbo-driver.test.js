import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { ArcadeTurbo, isArcadeTurboAllowed } from '../src/game/ArcadeTurbo.js';
import { GameVehicleDynamics } from '../src/game/GameVehicleDynamics.js';
import { FormulaCar, FORMULA_CAR_MODELS } from '../src/scene/FormulaCar.js';
import { readRaceInput } from '../src/game/RaceControls.js';
import { AudioManager } from '../src/game/AudioManager.js';
import { vi } from 'vitest';

function mockAudioContext() {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ gain: param(), frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  const context = { state: 'suspended', currentTime: 1, sampleRate: 8, destination: {}, createGain: vi.fn(node), createBiquadFilter: vi.fn(() => ({ ...node(), frequency: param() })), createOscillator: vi.fn(() => ({ ...node(), frequency: param() })), createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(16) })), createBufferSource: vi.fn(() => ({ ...node(), loop: false })), resume: vi.fn(async () => { context.state = 'running'; }), suspend: vi.fn(async () => { context.state = 'suspended'; }), close: vi.fn(async () => { context.state = 'closed'; }) };
  return context;
}

describe('Modification 26.7 arcade turbo and visual driver', () => {
  it('keeps four different aesthetic model profiles without changing their race physics', () => {
    expect(Object.keys(FORMULA_CAR_MODELS)).toEqual(['apex', 'velocity', 'titan', 'phantom']);
    expect(new Set(Object.values(FORMULA_CAR_MODELS).map((model) => `${model.noseLength}:${model.frontWing}:${model.bodyWidth}`)).size).toBe(4);
    const cars = Object.keys(FORMULA_CAR_MODELS).map((model) => new FormulaCar(new Scene(), { model }));
    expect(cars.map((car) => car.root.userData.visualModel)).toEqual(['apex', 'velocity', 'titan', 'phantom']);
    const details = []; cars[0].root.traverse((part) => details.push(part.name));
    expect(details).toContain('engine-air-intake'); expect(details.filter((name) => name === 'side-mirror')).toHaveLength(2);
  });

  it('builds a detailed customizable pilot and steers front wheel visuals from actual input', () => {
    const car = new FormulaCar(new Scene(), { driver: { avatar: 'nova', helmetColor: 0xe10600, suitColor: 0x202832, skinColor: 0x6b422e } });
    const parts = [];
    car.driver.traverse((part) => parts.push(part.name));
    expect(parts).toContain('driver-glove');
    expect(parts).toContain('driver-boot');
    expect(car.driver.children.some((part) => part.material?.color?.getHex() === 0x6b422e)).toBe(true);
    const dynamics = new GameVehicleDynamics({ drag: 0 });
    const vehicle = { position: new Vector3(), velocity: new Vector3(0, 0, -18), forward: new Vector3(0, 0, -1), yaw: 0 };
    dynamics.stepPlayer(vehicle, { throttle: 0, steer: 1 }, 1 / 60);
    car.sync({ position: { copy() {} }, forward: { x: 0, z: -1 }, velocity: { length: () => 18 }, steeringInput: vehicle.steeringInput }, 1 / 60);
    expect(vehicle.steeringInput).toBe(1);
    expect(car.wheels.filter((wheel) => wheel.userData.front).every((wheel) => wheel.rotation.y > 0)).toBe(true);
  });

  it('gates Shift boost to a live racing input and not laboratory or roster sessions', () => {
    const keys = new Set(['ArrowUp', 'ShiftLeft']);
    expect(readRaceInput(keys, { raceState: 'racing', turboAllowed: true })).toMatchObject({ throttle: 1, turboRequested: true });
    expect(readRaceInput(keys, { raceState: 'racing' })).not.toHaveProperty('turboRequested');
    expect(readRaceInput(keys, { raceState: 'formation', turboAllowed: true })).toMatchObject({ throttle: 0, turboRequested: false });
    expect(isArcadeTurboAllowed()).toBe(true);
    expect(isArcadeTurboAllowed({ laboratory: { type: 'steering' } })).toBe(false);
    expect(isArcadeTurboAllowed({ laboratory: { type: 'neural' } })).toBe(false);
    expect(isArcadeTurboAllowed({ driverAssignments: [] })).toBe(false);
  });

  it('drains only during an allowed boost, recharges slower, and blocks boost while paused or stopped', () => {
    const turbo = new ArcadeTurbo({ drainPerSecond: 25, rechargePerSecond: 10, minimumSpeed: 4 });
    let state; for (let tick = 0; tick < 10; tick += 1) state = turbo.update(.1, { requested: true, allowed: true, racing: true, speed: 12, throttle: 1 });
    expect(state).toMatchObject({ active: true, charge: 75, state: 'ACTIVE' });
    expect(turbo.update(.1, { requested: true, allowed: true, paused: true, racing: true, speed: 12, throttle: 1 })).toMatchObject({ active: false, charge: 75 });
    expect(turbo.update(.1, { requested: true, allowed: true, racing: true, speed: 2, throttle: 1 })).toMatchObject({ active: false, charge: 76, state: 'RECHARGE' });
    expect(turbo.update(.1, { requested: true, allowed: false, racing: true, speed: 12, throttle: 1 })).toMatchObject({ active: false, charge: 76 });
    expect(turbo.update(.1, { requested: true, allowed: true, racing: true, speed: 12, throttle: 1 })).toMatchObject({ active: true, charge: 73.5 });
    turbo.reset(); expect(turbo.snapshot()).toMatchObject({ active: false, charge: 100, state: 'READY' });
  });

  it('raises only the explicitly arcade player speed cap and leaves default dynamics unchanged', () => {
    const dynamics = new GameVehicleDynamics({ drag: 0 });
    const createVehicle = (speed) => ({ velocity: new Vector3(0, 0, -speed), forward: new Vector3(0, 0, -1), position: new Vector3(), yaw: 0 });
    const standard = createVehicle(70), arcadePlayer = createVehicle(70);
    dynamics.stepPlayer(standard, { throttle: 0, steer: 0 }, 1 / 60);
    for (let index = 0; index < 60; index += 1) dynamics.stepPlayer(arcadePlayer, { throttle: 0, steer: 0, arcadeSpeedMultiplier: 1.1 }, 1 / 60);
    expect(standard.velocity.length()).toBe(58);
    expect(arcadePlayer.velocity.length()).toBeCloseTo(63.8);
    const boosted = createVehicle(80);
    for (let index = 0; index < 60; index += 1) dynamics.stepPlayer(boosted, { throttle: 1, steer: 0, arcadeSpeedMultiplier: 1.1, turboActive: true }, 1 / 60);
    expect(boosted.velocity.length()).toBeCloseTo(67.628);
    for (let index = 0; index < 15; index += 1) dynamics.stepPlayer(boosted, { throttle: 0, steer: 0, arcadeSpeedMultiplier: 1.1 }, 1 / 60);
    expect(boosted.velocity.length()).toBeGreaterThan(63.8);
    expect(boosted.velocity.length()).toBeLessThan(67.628);
  });

  it('drives turbo and high-speed wind audio through the existing central audio context', async () => {
    const context = mockAudioContext();
    const audio = new AudioManager({ AudioContextClass: vi.fn(() => context), AudioElementClass: null, storage: null });
    audio.setScene('race'); await audio.unlock();
    audio.updateEngine(58, 1, 0, 9000, 0, 0, true);
    expect(audio.nodes.windGain.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBeGreaterThan(0);
    expect(audio.nodes.turboGain.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBeGreaterThan(0);
    expect(audio.event('turbo')).toBe(true);
    audio.updateEngine(58, 0, 0, 9000, 0, 0, false);
    expect(audio.nodes.turboGain.gain.setTargetAtTime.mock.calls.at(-1)[0]).toBe(0);
    await audio.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
  });
});
