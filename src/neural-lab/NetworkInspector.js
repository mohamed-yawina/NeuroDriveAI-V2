const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function sampleIndices(count, visible) {
  if (count <= visible) return Array.from({ length: count }, (_, i) => i);
  return Array.from({ length: visible }, (_, i) => Math.round(i * (count - 1) / (visible - 1)));
}

function activationColor(value) {
  const strength = clamp(Math.abs(Number(value) || 0), 0, 1);
  const base = value >= 0 ? [225, 6, 0] : [65, 150, 230];
  const gray = [48, 53, 62];
  const rgb = base.map((channel, i) => Math.round(gray[i] + (channel - gray[i]) * strength));
  return `rgb(${rgb.join(',')})`;
}

/** Compact, honest architecture view. Large layers are sampled visually but labelled with their full width. */
export function renderNetworkDiagram(network, activationLayers = [], { width = 620, height = 218, maxVisibleNodes = 12 } = {}) {
  const architecture = network?.architecture;
  if (!Array.isArray(architecture) || architecture.length < 2 || architecture.some((size) => !Number.isInteger(size) || size < 1)) {
    throw new TypeError('A valid network architecture is required for the inspector.');
  }
  if (!Number.isInteger(maxVisibleNodes) || maxVisibleNodes < 2 || maxVisibleNodes > 32) throw new RangeError('maxVisibleNodes must be between 2 and 32.');
  const marginX = 36, top = 34, bottom = height - 23;
  const xs = architecture.map((_, i) => marginX + i * (width - marginX * 2) / (architecture.length - 1));
  const positions = architecture.map((count, layer) => {
    const indices = sampleIndices(count, maxVisibleNodes);
    return indices.map((neuron, visible) => ({ neuron, x: xs[layer], y: count <= maxVisibleNodes
      ? top + (bottom - top) * (visible + 0.5) / indices.length
      : top + (bottom - top) * visible / (indices.length - 1) }));
  });
  const edges = positions.slice(0, -1).flatMap((layer, i) => layer.flatMap((from) => positions[i + 1].map((to) =>
    `<line x1="${from.x}" y1="${from.y.toFixed(1)}" x2="${to.x}" y2="${to.y.toFixed(1)}" stroke="rgba(190,198,209,.17)" stroke-width=".65"/>`)));
  const nodes = positions.flatMap((layer, layerIndex) => layer.map(({ neuron, x, y }) => {
    const activation = activationLayers[layerIndex]?.[neuron];
    const color = Number.isFinite(activation) ? activationColor(activation) : '#30353e';
    const title = Number.isFinite(activation) ? `couche ${layerIndex}, neurone ${neuron + 1}: ${activation.toFixed(4)}` : `couche ${layerIndex}, neurone ${neuron + 1}: activation non capturée`;
    return `<circle cx="${x}" cy="${y.toFixed(1)}" r="5.2" fill="${color}" stroke="rgba(245,245,245,.75)" stroke-width=".8"><title>${title}</title></circle>`;
  }));
  const labels = architecture.map((count, i) => `<text x="${xs[i]}" y="17" text-anchor="middle" fill="#c4c8d0" font-size="10" font-family="monospace">${i === 0 ? 'Entrées' : i === architecture.length - 1 ? 'Sorties' : `Cachée ${i}`} · ${count}</text>`);
  const detail = activationLayers.length
    ? `${activationLayers.length} couches mesurées; cercles échantillonnés à l'écran, tailles complètes indiquées.`
    : 'Architecture chargée; activations disponibles après une inférence réelle.';
  return `<figure class="nrl-network-diagram"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Architecture neuronale ${architecture.join('-')}"><g>${edges.join('')}</g><g>${nodes.join('')}</g><g>${labels.join('')}</g></svg><figcaption>${detail}</figcaption></figure>`;
}

export function captureActivations(callback) {
  if (typeof callback !== 'function') throw new TypeError('Activation callback is required.');
  return (layer, values) => callback(layer + 1, Array.from(values));
}
