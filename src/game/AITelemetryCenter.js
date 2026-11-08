const FORCE_NAMES = ['pathFollowing', 'obstacleAvoidance', 'separation', 'pursuit'];
const SAMPLE_FIELDS = ['time', 'speedKmh', 'direction', 'throttle', 'brake', 'acceleration', 'pathFollowing', 'obstacleAvoidance', 'separation', 'pursuit', 'resultant'];
const CHART_COLORS = Object.freeze({ speedKmh: '#ff514b', direction: '#f5f5f5', throttle: '#75d7a1', brake: '#ffad42', pathFollowing: '#f5f5f5', obstacleAvoidance: '#ffad42', separation: '#57c7ff', pursuit: '#e10600', resultant: '#a9e86e' });

/** Fixed-capacity simulation-time history. Values are arcade observations, never scientific results. */
export class AITelemetryBuffer {
  constructor({ capacity = 300, sampleInterval = 0.1 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 2 || !(sampleInterval > 0)) throw new RangeError('AI telemetry requires a bounded capacity and positive sample interval.');
    this.capacity = capacity; this.sampleInterval = sampleInterval;
    this.values = Object.fromEntries(SAMPLE_FIELDS.map((field) => [field, new Float32Array(capacity)]));
    this.head = 0; this.count = 0; this.lastSampleTime = -Infinity; this.previousSpeed = NaN; this.previousTime = NaN;
  }

  reset() {
    this.head = 0; this.count = 0; this.lastSampleTime = -Infinity;
    this.previousSpeed = NaN; this.previousTime = NaN;
    for (const values of Object.values(this.values)) values.fill(NaN);
  }

  push(snapshot, simulationTime) {
    if (!snapshot || !Number.isFinite(simulationTime)) return false;
    if (simulationTime - this.lastSampleTime < this.sampleInterval - 1e-9) return false;
    const index = this.head;
    const dt = simulationTime - this.previousTime;
    const acceleration = Number.isFinite(this.previousSpeed) && dt > 0 ? (snapshot.speedMps - this.previousSpeed) / dt : NaN;
    const write = (field, value) => { this.values[field][index] = Number.isFinite(value) ? value : NaN; };
    write('time', simulationTime); write('speedKmh', snapshot.speedKmh); write('direction', snapshot.directionValue);
    write('throttle', snapshot.throttleValue); write('brake', snapshot.brakeValue); write('acceleration', acceleration);
    for (const name of FORCE_NAMES) write(name, snapshot.forceContributions?.[name]);
    write('resultant', snapshot.resultantForceMagnitude);
    this.previousSpeed = snapshot.speedMps; this.previousTime = simulationTime; this.lastSampleTime = simulationTime;
    this.head = (index + 1) % this.capacity; this.count = Math.min(this.capacity, this.count + 1);
    return true;
  }

  oldestIndex() { return (this.head - this.count + this.capacity) % this.capacity; }
  indexAt(offset) { return (this.oldestIndex() + offset) % this.capacity; }
  latest(field) { return this.count ? this.values[field]?.[(this.head - 1 + this.capacity) % this.capacity] : NaN; }
}

/** Reads only values published by the selected car, its controller, RaceWorld and RaceTiming. */
export function collectAITelemetry(car, world, { modelName = null } = {}) {
  if (!car || !world) return null;
  const controller = car.controller;
  const neural = Boolean(controller?.network);
  const steering = typeof controller?.getDecisionData === 'function';
  const human = car.isPlayer === true;
  const kind = human ? 'human' : neural ? 'neural' : steering ? 'steering' : 'unpublished';
  // NeuralController initializes lastCommands to zero before its first inference.
  // Only expose outputs once this adapter has published its matching observation.
  const commands = neural && Array.isArray(controller.lastObservation) ? controller.controller?.lastCommands : null;
  const decision = !human && steering ? controller.getDecisionData(car) : null;
  const debugForces = human ? null : decision?.forces ?? car.debugForces ?? null;
  const appliedForce = world.lastForces?.get?.(car.id) ?? null;
  const speedMps = Number(car.velocity?.length?.() ?? NaN);
  const forward = car.forward;
  const maxForce = Number(car.maxForce);
  let directionValue = NaN, throttleValue = NaN, brakeValue = NaN;
  let directionLabel = 'Non exposée par ce contrôleur', longitudinalLabel = directionLabel;
  if (!human && neural && commands) {
    directionValue = Number(commands.steering);
    throttleValue = Math.max(0, Number(commands.throttleBrake));
    brakeValue = Math.max(0, -Number(commands.throttleBrake));
    directionLabel = 'Sortie brute du réseau · normalisée'; longitudinalLabel = 'Sortie réseau après adaptateur arcade · normalisée';
  } else if (!human && steering && forward && appliedForce && Number.isFinite(maxForce) && maxForce > 0) {
    const longitudinal = Math.max(-1, Math.min(1, (appliedForce.x * forward.x + appliedForce.z * forward.z) / maxForce));
    directionValue = Math.atan2(forward.x * appliedForce.z - forward.z * appliedForce.x, forward.x * appliedForce.x + forward.z * appliedForce.z) * 180 / Math.PI;
    throttleValue = Math.max(0, longitudinal); brakeValue = Math.max(0, -longitudinal);
    directionLabel = 'Angle de la force résultante · degrés'; longitudinalLabel = 'Force longitudinale résultante / maxForce';
  }
  const forceContributions = {};
  const contributions = debugForces?.contributions;
  for (const name of FORCE_NAMES) {
    const entry = contributions?.find((candidate) => candidate.name === name);
    forceContributions[name] = entry?.weightedForce?.length?.() ?? null;
  }
  const forceDetails = Object.fromEntries(FORCE_NAMES.map((name) => {
    const entry = contributions?.find((candidate) => candidate.name === name);
    const behavior = decision?.behaviors?.find((candidate) => candidate.name === name);
    const state = entry ? 'contribution calculée' : !behavior?.active ? 'inactif' : name === 'pursuit' && !behavior.runtimeActive ? 'conditionnel · non déclenché' : 'actif · contribution non publiée';
    return [name, entry ? { magnitude: entry.weightedForce.length(), weight: entry.weight, active: true, state, direction: [entry.weightedForce.x, entry.weightedForce.z] }
      : { magnitude: null, weight: behavior?.weight ?? null, active: behavior?.active === true, state, direction: null }];
  }));
  const path = world.timing?.path;
  const progressMeters = Number.isFinite(car.validatedProgress) ? car.validatedProgress : null;
  const assignments = world.director;
  const state = car.finished ? 'ARRIVÉ' : assignments?.state === 'finished' ? 'NON TERMINÉ' : assignments?.state?.toUpperCase?.() ?? 'INCONNU';
  return {
    driverId: car.driverId ?? car.id, carId: car.id, driverName: car.name ?? car.id,
    controllerKind: kind, controllerLabel: human ? 'Pilotage humain' : neural ? (modelName ?? 'Réseau neuronal') : steering ? 'Steering AI · RaceController' : 'Contrôleur non exposé',
    modelName: neural ? (modelName ?? 'Modèle sans provenance publiée') : null,
    architecture: neural ? controller.network.architecture : null,
    speedMps, speedKmh: speedMps * 3.6, directionValue, directionLabel,
    throttleValue, brakeValue, longitudinalLabel,
    measuredAcceleration: NaN,
    completedLaps: Number(car.completedLaps ?? 0), totalLaps: Number(assignments?.laps ?? 0),
    progressMeters, trackLength: path?.totalLength ?? null,
    progressRatio: Number.isFinite(car.progress) ? car.progress : null,
    lapTime: Number.isFinite(car.currentLapTime) ? car.currentLapTime : null,
    status: state, finished: Boolean(car.finished),
    simulationTime: Number(assignments?.raceElapsed ?? car.raceTime ?? NaN),
    observations: neural && Array.isArray(controller.lastObservation) ? controller.lastObservation : null,
    rawOutputs: neural && commands ? [commands.steering, commands.throttleBrake] : null,
    activations: neural ? controller.controller.lastActivations : null,
    appliedForceMagnitude: appliedForce?.length?.() ?? null,
    maxForce: Number.isFinite(maxForce) ? maxForce : null,
    forceContributions, resultantForceMagnitude: debugForces?.resultant?.length?.() ?? null,
    forceDetails,
    behaviors: steering ? (decision?.behaviors ?? controller.getBehaviorConfiguration?.() ?? []) : null,
    hasSteeringForces: Boolean(contributions?.length),
  };
}

/** Small 2D canvases sampled at 10 Hz; canvas dimensions are changed only on resize. */
export class AITelemetryCenter {
  constructor(root, { signal, capacity = 300 } = {}) {
    this.root = root; this.buffer = new AITelemetryBuffer({ capacity });
    this.paused = false; this.selectedCarId = null; this.snapshot = null;
    this.canvases = {
      speed: root.querySelector('#ai-telemetry-speed-chart'),
      controls: root.querySelector('#ai-telemetry-controls-chart'),
      forces: root.querySelector('#ai-telemetry-forces-chart'),
    };
    root.querySelector('[data-ai-telemetry="pause"]')?.addEventListener('click', () => this.setPaused(!this.paused), { signal });
    root.querySelector('[data-ai-telemetry="reset"]')?.addEventListener('click', () => this.reset(), { signal });
    root.querySelectorAll('[data-ai-chart-toggle]').forEach((input) => input.addEventListener('change', () => {
      const canvas = this.canvases[input.dataset.aiChartToggle];
      if (canvas) canvas.closest('.ai-telemetry-chart')?.classList.toggle('is-disabled', !input.checked);
    }, { signal }));
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    const button = this.root.querySelector('[data-ai-telemetry="pause"]');
    if (button) { button.textContent = this.paused ? 'REPRENDRE' : 'PAUSE GRAPHIQUES'; button.setAttribute('aria-pressed', String(this.paused)); }
    this.root.dataset.chartState = this.paused ? 'paused' : 'live';
  }

  reset() { this.buffer.reset(); this.draw(); }

  update(snapshot) {
    if (!snapshot) return false;
    if (snapshot.carId !== this.selectedCarId) { this.selectedCarId = snapshot.carId; this.reset(); }
    else if (this.buffer.count && Number.isFinite(snapshot.simulationTime) && snapshot.simulationTime < this.buffer.latest('time')) this.reset();
    this.snapshot = snapshot;
    const set = (selector, value) => { const element = this.root.querySelector(selector); if (element) element.textContent = value; };
    set('#ai-telemetry-driver', snapshot.driverName);
    set('#ai-telemetry-controller', snapshot.controllerLabel);
    set('#ai-telemetry-model', snapshot.modelName ?? (snapshot.controllerKind === 'steering' ? 'RaceController arcade' : snapshot.controllerKind === 'human' ? 'Aucune IA · pilote humain' : 'Modèle non exposé'));
    set('#ai-telemetry-speed', Number.isFinite(snapshot.speedKmh) ? `${snapshot.speedKmh.toFixed(1)} km/h` : '—');
    set('#ai-telemetry-direction', snapshot.controllerKind === 'human' ? 'Non applicable · humain' : Number.isFinite(snapshot.directionValue) ? `${snapshot.directionValue.toFixed(3)} ${snapshot.controllerKind === 'neural' ? 'normalisé' : '°'}` : 'Non exposée');
    set('#ai-telemetry-acceleration', Number.isFinite(this.buffer.latest('acceleration')) ? `${this.buffer.latest('acceleration').toFixed(2)} m/s²` : 'Échantillons en attente');
    set('#ai-telemetry-throttle', snapshot.controllerKind === 'human' ? 'Non applicable · humain' : Number.isFinite(snapshot.throttleValue) ? `${(snapshot.throttleValue * 100).toFixed(0)} %` : 'Non exposée');
    set('#ai-telemetry-brake', snapshot.controllerKind === 'human' ? 'Non applicable · humain' : Number.isFinite(snapshot.brakeValue) ? `${(snapshot.brakeValue * 100).toFixed(0)} %` : 'Non exposé');
    set('#ai-telemetry-laps', `${snapshot.completedLaps} / ${snapshot.totalLaps || '—'} tours validés`);
    set('#ai-telemetry-progress', Number.isFinite(snapshot.progressMeters) ? `${snapshot.progressMeters.toFixed(1)} m validés` : 'Progression validée indisponible');
    set('#ai-telemetry-status', snapshot.status);
    set('#ai-telemetry-unit-note', snapshot.controllerKind === 'steering'
      ? `Direction = angle de la force résultante; accélération/freinage = projection force/maxForce (${snapshot.longitudinalLabel}).`
      : snapshot.controllerKind === 'neural'
        ? 'Sorties réseau bornées puis adaptées en force arcade; le mouvement affiché est celui réellement observé.'
        : snapshot.controllerKind === 'human' ? 'La voiture sélectionnée est humaine : aucune commande IA ni force Steering n’est affichée.' : 'Ce contrôleur ne publie pas de commandes interprétables.');
    set('#ai-telemetry-force-state', snapshot.controllerKind === 'steering' && snapshot.hasSteeringForces ? 'Forces Steering réelles · unités arcade' : 'Forces Steering indisponibles pour cette voiture');
    const forceSummary = this.root.querySelector('#ai-telemetry-force-summary');
    if (forceSummary) {
      if (snapshot.controllerKind !== 'steering') forceSummary.textContent = snapshot.controllerKind === 'human' ? 'Voiture humaine : aucune force Steering IA à afficher.' : 'Forces Steering non applicables à ce contrôleur.';
      else forceSummary.innerHTML = FORCE_NAMES.map((name) => {
        const detail = snapshot.forceDetails?.[name] ?? { magnitude: null, weight: null, active: false, direction: null };
        const magnitude = Number.isFinite(detail.magnitude) ? `${detail.magnitude.toFixed(2)} u arc.` : '—';
        const weight = Number.isFinite(detail.weight) ? `poids ${detail.weight.toFixed(2)}` : 'poids —';
        const direction = detail.direction ? ` · dir (${detail.direction[0].toFixed(2)}, ${detail.direction[1].toFixed(2)})` : '';
        return `<span><i class="ai-force-${name}"></i>${name} · ${detail.state ?? (detail.active ? 'actif' : 'inactif')} · ${magnitude} · ${weight}${direction}</span>`;
      }).join('');
    }
    if (!this.paused && snapshot.status === 'RACING') {
      const recorded = this.buffer.push(snapshot, snapshot.simulationTime);
      if (recorded) {
        const latestAcceleration = this.buffer.latest('acceleration');
        set('#ai-telemetry-acceleration', Number.isFinite(latestAcceleration) ? `${latestAcceleration.toFixed(2)} m/s²` : 'Calcul en cours');
        const panel = this.root.closest?.('.race-lab-panel') ?? this.root;
        if (this.root.querySelector('.ai-telemetry-center')?.open !== false && !panel?.classList?.contains('is-collapsed')) this.draw();
      }
    }
    return true;
  }

  draw() {
    this.drawChart('speed', [{ key: 'speedKmh', label: 'Vitesse · km/h', min: 0, color: CHART_COLORS.speedKmh }], 'VITESSE RÉELLE');
    const directionScale = this.snapshot?.controllerKind === 'neural' ? 1 : 180;
    const directionLabel = this.snapshot?.controllerKind === 'neural' ? 'Direction normalisée' : 'Angle résultant (°)';
    this.drawChart('controls', [
      { key: 'direction', label: directionLabel, min: -directionScale, max: directionScale, color: CHART_COLORS.direction },
      { key: 'throttle', label: 'Longitudinal +', min: 0, max: 1, color: CHART_COLORS.throttle },
      { key: 'brake', label: 'Freinage / maxForce', min: 0, max: 1, color: CHART_COLORS.brake },
    ], 'DIRECTION ET LONGITUDINAL');
    this.drawChart('forces', [...FORCE_NAMES, 'resultant'].map((name) => ({ key: name, label: name === 'resultant' ? 'Résultante' : name, min: 0, color: CHART_COLORS[name] })), 'FORCES · UNITÉS ARCADE');
  }

  drawChart(name, series, title) {
    const canvas = this.canvases[name];
    if (!canvas || canvas.closest('.ai-telemetry-chart')?.classList.contains('is-disabled')) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(140, Math.floor(rect.width || canvas.clientWidth || 280));
    const height = 74, ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext('2d'); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    context.fillStyle = '#aeb3bd'; context.font = '9px sans-serif'; context.textAlign = 'left'; context.fillText(title, 5, 10);
    const legendWidth = (width - 10) / series.length;
    series.forEach((item, index) => {
      context.fillStyle = item.color; context.font = '7px sans-serif'; context.fillText(item.label, 5 + index * legendWidth, 21, Math.max(30, legendWidth - 3));
    });
    const left = 5, right = width - 5, top = 27, bottom = height - 6;
    context.strokeStyle = 'rgba(245,245,245,.12)'; context.lineWidth = 1;
    for (let line = 0; line < 3; line += 1) { const y = top + line * (bottom - top) / 2; context.beginPath(); context.moveTo(left, y); context.lineTo(right, y); context.stroke(); }
    if (!this.buffer.count) return;
    const first = this.buffer.oldestIndex(), lastTime = this.buffer.latest('time');
    let firstVisible = 0;
    while (firstVisible < this.buffer.count - 1 && this.buffer.values.time[(first + firstVisible) % this.buffer.capacity] < lastTime - 30) firstVisible += 1;
    const visibleCount = this.buffer.count - firstVisible;
    for (const item of series) {
      const values = this.buffer.values[item.key];
      let maximum = item.max;
      if (maximum === undefined) {
        maximum = 1;
        for (let offset = firstVisible; offset < this.buffer.count; offset += 1) {
          const value = values[(first + offset) % this.buffer.capacity]; if (Number.isFinite(value)) maximum = Math.max(maximum, value * 1.12);
        }
      }
      let started = false; context.beginPath(); context.strokeStyle = item.color; context.lineWidth = 1.7;
      for (let offset = firstVisible; offset < this.buffer.count; offset += 1) {
        const value = values[(first + offset) % this.buffer.capacity];
        if (!Number.isFinite(value)) { started = false; continue; }
        const x = left + (visibleCount <= 1 ? 0 : (offset - firstVisible) / (visibleCount - 1)) * (right - left);
        const normalized = Math.max(0, Math.min(1, (value - item.min) / (maximum - item.min || 1)));
        const y = bottom - normalized * (bottom - top);
        if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
      }
      context.stroke();
    }
  }

  dispose() { this.buffer.reset(); this.snapshot = null; this.selectedCarId = null; this.canvases = {}; this.root = null; }
}
