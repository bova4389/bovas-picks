/* ==========================================================================
   Canonical game state — the single answer to "what is happening in this
   game", for every tab.

   Two layers, merged by ESPN event id (scripts/fetch_schedule.py stores the
   same ids the live scoreboard uses, which is what makes this join exact
   rather than a name match):

     BACKBONE   data/schedule-<year>.json — all 18 weeks, committed, refreshed
                weekly. Always present, works offline, renders instantly.
     OVERLAY    js/espn.js — live scores and clock for one week. Best-effort;
                null when ESPN is unreachable.

   The backbone alone is a perfectly good schedule. The overlay only ever adds
   detail, so every consumer works whether or not it arrived.

   WHY OTHER TABS SHOULD IMPORT THIS rather than fetch their own scores: the
   pick sheet needs to grey out a team that has already lost, the survivor grid
   needs the same, and Recommend needs to stop ranking a game that has kicked
   off. Three copies of "who is winning" would drift apart, and a wrong answer
   in that logic is invisible — it just looks like an opinion.

   INDEX KEYS INCLUDE THE WEEK, deliberately. js/oddsMatch.js keys purely on
   the sorted team pair, which silently collapses the two meetings of every
   division rivalry into one entry — 48 of 272 games in a season. Do not copy
   that shape here; a schedule has every game in it, so the collision is
   guaranteed rather than occasional.

   NEVER add a ?v= to this file — see data.js's note on module identity.
   ========================================================================== */

import { getSchedule } from './data.js';
import { fetchScoreboard } from './espn.js';
import { ABBR_TO_MASCOT } from './teams.js';

/** Kickoff plus a generous game length. Used to decide when a week is behind
 *  us — four hours covers a long overtime game plus a broadcast delay. */
const GAME_WINDOW_MS = 4 * 60 * 60 * 1000;

const mascot = (abbr) => ABBR_TO_MASCOT[abbr] || abbr;

/* ── Loading ──────────────────────────────────────────────────────────────*/

/**
 * Every game in a week, backbone merged with whatever live data exists.
 *
 * `live: false` skips the ESPN call entirely — used when a week is wholly in
 * the past or wholly in the future, where the committed scores are already
 * final and polling would just burn requests.
 */
export async function loadWeek(season, week, { live = true, maxAgeMs } = {}) {
  const schedule = await getSchedule(season);
  const backbone = (schedule?.games || []).filter((g) => g.week === week);

  const overlay = live ? await fetchScoreboard(season, week, { maxAgeMs }) : null;
  const byId = new Map((overlay?.games || []).map((g) => [g.id, g]));

  const games = backbone
    .map((base) => merge(base, byId.get(String(base.id))))
    .sort((a, b) => (a.kickoff || '').localeCompare(b.kickoff || ''));

  return {
    season,
    week,
    games,
    byes: (schedule?.byes?.[String(week)] || []).map(mascot),
    // Distinguishes "ESPN said nothing is live" from "ESPN never answered" —
    // the tab shows a quiet offline note for the second and nothing for the
    // first, rather than implying a data problem on a normal Tuesday.
    liveAvailable: Boolean(overlay),
    fetchedAt: overlay?.fetchedAt || null,
    scheduleMissing: !schedule,
  };
}

function merge(base, live) {
  const awayAbbr = base.away;
  const homeAbbr = base.home;

  // The committed file already holds final scores for played games, so a
  // completed week renders correctly with no live layer at all.
  const state = live?.state || (base.completed ? 'post' : 'pre');
  const awayScore = live ? live.awayScore : base.awayScore;
  const homeScore = live ? live.homeScore : base.homeScore;

  const game = {
    id: String(base.id),
    week: base.week,
    kickoff: base.date || live?.kickoff || null,

    awayAbbr,
    homeAbbr,
    away: mascot(awayAbbr),
    home: mascot(homeAbbr),

    state,
    awayScore,
    homeScore,

    period: live?.period ?? 0,
    clock: live?.clock ?? null,
    detail: live?.detail ?? null,
    broadcast: live?.broadcast ?? null,

    possession: live?.possession ?? null,
    downDistance: live?.downDistance ?? null,
    redZone: Boolean(live?.redZone),

    // Where it is actually played. "Home" upstream means the team that owns the
    // fixture, not whose stadium it is — nine 2026 games are abroad. Comes from
    // the committed schedule rather than the live overlay because it is known
    // months ahead and must render before any live layer exists.
    //
    // `neutral` absent from the file means that file predates the field, which
    // is not the same as "played at home" — so only an explicit true flags it.
    neutral: base.neutral === true,
    venue: base.venue ?? null,

    isLive: state === 'in',
    hasLiveData: Boolean(live),
  };

  game.winner = live?.winner ?? resolveWinner(state, awayScore, homeScore);
  game.leader = resolveLeader(state, awayScore, homeScore);
  return game;
}

function resolveWinner(state, awayScore, homeScore) {
  if (state !== 'post' || awayScore == null || homeScore == null) return null;
  if (awayScore === homeScore) return 'tie';
  return awayScore > homeScore ? 'away' : 'home';
}

/** Who is ahead *right now*, for a game in progress. Null once it is final —
 *  a finished game has a winner, and conflating the two is how "leading" ends
 *  up rendered on a game that ended hours ago. */
function resolveLeader(state, awayScore, homeScore) {
  if (state !== 'in' || awayScore == null || homeScore == null) return null;
  if (awayScore === homeScore) return null;
  return awayScore > homeScore ? 'away' : 'home';
}

/* ── Week selection ───────────────────────────────────────────────────────*/

/** Ascending week numbers present in a schedule. */
export function weeksIn(schedule) {
  return [...new Set((schedule?.games || []).map((g) => g.week))].sort((a, b) => a - b);
}

/**
 * The week to show on open: the one in progress, or the next one up.
 *
 * Scans for the first week whose last kickoff is still within a game window of
 * now. That keeps Sunday's slate on screen through Monday night rather than
 * flipping to next week the moment the early games end.
 */
export function currentWeek(schedule, now = new Date()) {
  const weeks = weeksIn(schedule);
  if (!weeks.length) return 1;

  const t = now.getTime();
  for (const week of weeks) {
    const last = Math.max(
      ...schedule.games
        .filter((g) => g.week === week)
        .map((g) => new Date(g.date).getTime())
    );
    if (Number.isFinite(last) && t < last + GAME_WINDOW_MS) return week;
  }
  return weeks[weeks.length - 1]; // season over — hold on the final week
}

/* ── Consumption by other tabs ────────────────────────────────────────────*/

/**
 * Index a week's games for lookup by matchup, keyed by week + unordered
 * mascot pair. Mirrors js/oddsMatch.js's buildOddsIndex so a tab that already
 * builds an odds index can build this the same way — but see the header note:
 * the week is part of the key here on purpose.
 */
export function buildStateIndex(games) {
  const idx = new Map();
  for (const g of games) idx.set(stateKey(g.week, g.away, g.home), g);
  return idx;
}

function stateKey(week, a, b) {
  return `${week}|${[a, b].sort().join('|')}`;
}

/** Look up a {away, home} mascot-shaped game — the number-map/survivor shape
 *  — against an index from buildStateIndex(). Null when not found. */
export function matchState(game, week, stateIndex) {
  return stateIndex.get(stateKey(week, game.away, game.home)) || null;
}

/**
 * What happened to one team in one game, from that team's point of view.
 *
 * This is the helper the pick sheet, survivor grid, and lookback all want:
 * given "Bengals" and their game, say whether that pick is alive, dead, or
 * still to come. Returns one of:
 *
 *   'won' | 'lost' | 'tied'      game is final
 *   'winning' | 'losing' | 'even'  game is in progress
 *   'pending'                    hasn't kicked off
 *   null                         that team isn't in this game
 */
export function outcomeFor(teamMascot, game) {
  if (!game) return null;

  const side =
    teamMascot === game.away ? 'away' : teamMascot === game.home ? 'home' : null;
  if (!side) return null;

  if (game.state === 'post') {
    if (game.winner === 'tie') return 'tied';
    if (!game.winner) return 'pending';
    return game.winner === side ? 'won' : 'lost';
  }

  if (game.state === 'in') {
    if (!game.leader) return 'even';
    return game.leader === side ? 'winning' : 'losing';
  }

  return 'pending';
}

/** True when a week has at least one game in progress — the signal the
 *  Schedule tab uses to decide whether to keep polling. */
export function anyLive(games) {
  return games.some((g) => g.state === 'in');
}

/** Milliseconds until the next kickoff in this week, or null if none is
 *  upcoming. Lets the tab wake up for a kickoff instead of polling all day. */
export function msToNextKickoff(games, now = new Date()) {
  const t = now.getTime();
  const upcoming = games
    .filter((g) => g.state === 'pre' && g.kickoff)
    .map((g) => new Date(g.kickoff).getTime())
    .filter((k) => Number.isFinite(k) && k > t);

  return upcoming.length ? Math.min(...upcoming) - t : null;
}
