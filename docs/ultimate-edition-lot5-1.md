# Ultimate Edition — LOT 5.1 (features 37–40)

Date: 2026-11-05

This delivery completes the local arcade replay, interactive tutorial, guided professor presentation and evidence-based pedagogy report. These additions stay in the arcade/UI layer. No training was run, and no scientific model, historical result, reward equation or experiment protocol was edited.

## 37. Replay

`src/neural-lab/ReplayProtocol.js` writes format version 2 race replays. The race recorder samples the fixed 60 Hz simulation every six fixed steps (nominally 10 Hz) and captures a final pose. Each frame contains measured pose, progress, completed laps, lap time, finish state and observed collision/off-track counters. Changes in those counters and race finish are recorded as timestamped events. The recorder bounds the sample and event counts; when its frame cap is reached it decimates the stored samples and reports the resulting nominal cadence. Career storage limits replay count (1–8) and frames per replay (300–18,000) and persists the limits locally.

`src/game/RaceReplayViewer.js` renders the saved poses in a separate Three.js scene. It provides interpolation (including shortest-arc yaw), a seekable timeline, play/pause, 0.25×–4× speed, recorded-event navigation, camera selection and followed-car selection. It does not rerun physics or reconstruct unrecorded wheel, input, audio, camera, or contact details. Version 1 imports remain readable. An absent legacy sampling cadence remains “unknown”; only known built-in geometry can be supplied from the built-in track catalogue. A custom replay without its own geometry and width is rejected for 3D playback rather than shown on invented track geometry.

JSON import is schema-validated before local persistence; export writes the replay envelope unchanged. The storage cap intentionally evicts the oldest replay after a user-configured limit is exceeded. Browser storage exhaustion is surfaced to the user. Three.js scene, car views, animation frame, event listeners and DOM are disposed when the viewer closes.

## 38. Interactive tutorial

`src/game/RaceTutorial.js` contains 18 persisted, mode-specific steps. Race input steps require measured throttle/brake/steer values; camera and pause require actual transitions; manual gearbox, gear shifts, DRS, ERS, tire compound/wear, pit completion and damage require the corresponding arcade state change or telemetry. Academy progress requires an active multi-behavior setup and a non-zero computed force. Circuit Studio reports only a successful validated save. Neural Racing Lab reports the actual inspected network architecture and sensor count. A race coach step requires a published AI decision.

The Career screen offers resume and restart. A step for another module remains pending until the player leaves the current module and resumes, so actions in the wrong mode cannot satisfy it. Progress is stored in local storage; unavailable storage degrades to session-only progress.

## 39. Professor demonstration

`src/game/ProfessorDemo.js` provides an eight-part timeline totaling 180 seconds, with previous/next, pause/resume, module-open/revisit, automatic transitions and exit. Implemented automated routes are Steering Academy (Path Following, then combined forces), F1 Racing with the actual coach panel open, Neural Racing Lab and the existing AI Lab. The overlay stays mounted across navigation and closing the demo returns to the menu.

The comparison and generalization parts open the existing Neural Racing Lab; they do not fabricate a matchup or automatically start a batch. The presenter must select/run the comparison where supported and explain the measured result. Neuroevolution opens the AI Lab without starting training. The demo reports transitions and manual actions as such. It is a timed presenter aid, not an automatically narrated or guaranteed three-minute scientific experiment; time spent navigating between modes is excluded while a transition is executing.

Slide references are based on the supplied October 2026 professor deck. Slide 60 is explicitly marked as a Nice 2024/25 mini-project context. Slide 62 and slide 59 identify other promotion contexts; these are not treated as requirements for Casablanca G1. No official Casablanca G1 grading rubric was supplied, so this report does not claim official compliance.

## 40. Pedagogical evidence matrix

The in-app **Carrière locale → Rapport de conformité pédagogique** opens the same evidence map (`src/game/ComplianceReport.js`). Tests named below are automated source-level tests; a mapping does not imply professor approval.

| Course notion | Deck slide(s) | Implementation | Test | Demonstration | Limit |
|---|---|---|---|---|---|
| Seek | 14 | `SteeringBehaviors.js`, `SeekBehavior.compute` | `steering-behaviors.test.js` | Steering Academy | Requires target/context |
| Flee | 18 | `FleeBehavior.compute` | same | Steering Academy | Requires threat target |
| Pursuit / Evade | 19–20 | `PursuitBehavior` / `EvadeBehavior` | same | Steering Academy | Prediction horizon bounded |
| Arrive | 22–24 | `ArriveBehavior.compute` | same | Steering Academy | Slow radius is configurable |
| Wander | 26–28 | `WanderBehavior.compute` | same | Steering Academy | Reproducibility needs seeded RNG input |
| Path Following / scalar projection | 29–31 | `PathFollowing.project` | `path-following-advanced.test.js` | Academy and F1 Racing | Arcade engine is separate from science engine |
| Obstacle Avoidance | 32–36 | `ObstacleAvoidanceBehavior.compute` | `steering-behaviors.test.js` | Academy and F1 Racing | Uses supplied obstacle geometry |
| Alignment | 37, 40–42 | `AlignmentBehavior.compute` | `steering-behaviors.test.js` | Steering Academy | Neighbor-radius limited |
| Cohesion | 38, 40–42 | `CohesionBehavior.compute` | same | Steering Academy | Uses measured neighbor centroid |
| Separation | 39–42 | `SeparationBehavior.compute` | same | Academy and F1 Racing | Force is bounded |
| Boids | 40–42 | `SteeringAcademy.js` · flocking preset | `steering-behaviors.test.js` | Steering Academy | Preset composes Separation, Alignment and Cohesion. |
| Leader Following | 50–51 | `SteeringBehaviors.js` · `LeaderFollowingBehavior.compute` | `steering-behaviors.test.js` | Steering Academy | Leader/follower context must be supplied. 
| BehaviorManager | 12, 31; 60* | `BehaviorManager.getSteeringForce` | `steering-behaviors.test.js` | Academy and in-race coach | Slide 60* is a prior Nice mini-project, not a G1 rule |
| Neural network | 49 (course context) | `NeuralNetwork.forward` | `neural-network.test.js` | Neural Racing Lab | Project architecture is implementation evidence, not a course mandate |
| Genetic algorithm / neuroevolution | 43–46, 49 | `GeneticTrainer` | `training.test.js` | AI Lab | This report starts no training |
| Fitness | 44, 49 | `RewardCalculator` | `training.test.js` | AI Lab/history charts | Arcade score is distinct from scientific reward |
| Generalization | 49 (application context) | held-out track evaluation | `phase8-heldout.test.js` | Neural Racing Lab | Deck illustration is not the project validation protocol |
| Model save/load | 49; 59* | `NeuralNetwork.exportJSON/fromJSON` | `neural-network.test.js` | AI Lab model selection/import/export | Slide 59* is an EMSI Marrakech 2025/26 mini-project context |
| Reproducibility | 43–46 (genetic context) | seeded trainer/checkpoint API | `training.test.js` | Historical phase documentation | Project evidence; no cohort-specific official rubric supplied |

## Validation

- `npm.cmd test`: 179 tests passed across 27 files.
- `npm.cmd run build`: passed. Vite still reports the Three.js chunk at 502.78 kB minified.
- Replay logic is tested for interpolation, angular wrap, bounded storage, v1 compatibility and unknown cadence. Tutorial gates and persistence, professor timeline controls/length and compliance evidence mappings are tested.
- No training or scientific evaluation was run.
- Browser visual run, hardware audio/haptic test and FPS/resource profiling were not performed in this session. Keep the manual checklist below for a Chrome-capable environment.

## Manual validation checklist

1. Finish an arcade race and confirm a replay appears in Career; export it, reload it, then import it.
2. Open the replay and test seek, pause/play, each speed, cameras, followed-car selection and event seeking; close it and confirm menu navigation works.
3. Import a v1 replay for a built-in track and confirm playback labels its legacy cadence unknown. Confirm an old custom replay without geometry is rejected. Scene disposal, animation cancellation, signal abort and DOM removal are unit-tested.
4. Resume the tutorial and verify wrong-mode/zero-value actions do not advance it; perform each measured action, return to menu, then verify resume and restart.
5. Run the professor timeline, use previous/next/pause, verify transitions and coach panel, manually run only desired comparisons, and exit from each module.
6. Inspect the conformance table at desktop and narrow viewport sizes. Confirm it states that no official Casablanca G1 rubric was provided.
7. Repeat menu→replay→menu and module→menu transitions while checking for duplicate canvases, continuing audio, and console errors.


## Integrity snapshot

[ultimate-edition-lot5-1-integrity.csv](ultimate-edition-lot5-1-integrity.csv) contains SHA-256 values for all 172 result files and the three public model assets. The model values match the previously documented A/B/C baseline. Eighteen historical-result hash entries referenced by the project's phase manifests also matched their embedded SHA-256 values. No files under esults/ were written during LOT 5.1; the snapshot is recorded in docs/ so it can be rechecked after tests/build.
