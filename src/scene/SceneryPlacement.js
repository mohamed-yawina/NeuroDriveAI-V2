import * as THREE from 'three';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function sampleTrackCenterline(waypoints, samples = 700) {
  if (!Array.isArray(waypoints) || waypoints.length < 3) throw new TypeError('Scenery placement requires a closed track with at least three waypoints.');
  const points = waypoints.map((point) => point?.isVector3 ? point : new THREE.Vector3(point.x, point.y ?? 0.08, point.z));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  return curve.getSpacedPoints(samples).slice(0, -1).map(({ x, z }) => ({ x, z }));
}

export function pointSegmentDistanceXZ(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 1e-12 ? THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / lengthSquared, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function distanceToCenterlineXZ(point, samples) {
  let distance = Infinity;
  for (let index = 0; index < samples.length; index += 1) {
    const start = samples[index], end = samples[(index + 1) % samples.length];
    distance = Math.min(distance, pointSegmentDistanceXZ(point.x, point.z, start.x, start.z, end.x, end.z));
  }
  return distance;
}

export function isSceneryPlacementSafe(point, footprintRadius, samples, { halfWidth = 8.2, cameraClearance = 34 } = {}) {
  if (![point?.x, point?.z, footprintRadius, halfWidth, cameraClearance].every(Number.isFinite) || footprintRadius < 0 || halfWidth <= 0 || cameraClearance < 0) return false;
  return distanceToCenterlineXZ(point, samples) >= halfWidth + footprintRadius + cameraClearance;
}

function sampleBounds(samples) {
  const bounds = samples.reduce((result, point) => ({ minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x), minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const extent = samples.reduce((maximum, point) => Math.max(maximum, Math.hypot(point.x - center.x, point.z - center.z)), 0);
  return { bounds, center, extent };
}

export function isTrackWithinGroundBounds(waypoints, center, span, margin = 0) {
  if (!center || !Number.isFinite(span) || span <= 0) return false;
  const { bounds } = sampleBounds(sampleTrackCenterline(waypoints, 256));
  const half = span / 2 - margin;
  return bounds.minX >= center.x - half && bounds.maxX <= center.x + half
    && bounds.minZ >= center.z - half && bounds.maxZ <= center.z + half;
}

function makeSafeRing({ count, footprintRadius, samples, center, extent, halfWidth, cameraClearance, phase }) {
  const safeMargin = halfWidth + footprintRadius + cameraClearance + 4;
  const positions = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index * GOLDEN_ANGLE + phase;
    const radius = extent + safeMargin + (index % 4) * Math.max(4, footprintRadius * 0.65);
    const point = { x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius, footprintRadius };
    // The enclosing radius is conservative; retain the exact spline-distance check as a guard.
    if (isSceneryPlacementSafe(point, footprintRadius, samples, { halfWidth, cameraClearance })) positions.push(point);
  }
  return positions;
}

/** Deterministic environment placements whose full footprints clear the runtime spline and camera envelope. */
export function createSafeSceneryLayout(waypoints, { halfWidth = 8.2, treeCount = 54, hillCount = 46, cameraClearance = 34, samples: sampleCount = 700 } = {}) {
  const samples = sampleTrackCenterline(waypoints, sampleCount);
  const { bounds, center, extent } = sampleBounds(samples);
  const trees = makeSafeRing({ count: treeCount, footprintRadius: 5, samples, center, extent, halfWidth, cameraClearance, phase: 0.37 });
  const hills = makeSafeRing({ count: hillCount, footprintRadius: 16, samples, center, extent, halfWidth, cameraClearance, phase: 1.11 });
  return { samples, bounds, center, extent, trees, hills, halfWidth, cameraClearance };
}

export function isSceneryLayoutSafeForTrack(layout, waypoints, halfWidth = layout?.halfWidth ?? 8.2) {
  if (!layout || !Array.isArray(waypoints) || waypoints.length < 3) return false;
  const { bounds } = sampleBounds(sampleTrackCenterline(waypoints, Math.min(256, layout.samples.length)));
  const placements = [...layout.trees, ...layout.hills];
  const safelyOutsideBounds = placements.every((item) => {
    const dx = Math.max(bounds.minX - item.x, 0, item.x - bounds.maxX);
    const dz = Math.max(bounds.minZ - item.z, 0, item.z - bounds.maxZ);
    return Math.hypot(dx, dz) >= halfWidth + item.footprintRadius + layout.cameraClearance;
  });
  if (safelyOutsideBounds) return true;
  const samples = sampleTrackCenterline(waypoints, layout.samples.length);
  return placements.every((item) => isSceneryPlacementSafe(item, item.footprintRadius, samples, { halfWidth, cameraClearance: layout.cameraClearance }));
}
