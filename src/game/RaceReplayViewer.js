import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager.js';
import { FormulaCar } from '../scene/FormulaCar.js';
import { RaceCameras } from './RaceCameras.js';
import { createTrackBoundaries } from '../scene/trackGeometry.js';
import { createGeneralizationTracks } from '../ai/training/GeneralizationTracks.js';
import { interpolateReplayAtTime, upgradeRaceReplay, validateRaceReplay } from '../neural-lab/ReplayProtocol.js';

const COLORS = [0xe10600, 0x42a5f5, 0xffc43d, 0x42d392, 0xb58af5, 0xff884d, 0xeeeeee, 0xf16f9e];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const format = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;

export class RaceReplayViewer {
  constructor({ app = document.querySelector('#app'), replay, onClose = () => {}, sceneFactory = (container, track) => new SceneManager(container, track), carFactory = (scene, options) => new FormulaCar(scene, options), cameraFactory = (camera, track) => new RaceCameras(camera, track) } = {}) {
    if (!validateRaceReplay(replay).valid) throw new TypeError(validateRaceReplay(replay).reason);
    this.app = app; this.onClose = onClose; this.listeners = new AbortController(); this.disposed = false; this.playing = false; this.speed = 1; this.cursorTime = replay.frames[0].time;
    const known = replay.track.category === 'user-defined' ? null : createGeneralizationTracks().find((track) => track.id === replay.track.id);
    this.replay = upgradeRaceReplay(replay, { knownTrack: known });
    let waypoints;
    if (known) waypoints = known.waypoints;
    else if (Array.isArray(this.replay.track.waypoints) && Number.isFinite(this.replay.track.halfWidth)) waypoints = this.replay.track.waypoints.map(({ x, z }) => new THREE.Vector3(x, 0.08, z));
    else throw new TypeError('Replay ancien de circuit utilisateur incomplet : géométrie/largeur manquante, aucune piste ne sera inventée.');
    const halfWidth = known?.halfWidth ?? this.replay.track.halfWidth;
    this.track = { ...(known ?? {}), id: this.replay.track.id, label: this.replay.track.label, waypoints, halfWidth, boundaries: known?.boundaries ?? createTrackBoundaries(waypoints, { halfWidth }) };
    const cadenceLabel = this.replay.sampleRate ? `${this.replay.sampleRate} Hz cadence nominale` : 'cadence historique inconnue';
    this.root = document.createElement('section'); this.root.className = 'replay-viewer'; this.root.innerHTML = `<header><div><small>REPLAY ARCADE · ${esc(this.replay.track.label)}</small><strong>Lecture de course enregistrée</strong></div><button data-action="close">FERMER</button></header><main><div class="replay-viewport"></div><aside><label>CAMÉRA<select data-control="camera"><option value="overview">Vue circuit</option><option value="chase">Poursuite</option><option value="trackside">Bord de piste</option><option value="cockpit">Cockpit</option><option value="tv">TV</option></select></label><label>VOITURE SUIVIE<select data-control="car">${this.replay.drivers.map((driver) => `<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join('')}</select></label><label>VITESSE<select data-control="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label><div class="replay-events"><b>ÉVÉNEMENTS ENREGISTRÉS</b><ol data-events></ol></div><p class="replay-provenance">${this.replay.frames.length} poses · ${cadenceLabel} · données enregistrées interpolées; aucune physique rejouée.</p></aside></main><footer><button data-action="start">DÉBUT</button><button data-action="back">−1 s</button><button data-action="toggle">LECTURE</button><button data-action="forward">+1 s</button><button data-action="end">FIN</button><input data-control="timeline" type="range" min="${this.replay.frames[0].time}" max="${this.replay.frames.at(-1).time}" step="0.01" value="${this.cursorTime}" aria-label="Chronologie du replay"><output data-time></output></footer>`;
    app.append(this.root);
    this.scene = sceneFactory(this.root.querySelector('.replay-viewport'), this.track); this.scene.car.root.visible = false;
    this.carViews = this.replay.drivers.map((driver, index) => carFactory(this.scene.scene, { primaryColor: COLORS[index % COLORS.length] }));
    this.cameras = cameraFactory(this.scene.camera, this.track); this.cameras.mode = 'overview'; this.cameras.setTarget(this.replay.drivers[0].id);
    this.cars = this.replay.drivers.map((driver, index) => ({ id: driver.id, name: driver.name, position: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1), velocity: new THREE.Vector3(), completedLaps: 0, progress: 0, finished: false, index }));
    this.mountEvents(); this.renderEvents(); this.renderSample(this.cursorTime); this.frameId = requestAnimationFrame((now) => this.animate(now));
  }
  mountEvents() {
    const signal = this.listeners.signal;
    this.root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') this.dispose();
      else if (action === 'toggle') this.setPlaying(!this.playing);
      else if (action === 'start') this.seek(this.replay.frames[0].time);
      else if (action === 'end') this.seek(this.replay.frames.at(-1).time);
      else if (action === 'back') this.seek(this.cursorTime - 1);
      else if (action === 'forward') this.seek(this.cursorTime + 1);
      const eventButton = event.target.closest('[data-event-index]'); if (eventButton) this.seek(Number(eventButton.dataset.eventTime));
    }, { signal });
    this.root.querySelector('[data-control="timeline"]').addEventListener('input', (event) => this.seek(Number(event.target.value)), { signal });
    this.root.querySelector('[data-control="camera"]').addEventListener('change', (event) => { this.cameras.setMode(event.target.value); }, { signal });
    this.root.querySelector('[data-control="car"]').addEventListener('change', (event) => this.cameras.setTarget(event.target.value), { signal });
    this.root.querySelector('[data-control="speed"]').addEventListener('change', (event) => { this.speed = Number(event.target.value); }, { signal });
  }
  seek(time) { this.cursorTime = Math.max(this.replay.frames[0].time, Math.min(this.replay.frames.at(-1).time, time)); this.renderSample(this.cursorTime); }
  setPlaying(value) { this.playing = Boolean(value); this.root.querySelector('[data-action="toggle"]').textContent = this.playing ? 'PAUSE' : 'LECTURE'; }
  renderEvents() {
    this.root.querySelector('[data-events]').innerHTML = this.replay.events.map((event) => `<li><button data-event-index="${event.step}" data-event-time="${event.time}">${format(event.time)} · ${esc(event.type)}${event.driver ? ` · ${esc(event.driver)}` : ''}${event.count ? ` ×${event.count}` : ''}</button></li>`).join('') || '<li>Aucun événement n’a été enregistré.</li>';
  }
  renderSample(time) {
    const sample = interpolateReplayAtTime(this.replay, time);
    sample.cars.forEach((record, index) => {
      const car = this.cars[index]; car.position.set(record.x, 0.08, record.z); car.forward.set(-Math.sin(record.yaw), 0, -Math.cos(record.yaw)); car.yaw = record.yaw; car.completedLaps = record.completedLaps ?? 0; car.progress = record.progress;
      this.carViews[index].root.position.set(record.x, 0.32, record.z); this.carViews[index].root.rotation.y = record.yaw;
    });
    this.root.querySelector('[data-control="timeline"]').value = String(this.cursorTime);
    this.root.querySelector('[data-time]').textContent = `${format(sample.time)} / ${format(this.replay.frames.at(-1).time)}`;
    const prior = [...this.replay.events].reverse().find((event) => event.time <= sample.time);
    if (prior) this.root.querySelector('[data-events]').dataset.activeStep = String(prior.step);
  }
  animate(now) {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame((time) => this.animate(time));
    const dt = Math.min(0.1, Math.max(0, (now - (this.previousTime ?? now)) / 1000)); this.previousTime = now;
    if (this.playing) { this.cursorTime += dt * this.speed; if (this.cursorTime >= this.replay.frames.at(-1).time) { this.cursorTime = this.replay.frames.at(-1).time; this.setPlaying(false); } }
    this.renderSample(this.cursorTime); this.cameras.update(this.cars, dt); this.scene.render();
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.setPlaying(false); cancelAnimationFrame(this.frameId); this.listeners.abort();
    this.scene?.dispose(); this.carViews = []; this.root.remove(); this.onClose();
  }
}
