import { Vector3 } from 'three';
import { createTrackBoundaries } from '../../scene/trackGeometry.js';

/** New final-test geometry; deliberately excluded from all training track lists. */
export function createPhase8HeldOutTrack() {
  const count = 64;
  const waypoints = Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return new Vector3(
      88 * Math.cos(angle) + 18 * Math.sin(2 * angle) + 7 * Math.sin(3 * angle),
      0.08,
      61 * Math.sin(angle) + 12 * Math.sin(2 * angle) - 5 * Math.sin(3 * angle),
    );
  });
  return {
    id: 'phase8-chicane-test',
    label: 'Phase 8 held-out chicane',
    waypoints,
    boundaries: createTrackBoundaries(waypoints, { halfWidth: 8.2 }),
  };
}
