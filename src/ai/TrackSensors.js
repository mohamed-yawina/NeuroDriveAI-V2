import { Vector3 } from 'three';

export const SENSOR_ANGLES = Object.freeze([-60, -30, 0, 30, 60]);
const EPSILON = 1e-8;
const cross2D = (ax, az, bx, bz) => ax * bz - az * bx;

/** Return forward ray distance t for an XZ-plane segment hit, or null. */
export function raySegmentIntersection(origin, direction, start, end, epsilon = EPSILON) {
  const sx = end.x - start.x;
  const sz = end.z - start.z;
  const denominator = cross2D(direction.x, direction.z, sx, sz);
  if (Math.abs(denominator) < epsilon) return null;

  const qx = start.x - origin.x;
  const qz = start.z - origin.z;
  const distance = cross2D(qx, qz, sx, sz) / denominator;
  const segmentT = cross2D(qx, qz, direction.x, direction.z) / denominator;
  if (distance < -epsilon || segmentT < -epsilon || segmentT > 1 + epsilon) return null;
  return Math.max(0, distance);
}

/** Five forward-facing virtual distance sensors against the real track edges. */
export class TrackSensors {
  constructor(boundaries, { maxDistance = 45, angles = SENSOR_ANGLES } = {}) {
    if (!Array.isArray(boundaries) || boundaries.length === 0) throw new Error('TrackSensors requires track boundary segments.');
    if (!(maxDistance > 0)) throw new RangeError('maxDistance must be greater than zero.');
    if (!Array.isArray(angles) || !angles.length || angles.some((angle) => !Number.isFinite(angle) || Math.abs(angle) > 180)) throw new RangeError('Sensor angles must be finite degrees in [-180, 180].');
    this.boundaries = boundaries;
    this.maxDistance = maxDistance;
    this.angles = [...angles];
    this.cellSize = 12;
    this.spatialGrid = new Map();
    this.buildSpatialGrid();
    this.readings = [];
  }

  cellKey(x, z) { return `${x},${z}`; }

  buildSpatialGrid() {
    this.boundaries.forEach((segment, index) => {
      const minX = Math.floor(Math.min(segment.start.x, segment.end.x) / this.cellSize);
      const maxX = Math.floor(Math.max(segment.start.x, segment.end.x) / this.cellSize);
      const minZ = Math.floor(Math.min(segment.start.z, segment.end.z) / this.cellSize);
      const maxZ = Math.floor(Math.max(segment.start.z, segment.end.z) / this.cellSize);
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = this.cellKey(x, z);
        if (!this.spatialGrid.has(key)) this.spatialGrid.set(key, []);
        this.spatialGrid.get(key).push(index);
      }
    });
  }

  candidatesForRay(origin, direction) {
    const candidates = new Set();
    const steps = Math.ceil(this.maxDistance / (this.cellSize * 0.5));
    for (let step = 0; step <= steps; step++) {
      const distance = this.maxDistance * step / steps;
      const x = Math.floor((origin.x + direction.x * distance) / this.cellSize);
      const z = Math.floor((origin.z + direction.z * distance) / this.cellSize);
      // Neighbor cells make the sampled broad phase conservative; the final
      // ray/segment intersection remains exact and is capped by maxDistance.
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        for (const index of this.spatialGrid.get(this.cellKey(x + dx, z + dz)) ?? []) candidates.add(index);
      }
    }
    return candidates;
  }

  update(position, forward) {
    const origin = new Vector3(position.x, position.y ?? 0, position.z);
    const heading = new Vector3(forward.x, 0, forward.z);
    if (heading.lengthSq() < EPSILON) heading.set(0, 0, -1);
    heading.normalize();

    this.readings = this.angles.map((angle) => {
      // Negative angles are vehicle-left; Three.js yaw rotates -Z toward -X
      // for positive angles, hence the sign inversion here.
      const direction = heading.clone().applyAxisAngle(new Vector3(0, 1, 0), -angle * Math.PI / 180).normalize();
      let distance = this.maxDistance;
      for (const index of this.candidatesForRay(origin, direction)) {
        const segment = this.boundaries[index];
        const hit = raySegmentIntersection(origin, direction, segment.start, segment.end);
        if (hit !== null && hit < distance - EPSILON) distance = hit;
      }
      const end = origin.clone().addScaledVector(direction, distance);
      return { angle, origin: origin.clone(), direction, end, distance, normalized: distance / this.maxDistance, hit: distance < this.maxDistance };
    });
    return this.readings;
  }

  reset() { this.readings = []; }
}
