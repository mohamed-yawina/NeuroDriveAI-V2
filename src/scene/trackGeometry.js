import * as THREE from 'three';

export function createTrackWaypoints(count = 44) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = i / count * Math.PI * 2;
    points.push(new THREE.Vector3(88 * Math.cos(t) + 12 * Math.sin(2 * t) + 9 * Math.sin(3 * t), 0.08, 63 * Math.sin(t) + 9 * Math.sin(2 * t)));
  }
  return points;
}

/** Same closed Catmull-Rom road edge geometry used by Track's visible asphalt. */
export function createTrackBoundaries(waypoints, { halfWidth = 8.2, samples = 700 } = {}) {
  const curve = new THREE.CatmullRomCurve3(waypoints, true, 'centripetal');
  const boundaries = [];
  for (let i = 0; i < samples; i++) {
    const t = i / samples, nextT = (i + 1) / samples;
    const p = curve.getPointAt(t), q = curve.getPointAt(nextT);
    const tangent = curve.getTangentAt(t), nextTangent = curve.getTangentAt(nextT);
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const nextNormal = new THREE.Vector3(-nextTangent.z, 0, nextTangent.x).normalize();
    const left = p.clone().addScaledVector(normal, halfWidth).setY(0.11);
    const nextLeft = q.clone().addScaledVector(nextNormal, halfWidth).setY(0.11);
    const right = p.clone().addScaledVector(normal, -halfWidth).setY(0.11);
    const nextRight = q.clone().addScaledVector(nextNormal, -halfWidth).setY(0.11);
    boundaries.push({ start: left, end: nextLeft }, { start: right, end: nextRight });
  }
  return boundaries;
}

export function createTrackDefinition() {
  const waypoints = createTrackWaypoints();
  return { waypoints, boundaries: createTrackBoundaries(waypoints) };
}
