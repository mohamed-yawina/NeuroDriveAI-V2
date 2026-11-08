import { describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/AudioManager.js';
import { HapticsManager } from '../src/game/HapticsManager.js';
import { SessionNavigation } from '../src/ui/SessionNavigation.js';

function createAudioContextMock() {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ gain: param(), frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  const context = {
    state: 'suspended', currentTime: 1, sampleRate: 8,
    destination: {}, createGain: vi.fn(node), createBiquadFilter: vi.fn(() => ({ ...node(), type: '', frequency: param() })),
    createOscillator: vi.fn(() => ({ ...node(), type: '', frequency: param() })),
    createMediaElementSource: vi.fn(node),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(16) })),
    createBufferSource: vi.fn(() => ({ ...node(), loop: false })),
    resume: vi.fn(async () => { context.state = 'running'; }),
    suspend: vi.fn(async () => { context.state = 'suspended'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
  };
  return context;
}

function createMusicElementClass() {
  return vi.fn((src) => ({ src, loop: false, preload: '', volume: 1, paused: true,
    play: vi.fn(function play() { this.paused = false; return Promise.resolve(); }),
    pause: vi.fn(function pause() { this.paused = true; }), removeAttribute: vi.fn(), load: vi.fn() }));
}

describe('Phase 14 audio and haptics', () => {
  it('creates one reusable context after unlock, routes effects and suspends on pause', async () => {
    const context = createAudioContextMock();
    const AudioContextClass = vi.fn(() => context);
    const storage = { getItem: () => null, setItem: vi.fn() };
    const audio = new AudioManager({ AudioContextClass, storage });
    expect(audio.context).toBeNull();
    audio.setScene('race');
    await audio.unlock(); await audio.unlock();
    expect(AudioContextClass).toHaveBeenCalledTimes(1);
    audio.event('collision'); audio.updateEngine(18, 1, 0);
    expect(context.createOscillator).toHaveBeenCalled();
    const oneShot = [...audio.activeEffects].find((effect) => effect.channel === 'effects');
    await audio.pause(true);
    expect(context.suspend).toHaveBeenCalledTimes(1);
    await audio.pause(false);
    expect(context.resume).toHaveBeenCalledTimes(2);
    await audio.stopSession();
    expect(oneShot.oscillator.stop).toHaveBeenLastCalledWith(context.currentTime);
    expect(audio.activeEffects.size).toBe(0);
    expect(context.state).toBe('suspended');
    await audio.dispose();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('respects disabled audio and safely handles missing Web Audio', async () => {
    const disabled = new AudioManager({ AudioContextClass: vi.fn(), storage: { getItem: () => JSON.stringify({ enabled: false }), setItem: vi.fn() } });
    expect(await disabled.unlock()).toBe(false);
    expect(disabled.AudioContextClass).not.toHaveBeenCalled();
    const unavailable = new AudioManager({ AudioContextClass: null, storage: null });
    expect(await unavailable.unlock()).toBe(false);
    expect(unavailable.event('menu')).toBe(false);
    unavailable.setScene('garage');
  });

  it('raises engine pitch with speed and throttle and emits race event cues', async () => {
    const context = createAudioContextMock();
    const audio = new AudioManager({ AudioContextClass: vi.fn(() => context), storage: null });
    await audio.unlock();
    const pitch = audio.nodes.oscillator.frequency.setTargetAtTime;
    audio.updateEngine(0, 0, 0);
    const idlePitch = pitch.mock.calls.at(-1)[0];
    audio.updateEngine(34, 1, 0);
    const loadedPitch = pitch.mock.calls.at(-1)[0];
    expect(loadedPitch).toBeGreaterThan(idlePitch);
    audio.updateEngine(30, 0, 1);
    expect(audio.lastBrakeTone).toBe(context.currentTime);
    for (const event of ['start', 'collision', 'offTrack', 'finish', 'menu']) audio.event(event);
    expect(context.createOscillator.mock.calls.length).toBeGreaterThan(1);
    await audio.dispose();
  });

  it('tracks the arcade gearbox engine RPM in engine pitch independently of vehicle speed', async () => {
    const context = createAudioContextMock();
    const audio = new AudioManager({ AudioContextClass: vi.fn(() => context), storage: null });
    await audio.unlock();
    audio.updateEngine(22, 0.2, 0, 3500);
    const lowGearPitch = audio.nodes.oscillator.frequency.setTargetAtTime.mock.calls.at(-1)[0];
    audio.updateEngine(22, 0.2, 0, 10500);
    const highRpmPitch = audio.nodes.oscillator.frequency.setTargetAtTime.mock.calls.at(-1)[0];
    expect(highRpmPitch).toBeGreaterThan(lowGearPitch);
    await audio.dispose();
  });

  it('keeps REDLINE menu-only across navigation, pause, fast transitions and launch errors', async () => {
    vi.useFakeTimers();
    const context = createAudioContextMock();
    const AudioContextClass = vi.fn(() => context);
    const AudioElementClass = createMusicElementClass();
    const storage = { getItem: () => null, setItem: vi.fn() };
    const audio = new AudioManager({ AudioContextClass, AudioElementClass, storage });
    await audio.unlock();
    expect(AudioElementClass).toHaveBeenCalledWith('/audio/neurodrive-redline.wav');
    expect(audio.musicElement.loop).toBe(true);
    expect(audio.musicElement.play).toHaveBeenCalledTimes(1);
    audio.setVolume('music', 0.4);
    audio.setScene('neural-lab');
    expect(audio.nodes.musicGain.gain.linearRampToValueAtTime.mock.calls.at(-1)).toEqual([0.4, context.currentTime + 0.45]);
    audio.setScene('garage'); audio.setScene('career'); audio.setScene('steering-lab');
    expect(audio.musicElement.play).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)[1]).music).toBe(0.4);
    expect(AudioContextClass).toHaveBeenCalledTimes(1);
    const navigation = new SessionNavigation({ onStateChange: (state) => audio.setAppState(state) });
    await navigation.launch(async () => ({ dispose: vi.fn(async () => audio.stopSession()) }));
    expect(audio.appState).toBe('simulation');
    expect(audio.nodes.musicGain.gain.linearRampToValueAtTime.mock.calls.at(-1)).toEqual([0, context.currentTime + 0.45]);
    expect(audio.musicElement.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(audio.musicElement.paused).toBe(true);
    await audio.pause(true);
    await audio.pause(false);
    expect(audio.musicElement.play).toHaveBeenCalledTimes(1);
    await navigation.returnToMenu();
    audio.setScene('menu');
    await audio.unlock();
    expect(audio.musicElement.play).toHaveBeenCalledTimes(2);
    audio.setScene('garage'); audio.setScene('circuits'); audio.setScene('career');
    expect(audio.musicElement.play).toHaveBeenCalledTimes(2);

    // A quick close/reopen during the fade must not pause/recreate the track.
    audio.setAppState('loading');
    audio.setAppState('menu');
    await vi.advanceTimersByTimeAsync(500);
    expect(audio.musicElement.paused).toBe(false);
    expect(AudioElementClass).toHaveBeenCalledTimes(1);
    expect(audio.musicElement.play).toHaveBeenCalledTimes(2);

    // A failed asynchronous launch returns to MENU and retains the same player.
    await expect(navigation.launch(async () => { throw new Error('session init failed'); })).rejects.toThrow('session init failed');
    expect(navigation.state).toBe('menu');
    expect(audio.appState).toBe('menu');
    expect(AudioElementClass).toHaveBeenCalledTimes(1);
    expect(audio.musicElement.play).toHaveBeenCalledTimes(2);

    // Menu scene names cannot reopen music while the application is in a race.
    audio.setAppState('simulation');
    audio.setScene('podium');
    await audio.pause(true); await audio.pause(false);
    expect(audio.musicElement.play).toHaveBeenCalledTimes(2);
    audio.setAppState('menu');
    audio.setScene('menu');
    expect(audio.musicElement.play).toHaveBeenCalledTimes(3);
    await audio.dispose();
    expect(audio.musicElement).toBeNull();
    vi.useRealTimers();
  });

  it('rate-limits repeated race events and clears scheduled effects and music on session stop', async () => {
    const context = createAudioContextMock();
    const audio = new AudioManager({ AudioContextClass: vi.fn(() => context), storage: null });
    audio.setScene('race');
    await audio.unlock();
    expect(audio.event('collision')).toBe(true);
    expect(audio.event('collision')).toBe(false);
    context.currentTime += 0.2;
    expect(audio.event('collision')).toBe(true);
    expect([...audio.activeEffects].filter((effect) => effect.channel === 'effects')).toHaveLength(2);
    await audio.stopSession();
    expect(audio.activeEffects.size).toBe(0);
    expect(audio.musicElement).toBeNull();
    expect(context.state).toBe('suspended');
    await audio.dispose();
  });

  it('plays the observed car engine smoothly across camera changes and modulates it near rivals', async () => {
    const context = createAudioContextMock();
    const audio = new AudioManager({ AudioContextClass: vi.fn(() => context), storage: null });
    await audio.unlock();
    audio.setEngineFocus('car-1', 25);
    audio.updateEngine(25, 0.4, 0, 5500, 0);
    const baselinePitch = audio.nodes.oscillator.frequency.setTargetAtTime.mock.calls.at(-1)[0];
    audio.setEngineFocus('car-2', 3);
    audio.updateEngine(3, 0.1, 0, 3500, 1);
    const nearCarPitch = audio.nodes.oscillator.frequency.setTargetAtTime.mock.calls.at(-1)[0];
    expect(nearCarPitch).toBeGreaterThan(30);
    expect(baselinePitch).toBeGreaterThan(nearCarPitch);
    expect(audio.lastEngineSpeed).toBe(3);
    await audio.dispose();
  });

  it('detects unsupported haptics and respects enable state and cooldown', () => {
    const unsupported = new HapticsManager({ navigatorRef: {}, storage: null });
    expect(unsupported.settings.enabled).toBe(false);
    expect(unsupported.pulse('collision')).toBe(false);

    let now = 1000;
    const vibrate = vi.fn(() => true);
    const supported = new HapticsManager({ navigatorRef: { vibrate }, storage: null, now: () => now, cooldownMs: 200 });
    expect(supported.pulse('collision')).toBe(true);
    expect(supported.pulse('offTrack')).toBe(false);
    now += 201;
    expect(supported.pulse('offTrack')).toBe(true);
    supported.setEnabled(false);
    now += 201;
    expect(supported.pulse('collision')).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('uses a connected gamepad actuator when mobile vibration is absent', () => {
    const playEffect = vi.fn();
    const haptics = new HapticsManager({ navigatorRef: { getGamepads: () => [{ vibrationActuator: { playEffect } }] }, storage: null, now: () => 500 });
    expect(haptics.isSupported()).toBe(true);
    expect(haptics.pulse('braking')).toBe(true);
    expect(playEffect).toHaveBeenCalledWith('dual-rumble', expect.objectContaining({ duration: 65 }));
  });

  it('restores audio and supported haptics to their persisted defaults', () => {
    const storage = { getItem: () => null, setItem: vi.fn() };
    const audio = new AudioManager({ AudioContextClass: null, storage });
    audio.setVolume('engine', 0.1); audio.setEnabled(false);
    expect(audio.resetSettings()).toMatchObject({ enabled: true, engine: 0.55, master: 0.55, music: 0.18 });
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)[1]).engine).toBe(0.55);

    const haptics = new HapticsManager({ navigatorRef: { vibrate: vi.fn() }, storage });
    haptics.setIntensity(0.1); haptics.setEnabled(false);
    expect(haptics.resetSettings()).toEqual({ enabled: true, intensity: 0.7 });
  });
});
