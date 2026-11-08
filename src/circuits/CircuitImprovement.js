import { validateCircuitFormat } from './CircuitFormat.js';

/** Return a conservative, validated proposal without mutating the user's circuit. */
export function proposeCircuitImprovement(circuit) {
  if (!circuit || !Array.isArray(circuit.controlPoints) || circuit.controlPoints.length < 10) {
    return { candidate: null, reason: 'Ajoutez au moins 10 points avant de demander une correction.' };
  }

  const strengths = [0.04, 0.08, 0.12, 0.18];
  for (const strength of strengths) {
    const points = circuit.controlPoints.map((point, index, all) => {
      const previous = all[(index - 1 + all.length) % all.length];
      const next = all[(index + 1) % all.length];
      const neighborMidpoint = { x: (previous.x + next.x) / 2, z: (previous.z + next.z) / 2 };
      return {
        x: point.x + (neighborMidpoint.x - point.x) * strength,
        z: point.z + (neighborMidpoint.z - point.z) * strength,
      };
    });
    const candidate = { ...structuredClone(circuit), controlPoints: points, closed: true };
    candidate.metadata = { ...candidate.metadata, improvement: { method: 'conservative-closed-loop-smoothing', strength } };
    const report = validateCircuitFormat(candidate);
    if (report.valid) return { candidate, report, strength };
  }

  return { candidate: null, reason: 'Aucune correction automatique sûre ne rend ce circuit jouable. Déplacez les points indiqués puis réessayez.' };
}
