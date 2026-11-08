import * as THREE from 'three';
import { FormulaCar } from '../scene/FormulaCar.js';
import { SceneManager } from '../scene/SceneManager.js';
import { createGeneralizationTracks } from '../ai/training/GeneralizationTracks.js';
import { RaceWorld } from './RaceWorld.js';
import { RaceLeaderboard } from './RaceLeaderboard.js';
import { RaceDiagnostics, isRaceDiagnosticsEnabled } from './RaceDiagnostics.js';
import { getRacePresentation } from './RacePresentation.js';
import { RaceCameras } from './RaceCameras.js';
import { createRosterRaceWorld } from './createRosterRaceWorld.js';
import { audioManager } from './AudioManager.js';
import { hapticsManager } from './HapticsManager.js';
import { readGameSettings } from '../settings/GameSettings.js';
import { getRaceCoachSnapshot, renderRaceForceVectors, formatRaceForce } from './RaceCoach.js';
import { RaceLabVisuals, drawNeuralNetwork } from './RaceLabVisuals.js';
import './race-session.css';
import { RaceVisualState } from './RaceVisualState.js';
import { RaceParticles } from './RaceParticles.js';
import { CareerStore } from './CareerStore.js';
import { createRaceReplay, ReplayRecorder } from '../neural-lab/ReplayProtocol.js';
import { RaceTutorial, TUTORIAL_GUIDANCE } from './RaceTutorial.js';
import { bindRaceFocusSafety, readRaceInput } from './RaceControls.js';
import { createMinimapProjector, formatRaceGap } from './RaceMinimap.js';

const FIXED_STEP = 1 / 60;
const MAX_STEPS_PER_FRAME = 8;
export const NEURAL_ACTIVATION_LAYER_LABELS = Object.freeze(['ENTRÉES', 'COUCHE CACHÉE 1', 'COUCHE CACHÉE 2', 'SORTIES']);
const TRACK_NAMES = { original: 'CIRCUIT AZUR', technical: 'CIRCUIT TECHNIQUE', 'fast-oval': 'OVALE RAPIDE' };
const CAMERA_NAMES = { chase: 'POURSUITE', trackside: 'BORD DE PISTE', cockpit: 'COCKPIT', overview: 'AÃ‰RIENNE' };
CAMERA_NAMES.tv = 'CAMÉRA TV'; CAMERA_NAMES.photo = 'PHOTO';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return 'â€”';
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${(seconds - minutes * 60).toFixed(2).padStart(5, '0')}`;
};

export function setIntegratedLabInstructions(ui, type) {
  const instructions = ui.querySelector('.race-command-help p');
  if (!instructions) throw new Error('RaceSession HUD contract: .race-command-help p must exist before configuring an integrated lab.');
  instructions.textContent = type === 'neural'
    ? 'Pilote observé : sélection dans le panneau Neural Lab · Espace pause · R recommencer · C caméra.'
    : '↑/W accélérer · ↓/S freiner · ←/→/A/D braquer · Espace pause · C caméra.';
}

export function getRaceCarAppearance(car, { isHuman = false, liveryColor = car.color, secondaryColor = 0xf5f5f5, driverNumber = 7 } = {}) {
  return {
    primaryColor: isHuman && Number.isFinite(liveryColor) ? liveryColor : car.color,
    secondaryColor: isHuman && Number.isInteger(secondaryColor) && secondaryColor >= 0 && secondaryColor <= 0xffffff ? secondaryColor : 0xf0bf66,
    driverNumber: isHuman && Number.isInteger(driverNumber) && driverNumber >= 0 && driverNumber <= 99 ? driverNumber : null,
  };
}

export class RaceSession {
  constructor({ trackId = 'original', trackDefinition = null, onReturn, onRaceFinished = () => {}, onChampionshipAdvance = () => {}, championshipRound = null, aiDifficulty = 'balanced', initialConditions = null, driverAssignments = null, laboratory = null, raceSeed = 1, laps = 3, formationLap = false, returnLabel = 'Retour au menu', liveryColor = 0xe10600, tutorial = false, professorMode = false, persistResults = true } = {}) {
    const availableTracks = createGeneralizationTracks();
    const resolvedTrack = trackDefinition ?? availableTracks.find((entry) => entry.id === trackId);
    if (!resolvedTrack) throw new RangeError(`Circuit « ${trackId} » introuvable ou non chargé; aucun circuit de remplacement n’a été choisi.`);
    this.app = document.querySelector('#app');
    this.app.classList.add('race-session');
    this.onReturn = onReturn;
    this.driverAssignments = driverAssignments;
    this.laboratory = laboratory;
    this.labTimeScale = 1;
    this.raceSeed = raceSeed;
    this.laps = laps;
    this.persistResults = Boolean(persistResults);
    this.formationLap = Boolean(formationLap && !driverAssignments);
    this.aiDifficulty = ['prudent', 'balanced', 'aggressive'].includes(aiDifficulty) ? aiDifficulty : 'balanced';
    this.initialConditions = initialConditions;
    this.championshipRound = championshipRound;
    this.onChampionshipAdvance = onChampionshipAdvance;
    this.liveryColor = liveryColor;
    this.careerStore = new CareerStore(); this.onRaceFinished = onRaceFinished;
    const driverProfile = this.careerStore.read().profile;
    const secondaryColorValue = Number.parseInt(String(driverProfile.preferences?.secondaryLivery ?? '#f5f5f5').replace('#', ''), 16);
    this.driverSecondaryColor = Number.isInteger(secondaryColorValue) ? secondaryColorValue : 0xf5f5f5;
    this.driverNumber = Number.isInteger(driverProfile.preferences?.driverNumber) && driverProfile.preferences.driverNumber >= 0 && driverProfile.preferences.driverNumber <= 99 ? driverProfile.preferences.driverNumber : 7;
    this.replayRecorder = new ReplayRecorder({ maxFrames: this.careerStore.maxReplayFrames });
    this.gameSettings = readGameSettings();
    this.returnLabel = returnLabel;
    this.tutorialGuide = tutorial ? (tutorial instanceof RaceTutorial ? tutorial : new RaceTutorial()) : null;
    this.disposed = false;
    this.paused = false;
    this.hudMode = 'full';
    this.listeners = new AbortController();
    this.keys = new Set();
    this.raceDiagnostics = new RaceDiagnostics({ enabled: isRaceDiagnosticsEnabled });
    this.displayedRanks = new Map();
    this.finalStandings = null;
    this.accumulator = 0;
    this.previousTime = performance.now();
    this.uiTime = 0;
    this.lastTutorialPosition = null;
    this.lastTutorialLaps = 0;
    this.replayStep = 0; this.replaySaved = false;
    this.podiumElapsed = 0;
    this.cameraShake = 0;
    this.cameraShakePhase = 0;
    this.track = resolvedTrack;
    try {
      this.mountUi();
      this.scene = new SceneManager(document.querySelector('#viewport'), this.track);
      this.visualState = new RaceVisualState();
      if (this.initialConditions) this.visualState.setConditions(this.initialConditions);
      this.particles = new RaceParticles(this.scene.scene, { bounds: 90 });
      this.scene.setVisualState(this.visualState.update(0)); this.particles.setRain(this.gameSettings.effects && this.visualState.weatherPreset === 'rain'); this.crowdExcitement = 0.12; this.crowdTick = 0;
      this.scene.car.root.visible = false;
      this.world = this.driverAssignments
        ? createRosterRaceWorld(this.track, this.driverAssignments, { laps: this.laps, seed: this.raceSeed, onDiagnostic: (record) => this.raceDiagnostics.emit(record, this.displayedRanks) })
        : new RaceWorld(this.track, { carCount: 6, laps: this.laps, playerIndex: 0, trackHalfWidth: this.track.halfWidth ?? 8.2, onDiagnostic: (record) => this.raceDiagnostics.emit(record, this.displayedRanks) });
      this.applyAiDifficulty();
      if (this.tutorialGuide) this.world.setGameplayMechanics(true);
      const playerIndex = this.world.cars.findIndex((car) => car.isPlayer);
      if (!this.driverAssignments && playerIndex >= 0) {
        const player = this.world.cars[playerIndex];
        player.name = driverProfile.name;
        if (Number.isFinite(this.liveryColor)) player.color = this.liveryColor;
      }
      this.carViews = this.world.cars.map((car, index) => new FormulaCar(this.scene.scene, getRaceCarAppearance(car, {
        isHuman: !this.driverAssignments && index === playerIndex,
        liveryColor: this.liveryColor, secondaryColor: this.driverSecondaryColor, driverNumber: this.driverNumber,
      })));
      this.cameras = new RaceCameras(this.scene.camera, this.track);
      this.cameras.mode = this.gameSettings.cameraMode;
      this.cameras.setTarget(this.world.cars[0].id);
      this.updateCarPicker();
      this.initializeCoachPanel();
      if (this.laboratory) this.mountIntegratedLabPanel();
      if (this.tutorialGuide || (professorMode && this.laboratory?.type !== 'neural')) this.toggleCoach(true);
      if (this.driverAssignments) {
        this.ui.querySelector('.race-brand small').textContent = 'NEURAL RACING LAB Â· MANCHE 3D';
        this.ui.querySelector('[data-action="menu"]').textContent = this.returnLabel;
        this.ui.querySelector('.race-box-title b').textContent = `${this.driverAssignments.length} VOITURES`;
      }
      if (this.laboratory) {
        this.ui.classList.add('integrated-lab', `integrated-lab-${this.laboratory.type}`);
        this.ui.querySelector('.race-brand small').textContent = this.laboratory.type === 'neural' ? 'NEURAL LAB · ENVIRONNEMENT F1' : 'STEERING LAB · ENVIRONNEMENT F1';
        this.ui.querySelector('[data-action="menu"]').textContent = this.returnLabel;
        setIntegratedLabInstructions(this.ui, this.laboratory.type);
        this.ui.querySelector('#race-coach-toggle').hidden = this.laboratory.type !== 'steering';
      }
      if (this.initialConditions) {
        this.ui.querySelector('#race-time-select').value = this.initialConditions.day ?? 'day';
        this.ui.querySelector('#race-weather-select').value = this.initialConditions.weather ?? 'dry';
      }
      if (this.championshipRound) this.ui.querySelector('[data-action="menu"]').textContent = 'Quitter le Grand Prix';
      if (this.championshipRound) this.ui.querySelector('.finish-actions').insertAdjacentHTML('afterbegin', '<button type="button" data-action="championship-next">RETOUR AU CHAMPIONNAT</button>');
      this.world.start({ formationLap: this.formationLap });
      this.lastLights = this.world.director.redLights;
      this.lastRaceState = this.world.director.state;
      this.lastCollisionCount = this.world.collisionCount;
      this.lastPlayerOffTrack = 0;
      this.finishScene = null;
      this.attachEvents();
      this.frameId = requestAnimationFrame((now) => this.animate(now));
    } catch (error) {
      this.listeners.abort();
      try { this.particles?.dispose(); } catch (cleanupError) { console.error('[NeuroDrive F1] Particle cleanup failed', cleanupError); }
      try { this.scene?.dispose(); } catch (cleanupError) { console.error('[NeuroDrive F1] Scene cleanup failed', cleanupError); }
      this.ui?.remove();
      this.app.classList.remove('race-session');
      throw error;
    }
  }

  mountUi() {
    this.ui = document.createElement('section');
    this.ui.className = 'race-ui';
    const activeTrackName = escapeHtml(this.track.userCircuit ? this.track.label : TRACK_NAMES[this.track.id] ?? this.track.label);
    this.ui.innerHTML = `
      <header class="race-header"><div class="race-brand"><b>ND</b><span>NEURODRIVE <i>AI</i><small>F1 RACING Â· PHASE 11</small></span></div><div class="race-state"><i class="race-state-dot"></i><span class="race-flag" id="race-flag" title="Drapeau vert · conditions normales">VERT</span><span id="race-status">DÃ‰PART</span><b id="race-clock">00:00.00</b></div><button type="button" data-action="menu">Retour au menu</button></header>
      <aside class="race-telemetry"><small>VITESSE</small><strong><span id="race-speed">0</span><i>KM/H</i></strong><div class="race-speedbar"><i id="race-speedbar"></i></div><div class="race-metric"><span>TOUR</span><b id="race-lap">01 / ${String(this.laps).padStart(2, '0')}</b></div><div class="race-metric"><span>MEILLEUR TOUR</span><b id="race-best">â€”</b></div><div class="race-metric"><span>COLLISIONS</span><b id="race-collisions">0</b></div><div class="race-metric"><span>SORTIES</span><b id="race-offtrack">0</b></div><div class="race-metric"><span>CIRCUIT</span><b id="race-track">${activeTrackName}</b></div><div class="race-driver"><span class="race-driver-dot"></span><span>JOUEUR Â· CLAVIER</span></div></aside>
      <aside class="race-advanced" aria-label="Mécaniques de course"><div class="race-box-title"><span>MÉCANIQUES ARCADE</span><label><input id="race-mechanics-enabled" type="checkbox"> ACTIVÉES</label></div><div class="race-advanced-grid"><div><small>RAPPORT</small><b id="race-gear">1</b><small>RPM</small><b id="race-rpm">3000</b></div><div><small>DRS</small><b id="race-drs">FERMÉ</b><small>ERS</small><b id="race-ers">100%</b></div><div><small>PNEUS / USURE</small><b id="race-tyre-state">MEDIUM · 0%</b><small>DÉGÂTS</small><b id="race-damage">0%</b></div></div><div class="race-advanced-actions"><label>Boîte<select id="race-gearbox"><option value="automatic">Automatique</option><option value="manual">Manuelle</option></select></label><button type="button" data-action="shift-down" aria-label="Rétrograder">−</button><button type="button" data-action="shift-up" aria-label="Monter un rapport">+</button><label>Pneus pour arrêt<select id="race-tyre"><option value="soft">Soft</option><option value="medium" selected>Medium</option><option value="hard">Hard</option></select></label></div><div class="race-advanced-actions"><button type="button" data-action="drs" title="Actif seulement dans la zone droite avec un poursuivant à une seconde">DRS</button><small>Zone droite · poursuivant à ≤ 1 s</small><label><input id="race-ers-toggle" type="checkbox"> Déployer ERS</label><button type="button" data-action="pit">Arrêt stands</button></div><small id="race-pit-status">Stand non sollicité.</small><small>Les systèmes arcade restent séparés du moteur scientifique.</small></aside><aside class="race-conditions" aria-label="Conditions visuelles"><label>Éclairage<select id="race-time-select"><option value="day">Jour</option><option value="sunset">Coucher de soleil</option><option value="night">Nuit</option></select></label><label>Météo<select id="race-weather-select"><option value="dry">Sec</option><option value="wet">Humide</option><option value="rain">Pluie</option></select></label><small>Réglages visuels uniquement · surface arcade inchangée</small></aside><aside class="race-leaderboard"><div class="race-box-title"><span>CLASSEMENT</span><b>6 VOITURES</b></div><ol id="race-ranks"></ol><div class="race-next"><small>VOITURE SUIVIE</small><select id="race-car-select" aria-label="SÃ©lectionner la voiture Ã  suivre"></select></div></aside>
      <div class="race-start-lights" id="race-lights" aria-live="polite"><div class="race-light-row"><i></i><i></i><i></i><i></i><i></i></div><strong id="race-countdown">3</strong></div>
      <div class="race-formation-notice hidden" id="race-formation-notice" role="status">FORMATION AUTOMATIQUE — CONTRÔLES TEMPORAIREMENT INACTIFS</div>
      <aside class="race-minimap"><div class="race-box-title"><span>MINI-CARTE</span><b>LIVE</b></div><canvas id="race-map" width="250" height="170" aria-label="Mini-carte du circuit"></canvas></aside>
      <aside class="race-coach hidden" id="race-coach" aria-label="Mode professeur"><div class="race-coach-heading"><div><small>LABORATOIRE ARCADE</small><b>MODE PROFESSEUR</b></div><button type="button" data-action="coach-close" aria-label="Fermer le mode professeur">×</button></div><label class="race-coach-field">PILOTE OBSERVÉ<select id="race-coach-driver" aria-label="Pilote IA observé"></select></label><label class="race-coach-field">PERSONNALITÉ<select id="race-coach-profile"><option value="prudent">Prudent</option><option value="balanced">Équilibré</option><option value="aggressive">Agressif</option></select></label><div class="race-coach-limits" id="race-coach-limits"></div><label class="race-coach-check"><input id="race-coach-defense" type="checkbox"><span>Défense adaptative</span></label><div class="race-coach-decision"><small>DÉCISION OBSERVÉE</small><p id="race-coach-decision">En attente du premier calcul de contrôle.</p></div><div class="race-coach-grid"><div><small>FORCES PONDÉRÉES · PLAN X/Z</small><div id="race-coach-vector"></div></div><div class="race-coach-force-list" id="race-coach-force-list"></div></div><button type="button" class="race-coach-reset" data-action="coach-reset">Réinitialiser les réglages Steering</button><div class="race-coach-settings" id="race-coach-settings"></div><small class="race-coach-note">Priorité : combinaison additive pondérée. Mesures issues du contrôleur arcade actif.</small></aside><footer class="race-controls"><button type="button" data-action="pause"><kbd>ESPACE</kbd><span id="race-pause-label">PAUSE</span></button><button type="button" data-action="restart"><kbd>R</kbd><span>RECOMMENCER</span></button><button type="button" data-action="camera"><kbd>C</kbd><span id="race-camera-label">POURSUITE</span></button><button type="button" data-action="camera-tv">TV</button><button type="button" data-action="photo">PHOTO</button><button type="button" data-action="coach" id="race-coach-toggle" aria-expanded="false">PROFESSEUR</button><button type="button" data-action="audio" aria-pressed="${audioManager.settings.enabled}">AUDIO</button><span class="race-key-guide"><b>â†‘</b> ACCÃ‰LÃ‰RER <b>â†“</b> FREINER <b>â† â†’</b> BRAQUER <b>1â€“6</b> SUIVRE</span></footer>
      <aside class="race-photo-bar hidden" id="race-photo-bar"><span>MODE PHOTO · glisser pour orbiter · molette pour zoomer</span><button type="button" data-action="photo-capture">CAPTURER</button><button type="button" data-action="photo-exit">FERMER</button></aside><div class="race-pause-overlay hidden" id="race-pause-overlay"><div><small>NEURODRIVE AI Â· COURSE SUSPENDUE</small><strong>PAUSE</strong><span>ESPACE POUR REPRENDRE</span></div></div>
      <div class="race-finish-overlay hidden" id="race-finish-overlay"><div><small>COURSE TERMINÃ‰E Â· CLASSEMENT FINAL</small><strong id="race-winner">VICTOIRE</strong><ol id="race-final-ranks"></ol><div class="finish-actions"><button type="button" data-action="restart">REJOUER</button><button type="button" data-action="menu">RETOUR AU MENU</button></div></div></div>`;
    this.app.append(this.ui);
    this.configureHudLayout();
    if (this.tutorialGuide) this.ui.insertAdjacentHTML('beforeend', '<aside class="race-tutorial" id="race-tutorial" aria-live="polite"></aside>');
    this.updateTutorialPanel();
    this.rankList = this.ui.querySelector('#race-ranks');
    this.mapCanvas = this.ui.querySelector('#race-map');
    this.mapContext = this.mapCanvas.getContext('2d');
  }

  configureHudLayout() {
    const header = this.ui.querySelector('.race-header');
    header.querySelector('.race-brand small').textContent = 'F1 RACING · COURSE RAPIDE';
    const state = header.querySelector('.race-state');
    const menuButton = header.querySelector('[data-action="menu"]');
    const pauseButton = this.ui.querySelector('.race-controls [data-action="pause"]');
    const actions = document.createElement('div');
    actions.className = 'race-header-actions';
    actions.append(pauseButton, menuButton);
    const hudButton = document.createElement('button');
    hudButton.type = 'button'; hudButton.dataset.action = 'hud-mode'; hudButton.textContent = 'HUD';
    hudButton.setAttribute('aria-label', 'Changer le mode d’affichage du HUD');
    const mechanicsButton = document.createElement('button');
    mechanicsButton.type = 'button'; mechanicsButton.dataset.action = 'toggle-mechanics'; mechanicsButton.textContent = '⚙';
    mechanicsButton.setAttribute('aria-label', 'Ouvrir les mécaniques et conditions de course');
    mechanicsButton.setAttribute('aria-expanded', 'false');
    actions.append(hudButton, mechanicsButton);
    header.append(actions);
    const lap = this.ui.querySelector('#race-lap').closest('.race-metric');
    state.append(lap);
    const telemetry = this.ui.querySelector('.race-telemetry');
    const positionMetric = document.createElement('div'); positionMetric.className = 'race-metric'; positionMetric.innerHTML = '<span>POSITION EN COURSE</span><b id="race-player-position">— / 6</b>';
    telemetry.insertBefore(positionMetric, telemetry.querySelector('.race-metric'));
    const driver = telemetry.querySelector('.race-driver');
    driver.insertAdjacentHTML('beforebegin', '<div class="race-metric"><span>RAPPORT</span><b id="race-gear-compact">1</b></div><div class="race-metric"><span>RPM</span><b id="race-rpm-compact">3000</b></div>');
    const advanced = this.ui.querySelector('.race-advanced');
    advanced.classList.add('hidden');
    advanced.append(this.ui.querySelector('.race-conditions'));
    const footer = this.ui.querySelector('.race-controls');
    const systemReadout = document.createElement('div');
    systemReadout.className = 'race-system-readout';
    systemReadout.innerHTML = '<span>DRS <b id="race-drs-compact">FERMÉ</b></span><span>ERS <b id="race-ers-compact">100%</b></span><span id="race-brake-indicator">FREIN</span>';
    const help = document.createElement('details');
    help.className = 'race-command-help';
    help.innerHTML = '<summary>COMMANDES</summary><p><kbd>↑</kbd>/<kbd>W</kbd> accélérer · <kbd>↓</kbd>/<kbd>S</kbd> freiner · <kbd>←</kbd>/<kbd>A</kbd> et <kbd>→</kbd>/<kbd>D</kbd> tourner · <kbd>E</kbd>/<kbd>Q</kbd> rapports manuels · <kbd>F</kbd> DRS · <kbd>V</kbd> ERS · <kbd>Espace</kbd> pause · <kbd>C</kbd> caméra · <kbd>R</kbd> recommencer</p>';
    footer.append(systemReadout, help);
    const map = this.ui.querySelector('.race-minimap');
    map.insertAdjacentHTML('beforeend', '<div class="race-map-legend"><span><i class="player"></i>VOUS</span><span><i class="opponent"></i>IA</span><button type="button" data-action="map-size" aria-label="Agrandir la mini-carte">AGRANDIR</button></div>');
    this.ui.querySelector('.race-key-guide')?.remove();
  }

  mountIntegratedLabPanel() {
    const neural = this.laboratory.type === 'neural';
    const provenance = this.laboratory.models?.map((model) => `<li><b>${escapeHtml(model.name)}</b><small>${escapeHtml(model.provenance)}</small></li>`).join('') ?? '';
    const activeTrackLabel = this.track.userCircuit ? this.track.label : TRACK_NAMES[this.track.id] ?? this.track.label;
    this.ui.insertAdjacentHTML('beforeend', `<aside class="race-lab-panel" id="integrated-lab-panel" aria-label="Panneau du laboratoire intégré">
      <header><small>NEURODRIVE F1 · LABORATOIRE</small><b>${neural ? 'NEURAL LAB' : 'STEERING LAB'}</b></header>
      <label class="race-lab-field">VOITURE OBSERVÉE<select id="lab-follow-car"></select></label>
      <p class="race-lab-track" id="lab-track-class">${escapeHtml(activeTrackLabel)}</p>
      ${neural ? `<p class="race-lab-caution">${escapeHtml(this.laboratory.methodNote ?? 'Évaluation arcade distincte des résultats scientifiques historiques.')}</p><ul class="race-lab-provenance">${provenance}</ul>
        <div class="race-lab-readout"><span>MODÈLE DE LA VOITURE SUIVIE</span><b id="lab-neural-model">—</b><span>ARCHITECTURE</span><b id="lab-architecture">—</b><span>RÉSEAU EN DIRECT · POIDS ET ACTIVATIONS DU MODÈLE</span><canvas class="lab-network-canvas" id="lab-network-canvas" role="img" aria-label="Réseau neuronal et activations réelles"></canvas><span>VITESSE / ÉCART</span><b id="lab-neural-speed">—</b><span>PROGRESSION · DISTANCE</span><b id="lab-neural-distance">—</b><span>INCIDENTS</span><b id="lab-neural-incidents">—</b><span>ENTRÉES MESURÉES</span><div id="lab-neural-inputs"></div><span>SORTIES RÉELLES</span><b id="lab-neural-outputs">En attente de l’inférence</b><details><summary>Activations numériques</summary><div id="lab-neural-activations"></div></details></div>`
        : `<p class="race-lab-caution">Contrôle humain face à cinq RaceController arcade. Les poids visibles sont ceux réellement utilisés; la poursuite est conditionnelle à un dépassement.</p>
        <div class="race-lab-readout"><span>VITESSE · POSITION</span><b id="lab-steering-speed">—</b><span>ÉCART PATH FOLLOWING</span><b id="lab-steering-path">—</b><span>ÉTAT CONTRÔLEUR</span><b id="lab-steering-state">—</b><span>FORCES ACTIVES</span><div id="lab-steering-behaviors"></div><span>COLLISIONS · SORTIES</span><b id="lab-steering-incidents">—</b></div>
        <label class="race-lab-vector-toggle"><input id="lab-show-vectors" type="checkbox" checked> AFFICHER VECTEURS 3D</label><div class="race-lab-vector-legend"><span><i style="--vector:#f5f5f5"></i>Path force</span><span><i style="--vector:#ffad42"></i>Obstacle</span><span><i style="--vector:#57c7ff"></i>Separation</span><span><i style="--vector:#e10600"></i>Pursuit</span><span><i style="--vector:#a9e86e"></i>Résultante</span><span><i style="--vector:#72d9c7"></i>Vitesse</span><span><i style="--vector:#fff176"></i>Cible désirée</span></div>
        <button type="button" class="race-lab-action" data-action="coach">VECTEURS ET RÉGLAGES DE FORCES</button>`}
      <label class="race-lab-field">VITESSE DE SIMULATION<select id="lab-time-scale"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option></select></label>
      <details class="race-lab-comparison" open><summary>COMPARAISON DES PILOTES · MÊME MANCHE</summary><div class="race-lab-table-wrap"><table><thead><tr><th>PILOTE / CONTRÔLEUR</th><th>KM/H</th><th>PROGRÈS · M</th><th>TOURS</th><th>INCIDENTS</th><th>STATUT / ARRIVÉE</th></tr></thead><tbody id="lab-comparison-body"></tbody></table></div><small>Conditions partagées dans cette course arcade; ces mesures ne sont pas des résultats scientifiques historiques.</small></details>
      <small class="race-lab-footnote">Même SceneManager, Track, FormulaCar, RaceWorld et caméras du jeu. Les résultats de cette manche restent dans l’espace arcade.</small>
    </aside>`);
    const labPanel = this.ui.querySelector('#integrated-lab-panel');
    const labHeader = labPanel.querySelector('header');
    const labContent = document.createElement('div');
    labContent.className = 'race-lab-content';
    labContent.id = 'integrated-lab-content';
    for (const child of [...labPanel.children]) if (child !== labHeader) labContent.append(child);
    labPanel.append(labContent);
    if (!neural) {
      const followAi = document.createElement('button');
      followAi.type = 'button'; followAi.className = 'race-lab-action'; followAi.dataset.action = 'lab-follow-steering-ai';
      followAi.textContent = 'SUIVRE UNE VOITURE STEERING IA';
      labContent.append(followAi);
    }
    const collapseButton = document.createElement('button');
    collapseButton.type = 'button'; collapseButton.className = 'race-lab-collapse';
    collapseButton.textContent = 'RÉDUIRE'; collapseButton.setAttribute('aria-expanded', 'true');
    collapseButton.setAttribute('aria-controls', labContent.id);
    labHeader.append(collapseButton);
    collapseButton.addEventListener('click', () => {
      const collapsed = labPanel.classList.toggle('is-collapsed');
      collapseButton.textContent = collapsed ? 'OUVRIR' : 'RÉDUIRE';
      collapseButton.setAttribute('aria-expanded', String(!collapsed));
    }, { signal: this.listeners.signal });
    const target = this.ui.querySelector('#lab-follow-car');
    target.innerHTML = this.world.cars.map((car) => `<option value="${escapeHtml(car.id)}">P${car.number} · ${escapeHtml(car.name)}</option>`).join('');
    const initialTarget = neural ? this.world.cars.find((car) => car.controller?.network) ?? this.world.cars[0] : this.world.cars.find((car) => !car.isPlayer && car.controller) ?? this.world.cars[0];
    target.value = initialTarget?.id ?? '';
    if (initialTarget) { this.cameras.setTarget(initialTarget.id); this.ui.querySelector('#race-car-select').value = initialTarget.id; }
    if (!neural) {
      this.labVisuals = new RaceLabVisuals(this.scene.scene);
      const vectorToggle = this.ui.querySelector('#lab-show-vectors');
      vectorToggle.addEventListener('change', () => this.labVisuals.setEnabled(vectorToggle.checked), { signal: this.listeners.signal });
    }
    target.addEventListener('change', () => this.syncLabCarSelection(target.value), { signal: this.listeners.signal });
    this.ui.querySelector('#lab-time-scale').addEventListener('change', (event) => { this.labTimeScale = Number(event.target.value); }, { signal: this.listeners.signal });
    this.updateIntegratedLabPanel();
  }

  updateIntegratedLabPanel() {
    if (!this.laboratory) return;
    const id = this.ui.querySelector('#lab-follow-car')?.value ?? this.cameras?.targetId;
    const car = this.world.cars.find((candidate) => candidate.id === id) ?? this.world.cars[0];
    if (!car) return;
    const telemetry = this.world.getDriverTelemetry(car);
    const pathProjection = this.world.timing.path.project(car.position);
    if (this.laboratory.type === 'steering') {
      const controller = car.controller;
      const data = controller?.getDecisionData?.(car);
      const place = RaceLeaderboard.rank(this.world.cars).find((entry) => entry.id === car.id)?.position ?? '—';
      this.ui.querySelector('#lab-steering-speed').textContent = `${(car.velocity.length() * 3.6).toFixed(0)} km/h · P${place}`;
      this.ui.querySelector('#lab-steering-path').textContent = `${(data?.path?.distanceToPath ?? pathProjection.distance).toFixed(2)} m · ${((data?.path?.curvatureRadians ?? 0) * 180 / Math.PI).toFixed(0)}°`;
      this.ui.querySelector('#lab-steering-state').textContent = controller?.getDecisionSummary?.() ?? (car.isPlayer ? 'Pilotage humain : aucune force Steering IA n’est calculée pour cette voiture. Sélectionnez une voiture IA pour observer ses forces.' : 'Diagnostics non publiés par ce contrôleur');
      const behaviors = controller?.getBehaviorConfiguration?.() ?? [];
      this.ui.querySelector('#lab-steering-behaviors').innerHTML = behaviors.map((behavior) => `<div class="lab-behavior"><span>${escapeHtml(behavior.name)}</span><b>${behavior.active ? behavior.name === 'pursuit' ? (behavior.runtimeActive ? 'ACTIF' : 'CONDITIONNEL') : 'ACTIF' : 'INACTIF'}</b><small>poids ${Number(behavior.weight).toFixed(2)}</small></div>`).join('') || '<small>Aucune force exposée par ce contrôleur.</small>';
      const followAi = this.ui.querySelector('[data-action="lab-follow-steering-ai"]');
      if (followAi) followAi.hidden = !car.isPlayer;
      if (car.isPlayer && behaviors.length === 0) this.ui.querySelector('#lab-steering-behaviors').textContent = 'Pilotage humain : aucune force Steering IA n’est calculée pour cette voiture.';
      this.ui.querySelector('#lab-steering-incidents').textContent = `${telemetry.carCollisions} collisions · ${telemetry.offTrackEvents} sorties · ${telemetry.offTrackTime.toFixed(1)} s hors piste`;
      this.labVisuals?.update(car, data);
      this.updateLabComparison();
      return;
    }
    const controller = car.controller;
    const adapter = controller?.network ? controller : null;
    const network = adapter?.network;
    const assignment = this.driverAssignments?.find((entry) => entry.id === car.driverId);
    const commands = adapter?.controller?.lastCommands;
    const observation = adapter?.lastObservation;
    this.ui.querySelector('#lab-neural-model').textContent = assignment?.name ?? (network ? 'Modèle sans provenance de roster publiée' : 'Steering AI · aucun réseau neuronal sur cette voiture');
    this.ui.querySelector('#lab-architecture').textContent = network?.architecture?.join(' · ') ?? 'Steering · pas de réseau';
    this.ui.querySelector('#lab-neural-speed').textContent = `${(car.velocity.length() * 3.6).toFixed(1)} km/h · écart ${pathProjection.distance.toFixed(2)} m · tour ${car.completedLaps}`;
    const totalDistance = Math.max(0, car.validatedProgress ?? car.completedLaps * this.world.timing.path.totalLength + car.progress * this.world.timing.path.totalLength);
    this.ui.querySelector('#lab-neural-distance').textContent = `${totalDistance.toFixed(1)} m · ${car.raceTime.toFixed(1)} s simulées`;
    this.ui.querySelector('#lab-neural-incidents').textContent = `${telemetry.carCollisions} collisions · ${telemetry.offTrackEvents} sorties · ${telemetry.offTrackTime.toFixed(1)} s hors piste`;
    const labels = ['capteur −60°', 'capteur −30°', 'capteur 0°', 'capteur +30°', 'capteur +60°', 'vitesse normalisée', 'erreur cap / π'];
    const input = observation?.map((value, index) => `<span>${labels[index]} <b>${Number(value).toFixed(3)}</b></span>`).join('') ?? 'Entrées non publiées par ce contrôleur';
    this.ui.querySelector('#lab-neural-inputs').innerHTML = input;
    this.ui.querySelector('#lab-neural-outputs').textContent = commands ? `direction ${commands.steering.toFixed(3)} · commande longitudinale ${commands.throttleBrake.toFixed(3)} · force ${this.world.lastForces.get(car.id)?.length().toFixed(2) ?? '0.00'} unités arcade` : 'Contrôleur Steering sélectionné · sorties réseau non applicables';
    const layers = adapter?.controller?.lastActivations ?? [];
    this.ui.querySelector('#lab-neural-activations').innerHTML = layers.length ? layers.map((values, index) => `<div class="lab-activation-layer"><small>${NEURAL_ACTIVATION_LAYER_LABELS[index] ?? `COUCHE ${index}`}</small><div>${values.map((value) => `<i title="${Number(value).toFixed(4)}" style="--activation:${Math.min(1, Math.abs(Number(value)))}"></i>`).join('')}</div></div>`).join('') : '<small>Pas d’activations réseau pour ce pilote.</small>';
    if (!this.ui.querySelector('#integrated-lab-panel').classList.contains('is-collapsed')) {
      drawNeuralNetwork(this.ui.querySelector('#lab-network-canvas'), network, layers);
    }
    this.updateLabComparison();
  }

  updateLabComparison() {
    const body = this.ui?.querySelector('#lab-comparison-body');
    if (!body || !this.world) return;
    body.innerHTML = this.world.cars.map((car) => {
      const telemetry = this.world.getDriverTelemetry(car);
      const assignment = this.driverAssignments?.find((entry) => entry.id === car.driverId);
      const controllerName = car.isPlayer ? 'Humain' : assignment?.name ?? (car.controller?.network ? 'Neural' : car.controller?.getBehaviorConfiguration ? 'Steering AI' : 'Contrôleur non publié');
      const status = car.finished ? 'ARRIVÉ' : this.world.director.state === 'finished' ? 'NON TERMINÉ' : this.world.director.state === 'racing' ? 'EN COURSE' : this.world.director.state.toUpperCase();
      const arrival = car.finished ? formatTime(car.finishTime) : '—';
      const progress = Number.isFinite(car.validatedProgress) ? car.validatedProgress.toFixed(1) : '—';
      return `<tr class="${car.isPlayer ? 'is-human' : ''}"><th>${escapeHtml(car.name)}<small>${escapeHtml(controllerName)}</small></th><td>${(car.velocity.length() * 3.6).toFixed(0)}</td><td>${progress}</td><td>${car.completedLaps}/${this.laps}</td><td>${telemetry.carCollisions} · ${telemetry.offTrackEvents}</td><td>${status}<small>${arrival}</small></td></tr>`;
    }).join('');
  }

  updateLabVectorOverlay() {
    if (!this.labVisuals || !this.world) return;
    const selectedId = this.ui.querySelector('#lab-follow-car')?.value;
    const car = this.world.cars.find((candidate) => candidate.id === selectedId);
    this.labVisuals.update(car, car?.controller?.getDecisionData?.(car));
  }

  syncLabCarSelection(id) {
    const car = this.world.cars.find((candidate) => candidate.id === id);
    if (!car) return false;
    const raceSelect = this.ui.querySelector('#race-car-select');
    const labSelect = this.ui.querySelector('#lab-follow-car');
    const coachSelect = this.ui.querySelector('#race-coach-driver');
    if (raceSelect) raceSelect.value = id;
    if (labSelect) labSelect.value = id;
    this.cameras.setTarget(id);

    if (coachSelect) {
      const optionExists = [...coachSelect.options].some((option) => option.value === id);
      coachSelect.value = optionExists ? id : '';
      this.renderCoachControls();
      if (!this.ui.querySelector('#race-coach').classList.contains('hidden')) this.updateCoachPanel();
    }
    this.updateIntegratedLabPanel();
    return true;
  }

  applyAiDifficulty() {
    if (this.driverAssignments || !this.world) return;
    for (const car of this.world.cars) if (!car.isPlayer) car.controller?.setProfile?.(this.aiDifficulty);
  }

  updateCarPicker() {
    const picker = this.ui.querySelector('#race-car-select');
    picker.innerHTML = this.world.cars.map((car) => `<option value="${car.id}">P${car.number} Â· ${car.name}</option>`).join('');
    picker.value = this.world.cars[0].id;
    const legend = this.ui.querySelector('.race-map-legend');
    legend.innerHTML = this.world.cars.map((car) => `<span title="${escapeHtml(car.name)}"><i class="${car.isPlayer ? 'player' : ''}" style="--map-car-color:#${car.color.toString(16).padStart(6, '0')}"></i>${car.isPlayer ? 'VOUS' : `P${car.number}`}</span>`).join('')
      + '<button type="button" data-action="map-size" aria-label="Agrandir la mini-carte">AGRANDIR</button>';
  }

  initializeCoachPanel() {
    const select = this.ui.querySelector('#race-coach-driver');
    const controlledCars = this.world.cars.filter((car) => typeof car.controller?.getDecisionData === 'function');
    const toggle = this.ui.querySelector('#race-coach-toggle');
    toggle.disabled = controlledCars.length === 0;
    toggle.title = controlledCars.length ? '' : 'Ce type de contrôleur ne publie pas de diagnostics de steering.';
    select.innerHTML = controlledCars.map((car) => `<option value="${escapeHtml(car.id)}">P${car.number} · ${escapeHtml(car.name)}</option>`).join('');
    this.renderCoachControls();
    if (!controlledCars.length) this.ui.querySelector('#race-coach-decision').textContent = 'Le contrôleur de cette manche ne publie pas de forces Steering explicables.';
  }

  selectedCoachCar() {
    const id = this.ui.querySelector('#race-coach-driver').value;
    return this.world.cars.find((car) => car.id === id) ?? null;
  }

  selectedCoachController() { return this.selectedCoachCar()?.controller ?? null; }

  toggleCoach(open) {
    const panel = this.ui.querySelector('#race-coach');
    const visible = open ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !visible);
    this.ui.querySelector('#race-coach-toggle').setAttribute('aria-expanded', String(visible));
    if (visible) this.updateCoachPanel();
  }

  renderCoachControls() {
    const host = this.ui.querySelector('#race-coach-settings');
    const controller = this.selectedCoachController();
    if (!controller?.getBehaviorConfiguration) { host.textContent = 'Diagnostics Steering indisponibles pour ce pilote.'; return; }
    this.ui.querySelector('#race-coach-limits').innerHTML = `<label class="race-coach-slider"><span>Vitesse maximale (m/s)<output>${controller.car.maxSpeed.toFixed(1)}</output></span><input type="range" min="20" max="58" step="0.5" value="${controller.car.maxSpeed}" data-coach-limit="maxSpeed" aria-label="Vitesse maximale arcade"></label><label class="race-coach-slider"><span>Force maximale<output>${controller.car.maxForce.toFixed(1)}</output></span><input type="range" min="4" max="42" step="0.5" value="${controller.car.maxForce}" data-coach-limit="maxForce" aria-label="Force maximale arcade"></label>`;
    const definitions = {
      pathFollowing: { label: 'Path Following · Seek', parameter: ['lookAhead', 'Anticipation', 4, 30, 0.5], source: 'pathBehavior' },
      obstacleAvoidance: { label: 'Obstacle Avoidance', parameter: ['lookAhead', 'Portée', 10, 100, 1], source: 'obstacleBehavior' },
      separation: { label: 'Separation', parameter: ['neighborRadius', 'Rayon voisin', 2, 30, 0.5], source: 'separationBehavior' },
      pursuit: { label: 'Pursuit', parameter: ['predictionSeconds', 'Prédiction', 0.05, 0.8, 0.01], source: 'pursuitBehavior' },
    };
    host.innerHTML = controller.getBehaviorConfiguration().map((entry) => {
      const definition = definitions[entry.name];
      const [key, label, min, max, step] = definition.parameter;
      const value = controller[definition.source][key];
      return `<section class="race-coach-behavior"><div class="race-coach-behavior-head"><label><input type="checkbox" data-coach-active="${entry.name}" ${entry.active ? 'checked' : ''}><b>${definition.label}</b></label><label class="race-coach-weight">POIDS <input type="range" min="0" max="24" step="0.1" value="${entry.weight}" data-coach-weight="${entry.name}" aria-label="Poids ${definition.label}"><output>${entry.weight.toFixed(1)}</output></label></div><label class="race-coach-slider"><span>${label}<output>${value.toFixed(step < 0.1 ? 2 : 1)}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-coach-parameter="${key}" data-coach-behavior="${entry.name}" aria-label="${definition.label} ${label}"></label></section>`;
    }).join('');
  }

  onCoachSettingInput(event) {
    const input = event.target;
    const controller = this.selectedCoachController();
    if (!controller) return;
    if (input.dataset.coachWeight) {
      controller.configureBehavior(input.dataset.coachWeight, { weight: Number(input.value) });
      const output = input.parentElement.querySelector('output');
      if (output) output.value = Number(input.value).toFixed(1);
      this.updateCoachPanel();
    } else if (input.dataset.coachLimit) {
      if (input.dataset.coachLimit === 'maxSpeed') controller.setMaxSpeed(Number(input.value));
      else controller.setMaxForce(Number(input.value));
      const output = input.parentElement.querySelector('output');
      if (output) output.value = Number(input.value).toFixed(1);
    } else if (input.dataset.coachParameter) {
      controller.configureBehavior(input.dataset.coachBehavior, { parameters: { [input.dataset.coachParameter]: Number(input.value) } });
      const output = input.parentElement.querySelector('output');
      if (output) output.value = Number(input.value).toFixed(Number(input.step) < 0.1 ? 2 : 1);
    }
  }

  onCoachSettingChange(event) {
    const input = event.target;
    if (!input.dataset.coachActive) return;
    this.selectedCoachController()?.configureBehavior(input.dataset.coachActive, { active: input.checked });
    this.updateCoachPanel();
  }

  updateCoachPanel() {
    if (this.ui.querySelector('#race-coach').classList.contains('hidden')) return;
    const snapshot = getRaceCoachSnapshot(this.selectedCoachCar());
    if (!snapshot) {
      this.ui.querySelector('#race-coach-decision').textContent = 'Aucun pilote Steering IA sélectionné. Le pilotage humain ne calcule pas de forces Steering.';
      this.ui.querySelector('#race-coach-vector').textContent = '';
      this.ui.querySelector('#race-coach-force-list').textContent = 'Aucune force IA disponible pour cette sélection.';
      return;
    }
    this.observeTutorial('decision-observed', { decision: snapshot.decision });
    this.ui.querySelector('#race-coach-profile').value = snapshot.profile;
    this.ui.querySelector('#race-coach-defense').checked = snapshot.defenseEnabled;
    this.ui.querySelector('#race-coach-decision').textContent = snapshot.decision;
    this.ui.querySelector('#race-coach-vector').innerHTML = renderRaceForceVectors(snapshot);
    const forceList = this.ui.querySelector('#race-coach-force-list');
    const colors = { pathFollowing: '#f5f5f5', obstacleAvoidance: '#ffad42', separation: '#57c7ff', pursuit: '#e10600' };
    forceList.innerHTML = snapshot.behaviors.map((behavior) => `<div><i style="--force-color:${colors[behavior.name] ?? '#fff'}"></i><span>${behavior.name}</span><small>${behavior.runtimeActive ? formatRaceForce(behavior.weightedForce) : 'inactive'}</small></div>`).join('')
      + `<div class="race-coach-result"><i></i><span>Résultante plafonnée</span><small>${formatRaceForce(snapshot.resultant)} / maxForce ${snapshot.maxForce.toFixed(1)}</small></div>`;
  }

  attachEvents() {
    const options = { signal: this.listeners.signal };
    this.ui.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action && !['audio', 'shift-up', 'shift-down', 'drs', 'pit'].includes(action)) audioManager.event('ui-confirm');
      if (action === 'pause') this.pause(!this.paused);
      else if (action === 'restart') this.restart();
      else if (action === 'championship-next') this.onChampionshipAdvance();
      else if (action === 'camera') this.cycleCamera();
      else if (action === 'lab-follow-steering-ai') {
        const ai = this.world.cars.find((car) => !car.isPlayer && car.controller?.getBehaviorConfiguration);
        if (ai) this.syncLabCarSelection(ai.id);
      }
      else if (action === 'camera-tv') { this.cameras.setMode(this.cameras.mode === 'tv' ? 'chase' : 'tv'); this.ui.querySelector('#race-camera-label').textContent = CAMERA_NAMES[this.cameras.mode]; }
      else if (action === 'coach') this.toggleCoach(true);
      else if (action === 'coach-close') this.toggleCoach(false);
      else if (action === 'shift-up') this.shiftPlayerGear(1);
      else if (action === 'shift-down') this.shiftPlayerGear(-1);
      else if (action === 'drs') { const systems = this.playerCar()?.raceMechanics; systems?.requestDRS(!systems.drsRequested); }
      else if (action === 'pit') { const player = this.playerCar(); const accepted = this.world.requestPitStop(player?.id, this.ui.querySelector('#race-tyre').value); this.ui.querySelector('#race-pit-status').textContent = accepted ? 'Itinéraire stands affiché · limitation 12 m/s · service 3 s.' : 'Arrêt indisponible : activez les mécaniques et vérifiez la course.'; if (accepted) this.syncPitVisualization(); }
      else if (action === 'photo') this.togglePhotoMode(true);
      else if (action === 'photo-exit') this.togglePhotoMode(false);
      else if (action === 'photo-capture') this.capturePhoto();
      else if (action === 'coach-reset') { this.selectedCoachController()?.resetConfiguration(); this.renderCoachControls(); this.updateCoachPanel(); }
      else if (action === 'audio') { audioManager.setEnabled(!audioManager.settings.enabled); event.currentTarget.querySelector('[data-action="audio"]')?.setAttribute('aria-pressed', String(audioManager.settings.enabled)); audioManager.unlock(); }
      else if (action === 'hud-mode') this.cycleHudMode();
      else if (action === 'toggle-mechanics') {
        const panel = this.ui.querySelector('.race-advanced'); panel.classList.toggle('hidden');
        this.ui.querySelector('[data-action="toggle-mechanics"]').setAttribute('aria-expanded', String(!panel.classList.contains('hidden')));
      }
      else if (action === 'map-size') {
        const map = this.ui.querySelector('.race-minimap'); map.classList.toggle('expanded');
        this.ui.querySelector('[data-action="map-size"]').setAttribute('aria-pressed', String(map.classList.contains('expanded')));
      }
      else if (action === 'menu') this.returnToMenu();
    }, options);
    this.ui.querySelector('#race-car-select').addEventListener('change', (event) => {
      this.syncLabCarSelection(event.target.value);
    }, options);
    this.ui.querySelector('#race-coach-driver').addEventListener('change', (event) => this.syncLabCarSelection(event.target.value), options);
    this.ui.querySelector('#race-coach-profile').addEventListener('change', (event) => { this.selectedCoachController()?.setProfile(event.target.value); this.renderCoachControls(); this.updateCoachPanel(); }, options);
    this.ui.querySelector('#race-coach-defense').addEventListener('change', (event) => { this.selectedCoachController()?.setDefenseEnabled(event.target.checked); this.updateCoachPanel(); }, options);
    this.ui.querySelector('#race-coach-settings').addEventListener('input', (event) => this.onCoachSettingInput(event), options);
    this.ui.querySelector('#race-coach-settings').addEventListener('change', (event) => this.onCoachSettingChange(event), options);
    this.ui.querySelector('#race-mechanics-enabled').addEventListener('change', (event) => { this.world.setGameplayMechanics(event.target.checked); this.updateMechanicsHud(); }, options);
    if (this.tutorialGuide) this.ui.querySelector('#race-mechanics-enabled').checked = true;
    this.ui.querySelector('#race-gearbox').addEventListener('change', (event) => { for (const car of this.world.cars) car.raceMechanics?.setGearboxMode(event.target.value); this.observeTutorial('manual-gearbox', { value: event.target.value }); this.updateMechanicsHud(); }, options);
    this.ui.querySelector('#race-ers-toggle').addEventListener('change', (event) => { this.playerCar()?.raceMechanics?.requestERS(event.target.checked); }, options);
    this.ui.querySelector('#race-tyre').addEventListener('change', (event) => this.observeTutorial('compound', { value: event.target.value }), options);
    this.ui.querySelector('#race-time-select').addEventListener('change', (event) => { this.visualState.setConditions({ day: event.target.value, weather: this.ui.querySelector('#race-weather-select').value }); }, options);
    this.ui.querySelector('#race-weather-select').addEventListener('change', (event) => { this.visualState.setConditions({ day: this.ui.querySelector('#race-time-select').value, weather: event.target.value }); this.particles.setRain(this.gameSettings.effects && event.target.value === 'rain'); }, options);
    const canvas = this.scene.renderer.domElement;
    canvas.addEventListener('pointerdown', () => { if (this.cameras.mode === 'photo') this.photoDragging = true; }, options);
    canvas.addEventListener('pointermove', (event) => { if (this.photoDragging) this.cameras.orbitPhoto(event.movementX, event.movementY); }, options);
    window.addEventListener('pointerup', () => { this.photoDragging = false; }, options);
    canvas.addEventListener('wheel', (event) => { if (this.cameras.mode === 'photo') { event.preventDefault(); this.cameras.zoomPhoto(event.deltaY); } }, { ...options, passive: false });
    window.addEventListener('keydown', (event) => this.onKeyDown(event), options);
    window.addEventListener('keyup', (event) => this.keys.delete(event.code), options);
    bindRaceFocusSafety(window, document, this.keys, () => { if (!this.paused) this.pause(true); }, options);
  }

  onKeyDown(event) {
    if (this.disposed || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) this.pause(!this.paused); return; }
    if (event.code === 'KeyH') { if (!event.repeat) this.cycleHudMode(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) event.preventDefault();
    if (this.world.director.state === 'formation' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    if (event.code === 'KeyR') { if (!event.repeat) this.restart(); return; }
    if (event.code === 'KeyC') { if (!event.repeat) this.cycleCamera(); return; }
    if (this.paused) return;
    if (event.code === 'KeyE') { if (!event.repeat) this.shiftPlayerGear(1); return; }
    if (event.code === 'KeyQ') { if (!event.repeat) this.shiftPlayerGear(-1); return; }
    if (event.code === 'KeyF') { if (!event.repeat) this.ui.querySelector('[data-action="drs"]').click(); return; }
    if (/^Digit[1-6]$/.test(event.code)) {
      const index = Number(event.code.slice(-1)) - 1;
      const car = this.world.cars[index];
      if (car) { this.cameras.setTarget(car.id); this.ui.querySelector('#race-car-select').value = car.id; }
      return;
    }
    this.keys.add(event.code);
  }

  updateTutorialPanel() {
    const panel = this.ui?.querySelector('#race-tutorial');
    if (!panel || !this.tutorialGuide) return;
    const status = this.tutorialGuide.snapshot();
    panel.replaceChildren();
    const title = document.createElement('b');
    title.textContent = status.complete ? 'ACADÉMIE TERMINÉE' : `ÉTAPE ${status.index + 1}/${status.total} · ${status.current.label}`;
    const detail = document.createElement('span');
    detail.textContent = status.complete ? 'Toutes les actions mesurables ont été observées.' : status.current.mode === 'race'
      ? TUTORIAL_GUIDANCE[status.current.event] ?? 'Action validée à partir de l’état réel de la course.'
      : `Retournez au menu et reprenez le tutoriel pour ouvrir ${status.current.mode}.`;
    const progress = document.createElement('progress'); progress.max = status.total; progress.value = status.completed;
    panel.append(title, detail, progress);
  }

  observeTutorial(event, details = {}) {
    if (!this.tutorialGuide) return;
    this.tutorialGuide.observe(event, { mode: 'race', ...details }); this.updateTutorialPanel();
  }

  getPlayerInput() {
    return readRaceInput(this.keys, {
      paused: this.paused,
      raceState: this.world?.director?.state,
      ersDeploy: this.ui?.querySelector?.('#race-ers-toggle')?.checked ?? false,
    });
  }

  playerCar() { return this.world.cars.find((car) => car.isPlayer) ?? null; }
  audioFocusCar() { return this.world?.cars?.find((car) => car.id === this.cameras?.targetId) ?? this.playerCar() ?? this.world?.cars?.[0] ?? null; }
  shiftPlayerGear(direction) { const systems = this.playerCar()?.raceMechanics; const changed = Boolean(systems?.enabled && systems.gearboxMode === 'manual' && systems.shift(direction)); if (changed) { audioManager.event('shift'); this.observeTutorial('gear-shift', { changed }); } }
  updateMechanicsHud() {
    const systems = this.playerCar()?.raceMechanics; if (!systems) return;
    this.ui.querySelector('#race-mechanics-enabled').checked = systems.enabled;
    this.ui.querySelector('#race-ers-toggle').checked = systems.ersDeploy;
    this.ui.querySelector('#race-gearbox').value = systems.gearboxMode;
    for (const selector of ['[data-action="shift-up"]', '[data-action="shift-down"]', '[data-action="drs"]', '[data-action="pit"]', '#race-ers-toggle', '#race-gearbox', '#race-tyre']) this.ui.querySelector(selector).disabled = !systems.enabled;
    if (systems.gearboxMode === 'automatic') { this.ui.querySelector('[data-action="shift-up"]').disabled = true; this.ui.querySelector('[data-action="shift-down"]').disabled = true; }
    this.ui.querySelector('#race-gear').textContent = String(systems.gear);
    this.ui.querySelector('#race-rpm').textContent = String(Math.round(systems.engineRpm));
    this.ui.querySelector('#race-drs').textContent = systems.drsActive ? 'OUVERT' : systems.drsRequested ? 'ATTENTE' : 'FERMÉ';
    this.ui.querySelector('#race-ers').textContent = `${Math.round(systems.ersCharge * 100)}%`;
    this.ui.querySelector('#race-tyre-state').textContent = `${systems.compound.toUpperCase()} · ${Math.round(systems.tyreWear * 100)}% · ${Math.round(systems.tyreTemperature)}°C`;
    this.ui.querySelector('#race-damage').textContent = `${Math.round(systems.damage * 100)}%`;
    this.ui.querySelector('#race-drs-compact').textContent = systems.drsActive ? 'OUVERT' : 'FERMÉ';
    this.ui.querySelector('#race-ers-compact').textContent = `${Math.round(systems.ersCharge * 100)}%`;
    const pit = this.world.pitStops.get(this.playerCar()?.id);
    this.ui.querySelector('#race-pit-status').textContent = pit ? ({ entry: 'Entrée stands', 'service-approach': 'Approche limitée à 12 m/s', service: `Service ${pit.elapsed.toFixed(1)} / 3.0 s`, exit: 'Sortie stands', merge: 'Réintégration piste' }[pit.phase] ?? 'Arrêt stands actif') : 'Stand non sollicité.';
  }

  togglePhotoMode(enabled) {
    const mode = this.cameras.setPhotoMode(enabled); this.photoDragging = false;
    const active = mode === 'photo';
    this.ui.classList.toggle('photo-hide-hud', active);
    this.ui.querySelector('#race-photo-bar').classList.toggle('hidden', !active);
    this.ui.querySelector('#race-camera-label').textContent = CAMERA_NAMES[mode] ?? mode.toUpperCase();
  }

  capturePhoto() {
    try {
      const link = document.createElement('a'); link.download = `neurodrive-photo-${Date.now()}.png`; link.href = this.scene.renderer.domElement.toDataURL('image/png'); link.click();
    } catch (error) { this.ui.querySelector('#race-photo-bar span').textContent = `Capture indisponible : ${error.message}`; }
  }

  syncPitVisualization() {
    const route = [...this.world.pitStops.values()][0]?.route;
    if (!route) {
      if (this.pitLaneLine) { this.scene.scene.remove(this.pitLaneLine); this.pitLaneLine.geometry.dispose(); this.pitLaneLine.material.dispose(); this.pitLaneLine = null; }
      return;
    }
    if (this.pitLaneLine) return;
    const points = [route.entry, route.service, route.exit, route.merge].map((point) => point.clone().setY(0.28));
    this.pitLaneLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: 0xe10600, dashSize: 3, gapSize: 1.4, linewidth: 2 }));
    this.pitLaneLine.computeLineDistances(); this.scene.scene.add(this.pitLaneLine);
  }

  pause(value) {
    this.paused = Boolean(value);
    this.observeTutorial('pause-cycle', { paused: this.paused });
    this.world.paused = this.paused;
    this.keys.clear();
    this.ui.querySelector('#race-pause-label').textContent = this.paused ? 'REPRENDRE' : 'PAUSE';
    this.ui.querySelector('#race-pause-overlay').classList.toggle('hidden', !this.paused);
    audioManager.pause(this.paused);
  }

  restart() {
    this.clearFinishScene();
    this.replayRecorder.reset(); this.replayStep = 0; this.replaySaved = false;
    this.lastTutorialPosition = null; this.lastTutorialLaps = 0;
    this.finalStandings = null; this.displayedRanks.clear(); this.raceDiagnostics.reset();
    this.cameras.mode = 'chase'; this.ui.querySelector('#race-camera-label').textContent = 'POURSUITE';
    this.world.reset(); this.applyAiDifficulty();
    this.accumulator = 0;
    this.keys.clear();
    this.pause(false);
    this.world.start({ formationLap: this.formationLap });
    this.ui.querySelector('#race-finish-overlay').classList.add('hidden');
    this.ui.querySelector('#race-status').textContent = 'DÃ‰PART';
    this.lastLights = this.world.director.redLights; this.lastRaceState = this.world.director.state; this.lastCollisionCount = this.world.collisionCount;
  }

  cycleCamera() {
    const previousMode = this.cameras.mode;
    const mode = this.cameras.nextMode();
    this.observeTutorial('camera', { changed: mode !== previousMode, from: previousMode, to: mode });
    this.ui.querySelector('#race-camera-label').textContent = CAMERA_NAMES[mode] ?? mode.toUpperCase();
  }

  cycleHudMode() {
    const modes = ['full', 'minimal', 'hidden'];
    this.hudMode = modes[(modes.indexOf(this.hudMode) + 1) % modes.length];
    this.ui.dataset.hudMode = this.hudMode;
    const button = this.ui.querySelector('[data-action="hud-mode"]');
    button.textContent = this.hudMode === 'full' ? 'HUD' : this.hudMode === 'minimal' ? 'MIN' : 'OFF';
    button.title = `Affichage ${this.hudMode} · H pour changer`;
  }

  animate(now) {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame((time) => this.animate(time));
    const frameSeconds = Math.min(Math.max(0, (now - this.previousTime) / 1000), 0.25);
    this.previousTime = now;
    if (!this.paused) {
      this.accumulator = Math.min(this.accumulator + frameSeconds * this.labTimeScale, FIXED_STEP * MAX_STEPS_PER_FRAME);
      let steps = 0;
      while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
        const playerBefore = this.world.cars.find((car) => car.isPlayer);
        const audioFocusBefore = this.audioFocusCar();
        const speedBefore = playerBefore?.velocity.length() ?? 0;
        const playerTelemetryBefore = playerBefore ? this.world.driverTelemetry.get(playerBefore.id) : null;
        const collisionsBefore = playerTelemetryBefore?.carCollisions ?? 0;
        const offTrackBefore = playerTelemetryBefore?.offTrackEvents ?? 0;
        const focusTelemetryBefore = audioFocusBefore ? this.world.driverTelemetry.get(audioFocusBefore.id) : null;
        const focusCollisionsBefore = focusTelemetryBefore?.carCollisions ?? 0;
        const focusOffTrackBefore = focusTelemetryBefore?.offTrackEvents ?? 0;
        const focusMechanicsBefore = audioFocusBefore?.raceMechanics;
        const focusGearBefore = focusMechanicsBefore?.gear;
        const focusDrsBefore = focusMechanicsBefore?.drsActive;
        const focusErsBefore = focusMechanicsBefore?.ersDeploy;
        const focusLapBefore = audioFocusBefore?.completedLaps ?? 0;
        const focusFinishedBefore = audioFocusBefore?.finished ?? false;
        const focusPitBefore = this.world.pitStops.get(audioFocusBefore?.id)?.phase ?? null;
        const input = this.getPlayerInput();
        this.observeTutorial('throttle', { value: input.throttle }); this.observeTutorial('brake', { value: input.brake }); this.observeTutorial('steer', { value: input.steer });
        const mechanicsBefore = playerBefore?.raceMechanics;
        const ersBefore = mechanicsBefore?.ersCharge ?? 0, damageBefore = mechanicsBefore?.damage ?? 0;
        this.world.update(FIXED_STEP, input);
        this.updateLabVectorOverlay();
        if (!this.laboratory) {
          this.replayStep += 1;
          if (this.world.director.state === 'racing') this.replayRecorder.capture(this.world, this.replayStep);
        }
        const playerTelemetryAfter = playerBefore ? this.world.driverTelemetry.get(playerBefore.id) : null;
        const mechanicsAfter = playerBefore?.raceMechanics;
        const audioFocusAfter = audioFocusBefore ? this.world.cars.find((car) => car.id === audioFocusBefore.id) : this.audioFocusCar();
        const focusTelemetryAfter = audioFocusAfter ? this.world.driverTelemetry.get(audioFocusAfter.id) : null;
        const focusMechanicsAfter = audioFocusAfter?.raceMechanics;
        this.observeTutorial('drs-active', { active: mechanicsAfter?.drsActive === true });
        this.observeTutorial('ers-used', { chargeBefore: ersBefore, chargeAfter: mechanicsAfter?.ersCharge ?? ersBefore });
        this.observeTutorial('tyre-wear', { wear: mechanicsAfter?.tyreWear ?? 0 });
        this.observeTutorial('damage', { amount: Math.max(0, (mechanicsAfter?.damage ?? 0) - damageBefore) });
        if (playerBefore && this.world.pitStops.get(playerBefore.id)?.completed) this.observeTutorial('pit-service', { completed: true });
        if ((playerTelemetryAfter?.carCollisions ?? 0) > collisionsBefore) { hapticsManager.pulse('collision'); audioManager.event('collision'); audioManager.event('crowd'); this.cameraShake = Math.max(this.cameraShake, 0.24); this.crowdExcitement = Math.max(this.crowdExcitement, 0.85); if (this.gameSettings.effects) this.particles.emit(playerBefore.position, 'smoke', 16); }
        const offTrackAfter = playerTelemetryAfter?.offTrackEvents ?? 0;
        if (offTrackAfter > offTrackBefore) { hapticsManager.pulse('offTrack'); audioManager.event('offTrack'); this.crowdExcitement = Math.max(this.crowdExcitement, 0.4); if (this.gameSettings.effects) this.particles.emit(playerBefore.position, this.visualState.state.wetness > 0.4 ? 'water' : 'dust', 18); }
        if (audioFocusAfter && audioFocusAfter !== playerBefore) {
          if ((focusTelemetryAfter?.carCollisions ?? 0) > focusCollisionsBefore) audioManager.event('collision');
          if ((focusTelemetryAfter?.offTrackEvents ?? 0) > focusOffTrackBefore) audioManager.event('offTrack');
        }
        if (focusMechanicsAfter?.gear !== focusGearBefore && focusMechanicsAfter?.lastShift) audioManager.event('shift', { gear: focusMechanicsAfter.gear });
        if (focusMechanicsAfter?.drsActive !== focusDrsBefore && focusMechanicsAfter?.drsActive) audioManager.event('drs');
        if (focusMechanicsAfter?.ersDeploy !== focusErsBefore) audioManager.event('ers');
        const focusLapAfter = audioFocusAfter?.completedLaps ?? focusLapBefore;
        if (focusLapAfter > focusLapBefore) {
          audioManager.event('lap');
          if (focusLapAfter === this.laps - 1) audioManager.event('last-lap');
        }
        if (!focusFinishedBefore && audioFocusAfter?.finished) audioManager.event('arrival');
        const focusPitAfter = this.world.pitStops.get(audioFocusAfter?.id)?.phase ?? null;
        if (focusPitAfter !== focusPitBefore && (focusPitAfter === 'service-approach' || focusPitAfter === 'exit')) audioManager.event('pit');
        if (playerBefore && input.brake > 0.7 && speedBefore - playerBefore.velocity.length() > 0.2) hapticsManager.pulse('braking');
        this.accumulator -= FIXED_STEP;
        steps += 1;
      }
    } else this.accumulator = 0;
    const dt = frameSeconds;
    if (!this.finishScene) this.world.cars.forEach((car, index) => this.carViews[index].sync(car, dt));
    this.scene.setVisualState(this.visualState.update(dt));
    const playerForEffects = this.playerCar(); if (this.gameSettings.effects) this.particles.update(dt, playerForEffects?.position);
    this.crowdExcitement = Math.max(0.12, this.crowdExcitement - dt * 0.16); this.crowdTick += dt;
    audioManager.setCrowdIntensity(this.crowdExcitement);
    if (this.crowdTick >= 0.09) { this.scene.track.updateCrowd(this.crowdTick, this.crowdExcitement); this.crowdTick = 0; }
    this.cameras.update(this.world.cars, dt);
    if (this.gameSettings.effects && this.cameraShake > 0) {
      this.cameraShakePhase += dt * 42;
      const strength = this.cameraShake;
      this.scene.camera.position.x += Math.sin(this.cameraShakePhase) * strength;
      this.scene.camera.position.y += Math.cos(this.cameraShakePhase * 0.73) * strength * 0.45;
      this.cameraShake = Math.max(0, strength - dt * 0.72);
    }
    if (this.finishScene) {
      this.podiumElapsed += dt;
      this.finishScene.traverse((object) => {
        if (object.userData.confetti) { object.position.y = 2 + ((object.userData.originY - this.podiumElapsed * object.userData.fall - 2 + 16) % 16); object.rotation.x += dt * 0.8; object.rotation.z += dt * 0.6; }
      });
    }
    this.updateHud(frameSeconds);
    this.scene.render();
  }

  updateHud(dt) {
    this.syncPitVisualization();
    this.uiTime += dt;
    const player = this.world.cars.find((car) => car.isPlayer) ?? this.world.cars.find((car) => car.id === this.cameras.targetId) ?? this.world.cars[0];
    const speed = player?.velocity.length() ?? 0;
    const input = player?.isPlayer ? this.getPlayerInput() : { throttle: 0, brake: 0, steer: 0 };
    const audioCar = this.audioFocusCar();
    const audioSpeed = audioCar?.velocity.length() ?? 0;
    const audioCommands = audioCar?.controller?.controller?.lastCommands ?? audioCar?.controller?.lastCommands;
    const audioInput = audioCar?.isPlayer ? input : { throttle: Math.max(0, audioCommands?.throttleBrake ?? 0), brake: Math.max(0, -(audioCommands?.throttleBrake ?? 0)), steer: audioCommands?.steering ?? 0 };
    let nearestCar = Infinity;
    for (const other of this.world.cars) if (other !== audioCar) nearestCar = Math.min(nearestCar, audioCar.position.distanceTo(other.position));
    const proximity = Number.isFinite(nearestCar) ? Math.max(0, Math.min(1, (18 - nearestCar) / 18)) : 0;
    audioManager.setEngineFocus(audioCar?.id, audioSpeed);
    audioManager.updateEngine(audioSpeed, audioInput.throttle, audioInput.brake, audioCar?.raceMechanics?.engineRpm, proximity);
    const lateralSlip = audioCar && audioSpeed > 7 ? Math.abs(audioCar.forward.x * audioCar.velocity.z - audioCar.forward.z * audioCar.velocity.x) / audioSpeed : 0;
    if (lateralSlip > 0.42) audioManager.event('tyre-squeal');
    const speedEffect = this.gameSettings.effects ? Math.min(1, speed / (player?.maxSpeed ?? 58)) : 0;
    this.ui.style.setProperty('--race-speed-effect', String(speedEffect));
    this.ui.classList.toggle('braking', this.gameSettings.effects && input.brake > 0.55);
    this.ui.querySelector('#race-brake-indicator').classList.toggle('active', input.brake > 0.05);
    this.ui.querySelector('#race-speed').textContent = String(Math.round(speed * 3.6));
    this.ui.querySelector('#race-speedbar').style.width = `${Math.min(100, speed / (player?.maxSpeed ?? 58) * 100)}%`;
    const mechanics = player?.raceMechanics;
    this.ui.querySelector('#race-gear-compact').textContent = String(mechanics?.gear ?? '—');
    this.ui.querySelector('#race-rpm-compact').textContent = String(Math.round(mechanics?.engineRpm ?? speed * 70));
    this.ui.querySelector('#race-drs-compact').textContent = mechanics?.drsActive ? 'OUVERT' : 'FERMÉ';
    this.ui.querySelector('#race-ers-compact').textContent = `${Math.round((mechanics?.ersCharge ?? 0) * 100)}%`;
    this.ui.querySelector('#race-lap').textContent = this.world.director.state === 'formation' ? 'FORMATION' : `${String(Math.min(this.laps, (player?.completedLaps ?? 0) + 1)).padStart(2, '0')} / ${String(this.laps).padStart(2, '0')}`;
    this.ui.querySelector('#race-best').textContent = formatTime(player?.bestLapTime);
    const playerTelemetry = player ? this.world.getDriverTelemetry(player) : null;
    this.ui.querySelector('#race-collisions').textContent = String(playerTelemetry?.carCollisions ?? 0);
    this.ui.querySelector('#race-offtrack').textContent = String(playerTelemetry?.offTrackEvents ?? 0);
    this.ui.querySelector('#race-clock').textContent = formatTime(this.world.director.raceElapsed);
    const state = this.world.director.state;
    this.ui.querySelector('#race-formation-notice').classList.toggle('hidden', state !== 'formation');
    const flag = this.world.flagState ?? { flag: 'green', reason: 'Conditions normales de course' };
    const flagElement = this.ui.querySelector('#race-flag'); flagElement.textContent = flag.flag === 'checkered' ? 'DAMIER' : flag.flag.toUpperCase(); flagElement.title = flag.reason; flagElement.dataset.flag = flag.flag;
    const redLights = this.world.director.redLights;
    this.scene.track.setStartLights(redLights);
    if (redLights < this.lastLights && redLights > 0) audioManager.event('start-light');
    if (this.lastRaceState !== 'racing' && state === 'racing') audioManager.event('go');
    this.lastLights = redLights; this.lastRaceState = state;
    const status = state === 'formation' ? 'TOUR DE FORMATION' : state === 'countdown' ? 'DÉPART' : state === 'finished' ? 'TERMINÉE' : 'EN COURSE';
    this.ui.querySelector('#race-status').textContent = status;
    const lights = this.ui.querySelector('#race-lights');
    lights.classList.toggle('hidden', state !== 'countdown');
    const bulbs = [...lights.querySelectorAll('.race-light-row i')];
    bulbs.forEach((bulb, index) => bulb.classList.toggle('active', index < this.world.director.redLights));
    const countdown = this.world.director.countdownRemaining;
    this.ui.querySelector('#race-countdown').textContent = countdown > 0 ? String(Math.ceil(countdown)) : 'GO';
    if (state === 'finished') {
      if (!this.finalStandings) this.finalStandings = getRacePresentation(this.world).standings;
      const finalPlayerRank = getRacePresentation(this.world, this.finalStandings).human;
      this.ui.querySelector('#race-player-position').textContent = `P${finalPlayerRank?.position ?? '—'} / ${this.finalStandings.length}`;
      this.ui.querySelector('#race-winner').textContent = `${this.world.cars.find((car) => car.id === this.world.director.winnerId)?.name ?? 'COURSE TERMINÃ‰E'}`;
      this.ui.querySelector('#race-finish-overlay').classList.remove('hidden');
      if (!this.finishScene) {
        this.saveCareerRace(this.finalStandings);
        this.buildFinishScene(); audioManager.setScene('podium'); audioManager.event('finish');
        if (this.world.director.winnerId === this.playerCar()?.id) audioManager.event('victory');
        audioManager.event('crowd'); this.crowdExcitement = 1;
        const finalRank = this.finalStandings, finalLeader = finalRank[0];
        this.ui.querySelector('#race-final-ranks').innerHTML = finalRank.map((car) => `<li class="${car.finished ? 'finished' : 'not-finished'}"><b>${String(car.position).padStart(2, '0')}</b><span>${escapeHtml(car.name)}</span><small>${car.finished ? `ARRIVÉ · ${formatTime(car.finishTime)}` : 'NON TERMINÉ'} · MEILLEUR ${formatTime(car.bestLapTime)} · ${car.position === 1 ? 'LEADER' : formatRaceGap(car, finalLeader)}</small></li>`).join('');
      }
    }
    if (this.uiTime >= 0.1) {
      this.uiTime = 0;
      const presentation = getRacePresentation(this.world, this.finalStandings);
      const ranked = presentation.standings;
      const leader = ranked[0];
      const rankedPlayer = presentation.human;
      const player = this.playerCar();
      if (rankedPlayer && this.lastTutorialPosition !== null && rankedPlayer.position < this.lastTutorialPosition) this.observeTutorial('position-improved', { position: rankedPlayer.position, previous: this.lastTutorialPosition });
      this.lastTutorialPosition = rankedPlayer?.position ?? this.lastTutorialPosition;
      const lapsCompleted = player?.completedLaps ?? 0;
      if (lapsCompleted > this.lastTutorialLaps) this.observeTutorial('lap-completed', { laps: lapsCompleted, previousLaps: this.lastTutorialLaps });
      this.lastTutorialLaps = lapsCompleted;
      this.ui.querySelector('#race-player-position').textContent = `P${rankedPlayer?.position ?? '—'} / ${ranked.length}`;
      this.rankList.innerHTML = ranked.map((car) => `<li class="${car.isPlayer ? 'player' : ''} ${car.finished ? 'finished' : ''}"><b>${String(car.position).padStart(2, '0')}</b><i style="--car-color:#${car.color.toString(16).padStart(6, '0')}"></i><span>${escapeHtml(car.name)}</span><small title="Position fondée sur les tours validés et la progression de route">${car.finished ? 'ARRIVÉ' : `T${Math.min(this.laps, (car.completedLaps ?? 0) + 1)}/${this.laps}`} · ${formatRaceGap(car, leader)}</small></li>`).join('');
      this.displayedRanks = new Map(ranked.map((car) => [car.id, car.position]));
      this.raceDiagnostics.observe(this.world, this.displayedRanks);
      this.drawMiniMap();
      this.updateCoachPanel();
      this.updateMechanicsHud();
      this.updateIntegratedLabPanel();
    }
  }

  saveCareerRace(ranked) {
    if (this.laboratory || !this.persistResults) return;
    if (this.replaySaved) return;
    ranked ??= this.finalStandings ?? RaceLeaderboard.rank(this.world.cars);
    this.replaySaved = true;
    this.replayRecorder.capture(this.world, Math.max(1, this.replayStep), { force: true });
    const replay = createRaceReplay(this.track, this.world.cars.map((car) => ({ id: car.driverId ?? car.id, name: car.name, provenance: car.controller?.constructor?.name ?? 'arcade-controller' })), {
      seed: this.raceSeed, physics: { laps: this.laps, trackHalfWidth: this.track.halfWidth ?? 8.2, fixedStep: FIXED_STEP, mechanicsEnabled: this.world.gameplayMechanics }, frames: this.replayRecorder.frames, events: this.replayRecorder.events, sampleRate: this.replayRecorder.sampleRate,
    });
    const results = ranked.map((car) => { const telemetry = this.world.getDriverTelemetry(car); return { id: car.driverId ?? car.id, carId: car.id, gridPosition: car.gridPosition, name: car.name, color: car.color, position: car.position, completedLaps: car.completedLaps, finishTime: car.finishTime, bestLapTime: car.bestLapTime, collisions: telemetry.carCollisions, offTrackEvents: telemetry.offTrackEvents, finished: car.finished }; });
    const race = this.careerStore.saveRace({ trackId: this.track.id, seed: this.raceSeed, results, replay });
    if (this.championshipRound) {
      try {
        this.careerStore.addChampionshipResult({ roundTrackId: this.championshipRound.trackId, raceId: race.id, seasonId: this.championshipRound.seasonId });
        const season = this.careerStore.read().championship;
        const round = season.results.find((entry) => entry.raceId === race.id);
        const player = this.world.cars.find((car) => car.isPlayer);
        const scored = round?.points.find((entry) => entry.driverId === player?.id);
        const message = document.createElement('p'); message.className = 'race-season-result';
        message.textContent = `Grand Prix ${this.championshipRound.roundIndex + 1}/${this.championshipRound.roundTotal} · ${scored ? `${scored.points} points` : '0 point · voiture non classée'} · ${season.results.length}/${season.rounds.length} manches terminées`;
        this.ui.querySelector('#race-finish-overlay > div').insertBefore(message, this.ui.querySelector('.finish-actions'));
      } catch (error) { this.championshipError = error.message; }
    }
    this.onRaceFinished(race);
  }

  drawMiniMap() {
    const context = this.mapContext;
    if (!context) return;
    const { width, height } = this.mapCanvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(4, 11, 15, .82)';
    context.fillRect(0, 0, width, height);
    const projector = createMinimapProjector(this.track.waypoints, width, height, 18);
    if (!projector) return;
    const point = projector.project;
    context.beginPath();
    this.track.waypoints.forEach((waypoint, index) => {
      const p = point(waypoint);
      if (index === 0) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
    });
    context.closePath();
    context.lineJoin = 'round'; context.lineCap = 'round'; context.lineWidth = 9; context.strokeStyle = '#3e4b51'; context.stroke();
    context.lineWidth = 1; context.strokeStyle = '#92a8a3'; context.setLineDash([4, 4]); context.stroke(); context.setLineDash([]);
    const start = point(this.track.waypoints[0]);
    const next = point(this.track.waypoints[1]);
    const dx = next.x - start.x, dy = next.y - start.y, length = Math.hypot(dx, dy) || 1;
    const half = Math.max(5, (this.track.halfWidth ?? 8) * projector.scale);
    context.beginPath(); context.moveTo(start.x - dy / length * half, start.y + dx / length * half); context.lineTo(start.x + dy / length * half, start.y - dx / length * half);
    context.strokeStyle = '#f5f5f5'; context.lineWidth = 2; context.stroke();
    context.fillStyle = '#e10600'; context.beginPath(); context.arc(start.x, start.y, 2.5, 0, Math.PI * 2); context.fill();
    for (let index = 0; index < this.track.waypoints.length; index += Math.max(1, Math.floor(this.track.waypoints.length / 8))) {
      const a = point(this.track.waypoints[index]), b = point(this.track.waypoints[(index + 1) % this.track.waypoints.length]);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      context.save(); context.translate(a.x, a.y); context.rotate(angle); context.beginPath(); context.moveTo(3.5, 0); context.lineTo(-2.5, -2.2); context.lineTo(-2.5, 2.2); context.closePath(); context.fillStyle = '#f5f5f5'; context.fill(); context.restore();
    }
    this.world.cars.forEach((car) => {
      const p = point(car.position);
      context.beginPath(); context.arc(p.x, p.y, car.isPlayer ? 4.4 : 3.4, 0, Math.PI * 2);
      context.fillStyle = `#${car.color.toString(16).padStart(6, '0')}`; context.fill();
      if (car.isPlayer) { context.strokeStyle = '#ffffff'; context.lineWidth = 1.4; context.stroke(); }
    });
  }

  buildFinishScene() {
    const group = new THREE.Group();
    const podiumMat = new THREE.MeshStandardMaterial({ color: 0x222832, metalness: 0.5, roughness: 0.48 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xe10600, metalness: 0.2, roughness: 0.48 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.15, roughness: 0.48 });
    const podiumCars = new Set();
    const podiums = [[-2.5, 0.7, 2], [0, 1.3, 1], [2.5, 0.48, 3]];
    podiums.forEach(([x, height, place], index) => {
      const geometry = new THREE.BoxGeometry(2.05, height, 1.65);
      const block = new THREE.Mesh(geometry, index === 1 ? redMat : podiumMat);
      block.position.set(x, height / 2, -1.5); block.castShadow = true; block.receiveShadow = true; group.add(block);
      const rankedCar = (this.finalStandings ?? RaceLeaderboard.rank(this.world.cars))[place - 1];
      const car = rankedCar && this.carViews[this.world.cars.findIndex((entry) => entry.id === rankedCar.id)];
      if (car) { podiumCars.add(car); car.root.position.set(x, height + 0.32, -1.5); car.root.rotation.y = Math.PI; car.root.scale.setScalar(0.48); }
    });
    const confettiGeometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const confettiMaterials = [redMat, whiteMat, podiumMat];
    for (let i = 0; i < 70; i += 1) {
      const piece = new THREE.Mesh(confettiGeometry, confettiMaterials[i % 3]);
      piece.position.set(((i * 17) % 31 - 15) / 2, 3 + (i * 13) % 16, ((i * 11) % 21 - 10) / 2);
      piece.rotation.set(i * 0.7, i * 0.31, i * 0.43); piece.userData.fall = 0.4 + (i % 7) * 0.1; group.add(piece);
      piece.userData.confetti = true; piece.userData.originY = piece.position.y;
    }
    this.finishMaterials = [podiumMat, redMat, whiteMat];
    group.userData.podium = true; this.scene.scene.add(group); this.finishScene = group;
    this.podiumElapsed = 0; this.cameras.mode = 'podium'; this.ui.querySelector('#race-camera-label').textContent = 'PODIUM';
    this.carViews.forEach((car) => { car.root.visible = podiumCars.has(car); });
  }

  clearFinishScene() {
    if (!this.finishScene) return;
    this.finishScene.traverse((object) => { if (object.geometry) object.geometry.dispose(); });
    this.finishMaterials?.forEach((material) => material.dispose());
    this.carViews?.forEach((car) => { car.root.visible = true; car.root.scale.setScalar(1.35); });
    this.scene.scene.remove(this.finishScene); this.finishScene = null; this.finishMaterials = null;
  }

  returnToMenu() { return this.onReturn?.(); }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.listeners.abort();
    hapticsManager.stop();
    await audioManager.stopSession();
    audioManager.setCrowdIntensity(0);
    this.keys.clear();
    if (this.pitLaneLine) { this.scene.scene.remove(this.pitLaneLine); this.pitLaneLine.geometry.dispose(); this.pitLaneLine.material.dispose(); this.pitLaneLine = null; }
    this.particles?.dispose();
    this.labVisuals?.dispose(); this.labVisuals = null;
    this.scene.dispose();
    this.ui.remove();
    this.app.classList.remove('race-session');
  }
}
