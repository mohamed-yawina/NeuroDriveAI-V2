import { Vector3 } from 'three';
import { SteeringVehicle } from '../ai/SteeringVehicle.js';
import { BehaviorManager } from '../ai/behaviors/BehaviorManager.js';
import { STEERING_BEHAVIOR_FACTORIES } from '../ai/behaviors/SteeringBehaviors.js';

const FIXED_STEP = 1 / 60;
const BEHAVIOR_LABELS = {
  seek: 'Seek', flee: 'Flee', arrive: 'Arrive', pursuit: 'Pursuit', evade: 'Evade', wander: 'Wander',
  obstacleAvoidance: 'Obstacle Avoidance', separation: 'Separation', alignment: 'Alignment', cohesion: 'Cohesion',
  leaderFollowing: 'Leader Following', pathFollowing: 'Path Following',
};
const PRESETS = {
  seek: ['seek'], flee: ['flee'], arrive: ['arrive'], pursuit: ['pursuit'], evade: ['evade'], wander: ['wander'],
  obstacle: ['arrive', 'obstacleAvoidance'], flocking: ['separation', 'alignment', 'cohesion'],
  leader: ['leaderFollowing'], path: ['pathFollowing'], combined: ['arrive', 'obstacleAvoidance', 'separation'],
};
const PRESET_HELP = {
  seek: 'Seek : accélérer vers la cible avec v désirée − v actuelle.',
  flee: 'Flee : inverser la vitesse désirée, puis soustraire la vitesse actuelle.',
  arrive: 'Arrive : réduire la vitesse désirée à mesure que la distance diminue.',
  pursuit: 'Pursuit : viser la position prédite de la cible mobile.',
  evade: 'Evade : fuir la position prédite du poursuivant.',
  wander: 'Wander : déplacer un point sur un cercle placé devant le véhicule.',
  obstacle: 'Obstacle : Arrive vers la cible et Avoid vers le premier obstacle sur la trajectoire.',
  flocking: 'Boids : composer Separation, Alignment et Cohesion entre voisins.',
  leader: 'Leader : Arrive derrière le leader, Evade dans sa zone avant, Separation entre suiveurs.',
  path: 'Path Following : réutiliser la projection scalaire et le suiveur de chemin existant.',
  combined: 'Composition : régler en direct Arrive, Obstacle Avoidance et Separation.',
};

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export class SteeringAcademy {
  constructor({ app = document.querySelector('#app'), onReturn, onTutorialEvent = null, trackDefinition = null, initialScenario = null } = {}) {
    this.app = app;
    this.onReturn = onReturn;
    this.onTutorialEvent = onTutorialEvent;
    this.trackDefinition = trackDefinition;
    this.listeners = new AbortController();
    this.disposed = false;
    this.paused = false;
    this.frameId = null;
    this.previousTime = 0;
    this.accumulator = 0;
    this.fixedStep = FIXED_STEP;
    this.obstacles = [];
    this.target = new Vector3();
    this.targetAgent = { position: new Vector3(), velocity: new Vector3() };
    this.targetForward = new Vector3(1, 0, 0);
    this.targetPath = null;
    this.pointerDown = false;
    this.random = Math.random;
    this.createInterface();
    this.canvas = this.root.querySelector('#academy-canvas');
    this.context = this.canvas.getContext('2d');
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas.parentElement);
    this.bindControls();
    this.resize();
    this.resetScenario();
    if (initialScenario && PRESETS[initialScenario]) this.setScenario(initialScenario);
    this.frameId = requestAnimationFrame((now) => this.animate(now));
  }

  createInterface() {
    this.root = document.createElement('section');
    this.root.className = 'academy-shell';
    this.root.innerHTML = `
      <header class="academy-header"><div class="academy-brand"><span class="academy-mark">S</span><div><strong>STEERING ACADEMY</strong><small>LABORATOIRE DES COMPORTEMENTS RÉACTIFS</small></div></div><div class="academy-header-status"><span class="academy-live"></span> PAS FIXE · 60 HZ <span id="academy-clock">00:00</span><button id="academy-return" class="academy-return">Retour au menu</button></div></header>
      <main class="academy-layout">
        <section class="academy-stage-wrap"><div class="academy-stage-top"><div><span class="academy-kicker">SCÉNARIO INTERACTIF</span><h1 id="academy-title">Seek</h1><p id="academy-description"></p></div><div class="academy-stage-actions"><button id="academy-pause" type="button">Pause</button><button id="academy-reset" type="button">Redémarrer</button></div></div><div class="academy-canvas-wrap"><canvas id="academy-canvas" aria-label="Champ de simulation Steering Academy. Cliquez pour déplacer la cible ou ajouter un obstacle."></canvas><div class="academy-canvas-hint" id="academy-hint">Cliquez dans le champ pour déplacer la cible</div></div><div class="academy-legend"><span><i class="legend-agent"></i> véhicule</span><span><i class="legend-target"></i> cible / leader</span><span><i class="legend-force"></i> force pondérée</span><span><i class="legend-result"></i> résultante saturée</span><span class="academy-key">ESPACE pause · R reset · ÉCHAP menu</span></div></section>
        <aside class="academy-panel"><div class="academy-panel-heading"><span>01 / PARAMÈTRES DU VÉHICULE</span><span class="academy-chip">MODE PÉDAGOGIQUE</span></div>
          <label class="academy-slider"><span>Vitesse maximale <output id="academy-speed-value"></output></span><input id="academy-max-speed" type="range" min="40" max="320" step="10" value="170"></label>
          <label class="academy-slider"><span>Force maximale <output id="academy-force-value"></output></span><input id="academy-max-force" type="range" min="50" max="500" step="10" value="260"></label>
          <div class="academy-divider"></div><div class="academy-panel-heading"><span>02 / SCÉNARIO</span></div>
          <label class="academy-field">Comportement à étudier<select id="academy-scenario"><option value="seek">Seek · atteindre une cible</option><option value="flee">Flee · fuir une cible</option><option value="arrive">Arrive · freiner à l’approche</option><option value="pursuit">Pursuit · intercepter une cible mobile</option><option value="evade">Evade · éviter le poursuivant</option><option value="wander">Wander · déambuler</option><option value="obstacle">Obstacle Avoidance · éviter</option><option value="flocking">Boids · comportement de groupe</option><option value="leader">Leader Following · suivre un leader</option><option value="path">Path Following · projection scalaire</option><option value="combined">Forces composées</option></select></label>
          <label class="academy-field academy-seed">Graine du scénario<input id="academy-seed" type="number" min="0" max="99999999" value="2026"></label>
          <p id="academy-scenario-help" class="academy-help"></p>
          <div class="academy-divider"></div><div class="academy-panel-heading"><span>03 / COMPORTEMENTS ACTIFS</span><span id="academy-active-count" class="academy-count"></span></div>
          <div id="academy-behaviors" class="academy-behaviors"></div>
          <div class="academy-divider"></div><div class="academy-panel-heading"><span>04 / RÉGLAGES DES COMPORTEMENTS</span></div>
          <label class="academy-slider"><span>Rayon de ralentissement <output id="academy-slow-value"></output></span><input id="academy-slow-radius" type="range" min="10" max="180" step="5" value="90"></label>
          <label class="academy-slider"><span>Rayon de voisinage <output id="academy-neighbor-value"></output></span><input id="academy-neighbor-radius" type="range" min="20" max="180" step="5" value="105"></label>
          <label class="academy-slider"><span>Prédiction Pursuit · frames <output id="academy-prediction-value"></output></span><input id="academy-prediction" type="range" min="2" max="30" step="1" value="12"></label>
          <label class="academy-slider"><span>Distance du cercle Wander <output id="academy-wander-distance-value"></output></span><input id="academy-wander-distance" type="range" min="10" max="140" step="5" value="52"></label>
          <label class="academy-slider"><span>Rayon du cercle Wander <output id="academy-wander-radius-value"></output></span><input id="academy-wander-radius" type="range" min="5" max="80" step="5" value="24"></label>
          <label class="academy-slider"><span>Portée de détection obstacle <output id="academy-obstacle-range-value"></output></span><input id="academy-obstacle-range" type="range" min="20" max="180" step="5" value="90"></label>
          <label class="academy-slider"><span>Zone avant du leader <output id="academy-leader-zone-value"></output></span><input id="academy-leader-zone" type="range" min="10" max="100" step="5" value="42"></label>
          <div class="academy-divider"></div><div class="academy-panel-heading"><span>05 / VECTEURS DE FORCES</span></div><div class="academy-vector-legend"><span><i class="vector-raw"></i> Force individuelle</span><span><i class="vector-weighted"></i> Force × poids</span><span><i class="vector-sum"></i> Somme saturée à maxForce</span></div><div id="academy-force-readout" class="academy-force-readout"></div>
        </aside>
      </main>`;
    this.app.append(this.root);
    this.app.classList.add('academy-active');
    this.root.querySelector('#academy-behaviors').innerHTML = Object.entries(BEHAVIOR_LABELS).map(([id, label]) => `
      <div class="academy-behavior-row" data-behavior-row="${id}"><label><input type="checkbox" data-active="${id}"><span>${escapeHtml(label)}</span></label><input aria-label="Poids ${escapeHtml(label)}" type="range" min="0" max="2" step="0.05" value="1" data-weight="${id}"><output data-weight-value="${id}">1.00</output></div>`).join('');
  }

  bindControls() {
    const signal = this.listeners.signal;
    this.root.querySelector('#academy-return').addEventListener('click', () => this.returnToMenu(), { signal });
    this.root.querySelector('#academy-pause').addEventListener('click', () => this.togglePause(), { signal });
    this.root.querySelector('#academy-reset').addEventListener('click', () => this.resetScenario(), { signal });
    this.root.querySelector('#academy-scenario').addEventListener('change', (event) => this.setScenario(event.target.value), { signal });
    this.root.querySelector('#academy-seed').addEventListener('change', () => this.resetScenario(), { signal });
    this.root.querySelectorAll('[data-active]').forEach((input) => input.addEventListener('change', () => {
      for (const manager of this.managers ?? []) input.checked ? manager.activate(input.dataset.active) : manager.deactivate(input.dataset.active);
      this.updateBehaviorCount();
    }, { signal }));
    this.root.querySelectorAll('[data-weight]').forEach((input) => input.addEventListener('input', () => {
      const weight = Number(input.value);
      for (const manager of this.managers ?? []) manager.changeWeight(input.dataset.weight, weight);
      this.root.querySelector(`[data-weight-value="${input.dataset.weight}"]`).value = weight.toFixed(2);
    }, { signal }));
    const sliderMap = {
      '#academy-max-speed': ['academy-speed-value', (value) => this.setVehicleValue('maxSpeed', value)],
      '#academy-max-force': ['academy-force-value', (value) => this.setVehicleValue('maxForce', value)],
      '#academy-slow-radius': ['academy-slow-value', () => {}],
      '#academy-neighbor-radius': ['academy-neighbor-value', () => {}],
      '#academy-prediction': ['academy-prediction-value', () => {}],
      '#academy-wander-distance': ['academy-wander-distance-value', () => {}],
      '#academy-wander-radius': ['academy-wander-radius-value', () => {}],
      '#academy-obstacle-range': ['academy-obstacle-range-value', () => {}],
      '#academy-leader-zone': ['academy-leader-zone-value', () => {}],
    };
    for (const [selector, [outputId, callback]] of Object.entries(sliderMap)) {
      const slider = this.root.querySelector(selector);
      const update = () => {
        const value = Number(slider.value);
        const unit = selector === '#academy-prediction' ? ' fr' : selector === '#academy-max-speed' ? ' px/s' : selector === '#academy-max-force' ? ' px/s²' : ' px';
        this.root.querySelector(`#${outputId}`).value = `${value}${unit}`;
        callback(value);
      };
      slider.addEventListener('input', update, { signal }); update();
    }
    this.canvasPointerDown = (event) => this.onPointerDown(event);
    this.canvasPointerMove = (event) => this.onPointerMove(event);
    this.canvasPointerUp = () => { this.pointerDown = false; };
    this.canvas.addEventListener('pointerdown', this.canvasPointerDown, { signal });
    this.canvas.addEventListener('pointermove', this.canvasPointerMove, { signal });
    this.canvas.addEventListener('pointerup', this.canvasPointerUp, { signal });
    this.canvas.addEventListener('pointercancel', this.canvasPointerUp, { signal });
    window.addEventListener('keydown', (event) => this.onKey(event), { signal });
  }

  setVehicleValue(key, value) {
    for (const actor of this.actors ?? []) actor.vehicle[key] = value;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.width = rect.width; this.height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio); this.canvas.height = Math.round(rect.height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.actors?.length) this.resetScenario();
  }

  createPath() {
    if (this.trackDefinition?.waypoints?.length >= 3) {
      const points = this.trackDefinition.waypoints;
      const minX = Math.min(...points.map((point) => point.x)), maxX = Math.max(...points.map((point) => point.x));
      const minZ = Math.min(...points.map((point) => point.z)), maxZ = Math.max(...points.map((point) => point.z));
      const scale = Math.min((this.width - 72) / Math.max(maxX - minX, 1), (this.height - 72) / Math.max(maxZ - minZ, 1));
      const offsetX = (this.width - (maxX - minX) * scale) / 2;
      const offsetZ = (this.height - (maxZ - minZ) * scale) / 2;
      return points.map((point) => new Vector3(offsetX + (point.x - minX) * scale, 0, offsetZ + (point.z - minZ) * scale));
    }
    const cx = this.width / 2, cz = this.height / 2;
    const radiusX = Math.max(70, this.width * 0.34), radiusZ = Math.max(60, this.height * 0.34);
    return Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2;
      const modulation = 1 + 0.14 * Math.sin(3 * angle) + 0.07 * Math.cos(5 * angle);
      return new Vector3(cx + Math.cos(angle) * radiusX * modulation, 0, cz + Math.sin(angle) * radiusZ * modulation);
    });
  }

  makeManager() {
    const manager = new BehaviorManager();
    for (const factory of Object.values(STEERING_BEHAVIOR_FACTORIES)) {
      const behavior = factory();
      manager.add(behavior, 1);
      manager.deactivate(behavior.name);
    }
    return manager;
  }

  resetScenario() {
    if (!this.width || !this.height) return;
    const scenario = this.root.querySelector('#academy-scenario').value;
    const seed = Math.max(0, Number(this.root.querySelector('#academy-seed').value) || 0);
    this.random = seededRandom(seed);
    this.obstacles = [];
    this.paused = false;
    this.root.querySelector('#academy-pause').textContent = 'Pause';
    this.target.set(this.width * 0.72, 0, this.height * 0.48);
    this.targetAgent.position.set(this.width * 0.69, 0, this.height * 0.47);
    this.targetAgent.velocity.set((this.random() - 0.5) * 110, 0, (this.random() - 0.5) * 110);
    this.targetPath = this.createPath();
    const count = ['flocking', 'leader'].includes(scenario) ? 12 : 5;
    this.actors = [];
    this.managers = [];
    for (let index = 0; index < count; index += 1) {
      const position = new Vector3(this.width * (0.18 + this.random() * 0.22), 0, this.height * (0.2 + this.random() * 0.6));
      const vehicle = new SteeringVehicle({ position, maxSpeed: Number(this.root.querySelector('#academy-max-speed').value), maxForce: Number(this.root.querySelector('#academy-max-force').value), mass: 1.4, drag: 0.18 });
      vehicle.velocity.set((this.random() - 0.5) * 80, 0, (this.random() - 0.5) * 80);
      if (vehicle.velocity.lengthSq() < 100) vehicle.velocity.set(0, 0, -55);
      vehicle.forward.copy(vehicle.velocity).normalize(); vehicle.radius = 9;
      this.actors.push({ vehicle, color: index === 0 ? '#f2525e' : `hsl(${158 + index * 11} 72% ${54 + index % 3 * 5}%)`, breakdown: null });
      this.managers.push(this.makeManager());
    }
    this.setScenario(scenario, false);
    this.root.querySelector('#academy-clock').textContent = '00:00';
    this.elapsed = 0; this.accumulator = 0; this.previousTime = 0;
    this.draw();
  }

  setScenario(scenario, reset = true) {
    if (reset && this.actors) this.resetScenario();
    this.root.querySelector('#academy-scenario-help').textContent = PRESET_HELP[scenario];
    this.root.querySelector('#academy-title').textContent = ({ obstacle: 'Obstacle Avoidance', flocking: 'Boids · comportements de voisinage', leader: 'Leader Following', path: 'Path Following', combined: 'Combinaison de forces' })[scenario] ?? BEHAVIOR_LABELS[scenario];
    this.root.querySelector('#academy-hint').textContent = scenario === 'obstacle'
      ? 'Cliquez pour ajouter un obstacle · glissez pour déplacer la cible'
      : scenario === 'pursuit' || scenario === 'evade' ? 'La cible mobile suit une trajectoire déterministe'
        : 'Cliquez ou glissez dans le champ pour déplacer la cible';
    const enabled = new Set(PRESETS[scenario] ?? [scenario]);
    this.root.querySelectorAll('[data-active]').forEach((input) => {
      input.checked = enabled.has(input.dataset.active);
      for (const manager of this.managers ?? []) input.checked ? manager.activate(input.dataset.active) : manager.deactivate(input.dataset.active);
    });
    this.updateBehaviorCount();
    const activeCount = this.root.querySelectorAll('[data-active]:checked').length;
    this.onTutorialEvent?.('combined', { activeBehaviors: activeCount });
    this.root.querySelector('#academy-slow-radius').closest('.academy-slider').classList.toggle('hidden', scenario !== 'arrive' && scenario !== 'obstacle' && scenario !== 'leader');
    this.root.querySelector('#academy-neighbor-radius').closest('.academy-slider').classList.toggle('hidden', !['flocking', 'leader', 'combined'].includes(scenario));
    this.root.querySelector('#academy-prediction').closest('.academy-slider').classList.toggle('hidden', !['pursuit', 'evade'].includes(scenario));
    this.root.querySelector('#academy-wander-distance').closest('.academy-slider').classList.toggle('hidden', scenario !== 'wander');
    this.root.querySelector('#academy-wander-radius').closest('.academy-slider').classList.toggle('hidden', scenario !== 'wander');
    this.root.querySelector('#academy-obstacle-range').closest('.academy-slider').classList.toggle('hidden', !['obstacle', 'combined'].includes(scenario));
    this.root.querySelector('#academy-leader-zone').closest('.academy-slider').classList.toggle('hidden', scenario !== 'leader');
    if (reset) this.draw();
  }

  updateBehaviorCount() {
    const active = [...this.root.querySelectorAll('[data-active]:checked')].length;
    this.root.querySelector('#academy-active-count').textContent = `${active} ACTIF${active === 1 ? '' : 'S'}`;
  }

  onPointerDown(event) {
    this.pointerDown = true;
    this.canvas.setPointerCapture?.(event.pointerId);
    const point = this.pointerPosition(event);
    if (this.root.querySelector('#academy-scenario').value === 'obstacle' || event.altKey) {
      this.obstacles.push({ position: point, radius: 18 + this.random() * 12 });
    } else this.target.copy(point);
  }

  onPointerMove(event) {
    if (!this.pointerDown) return;
    if (this.root.querySelector('#academy-scenario').value !== 'obstacle') this.target.copy(this.pointerPosition(event));
  }

  pointerPosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector3(event.clientX - rect.left, 0, event.clientY - rect.top);
  }

  onKey(event) {
    if (this.disposed || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space') { event.preventDefault(); this.togglePause(); }
    else if (event.key.toLowerCase() === 'r') this.resetScenario();
    else if (event.key === 'Escape') this.returnToMenu();
  }

  togglePause() {
    this.paused = !this.paused;
    this.root.querySelector('#academy-pause').textContent = this.paused ? 'Reprendre' : 'Pause';
  }

  updateMovingTarget(dt) {
    const scenario = this.root.querySelector('#academy-scenario').value;
    if (!['pursuit', 'evade'].includes(scenario)) return;
    this.targetAgent.position.addScaledVector(this.targetAgent.velocity, dt);
    if (this.targetAgent.position.x < 26 || this.targetAgent.position.x > this.width - 26) this.targetAgent.velocity.x *= -1;
    if (this.targetAgent.position.z < 26 || this.targetAgent.position.z > this.height - 26) this.targetAgent.velocity.z *= -1;
    this.targetAgent.position.x = Math.max(26, Math.min(this.width - 26, this.targetAgent.position.x));
    this.targetAgent.position.z = Math.max(26, Math.min(this.height - 26, this.targetAgent.position.z));
  }

  step(dt) {
    this.updateMovingTarget(dt);
    const scenario = this.root.querySelector('#academy-scenario').value;
    const slider = (id) => Number(this.root.querySelector(id).value);
    const allVehicles = this.actors.map(({ vehicle }) => vehicle);
    const target = ['pursuit', 'evade'].includes(scenario) ? this.targetAgent.position : this.target;
    for (let index = 0; index < this.actors.length; index += 1) {
      const actor = this.actors[index], vehicle = actor.vehicle, manager = this.managers[index];
      const context = {
        vehicle, deltaTime: dt, maxSpeed: vehicle.maxSpeed, maxForce: vehicle.maxForce,
        target, targetAgent: this.targetAgent, threat: target,
        leader: allVehicles[0], isLeader: scenario === 'leader' && index === 0,
        neighbors: allVehicles, obstacles: this.obstacles,
        neighborRadius: slider('#academy-neighbor-radius'), slowRadius: slider('#academy-slow-radius'),
        predictionSeconds: slider('#academy-prediction') * dt,
        circleDistance: slider('#academy-wander-distance'), circleRadius: slider('#academy-wander-radius'),
        lookAhead: slider('#academy-obstacle-range'), forwardZoneRadius: slider('#academy-leader-zone'),
        waypoints: this.targetPath, random: this.random,
      };
      actor.context = context;
      const force = manager.getSteeringForce(context);
      actor.breakdown = manager.getDebugData();
      vehicle.update(force, dt);
      // The course's canvas exercises wrap vehicles at the field edges; this is confined to the lab.
      if (vehicle.position.x < -12) vehicle.position.x = this.width + 12;
      if (vehicle.position.x > this.width + 12) vehicle.position.x = -12;
      if (vehicle.position.z < -12) vehicle.position.z = this.height + 12;
      if (vehicle.position.z > this.height + 12) vehicle.position.z = -12;
    }
    this.elapsed += dt;
    this.root.querySelector('#academy-clock').textContent = `${String(Math.floor(this.elapsed / 60)).padStart(2, '0')}:${String(Math.floor(this.elapsed % 60)).padStart(2, '0')}`;
  }

  animate(now) {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame((time) => this.animate(time));
    if (!this.previousTime) this.previousTime = now;
    const elapsed = Math.min((now - this.previousTime) / 1000, 0.1);
    this.previousTime = now;
    if (!this.paused) {
      this.accumulator += elapsed;
      let steps = 0;
      while (this.accumulator >= this.fixedStep && steps < 6) {
        this.step(this.fixedStep);
        this.accumulator -= this.fixedStep;
        steps += 1;
      }
      if (steps === 6) this.accumulator = 0;
    }
    this.draw();
  }

  drawArrow(origin, vector, color, scale = 1, dashed = false) {
    const magnitude = vector.length();
    if (magnitude < 1e-4) return;
    const maxForce = Number(this.root.querySelector('#academy-max-force').value);
    const length = Math.max(5, Math.min(118, magnitude / Math.max(maxForce, 1) * 118)) * scale;
    const direction = vector.clone().normalize();
    const endX = origin.x + direction.x * length, endZ = origin.z + direction.z * length;
    const ctx = this.context;
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = dashed ? 1.2 : 2.2;
    ctx.setLineDash(dashed ? [4, 4] : []); ctx.beginPath(); ctx.moveTo(origin.x, origin.z); ctx.lineTo(endX, endZ); ctx.stroke(); ctx.setLineDash([]);
    const angle = Math.atan2(endZ - origin.z, endX - origin.x);
    ctx.beginPath(); ctx.moveTo(endX, endZ); ctx.lineTo(endX - 8 * Math.cos(angle - Math.PI / 6), endZ - 8 * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(endX - 8 * Math.cos(angle + Math.PI / 6), endZ - 8 * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fill(); ctx.restore();
  }

  drawPath() {
    if (this.root.querySelector('#academy-scenario').value !== 'path') return;
    const ctx = this.context;
    ctx.save(); ctx.beginPath();
    this.targetPath.forEach((point, index) => index ? ctx.lineTo(point.x, point.z) : ctx.moveTo(point.x, point.z));
    ctx.closePath(); ctx.strokeStyle = '#718a8b'; ctx.setLineDash([8, 7]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
    for (const waypoint of this.targetPath) { ctx.beginPath(); ctx.arc(waypoint.x, waypoint.z, 3, 0, Math.PI * 2); ctx.fillStyle = '#9bb8b5'; ctx.fill(); }
    ctx.restore();
  }

  drawBehaviorZones(primary) {
    const ctx = this.context;
    const scenario = this.root.querySelector('#academy-scenario').value;
    if (scenario === 'arrive' || scenario === 'obstacle') {
      ctx.beginPath(); ctx.arc(this.target.x, this.target.z, Number(this.root.querySelector('#academy-slow-radius').value), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(231,189,114,.27)'; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (scenario === 'wander' && primary) {
      const vehicle = primary.vehicle;
      const direction = vehicle.velocity.lengthSq() ? vehicle.velocity.clone().normalize() : vehicle.forward.clone();
      const distance = Number(this.root.querySelector('#academy-wander-distance').value);
      const radius = Number(this.root.querySelector('#academy-wander-radius').value);
      const center = vehicle.position.clone().addScaledVector(direction, distance);
      ctx.beginPath(); ctx.arc(center.x, center.z, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(162,217,104,.5)'; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(vehicle.position.x, vehicle.position.z); ctx.lineTo(center.x, center.z); ctx.strokeStyle = 'rgba(162,217,104,.28)'; ctx.stroke();
      const target = this.managers[0].getBehavior('wander')?.getTarget(vehicle);
      if (target) { ctx.beginPath(); ctx.arc(target.x, target.z, 5, 0, Math.PI * 2); ctx.fillStyle = '#a2d968'; ctx.fill(); }
    }
    if (scenario === 'leader' && this.actors.length) {
      const leader = this.actors[0].vehicle;
      const direction = leader.forward.clone().normalize();
      const zoneRadius = Number(this.root.querySelector('#academy-leader-zone').value);
      const center = leader.position.clone().addScaledVector(direction, zoneRadius * 0.65);
      ctx.beginPath(); ctx.arc(center.x, center.z, zoneRadius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(228,196,80,.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(228,196,80,.4)'; ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(leader.position.x, leader.position.z); ctx.lineTo(center.x, center.z); ctx.strokeStyle = 'rgba(228,196,80,.4)'; ctx.stroke();
    }
    if ((scenario === 'pursuit' || scenario === 'evade') && primary?.context) {
      const behavior = this.managers[0].getBehavior(scenario);
      const predicted = behavior?.predictedTarget(primary.context);
      if (predicted) {
        ctx.beginPath(); ctx.arc(predicted.x, predicted.z, 5, 0, Math.PI * 2);
        ctx.fillStyle = scenario === 'pursuit' ? '#7bd1f2' : '#d7a6ef'; ctx.fill();
        ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(this.targetAgent.position.x, this.targetAgent.position.z); ctx.lineTo(predicted.x, predicted.z);
        ctx.strokeStyle = 'rgba(174,199,207,.45)'; ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  draw() {
    if (!this.context || !this.width || !this.height) return;
    const ctx = this.context;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#111b20'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save(); ctx.strokeStyle = 'rgba(151,183,183,.07)'; ctx.lineWidth = 1;
    for (let x = 0; x < this.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke(); }
    for (let y = 0; y < this.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke(); }
    ctx.restore();
    this.drawPath();
    const primary = this.actors?.[0];
    if (primary) {
      const position = primary.vehicle.position;
      const radius = Number(this.root.querySelector('#academy-neighbor-radius').value);
      if (['flocking', 'leader', 'combined'].includes(this.root.querySelector('#academy-scenario').value)) {
        ctx.beginPath(); ctx.arc(position.x, position.z, radius, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(105,220,190,.24)'; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    this.drawBehaviorZones(primary);
    this.obstacles.forEach((obstacle) => {
      ctx.beginPath(); ctx.arc(obstacle.position.x, obstacle.position.z, obstacle.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(236,104,83,.19)'; ctx.fill(); ctx.strokeStyle = '#ec775e'; ctx.lineWidth = 2; ctx.stroke();
    });
    if (['pursuit', 'evade'].includes(this.root.querySelector('#academy-scenario').value)) {
      ctx.beginPath(); ctx.arc(this.targetAgent.position.x, this.targetAgent.position.z, 7, 0, Math.PI * 2); ctx.fillStyle = '#4da6dd'; ctx.fill();
      this.drawArrow(this.targetAgent.position, this.targetAgent.velocity, '#4da6dd', 0.65, true);
    } else {
      ctx.beginPath(); ctx.arc(this.target.x, this.target.z, 8, 0, Math.PI * 2); ctx.fillStyle = '#e7bd72'; ctx.fill();
      ctx.beginPath(); ctx.arc(this.target.x, this.target.z, 17, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(231,189,114,.35)'; ctx.stroke();
    }
    for (const actor of this.actors ?? []) this.drawVehicle(actor);
    this.updateReadout(primary);
  }

  drawVehicle(actor) {
    const { vehicle, breakdown, color } = actor;
    const ctx = this.context, position = vehicle.position;
    const avoid = this.managers?.[this.actors.indexOf(actor)]?.getBehavior('obstacleAvoidance');
    const avoidData = avoid?.diagnostics?.get(vehicle);
    if (avoidData) {
      ctx.save(); ctx.strokeStyle = avoidData.predictedCollision ? '#ff684e' : 'rgba(112,203,192,.55)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(position.x, position.z); ctx.lineTo(avoidData.ahead.x, avoidData.ahead.z); ctx.stroke();
      ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(position.x, position.z); ctx.lineTo(avoidData.ahead2.x, avoidData.ahead2.z); ctx.stroke(); ctx.setLineDash([]);
      if (avoidData.obstacle) { ctx.beginPath(); ctx.moveTo(position.x, position.z); ctx.lineTo(avoidData.obstacle.x, avoidData.obstacle.z); ctx.stroke(); }
      ctx.restore();
    }
    if (actor === this.actors[0] && breakdown) {
      breakdown.contributions.forEach((item, index) => {
        this.drawArrow(position, item.force, 'rgba(228,236,234,.32)', 0.48, true);
        this.drawArrow(position, item.weightedForce, this.colorFor(item.name), 0.78, false);
      });
      this.drawArrow(position, breakdown.resultant, '#f4f3eb', 1.12, false);
    }
    const forward = vehicle.forward.lengthSq() ? vehicle.forward : new Vector3(0, 0, -1);
    const angle = Math.atan2(forward.z, forward.x);
    ctx.save(); ctx.translate(position.x, position.z); ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 10); ctx.lineTo(0, 6); ctx.lineTo(-8, 10); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#eaf2ee'; ctx.lineWidth = actor === this.actors[0] ? 1.4 : 0.6; ctx.stroke(); ctx.restore();
  }

  colorFor(name) {
    return ({ seek: '#4dd8bb', flee: '#fb8475', arrive: '#e5bd6f', pursuit: '#57b7ec', evade: '#cb96eb', wander: '#a2d968',
      obstacleAvoidance: '#fb6c4f', separation: '#fa9a55', alignment: '#64a9e8', cohesion: '#ce91dd', leaderFollowing: '#e4c450', pathFollowing: '#82d6cf' })[name] ?? '#cbd5d0';
  }

  updateReadout(primary) {
    const now = performance.now();
    if (now - (this.readoutUpdatedAt ?? 0) < 100) return;
    this.readoutUpdatedAt = now;
    const host = this.root.querySelector('#academy-force-readout');
    if (!primary?.breakdown) { host.textContent = 'Activez un comportement pour observer ses forces.'; return; }
    const rows = primary.breakdown.contributions.map(({ name, weight, force, weightedForce }) =>
      `<div><span><i style="background:${this.colorFor(name)}"></i>${escapeHtml(BEHAVIOR_LABELS[name] ?? name)} × ${weight.toFixed(2)}</span><b>${force.length().toFixed(1)} → ${weightedForce.length().toFixed(1)}</b></div>`).join('');
    const raw = primary.breakdown.unclampedResultant.length(), capped = primary.breakdown.resultant.length();
    this.onTutorialEvent?.('forces-observed', { magnitude: capped });
    host.innerHTML = `${rows || '<div><span>Aucune force active</span><b>0.0</b></div>'}<div class="academy-force-total"><span>Σ pondérée → saturée</span><b>${raw.toFixed(1)} → ${capped.toFixed(1)}</b></div>`;
  }

  returnToMenu() {
    if (this.disposed) return;
    this.dispose();
    this.onReturn?.();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.root.remove();
    this.app.classList.remove('academy-active');
  }
}
