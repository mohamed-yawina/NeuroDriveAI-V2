export class RaceDirector {
  constructor({ countdownSeconds = 3, laps = 3, maxFinishDelay = 90, maxFormationSeconds = 120 } = {}) {
    this.countdownSeconds = countdownSeconds;
    this.laps = laps;
    this.maxFinishDelay = maxFinishDelay;
    this.maxFormationSeconds = maxFormationSeconds;
    this.state = 'grid';
    this.countdownRemaining = 0;
    this.raceElapsed = 0;
    this.winnerId = null;
    this.finishedAt = null;
    this.formationElapsed = 0; this.formationTimedOut = false;
  }

  start({ formationLap = false } = {}) {
    if (this.state !== 'grid') return false;
    this.state = formationLap ? 'formation' : 'countdown';
    this.countdownRemaining = formationLap ? 0 : this.countdownSeconds;
    return true;
  }

  update(dt, cars = []) {
    if (this.state === 'formation') {
      this.formationElapsed += dt;
      if ((cars.length && cars.every((car) => car.completedLaps >= 1)) || this.formationElapsed >= this.maxFormationSeconds) {
        this.formationTimedOut = !(cars.length && cars.every((car) => car.completedLaps >= 1));
        this.state = 'countdown'; this.countdownRemaining = this.countdownSeconds; this.raceElapsed = 0;
        return this.state;
      }
    }
    if (this.state === 'countdown') {
      this.countdownRemaining = Math.max(0, this.countdownRemaining - dt);
      if (this.countdownRemaining < 1e-9) this.countdownRemaining = 0;
      if (this.countdownRemaining === 0) this.state = 'racing';
    }
    if (this.state === 'racing') {
      this.raceElapsed += dt;
      const winner = cars.filter((car) => car.finished && Number.isFinite(car.finishTime))
        .reduce((earliest, car) => !earliest || car.finishTime < earliest.finishTime ? car : earliest, null);
      if (winner && this.finishedAt === null) { this.winnerId = winner.id; this.finishedAt = this.raceElapsed; }
      if ((cars.length && cars.every((car) => car.finished)) || (this.finishedAt !== null && this.raceElapsed - this.finishedAt >= this.maxFinishDelay)) this.state = 'finished';
    }
    return this.state;
  }

  get redLights() { return this.state === 'countdown' ? Math.min(5, Math.max(1, Math.ceil(this.countdownRemaining / Math.max(this.countdownSeconds / 5, 0.001)))) : 0; }
}
