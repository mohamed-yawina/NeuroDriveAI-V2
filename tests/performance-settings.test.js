import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_SETTINGS, getRenderProfile, readGameSettings, writeGameSettings } from '../src/settings/GameSettings.js';
import { FrameRateMonitor } from '../src/scene/FrameRateMonitor.js';
import { getPerformanceOverlayContainer, SceneManager } from '../src/scene/SceneManager.js';
import { MenuShowroom } from '../src/scene/MenuShowroom.js';

function memoryStorage(seed = null) {
  const values = new Map(seed ? [['neurodrive-visual-settings', JSON.stringify(seed)]] : []);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

afterEach(() => vi.unstubAllGlobals());

describe('performance settings and monitor', () => {
  it('persists profiles and FPS preference while sanitizing invalid settings', () => {
    const storage = memoryStorage();
    expect(readGameSettings(storage).showFps).toBe(false);
    const low = writeGameSettings({ quality: 'low', scenery: 'low', showFps: true }, storage);
    expect(low).toMatchObject({ quality: 'low', scenery: 'low', showFps: true });
    expect(getRenderProfile(readGameSettings(storage))).toMatchObject({ quality: 'low', pixelRatio: 1, shadowMapSize: 512, sceneryDensity: .45, effectsEnabled: false, showFps: true });
    const invalid = writeGameSettings({ quality: 'ultra', scenery: 'extreme', cameraMode: 'invalid', shadows: 'false', effects: 0, showFps: 'true', orbitSensitivity: 999, zoomSensitivity: NaN }, storage);
    expect(invalid).toMatchObject({ quality: DEFAULT_GAME_SETTINGS.quality, scenery: DEFAULT_GAME_SETTINGS.scenery, cameraMode: DEFAULT_GAME_SETTINGS.cameraMode, orbitSensitivity: .02, zoomSensitivity: DEFAULT_GAME_SETTINGS.zoomSensitivity });
    expect(readGameSettings(storage)).toEqual(invalid);
    expect(invalid).toMatchObject({ shadows: false, effects: false, showFps: false });
    const restoredMedium = writeGameSettings({ ...low, quality: 'medium' }, storage);
    expect(restoredMedium.effects).toBe(true);
    expect(getRenderProfile(restoredMedium).effectsEnabled).toBe(true);
  });

  it('calculates a bounded sliding RAF interval average at a throttled display rate', () => {
    const element = { hidden: false, textContent: '', setAttribute: vi.fn(), remove: vi.fn() };
    const container = { appendChild: vi.fn() };
    vi.stubGlobal('document', { createElement: vi.fn(() => element) });
    const monitor = new FrameRateMonitor(container, { enabled: true, profile: 'medium', windowSize: 3, refreshInterval: 40 });
    expect(container.appendChild).toHaveBeenCalledWith(element);
    expect(monitor.update(0)).toBeNull();
    monitor.update(16); monitor.update(32);
    const measured = monitor.update(48);
    expect(measured.fps).toBeCloseTo(62.5);
    expect(measured.averageFrameMs).toBeCloseTo(16);
    expect(element.textContent).toContain('ms/RAF');
    expect(element.textContent).toContain('MOYEN');
    monitor.update(64); monitor.update(80); monitor.update(96); monitor.update(112);
    expect(monitor.intervals).toHaveLength(3);
    expect(monitor.count).toBe(3);
    monitor.setEnabled(false); expect(element.hidden).toBe(true); expect(monitor.count).toBe(0);
    monitor.dispose(); monitor.dispose(); expect(element.remove).toHaveBeenCalledOnce();
  });

  it('adapts renderer pixel ratio and camera aspect on resize without recreating a scene', () => {
    const setSize = vi.fn(), setPixelRatio = vi.fn();
    const renderer = { domElement: { parentElement: { clientWidth: 1200, clientHeight: 700 } }, getPixelRatio: () => 2, setPixelRatio, setSize };
    const camera = { aspect: 1, updateProjectionMatrix: vi.fn() };
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    SceneManager.prototype.resize.call({ renderer, camera, renderProfile: { pixelRatio: 1 } });
    expect(setPixelRatio).toHaveBeenCalledWith(1);
    expect(camera.aspect).toBeCloseTo(1200 / 700);
    expect(camera.updateProjectionMatrix).toHaveBeenCalledOnce();
    expect(setSize).toHaveBeenCalledWith(1200, 700);
  });

  it('applies current graphics profile and DPR to the showroom resize path', () => {
    const setPixelRatio = vi.fn(), setSize = vi.fn();
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal('window', { innerWidth: 1200 });
    const showroom = {
      container: { clientWidth: 800, clientHeight: 450 },
      renderer: { getPixelRatio: () => 2, setPixelRatio, setSize },
      camera: { aspect: 1, updateProjectionMatrix: vi.fn() },
      focus: { x: 0 }, circuitGroup: null,
    };
    MenuShowroom.prototype.resize.call(showroom);
    expect(setPixelRatio).toHaveBeenCalledWith(1.75);
    expect(showroom.camera.aspect).toBeCloseTo(800 / 450);
    expect(setSize).toHaveBeenCalledWith(800, 450);
  });

  it('applies saved profile resolution, shadow map size and FPS visibility to an existing showroom', () => {
    const setPixelRatio = vi.fn(), shadowSize = { set: vi.fn() }, disposeShadow = vi.fn();
    const setEnabled = vi.fn(), setProfile = vi.fn(), resize = vi.fn();
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal('localStorage', memoryStorage({ quality: 'low', shadows: false, scenery: 'low', effects: false, showFps: true }));
    const showroom = {
      renderer: { setPixelRatio, shadowMap: { enabled: true }, domElement: {} },
      keyLight: { castShadow: true, shadow: { mapSize: shadowSize, map: { dispose: disposeShadow } } },
      performanceMonitor: { setEnabled, setProfile }, resize,
      circuitGroup: null,
    };
    const profile = MenuShowroom.prototype.applySettings.call(showroom);
    expect(profile).toMatchObject({ quality: 'low', pixelRatio: 1, shadowMapSize: 512, shadowsEnabled: false, showFps: true });
    expect(setPixelRatio).toHaveBeenCalledWith(1);
    expect(showroom.renderer.shadowMap.enabled).toBe(false);
    expect(showroom.keyLight.castShadow).toBe(false);
    expect(disposeShadow).toHaveBeenCalledOnce();
    expect(shadowSize.set).toHaveBeenCalledWith(512, 512);
    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(setProfile).toHaveBeenCalledWith('low');
    expect(resize).toHaveBeenCalledOnce();
  });

  it('updates RAF metrics once for each rendered frame and never claims GPU timing', () => {
    const update = vi.fn(); const render = vi.fn();
    SceneManager.prototype.render.call({ performanceMonitor: { update }, renderer: { render } }, 123);
    expect(update).toHaveBeenCalledWith(123);
    expect(render).toHaveBeenCalledOnce();
  });

  it('places a race monitor in the existing HUD layer so it is visible above the WebGL viewport', () => {
    const hud = {}, viewport = { parentElement: { querySelector: (selector) => selector === '.race-ui' ? hud : null } };
    expect(getPerformanceOverlayContainer(viewport)).toBe(hud);
    const preview = { parentElement: { querySelector: () => null } };
    expect(getPerformanceOverlayContainer(preview)).toBe(preview);
  });

  it('releases the FPS monitor and resize listener with the Three.js scene', () => {
    const monitorDispose = vi.fn(), resizeDisconnect = vi.fn(), removeWindow = vi.fn();
    const scene = { traverse: (visit) => visit({}), clear: vi.fn() };
    const renderer = { renderLists: { dispose: vi.fn() }, dispose: vi.fn(), domElement: { remove: vi.fn() } };
    vi.stubGlobal('window', { removeEventListener: removeWindow });
    SceneManager.prototype.dispose.call({
      disposed: false, resizeObserver: { disconnect: resizeDisconnect }, windowResize: vi.fn(),
      performanceMonitor: { dispose: monitorDispose }, scene, renderer,
    });
    expect(monitorDispose).toHaveBeenCalledOnce();
    expect(resizeDisconnect).toHaveBeenCalledOnce();
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(scene.clear).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.domElement.remove).toHaveBeenCalledOnce();
  });
});
