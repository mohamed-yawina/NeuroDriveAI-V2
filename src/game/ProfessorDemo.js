export const PROFESSOR_DEMO_STEPS = Object.freeze([
  { id: 'intro', title: 'NeuroDrive F1', concept: 'Même environnement 3D pour la course et les laboratoires. Les mesures de démonstration arcade restent distinctes des résultats scientifiques historiques.', slides: '1–13', mode: 'menu', seconds: 12 },
  { id: 'path', title: 'Perception et Path Following', concept: 'La voiture projette sa position sur la trajectoire et vise une cible anticipée. Observez sa progression, sa distance à la piste et les mesures réellement publiées par son contrôleur.', slides: '11, 29–31', mode: 'steering-lab', seconds: 16 },
  { id: 'obstacle', title: 'Obstacle Avoidance', concept: 'Observez les contributions publiées par le contrôleur lorsque les adversaires occupent la route. La flèche apparaît uniquement si une force calculée est disponible.', slides: '32–36', mode: 'steering-lab', seconds: 16 },
  { id: 'separation', title: 'Separation', concept: 'La contribution Separation dépend des voisins détectés par le contrôleur sélectionné. Elle est distincte de l’évitement des limites de piste.', slides: '37–39', mode: 'steering-lab', seconds: 16 },
  { id: 'combined', title: 'BehaviorManager et résultante', concept: 'Comparez les contributions pondérées Path Following, Obstacle Avoidance et Separation avec la résultante publiée. Pursuit ne contribue que lorsque le plan de dépassement l’active. La structure BehaviorManager présentée est celle du projet.', slides: '12, 31; le support ne confirme pas une exigence G1 de BehaviorManager', mode: 'steering-lab', seconds: 16 },
  { id: 'ai-telemetry', title: 'Comprendre les décisions de l’IA', concept: 'Le AI Telemetry Center distingue l’état du véhicule, les commandes, les forces pondérées et, dans Neural Lab, les observations, activations et sorties réelles du réseau.', slides: '11–12, 29–39; télémétrie issue du projet', mode: 'steering-lab', seconds: 18 },
  { id: 'architecture', title: 'Architecture neuronale', concept: 'Le modèle chargé est un MLP 7→16→16→2 : sept observations, deux couches cachées de seize neurones et deux sorties. Les poids historiques sont consultés sans être modifiés.', slides: 'Métadonnées des modèles historiques du projet; aucune diapositive MLP 7–16–16–2 identifiée dans le support', mode: 'neural-lab', seconds: 16 },
  { id: 'decisions', title: 'Décision et action', concept: 'Suivez une voiture et son modèle A, B ou C dans le panneau. Distinguez les sorties brutes du réseau, leur adaptation arcade et le mouvement observé; sélectionnez chaque pilote pour l’inspecter.', slides: 'Implémentation et modèles historiques du projet; pas une mesure extraite des diapositives 43–49', mode: 'neural-lab', seconds: 16 },
  { id: 'comparison', title: 'Comparaison Steering / Neural', concept: 'La table compare les véhicules de cette même manche arcade. Leurs positions et trajectoires ne sont pas des conditions expérimentales contrôlées et ne mesurent pas la fitness historique.', slides: 'Comparaison de démonstration du projet; aucune diapositive n’établit ce protocole arcade', mode: 'neural-lab', seconds: 20 },
  { id: 'limits', title: 'Généralisation et limites', concept: 'La classification vient des métadonnées disponibles. Une course arcade, notamment sur un circuit utilisateur, ne constitue pas une validation held-out ni une réplication du protocole historique. Les diapositives 43–49 portent sur la neuroévolution, pas sur l’architecture MLP historique.', slides: '29–31 pour Path Following; 43–49 traitent de neuroévolution; consignes d’autres promotions à partir de 52', mode: 'neural-lab', seconds: 18 },
  { id: 'conclusion', title: 'Conclusion pédagogique', concept: 'Le steering combine des comportements explicites; le réseau transforme des observations normalisées en sorties apprises. Ces démonstrations expliquent deux approches, sans certifier à elles seules les exigences officielles de Casablanca G1.', slides: '10–13, 29–39; conclusions du projet clairement séparées du protocole historique', mode: 'menu', seconds: 16 },
]);

export function shouldReuseProfessorSession(session, step) {
  const targetType = step?.mode === 'steering-lab' ? 'steering' : step?.mode === 'neural-lab' ? 'neural' : null;
  return Boolean(targetType && session?.laboratory?.type === targetType && !session.disposed);
}

export class ProfessorDemoTimeline {
  constructor(steps = PROFESSOR_DEMO_STEPS) { this.steps = steps; this.index = 0; this.elapsedInStep = 0; this.paused = false; this.finished = false; }
  tick(deltaSeconds) {
    if (this.paused || this.finished) return false;
    this.elapsedInStep += Math.max(0, Number(deltaSeconds) || 0);
    if (this.elapsedInStep < this.steps[this.index].seconds) return false;
    if (this.index === this.steps.length - 1) this.finished = true;
    else { this.index += 1; this.elapsedInStep = 0; }
    return true;
  }
  next() { if (this.index >= this.steps.length - 1) { this.finished = true; return this.steps[this.index]; } this.index += 1; this.elapsedInStep = 0; return this.steps[this.index]; }
  previous() { this.index = Math.max(0, this.index - 1); this.elapsedInStep = 0; this.finished = false; return this.steps[this.index]; }
  restart() { this.index = 0; this.elapsedInStep = 0; this.finished = false; }
  togglePause() { this.paused = !this.paused; return this.paused; }
  get elapsed() { return this.steps.slice(0, this.index).reduce((sum, step) => sum + step.seconds, 0) + this.elapsedInStep; }
}

/** Presentation wrapper over the existing integrated F1 sessions and lab telemetry. */
export class ProfessorDemo {
  constructor({ host = document.body, onNavigate = async () => {}, onExit = () => {}, onPause = () => {} } = {}) {
    this.host = host; this.onNavigate = onNavigate; this.onExit = onExit; this.onPause = onPause;
    this.timeline = new ProfessorDemoTimeline(); this.timeline.paused = true;
    this.disposed = false; this.transitioning = false; this.started = false; this.lastTick = null;
    this.listeners = new AbortController();
    this.root = document.createElement('aside'); this.root.className = 'professor-demo';
    this.root.setAttribute('aria-label', 'Présentation guidée du Mode Professeur');
    this.root.innerHTML = '<header><b data-clock>MODE PROFESSEUR · 03:00</b><button type="button" data-action="exit" aria-label="Quitter la démonstration">×</button></header><div class="professor-demo-step"><small data-step>ÉTAPE 1 / 11</small><h2 data-title></h2></div><p data-concept></p><small data-slides></small><div class="professor-demo-progress" role="progressbar" aria-label="Progression de la démonstration" aria-valuemin="0" aria-valuemax="180" aria-valuenow="0"><i data-progress></i></div><footer><button type="button" data-action="start">DÉMARRER</button><button type="button" data-action="previous">PRÉCÉDENT</button><button type="button" data-action="pause" disabled>PAUSE</button><button type="button" data-action="next">SUIVANT</button><button type="button" data-action="restart">RECOMMENCER</button><button type="button" data-action="module">OUVRIR / REVENIR AU MODULE</button></footer><p class="professor-demo-hint">Clavier : Espace pause · Page préc. / suiv. · Échap quitter</p><p data-status role="status"></p>';
    this.host.append(this.root);
    this.root.addEventListener('click', (event) => { void this.action(event).catch((error) => this.showError(error)); }, { signal: this.listeners.signal });
    document.addEventListener('keydown', (event) => this.onKeyDown(event), { signal: this.listeners.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseForFocusLoss(); }, { signal: this.listeners.signal });
    globalThis.addEventListener?.('blur', () => this.pauseForFocusLoss(), { signal: this.listeners.signal });
    this.render();
    this.timer = setInterval(() => this.tickByClock(), 100);
  }
  async action(event) {
    const action = event.target.closest?.('[data-action]')?.dataset.action;
    if (!action || this.disposed) return;
    if (action === 'exit') { this.dispose(); await this.onExit(); return; }
    if (this.transitioning) return;
    if (action === 'start') {
      if (this.started) return;
      this.started = true; this.timeline.paused = false; this.lastTick = performance.now();
      this.notifyPause(false); this.render(); return;
    }
    if (action === 'restart') {
      this.timeline.restart(); this.started = true; this.timeline.paused = false; this.lastTick = performance.now();
      this.notifyPause(false); this.render(); await this.openCurrent(); return;
    }
    if (action === 'pause') { if (this.started) this.setPaused(!this.timeline.paused); return; }
    if (action === 'previous') { this.timeline.previous(); this.render(); await this.openCurrent(); return; }
    if (action === 'next') {
      this.timeline.next(); this.render();
      if (this.timeline.finished) this.finish(); else await this.openCurrent();
      return;
    }
    if (action === 'module') { await this.openCurrent(); }
  }
  onKeyDown(event) {
    if (!this.started || this.disposed || this.isEditableTarget(event.target)) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation?.(); void this.action({ target: { closest: () => ({ dataset: { action: 'exit' } }) } }); }
    else if (event.code === 'Space') { event.preventDefault(); event.stopImmediatePropagation?.(); this.setPaused(!this.timeline.paused); }
    else if (event.code === 'PageUp') { event.preventDefault(); event.stopImmediatePropagation?.(); void this.action({ target: { closest: () => ({ dataset: { action: 'previous' } }) } }); }
    else if (event.code === 'PageDown') { event.preventDefault(); event.stopImmediatePropagation?.(); void this.action({ target: { closest: () => ({ dataset: { action: 'next' } }) } }); }
  }
  isEditableTarget(target) { return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]')); }
  pauseForFocusLoss() { if (this.started && !this.timeline.paused && !this.disposed) this.setPaused(true); }
  setPaused(paused) {
    if (this.timeline.paused === paused) return;
    this.timeline.paused = paused; this.lastTick = performance.now(); this.notifyPause(paused); this.render();
  }
  notifyPause(paused) { try { this.onPause(paused); } catch (error) { this.showError(error); } }
  tickByClock() {
    if (this.disposed || !this.started) return;
    const now = performance.now();
    if (this.lastTick == null) this.lastTick = now;
    const delta = Math.min(0.5, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now;
    void this.tick(delta).catch((error) => this.showError(error));
  }
  async tick(dt) {
    if (this.disposed || !this.started || this.transitioning) return;
    if (this.timeline.tick(dt)) {
      this.render();
      if (this.timeline.finished) this.finish(); else await this.openCurrent();
    } else this.render();
  }
  render() {
    if (this.disposed) return;
    const step = this.timeline.steps[this.timeline.index];
    this.root.querySelector('[data-title]').textContent = step.title;
    this.root.querySelector('[data-concept]').textContent = step.concept;
    this.root.querySelector('[data-slides]').textContent = `Référence · ${step.slides}. Le support situe les notions; il ne confirme pas à lui seul une consigne officielle Casablanca G1.`;
    this.root.querySelector('[data-step]').textContent = `ÉTAPE ${this.timeline.index + 1} / ${this.timeline.steps.length} · ${step.seconds} s`;
    const progress = Math.min(100, this.timeline.elapsed / 180 * 100);
    this.root.querySelector('[data-progress]').style.width = `${progress}%`;
    this.root.querySelector('.professor-demo-progress').setAttribute('aria-valuenow', String(Math.round(this.timeline.elapsed)));
    const remaining = Math.max(0, 180 - this.timeline.elapsed);
    this.root.querySelector('[data-clock]').textContent = `MODE PROFESSEUR · ${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
    this.root.querySelector('[data-action="start"]').disabled = this.started;
    this.root.querySelector('[data-action="pause"]').disabled = !this.started;
    this.root.querySelector('[data-action="pause"]').textContent = this.timeline.paused ? 'REPRENDRE' : 'PAUSE';
    const status = this.timeline.paused ? (this.started ? 'Présentation en pause.' : 'Prêt · démarrez pour lancer le parcours de trois minutes.') : this.timeline.finished ? 'Démonstration terminée.' : `${this.timeline.index + 1}/${this.timeline.steps.length} · ${step.mode === 'menu' ? 'Présentation' : 'Transition vers le module intégré'}${step.id === 'decisions' ? ' · sélectionnez les pilotes A, B et C pour les inspecter' : ''}${step.id === 'comparison' ? ' · comparaison arcade, données observées uniquement' : ''}`;
    this.root.querySelector('[data-status]').textContent = status;
  }
  async openCurrent() {
    if (this.transitioning || this.disposed) return;
    const step = this.timeline.steps[this.timeline.index];
    this.transitioning = true;
    try {
      await this.onNavigate(step);
      if (this.timeline.paused) this.notifyPause(true);
    } catch (error) {
      this.setPaused(true);
      this.root.querySelector('[data-status]').textContent = `Transition impossible : ${error?.message ?? error}. La démonstration est en pause; réessayez avec « Ouvrir / revenir au module ».`;
    } finally { this.transitioning = false; }
  }
  showError(error) { if (!this.disposed) this.root.querySelector('[data-status]').textContent = `Erreur de présentation : ${error?.message ?? error}`; }
  finish() { if (this.disposed) return; this.dispose(); void this.onExit(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; clearInterval(this.timer); this.listeners.abort(); this.root.remove();
  }
}
