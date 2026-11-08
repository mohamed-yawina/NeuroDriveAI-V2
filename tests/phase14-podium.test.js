import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { RaceSession } from '../src/game/RaceSession.js';

describe('Phase 14 race-finish podium presentation', () => {
  afterEach(() => vi.restoreAllMocks());

  it('builds a podium with the top three actual cars and restores views on cleanup', () => {
    const cars = Array.from({ length: 6 }, (_, index) => ({
      id: `car-${index + 1}`, number: index + 1, finished: index < 3,
      finishTime: index + 1, completedLaps: index < 3 ? 3 : 0,
      progress: index < 3 ? 1 : 0.2,
    }));
    const carViews = cars.map(() => ({ root: new THREE.Group() }));
    const scene = new THREE.Scene();
    const label = { textContent: '' };
    const session = Object.create(RaceSession.prototype);
    Object.assign(session, {
      world: { cars }, carViews, scene: { scene },
      cameras: { mode: 'chase' },
      ui: { querySelector: () => label },
    });

    session.buildFinishScene();

    expect(session.finishScene.userData.podium).toBe(true);
    expect(session.finishScene.children.filter((child) => child.isMesh)).toHaveLength(73);
    expect(carViews.map(({ root }) => root.visible)).toEqual([true, true, true, false, false, false]);
    expect(session.cameras.mode).toBe('podium');
    expect(label.textContent).toBe('PODIUM');

    session.clearFinishScene();
    expect(session.finishScene).toBeNull();
    expect(scene.children).toHaveLength(0);
    expect(carViews.every(({ root }) => root.visible && root.scale.x === 1.35)).toBe(true);
  });
});
