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

/* ── Season-wide join ─────────────────────────────────────────────────────
   buildOddsIndex above is a one-week tool: keying on the team pair alone
   silently collapses both meetings of every division rivalry into whichever
   one was written last. That is harmless for a single week's slate — the two
   meetings are always weeks apart — and fatal for anything spanning the
   season, where all 272 games are in the feed at once and 96 of them share a
   pair with another game. The Grid tab needs every cell, so it keys on the
   pair AND the kickoff. Same reasoning as js/gameState.js's buildStateIndex.
   ------------------------------------------------------------------------ */

/** Pair key -> every event for that matchup, ascending by kickoff. */
export function buildSeasonOddsIndex(events) {
  const idx = new Map();
  for (const ev of events) {
    const k = pairKey(mascotOf(ev.away), mascotOf(ev.home));
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(ev);
  }
  for (const list of idx.values()) {
    list.sort((a, b) => (a.commenceTime || '').localeCompare(b.commenceTime || ''));
  }
  return idx;
}

/**
 * The odds event for one specific meeting — mascot-shaped {away, home} plus a
 * `date` (ISO kickoff). Picks the closest event in time and rejects anything
 * outside `windowMs`, so a rivalry's September game can never be priced with
 * its December line. Null when there is no market for it.
 *
 * Four days is deliberately loose: the sportsbook's listed commence time can
 * drift from the schedule's by most of a day for flexed and TBD games, but
 * two meetings of the same pair are never within a week of each other.
 */
export function matchSeasonOdds(game, seasonIndex, windowMs = 4 * 86_400_000) {
  const list = seasonIndex.get(pairKey(game.away, game.home));
  if (!list || !list.length || !game.date) return null;

  const target = new Date(game.date).getTime();
  if (!Number.isFinite(target)) return list.length === 1 ? list[0] : null;

  let best = null;
  let bestGap = Infinity;
  for (const ev of list) {
    const gap = Math.abs(new Date(ev.commenceTime).getTime() - target);
    if (gap < bestGap) { best = ev; bestGap = gap; }
  }
  return bestGap <= windowMs ? best : null;
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
