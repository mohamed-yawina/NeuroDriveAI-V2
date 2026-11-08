import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { MenuShowroom, adjustShowroomZoom, applyOrbitDrag, getShowroomViewAngle, shouldAutoRotate } from '../src/scene/MenuShowroom.js';
import { getRenderProfile, readGameSettings, resetGameSettings, writeGameSettings } from '../src/settings/GameSettings.js';
import { RaceSession } from '../src/game/RaceSession.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { Track } from '../src/scene/Track.js';
import { FormulaCar } from '../src/scene/FormulaCar.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

describe('Phase 14.3 showroom and real settings', () => {
  it('orbits around a stationary car, supports a full turn, and clamps progressive zoom', () => {
    const target = applyOrbitDrag(0, 0, 800, 0.009);
    expect(target).toBeCloseTo(7.2);
    expect(adjustShowroomZoom(16, -1, 0.8)).toBeCloseTo(15.2);
    expect(adjustShowroomZoom(8.5, -1, 0.8)).toBe(8.5);
    expect(adjustShowroomZoom(20, 1, 0.8)).toBe(20);
    expect(getShowroomViewAngle('front')).toBe(Math.PI);
    expect(getShowroomViewAngle('rear')).toBe(0);
    expect(getShowroomViewAngle('side')).toBe(Math.PI / 2);
    expect(getShowroomViewAngle('threeQuarter')).toBeCloseTo(Math.PI - 0.52);
    expect(getShowroomViewAngle('unknown')).toBeUndefined();
    expect(shouldAutoRotate('threeQuarter', false)).toBe(true);
    expect(shouldAutoRotate('front', false)).toBe(false);
    expect(shouldAutoRotate('custom', false)).toBe(false);
    expect(shouldAutoRotate('circuit', false)).toBe(true);
    expect(shouldAutoRotate('threeQuarter', true)).toBe(false);
  });

  it('automatically rotates the camera around the front three-quarter car instead of spinning the car with it', () => {
    const showroom = Object.create(MenuShowroom.prototype);
    Object.assign(showroom, {
      disposed: false, running: true, dragging: false, previous: 0, rotation: Math.PI - 0.52,
      targetRotation: Math.PI - 0.52, distance: 16, view: 'threeQuarter', focus: new Vector3(0, 0.7, 0),
      camera: new PerspectiveCamera(), car: { root: new Group() }, renderer: { render: vi.fn() }, scene: {},
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    showroom.animate(100);
    expect(showroom.rotation).toBeGreaterThan(Math.PI - 0.52);
    expect(showroom.car.root.rotation.y).toBe(0);
    expect(showroom.camera.position.z).toBeLessThan(0);
    vi.unstubAllGlobals();
  });

  it('applies a garage livery to a replacement car and releases the previous GPU resources', () => {
    const scene = new Scene();
    const oldCar = new FormulaCar(scene, { primaryColor: 0xe10600 });
    const oldGeometries = new Set(), oldMaterials = new Set();
    oldCar.root.traverse((object) => {
      if (object.geometry) oldGeometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) oldMaterials.add(material);
    });
    const geometryDisposals = [...oldGeometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...oldMaterials].map((material) => vi.spyOn(material, 'dispose'));
    const showroom = Object.create(MenuShowroom.prototype); showroom.scene = scene; showroom.car = oldCar;
    showroom.setColor('#1755cc');
    expect(geometryDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    let bluePresent = false;
    showroom.car.root.traverse((object) => { if (object.material?.color?.getHex() === 0x1755cc) bluePresent = true; });
    expect(bluePresent).toBe(true);
  });

  it('resets garage camera to the three-quarter preset', () => {
    const showroom = Object.create(MenuShowroom.prototype); showroom.setView = vi.fn();
    showroom.resetCamera();
    expect(showroom.setView).toHaveBeenCalledWith('threeQuarter');
  });

  it('persists graphics, camera and effects settings and restores supported defaults', () => {
    const storage = memoryStorage();
    writeGameSettings({ quality: 'low', shadows: false, scenery: 'low', effects: false, cameraMode: 'cockpit', orbitSensitivity: 0.015, zoomSensitivity: 1.2 }, storage);
    expect(readGameSettings(storage)).toMatchObject({ quality: 'low', shadows: false, scenery: 'low', effects: false, cameraMode: 'cockpit', orbitSensitivity: 0.015, zoomSensitivity: 1.2 });
    expect(getRenderProfile(readGameSettings(storage))).toMatchObject({ pixelRatio: 1, shadowsEnabled: false, sceneryDensity: 0.45, effectsEnabled: false });
    expect(resetGameSettings(storage)).toMatchObject({ quality: 'high', shadows: true, scenery: 'high', effects: true, cameraMode: 'chase' });
    expect(readGameSettings(storage).cameraMode).toBe('chase');
  });

  it('keeps the same physical definitions and renders all three built-in circuits', () => {
    for (const definition of createGeneralizationTracks()) {
      const track = new Track(new Scene(), definition);
      expect(track.waypoints).toBe(definition.waypoints);
      expect(track.boundaries).toBe(definition.boundaries);
      expect(track.halfWidth).toBe(definition.halfWidth ?? (definition.width ? definition.width / 2 : 8.2));
      expect(track.startGate).toBeTruthy();
      expect(track.group.children.some((child) => child.isInstancedMesh)).toBe(true);
      expect(track.brakingMarkers).toHaveLength(6);
      expect(track.brakingMarkers.map((marker) => marker.userData.distanceToApex).sort((a, b) => a - b)).toEqual([50, 50, 100, 100, 150, 150]);
      const road = track.group.children.find((child) => child.isMesh && child.geometry?.getAttribute('uv'));
      expect(road.geometry.getAttribute('uv').count).toBe(road.geometry.getAttribute('position').count);
      expect(road.material.map.isDataTexture).toBe(true);
    }
  });

  it('maps keyboard input in the actual race session controls', () => {
    const session = Object.create(RaceSession.prototype);
    session.keys = new Set(['ArrowUp', 'ArrowLeft']);
    expect(session.getPlayerInput()).toEqual({ throttle: 1, brake: 0, steer: -1, ersDeploy: false });
    session.keys = new Set(['ArrowDown', 'KeyD']);
    expect(session.getPlayerInput()).toEqual({ throttle: -1, brake: 1, steer: 1, ersDeploy: false });
  });
});
