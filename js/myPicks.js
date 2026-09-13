/* ==========================================================================
   My picks, one answer for every tab that asks.

   Three tabs need to know what I picked: the Pick Sheet builds the email from
   it, and the Schedule highlights it on the game cards. Each used to read its
   own copy of the truth, so the Pick Sheet could say "no suicide pick" while
   the Picks tab plainly showed one. This module is the one resolver.

   Two questions, each with a fixed precedence:

     SEASON LONG (the numbered card)
       1. localStorage `picks:<year>:w<N>` -- the card being edited on this
          device, which is always the latest thing typed
       2. data/picks-sent-<year>.json -- the card as it was emailed, committed
          so it is there on every device and survives a cleared browser

     SURVIVOR (one team per pool per week)
       1. a pick recorded on the Grid, or read back from Sleeper -- the truth
       2. data/picks-sent-<year>.json's `suicide` line, for Mike's pool
       3. the committed survivor log, if that week's card is FINAL (frozen at
          the deadline, so it is what stood when the email went out)
       4. the Picks tab's card for that week, as last rendered on this device
       5. the committed survivor log at any confidence

   2-5 are the Picks tab's answer standing in for a pick nobody recorded. That
   is deliberate: the Picks tab is where the survivor decision is made, and
   making it a second errand to also click "Spend" on the Grid is how the
   email went out with "Suicide —". A resolved pick says which source it came
   from, so a caller can say "recommended" rather than "recorded" if it wants.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import {
  SEASON, loadPicks, scoredGames, getSentPicks, getSurvivorLog,
} from './data.js';
import { LEAGUES, loadLeagueState } from './survivorLeagues.js';
import { loadCachedFeed, myPicksFrom } from './sleeperSurvivor.js';

let sent = null;   // data/picks-sent-<year>.json, or null
let log = null;    // data/survivor-log-<year>.json, or null
let loading = null;

/** Load the two committed files once. Safe to call from every tab. */
export function loadMyPicks(season = SEASON) {
  if (!loading) {
    loading = Promise.all([getSentPicks(season), getSurvivorLog(season)])
      .then(([s, l]) => {
        sent = Number(s?.season) === Number(season) ? s : null;
        log = Number(l?.season) === Number(season) ? l : null;
      });
  }
  return loading;
}

/* ── Season long ──────────────────────────────────────────────────────────*/

/** The emailed card for a week, or null. */
export function sentCard(week) {
  return sent?.weeks?.[String(week)] || null;
}

/**
 * My numbered card for a week, in the Pick Sheet's `{ [awayNum]: number }`
 * shape plus `__mnf`.
 *
 * The device copy wins whenever it holds a single pick, because it is what I
 * am editing. Only an EMPTY device copy falls back to the emailed card -- a
 * half-changed card must never be silently swapped for the sent one.
 */
export function seasonCard(map, week, season = SEASON) {
  const local = loadPicks(week, season);
  const hasLocal = Object.keys(local).some((k) => k !== '__mnf' && local[k]);
  if (hasLocal || local.__mnf != null) return { picks: local, source: 'device' };

  const card = sentCard(week);
  if (!card || !map) return { picks: local, source: 'none' };

  const picks = {};
  const numbers = new Set((card.numbers || []).map(Number));
  for (const g of scoredGames(map, week)) {
    if (numbers.has(g.awayNum)) picks[g.awayNum] = g.awayNum;
    else if (numbers.has(g.homeNum)) picks[g.awayNum] = g.homeNum;
  }
  if (card.points != null) picks.__mnf = Number(card.points);
  return { picks, source: 'sent' };
}

/**
 * The mascot I picked in each season-long game, as a Map keyed by the
 * unordered mascot pair -- so the Schedule can look a game up without knowing
 * which side the number map lists first.
 */
export function seasonPicksByGame(map, week, season = SEASON) {
  const out = new Map();
  if (!map) return out;
  const { picks } = seasonCard(map, week, season);
  for (const g of scoredGames(map, week)) {
    const p = picks[g.awayNum];
    if (!p) continue;
    out.set(pairKey(g.away, g.home), p === g.awayNum ? g.away : g.home);
  }
  return out;
}

export const pairKey = (a, b) => [a, b].sort().join('|');

/* ── Survivor ─────────────────────────────────────────────────────────────*/

/**
 * My pick in one pool for one week: `{ team, source }` with `team` an
 * abbreviation, or null.
 */
export function survivorPick(leagueId, week, season = SEASON) {
  const w = String(week);
  const league = LEAGUES.find((l) => l.id === leagueId);

  const recorded = loadLeagueState(leagueId, season).picks[w]
    || (league?.sleeper ? myPicksFrom(loadCachedFeed(season, leagueId))[w] : null);
  if (recorded) return { team: recorded, source: 'recorded' };

  if (leagueId === 'mike' && sentCard(week)?.suicide) {
    return { team: sentCard(week).suicide, source: 'sent' };
  }

  const logged = log?.weeks?.[w];
  const fromLog = logged?.picks?.find((p) => p.pool === leagueId)?.team || null;
  if (fromLog && logged.confidence === 'final') return { team: fromLog, source: 'log' };

  const card = storedCard(week, season);
  const fromCard = card?.picks?.find((p) => p.leagueId === leagueId)?.pick?.team || null;
  if (fromCard) return { team: fromCard, source: 'card' };

  return fromLog ? { team: fromLog, source: 'log' } : null;
}

/** Every pool's pick for a week, skipping pools with none. */
export function survivorPicksForWeek(week, season = SEASON) {
  return LEAGUES
    .map((league) => ({ league, pick: survivorPick(league.id, week, season) }))
    .filter((r) => r.pick);
}

/** The Picks tab's last-rendered card for a week, as js/weekCard.js stores it. */
function storedCard(week, season) {
  try {
    return JSON.parse(localStorage.getItem(`survivor:card:${season}:${week}`));
  } catch {
    return null;
  }
}
