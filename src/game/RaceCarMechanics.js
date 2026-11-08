const COMPOUNDS = Object.freeze({
  soft: Object.freeze({ grip: 1.08, wearRate: 0.0018, optimum: 92, durability: 0.72 }),
  medium: Object.freeze({ grip: 1, wearRate: 0.0012, optimum: 86, durability: 1 }),
  hard: Object.freeze({ grip: 0.94, wearRate: 0.00075, optimum: 79, durability: 1.45 }),
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Arcade-only car systems. The historical VehicleDynamics code never imports this module. */
export class RaceCarMechanics {
  constructor({ compound = 'medium', gearbox = 'automatic' } = {}) {
    if (!COMPOUNDS[compound] || !['automatic', 'manual'].includes(gearbox)) throw new RangeError('Invalid arcade tyre compound or gearbox mode.');
    this.enabled = false;
    this.compound = compound; this.gearboxMode = gearbox; this.gear = 1; this.engineRpm = 3500;
    this.tyreWear = 0; this.tyreTemperature = 75; this.ersCharge = 1; this.ersDeploy = false; this.drsRequested = false; this.drsActive = false;
    this.damage = 0; this.lastShift = null; this.pitStopSeconds = 0; this.pitState = 'track';
  }
  setEnabled(value) { this.enabled = Boolean(value); if (!this.enabled) { this.drsActive = false; this.ersDeploy = false; this.drsRequested = false; } return this.enabled; }
  setCompound(compound) { if (!COMPOUNDS[compound]) throw new RangeError(`Unknown tyre compound: ${compound}`); this.compound = compound; }
  setGearboxMode(mode) { if (!['automatic', 'manual'].includes(mode)) throw new RangeError('Gearbox mode must be automatic or manual.'); this.gearboxMode = mode; }
  shift(delta) { const next = clamp(this.gear + Math.sign(delta), 1, 8); if (next === this.gear) return false; this.gear = next; this.lastShift = next; return true; }
  requestDRS(value) { this.drsRequested = Boolean(value); }
  requestERS(value) { this.ersDeploy = Boolean(value); }
  advance(dt, { speed = 0, brake = 0, throttle = 0, steering = 0, inDRSZone = false, rivalGapSeconds = Infinity, drsRequested = this.drsRequested, ersDeploy = this.ersDeploy } = {}) {
    if (!this.enabled || !(dt > 0)) { this.drsActive = false; this.lastShift = null; return; }
    this.lastShift = null;
    this.drsRequested = Boolean(drsRequested);
    this.ersDeploy = Boolean(ersDeploy);
    if (this.gearboxMode === 'automatic') {
      const next = clamp(Math.floor(Math.max(0, speed) / 7.2) + 1, 1, 8);
      if (next !== this.gear) { this.gear = next; this.lastShift = next; }
    }
    this.engineRpm = clamp(3000 + speed / (5.6 + this.gear * 1.9) * 9000, 2500, 12000);
    const load = clamp(Math.abs(steering) * speed / 45 + brake * 0.7, 0, 1.5);
    const compound = COMPOUNDS[this.compound];
    this.tyreTemperature = clamp(this.tyreTemperature + (load * 2.4 - (this.tyreTemperature - 24) * 0.012) * dt, 20, 150);
    this.tyreWear = clamp(this.tyreWear + compound.wearRate * (0.5 + speed / 25 + load) * dt, 0, 1);
    this.ersCharge = clamp(this.ersCharge + (brake * 0.16 - (this.ersDeploy && throttle > 0 ? 0.28 : 0)) * dt, 0, 1);
    if (this.ersCharge <= 0) this.ersDeploy = false;
    this.drsActive = this.drsRequested && inDRSZone && rivalGapSeconds >= 0 && rivalGapSeconds <= 1;
  }
  get tyreGrip() {
    const compound = COMPOUNDS[this.compound];
    const temperatureFactor = clamp(1 - Math.abs(this.tyreTemperature - compound.optimum) / 100, 0.68, 1);
    return compound.grip * temperatureFactor * (1 - this.tyreWear * 0.34) * (1 - this.damage * 0.28);
  }
  get accelerationMultiplier() {
    if (!this.enabled) return 1;
    const gearEfficiency = [0, 1.1, 1.08, 1.04, 1, 0.96, 0.92, 0.88, 0.84][this.gear];
    return gearEfficiency * (this.ersDeploy && this.ersCharge > 0 ? 1.22 : 1);
  }
  get dragMultiplier() { return this.enabled && this.drsActive ? 0.68 : 1; }
  get speedMultiplier() { return this.enabled ? 1 - this.damage * 0.22 : 1; }
  applyImpact(relativeSpeed) { if (!this.enabled || !Number.isFinite(relativeSpeed) || relativeSpeed <= 3) return 0; this.damage = clamp(this.damage + Math.min(0.24, (relativeSpeed - 3) * 0.003), 0, 0.75); return this.damage; }
  repair() { this.damage = 0; this.tyreWear = 0; this.tyreTemperature = 75; }
  reset() { const enabled = this.enabled, compound = this.compound, gearboxMode = this.gearboxMode; Object.assign(this, new RaceCarMechanics({ compound, gearbox: gearboxMode })); this.enabled = enabled; }
  static compounds() { return structuredClone(COMPOUNDS); }
}

/** Finds the longest low-curvature section from actual circuit waypoints. */
export function deriveDRSZones(track, { minLength = 65, maxTurnRadians = 0.12 } = {}) {
  if (!Array.isArray(track?.waypoints) || track.waypoints.length < 4) return [];
  const points = track.waypoints, count = points.length;
  const segments = points.map((point, i) => ({ start: point, end: points[(i + 1) % count], length: point.distanceTo(points[(i + 1) % count]) }));
  const straight = segments.map((segment, i) => {
    const previous = segments[(i - 1 + count) % count];
    const a = segment.end.clone().sub(segment.start).setY(0).normalize();
    const b = previous.end.clone().sub(previous.start).setY(0).normalize();
    return Math.acos(clamp(a.dot(b), -1, 1)) <= maxTurnRadians;
  });
  let best = null, station = 0, start = null, length = 0;
  for (let i = 0; i < count * 2; i++) {
    const index = i % count;
    if (straight[index] && length < segments.reduce((sum, segment) => sum + segment.length, 0)) {
      if (start === null) start = station;
      length += segments[index].length;
      if (length > (best?.length ?? minLength - 1)) best = { start: start % segments.reduce((sum, segment) => sum + segment.length, 0), length };
    } else { start = null; length = 0; }
    station += segments[index].length;
    if (i >= count && start === null) break;
  }
  return best?.length >= minLength ? [{ start: best.start, end: best.start + best.length, length: best.length }] : [];
}
