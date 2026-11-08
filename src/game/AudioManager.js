const DEFAULTS = Object.freeze({ master: 0.55, engine: 0.55, effects: 0.7, ambience: 0.22, music: 0.18, interface: 0.45, enabled: true });
const LIMIT = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const MENU_SCENES = new Set(['menu', 'garage', 'circuits', 'career', 'tutorial', 'steering-lab', 'neural-lab', 'creation']);
const APPLICATION_STATES = new Set(['menu', 'loading', 'simulation', 'closing']);
const MUSIC_FADE_SECONDS = 0.45;
const MUSIC_STOP_DELAY_MS = 500;
const MUSIC_TRACK_URL = '/audio/neurodrive-redline.wav';

/** One persistent Web Audio graph routes the local REDLINE composition, game effects and engine. */
export class AudioManager {
  constructor({ AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext, AudioElementClass = globalThis.Audio, storage = globalThis.localStorage } = {}) {
    this.AudioContextClass = AudioContextClass;
    this.AudioElementClass = AudioElementClass;
    this.storage = storage;
    this.settings = this.readSettings();
    this.context = null;
    this.nodes = null;
    this.activeEffects = new Set();
    this.lastEventAt = new Map();
    this.musicElement = null;
    this.musicSource = null;
    this.musicFadeTimer = null;
    this.lastBrakeTone = -Infinity;
    this.lastEngineSpeed = 0;
    this.engineMix = 0;
    this.crowdIntensity = 0;
    this.scene = 'menu';
    this.appState = 'menu';
    this.disposed = false;
  }

  readSettings() {
    try {
      const stored = JSON.parse(this.storage?.getItem('neurodrive-audio') ?? '{}');
      return { ...DEFAULTS, ...stored, master: LIMIT(stored.master ?? DEFAULTS.master), engine: LIMIT(stored.engine ?? DEFAULTS.engine), effects: LIMIT(stored.effects ?? DEFAULTS.effects), ambience: LIMIT(stored.ambience ?? DEFAULTS.ambience), music: LIMIT(stored.music ?? DEFAULTS.music), interface: LIMIT(stored.interface ?? DEFAULTS.interface), enabled: stored.enabled === undefined ? DEFAULTS.enabled : Boolean(stored.enabled) };
    } catch { return { ...DEFAULTS }; }
  }

  saveSettings() { try { this.storage?.setItem('neurodrive-audio', JSON.stringify(this.settings)); } catch { /* Browser storage may be disabled or full. */ } }

  resetSettings() {
    this.settings = { ...DEFAULTS };
    this.saveSettings();
    if (this.nodes) {
      this.nodes.master.gain.setTargetAtTime(this.settings.master, this.context.currentTime, 0.04);
      this.engineMix = 0;
      this.nodes.engineGain.gain.setTargetAtTime(0, this.context.currentTime, 0.04);
      this.nodes.effectGain.gain.setTargetAtTime(this.settings.effects, this.context.currentTime, 0.04);
      this.nodes.interfaceGain.gain.setTargetAtTime(this.settings.interface, this.context.currentTime, 0.04);
      this.nodes.musicGain.gain.setTargetAtTime(this.musicLevel(), this.context.currentTime, 0.1);
      this.applyAmbienceLevel();
      this.syncMusicPlayback();
    }
    return { ...this.settings };
  }

  async unlock() {
    if (!this.settings.enabled || !this.AudioContextClass || this.disposed) return false;
    if (!this.context) {
      let context;
      try {
        context = new this.AudioContextClass();
        const master = context.createGain(); master.gain.value = this.settings.master; master.connect(context.destination);
        const engineGain = context.createGain(); engineGain.gain.value = 0; engineGain.connect(master);
        const engineFilter = context.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 700; engineFilter.connect(engineGain);
        const oscillator = context.createOscillator(); oscillator.type = 'sawtooth'; oscillator.frequency.value = 48; oscillator.connect(engineFilter); oscillator.start();
        const effectGain = context.createGain(); effectGain.gain.value = this.settings.effects; effectGain.connect(master);
        const interfaceGain = context.createGain(); interfaceGain.gain.value = this.settings.interface; interfaceGain.connect(master);
        const ambienceGain = context.createGain(); ambienceGain.gain.value = 0; ambienceGain.connect(master);
        const ambienceFilter = context.createBiquadFilter(); ambienceFilter.type = 'lowpass'; ambienceFilter.frequency.value = 520; ambienceFilter.connect(ambienceGain);
        const noiseBuffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate * 2)), context.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let index = 0; index < noiseData.length; index += 1) noiseData[index] = (Math.random() * 2 - 1) * 0.55;
        const noise = context.createBufferSource(); noise.buffer = noiseBuffer; noise.loop = true; noise.connect(ambienceFilter); noise.start();
        const musicGain = context.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
        let musicElement = null, musicSource = null;
        if (this.AudioElementClass && typeof context.createMediaElementSource === 'function') {
          try {
            musicElement = new this.AudioElementClass(MUSIC_TRACK_URL);
            musicElement.loop = true; musicElement.preload = 'auto'; musicElement.volume = 1;
            musicSource = context.createMediaElementSource(musicElement); musicSource.connect(musicGain);
          } catch (error) {
            try { musicElement?.pause?.(); } catch { /* A partially created element is non-fatal. */ }
            musicElement = null; musicSource = null;
            console.warn('[NeuroDrive F1] The original REDLINE music asset could not be connected.', error);
          }
        }
        this.context = context;
        this.musicElement = musicElement; this.musicSource = musicSource;
        this.nodes = { master, engineGain, engineFilter, oscillator, effectGain, interfaceGain, ambienceGain, ambienceFilter, noise, noiseBuffer, musicGain };
      } catch (error) {
        try { if (context && context.state !== 'closed') await context.close(); } catch { /* Keep Web Audio failure non-fatal. */ }
        this.context = null; this.nodes = null;
        console.warn('[NeuroDrive F1] Web Audio initialization unavailable.', error);
        return false;
      }
    }
    try { if (this.context.state === 'suspended') await this.context.resume(); }
    catch (error) { console.warn('[NeuroDrive F1] Web Audio could not resume.', error); return false; }
    this.applyScene();
    return true;
  }

  setEnabled(enabled) {
    this.settings.enabled = Boolean(enabled); this.saveSettings();
    if (!enabled) { this.stopEffects(); this.silence(); }
    else this.applyScene();
  }

  setVolume(channel, value) {
    if (!(channel in DEFAULTS) || channel === 'enabled') return;
    this.settings[channel] = LIMIT(value); this.saveSettings();
    if (channel === 'ambience') { this.applyAmbienceLevel(); return; }
    const target = channel === 'master' ? this.nodes?.master : channel === 'engine' ? this.nodes?.engineGain
      : channel === 'ambience' ? this.nodes?.ambienceGain : channel === 'effects' ? this.nodes?.effectGain
        : channel === 'music' ? this.nodes?.musicGain : channel === 'interface' ? this.nodes?.interfaceGain : null;
    if (target && this.context) {
      const level = channel === 'music' ? this.musicLevel() : channel === 'engine' ? this.settings.engine * this.engineMix : this.settings[channel];
      target.gain.setTargetAtTime(level, this.context.currentTime, 0.04);
    }
    if (channel === 'music') this.syncMusicPlayback();
  }

  setScene(scene = 'race') {
    this.scene = MENU_SCENES.has(scene) ? scene : 'race';
    if (!this.nodes || !this.context) return;
    this.applyScene();
  }

  setAppState(state) {
    this.appState = APPLICATION_STATES.has(state) ? state : 'simulation';
    this.applyScene();
  }

  canPlayMenuMusic() { return this.appState === 'menu' && MENU_SCENES.has(this.scene); }

  musicLevel() { return this.settings.enabled && this.canPlayMenuMusic() ? this.settings.music : 0; }

  rampMusicGain(target, duration = MUSIC_FADE_SECONDS) {
    const param = this.nodes?.musicGain?.gain;
    if (!param || !this.context) return;
    const now = this.context.currentTime;
    param.cancelScheduledValues?.(now);
    if (typeof param.linearRampToValueAtTime === 'function' && typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(target, now + duration);
    } else {
      param.setTargetAtTime(target, now, duration / 5);
    }
  }

  applyScene() {
    if (!this.nodes || !this.context) return;
    const now = this.context.currentTime;
    this.rampMusicGain(this.musicLevel());
    this.applyAmbienceLevel();
    this.syncMusicPlayback();
  }

  syncMusicPlayback() {
    const shouldPlay = Boolean(this.musicElement && this.context?.state === 'running' && this.settings.enabled
      && this.settings.music > 0 && this.canPlayMenuMusic());
    if (shouldPlay) {
      if (this.musicFadeTimer !== null) clearTimeout(this.musicFadeTimer);
      this.musicFadeTimer = null;
      if (this.musicElement.paused) this.musicElement.play()?.catch?.((error) => {
        console.warn('[NeuroDrive F1] REDLINE playback awaits a browser user gesture.', error);
      });
      return;
    }
    if (!this.musicElement || this.musicElement.paused || this.musicFadeTimer !== null) return;
    this.musicFadeTimer = setTimeout(() => {
      this.musicFadeTimer = null;
      if (!this.canPlayMenuMusic() || !this.settings.enabled || this.settings.music <= 0) this.musicElement?.pause();
    }, MUSIC_STOP_DELAY_MS);
  }

  applyAmbienceLevel() {
    if (!this.nodes || !this.context) return;
    const level = this.settings.enabled ? this.settings.ambience * (this.scene === 'race' ? 0.09 + this.crowdIntensity * 0.12 : 0.045) : 0;
    this.nodes.ambienceGain.gain.setTargetAtTime(level, this.context.currentTime, 0.3);
  }

  updateEngine(speed, throttle = 0, braking = 0, rpm = null, proximity = 0) {
    if (!this.settings.enabled || !this.nodes || this.context?.state !== 'running') return;
    const normalized = LIMIT(speed / 58);
    const acceleration = Math.max(-1, Math.min(1, (speed - this.lastEngineSpeed) * 0.35));
    const nearCar = LIMIT(proximity);
    const load = LIMIT(Math.max(0, throttle) * 0.68 + Math.max(0, acceleration) * 0.26 + nearCar * 0.06);
    const rpmLoad = Number.isFinite(rpm) ? LIMIT((rpm - 2500) / 9500) : normalized;
    const pitch = 42 + normalized * 48 + rpmLoad * 100 + load * 54 + nearCar * 6 - Math.max(0, braking) * 9;
    this.nodes.oscillator.frequency.setTargetAtTime(pitch, this.context.currentTime, 0.06);
    this.nodes.engineFilter.frequency.setTargetAtTime(280 + normalized * 700 + rpmLoad * 600 + load * 260, this.context.currentTime, 0.08);
    this.engineMix = 0.045 + normalized * 0.21 + load * 0.055 + nearCar * 0.025;
    this.nodes.engineGain.gain.setTargetAtTime(this.settings.engine * this.engineMix, this.context.currentTime, 0.1);
    this.engineActive = true;
    this.applyAmbienceLevel();
    if (braking > 0.65 && speed > 4 && this.context.currentTime - this.lastBrakeTone > 0.42) {
      this.lastBrakeTone = this.context.currentTime; this.tone(150 + normalized * 90, 0.12, 0.035, 'triangle', 'effects');
    }
    this.lastEngineSpeed = speed;
  }

  tone(frequency = 440, duration = 0.12, volume = 0.12, type = 'sine', channel = 'effects') {
    if (!this.settings.enabled || !this.context || this.context.state !== 'running' || !this.nodes) return false;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime;
    const destination = channel === 'interface' ? this.nodes.interfaceGain : channel === 'music' ? this.nodes.musicGain : this.nodes.effectGain;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.018); gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain); gain.connect(destination); oscillator.start(now); oscillator.stop(now + duration + 0.03);
    const effect = { oscillator, gain, channel };
    this.activeEffects.add(effect);
    oscillator.onended = () => { this.activeEffects.delete(effect); oscillator.disconnect?.(); gain.disconnect?.(); };
    return true;
  }

  event(name, payload = {}) {
    if (!this.settings.enabled || !this.context || this.context.state !== 'running') return false;
    const definitions = {
      menu: [520, 0.07, 0.08, 'sine', 'interface', 0.1], 'ui-hover': [920, 0.035, 0.018, 'sine', 'interface', 0.16],
      'ui-confirm': [640, 0.075, 0.075, 'triangle', 'interface', 0.1], 'ui-error': [190, 0.16, 0.12, 'triangle', 'interface', 0.2],
      'start-light': [520, 0.09, 0.09, 'square', 'effects', 0.16], start: [680, 0.18, 0.12, 'sine', 'effects', 0.25], go: [880, 0.35, 0.15, 'triangle', 'effects', 0.5],
      shift: [460 + (Number(payload.gear) || 1) * 35, 0.055, 0.075, 'square', 'effects', 0.1],
      crowd: [440, 0.24, 0.08, 'sine', 'effects', 0.6], collision: [88, 0.22, 0.24, 'sawtooth', 'effects', 0.16],
      offTrack: [170, 0.12, 0.09, 'triangle', 'effects', 0.25], 'tyre-squeal': [245, 0.18, 0.07, 'sawtooth', 'effects', 0.55], drs: [980, 0.1, 0.075, 'sine', 'effects', 0.2],
      ers: [330, 0.12, 0.065, 'triangle', 'effects', 0.25], pit: [300, 0.16, 0.1, 'sine', 'effects', 0.35],
      lap: [720, 0.15, 0.09, 'sine', 'effects', 0.3], 'last-lap': [784, 0.24, 0.12, 'triangle', 'effects', 0.4],
      arrival: [587.33, 0.28, 0.12, 'triangle', 'effects', 0.4], finish: [659.25, 0.34, 0.13, 'sine', 'effects', 0.6], victory: [783.99, 0.5, 0.15, 'triangle', 'effects', 2],
    };
    if (name === 'crowd') { this.setCrowdIntensity(Math.max(this.crowdIntensity, Number(payload.intensity) || 0.65)); }
    const definition = definitions[name];
    if (!definition) return false;
    const [frequency, duration, volume, type, channel, cooldown] = definition;
    const now = this.context.currentTime, last = this.lastEventAt.get(name) ?? -Infinity;
    if (now - last < cooldown) return false;
    this.lastEventAt.set(name, now);
    const played = this.tone(frequency, duration, volume, type, channel);
    if (played && name === 'victory') {
      this.tone(frequency * 1.25, duration * 0.92, volume * 0.62, 'sine', channel);
      this.tone(frequency * 1.5, duration * 0.84, volume * 0.48, 'sine', channel);
    }
    return played;
  }

  setCrowdIntensity(value) { this.crowdIntensity = LIMIT(value); this.applyAmbienceLevel(); }

  setEngineFocus(id, speed = 0) {
    if (this.engineFocusId === id) return;
    this.engineFocusId = id;
    this.lastEngineSpeed = Math.max(0, Number(speed) || 0);
  }

  async pause(paused) {
    if (!this.context) return;
    if (paused && this.context.state === 'running') {
      this.musicElement?.pause();
      await this.context.suspend();
    }
    else if (!paused && this.settings.enabled && this.context.state === 'suspended') { await this.context.resume(); this.syncMusicPlayback(); }
  }

  silence() {
    if (!this.context || !this.nodes) return;
    if (this.musicFadeTimer !== null) clearTimeout(this.musicFadeTimer);
    this.musicFadeTimer = null;
    this.musicElement?.pause();
    const now = this.context.currentTime;
    this.nodes.engineGain.gain.setTargetAtTime(0, now, 0.03); this.engineActive = false;
    this.engineMix = 0;
    this.nodes.ambienceGain.gain.setTargetAtTime(0, now, 0.03);
    this.nodes.musicGain.gain.setTargetAtTime(0, now, 0.03);
  }

  stopEffects() {
    const now = this.context?.currentTime ?? 0;
    for (const { oscillator, gain } of this.activeEffects) {
      try { oscillator.stop(now); } catch { /* Already ended or scheduled to stop. */ }
      gain.disconnect?.(); oscillator.disconnect?.();
    }
    this.activeEffects.clear();
  }

  async stopSession() { this.stopEffects(); this.silence(); await this.pause(true); }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.musicFadeTimer !== null) clearTimeout(this.musicFadeTimer);
    this.musicFadeTimer = null; this.stopEffects(); this.musicElement?.pause();
    this.musicSource?.disconnect?.(); this.musicElement?.removeAttribute?.('src'); this.musicElement?.load?.();
    this.nodes?.oscillator.stop(); this.nodes?.noise.stop();
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.nodes = null; this.context = null; this.musicSource = null; this.musicElement = null;
  }
}

export const audioManager = new AudioManager();
