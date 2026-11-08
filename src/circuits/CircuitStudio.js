import { CatmullRomCurve3, Vector3 } from 'three';
import { circuitToTrackDefinition, createCircuit, parseCircuitJSON, validateCircuitFormat } from './CircuitFormat.js';
import { CircuitLibrary } from './CircuitLibrary.js';
import { CIRCUIT_DIFFICULTIES, generateCircuit } from './CircuitGenerator.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const DIFFICULTY_LABELS = { easy: 'Débutant', medium: 'Intermédiaire', hard: 'Expert' };

export class CircuitStudio {
  constructor({ app = document.querySelector('#app'), onReturn, onTest, onTutorialEvent = null, storage } = {}) {
    this.app = app;
    this.onReturn = onReturn;
    this.onTest = onTest;
    this.onTutorialEvent = onTutorialEvent;
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
    this.circuit = generateCircuit(2026, 'medium');
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
  }

  mount() {
    this.root = document.createElement('section');
    this.root.className = 'circuit-studio';
    this.root.innerHTML = `
      <header class="cs-header"><div class="cs-brand"><b>ND</b><span>CIRCUIT STUDIO<small>ÉDITEUR DE CIRCUITS · FORMAT JSON V1</small></span></div><div class="cs-header-actions"><span id="cs-validity" class="cs-validity">Validation…</span><button type="button" data-action="return">Retour au menu</button></div></header>
      <main class="cs-layout"><section class="cs-workspace"><div class="cs-toolbar"><div><span class="cs-kicker">APERÇU GÉOMÉTRIQUE</span><h1 id="cs-title">Circuit Studio</h1></div><div class="cs-edit-tools"><button type="button" data-action="add">＋ Ajouter un point</button><button type="button" data-action="delete">Supprimer le point</button><button type="button" data-action="close-loop">Fermer la boucle</button></div></div><div class="cs-canvas-wrap"><canvas id="circuit-canvas" aria-label="Éditeur de tracé de circuit. Glissez les points ou ajoutez un point avec le bouton correspondant."></canvas><div class="cs-canvas-hint" id="cs-hint">Glissez les points pour modifier le tracé. L’asphalte est dessiné à l’échelle de la largeur choisie.</div><div class="cs-point-count"><b id="cs-point-count">0</b><span>POINTS</span></div></div><div class="cs-history"><button type="button" data-action="undo">↶ Annuler</button><button type="button" data-action="redo">↷ Rétablir</button><span id="cs-geometry-summary">—</span></div>
      <div class="cs-tests"><div><span class="cs-kicker">ESSAYER CE CIRCUIT</span><p id="cs-test-note">Validation géométrique requise avant le lancement.</p></div><div class="cs-test-buttons"><button type="button" data-test="steering" disabled>Tester Steering</button><button type="button" data-test="race" disabled>Tester F1 Racing</button><button type="button" data-test="neural" disabled>Préparer Neural</button><button type="button" data-test="academy" disabled>Path Following Academy</button></div></div></section>
      <aside class="cs-panel"><div class="cs-section-title"><span>01 / CIRCUIT</span><b>ÉDITION</b></div><label class="cs-field">Nom<input id="cs-name" maxlength="72" value=""></label><label class="cs-slider">Largeur de piste <output id="cs-width-value"></output><input id="cs-width" type="range" min="12" max="26" step="0.2" value="19"></label><label class="cs-field">Point ligne départ<select id="cs-start"></select></label><div class="cs-divider"></div><div class="cs-section-title"><span>02 / GÉNÉRATEUR DÉTERMINISTE</span></div><label class="cs-field">Graine<input id="cs-seed" type="number" min="0" max="4294967295" value="2026"></label><label class="cs-field">Difficulté<select id="cs-difficulty">${CIRCUIT_DIFFICULTIES.map((level) => `<option value="${level}">${DIFFICULTY_LABELS[level]}</option>`).join('')}</select></label><button class="cs-secondary-button" type="button" data-action="generate">Générer un circuit</button><div class="cs-divider"></div><div class="cs-section-title"><span>03 / BIBLIOTHÈQUE UTILISATEUR</span></div><label class="cs-field">Circuits enregistrés<select id="cs-library"><option value="">Choisir un circuit</option></select></label><div class="cs-button-row"><button type="button" data-action="load">Charger</button><button type="button" data-action="save">Sauvegarder</button></div><div class="cs-button-row"><button type="button" data-action="import">Importer JSON</button><button type="button" data-action="export">Exporter JSON</button></div><input id="cs-file" type="file" accept="application/json,.json" hidden><button class="cs-reset-button" type="button" data-action="reset">Réinitialiser l’éditeur</button><p id="cs-notice" class="cs-notice" role="status"></p><div class="cs-divider"></div><div class="cs-format-note"><b>NEURODRIVE CIRCUIT · V1</b><span>Les circuits créés sont enregistrés dans la bibliothèque locale du navigateur. Les circuits et résultats scientifiques restent séparés.</span></div></aside></main>`;
    this.app.append(this.root);
    this.app.classList.add('circuit-studio-active');
    this.root.querySelector('#cs-name').value = this.circuit.name;
  }

  bindEvents() {
    const signal = this.listeners.signal;
    this.root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'return') this.onReturn?.();
      else if (action === 'add') { this.addMode = !this.addMode; this.root.querySelector('[data-action="add"]').classList.toggle('active', this.addMode); this.root.querySelector('#cs-hint').textContent = this.addMode ? 'Cliquez sur la piste pour insérer un point près du segment.' : 'Glissez les points pour modifier le tracé.'; }
      else if (action === 'delete') this.deletePoint();
      else if (action === 'close-loop') this.setClosed(!this.circuit.closed);
      else if (action === 'undo') this.undo();
      else if (action === 'redo') this.redo();
      else if (action === 'generate') this.generate();
      else if (action === 'save') this.save();
      else if (action === 'load') this.load();
      else if (action === 'import') this.root.querySelector('#cs-file').click();
      else if (action === 'export') this.export();
      else if (action === 'reset') this.reset();
      const test = event.target.closest('[data-test]')?.dataset.test;
      if (test) this.test(test);
    }, { signal });
    this.canvas.addEventListener('pointerdown', (event) => this.pointerDown(event), { signal });
    this.canvas.addEventListener('pointermove', (event) => this.pointerMove(event), { signal });
    this.canvas.addEventListener('pointerup', () => this.pointerUp(), { signal });
    this.canvas.addEventListener('pointercancel', () => this.pointerUp(), { signal });
    this.root.querySelector('#cs-name').addEventListener('change', (event) => { this.pushHistory(); this.circuit.name = event.target.value.trim(); this.validateAndRender(); }, { signal });
    const widthSlider = this.root.querySelector('#cs-width');
    widthSlider.addEventListener('pointerdown', () => { if (!this.widthEditing) { this.pushHistory(); this.widthEditing = true; } }, { signal });
    widthSlider.addEventListener('input', () => { if (!this.widthEditing) { this.pushHistory(); this.widthEditing = true; } this.circuit.width = Number(widthSlider.value); this.validateAndRender(false); }, { signal });
    widthSlider.addEventListener('change', () => { this.widthEditing = false; this.validateAndRender(); }, { signal });
    this.root.querySelector('#cs-start').addEventListener('change', (event) => { this.pushHistory(); this.circuit.startLine.controlPointIndex = Number(event.target.value); this.validateAndRender(); }, { signal });
    this.root.querySelector('#cs-file').addEventListener('change', (event) => this.importFile(event.target.files?.[0]), { signal });
    window.addEventListener('keydown', (event) => this.onKey(event), { signal });
  }

  onKey(event) {
    if (this.disposed || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); this.redo(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.deletePoint(); }
    else if (event.key === 'Escape') this.onReturn?.();
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
  }

  worldToCanvas(point) {
    return { x: this.viewWidth / 2 + (point.x - this.centerX) * this.scale, y: this.viewHeight / 2 - (point.z - this.centerZ) * this.scale };
  }

  canvasToWorld(point) {
    return { x: this.centerX + (point.x - this.viewWidth / 2) / this.scale, z: this.centerZ - (point.y - this.viewHeight / 2) / this.scale };
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
    const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
    const minZ = Math.min(...points.map((point) => point.z)), maxZ = Math.max(...points.map((point) => point.z));
    const pad = 40 + this.circuit.width / 2;
    this.scale = Math.max(0.1, Math.min((width - 2 * pad) / Math.max(maxX - minX, 1), (height - 2 * pad) / Math.max(maxZ - minZ, 1)));
    this.centerX = (minX + maxX) / 2; this.centerZ = (minZ + maxZ) / 2;
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
    this.root.querySelector('#cs-width-value').textContent = `${this.circuit.width.toFixed(1)} m`;
    this.root.querySelector('#cs-width').value = String(this.circuit.width);
    this.resizeStartOptions();
    const report = validate ? validateCircuitFormat(this.circuit) : this.lastReport;
    if (validate) this.lastReport = report;
    const validity = this.root.querySelector('#cs-validity');
    validity.textContent = report.valid ? 'CIRCUIT VALIDE' : 'CORRECTIONS REQUISES';
    validity.classList.toggle('valid', report.valid); validity.classList.toggle('invalid', !report.valid);
    const summary = report.metrics
      ? `${report.metrics.centerlineLength.toFixed(0)} m · rayon min. ${report.metrics.minimumTurnRadius.toFixed(1)} m · grille ${report.metrics.gridSafe ? 'OK' : 'à corriger'}`
      : report.errors[0] ?? 'Géométrie à corriger';
    this.root.querySelector('#cs-geometry-summary').textContent = summary;
    this.root.querySelector('#cs-test-note').textContent = report.valid ? 'Circuit vérifié : géométrie, largeur, intersections et six places de grille.' : report.errors[0];
    this.root.querySelectorAll('[data-test]').forEach((button) => { button.disabled = !report.valid; });
    this.root.querySelector('[data-action="save"]').disabled = !report.valid;
    this.root.querySelector('[data-action="export"]').disabled = !report.valid;
    this.root.querySelector('[data-action="close-loop"]').textContent = this.circuit.closed ? 'Ouvrir la boucle' : 'Fermer la boucle';
    this.root.querySelector('[data-action="undo"]').disabled = this.undoStack.length === 0;
    this.root.querySelector('[data-action="redo"]').disabled = this.redoStack.length === 0;
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
    this.selectedIndex = Math.min(this.selectedIndex, this.circuit.controlPoints.length - 1);
    this.root.querySelector('#cs-name').value = this.circuit.name;
    this.validateAndRender();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(copy(this.circuit));
    this.circuit = this.redoStack.pop();
    this.root.querySelector('#cs-name').value = this.circuit.name;
    this.validateAndRender();
  }

  pointerDown(event) {
    const point = this.pointerPoint(event);
    const nearest = this.circuit.controlPoints.map((control, index) => ({ index, distance: Math.hypot(this.worldToCanvas(control).x - point.x, this.worldToCanvas(control).y - point.y) })).sort((a, b) => a.distance - b.distance)[0];
    if (this.addMode) { this.addPointAt(point); this.addMode = false; this.root.querySelector('[data-action="add"]').classList.remove('active'); return; }
    if (nearest && nearest.distance <= 14) {
      this.pushHistory(); this.dragIndex = nearest.index; this.selectedIndex = nearest.index;
      this.canvas.setPointerCapture?.(event.pointerId); this.render();
    } else { this.selectedIndex = -1; this.render(); }
  }

  pointerMove(event) {
    if (this.dragIndex < 0) return;
    const world = this.canvasToWorld(this.pointerPoint(event));
    this.circuit.controlPoints[this.dragIndex] = { x: Math.round(world.x * 10) / 10, z: Math.round(world.z * 10) / 10 };
    this.render();
  }

  pointerUp() {
    if (this.dragIndex < 0) return;
    this.dragIndex = -1;
    this.validateAndRender();
  }

  addPointAt(screenPoint) {
    if (this.circuit.controlPoints.length >= 64) { this.setNotice('Le format accepte au maximum 64 points.', 'error'); return; }
    const point = this.canvasToWorld(screenPoint);
    const points = this.circuit.controlPoints;
    let bestIndex = 0, bestDistance = Infinity;
    for (let index = 0; index < points.length; index++) {
      const a = this.worldToCanvas(points[index]), b = this.worldToCanvas(points[(index + 1) % points.length]);
      const dx = b.x - a.x, dy = b.y - a.y, lengthSq = dx * dx + dy * dy;
      const t = lengthSq ? Math.max(0, Math.min(1, ((screenPoint.x - a.x) * dx + (screenPoint.y - a.y) * dy) / lengthSq)) : 0;
      const distance = Math.hypot(screenPoint.x - (a.x + dx * t), screenPoint.y - (a.y + dy * t));
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    }
    this.pushHistory();
    points.splice(bestIndex + 1, 0, { x: Math.round(point.x * 10) / 10, z: Math.round(point.z * 10) / 10 });
    if (this.circuit.startLine.controlPointIndex > bestIndex) this.circuit.startLine.controlPointIndex += 1;
    this.selectedIndex = bestIndex + 1;
    this.resizeStartOptions();
    this.validateAndRender();
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

  setClosed(closed) { this.pushHistory(); this.circuit.closed = closed; this.validateAndRender(); }

  generate() {
    try {
      const seed = Number(this.root.querySelector('#cs-seed').value);
      const difficulty = this.root.querySelector('#cs-difficulty').value;
      const generated = generateCircuit(seed, difficulty);
      this.pushHistory(); this.circuit = generated; this.selectedIndex = -1;
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
    select.innerHTML = `<option value="">Choisir un circuit (${circuits.length})</option>${circuits.map((circuit) => `<option value="${escapeHtml(circuit.id)}">${escapeHtml(circuit.name)}</option>`).join('')}`;
  }

  save() {
    const report = validateCircuitFormat(this.circuit);
    if (!report.valid) { this.setNotice(report.errors[0], 'error'); return; }
    try { const report = validateCircuitFormat(this.circuit); this.library.save(this.circuit); this.refreshLibrary(); this.root.querySelector('#cs-library').value = this.circuit.id; this.setNotice(`« ${this.circuit.name} » sauvegardé dans la bibliothèque locale.`, 'success'); this.onTutorialEvent?.('circuit-saved', { valid: report.valid, circuitId: this.circuit.id }); }
    catch (error) { this.setNotice(error.message, 'error'); }
  }

  load() {
    const id = this.root.querySelector('#cs-library').value;
    if (!id) { this.setNotice('Choisissez un circuit dans la bibliothèque.', 'error'); return; }
    try { const circuit = this.library.load(id); this.pushHistory(); this.circuit = circuit; this.root.querySelector('#cs-name').value = circuit.name; this.selectedIndex = -1; this.validateAndRender(); this.setNotice(`Circuit « ${circuit.name} » chargé.`, 'success'); }
    catch (error) { this.setNotice(error.message, 'error'); }
  }

  async importFile(file) {
    if (!file) return;
    try {
      const { circuit } = parseCircuitJSON(await file.text());
      this.pushHistory(); this.circuit = circuit; this.selectedIndex = -1;
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
    this.pushHistory();
    this.circuit = generateCircuit(2026, 'medium');
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
      this.onTest?.({ mode, circuit: copy(this.circuit), trackDefinition });
    } catch (error) { this.setNotice(error.message, 'error'); }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.root.remove();
    this.app.classList.remove('circuit-studio-active');
  }
}
