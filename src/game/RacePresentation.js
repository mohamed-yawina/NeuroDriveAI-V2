import { RaceLeaderboard } from './RaceLeaderboard.js';

/** Shared ranked snapshot consumed by live HUD, results, podium and career saving. */
export function getRacePresentation(world, frozenStandings = null) {
  if (!world?.cars) throw new TypeError('Race presentation needs a race world.');
  const standings = frozenStandings ?? RaceLeaderboard.rank(world.cars);
  const human = standings.find((car) => car.isPlayer === true) ?? null;
  return { standings, human, displayedPosition: human?.position ?? null };
}
