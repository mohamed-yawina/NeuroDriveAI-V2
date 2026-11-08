import './style.css';
import { SessionNavigation } from './ui/SessionNavigation.js';
import { audioManager } from './game/AudioManager.js';
import { hapticsManager } from './game/HapticsManager.js';
import { getPanelCtaAction, launchMenuRace } from './ui/MenuLaunchOptions.js';
import { createIntegratedLabEntryActions, launchNeuralLab, launchSteeringLab } from './ui/IntegratedLabLaunch.js';
import { readGameSettings, resetGameSettings, writeGameSettings } from './settings/GameSettings.js';
import { CareerStore } from './game/CareerStore.js';
import { mountCareerPanel, refreshCareerPanel, bindCareerPanel } from './game/CareerPanel.js';
import { upgradeRaceReplay } from './neural-lab/ReplayProtocol.js';
import { RaceTutorial } from './game/RaceTutorial.js';
import { ProfessorDemo } from './game/ProfessorDemo.js';
import { ComplianceReport } from './game/ComplianceReport.js';
import { bindMainMenuEntries } from './ui/MainMenuSections.js';
import { CircuitLibrary } from './circuits/CircuitLibrary.js';
import { resolveTrackSelection, USER_TRACK_SELECTION_PREFIX } from './circuits/TrackSelection.js';
import { measureTrackDefinition, trackPreviewSvg } from './ui/TrackGallery.js';
import { GameVehicleDynamics } from './game/GameVehicleDynamics.js';
import { createGeneralizationTracks } from './ai/training/GeneralizationTracks.js';
const { MenuShowroom } = await import('./scene/MenuShowroom.js');

const app = document.querySelector('#app');
app.classList.add('presentation-mode');
const menu = document.createElement('main');
menu.className = 'main-menu';
menu.innerHTML = `<div class="showroom-stage" id="showroom-stage"><div class="showroom-badge"><b id="showroom-badge-title">SHOWROOM 3D</b><span>NEURODRIVE F1 · RED EDITION</span></div><div class="showroom-hint">GLISSER · TOURNER &nbsp; MOLETTE · ZOOM</div></div><header class="racing-nav"><a class="racing-logo" href="#accueil"><b>ND</b><span>NEURODRIVE <i>F1</i><small>RED RACING EDITION</small></span></a><nav aria-label="Navigation principale"><button data-view="home" class="active">JOUER</button><button data-view="ai-labs">LABORATOIRES IA</button><button data-view="creation">CRÉATION</button><button data-view="garage">GARAGE</button><button data-view="circuits">CIRCUITS</button><button data-view="career">CARRIÈRE LOCALE</button><button data-view="settings">RÉGLAGES</button></nav><span class="profile-chip">PILOTE <b>LOCAL</b></span></header><section class="home-panel menu-panel" data-panel="home"><p class="menu-kicker">NEURODRIVE F1 · COURSE RAPIDE</p><h1>Choisissez<br><em>votre course.</em></h1><p class="menu-copy">Prenez le départ face aux pilotes autonomes, inscrivez vos résultats au championnat local ou reprenez le tutoriel interactif.</p><div class="menu-entry-grid play-entry-grid"><button id="launch-simulation" class="menu-entry-card menu-entry-featured" data-menu-entry="quick-race"><span class="menu-entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 31h4l4-11h13l7 7h5v9H8zM17 20l3-7h10l3 10M15 36a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm20 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/></svg></span><span class="menu-entry-text"><b>COURSE RAPIDE</b><small>Lancer une course contre cinq pilotes IA.</small></span><span class="menu-entry-arrow" aria-hidden="true">↗</span></button><button class="menu-entry-card" data-menu-entry="championship"><span class="menu-entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M15 8h18v8a9 9 0 0 1-18 0zm0 4H8v4a9 9 0 0 0 9 9m16-13h7v4a9 9 0 0 1-9 9M24 25v9m-9 6h18M19 34h10"/></svg></span><span class="menu-entry-text"><b>CHAMPIONNAT LOCAL</b><small>Calendrier, points et classement.</small></span><span class="menu-entry-arrow" aria-hidden="true">↗</span></button><button class="menu-entry-card" data-menu-entry="tutorial"><span class="menu-entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 7 42 38H6zM24 18v9m0 6h.01"/></svg></span><span class="menu-entry-text"><b>TUTORIEL</b><small>Reprendre ou recommencer le parcours guidé.</small></span><span class="menu-entry-arrow" aria-hidden="true">↗</span></button></div><div class="play-race-options" id="play-race-options" aria-label="Paramètres de course"><label class="menu-field">CIRCUIT<select id="menu-track"><option value="original">Circuit Azur · entraînement</option><option value="technical">Circuit Technique · virages serrés</option><option value="fast-oval">Ovale Rapide · grande vitesse</option></select></label><label class="race-formation-option"><input id="menu-formation" type="checkbox"><span>Tour de formation automatique</span><small>Optionnel · conduite assistée avant le départ</small></label></div></section><section class="home-panel menu-panel secondary-panel hidden" data-panel="garage"><div class="panel-topline"><button class="back-home">← MENU</button><span>CONFIGURATION VISUELLE</span></div><h2>Votre monoplace</h2><p class="menu-copy">Choisissez une livrée et un angle. Les réglages aérodynamiques, moteur et pneus ne sont pas simulés par le moteur actuel.</p><div class="livery-row" role="group" aria-label="Choisir la livrée"><button data-color="#e10600" aria-label="Rouge compétition" class="selected"></button><button data-color="#f5f5f5" aria-label="Blanc"></button><button data-color="#1684ff" aria-label="Bleu"></button><button data-color="#d6b14d" aria-label="Or"></button></div><div class="camera-presets"><button data-camera="threeQuarter" class="selected">3/4</button><button data-camera="front">AVANT</button><button data-camera="side">CÔTÉ</button><button data-camera="rear">ARRIÈRE</button><button data-camera="top">DESSUS</button></div><p class="availability-note">Boîte, pneus, ERS et DRS sont disponibles dans les mécaniques de course arcade; les réglages aérodynamiques de garage restent visuels.</p><button class="launch-button launch-from-panel">CHOISIR LE CIRCUIT <span>↗</span></button></section><section class="home-panel menu-panel secondary-panel hidden" data-panel="circuits"><div class="panel-topline"><button class="back-home">← MENU</button><span>SÉLECTION DU CIRCUIT</span></div><h2>Choisissez la piste</h2><div class="track-cards"><button data-track="original" class="selected"><b>01</b><strong>CIRCUIT AZUR</strong><small>Configuration historique · entraînement</small></button><button data-track="technical"><b>02</b><strong>CIRCUIT TECHNIQUE</strong><small>Enchaînements serrés</small></button><button data-track="fast-oval"><b>03</b><strong>OVALE RAPIDE</strong><small>Grandes courbes · vitesse</small></button></div><label class="menu-field">TOURS<select id="menu-laps"><option>3</option><option>5</option><option>8</option></select></label><button class="launch-button launch-from-panel">ALLER À LA GRILLE <span>↗</span></button></section><section class="home-panel menu-panel secondary-panel hidden" data-panel="settings"><div class="panel-topline"><button class="back-home">← MENU</button><span>ACCESSIBILITÉ & AUDIO</span></div><h2>Réglages</h2><label class="toggle-setting"><input id="audio-enabled" type="checkbox"><span>Audio procédural</span></label><label class="menu-field">VOLUME GÉNÉRAL<input data-volume="master" type="range" min="0" max="1" step="0.05"></label><label class="menu-field">MOTEUR<input data-volume="engine" type="range" min="0" max="1" step="0.05"></label><label class="menu-field">EFFETS<input data-volume="effects" type="range" min="0" max="1" step="0.05"></label><label class="menu-field">AMBIANCE<input data-volume="ambience" type="range" min="0" max="1" step="0.05"></label><label class="menu-field">MUSIQUE<input data-volume="music" type="range" min="0" max="1" step="0.05"></label><label class="menu-field">INTERFACE<input data-volume="interface" type="range" min="0" max="1" step="0.05"></label><label class="toggle-setting"><input id="haptics-enabled" type="checkbox"><span>Vibrations (si compatibles)</span></label><label class="menu-field">INTENSITÉ HAPTIQUE<input id="haptics-intensity" type="range" min="0" max="1" step="0.05"></label><p class="availability-note" id="haptics-support-note">Les vibrations dépendent du navigateur et du matériel détecté.</p></section><div class="menu-index">PHASE 14 <span>RED RACING EDITION</span></div></main>`;
const retainedTrackField = menu.querySelector('#menu-track')?.closest('.menu-field');
const retainedLapsField = menu.querySelector('#menu-laps')?.closest('.menu-field');
menu.querySelector('[data-panel="home"] .play-race-options')?.append(retainedTrackField, retainedLapsField);
menu.insertAdjacentHTML('beforeend', `<section class="home-panel menu-panel secondary-panel hidden menu-section-panel" data-panel="ai-labs"><div class="panel-topline"><button class="back-home" type="button">← MENU</button><span>LABORATOIRES · IA</span><span>ANALYSE & EXPÉRIMENTATION</span></div><h2>Laboratoires IA</h2><p class="menu-copy">Explorez les comportements réactifs et comparez les contrôleurs neuronaux sur des conditions identifiées.</p><div class="menu-entry-grid lab-entry-grid"><button class="menu-entry-card" data-menu-entry="steering-lab"><span class="menu-entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 37 19 25l8 5 13-18M29 12h11v11M8 17h8M8 25h5"/></svg></span><span class="menu-entry-text"><b>STEERING LAB</b><small>Démonstrations interactives de Seek, Path Following et des forces de steering.</small></span><span class="menu-entry-arrow" aria-hidden="true">↗</span></button><button class="menu-entry-card" data-menu-entry="neural-lab"><span class="menu-entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="10" cy="24" r="4"/><circle cx="24" cy="12" r="4"/><circle cx="24" cy="36" r="4"/><circle cx="38" cy="18" r="4"/><circle cx="38" cy="30" r="4"/><path d="m14 22 6-8m-6 12 6 8m6-20 8 3m-8 15 8-3m0-8v4"/></svg></span><span class="menu-entry-text"><b>NEURAL LAB</b><small>Comparer Steering et Neural, inspecter les cerveaux et consulter les résultats.</small></span><span class="menu-entry-arrow" aria-hidden="true">↗</span></button></div></section><section class="home-panel menu-panel secondary-panel hidden menu-section-panel" data-panel="creation"><div class="panel-topline"><button class="back-home" type="button">← MENU</button><span>CRÉATION</span><span>CIRCUITS PERSONNALISÉS</span></div><h2>Créez votre circuit</h2><p class="menu-copy">Dessinez une piste, validez sa géométrie, enregistrez-la et testez-la dans les modes compatibles.</p><div class="menu-entry-grid creation-entry-grid"><button class="menu-entry-card menu-entry-featured" data-menu-entry="circuit-studio"><span class="menu-entry-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 33c0-7 6-12 13-12h7c7 0 12-5 12-12M8 33c0 5 4 8 9 8h11c7 0 12-4 12-10s-5-10-12-10M13 13h9m-9 0v9m22 13h5v-5"/></svg></span><span class="menu-entry-text"><b>CIRCUIT STUDIO</b><small>Créer, générer, sauvegarder et tester une piste utilisateur.</small></span><span class="menu-entry-arrow" aria-hidden="true">↗</span></button></div></section>`);
mountCareerPanel(menu);
const steeringEntry = menu.querySelector('[data-menu-entry="steering-lab"]');
steeringEntry?.querySelector('b') && (steeringEntry.querySelector('b').textContent = 'STEERING LAB · COURSE 3D');
steeringEntry?.querySelector('small') && (steeringEntry.querySelector('small').textContent = 'Observer les pilotes Steering et leurs forces dans le circuit F1 et ses caméras.');
const neuralEntry = menu.querySelector('[data-menu-entry="neural-lab"]');
neuralEntry?.querySelector('b') && (neuralEntry.querySelector('b').textContent = 'NEURAL LAB · COURSE 3D');
neuralEntry?.querySelector('small') && (neuralEntry.querySelector('small').textContent = 'Comparer les vrais modèles A/B/C aux pilotes Steering dans la même scène arcade.');
menu.querySelector('[data-panel="ai-labs"] .lab-entry-grid')?.insertAdjacentHTML('afterend', `<fieldset class="integrated-lab-options"><legend>Modèles historiques de la course 3D</legend><label><input type="checkbox" data-neural-model="A" checked> A</label><label><input type="checkbox" data-neural-model="B" checked> B</label><label><input type="checkbox" data-neural-model="C" checked> C</label><label>Graine de grille<input id="neural-lab-seed" type="number" min="0" max="4294967295" value="13013"></label><small>Steering AI est toujours inclus. Simulation arcade : aucune donnée scientifique n’est écrite.</small></fieldset>`);
const aiLabsPanel = menu.querySelector('[data-panel="ai-labs"]');
const labLaunchStatus = document.createElement('p');
labLaunchStatus.id = 'lab-launch-status';
labLaunchStatus.className = 'lab-launch-status';
labLaunchStatus.setAttribute('role', 'status');
labLaunchStatus.setAttribute('aria-live', 'polite');
labLaunchStatus.hidden = true;
aiLabsPanel?.querySelector('h2')?.after(labLaunchStatus);
let labLaunchPending = false;
function syncLabLaunchButtons() {
  const unavailable = labLaunchPending || (typeof navigation !== 'undefined' && navigation.state !== 'menu');
  menu.querySelectorAll('.lab-entry-grid [data-menu-entry]').forEach((button) => { button.disabled = unavailable; });
}
function showLabLaunchError(mode, error) {
  console.error(`[NeuroDrive F1] ${mode} launch failed`, error);
  audioManager.unlock().then((ready) => { if (ready) audioManager.event('ui-error'); });
  labLaunchPending = false;
  labLaunchStatus.hidden = false;
  labLaunchStatus.dataset.state = 'error';
  labLaunchStatus.setAttribute('role', 'alert');
  labLaunchStatus.textContent = `${mode} n'a pas pu démarrer. Vérifiez le circuit et réessayez.`;
  syncLabLaunchButtons();
}
const labTrackLabel = document.createElement('label');
labTrackLabel.className = 'integrated-lab-track-select'; labTrackLabel.textContent = 'CIRCUIT DE L’EXPÉRIENCE';
const labTrackSelect = document.createElement('select'); labTrackSelect.id = 'integrated-lab-track';
for (const option of menu.querySelector('#menu-track')?.options ?? []) labTrackSelect.add(option.cloneNode(true));
labTrackSelect.value = menu.querySelector('#menu-track')?.value ?? 'original';
labTrackSelect.addEventListener('change', () => {
  menu.querySelector('#menu-track').value = labTrackSelect.value;
  menu.querySelectorAll('[data-track]').forEach((button) => button.classList.toggle('selected', button.dataset.track === labTrackSelect.value));
  updateRaceReadySummary();
  previewCircuit(labTrackSelect.value).catch((error) => { menu.querySelector('.menu-copy').textContent = `Circuit indisponible : ${error.message}`; });
});
menu.querySelector('#menu-track')?.addEventListener('change', () => {
  labTrackSelect.value = menu.querySelector('#menu-track').value;
  menu.querySelectorAll('[data-track]').forEach((button) => button.classList.toggle('selected', button.dataset.track === labTrackSelect.value));
  updateRaceReadySummary();
  previewCircuit(labTrackSelect.value).catch((error) => { menu.querySelector('.menu-copy').textContent = `Circuit indisponible : ${error.message}`; });
});
labTrackLabel.append(labTrackSelect); aiLabsPanel?.insertBefore(labTrackLabel, aiLabsPanel.querySelector('.integrated-lab-options'));
menu.querySelector('.showroom-hint')?.remove();
menu.querySelector('.menu-index')?.remove();
menu.querySelector('.menu-foot')?.remove();
menu.querySelector('.camera-presets')?.insertAdjacentHTML('afterend', '<button id="camera-reset" class="camera-reset" type="button">RÉINITIALISER LA CAMÉRA</button>');
menu.querySelector('[data-panel="settings"]').insertAdjacentHTML('beforeend', `<div class="settings-divider"></div><h3>Graphismes</h3><label class="menu-field">QUALITÉ<select id="graphics-quality"><option value="low">Basse</option><option value="medium">Moyenne</option><option value="high">Haute</option></select></label><label class="toggle-setting"><input id="graphics-shadows" type="checkbox"><span>Ombres</span></label><label class="menu-field">DENSITÉ DU DÉCOR<select id="graphics-scenery"><option value="low">Réduite</option><option value="medium">Normale</option><option value="high">Complète</option></select></label><label class="toggle-setting"><input id="graphics-effects" type="checkbox"><span>Effets visuels de vitesse et collision</span></label><div class="settings-divider"></div><h3>Caméra et commandes</h3><label class="menu-field">CAMÉRA DE COURSE<select id="camera-default"><option value="chase">Poursuite</option><option value="hood">Capot</option><option value="trackside">Bord de piste</option><option value="cockpit">Cockpit</option><option value="overview">Aérienne</option></select></label><label class="menu-field">SENSIBILITÉ ORBITALE<input id="camera-sensitivity" type="range" min="0.003" max="0.02" step="0.001"></label><label class="menu-field">VITESSE DU ZOOM<input id="zoom-sensitivity" type="range" min="0.3" max="1.6" step="0.1"></label><p class="availability-note">Course au clavier : ↑ accélérer · ↓ freiner · ← → braquer · Espace pause · R redémarrer · C caméra · 1–6 suivre.</p><details class="showroom-help"><summary>Aide showroom</summary><p>Glissez horizontalement pour orbiter autour de la voiture sur 360°. La molette ajuste progressivement le zoom. Le bouton de réinitialisation revient au trois-quarts avant.</p></details><label class="menu-field">MODÈLE PAR DÉFAUT POUR ESSAI NEURAL<select id="default-model"><option>A</option><option>B</option><option>C</option></select></label><button id="haptics-test" class="settings-action" type="button">TESTER LES VIBRATIONS</button><button id="settings-reset" class="settings-action secondary" type="button">RESTAURER LES PARAMÈTRES PAR DÉFAUT</button>`);
const performanceSettingsHeading = menu.querySelector('[data-panel="settings"] h3');
performanceSettingsHeading.textContent = 'Performance & graphismes';
performanceSettingsHeading.insertAdjacentHTML('afterend', '<p class="availability-note">Le profil règle la résolution interne, la taille des cartes d’ombre et la densité du décor. L’antialiasing du contexte reste fixe pendant la session.</p>');
menu.querySelector('#graphics-effects').closest('.toggle-setting').insertAdjacentHTML('afterend', '<p class="availability-note" id="graphics-effects-note">Effets désactivés avec le profil Faible.</p><label class="toggle-setting"><input id="performance-fps" type="checkbox"><span>Afficher le moniteur FPS</span></label><p class="availability-note">FPS et ms/RAF mesurent la cadence d’image, pas le temps CPU ou GPU.</p>');
app.append(menu);
const garageDynamics = new GameVehicleDynamics();
menu.querySelector('[data-panel="garage"] .menu-copy')?.insertAdjacentHTML('afterend', `<div class="garage-specs"><span class="menu-kicker">FICHE TECHNIQUE · PHYSIQUE ARCADE</span><div><b>${(56 * 1.1 * 3.6).toFixed(0)} <small>km/h max. joueur</small></b><b>${garageDynamics.acceleration.toFixed(0)} <small>m/s² · accélération</small></b><b>${garageDynamics.braking.toFixed(0)} <small>m/s² · freinage</small></b><b>${garageDynamics.turnRate.toFixed(1)} <small>rad/s · braquage</small></b></div><p>Physique de base commune; la vitesse maximale du joueur est majorée de 10 % en course arcade. Les IA conservent leur réglage de base.</p></div>`);
const circuitLapsSelect = menu.querySelector('#menu-laps').cloneNode(true);
circuitLapsSelect.id = 'circuit-ready-laps'; circuitLapsSelect.setAttribute('aria-label', 'Nombre de tours pour la course rapide');
const circuitLapsField = document.createElement('label'); circuitLapsField.className = 'menu-field'; circuitLapsField.textContent = 'NOMBRE DE TOURS'; circuitLapsField.append(circuitLapsSelect);
menu.querySelector('[data-panel="circuits"] .launch-from-panel')?.before(circuitLapsField);
menu.querySelector('#circuit-ready-laps').addEventListener('change', (event) => { menu.querySelector('#menu-laps').value = event.target.value; updateRaceReadySummary(); });
menu.querySelector('.camera-presets')?.insertAdjacentHTML('afterend', `<section class="garage-personalization"><span class="menu-kicker">PERSONNALISATION GARAGE</span><label class="menu-field">MODÈLE VISUEL<select id="garage-car-model"><option value="apex">APEX · équilibrée</option><option value="velocity">VELOCITY · profil aérodynamique</option><option value="titan">TITAN · carrosserie large</option><option value="phantom">PHANTOM · silhouette furtive</option></select></label><label class="menu-field">NOM DU PILOTE<input id="garage-driver-name" maxlength="32" autocomplete="name"></label><label class="menu-field">NUMÉRO<input id="garage-driver-number" type="number" min="0" max="99" step="1"></label><span class="garage-option-label">COULEUR SECONDAIRE</span><div class="livery-row accent-row" role="group" aria-label="Choisir la couleur secondaire"><button data-accent="#f5f5f5" aria-label="Blanc" class="selected"></button><button data-accent="#e10600" aria-label="Rouge compétition"></button><button data-accent="#1684ff" aria-label="Bleu"></button><button data-accent="#d6b14d" aria-label="Or"></button></div><span class="garage-option-label">APPARENCE DU PILOTE</span><div class="garage-driver-options"><label class="menu-field">AVATAR<select id="garage-driver-avatar"><option value="classic">CLASSIC</option><option value="nova">NOVA</option><option value="vector">VECTOR</option></select></label><label class="menu-field">CASQUE<input id="garage-helmet-color" type="color" aria-label="Couleur du casque"></label><label class="menu-field">COMBINAISON<input id="garage-suit-color" type="color" aria-label="Couleur de la combinaison"></label></div><label class="menu-field">TEINTE DE PEAU<select id="garage-skin-tone" aria-label="Teinte de peau"><option value="#6b422e">Brun profond</option><option value="#925f42">Brun</option><option value="#b77955">Moyen</option><option value="#d5a27f">Clair</option><option value="#f0c9a7">Très clair</option></select></label><p class="availability-note">Les variantes de carrosserie et l’avatar sont visuels. Physique, capteurs et performances restent identiques.</p><button id="garage-reset" class="settings-action secondary" type="button">RÉINITIALISER LA PERSONNALISATION</button></section>`);
const userCircuitLibrary = new CircuitLibrary();
function resolveSelectedTrack(trackId) {
  if (!String(trackId).startsWith(USER_TRACK_SELECTION_PREFIX)) return null;
  return resolveTrackSelection(trackId, { library: userCircuitLibrary });
}
function getCareerAvailableTracks() {
  const tracks = createGeneralizationTracks().map((track) => ({ selectionId: track.id, track, custom: false }));
  try {
    for (const circuit of userCircuitLibrary.list()) tracks.push({ selectionId: `${USER_TRACK_SELECTION_PREFIX}${circuit.id}`, track: resolveTrackSelection(`${USER_TRACK_SELECTION_PREFIX}${circuit.id}`, { library: userCircuitLibrary }), custom: true });
  } catch (error) { console.warn('Custom tracks are unavailable to the career calendar', error); }
  return tracks;
}
function refreshUserCircuitOptions() {
  const trackSelect = menu.querySelector('#menu-track');
  const labSelect = menu.querySelector('#integrated-lab-track');
  if (!trackSelect) return;
  const selected = trackSelect.value;
  trackSelect.querySelector('optgroup[data-user-circuits]')?.remove();
  let circuits = [];
  try { circuits = userCircuitLibrary.list(); } catch (error) { console.warn('Circuit library could not be read', error); }
  if (circuits.length) {
    const group = document.createElement('optgroup'); group.label = 'Circuits personnalisés'; group.dataset.userCircuits = 'true';
    for (const circuit of circuits) {
      const option = document.createElement('option'); option.value = `user:${circuit.id}`; option.textContent = `${circuit.name} · personnalisé`; group.append(option);
    }
    trackSelect.append(group);
  }
  if ([...trackSelect.options].some((option) => option.value === selected)) trackSelect.value = selected;
  if (labSelect) {
    const labSelected = labSelect.value;
    labSelect.innerHTML = '';
    for (const option of trackSelect.options) labSelect.add(option.cloneNode(true));
    labSelect.value = [...labSelect.options].some((option) => option.value === labSelected) ? labSelected : trackSelect.value;
  }
}
refreshUserCircuitOptions();
const careerStore = new CareerStore();
let tutorialGuide = new RaceTutorial();
let professorDemo = null;
const showroom = new MenuShowroom(menu.querySelector('#showroom-stage'));
const preferences = (() => { try { return JSON.parse(localStorage.getItem('neurodrive-game-preferences') ?? '{}'); } catch { return {}; } })();
const savedDriverProfile = careerStore.read().profile;
const requestedPrimaryLivery = preferences.livery ?? savedDriverProfile.livery ?? '#e10600';
const requestedSecondaryLivery = preferences.secondaryLivery ?? savedDriverProfile.preferences?.secondaryLivery ?? '#f5f5f5';
let selectedLivery = /^#[0-9a-f]{6}$/i.test(requestedPrimaryLivery) ? requestedPrimaryLivery : '#e10600';
let selectedSecondaryLivery = /^#[0-9a-f]{6}$/i.test(requestedSecondaryLivery) ? requestedSecondaryLivery : '#f5f5f5';
const requestedDriverNumber = Number(preferences.driverNumber ?? savedDriverProfile.preferences?.driverNumber ?? 7);
let selectedDriverNumber = Number.isInteger(requestedDriverNumber) && requestedDriverNumber >= 0 && requestedDriverNumber <= 99 ? requestedDriverNumber : 7;
let selectedDriverName = savedDriverProfile.name;
const savedVisualPreferences = savedDriverProfile.preferences ?? {};
let selectedCarModel = ['apex', 'velocity', 'titan', 'phantom'].includes(preferences.carModel ?? savedVisualPreferences.carModel) ? (preferences.carModel ?? savedVisualPreferences.carModel) : 'apex';
let selectedDriverAvatar = ['classic', 'nova', 'vector'].includes(preferences.driverAvatar ?? savedVisualPreferences.driverAvatar) ? (preferences.driverAvatar ?? savedVisualPreferences.driverAvatar) : 'classic';
let selectedHelmetColor = /^#[0-9a-f]{6}$/i.test(preferences.helmetColor ?? savedVisualPreferences.helmetColor ?? '') ? (preferences.helmetColor ?? savedVisualPreferences.helmetColor) : '#f5f5f5';
let selectedSuitColor = /^#[0-9a-f]{6}$/i.test(preferences.suitColor ?? savedVisualPreferences.suitColor ?? '') ? (preferences.suitColor ?? savedVisualPreferences.suitColor) : '#222832';
const skinTones = ['#6b422e', '#925f42', '#b77955', '#d5a27f', '#f0c9a7'];
let selectedSkinTone = skinTones.includes(preferences.skinTone ?? savedVisualPreferences.skinTone) ? (preferences.skinTone ?? savedVisualPreferences.skinTone) : '#b77955';
function applyGarageCustomization() {
  const primaryColor = Number.parseInt(selectedLivery.slice(1), 16), secondaryColor = Number.parseInt(selectedSecondaryLivery.slice(1), 16);
  showroom.setCustomization({ primaryColor, secondaryColor, driverNumber: selectedDriverNumber, model: selectedCarModel, driver: { avatar: selectedDriverAvatar, helmetColor: Number.parseInt(selectedHelmetColor.slice(1), 16), suitColor: Number.parseInt(selectedSuitColor.slice(1), 16), skinColor: Number.parseInt(selectedSkinTone.slice(1), 16) } });
}
function persistVisualCustomization() {
  Object.assign(preferences, { carModel: selectedCarModel, driverAvatar: selectedDriverAvatar, helmetColor: selectedHelmetColor, suitColor: selectedSuitColor, skinTone: selectedSkinTone });
  localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences));
  careerStore.setProfile({ preferences: { carModel: selectedCarModel, driverAvatar: selectedDriverAvatar, helmetColor: selectedHelmetColor, suitColor: selectedSuitColor, skinTone: selectedSkinTone } });
}
applyGarageCustomization();
menu.querySelector('.profile-chip b').textContent = selectedDriverName;
menu.querySelector('#garage-driver-name').value = selectedDriverName;
menu.querySelector('#garage-driver-number').value = String(selectedDriverNumber);
menu.querySelector('#garage-car-model').value = selectedCarModel;
menu.querySelector('#garage-driver-avatar').value = selectedDriverAvatar;
menu.querySelector('#garage-helmet-color').value = selectedHelmetColor;
menu.querySelector('#garage-suit-color').value = selectedSuitColor;
menu.querySelector('#garage-skin-tone').value = selectedSkinTone;
menu.querySelectorAll('[data-accent]').forEach((button) => button.classList.toggle('selected', button.dataset.accent === selectedSecondaryLivery));
let gameSettings = readGameSettings();
const settingsControls = {
  quality: menu.querySelector('#graphics-quality'), shadows: menu.querySelector('#graphics-shadows'), scenery: menu.querySelector('#graphics-scenery'),
  effects: menu.querySelector('#graphics-effects'), showFps: menu.querySelector('#performance-fps'), cameraMode: menu.querySelector('#camera-default'),
  orbitSensitivity: menu.querySelector('#camera-sensitivity'), zoomSensitivity: menu.querySelector('#zoom-sensitivity'), model: menu.querySelector('#default-model'),
};
function syncSettingsForm() {
  gameSettings = readGameSettings();
  for (const key of ['quality', 'shadows', 'scenery', 'effects', 'showFps', 'cameraMode', 'orbitSensitivity', 'zoomSensitivity']) {
    const control = settingsControls[key]; if (control) control.type === 'checkbox' ? control.checked = gameSettings[key] : control.value = gameSettings[key];
  }
  settingsControls.effects.checked = gameSettings.effects && gameSettings.quality !== 'low';
  settingsControls.effects.disabled = gameSettings.quality === 'low';
  menu.querySelector('#graphics-effects-note').textContent = gameSettings.quality === 'low'
    ? 'Les effets visuels sont désactivés en profil Faible.'
    : 'Les effets visuels de course peuvent être activés ou désactivés.';
  settingsControls.model.value = ['A', 'B', 'C'].includes(preferences.configuration) ? preferences.configuration : 'A';
}
function saveVisualSettings() {
  const previous = gameSettings;
  const keepEffectsPreference = settingsControls.quality.value === 'low' || previous.quality === 'low';
  gameSettings = writeGameSettings({
    quality: settingsControls.quality.value, shadows: settingsControls.shadows.checked, scenery: settingsControls.scenery.value,
    effects: keepEffectsPreference ? previous.effects : settingsControls.effects.checked, showFps: settingsControls.showFps.checked, cameraMode: settingsControls.cameraMode.value,
    orbitSensitivity: settingsControls.orbitSensitivity.value, zoomSensitivity: settingsControls.zoomSensitivity.value,
  });
  settingsControls.effects.checked = gameSettings.effects && gameSettings.quality !== 'low';
  settingsControls.effects.disabled = gameSettings.quality === 'low';
  menu.querySelector('#graphics-effects-note').textContent = gameSettings.quality === 'low'
    ? 'Les effets visuels sont désactivés en profil Faible.'
    : 'Les effets visuels de course peuvent être activés ou désactivés.';
  if (['quality', 'shadows', 'scenery', 'effects', 'showFps'].some((key) => previous[key] !== gameSettings[key])) showroom.applySettings();
}
syncSettingsForm();
menu.querySelectorAll('[data-color]').forEach((button) => button.classList.toggle('selected', button.dataset.color === selectedLivery));
menu.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => {
  menu.querySelectorAll('[data-view]').forEach((item) => item.classList.toggle('active', item === button));
  menu.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== button.dataset.view));
  menu.classList.toggle('menu-career-active', button.dataset.view === 'career');
  audioManager.setScene(({ home: 'menu', garage: 'garage', circuits: 'circuits', career: 'career', 'ai-labs': 'steering-lab', creation: 'creation', settings: 'menu' })[button.dataset.view] ?? 'menu');
  if (button.dataset.view === 'career') refreshCareerPanel(menu, careerStore, tutorialGuide.snapshot(), getCareerAvailableTracks());
  if (button.dataset.view === 'circuits') { menu.querySelector('#showroom-badge-title').textContent = 'CIRCUIT 3D · APERÇU'; previewCircuit(menu.querySelector('#menu-track').value); }
  else { menu.querySelector('#showroom-badge-title').textContent = 'SHOWROOM 3D'; showroom.setVehicle(); }
  audioManager.unlock();
}));
let lastMenuHoverAt = 0;
menu.addEventListener('pointerover', (event) => {
  const control = event.target.closest?.('button, [role="button"]');
  if (!control || control.contains(event.relatedTarget)) return;
  const now = performance.now();
  if (now - lastMenuHoverAt < 140) return;
  lastMenuHoverAt = now;
  audioManager.unlock().then((ready) => { if (ready) audioManager.event('ui-hover'); });
});
menu.addEventListener('click', (event) => {
  if (!event.target.closest?.('button, [role="button"]')) return;
  audioManager.unlock().then((ready) => { if (ready) audioManager.event('ui-confirm'); });
});
menu.addEventListener('change', (event) => {
  if (!event.target.matches?.('select')) return;
  audioManager.unlock().then((ready) => { if (ready) audioManager.event('ui-confirm'); });
});
menu.querySelectorAll('.back-home').forEach((button) => button.addEventListener('click', () => menu.querySelector('[data-view="home"]').click()));
menu.querySelectorAll('.launch-from-panel').forEach((button) => button.addEventListener('click', () => {
  if (getPanelCtaAction(button.closest('[data-panel]')?.dataset.panel) === 'circuits') menu.querySelector('[data-view="circuits"]').click();
  else menu.querySelector('#launch-simulation').click();
}));
menu.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => { selectedLivery = button.dataset.color; applyGarageCustomization(); menu.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('selected', item === button)); preferences.livery = selectedLivery; careerStore.setProfile({ livery: selectedLivery }); localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences)); updateRaceReadySummary(); }));
menu.querySelectorAll('[data-accent]').forEach((button) => button.addEventListener('click', () => { selectedSecondaryLivery = button.dataset.accent; applyGarageCustomization(); menu.querySelectorAll('[data-accent]').forEach((item) => item.classList.toggle('selected', item === button)); preferences.secondaryLivery = selectedSecondaryLivery; careerStore.setProfile({ preferences: { secondaryLivery: selectedSecondaryLivery } }); localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences)); }));
menu.querySelector('#garage-car-model').addEventListener('change', (event) => { selectedCarModel = ['apex', 'velocity', 'titan', 'phantom'].includes(event.target.value) ? event.target.value : 'apex'; event.target.value = selectedCarModel; persistVisualCustomization(); applyGarageCustomization(); });
menu.querySelector('#garage-driver-avatar').addEventListener('change', (event) => { selectedDriverAvatar = ['classic', 'nova', 'vector'].includes(event.target.value) ? event.target.value : 'classic'; event.target.value = selectedDriverAvatar; persistVisualCustomization(); applyGarageCustomization(); });
menu.querySelector('#garage-helmet-color').addEventListener('input', (event) => { if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) return; selectedHelmetColor = event.target.value; persistVisualCustomization(); applyGarageCustomization(); });
menu.querySelector('#garage-suit-color').addEventListener('input', (event) => { if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) return; selectedSuitColor = event.target.value; persistVisualCustomization(); applyGarageCustomization(); });
menu.querySelector('#garage-skin-tone').addEventListener('change', (event) => { selectedSkinTone = skinTones.includes(event.target.value) ? event.target.value : '#b77955'; event.target.value = selectedSkinTone; persistVisualCustomization(); applyGarageCustomization(); });
menu.querySelector('#garage-driver-name').addEventListener('change', (event) => {
  selectedDriverName = String(event.target.value).trim().slice(0, 32) || 'Pilote ND'; event.target.value = selectedDriverName;
  careerStore.setProfile({ name: selectedDriverName }); menu.querySelector('.profile-chip b').textContent = selectedDriverName; updateRaceReadySummary();
});
menu.querySelector('#garage-driver-number').addEventListener('change', (event) => {
  const value = Number(event.target.value);
  if (!Number.isInteger(value) || value < 0 || value > 99) { event.target.value = String(selectedDriverNumber); return; }
  selectedDriverNumber = value; preferences.driverNumber = value; applyGarageCustomization(); updateRaceReadySummary();
  careerStore.setProfile({ preferences: { driverNumber: value } }); localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences));
});
menu.querySelector('#garage-reset').addEventListener('click', () => {
  selectedLivery = '#e10600'; selectedSecondaryLivery = '#f5f5f5'; selectedDriverNumber = 7; selectedDriverName = 'Pilote ND'; selectedCarModel = 'apex'; selectedDriverAvatar = 'classic'; selectedHelmetColor = '#f5f5f5'; selectedSuitColor = '#222832'; selectedSkinTone = '#b77955';
  preferences.livery = selectedLivery; preferences.secondaryLivery = selectedSecondaryLivery; preferences.driverNumber = selectedDriverNumber;
  careerStore.setProfile({ name: selectedDriverName, livery: selectedLivery, preferences: { secondaryLivery: selectedSecondaryLivery, driverNumber: selectedDriverNumber } });
  localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences));
  menu.querySelector('#garage-driver-name').value = selectedDriverName; menu.querySelector('#garage-driver-number').value = String(selectedDriverNumber);
  menu.querySelector('#garage-car-model').value = selectedCarModel; menu.querySelector('#garage-driver-avatar').value = selectedDriverAvatar; menu.querySelector('#garage-helmet-color').value = selectedHelmetColor; menu.querySelector('#garage-suit-color').value = selectedSuitColor; menu.querySelector('#garage-skin-tone').value = selectedSkinTone;
  menu.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('selected', item.dataset.color === selectedLivery));
  menu.querySelectorAll('[data-accent]').forEach((item) => item.classList.toggle('selected', item.dataset.accent === selectedSecondaryLivery));
  menu.querySelector('.profile-chip b').textContent = selectedDriverName; persistVisualCustomization(); applyGarageCustomization(); updateRaceReadySummary();
});
menu.querySelectorAll('[data-camera]').forEach((button) => button.addEventListener('click', () => { showroom.setView(button.dataset.camera); menu.querySelectorAll('[data-camera]').forEach((item) => item.classList.toggle('selected', item === button)); }));
menu.querySelector('#camera-reset').addEventListener('click', () => { showroom.resetCamera(); menu.querySelectorAll('[data-camera]').forEach((item) => item.classList.toggle('selected', item.dataset.camera === 'threeQuarter')); });
menu.querySelector('.track-cards').addEventListener('click', (event) => {
  const button = event.target.closest('[data-track]'); if (!button || button.disabled) return;
  menu.querySelector('#menu-track').value = button.dataset.track;
  if (labTrackSelect) labTrackSelect.value = button.dataset.track;
  menu.querySelectorAll('[data-track]').forEach((item) => item.classList.toggle('selected', item === button));
  updateRaceReadySummary();
  previewCircuit(button.dataset.track).catch((error) => { button.disabled = true; button.dataset.status = 'error'; menu.querySelector('#race-ready-summary').textContent = `Circuit indisponible : ${error.message}`; });
});
menu.querySelector('#audio-enabled').checked = audioManager.settings.enabled;
menu.querySelectorAll('[data-volume]').forEach((input) => { input.value = audioManager.settings[input.dataset.volume]; input.addEventListener('input', () => audioManager.setVolume(input.dataset.volume, input.value)); });
menu.querySelector('#audio-enabled').addEventListener('change', (event) => { audioManager.setEnabled(event.target.checked); if (event.target.checked) audioManager.unlock(); });
menu.querySelector('#haptics-enabled').checked = hapticsManager.settings.enabled; menu.querySelector('#haptics-intensity').value = hapticsManager.settings.intensity;
menu.querySelector('#haptics-enabled').disabled = !hapticsManager.isSupported();
if (!hapticsManager.isSupported()) menu.querySelector('#haptics-support-note').textContent = 'API de vibration non détectée sur cet appareil : option désactivée.';
menu.querySelector('#haptics-enabled').addEventListener('change', (event) => hapticsManager.setEnabled(event.target.checked));
menu.querySelector('#haptics-intensity').addEventListener('input', (event) => hapticsManager.setIntensity(event.target.value));
Object.entries(settingsControls).filter(([key]) => key !== 'model').forEach(([, control]) => control.addEventListener('input', saveVisualSettings));
Object.entries(settingsControls).filter(([key]) => key !== 'model').forEach(([, control]) => control.addEventListener('change', saveVisualSettings));
settingsControls.model.addEventListener('change', () => { preferences.configuration = settingsControls.model.value; localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences)); });
menu.querySelector('#haptics-test').disabled = !hapticsManager.isSupported();
menu.querySelector('#haptics-test').addEventListener('click', () => {
  const sent = hapticsManager.pulse('collision');
  menu.querySelector('#haptics-support-note').textContent = sent ? 'Impulsion de test envoyée au périphérique compatible.' : 'Test non envoyé : activez les vibrations et vérifiez le périphérique.';
});
menu.querySelector('#settings-reset').addEventListener('click', () => {
  gameSettings = resetGameSettings();
  audioManager.resetSettings(); hapticsManager.resetSettings();
  preferences.configuration = 'A'; preferences.livery = '#e10600'; selectedLivery = preferences.livery;
  localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences));
  showroom.setColor(selectedLivery); syncSettingsForm(); showroom.applySettings(); showroom.resetCamera();
  menu.querySelectorAll('[data-color]').forEach((button) => button.classList.toggle('selected', button.dataset.color === selectedLivery));
  menu.querySelector('#audio-enabled').checked = audioManager.settings.enabled;
  menu.querySelectorAll('[data-volume]').forEach((input) => { input.value = audioManager.settings[input.dataset.volume]; });
  menu.querySelector('#haptics-enabled').checked = hapticsManager.settings.enabled;
  menu.querySelector('#haptics-intensity').value = hapticsManager.settings.intensity;
});

bindCareerPanel(menu, careerStore, {
  onChampionshipStart: (round) => launch({ championshipRound: round }),
  getAvailableTracks: getCareerAvailableTracks,
  onTutorial: () => continueTutorial(),
  onTutorialChapter: (chapterId) => { tutorialGuide.selectChapter(chapterId); continueTutorial(); },
  onTutorialRestart: () => { tutorialGuide.reset(); continueTutorial(); },
  onDemo: () => startProfessorDemo(),
  onReplay: (replay) => openSavedReplay(replay),
  onImportReplay: async (replay) => {
    const { createGeneralizationTracks } = await import('./ai/training/GeneralizationTracks.js');
    const knownTrack = createGeneralizationTracks().find((track) => track.id === replay.track?.id);
    const compatible = upgradeRaceReplay(replay, { knownTrack });
    return careerStore.importReplay(compatible);
  },
  onCompliance: () => openComplianceReport(),
  onUpdate: (profile) => { menu.querySelector('.profile-chip b').textContent = profile.name; selectedDriverName = profile.name; selectedLivery = profile.livery; selectedDriverNumber = profile.preferences?.driverNumber ?? selectedDriverNumber; selectedSecondaryLivery = profile.preferences?.secondaryLivery ?? selectedSecondaryLivery; preferences.livery = selectedLivery; preferences.secondaryLivery = selectedSecondaryLivery; preferences.driverNumber = selectedDriverNumber; localStorage.setItem('neurodrive-game-preferences', JSON.stringify(preferences)); applyGarageCustomization(); menu.querySelector('#garage-driver-name').value = profile.name; menu.querySelector('#garage-driver-number').value = String(selectedDriverNumber); menu.querySelectorAll('[data-color]').forEach((item) => item.classList.toggle('selected', item.dataset.color === selectedLivery)); menu.querySelectorAll('[data-accent]').forEach((item) => item.classList.toggle('selected', item.dataset.accent === selectedSecondaryLivery)); updateRaceReadySummary(); },
});

bindMainMenuEntries(menu, {
  'quick-race': () => launch(),
  championship: () => menu.querySelector('[data-view="career"]')?.click(),
  tutorial: () => continueTutorial(),
  ...createIntegratedLabEntryActions({ steering: () => launchIntegratedSteeringLab(), neural: () => launchIntegratedNeuralLab() }),
  'circuit-studio': () => launch({ mode: 'circuit-studio' }),
});

async function returnToIntegratedLabs() {
  if (navigation.state === 'simulation') await navigation.returnToMenu();
  menu.querySelector('[data-view="ai-labs"]')?.click();
}

function launchIntegratedSteeringLab({ professorMode = false, trackDefinition = null, onReturn = returnToIntegratedLabs } = {}) {
  if (labLaunchPending || navigation.state !== 'menu') return Promise.resolve(null);
  labLaunchPending = true;
  labLaunchStatus.hidden = false;
  labLaunchStatus.dataset.state = 'loading';
  labLaunchStatus.setAttribute('role', 'status');
  labLaunchStatus.textContent = 'Initialisation de la scène F1 et des contrôleurs Steering…';
  syncLabLaunchButtons();
  return launchSteeringLab(navigation, {
    documentRef: document, livery: selectedLivery, onReturn, professorMode, trackResolver: resolveSelectedTrack,
    createSession: async (options) => {
      const { RaceSession } = await import('./game/RaceSession.js');
      return new RaceSession({ ...options, trackDefinition: trackDefinition ?? resolveSelectedTrack(options.trackId) ?? undefined });
    },
  }).catch((error) => { showLabLaunchError('Steering Lab', error); return null; });
}

function launchIntegratedNeuralLab({ trackDefinition = null, configurations = null, onReturn = returnToIntegratedLabs, tutorial = false, professorMode = false } = {}) {
  if (labLaunchPending || navigation.state !== 'menu') return Promise.resolve(null);
  const selectedModels = configurations ?? [...menu.querySelectorAll('[data-neural-model]:checked')].map((input) => input.dataset.neuralModel);
  if (!selectedModels.length) {
    labLaunchStatus.hidden = false;
    labLaunchStatus.dataset.state = 'error';
    labLaunchStatus.setAttribute('role', 'alert');
    labLaunchStatus.textContent = 'Sélectionnez au moins un modèle A, B ou C avant de lancer Neural Lab.';
    return null;
  }
  labLaunchPending = true;
  labLaunchStatus.hidden = false;
  labLaunchStatus.dataset.state = 'loading';
  labLaunchStatus.setAttribute('role', 'status');
  labLaunchStatus.textContent = 'Chargement des modèles sélectionnés et préparation de la grille F1…';
  syncLabLaunchButtons();
  const requestedSeed = Number(menu.querySelector('#neural-lab-seed')?.value);
  const seed = Number.isInteger(requestedSeed) && requestedSeed >= 0 && requestedSeed <= 0xffffffff ? requestedSeed >>> 0 : 13013;
  audioManager.unlock();
  return launchNeuralLab(navigation, {
    documentRef: document, livery: selectedLivery, onReturn, configurations: selectedModels, seed, trackDefinition, tutorial, professorMode,
    trackResolver: resolveSelectedTrack,
    createSession: async (options) => {
      const { RaceSession } = await import('./game/RaceSession.js');
      return new RaceSession(options);
    },
  }).catch((error) => { showLabLaunchError('Neural Lab', error); return null; });
}

async function previewCircuit(trackId) {
  const userTrack = resolveSelectedTrack(trackId);
  if (userTrack) { showroom.setCircuit(userTrack); return; }
  const { createGeneralizationTracks } = await import('./ai/training/GeneralizationTracks.js');
  const circuit = createGeneralizationTracks().find((track) => track.id === trackId);
  if (!circuit) throw new RangeError(`Le circuit « ${trackId} » n'est pas disponible.`);
  showroom.setCircuit(circuit);
}

function escapeMarkup(value) { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

function updateRaceReadySummary() {
  const summary = menu.querySelector('#race-ready-summary');
  if (!summary) return;
  const trackSelect = menu.querySelector('#menu-track');
  const selected = trackSelect.options[trackSelect.selectedIndex];
  const laps = Number(menu.querySelector('#menu-laps').value) || 3;
  summary.innerHTML = `<b>PRÊT POUR LA COURSE</b><span><i style="--garage-car-color:${selectedLivery}"></i>${escapeMarkup(selectedDriverName)} · N° ${selectedDriverNumber}</span><span>${escapeMarkup(selected?.textContent ?? 'Circuit')} · ${laps} tours · 6 voitures</span><small>Course rapide · physique arcade commune</small>`;
}

async function refreshTrackGallery() {
  const gallery = menu.querySelector('.track-cards');
  if (!gallery) return;
  if (!menu.querySelector('#race-ready-summary')) {
    const summary = document.createElement('div'); summary.id = 'race-ready-summary'; summary.className = 'race-ready-summary'; gallery.after(summary);
  }
  const { createGeneralizationTracks } = await import('./ai/training/GeneralizationTracks.js');
  const builtIns = createGeneralizationTracks().map((track) => ({ track, kind: 'builtin', difficulty: ({ original: 'Entraînement', technical: 'Avancé', 'fast-oval': 'Intermédiaire' })[track.id] ?? 'Indicative' }));
  const custom = userCircuitLibrary.list().map((circuit) => ({ track: resolveTrackSelection(`user:${circuit.id}`, { library: userCircuitLibrary }), kind: 'custom', difficulty: circuit.metadata?.difficulty ?? 'Personnalisé' }));
  const selectedId = menu.querySelector('#menu-track').value;
  gallery.innerHTML = [...builtIns, ...custom].map(({ track, kind, difficulty }, index) => {
    const { length, turns } = measureTrackDefinition(track);
    const selected = (kind === 'custom' ? `user:${track.id}` : track.id) === selectedId;
    const selection = kind === 'custom' ? `user:${track.id}` : track.id;
    return `<button type="button" data-track="${escapeMarkup(selection)}" data-kind="${kind}" class="${selected ? 'selected' : ''}" aria-pressed="${selected}" aria-label="Sélectionner ${escapeMarkup(track.label)}"><span class="track-card-preview">${trackPreviewSvg(track)}</span><b>${String(index + 1).padStart(2, '0')}</b><strong>${escapeMarkup(track.label)}</strong><small>${(length / 1000).toFixed(2)} km · ${turns} virages · ${escapeMarkup(difficulty)}</small><em>${kind === 'custom' ? 'PERSONNALISÉ' : 'PRÊT À JOUER'}</em></button>`;
  }).join('');
  updateRaceReadySummary();
}

void refreshTrackGallery().catch((error) => { const gallery = menu.querySelector('.track-cards'); if (gallery) gallery.textContent = `Galerie indisponible : ${error.message}`; });
menu.querySelector('#menu-track').addEventListener('change', () => { updateRaceReadySummary(); if (labTrackSelect) labTrackSelect.value = menu.querySelector('#menu-track').value; });
menu.querySelector('#menu-laps').addEventListener('change', () => { menu.querySelector('#circuit-ready-laps').value = menu.querySelector('#menu-laps').value; updateRaceReadySummary(); });
menu.querySelector('[data-panel="circuits"] .launch-from-panel').innerHTML = 'LANCER LA COURSE <span>↗</span>';

const launchButton = document.querySelector('#launch-simulation');
const navigation = new SessionNavigation({ onStateChange(state) {
  // Gate REDLINE at the application lifecycle boundary. In particular, loading
  // fades the menu track out before an async 3D session is constructed.
  audioManager.setAppState(state);
  launchButton.disabled = state !== 'menu';
  if (state === 'simulation') {
    menu.classList.add('menu-dismissed'); showroom.setActive(false);
    audioManager.setScene(navigation.session?.laboratory?.type === 'steering' ? 'steering-lab' : navigation.session?.laboratory?.type === 'neural' ? 'neural-lab' : navigation.session?.tutorialGuide ? 'tutorial' : navigation.session?.championshipRound ? 'career' : 'race');
    audioManager.unlock();
    labLaunchPending = false; labLaunchStatus.hidden = true;
  }
  if (state === 'menu') {
    menu.classList.remove('menu-dismissed'); showroom.setActive(true);
    const activeMenu = menu.querySelector('[data-view].active')?.dataset.view ?? 'home';
    audioManager.setScene(({ home: 'menu', garage: 'garage', circuits: 'circuits', career: 'career', 'ai-labs': 'steering-lab', creation: 'creation', settings: 'menu' })[activeMenu] ?? 'menu');
    audioManager.unlock().then((ready) => { if (ready) audioManager.event('menu'); });
    menu.querySelector('#audio-enabled').checked = audioManager.settings.enabled;
    refreshCareerPanel(menu, careerStore, tutorialGuide.snapshot(), getCareerAvailableTracks());
    if (!labLaunchPending && labLaunchStatus.dataset.state === 'loading') labLaunchStatus.hidden = true;
  }
  syncLabLaunchButtons();
} });

async function launch({ mode = 'race', tutorial = false, tutorialSession = tutorialGuide, professorMode = false, initialScenario = null, championshipRound = null, initialCircuit = null } = {}) {
  audioManager.unlock(); audioManager.event('menu');
  if (mode === 'neural-racing') return launchIntegratedNeuralLab({ tutorial, professorMode });
  try {
    const onReturn = () => navigation.returnToMenu();
    if (mode === 'race') {
      await launchMenuRace(navigation, { documentRef: document, livery: selectedLivery, onReturn, createSession: async (options) => {
        const { RaceSession } = await import('./game/RaceSession.js');
        if (!championshipRound) return new RaceSession({ ...options, trackDefinition: resolveSelectedTrack(options.trackId) ?? undefined });
        const season = championshipRound.season;
        const scheduledTrack = careerStore.championshipTrackDefinition(championshipRound.trackId, season)
          ?? createGeneralizationTracks().find((track) => track.id === championshipRound.trackId);
        if (!scheduledTrack) throw new RangeError(`La géométrie du circuit « ${championshipRound.trackId} » manque à cette saison; aucun circuit de remplacement n’a été chargé.`);
        return new RaceSession({
          ...options,
          trackId: scheduledTrack.id,
          trackDefinition: scheduledTrack,
          laps: season.laps,
          formationLap: season.formationLap,
          aiDifficulty: season.difficulty,
          initialConditions: { day: 'day', weather: season.weather },
          championshipRound: { trackId: championshipRound.trackId, seasonId: season.id, roundIndex: championshipRound.index, roundTotal: season.rounds.length },
          onChampionshipAdvance: async () => { if (navigation.state === 'simulation') await navigation.returnToMenu(); menu.querySelector('[data-view="career"]')?.click(); },
        });
      }, tutorial: tutorial ? tutorialSession : false, professorMode });
    } else {
      await navigation.launch(async () => {
        if (mode === 'academy') {
        const { SteeringAcademy } = await import('./academy/SteeringAcademy.js');
          return new SteeringAcademy({ onReturn, initialScenario: initialScenario ?? undefined, onTutorialEvent: tutorial ? (event, details) => tutorialSession.observe(event, { mode: 'academy', ...details }) : null });
        }
        if (mode === 'circuit-studio') {
        const { CircuitStudio } = await import('./circuits/CircuitStudio.js');
          return new CircuitStudio({ onReturn, initialCircuit, onLibraryChange: () => { refreshUserCircuitOptions(); void refreshTrackGallery(); }, onTest: (request) => launchCircuitTest(request), onTutorialEvent: tutorial ? (event, details) => tutorialSession.observe(event, { mode: 'circuit-studio', ...details }) : null });
        }
        throw new Error(`Mode de jeu inconnu : ${mode}`);
      });
    }
  } catch (error) {
    document.querySelector('.menu-copy').textContent = `Impossible de lancer la simulation : ${error.message}`;
    return null;
  }
}

async function continueTutorial() {
  const step = tutorialGuide.current;
  if (!step) { refreshCareerPanel(menu, careerStore, tutorialGuide.snapshot(), getCareerAvailableTracks()); return; }
  if (navigation.state === 'simulation') await navigation.returnToMenu();
  const route = step.mode === 'race' ? 'race' : step.mode === 'academy' ? 'academy' : step.mode === 'circuit-studio' ? 'circuit-studio' : 'neural-racing';
  await launch({ mode: route, tutorial: true, tutorialSession: tutorialGuide });
}

async function startProfessorDemo() {
  if (professorDemo) professorDemo.dispose();
  professorDemo = new ProfessorDemo({
    host: document.body,
    onExit: async () => { if (navigation.state === 'simulation') await navigation.returnToMenu(); professorDemo = null; },
    onNavigate: async (step) => {
      if (navigation.state === 'simulation') await navigation.returnToMenu();
      const routes = {
        'steering-lab': () => launchIntegratedSteeringLab({ professorMode: true }),
        'neural-lab': () => launchIntegratedNeuralLab({ configurations: ['A', 'B', 'C'], professorMode: true, onReturn: returnToIntegratedLabs }),
      };
      if (routes[step.mode]) await routes[step.mode]();
    },
  });
}

async function openSavedReplay(replay) {
  if (navigation.state === 'simulation') await navigation.returnToMenu();
  try {
    await navigation.launch(async () => {
      const { RaceReplayViewer } = await import('./game/RaceReplayViewer.js');
      return new RaceReplayViewer({ app, replay, onClose: () => navigation.returnToMenu() });
    });
  } catch (error) { document.querySelector('#career-replay-message').textContent = `Replay non lisible : ${error.message}`; }
}

function openComplianceReport() { new ComplianceReport({ host: document.body }); }

async function launchCircuitTest({ mode, circuit, trackDefinition }) {
  await navigation.returnToMenu();
  const returnToEditor = async () => {
    if (navigation.state === 'simulation') await navigation.returnToMenu();
    return launch({ mode: 'circuit-studio', initialCircuit: circuit });
  };
  if (mode === 'neural') {
    return launchIntegratedNeuralLab({
      trackDefinition,
      configurations: [preferences.configuration ?? 'A'],
      onReturn: returnToEditor,
    });
  }
  if (mode === 'steering') return launchIntegratedSteeringLab({ trackDefinition, onReturn: returnToEditor });
  try {
    await navigation.launch(async () => {
      if (mode === 'race') {
        const { RaceSession } = await import('./game/RaceSession.js');
        return new RaceSession({ trackDefinition, persistResults: false, returnLabel: 'Retour à Circuit Studio', onReturn: returnToEditor });
      }
      if (mode === 'academy') {
        const { SteeringAcademy } = await import('./academy/SteeringAcademy.js');
        return new SteeringAcademy({ trackDefinition, onReturn: returnToEditor });
      }
    });
  } catch (error) {
    document.querySelector('.menu-copy').textContent = `Impossible de tester le circuit : ${error.message}`;
  }
}

