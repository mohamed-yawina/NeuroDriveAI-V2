const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function isArcadeTurboAllowed({ laboratory = null, driverAssignments = null } = {}) {
  return !laboratory && !driverAssignments;
}

/** Boost battery used only by the human arcade input path. */
export class ArcadeTurbo {
  constructor({ capacity = 100, drainPerSecond = 24, rechargePerSecond = 9, minimumSpeed = 4 } = {}) {
    this.capacity = Math.max(1, Number(capacity) || 100);
    this.drainPerSecond = Math.max(0, Number(drainPerSecond) || 24);
    this.rechargePerSecond = Math.max(0, Number(rechargePerSecond) || 9);
    this.minimumSpeed = Math.max(0, Number(minimumSpeed) || 0);
    this.charge = this.capacity;
    this.active = false;
  }

  update(dt, { requested = false, allowed = true, paused = false, racing = true, speed = 0, throttle = 0 } = {}) {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const canOperate = Boolean(allowed && !paused && racing);
    const canBoost = Boolean(canOperate && requested && throttle > 0 && speed >= this.minimumSpeed && this.charge > 0);
    this.active = canBoost;
    if (step > 0 && canOperate) {
      this.charge = clamp01((this.charge + (canBoost ? -this.drainPerSecond : this.rechargePerSecond) * step) / this.capacity) * this.capacity;
      if (this.charge <= 0) this.active = false;
    }
    return this.snapshot();
  }

  stop() { this.active = false; return this.snapshot(); }
  reset() { this.charge = this.capacity; this.active = false; return this.snapshot(); }
  snapshot() { return { charge: this.charge, capacity: this.capacity, fraction: this.charge / this.capacity, active: this.active, state: this.active ? 'ACTIVE' : this.charge >= this.capacity ? 'READY' : 'RECHARGE' }; }
}
