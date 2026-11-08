import { describe, expect, it } from 'vitest';
import { createMinimapProjector, formatRaceGap, raceDistanceMeters } from '../src/game/RaceMinimap.js';

describe('race minimap projection and live gaps', () => {
  it('fits an asymmetric custom circuit into the canvas without distortion', () => {
    const route = [{ x: -120, z: 15 }, { x: 80, z: 15 }, { x: 80, z: 65 }, { x: -120, z: 65 }];
    const projection = createMinimapProjector(route, 250, 170, 18);
    const projected = route.map(projection.project);
    expect(Math.max(...projected.map((point) => point.x))).toBeLessThanOrEqual(232);
    expect(Math.min(...projected.map((point) => point.x))).toBeGreaterThanOrEqual(18);
    expect(Math.max(...projected.map((point) => point.y))).toBeLessThanOrEqual(152);
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const height = Math.max(...projected.map((point) => point.y)) - Math.min(...projected.map((point) => point.y));
    expect(width / height).toBeCloseTo(4);
  });

  it('rejects invalid tracks and formats gaps only from recorded race distance', () => {
    expect(createMinimapProjector([{ x: 0, z: 0 }], 100, 100)).toBeNull();
    const leader = { id: 'a', completedLaps: 1, station: 40, totalTrackLength: 200 };
    const follower = { id: 'b', completedLaps: 1, station: 17, totalTrackLength: 200 };
    expect(raceDistanceMeters(leader)).toBe(240);
    expect(formatRaceGap(leader, leader)).toBe('LEADER');
    expect(formatRaceGap(follower, leader)).toBe('+23 m');
  });
});
