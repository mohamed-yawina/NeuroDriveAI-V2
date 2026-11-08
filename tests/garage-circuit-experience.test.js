import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { circuitToTrackDefinition } from '../src/circuits/CircuitFormat.js';
import { createCircuitTemplate } from '../src/circuits/CircuitTemplates.js';
import { FormulaCar } from '../src/scene/FormulaCar.js';
import { CareerStore } from '../src/game/CareerStore.js';
import { GameVehicleDynamics } from '../src/game/GameVehicleDynamics.js';
import { getRaceCarAppearance } from '../src/game/RaceSession.js';
import { measureTrackDefinition, trackPreviewSvg } from '../src/ui/TrackGallery.js';
import { Track } from '../src/scene/Track.js';

describe('Garage and circuit selection experience', () => {
  it('persists the local driver name, livery accent and number without changing shared race mechanics', () => {
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const store = new CareerStore(storage);
    store.setProfile({ name: 'Simo', livery: '#e10600', preferences: { secondaryLivery: '#f5f5f5', driverNumber: 42, carModel: 'velocity', driverAvatar: 'nova', helmetColor: '#eeeeee', suitColor: '#1b2430' } });
    const reloaded = new CareerStore(storage).read().profile;
    expect(reloaded).toMatchObject({ name: 'Simo', livery: '#e10600', preferences: { secondaryLivery: '#f5f5f5', driverNumber: 42, carModel: 'velocity', driverAvatar: 'nova', helmetColor: '#eeeeee', suitColor: '#1b2430' } });
    expect(new GameVehicleDynamics()).toMatchObject({ acceleration: 24, braking: 36, maxSpeed: 58, turnRate: 1.8 });
  });

  it('builds circuit previews and displayed measurements from runtime waypoints', () => {
    for (const track of createGeneralizationTracks()) {
      const measured = measureTrackDefinition(track);
      expect(measured.length).toBeCloseTo(track.waypoints.reduce((sum, point, index) => sum + point.distanceTo(track.waypoints[(index + 1) % track.waypoints.length]), 0));
      expect(measured.turns).toBeGreaterThan(0);
      expect(trackPreviewSvg(track)).toContain('aria-label="Aperçu du tracé');
      expect(trackPreviewSvg(track)).toContain('stroke="#e10600"');
    }
  });

  it('previews a custom track from the exact runtime geometry used to start the session', () => {
    const definition = circuitToTrackDefinition(createCircuitTemplate('oval'));
    const preview = trackPreviewSvg(definition);
    expect(measureTrackDefinition(definition).points).toEqual(definition.waypoints.map(({ x, z }) => ({ x, z })));
    expect(preview).toContain('Aperçu du tracé');
  });

  it('adds optional racing-line surface detail from the runtime spline without changing track waypoints', () => {
    const definition = circuitToTrackDefinition(createCircuitTemplate('oval'));
    const originalPoints = definition.waypoints.map(({ x, z }) => [x, z]);
    const scene = new Scene(); const track = new Track(scene, definition);
    expect(track.group.children.filter((child) => child.name === 'render-only-rubber-line')).toHaveLength(2);
    expect(definition.waypoints.map(({ x, z }) => [x, z])).toEqual(originalPoints);
    expect(track.boundaries).toEqual(definition.boundaries);
  });

  it('applies garage colors and driver number to the rendered Formula car and race-player appearance', () => {
    const driver = { avatar: 'nova', helmetColor: 0xeeeeee, suitColor: 0x222222 };
    const appearance = getRaceCarAppearance({ color: 0x2484ff }, { isHuman: true, liveryColor: 0xe10600, secondaryColor: 0xf5f5f5, driverNumber: 42, model: 'phantom', driver });
    expect(appearance).toEqual({ primaryColor: 0xe10600, secondaryColor: 0xf5f5f5, driverNumber: 42, model: 'phantom', driver });
    expect(getRaceCarAppearance({ color: 0x2484ff }, { isHuman: false })).toEqual({ primaryColor: 0x2484ff, secondaryColor: 0xf0bf66, driverNumber: null });
    const car = new FormulaCar(new Scene(), appearance);
    expect(car.root.userData.driverNumber).toBe(42);
    let primary = false, accent = false;
    car.root.traverse((object) => {
      if (object.material?.color?.getHex() === 0xe10600) primary = true;
      if (object.material?.color?.getHex() === 0xf5f5f5) accent = true;
    });
    expect(primary).toBe(true);
    expect(accent).toBe(true);
    expect(car.root.userData.visualModel).toBe('phantom');
    expect(car.root.getObjectByName('driver-avatar')).toBeTruthy();
  });

  it('provides four visibly distinct visual car silhouettes without changing shared dynamics', () => {
    const fingerprints = [];
    for (const model of ['apex', 'velocity', 'titan', 'phantom']) {
      const car = new FormulaCar(new Scene(), { model, driver: { avatar: 'vector', helmetColor: 0xe10600, suitColor: 0x202832 } });
      const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
      car.root.traverse((part) => {
        if (!part.isMesh || !part.geometry) return;
        part.geometry.computeBoundingBox();
        const box = part.geometry.boundingBox;
        bounds.minX = Math.min(bounds.minX, part.position.x + box.min.x);
        bounds.maxX = Math.max(bounds.maxX, part.position.x + box.max.x);
        bounds.minZ = Math.min(bounds.minZ, part.position.z + box.min.z);
        bounds.maxZ = Math.max(bounds.maxZ, part.position.z + box.max.z);
      });
      fingerprints.push(`${model}:${bounds.maxX - bounds.minX}:${bounds.maxZ - bounds.minZ}:${car.root.getObjectByName('driver-avatar')?.children.length}`);
    }
    expect(new Set(fingerprints).size).toBe(4);
    expect(new GameVehicleDynamics()).toMatchObject({ acceleration: 24, braking: 36, maxSpeed: 58, turnRate: 1.8 });
  });
});
