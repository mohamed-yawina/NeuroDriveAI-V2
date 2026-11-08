# Ultimate Edition — LOT 2: Neural AI Research

## Delivered scope

This lot extends the existing Neural Racing Lab in the arcade experiment space. It does not alter the phase 4–8 training code, model parameter files, scientific reward, or published results.

### Network inspection and activations (25–26)

- The inspector builds its SVG from the selected network's declared architecture and shows model provenance.
- Large layers are sampled for drawing; their full width remains labelled.
- `NeuralNetwork.forward()` and `ExperimentalNetwork.forward()` accept an opt-in activation callback. Inference output and weights remain unchanged.
- Historical and experimental adapters retain the most recent measured activation arrays. The UI colors the diagram only after an actual inference has populated them.

### Fair comparison and generalization (27, 30)

- Each paired arcade heat uses one circuit definition, the same `GameVehicleDynamics` settings, one recorded seed, and a rotated grid slot for each driver.
- The optional generalization selection includes the built-in known, held-out, and user circuit library entries when their boundaries are usable.
- Every result retains circuit category and controller/model provenance. Historical scientific results and game-arcade results remain separate.
- Training remains an explicit user action with the existing short validation limits; no training campaign was run for this change.

### Replay and failure observations (28, 31)

- A completed headless heat can produce a bounded, versioned pose replay containing synchronized cars, counters, physics metadata, seed, and observed events.
- The reader supports pause/play, frame stepping, timeline seeking, full-course, follow-car, and side-by-side views. JSON export retains the sampled pose record.
- This is a sampled replay, not a bit-exact re-simulation or a persistent race-history service.
- Collision and off-track counters are mapped to the nearest projected path segment at the sampled event position. The analysis reports observations and explicitly does not infer causes.

### Fitness and reports (29, 32)

- The fitness selector reads the existing phase 4, phase 8 B, and phase 8 C CSV artifacts. It can display one seed or the per-generation mean across available seeds; it does not fill missing generations.
- Session-only experimental training curves remain available with their recorded seed, track, and run parameters.
- JSON and CSV exports include arcade heat measurements, training generation observations, model provenance/architecture, protocol, circuit category, and limitations. The report declares historical phase results excluded.

## Verification

- Focused tests cover real activation values and dimensions, unchanged inference output, diagram architecture/provenance shape, paired replay recording and validation, event-zone mapping, historical CSV schemas/seed aggregation, and report CSV content/limits.
- `npm.cmd test` and `npm.cmd run build` are run after integration.
- No visual browser validation is claimed when Chrome automation is unavailable.
- No new or long training run was started.

## Limits

- Replay records sampled poses rather than controller state, so exact deterministic replay is not claimed.
- Failure localization uses the nearest path projection at a sampled pose; it does not establish why an incident happened.
- Historical fitness charts depend on the shipped CSV artifacts and do not reconstruct missing values.
- Arcade evaluations do not replace the published scientific validation results.
