import { generateCircuit } from './CircuitGenerator.js';
import { validateCircuitFormat } from './CircuitFormat.js';
import { CatmullRomCurve3, Vector3 } from 'three';

const TEMPLATES = Object.freeze([
  { id: 'oval', title: 'Ovale', level: 'Debutant', seed: 2026, difficulty: 'easy', transform: (point) => ({ ...point }) },
  { id: 's-flow', title: 'Circuit en S', level: 'Intermediaire', seed: 3184, difficulty: 'medium', transform: (point) => ({ x: point.x + 24 * Math.sin(point.z / 80), z: point.z }) },
  { id: 'technical', title: 'Circuit technique', level: 'Avance', seed: 8842, difficulty: 'hard', transform: (point) => ({ ...point }) },
  { id: 'speed', title: 'Circuit vitesse', level: 'Intermediaire', seed: 6110, difficulty: 'easy', transform: (point) => ({ x: point.x * 1.35, z: point.z * 0.9 }) },
  { id: 'grand-prix', title: 'Grand Prix', level: 'Avance', seed: 9150, difficulty: 'medium', transform: (point) => ({ x: point.x, z: point.z + 12 * Math.sin(point.x / 60) }) },
]);

export const CIRCUIT_TEMPLATES = TEMPLATES;

export function createCircuitTemplate(templateId) {
  const template = TEMPLATES.find(({ id }) => id === templateId);
  if (!template) throw new RangeError(`Modele de circuit inconnu: ${templateId}`);
  const source = generateCircuit(template.seed, template.difficulty);
  const circuit = {
    ...source,
    id: `template-${template.id}`,
    name: template.title,
    controlPoints: source.controlPoints.map(template.transform),
    metadata: { ...source.metadata, templateId: template.id, templateTitle: template.title },
  };
  const report = validateCircuitFormat(circuit);
  if (!report.valid) throw new Error(`Le modele ${template.title} n'est pas valide: ${report.errors[0]}`);
  return circuit;
}

export function circuitPreviewSvg(circuit) {
  const points = circuit.controlPoints;
  if (points.length < 2) return '<svg viewBox="0 0 160 96" role="img" aria-label="Circuit vide"><rect width="160" height="96" fill="#12151a"/><path d="M20 48h120" stroke="#555b63" stroke-dasharray="4 4"/><text x="80" y="68" fill="#aeb2b9" text-anchor="middle" font-size="8">Dessinez le trace</text></svg>';
  const curve = new CatmullRomCurve3(points.map(({ x, z }) => new Vector3(x, 0, z)), circuit.closed, 'centripetal');
  const sampled = curve.getPoints(Math.max(160, points.length * 16));
  const minX = Math.min(...sampled.map(({ x }) => x)), maxX = Math.max(...sampled.map(({ x }) => x));
  const minZ = Math.min(...sampled.map(({ z }) => z)), maxZ = Math.max(...sampled.map(({ z }) => z));
  const scale = Math.min(132 / Math.max(1, maxX - minX), 68 / Math.max(1, maxZ - minZ));
  const mapped = sampled.map(({ x, z }) => ({ x: 80 + (x - (minX + maxX) / 2) * scale, y: 48 - (z - (minZ + maxZ) / 2) * scale }));
  const start = points[circuit.startLine.controlPointIndex] ?? points[0];
  const startX = 80 + (start.x - (minX + maxX) / 2) * scale, startY = 48 - (start.z - (minZ + maxZ) / 2) * scale;
  const line = mapped.map(({ x, y }, index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const d = circuit.closed ? `${line} Z` : line;
  return `<svg viewBox="0 0 160 96" role="img" aria-label="Apercu reel du circuit ${String(circuit.name).replace(/[&<>"']/g, '')}"><rect width="160" height="96" fill="#12151a"/><path d="${d}" fill="none" stroke="#59616b" stroke-width="13" stroke-linejoin="round" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#f5f5f5" stroke-width="1" stroke-dasharray="3 3" opacity=".7"/><circle cx="${startX}" cy="${startY}" r="3" fill="#e10600"/></svg>`;
}
