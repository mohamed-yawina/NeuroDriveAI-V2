const pointXZ = (point) => ({ x: Number(point.x), z: Number(point.z) });

export function measureTrackDefinition(track) {
  const points = track?.waypoints?.map(pointXZ) ?? [];
  if (points.length < 3 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.z))) {
    throw new TypeError('Le circuit doit fournir au moins trois points runtime valides.');
  }
  let length = 0, turns = 0;
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const outgoing = { x: next.x - current.x, z: next.z - current.z };
    const outLength = Math.hypot(outgoing.x, outgoing.z);
    length += outLength;
  }
  const controlPoints = track.controlPoints?.length >= 3 ? track.controlPoints.map(pointXZ) : points;
  turns = 0;
  for (let index = 0; index < controlPoints.length; index += 1) {
    const previous = controlPoints[(index - 1 + controlPoints.length) % controlPoints.length];
    const current = controlPoints[index];
    const next = controlPoints[(index + 1) % controlPoints.length];
    const a = { x: current.x - previous.x, z: current.z - previous.z };
    const b = { x: next.x - current.x, z: next.z - current.z };
    const denominator = Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z);
    if (denominator > 0 && Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.z * b.z) / denominator))) >= 0.22) turns += 1;
  }
  return { length, turns, points };
}

export function trackPreviewSvg(track) {
  const { points } = measureTrackDefinition(track);
  const minX = Math.min(...points.map(({ x }) => x)), maxX = Math.max(...points.map(({ x }) => x));
  const minZ = Math.min(...points.map(({ z }) => z)), maxZ = Math.max(...points.map(({ z }) => z));
  const scale = Math.min(190 / Math.max(maxX - minX, 1), 102 / Math.max(maxZ - minZ, 1));
  const width = (maxX - minX) * scale, height = (maxZ - minZ) * scale;
  const offsetX = (220 - width) / 2, offsetY = (132 - height) / 2;
  const coordinate = ({ x, z }) => `${(offsetX + (x - minX) * scale).toFixed(2)},${(offsetY + (maxZ - z) * scale).toFixed(2)}`;
  const path = points.map(coordinate).join(' ');
  const [first, second] = points;
  const start = coordinate(first), heading = coordinate(second);
  const label = String(track.label ?? track.name ?? track.id).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  return `<svg viewBox="0 0 220 132" role="img" aria-label="Aperçu du tracé ${label}"><path d="M${path} Z" fill="none" stroke="#555b64" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/><path d="M${path} Z" fill="none" stroke="#e10600" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="M${path} Z" fill="none" stroke="#f5f5f5" stroke-opacity=".65" stroke-width=".8" stroke-dasharray="3 3"/><circle cx="${start.split(',')[0]}" cy="${start.split(',')[1]}" r="4" fill="#fff"/><path d="M${start} L${heading}" stroke="#f5f5f5" stroke-width="1.5"/></svg>`;
}
