# Ultimate Edition LOT 5 — Local career foundations

## Implemented

- `CareerStore` uses a versioned localStorage envelope. It stores a local driver name/livery/preferences, up to 40 completed local races, and at most two replays. Invalid schemas and invalid lap standings are rejected; storage quota/unavailability is reported by a failed write result.
- RaceSession records final rank, lap/finish time, collisions, off-track events and seed when the race director finishes. It samples all vehicle poses at 2 Hz while racing and persists an arcade replay with circuit geometry. It never writes scientific result folders or model files.
- The Career panel shows a three-round local schedule (Azur, Technical, Fast Oval), permits explicit registration of an already recorded matching result, and computes the standings using the documented F1-style 25/18/15/12/10/8/6/4/2/1 points table. Duplicate and mismatched rounds are rejected.
- Local best-lap records are computed from saved race results and keyed by track and mode. History can export the recorded replay as JSON. A pose-sampled playback view has a timeline and moving car markers.
- The interactive tutorial advances only when the requested keyboard action is detected: throttle, brake, steering, camera and pause.
- The compliance panel reports relevant lecture slide ranges and explicitly says that Casablanca G1-specific assessment requirements are not established by the course file alone.

## Partial / limits

- Replay is a bounded 2 Hz pose sample, not a deterministic re-simulation or full per-frame capture. It contains up to 1,800 samples and stores at most two races with replay data. Timeline playback is 2D and no camera switching is available during playback.
- The tutorial covers the core keyboard controls only; it does not yet teach DRS, ERS, pit stops, behavior-vector overlays or neural experiments.
- The teacher demo is a presenter checklist with a three-minute target, not an automated timed 3-minute sequence. It does not navigate modes on the user's behalf.
- Compliance text is a cautious overview, not a signed academic compliance determination.
- Browser visual validation, localStorage quota testing in a real browser, and long-duration replay playback were not performed.

## Tests

`tests/ultimate-career-store.test.js` covers profile validation, result/replay storage limits, local records, championship points and duplicate/mismatched rounds, storage/schema failure, and tutorial command sequencing. Project-wide tests and production build are required for the delivery validation.

## Protected model integrity check

The SHA-256 values of the three selected historical model assets still match the project baseline recorded before the Ultimate Edition changes:

- `public/phase8-model-a.json`: `61E92247781B62E898284F6389C7E0F4127498B0BEC014B2DDAFBC80533ED9ED`
- `public/phase8-model-b.json`: `B56B6A505473C9488C338328C572E1202E3177141E0E8D18F5ECA06FD115918C`
- `public/phase8-model-c.json`: `B640686C1897D2EB9983D562458FE06F301ACA3F51D820FC4DCABD078DCF5C88`

No training was run, and no scientific results file was written by these lots.


## Superseded by LOT 5.1

The partial feature notes above describe the previous LOT 5 delivery and are superseded for features 37–40 by [ultimate-edition-lot5-1.md](ultimate-edition-lot5-1.md). The current replay uses version 2 and sampled 3D pose playback; legacy cadence stays unknown when absent. The tutorial spans four modes, the professor demonstration is a timed route presenter, and the compliance table is evidence-based without claiming official G1 certification.
