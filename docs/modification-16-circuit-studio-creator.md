# Modification 16 — Circuit Studio Creator & Templates

Date: 8 November 2026

## 1. Architecture

The creator stays inside `CircuitStudio` and reuses the existing circuit v1 format, `validateCircuitFormat`, `CircuitLibrary`, `circuitToTrackDefinition`, `Track`, and the existing circuit-test navigation into `RaceSession`. New templates are generated as ordinary validated circuit definitions; they are not a second track format or simulation engine. A free-draw draft becomes a race circuit only after it is closed and passes the same validator as imported and saved tracks.

## 2. Templates

The gallery offers five deterministic, validated models with previews sampled from the actual control-point spline:

| Model | Indicative level | Geometry source | Validation |
|---|---|---|---|
| Oval | Beginner | Easy seeded course | Pass |
| S flow | Intermediate | Medium seeded course with a validated lateral S warp | Pass |
| Technical | Advanced | Hard seeded course | Pass |
| Speed | Intermediate | Easy seeded course stretched into a fast layout | Pass |
| Grand Prix | Advanced | Medium seeded course with a validated multi-turn warp | Pass |

Each is checked by the existing geometry and six-car grid validator before it enters the gallery. A figure-eight is intentionally shown as unsupported: its crossing would conflict with track overlap/collision and lap-progress rules, so validation is not bypassed.

## 3. Creator entry and guided flow

Opening Circuit Studio now presents **Create your F1 circuit** with three direct choices: choose a template, draw a circuit, or open saved circuits. The advanced editor remains available. The header also has a three-step Choose / Customize / Play guide. Choosing a template opens the normal editor; the play step uses the existing real race test.

The template gallery and saved-circuit library use track thumbnails built from their real coordinates. Saved cards show name, indicative difficulty/provenance, validation state, and calculated length. They offer Edit, Play, Duplicate, and confirmed Delete. JSON import/export and local persistence remain available. Replacing an existing saved circuit now requires confirmation.

## 4. Free drawing

The free-draw entry creates an empty, open draft and a top-down grid. Clicks place points directly; clicking an existing point selects it for dragging. The view is held steady while drawing, with wheel zoom, Shift/middle/right-drag pan, Delete, undo/redo, Clear drawing, and close-loop controls. The line-start index is updated to a safe six-car grid candidate when available. Fewer than ten points, an open loop, unsafe grid, tight turns, intersections, or other existing validator failures keep race and lab launch disabled and show the validator's detailed issue.

Once valid, the same save and runtime conversion path used by templates sends the exact current definition to RaceWorld. Existing circuit-test navigation returns to the editor with the circuit snapshot. Arcade lab tests do not write championship results; the UI labels these as arcade demonstrations and states they are not comparable to historical scientific results.

## 5. Professor demonstration and validation

The valid-circuit panel now presents Steering AI, Neural AI, and F1 test entry points. These route to the existing integrated Steering Lab / Neural Lab / F1 session using the current circuit definition; no Steering forces are synthesized by Circuit Studio. The global circuit validator is reused, with a short user-facing message mapped from its detailed error and its existing issue list retained for location/context.

## 6. Tests and validation

Added tests validate all five templates, their spline thumbnails, their six-car starting grids, and a free-drawn circuit's save/load/runtime identity. The free-drawn oval integration test advances the five AI opponents through three laps in RaceWorld.

- Targeted Circuit Studio tests: **25 passed** across 2 files.
- `npm.cmd test`: **263 passed**, 35 test files.
- `npm.cmd run build`: **passed**; Vite retains its chunk-size warning for the 509 kB Three.js bundle.
- Scientific manifest: **175/175 SHA-256 entries match**.
- Browser visual test: unavailable in this environment; no visual validation is claimed.
- Scientific model/result files are not referenced by the new code. SHA-256 manifest verification is run as part of final validation.

## 7. Manual Chrome checklist

1. Open Studio and select each of the five templates; inspect its miniature, edit points, and confirm it stays valid.
2. Open Draw my circuit; place at least ten points, drag a point, zoom/pan, undo/redo, close the loop, and inspect validation feedback.
3. Save the free-drawn circuit, reload the page, reopen it from My Circuits, duplicate it, export/import JSON, and confirm replacement/deletion prompts.
4. Start **Test F1 Racing** and verify the exact custom track, six cars, minimap, laps, and AI; return and confirm the editor circuit remains intact and career/championship records are unchanged.
5. Start Steering AI and Neural AI from the same valid circuit and confirm both integrated labs use that circuit and identify arcade results as non-historical.
6. Confirm the figure-eight card is disabled with its crossing limitation explained; verify small-screen gallery, editor, and library access.

## 8. Limits

Automated tests cover template validity, grid placement, library round-trip, and three-lap AI completion for the free-draw geometry. Browser presentation, pointer ergonomics, mobile layout, and the end-to-end visual menu-to-lab return cycle remain for manual Chrome verification. The figure-eight is not supported by the current crossing and lap-progress validation.

### Final validation

The five templates and the free-drawn three-lap AI integration passed. The scientific SHA-256 manifest remained unchanged. There was no browser automation available, so the manual Chrome checklist above remains outstanding.
