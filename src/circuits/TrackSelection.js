import { circuitToTrackDefinition } from './CircuitFormat.js';

export const USER_TRACK_SELECTION_PREFIX = 'user:';

/** Resolve a menu selection without silently substituting a different track. */
export function resolveTrackSelection(selection, { library, builtInTracks = [] } = {}) {
  const value = String(selection ?? '');
  if (value.startsWith(USER_TRACK_SELECTION_PREFIX)) {
    if (!library || typeof library.load !== 'function') throw new TypeError('La bibliothèque de circuits utilisateur est indisponible.');
    const id = value.slice(USER_TRACK_SELECTION_PREFIX.length);
    if (!id) throw new RangeError('Identifiant de circuit utilisateur manquant.');
    return circuitToTrackDefinition(library.load(id));
  }
  const track = builtInTracks.find((entry) => entry.id === value);
  if (!track) throw new RangeError(`Circuit « ${value || '(vide)'} » introuvable; aucun circuit de remplacement n’a été choisi.`);
  return track;
}
