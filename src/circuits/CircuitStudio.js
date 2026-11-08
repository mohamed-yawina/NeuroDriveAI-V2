import { CatmullRomCurve3, Vector3 } from 'three';
import { circuitToTrackDefinition, createCircuit, parseCircuitJSON, validateCircuitFormat } from './CircuitFormat.js';
import { CircuitLibrary } from './CircuitLibrary.js';
import { findSafeGridStartIndex } from './CircuitValidator.js';
import { CIRCUIT_DIFFICULTIES, generateCircuit } from './CircuitGenerator.js';
import { CIRCUIT_TEMPLATES, circuitPreviewSvg, createCircuitTemplate } from './CircuitTemplates.js';
import { proposeCircuitImprovement } from './CircuitImprovement.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const DIFFICULTY_LABELS = { easy: 'Débutant', medium: 'Intermédiaire', hard: 'Expert' };

export function describeCircuitValidation(report) {
  if (report.valid) return 'Circuit valide — pret pour la course.';
  const message = report.errors?.[0] ?? 'La geometrie doit etre corrigee.';
  if (/boucle fermée|circuit ouvert/i.test(message)) return 'Circuit ouvert — fermez la boucle.';
  if (/courbure|rayon|serré/i.test(message)) return `Virage trop serre — ${message}`;
  if (/largeur/i.test(message)) return `Piste trop etroite — ${message}`;
  if (/croise|intersection|chevauch/i.test(message)) return `Intersection detectee — ${message}`;
  if (/ligne de depart|ligne de départ|point inexistant/i.test(message)) return `Ligne de depart invalide — ${message}`;
  if (/grille dangereuse/i.test(message)) return `Grille de six voitures impossible — ${message}`;
  return message;
}

export function getCircuitBounds(controlPoints, padding = 0) {
  if (!Array.isArray(controlPoints) || controlPoints.length === 0) throw new TypeError('Le circuit doit contenir au moins un point.');
  const bounds = controlPoints.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
    minZ: Math.min(result.minZ, point.z), maxZ: Math.max(result.maxZ, point.z),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  return { ...bounds, minX: bounds.minX - padding, maxX: bounds.maxX + padding, minZ: bounds.minZ - padding, maxZ: bounds.maxZ + padding };
}

export function calculateCircuitCameraFit(controlPoints, { width, height, fov = 48, padding = 1.2, trackWidth = 0 } = {}) {
  const bounds = getCircuitBounds(controlPoints, trackWidth / 2 + 12);
  const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
  const radius = Math.max(1, Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2);
  const aspect = Math.max(0.1, width / Math.max(height, 1));
  const verticalHalfFov = (fov * Math.PI) / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const limitingHalfFov = Math.max(0.05, Math.min(verticalHalfFov, horizontalHalfFov));
  return { ...center, radius, distance: radius / Math.sin(limitingHalfFov) * padding };
}

export function consumeCircuitEditorWheel(event, zoom = 1) {
  event.preventDefault();
  return Math.max(0.55, Math.min(4, zoom * Math.exp(-event.deltaY * 0.001)));
}

export class CircuitStudio {
  constructor({ app = document.querySelector('#app'), onReturn, onTest, onTutorialEvent = null, onLibraryChange = null, initialCircuit = null, storage } = {}) {
    this.app = app;
    this.onReturn = onReturn;
    this.onTest = onTest;
    this.onTutorialEvent = onTutorialEvent;
    this.onLibraryChange = onLibraryChange;
    this.disposed = false;
    this.listeners = new AbortController();
    this.undoStack = [];
    this.redoStack = [];
    this.selectedIndex = -1;
    this.dragIndex = -1;
    this.addMode = false;
    this.trackTest = null;
    this.widthEditing = false;
    try { this.library = new CircuitLibrary(storage ?? window.localStorage); }
    catch (error) { this.library = new CircuitLibrary(storage ?? null); this.storageError = error; }
    this.circuit = initialCircuit ? copy(initialCircuit) : generateCircuit(2026, 'medium');
    if (!validateCircuitFormat(this.circuit).valid) throw new Error('Le circuit transmis à Circuit Studio est invalide.');
    this.preview3d = null;
    this.preview3dActive = false;
    this.preview3dFrame = 0;
    this.preview3dSignature = '';
    this.preview3dLoading = false;
    this.previewFitDistance = 220;
    this.previewOrbit = { azimuth: 0.75, elevation: 0.82, distance: 220, target: new Vector3() };
    this.viewZoom = 1;
    this.viewPanX = 0; this.viewPanZ = 0;
    this.mount();
    this.canvas = this.root.querySelector('#circuit-canvas');
    this.context = this.canvas.getContext('2d');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.bindEvents();
    this.refreshLibrary();
    this.resize();
    this.validateAndRender();
    if (this.storageError) this.setNotice(`Bibliothèque locale indisponible : ${this.storageError.message}`, 'error');
    this.renderWelcome('home');
    this.root.dataset.wizardStep = initialCircuit ? '2' : '1';
    if (initialCircuit) { this.welcome.hidden = true; this.root.dataset.wizardStep = '2'; }
  }

  mount() {
    this.root = document.createElement('section');
    this.root.className = 'circuit-studio';
    this.root.innerHTML = `
      <header class="cs-header"><div class="cs-brand"><b>ND</b><span>CIRCUIT STUDIO<small>ÉDITEUR DE CIRCUITS · FORMAT JSON V1</small></span></div><div class="cs-header-actions"><span id="cs-validity" class="cs-validity">Validation…</span><button type="button" data-action="return">Retour au menu</button></div></header>
      <main class="cs-layout"><section class="cs-workspace"><div class="cs-toolbar"><div><span class="cs-kicker">APERÇU GÉOMÉTRIQUE</span><h1 id="cs-title">Circuit Studio</h1></div><div class="cs-edit-tools"><button type="button" data-action="add">＋ Ajouter un point</button><button type="button" data-action="delete">Supprimer le point</button><button type="button" data-action="close-loop">Fermer la boucle</button><button type="button" data-action="improve">Améliorer mon circuit</button></div></div><div class="cs-canvas-wrap"><canvas id="circuit-canvas" aria-label="Éditeur de tracé de circuit. Glissez les points ou ajoutez un point avec le bouton correspondant."></canvas><div class="cs-canvas-hint" id="cs-hint">Glissez les points pour modifier le tracé. L’asphalte est dessiné à l’échelle de la largeur choisie.</div><div class="cs-point-count"><b id="cs-point-count">0</b><span>POINTS</span></div></div><div class="cs-history"><button type="button" data-action="undo">↶ Annuler</button><button type="button" data-action="redo">↷ Rétablir</button><span id="cs-geometry-summary">—</span></div>
      <div class="cs-tests"><div><span class="cs-kicker">ESSAYER CE CIRCUIT</span><p id="cs-test-note">Validation géométrique requise avant le lancement.</p></div><div class="cs-test-buttons"><button type="button" data-test="race" disabled>Tester F1 Racing</button></div></div></section>
      <aside class="cs-panel"><div class="cs-section-title"><span>01 / CIRCUIT</span><b>ÉDITION</b></div><label class="cs-field">Nom<input id="cs-name" maxlength="72" value=""></label><label class="cs-slider">Largeur de piste <output id="cs-width-value"></output><input id="cs-width" type="range" min="12" max="26" step="0.2" value="19"></label><label class="cs-field">Point ligne départ<select id="cs-start"></select></label><div class="cs-divider"></div><div class="cs-section-title"><span>02 / GÉNÉRATEUR DÉTERMINISTE</span></div><label class="cs-field">Graine<input id="cs-seed" type="number" min="0" max="4294967295" value="2026"></label><label class="cs-field">Difficulté<select id="cs-difficulty">${CIRCUIT_DIFFICULTIES.map((level) => `<option value="${level}">${DIFFICULTY_LABELS[level]}</option>`).join('')}</select></label><button class="cs-secondary-button" type="button" data-action="generate">Générer un circuit</button><div class="cs-divider"></div><div class="cs-section-title"><span>03 / BIBLIOTHÈQUE UTILISATEUR</span></div><label class="cs-field">Circuits enregistrés<select id="cs-library"><option value="">Choisir un circuit</option></select></label><div class="cs-button-row"><button type="button" data-action="load">Charger</button><button type="button" data-action="save">Sauvegarder</button></div><div class="cs-button-row"><button type="button" data-action="import">Importer JSON</button><button type="button" data-action="export">Exporter JSON</button></div><input id="cs-file" type="file" accept="application/json,.json" hidden><button class="cs-reset-button" type="button" data-action="reset">Réinitialiser l’éditeur</button><p id="cs-notice" class="cs-notice" role="status"></p><div class="cs-divider"></div><div class="cs-format-note"><b>NEURODRIVE CIRCUIT · V1</b><span>Les circuits créés sont enregistrés dans la bibliothèque locale du navigateur. Les circuits et résultats scientifiques restent séparés.</span></div></aside></main>`;
    this.app.append(this.root);
    this.app.classList.add('circuit-studio-active');
    this.root.querySelector('#cs-name').value = this.circuit.name;
    const libraryButtons = document.createElement('div');
    libraryButtons.className = 'cs-button-row'; libraryButtons.dataset.libraryActions = 'true';
    libraryButtons.innerHTML = '<button type="button" data-action="duplicate">Dupliquer</button><button type="button" data-action="delete-saved">Supprimer</button>';
    this.root.querySelector('[data-action="save"]').closest('.cs-button-row').after(libraryButtons);
    const issuePanel = document.createElement('div');
    issuePanel.id = 'cs-validation-issues'; issuePanel.className = 'cs-validation-issues';
    issuePanel.setAttribute('aria-live', 'polite');
    this.root.querySelector('.cs-history').after(issuePanel);
    const previewButton = document.createElement('button');
    previewButton.type = 'button'; previewButton.dataset.action = 'preview-3d'; previewButton.textContent = 'APERÇU 3D';
    this.root.querySelector('.cs-edit-tools').append(previewButton);
    const topViewButton = document.createElement('button');
    topViewButton.type = 'button'; topViewButton.dataset.action = 'preview-top'; topViewButton.textContent = 'VUE AÉRIENNE';
    const recenterButton = document.createElement('button');
    recenterButton.type = 'button'; recenterButton.dataset.action = 'preview-recenter'; recenterButton.textContent = 'RECENTRER';
    const clearButton = document.createElement('button'); clearButton.type = 'button'; clearButton.dataset.action = 'clear-draft'; clearButton.textContent = 'Clear drawing';
    this.root.querySelector('.cs-edit-tools').append(topViewButton, recenterButton, clearButton);
    this.root.querySelectorAll('.cs-edit-tools button').forEach((button) => {
      button.title = button.textContent.trim();
      button.setAttribute('aria-label', button.textContent.trim());
    });
    this.preview3dHost = document.createElement('div');
    this.preview3dHost.id = 'cs-preview-3d'; this.preview3dHost.className = 'cs-preview-3d'; this.preview3dHost.hidden = true;
    this.preview3dHost.setAttribute('aria-label', '3D preview of the exact circuit used in the race');
    this.root.querySelector('.cs-canvas-wrap').append(this.preview3dHost);
    this.setupStudioLayout();
  }

  renderWelcome(view = 'home') {
    let overlay = this.root.querySelector('.cs-welcome');
    if (!overlay) {
      overlay = document.createElement('section'); overlay.className = 'cs-welcome'; overlay.setAttribute('aria-labelledby', 'cs-welcome-title');
      this.root.prepend(overlay); this.welcome = overlay;
    }
    overlay.hidden = false;
    overlay.dataset.view = view;
    if (view === 'templates') {
      const cards = CIRCUIT_TEMPLATES.map((template) => {
        const circuit = createCircuitTemplate(template.id);
        return `<article class="cs-template-card">${circuitPreviewSvg(circuit)}<div><span>${escapeHtml(template.level)}</span><h3>${escapeHtml(template.title)}</h3><button type="button" data-template-select="${escapeHtml(template.id)}">Choisir ce modele</button></div></article>`;
      }).join('');
      overlay.innerHTML = `<header><button type="button" data-welcome-view="home">Retour</button><span>ETAPE 1 / 3</span></header><h2 id="cs-welcome-title">Choisissez une geometrie</h2><p>Chaque miniature est generee depuis les coordonnees de sa piste et chaque modele est valide avant affichage.</p><div class="cs-template-grid">${cards}<article class="cs-template-card cs-template-unsupported"><div class="cs-template-x">8</div><div><span>NON SUPPORTE</span><h3>Figure en 8</h3><p>Le croisement cree des conflits de collision et de tour; ce modele n'est pas propose.</p></div></article></div>`;
    } else if (view === 'library') {
      let circuits = [];
      try { circuits = [...this.library.list().map((circuit) => ({ circuit, draft: false })), ...this.library.listDrafts().map((circuit) => ({ circuit, draft: true }))]; }
      catch (error) { overlay.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p>`; return; }
      const cards = circuits.length ? circuits.map(({ circuit, draft }) => {
        const report = validateCircuitFormat(circuit), length = report.metrics?.centerlineLength;
        const difficulty = circuit.metadata?.difficulty ?? circuit.metadata?.templateId ?? 'Custom';
        const status = draft ? (report.valid ? 'BROUILLON' : 'A CORRIGER') : (report.valid ? 'PRET A JOUER' : 'A CORRIGER');
        return `<article class="cs-template-card cs-library-card"><span class="cs-track-thumb">${circuitPreviewSvg(circuit)}</span><div><span>${status} | ${escapeHtml(difficulty)} | ${Number.isFinite(length) ? `${(length / 1000).toFixed(2)} km` : 'longueur indisponible'}</span><h3>${escapeHtml(circuit.name || 'Circuit sans nom')}</h3><div class="cs-card-actions"><button type="button" data-card-action="edit" data-circuit-id="${escapeHtml(circuit.id)}" data-circuit-kind="${draft ? 'draft' : 'playable'}">${draft ? 'Reprendre' : 'Modifier'}</button><button type="button" data-card-action="play" data-circuit-id="${escapeHtml(circuit.id)}" data-circuit-kind="${draft ? 'draft' : 'playable'}" ${!draft && report.valid ? '' : 'disabled'}>Jouer</button><button type="button" data-card-action="duplicate" data-circuit-id="${escapeHtml(circuit.id)}" data-circuit-kind="${draft ? 'draft' : 'playable'}">Dupliquer</button><button type="button" data-card-action="delete" data-circuit-id="${escapeHtml(circuit.id)}" data-circuit-kind="${draft ? 'draft' : 'playable'}">Supprimer</button></div></div></article>`;
      }).join('') : '<p class="cs-empty-library">Aucun circuit enregistre pour le moment.</p>';
      overlay.innerHTML = `<header><button type="button" data-welcome-view="home">Retour</button><span>MES CIRCUITS</span><button type="button" data-action="import">Importer JSON</button></header><h2 id="cs-welcome-title">Votre bibliotheque</h2><div class="cs-template-grid">${cards}</div>`;
    } else {
      overlay.innerHTML = `<div class="cs-welcome-content"><div class="cs-welcome-brand"><b>ND</b><span>NEURODRIVE F1 <small>CIRCUIT CREATOR</small></span></div><p class="cs-welcome-step">ETAPE 1 — CHOISIR</p><h2 id="cs-welcome-title">Creez votre circuit F1</h2><p>Partez d'une geometrie valide, dessinez votre trace ou reprenez un circuit sauvegarde.</p><div class="cs-welcome-actions"><button type="button" data-welcome-view="templates"><b>01</b><strong>Choisir un modele</strong><small>5 pistes validees avec apercu de leur trace</small></button><button type="button" data-welcome-action="draw"><b>02</b><strong>Dessiner mon circuit</strong><small>Placer librement les points sur une grille</small></button><button type="button" data-welcome-view="library"><b>03</b><strong>Mes circuits</strong><small>Modifier, dupliquer ou lancer une piste</small></button></div><button class="cs-advanced-entry" type="button" data-welcome-action="advanced">Ouvrir l'editeur avance sur le circuit de depart</button></div>`;
    }
  }

  enterEditor(circuit, { draw = false } = {}) {
    this.circuit = copy(circuit);
    this.freeDrawMode = draw;
    this.freeDrawScale = draw ? Math.max(0.8, Math.min(this.viewWidth || 500, this.viewHeight || 420) / 280) : null;
    this.viewPanX = 0; this.viewPanZ = 0; this.viewZoom = 1;
    if (draw) { this.centerX = 0; this.centerZ = 0; this.viewZoom = 1; this.viewPanX = 0; this.viewPanZ = 0; }
    this.selectedIndex = -1;
    this.preview3dActive = false;
    globalThis.cancelAnimationFrame?.(this.preview3dFrame);
    this.preview3dFrame = 0;
    this.preview3dHost.hidden = true;
    this.canvas.hidden = false;
    this.root.querySelector('#cs-name').value = this.circuit.name;
    this.welcome.hidden = true;
    this.root.dataset.wizardStep = '2';
    this.resizeStartOptions();
    this.validateAndRender();
    this.setNotice(draw ? 'Placez au moins 10 points sur la grille, puis fermez la boucle.' : 'Modele charge. Personnalisez la largeur, la ligne de depart ou les points.');
  }

  createFreeDrawDraft() {
    const draft = createCircuit({ id: `free-track-${Date.now().toString(36)}`, name: 'Mon circuit', controlPoints: [], width: 19, startIndex: 0 });
    draft.closed = false;
    draft.metadata.draft = true;
    this.viewZoom = 1;
    this.centerX = this.centerZ = 0;
    this.enterEditor(draft, { draw: true });
    this.addMode = true;
    this.root.querySelector('#cs-hint').textContent = 'Cliquez pour placer des points. Ajoutez-en au moins 10, puis fermez le circuit.';
  }

  setupStudioLayout() {
    const actions = this.root.querySelector('.cs-header-actions');
    const actionBar = document.createElement('div'); actionBar.className = 'cs-primary-actions';
    for (const selector of ['[data-action="undo"]', '[data-action="redo"]', '[data-action="save"]', '[data-test="race"]']) {
      const button = this.root.querySelector(selector);
      if (button) { button.classList.add('cs-top-action'); actionBar.append(button); }
    }
    actions.prepend(actionBar);
    const workflow = document.createElement('nav'); workflow.className = 'cs-workflow'; workflow.setAttribute('aria-label', 'Creation steps');
    workflow.innerHTML = '<button type="button" data-wizard-step-button="1">1 CHOISIR</button><i></i><button type="button" data-wizard-step-button="2">2 PERSONNALISER</button><i></i><button type="button" data-wizard-step-button="3">3 JOUER</button>';
    this.root.querySelector('.cs-brand').after(workflow);
    const homeButton = document.createElement('button'); homeButton.type = 'button'; homeButton.dataset.action = 'welcome'; homeButton.textContent = 'Studio home'; homeButton.setAttribute('aria-label', 'Open Circuit Studio creator home'); actions.append(homeButton);
    const panel = this.root.querySelector('.cs-panel');
    const sectionTitles = [...panel.querySelectorAll('.cs-section-title')];
    const libraryRows = [...panel.querySelectorAll('.cs-button-row')];
    const formatNote = panel.querySelector('.cs-format-note');
    const refs = { name: this.root.querySelector('#cs-name').closest('.cs-field'), width: this.root.querySelector('#cs-width').closest('.cs-slider'), start: this.root.querySelector('#cs-start').closest('.cs-field'), seed: this.root.querySelector('#cs-seed').closest('.cs-field'), difficulty: this.root.querySelector('#cs-difficulty').closest('.cs-field'), generate: this.root.querySelector('[data-action="generate"]'), library: this.root.querySelector('#cs-library').closest('.cs-field'), file: this.root.querySelector('#cs-file'), reset: this.root.querySelector('[data-action="reset"]'), issues: this.root.querySelector('#cs-validation-issues'), notice: this.root.querySelector('#cs-notice') };
    const tabs = [['circuit','Circuit'],['geometry','Geometrie'],['generator','Generateur'],['library','Bibliotheque'],['validation','Validation']];
    const tabBar = document.createElement('div'); tabBar.className = 'cs-inspector-tabs'; tabBar.setAttribute('role','tablist');
    const panes = new Map();
    for (const [id,label] of tabs) {
      const button = document.createElement('button'); button.type='button'; button.dataset.inspectorTab=id; button.setAttribute('role','tab'); button.setAttribute('aria-selected',String(id==='circuit')); button.textContent=label; tabBar.append(button);
      const pane=document.createElement('section'); pane.className='cs-inspector-pane'; pane.dataset.inspectorPane=id; pane.setAttribute('role','tabpanel'); pane.hidden=id!=='circuit'; panes.set(id,pane);
    }
    panel.replaceChildren(tabBar,...panes.values());
    const pointDetails = document.createElement('div');
    pointDetails.className = 'cs-point-details';
    pointDetails.innerHTML = '<b>Selected control point</b><span id="cs-point-empty">Select a point in the editor.</span><label>X <input id="cs-point-x" type="number" step="0.1" disabled></label><label>Z <input id="cs-point-z" type="number" step="0.1" disabled></label>';
    const move=(pane,node)=>{if(node)panes.get(pane).append(node);};
    move('circuit',sectionTitles[0]); move('circuit',refs.name); move('circuit',refs.width);
    move('geometry',refs.start);
    panes.get('geometry').append(pointDetails);
    move('generator',sectionTitles[1]); move('generator',refs.seed); move('generator',refs.difficulty); move('generator',refs.generate);
    move('library',sectionTitles[2]); move('library',refs.library);
    for(const row of libraryRows) move('library',row);
    move('library',refs.file); move('library',refs.reset);
    move('validation',refs.issues); move('validation',refs.notice); move('validation',formatNote);
    const summary=this.root.querySelector('#cs-geometry-summary'); summary.classList.add('cs-status-summary');
    this.root.querySelector('.cs-layout').prepend(this.root.querySelector('.cs-edit-tools'));
    tabBar.addEventListener('click',(event)=>{const button=event.target.closest('[data-inspector-tab]');if(!button)return;const selected=button.dataset.inspectorTab;tabBar.querySelectorAll('[data-inspector-tab]').forEach((tab)=>tab.setAttribute('aria-selected',String(tab===button)));panes.forEach((pane,id)=>{pane.hidden=id!==selected;});},{signal:this.listeners.signal});
    const status=document.createElement('footer'); status.className='cs-status-bar'; status.innerHTML='<span><b id="cs-status-points">0</b> POINTS</span><span class="cs-status-help">Drag to move | Ctrl+Z undo | F frame | Esc deselect</span><span class="cs-status-camera">2D VIEW</span>'; status.append(summary); this.root.append(status);
  }

  bindEvents() {
    const signal = this.listeners.signal;
    this.root.addEventListener('click', (event) => {
      const workflowStep = event.target.closest('[data-wizard-step-button]')?.dataset.wizardStepButton;
      if (workflowStep === '1') { this.renderWelcome('home'); return; }
      if (workflowStep === '2') { this.welcome.hidden = true; this.root.dataset.wizardStep = '2'; return; }
      if (workflowStep === '3') { this.test('race'); return; }
      const welcomeView = event.target.closest('[data-welcome-view]')?.dataset.welcomeView;
      if (welcomeView) { this.renderWelcome(welcomeView); return; }
      const templateId = event.target.closest('[data-template-select]')?.dataset.templateSelect;
      if (templateId) { this.enterEditor(createCircuitTemplate(templateId)); return; }
      const welcomeAction = event.target.closest('[data-welcome-action]')?.dataset.welcomeAction;
      if (welcomeAction === 'draw') { this.createFreeDrawDraft(); return; }
      if (welcomeAction === 'advanced') { this.enterEditor(this.circuit); return; }
      const card = event.target.closest('[data-card-action]');
      if (card) {
        const circuitId = card.dataset.circuitId, cardAction = card.dataset.cardAction, draft = card.dataset.circuitKind === 'draft';
        try {
          const circuit = draft ? this.library.loadDraft(circuitId) : this.library.load(circuitId);
          if (cardAction === 'edit') this.enterEditor(circuit, { draw: draft && !circuit.closed });
          else if (cardAction === 'play' && !draft && validateCircuitFormat(circuit).valid) { this.circuit = circuit; this.test('race'); }
          else if (cardAction === 'duplicate') { if (draft) this.library.duplicateDraft(circuitId); else this.library.duplicate(circuitId); this.onLibraryChange?.(); this.renderWelcome('library'); }
          else if (cardAction === 'delete' && globalThis.confirm?.(`Delete "${circuit.name}" from your saved ${draft ? 'drafts' : 'circuits'}?`)) { if (draft) this.library.removeDraft(circuitId); else this.library.remove(circuitId); this.onLibraryChange?.(); this.refreshLibrary(); this.renderWelcome('library'); }
        } catch (error) { this.setNotice(error.message, 'error'); }
        return;
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'return') this.onReturn?.();
      else if (action === 'welcome') this.renderWelcome('home');
      else if (action === 'add') { this.addMode = !this.addMode; this.root.querySelector('[data-action="add"]').classList.toggle('active', this.addMode); this.root.querySelector('#cs-hint').textContent = this.addMode ? 'Cliquez sur la piste pour insérer un point près du segment.' : 'Glissez les points pour modifier le tracé.'; }
      else if (action === 'delete') this.deletePoint();
      else if (action === 'close-loop') this.setClosed(!this.circuit.closed);
      else if (action === 'improve') this.previewImprovement();
      else if (action === 'undo') this.undo();
      else if (action === 'redo') this.redo();
      else if (action === 'generate') this.generate();
      else if (action === 'save') this.save();
      else if (action === 'load') this.load();
      else if (action === 'duplicate') this.duplicate();
      else if (action === 'delete-saved') this.deleteSaved();
      else if (action === 'import') this.root.querySelector('#cs-file').click();
      else if (action === 'export') this.export();
      else if (action === 'reset') this.reset();
      else if (action === 'clear-draft') this.clearFreeDraw();
      else if (action === 'preview-3d') this.togglePreview3d();
      else if (action === 'preview-top') { this.previewOrbit.elevation = 1.46; this.previewOrbit.azimuth = 0; this.focusPreviewCamera(); }
      else if (action === 'preview-recenter') this.resetEditorView();
      const test = event.target.closest('[data-test]')?.dataset.test;
      if (test) this.test(test);
    }, { signal });
    this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event), { signal });
    this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event), { signal });
    this.canvas.addEventListener('pointerup', () => this.pointerUp(), { signal });
    this.canvas.addEventListener('pointercancel', () => this.pointerUp(), { signal });
    this.canvas.addEventListener('wheel', (event) => { this.viewZoom = consumeCircuitEditorWheel(event, this.viewZoom); this.render(); }, { passive: false, signal });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    this.root.querySelector('#cs-name').addEventListener('change', (event) => { this.pushHistory(); this.circuit.name = event.target.value.trim(); this.validateAndRender(); }, { signal });
    const widthSlider = this.root.querySelector('#cs-width');
    widthSlider.addEventListener('pointerdown', () => { if (!this.widthEditing) { this.pushHistory(); this.widthEditing = true; } }, { signal });
    widthSlider.addEventListener('input', () => { if (!this.widthEditing) { this.pushHistory(); this.widthEditing = true; } this.circuit.width = Number(widthSlider.value); this.validateAndRender(false); }, { signal });
    widthSlider.addEventListener('change', () => { this.widthEditing = false; this.validateAndRender(); }, { signal });
    this.root.querySelector('#cs-start').addEventListener('change', (event) => { this.pushHistory(); this.circuit.startLine.controlPointIndex = Number(event.target.value); this.validateAndRender(); }, { signal });
    this.root.querySelector('#cs-file').addEventListener('change', (event) => this.importFile(event.target.files?.[0]), { signal });
    for (const axis of ['x', 'z']) this.root.querySelector(`#cs-point-${axis}`).addEventListener('change', (event) => {
      if (this.selectedIndex < 0) return;
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || Math.abs(value) > 5000) { this.setNotice('Coordinates must be finite and within +/-5000 m.', 'error'); this.updateSelectedPointInspector(); return; }
      this.pushHistory(); this.circuit.controlPoints[this.selectedIndex][axis] = value; this.validateAndRender();
    }, { signal });
    window.addEventListener('keydown', (event) => this.onKey(event), { signal });
  }

  onKey(event) {
    if (this.disposed || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.redo(); }
    else if (event.key === 'Delete') { event.preventDefault(); this.deletePoint(); }
    else if (event.key.toLowerCase() === 'f') { event.preventDefault(); this.resetEditorView(); }
    else if (event.key === 'Escape') { this.selectedIndex = -1; this.render(); this.setNotice('Selection cleared.'); }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.viewWidth = rect.width;
    this.viewHeight = rect.height;
    this.render();
    this.preview3d?.resize();
    if (this.preview3dActive) this.focusPreviewCamera();
  }

  worldToCanvas(point) {
    return { x: this.viewWidth / 2 + (point.x - this.centerX - this.viewPanX) * this.scale, y: this.viewHeight / 2 - (point.z - this.centerZ - this.viewPanZ) * this.scale };
  }

  canvasToWorld(point) {
    return { x: this.centerX + this.viewPanX + (point.x - this.viewWidth / 2) / this.scale, z: this.centerZ + this.viewPanZ - (point.y - this.viewHeight / 2) / this.scale };
  }

  pointerPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  render() {
    if (!this.context || !this.viewWidth || !this.viewHeight || !this.circuit) return;
    const ctx = this.context, { width, height } = { width: this.viewWidth, height: this.viewHeight };
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101a20'; ctx.fillRect(0, 0, width, height);
    const points = this.circuit.controlPoints;
    const keepDraftView = Boolean(this.freeDrawMode);
    if (keepDraftView) {
      this.centerX ??= 0; this.centerZ ??= 0; this.scale = (this.freeDrawScale ?? Math.max(0.2, Math.min(width, height) / 280)) * this.viewZoom;
      const grid = Math.max(24, 40 * this.viewZoom); ctx.strokeStyle = '#292e35'; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = width / 2 % grid; x < width; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
      for (let y = height / 2 % grid; y < height; y += grid) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
      ctx.stroke();
    }
    if (points.length < 2) {
      if (!keepDraftView) { this.centerX = 0; this.centerZ = 0; this.scale = Math.max(0.2, Math.min(width, height) / 280) * this.viewZoom; }
      points.forEach((point,index)=>{const p=this.worldToCanvas(point);ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle='#e10600';ctx.fill();ctx.fillStyle='#fff';ctx.fillText(String(index+1),p.x+9,p.y-8);});
      return;
    }
    const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
    const minZ = Math.min(...points.map((point) => point.z)), maxZ = Math.max(...points.map((point) => point.z));
    const pad = 40 + this.circuit.width / 2;
    if (!keepDraftView) {
      this.scale = Math.max(0.1, Math.min((width - 2 * pad) / Math.max(maxX - minX, 1), (height - 2 * pad) / Math.max(maxZ - minZ, 1))) * this.viewZoom;
      this.centerX = (minX + maxX) / 2; this.centerZ = (minZ + maxZ) / 2;
    }
    const curve = new CatmullRomCurve3(points.map(({ x, z }) => new Vector3(x, 0, z)), this.circuit.closed, 'centripetal');
    const curvePoints = curve.getPoints(Math.max(240, points.length * 20));
    const drawPath = () => {
      ctx.beginPath();
      curvePoints.forEach((point, index) => {
        const p = this.worldToCanvas(point);
        if (!index) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      if (this.circuit.closed) ctx.closePath();
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawPath(); ctx.lineWidth = Math.max(4, this.circuit.width * this.scale); ctx.strokeStyle = '#34434a'; ctx.stroke();
    drawPath(); ctx.lineWidth = 2; ctx.strokeStyle = '#b4d6cd'; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
    const startIndex = this.circuit.startLine.controlPointIndex;
    if (startIndex >= 0 && startIndex < points.length) {
      const start = points[startIndex], next = points[(startIndex + 1) % points.length];
      const dx = next.x - start.x, dz = next.z - start.z, length = Math.hypot(dx, dz) || 1;
      const half = this.circuit.width / 2;
      const a = this.worldToCanvas({ x: start.x + dz / length * half, z: start.z - dx / length * half });
      const b = this.worldToCanvas({ x: start.x - dz / length * half, z: start.z + dx / length * half });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineWidth = 3; ctx.strokeStyle = '#f15d67'; ctx.stroke();
    }
    points.forEach((point, index) => {
      const p = this.worldToCanvas(point); const selected = index === this.selectedIndex;
      ctx.beginPath(); ctx.arc(p.x, p.y, selected ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#ffe089' : '#66e4c2'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#102027'; ctx.stroke();
      ctx.fillStyle = '#eff7f4'; ctx.font = '9px monospace'; ctx.fillText(String(index + 1), p.x + 8, p.y - 8);
    });
  }

  resizeStartOptions() {
    const select = this.root.querySelector('#cs-start');
    const current = this.circuit.startLine.controlPointIndex;
    select.innerHTML = this.circuit.controlPoints.map((_, index) => `<option value="${index}">Point ${index + 1}</option>`).join('');
    select.value = String(Math.min(current, this.circuit.controlPoints.length - 1));
  }

  setNotice(message, type = 'info') {
    const node = this.root.querySelector('#cs-notice');
    node.textContent = message;
    node.dataset.type = type;
  }

  validateAndRender(validate = true) {
    this.root.querySelector('#cs-title').textContent = this.circuit.name || 'Circuit sans nom';
    this.root.querySelector('#cs-point-count').textContent = String(this.circuit.controlPoints.length).padStart(2, '0');
    this.root.querySelector('#cs-status-points').textContent = String(this.circuit.controlPoints.length);
    this.root.querySelector('#cs-width-value').textContent = `${this.circuit.width.toFixed(1)} m`;
    this.root.querySelector('#cs-width').value = String(this.circuit.width);
    this.resizeStartOptions();
    const report = validate ? validateCircuitFormat(this.circuit) : this.lastReport;
    if (validate) this.lastReport = report;
    const validity = this.root.querySelector('#cs-validity');
    const status = report.valid ? 'PRET A JOUER' : (!this.circuit.closed ? 'EN DESSIN' : 'A CORRIGER');
    validity.textContent = status;
    validity.classList.toggle('valid', report.valid); validity.classList.toggle('invalid', !report.valid);
    validity.classList.toggle('draft', !this.circuit.closed);
    this.updateSelectedPointInspector();
    this.root.querySelector('.cs-status-camera').textContent = this.preview3dActive ? '3D ORBIT' : '2D EDIT';
    const summary = report.metrics
      ? `${report.metrics.centerlineLength.toFixed(0)} m · ${report.metrics.estimatedTurns} virages estimés · rayon min. ${report.metrics.minimumTurnRadius.toFixed(1)} m · grille ${report.metrics.gridSafe ? 'OK' : 'à corriger'}`
      : report.errors[0] ?? 'Géométrie à corriger';
    this.root.querySelector('#cs-geometry-summary').textContent = summary;
    this.root.querySelector('#cs-test-note').textContent = report.valid ? 'Pret a jouer avec six voitures.' : (!this.circuit.closed ? 'Circuit en dessin — fermez la boucle pour verifier si vous pouvez jouer.' : describeCircuitValidation(report));
    const issuePanel = this.root.querySelector('#cs-validation-issues');
    issuePanel.innerHTML = (report.issues ?? [
      ...(report.errors ?? []).map((message) => ({ severity: 'error', message })),
      ...(report.warnings ?? []).map((message) => ({ severity: 'warning', message })),
    ]).map((issue) => `<p data-severity="${issue.severity}">${escapeHtml(issue.severity === 'error' ? 'BLOQUANT' : 'AVERTISSEMENT')} · ${escapeHtml(issue.message)}</p>`).join('') || '<p data-severity="info">Aucune erreur bloquante; circuit analysé.</p>';
    this.root.querySelectorAll('[data-test]').forEach((button) => { button.disabled = !report.valid; });
    this.root.querySelector('[data-action="save"]').disabled = false;
    this.root.querySelector('[data-action="export"]').disabled = false;
    this.root.querySelector('[data-action="close-loop"]').textContent = this.circuit.closed ? 'Ouvrir la boucle' : 'Fermer la boucle';
    this.root.querySelector('[data-action="undo"]').disabled = this.undoStack.length === 0;
    this.root.querySelector('[data-action="redo"]').disabled = this.redoStack.length === 0;
    if (report.valid) this.updatePreview3dTrack();
    this.render();
    return report;
  }

  pushHistory() {
    this.undoStack.push(copy(this.circuit));
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.validateAndRender(false);
  }

  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(copy(this.circuit));
    this.circuit = this.undoStack.pop();
    this.freeDrawMode = this.circuit.metadata?.draft === true && !this.circuit.closed;
    this.selectedIndex = Math.min(this.selectedIndex, this.circuit.controlPoints.length - 1);
    this.root.querySelector('#cs-name').value = this.circuit.name;
    this.validateAndRender();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(copy(this.circuit));
    this.circuit = this.redoStack.pop();
    this.freeDrawMode = this.circuit.metadata?.draft === true && !this.circuit.closed;
    this.root.querySelector('#cs-name').value = this.circuit.name;
    this.validateAndRender();
  }

  pointerDown(event) {
    if (event.button === 1 || event.button === 2 || (event.shiftKey && event.button === 0)) { this.panDrag = { x: event.clientX, y: event.clientY }; this.canvas.setPointerCapture?.(event.pointerId); return; }
    const point = this.pointerPoint(event);
    const nearest = this.circuit.controlPoints.map((control, index) => ({ index, distance: Math.hypot(this.worldToCanvas(control).x - point.x, this.worldToCanvas(control).y - point.y) })).sort((a, b) => a.distance - b.distance)[0];
    if (this.freeDrawMode) {
      if (nearest && nearest.distance <= 14) {
        if (!this.circuit.closed && this.circuit.controlPoints.length >= 10 && nearest.index === 0) { this.setClosed(true); return; }
        this.pushHistory(); this.dragIndex = nearest.index; this.selectedIndex = nearest.index;
        this.canvas.setPointerCapture?.(event.pointerId); this.render(); this.updateSelectedPointInspector();
      } else this.addFreePoint(this.canvasToWorld(point));
      return;
    }
    if (this.addMode) { this.addPointAt(point); this.addMode = false; this.root.querySelector('[data-action="add"]').classList.remove('active'); return; }
    if (nearest && nearest.distance <= 14) {
      this.pushHistory(); this.dragIndex = nearest.index; this.selectedIndex = nearest.index;
      this.canvas.setPointerCapture?.(event.pointerId); this.render();
      this.updateSelectedPointInspector();
    } else { this.selectedIndex = -1; this.render(); this.updateSelectedPointInspector(); }
  }

  addFreePoint(point) {
    if (this.circuit.controlPoints.length >= 64) { this.setNotice('The circuit format supports at most 64 control points.', 'error'); return; }
    this.pushHistory();
    const index = this.circuit.controlPoints.length;
    this.circuit.controlPoints.push({ x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 });
    if (index === 0) this.circuit.startLine.controlPointIndex = 0;
    if (this.circuit.controlPoints.length >= 10) {
      const safeStart = findSafeGridStartIndex(this.circuit.controlPoints, this.circuit.width);
      if (safeStart >= 0) this.circuit.startLine.controlPointIndex = safeStart;
    }
    this.selectedIndex = index;
    this.validateAndRender();
  }

  clearFreeDraw() {
    if (!this.freeDrawMode && globalThis.confirm && !globalThis.confirm('Start a new free-draw draft? Saved library circuits will remain unchanged.')) return;
    this.pushHistory(); this.circuit.controlPoints = []; this.circuit.closed = false;
    this.circuit.startLine.controlPointIndex = 0; this.freeDrawMode = true; this.selectedIndex = -1;
    this.circuit.metadata = { ...this.circuit.metadata, draft: true };
    this.centerX = this.centerZ = 0; this.viewPanX = this.viewPanZ = 0; this.viewZoom = 1; this.freeDrawScale = Math.max(0.8, Math.min(this.viewWidth, this.viewHeight) / 280);
    this.validateAndRender(); this.setNotice('Click the grid to place at least 10 points, then close the loop.');
  }

  resetEditorView() {
    this.viewZoom = 1; this.viewPanX = 0; this.viewPanZ = 0;
    if (this.preview3dActive) this.focusPreviewCamera();
    this.render();
  }

  pointerMove(event) {
    if (this.panDrag) {
      const dx = event.clientX - this.panDrag.x, dy = event.clientY - this.panDrag.y;
      this.viewPanX -= dx / Math.max(this.scale, 0.01); this.viewPanZ += dy / Math.max(this.scale, 0.01);
      this.panDrag.x = event.clientX; this.panDrag.y = event.clientY; this.render(); return;
    }
    if (this.dragIndex < 0) return;
    const world = this.canvasToWorld(this.pointerPoint(event));
    this.circuit.controlPoints[this.dragIndex] = { x: Math.round(world.x * 10) / 10, z: Math.round(world.z * 10) / 10 };
    this.render();
  }

  pointerUp() {
    if (this.panDrag) { this.panDrag = null; return; }
    if (this.dragIndex < 0) return;
    this.dragIndex = -1;
    this.validateAndRender();
  }

  addPointAt(screenPoint) {
    if (this.circuit.controlPoints.length >= 64) { this.setNotice('Le format accepte au maximum 64 points.', 'error'); return; }
    const points = this.circuit.controlPoints;
    let bestIndex = 0, bestDistance = Infinity, bestScreenPoint = screenPoint;
    for (let index = 0; index < points.length; index++) {
      const a = this.worldToCanvas(points[index]), b = this.worldToCanvas(points[(index + 1) % points.length]);
      const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
      const t = lengthSq ? Math.max(0, Math.min(1, ((screenPoint.x - a.x) * dx + (screenPoint.y - a.y) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(screenPoint.x - (a.x + dx * t), screenPoint.y - (a.y + dy * t));
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; bestScreenPoint = { x: a.x + dx * t, y: a.y + dy * t }; }
    }
    this.pushHistory();
    const projectedPoint = this.canvasToWorld(bestScreenPoint);
    points.splice(bestIndex + 1, 0, { x: Math.round(projectedPoint.x * 10) / 10, z: Math.round(projectedPoint.z * 10) / 10 });
    if (this.circuit.startLine.controlPointIndex > bestIndex) this.circuit.startLine.controlPointIndex += 1;
    this.selectedIndex = bestIndex + 1;
    this.updateSelectedPointInspector();
    this.resizeStartOptions();
    this.validateAndRender();
  }

  updateSelectedPointInspector() {
    const x = this.root.querySelector('#cs-point-x'), z = this.root.querySelector('#cs-point-z');
    if (!x || !z) return;
    const selected = this.circuit.controlPoints[this.selectedIndex];
    x.disabled = z.disabled = !selected;
    this.root.querySelector('#cs-point-empty').hidden = Boolean(selected);
    if (selected) { x.value = selected.x.toFixed(1); z.value = selected.z.toFixed(1); }
  }

  deletePoint() {
    if (this.selectedIndex < 0 || this.circuit.controlPoints.length <= 10) { this.setNotice('Sélectionnez un point; un circuit doit conserver au moins 10 points.', 'error'); return; }
    this.pushHistory();
    const removed = this.selectedIndex;
    this.circuit.controlPoints.splice(removed, 1);
    if (this.circuit.startLine.controlPointIndex === removed) this.circuit.startLine.controlPointIndex = Math.max(0, removed - 1);
    else if (this.circuit.startLine.controlPointIndex > removed) this.circuit.startLine.controlPointIndex -= 1;
    this.selectedIndex = Math.min(removed, this.circuit.controlPoints.length - 1);
    this.resizeStartOptions();
    this.validateAndRender();
  }

  setClosed(closed) { this.pushHistory(); this.circuit.closed = closed; this.freeDrawMode = this.circuit.metadata?.draft === true && !closed; if (closed) { this.addMode = false; this.viewPanX = this.viewPanZ = 0; this.viewZoom = 1; } this.validateAndRender(); }

  previewImprovement() {
    const proposal = proposeCircuitImprovement(this.circuit);
    if (!proposal.candidate) { this.setNotice(proposal.reason, 'error'); return; }
    const dialog = document.createElement('section');
    dialog.className = 'cs-improvement-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'cs-improvement-title');
    dialog.innerHTML = `<div class="cs-improvement-card"><h2 id="cs-improvement-title">Aperçu de la correction</h2><p>Rien ne change avant votre accord. Cette proposition adoucit légèrement les points et ferme la boucle. Vous pourrez annuler avec Annuler.</p><div class="cs-improvement-preview"><figure><figcaption>VOTRE CIRCUIT</figcaption>${circuitPreviewSvg(this.circuit)}</figure><figure><figcaption>PROPOSITION · ${proposal.report.metrics.centerlineLength.toFixed(0)} m</figcaption>${circuitPreviewSvg(proposal.candidate)}</figure></div><div class="cs-improvement-actions"><button type="button" data-improvement="cancel">Garder mon dessin</button><button type="button" data-improvement="apply">Appliquer la correction</button></div></div>`;
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-improvement="cancel"]')) { dialog.remove(); return; }
      if (!event.target.closest('[data-improvement="apply"]')) return;
      this.pushHistory(); this.circuit = proposal.candidate; this.freeDrawMode = false;
      this.root.querySelector('#cs-name').value = this.circuit.name;
      dialog.remove(); this.validateAndRender(); this.setNotice('Correction appliquée. Utilisez Annuler pour revenir au dessin précédent.', 'success');
    });
    this.root.append(dialog);
    dialog.querySelector('[data-improvement="cancel"]').focus();
  }

  generate() {
    try {
      const seed = Number(this.root.querySelector('#cs-seed').value);
      const difficulty = this.root.querySelector('#cs-difficulty').value;
      const generated = generateCircuit(seed, difficulty);
      this.pushHistory(); this.circuit = generated; this.selectedIndex = -1; this.freeDrawMode = false;
      this.root.querySelector('#cs-name').value = generated.name;
      this.validateAndRender();
      this.setNotice(`Circuit ${DIFFICULTY_LABELS[difficulty].toLowerCase()} généré à partir de la graine ${seed}.`, 'success');
    } catch (error) { this.setNotice(error.message, 'error'); }
  }

  refreshLibrary() {
    let circuits;
    try { circuits = this.library.list(); }
    catch (error) { this.setNotice(error.message, 'error'); return; }
    const select = this.root.querySelector('#cs-library');
    select.innerHTML = `<option value="">Choisir un circuit (${circuits.length})</option>${circuits.map((circuit) => {
      const report = validateCircuitFormat(circuit), length = report.metrics?.centerlineLength;
      const modified = circuit.modifiedAt && Number.isFinite(Date.parse(circuit.modifiedAt)) ? new Date(circuit.modifiedAt).toLocaleDateString() : 'date ancienne';
      return `<option value="${escapeHtml(circuit.id)}">${escapeHtml(circuit.name)} · ${Number.isFinite(length) ? `${(length / 1000).toFixed(2)} km` : 'longueur N/D'} · ${modified}</option>`;
    }).join('')}`;
  }

  save() {
    const report = validateCircuitFormat(this.circuit);
    try {
      if (!report.valid) {
        const existing = this.library.listDrafts().find(({ id }) => id === this.circuit.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(this.circuit) && (!globalThis.confirm || !globalThis.confirm(`Replace the saved draft "${existing.name}"?`))) { this.setNotice('Brouillon conserve; aucune donnee sauvegardee n’a ete remplacee.'); return; }
        this.library.saveDraft(this.circuit); this.renderWelcomeIfOpen();
        this.setNotice(`Brouillon « ${this.circuit.name || 'Mon circuit'} » sauvegarde. Il n’apparait pas dans les circuits jouables.`, 'success');
        this.onTutorialEvent?.('circuit-saved', { valid: false, circuitId: this.circuit.id });
        return;
      }
      const existing = this.library.list().find(({ id }) => id === this.circuit.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(this.circuit) && (!globalThis.confirm || !globalThis.confirm(`Replace the saved circuit "${existing.name}"?`))) { this.setNotice('Circuit non remplace; vos donnees sauvegardees sont conservees.'); return; }
      this.library.save(this.circuit); this.refreshLibrary(); this.root.querySelector('#cs-library').value = this.circuit.id; this.onLibraryChange?.(); this.setNotice(`« ${this.circuit.name} » sauvegardé dans la bibliothèque locale.`, 'success'); this.onTutorialEvent?.('circuit-saved', { valid: report.valid, circuitId: this.circuit.id });
    }
    catch (error) { this.setNotice(error.message, 'error'); }
  }

  renderWelcomeIfOpen() { if (this.welcome && !this.welcome.hidden && this.welcome.dataset.view === 'library') this.renderWelcome('library'); }

  load() {
    const id = this.root.querySelector('#cs-library').value;
    if (!id) { this.setNotice('Choisissez un circuit dans la bibliothèque.', 'error'); return; }
    try { const circuit = this.library.load(id); this.pushHistory(); this.circuit = circuit; this.freeDrawMode = false; this.welcome.hidden = true; this.root.querySelector('#cs-name').value = circuit.name; this.selectedIndex = -1; this.validateAndRender(); this.setNotice(`Circuit « ${circuit.name} » chargé.`, 'success'); }
    catch (error) { this.setNotice(error.message, 'error'); }
  }

  duplicate() {
    const selectedId = this.root.querySelector('#cs-library').value || this.circuit.id;
    try {
      const duplicate = this.library.duplicate(selectedId);
      this.pushHistory(); this.circuit = duplicate; this.freeDrawMode = false; this.welcome.hidden = true; this.root.querySelector('#cs-name').value = duplicate.name;
      this.refreshLibrary(); this.root.querySelector('#cs-library').value = duplicate.id;
      this.onLibraryChange?.(); this.validateAndRender(); this.setNotice(`Copie « ${duplicate.name} » créée et chargée.`, 'success');
    } catch (error) { this.setNotice(error.message, 'error'); }
  }

  deleteSaved() {
    const id = this.root.querySelector('#cs-library').value;
    if (!id) { this.setNotice('Choisissez un circuit enregistré avant de le supprimer.', 'error'); return; }
    if (!globalThis.confirm?.(`Supprimer définitivement « ${id} » de la bibliothèque locale ?`)) return;
    try {
      this.library.remove(id); this.refreshLibrary(); this.onLibraryChange?.();
      this.setNotice(`Circuit « ${id} » supprimé de la bibliothèque locale. L’édition en cours est conservée.`, 'success');
    } catch (error) { this.setNotice(error.message, 'error'); }
  }

  async importFile(file) {
    if (!file) return;
    try {
      const { circuit } = parseCircuitJSON(await file.text());
      this.pushHistory(); this.circuit = circuit; this.freeDrawMode = false; this.welcome.hidden = true; this.selectedIndex = -1;
      this.root.dataset.wizardStep = '2';
      this.root.querySelector('#cs-name').value = circuit.name;
      this.validateAndRender(); this.setNotice(`Circuit « ${circuit.name} » importé et géométriquement validé.`, 'success');
    } catch (error) { this.setNotice(error.issues?.length ? error.issues.join(' ') : error.message, 'error'); }
    finally { this.root.querySelector('#cs-file').value = ''; }
  }

  export() {
    try {
      const text = JSON.stringify(this.circuit, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${this.circuit.id}.ndcircuit.json`; anchor.click(); URL.revokeObjectURL(url);
      this.setNotice('Fichier JSON versionné exporté.', 'success');
    } catch (error) { this.setNotice(error.message, 'error'); }
  }

  reset() {
    if (globalThis.confirm && !globalThis.confirm('Reset the current editor circuit? Saved library circuits will remain unchanged.')) return;
    this.pushHistory();
    this.circuit = generateCircuit(2026, 'medium');
    this.freeDrawMode = false;
    this.root.querySelector('#cs-name').value = this.circuit.name;
    this.selectedIndex = -1;
    this.validateAndRender();
    this.setNotice('Éditeur réinitialisé sur le circuit déterministe par défaut.', 'success');
  }

  test(mode) {
    const report = validateCircuitFormat(this.circuit);
    if (!report.valid) { this.setNotice(report.errors[0], 'error'); return; }
    try {
      const trackDefinition = circuitToTrackDefinition(this.circuit);
      if (this.root) this.root.dataset.wizardStep = '3';
      this.onTest?.({ mode, circuit: copy(this.circuit), trackDefinition });
    } catch (error) { this.setNotice(error.message, 'error'); }
  }

  async togglePreview3d() {
    if (this.preview3dActive) {
      this.preview3dActive = false;
      globalThis.cancelAnimationFrame?.(this.preview3dFrame);
      this.preview3dFrame = 0;
      this.preview3dHost.hidden = true;
      this.canvas.hidden = false;
      this.root.querySelector('.cs-status-camera').textContent = '2D EDIT';
      this.root.querySelector('[data-action="preview-3d"]').textContent = 'APERÇU 3D';
      return;
    }
    if (this.preview3dLoading) return;
    const report = validateCircuitFormat(this.circuit);
    if (!report.valid) { this.setNotice(report.errors[0], 'error'); return; }
    this.preview3dLoading = true;
    const previewButton = this.root.querySelector('[data-action="preview-3d"]');
    previewButton.disabled = true;
    try {
      if (!this.preview3d) {
        const [{ SceneManager }, format] = await Promise.all([
          import('../scene/SceneManager.js'), import('./CircuitFormat.js'),
        ]);
        if (this.disposed) return;
        this.circuitToTrackDefinition = format.circuitToTrackDefinition;
        this.preview3dHost.hidden = false;
        this.preview3d = new SceneManager(this.preview3dHost, this.circuitToTrackDefinition(this.circuit));
        this.preview3d.car.root.visible = false;
        this.bindPreviewOrbit();
      }
      this.preview3dHost.hidden = false;
      this.canvas.hidden = true;
      this.preview3dActive = true;
      this.root.querySelector('.cs-status-camera').textContent = '3D ORBIT';
      this.root.querySelector('[data-action="preview-3d"]').textContent = 'VUE ÉDITION 2D';
      this.updatePreview3dTrack(true);
      this.preview3d.resize();
      this.animatePreview3d();
    } catch (error) {
      this.preview3d?.dispose(); this.preview3d = null; this.preview3dActive = false;
      this.preview3dHost.hidden = true;
      this.canvas.hidden = false;
      this.root.querySelector('#cs-test-note').textContent = `3D preview unavailable; 2D edit view is preserved. ${error.message}`;
      this.setNotice(`Aperçu 3D indisponible : ${error.message}`, 'error');
    } finally {
      this.preview3dLoading = false;
      if (previewButton.isConnected) previewButton.disabled = false;
    }
  }

  bindPreviewOrbit() {
    const canvas = this.preview3d.renderer.domElement, signal = this.listeners.signal;
    let pointer = null;
    canvas.addEventListener('pointerdown', (event) => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: event.button === 2 || event.shiftKey }; canvas.setPointerCapture?.(event.pointerId); }, { signal });
    canvas.addEventListener('pointermove', (event) => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (pointer.pan) {
        const right = new Vector3(1, 0, 0).applyQuaternion(this.preview3d.camera.quaternion);
        const up = new Vector3(0, 1, 0).applyQuaternion(this.preview3d.camera.quaternion);
        this.previewOrbit.target.addScaledVector(right, -dx * this.previewOrbit.distance * 0.002);
        this.previewOrbit.target.addScaledVector(up, dy * this.previewOrbit.distance * 0.002);
      } else {
        this.previewOrbit.azimuth -= dx * 0.008;
        this.previewOrbit.elevation = Math.max(0.16, Math.min(1.42, this.previewOrbit.elevation + dy * 0.006));
      }
      pointer.x = event.clientX; pointer.y = event.clientY; this.updatePreviewCamera();
    }, { signal });
    const stop = () => { pointer = null; };
    canvas.addEventListener('pointerup', stop, { signal }); canvas.addEventListener('pointercancel', stop, { signal });
    canvas.addEventListener('wheel', (event) => { event.preventDefault(); this.previewOrbit.distance = Math.max(this.previewFitDistance * 0.18, Math.min(this.previewFitDistance * 4, this.previewOrbit.distance * Math.exp(event.deltaY * 0.001))); this.updatePreviewCamera(); }, { passive: false, signal });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), { signal });
    this.updatePreviewCamera();
  }

  updatePreviewCamera() {
    if (!this.preview3d) return;
    const { target, azimuth, elevation, distance } = this.previewOrbit;
    this.preview3d.camera.position.set(
      target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      target.y + Math.sin(elevation) * distance,
      target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    this.preview3d.camera.lookAt(target);
  }

  updatePreview3dTrack(force = false) {
    if (!this.preview3d || !this.lastReport?.valid && !force) return;
    const signature = JSON.stringify(this.circuit);
    if (!force && signature === this.preview3dSignature) return;
    try {
      this.preview3d.setTrack(this.circuitToTrackDefinition(this.circuit));
      this.preview3dSignature = signature;
      this.focusPreviewCamera();
    } catch (error) { this.setNotice(`Aperçu 3D non actualisé : ${error.message}`, 'error'); }
  }

  focusPreviewCamera() {
    if (!this.preview3d) return;
    const points = this.circuit.controlPoints;
    const rect = this.preview3dHost.getBoundingClientRect();
    const fit = calculateCircuitCameraFit(points, { width: rect.width, height: rect.height, fov: this.preview3d.camera.fov, trackWidth: this.circuit.width });
    this.previewOrbit.target.set(fit.x, 0, fit.z);
    this.previewOrbit.distance = Math.max(12, fit.distance);
    this.previewFitDistance = this.previewOrbit.distance;
    this.preview3d.camera.far = Math.max(600, fit.distance * 5);
    this.preview3d.camera.updateProjectionMatrix();
    this.updatePreviewCamera();
  }

  animatePreview3d() {
    if (!this.preview3dActive || this.disposed) return;
    this.preview3d.render();
    this.preview3dFrame = globalThis.requestAnimationFrame(() => this.animatePreview3d());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.resizeObserver.disconnect();
    globalThis.cancelAnimationFrame?.(this.preview3dFrame);
    this.preview3d?.dispose(); this.preview3d = null;
    this.root.remove();
    this.app.classList.remove('circuit-studio-active');
  }
}
