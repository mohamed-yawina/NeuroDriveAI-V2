import './neural-lab.css';
import { CircuitLibrary } from '../circuits/CircuitLibrary.js';
import { circuitToTrackDefinition } from '../circuits/CircuitFormat.js';
import { createGeneralizationTracks } from '../ai/training/GeneralizationTracks.js';
import { RaceController } from '../game/RaceController.js';
import { ExperimentalNetwork, ExperimentalBrainAdapter, HistoricalBrainAdapter, loadHistoricalBrain, createBalancedHeats, validateFairness, runRaceHeat } from './ExperimentProtocol.js';
import { TrainingWorkerClient } from './TrainingWorkerClient.js';
import { renderNetworkDiagram } from './NetworkInspector.js';
import { analyzeReplayFailures, validateRaceReplay } from './ReplayProtocol.js';
import { buildResearchReport, researchReportToCsv } from './ResearchReport.js';
import { loadHistoricalFitness } from './HistoricalFitness.js';

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const saveFile = (name, data, type) => { const url = URL.createObjectURL(new Blob([data], { type })); const a = Object.assign(document.createElement('a'), { href: url, download: name }); a.click(); URL.revokeObjectURL(url); };

export class NeuralRacingLab {
  constructor({ onReturn, onTutorialEvent = null } = {}) {
    this.app = document.querySelector('#app'); this.onReturn = onReturn; this.onTutorialEvent = onTutorialEvent; this.disposed = false; this.listeners = new AbortController(); this.models = new Map(); this.results = []; this.trainingWorker = null; this.trainingHistory = []; this.trainingRuns = []; this.activationSamples = new Map(); this.replayPlaying = false; this.replayCursor = 0;
    this.mount(); this.events();
  }
  mount() {
    const tracks = createGeneralizationTracks();
    let userTracks = []; try { userTracks = new CircuitLibrary().list().map((c) => ({ ...circuitToTrackDefinition(c), label: `${c.name} Â· circuit utilisateur` })); } catch { /* show built-in tracks; library errors are isolated */ }
    this.tracks = [...tracks, ...userTracks];
    this.root = document.createElement('main'); this.root.className = 'neural-racing-lab';
    this.root.innerHTML = `<header><button data-action="menu">â† Menu</button><div><small>PHASE 13 Â· ESPACE EXPÃ‰RIMENTAL</small><h1>Neural Racing Lab</h1><p>Courses comparatives dans la physique arcade F1. RÃ©sultats distincts des validations scientifiques.</p></div></header>
      <div class="nrl-grid"><section class="nrl-card"><h2>Protocole de course</h2><label>Circuit<select id="nrl-track">${this.tracks.map((t) => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('')}</select></label><label>Graine de dÃ©part<input id="nrl-seed" type="number" value="13013"></label><div class="nrl-models"><b>Pilotes</b><label><input type="checkbox" value="A" checked> ModÃ¨le A Â· phase 8</label><label><input type="checkbox" value="B" checked> ModÃ¨le B Â· phase 8</label><label><input type="checkbox" value="C" checked> ModÃ¨le C Â· phase 8</label><label><input type="checkbox" value="Steering" checked> Steering Â· rÃ©fÃ©rence arcade</label></div><button data-action="run">Lancer les manches Ã©quilibrÃ©es</button><p class="nrl-note">MÃªme circuit, physique et grille. La position de dÃ©part tourne entre les manches. Une manche = un tour. Pas d'entraÃ®nement.</p><p id="nrl-status" role="status">Artefacts A/B/C chargÃ©s Ã  la demande.</p></section>
      <section class="nrl-card"><h2>RÃ©seau expÃ©rimental neuf</h2><p>Format versionnÃ© sÃ©parÃ©; ne peut pas Ã©craser les cerveaux historiques.</p><label>Angles capteurs (degrÃ©s, sÃ©parÃ©s par virgules)<input id="nrl-angles" value="-60,-30,0,30,60"></label><label>PortÃ©e des capteurs<input id="nrl-range" type="number" min="1" value="45"></label><label>Couches cachÃ©es (neurones, sÃ©parÃ©s par virgules)<input id="nrl-hidden" value="16,16"></label><label>Activation cachÃ©e<select id="nrl-activation"><option>tanh</option><option>relu</option><option>sigmoid</option></select></label><button data-action="create">CrÃ©er / exporter un cerveau expÃ©rimental</button><label class="nrl-file">Importer un cerveau JSON<input id="nrl-import" type="file" accept="application/json,.json"></label><label>Réseau à inspecter<select id="nrl-inspector-model"><option value="A">Neural A · historique</option><option value="B">Neural B · historique</option><option value="C">Neural C · historique</option><option value="Experimental">Cerveau expérimental</option></select></label><div id="nrl-network-view" aria-live="polite">Chargez un cerveau pour inspecter son architecture.</div><p id="nrl-network-provenance"></p><p id="nrl-brain-status">Aucun cerveau expÃ©rimental importÃ©.</p><hr><h3>ArrÃªt d'entraÃ®nement (configuration)</h3><div class="nrl-inline"><label>GÃ©nÃ©rations max<input id="nrl-max-gen" type="number" min="1" max="5" value="1"></label><label>Ã‰pisodes max<input id="nrl-max-episodes" type="number" min="2" max="40" step="8" value="8"></label></div><label>Population<input id="nrl-population" type="number" min="2" max="8" value="8"></label><label>Seuil fitness<input id="nrl-fitness-threshold" type="number" placeholder="dï¿½sactivï¿½"></label><label>Taux rï¿½ussite cible<input id="nrl-success-threshold" type="number" min="0" max="1" step="0.05" placeholder="dï¿½sactivï¿½"></label><div class="nrl-actions"><button data-action="train">Entraï¿½nement court</button><button data-action="train-resume">Reprendre checkpoint</button><button data-action="train-stop" disabled>Arrï¿½t manuel</button></div><p id="nrl-training-status" role="status">Worker expï¿½rimental arrï¿½tï¿½.</p><p class="nrl-note">Lancement uniquement sur action explicite; limite interface: 5 gï¿½nï¿½rations, 40 ï¿½pisodes maximum. ï¿½volution arcade distincte des expï¿½riences historiques.</p></section>
      <section class="nrl-card nrl-results"><h2>Classement et mesures</h2><div class="nrl-chart-wrap"><canvas id="nrl-chart" width="720" height="210" aria-label="Comparaison des scores de course"></canvas><h3>Fitness par génération</h3><label>Source des courbes<select id="nrl-fitness-source"><option value="session">Entraînement de cette session</option><option value="A">Archive historique A</option><option value="B">Archive historique B</option><option value="C">Archive historique C</option></select></label><label id="nrl-fitness-seed-wrap" hidden>Graine historique<select id="nrl-fitness-seed"><option value="all">Toutes les graines (moyenne par génération)</option></select></label><p id="nrl-training-parameters">Aucun historique de génération de cette session.</p><canvas id="nrl-fitness-chart" width="720" height="210" aria-label="Fitness moyenne et meilleure par génération"></canvas></div><div class="nrl-table-wrap"><table><thead><tr><th>Pilote</th><th>Circuit</th><th>Reussites</th><th>Meilleur tour</th><th>Collisions</th><th>Sorties / temps</th><th>Progression</th><th>Score jeu</th><th>Provenance</th></tr></thead><tbody id="nrl-rows"><tr><td colspan="9">Aucune course exÃ©cutÃ©e.</td></tr></tbody></table></div><div class="nrl-actions"><button id="nrl-view3d" data-action="view3d" disabled>Visualiser la dernière manche en 3D</button><button id="nrl-replay" data-action="replay" disabled>Replay synchronisé</button><button data-action="replay-export" disabled>Exporter le replay</button><label class="nrl-all-tracks"><input id="nrl-generalization" type="checkbox"> Comparer circuit connu, held-out et circuits utilisateur</label><button data-action="json" disabled>Exporter rÃ©sultats JSON</button><button data-action="csv" disabled>Exporter résultats CSV</button><button data-action="report-csv" disabled>Rapport scientifique CSV</button><button data-action="report" disabled>Générer rapport expérimental</button></div><section class="nrl-replay" id="nrl-replay-panel" hidden><div class="nrl-replay-controls"><button data-action="replay-toggle">Lecture</button><button data-action="replay-back">−1 image</button><button data-action="replay-forward">+1 image</button><label>Vue<select id="nrl-replay-view"><option value="overview">Circuit complet</option><option value="follow">Suivre pilote A</option><option value="compare">Trajectoires côte à côte</option></select></label><label>Pilote A<select id="nrl-replay-a"></select></label><label>Pilote B<select id="nrl-replay-b"></select></label></div><input id="nrl-replay-timeline" type="range" min="0" max="0" value="0" aria-label="Chronologie du replay"><p id="nrl-replay-time">Replay non chargé.</p><canvas id="nrl-replay-canvas" width="900" height="440" aria-label="Replay des trajectoires de course"></canvas></section><section class="nrl-failures"><h3>Analyse des incidents observés</h3><div id="nrl-failure-zones">Aucun replay analysé.</div></section><p class="nrl-note">Collisions et contacts de piste sont comptÃ©s par voiture. Sortie de piste = pas oÃ¹ la position prÃ©-correction dÃ©passe la largeur admissible; durÃ©e cumulÃ©e en pas fixes. RÃ©ussite = franchir le nombre de tours avant fin du heat. Le score jeu n'est pas une rÃ©compense scientifique.</p></section></div>`;
    this.app.append(this.root); this.rows = this.root.querySelector('#nrl-rows'); this.chart = this.root.querySelector('#nrl-chart'); this.context = this.chart.getContext('2d'); this.fitnessChart = this.root.querySelector('#nrl-fitness-chart'); this.fitnessContext = this.fitnessChart.getContext('2d'); this.replayCanvas = this.root.querySelector('#nrl-replay-canvas'); this.replayContext = this.replayCanvas.getContext('2d');
  }
  events() {
    const signal = this.listeners.signal;
    this.root.addEventListener('click', (e) => { const action = e.target.closest('[data-action]')?.dataset.action; if (action === 'menu') this.onReturn?.(); if (action === 'run') this.run(); if (action === 'create') this.createBrain(); if (action === 'json') this.exportJson(); if (action === 'csv') this.exportCsv(); if (action === 'report') this.exportReport(); if (action === 'report-csv') this.exportReportCsv(); if (action === 'view3d') this.viewLastHeat(); if (action === 'replay') this.openReplay(); if (action === 'replay-export') this.exportReplay(); if (action === 'replay-toggle') this.toggleReplay(); if (action === 'replay-back') this.seekReplay(-1); if (action === 'replay-forward') this.seekReplay(1); if (action === 'train') this.startTraining(false); if (action === 'train-resume') this.startTraining(true); if (action === 'train-stop') this.stopTraining(); }, { signal });
    this.root.querySelector('#nrl-import').addEventListener('change', (e) => this.importBrain(e), { signal });
    this.root.querySelector('#nrl-inspector-model').addEventListener('change', (e) => this.selectBrain(e.target.value), { signal });
    this.root.querySelector('#nrl-fitness-source').addEventListener('change', () => this.drawFitnessCurve(), { signal });
    this.root.querySelector('#nrl-fitness-seed').addEventListener('change', () => this.drawFitnessCurve(), { signal });
    this.root.querySelector('#nrl-replay-timeline').addEventListener('input', (e) => { this.replayCursor = Number(e.target.value); this.drawReplay(); }, { signal });
    this.root.querySelector('#nrl-replay-view').addEventListener('change', () => this.drawReplay(), { signal });
    this.root.querySelector('#nrl-replay-a').addEventListener('change', () => this.drawReplay(), { signal });
    this.root.querySelector('#nrl-replay-b').addEventListener('change', () => this.drawReplay(), { signal });
  }
  async getDrivers() {
    const selected = [...this.root.querySelectorAll('.nrl-models input:checked')].map((x) => x.value);
    if (selected.length < 2) throw new Error('SÃ©lectionnez au moins deux pilotes.');
    const track = this.tracks.find((x) => x.id === this.root.querySelector('#nrl-track').value);
    if (!track.boundaries) throw new Error('Ce circuit utilisateur nâ€™a pas encore de limites converties pour les capteurs du moteur; choisissez un circuit intÃ©grÃ©.');
    const drivers = [];
    for (const name of selected) {
      if (name === 'Steering') drivers.push({ name, provenance: 'RaceController · référence arcade', architecture: null, createController: (t) => new RaceController(t) });
      else if (name === 'Experimental') {
        if (!this.experimental) throw new Error('Importez ou crÃ©ez dâ€™abord un cerveau expÃ©rimental.');
        const network = this.experimental;
        drivers.push({ name, provenance: `neurodrive-experimental-brain v1 · ${network.architecture.join('-')} · espace jeu`, architecture: [...network.architecture], createController: (t) => new ExperimentalBrainAdapter(network, t) });
      }
      else {
        let entry = this.models.get(name);
        if (!entry) { entry = await loadHistoricalBrain(name); this.models.set(name, entry); }
        drivers.push({ name: `Neural ${name}`, provenance: `${entry.provenance.source} · graine ${entry.provenance.seed} · historique VehicleDynamics; évalué GameVehicleDynamics`, architecture: [...entry.network.architecture], createController: (t) => new HistoricalBrainAdapter(entry.network, t) });
      }
    }
    return { track, drivers };
  }
  async run() {
    if (this.running || this.disposed) return;
    const button = this.root.querySelector('[data-action="run"]'); button.disabled = true; this.running = true;
    const status = this.root.querySelector('#nrl-status'); this.results = [];
    try {
      const { track: selectedTrack, drivers } = await this.getDrivers();
      const tracks = this.root.querySelector('#nrl-generalization').checked ? this.tracks : [selectedTrack];
      const baseSeed = Number(this.root.querySelector('#nrl-seed').value) >>> 0;
      this.results = []; this.lastReplay = null;
      for (const [trackIndex, track] of tracks.entries()) {
        if (!track.boundaries) throw new Error(`Circuit ${track.label} sans limites exploitables par les capteurs.`);
        const seed = (baseSeed + trackIndex * drivers.length) >>> 0;
        const schedule = createBalancedHeats(drivers.map((d) => d.name), { seed, rotations: drivers.length });
        const physics = { engine: 'GameVehicleDynamics', dt: 1 / 60, laps: 1, maxSpeed: 58, maxForce: 28, trackHalfWidth: track.halfWidth ?? 8.2, gridWidth: 5.4, gridSpacing: 8 };
        const protocol = { heats: schedule.map((heat) => ({ ...heat, trackId: track.id, physics, grid: heat.grid })) };
        const fairness = validateFairness(protocol);
        if (!fairness.valid) throw new Error(`Ã‰quitÃ© non validÃ©e : ${fairness.reason}`);
        for (const [i, heat] of protocol.heats.entries()) {
          if (this.disposed) break;
          const ordered = [...heat.grid].sort((a, b) => a.slot - b.slot).map(({ driver }) => drivers.find((d) => d.name === driver));
          status.textContent = `Circuit ${trackIndex + 1}/${tracks.length} · manche ${i + 1}/${protocol.heats.length} · seed ${heat.seed} · ${track.label}`;
          const measured = await runRaceHeat(track, ordered, {
            seed: heat.seed, laps: 1, maxSteps: 9000, recordReplay: true,
            onProgress: ({ step, activations }) => {
              if (this.disposed) return;
              status.textContent = `Circuit ${trackIndex + 1}/${tracks.length} · manche ${i + 1}/${protocol.heats.length} · ${Math.floor(step / 60)} s simulées`;
              this.captureActivationProgress(ordered, activations);
            },
            shouldStop: () => this.disposed,
          });
          const replay = measured.replay;
          const result = { ...measured }; delete result.replay;
          const failureAnalysis = analyzeReplayFailures(replay, track);
          this.results.push({ trackId: track.id, trackLabel: track.label, trackCategory: result.trackCategory, heat: i + 1, protocol, result, failureAnalysis, provenance: ordered.map((d) => ({ driver: d.name, source: d.provenance })) });
          this.lastTrack = track; this.lastDrivers = drivers; this.lastReplay = replay; this.lastFailureZones = failureAnalysis;
          this.lastHeatDrivers = ordered; this.lastHeatSeed = heat.seed;
          this.renderResults(); this.renderFailureZones(); this.updateReplayAvailability();
        }
      }
      status.textContent = `Terminé · ${this.results.length} manches sur ${tracks.length} circuit(s) · seed de base ${baseSeed} · grilles tournantes validées.`;
    } catch (error) { status.textContent = `Ã‰valuation impossible : ${error.message}`; }
    finally { this.running = false; if (!this.disposed) button.disabled = false; }
  }
  async viewLastHeat() {
    if (!this.lastTrack || !this.lastHeatDrivers) return;
    const { RaceSession } = await import('../game/RaceSession.js');
    this.root.hidden = true;
    try {
      this.viewer = new RaceSession({ trackDefinition: this.lastTrack, driverAssignments: this.lastHeatDrivers, raceSeed: this.lastHeatSeed, laps: 1, returnLabel: 'Retour au laboratoire', onReturn: () => { this.viewer?.dispose(); this.viewer = null; if (!this.disposed) this.root.hidden = false; } });
    } catch (error) { this.root.hidden = false; this.root.querySelector('#nrl-status').textContent = `Vue 3D indisponible : ${error.message}`; }
  }
  updateReplayAvailability() {
    const valid = Boolean(this.lastReplay && validateRaceReplay(this.lastReplay).valid);
    this.root.querySelector('#nrl-replay').disabled = !valid;
    this.root.querySelector('[data-action="replay-export"]').disabled = !valid;
  }
  openReplay() {
    if (!this.lastReplay || !validateRaceReplay(this.lastReplay).valid) return;
    const replay = this.lastReplay;
    for (const [id, index] of [['#nrl-replay-a', 0], ['#nrl-replay-b', Math.min(1, replay.drivers.length - 1)]]) {
      const select = this.root.querySelector(id);
      select.innerHTML = replay.drivers.map((driver) => `<option value="${esc(driver.id)}">${esc(driver.name)}</option>`).join('');
      select.value = replay.drivers[index].id;
    }
    const timeline = this.root.querySelector('#nrl-replay-timeline'); timeline.min = '0'; timeline.max = String(replay.frames.length - 1); timeline.value = '0';
    this.replayCursor = 0; this.root.querySelector('#nrl-replay-panel').hidden = false; this.drawReplay();
  }
  toggleReplay() {
    if (!this.lastReplay) return;
    this.replayPlaying = !this.replayPlaying;
    const button = this.root.querySelector('[data-action="replay-toggle"]');
    button.textContent = this.replayPlaying ? 'Pause' : 'Lecture';
    if (this.replayTimer) clearInterval(this.replayTimer);
    this.replayTimer = null;
    if (this.replayPlaying) {
      const interval = Math.max(20, Math.round(1000 / this.lastReplay.sampleRate));
      this.replayTimer = setInterval(() => {
        if (!this.lastReplay || this.replayCursor >= this.lastReplay.frames.length - 1) { this.replayPlaying = false; clearInterval(this.replayTimer); this.replayTimer = null; button.textContent = 'Lecture'; return; }
        this.replayCursor += 1; this.drawReplay();
      }, interval);
    }
  }
  seekReplay(amount) {
    if (!this.lastReplay) return;
    this.replayCursor = Math.max(0, Math.min(this.lastReplay.frames.length - 1, this.replayCursor + amount));
    this.drawReplay();
  }
  drawReplay() {
    if (!this.lastReplay || !this.replayCanvas) return;
    const replay = this.lastReplay;
    const frameIndex = Math.max(0, Math.min(replay.frames.length - 1, this.replayCursor));
    const frame = replay.frames[frameIndex];
    const canvas = this.replayCanvas, ctx = this.replayContext;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#090d13'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const selectedA = this.root.querySelector('#nrl-replay-a').value;
    const selectedB = this.root.querySelector('#nrl-replay-b').value;
    const mode = this.root.querySelector('#nrl-replay-view').value;
    if (mode === 'compare') {
      const gap = 16, panelWidth = (canvas.width - gap) / 2;
      this.drawReplayMap(ctx, frameIndex, { x: 0, y: 0, width: panelWidth, height: canvas.height }, selectedA, selectedA);
      this.drawReplayMap(ctx, frameIndex, { x: panelWidth + gap, y: 0, width: panelWidth, height: canvas.height }, selectedB, selectedB);
    } else this.drawReplayMap(ctx, frameIndex, { x: 0, y: 0, width: canvas.width, height: canvas.height }, mode === 'follow' ? selectedA : null, mode === 'follow' ? selectedA : null);
    const events = replay.events.filter((event) => Math.abs(event.step - frame.step) <= replay.frames[Math.min(frameIndex + 1, replay.frames.length - 1)].step - frame.step + 1);
    const eventText = events.length ? ` · ${events.map((event) => `${event.driver}: ${event.type}`).join(', ')}` : '';
    this.root.querySelector('#nrl-replay-time').textContent = `${frame.time.toFixed(2)} s · image ${frameIndex + 1}/${replay.frames.length}${eventText} · échantillon de poses arcade`;
    const timeline = this.root.querySelector('#nrl-replay-timeline'); timeline.value = String(frameIndex);
  }
  drawReplayMap(ctx, frameIndex, rect, focusId, highlightId) {
    const replay = this.lastReplay, track = this.lastTrack, frame = replay.frames[frameIndex];
    const points = track.waypoints, xs = points.map((p) => p.x), zs = points.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const baseScale = Math.min((rect.width - 42) / Math.max(maxX - minX, 1), (rect.height - 50) / Math.max(maxZ - minZ, 1));
    const focusCar = focusId ? frame.cars.find((car) => car.id === focusId) : null;
    const zoom = focusCar ? 1.8 : 1;
    const centerX = focusCar ? focusCar.x : (minX + maxX) / 2, centerZ = focusCar ? focusCar.z : (minZ + maxZ) / 2;
    const scale = baseScale * zoom;
    const project = (x, z) => ({ x: rect.x + rect.width / 2 + (x - centerX) * scale, y: rect.y + rect.height / 2 + (z - centerZ) * scale });
    const colors = ['#e10600', '#56a8ff', '#ffd35a', '#4bd4a0', '#c891ff', '#ff9a58', '#e8edf3', '#ed78a7'];
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
    ctx.strokeStyle = '#36404c'; ctx.lineWidth = Math.max(6, (track.halfWidth ?? 8) * 2 * scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
    points.forEach((p, i) => { const point = project(p.x, p.z); if (!i) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,240,240,.35)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    for (const [carIndex, driver] of replay.drivers.entries()) {
      const color = colors[carIndex % colors.length];
      ctx.strokeStyle = `${color}99`; ctx.lineWidth = driver.id === highlightId ? 2.6 : 1.2; ctx.beginPath(); let started = false;
      for (const sample of replay.frames.slice(0, frameIndex + 1)) { const car = sample.cars.find((entry) => entry.id === driver.id); if (!car) continue; const p = project(car.x, car.z); if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      const current = frame.cars.find((car) => car.id === driver.id); if (!current) continue;
      const p = project(current.x, current.z); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, driver.id === highlightId ? 6 : 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f5f5f5'; ctx.font = '10px monospace'; ctx.fillText(driver.name, p.x + 8, p.y - 6);
    }
    ctx.fillStyle = '#f5f5f5'; ctx.font = '11px monospace'; ctx.fillText(focusCar ? `Suivi · ${focusCar.name}` : track.label ?? track.id, rect.x + 12, rect.y + 18);
    ctx.restore();
  }
  renderFailureZones() {
    const host = this.root.querySelector('#nrl-failure-zones');
    const zones = this.lastFailureZones ?? [];
    host.innerHTML = zones.length
      ? `<table><thead><tr><th>Événement observé</th><th>Segment projeté</th><th>Occurrences</th><th>Pilotes</th><th>Interprétation</th></tr></thead><tbody>${zones.map((zone) => `<tr><td>${esc(zone.type)}</td><td>${zone.segmentIndex + 1}</td><td>${zone.events}</td><td>${zone.drivers.map(esc).join(', ')}</td><td>${esc(zone.cause)}</td></tr>`).join('')}</tbody></table>`
      : 'Aucun incident détecté dans les échantillons de ce replay; les compteurs de résultat restent la source pour les totaux de manche.';
  }
  exportReplay() { if (this.lastReplay && validateRaceReplay(this.lastReplay).valid) saveFile(`neurodrive-replay-${this.lastReplay.track.id}-seed-${this.lastReplay.seed}-v${this.lastReplay.version}.json`, JSON.stringify(this.lastReplay, null, 2), 'application/json'); }
  createBrain() {
    try {
      const parse = (selector) => this.root.querySelector(selector).value.split(',').map((x) => Number(x.trim()));
      const brain = new ExperimentalNetwork({ sensorAngles: parse('#nrl-angles'), sensorRange: Number(this.root.querySelector('#nrl-range').value), hiddenLayers: parse('#nrl-hidden'), activation: this.root.querySelector('#nrl-activation').value });
      this.experimental = brain; saveFile('neurodrive-experimental-brain-v1.json', JSON.stringify(brain.toJSON(), null, 2), 'application/json');
      this.ensureExperimentalChoice();
      this.root.querySelector('#nrl-inspector-model').value = 'Experimental'; this.selectBrain('Experimental');
      this.root.querySelector('#nrl-brain-status').textContent = `Format v1 Â· architecture ${brain.architecture.join('-')} Â· exportÃ©; espace expÃ©rimental.`;
    } catch (error) { this.root.querySelector('#nrl-brain-status').textContent = error.message; }
  }
  async importBrain(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { this.experimental = ExperimentalNetwork.fromJSON(await file.text()); this.ensureExperimentalChoice(); this.root.querySelector('#nrl-inspector-model').value = 'Experimental'; this.selectBrain('Experimental'); this.root.querySelector('#nrl-brain-status').textContent = `Import validÃ© Â· architecture ${this.experimental.architecture.join('-')}.`; }
    catch (error) { this.root.querySelector('#nrl-brain-status').textContent = `Import refusÃ© : ${error.message}`; }
    event.target.value = '';
  }
  ensureExperimentalChoice() {
    const list = this.root.querySelector('.nrl-models');
    if (!list.querySelector('[value="Experimental"]')) { const label = document.createElement('label'); label.innerHTML = '<input type="checkbox" value="Experimental" checked> Cerveau expÃ©rimental'; list.append(label); }
  }
  async selectBrain(name) {
    try {
      if (name === 'Experimental') {
        if (!this.experimental) throw new Error('Créez ou importez un cerveau expérimental pour l’inspecter.');
        this.inspectorNetwork = this.experimental;
        this.inspectorProvenance = this.experimental.provenance;
      } else {
        let entry = this.models.get(name);
        if (!entry) { entry = await loadHistoricalBrain(name); this.models.set(name, entry); }
        this.inspectorNetwork = entry.network;
        this.inspectorProvenance = { ...entry.provenance, architecture: entry.network.architecture };
      }
      this.inspectorName = name;
      this.renderNetworkInspector();
      this.onTutorialEvent?.('brain-inspected', { architecture: [...this.inspectorNetwork.architecture], sensorCount: name === 'Experimental' ? this.experimental.sensorAngles.length : 5, provenance: this.inspectorProvenance });
    } catch (error) {
      this.root.querySelector('#nrl-network-view').textContent = error.message;
      this.root.querySelector('#nrl-network-provenance').textContent = '';
    }
  }
  renderNetworkInspector() {
    if (!this.inspectorNetwork) return;
    const key = this.inspectorName === 'Experimental' ? 'Experimental' : `Neural ${this.inspectorName}`;
    this.root.querySelector('#nrl-network-view').innerHTML = renderNetworkDiagram(this.inspectorNetwork, this.activationSamples.get(key) ?? []);
    const provenance = this.inspectorProvenance ?? {};
    this.root.querySelector('#nrl-network-provenance').textContent = [
      `Architecture ${this.inspectorNetwork.architecture.join('-')}`,
      provenance.configuration ? `Configuration ${provenance.configuration}` : null,
      provenance.seed != null ? `Graine historique ${provenance.seed}` : null,
      provenance.physics ?? provenance.historicalPhysics ?? null,
      'Affichage arcade; les poids du modèle historique restent inchangés.',
    ].filter(Boolean).join(' · ');
  }
  captureActivationProgress(drivers, activations) {
    for (const entry of activations ?? []) this.activationSamples.set(entry.driver, entry.values.map((layer) => [...layer]));
    if (!this.inspectorName) return;
    const expected = this.inspectorName === 'Experimental' ? 'Experimental' : `Neural ${this.inspectorName}`;
    if (drivers.some((driver) => driver.name === expected) && this.activationSamples.has(expected)) this.renderNetworkInspector();
  }
  getTrainingConfig() {
    const number = (selector) => Number(this.root.querySelector(selector).value);
    const generations = number('#nrl-max-gen'), populationSize = number('#nrl-population'), maxEpisodes = number('#nrl-max-episodes');
    if (!Number.isInteger(generations) || generations < 1 || generations > 5 || !Number.isInteger(populationSize) || populationSize < 2 || populationSize > 8 || !Number.isInteger(maxEpisodes) || maxEpisodes < populationSize || maxEpisodes > 40) throw new RangeError('Validation limitÃ©e Ã  5 gÃ©nÃ©rations, 8 individus et 40 Ã©pisodes.');
    const parse = (selector) => this.root.querySelector(selector).value.split(',').map((x) => Number(x.trim()));
    const networkConfig = { sensorAngles: parse('#nrl-angles'), sensorRange: number('#nrl-range'), hiddenLayers: parse('#nrl-hidden'), activation: this.root.querySelector('#nrl-activation').value };
    new ExperimentalNetwork({ ...networkConfig, random: () => 0.5 });
    const optional = (selector) => this.root.querySelector(selector).value === '' ? null : Number(this.root.querySelector(selector).value);
    return { generations, populationSize, maxEpisodes, seed: Number(this.root.querySelector('#nrl-seed').value) >>> 0, trackId: this.root.querySelector('#nrl-track').value, networkConfig, stopConditions: { maxGenerations: generations, maxEpisodes, fitnessThreshold: optional('#nrl-fitness-threshold'), successRateThreshold: optional('#nrl-success-threshold') }, maxSteps: 1800 };
  }
  startTraining(resume) {
    if (this.trainingWorker || this.disposed) return;
    let config; try { config = this.getTrainingConfig(); } catch (error) { this.root.querySelector('#nrl-training-status').textContent = error.message; return; }
    this.currentTrainingConfig = structuredClone(config);
    this.currentTrainingRunId = this.trainingRuns.length + 1;
    this.currentTrainingHistory = [];
    const key = `neurodrive.experimental-training.checkpoint.v1.${encodeURIComponent(JSON.stringify(config))}`; let checkpoint = null;
    if (resume) { try { checkpoint = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch (error) { this.root.querySelector('#nrl-training-status').textContent = `Checkpoint illisible: ${error.message}`; return; } if (!checkpoint) { this.root.querySelector('#nrl-training-status').textContent = 'Aucun checkpoint expÃ©rimental.'; return; } }
    // Preserve checkpoints from earlier experimental runs under their own protocol keys.
    const worker = new Worker(new URL('./experimentalTrainingWorker.js', import.meta.url), { type: 'module' });
    this.trainingClient = new TrainingWorkerClient(worker); this.trainingWorker = worker;
    this.root.querySelector('[data-action="train-stop"]').disabled = false;
    this.root.querySelector('#nrl-training-status').textContent = resume ? 'Reprise du dernier checkpoint completâ€¦' : 'Worker expÃ©rimental dÃ©marrÃ©.';
    this.trainingClient.onMessage = (data) => {
      if (data.type === 'checkpoint') { try { localStorage.setItem(key, JSON.stringify(data.checkpoint)); } catch { if (!this.disposed) this.root.querySelector('#nrl-training-status').textContent = 'Checkpoint reÃ§u; stockage local indisponible.'; } }
      if (data.type === 'generation' && !this.disposed) { this.currentTrainingHistory.push(structuredClone(data.generation)); this.trainingHistory.push({ ...structuredClone(data.generation), runId: this.currentTrainingRunId, seed: config.seed, trackId: config.trackId, architecture: [config.networkConfig.sensorAngles.length + 1, ...config.networkConfig.hiddenLayers, 2] }); this.drawFitnessCurve(); this.root.querySelector('#nrl-training-status').textContent = `GÃ©nÃ©ration ${data.generation.generation}/${config.generations} Â· score ${data.generation.globalBestFitness.toFixed(2)} Â· ${data.generation.episodesTotal} Ã©pisodes`; }
      if (data.type === 'complete') {
        this.trainingHistory = this.trainingHistory.filter((row) => row.runId !== this.currentTrainingRunId).concat(data.result.history.map((row) => ({ ...structuredClone(row), runId: this.currentTrainingRunId, seed: config.seed, trackId: config.trackId, architecture: [config.networkConfig.sensorAngles.length + 1, ...config.networkConfig.hiddenLayers, 2] })));
        this.trainingRuns.push({ runId: this.currentTrainingRunId, config: this.currentTrainingConfig, result: { generation: data.result.generation, evaluations: data.result.evaluations, bestFitness: data.result.bestFitness, stopped: data.result.stopped }, history: structuredClone(data.result.history) });
        if (data.result.bestNetwork && !this.disposed) { this.experimental = ExperimentalNetwork.fromJSON(data.result.bestNetwork); this.ensureExperimentalChoice(); saveFile('neurodrive-experimental-brain-trained-v1.json', JSON.stringify(this.experimental.toJSON(), null, 2), 'application/json'); if (this.root.querySelector('#nrl-inspector-model').value === 'Experimental') this.selectBrain('Experimental'); }
        this.drawFitnessCurve(); this.updateResearchExportAvailability();
        if (!this.disposed) this.root.querySelector('#nrl-training-status').textContent = `TerminÃ© Â· ${data.result.generation} gÃ©nÃ©rations Â· ${data.result.evaluations} Ã©pisodes Â· score ${Number(data.result.bestFitness).toFixed(2)}.`;
        if (this.trainingWorker === worker) this.trainingWorker = null; if (!this.disposed) this.root.querySelector('[data-action="train-stop"]').disabled = true;
      }
      if (data.type === 'error') { if (!this.disposed) this.root.querySelector('#nrl-training-status').textContent = `Worker: ${data.message}`; if (this.trainingWorker === worker) this.trainingWorker = null; if (!this.disposed) this.root.querySelector('[data-action="train-stop"]').disabled = true; }
    };
    worker.onerror = (event) => { if (!this.disposed) this.root.querySelector('#nrl-training-status').textContent = `Worker indisponible: ${event.message}`; this.trainingClient?.terminate(); this.trainingWorker = null; };
    this.trainingClient.send({ type: 'start', config, checkpoint });
  }
  stopTraining() { if (!this.trainingWorker) return; this.root.querySelector('#nrl-training-status').textContent = 'ArrÃªt demandÃ©; fin de gÃ©nÃ©ration et checkpoint complet en cours.'; this.trainingClient?.requestStop(); this.root.querySelector('[data-action="train-stop"]').disabled = true; }
  renderResults() {
    const aggregate = new Map();
    for (const record of this.results) for (const item of record.result.results) {
      const key = `${record.trackId}:${record.trackCategory}:${item.driver}`;
      const entry = aggregate.get(key) ?? { ...item, trackId: record.trackId, trackLabel: record.trackLabel, trackCategory: record.trackCategory, progress: 0, collisions: 0, offTrackEvents: 0, offTrackTime: 0, successes: 0, fitness: 0, bestLapTime: null, heats: 0, provenance: record.provenance.find((p) => p.driver === item.driver)?.source };
      entry.heats++; entry.progress += item.progress; entry.collisions += item.collisions; entry.offTrackEvents += item.offTrackEvents; entry.offTrackTime += item.offTrackTime; entry.successes += Number(item.success); entry.fitness += item.fitness;
      entry.bestLapTime = item.bestLapTime != null && (entry.bestLapTime == null || item.bestLapTime < entry.bestLapTime) ? item.bestLapTime : entry.bestLapTime;
      aggregate.set(key, entry);
    }
    const ranked = [...aggregate.values()].map((x) => ({ ...x, progress: x.progress / x.heats, collisions: x.collisions / x.heats, offTrackEvents: x.offTrackEvents / x.heats, offTrackTime: x.offTrackTime / x.heats, successRate: x.successes / x.heats, fitness: x.fitness / x.heats })).sort((a,b) => b.fitness - a.fitness);
    this.rows.innerHTML = ranked.map((x, i) => `<tr><td>${i + 1}. ${esc(x.driver)}</td><td>${esc(x.trackLabel)}<small>${esc(x.trackCategory)}</small></td><td>${x.successes}/${x.heats} (${(x.successRate * 100).toFixed(0)}%)</td><td>${x.bestLapTime?.toFixed(2) ?? 'N/D'}</td><td>${x.collisions.toFixed(1)} / heat</td><td>${x.offTrackEvents.toFixed(1)} / ${x.offTrackTime.toFixed(2)}s</td><td>${(x.progress * 100).toFixed(1)}%</td><td>${x.fitness.toFixed(1)}</td><td>${esc(x.provenance ?? '')}</td></tr>`).join('');
    if (this.lastDrivers?.length) this.root.querySelector('#nrl-view3d').disabled = false;
    for (const selector of ['[data-action="json"]', '[data-action="csv"]']) this.root.querySelector(selector).disabled = !this.results.length;
    this.updateResearchExportAvailability();
    this.drawChart(ranked);
  }
  updateResearchExportAvailability() {
    const available = Boolean(this.results.length || this.trainingRuns.length);
    for (const selector of ['[data-action="report"]', '[data-action="report-csv"]']) this.root.querySelector(selector).disabled = !available;
  }
  drawChart(rows) {
    const ctx = this.context, { width, height } = this.chart; ctx.clearRect(0,0,width,height); ctx.fillStyle = '#09141d'; ctx.fillRect(0,0,width,height); if (!rows.length) return;
    const max = Math.max(...rows.map((x) => x.fitness), 1); rows.forEach((x,i) => { const w = Math.min(190, width / rows.length - 20), x0 = i * width / rows.length + 12, h = Math.max(4, x.fitness / max * (height - 42)); ctx.fillStyle = ['#57d8aa','#58a8ff','#ffcc55','#ed7284'][i % 4]; ctx.fillRect(x0,height-28-h,w,h); ctx.fillStyle='#e5eef1'; ctx.font='12px sans-serif'; ctx.fillText(x.driver,x0,height-10); ctx.fillText(x.fitness.toFixed(0),x0,height-34-h); });
  }
  drawFitnessCurve() {
    const { width, height } = this.fitnessChart;
    const ctx = this.fitnessContext;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#09141d'; ctx.fillRect(0, 0, width, height);
    const source = this.root.querySelector('#nrl-fitness-source').value;
    if (source !== 'session') { this.drawHistoricalFitness(source); return; }
    this.root.querySelector('#nrl-fitness-seed-wrap').hidden = true;
    const rows = this.trainingHistory;
    this.root.querySelector('#nrl-training-parameters').textContent = rows.length
      ? `Données observées : ${rows.length} enregistrements · générations max ${this.currentTrainingConfig?.generations ?? this.trainingRuns.at(-1)?.config.generations ?? 'N/D'} · population ${this.currentTrainingConfig?.populationSize ?? this.trainingRuns.at(-1)?.config.populationSize ?? 'N/D'} · seed ${this.currentTrainingConfig?.seed ?? this.trainingRuns.at(-1)?.config.seed ?? 'N/D'} · circuit ${this.currentTrainingConfig?.trackId ?? this.trainingRuns.at(-1)?.config.trackId ?? 'N/D'}.`
      : 'Aucun historique de génération dans cette session; aucune donnée de fitness à tracer.';
    if (!rows.length) return;
    const runs = [...new Set(rows.map((row) => row.runId))];
    const values = rows.flatMap((row) => [row.meanFitness, row.bestFitness, row.globalBestFitness]).filter(Number.isFinite);
    const min = Math.min(0, ...values), max = Math.max(...values, min + 1), left = 42, right = width - 12, top = 14, bottom = height - 28;
    ctx.strokeStyle = 'rgba(225,235,245,.14)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = top + (bottom - top) * i / 4; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
    const yAt = (value) => bottom - (value - min) / (max - min) * (bottom - top);
    const colors = [['meanFitness', '#58a8ff'], ['bestFitness', '#e10600'], ['globalBestFitness', '#ffcc55']];
    runs.forEach((runId, runIndex) => {
      const runRows = rows.filter((row) => row.runId === runId).sort((a, b) => a.generation - b.generation);
      const maxGeneration = Math.max(...runRows.map((row) => row.generation), 1);
      for (const [key, color] of colors) {
        ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = runIndex === runs.length - 1 ? 2.2 : 1.3; ctx.setLineDash(runIndex ? [5, 3] : []);
        runRows.forEach((row, index) => { if (!Number.isFinite(row[key])) return; const x = left + (right - left) * row.generation / maxGeneration, y = yAt(row[key]); if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
    ctx.fillStyle = '#aeb8c4'; ctx.font = '10px sans-serif'; ctx.fillText('Valeur fitness observée', 8, 12); ctx.fillText(`génération ${rows[0].generation}`, left, height - 8); ctx.fillText(`génération ${rows.at(-1).generation}`, right - 110, height - 8);
  }
  async drawHistoricalFitness(configuration) {
    const seedWrap = this.root.querySelector('#nrl-fitness-seed-wrap'); seedWrap.hidden = false;
    const seedSelect = this.root.querySelector('#nrl-fitness-seed');
    const parameters = this.root.querySelector('#nrl-training-parameters');
    const requestId = (this.historicalFitnessRequestId ?? 0) + 1; this.historicalFitnessRequestId = requestId;
    parameters.textContent = `Chargement de l'archive historique ${configuration}…`;
    try {
      const all = await loadHistoricalFitness(configuration);
      if (this.disposed || requestId !== this.historicalFitnessRequestId || this.root.querySelector('#nrl-fitness-source').value !== configuration) return;
      const currentSeed = seedSelect.value;
      seedSelect.replaceChildren(new Option('Toutes les graines (moyenne par génération)', 'all'));
      for (const seed of all.availableSeeds) seedSelect.add(new Option(`Graine ${seed}`, seed));
      if (all.availableSeeds.includes(currentSeed)) seedSelect.value = currentSeed;
      const data = seedSelect.value === 'all' ? all : await loadHistoricalFitness(configuration, { seed: seedSelect.value });
      if (this.disposed || requestId !== this.historicalFitnessRequestId || this.root.querySelector('#nrl-fitness-source').value !== configuration) return;
      this.paintFitnessRows(data.curve.map((row) => ({ ...row, runId: 'historical' })), `${configuration} · ${data.seedSelection === 'all' ? `${data.availableSeeds.length} graines, moyenne par génération` : `graine ${data.seedSelection}`} · ${all.metricLabels.best} / ${all.metricLabels.mean} · source CSV phase 4–8`);
    } catch (error) {
      if (requestId === this.historicalFitnessRequestId) parameters.textContent = `Archive historique ${configuration} indisponible : ${error.message}`;
    }
  }
  paintFitnessRows(rows, details) {
    const { width, height } = this.fitnessChart, ctx = this.fitnessContext;
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#09141d'; ctx.fillRect(0, 0, width, height);
    this.root.querySelector('#nrl-training-parameters').textContent = details;
    const values = rows.flatMap((row) => [row.meanFitness, row.bestFitness, row.globalBestFitness]).filter(Number.isFinite);
    if (!values.length) return;
    const min = Math.min(0, ...values), max = Math.max(...values, min + 1), left = 42, right = width - 12, top = 14, bottom = height - 28;
    ctx.strokeStyle = 'rgba(225,235,245,.14)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = top + (bottom - top) * i / 4; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
    const yAt = (value) => bottom - (value - min) / (max - min) * (bottom - top);
    for (const [key, color] of [['meanFitness', '#58a8ff'], ['bestFitness', '#e10600'], ['globalBestFitness', '#ffcc55']]) {
      const points = rows.filter((row) => Number.isFinite(row[key])); if (!points.length) continue;
      const maxGeneration = Math.max(...points.map((row) => row.generation), 1);
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      points.forEach((row, index) => { const x = left + (right - left) * row.generation / maxGeneration, y = yAt(row[key]); if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
    }
    ctx.fillStyle = '#aeb8c4'; ctx.font = '10px sans-serif'; ctx.fillText('Fitness archivée', 8, 12); ctx.fillText(`génération ${rows[0].generation}`, left, height - 8); ctx.fillText(`génération ${rows.at(-1).generation}`, right - 110, height - 8);
  }
  exportJson() { saveFile('neural-racing-results-v1.json', JSON.stringify({ format: 'neurodrive-neural-racing-results', version: 1, space: 'game-arcade', records: this.results, trainingRuns: this.trainingRuns, trainingHistory: this.trainingHistory }, null, 2), 'application/json'); }
  exportCsv() { const rows = [['heat','track','trackCategory','driverId','status','laps','lapTimes','bestLapTime','finishTime','collisions','carCollisions','trackContacts','offTrackEvents','offTrackTime','progress','success','fitness','seed','provenance']]; for (const rec of this.results) for (const x of rec.result.results) rows.push([rec.heat,rec.trackId,rec.trackCategory,x.driverId,x.status,x.completedLaps,(x.lapTimes ?? []).join(';'),x.bestLapTime ?? '',x.finishTime ?? '',x.collisions,x.carCollisions,x.trackContacts,x.offTrackEvents,x.offTrackTime,x.progress,x.success,x.fitness,rec.result.seed,rec.provenance.find((p) => p.driver === x.driver)?.source ?? '']); saveFile('neural-racing-results-v1.csv', rows.map((r) => r.map((x) => `"${String(x).replaceAll('"','""')}"`).join(',')).join('\r\n'), 'text/csv'); }
  createResearchReport() { return buildResearchReport({ results: this.results, trainingRuns: this.trainingRuns, models: (this.lastDrivers ?? []).map(({ name, architecture, provenance }) => ({ name, architecture, provenance, space: 'game-arcade-evaluation' })), replayMetadata: this.lastReplay ? { format: this.lastReplay.format, version: this.lastReplay.version, track: this.lastReplay.track, seed: this.lastReplay.seed, sampleRate: this.lastReplay.sampleRate, frameCount: this.lastReplay.frames.length } : null, failureZones: this.results.flatMap((record) => record.failureAnalysis ?? []) }); }
  exportReport() { const report = this.createResearchReport(); saveFile('neurodrive-arcade-research-report-v1.json', JSON.stringify(report, null, 2), 'application/json'); }
  exportReportCsv() { saveFile('neurodrive-arcade-research-report-v1.csv', researchReportToCsv(this.createResearchReport()), 'text/csv'); }
  dispose() { if (this.disposed) return; this.disposed = true; this.listeners.abort(); if (this.replayTimer) clearInterval(this.replayTimer); this.viewer?.dispose(); this.viewer = null; this.trainingClient?.requestStop(); this.root.remove(); }
}
