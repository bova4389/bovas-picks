/* ==========================================================================
   Shared data layer.

   Everything downstream — pick sheet, odds, recommendations, survivor — reads
   games through here, keyed by game rather than by pool number. Mike's
   numbering is a presentation detail of ONE pool; keeping it at the edge is
   what lets survivor reuse this untouched.

   NOTE: never add a ?v= query string to this file anywhere. A query string is
   part of a module's identity, so an imported copy with one and an imported
   copy without one are two separate instances with separate module state.
   That exact mistake took the Majors site down on U.S. Open launch day.
   ========================================================================== */

import { activeSeason, auditSeason } from './season.js';

/**
 * The season everything defaults to.
 *
 * DERIVED, NOT PINNED — and that is the whole point. This used to be a
 * hardcoded `2025`, which stayed correct right up until the odds feed rolled
 * over to 2026 on its own. Nothing complained; the tabs just started joining
 * two different seasons together and printing confident nonsense. A constant
 * that has to be remembered is a constant that gets forgotten, so the season
 * now comes from the calendar and is cross-checked against the feeds by
 * getSeasonAudit() below.
 */
export const SEASON = activeSeason();

const cache = new Map();

async function loadJSON(path) {
  if (cache.has(path)) return cache.get(path);

  const promise = fetch(path).then((res) => {
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return res.json();
  });

  cache.set(path, promise);
  return promise;
}

/**
 * The season's number map: which games are in the pool each week and what
 * number each team carries. Produced by scripts/parse_weekly_sheets.py.
 */
export async function getNumberMap(season = SEASON) {
  return loadJSON(`data/number-map-${season}.json`);
}

/** getNumberMap that reports absence as null instead of throwing. The audit
 *  needs "is it there" without treating a missing file as a failure — before
 *  the commissioner mails the workbook, missing is the normal state. */
export async function tryNumberMap(season = SEASON) {
  try {
    return await getNumberMap(season);
  } catch {
    return null;
  }
}

/** Week numbers present in the map, ascending. */
export function weekNumbers(map) {
  return Object.keys(map.weeks)
    .map(Number)
    .sort((a, b) => a - b);
}

/** All games for a week, in sheet order (excluded ones included). */
export function gamesForWeek(map, week) {
  return map.weeks[String(week)] || [];
}

/** Only the games that count toward scoring. */
export function scoredGames(map, week) {
  return gamesForWeek(map, week).filter((g) => g.counts);
}

/**
 * The game the Monday-night points guess is scored against, or null.
 *
 * Derived once, in scripts/parse_weekly_sheets.py, and only read here — never
 * re-derived as "the last Monday game", because the entire reason the flag
 * exists is the week where that heuristic picks the wrong one of two.
 */
export function tiebreakerGame(map, week) {
  return scoredGames(map, week).find((g) => g.tiebreaker) || null;
}

/**
 * Field pick popularity for a week, or null if that week's workbook has not
 * been parsed yet. Produced by scripts/parse_pool_picks.py.
 */
export async function getPopularity(week, season = SEASON) {
  const wk = String(week).padStart(2, '0');
  try {
    return await loadJSON(`data/popularity/pop-${season}-w${wk}.json`);
  } catch {
    return null;
  }
}

/**
 * Latest odds snapshot, or null if scripts/fetch_odds.py hasn't run yet
 * (nothing committed to data/odds/ locally, or the GitHub Action hasn't
 * fired since the repo went live). Buckets are relative to "now" — bucket 0
 * is the current game-week, +1 is next — not Mike's week numbers. See
 * scripts/fetch_odds.py for why.
 */
export async function getOddsSnapshot() {
  try {
    return await loadJSON('data/odds/current.json');
  } catch {
    return null;
  }
}

/**
 * Full snapshot history for one game, oldest first, or []. Keyed by the
 * Odds API's event id — NOT by week bucket, so this covers the game's whole
 * life in the feed (from whenever it first appears through kickoff), never
 * just however long it's been sitting in its current bucket.
 */
export async function getOddsHistory(eventId) {
  try {
    return await loadJSON(`data/odds/history/${eventId}.json`);
  } catch {
    return [];
  }
}

/**
 * Full season schedule with results, from scripts/fetch_schedule.py. Covers
 * every week including ones the market has not priced, which is what survivor
 * planning and bye-week lookahead need.
 */
export async function getSchedule(season = SEASON) {
  try {
    return await loadJSON(`data/schedule-${season}.json`);
  } catch {
    return null;
  }
}

/**
 * Modelled win probabilities for unplayed games, from
 * scripts/build_projections.py. Fills the gap past the market's ~10-12 day
 * lookahead window.
 *
 * TWO RULES, both load-bearing — see that script's COMPRESSION note:
 *  1. Market odds ALWAYS override these where both exist. Never blend them
 *     silently; a 78% projection four weeks out is far softer than a 78%
 *     moneyline on Saturday, and the UI must say which it is showing.
 *  2. Do NOT apply survivor's 70% win-probability floor to these. Preseason
 *     regression compresses the spread so hard that nothing reaches 80% and
 *     only ~16 games reach 70%. Use projections to ORDER a team's weeks
 *     against each other, not to clear an absolute bar.
 */
export async function getProjections(season = SEASON) {
  try {
    return await loadJSON(`data/projections-${season}.json`);
  } catch {
    return null;
  }
}

/**
 * The survivor pool's field, from scripts/parse_survivor.py: per-week pick
 * distribution plus every entry's used-team list. Null before the workbook
 * for this season has been parsed, which is the normal state until Week 1
 * results post — callers must degrade to "my own entry only" rather than
 * falling back to last season's file (see js/season.js on why).
 */
export async function getSurvivor(season = SEASON) {
  try {
    return await loadJSON(`data/survivor-${season}.json`);
  } catch {
    return null;
  }
}

/**
 * Cross-check every loaded feed against the active season.
 *
 * The guard that stops the tabs combining two seasons — see js/season.js for
 * what went wrong without it. Pass `week` to also validate that week's
 * popularity file, which is the pairing that matters most: field popularity
 * from one season joined to market odds from another is the combination that
 * produces a plausible, confident, completely meaningless leverage ranking.
 *
 * Cheap to call from every tab — each feed is memoised by loadJSON().
 */
export async function getSeasonAudit(week = null, season = SEASON) {
  const [schedule, numberMap, odds, popularity] = await Promise.all([
    getSchedule(season),
    tryNumberMap(season),
    getOddsSnapshot(),
    week == null ? Promise.resolve(null) : getPopularity(week, season),
  ]);

  return auditSeason({ season, schedule, numberMap, odds, popularity });
}

/** The Odds API's last-reported request budget, or null. */
export async function getOddsQuota() {
  try {
    return await loadJSON('data/odds/quota.json');
  } catch {
    return null;
  }
}

/* ── Pick persistence ─────────────────────────────────────────────────────
   Picks live in localStorage so a half-finished card survives a refresh or a
   phone locking itself mid-slate. Keyed per season+week.
   ------------------------------------------------------------------------ */

const key = (season, week) => `picks:${season}:w${week}`;

export function loadPicks(week, season = SEASON) {
  try {
    return JSON.parse(localStorage.getItem(key(season, week))) || {};
  } catch {
    return {};
  }
}

export function savePicks(week, picks, season = SEASON) {
  try {
    localStorage.setItem(key(season, week), JSON.stringify(picks));
  } catch {
    /* private browsing / quota — the card still works, it just won't persist */
  }
}

export function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem('profile')) || { name: '' };
  } catch {
    return { name: '' };
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem('profile', JSON.stringify(profile));
  } catch { /* ignore */ }
}
