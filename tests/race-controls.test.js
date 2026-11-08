import { describe, expect, it, vi } from 'vitest';
import { bindRaceFocusSafety, readRaceInput } from '../src/game/RaceControls.js';

describe('quick race keyboard input safety', () => {
  it('maps steering and throttle only after the formation lap and race start', () => {
    const keys = new Set(['ArrowUp', 'KeyD', 'KeyV']);
    expect(readRaceInput(keys, { raceState: 'racing' })).toEqual({ throttle: 1, brake: 0, steer: 1, ersDeploy: true });
    expect(readRaceInput(keys, { raceState: 'formation' })).toEqual({ throttle: 0, brake: 0, steer: 0, ersDeploy: false });
    expect(readRaceInput(keys, { raceState: 'countdown' })).toEqual({ throttle: 0, brake: 0, steer: 0, ersDeploy: false });
  });

  it('neutralizes held controls during pause and outside an active race', () => {
    const keys = new Set(['ArrowUp', 'ArrowLeft', 'KeyV']);
    expect(readRaceInput(keys, { paused: true, raceState: 'racing', ersDeploy: true })).toEqual({ throttle: 0, brake: 0, steer: 0, ersDeploy: false });
    expect(readRaceInput(keys, { raceState: 'finished' })).toEqual({ throttle: 0, brake: 0, steer: 0, ersDeploy: false });
    expect(readRaceInput(keys, { paused: false, raceState: 'racing' })).toEqual({ throttle: 1, brake: 0, steer: -1, ersDeploy: true });
  });

  it('clears held keys on focus loss and pauses once when the tab is hidden', () => {
    const windowRef = new EventTarget();
    const documentRef = new EventTarget();
    documentRef.hidden = false;
    const keys = new Set(['ArrowUp']);
    const onHidden = vi.fn();
    const listeners = new AbortController();
    bindRaceFocusSafety(windowRef, documentRef, keys, onHidden, { signal: listeners.signal });
    windowRef.dispatchEvent(new Event('blur'));
    expect(keys.size).toBe(0);
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(onHidden).not.toHaveBeenCalled();
    keys.add('ArrowUp'); documentRef.hidden = true;
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(keys.size).toBe(0);
    expect(onHidden).toHaveBeenCalledTimes(1);
    listeners.abort(); keys.add('ArrowUp');
    documentRef.dispatchEvent(new Event('visibilitychange'));
    expect(keys.has('ArrowUp')).toBe(true);
    expect(onHidden).toHaveBeenCalledTimes(1);
  });
});
