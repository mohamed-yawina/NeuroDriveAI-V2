# Ultimate Edition — LOT 4: Graphics and Immersion

## Implemented

9. **Day, sunset and night:** a race-only visual state eases between presets. Scene background, fog, hemisphere light, directional light and exposure are updated together.
10. **Dry, wet and rain:** presets transition over time. Rain enables a fixed-capacity procedural streak pool; wet/rain tint the asphalt, lower roughness and add restrained metallic highlights. Weather is visual only and does not change grip or race physics.
11. **Lighting and wet appearance:** the track material receives the wetness factor; directional/hemisphere lighting and fog adapt with time of day and weather. No external image or HDR asset is used.
12. **Particles:** one bounded 96-particle event pool emits procedural smoke/dust/water on measured player collision and off-track events. A separate fixed 96-streak rain layer follows the camera target. Resources are disposed on race-session exit.
13. **Race flags:** Green is normal race state; yellow follows observed collision/off-track counters, lasts three seconds and limits arcade speed; blue marks a driver at least one lap behind, disables that driver's defensive move; checkered is set when the director finishes.
14. **Crowd and ambience:** deterministic instanced crowd figures animate on grandstands. Incident and finish events raise crowd motion and procedural ambience intensity. No crowd audio assets are imported.
15. **TV cameras:** fixed trackside positions change every seven seconds; the shot follows the current leader. Existing chase, trackside, cockpit and overview cameras remain.
16. **Photo mode:** enter from the race HUD, orbit with pointer drag, zoom with the wheel, hide the race HUD and capture the actual WebGL canvas to PNG. Exit restores the prior camera mode.

All these controls belong to RaceSession/SceneManager and do not feed back into scientific physics or historical model evaluation. Procedural effects have fixed budgets; weather/lighting choices are visual and reversible.

## Verification

- Tests cover easing/time and weather presets, actual scene light/fog/material application, race-flag transitions and resulting speed/defense policies, camera TV/photo controls, particle bounds/cleanup, wet asphalt response, and animated crowd instances.
- Existing audio/haptics, race finish/podium, and polish tests remain in the focused validation group.
- Complete project tests/build are required after this lot.
- Chrome rendering, exported screenshot appearance, FPS and hardware audio/haptic behavior are **not claimed as verified** in this environment.

## Limits

- Wet track is a visual material state only; no rain grip, puddle collision, or aquaplaning is simulated.
- TV director chooses a changing fixed camera and the current leader; it does not detect cinematic event types such as overtakes.
- Photo capture exports the current browser canvas; browser/GPU restrictions can make `toDataURL()` unavailable.
- Crowd motion and ambience are intentionally procedural and lightweight.
