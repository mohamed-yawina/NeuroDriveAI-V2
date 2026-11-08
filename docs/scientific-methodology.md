# Scientific methodology and result boundaries

## Purpose

The repository contains several generations of neural experiments. A score is meaningful only with its model, training protocol, track definition, physics, seeds, termination rules and reward version. This note links the authoritative phase reports and summarizes the constraints needed to interpret them.

## Historical neural model contract

- Architecture: **7 → 16 → 16 → 2**, encoded in `src/ai/neural/NeuralNetwork.js` and validated when artifacts are loaded.
- Activation: `Math.tanh` is applied at each affine layer in the historical MLP implementation.
- Inputs: five normalized track-edge sensor distances, normalized speed and signed heading error divided by π. The sensor angles are −60°, −30°, 0°, +30° and +60°; the historical arcade adapter uses a 45 m sensor range.
- Outputs: `tanh` values interpreted as normalized steering and longitudinal throttle/brake commands. The game controller clamps them to [−1, 1], then converts them to a bounded force.
- Artifacts: `public/phase8-model-a.json`, `public/phase8-model-b.json`, `public/phase8-model-c.json`; provenance is checked by `loadHistoricalBrain`.

The live `HistoricalBrainAdapter` shares the observation builder and historical network implementation but operates on a game car with arcade dynamics. It changes the evaluation context and must not be described as a replay of the research physics.

## Separation of runtimes

| Runtime | Main entry points | Integrator and use |
|---|---|---|
| Scientific training/evaluation | `VehicleDynamics`, `TrainingEnvironment`, `GeneticTrainer`, `scripts/run-*` | Renderer-free deterministic episodes, protocol-defined physics/timestep/seeds, saved research metrics. |
| F1 arcade | `RaceWorld`, `GameVehicleDynamics`, `RaceController`, `RaceSession` | Game controls and F1 rules with fixed-step updates, rendering, collisions, career and optional arcade mechanics. |
| Neural Lab demonstration | `createIntegratedNeuralDrivers`, `HistoricalBrainAdapter`, Neural `RaceSession` | Frozen historical weights evaluated in an arcade roster; telemetry is real for this session but is not scientifically comparable to the historical result tables. |

## Historical experiment summaries

### Phase 4 single-track validation

The protocol recorded in [`scientific-validation.md`](scientific-validation.md) evaluates three seeds (2026, 2027, 2028), 250 generations and 16 individuals per generation: 12,000 physical evaluations. The best saved reward averaged 1107.80 across those three seeds. The generation-250 population means were lower; across all episodes the recorded termination counts include objective, off-track, blocked and time-limit endings. The reward is not itself a success rate. The report explains the corrected lap guard, signed progress, reward audit and the failure distribution.

### Phase 7 multi-track

[`multitrack-training.md`](multitrack-training.md) records the three-seed multi-track training and its separate validation/test sets. Results differ by seed, circuit and track category. Training, validation and final-test artifacts are distinct.

### Phase 8 configurations A/B/C

The phase 8 reports preserve their protocols and outputs:

- B training used the `original`, `technical` and `fast-oval` circuits, three seeds and a separate `phase8-chicane-test` final track. The report records a 243/270 total on the three known circuits, but also 0/30 on the final track for B seed 2027.
- C used its documented 250-generation, 16-individual, three-seed multi-track protocol. On the reported known-circuit validation it completed 267/270 trials. On the final track it completed 60/90 overall; seed 2026 completed 0/30 while seeds 2027 and 2028 each completed 30/30.
- These are descriptive results for three trained networks and the stated scenario sets. They do not prove universal generalization or population-level statistical significance. The C final-track result also must not be used as an unreported model-selection metric.

Full tables, per-episode data, completion manifests, caveats and artifact paths are in [`phase8-configuration-b.md`](phase8-configuration-b.md) and [`phase8-configuration-c.md`](phase8-configuration-c.md). Read those reports before quoting additional values.

## Reproducibility and data integrity

- Seeds, physics configuration, circuits, episodes, reward terms and outputs are written to the documented JSON/CSV/checkpoint artifacts.
- Paired evaluations are only described as paired when their seed, geometry, starting conditions, timestep and termination rules match as specified by the protocol.
- Three seeds and a finite set of fixed circuits/scenarios are not enough to establish broad generalization. The held-out protocol and its limitations are summarized in [`generalization-validation.md`](generalization-validation.md).
- The repository’s SHA-256 manifest is `ultimate-edition-lot5-1-integrity.csv` and lists 175 historical model/result artifacts. Verify it before delivery; this documentation does not substitute for recalculating the hashes.
- No historical weights, results, protocol seeds or reward definitions were changed as part of Modification 28. No training was run for this documentation task.

## Interpretation rules

1. Do not compare raw fitness values across reward versions or physics engines.
2. Do not interpret an arcade finishing position as a historical scientific result.
3. Report success counts, off-track/blocking measures and uncertainty alongside reward when available.
4. Label the training, validation and held-out test circuit categories from the stored protocol metadata; do not infer them from visual familiarity.
5. State the exact seeds, sample size and limitations with any quoted result.
