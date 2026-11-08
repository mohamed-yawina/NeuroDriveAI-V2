const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Length-normalized candidate fitness; RewardCalculator weights remain untouched. */
export function aggregateMultiTrackFitness(episodes, {
  meanPerformanceWeight = 0.4,
  worstCircuitWeight = 0.4,
  successRateWeight = 20,
  offTrackEventsPenalty = 3,
} = {}) {
  if (!Array.isArray(episodes) || episodes.length < 2) throw new TypeError('Aggregate fitness requires at least two circuit episodes.');
  const circuitScores = episodes.map((episode) => {
    const length = episode.trackLength;
    if (!(length > 0) || !Number.isFinite(episode.reward)) throw new RangeError('Each circuit result needs a positive track length and finite reward.');
    const completed = episode.telemetry?.completedLaps > 0;
    const progressRatio = clamp01((episode.telemetry?.signedProgress ?? 0) / length);
    const fixedLapBonus = (episode.lapRewardValue ?? 0) * (episode.telemetry?.completedLaps ?? 0);
    // Remove the fixed lap bonus before dividing by length so short tracks do not gain a per-meter bonus.
    const normalizedRewardPer100Meters = (episode.reward - fixedLapBonus) / length * 100;
    const lapTime = episode.telemetry?.lastCompletedLapTime;
    const speedRatio = completed && lapTime > 0
      ? clamp01((length / lapTime) / 24)
      : clamp01((episode.telemetry?.averageSpeed ?? 0) / 24);
    const offTrackFraction = clamp01((episode.telemetry?.offTrackDuration ?? 0) / Math.max(episode.telemetry?.simulatedTime ?? 0, 1e-9));
    const offTrackEventsPerCircuit = (episode.telemetry?.offTrackEvents ?? 0)
      / Math.max((episode.telemetry?.distanceTravelled ?? 0) / length, 0.25);
    const physicalPerformance = 100 * (
      0.30 * progressRatio
      + 0.35 * Number(completed)
      + 0.20 * speedRatio
      + 0.15 * (1 - offTrackFraction)
    );
    const performance = 0.65 * normalizedRewardPer100Meters + 0.35 * physicalPerformance;
    return {
      trackId: episode.trackId,
      trackLength: length,
      completed,
      progressRatio,
      normalizedRewardPer100Meters,
      speedRatio,
      offTrackFraction,
      offTrackEventsPerCircuit,
      performance,
      termination: episode.reason,
    };
  });
  const mean = (key) => circuitScores.reduce((sum, score) => sum + score[key], 0) / circuitScores.length;
  const meanPerformance = mean('performance');
  const worstCircuitPerformance = Math.min(...circuitScores.map((score) => score.performance));
  const successRate = circuitScores.filter((score) => score.completed).length / circuitScores.length;
  const meanOffTrackEventsPerCircuit = mean('offTrackEventsPerCircuit');
  const fitness = meanPerformanceWeight * meanPerformance
    + worstCircuitWeight * worstCircuitPerformance
    + successRateWeight * successRate
    - offTrackEventsPenalty * meanOffTrackEventsPerCircuit;
  return {
    fitness,
    meanPerformance,
    worstCircuitPerformance,
    successRate,
    meanOffTrackEventsPerCircuit,
    meanNormalizedRewardPer100Meters: mean('normalizedRewardPer100Meters'),
    meanProgressRatio: mean('progressRatio'),
    circuitScores,
    aggregationWeights: { meanPerformanceWeight, worstCircuitWeight, successRateWeight, offTrackEventsPenalty },
  };
}
