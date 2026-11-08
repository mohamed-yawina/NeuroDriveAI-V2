import { Vector3 } from 'three';
import { createTrackBoundaries, createTrackDefinition } from '../../scene/trackGeometry.js';

function parametricTrack({ count, radiusX, radiusZ, harmonic2X, harmonic3X, harmonic2Z }) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return new Vector3(
      radiusX * Math.cos(angle) + harmonic2X * Math.sin(2 * angle) + harmonic3X * Math.sin(3 * angle),
      0.08,
      radiusZ * Math.sin(angle) + harmonic2Z * Math.sin(2 * angle),
    );
  });
}

function definition(id, label, waypoints) {
  return { id, label, waypoints, boundaries: createTrackBoundaries(waypoints, { halfWidth: 8.2 }) };
}

/** Training geometry plus two held-out shapes with distinct curvature profiles. */
export function createGeneralizationTracks() {
  const original = createTrackDefinition();
  return [
    { ...original, id: 'original', label: 'Original training circuit' },
    definition('technical', 'Technical, tighter turns', parametricTrack({
      count: 56, radiusX: 72, radiusZ: 53, harmonic2X: 15, harmonic3X: 8, harmonic2Z: 12,
    })),
    definition('fast-oval', 'Fast elongated circuit', parametricTrack({
      count: 56, radiusX: 112, radiusZ: 48, harmonic2X: 7, harmonic3X: 2, harmonic2Z: 4,
    })),
  ];
}

export function describeTrack(track) {
  const chordLengths = track.waypoints.map((point, index) => point.distanceTo(track.waypoints[(index + 1) % track.waypoints.length]));
  const turnAngles = track.waypoints.map((point, index) => {
    const previous = track.waypoints[(index - 1 + track.waypoints.length) % track.waypoints.length];
    const next = track.waypoints[(index + 1) % track.waypoints.length];
    const incoming = new Vector3().subVectors(point, previous).setY(0).normalize();
    const outgoing = new Vector3().subVectors(next, point).setY(0).normalize();
    return incoming.angleTo(outgoing);
  });
  return {
    id: track.id,
    label: track.label,
    waypointCount: track.waypoints.length,
    waypointPolylineLength: chordLengths.reduce((sum, length) => sum + length, 0),
    meanWaypointTurnRadians: turnAngles.reduce((sum, angle) => sum + angle, 0) / turnAngles.length,
    maxWaypointTurnRadians: Math.max(...turnAngles),
    meanTurnRadiansPerMeter: turnAngles.reduce((sum, angle) => sum + angle, 0) / chordLengths.reduce((sum, length) => sum + length, 0),
  };
}
