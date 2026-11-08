# Steering Behaviors — code audit

This inventory distinguishes a class available to a pedagogical scenario from a controller used by F1 RaceWorld. “Active in F1” refers to the autonomous race controller, not to every steering simulation in the repository.

## Behavior inventory

| Behavior | Implementation and calculation | Usage | Tests and limits |
|---|---|---|---|
| Seek | `src/ai/SeekBehavior.js` — `seek`; `src/ai/behaviors/SteeringBehaviors.js` — `SeekBehavior.compute`. Desired velocity points at the target with magnitude `maxSpeed`; steering is desired velocity minus current velocity, clamped to `maxForce`. | Steering Academy Seek scenario. Its force function is also used by the F1 path follower and other behaviors. F1 does not register a separate always-on Seek behavior. | `tests/steering-behaviors.test.js`, `tests/steering.test.js`. No pursuit of a human by default; the supplied target/context determines the calculation. |
| Flee | `FleeBehavior.compute`: desired velocity points from target to vehicle at `maxSpeed`, then current velocity is subtracted and the force is clamped. | Steering Academy Flee scenario; also a component of the Academy’s Leader Following scenario when a follower enters the leader’s forward zone. Not a standalone F1 RaceController behavior. | `tests/steering-behaviors.test.js`. Only used with the threat/target passed by the scenario. |
| Arrive | `ArriveBehavior.compute`: desired speed scales as `maxSpeed × min(1, distance / slowRadius)` before steering subtraction. | Steering Academy Arrive and leader role; not registered in F1 RaceController. | `tests/steering-behaviors.test.js`. The slow radius is a controller parameter; it is not a tire/brake model. |
| Pursuit | `PursuitBehavior.predictedTarget` projects target position by target velocity × a bounded prediction horizon, then uses Seek. | Steering Academy Pursuit and conditionally in F1. `RaceController.compute` activates it only when `OvertakingPlanner` supplies a pursuit target and the behavior is enabled. | `tests/steering-behaviors.test.js`, `tests/ultimate-lot1-race-coach.test.js`, `tests/phase11-race-engine.test.js`. F1 Pursuit is a bounded game-planner cue, not a proof of globally optimal overtaking. |
| Evade | `EvadeBehavior` reuses predicted target calculation and applies Flee away from that predicted position. | Steering Academy Evade and as a sub-contribution in Academy Leader Following. Not an F1 RaceController entry. | `tests/steering-behaviors.test.js`. No claim that F1 uses an Evade controller. |
| Wander | `WanderBehavior.wanderTarget` advances an angle using an injected random source and `deltaTime`; a target lies on a circle ahead of the vehicle. Seek steers toward it. | Steering Academy Wander scenario only. | `tests/steering-behaviors.test.js`; determinism depends on the random source supplied to the scenario. Not used by F1 RaceController. |
| Path Following | `src/ai/PathFollowing.js` — `project`, `pointAhead`, `analyzeCurvature`, `update`; F1 wrapper in `src/game/RaceController.js` — `RacePathFollowingBehavior.compute`. Projects position to closed path segments, predicts, chooses a lookahead target and reduces speed target with anticipated curvature. The F1 wrapper calls `seek` toward its lane-offset target. | Active in F1 and Steering Academy; also used by scientific `SteeringController` and the historical observation builder for track-relative state. | `tests/path-following-advanced.test.js`, `tests/phase11-race-engine.test.js`, `tests/steering-behaviors.test.js`. Waypoint/polyline geometry and arcade speed adaptation remain approximations of a real racing line. |
| Obstacle Avoidance | `ObstacleAvoidanceBehavior.compute` checks the current car position and two forward lookahead segments against obstacle radii plus vehicle radius, then steers away from the most threatening detected clearance. Lookahead varies with speed. | Active in F1; opponents are supplied as obstacles. Also used in Steering Academy’s obstacle and combined scenarios. | `tests/steering-behaviors.test.js`, `tests/phase11-race-engine.test.js`, `tests/ultimate-lot1-race-coach.test.js`. It is a bounded local detector, not a full motion planner. |
| Separation | `SeparationBehavior.compute` sums repulsion vectors from neighbors within radius, scaled by inverse squared distance, then clamps to `maxForce`. | Active in F1 and used in Academy flocking, combined and leader scenarios. | `tests/steering-behaviors.test.js`, `tests/phase11-race-engine.test.js`. It models local spacing only; race safety also depends on collision resolution and overtaking checks. |
| Alignment | `AlignmentBehavior.compute` averages nearby velocities and steers toward that average direction at `maxSpeed`. | Steering Academy flocking scenario. Not registered in F1 RaceController. | `tests/steering-behaviors.test.js`. No F1 alignment force is claimed. |
| Cohesion | `CohesionBehavior.compute` finds the mean position of neighbors and applies Seek toward that center. | Steering Academy flocking scenario. Not registered in F1 RaceController. | `tests/steering-behaviors.test.js`. Group-center attraction is a pedagogical flocking behavior, not an F1 formation controller. |
| Leader Following | `LeaderFollowingBehavior.compute`: leader uses Arrive; followers target a point behind the leader, can Flee from its forward zone, and add weighted Separation from other followers. | Steering Academy leader scenario only. Not registered in F1 RaceController. | `tests/steering-behaviors.test.js`. It is a local scenario, not the F1 overtaking planner. |

## Combination and force semantics

`src/ai/behaviors/BehaviorManager.js` stores named behavior instances, active state and weight. Each active behavior returns a vector; the manager multiplies each vector by its weight, sums them and clamps the result to the configured `maxForce`. It exposes raw, weighted, unclamped and clamped diagnostics. It does not schedule behaviors by priority.

In F1, `RaceController` registers Path Following, Obstacle Avoidance, Separation and Pursuit. The first three are normally enabled. Pursuit is runtime-activated only when a safe overtaking plan exposes a target. The overtaking planner additionally checks side-lane occupancy and returns the car gradually toward its normal lane.

In Academy, scenario presets compose the generic factories. This is the primary demonstration surface for Seek, Flee, Arrive, Evade, Wander, Alignment, Cohesion and Leader Following.

## Course mapping

The local PowerPoint covers the reactive-agent/steering structure on slides 10–13, Seek/Flee and Pursuit/Evade on 14–21, Arrive on 22–25, Wander on 26–28, Path Following on 29–31, obstacle avoidance on 32–36, neighborhood behaviors and Boids on 37–42, neuroevolution on 43–49 and Leader Following on 50–51. Slides 52–62 include exercises or project instructions for other cohorts; their deliverables are not treated as Casablanca G1 requirements.

The official course repository page lists example folders for Seek, Pursue/Evade, Arrival, Wander, Path Following, Obstacle Avoidance and Boids. Its README/assignment text was not retrievable in this audit, so this folder list is evidence of course material, not proof of a required G1 submission.

## Test evidence

- `tests/steering-behaviors.test.js`: force directions/magnitudes, prediction, flocking, path delegation, leader sub-forces and manager composition.
- `tests/steering.test.js`: core vehicle steering behavior.
- `tests/path-following-advanced.test.js`: path projection, lookahead, curvature and recovery cases.
- `tests/ultimate-lot1-race-coach.test.js`: live F1 diagnostics, configurations and profiles.
- `tests/phase11-race-engine.test.js`: deterministic F1 AI, safety and race progression.
- `tests/race-lab-visuals.test.js`: visualization inputs from published controller diagnostics.

These automated tests establish code behavior under their fixtures. They do not establish visual quality in a real browser or official academic compliance.
