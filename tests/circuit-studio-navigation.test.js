import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionNavigation } from '../src/ui/SessionNavigation.js';
import { CircuitStudio } from '../src/circuits/CircuitStudio.js';

afterEach(() => vi.unstubAllGlobals());

describe('Circuit Studio session lifecycle', () => {
  it('disconnects its resize observer, aborts listeners and returns through shared navigation', async () => {
    const navigation = new SessionNavigation();
    const studio = Object.create(CircuitStudio.prototype);
    const abort = new AbortController(), disconnect = vi.fn(), removeRoot = vi.fn(), removeMode = vi.fn();
    Object.assign(studio, {
      disposed: false, listeners: abort,
      resizeObserver: { disconnect },
      root: { remove: removeRoot },
      app: { classList: { remove: removeMode } },
      onReturn: () => navigation.returnToMenu(),
    });
    await navigation.launch(async () => studio);
    await studio.onReturn();
    expect(navigation.state).toBe('menu');
    expect(abort.signal.aborted).toBe(true);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeRoot).toHaveBeenCalledOnce();
    expect(removeMode).toHaveBeenCalledWith('circuit-studio-active');
  });
});
