import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { RaceTiming } from '../src/game/RaceTiming.js';
import { RaceLeaderboard } from '../src/game/RaceLeaderboard.js';
import { raceDistanceMeters, formatRaceGap } from '../src/game/RaceMinimap.js';
import { CareerStore } from '../src/game/CareerStore.js';
import { createGeneralizationTracks } from '../src/ai/training/GeneralizationTracks.js';
import { generateCircuit } from '../src/circuits/CircuitGenerator.js';
import { circuitToTrackDefinition } from '../src/circuits/CircuitFormat.js';

function circularTrack(radius = 40, samples = 64) {
  return { id: 'rank-test', waypoints: Array.from({ length: samples }, (_, index) => {
    const angle = index / samples * Math.PI * 2;
    return new Vector3(radius * Math.cos(angle), 0, radius * Math.sin(angle));
  }) };
}

function car(id, patch = {}) {
  return { id, name: id, color: 0xe10600, finished: false, finishTime: null, completedLaps: 0, lapTimes: [], ...patch };
}

describe('validated race ranking', () => {
  it('keeps a car that crossed the start line ahead of grid cars still behind it', () => {
    const track = circularTrack(), tangent = track.waypoints[1].clone().sub(track.waypoints[0]).normalize();
    const cars = [2, 8, 14].map((distance, index) => car(`grid-${index}`, {
      position: track.waypoints[0].clone().addScaledVector(tangent, -distance),
    }));
    const timing = new RaceTiming(track, { laps: 2 });
    cars.forEach((entry) => timing.register(entry));
    cars[0].position.copy(track.waypoints[0]).addScaledVector(tangent, 1);
    timing.update(cars, 1 / 60);

    expect(cars[0].completedLaps).toBe(0);
    expect(cars[0].station).toBeLessThan(cars[1].station);
    expect(RaceLeaderboard.rank(cars).map(({ id }) => id)[0]).toBe('grid-0');
    expect(cars[0].validatedProgress).toBeGreaterThan(0);
    expect(cars[1].validatedProgress).toBeLessThan(0);
  });

  it('ranks the player third when two validated progress values are ahead', () => {
    const ranked = RaceLeaderboard.rank([
      car('player', { isPlayer: true, completedLaps: 1, validatedProgress: 140 }),
      car('rival-1', { completedLaps: 1, validatedProgress: 165 }),
      car('rival-2', { completedLaps: 1, validatedProgress: 150 }),
    ]);
    expect(ranked.map(({ id }) => id)).toEqual(['rival-1', 'rival-2', 'player']);
    expect(ranked[2].position).toBe(3);
  });

  it('applies a pass before the line from the current validated distance', () => {
    const cars = [car('player', { completedLaps: 2, validatedProgress: 299 }), car('rival', { completedLaps: 2, validatedProgress: 298 })];
    expect(RaceLeaderboard.rank(cars)[0].id).toBe('player');
    cars[1].validatedProgress = 300;
    expect(RaceLeaderboard.rank(cars)[0].id).toBe('rival');
  });

  it('orders same-step finishers by their interpolated finish time, not array or visual order', () => {
    const ranked = RaceLeaderboard.rank([
      car('player', { isPlayer: true, finished: true, finishTime: 42.04, completedLaps: 3, validatedProgress: 300 }),
      car('rival', { finished: true, finishTime: 42.01, completedLaps: 3, validatedProgress: 300 }),
    ]);
    expect(ranked.map(({ id }) => id)).toEqual(['rival', 'player']);
  });

  it('orders a lapped car by completed laps before within-lap distance and reports the lap gap', () => {
    const leader = car('leader', { completedLaps: 2, validatedProgress: 230, totalTrackLength: 100 });
    const lapped = car('lapped', { completedLaps: 1, validatedProgress: 120, totalTrackLength: 100 });
    expect(RaceLeaderboard.rank([lapped, leader]).map(({ id }) => id)).toEqual(['leader', 'lapped']);
    expect(raceDistanceMeters(leader)).toBe(230);
    expect(formatRaceGap(lapped, leader)).toBe('+1 tour');
  });

  it('does not award progress for a projection jump unsupported by physical movement', () => {
    const track = { waypoints: [
      new Vector3(-10, 0, 0), new Vector3(10, 0, 0), new Vector3(10, 0, 10), new Vector3(0, 0, 10),
      new Vector3(0, 0, -10), new Vector3(-10, 0, -10), new Vector3(-10, 0, 0),
    ] };
    const entry = car('telemetry', { position: new Vector3(0.2, 0, 0.3) });
    const timing = new RaceTiming(track);
    timing.register(entry);
    timing.update([entry], 1 / 60);
    const before = entry.validatedProgress;
    entry.position.set(0.3, 0, 0.2);
    timing.update([entry], 1 / 60);
    expect(entry.validatedProgress).toBe(before);
  });

  it('maintains finite validated progress on a generated custom circuit', () => {
    const custom = circuitToTrackDefinition(generateCircuit(610, 'easy'));
    const entry = car('custom', { position: custom.waypoints[0].clone() });
    const timing = new RaceTiming(custom);
    timing.register(entry);
    for (let index = 0; index < 20; index += 1) {
      entry.position.copy(custom.waypoints[(index + 1) % custom.waypoints.length]);
      timing.update([entry], 1 / 60);
    }
    expect(Number.isFinite(entry.validatedProgress)).toBe(true);
    expect(entry.validatedProgress).toBeGreaterThanOrEqual(-timing.path.totalLength);
  });

  it('keeps finish order stable if rendered positions change after cars finish', () => {
    const finishers = [
      car('first', { finished: true, finishTime: 91, completedLaps: 3, station: 20, validatedProgress: 300 }),
      car('second', { finished: true, finishTime: 92, completedLaps: 3, station: 80, validatedProgress: 300 }),
    ];
    const before = RaceLeaderboard.rank(finishers).map(({ id }) => id);
    finishers[0].station = 999; finishers[1].station = 0;
    finishers[0].validatedProgress = -500; finishers[1].validatedProgress = 9999;
    expect(RaceLeaderboard.rank(finishers).map(({ id }) => id)).toEqual(before);
  });

  it('uses deterministic id ordering for exact finish-time ties', () => {
    expect(RaceLeaderboard.rank([
      car('zeta', { finished: true, finishTime: 20 }),
      car('alpha', { finished: true, finishTime: 20 }),
    ]).map(({ id }) => id)).toEqual(['alpha', 'zeta']);
  });

  it('keeps an unclassified non-finisher behind a finisher and does not invent an arrival time', () => {
    const ranked = RaceLeaderboard.rank([
      car('retired', { completedLaps: 2, validatedProgress: 190 }),
      car('arrived', { finished: true, finishTime: 100, completedLaps: 3, validatedProgress: 300 }),
    ]);
    expect(ranked.map(({ id }) => id)).toEqual(['arrived', 'retired']);
    expect(ranked[1].finishTime).toBeNull();
  });

  it('keeps championship scoring aligned with the measured arcade result order', () => {
    const memory = new Map();
    const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
    const store = new CareerStore(storage);
    store.createChampionship({ rounds: ['original'], laps: 3 });
    const ranked = RaceLeaderboard.rank([
      car('player', { isPlayer: true, finished: true, finishTime: 105, completedLaps: 3, validatedProgress: 300 }),
      car('rival', { finished: true, finishTime: 99, completedLaps: 3, validatedProgress: 300 }),
    ]);
    const race = store.saveRace({ trackId: 'original', mode: 'championship', raceCompleted: true, seasonId: store.read().championship.id, roundTrackId: 'original', results: ranked.map((entry) => ({
      id: entry.id, name: entry.name, color: entry.color, position: entry.position, completedLaps: entry.completedLaps,
      finishTime: entry.finishTime, bestLapTime: null, finished: entry.finished,
    })) });
    const standings = store.addChampionshipResult({ roundTrackId: 'original', raceId: race.id });
    expect(standings.find(({ driverId }) => driverId === 'rival').wins).toBe(1);
    expect(standings.find(({ driverId }) => driverId === 'player').wins).toBe(0);
  });

  it('retains correct ordering on a built-in circuit while preserving the historical fallback fields', () => {
    const definition = createGeneralizationTracks()[0];
    const cars = [
      car('near', { completedLaps: 0, station: 100, progress: 0.3, totalTrackLength: definition.waypoints.length }),
      car('far', { completedLaps: 0, station: 90, progress: 0.2, totalTrackLength: definition.waypoints.length }),
    ];
    expect(RaceLeaderboard.rank(cars)[0].id).toBe('near');
  });
});
