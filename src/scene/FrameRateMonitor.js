import './performance-monitor.css';

const PROFILE_LABELS = Object.freeze({ low: 'FAIBLE', medium: 'MOYEN', high: 'ÉLEVÉ' });

/** Reports RAF cadence only; it does not measure CPU or GPU execution time. */
export class FrameRateMonitor {
  constructor(container, { enabled = false, profile = 'high', windowSize = 60, refreshInterval = 500 } = {}) {
    if (!container?.appendChild) throw new TypeError('FrameRateMonitor needs a DOM container.');
    if (!Number.isInteger(windowSize) || windowSize < 2 || !(refreshInterval > 0)) throw new RangeError('Invalid frame monitor sampling limits.');
    this.container = container;
    this.disposed = false;
    this.intervals = new Float32Array(windowSize);
    this.windowSize = windowSize;
    this.refreshInterval = refreshInterval;
    this.head = 0;
    this.count = 0;
    this.lastFrame = null;
    this.lastDisplay = -Infinity;
    this.profile = PROFILE_LABELS[profile] ? profile : 'high';
    this.element = document.createElement('output');
    this.element.className = 'nd-performance-monitor';
    this.element.setAttribute('aria-label', 'Cadence des images et profil graphique');
    this.element.setAttribute('aria-live', 'off');
    this.container.appendChild(this.element);
    this.setEnabled(enabled);
  }

  setEnabled(enabled) {
    if (this.disposed) return;
    this.enabled = Boolean(enabled);
    this.element.hidden = !this.enabled;
    if (!this.enabled) this.reset();
  }

  setProfile(profile) { this.profile = PROFILE_LABELS[profile] ? profile : 'high'; }

  reset() {
    this.intervals.fill(0);
    this.head = 0;
    this.count = 0;
    this.lastFrame = null;
    this.lastDisplay = -Infinity;
    if (this.element) this.element.textContent = `-- FPS · -- ms · ${PROFILE_LABELS[this.profile]}`;
  }

  update(timestamp) {
    if (this.disposed || !this.enabled || !Number.isFinite(timestamp)) return null;
    if (this.lastFrame !== null) {
      const interval = timestamp - this.lastFrame;
      if (interval > 0 && interval < 1000) {
        this.intervals[this.head] = interval;
        this.head = (this.head + 1) % this.windowSize;
        this.count = Math.min(this.windowSize, this.count + 1);
      }
    }
    this.lastFrame = timestamp;
    if (this.count < Math.min(5, this.windowSize) || timestamp - this.lastDisplay < this.refreshInterval) return null;
    let total = 0;
    for (let index = 0; index < this.count; index += 1) total += this.intervals[index];
    const averageFrameMs = total / this.count;
    const fps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;
    this.element.textContent = `${fps.toFixed(0)} FPS · ${averageFrameMs.toFixed(1)} ms/RAF · ${PROFILE_LABELS[this.profile]}`;
    this.lastDisplay = timestamp;
    return { fps, averageFrameMs, sampleCount: this.count, profile: this.profile };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.reset();
    this.element.remove();
    this.container = null;
    this.element = null;
  }
}
