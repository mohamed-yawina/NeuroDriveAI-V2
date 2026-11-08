import { formatTime } from '../utils/math.js';

export class HUD {
  constructor() {
    this.speed = document.querySelector('#speed');
    this.speedBar = document.querySelector('#speed-bar');
    this.lap = document.querySelector('#lap');
    this.lapTime = document.querySelector('#lap-time');
    this.offset = document.querySelector('#offset');
    this.clock = document.querySelector('#clock');
    this.cameraButton = document.querySelector('#camera-btn');
    this.pauseLabel = document.querySelector('#pause-label');
    this.pauseOverlay = document.querySelector('#pause-overlay');
    this.warning = document.querySelector('#track-warning');
    this.debugIndicator = document.querySelector('#debug-indicator');
    this.sensorValues = Array.from({ length: 5 }, (_, i) => document.querySelector(`#sensor-value-${i}`));
    this.sensorBars = Array.from({ length: 5 }, (_, i) => document.querySelector(`#sensor-bar-${i}`));
    this.labSpeed = document.querySelector('#lab-speed');
    this.headingError = document.querySelector('#lab-heading-error');
    this.progress = document.querySelector('#lab-progress');
    this.offTrackStats = document.querySelector('#lab-offtrack');
    this.controllerState = document.querySelector('#controller-state');
    this.aiMode = document.querySelector('#ai-mode');
    this.startedAt = performance.now();
  }

  update(metrics) {
    this.speed.textContent = Math.round(metrics.speed).toString().padStart(3, '0');
    this.speedBar.style.width = `${Math.min(metrics.speed / 125, 1) * 100}%`;
    this.lap.innerHTML = `${String(metrics.lap).padStart(2, '0')} <small>/ 05</small>`;
    this.lapTime.textContent = formatTime(metrics.lapTime);
    this.offset.innerHTML = `${metrics.distance.toFixed(1)} <small>M</small>`;
    this.clock.textContent = formatTime((performance.now() - this.startedAt) / 1000);
    this.warning.classList.toggle('hidden', !metrics.offTrack);
    this.warning.textContent = metrics.recovering ? 'RÉCUPÉRATION EN COURS' : 'ALERTE : SORTIE DE PISTE';
    metrics.sensors.forEach((reading, i) => {
      this.sensorValues[i].textContent = `${reading.distance.toFixed(1)} m`;
      this.sensorBars[i].style.width = `${reading.normalized * 100}%`;
    });
    this.labSpeed.textContent = `${Math.round(metrics.speed)} km/h`;
    this.headingError.textContent = `${(metrics.orientationError * 180 / Math.PI).toFixed(1)}°`;
    this.progress.textContent = `${Math.round(metrics.telemetry.progressRatio * 100)}% · ${metrics.telemetry.signedProgress.toFixed(0)} m`;
    this.offTrackStats.textContent = `${metrics.telemetry.offTrackEvents} · ${metrics.telemetry.offTrackDuration.toFixed(1)} s`;
    this.controllerState.textContent = metrics.recovering ? 'RECOVERY' : metrics.controller.toUpperCase();
    this.aiMode.textContent = metrics.controller === 'NeuralController' ? 'NEURAL' : 'PATH FOLLOW';
  }

  setPaused(paused) {
    this.pauseLabel.textContent = paused ? 'Reprendre' : 'Mettre en pause';
    this.pauseOverlay.classList.toggle('hidden', !paused);
  }

  setCamera(mode) {
    this.cameraButton.querySelector('span:nth-child(2)').textContent = mode === 'overview' ? 'Caméra de poursuite' : 'Caméra aérienne';
  }

  setDebug(enabled) { this.debugIndicator?.classList.toggle('hidden', !enabled); }
  resetClock() { this.startedAt = performance.now(); }
}
