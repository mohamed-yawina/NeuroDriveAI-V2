export const TUTORIAL_KEY = 'neurodrive-interactive-tutorial-v1';
export const TUTORIAL_STEPS = Object.freeze([
  { mode: 'race', event: 'throttle', label: 'Accélérer avec ↑ ou W' },
  { mode: 'race', event: 'brake', label: 'Freiner avec ↓ ou S' },
  { mode: 'race', event: 'steer', label: 'Braquer avec ←/→ ou A/D' },
  { mode: 'race', event: 'camera', label: 'Changer de caméra avec C' },
  { mode: 'race', event: 'pause-cycle', label: 'Mettre en pause puis reprendre avec Espace' },
  { mode: 'race', event: 'manual-gearbox', label: 'Choisir la boîte manuelle' },
  { mode: 'race', event: 'gear-shift', label: 'Passer réellement un rapport' },
  { mode: 'race', event: 'drs-active', label: 'Activer le DRS dans une zone éligible' },
  { mode: 'race', event: 'ers-used', label: 'Déployer l’ERS et observer la charge baisser' },
  { mode: 'race', event: 'compound', label: 'Choisir une gomme Soft, Medium ou Hard' },
  { mode: 'race', event: 'tyre-wear', label: 'Observer une usure de pneu mesurée' },
  { mode: 'race', event: 'pit-service', label: 'Terminer un arrêt aux stands' },
  { mode: 'race', event: 'damage', label: 'Provoquer puis observer un dommage mesuré' },
  { mode: 'academy', event: 'combined', label: 'Steering Academy : activer les forces combinées' },
  { mode: 'academy', event: 'forces-observed', label: 'Observer des forces calculées non nulles' },
  { mode: 'race', event: 'decision-observed', label: 'Observer une décision IA et ses mesures' },
  { mode: 'circuit-studio', event: 'circuit-saved', label: 'Circuit Studio : valider et sauvegarder un circuit' },
  { mode: 'neural-lab', event: 'brain-inspected', label: 'Neural Racing Lab : inspecter un cerveau et ses capteurs' },
  { mode: 'race', event: 'position-improved', label: 'Course : dépasser un adversaire et gagner une position' },
  { mode: 'race', event: 'lap-completed', label: 'Course : terminer un tour et lire le chrono' },
]);

export const TUTORIAL_CHAPTERS = Object.freeze([
  { id: 'pilotage', title: '01 · Pilotage', description: 'Accélération, freinage, direction, caméras et pause.', steps: Object.freeze([0, 1, 2, 3, 4]) },
  { id: 'course', title: '02 · Course', description: 'Classement, positions, dépassement, tour et chronométrage.', steps: Object.freeze([18, 19]) },
  { id: 'mecaniques', title: '03 · Mécaniques F1', description: 'Boîte, DRS, ERS, pneumatiques, stands et dégâts mesurés.', steps: Object.freeze([5, 6, 7, 8, 9, 10, 11, 12]) },
  { id: 'steering', title: '04 · Steering Behaviors', description: 'Forces combinées et décisions observées en Steering Academy.', steps: Object.freeze([13, 14, 15]) },
  { id: 'circuits', title: '05 · Circuit Studio', description: 'Valider et sauvegarder un circuit édité.', steps: Object.freeze([16]) },
  { id: 'neural', title: '06 · Neural Racing Lab', description: 'Inspecter l’architecture et les capteurs d’un cerveau.', steps: Object.freeze([17]) },
]);
export const TUTORIAL_GUIDANCE = Object.freeze({
  throttle: 'Appuyez sur ↑ ou W pendant la course.', brake: 'Appuyez sur ↓ ou S pendant la course.', steer: 'Braquez avec ←/→ ou A/D.', camera: 'Appuyez sur C et observez le changement de caméra.',
  'pause-cycle': 'Mettez en pause, puis reprenez avec Espace.', 'manual-gearbox': 'Ouvrez les mécaniques et choisissez la boîte manuelle.', 'gear-shift': 'Utilisez E ou Q pour changer un rapport.',
  'drs-active': 'Demandez le DRS dans une zone éligible et vérifiez son activation.', 'ers-used': 'Déployez l’ERS et observez sa charge diminuer.', compound: 'Choisissez une gomme dans les mécaniques arcade.', 'tyre-wear': 'Roulez jusqu’à observer une usure supérieure à zéro.', 'pit-service': 'Demandez un arrêt et attendez la fin réelle du service.', damage: 'Observez un dommage réel après une collision.',
  combined: 'Activez au moins deux comportements dans Steering Academy.', 'forces-observed': 'Observez un vecteur de force calculé non nul.', 'decision-observed': 'Consultez le diagnostic d’une décision IA affichée.', 'circuit-saved': 'Validez puis sauvegardez un circuit dans Circuit Studio.', 'brain-inspected': 'Ouvrez un cerveau et observez son architecture et ses capteurs.',
  'position-improved': 'Gagnez une place au classement en dépassant un adversaire.', 'lap-completed': 'Franchissez la ligne après un tour et consultez le chrono.',
});

// Keeps legacy step indices stable while presenting the new academy in chapter order.
const TUTORIAL_ORDER = Object.freeze([0, 1, 2, 3, 4, 18, 19, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);

export class RaceTutorial {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.pauseSeen = false;
    try {
      const saved = JSON.parse(storage?.getItem(TUTORIAL_KEY) ?? '{}');
      this.index = Math.max(0, Math.min(TUTORIAL_STEPS.length, Number(saved.index) || 0));
      const migrated = Array.from({ length: Math.min(this.index, TUTORIAL_STEPS.length) }, (_, index) => index);
      this.completed = new Set(Array.isArray(saved.completed) ? saved.completed.filter((index) => Number.isInteger(index) && index >= 0 && index < TUTORIAL_STEPS.length) : migrated);
    } catch { this.index = 0; this.completed = new Set(); }
  }
  get current() { return TUTORIAL_STEPS[this.index] ?? null; }
  observe(event, details = {}) {
    const step = this.current;
    if (step?.event === 'pause-cycle' && event === 'pause-cycle' && details.mode === 'race') {
      if (details.paused) { this.pauseSeen = true; return { advanced: false, complete: false, current: step, index: this.index }; }
      if (!this.pauseSeen) return { advanced: false, complete: false, current: step, index: this.index };
      this.pauseSeen = false; return this.advance(step);
    }
    if (!step || step.mode !== details.mode || step.event !== event) return { advanced: false, complete: !step, current: step, index: this.index };
    if (event === 'throttle' && !(details.value > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'brake' && !(details.value > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'steer' && !(Math.abs(details.value) > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'manual-gearbox' && details.value !== 'manual') return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'gear-shift' && details.changed !== true) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'camera' && details.changed !== true) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'compound' && !['soft', 'medium', 'hard'].includes(details.value)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'combined' && details.activeBehaviors < 2) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'drs-active' && details.active !== true) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'ers-used' && !(details.chargeBefore > details.chargeAfter)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'tyre-wear' && !(details.wear > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'pit-service' && details.completed !== true) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'damage' && !(details.amount > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'forces-observed' && !(details.magnitude > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'decision-observed' && !details.decision) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'circuit-saved' && details.valid !== true) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'brain-inspected' && !(Array.isArray(details.architecture) && details.architecture.length >= 2 && details.sensorCount > 0)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'position-improved' && !(Number.isInteger(details.position) && Number.isInteger(details.previous) && details.position < details.previous)) return { advanced: false, complete: false, current: step, index: this.index };
    if (event === 'lap-completed' && !(Number.isInteger(details.laps) && Number.isInteger(details.previousLaps) && details.laps > details.previousLaps)) return { advanced: false, complete: false, current: step, index: this.index };
    return this.advance(step);
  }
  advance(step) {
    this.completed.add(this.index);
    const position = TUTORIAL_ORDER.indexOf(this.index);
    const next = TUTORIAL_ORDER.slice(Math.max(0, position + 1)).find((index) => !this.completed.has(index))
      ?? TUTORIAL_ORDER.find((index) => !this.completed.has(index));
    this.index = next ?? TUTORIAL_STEPS.length;
    this.persist();
    return { advanced: true, complete: this.index >= TUTORIAL_STEPS.length, current: this.current, index: this.index };
  }
  selectChapter(chapterId) {
    const chapter = TUTORIAL_CHAPTERS.find((entry) => entry.id === chapterId);
    if (!chapter) throw new RangeError(`Unknown tutorial chapter: ${chapterId}`);
    this.index = chapter.steps.find((index) => !this.completed.has(index)) ?? chapter.steps[0];
    this.pauseSeen = false; this.persist();
    return this.snapshot();
  }
  persist() { try { this.storage?.setItem(TUTORIAL_KEY, JSON.stringify({ version: 2, index: this.index, completed: [...this.completed].sort((a, b) => a - b) })); } catch { /* Optional local persistence. */ } }
  reset() { this.index = 0; this.completed.clear(); this.pauseSeen = false; this.persist(); return this.snapshot(); }
  snapshot() { return { index: this.index, total: TUTORIAL_STEPS.length, completed: this.completed.size, completedIndices: [...this.completed], progress: this.completed.size / TUTORIAL_STEPS.length, current: this.current, complete: this.completed.size === TUTORIAL_STEPS.length, activeChapter: TUTORIAL_CHAPTERS.find((chapter) => chapter.steps.includes(this.index))?.id ?? null }; }
}
