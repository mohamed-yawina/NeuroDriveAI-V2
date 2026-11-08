import { createCircuit, validateCircuitFormat } from './CircuitFormat.js';
import { findSafeGridStartIndex } from './CircuitValidator.js';

const GENERATOR_VERSION = 'radial-v1';
const PRESETS = {
  easy: { count: 18, radiusX: 110, radiusZ: 76, wave: 0.025, width: 19 },
  medium: { count: 20, radiusX: 98, radiusZ: 65, wave: 0.075, width: 19 },
  hard: { count: 24, radiusX: 94, radiusZ: 59, wave: 0.12, width: 18.5 },
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCircuit(seed = 2026, difficulty = 'medium') {
  const preset = PRESETS[difficulty];
  if (!preset) throw new RangeError(`Difficulté inconnue : ${difficulty}.`);
  const numericSeed = Number(seed);
  if (!Number.isSafeInteger(numericSeed) || numericSeed < 0 || numericSeed > 0xffffffff) throw new RangeError('La graine doit être un entier non signé sur 32 bits.');
  const random = seededRandom(numericSeed);
  const phases = Array.from({ length: 4 }, () => random() * Math.PI * 2);
  const controlPoints = Array.from({ length: preset.count }, (_, index) => {
    const angle = index / preset.count * Math.PI * 2;
    const modulation = 1 + preset.wave * (0.54 * Math.sin(3 * angle + phases[0]) + 0.29 * Math.sin(4 * angle + phases[1]) + 0.17 * Math.cos(5 * angle + phases[2]));
    const ellipse = 1 + 0.035 * Math.sin(2 * angle + phases[3]);
    return { x: Math.round(preset.radiusX * modulation * ellipse * Math.cos(angle) * 100) / 100, z: Math.round(preset.radiusZ * modulation * Math.sin(angle) * 100) / 100 };
  });
  const startIndex = findSafeGridStartIndex(controlPoints, preset.width);
  if (startIndex < 0) throw new Error('Le générateur n’a trouvé aucune ligne de départ avec une grille sûre.');
  const circuit = createCircuit({
    id: `generated-${numericSeed}-${difficulty}`,
    name: `Circuit ${difficulty} · ${numericSeed}`,
    controlPoints,
    width: preset.width,
    startIndex,
    metadata: { generator: GENERATOR_VERSION, seed: numericSeed, difficulty },
  });
  const report = validateCircuitFormat(circuit);
  if (!report.valid) throw new Error(`Le générateur a produit un circuit invalide : ${report.errors.join(' ')}`);
  return circuit;
}

export const CIRCUIT_DIFFICULTIES = Object.freeze(Object.keys(PRESETS));
