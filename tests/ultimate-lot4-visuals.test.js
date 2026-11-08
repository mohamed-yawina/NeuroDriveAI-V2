import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RaceVisualState } from '../src/game/RaceVisualState.js';
import { RaceFlagSystem } from '../src/game/RaceFlagSystem.js';
import { RaceParticles } from '../src/game/RaceParticles.js';
import { RaceCameras } from '../src/game/RaceCameras.js';
import { SceneManager } from '../src/scene/SceneManager.js';
import { Track } from '../src/scene/Track.js';
import { FormulaCar } from '../src/scene/FormulaCar.js';
import { GameCar } from '../src/game/GameCar.js';
import { GameVehicleDynamics } from '../src/game/GameVehicleDynamics.js';
import { RaceController } from '../src/game/RaceController.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';

describe('Ultimate Edition lot 4: visual environment and camera systems', () => {
  it('smoothly transitions the day/night and weather state without changing physics inputs', () => {
    const state = new RaceVisualState(); const previous = { ...state.update(0.1) };
    state.setConditions({ day: 'night', weather: 'rain' });
    const mid = state.update(0.5), settled = state.update(40);
    expect(mid.daylight).toBeLessThan(previous.daylight); expect(mid.daylight).toBeGreaterThan(0.24);
    expect(settled.daylight).toBeCloseTo(0.24, 5); expect(settled.wetness).toBeCloseTo(1, 5); expect(settled.rain).toBeCloseTo(1, 5);
    expect(() => state.setConditions({ day: 'dusk' })).toThrow(RangeError);
  });

  it('transitions scene lighting, fog and asphalt specularity from the cosmetic state', () => {
    const fake = Object.create(SceneManager.prototype);
    fake.scene = { background: new THREE.Color(), fog: { color: new THREE.Color(), near: 180, far: 440 } };
    fake.hemisphere = { intensity: 0 }; fake.sun = { color: new THREE.Color(), intensity: 0 };
    fake.skyMaterial = { uniforms: { daylight: { value: 1 } } }; fake.sunDisc = { material: { opacity: 1 } };
    fake.renderer = { toneMappingExposure: 1 }; fake.track = { setWetness: vi.fn() };
    fake.setVisualState({ daylight: 0.24, wetness: 1, fog: 0.32, exposure: 0.66 });
    expect(fake.hemisphere.intensity).toBeCloseTo(0.7168);
    expect(fake.sun.intensity).toBeCloseTo(1.1112);
    expect(fake.scene.fog.far).toBeLessThan(440); expect(fake.renderer.toneMappingExposure).toBe(0.66);
    expect(fake.track.setWetness).toHaveBeenCalledWith(1);
  });

  it('shows green, incident yellow, lapped-car blue and checkered states with defined race effects', () => {
    const flags = new RaceFlagSystem(); const cars = [{ id: 'leader', completedLaps: 2 }, { id: 'backmarker', completedLaps: 1 }];
    expect(flags.update({ cars, director: { state: 'racing' } }).flag).toBe('blue');
    expect(cars[1].raceFlags.blue).toBe(true);
    expect(flags.update({ cars, director: { state: 'racing' }, collisionCount: 1 }, 0.1)).toMatchObject({ flag: 'yellow', yellowRemaining: 2.9 });
    expect(cars[0].raceFlags.speedMultiplier).toBe(0.62);
    expect(flags.update({ cars, director: { state: 'finished' } }).flag).toBe('checkered');
    expect(() => flags.update({ cars: [], director: { state: 'racing' } })).not.toThrow();
    const player = new GameCar({ id: 'yellow', position: new THREE.Vector3(), forward: new THREE.Vector3(1, 0, 0) });
    player.velocity.set(50, 0, 0); player.raceFlags = { speedMultiplier: 0.62 };
    new GameVehicleDynamics({ drag: 0 }).step(player, new THREE.Vector3(), 1 / 60);
    expect(player.velocity.length()).toBeCloseTo(34.72);
    const ai = new GameCar({ id: 'blue', position: new THREE.Vector3(), forward: new THREE.Vector3(1, 0, 0) });
    const controller = new RaceController(createGeneralizationTracks()[0], { car: ai }); controller.setDefenseEnabled(true); ai.raceFlags = { blue: true };
    controller.compute({ car: ai, cars: [ai], deltaTime: 1 / 60 });
    expect(controller.overtaking.defenseEnabled).toBe(false);
  });

  it('supports bounded TV shots and photo orbit/zoom with a restorable camera mode', () => {
    const camera = new THREE.PerspectiveCamera(); const track = createGeneralizationTracks()[0];
    const cams = new RaceCameras(camera, track); const cars = [{ id: 'p1', position: new THREE.Vector3(2, 0, 5), forward: new THREE.Vector3(0, 0, -1), velocity: new THREE.Vector3(), completedLaps: 1, progress: 0.2 }];
    cams.setMode('tv');
    expect(cams.mode).toBe('tv'); cams.update(cars, 1 / 60); expect(cams.tvCameras.length).toBeGreaterThan(0);
    expect(cams.setPhotoMode(true)).toBe('photo'); cams.orbitPhoto(40, 120); cams.zoomPhoto(10000); expect(cams.photoDistance).toBe(90);
    cams.update(cars, 1 / 60); expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(cams.setPhotoMode(false)).toBe('tv');
  });

  it('adds bounded speed feedback to the chase camera while restoring the base field of view on alternate views', () => {
    const camera = new THREE.PerspectiveCamera(48); const track = createGeneralizationTracks()[0];
    const cams = new RaceCameras(camera, track);
    const car = { id: 'p1', position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), velocity: new THREE.Vector3(58, 0, 0), completedLaps: 0, progress: 0 };
    cams.setTarget('p1'); cams.update([car], 1);
    expect(camera.fov).toBeGreaterThan(48); expect(camera.fov).toBeLessThanOrEqual(50.2);
    const chaseFov = camera.fov; cams.setMode('cockpit');
    for (let index = 0; index < 10; index += 1) cams.update([car], 1);
    expect(camera.fov).toBeLessThan(chaseFov); expect(camera.fov).toBeCloseTo(48, 1);
  });

  it('keeps event/rain particles bounded and releases all GPU resources', () => {
    const scene = new THREE.Scene(); const particles = new RaceParticles(scene, { bounds: 40 });
    particles.emit(new THREE.Vector3(1, 0, 2), 'dust', 150); expect(particles.effects).toHaveLength(96);
    particles.setRain(true); const rainVersion = particles.rainGeometry.attributes.position.version; particles.update(1 / 60, new THREE.Vector3(4, 1, 9));
    expect(particles.rainLines.visible).toBe(true); expect(particles.rainGeometry.attributes.position.version).toBeGreaterThan(rainVersion);
    const dispose = vi.spyOn(particles.effectGeometry, 'dispose'); particles.dispose();
    expect(dispose).toHaveBeenCalledOnce(); expect(scene.children).toHaveLength(0);
  });

  it('adapts the asphalt to wet visuals and animates deterministic grandstand crowd instances', () => {
    const scene = new THREE.Scene(), track = new Track(scene, createGeneralizationTracks()[0]);
    const dryRoughness = track.asphaltMaterial.roughness; track.setWetness(1);
    expect(track.asphaltMaterial.roughness).toBeLessThan(dryRoughness);
    const before = new THREE.Matrix4(); track.crowd.getMatrixAt(0, before);
    track.updateCrowd(0.2, 1);
    const after = new THREE.Matrix4(); track.crowd.getMatrixAt(0, after);
    expect(after.elements[13]).not.toBe(before.elements[13]);
  });

  it('adds instanced trackside sponsor boards outside the logical circuit and uses physical livery materials', () => {
    const scene = new THREE.Scene(), track = new Track(scene, createGeneralizationTracks()[0]);
    const boards = track.group.children.filter((object) => object.isInstancedMesh && object.geometry.parameters.width === 7.2);
    expect(boards).toHaveLength(2);
    expect(boards[0].count).toBeGreaterThanOrEqual(8); expect(boards[0].count).toBeLessThanOrEqual(18);
    const pose = new THREE.Matrix4(), position = new THREE.Vector3(); boards[0].getMatrixAt(0, pose); pose.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.y).toBeCloseTo(1.65);
    const car = new FormulaCar(new THREE.Scene(), { primaryColor: 0xe10600 });
    let physicalPaint = 0, tireMaterials = 0;
    car.root.traverse((object) => { if (object.material?.isMeshPhysicalMaterial && object.material.clearcoat > 0) physicalPaint += 1; if (object.material?.roughness > 0.9) tireMaterials += 1; });
    expect(physicalPaint).toBeGreaterThan(0); expect(tireMaterials).toBeGreaterThan(0);
  });
});
