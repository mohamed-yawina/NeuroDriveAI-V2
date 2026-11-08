import { afterEach, describe, expect, it, vi } from 'vitest';
import { RaceSession } from '../src/game/RaceSession.js';
import { SessionNavigation } from '../src/ui/SessionNavigation.js';

afterEach(() => vi.unstubAllGlobals());

function stubRaceSession(navigation) {
  const session = Object.create(RaceSession.prototype);
  Object.assign(session, {
    disposed: false,
    frameId: 41,
    listeners: new AbortController(),
    keys: new Set(['ArrowUp']),
    scene: { dispose: vi.fn() },
    ui: { remove: vi.fn() },
    app: { classList: { remove: vi.fn() } },
    onReturn: () => navigation.returnToMenu(),
  });
  return session;
}

describe('Phase 11 race session navigation and cleanup', () => {
  it('returns through the shared menu and fully cleans each replay session', async () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const navigation = new SessionNavigation();
    const sessions = [];
    for (let index = 0; index < 3; index++) {
      const session = stubRaceSession(navigation);
      sessions.push(session);
      await navigation.launch(async () => session);
      await session.returnToMenu();
      expect(navigation.state).toBe('menu');
    }
    expect(cancelAnimationFrame.mock.calls.map(([id]) => id)).toEqual([41, 41, 41]);
    for (const session of sessions) {
      expect(session.disposed).toBe(true);
      expect(session.listeners.signal.aborted).toBe(true);
      expect(session.keys.size).toBe(0);
      expect(session.scene.dispose).toHaveBeenCalledTimes(1);
      expect(session.ui.remove).toHaveBeenCalledTimes(1);
      expect(session.app.classList.remove).toHaveBeenCalledWith('race-session');
    }
  });

  it('does not schedule a frame after the race session is disposed', () => {
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    const session = Object.create(RaceSession.prototype);
    session.disposed = true;
    session.animate(100);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('cycles full, minimal and hidden HUD modes while keeping a restore control', () => {
    const session = Object.create(RaceSession.prototype);
    const button = { textContent: '', title: '' };
    session.hudMode = 'full';
    session.ui = { dataset: {}, querySelector: () => button };
    session.cycleHudMode();
    expect(session.ui.dataset.hudMode).toBe('minimal');
    expect(button.textContent).toBe('MIN');
    session.cycleHudMode();
    expect(session.ui.dataset.hudMode).toBe('hidden');
    expect(button.textContent).toBe('OFF');
    session.cycleHudMode();
    expect(session.ui.dataset.hudMode).toBe('full');
    expect(button.textContent).toBe('HUD');
  });

  it('temporarily looks behind with B and restores the selected camera afterward', () => {
    const session = Object.create(RaceSession.prototype);
    const label = { textContent: '' };
    session.rearViewPreviousMode = null;
    session.cameras = { mode: 'cockpit', setMode(mode) { this.mode = mode; } };
    session.ui = { querySelector: () => label };
    session.beginRearView();
    expect(session.cameras.mode).toBe('rear');
    expect(label.textContent).toContain('ARRIÈRE');
    session.endRearView();
    expect(session.cameras.mode).toBe('cockpit');
    expect(label.textContent).toBe('COCKPIT');
    expect(session.rearViewPreviousMode).toBeNull();
  });
});
