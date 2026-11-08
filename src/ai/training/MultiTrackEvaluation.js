import { NeuralController } from '../NeuralController.js';
import { SteeringController } from '../SteeringController.js';
import { RobustnessEvaluator, summarizeScenarioEpisodes, compareScenarioEpisodes } from './RobustnessEvaluator.js';

/** Held-out comparison of single-track models, multi-track models and classic steering. */
export function evaluateTrainingVariants({ tracks, singleTrackRuns, multiTrackRuns, scenarioSeed, scenarioCount = 30, split = 'validation' }) {
  const evaluator = new RobustnessEvaluator({ scenarioCount, seed: scenarioSeed, maxEpisodeTime: 60 });
  const circuits = tracks.map((track, trackIndex) => {
    const scenarios = evaluator.createScenarios(track, trackIndex);
    const steeringEpisodes = scenarios.map((scenario) => evaluator.evaluateEpisode(track, scenario, new SteeringController()));
    const evaluateModels = (runs) => runs.map(({ seed, network }) => {
      const before = JSON.stringify(network.toJSON());
      const episodes = scenarios.map((scenario) => evaluator.evaluateEpisode(
        track, scenario, new NeuralController({ network: network.copy() }),
      ));
      return {
        trainingSeed: seed,
        networkWeightsUnchanged: before === JSON.stringify(network.toJSON()),
        summary: summarizeScenarioEpisodes(episodes),
        pairedAgainstSteering: compareScenarioEpisodes(steeringEpisodes, episodes, scenarioSeed + seed + trackIndex * 101),
        episodes,
      };
    });
    return {
      track: { id: track.id, label: track.label },
      scenarioCount: scenarios.length,
      scenarios,
      steering: summarizeScenarioEpisodes(steeringEpisodes),
      steeringEpisodes,
      singleTrackNetworks: evaluateModels(singleTrackRuns),
      multiTrackNetworks: evaluateModels(multiTrackRuns),
    };
  });
  return {
    protocol: {
      split,
      scenarioSeed,
      scenarioCountPerTrackPerNetwork: scenarioCount,
      fixedDeltaTime: evaluator.fixedDeltaTime,
      initialSpeedLevelsMetersPerSecond: [0, 7, 14, 21],
      headingPerturbationDegrees: [-15, 15],
      rewardsUnchanged: true,
      networksTrainedDuringEvaluation: false,
      finalTestUsedForParameterSelection: false,
      pairedControllers: ['SteeringController', 'single-track NeuralController', 'multi-track NeuralController'],
    },
    circuits,
  };
}

export function trainingVariantResultsToCsv(results) {
  const columns = [
    'split', 'circuit', 'scenario_id', 'training_seed', 'arc_fraction', 'heading_error_degrees', 'initial_speed_mps',
    'steering_reason', 'steering_laps', 'steering_progress_m', 'steering_lap_time_s', 'steering_off_track_events', 'steering_off_track_s', 'steering_reward',
    'single_reason', 'single_laps', 'single_progress_m', 'single_lap_time_s', 'single_off_track_events', 'single_off_track_s', 'single_reward',
    'multi_reason', 'multi_laps', 'multi_progress_m', 'multi_lap_time_s', 'multi_off_track_events', 'multi_off_track_s', 'multi_reward',
    'single_weights_unchanged', 'multi_weights_unchanged',
  ];
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [columns];
  for (const circuit of results.circuits) for (const single of circuit.singleTrackNetworks) {
    const multi = circuit.multiTrackNetworks.find((entry) => entry.trainingSeed === single.trainingSeed);
    circuit.scenarios.forEach((scenario, index) => {
      const classic = circuit.steeringEpisodes[index];
      const one = single.episodes[index];
      const many = multi.episodes[index];
      const cols = (episode) => [episode.reason, episode.completedLaps, episode.signedProgressMeters, episode.lapTimeSeconds,
        episode.offTrackEvents, episode.offTrackDurationSeconds, episode.reward];
      rows.push([
        results.protocol.split, circuit.track.id, scenario.scenarioId, single.trainingSeed, scenario.arcFraction,
        scenario.headingErrorRadians * 180 / Math.PI, scenario.initialSpeedMetersPerSecond,
        ...cols(classic), ...cols(one), ...cols(many), single.networkWeightsUnchanged, multi.networkWeightsUnchanged,
      ]);
    });
  }
  return `\uFEFF${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
}
