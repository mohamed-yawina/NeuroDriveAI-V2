import { upgradeRaceReplay, validateRaceReplay } from '../neural-lab/ReplayProtocol.js';

export const CAREER_KEY = 'neurodrive-ultimate-career-v1';
export const CAREER_VERSION = 1;
export const CHAMPIONSHIP_POINTS = Object.freeze([25, 18, 15, 12, 10, 8, 6, 4, 2, 1]);
const DEFAULT_PROFILE = Object.freeze({ name: 'Pilote ND', livery: '#e10600', preferences: {} });
const VALID_TRACKS = new Set(['original', 'technical', 'fast-oval']);
const VALID_LAPS = new Set([3, 5, 8]);
const VALID_DIFFICULTIES = new Set(['prudent', 'balanced', 'aggressive']);
const VALID_WEATHER = new Set(['dry', 'wet', 'rain']);

export class CareerStore {
  constructor(storage = globalThis.localStorage, { replayLimit = 2, historyLimit = 40, maxReplayFrames = 1800 } = {}) {
    this.storage = storage; this.replayLimit = replayLimit; this.historyLimit = historyLimit; this.maxReplayFrames = maxReplayFrames;
  }
  read() {
    try {
      const parsed = JSON.parse(this.storage?.getItem(CAREER_KEY) ?? 'null');
      if (parsed?.format !== CAREER_KEY || parsed.version !== CAREER_VERSION) return this.empty();
      const priorSeason = parsed.championship && typeof parsed.championship === 'object' ? parsed.championship : this.defaultChampionship();
      const priorRounds = Array.isArray(priorSeason.rounds) ? priorSeason.rounds.filter((track) => VALID_TRACKS.has(track)) : [];
      const state = {
        ...this.empty(), ...parsed,
        profile: { ...DEFAULT_PROFILE, ...parsed.profile },
        races: Array.isArray(parsed.races) ? parsed.races : [],
        replays: Array.isArray(parsed.replays) ? parsed.replays : [],
        championshipHistory: Array.isArray(parsed.championshipHistory) ? parsed.championshipHistory : [],
        championship: {
          ...this.defaultChampionship(), ...priorSeason,
          rounds: priorRounds.length ? priorRounds : this.defaultChampionship().rounds,
          results: Array.isArray(priorSeason.results) ? priorSeason.results : [],
          laps: VALID_LAPS.has(Number(priorSeason.laps)) ? Number(priorSeason.laps) : 3,
          formationLap: Boolean(priorSeason.formationLap),
          difficulty: VALID_DIFFICULTIES.has(priorSeason.difficulty) ? priorSeason.difficulty : 'balanced',
          weather: VALID_WEATHER.has(priorSeason.weather) ? priorSeason.weather : 'dry',
        },
        limits: { replayLimit: this.replayLimit, maxReplayFrames: this.maxReplayFrames, ...parsed.limits },
      };
      this.replayLimit = Math.max(1, Math.min(8, Math.trunc(state.limits.replayLimit) || 2)); this.maxReplayFrames = Math.max(300, Math.min(18000, Math.trunc(state.limits.maxReplayFrames) || 1800));
      state.replays = state.replays.filter((entry) => validateRaceReplay(entry.replay, { maxFrames: this.maxReplayFrames }).valid).slice(0, this.replayLimit);
      return state;
    } catch { return this.empty(); }
  }
  empty() { return { format: CAREER_KEY, version: CAREER_VERSION, profile: { ...DEFAULT_PROFILE }, races: [], replays: [], championshipHistory: [], limits: { replayLimit: this.replayLimit, maxReplayFrames: this.maxReplayFrames }, championship: this.defaultChampionship() }; }
  defaultChampionship() { return { seasonVersion: 1, id: 'local-season-1', name: 'Saison locale', rounds: ['original', 'technical', 'fast-oval'], results: [], laps: 3, formationLap: false, difficulty: 'balanced', weather: 'dry' }; }
  write(state) {
    const payload = { ...state, format: CAREER_KEY, version: CAREER_VERSION, limits: { replayLimit: this.replayLimit, maxReplayFrames: this.maxReplayFrames } };
    if (!this.storage) return false;
    try { this.storage?.setItem(CAREER_KEY, JSON.stringify(payload)); return true; } catch { return false; }
  }
  setProfile(patch) {
    const state = this.read();
    if (patch.name !== undefined) state.profile.name = String(patch.name).trim().slice(0, 32) || DEFAULT_PROFILE.name;
    if (patch.livery !== undefined && /^#[0-9a-f]{6}$/i.test(patch.livery)) state.profile.livery = patch.livery;
    if (patch.preferences && typeof patch.preferences === 'object') state.profile.preferences = { ...state.profile.preferences, ...patch.preferences };
    this.write(state); return state.profile;
  }
  setReplayLimits({ replayLimit = this.replayLimit, maxReplayFrames = this.maxReplayFrames } = {}) {
    this.replayLimit = Math.max(1, Math.min(8, Math.trunc(Number(replayLimit)) || 2));
    this.maxReplayFrames = Math.max(300, Math.min(18000, Math.trunc(Number(maxReplayFrames)) || 1800));
    const state = this.read(); state.replays = state.replays.slice(0, this.replayLimit); this.write(state);
    return { replayLimit: this.replayLimit, maxReplayFrames: this.maxReplayFrames };
  }
  createChampionship({ rounds, laps = 3, formationLap = false, difficulty = 'balanced', weather = 'dry' } = {}) {
    const selectedRounds = Array.isArray(rounds) ? [...new Set(rounds)] : [];
    if (!selectedRounds.length || selectedRounds.length > VALID_TRACKS.size || selectedRounds.some((track) => !VALID_TRACKS.has(track))) throw new TypeError('Choisissez entre un et trois circuits disponibles, sans doublon.');
    const lapCount = Number(laps);
    if (!VALID_LAPS.has(lapCount)) throw new RangeError('Le nombre de tours doit être 3, 5 ou 8.');
    if (!VALID_DIFFICULTIES.has(difficulty)) throw new RangeError('Difficulté IA inconnue.');
    if (!VALID_WEATHER.has(weather)) throw new RangeError('Météo inconnue.');
    const state = this.read();
    state.championshipHistory.push(state.championship);
    state.championship = {
      seasonVersion: 1, id: `season-${Date.now()}-${state.championshipHistory.length + 1}`,
      name: `Saison ${new Date().getFullYear()} · ${selectedRounds.length} Grands Prix`,
      rounds: selectedRounds, results: [], laps: lapCount, formationLap: Boolean(formationLap), difficulty, weather,
      createdAt: new Date().toISOString(),
    };
    if (!this.write(state)) throw new Error('La saison n’a pas pu être enregistrée dans le stockage local. Vérifiez l’espace disponible.');
    return state.championship;
  }
  nextChampionshipRound(state = this.read()) {
    const season = state.championship;
    const complete = new Set(season.results.map((result) => result.roundTrackId));
    const trackId = season.rounds.find((round) => !complete.has(round));
    return trackId ? { trackId, index: season.rounds.indexOf(trackId), season } : null;
  }
  saveRace({ id = `race-${Date.now()}`, trackId, mode = 'arcade', seed, completedAt = new Date().toISOString(), results, replay = null }) {
    if (!trackId || !Array.isArray(results) || results.length < 1 || !results.every((r) => Number.isFinite(r.position) && Number.isFinite(r.completedLaps) && (r.gridPosition == null || (Number.isInteger(r.gridPosition) && r.gridPosition > 0)))) throw new TypeError('A race requires a track and measured standings.');
    const state = this.read();
    const race = { id, trackId, mode, seed: Number.isInteger(seed) ? seed >>> 0 : null, completedAt, results: results.map((r) => ({ id: r.id, carId: r.carId ?? r.id, gridPosition: Number.isInteger(r.gridPosition) ? r.gridPosition : null, name: r.name, color: Number.isFinite(r.color) ? r.color : null, position: r.position, completedLaps: r.completedLaps, finishTime: Number.isFinite(r.finishTime) ? r.finishTime : null, bestLapTime: Number.isFinite(r.bestLapTime) ? r.bestLapTime : null, collisions: r.collisions ?? 0, offTrackEvents: r.offTrackEvents ?? 0, status: r.status ?? (r.finished ? 'finished' : 'race-ended') })) };
    state.races = [race, ...state.races].slice(0, this.historyLimit);
    if (replay) {
      const validation = validateRaceReplay(replay, { maxFrames: this.maxReplayFrames });
      if (!validation.valid) throw new TypeError(`Replay rejected: ${validation.reason}`);
      state.replays = [{ raceId: id, replay: structuredClone(replay) }, ...state.replays.filter((entry) => entry.raceId !== id)].slice(0, this.replayLimit);
    }
    this.write(state);
    return race;
  }
  addChampionshipResult({ roundTrackId, raceId, seasonId } = {}) {
    const state = this.read(); const race = state.races.find((entry) => entry.id === raceId);
    if (!race || race.mode !== 'arcade' || !state.championship.rounds.includes(roundTrackId) || race.trackId !== roundTrackId || (seasonId && state.championship.id !== seasonId)) throw new TypeError('Championship result does not match a scheduled arcade round.');
    if (state.championship.results.some((r) => r.roundTrackId === roundTrackId)) throw new TypeError('This championship round already has a result.');
    const entries = race.results.map((r) => ({ driverId: r.id, carId: r.carId ?? r.id, gridPosition: r.gridPosition ?? null, name: r.name, color: r.color, position: r.position, finishTime: r.finishTime, bestLapTime: r.bestLapTime, status: r.status, completedLaps: r.completedLaps }));
    const points = entries.filter((r) => r.status === 'finished').map((r) => ({ driverId: r.driverId, name: r.name, color: r.color, position: r.position, points: CHAMPIONSHIP_POINTS[r.position - 1] ?? 0 }));
    state.championship.results.push({ roundTrackId, raceId, entries, points });
    if (!this.write(state)) throw new Error('Le résultat du Grand Prix n’a pas pu être enregistré localement.');
    return this.standings(state);
  }
  standings(state = this.read()) {
    const rows = new Map();
    for (const result of state.championship.results) {
      const entries = result.entries ?? result.points.map((driver) => ({ ...driver, driverId: driver.driverId, status: 'finished' }));
      for (const driver of entries) {
        const row = rows.get(driver.driverId) ?? { driverId: driver.driverId, name: driver.name, color: driver.color ?? null, points: 0, wins: 0, podiums: 0, rounds: 0 };
        row.name = driver.name || row.name; row.color = driver.color ?? row.color;
        row.rounds += 1;
        if (driver.status === 'finished') { row.podiums += driver.position <= 3 ? 1 : 0; row.wins += driver.position === 1 ? 1 : 0; }
        row.points += result.points.find((entry) => entry.driverId === driver.driverId)?.points ?? 0;
        rows.set(driver.driverId, row);
      }
    }
    return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.name.localeCompare(b.name, 'fr'));
  }
  records(state = this.read()) {
    const best = new Map();
    for (const race of state.races) for (const result of race.results) if (Number.isFinite(result.bestLapTime)) {
      const key = `${race.trackId}:${race.mode}`, prior = best.get(key);
      if (!prior || result.bestLapTime < prior.bestLapTime) best.set(key, { trackId: race.trackId, mode: race.mode, driver: result.name, bestLapTime: result.bestLapTime, raceId: race.id, completedAt: race.completedAt });
    }
    return [...best.values()];
  }
  exportRace(raceId) {
    const state = this.read(); const race = state.races.find((entry) => entry.id === raceId);
    if (!race) throw new RangeError(`Unknown local race: ${raceId}`);
    return { format: 'neurodrive-local-race-export', version: 1, race, replay: state.replays.find((entry) => entry.raceId === raceId)?.replay ?? null };
  }
  importReplay(replay) {
    const validation = validateRaceReplay(replay, { maxFrames: this.maxReplayFrames });
    if (!validation.valid) throw new TypeError(`Replay rejected: ${validation.reason}`);
    const state = this.read();
    const prefix = `import-${Date.now()}`;
    let id = prefix, suffix = 1;
    while (state.replays.some((entry) => entry.raceId === id)) id = `${prefix}-${suffix++}`;
    state.replays = [{ raceId: id, replay: upgradeRaceReplay(replay) }, ...state.replays].slice(0, this.replayLimit);
    if (!this.write(state)) throw new Error('Replay not saved: browser storage is unavailable or full.');
    return id;
  }
  exportReplay(raceId) {
    const entry = this.read().replays.find((item) => item.raceId === raceId);
    if (!entry) throw new RangeError(`Unknown local replay: ${raceId}`);
    return structuredClone(entry.replay);
  }
}
