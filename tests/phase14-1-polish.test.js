import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { Track } from '../src/scene/Track.js';
import { FormulaCar } from '../src/scene/FormulaCar.js';
import { RaceCameras } from '../src/game/RaceCameras.js';
import { createTrackWaypoints } from '../src/scene/trackGeometry.js';
import { releaseSceneResources } from '../src/scene/SceneManager.js';
import { vi } from 'vitest';

describe('Phase 14.1 presentation polish', () => {
  it('batches repeating track scenery and synchronizes five physical start lamps', () => {
    const scene = new Scene();
    const track = new Track(scene);
    const instances = [];
    track.group.traverse((object) => { if (object.isInstancedMesh) instances.push(object); });
    expect(instances.length).toBeGreaterThanOrEqual(9);
    expect(instances.reduce((sum, mesh) => sum + mesh.count, 0)).toBeGreaterThan(300);
    expect(track.startGate).toBeTruthy();
    expect(track.startLightMaterials).toHaveLength(5);
    track.setStartLights(3);
    expect(track.startLightMaterials.map((material) => material.color.getHex())).toEqual([
      0xe10600, 0xe10600, 0xe10600, 0x341013, 0x341013,
    ]);
    track.setStartLights(0);
    expect(track.startLightMaterials.every((material) => material.color.getHex() === 0x341013)).toBe(true);
  });

  it('builds a detailed, livery-colored vehicle with four rotating wheel assemblies', () => {
    const scene = new Scene();
    const car = new FormulaCar(scene, { primaryColor: 0x1755cc });
    expect(car.wheels).toHaveLength(4);
    let objectCount = 0; car.root.traverse(() => { objectCount += 1; });
    expect(objectCount).toBeGreaterThan(45);
    expect(car.root.children.some((object) => object.geometry?.type === 'TorusGeometry')).toBe(true);
    const colors = [];
    car.root.traverse((object) => { if (object.material?.color) colors.push(object.material.color.getHex()); });
    expect(colors).toContain(0x1755cc);
  });

  it('moves the chase camera farther back and raises it with speed', () => {
    const track = { waypoints: createTrackWaypoints() };
    const car = { id: 'player', position: new Vector3(), forward: new Vector3(0, 0, -1), velocity: new Vector3() };
    const camera = new PerspectiveCamera();
    const cameras = new RaceCameras(camera, track);
    cameras.setTarget(car.id);
    cameras.update([car], 1);
    const lowSpeedPosition = camera.position.clone();
    car.velocity.set(0, 0, -58);
    cameras.update([car], 1);
    expect(camera.position.z).toBeGreaterThan(lowSpeedPosition.z);
    expect(camera.position.y).toBeGreaterThan(lowSpeedPosition.y);
  });

  it('disposes every unique geometry and material when replacing a showroom car', () => {
    const scene = new Scene();
    new FormulaCar(scene, { primaryColor: 0x1755cc });
    const geometries = new Set(), materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) materials.add(material);
    });
    const geometryDisposals = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...materials].map((material) => vi.spyOn(material, 'dispose'));
    releaseSceneResources(scene.children[0]);
    expect(geometryDisposals.length).toBeGreaterThan(0);
    expect(geometryDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(materialDisposals.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
