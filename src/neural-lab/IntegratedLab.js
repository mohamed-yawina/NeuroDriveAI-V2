import { RaceController } from '../game/RaceController.js';
import { HistoricalBrainAdapter } from './ExperimentProtocol.js';

const CONFIGS = new Set(['A', 'B', 'C']);
export const HISTORICAL_TRAINING_TRACKS = Object.freeze(['original', 'technical', 'fast-oval']);

/** Repeat the selected controllers into the game's six-car grid, with unique car identities. */
export function createSixCarLabRoster(drivers, carCount = 6) {
  if (!Array.isArray(drivers) || drivers.length < 2 || drivers.length > carCount || drivers.some((driver) => typeof driver?.createController !== 'function')) {
    throw new TypeError(`Select between 2 and ${carCount} compatible lab controllers.`);
  }
  const occurrences = new Map();
  return Array.from({ length: carCount }, (_, slot) => {
    const driver = drivers[slot % drivers.length];
    const occurrence = (occurrences.get(driver.id) ?? 0) + 1;
    occurrences.set(driver.id, occurrence);
    return {
      ...driver,
      id: `${driver.id}-slot-${slot + 1}`,
      name: occurrence === 1 ? driver.name : `${driver.name} · ${occurrence}`,
    };
  });
}

/** Labels come from the Phase 8 training protocol; unknown circuits remain unclassified. */
export function classifyIntegratedTrack(track) {
  if (track?.userCircuit) return { category: 'user-circuit', label: 'Circuit utilisateur · évaluation arcade uniquement', historicalProtocolCompatible: false };
  if (track?.id === 'phase8-chicane-test') return { category: 'held-out-test', label: 'Test inédit Phase 8 · ne pas utiliser pour sélectionner un modèle', historicalProtocolCompatible: false };
  if (HISTORICAL_TRAINING_TRACKS.includes(track?.id)) return { category: 'training-and-validation', label: 'Circuit utilisé pour entraînement et validation Phase 8', historicalProtocolCompatible: true };
  return { category: 'unclassified', label: 'Circuit non classé dans les métadonnées historiques', historicalProtocolCompatible: false };
}

/** Compose real frozen historical networks with the arcade Steering reference. */
export function createIntegratedNeuralDrivers(configurations, modelEntries) {
  if (!Array.isArray(configurations) || !configurations.length || configurations.some((id) => !CONFIGS.has(id)) || new Set(configurations).size !== configurations.length) {
    throw new TypeError('Select one or more unique historical configurations A, B, or C.');
  }
  const drivers = [{ id: 'steering', name: 'Steering AI', provenance: 'RaceController · référence arcade', architecture: null, createController: (track, { car } = {}) => new RaceController(track, { car }) }];
  for (const configuration of configurations) {
    const entry = modelEntries.get(configuration);
    if (!entry?.network || entry.network.architecture?.join(',') !== '7,16,16,2' || entry.provenance?.configuration !== configuration) {
      throw new TypeError(`Historical model ${configuration} is missing, incompatible, or has mismatched provenance.`);
    }
    drivers.push({
      id: `neural-${configuration.toLowerCase()}`, name: `Neural ${configuration}`,
      provenance: `Modèle Phase 8 · graine ${entry.provenance.seed} · VehicleDynamics évalué avec GameVehicleDynamics arcade`,
      architecture: [...entry.network.architecture], source: entry.provenance.source,
      createController: (track, { dynamics } = {}) => new HistoricalBrainAdapter(entry.network, track, { mass: dynamics?.mass ?? 1.25 }),
    });
  }
  return drivers;
}
