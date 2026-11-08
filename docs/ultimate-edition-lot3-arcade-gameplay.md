# Ultimate Edition — LOT 3: Advanced Arcade Gameplay

## Scope and isolation

All new systems are in `src/game/` and are applied only by `GameVehicleDynamics` and `RaceWorld`. Each car owns a `RaceCarMechanics` instance. The mechanisms are disabled by default and can be enabled from the F1 race panel. The scientific `src/physics/` engine, its reward equations, training protocol, model files and results were not changed.

## Features delivered

1. **Formation lap:** F1 Racing can autonomously run a speed-limited lap before the grid start. Formation timing and incident counters are reset when the staggered grid is rebuilt. A 120-second safety limit returns the cars to the grid if any car fails to complete the lap.
2. **Gearbox:** eight arcade gears, a calculated RPM display, automatic speed-based shifting or manual E/Q and HUD shifting. A short procedural shift sound plays when a manual change is accepted.
3. **DRS:** a zone is derived from the longest waypoint run whose heading changes remain below the straight threshold. The driver must request DRS, be in that zone, and have a forward rival within one second. Active DRS reduces arcade drag and animates the rear flap.
4. **ERS:** braking recovers charge; deployment consumes it and temporarily increases arcade acceleration. Empty charge prevents further deployment.
5–6. **Tyres:** Soft, Medium and Hard use distinct grip, thermal targets and wear rates. Temperature and wear evolve from speed, steering and braking and feed arcade tyre grip. The compound is chosen for the next pit service.
7. **Pit service:** a temporary lane is built from the entry position, local track tangent and track width. The player is guided to a service point at 12 m/s maximum, held stationary for three seconds, receives the selected compound and repairs, then exits and merges. A dashed lane guide is disposed with the session. The lane is generated per stop, not saved as permanent track infrastructure.
8. **Damage:** vehicle and track-limit impacts increase bounded damage. Damage reduces arcade speed and grip; pit service repairs it. A HUD percentage displays the measured state.

## Controls

- Enable **Mécaniques arcade** in the race HUD.
- Choose automatic or manual gearbox. In manual mode, use **E/Q** or the plus/minus controls.
- Use **F** or the DRS button to request DRS; activation still requires the displayed zone and gap conditions.
- Hold **V** or enable the ERS control to deploy charge.
- Select the compound to fit at the next pit service, then request a pit stop while a race is active.

## Validation and limits

- Tests verify formation reset/countdown and timeout, manual/automatic gears, derived DRS and eligibility, ERS consumption/recuperation, tyre wear/thermal grip, pit route/service duration, damage/repair, and unchanged base arcade motion when the optional mechanics are disabled.
- Phase 11 race-engine and navigation tests remain part of the complete suite.
- No long training run was launched. No browser visual validation or FPS measurement is claimed.
- DRS zones are geometric heuristics based on waypoint heading; they are not official F1 circuit timing data.
- The pit path is a gameplay service route generated around the current entry point. It is not a separately modelled physical pit lane in the track asset.
- Vehicle dynamics are deliberately simplified arcade mechanics. They do not alter historical physics or scientific evaluation.
