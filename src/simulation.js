import { SceneManager } from './scene/SceneManager.js';
import { CameraController } from './scene/CameraController.js';
import { PathDebug } from './scene/PathDebug.js';
import { SensorDebug } from './scene/SensorDebug.js';
import { VehicleDynamics } from './physics/VehicleDynamics.js';
import { HUD } from './ui/HUD.js';
import { AiLabPanel } from './ui/AiLabPanel.js';
import { createGeneralizationTracks } from './ai/training/GeneralizationTracks.js';
import { NeuralNetwork } from './ai/neural/NeuralNetwork.js';
import { NeuralController } from './ai/NeuralController.js';

export class SimulationSession {
  constructor({ trackId, trackDefinition = null, pilot, configuration, onReturn }) {
    this.onReturn = onReturn;
    this.disposed = false;
    this.listeners = new AbortController();
    this.track = trackDefinition ?? createGeneralizationTracks().find((entry) => entry.id === trackId) ?? createGeneralizationTracks()[0];
    const track = this.track;
    this.scene = new SceneManager(document.querySelector('#viewport'), track);
    this.dynamics = new VehicleDynamics(track.waypoints, { boundaries: track.boundaries, trackHalfWidth: track.halfWidth ? track.halfWidth - 0.7 : 7.5 });
    this.camera = new CameraController(this.scene.camera);
    this.debug = new PathDebug(this.scene.scene, track.waypoints, this.dynamics.path.trackHalfWidth);
    this.sensorDebug = new SensorDebug(this.scene.scene);
    this.hud = new HUD();
    this.aiLab = new AiLabPanel(this.dynamics);
    this.paused = false;
    this.previousTime = performance.now();
    this.trackLabel = document.querySelector('.track-label strong');
    this.trackMeta = document.querySelector('.track-label small');
    if (this.trackLabel) this.trackLabel.textContent = track.userCircuit ? track.label : this.trackName(track.id);
    document.querySelector('#controller-state').textContent = pilot === 'neural' ? `NEURAL · ${configuration}` : 'STEERING';
    if (this.trackMeta) this.trackMeta.textContent = `PILOTE · ${pilot === 'neural' ? `NEURAL ${configuration}` : 'STEERING BEHAVIORS'}`;
    document.querySelector('#pilot-select').value = pilot;
    if (pilot === 'neural') this.loadPreset(configuration);
    const options = { signal: this.listeners.signal };
    document.querySelector('#pause-btn').addEventListener('click', () => this.pause(!this.paused), options);
    document.querySelector('#restart-btn').addEventListener('click', () => this.restart(), options);
    document.querySelector('#camera-btn').addEventListener('click', () => this.hud.setCamera(this.camera.toggle()), options);
    window.addEventListener('keydown', (event) => this.onKey(event), options);
    this.returnButton = document.createElement('button');
    this.returnButton.id = 'return-menu-btn';
    this.returnButton.type = 'button';
    this.returnButton.textContent = 'Retour au menu';
    this.returnButton.setAttribute('aria-label', 'Arrêter la session et retourner au menu principal');
    document.querySelector('.controls').append(this.returnButton);
    this.returnButton.addEventListener('click', () => this.returnToMenu(), options);
    this.scene.car.sync(this.dynamics.vehicle, 0);
    this.frameId = requestAnimationFrame((now) => this.animate(now));
  }

  trackName(id) { return ({ original: 'CIRCUIT AZUR', technical: 'CIRCUIT TECHNIQUE', 'fast-oval': 'OVALE RAPIDE' })[id] ?? id.toUpperCase(); }

  async loadPreset(configuration) {
    try {
      const response = await fetch(`/phase8-model-${configuration.toLowerCase()}.json`, { signal: this.listeners.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const preset = await response.json();
      this.dynamics.controller = new NeuralController({ network: NeuralNetwork.fromJSON(preset.network) });
      document.querySelector('#controller-state').textContent = `NEURAL · ${configuration} · ${preset.seed}`;
      if (this.trackMeta) this.trackMeta.textContent = `PILOTE · NEURAL ${configuration} · GRAINE ${preset.seed}`;
      this.dynamics.reset();
    } catch (error) {
      if (this.disposed) return;
      document.querySelector('#training-status').textContent = `Modèle ${configuration} indisponible : ${error.message}. Sélectionnez Steering ou importez un réseau.`;
      document.querySelector('#pilot-select').value = 'steering';
    }
  }

  pause(value) { this.paused = value; this.hud.setPaused(value); }
  restart() { this.dynamics.reset(); this.hud.resetClock(); this.pause(false); }
  onKey(event) {
    if (this.disposed || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === 'Space') { event.preventDefault(); this.pause(!this.paused); }
    else if (event.key.toLowerCase() === 'r') this.restart();
    else if (event.key.toLowerCase() === 'c') this.hud.setCamera(this.camera.toggle());
    else if (event.key.toLowerCase() === 'd') this.hud.setDebug(this.debug.toggle());
    else if (event.key.toLowerCase() === 's') this.sensorDebug.toggle();
  }
  animate(now) {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame((time) => this.animate(time));
    const dt = Math.min((now - this.previousTime) / 1000, 0.05); this.previousTime = now;
    if (!this.paused) {
      const metrics = this.dynamics.update(dt); this.scene.car.sync(this.dynamics.vehicle, dt); this.hud.update(metrics);
      if (this.debug.group.visible) this.debug.update(this.dynamics.vehicle, metrics);
      if (this.sensorDebug.group.visible) this.sensorDebug.update(metrics.sensors);
    }
    this.camera.update(this.dynamics.vehicle, dt); this.scene.render();
  }

  async returnToMenu() {
    if (this.disposed) return;
    this.dispose();
    this.onReturn?.();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.listeners.abort();
    this.aiLab.dispose();
    this.scene.dispose();
    this.hud.setPaused(false);
    this.returnButton.remove();
  }
}
