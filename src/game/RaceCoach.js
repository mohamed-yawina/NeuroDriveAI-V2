const VECTOR_COLORS = Object.freeze({
  pathFollowing: '#f5f5f5',
  obstacleAvoidance: '#ffad42',
  separation: '#57c7ff',
  pursuit: '#e10600',
  resultant: '#a9e86e',
});

const finiteVector = (vector) => vector && Number.isFinite(vector.x) && Number.isFinite(vector.z)
  ? { x: vector.x, z: vector.z, magnitude: Math.hypot(vector.x, vector.z) }
  : { x: 0, z: 0, magnitude: 0 };

/** Returns only live arcade-controller measurements; unsupported drivers return null. */
export function getRaceCoachSnapshot(car) {
  const controller = car?.controller;
  if (typeof controller?.getDecisionData !== 'function' || typeof controller?.getDecisionSummary !== 'function') return null;
  const data = controller.getDecisionData();
  const contributions = new Map((data.forces?.contributions ?? []).map((item) => [item.name, item]));
  return {
    driverId: car.id,
    driverName: car.name,
    profile: data.profile,
    defenseEnabled: data.defenseEnabled,
    decision: controller.getDecisionSummary(),
    path: data.path ? {
      segmentIndex: data.path.segmentIndex,
      distanceToPath: data.path.distanceToPath,
      curvatureRadians: data.path.curvatureRadians,
      targetSpeed: data.path.targetSpeed,
    } : null,
    plan: data.plan,
    maxForce: car.maxForce,
    behaviors: data.behaviors.map((behavior) => {
      const contribution = contributions.get(behavior.name);
      return {
        ...behavior,
        force: finiteVector(contribution?.force),
        weightedForce: finiteVector(contribution?.weightedForce),
      };
    }),
    resultant: finiteVector(data.forces?.resultant),
  };
}

/** SVG markup for real calculated force components, expressed in the X/Z race plane. */
export function renderRaceForceVectors(snapshot, radius = 31) {
  if (!snapshot) return '';
  const limit = Math.max(snapshot.maxForce, 1e-6);
  const lines = snapshot.behaviors.map((behavior) => {
    if (!behavior.runtimeActive) return '';
    const force = behavior.weightedForce;
    const scale = radius / limit;
    const x = Math.max(-radius, Math.min(radius, force.x * scale));
    const y = Math.max(-radius, Math.min(radius, -force.z * scale));
    const color = VECTOR_COLORS[behavior.name] ?? '#f5f5f5';
    return `<line x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${color}" stroke-width="1.7" marker-end="url(#race-force-arrow)"/>`;
  }).join('');
  const result = snapshot.resultant;
  const resultX = Math.max(-radius, Math.min(radius, result.x * radius / limit));
  const resultY = Math.max(-radius, Math.min(radius, -result.z * radius / limit));
  return `<svg class="race-force-plot" viewBox="-${radius + 4} -${radius + 4} ${(radius + 4) * 2} ${(radius + 4) * 2}" role="img" aria-label="Vecteurs de forces Steering calculés en temps réel"><defs><marker id="race-force-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="context-stroke"/></marker></defs><circle cx="0" cy="0" r="${radius}" fill="none" stroke="rgba(245,245,245,.18)"/><path d="M-${radius} 0H${radius} M0 -${radius}V${radius}" stroke="rgba(245,245,245,.12)"/>${lines}<line x1="0" y1="0" x2="${resultX.toFixed(2)}" y2="${resultY.toFixed(2)}" stroke="${VECTOR_COLORS.resultant}" stroke-width="2.8" marker-end="url(#race-force-arrow)"/></svg>`;
}

export function formatRaceForce(value) {
  return `(${value.x.toFixed(2)}, ${value.z.toFixed(2)}) · ${value.magnitude.toFixed(2)}`;
}
