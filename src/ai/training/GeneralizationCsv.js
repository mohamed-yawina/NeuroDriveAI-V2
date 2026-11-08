const columns = [
  'circuit', 'circuit_label', 'training_seed', 'scenario_id', 'arc_fraction', 'heading_error_degrees', 'initial_speed_mps',
  'steering_reason', 'steering_laps', 'steering_signed_progress_m', 'steering_lap_time_s', 'steering_off_track_events', 'steering_off_track_s', 'steering_reward',
  'neural_reason', 'neural_laps', 'neural_signed_progress_m', 'neural_lap_time_s', 'neural_off_track_events', 'neural_off_track_s', 'neural_reward',
  'lap_validation_distance_m', 'network_weights_unchanged',
];
const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** One row per held-out scenario and saved policy, with Steering as its matched baseline. */
export function generalizationResultsToCsv(results) {
  const rows = [columns];
  for (const circuit of results.circuits) for (const network of circuit.neuralNetworks) {
    for (let index = 0; index < circuit.scenarios.length; index++) {
      const scenario = circuit.scenarios[index];
      const classic = circuit.steeringEpisodes[index];
      const neural = network.neuralEpisodes[index];
      rows.push([
        circuit.track.id, circuit.track.label, network.trainingSeed, scenario.scenarioId, scenario.arcFraction,
        scenario.headingErrorRadians * 180 / Math.PI, scenario.initialSpeedMetersPerSecond,
        classic.reason, classic.completedLaps, classic.signedProgressMeters, classic.lapTimeSeconds,
        classic.offTrackEvents, classic.offTrackDurationSeconds, classic.reward,
        neural.reason, neural.completedLaps, neural.signedProgressMeters, neural.lapTimeSeconds,
        neural.offTrackEvents, neural.offTrackDurationSeconds, neural.reward,
        circuit.lapValidationDistanceMeters, network.networkWeightsUnchanged,
      ]);
    }
  }
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
}
