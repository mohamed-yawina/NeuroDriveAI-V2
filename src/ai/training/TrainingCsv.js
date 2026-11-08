const columns = [
  'seed', 'generation', 'evaluations', 'best_reward_generation', 'global_best_reward', 'mean_reward', 'successful_laps',
  'best_episode_reason', 'best_episode_laps', 'best_episode_signed_progress_m', 'best_episode_distance_m',
  'best_episode_off_track_events', 'best_episode_off_track_duration_s', 'best_episode_blocked_time_s', 'best_episode_mean_lateral_error_m',
  'mean_completed_laps', 'mean_signed_progress_m', 'mean_distance_travelled_m', 'mean_episode_time_s',
  'mean_speed_mps', 'mean_max_speed_mps', 'mean_off_track_events', 'mean_off_track_duration_s',
  'mean_blocked_time_s', 'mean_lateral_error_m', 'episodes_objective', 'episodes_off_track', 'episodes_blocked', 'episodes_time_limit',
  'physical_episode_evaluations', 'best_candidate_fitness', 'mean_circuit_performance', 'mean_worst_circuit_performance',
  'mean_candidate_success_rate', 'mean_normalized_progress_ratio', 'mean_off_track_events_per_circuit',
];

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** Serialize actual per-generation evaluations; no model weights or derived placeholders. */
export function trainingHistoryToCsv(runs) {
  const rows = [columns];
  for (const run of runs) for (const generation of run.history ?? []) {
    const reasons = generation.terminationReasons ?? {};
    rows.push([
      run.seed ?? generation.seed,
      generation.generation,
      generation.evaluations,
      generation.bestReward,
      generation.globalBestReward,
      generation.meanReward,
      generation.successfulLaps,
      generation.bestEpisodeReason,
      generation.bestEpisodeCompletedLaps,
      generation.bestEpisodeSignedProgress,
      generation.bestEpisodeDistanceTravelled,
      generation.bestEpisodeOffTrackEvents,
      generation.bestEpisodeOffTrackDuration,
      generation.bestEpisodeBlockedTime,
      generation.bestEpisodeMeanLateralError,
      generation.meanCompletedLaps,
      generation.meanSignedProgress,
      generation.meanDistanceTravelled,
      generation.meanEpisodeTime,
      generation.meanAverageSpeed,
      generation.meanMaxSpeed,
      generation.meanOffTrackEvents,
      generation.meanOffTrackDuration,
      generation.meanBlockedTime,
      generation.meanLateralError,
      reasons.objective ?? 0,
      reasons['off-track'] ?? 0,
      reasons.blocked ?? 0,
      reasons['time-limit'] ?? 0,
      generation.physicalEpisodeEvaluations ?? generation.evaluations,
      generation.bestCandidateFitnessScore,
      generation.meanCircuitPerformance,
      generation.meanWorstCircuitPerformance,
      generation.meanCandidateSuccessRate,
      generation.meanNormalizedProgressRatio,
      generation.meanOffTrackEventsPerCircuit,
    ]);
  }
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export const TRAINING_CSV_COLUMNS = Object.freeze([...columns]);
