import { launchMenuRace, getRaceLaunchOptions } from './MenuLaunchOptions.js';
import { createGeneralizationTracks } from '../ai/training/GeneralizationTracks.js';
import { createBalancedHeats, loadHistoricalBrain } from '../neural-lab/ExperimentProtocol.js';
import { classifyIntegratedTrack, createIntegratedNeuralDrivers, createSixCarLabRoster } from '../neural-lab/IntegratedLab.js';

export const INTEGRATED_LAB_ENTRIES = Object.freeze(['steering-lab', 'neural-lab']);

export function createIntegratedLabEntryActions({ steering, neural }) {
  if (typeof steering !== 'function' || typeof neural !== 'function') throw new TypeError('Both integrated lab launchers are required.');
  return { 'steering-lab': steering, 'neural-lab': neural };
}

export function launchSteeringLab(navigation, { documentRef, livery, onReturn, professorMode = false, createSession }) {
  if (typeof createSession !== 'function') throw new TypeError('A RaceSession factory is required.');
  return launchMenuRace(navigation, {
    documentRef, livery, onReturn,
    createSession: (options) => createSession({
      ...options,
      laboratory: { type: 'steering', trackLabel: options.trackId },
      professorMode,
      returnLabel: 'Retour aux Laboratoires IA',
      onReturn,
    }),
  });
}

export async function launchNeuralLab(navigation, {
  documentRef, livery, onReturn, configurations, seed = 13013, trackDefinition = null,
  tutorial = false, professorMode = false, createSession,
  trackFactory = createGeneralizationTracks,
  modelLoader = loadHistoricalBrain,
} = {}) {
  if (typeof createSession !== 'function') throw new TypeError('A RaceSession factory is required.');
  if (!Array.isArray(configurations) || configurations.length === 0) throw new TypeError('Select at least one historical model A, B, or C.');
  const options = getRaceLaunchOptions(documentRef, livery);
  const tracks = trackFactory();
  const track = trackDefinition ?? tracks.find((entry) => entry.id === options.trackId) ?? tracks[0];
  if (!track) throw new TypeError('No compatible race circuit is available.');
  const validSeed = Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed >>> 0 : 13013;
  const classification = classifyIntegratedTrack(track);

  return navigation.launch(async () => {
    const modelEntries = new Map();
    for (const configuration of configurations) modelEntries.set(configuration, await modelLoader(configuration));
    const participants = createIntegratedNeuralDrivers(configurations, modelEntries);
    const drivers = createSixCarLabRoster(participants);
    const heat = createBalancedHeats(drivers.map((driver) => driver.id), { seed: validSeed, rotations: drivers.length })[validSeed % drivers.length];
    const orderedDrivers = heat.grid.sort((a, b) => a.slot - b.slot).map(({ driver }) => drivers.find((entry) => entry.id === driver));
    const modelProvenance = participants.map(({ name, provenance, architecture }) => ({ name, provenance, architecture }));
    return createSession({
      ...options, trackDefinition: track, raceSeed: validSeed, driverAssignments: orderedDrivers,
      tutorial: tutorial || false, professorMode,
      laboratory: {
        type: 'neural', trackLabel: track.label, trackCategory: classification.category,
        methodNote: `${classification.label}. Adaptateur arcade : entrées [5 distances normalisées, vitesse/maxSpeed, erreur de cap/π], sorties [direction, commande longitudinale signée] converties en force. GameVehicleDynamics · 60 Hz · vitesse maximale configurée par voiture 56 m/s (plafond dynamique 58 m/s) · maxForce 28 · masse 1,25 · seed ${validSeed}. Le protocole Phase 8 utilisait 30 Hz; cette course est une démonstration arcade, pas une validation historique.`,
        models: modelProvenance,
      },
      returnLabel: 'Retour aux Laboratoires IA', onReturn,
    });
  });
}
