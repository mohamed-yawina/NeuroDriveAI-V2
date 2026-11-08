import { Vector3 } from 'three';
import { createTrackBoundaries, sampleClosedTrackPath } from '../scene/trackGeometry.js';
import { validateCircuit } from './CircuitValidator.js';

export const CIRCUIT_SCHEMA = 'neurodriveai.circuit';
export const CIRCUIT_VERSION = 1;

export class CircuitFormatError extends Error {
  constructor(message, issues = []) { super(message); this.name = 'CircuitFormatError'; this.issues = issues; }
}

export function validateCircuitFormat(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) { const malformed = ['Le document doit être un objet JSON.']; return { valid: false, errors: malformed, warnings: [], issues: malformed.map((message) => ({ severity: 'error', message })) }; }
  if (value.schema !== CIRCUIT_SCHEMA) errors.push(`Schéma incompatible : attendu « ${CIRCUIT_SCHEMA} ».`);
  if (value.version !== CIRCUIT_VERSION) errors.push(`Version incompatible : version ${CIRCUIT_VERSION} attendue.`);
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value.id)) errors.push('Identifiant de circuit invalide.');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 72) errors.push('Nom manquant ou trop long (72 caractères maximum).');
  if (typeof value.width !== 'number' || !Number.isFinite(value.width) || value.width <= 0) errors.push('La largeur de piste doit être un nombre positif.');
  if (value.closed !== true) errors.push('Le circuit doit former une boucle fermée.');
  if (!Array.isArray(value.controlPoints)) errors.push('Les points de contrôle doivent être un tableau.');
  if (!value.startLine || !Number.isInteger(value.startLine.controlPointIndex)) errors.push('La ligne de départ doit référencer un point de contrôle.');
  if (value.startLine?.direction !== 'forward') errors.push('La ligne de départ v1 doit utiliser la direction « forward ».');
  if (errors.length) return { valid: false, errors, warnings: [], issues: errors.map((message) => ({ severity: 'error', message })) };
  const geometry = validateCircuit(value);
  return { ...geometry, valid: geometry.valid, errors: [...errors, ...geometry.errors] };
}

export function parseCircuitJSON(text) {
  let value;
  try { value = JSON.parse(text); }
  catch (error) { throw new CircuitFormatError(`JSON illisible : ${error.message}`); }
  const report = validateCircuitFormat(value);
  if (!report.valid) throw new CircuitFormatError(`Circuit refusé : ${report.errors[0]}`, report.errors);
  return { circuit: structuredClone(value), report };
}

export function createCircuit({ id, name, controlPoints, width = 16.4, startIndex = 0, metadata = {} }) {
  const canonical = (value) => { const rounded = Number(value); return Object.is(rounded, -0) ? 0 : rounded; };
  return {
    schema: CIRCUIT_SCHEMA,
    version: CIRCUIT_VERSION,
    id,
    name,
    controlPoints: controlPoints.map(({ x, z }) => ({ x: canonical(x), z: canonical(z) })),
    width: Number(width),
    closed: true,
    startLine: { controlPointIndex: startIndex, direction: 'forward' },
    metadata: { source: 'circuit-studio', ...metadata },
  };
}

export function circuitToTrackDefinition(circuit) {
  const report = validateCircuitFormat(circuit);
  if (!report.valid) throw new CircuitFormatError(`Circuit géométriquement invalide : ${report.errors[0]}`, report.errors);
  const points = circuit.controlPoints;
  const startIndex = circuit.startLine.controlPointIndex;
  const rotated = [...points.slice(startIndex), ...points.slice(0, startIndex)];
  const controlVectors = rotated.map(({ x, z }) => new Vector3(x, 0.08, z));
  const waypoints = sampleClosedTrackPath(controlVectors);
  const halfWidth = circuit.width / 2;
  return {
    schema: circuit.schema,
    version: circuit.version,
    id: circuit.id,
    label: circuit.name,
    name: circuit.name,
    waypoints,
    controlPoints: controlVectors,
    closed: true,
    startLine: { controlPointIndex: 0, direction: 'forward' },
    boundaries: createTrackBoundaries(waypoints, { halfWidth }),
    width: circuit.width,
    halfWidth,
    startLineIndex: 0,
    userCircuit: true,
    metadata: structuredClone(circuit.metadata ?? {}),
  };
}
