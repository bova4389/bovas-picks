/* ==========================================================================
   My picks, one answer for every tab that asks.

   Several tabs need to know what I picked: the Pick Sheet builds the email from
   it, and the Schedule highlights it on the game cards. Each used to read its
   own copy of the truth, so the Pick Sheet could say "no suicide pick" while
   the Picks tab plainly showed one. This module is the one resolver.

   Two questions, each with a fixed precedence:

     SEASON LONG (the numbered card)
       1. localStorage `picks:<year>:w<N>` -- the card being edited on this
          device, which is always the latest thing typed
       2. data/picks-sent-<year>.json -- the card as it was emailed, committed
          so it is there on every device and survives a cleared browser

     SURVIVOR (one team per pool per week) -- ACTUAL picks only
       1. a pick marked on this device (Picks tab or Grid), or an old cached
          Sleeper feed
       2. data/picks-sent-<year>.json's `survivor` map, for every pool

     INFINITY WAR (eight games per week) -- ACTUAL picks only
       0. the last Sleeper refresh on this device (needs Connect Sleeper) --
          what the pool actually holds, so it beats anything typed here
       1. this device's saved card, as the team abbreviations the Infinity
          War tab showed as the pick when it was saved
       2. data/picks-sent-<year>.json's `infinity` list
       The tab's unsaved chalk-eight default is NOT a pick and never shows.

     THE RECOMMENDATION IS A SEPARATE QUESTION (survivorRecommendation), and
     callers must ask it by name. For one morning a missing pick fell back to
     the recommendation, and the Picks tab told the owner he had picked the
     Chargers. Only the Pick Sheet's email falls back, and it says so.

   WHY NOT SLEEPER: its pick query began answering "Unauthorized" to every
   unauthenticated request on 2026-09-13, so the three Sleeper pools can no
   longer report my picks. They are recorded here instead.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import {
  SEASON, loadPicks, scoredGames, getSentPicks, getSurvivorLog,
} from './data.js';
import { LEAGUES, loadLeagueState, saveLeagueState } from './survivorLeagues.js';
import { loadCachedFeed, myPicksFrom } from './sleeperSurvivor.js';
import { loadCachedPool, myPicksFor as infinityPicksFrom } from './infinityFeed.js';

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
 * What I ACTUALLY picked in one pool for one week: `{ team, source }` with
 * `team` an abbreviation, or null.
 *
 * Only real picks: one marked on this device (the Picks tab or the Grid), or
 * one in the committed sent file. A recommendation is never returned here --
 * that was tried for a morning and the Picks tab promptly told the owner he
 * had picked the Chargers when he had not. Recommendations have their own
 * function below, and every caller has to say which one it means.
 */
export function survivorPick(leagueId, week, season = SEASON) {
  const w = String(week);
  const league = LEAGUES.find((l) => l.id === leagueId);

  // Sleeper's pick query started answering "Unauthorized" on 2026-09-13, so a
  // cached feed is only ever an old one -- still true for the weeks it holds.
  const recorded = loadLeagueState(leagueId, season).picks[w]
    || (league?.sleeper ? myPicksFrom(loadCachedFeed(season, leagueId))[w] : null);
  if (recorded) return { team: recorded, source: 'device' };

  const sentTeam = sentCard(week)?.survivor?.[leagueId];
  if (sentTeam) return { team: sentTeam, source: 'sent' };

  return null;
}

/**
 * What the Picks tab RECOMMENDED for one pool and week, or null: the frozen
 * log entry if final, else this device's last-rendered card, else the log at
 * any confidence.
 */
export function survivorRecommendation(leagueId, week, season = SEASON) {
  const w = String(week);
  const logged = log?.weeks?.[w];
  const fromLog = logged?.picks?.find((p) => p.pool === leagueId)?.team || null;
  if (fromLog && logged.confidence === 'final') return fromLog;

  const card = storedCard(week, season);
  const fromCard = card?.picks?.find((p) => p.leagueId === leagueId)?.pick?.team || null;
  return fromCard || fromLog;
}

/** Every pool's actual pick for a week, skipping pools with none. */
export function survivorPicksForWeek(week, season = SEASON) {
  return LEAGUES
    .map((league) => ({ league, pick: survivorPick(league.id, week, season) }))
    .filter((r) => r.pick);
}

/**
 * Every week's actual pick in one pool, `week -> team`: the sent file first,
 * then this device on top. This is the board the Picks tab builds its
 * used-teams from, so a pick recorded on any device counts everywhere.
 */
export function survivorBoard(leagueId, season = SEASON) {
  const picks = {};
  for (const [w, card] of Object.entries(sent?.weeks || {})) {
    const t = card?.survivor?.[leagueId];
    if (t) picks[String(Number(w))] = t;
  }
  const league = LEAGUES.find((l) => l.id === leagueId);
  if (league?.sleeper) Object.assign(picks, myPicksFrom(loadCachedFeed(season, leagueId)));
  Object.assign(picks, loadLeagueState(leagueId, season).picks);
  return picks;
}

/**
 * Record (or clear, with team = null) my pick for one pool and week on this
 * device. One team per week per pool: this replaces the week's pick rather
 * than toggling it.
 */
export function recordSurvivorPick(leagueId, week, team, season = SEASON) {
  const state = loadLeagueState(leagueId, season);
  const picks = { ...state.picks };
  const w = String(week);
  if (team) {
    for (const [other, t] of Object.entries(picks)) if (t === team && other !== w) delete picks[other];
    picks[w] = team;
  } else {
    delete picks[w];
  }
  saveLeagueState(leagueId, season, { ...state, picks });
}

/* ── Infinity War ─────────────────────────────────────────────────────────*/

/**
 * Where js/infinityWar.js saves the picked SIDE of each saved game. Its own
 * card key holds game ids only, and the side is derived from the odds at
 * render time -- which needs the whole grid model. Saving the teams beside the
 * ids lets the Schedule mark the side without building that model twice.
 */
export const infinityTeamsKey = (season, week) => `infinity:${season}:${week}:teams`;

/**
 * My Infinity War picks for a week: `{ teams: Set<abbr>, source }`, or null.
 * The device card wins when it holds anything, same rule as the season card.
 */
export function infinityPicks(week, season = SEASON) {
  const fromSleeper = infinityPicksFrom(loadCachedPool(season, 'infinity'), week);
  if (fromSleeper.length) return { teams: new Set(fromSleeper), source: 'sleeper' };

  try {
    const local = JSON.parse(localStorage.getItem(infinityTeamsKey(season, week)));
    if (Array.isArray(local) && local.length) return { teams: new Set(local), source: 'device' };
  } catch { /* fall through to the sent file */ }

  const sentTeams = sentCard(week)?.infinity;
  if (Array.isArray(sentTeams) && sentTeams.length) return { teams: new Set(sentTeams), source: 'sent' };
  return null;
}

/** The Picks tab's last-rendered card for a week, as js/weekCard.js stores it. */
function storedCard(week, season) {
  try {
    return JSON.parse(localStorage.getItem(`survivor:card:${season}:${week}`));
  } catch {
    return null;
  }
}
