import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { GameCar } from '../src/game/GameCar.js';
import { HistoricalBrainAdapter, ExperimentalNetwork, ExperimentalBrainAdapter, runRaceHeat } from '../src/neural-lab/ExperimentProtocol.js';
import { renderNetworkDiagram } from '../src/neural-lab/NetworkInspector.js';
import { analyzeReplayFailures, createRaceReplay, validateRaceReplay } from '../src/neural-lab/ReplayProtocol.js';
import { buildResearchReport, researchReportToCsv, validateResearchReport } from '../src/neural-lab/ResearchReport.js';
import { loadHistoricalFitness, parseCsvRecords } from '../src/neural-lab/HistoricalFitness.js';

const track = () => createGeneralizationTracks()[0];

describe('Ultimate Edition lot 2: neural provenance, replay and research outputs', () => {
  it('captures actual activations without changing a historical network inference', () => {
    const network = new NeuralNetwork({ random: () => 0.73 });
    const input = new Float32Array(7).fill(0.25);
    const expected = network.forward(input);
    const measured = [];
    const actual = network.forward(input, { onActivations: (layer, values) => measured.push({ layer, values: [...values] }) });
    expect([...actual]).toEqual([...expected]);
    expect(measured.map((entry) => entry.values.length)).toEqual([7, 16, 16, 2]);
    expect(measured.map((entry) => entry.layer)).toEqual([-1, 0, 1, 2]);
  });

  it('renders the full layer widths and measured activations, sampling only the drawing', () => {
    const network = new NeuralNetwork({ random: () => 0.5 });
    const svg = renderNetworkDiagram(network, [Array(7).fill(0.1), Array(16).fill(0.4), Array(16).fill(-0.2), [0.8, -0.3]]);
    expect(svg).toContain('Architecture neuronale 7-16-16-2');
    expect(svg).toContain('Cachée 1 · 16');
    expect(svg).toContain('neurone 1: 0.4000');
    expect(svg).toContain("échantillonnés à l'écran");
    expect(() => renderNetworkDiagram({ architecture: [7, 0, 2] })).toThrow(TypeError);
  });

  it('captures live activations through the historical and configurable brain adapters', () => {
    const circuit = track();
    const car = new GameCar({ id: 'activation-car', position: circuit.waypoints[0], forward: new Vector3(0, 0, -1) });
    const historical = new HistoricalBrainAdapter(new NeuralNetwork({ random: () => 0.6 }), circuit);
    const experimental = new ExperimentalBrainAdapter(new ExperimentalNetwork({ sensorAngles: [-30, 0, 30], hiddenLayers: [4], random: () => 0.6 }), circuit);
    historical.compute({ car }); experimental.compute({ car });
    expect(historical.controller.lastActivations.map((layer) => layer.length)).toEqual([7, 16, 16, 2]);
    expect(experimental.lastActivations.map((layer) => layer.length)).toEqual([4, 4, 2]);
    expect(historical.controller.lastActivations.flat().every(Number.isFinite)).toBe(true);
  });

  it('records a bounded synchronized headless heat and detects malformed replay data', async () => {
    const circuit = track();
    const drivers = ['Alpha', 'Beta'].map((name) => ({ name, provenance: 'test-controller', createController: () => ({ compute: () => new Vector3() }) }));
    const result = await runRaceHeat(circuit, drivers, { seed: 410, laps: 1, maxSteps: 240, recordReplay: true, maxReplayFrames: 40 });
    expect(validateRaceReplay(result.replay)).toMatchObject({ valid: true, drivers: 2 });
    expect(result.replay.frames.length).toBeLessThanOrEqual(41);
    expect(result.replay.track).toMatchObject({ id: 'original', category: 'arcade-built-in-track' });
    const invalid = structuredClone(result.replay); invalid.frames[0].cars[0].x = Infinity;
    expect(validateRaceReplay(invalid).valid).toBe(false);
  });

  it('locates recorded collision and off-track events without assigning causal explanations', () => {
    const circuit = track();
    const p = circuit.waypoints[12];
    const replay = createRaceReplay(circuit, [{ name: 'Alpha' }, { name: 'Beta' }], {
      seed: 100, physics: { engine: 'GameVehicleDynamics', dt: 1 / 60 },
      frames: [
        { step: 1, time: 1 / 60, cars: [{ id: 'car-1', name: 'Alpha', x: p.x, z: p.z, yaw: 0, progress: 0, collisions: 0, offTrackEvents: 0 }, { id: 'car-2', name: 'Beta', x: p.x + 2, z: p.z, yaw: 0, progress: 0, collisions: 0, offTrackEvents: 0 }] },
        { step: 10, time: 10 / 60, cars: [{ id: 'car-1', name: 'Alpha', x: p.x, z: p.z, yaw: 0, progress: 0.1, collisions: 2, offTrackEvents: 1 }, { id: 'car-2', name: 'Beta', x: p.x + 2, z: p.z, yaw: 0, progress: 0, collisions: 2, offTrackEvents: 0 }] },
      ],
    });
    const zones = analyzeReplayFailures(replay, circuit);
    expect(zones.map((zone) => zone.type).sort()).toEqual(['collision', 'off-track']);
    expect(zones.find((zone) => zone.type === 'collision').events).toBe(4);
    expect(zones.every((zone) => Number.isInteger(zone.segmentIndex) && zone.cause.startsWith('not inferred'))).toBe(true);
  });

  it('builds a versioned arcade-only report with explicit limits', () => {
    const report = buildResearchReport({ trainingRuns: [{ config: { seed: 10, networkConfig: { hiddenLayers: [4] } } }] });
    expect(validateResearchReport(report)).toMatchObject({ valid: true, records: 0, trainingRuns: 1 });
    expect(report.scope).toBe('arcade-experiments-only');
    expect(report.historicalResults.included).toBe(false);
    expect(report.arcade.limitations).toEqual(expect.arrayContaining([expect.stringContaining('do not establish causality')]));
    expect(validateResearchReport({ ...report, historicalResults: { included: true } }).valid).toBe(false);
  });

  it('parses the real historical CSV schemas without mixing configurations or seeds', async () => {
    const csv = [
      'configuration,seed,generation,best_candidate_fitness,mean_circuit_performance,mean_worst_circuit_performance',
      'A,2026,1,10,6,2',
      'B,2026,1,999,999,999',
      'A,2027,1,20,8,4',
      'A,2026,2,30,10,6',
    ].join('\n');
    expect(parseCsvRecords('name,value\n"Track, A",3')[0]).toMatchObject({ name: 'Track, A', value: '3' });
    const all = await loadHistoricalFitness('A', { fetchImpl: async () => ({ ok: true, text: async () => csv }) });
    expect(all.availableSeeds).toEqual(['2026', '2027']);
    expect(all.curve[0]).toMatchObject({ generation: 1, bestFitness: 15, meanFitness: 7, meanWorstPerformance: 3, seeds: ['2026', '2027'] });
    const seed = await loadHistoricalFitness('A', { fetchImpl: async () => ({ ok: true, text: async () => csv }), seed: 2026 });
    expect(seed.curve.map(({ bestFitness }) => bestFitness)).toEqual([10, 30]);
  });

  it('exports versioned arcade race and generation observations as quoted CSV rows', () => {
    const report = buildResearchReport({
      results: [{ trackId: 'track,one', trackLabel: 'Track One', trackCategory: 'held-out', heat: 1, protocol: { heats: [{ seed: 77 }] }, result: { results: [{ driver: 'Neural A', seed: 77, success: true, completedLaps: 1, bestLapTime: 12.5, collisions: 0, offTrackEvents: 1, offTrackTime: 0.5, progress: 1 }] }, provenance: [{ driver: 'Neural A', source: 'historic artifact A' }] }],
      models: [{ name: 'Neural A', architecture: [7, 16, 16, 2] }],
      trainingRuns: [{ config: { seed: 88, trackId: 'original', networkConfig: { sensorAngles: [-30, 0, 30], hiddenLayers: [4] } }, history: [{ generation: 1, meanFitness: 2, bestFitness: 4 }] }],
    });
    const csv = researchReportToCsv(report);
    expect(csv).toContain('"race-heat","game-arcade","track,one"');
    expect(csv).toContain('"7-16-16-2"');
    expect(csv).toContain('"training-generation","game-arcade","original"');
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(() => researchReportToCsv({ ...report, scope: 'historical' })).toThrow(TypeError);
  });
});
