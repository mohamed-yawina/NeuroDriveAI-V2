import * as THREE from 'three';

const COLORS = Object.freeze({
  pathFollowing: 0xf5f5f5,
  obstacleAvoidance: 0xffad42,
  separation: 0x57c7ff,
  pursuit: 0xe10600,
  resultant: 0xa9e86e,
  velocity: 0x72d9c7,
  desired: 0xfff176,
});

/** Three.js overlay for the real steering output of the selected arcade controller. */
export class RaceLabVisuals {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'neurodrive-lab-vectors';
    this.arrows = new Map();
    for (const [name, color] of Object.entries(COLORS)) {
      const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, color, 0.28, 0.16);
      arrow.name = `lab-vector-${name}`;
      this.arrows.set(name, arrow);
      this.group.add(arrow);
    }
    scene.add(this.group);
    this.enabled = true;
  }

  setEnabled(enabled) { this.enabled = Boolean(enabled); this.group.visible = this.enabled; }

  update(car, decisionData) {
    if (!car || !decisionData?.forces) { this.group.visible = false; return false; }
    this.group.visible = this.enabled;
    if (!this.enabled) return false;
    const origin = car.position.clone(); origin.y += 1.35;
    for (const arrow of this.arrows.values()) arrow.position.copy(origin);
    const contributions = new Map(decisionData.forces.contributions.map((entry) => [entry.name, entry.weightedForce]));
    for (const name of ['pathFollowing', 'obstacleAvoidance', 'separation', 'pursuit']) {
      this.setArrow(name, contributions.get(name), 0.48, 9);
    }
    this.setArrow('resultant', decisionData.forces.resultant, 0.52, 9);
    this.setArrow('velocity', car.velocity, 0.13, 12);
    const target = decisionData.path?.target;
    const desired = target ? target.clone().sub(car.position).setY(0) : null;
    this.setArrow('desired', desired, 1, 14);
    return true;
  }

  setArrow(name, value, scale, maxLength) {
    const arrow = this.arrows.get(name);
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.z)) { arrow.visible = false; return; }
    const direction = new THREE.Vector3(value.x, 0, value.z);
    const magnitude = direction.length();
    if (magnitude < 1e-5) { arrow.visible = false; return; }
    const length = Math.min(maxLength, Math.max(0.25, magnitude * scale));
    arrow.visible = true;
    arrow.setDirection(direction.normalize());
    arrow.setLength(length, Math.min(0.42, length * 0.3), Math.min(0.22, length * 0.18));
  }

  dispose() {
    this.scene.remove(this.group);
    for (const arrow of this.arrows.values()) {
      arrow.line.geometry.dispose(); arrow.line.material.dispose();
      arrow.cone.geometry.dispose(); arrow.cone.material.dispose();
    }
    this.arrows.clear();
  }
}

/** Draw a compact live diagram from the selected network's actual weights and activations. */
export function drawNeuralNetwork(canvas, network, activations) {
  if (!canvas || network?.architecture?.join(',') !== '7,16,16,2' || network.layers?.length !== 3
    || !Array.isArray(activations) || activations.length !== 4 || activations.some((layer) => !layer?.length)) return false;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || canvas.clientWidth || 520));
  const height = 188;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  }
  const context = canvas.getContext('2d');
  if (!context) return false;
  context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
  const sizes = network.architecture;
  const labels = ['CAPTEURS', 'CACHÉE 1', 'CACHÉE 2', 'COMMANDES'];
  const positions = sizes.map((count, layer) => {
    const x = 22 + layer * (width - 44) / 3;
    const gap = Math.min(8.7, (height - 36) / Math.max(1, count - 1));
    const total = gap * (count - 1);
    return Array.from({ length: count }, (_, index) => ({ x, y: 22 + (height - 28 - total) / 2 + index * gap }));
  });
  context.lineWidth = 0.65;
  for (let layer = 0; layer < network.layers.length; layer += 1) {
    const weights = network.layers[layer].weights;
    for (let to = 0; to < weights.length; to += 1) for (let from = 0; from < weights[to].length; from += 1) {
      const weight = weights[to][from];
      const activation = Math.min(1, Math.abs(Number(activations[layer + 1][to]) || 0));
      context.strokeStyle = weight >= 0 ? `rgba(225,6,0,${0.08 + activation * 0.44})` : `rgba(83,177,255,${0.08 + activation * 0.4})`;
      context.beginPath(); context.moveTo(positions[layer][from].x, positions[layer][from].y);
      context.lineTo(positions[layer + 1][to].x, positions[layer + 1][to].y); context.stroke();
    }
  }
  for (let layer = 0; layer < sizes.length; layer += 1) {
    const inputValues = activations[layer] ?? [];
    positions[layer].forEach(({ x, y }, index) => {
      const activation = Math.max(-1, Math.min(1, Number(inputValues[index]) || 0));
      context.beginPath(); context.arc(x, y, layer === 0 || layer === 3 ? 4.2 : 3.1, 0, Math.PI * 2);
      context.fillStyle = activation >= 0 ? `rgba(225,6,0,${0.28 + Math.abs(activation) * 0.72})` : `rgba(83,177,255,${0.28 + Math.abs(activation) * 0.72})`;
      context.fill(); context.strokeStyle = '#f5f5f5'; context.lineWidth = 0.55; context.stroke();
    });
    context.fillStyle = '#c4c7ce'; context.font = '8px sans-serif'; context.textAlign = 'center';
    context.fillText(`${labels[layer]} · ${sizes[layer]}`, positions[layer][0].x, height - 5);
  }
  return true;
}
