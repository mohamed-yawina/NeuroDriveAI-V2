import { RaceLeaderboard } from './RaceLeaderboard.js';

/** Development-only event records for tracing a displayed race result. */
export class RaceDiagnostics {
  constructor({ enabled = () => false, logger = console.debug } = {}) {
    this.enabled = enabled;
    this.logger = logger;
    this.previousRanks = new Map();
    this.previousProgress = new Map();
    this.previousState = null;
  }

  emit(record, displayedRanks = new Map()) {
    if (!this.enabled()) return false;
    const payload = { ...record, displayedRank: record.displayedRank ?? displayedRanks.get(record.carId) ?? null };
    this.logger('[NeuroDrive race diagnostic]', payload);
    return true;
  }

  observe(world, displayedRanks = new Map()) {
    if (!this.enabled() || !world) return;
    const ranked = RaceLeaderboard.rank(world.cars);
    const rankById = new Map(ranked.map((car) => [car.id, car.position]));
    if (this.previousState !== world.director.state) {
      this.previousState = world.director.state;
      for (const car of world.cars) this.emit({
        event: 'race-state', driverId: car.driverId ?? car.id, carId: car.id, isHuman: car.isPlayer === true,
        gridPosition: car.gridPosition ?? null, completedLaps: car.completedLaps ?? 0,
        validatedProgress: car.validatedProgress ?? null, totalProgress: car.validatedProgress ?? null,
        finishTime: car.finishTime ?? null, liveRank: rankById.get(car.id) ?? null,
        finalRank: world.director.state === 'finished' ? rankById.get(car.id) ?? null : null,
        displayedRank: displayedRanks.get(car.id) ?? null, raceState: world.director.state,
      }, displayedRanks);
    }
    for (const car of world.cars) {
      const liveRank = rankById.get(car.id) ?? null;
      const priorRank = this.previousRanks.get(car.id);
      if (priorRank !== undefined && priorRank !== liveRank) this.emit({
        event: 'rank-change', driverId: car.driverId ?? car.id, carId: car.id, isHuman: car.isPlayer === true,
        gridPosition: car.gridPosition ?? null, completedLaps: car.completedLaps ?? 0,
        validatedProgress: car.validatedProgress ?? null,
        totalProgress: car.validatedProgress ?? null,
        finishTime: car.finishTime ?? null, liveRank, finalRank: world.director.state === 'finished' ? liveRank : null,
        displayedRank: displayedRanks.get(car.id) ?? null, raceState: world.director.state,
      }, displayedRanks);
      this.previousRanks.set(car.id, liveRank);
      const progress = Number.isFinite(car.validatedProgress) ? car.validatedProgress : null;
      const priorProgress = this.previousProgress.get(car.id);
      if (progress !== null && priorProgress !== null && priorProgress !== undefined && !car.finished) {
        for (const rival of world.cars) {
          if (rival === car || rival.finished) continue;
          const rivalPrior = this.previousProgress.get(rival.id);
          const rivalProgress = rival.validatedProgress;
          if (!Number.isFinite(rivalPrior) || !Number.isFinite(rivalProgress)) continue;
          if (priorProgress <= rivalPrior && progress > rivalProgress) this.emit({
            event: 'overtake', driverId: car.driverId ?? car.id, carId: car.id, opponentId: rival.driverId ?? rival.id,
            isHuman: car.isPlayer === true, gridPosition: car.gridPosition ?? null,
            completedLaps: car.completedLaps ?? 0, validatedProgress: progress, totalProgress: progress,
            finishTime: car.finishTime ?? null, liveRank, finalRank: world.director.state === 'finished' ? liveRank : null,
            displayedRank: displayedRanks.get(car.id) ?? null, raceState: world.director.state,
          }, displayedRanks);
        }
      }
      this.previousProgress.set(car.id, progress);
    }
  }

  reset() { this.previousRanks.clear(); this.previousProgress.clear(); this.previousState = null; }
}

export const isRaceDiagnosticsEnabled = () => import.meta.env?.DEV === true
  && globalThis.window?.__NEURODRIVE_RACE_DIAGNOSTICS__ === true;
