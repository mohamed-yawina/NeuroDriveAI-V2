import { describe, expect, it } from 'vitest';
import { CareerStore, CAREER_KEY, CAREER_RECOVERY_KEY, CHAMPIONSHIP_POINTS } from '../src/game/CareerStore.js';
import { createRaceReplay } from '../src/neural-lab/ReplayProtocol.js';
import { RaceTutorial, TUTORIAL_CHAPTERS, TUTORIAL_KEY } from '../src/game/RaceTutorial.js';

class MemoryStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, value); }
}
function replay() {
  return createRaceReplay({ id: 'original', label: 'Azur' }, [{ id: 'd1', name: 'Driver 1' }, { id: 'd2', name: 'Driver 2' }], {
    seed: 12, physics: { fixedStep: 1 / 60 }, frames: [{ step: 30, time: 0.5, cars: [{ id: 'car-1', x: 1, z: 2, yaw: 0, progress: 0 }, { id: 'car-2', x: 3, z: 4, yaw: 0, progress: 0.1 }] }],
  });
}
const result = (id, name, position, bestLapTime) => ({ id, name, position, completedLaps: 3, finishTime: position * 100, bestLapTime, collisions: 1, offTrackEvents: 0, finished: true });
const championshipRace = (store, values) => store.saveRace({ ...values, mode: 'championship', raceCompleted: true, seasonId: store.read().championship.id, roundTrackId: values.trackId });

describe('Ultimate local career persistence', () => {
  it('advances the interactive tutorial only after a measured game input and persists progress', () => {
    const storage = new MemoryStorage();
    const tutorial = new RaceTutorial(storage);
    expect(tutorial.observe('throttle', { mode: 'race', value: 0 }).advanced).toBe(false);
    expect(tutorial.observe('throttle', { mode: 'race', value: 1 })).toMatchObject({ advanced: true, index: 1 });
    expect(new RaceTutorial(storage).index).toBe(1);
    expect(JSON.parse(storage.getItem(TUTORIAL_KEY)).index).toBe(1);
  });  it('validates local profile data and keeps preferences without a remote account', () => {
    const store = new CareerStore(new MemoryStorage());
    expect(store.setProfile({ name: 'Ada', livery: '#00aa11', preferences: { camera: 'chase' } })).toMatchObject({ name: 'Ada', livery: '#00aa11', preferences: { camera: 'chase' } });
    expect(store.setProfile({ livery: 'javascript:bad' }).livery).toBe('#00aa11');
  });
  it('records real standings and replay, limits retained data, and calculates local records', () => {
    const store = new CareerStore(new MemoryStorage(), { historyLimit: 2, replayLimit: 1 });
    const race = store.saveRace({ id: 'r1', trackId: 'original', seed: 4, results: [result('d1', 'Ada', 1, 80), result('d2', 'Babbage', 2, 82)], replay: replay() });
    expect(race.results[0].position).toBe(1);
    expect(store.records()[0]).toMatchObject({ trackId: 'original', bestLapTime: 80, driver: 'Ada' });
    expect(store.read().replays[0].replay.format).toBe('neurodrive-arcade-race-replay');
  });
  it('imports and exports a validated replay under the configured local storage cap', () => {
    const store = new CareerStore(new MemoryStorage(), { replayLimit: 1, maxReplayFrames: 300 });
    const first = store.importReplay(replay());
    expect(store.exportReplay(first).version).toBe(2);
    const second = store.importReplay(replay());
    expect(() => store.exportReplay(first)).toThrow(RangeError);
    expect(store.exportReplay(second).seed).toBe(12);
    expect(() => store.importReplay({ format: 'bad' })).toThrow(TypeError);
  });
  it('calculates championship points from a matching recorded schedule round and rejects duplicates', () => {
    const store = new CareerStore(new MemoryStorage());
    championshipRace(store, { id: 'r1', trackId: 'original', results: [result('d1', 'Ada', 1, 80), result('d2', 'Babbage', 2, 82)] });
    expect(store.addChampionshipResult({ roundTrackId: 'original', raceId: 'r1' })[0]).toMatchObject({ driverId: 'd1', points: CHAMPIONSHIP_POINTS[0], wins: 1 });
    expect(() => store.addChampionshipResult({ roundTrackId: 'original', raceId: 'r1' })).toThrow();
    expect(() => store.addChampionshipResult({ roundTrackId: 'technical', raceId: 'r1' })).toThrow();
  });
  it('creates a validated local season while archiving the prior schedule and keeping its existing results', () => {
    const storage = new MemoryStorage();
    const store = new CareerStore(storage);
    championshipRace(store, { id: 'old-round', trackId: 'original', results: [result('d1', 'Ada', 1, 80)] });
    store.addChampionshipResult({ roundTrackId: 'original', raceId: 'old-round' });
    const season = store.createChampionship({ rounds: ['technical', 'fast-oval'], laps: 5, difficulty: 'aggressive', weather: 'rain', formationLap: true });
    expect(season).toMatchObject({ rounds: ['technical', 'fast-oval'], laps: 5, difficulty: 'aggressive', weather: 'rain', formationLap: true });
    const state = store.read();
    expect(state.championshipHistory).toHaveLength(1);
    expect(state.championshipHistory[0].results).toHaveLength(1);
    expect(store.nextChampionshipRound(state).trackId).toBe('technical');
    expect(() => store.createChampionship({ rounds: ['user-track'] })).toThrow(TypeError);
    expect(() => store.createChampionship({ rounds: ['original'], laps: 4 })).toThrow(RangeError);
  });
  it('unlocks rounds in order, scores only finishers and retains nonfinishers at zero points', () => {
    const store = new CareerStore(new MemoryStorage());
    store.createChampionship({ rounds: ['original', 'technical'] });
    const results = [
      { ...result('car-1', 'Ada', 1, 80), color: 0xe10600 },
      { ...result('car-2', 'Babbage', 2, 81), color: 0x3366ff },
      { ...result('car-3', 'Curie', 3, 82), color: 0x22aa66 },
      { ...result('car-4', 'Dijkstra', 4, 83), color: 0xffff00 },
      { ...result('car-5', 'Euler', 5, 84), color: 0xffffff },
      { ...result('car-6', 'Fermi', 6, null), finished: false, status: 'race-ended', color: 0x888888 },
    ];
    championshipRace(store, { id: 'round-one', trackId: 'original', results });
    const standings = store.addChampionshipResult({ roundTrackId: 'original', raceId: 'round-one' });
    expect(store.nextChampionshipRound().trackId).toBe('technical');
    expect(standings.map((driver) => driver.points)).toEqual([25, 18, 15, 12, 10, 0]);
    expect(standings.find((driver) => driver.driverId === 'car-6')).toMatchObject({ points: 0, wins: 0, podiums: 0 });
    expect(store.read().championship.results[0].entries).toHaveLength(6);
  });
  it('finishes the calendar and uses stable name ordering for equal championship records', () => {
    const store = new CareerStore(new MemoryStorage()); store.createChampionship({ rounds: ['original', 'technical'] });
    championshipRace(store, { id: 'tie-a', trackId: 'original', results: [result('ada', 'Ada', 1, 80), result('bob', 'Babbage', 2, 81)] });
    store.addChampionshipResult({ roundTrackId: 'original', raceId: 'tie-a' });
    // The next scheduled round is part of the same season.
    store.saveRace({ id: 'tie-b', trackId: 'technical', mode: 'championship', raceCompleted: true, seasonId: store.read().championship.id, roundTrackId: 'technical', results: [result('bob', 'Babbage', 1, 80), result('ada', 'Ada', 2, 81)] });
    const standings = store.addChampionshipResult({ roundTrackId: 'technical', raceId: 'tie-b' });
    expect(standings.map(({ name, points, wins }) => ({ name, points, wins }))).toEqual([{ name: 'Ada', points: 43, wins: 1 }, { name: 'Babbage', points: 43, wins: 1 }]);
    expect(store.nextChampionshipRound()).toBeNull();
  });
  it('migrates v1 tutorial cursors, supports chapter selection and validates actual new race observations', () => {
    const storage = new MemoryStorage(); storage.setItem(TUTORIAL_KEY, JSON.stringify({ version: 1, index: 4 }));
    const tutorial = new RaceTutorial(storage);
    expect(tutorial.snapshot().completedIndices).toEqual([0, 1, 2, 3]);
    expect(tutorial.selectChapter('course').current.event).toBe('position-improved');
    expect(tutorial.observe('position-improved', { mode: 'race', position: 3, previous: 3 }).advanced).toBe(false);
    expect(tutorial.observe('position-improved', { mode: 'race', position: 2, previous: 3 })).toMatchObject({ advanced: true, index: 19 });
    expect(tutorial.observe('lap-completed', { mode: 'race', laps: 1, previousLaps: 0 })).toMatchObject({ advanced: true, index: 5 });
    expect(tutorial.snapshot().completed).toBe(6);
    expect(TUTORIAL_CHAPTERS).toHaveLength(6);
    expect(new RaceTutorial(storage).snapshot().completed).toBe(6);
  });
  it('ignores incompatible saved schemas and safely handles unavailable storage', () => {
    const storage = new MemoryStorage(); storage.setItem(CAREER_KEY, '{invalid');
    expect(new CareerStore(storage).read().races).toEqual([]);
    expect(new CareerStore(null).write({ version: 1 })).toBe(false);
  });

  it('freezes a custom track geometry into a season and can restore it after library deletion', () => {
    const store = new CareerStore(new MemoryStorage());
    const track = { id: 'user-track-a', label: 'Mon tracé', halfWidth: 9, width: 18, userCircuit: true, waypoints: [{ x: 0, y: 0.08, z: 0 }, { x: 40, y: 0.08, z: 0 }, { x: 25, y: 0.08, z: 30 }, { x: 0, y: 0.08, z: 25 }] };
    const season = store.createChampionship({ rounds: ['user:user-track-a'], trackDefinitions: { 'user:user-track-a': track } });
    const restored = store.championshipTrackDefinition('user:user-track-a', season);
    expect(restored).toMatchObject({ id: 'user-track-a', label: 'Mon tracé', halfWidth: 9, userCircuit: true });
    expect(restored.waypoints.map(({ x, z }) => [x, z])).toEqual(track.waypoints.map(({ x, z }) => [x, z]));
    const race = store.saveRace({ id: 'custom-gp', trackId: 'user-track-a', mode: 'championship', raceCompleted: true, seasonId: season.id, roundTrackId: 'user:user-track-a', results: [result('car-1', 'Ada', 1, 80)] });
    expect(store.addChampionshipResult({ roundTrackId: 'user:user-track-a', raceId: race.id, seasonId: season.id })[0].points).toBe(25);
  });

  it('refuses quick-race and laboratory-like results for championship scoring', () => {
    const store = new CareerStore(new MemoryStorage());
    store.createChampionship({ rounds: ['original'] });
    const race = store.saveRace({ id: 'quick-race', trackId: 'original', mode: 'arcade', results: [result('car-1', 'Ada', 1, 80)] });
    expect(() => store.addChampionshipResult({ roundTrackId: 'original', raceId: race.id })).toThrow(/completed scheduled championship race/i);
    const unfinished = store.saveRace({ id: 'incomplete-gp', trackId: 'original', mode: 'championship', seasonId: store.read().championship.id, roundTrackId: 'original', results: [result('car-1', 'Ada', 1, 80)] });
    expect(() => store.addChampionshipResult({ roundTrackId: 'original', raceId: unfinished.id })).toThrow(/completed scheduled championship race/i);
  });

  it('preserves an unreadable or obsolete career blob before a later write', () => {
    const storage = new MemoryStorage();
    const damaged = '{old career payload';
    storage.setItem(CAREER_KEY, damaged);
    const store = new CareerStore(storage);
    expect(store.read().races).toEqual([]);
    expect(store.recoveryWarning).toMatch(/illisible/i);
    expect(store.write(store.empty())).toBe(true);
    expect(storage.getItem(CAREER_RECOVERY_KEY)).toBe(damaged);
    expect(JSON.parse(storage.getItem(CAREER_KEY)).format).toBe(CAREER_KEY);
  });
});
