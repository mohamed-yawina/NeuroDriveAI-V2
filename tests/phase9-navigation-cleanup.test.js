import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionNavigation } from '../src/ui/SessionNavigation.js';
import { releaseSceneResources, SceneManager } from '../src/scene/SceneManager.js';
import { SimulationSession } from '../src/simulation.js';
import { SteeringAcademy } from '../src/academy/SteeringAcademy.js';

afterEach(() => vi.unstubAllGlobals());

describe('Phase 9 session navigation', () => {
  it('supports repeated menu → simulation → menu cycles and disposes each session once', async () => {
    const states = [];
    const navigation = new SessionNavigation({ onStateChange: (state) => states.push(state) });
    const sessions = [];
    for (let index = 0; index < 3; index += 1) {
      const session = { dispose: vi.fn() };
      sessions.push(session);
      expect(await navigation.launch(async () => session)).toBe(session);
      await navigation.returnToMenu();
      await navigation.returnToMenu();
    }
    expect(sessions.every((session) => session.dispose.mock.calls.length === 1)).toBe(true);
    expect(navigation.state).toBe('menu');
    expect(states).toEqual(['loading', 'simulation', 'closing', 'menu', 'loading', 'simulation', 'closing', 'menu', 'loading', 'simulation', 'closing', 'menu']);
  });

  it('restores the menu if session creation fails and prevents duplicate launches', async () => {
    const navigation = new SessionNavigation();
    const create = vi.fn(async () => ({ dispose: vi.fn() }));
    const pending = navigation.launch(create);
    expect(await navigation.launch(create)).toBeNull();
    await pending;
    expect(create).toHaveBeenCalledTimes(1);
    await navigation.returnToMenu();
    await expect(navigation.launch(async () => { throw new Error('renderer unavailable'); })).rejects.toThrow('renderer unavailable');
    expect(navigation.state).toBe('menu');
  });

  it('cancels the animation frame, listeners, lab workers, renderer and canvas on session disposal', () => {
    const cancelFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const session = Object.create(SimulationSession.prototype);
    Object.assign(session, {
      disposed: false,
      frameId: 17,
      listeners: new AbortController(),
      aiLab: { dispose: vi.fn() },
      scene: { dispose: vi.fn() },
      hud: { setPaused: vi.fn() },
      returnButton: { remove: vi.fn() },
    });
    session.dispose();
    session.dispose();
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(17);
    expect(session.aiLab.dispose).toHaveBeenCalledTimes(1);
    expect(session.scene.dispose).toHaveBeenCalledTimes(1);
    expect(session.returnButton.remove).toHaveBeenCalledTimes(1);
    expect(session.listeners.signal.aborted).toBe(true);
  });

  it('disposes shared Three.js resources only once and releases the scene renderer', () => {
    const texture = { isTexture: true, dispose: vi.fn() };
    const material = { map: texture, dispose: vi.fn() };
    const geometry = { dispose: vi.fn() };
    const root = { traverse: (visit) => [{ geometry, material }, { geometry, material: [material] }].forEach(visit) };
    releaseSceneResources(root);
    expect(geometry.dispose).toHaveBeenCalledTimes(1);
    expect(material.dispose).toHaveBeenCalledTimes(1);
    expect(texture.dispose).toHaveBeenCalledTimes(1);

    const clear = vi.fn();
    const disconnect = vi.fn();
    const remove = vi.fn();
    const disposeRenderer = vi.fn();
    const disposeLists = vi.fn();
    const scene = Object.create(SceneManager.prototype);
    Object.assign(scene, {
      disposed: false,
      scene: { traverse: vi.fn(), clear },
      resizeObserver: { disconnect },
      renderer: { renderLists: { dispose: disposeLists }, dispose: disposeRenderer, domElement: { remove } },
    });
    scene.dispose();
    scene.dispose();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(disposeRenderer).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('does not schedule another animation after disposal', () => {
    const requestFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    const session = Object.create(SimulationSession.prototype);
    session.disposed = true;
    session.animate(100);
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('returns Steering Academy through the shared menu navigation and cleans its session resources', async () => {
    const cancelFrame = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    const states = [];
    const navigation = new SessionNavigation({ onStateChange: (state) => states.push(state) });
    const academy = Object.create(SteeringAcademy.prototype);
    const abort = new AbortController();
    const disconnect = vi.fn(), removeRoot = vi.fn(), removeMode = vi.fn();
    Object.assign(academy, {
      disposed: false, frameId: 29, listeners: abort,
      resizeObserver: { disconnect }, root: { remove: removeRoot },
      app: { classList: { remove: removeMode } },
      onReturn: () => navigation.returnToMenu(),
    });
    await navigation.launch(async () => academy);
    academy.returnToMenu();
    await Promise.resolve();
    expect(navigation.state).toBe('menu');
    expect(states).toEqual(['loading', 'simulation', 'closing', 'menu']);
    expect(cancelFrame).toHaveBeenCalledWith(29);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(removeRoot).toHaveBeenCalledTimes(1);
    expect(removeMode).toHaveBeenCalledWith('academy-active');
    expect(abort.signal.aborted).toBe(true);
  });
});
