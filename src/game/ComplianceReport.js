/** Evidence map assembled from the course deck and checked project modules/tests. */
export const COMPLIANCE_ROWS = Object.freeze([
  ['Seek', '14', 'src/ai/behaviors/SteeringBehaviors.js · SeekBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Target steering is exposed; target scenarios are demonstrable.'],
  ['Flee', '18', 'src/ai/behaviors/SteeringBehaviors.js · FleeBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Requires an explicit threat context.'],
  ['Pursuit / Evade', '19–20', 'src/ai/behaviors/SteeringBehaviors.js · PursuitBehavior / EvadeBehavior', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Prediction horizon is bounded and configurable.'],
  ['Arrive', '22–24', 'src/ai/behaviors/SteeringBehaviors.js · ArriveBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Slow radius determines target approach speed.'],
  ['Wander', '26–28', 'src/ai/behaviors/SteeringBehaviors.js · WanderBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Repeatability depends on supplying a seeded random source.'],
  ['Path Following / scalar projection', '29–31', 'src/ai/PathFollowing.js · PathFollowing.project', 'tests/path-following-advanced.test.js', 'Steering Academy, F1 Racing', 'Arcade and historical evaluation have separate physics.'],
  ['Obstacle Avoidance', '32–36', 'src/ai/behaviors/SteeringBehaviors.js · ObstacleAvoidanceBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy, F1 Racing', 'Uses forward prediction and supplied obstacle geometry.'],
  ['Alignment', '37, 40–42', 'src/ai/behaviors/SteeringBehaviors.js · AlignmentBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Only neighbors inside configured radius contribute.'],
  ['Cohesion', '38, 40–42', 'src/ai/behaviors/SteeringBehaviors.js · CohesionBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Steers toward the observed neighbor centroid.'],
  ['Separation', '39–42', 'src/ai/behaviors/SteeringBehaviors.js · SeparationBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy, F1 Racing', 'Repulsion is bounded by maxForce.'],
  ['Boids', '40–42', 'src/academy/SteeringAcademy.js · flocking preset', 'tests/steering-behaviors.test.js', 'Steering Academy', 'The flocking preset composes Separation, Alignment and Cohesion.'],
  ['Leader Following', '50–51', 'src/ai/behaviors/SteeringBehaviors.js · LeaderFollowingBehavior.compute', 'tests/steering-behaviors.test.js', 'Steering Academy', 'Leader role and follower context must be supplied.'],
  ['BehaviorManager', '12, 31', 'src/ai/behaviors/BehaviorManager.js · getSteeringForce', 'tests/steering-behaviors.test.js', 'Steering Academy, Mode professeur', 'Slide 60 is explicitly a prior Nice 2024/25 mini-project, not a Casablanca G1 requirement.'],
  ['Neural network', '49', 'src/ai/neural/NeuralNetwork.js · infer / exportJSON', 'tests/neural-network.test.js', 'Neural Racing Lab, AI Lab', 'Historic A/B/C models are immutable inputs; this map does not certify a cohort requirement.'],
  ['Genetic algorithm / neuroevolution', '43–46, 49', 'src/ai/training/GeneticTrainer.js · generation evaluation', 'tests/training.test.js', 'AI Lab, Neural Racing Lab', 'No training is run by this report.'],
  ['Fitness function', '44, 49', 'src/ai/training/RewardCalculator.js · reward calculation', 'tests/training.test.js', 'AI Lab', 'The historical objective is not changed by arcade scoring.'],
  ['Generalization', '49', 'src/ai/training/GeneralizationTracks.js · held-out evaluation', 'tests/phase8-heldout.test.js', 'Neural Racing Lab', 'A course illustration is not equivalent to a formal generalization protocol.'],
  ['Model save/load', '49; 59*', 'src/ai/neural/NeuralNetwork.js · exportJSON/fromJSON', 'tests/neural-network.test.js', 'AI Lab, Neural Racing Lab', 'Slide 59 identifies an EMSI Marrakech 2025/26 mini-project; not confirmed as a G1 submission requirement.'],
  ['Reproducibility', '43–46', 'src/ai/training/GeneticTrainer.js · seeded state/checkpoint APIs', 'tests/training.test.js', 'Research validation tools', 'Reproducibility is project-validated; no specific Casablanca G1 rubric was provided.'],
]);

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class ComplianceReport {
  constructor({ host = document.body, onClose = () => {} } = {}) {
    this.host = host;
    this.root = document.createElement('section');
    this.root.className = 'compliance-report-overlay';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Matrice de conformité pédagogique');
    this.root.innerHTML = `<header><div><small>SUPPORT MICHEL BUFFA · MASTER 2 MIAGE IA2 · OCTOBRE 2026</small><h2>Notions, preuves et limites</h2></div><button type="button" data-close>FERMER</button></header><p>Repères vérifiés dans le support disponible. Une correspondance pédagogique n'est pas une attestation officielle. Les slides marquées * concernent un contexte de mini-projet d'une autre promotion et ne sont pas considérées comme une consigne Casablanca G1.</p><div class="compliance-table-wrap"><table><thead><tr><th>Notion</th><th>Diapos.</th><th>Implémentation</th><th>Test</th><th>Démonstration</th><th>Limites</th></tr></thead><tbody>${COMPLIANCE_ROWS.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    this.host.append(this.root);
    this.onClose = onClose;
    this.root.addEventListener('click', (event) => { if (event.target.closest('[data-close]')) this.dispose(); });
  }
  dispose() { if (!this.root) return; this.root.remove(); this.root = null; this.onClose(); }
}
