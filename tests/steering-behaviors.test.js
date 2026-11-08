import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SteeringVehicle } from '../src/ai/SteeringVehicle.js';
import { BehaviorManager } from '../src/ai/behaviors/BehaviorManager.js';
import {
  AlignmentBehavior, ArriveBehavior, CohesionBehavior, EvadeBehavior, FleeBehavior,
  LeaderFollowingBehavior, ObstacleAvoidanceBehavior, PathFollowingBehavior, PursuitBehavior,
  SeekBehavior, SeparationBehavior, STEERING_BEHAVIOR_FACTORIES, WanderBehavior,
} from '../src/ai/behaviors/SteeringBehaviors.js';

const point = (x, z = 0) => new Vector3(x, 0, z);
function vehicle(x = 0, z = 0, vx = 0, vz = 0, maxSpeed = 100, maxForce = 100) {
  const result = new SteeringVehicle({ position: point(x, z), maxSpeed, maxForce, mass: 1, drag: 0 });
  result.velocity.set(vx, 0, vz);
  result.forward.set(vx, 0, vz);
  if (result.forward.lengthSq() < 1e-8) result.forward.set(1, 0, 0);
  else result.forward.normalize();
  result.radius = 8;
  return result;
}
const context = (agent, extra = {}) => ({ vehicle: agent, deltaTime: 1 / 60, ...extra });

describe('Independent course steering behaviors', () => {
  it('registers every independent behavior in the Academy catalogue', () => {
    expect(Object.keys(STEERING_BEHAVIOR_FACTORIES)).toEqual([
      'seek', 'flee', 'arrive', 'pursuit', 'evade', 'wander', 'obstacleAvoidance',
      'separation', 'alignment', 'cohesion', 'leaderFollowing', 'pathFollowing',
    ]);
    for (const [name, factory] of Object.entries(STEERING_BEHAVIOR_FACTORIES)) expect(factory().name).toBe(name);
  });

  it('Seek reuses the existing desired-velocity-minus-velocity formula', () => {
    const agent = vehicle(0, 0, 0, 20);
    const force = new SeekBehavior().compute(context(agent, { target: point(20, 0) }));
    expect(force.x).toBeGreaterThan(0);
    expect(force.z).toBeLessThan(0);
  });

  it('Flee reverses desired velocity rather than reversing the Seek force', () => {
    const agent = vehicle(0, 0, 0, -20);
    const force = new FleeBehavior().compute(context(agent, { target: point(20, 0) }));
    expect(force.x).toBeLessThan(0);
    expect(force.z).toBeGreaterThan(0);
  });

  it('Arrive reaches full speed outside its slow radius and brakes inside it', () => {
    const agent = vehicle();
    const arrive = new ArriveBehavior({ slowRadius: 100 });
    const far = arrive.compute(context(agent, { target: point(200) }));
    const near = arrive.compute(context(agent, { target: point(10) }));
    expect(far.x).toBeGreaterThan(near.x);
    expect(near.length()).toBeLessThan(agent.maxForce);
    const atTarget = arrive.compute(context(agent, { target: point() }));
    expect(atTarget.length()).toBe(0);
  });

  it('Pursuit predicts position by target velocity and the selected time horizon', () => {
    const agent = vehicle();
    const pursuit = new PursuitBehavior({ predictionSeconds: 0.5 });
    const predicted = pursuit.predictedTarget(context(agent, { targetAgent: { position: point(10), velocity: point(0, 20) } }));
    expect(predicted.x).toBe(10);
    expect(predicted.z).toBe(10);
  });

  it('Evade flees from the predicted pursuer position', () => {
    const agent = vehicle();
    const evade = new EvadeBehavior({ predictionSeconds: 0.5 });
    const predicted = evade.predictedTarget(context(agent, { targetAgent: { position: point(10), velocity: point(0, 20) } }));
    const force = evade.compute(context(agent, { targetAgent: { position: point(10), velocity: point(0, 20) } }));
    expect(predicted.z).toBe(10);
    expect(force.x).toBeLessThan(0);
    expect(force.z).toBeLessThan(0);
  });

  it('Wander uses the injected random stream and keeps its circle target ahead', () => {
    const agent = vehicle(10, 20, 60, 0);
    const wander = new WanderBehavior({ circleDistance: 30, circleRadius: 15, angularJitter: 4 });
    const first = wander.wanderTarget(context(agent, { random: () => 0.75 }));
    const second = new WanderBehavior({ circleDistance: 30, circleRadius: 15, angularJitter: 4 })
      .wanderTarget(context(agent, { random: () => 0.75 }));
    expect(first.toArray()).toEqual(second.toArray());
    expect(first.x).toBeGreaterThan(agent.position.x + 20);
  });

  it('Obstacle Avoidance detects a projected collision and yields zero force when clear', () => {
    const agent = vehicle(0, 0, 100, 0);
    const avoid = new ObstacleAvoidanceBehavior({ lookAhead: 100, minimumLookAhead: 18 });
    const hit = avoid.compute(context(agent, { obstacles: [{ position: point(15), radius: 8 }] }));
    expect(avoid.diagnostics.get(agent).predictedCollision).toBe(true);
    expect(hit.length()).toBeGreaterThan(0);
    const clear = avoid.compute(context(agent, { obstacles: [{ position: point(0, 100), radius: 8 }] }));
    expect(clear.length()).toBe(0);
  });

  it('Separation repels, Alignment follows mean neighbor velocity and Cohesion seeks the group center', () => {
    const agent = vehicle(0, 0);
    const neighbors = [
      { position: point(10), velocity: point(20, 0) },
      { position: point(20), velocity: point(20, 0) },
    ];
    expect(new SeparationBehavior().compute(context(agent, { neighbors })).x).toBeLessThan(0);
    expect(new AlignmentBehavior().compute(context(agent, { neighbors })).x).toBeGreaterThan(0);
    expect(new CohesionBehavior().compute(context(agent, { neighbors })).x).toBeGreaterThan(0);
    expect(new CohesionBehavior().compute(context(agent, { neighbors: [] })).length()).toBe(0);
  });

  it('Leader Following arrives behind its leader and evades its forward zone', () => {
    const leader = vehicle(50, 50, 0, -40);
    leader.forward.set(0, 0, -1);
    const following = vehicle(50, 80);
    const behavior = new LeaderFollowingBehavior({ behindDistance: 45, forwardZoneRadius: 42 });
    const followForce = behavior.compute(context(following, { leader, neighbors: [leader, following] }));
    expect(behavior.diagnostics.get(following).role).toBe('following');
    expect(followForce.z).toBeGreaterThan(0);
    const ahead = vehicle(50, 25);
    const evadeForce = behavior.compute(context(ahead, { leader, neighbors: [leader, ahead] }));
    expect(behavior.diagnostics.get(ahead).role).toBe('evading');
    expect(evadeForce.z).toBeGreaterThan(0);
  });

  it('Path Following adapter delegates to the existing predictive path follower', () => {
    const agent = vehicle(0, 0, 30, 0);
    const behavior = new PathFollowingBehavior();
    const force = behavior.compute(context(agent, { waypoints: [point(-100, -100), point(100, -100), point(100, 100), point(-100, 100)] }));
    expect(force.length()).toBeGreaterThan(0);
    expect(force.length()).toBeLessThanOrEqual(agent.maxForce);
  });
});

describe('BehaviorManager', () => {
  const fixed = (name, vector) => ({ name, compute: () => vector.clone() });

  it('adds, retrieves, activates, deactivates, reweights, removes and composes behaviors', () => {
    const manager = new BehaviorManager({ maxForce: 10 });
    const east = fixed('east', new Vector3(6, 0, 0));
    const north = fixed('north', new Vector3(0, 8, 0));
    manager.add(east, 0.5).add(north, 0.5);
    expect(manager.getBehavior('east')).toBe(east);
    const combined = manager.getSteeringForce({});
    expect(combined.x).toBeCloseTo(3);
    expect(combined.y).toBeCloseTo(4);
    expect(combined.z).toBeCloseTo(0);
    expect(manager.lastContributions[0].weightedForce.x).toBe(3);
    manager.deactivate('north');
    expect(manager.getSteeringForce({}).toArray()).toEqual([3, 0, 0]);
    manager.activate(north);
    manager.changeWeight('east', 4);
    expect(manager.getSteeringForce({}).length()).toBeCloseTo(10);
    expect(manager.getDebugData().unclampedResultant.length()).toBeGreaterThan(10);
    expect(manager.remove(east)).toBe(true);
    expect(manager.getBehavior('east')).toBeNull();
  });

  it('composes actual Seek and Separation outputs with independent weights', () => {
    const agent = vehicle();
    const manager = new BehaviorManager();
    manager.add(new SeekBehavior(), 1);
    manager.add(new SeparationBehavior({ neighborRadius: 50 }), 200);
    const combined = manager.getSteeringForce({
      vehicle: agent, target: point(20), neighbors: [{ position: point(10), velocity: point() }], maxForce: 100,
    });
    expect(combined.x).toBeGreaterThan(0);
    expect(combined.x).toBeLessThan(100);
    expect(manager.getDebugData().contributions.map(({ name }) => name)).toEqual(['seek', 'separation']);
  });

  it('uses vehicle maxForce and rejects invalid weights and forces', () => {
    const manager = new BehaviorManager();
    manager.add(fixed('large', new Vector3(100, 0, 0)));
    expect(manager.getSteeringForce({ vehicle: { maxForce: 7 } }).length()).toBe(7);
    expect(() => manager.changeWeight('large', -1)).toThrow(RangeError);
    expect(() => manager.add(fixed('bad', new Vector3()), Number.NaN)).toThrow(RangeError);
    manager.add({ name: 'invalid', compute: () => ({ x: 1, y: 0, z: 0 }) });
    expect(() => manager.getSteeringForce({ maxForce: 10 })).toThrow(TypeError);
  });
});
