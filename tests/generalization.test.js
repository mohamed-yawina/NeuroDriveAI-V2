import { describe, expect, it } from 'vitest';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { createGeneralizationTracks, describeTrack } from '../src/ai/training/GeneralizationTracks.js';
import { RobustnessEvaluator, summarizeContinuousMetric, wilsonInterval } from '../src/ai/training/RobustnessEvaluator.js';
import { generalizationResultsToCsv } from '../src/ai/training/GeneralizationCsv.js';
import { createSeededRandom } from '../src/ai/training/random.js';

describe('Held-out generalization protocol', () => {
  it('keeps the training circuit and adds two closed tracks with different curvature profiles', () => {
    const tracks = createGeneralizationTracks();
    expect(tracks.map(({ id }) => id)).toEqual(['original', 'technical', 'fast-oval']);
    const descriptions = tracks.map(describeTrack);
    expect(descriptions[0].waypointPolylineLength).toBeCloseTo(491.1643, 2);
    expect(descriptions[1].meanTurnRadiansPerMeter).toBeGreaterThan(descriptions[0].meanTurnRadiansPerMeter);
    expect(descriptions[2].meanTurnRadiansPerMeter).not.toBeCloseTo(descriptions[0].meanTurnRadiansPerMeter, 3);
    expect(descriptions[2].waypointPolylineLength).not.toBeCloseTo(descriptions[0].waypointPolylineLength, 0);
    for (const track of tracks) {
      expect(track.waypoints.length).toBeGreaterThanOrEqual(44);
      expect(track.boundaries.length).toBeGreaterThan(1000);
    }
  });

  it('creates 30 reproducible held-out positions with perturbed headings and several initial speeds', () => {
    const track = createGeneralizationTracks()[0];
    const evaluator = new RobustnessEvaluator({ scenarioCount: 30, seed: 123, maxEpisodeTime: 0.1 });
    const a = evaluator.createScenarios(track);
    const b = evaluator.createScenarios(track);
    expect(a).toEqual(b);
    expect(new Set(a.map(({ arcFraction }) => arcFraction)).size).toBe(30);
    expect(new Set(a.map(({ initialSpeedMetersPerSecond }) => initialSpeedMetersPerSecond)).size).toBe(4);
    expect(a.every(({ headingErrorRadians }) => Math.abs(headingErrorRadians) <= Math.PI / 12)).toBe(true);
    expect(a.every(({ position, heading }) => position.every(Number.isFinite) && heading.every(Number.isFinite))).toBe(true);
  });

  it('reports Wilson completion intervals and scenario variation for continuous measures', () => {
    const completion = wilsonInterval(15, 30);
    expect(completion.rate).toBe(0.5);
    expect(completion.ci95[0]).toBeGreaterThan(0.3);
    expect(completion.ci95[1]).toBeLessThan(0.7);
    expect(summarizeContinuousMetric([1, 2, 3])).toMatchObject({ mean: 2, sd: 1, n: 3 });
    expect(summarizeContinuousMetric([5]).ci95).toBeNull();
  });

  it('runs matched episodes through the physics engine without mutating saved network weights', () => {
    const tracks = createGeneralizationTracks();
    const network = new NeuralNetwork({ random: createSeededRandom(45) });
    const before = JSON.stringify(network.toJSON());
    const result = new RobustnessEvaluator({ scenarioCount: 30, seed: 456, maxEpisodeTime: 0.1 }).run({
      tracks,
      networks: [{ seed: 45, network }],
    });
    expect(result.protocol.networksTrainedDuringEvaluation).toBe(false);
    expect(result.circuits).toHaveLength(3);
    for (const circuit of result.circuits) {
      expect(circuit.scenarioCount).toBe(30);
      expect(circuit.steeringEpisodes).toHaveLength(30);
      expect(circuit.neuralNetworks[0].neuralEpisodes).toHaveLength(30);
      expect(circuit.neuralNetworks[0].networkWeightsUnchanged).toBe(true);
      expect(circuit.neuralNetworks[0].pairedAgainstSteering.reward.n).toBe(30);
    }
    expect(JSON.stringify(network.toJSON())).toBe(before);
    const csv = generalizationResultsToCsv(result);
    expect(csv).toContain('circuit,circuit_label,training_seed,scenario_id');
    expect(csv.split('\r\n')).toHaveLength(91);
  });
});
