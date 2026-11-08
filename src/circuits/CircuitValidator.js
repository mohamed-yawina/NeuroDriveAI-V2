import { CatmullRomCurve3, Vector3 } from 'three';

const MIN_POINTS = 10;
const MAX_POINTS = 64;
const MIN_WIDTH = 12;
const MAX_WIDTH = 26;
const MIN_SEGMENT = 6;
const MAX_SEGMENT = 140;
const MIN_TURN_RADIUS = 6;
const CAR_RADIUS = 1.65;
const issueList = (errors, warnings = []) => [
  ...errors.map((message) => ({ severity: 'error', message })),
  ...warnings.map((message) => ({ severity: 'warning', message })),
];

function projectToSegment(point, start, end) {
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared)) : 0;
  return { x: start.x + dx * t, z: start.z + dz * t };
}

function pointSegmentDistance(point, start, end) {
  const projection = projectToSegment(point, start, end);
  return Math.hypot(point.x - projection.x, point.z - projection.z);
}

function orientation(a, b, c) { return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x); }

function segmentsIntersect(a, b, c, d) {
  const epsilon = 1e-7;
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if ((o1 > epsilon && o2 < -epsilon || o1 < -epsilon && o2 > epsilon) && (o3 > epsilon && o4 < -epsilon || o3 < -epsilon && o4 > epsilon)) return true;
  const onSegment = (p, q, r) => q.x >= Math.min(p.x, r.x) - epsilon && q.x <= Math.max(p.x, r.x) + epsilon && q.z >= Math.min(p.z, r.z) - epsilon && q.z <= Math.max(p.z, r.z) + epsilon;
  return Math.abs(o1) <= epsilon && onSegment(a, c, b) || Math.abs(o2) <= epsilon && onSegment(a, d, b)
    || Math.abs(o3) <= epsilon && onSegment(c, a, d) || Math.abs(o4) <= epsilon && onSegment(c, b, d);
}

function circumradius(a, b, c) {
  const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
  const area2 = Math.abs(orientation(a, b, c));
  return area2 < 1e-8 ? Infinity : ab * bc * ca / (2 * area2);
}

function segmentDistance(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

export function cumulativeTrackDistances(sampledTrack) {
  if (!Array.isArray(sampledTrack) || sampledTrack.length < 2) return [0];
  const distances = [0];
  for (let index = 0; index < sampledTrack.length - 1; index++) {
    const a = sampledTrack[index], b = sampledTrack[index + 1];
    distances.push(distances.at(-1) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return distances;
}

export function cyclicArcDistance(a, b, totalLength) {
  if (!(totalLength > 0)) return 0;
  const difference = Math.abs(a - b) % totalLength;
  return Math.min(difference, totalLength - difference);
}

function gridSafety(points, width, sampledTrack) {
  const start = points[0], next = points[1];
  const length = Math.hypot(next.x - start.x, next.z - start.z);
  if (length < 1e-8) return { safe: false, reason: 'Le premier segment ne permet pas d’orienter la grille.' };
  const forward = { x: (next.x - start.x) / length, z: (next.z - start.z) / length };
  const lateral = { x: -forward.z, z: forward.x };
  const halfWidth = width / 2;
  const slots = Array.from({ length: 6 }, (_, index) => {
    const row = Math.floor(index / 2), side = index % 2 === 0 ? -0.5 : 0.5;
    return {
      x: start.x - forward.x * (4 + row * 8) + lateral.x * side * 5.4,
      z: start.z - forward.z * (4 + row * 8) + lateral.z * side * 5.4,
    };
  });
  for (let i = 0; i < slots.length; i++) {
    let nearestSpline = Infinity, nearestPath = Infinity;
    for (let segment = 0; segment < sampledTrack.length - 1; segment++) nearestSpline = Math.min(nearestSpline, pointSegmentDistance(slots[i], sampledTrack[segment], sampledTrack[segment + 1]));
    for (let segment = 0; segment < points.length; segment++) nearestPath = Math.min(nearestPath, pointSegmentDistance(slots[i], points[segment], points[(segment + 1) % points.length]));
    if (Math.max(nearestSpline, nearestPath) + CAR_RADIUS + 0.25 >= halfWidth) return { safe: false, reason: `La position de grille ${i + 1} sort de la largeur praticable.` };
    for (let j = i + 1; j < slots.length; j++) {
      if (Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z) < CAR_RADIUS * 2 + 0.35) return { safe: false, reason: 'Les voitures de la grille se chevauchent.' };
    }
  }
  return { safe: true, reason: null };
}

export function findSafeGridStartIndex(points, width, { samples = 360 } = {}) {
  if (!Array.isArray(points) || points.length < 3 || !Number.isFinite(width)) return -1;
  const curve = new CatmullRomCurve3(points.map(({ x, z }) => new Vector3(x, 0, z)), true, 'centripetal');
  const sampledTrack = curve.getPoints(samples).map((point) => ({ x: point.x, z: point.z }));
  for (let index = 0; index < points.length; index++) {
    const ordered = [...points.slice(index), ...points.slice(0, index)];
    if (gridSafety(ordered, width, sampledTrack).safe) return index;
  }
  return -1;
}

export function validateCircuit(circuit, { samples = 360 } = {}) {
  const errors = [];
  const warnings = [];
  const points = circuit?.controlPoints;
  if (!Array.isArray(points)) { const errors = ['Liste de points manquante.']; return { valid: false, errors, warnings, issues: issueList(errors), metrics: null }; }
  if (points.length < MIN_POINTS || points.length > MAX_POINTS) errors.push(`Le circuit doit contenir de ${MIN_POINTS} à ${MAX_POINTS} points.`);
  if (!Number.isFinite(circuit.width) || circuit.width < MIN_WIDTH || circuit.width > MAX_WIDTH) errors.push(`La largeur doit être comprise entre ${MIN_WIDTH} et ${MAX_WIDTH} m.`);
  if (circuit.closed !== true) errors.push('La boucle doit être fermée avant validation.');
  if (!Number.isInteger(circuit.startLine?.controlPointIndex) || circuit.startLine.controlPointIndex < 0 || circuit.startLine.controlPointIndex >= points.length) errors.push('La ligne de départ référence un point inexistant.');
  const invalidPointIndex = points.findIndex((point) => !Number.isFinite(point?.x) || !Number.isFinite(point?.z) || Math.abs(point.x) > 5000 || Math.abs(point.z) > 5000);
  if (invalidPointIndex >= 0) errors.push(`Point de contrôle ${invalidPointIndex + 1} : coordonnées x/z invalides ou hors limites ±5000 m.`);
  if (errors.length) return { valid: false, errors, warnings, issues: issueList(errors), metrics: null };

  const lengths = points.map((point, index) => Math.hypot(points[(index + 1) % points.length].x - point.x, points[(index + 1) % points.length].z - point.z));
  const minSegment = Math.min(...lengths), maxSegment = Math.max(...lengths);
  const minSegmentIndex = lengths.indexOf(minSegment), maxSegmentIndex = lengths.indexOf(maxSegment);
  if (minSegment < MIN_SEGMENT) errors.push(`Segment dégénéré ou trop court (${minSegmentIndex + 1} → ${minSegmentIndex + 2 > points.length ? 1 : minSegmentIndex + 2}) : ${minSegment.toFixed(1)} m (minimum ${MIN_SEGMENT} m).`);
  if (maxSegment > MAX_SEGMENT) errors.push(`Segment discontinu (${maxSegmentIndex + 1} → ${maxSegmentIndex + 2 > points.length ? 1 : maxSegmentIndex + 2}) : ${maxSegment.toFixed(1)} m (maximum ${MAX_SEGMENT} m).`);

  const radii = points.map((point, index) => circumradius(points[(index - 1 + points.length) % points.length], point, points[(index + 1) % points.length]));
  let minRadius = Math.min(...radii);
  const maxTurn = points.reduce((maximum, point, index) => {
    const previous = points[(index - 1 + points.length) % points.length], next = points[(index + 1) % points.length];
    const incoming = new Vector3(point.x - previous.x, 0, point.z - previous.z).normalize();
    const outgoing = new Vector3(next.x - point.x, 0, next.z - point.z).normalize();
    return Math.max(maximum, incoming.angleTo(outgoing));
  }, 0);
  const maxTurnIndex = points.findIndex((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length], next = points[(index + 1) % points.length];
    return new Vector3(point.x - previous.x, 0, point.z - previous.z).normalize().angleTo(new Vector3(next.x - point.x, 0, next.z - point.z).normalize()) === maxTurn;
  });
  if (maxTurn > Math.PI * 0.82) errors.push(`Virage au point ${maxTurnIndex + 1} trop brutal : ${(maxTurn * 180 / Math.PI).toFixed(0)}° de changement de cap.`);

  const curve = new CatmullRomCurve3(points.map(({ x, z }) => new Vector3(x, 0, z)), true, 'centripetal');
  const sampled = curve.getPoints(samples);
  for (let index = 0; index < samples; index++) {
    minRadius = Math.min(minRadius, circumradius(sampled[(index - 1 + samples) % samples], sampled[index], sampled[(index + 1) % samples]));
  }
  if (minRadius < MIN_TURN_RADIUS) errors.push(`Courbure trop serrée : rayon estimé ${minRadius.toFixed(1)} m (minimum ${MIN_TURN_RADIUS} m).`);
  let length = 0;
  const sampledSegments = [];
  for (let index = 0; index < samples; index++) {
    const a = sampled[index], b = sampled[index + 1];
    const start = { x: a.x, z: a.z }, end = { x: b.x, z: b.z };
    length += Math.hypot(end.x - start.x, end.z - start.z);
    sampledSegments.push({ start, end });
  }
  const cumulative = cumulativeTrackDistances(sampled.map((point) => ({ x: point.x, z: point.z })));
  const midpointDistances = sampledSegments.map(({ start, end }, index) => cumulative[index] + Math.hypot(end.x - start.x, end.z - start.z) / 2);
  let intersection = null;
  let corridorOverlap = null;
  for (let i = 0; i < sampledSegments.length && !intersection && !corridorOverlap; i++) {
    for (let j = i + 1; j < sampledSegments.length; j++) {
      const gap = Math.min(j - i, samples - (j - i));
      if (gap <= 3) continue;
      const a = sampledSegments[i], b = sampledSegments[j];
      const sharedPoint = [a.start, a.end].some((point) => [b.start, b.end].some((other) => Math.hypot(point.x - other.x, point.z - other.z) < 1e-5));
      if (sharedPoint || segmentsIntersect(a.start, a.end, b.start, b.end)) { intersection = [i, j]; break; }
      const routeDistance = cyclicArcDistance(midpointDistances[i], midpointDistances[j], length);
      if (routeDistance > circuit.width * 1.75 && segmentDistance(a.start, a.end, b.start, b.end) < circuit.width + 1) { corridorOverlap = [i, j]; break; }
    }
  }
  if (intersection) errors.push(`La ligne centrale se croise entre les échantillons ${intersection[0] + 1} et ${intersection[1] + 1}.`);
  if (corridorOverlap) errors.push(`Les segments ${corridorOverlap[0] + 1} et ${corridorOverlap[1] + 1} sont trop proches : les bandes de piste se chevaucheraient.`);

  const startIndex = circuit.startLine.controlPointIndex;
  const startOrder = [...points.slice(startIndex), ...points.slice(0, startIndex)];
  const grid = gridSafety(startOrder, circuit.width, sampled.map((point) => ({ x: point.x, z: point.z })));
  if (!grid.safe) errors.push(`Grille dangereuse : ${grid.reason}`);
  const gridPoints = points.length;
  if (minRadius < 12) warnings.push('Virages serrés : la vitesse devra être adaptée dans les simulateurs.');
  const estimatedTurns = radii.reduce((count, radius, index) => {
    const angle = maxTurnIndex >= 0 ? (() => {
      const point = points[index], previous = points[(index - 1 + points.length) % points.length], next = points[(index + 1) % points.length];
      return new Vector3(point.x - previous.x, 0, point.z - previous.z).normalize().angleTo(new Vector3(next.x - point.x, 0, next.z - point.z).normalize());
    })() : 0;
    const before = radii[(index - 1 + radii.length) % radii.length], after = radii[(index + 1) % radii.length];
    return angle >= 0.2 && radius <= before && radius < after ? count + 1 : count;
  }, 0);
  const issues = issueList(errors, warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues,
    metrics: { controlPoints: gridPoints, centerlineLength: length, estimatedTurns, minSegmentLength: minSegment, maxSegmentLength: maxSegment, minimumTurnRadius: minRadius, maximumTurnAngleRadians: maxTurn, gridSlots: 6, gridSafe: grid.safe },
  };
}
