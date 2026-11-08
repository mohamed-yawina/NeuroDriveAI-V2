export const PROFESSOR_DEMO_STEPS = Object.freeze([
  { id: 'intro', title: 'NeuroDrive F1', concept: 'Même monde 3D pour la course et les laboratoires; les métriques arcade et les mesures scientifiques restent séparées.', slides: '10–13', mode: 'menu', seconds: 12 },
  { id: 'path', title: 'Path Following', concept: 'La voiture suivie calcule une cible anticipée à partir de sa projection sur la route; inspectez sa progression et sa distance à la trajectoire.', slides: '29–31', mode: 'steering-lab', seconds: 16 },
  { id: 'obstacle', title: 'Obstacle Avoidance', concept: 'Observez les forces publiées du contrôleur F1 et leur évolution lorsque les cinq adversaires occupent la route.', slides: '32–36', mode: 'steering-lab', seconds: 16 },
  { id: 'separation', title: 'Separation', concept: 'La contribution Separation est calculée à partir des voisins du contrôleur sélectionné; elle n’est pas confondue avec l’évitement de bord.', slides: '39, 41–42', mode: 'steering-lab', seconds: 16 },
  { id: 'combined', title: 'BehaviorManager et résultante', concept: 'Comparez les contributions pondérées Path Following, Obstacle Avoidance et Separation à la résultante plafonnée. Pursuit ne contribue que lorsqu’il est activé par le plan de dépassement.', slides: '10–13, 31', mode: 'steering-lab', seconds: 16 },
  { id: 'ai-telemetry', title: 'Comprendre les décisions de l’IA', concept: 'Le AI Telemetry Center distingue les mesures du véhicule, les commandes du contrôleur, les forces pondérées réelles et, en Neural Lab, les sept observations, activations et deux sorties avant adaptation arcade.', slides: '10–13, 29–31, 43–49', mode: 'steering-lab', seconds: 18 },
  { id: 'architecture', title: 'Architecture neuronale', concept: 'Le panneau Neural Lab montre le cerveau historique 7–16–16–2, ses sept observations et ses deux commandes calculées.', slides: '43–49', mode: 'neural-lab', seconds: 16 },
  { id: 'decisions', title: 'Décisions A / B / C', concept: 'Sélectionnez chaque modèle et la voiture suivie pour observer les entrées, activations et sorties de son propre contrôleur.', slides: '43–49', mode: 'neural-lab', seconds: 16 },
  { id: 'comparison', title: 'Comparaison arcade Steering / Neural', concept: 'La table compare les pilotes d’une même manche F1. Ce contrôle de jeu ne reproduit pas le protocole ni la physique historiques.', slides: '43–49', mode: 'neural-lab', seconds: 20 },
  { id: 'limits', title: 'Généralisation et limites', concept: 'Les labels de circuit proviennent des métadonnées vérifiées. Une course arcade sur un circuit utilisateur n’est pas une validation held-out Phase 8.', slides: '29–31, 43–49', mode: 'neural-lab', seconds: 18 },
  { id: 'conclusion', title: 'Conclusion pédagogique', concept: 'Reliez les forces réactives, le réseau et les limites de généralisation. Les diapositives décrivent le cours; elles ne prouvent pas à elles seules des exigences officielles de Casablanca G1.', slides: '10–13, 29–49', mode: 'menu', seconds: 16 },
]);

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
  togglePause() { this.paused = !this.paused; return this.paused; }
  get elapsed() { return this.steps.slice(0, this.index).reduce((sum, step) => sum + step.seconds, 0) + this.elapsedInStep; }
}

export class ProfessorDemo {
  constructor({ host = document.body, onNavigate = async () => {}, onExit = () => {} } = {}) {
    this.host = host; this.onNavigate = onNavigate; this.onExit = onExit; this.timeline = new ProfessorDemoTimeline(); this.disposed = false; this.transitioning = false;
    this.root = document.createElement('aside'); this.root.className = 'professor-demo'; this.root.setAttribute('aria-live', 'polite'); this.root.innerHTML = '<header><b>MODE PROFESSEUR · 03:00</b><button data-action="exit" aria-label="Quitter la démonstration">×</button></header><h2 data-title></h2><p data-concept></p><small data-slides></small><div class="professor-demo-progress"><i data-progress></i></div><footer><button data-action="previous">PRÉCÉDENT</button><button data-action="pause">PAUSE</button><button data-action="next">SUIVANT</button><button data-action="module">OUVRIR / REVENIR AU MODULE</button></footer><p data-status></p>';
    this.host.append(this.root); this.root.addEventListener('click', (event) => this.action(event)); this.render();
    this.timer = setInterval(() => this.tick(0.25), 250);
  }
  async action(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'exit') { this.dispose(); this.onExit(); }
    else if (action === 'previous') { this.timeline.previous(); this.render(); await this.openCurrent(); }
    else if (action === 'next') { this.timeline.next(); this.render(); if (this.timeline.finished) this.finish(); else await this.openCurrent(); }
    else if (action === 'pause') { const paused = this.timeline.togglePause(); this.root.querySelector('[data-action="pause"]').textContent = paused ? 'REPRENDRE' : 'PAUSE'; }
    else if (action === 'module') await this.openCurrent();
  }
  async tick(dt) {
    if (this.disposed || this.transitioning) return;
    if (this.timeline.tick(dt)) { this.render(); if (this.timeline.finished) this.finish(); else await this.openCurrent(); }
    else this.render();
  }
  render() {
    const step = this.timeline.steps[this.timeline.index]; this.root.querySelector('[data-title]').textContent = step.title; this.root.querySelector('[data-concept]').textContent = step.concept;
    this.root.querySelector('[data-slides]').textContent = `Support du cours · diapositives ${step.slides}${step.slides.includes('*') ? ' (*contexte de mini-projet d’une promotion antérieure; non assimilé à une consigne Casablanca G1)' : ''}`;
    this.root.querySelector('[data-progress]').style.width = `${Math.min(100, this.timeline.elapsed / 180 * 100)}%`;
    const remaining = Math.max(0, 180 - this.timeline.elapsed); this.root.querySelector('header b').textContent = `MODE PROFESSEUR · ${Math.floor(remaining / 60)}:${String(Math.floor(remaining % 60)).padStart(2, '0')}`;
    this.root.querySelector('[data-status]').textContent = this.timeline.paused ? 'Chronologie en pause.' : this.timeline.finished ? 'Démonstration terminée.' : `${this.timeline.index + 1}/${this.timeline.steps.length} · ${step.mode === 'menu' ? 'Introduction' : 'transition automatique vers le module'}${step.id === 'comparison' ? ' · comparaison à déclencher manuellement; aucune donnée préremplie' : ''}`;
  }
  async openCurrent() {
    if (this.transitioning || this.disposed) return;
    const step = this.timeline.steps[this.timeline.index]; if (step.mode === 'menu') return;
    this.transitioning = true;
    try { await this.onNavigate(step); } catch (error) { this.root.querySelector('[data-status]').textContent = `Transition non effectuée : ${error.message}`; }
    finally { this.transitioning = false; }
  }
  finish() { this.dispose(); this.onExit(); }
  dispose() { if (this.disposed) return; this.disposed = true; clearInterval(this.timer); this.root.remove(); }
}
