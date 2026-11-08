export class RaceLeaderboard {
  static compare(a, b) {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished && b.finished) {
      const finishTimeA = Number.isFinite(a.finishTime) ? a.finishTime : Infinity;
      const finishTimeB = Number.isFinite(b.finishTime) ? b.finishTime : Infinity;
      if (finishTimeA !== finishTimeB) return finishTimeA - finishTimeB;
      return String(a.id).localeCompare(String(b.id));
    }
    if (a.completedLaps !== b.completedLaps) return b.completedLaps - a.completedLaps;
    if (Number.isFinite(a.validatedProgress) && Number.isFinite(b.validatedProgress)) {
      if (Math.abs(a.validatedProgress - b.validatedProgress) > 0.01) return b.validatedProgress - a.validatedProgress;
      return String(a.id).localeCompare(String(b.id));
    }
    const progressA = a.station ?? (a.progress ?? 0) * (a.totalTrackLength ?? 1);
    const progressB = b.station ?? (b.progress ?? 0) * (b.totalTrackLength ?? 1);
    if (Math.abs(progressA - progressB) > 0.01) return progressB - progressA;
    return (a.bestLapTime ?? Infinity) - (b.bestLapTime ?? Infinity);
  }

  static rank(cars) { return [...cars].sort(RaceLeaderboard.compare).map((car, index) => ({ ...car, position: index + 1 })); }
}
