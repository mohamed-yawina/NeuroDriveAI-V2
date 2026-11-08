# Modification 15 — Circuit Studio Ultimate

Date: 8 November 2026

## Resume

Circuit Studio now uses a full-viewport Racing Red editor layout with a compact tool rail, central track view, tabbed inspector, and status bar. Track definitions, validation, browser-local library persistence, and the existing race-test launcher remain the same Modification 14 systems.

## 1. Scroll diagnosis

The Studio container used `overflow:auto`, while its content grid had `height:calc(100% - 72px)` and `min-height:600px`. On shorter desktop viewports, the header, grid padding, and minimum grid height exceeded the available height. The Studio then exposed its own vertical scrollbar and reduced the visible canvas area, which made the track look cut off. The 2D canvas also had no wheel handler, so wheel input could scroll that container instead of controlling the editor.

No `scrollIntoView()`, autofocus, or programmatic page scrolling is used by Circuit Studio. At the app level `html`, `body`, and `#app` already have hidden overflow. The change removes the Studio's desktop overflow and the grid minimum-height conflict, and consumes wheel input on both the 2D editor and 3D viewport. The editor uses `position:fixed` and a `100dvh` grid; the inspector and tool rail scroll independently. On small screens the Studio workspace itself can scroll so every panel remains reachable.

This diagnosis is supported by the CSS and source checks, not by a live Chrome reproduction. No browser automation was available in this environment, so the absence of visual scrolling still needs manual Chrome confirmation.

## 2. UI and editing changes

- Fixed top bar with circuit validity, undo, redo, save, race-test, and menu-return actions.
- Left tool rail for point editing, loop control, and view controls.
- Large central viewport with a complete 2D fit on entry and an automatically attempted 3D preview using the same `TrackDefinition` and `SceneManager.Track` as the game. If WebGL initialization fails, the editor retains the 2D view and exposes an error message.
- The 3D camera fit uses the control-point bounds, track width, viewport aspect ratio, and camera field of view, with margin for the rendered track edge objects. Recenter and aerial view remain available; 3D wheel zoom is relative to the calculated fit distance.
- Tabbed Circuit, Geometry, Generator, Library, and Validation inspector. The Geometry tab exposes the start-line point and editable X/Z values for the selected control point.
- Bottom status bar reports control-point count, view mode, and the existing validator's length/turn/grid summary.
- Wheel zoom in 2D, point selection, drag movement, nearest-segment insertion projected onto the segment, undo/redo, and keyboard shortcuts. Escape now deselects; Delete removes the selected point. Keyboard shortcuts are ignored in inputs and editable fields.
- Reset asks for confirmation when the browser confirmation API is available. Existing save, load, rename-via-save, duplicate, confirmed delete, JSON import/export, and local persistence actions are retained.
- Racing Red, larger controls, visible focus states, labels/tooltips, disabled states, and a responsive inspector.

## 3. Geometry and game integration

The editor continues to persist the v1 circuit schema and validates it through `validateCircuitFormat`. The 3D preview uses `circuitToTrackDefinition()` and `SceneManager`; the existing test button passes a snapshot plus that same runtime definition to the existing `RaceSession` launcher. No built-in circuit fallback was added. Circuit geometry, the Modification 14 fidelity tolerance, race physics, AI, model files, and historical results were not changed by this modification.

## 4. Tests and build

Added tests cover aspect-aware bounds/camera fit, empty bounds rejection, wheel default prevention and zoom limits, full-screen/independent-scroll CSS contracts, and insertion projected onto the nearest segment. Existing Studio navigation, runtime geometry, user-circuit persistence, six-car grid, and lap tests continue to pass.

- `npm.cmd test`: **261 tests passed across 35 files**.
- `npm.cmd run build`: **passed**. Vite still reports its existing Three.js chunk-size warning (509 kB); this modification did not change Three.js bundling.
- Scientific manifest: **175/175 SHA-256 entries match** (`docs/ultimate-edition-lot5-1-integrity.csv`).
- Browser/WebGL visual check: **not performed**; Chrome automation was unavailable.

## 5. Files changed for Modification 15

- `src/circuits/CircuitStudio.js`
- `src/style.css`
- `tests/circuit-studio.test.js`
- `docs/modification-15-circuit-studio-ultimate.md`

The working tree already contained unrelated uncommitted Modification 14 files before this task; they were preserved and are not included as Modification 15 changes.

## 6. Chrome checklist

1. Open Circuit Studio on a desktop window shorter than 672 px and confirm the browser page and Studio do not scroll vertically.
2. Confirm the circuit is fully visible at entry in 2D; if WebGL initializes, confirm the 3D fit includes the entire track and barriers.
3. Use the wheel over both views; confirm it zooms the view without moving the page.
4. Resize to wide, narrow, and portrait dimensions; use Recenter/F and confirm the circuit remains framed.
5. Select and drag a point, edit its X/Z values, insert a point near a segment, undo, redo, delete, and deselect with Escape.
6. Switch each inspector tab and confirm its fields remain reachable; test a small-screen layout by scrolling the Studio workspace.
7. Save, rename, duplicate, reload, import, export, and delete a user circuit; confirm reset asks before replacing the current edit.
8. Use **Tester F1 Racing**, verify the current circuit and six cars appear, then return and confirm the edit remains. Confirm the test does not change career/championship records.

## 7. Limits

The geometric camera-fit math and CSS contracts are automated; the rendered fit depends on actual browser viewport measurements and still needs Chrome confirmation. Point editing remains in the 2D editor view; the 3D view is an orbitable preview of the same runtime track. On devices without WebGL, the 2D editor remains available. A full browser interaction test, FPS measurement, and manual check of the saved-circuit race cycle remain outstanding.
