import { CatmullRomCurve3, Vector3 } from 'three';
import { NeuralController } from '../NeuralController.js';
import { SteeringController } from '../SteeringController.js';
import { VehicleDynamics } from '../../physics/VehicleDynamics.js';
import { RewardCalculator } from './RewardCalculator.js';
import { createSeededRandom } from './random.js';
import { describeTrack } from './GeneralizationTracks.js';

const SPEED_LEVELS = [0, 7, 14, 21];
const T_CRITICAL_95 = (degreesOfFreedom) => {
  const z = 1.959963984540054;
  const v = degreesOfFreedom;
  return z + (z ** 3 + z) / (4 * v)
    + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * v ** 2)
    + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * v ** 3);
};

function sampleSd(values) {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function meanCi(values) {
  if (!values.length) return { mean: null, sd: null, ci95: null, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sd = sampleSd(values);
  const half = values.length > 1 ? T_CRITICAL_95(values.length - 1) * sd / Math.sqrt(values.length) : null;
  return { mean, sd, ci95: half === null ? null : [mean - half, mean + half], n: values.length };
}

function wilson(successes, n, z = 1.959963984540054) {
  if (!n) return { rate: null, ci95: null, n: 0 };
  const p = successes / n;
  const denominator = 1 + z ** 2 / n;
  const center = (p + z ** 2 / (2 * n)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2)) / denominator;
  return { rate: p, ci95: [Math.max(0, center - half), Math.min(1, center + half)], successes, n };
}

function summarizeEpisodes(episodes) {
  const successful = episodes.filter((episode) => episode.completedLaps > 0);
  const metric = (key) => meanCi(episodes.map((episode) => episode[key]));
  return {
    scenarioCount: episodes.length,
    completion: wilson(successful.length, episodes.length),
    meanSignedProgressMeters: metric('signedProgressMeters'),
    meanDistanceTravelledMeters: metric('distanceTravelledMeters'),
    successfulLapTimeSeconds: meanCi(successful.map((episode) => episode.lapTimeSeconds)),
    offTrackEvents: metric('offTrackEvents'),
    offTrackDurationSeconds: metric('offTrackDurationSeconds'),
    blockedTimeSeconds: metric('blockedTimeSeconds'),
    reward: metric('reward'),
    episodeDurationSeconds: metric('episodeDurationSeconds'),
  };
}

function pairedBootstrap(values, seed, iterations = 3000) {
  if (!values.length) return { meanDifference: null, ci95: null, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { meanDifference: mean, ci95: null, n: 1 };
  const random = createSeededRandom(seed);
  const means = new Array(iterations);
  for (let run = 0; run < iterations; run++) {
    let sum = 0;
    for (let sample = 0; sample < values.length; sample++) sum += values[Math.floor(random() * values.length)];
    means[run] = sum / values.length;
  }
  means.sort((a, b) => a - b);
  return { meanDifference: mean, ci95: [means[Math.floor(iterations * 0.025)], means[Math.floor(iterations * 0.975)]], n: values.length };
}

function pairedStatistics(steeringEpisodes, neuralEpisodes, seed) {
  const differences = (key, predicate = () => true) => steeringEpisodes.flatMap((classic, index) => {
    const neural = neuralEpisodes[index];
    return predicate(classic, neural) ? [neural[key] - classic[key]] : [];
  });
  const steeringSuccesses = steeringEpisodes.filter((episode) => episode.completedLaps > 0).length;
  const neuralSuccesses = neuralEpisodes.filter((episode) => episode.completedLaps > 0).length;
  const conservativeZ = 2.241402727604945; // Bonferroni-adjusted 97.5% Wilson bounds for 95% difference coverage.
  const steeringBounds = wilson(steeringSuccesses, steeringEpisodes.length, conservativeZ).ci95;
  const neuralBounds = wilson(neuralSuccesses, neuralEpisodes.length, conservativeZ).ci95;
  const pairedSuccessDifferences = steeringEpisodes.map((episode, index) => Number(neuralEpisodes[index].completedLaps > 0) - Number(episode.completedLaps > 0));
  const completionMeanDifference = pairedSuccessDifferences.reduce((sum, value) => sum + value, 0) / pairedSuccessDifferences.length;
  return {
    interpretation: 'Neural minus Steering; percentile bootstrap resamples matched scenario pairs.',
    completionRate: {
      meanDifference: completionMeanDifference,
      ci95: [neuralBounds[0] - steeringBounds[1], neuralBounds[1] - steeringBounds[0]],
      intervalMethod: 'Conservative Bonferroni difference of marginal 97.5% Wilson score intervals; valid under paired dependence.',
      discordantPairs: {
        neuralOnly: pairedSuccessDifferences.filter((value) => value > 0).length,
        steeringOnly: pairedSuccessDifferences.filter((value) => value < 0).length,
      },
      n: pairedSuccessDifferences.length,
    },
    meanSignedProgressMeters: pairedBootstrap(differences('signedProgressMeters'), seed + 2),
    successfulLapTimeSeconds: pairedBootstrap(differences('lapTimeSeconds', (a, b) => a.completedLaps > 0 && b.completedLaps > 0), seed + 3),
    offTrackEvents: pairedBootstrap(differences('offTrackEvents'), seed + 4),
    offTrackDurationSeconds: pairedBootstrap(differences('offTrackDurationSeconds'), seed + 5),
    reward: pairedBootstrap(differences('reward'), seed + 6),
  };
}

/** Held-out scenario evaluation. Networks are copied for inference and never trained or mutated. */
export class RobustnessEvaluator {
  constructor({ fixedDeltaTime = 1 / 30, maxEpisodeTime = 60, offTrackLimit = 3.5, blockedLimit = 4, scenarioCount = 30, seed = 93001 } = {}) {
    if (!Number.isInteger(scenarioCount) || scenarioCount < 30) throw new RangeError('Generalization validation needs at least 30 scenarios per network and circuit.');
    this.fixedDeltaTime = fixedDeltaTime;
    this.maxEpisodeTime = maxEpisodeTime;
    this.offTrackLimit = offTrackLimit;
    this.blockedLimit = blockedLimit;
    this.scenarioCount = scenarioCount;
    this.seed = seed;
  }

  createScenarios(track, trackIndex = 0) {
    const random = createSeededRandom(this.seed + trackIndex * 1009);
    const curve = new CatmullRomCurve3(track.waypoints, true, 'centripetal');
    const speedLevels = Array.from({ length: this.scenarioCount }, (_, i) => SPEED_LEVELS[i % SPEED_LEVELS.length]);
    for (let i = speedLevels.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [speedLevels[i], speedLevels[j]] = [speedLevels[j], speedLevels[i]];
    }
    return Array.from({ length: this.scenarioCount }, (_, index) => {
      // Stratified continuous arc-length positions are independent of waypoint-edge training spawns.
      const t = (index + random()) / this.scenarioCount;
      const position = curve.getPointAt(t).setY(0.08);
      const tangent = curve.getTangentAt(t).setY(0).normalize();
      const headingErrorRadians = (random() * 2 - 1) * Math.PI / 12;
      const heading = tangent.clone().applyAxisAngle(new Vector3(0, 1, 0), headingErrorRadians).normalize();
      return {
        scenarioId: `${track.id}-${String(index + 1).padStart(2, '0')}`,
        seed: this.seed + trackIndex * 1009 + index,
        arcFraction: t,
        position: position.toArray(),
        heading: heading.toArray(),
        headingErrorRadians,
        initialSpeedMetersPerSecond: speedLevels[index],
      };
    });
  }

  evaluateEpisode(track, scenario, controller) {
    const dynamics = new VehicleDynamics(track.waypoints, { boundaries: track.boundaries, controller });
    dynamics.reset();
    const position = new Vector3(...scenario.position);
    const heading = new Vector3(...scenario.heading);
    dynamics.vehicle.reset(position, heading);
    dynamics.vehicle.forward.copy(heading);
    dynamics.vehicle.velocity.copy(heading).multiplyScalar(scenario.initialSpeedMetersPerSecond);
    dynamics.telemetry.reset();
    dynamics.telemetry.initialize(position);
    const reward = new RewardCalculator();
    let reason = 'time-limit';
    let steps = 0;
    while (steps * this.fixedDeltaTime < this.maxEpisodeTime) {
      const metrics = dynamics.update(this.fixedDeltaTime);
      reward.update(metrics, controller.lastCommands, this.fixedDeltaTime);
      steps++;
      if (metrics.completedLaps >= 1) { reason = 'objective'; break; }
      if (dynamics.offTrackTime >= this.offTrackLimit) { reason = 'off-track'; break; }
      if (dynamics.stuckTime >= this.blockedLimit) { reason = 'blocked'; break; }
    }
    const telemetry = dynamics.telemetry.snapshot();
    return {
      controller: controller.name,
      scenarioId: scenario.scenarioId,
      reason,
      completedLaps: telemetry.completedLaps,
      signedProgressMeters: telemetry.signedProgress,
      distanceTravelledMeters: telemetry.distanceTravelled,
      lapTimeSeconds: telemetry.completedLaps > 0 ? telemetry.lastCompletedLapTime : null,
      offTrackEvents: telemetry.offTrackEvents,
      offTrackDurationSeconds: telemetry.offTrackDuration,
      blockedTimeSeconds: telemetry.blockedTime,
      episodeDurationSeconds: telemetry.simulatedTime,
      meanLateralErrorMeters: telemetry.meanLateralError,
      reward: reward.value(),
      lapValidationDistanceMeters: telemetry.lapValidationDistance,
      signedDistanceSinceStartCrossingMeters: telemetry.signedDistanceSinceStartCrossing,
      steps,
    };
  }

  run({ tracks, networks }) {
    if (!Array.isArray(tracks) || tracks.length < 3) throw new TypeError('Provide the original circuit and at least two held-out variants.');
    if (!Array.isArray(networks) || networks.length < 1) throw new TypeError('Provide at least one saved trained network.');
    const circuits = [];
    for (const [trackIndex, track] of tracks.entries()) {
      const scenarios = this.createScenarios(track, trackIndex);
      const steeringEpisodes = scenarios.map((scenario) => this.evaluateEpisode(track, scenario, new SteeringController()));
      const networkResults = networks.map(({ seed, network }) => {
        const before = JSON.stringify(network.toJSON());
        const neuralEpisodes = scenarios.map((scenario) => this.evaluateEpisode(track, scenario, new NeuralController({ network: network.copy() })));
        const weightsUnchanged = before === JSON.stringify(network.toJSON());
        return {
          trainingSeed: seed,
          networkWeightsUnchanged: weightsUnchanged,
          neural: summarizeEpisodes(neuralEpisodes),
          pairedAgainstSteering: pairedStatistics(steeringEpisodes, neuralEpisodes, this.seed + trackIndex * 1009 + seed),
          neuralEpisodes,
        };
      });
      circuits.push({
        track: describeTrack(track),
        lapValidationFraction: 0.95,
        lapValidationDistanceMeters: steeringEpisodes[0]?.lapValidationDistanceMeters ?? null,
        scenarioCount: scenarios.length,
        scenarios,
        steering: summarizeEpisodes(steeringEpisodes),
        steeringEpisodes,
        neuralNetworks: networkResults,
      });
    }
    return {
      protocol: {
        scenarioCountPerNetworkPerTrack: this.scenarioCount,
        trainingSeeds: networks.map(({ seed }) => seed),
        scenarioSeed: this.seed,
        fixedDeltaTime: this.fixedDeltaTime,
        maxEpisodeTime: this.maxEpisodeTime,
        offTrackLimit: this.offTrackLimit,
        blockedLimit: this.blockedLimit,
        headingPerturbationDegrees: [-15, 15],
        initialSpeedLevelsMetersPerSecond: SPEED_LEVELS,
        controllersPairedOnSameScenario: true,
        networksTrainedDuringEvaluation: false,
        confidenceIntervals: 'Wilson 95% for per-controller completion; conservative Bonferroni Wilson difference intervals for paired completion rates; Student-t mean intervals with a Cornish-Fisher t-quantile approximation for per-controller continuous metrics; seeded percentile bootstrap of paired scenario differences for continuous controller deltas.',
      },
      confidenceLimitations: 'Intervals describe variability across the fixed generated scenario sample, conditional on these circuits and saved networks. Scenarios are paired between controllers; each circuit has a separate seeded stratified sample. Steering episodes are a shared comparator across saved network seeds, and the same networks are evaluated on all circuits. The three circuits and three trained networks are not independent population samples.',
      circuits,
    };
  }
}

export { meanCi as summarizeContinuousMetric, wilson as wilsonInterval };
export { summarizeEpisodes as summarizeScenarioEpisodes, pairedStatistics as compareScenarioEpisodes };
