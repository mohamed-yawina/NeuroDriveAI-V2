const DRIVE_STATES = new Set(['racing']);

/** Converts held keyboard keys into arcade input, blocking stale input outside drive states. */
export function readRaceInput(keys, { paused = false, raceState = 'racing', ersDeploy = false } = {}) {
  if (paused || !DRIVE_STATES.has(raceState)) return { throttle: 0, brake: 0, steer: 0, ersDeploy: false };
  const throttle = Number(keys.has('ArrowUp') || keys.has('KeyW')) - Number(keys.has('ArrowDown') || keys.has('KeyS'));
  return {
    throttle,
    brake: Number(keys.has('ArrowDown') || keys.has('KeyS')),
    steer: Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA')),
    ersDeploy: Boolean(ersDeploy || keys.has('KeyV')),
  };
}

/** Drops held keys after focus loss and notifies the session when its tab is hidden. */
export function bindRaceFocusSafety(windowRef, documentRef, keys, onHidden, { signal } = {}) {
  windowRef.addEventListener('blur', () => keys.clear(), { signal });
  documentRef.addEventListener('visibilitychange', () => {
    if (!documentRef.hidden) return;
    keys.clear();
    onHidden?.();
  }, { signal });
}
