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

/** Bump when the new season's "Weekly Sheets" workbook has been parsed. */
export const SEASON = 2025;

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

/** Movement history for one bucket ("current" or "bucket+1"), or []. */
export async function getOddsHistory(bucketLabel) {
  try {
    return await loadJSON(`data/odds/history/${bucketLabel}.json`);
  } catch {
    return [];
  }
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
