/* ==========================================================================
   Odds matching — join a number-map/survivor-shaped game ({away, home}
   mascot names) against an Odds tab snapshot.

   Pure data logic, no HTML and no fetching. This is what makes "show odds
   next to a matchup" reusable: any tab that lists games (Pick Sheet, the
   Odds tab, Recommend, and eventually Survivor/Lookback) calls the same
   buildOddsIndex/matchOdds/orientProbs here instead of re-deriving the
   join — see js/oddsBadge.js for the shared inline-rendering half of this.
   ========================================================================== */

import { mascotOf } from './teams.js';

function pairKey(a, b) {
  return [a, b].sort().join('|');
}

/** Odds events keyed by the unordered pair of mascots, so the API's own
 *  home/away order never has to be assumed to match the caller's. */
export function buildOddsIndex(events) {
  const idx = new Map();
  for (const ev of events) {
    idx.set(pairKey(mascotOf(ev.away), mascotOf(ev.home)), ev);
  }
  return idx;
}

/** game needs mascot-only {away, home} — the number-map/survivor shape. */
export function matchOdds(game, oddsIndex) {
  return oddsIndex.get(pairKey(game.away, game.home)) || null;
}

/**
 * De-vigged win probabilities oriented to the game's own away/home labels
 * — {awayProb, homeProb}, both null if `ev` is null. Defensive against the
 * odds event's home/away not lining up with the game's (e.g. a neutral-site
 * game), rather than assuming position always matches.
 */
export function orientProbs(game, ev) {
  if (!ev) return { awayProb: null, homeProb: null };
  const evHomeIsGameHome = mascotOf(ev.home) === game.home;
  return evHomeIsGameHome
    ? { awayProb: ev.awayWinProb, homeProb: ev.homeWinProb }
    : { awayProb: ev.homeWinProb, homeProb: ev.awayWinProb };
}
