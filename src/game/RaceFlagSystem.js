export class RaceFlagSystem {
  constructor({ yellowSeconds = 3 } = {}) { this.yellowSeconds = yellowSeconds; this.yellowRemaining = 0; this.previousIncidents = 0; this.current = 'green'; this.reason = 'Circuit libre'; }
  update({ cars, director, collisionCount = 0, offTrackEvents = 0 }, dt = 0) {
    const incidents = collisionCount + offTrackEvents;
    if (incidents > this.previousIncidents) this.yellowRemaining = this.yellowSeconds;
    this.previousIncidents = incidents;
    this.yellowRemaining = Math.max(0, this.yellowRemaining - Math.max(0, dt));
    const leaderLaps = Math.max(0, ...cars.map((car) => car.completedLaps ?? 0));
    for (const car of cars) car.raceFlags = { yellow: this.yellowRemaining > 0, blue: leaderLaps - (car.completedLaps ?? 0) >= 1, speedMultiplier: this.yellowRemaining > 0 ? 0.62 : 1 };
    if (director.state === 'finished') { this.current = 'checkered'; this.reason = 'Course terminée'; }
    else if (this.yellowRemaining > 0) { this.current = 'yellow'; this.reason = 'Incident mesuré : prudence et vitesse arcade réduite'; }
    else if (cars.some((car) => car.raceFlags.blue)) { this.current = 'blue'; this.reason = 'Un pilote retardataire est à un tour ou plus du leader'; }
    else { this.current = 'green'; this.reason = 'Conditions normales de course'; }
    return { flag: this.current, reason: this.reason, yellowRemaining: this.yellowRemaining };
  }
  reset() { this.yellowRemaining = 0; this.previousIncidents = 0; this.current = 'green'; this.reason = 'Circuit libre'; }
}
