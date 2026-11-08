# Phase 6 - Robustness and generalization validation

## Protocol and artifacts

Run `npm run validate:generalization` after the phase 4 training artifact exists. The script reads the three saved best networks from `results/phase4-scientific-validation.json`; it does not run the trainer, alter weights, or change reward weights. It evaluates each frozen network on 30 scenarios on each of three circuits. Each Steering episode is run once per scenario and paired with each of the three neural networks under the same start position, heading perturbation, initial speed, physics step, termination rules, and reward calculator. Neural inference uses a copy of the saved network; every before/after weight snapshot was identical.

Scenario positions are stratified continuous arc-length positions on the Catmull-Rom centerline, rather than waypoint-edge training spawns. The fixed scenario seed is 93001. Initial heading perturbations span -15 to +15 degrees and initial speeds are balanced across 0, 7, 14, and 21 m/s. Episodes use the existing `VehicleDynamics`, a 1/30 s fixed step, a 60 s time limit, 3.5 s continuous off-track termination, and 4 s blocked termination. Off-track duration in the table is cumulative across the episode; the termination threshold is continuous. The original circuit geometry is retained; two held-out variants are generated for this protocol.

| Circuit | Waypoint polyline length | Mean turn-angle / meter |
|---|---:|---:|
| Original training circuit | 491.16 m | 0.01279 rad/m |
| Technical, tighter turns | 415.70 m | 0.01528 rad/m |
| Fast elongated circuit | 525.75 m | 0.01195 rad/m |

The raw, scenario-level paired results and per-circuit/controller summaries are in [the JSON artifact](../results/phase6-generalization-validation.json) and [the CSV artifact](../results/phase6-generalization-validation.csv). The CSV has 270 rows: 30 scenarios x three saved neural networks x three circuits; each row includes the matched Steering result.

## Lap validation audit

The phase 4 recorder accumulated signed progress from a randomized spawn until a validated crossing. A partial first trip to the line could therefore remain in the next lap window, and the `lapTime` value at a finish was only the crossing frame. The evaluator exposed this because successful laps were reported as 0.033 s.

The recorder now treats every forward start-line crossing as a lap-window boundary. A crossing is credited only if the signed progress since the preceding crossing (or initial spawn) is at least 95% of the track polyline length. On every forward crossing it resets that window and the current lap clock, including an uncredited first partial crossing. It stores both the last start-line interval and the last validated lap time. The required distance is reported separately from cumulative signed progress and absolute along-track distance. Regression tests cover initial partial laps, reset behavior, and a known 1.25 s lap interval under 0.25 s integration steps.

The recorder change applies to future simulations and training as well as this evaluator. The previous phase 4 JSON/CSV remain intact as historical artifacts produced by the earlier lap-clock behavior. Reward weights and reward terms were not changed for this evaluation.

## Observed results

Each row below is 30 paired scenarios per controller/network on that circuit. Completion intervals are 95% Wilson intervals. Continuous per-controller intervals in the JSON use Student-t intervals with a Cornish-Fisher approximation of the t quantile; the JSON also contains seeded percentile-bootstrap intervals for paired differences and conservative Bonferroni Wilson difference intervals for paired completion rates. Lap time is conditional on successful episodes, and its `n` is the number of completed laps.

| Circuit | Controller / network seed | Completed laps | Mean progress (SD) | Successful lap time | Mean off-track events | Mean off-track time | Mean reward |
|---|---|---:|---:|---:|---:|---:|---:|
| Original | Steering | 30/30 (100%; CI 88.6-100%) | 704.81 m (142.45) | 23.41 s (n=30) | 1.77 | 0.80 s | 880.60 |
| Original | Neural 2026 | 25/30 (83.3%; CI 66.4-92.7%) | 593.12 m (283.84) | 23.88 s (n=25) | 0.17 | 0.59 s | 748.28 |
| Original | Neural 2027 | 30/30 (100%; CI 88.6-100%) | 704.47 m (142.40) | 24.24 s (n=30) | 0 | 0 s | 889.92 |
| Original | Neural 2028 | 30/30 (100%; CI 88.6-100%) | 705.11 m (142.36) | 24.06 s (n=30) | 0 | 0 s | 889.65 |
| Technical | Steering | 30/30 (100%; CI 88.6-100%) | 610.26 m (121.25) | 20.13 s (n=30) | 4.27 | 5.39 s | 757.18 |
| Technical | Neural 2026 | 0/30 (0%; CI 0-11.4%) | 236.00 m (86.49) | None | 1.10 | 3.63 s | 218.08 |
| Technical | Neural 2027 | 0/30 (0%; CI 0-11.4%) | 221.89 m (114.51) | None | 1.03 | 3.60 s | 214.12 |
| Technical | Neural 2028 | 0/30 (0%; CI 0-11.4%) | 175.58 m (75.97) | None | 1.00 | 3.57 s | 160.71 |
| Fast oval | Steering | 30/30 (100%; CI 88.6-100%) | 770.45 m (154.60) | 24.56 s (n=30) | 2.27 | 2.37 s | 940.00 |
| Fast oval | Neural 2026 | 0/30 (0%; CI 0-11.4%) | 312.20 m (156.54) | None | 1.00 | 3.57 s | 302.84 |
| Fast oval | Neural 2027 | 0/30 (0%; CI 0-11.4%) | 353.07 m (149.57) | None | 1.00 | 3.57 s | 340.86 |
| Fast oval | Neural 2028 | 0/30 (0%; CI 0-11.4%) | 298.61 m (153.76) | None | 1.00 | 3.57 s | 285.48 |

The original circuit paired completion difference for network 2026 was -16.7 percentage points (5 Steering-only completions, none Neural-only); the conservative 95% interval for the difference is -36.4 to +7.8 points. Networks 2027 and 2028 each matched Steering completion on all 30 original-circuit scenarios. On both held-out circuits, every paired scenario was completed by Steering and ended off-track for all three neural networks: paired completion difference -100 points, conservative interval -100 to -71.3 points. Paired mean progress differences were also strongly negative on the held-out circuits; the per-seed bootstrap intervals are preserved in JSON.

## Interpretation and limitations

The trained policies are **specialized to their training circuit** under this test. All three networks retain strong completion on the original circuit for these starts and speed/heading shifts (one at 83.3%, two at 100%), but all three complete 0/30 laps on each unseen circuit. Steering completes 30/30 on both variants. The evidence does not support a claim that the neural driver generalizes to different track geometry.

The circuit changes and initial-condition perturbations were combined in this design, so these data do not isolate whether geometry, heading, or speed shift caused each failure. A follow-up factorial experiment should hold two factors fixed while varying the third. Thirty scenarios per network/circuit give useful diagnostic estimates but wide completion intervals; zero observed completions does not imply a population probability exactly zero. The three networks share one training setup and the Steering baseline is reused across the three network comparisons, so network comparisons are dependent. Intervals are conditional on these deterministic scenario samples and three circuits, not evidence about all possible tracks. Progress is cumulative signed along-track distance from spawn; it is intentionally distinct from the 95% validation distance and the time of a completed start-line interval.
