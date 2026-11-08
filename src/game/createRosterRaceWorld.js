import { RaceWorld } from './RaceWorld.js';
import { GameVehicleDynamics } from './GameVehicleDynamics.js';

/** Creates a deterministic AI-only race from controller factories, shared by UI and headless runs. */
export function createRosterRaceWorld(track, drivers, { laps = 1, dynamics = new GameVehicleDynamics(), seed = 1, onDiagnostic = null } = {}) {
  if (!Array.isArray(drivers) || drivers.length < 2 || drivers.length > 8) throw new RangeError('A roster race supports 2 to 8 drivers.');
  const cars = RaceWorld.createGrid(track, { carCount: drivers.length, playerIndex: -1 });
  cars.forEach((car, index) => {
    const driver = drivers[index];
    if (!driver?.name || typeof driver.createController !== 'function') throw new TypeError(`Invalid race controller for roster entry ${index}.`);
    car.name = driver.name;
    car.driverId = driver.id ?? driver.name;
    car.controller = driver.createController(track, { car, dynamics });
  });
  const world = new RaceWorld(track, { carCount: cars.length, laps, playerIndex: -1, cars, dynamics, trackHalfWidth: track.halfWidth ?? 8.2, onDiagnostic });
  world.experimentSeed = seed >>> 0;
  return world;
}
