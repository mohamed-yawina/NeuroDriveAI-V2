export function createMinimapProjector(waypoints, width, height, padding = 16) {
  if (!Array.isArray(waypoints) || waypoints.length < 3 || !(width > padding * 2) || !(height > padding * 2)) return null;
  const xs = waypoints.map((point) => point.x), zs = waypoints.map((point) => point.z);
  if (xs.some((value) => !Number.isFinite(value)) || zs.some((value) => !Number.isFinite(value))) return null;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 1), spanZ = Math.max(maxZ - minZ, 1);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ);
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetY = (height - spanZ * scale) / 2 - minZ * scale;
  return { scale, offsetX, offsetY, project: (point) => ({ x: offsetX + point.x * scale, y: offsetY + point.z * scale }) };
}

export function raceDistanceMeters(car) {
  if (Number.isFinite(car?.validatedProgress)) return Math.max(0, car.validatedProgress);
  const length = car.totalTrackLength ?? 0;
  return Math.max(0, (car.completedLaps ?? 0) * length + (car.station ?? (car.progress ?? 0) * length));
}

export function formatRaceGap(car, leader) {
  if (!car || !leader || car.id === leader.id) return 'LEADER';
  if (car.finished && leader.finished && Number.isFinite(car.finishTime) && Number.isFinite(leader.finishTime)) {
    return `+${Math.max(0, car.finishTime - leader.finishTime).toFixed(2)} s`;
  }
  const gap = Math.max(0, raceDistanceMeters(leader) - raceDistanceMeters(car));
  const length = Number.isFinite(car.totalTrackLength) && car.totalTrackLength > 0 ? car.totalTrackLength : leader.totalTrackLength;
  if (Number.isFinite(length) && length > 0 && gap >= length) {
    const laps = Math.floor(gap / length);
    return `+${laps} tour${laps > 1 ? 's' : ''}`;
  }
  return `+${gap.toFixed(0)} m`;
}
