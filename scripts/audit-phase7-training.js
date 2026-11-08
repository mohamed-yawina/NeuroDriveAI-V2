import { readFileSync, writeFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { NeuralController } from '../src/ai/NeuralController.js';
import { NeuralNetwork } from '../src/ai/neural/NeuralNetwork.js';
import { VehicleDynamics } from '../src/physics/VehicleDynamics.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { TrainingEnvironment } from '../src/ai/training/TrainingEnvironment.js';

const training = JSON.parse(readFileSync('results/phase7-multitrack-training.json', 'utf8'));
const validation = JSON.parse(readFileSync('results/phase7-multitrack-validation.json', 'utf8'));
const tracks = createGeneralizationTracks();
const featureNames = ['sensorOuterLeft', 'sensorFrontLeft', 'sensorFront', 'sensorFrontRight', 'sensorOuterRight', 'speedRatio', 'headingErrorRatio'];

function forwardWithActivations(network, input) {
  let activation = Array.from(input, Number);
  const layers = [];
  for (const layer of network.layers) {
    activation = layer.weights.map((row, index) => Math.tanh(
      layer.biases[index] + row.reduce((sum, weight, column) => sum + weight * activation[column], 0),
    ));
    layers.push(activation);
  }
  return layers;
}

function summarize(values, range = [0, 1]) {
  if (!values.length) return { count: 0, mean: null, sd: null, min: null, max: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    mean,
    sd: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
    outsideNominalRange: values.filter((value) => value < range[0] || value > range[1]).length,
  };
}

function flatten(network) {
  return network.layers.flatMap((layer) => [...layer.weights.flat(), ...layer.biases]);
}

const results = [];
for (const run of training.runs) {
  const network = NeuralNetwork.fromJSON(run.bestNetwork);
  const environment = new TrainingEnvironment(tracks, { seed: run.seed });
  const inputGroups = { trainingStarts: featureNames.map(() => []), validationStarts: featureNames.map(() => []) };
  const activationGroups = { trainingStarts: network.layers.map(() => []), validationStarts: network.layers.map(() => []) };
  const validationCircuit = new Map(validation.circuits.map((circuit) => [circuit.track.id, circuit]));
  const capture = (trackIndex, scenario, kind) => {
    environment.selectTrack(trackIndex);
    const dynamics = environment.dynamics;
    const position = new Vector3(...scenario.position);
    const heading = new Vector3(...scenario.heading);
    dynamics.vehicle.reset(position, heading);
    dynamics.vehicle.forward.copy(heading);
    dynamics.vehicle.velocity.copy(heading).multiplyScalar(scenario.initialSpeedMetersPerSecond);
    const readings = dynamics.sensors.update(position, heading);
    const observations = dynamics.observationBuilder.build(dynamics.vehicle, dynamics.path, readings);
    const activations = forwardWithActivations(network, observations);
    observations.forEach((value, index) => inputGroups[kind][index].push(value));
    activations.forEach((values, layerIndex) => activationGroups[kind][layerIndex].push(...values));
  };

  for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
    for (let generation = 1; generation <= run.generationsCompleted; generation++) {
      const seed = (run.seed * 65537 + generation * 313 + trackIndex * 7919) >>> 0;
      capture(trackIndex, environment.createScenario({ seed, trackIndex }), 'trainingStarts');
    }
    const circuit = validationCircuit.get(tracks[trackIndex].id);
    for (const scenario of circuit.scenarios) capture(trackIndex, scenario, 'validationStarts');
  }

  const histories = run.history.map((entry) => entry.bestNetwork).filter(Boolean).map((network) => JSON.stringify(network));
  const uniqueBestSnapshots = new Set(histories).size;
  results.push({
    trainingSeed: run.seed,
    generations: run.generationsCompleted,
    parameterCount: flatten(network).length,
    bestSoFarSnapshotsAvailable: histories.length,
    bestSoFarUniqueSnapshots: uniqueBestSnapshots,
    bestSoFarSnapshotChangeFraction: histories.length > 1
      ? histories.slice(1).filter((value, index) => value !== histories[index]).length / (histories.length - 1)
      : 0,
    observations: Object.fromEntries(Object.entries(inputGroups).map(([kind, columns]) => [kind, Object.fromEntries(featureNames.map((name, index) => [name, summarize(columns[index], index === 6 ? [-1, 1] : [0, 1])]))])),
    tanhActivationRates: Object.fromEntries(Object.entries(activationGroups).map(([kind, layers]) => [kind, layers.map((values, index) => ({
      layer: index + 1,
      activationCount: values.length,
      absAbove095: values.filter((value) => Math.abs(value) > 0.95).length / Math.max(values.length, 1),
      absAbove099: values.filter((value) => Math.abs(value) > 0.99).length / Math.max(values.length, 1),
      values: summarize(values),
    }))])),
  });
}

const models = training.runs.map((run) => flatten(NeuralNetwork.fromJSON(run.bestNetwork)));
const crossSeedDistances = [];
for (let left = 0; left < models.length; left++) for (let right = left + 1; right < models.length; right++) {
  const squared = models[left].reduce((sum, value, index) => sum + (value - models[right][index]) ** 2, 0);
  crossSeedDistances.push({ seeds: [training.runs[left].seed, training.runs[right].seed], parameterRmsDistance: Math.sqrt(squared / models[left].length) });
}

const report = {
  scope: 'Initial observations on phase 7 training starts and the saved independent validation starts. No physics episodes were run; full in-episode observation/activation traces were not present in phase 7 artifacts.',
  scenarioBalance: {
    trainingStartsPerSeedPerCircuit: training.runs.map((run) => ({ seed: run.seed, starts: run.generationsCompleted })),
    validationStartsPerCircuit: validation.protocol.scenarioCountPerTrackPerNetwork,
    trainingInitialSpeedsMetersPerSecond: [0, 7, 14, 21],
    trainingHeadingPerturbationDegrees: [-10, 10],
    validationInitialSpeedsMetersPerSecond: validation.protocol.initialSpeedLevelsMetersPerSecond,
    validationHeadingPerturbationDegrees: validation.protocol.headingPerturbationDegrees,
  },
  diversityLimitations: 'Phase 7 stored only fitness metrics per generation; it stored neither population members, parent identities, nor generation best-network snapshots. Within-run genetic diversity cannot be reconstructed. Cross-seed best-model parameter distance is only a coarse between-run proxy.',
  activationLimitations: 'Tanh saturation rates cover episode-start observations only; they do not estimate the activation distribution over full trajectories.',
  crossSeedBestModelRmsDistances: crossSeedDistances,
  networks: results,
};
writeFileSync('results/phase8-phase7-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  output: 'results/phase8-phase7-audit.json',
  networks: results.map(({ trainingSeed, bestSoFarUniqueSnapshots, bestSoFarSnapshotChangeFraction, tanhActivationRates }) => ({
    trainingSeed, bestSoFarUniqueSnapshots, bestSoFarSnapshotChangeFraction,
    trainSaturation: tanhActivationRates.trainingStarts.map((layer) => [layer.absAbove095, layer.absAbove099]),
    validationSaturation: tanhActivationRates.validationStarts.map((layer) => [layer.absAbove095, layer.absAbove099]),
  })),
  crossSeedBestModelRmsDistances: crossSeedDistances,
}, null, 2));
