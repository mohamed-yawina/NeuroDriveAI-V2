import { Vector3 } from 'three';

const clampForce = (force, maxForce) => force.clone().clampLength(0, maxForce);

/** Weighted steering composition with a final physical maxForce limit. */
export class BehaviorManager {
  constructor({ maxForce = null } = {}) {
    this.maxForce = maxForce;
    this.behaviors = new Map();
    this.lastContributions = [];
    this.lastUnclampedForce = new Vector3();
    this.lastResultant = new Vector3();
  }

  add(behavior, weight = 1) {
    if (!behavior || typeof behavior.name !== 'string' || typeof behavior.compute !== 'function') {
      throw new TypeError('BehaviorManager.add expects a named behavior with compute(context).');
    }
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError('Behavior weight must be a finite, non-negative number.');
    if (this.behaviors.has(behavior.name)) throw new Error(`Behavior "${behavior.name}" is already registered.`);
    this.behaviors.set(behavior.name, { behavior, weight, active: true });
    return this;
  }

  remove(behavior) {
    const name = typeof behavior === 'string' ? behavior : behavior?.name;
    return name ? this.behaviors.delete(name) : false;
  }

  activate(behavior) { return this.setActive(behavior, true); }
  deactivate(behavior) { return this.setActive(behavior, false); }

  setActive(behavior, active) {
    const entry = this.entryFor(behavior);
    if (!entry) return false;
    entry.active = Boolean(active);
    return true;
  }

  changeWeight(behavior, weight) {
    if (!Number.isFinite(weight) || weight < 0) throw new RangeError('Behavior weight must be a finite, non-negative number.');
    const entry = this.entryFor(behavior);
    if (!entry) return false;
    entry.weight = weight;
    return true;
  }

  getBehavior(name) { return this.behaviors.get(typeof name === 'string' ? name : name?.name)?.behavior ?? null; }

  entryFor(behavior) {
    const name = typeof behavior === 'string' ? behavior : behavior?.name;
    return name ? this.behaviors.get(name) : null;
  }

  getSteeringForce(context) {
    const forceLimit = context.maxForce ?? context.vehicle?.maxForce ?? this.maxForce;
    if (!Number.isFinite(forceLimit) || forceLimit < 0) throw new RangeError('BehaviorManager needs a finite, non-negative maxForce.');
    const total = new Vector3();
    this.lastContributions = [];
    for (const [name, entry] of this.behaviors) {
      if (!entry.active) continue;
      const force = entry.behavior.compute(context);
      if (!force?.isVector3 || !Number.isFinite(force.x + force.y + force.z)) {
        throw new TypeError(`Behavior "${name}" must return a finite THREE.Vector3.`);
      }
      const weightedForce = force.clone().multiplyScalar(entry.weight);
      total.add(weightedForce);
      this.lastContributions.push({ name, weight: entry.weight, force: force.clone(), weightedForce });
    }
    this.lastUnclampedForce.copy(total);
    this.lastResultant.copy(clampForce(total, forceLimit));
    return this.lastResultant.clone();
  }

  getDebugData() {
    return {
      contributions: this.lastContributions.map(({ name, weight, force, weightedForce }) => ({
        name, weight, force: force.clone(), weightedForce: weightedForce.clone(),
      })),
      unclampedResultant: this.lastUnclampedForce.clone(),
      resultant: this.lastResultant.clone(),
    };
  }
}
