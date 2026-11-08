const DEFAULT_SETTINGS = Object.freeze({ enabled: true, intensity: 0.7 });

/** Best-effort gamepad/mobile haptics with rate limiting and feature detection. */
export class HapticsManager {
  constructor({ navigatorRef = globalThis.navigator, storage = globalThis.localStorage, now = () => Date.now(), cooldownMs = 180 } = {}) {
    this.navigator = navigatorRef; this.storage = storage; this.now = now; this.cooldownMs = cooldownMs; this.lastPulse = 0;
    try { this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(storage?.getItem('neurodrive-haptics') ?? '{}') }; }
    catch { this.settings = { ...DEFAULT_SETTINGS }; }
    if (!this.isSupported()) this.settings.enabled = false;
  }
  save() { try { this.storage?.setItem('neurodrive-haptics', JSON.stringify(this.settings)); } catch { /* Storage can be disabled. */ } }
  setEnabled(value) { this.settings.enabled = Boolean(value); this.save(); }
  setIntensity(value) { this.settings.intensity = Math.max(0, Math.min(1, Number(value) || 0)); this.save(); }
  resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS, enabled: this.isSupported() };
    this.save();
    return { ...this.settings };
  }
  isSupported() {
    if (typeof this.navigator?.vibrate === 'function') return true;
    return [...(this.navigator?.getGamepads?.() ?? [])].some((pad) => pad?.vibrationActuator?.playEffect || pad?.hapticActuators?.length);
  }
  pulse(kind = 'collision') {
    if (!this.settings.enabled || this.settings.intensity <= 0 || this.now() - this.lastPulse < this.cooldownMs) return false;
    const specs = { collision: [130, 1, 0.25], offTrack: [115, 0.38, 0.45], braking: [65, 0.2, 0.35], curb: [35, 0.28, 0.5] };
    const [duration, strong, weak] = specs[kind] ?? specs.collision, factor = this.settings.intensity; let sent = false;
    try {
      if (typeof this.navigator?.vibrate === 'function') sent = this.navigator.vibrate(Math.round(duration * factor)) !== false;
      for (const pad of [...(this.navigator?.getGamepads?.() ?? [])]) {
        const actuator = pad?.vibrationActuator ?? pad?.hapticActuators?.[0];
        if (actuator?.playEffect) { actuator.playEffect('dual-rumble', { duration, strongMagnitude: strong * factor, weakMagnitude: weak * factor }); sent = true; }
        else if (actuator?.pulse) { actuator.pulse(strong * factor, duration); sent = true; }
      }
    } catch { return false; }
    if (sent) this.lastPulse = this.now();
    return sent;
  }
  stop() { try { this.navigator?.vibrate?.(0); } catch { /* Unsupported device. */ } }
}

export const hapticsManager = new HapticsManager();
