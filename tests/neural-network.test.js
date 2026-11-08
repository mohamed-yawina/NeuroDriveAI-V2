import { describe, expect, it } from 'vitest';
import { NeuralNetwork, NETWORK_ARCHITECTURE } from '../src/ai/neural/NeuralNetwork.js';
import { NeuralController } from '../src/ai/NeuralController.js';
import { createSeededRandom } from '../src/ai/training/random.js';
import { SteeringVehicle } from '../src/ai/SteeringVehicle.js';
import { Vector3 } from 'three';

describe('NeuralNetwork', () => {
  it('has the required 7-16-16-2 architecture and matrix dimensions', () => {
    const network = new NeuralNetwork({ random: createSeededRandom(7) });
    expect(network.architecture).toEqual([7, 16, 16, 2]);
    expect(network.layers.map((layer) => [layer.weights.length, layer.weights[0].length])).toEqual([[16, 7], [16, 16], [2, 16]]);
    expect(network.forward(new Array(7).fill(0))).toHaveLength(2);
  });

  it('produces deterministic tanh inference and independent mutated copies', () => {
    const network = new NeuralNetwork({ random: createSeededRandom(19) });
    const input = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, -0.2]);
    expect(Array.from(network.forward(input))).toEqual(Array.from(network.forward(input)));
    const copy = network.copy();
    copy.mutate({ rate: 1, sigma: 0.2, random: createSeededRandom(22) });
    expect(Array.from(copy.forward(input))).not.toEqual(Array.from(network.forward(input)));
    expect(copy.layers[0].weights).not.toBe(network.layers[0].weights);
  });

  it('round-trips JSON and rejects invalid architecture or non-finite parameters', () => {
    const network = new NeuralNetwork({ random: createSeededRandom(3) });
    const restored = NeuralNetwork.fromJSON(network.exportJSON());
    expect(restored.toJSON()).toEqual(network.toJSON());
    const invalidArchitecture = network.toJSON();
    invalidArchitecture.architecture[1] = 12;
    expect(() => NeuralNetwork.fromJSON(invalidArchitecture)).toThrow(/architecture/);
    const invalidValue = network.toJSON();
    invalidValue.layers[0].weights[0][0] = Infinity;
    expect(() => NeuralNetwork.fromJSON(invalidValue)).toThrow(/weights/);
  });

  it('maps network outputs to bounded physical force without moving the vehicle directly', () => {
    const network = new NeuralNetwork({ random: () => 0.5 });
    network.layers.forEach((layer) => { layer.weights.forEach((row) => row.fill(0)); layer.biases.fill(0); });
    network.layers[2].biases[0] = Math.atanh(0.5);
    network.layers[2].biases[1] = Math.atanh(0.7);
    const controller = new NeuralController({ network });
    const vehicle = new SteeringVehicle({ position: new Vector3(2, 0, 3), maxForce: 20, maxSpeed: 30 });
    const initialPosition = vehicle.position.clone();
    const force = controller.compute({ vehicle, observations: new Float32Array(7) });
    expect(controller.lastCommands.steering).toBeCloseTo(0.5);
    expect(controller.lastCommands.throttleBrake).toBeCloseTo(0.7);
    expect(force.length()).toBeLessThanOrEqual(vehicle.maxForce);
    expect(vehicle.position.equals(initialPosition)).toBe(true);
    network.layers[2].biases[1] = Math.atanh(-0.7);
    vehicle.velocity.set(0, 0, -4);
    const brakeForce = controller.compute({ vehicle, observations: new Float32Array(7), deltaTime: 1 / 30 });
    expect(controller.lastCommands.throttleBrake).toBeCloseTo(-0.7);
    expect(brakeForce.dot(vehicle.velocity)).toBeLessThan(0);
  });
});
