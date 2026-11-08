export const NETWORK_ARCHITECTURE = Object.freeze([7, 16, 16, 2]);

const validateRandom = (random) => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError('Random generator must return a finite value in [0, 1).');
  return value;
};

export class NeuralNetwork {
  constructor({ random = Math.random } = {}) {
    this.architecture = [...NETWORK_ARCHITECTURE];
    this.layers = [];
    for (let layer = 0; layer < this.architecture.length - 1; layer++) {
      const inputCount = this.architecture[layer], outputCount = this.architecture[layer + 1];
      const scale = Math.sqrt(6 / (inputCount + outputCount));
      const weights = Array.from({ length: outputCount }, () => Array.from({ length: inputCount }, () => (validateRandom(random) * 2 - 1) * scale));
      const biases = Array.from({ length: outputCount }, () => (validateRandom(random) * 2 - 1) * scale * 0.1);
      this.layers.push({ weights, biases });
    }
  }

  forward(input, { onActivations = null } = {}) {
    if ((!Array.isArray(input) && !ArrayBuffer.isView(input)) || input.length !== NETWORK_ARCHITECTURE[0]) {
      throw new TypeError(`NeuralNetwork expects ${NETWORK_ARCHITECTURE[0]} input values.`);
    }
    let activation = Array.from(input, Number);
    if (!activation.every(Number.isFinite)) throw new TypeError('NeuralNetwork input values must be finite.');
    onActivations?.(-1, Float32Array.from(activation));
    for (const layer of this.layers) {
      const next = new Array(layer.biases.length);
      for (let row = 0; row < layer.weights.length; row++) {
        let sum = layer.biases[row];
        for (let col = 0; col < activation.length; col++) sum += layer.weights[row][col] * activation[col];
        next[row] = Math.tanh(sum);
      }
      activation = next;
      onActivations?.(this.layers.indexOf(layer), Float32Array.from(activation));
    }
    return Float32Array.from(activation);
  }

  copy() { return NeuralNetwork.fromJSON(this.toJSON()); }

  mutate({ rate = 0.08, sigma = 0.12, random = Math.random } = {}) {
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) throw new RangeError('Mutation rate must be in [0, 1].');
    if (!Number.isFinite(sigma) || sigma < 0) throw new RangeError('Mutation sigma must be non-negative.');
    let spare = null;
    const gaussian = () => {
      if (spare !== null) { const value = spare; spare = null; return value; }
      const u1 = Math.max(Number.MIN_VALUE, validateRandom(random));
      const u2 = validateRandom(random);
      const magnitude = Math.sqrt(-2 * Math.log(u1));
      spare = magnitude * Math.sin(2 * Math.PI * u2);
      return magnitude * Math.cos(2 * Math.PI * u2);
    };
    const mutateValue = (value) => {
      const mutated = validateRandom(random) < rate ? value + gaussian() * sigma : value;
      if (!Number.isFinite(mutated)) throw new RangeError('Mutation produced a non-finite parameter.');
      return mutated;
    };
    for (const layer of this.layers) {
      for (let row = 0; row < layer.weights.length; row++) {
        for (let col = 0; col < layer.weights[row].length; col++) layer.weights[row][col] = mutateValue(layer.weights[row][col]);
        layer.biases[row] = mutateValue(layer.biases[row]);
      }
    }
    return this;
  }

  toJSON() {
    return { architecture: [...this.architecture], layers: this.layers.map(({ weights, biases }) => ({ weights: weights.map((row) => [...row]), biases: [...biases] })) };
  }

  exportJSON(space = 2) { return JSON.stringify(this.toJSON(), null, space); }

  static fromJSON(input) {
    let data = input;
    if (typeof input === 'string') {
      try { data = JSON.parse(input); } catch { throw new TypeError('Invalid NeuralNetwork JSON.'); }
    }
    if (!data || !Array.isArray(data.architecture) || data.architecture.length !== NETWORK_ARCHITECTURE.length
      || data.architecture.some((size, index) => size !== NETWORK_ARCHITECTURE[index])) {
      throw new TypeError(`NeuralNetwork architecture must be [${NETWORK_ARCHITECTURE.join(', ')}].`);
    }
    if (!Array.isArray(data.layers) || data.layers.length !== NETWORK_ARCHITECTURE.length - 1) throw new TypeError('Invalid NeuralNetwork layer count.');
    const layers = data.layers.map((layer, index) => {
      const rows = NETWORK_ARCHITECTURE[index + 1], cols = NETWORK_ARCHITECTURE[index];
      if (!layer || !Array.isArray(layer.weights) || layer.weights.length !== rows || !Array.isArray(layer.biases) || layer.biases.length !== rows) {
        throw new TypeError(`Invalid dimensions in NeuralNetwork layer ${index}.`);
      }
      for (const row of layer.weights) if (!Array.isArray(row) || row.length !== cols || !row.every(Number.isFinite)) throw new TypeError(`Invalid weights in NeuralNetwork layer ${index}.`);
      if (!layer.biases.every(Number.isFinite)) throw new TypeError(`Invalid biases in NeuralNetwork layer ${index}.`);
      return { weights: layer.weights.map((row) => [...row]), biases: [...layer.biases] };
    });
    const network = Object.create(NeuralNetwork.prototype);
    network.architecture = [...NETWORK_ARCHITECTURE];
    network.layers = layers;
    return network;
  }
}
