import { describe, expect, it } from 'vitest';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { createCircuitTemplate } from '../src/circuits/CircuitTemplates.js';
import { createSafeSceneryLayout, distanceToCenterlineXZ, isSceneryPlacementSafe, isTrackWithinGroundBounds, sampleTrackCenterline } from '../src/scene/SceneryPlacement.js';
import { createTrackWaypoints } from '../src/scene/trackGeometry.js';
import { Scene, Object3D, Vector3 } from 'three';
import { SceneManager } from '../src/scene/SceneManager.js';
import { Track } from '../src/scene/Track.js';

function minimumLegacyTreeDistance(waypoints) {
  const samples = sampleTrackCenterline(waypoints), distances = [];
  for (let index = 0; index < 54; index += 1) {
    const angle = index * 2.399, radius = 103 + (index % 6) * 6;
    distances.push(distanceToCenterlineXZ({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }, samples));
  }
  return Math.min(...distances);
}

describe('track-aware environment scenery', () => {
  it('reproduces the old fixed-origin tree overlap with the original road', () => {
    const waypoints = createTrackWaypoints();
    expect(minimumLegacyTreeDistance(waypoints)).toBeLessThan(8.2);
  });

  it.each([
    ['standard original', () => createTrackWaypoints(), 8.2],
    ['technical circuit', () => createGeneralizationTracks().find((track) => track.id === 'technical').waypoints, 8.2],
    ['fast oval', () => createGeneralizationTracks().find((track) => track.id === 'fast-oval').waypoints, 8.2],
    ['custom tight oval', () => Array.from({ length: 56 }, (_, index) => {
      const angle = index * Math.PI * 2 / 56, radius = 30 + 8 * Math.cos(5 * angle);
      return { x: 340 + Math.cos(angle) * radius, y: 0.08, z: -210 + Math.sin(angle) * radius * 0.68 };
    }), 6.5],
    ['small translated user circuit', () => createCircuitTemplate('oval').controlPoints.map(({ x, z }) => ({ x: 500 + x * 0.32, y: 0.08, z: -280 + z * 0.32 })), 8],
  ])('keeps tree and hill footprints clear on %s', (_name, makeWaypoints, halfWidth) => {
    const waypoints = makeWaypoints(), before = waypoints.map(({ x, z }) => [x, z]);
    const layout = createSafeSceneryLayout(waypoints, { halfWidth, treeCount: 38, hillCount: 32 });
    expect(layout.trees).toHaveLength(38); expect(layout.hills).toHaveLength(32);
    for (const placement of [...layout.trees, ...layout.hills]) {
      expect(isSceneryPlacementSafe(placement, placement.footprintRadius, layout.samples, { halfWidth, cameraClearance: layout.cameraClearance })).toBe(true);
      expect(distanceToCenterlineXZ(placement, layout.samples)).toBeGreaterThanOrEqual(halfWidth + placement.footprintRadius + layout.cameraClearance);
    }
    expect(waypoints.map(({ x, z }) => [x, z])).toEqual(before);
  });

  it('rejects unsafe placement and invalid footprints rather than accepting them', () => {
    const samples = sampleTrackCenterline(createTrackWaypoints());
    expect(isSceneryPlacementSafe(samples[0], 2, samples)).toBe(false);
    expect(isSceneryPlacementSafe({ x: 100, z: 100 }, -1, samples)).toBe(false);
  });

  it('uses the validated track-relative positions for the real instanced environment', () => {
    const track = createTrackWaypoints();
    const manager = { scene: new Scene(), renderProfile: { sceneryDensity: 0.45, shadowsEnabled: false, shadowMapSize: 512 } };
    SceneManager.prototype.addEnvironment.call(manager, { waypoints: track, halfWidth: 8.2 });
    const trees = manager.scene.getObjectByName('environment-tree-trunks');
    const crowns = manager.scene.getObjectByName('environment-tree-crowns');
    const hills = manager.scene.getObjectByName('environment-hills');
    expect(trees.count).toBe(manager.sceneryLayout.trees.length);
    expect(crowns.count).toBe(manager.sceneryLayout.trees.length);
    expect(hills.count).toBe(manager.sceneryLayout.hills.length);
    const transform = new Object3D();
    for (const [mesh, placements] of [[trees, manager.sceneryLayout.trees], [hills, manager.sceneryLayout.hills]]) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, transform.matrix); transform.matrix.decompose(transform.position, transform.quaternion, transform.scale);
        expect(transform.position.x).toBeCloseTo(placements[index].x);
        expect(transform.position.z).toBeCloseTo(placements[index].z);
        expect(isSceneryPlacementSafe({ x: transform.position.x, z: transform.position.z }, placements[index].footprintRadius, manager.sceneryLayout.samples, { halfWidth: 8.2, cameraClearance: 34 })).toBe(true);
      }
    }
  });

  it('rebuilds environment anchors when Circuit Studio changes to a distant custom layout', () => {
    const waypoints = createTrackWaypoints();
    const firstDefinition = { waypoints, halfWidth: 8.2 };
    const scene = new Scene();
    const manager = { scene, addEnvironment: SceneManager.prototype.addEnvironment, renderProfile: { sceneryDensity: 0.45, shadowsEnabled: false, shadowMapSize: 512 } };
    SceneManager.prototype.addEnvironment.call(manager, firstDefinition);
    manager.track = new Track(scene, firstDefinition);
    const movedDefinition = { halfWidth: 8.2, waypoints: waypoints.map((point) => new Vector3(point.x + 900, point.y, point.z - 700)) };
    SceneManager.prototype.setTrack.call(manager, movedDefinition);
    expect(manager.environmentCenter.x).toBeGreaterThan(850);
    expect(manager.environmentCenter.z).toBeLessThan(-650);
    expect(isTrackWithinGroundBounds(movedDefinition.waypoints, manager.groundCenter, manager.groundSpan, 30)).toBe(true);
    for (const placement of [...manager.sceneryLayout.trees, ...manager.sceneryLayout.hills]) {
      expect(isSceneryPlacementSafe(placement, placement.footprintRadius, manager.sceneryLayout.samples, { halfWidth: 8.2, cameraClearance: 34 })).toBe(true);
    }
  });
});
