import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { RaceWorld } from '../src/game/RaceWorld.js';
import { RaceLeaderboard } from '../src/game/RaceLeaderboard.js';
import { getRacePresentation } from '../src/game/RacePresentation.js';
import { RaceDiagnostics } from '../src/game/RaceDiagnostics.js';
import { CareerStore } from '../src/game/CareerStore.js';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
}

function circleTrack() {
  const radius = 60;
  const waypoints = Array.from({ length: 80 }, (_, index) => {
    const angle = (index / 80) * Math.PI * 2;
    return new Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
  });
  return { id: 'custom-circle', label: 'Test circle', userCircuit: true, halfWidth: 8, waypoints };
}

function pointAtStation(timing, station) {
  let distance = ((station % timing.path.totalLength) + timing.path.totalLength) % timing.path.totalLength;
  for (let index = 0; index < timing.path.segmentLengths.length; index += 1) {
    const length = timing.path.segmentLengths[index];
    if (distance <= length) return timing.path.waypoints[index].clone().lerp(timing.path.waypoints[(index + 1) % timing.path.waypoints.length], distance / length);
    distance -= length;
  }
  return timing.path.waypoints[0].clone();
}

function runP3Finish(speedAt) {
  const diagnostics = [];
  const world = new RaceWorld(circleTrack(), {
    carCount: 6, laps: 3, playerIndex: 2,
    onDiagnostic: (record) => diagnostics.push(record),
  });
  const player = world.cars.find((car) => car.isPlayer);
  expect(player.gridPosition).toBe(3);
  const indexById = new Map(world.cars.map((car, index) => [car.id, index]));
  const stations = new Map(world.cars.map((car) => [car.id, world.timing.progressAt(car.position).station]));
  const dt = 0.05;
  world.start();
  for (let step = 0; step < 5000 && world.director.state !== 'finished'; step += 1) {
    world.director.update(dt, world.cars);
    if (world.director.state !== 'racing') continue;
    for (const car of world.cars) {
      if (car.finished) continue;
      const speed = speedAt(indexById.get(car.id), car, step);
      const station = stations.get(car.id) + speed * dt;
      stations.set(car.id, station);
      car.position.copy(pointAtStation(world.timing, station));
      car.velocity.set(speed, 0, 0);
    }
    const events = world.timing.update(world.cars, dt);
    world.emitTimingDiagnostics(events);
    world.director.update(0, world.cars);
  }
  expect(world.director.state).toBe('finished');
  return { world, player, diagnostics };
}

function standingsFor(result) {
  const { standings } = getRacePresentation(result.world);
  return standings.map((car) => ({
    id: car.driverId ?? car.id, carId: car.id, gridPosition: car.gridPosition,
    name: car.name, color: car.color, position: car.position,
    completedLaps: car.completedLaps, finishTime: car.finishTime,
    bestLapTime: car.bestLapTime, finished: car.finished,
  }));
}

describe('P3-to-finish race integration', () => {
  it('places each grid row at its intended distance before the start line', () => {
    const world = new RaceWorld(circleTrack(), { carCount: 6, playerIndex: 2 });
    const distanceToStart = (car) => world.timing.path.totalLength - world.timing.progressAt(car.position).station;
    const rowDistances = [world.cars[0], world.cars[2], world.cars[4]].map(distanceToStart);
    expect(rowDistances[0]).toBeGreaterThan(2); expect(rowDistances[0]).toBeLessThan(6);
    expect(rowDistances[1]).toBeGreaterThan(9); expect(rowDistances[1]).toBeLessThan(14);
    expect(rowDistances[2]).toBeGreaterThan(17); expect(rowDistances[2]).toBeLessThan(22);
    expect(rowDistances[0]).toBeLessThan(rowDistances[1]); expect(rowDistances[1]).toBeLessThan(rowDistances[2]);
  });

  it.each([
    ['P1', [50, 48, 56, 46, 44, 42], 1],
    ['P2', [56, 52, 55, 48, 46, 44], 2],
    ['P3', [56, 55, 50, 48, 46, 44], 3],
  ])('starts the human in P3 and reports an actual %s result through timing, HUD snapshot and storage', (_label, speeds, expected) => {
    const run = runP3Finish((index) => speeds[index]);
    const presentation = getRacePresentation(run.world);
    expect(presentation.displayedPosition).toBe(expected);
    expect(presentation.human.gridPosition).toBe(3);
    expect(presentation.human.driverId).toBe(run.player.driverId);
    expect(presentation.human.finished).toBe(true);
    expect(presentation.human.finishTime).toBe(run.player.finishTime);

    const race = new CareerStore(new MemoryStorage()).saveRace({ trackId: 'custom-circle', results: standingsFor(run) });
    const savedPlayer = race.results.find((row) => row.id === run.player.driverId);
    expect(savedPlayer).toMatchObject({ gridPosition: 3, position: expected, status: 'finished', finishTime: run.player.finishTime });
    expect(savedPlayer.carId).toBe(run.player.id);
  });

  it('takes the lead on the final lap and displays the frozen finish order after arrival', () => {
    const run = runP3Finish((index, car) => {
      if (index === 2) return car.completedLaps >= 2 ? 60 : 53.8;
      return [55, 54.5, 0, 48, 46, 44][index];
    });
    const finalSnapshot = getRacePresentation(run.world).standings;
    expect(finalSnapshot.find((car) => car.isPlayer).position).toBe(1);
    const priorIds = finalSnapshot.map((car) => car.id);
    run.world.cars.find((car) => car.id === run.player.id).validatedProgress = -500;
    expect(RaceLeaderboard.rank(run.world.cars).map((car) => car.id)).toEqual(priorIds);
    expect(getRacePresentation(run.world, finalSnapshot).standings.map((car) => car.id)).toEqual(priorIds);
  });

  it('records race events with stable driver identity, grid slot, live/final rank and race state', () => {
    const rows = [];
    const diagnostics = new RaceDiagnostics({ enabled: () => true, logger: (_prefix, row) => rows.push(row) });
    const run = runP3Finish((index) => [50, 48, 56, 46, 44, 42][index]);
    for (const row of run.diagnostics) diagnostics.emit(row);
    diagnostics.observe(run.world, new Map([[run.player.id, 1]]));
    const playerEvents = rows.filter((row) => row.driverId === run.player.driverId);
    expect(playerEvents.some((row) => row.event === 'start-line-crossing')).toBe(true);
    expect(playerEvents.some((row) => row.event === 'lap-validated')).toBe(true);
    expect(playerEvents.some((row) => row.event === 'arrival')).toBe(true);
    expect(playerEvents.every((row) => Number.isInteger(row.gridPosition) && Number.isFinite(row.validatedProgress) && Number.isFinite(row.totalProgress))).toBe(true);
    expect(playerEvents.find((row) => row.event === 'arrival')).toMatchObject({ isHuman: true, gridPosition: 3, finalRank: 1, raceState: 'racing' });
  });

  it('awards the championship points to the same P3-grid player standing saved by the race', () => {
    const run = runP3Finish((index) => [50, 48, 56, 46, 44, 42][index]);
    const store = new CareerStore(new MemoryStorage());
    store.createChampionship({ rounds: ['original'], laps: 3 });
    const race = store.saveRace({ trackId: 'original', results: standingsFor(run) });
    const standing = store.addChampionshipResult({ roundTrackId: 'original', raceId: race.id })[0];
    const savedResult = store.read().championship.results[0].entries.find((entry) => entry.driverId === run.player.driverId);
    expect(standing).toMatchObject({ driverId: run.player.driverId, wins: 1, points: 25 });
    expect(savedResult).toMatchObject({ gridPosition: 3, position: 1, status: 'finished' });
  });
});
