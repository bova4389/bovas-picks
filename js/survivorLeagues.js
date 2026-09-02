/* ==========================================================================
   Survivor leagues — which teams are spent, in which pool.

   Every pool here is a different game (see SURVIVOR-STRATEGY.md "The Three
   Pools"). A pick that is right in a three-life pool can be actively wrong in
   a one-life pool on the same Sunday, so used-team state is stored PER LEAGUE
   and the grid never merges them. Switching leagues re-strikes the rows; it
   does not union them.

   LEAGUES is the list of pools that ACTUALLY EXIST, and it is the dropdown
   in pool order. Pools get added here as they are created -- SURVIVOR-
   STRATEGY.md may analyse one before it exists, which is not a reason to list
   it. A pool nobody has entered is a dead option that still has to be scrolled
   past every time, and it invites picks being logged against a pool that
   cannot receive them.

   Where the state lives:

     MINE       localStorage, per season per league. For a pool with no feed,
                what I have spent is something only I can tell the tool.
                Sleeper fills its own in on refresh -- see `sleeper` on the
                pool below.
     THE FIELD  Two sources, one shape. Mike's pool comes from a mailed
                workbook via scripts/parse_survivor.py into
                data/survivor-<year>.json; the Sleeper pool is fetched live by
                js/sleeperSurvivor.js, which normalises it into THAT SAME
                SHAPE. Everything below operates on either without knowing
                which. Both answer the question that actually moves a pick:
                not "have I used this team" but "how much of the field still
                holds it".

                This file used to state that the app pools would never get a
                field feed. Wrong about Sleeper, which serves the whole pool
                unauthenticated (2026-08-14). Assume a new pool has no feed
                until its provider is checked, not that it cannot have one.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

/**
 * The pools, in the order they matter: the two played hardest first, then the
 * 235-entry one-life pool, then the charity pool.
 *
 * `lives`, `entrants` and `economics` are DISPLAY FACTS, not calculation
 * inputs -- nothing here infers strategy from them. They label the switcher
 * honestly, so the one-life pool is never mistaken for a three-life one at a
 * glance and the half-pot pool is never read as a full-pot one.
 *
 * `entrants` is a SNAPSHOT, taken the day the pool was added. A live pool's
 * real count comes back with the field on every refresh and is what the Grid
 * paints; this number only fills the gap before the first fetch. Do not treat
 * it as current -- the Poop count sat at 12 here for a fortnight while the
 * pool grew to 18.
 *
 * `economics.potShare` is the fraction of the pot actually played for, and it
 * exists for East Orange, where half goes to charity. A buy-back there costs
 * the same dollars as anywhere else and buys half as much pot, so anything
 * that ever prices a buy-back must multiply by this rather than assume 1.
 * Recorded from the commissioner, never from Sleeper -- see the
 * `num_revives_allowed` note in SURVIVOR-STRATEGY.md, which all three Sleeper
 * pools now contradict in three different directions.
 */
export const LEAGUES = [
  {
    id: 'sleeper', name: 'Poop 2026', short: 'Poop',
    entrants: 18, lives: 3, hasField: true, live: true,
    note: 'Three lives (2 buy-backs). Refreshes from Sleeper.',

    // Read live by js/sleeperSurvivor.js. `userId` is which entry is mine --
    // there is no authenticated call here, so the pool cannot tell us on its
    // own and it has to be stated.
    sleeper: {
      leagueId: '1392226517005635584',
      userId: '721908735856967680',
    },
  },
  {
    id: 'deadpool', name: 'Deadpool', short: 'Deadpool',
    entrants: 1, lives: 3, hasField: true, live: true,
    note: 'Three lives (2 buy-backs). $30 in, $15 a buy-back. Refreshes from Sleeper.',
    economics: { entry: 30, buyback: 15, buybacks: 2, potShare: 1 },

    sleeper: {
      leagueId: '1400514368084451328',
      userId: '721908735856967680',
    },
  },
  {
    id: 'mike', name: "Mike's Suicide League", short: "Mike's",
    entrants: 235, lives: 1, hasField: true,
    note: 'One life. No buy-back.',
  },
  {
    id: 'eastorange', name: 'East Orange Squeeze', short: 'East Orange',
    entrants: 8, lives: 3, hasField: true, live: true,
    note: 'Charity pool — half the pot is played for. $25 in, $15 a buy-back.',
    economics: { entry: 25, buyback: 15, buybacks: 2, potShare: 0.5 },

    sleeper: {
      leagueId: '1398146363136483328',
      userId: '721908735856967680',
    },
  },
];

export const leagueById = (id) => LEAGUES.find((l) => l.id === id) || null;

/* Pools whose field arrives over the wire rather than from a parsed file.
   `hasField` says a field number can be shown; `live` says a Refresh button
   can go and get one. They are not the same thing -- Mike's pool has the
   first and not the second. */
export const isLive = (id) => Boolean(leagueById(id)?.live);

/* ── My state ─────────────────────────────────────────────────────────────
   Keyed per season AND per league. Picks are stored week -> team rather than
   as a flat used list, because "which week did I spend the Rams" is the
   question the grid is asked next, and a Set cannot answer it.
   ------------------------------------------------------------------------ */

const stateKey = (season, leagueId) => `survivor:${season}:${leagueId}`;

export function loadLeagueState(leagueId, season) {
  try {
    const raw = JSON.parse(localStorage.getItem(stateKey(season, leagueId)));
    return normalise(raw);
  } catch {
    return normalise(null);
  }
}

export function saveLeagueState(leagueId, season, state) {
  try {
    localStorage.setItem(stateKey(season, leagueId), JSON.stringify(state));
  } catch {
    /* private browsing / quota -- the grid still works, it just won't persist */
  }
}

function normalise(raw) {
  const picks = {};
  for (const [week, team] of Object.entries(raw?.picks || {})) {
    if (team) picks[String(Number(week))] = String(team);
  }
  return { picks, buybacks: Number(raw?.buybacks) || 0 };
}

/**
 * Record (or clear) my pick for a week. Returns a NEW state -- callers save
 * and re-render rather than mutating what they were handed.
 *
 * One team can only be spent once, so setting a team that is already recorded
 * in another week moves it rather than duplicating it. Picking the team
 * already on that week clears the cell, which makes the same click both the
 * set and the undo.
 */
export function setPick(state, week, team) {
  const picks = { ...state.picks };
  const w = String(week);

  if (picks[w] === team) delete picks[w];
  else {
    for (const [other, t] of Object.entries(picks)) {
      if (t === team) delete picks[other];
    }
    picks[w] = team;
  }
  return { ...state, picks };
}

/** Every team I have spent in this league. */
export function usedTeams(state) {
  return new Set(Object.values(state?.picks || {}));
}

/** Which week I spent a team, or null. */
export function weekUsed(state, team) {
  const hit = Object.entries(state?.picks || {}).find(([, t]) => t === team);
  return hit ? Number(hit[0]) : null;
}

/* ── The field ────────────────────────────────────────────────────────────*/

/**
 * How much of the surviving field still holds each team.
 *
 * `available` is the number that matters, and it is deliberately measured
 * against ALIVE entries only. An eliminated entry's used teams tell you
 * nothing about the competition ahead of you -- counting them would inflate
 * scarcity every week as the pool thins, which is exactly backwards.
 *
 * Returns null rather than a partial answer when the feed is for a different
 * season. Joining last season's field to this season's schedule is the
 * failure mode js/season.js exists to prevent: it produces a confident,
 * plausible, completely meaningless number.
 */
export function fieldAvailability(survivor, season) {
  if (!survivor || Number(survivor.year) !== Number(season)) return null;

  const entries = survivor.entries || [];
  const alive = entries.filter((e) => e.alive !== false);
  if (!alive.length) return null;

  const spent = new Map();
  for (const entry of alive) {
    for (const team of entry.used || []) {
      spent.set(team, (spent.get(team) || 0) + 1);
    }
  }

  const byTeam = new Map();
  for (const [team, used] of spent) {
    byTeam.set(team, {
      usedBy: used,
      availableTo: alive.length - used,
      availablePct: (alive.length - used) / alive.length,
    });
  }

  return { alive: alive.length, entered: entries.length, byTeam };
}

/** A team's field scarcity, defaulting to "everyone still has it" for a team
 *  nobody has spent -- absence from the map means zero uses, not no data. */
export function scarcityFor(field, team) {
  if (!field) return null;
  return field.byTeam.get(team) || {
    usedBy: 0, availableTo: field.alive, availablePct: 1,
  };
}

/**
 * One week's field pick distribution: which teams the pool actually picked,
 * how many entries took each, and what share of the visible picks that is.
 *
 * Replaces an earlier `weekPickShare()` that returned team -> pct and nothing
 * else. It was exported, never called, and could not answer the question the
 * board below it is asked first — "how many people" — so it has been widened
 * rather than duplicated.
 *
 * ONLY TEAMS SOMEBODY PICKED APPEAR. A team with no takers is absent from the
 * feed's `picks` array to begin with, and a zero row is filtered here as well,
 * because "0 entries took the Jets" is not a fact about the week — 20 of the
 * 32 teams are unpicked in a small pool and listing them buries the eight that
 * carry the week.
 *
 * Works on either feed untouched: Mike's parsed workbook and the live Sleeper
 * pool are normalised to the same shape (see js/sleeperSurvivor.js). Where
 * they differ is the kickoff gate — Sleeper carries `submitted` / `revealed` /
 * `expected` because its picks unlock one game at a time, and Mike's file,
 * parsed after the week is over, carries only a total. The fallbacks below are
 * what let one renderer serve both without branching on the source.
 *
 * Returns null for a feed from another season rather than a partial answer:
 * joining last season's pool to this season's grid is exactly the confident,
 * plausible, meaningless number js/season.js exists to prevent.
 */
export function weekDistribution(survivor, week, season) {
  if (!survivor || Number(survivor.year) !== Number(season)) return null;

  const w = survivor.weeks?.[String(week)];
  if (!w) return null;

  const rows = (w.picks || [])
    .filter((p) => p?.team && Number(p.count) > 0)
    .map((p) => ({
      team: String(p.team),
      count: Number(p.count),
      pct: Number(p.pct),
    }))
    .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));

  const shown = rows.reduce((n, r) => n + r.count, 0);
  const revealed = Number.isFinite(w.revealed) ? w.revealed : shown;
  const submitted = Number.isFinite(w.submitted) ? w.submitted : shown;
  const expected = Number.isFinite(w.expected) ? w.expected : (Number(w.entrants) || shown);

  return {
    week: Number(week),
    rows,
    shown,
    revealed,
    submitted,
    expected,
    // How many picks are in but still held back by the kickoff gate. Always 0
    // for a parsed workbook, which is only ever written after the fact.
    locked: Math.max(0, submitted - revealed),
    distinctTeams: rows.length,
    topCount: rows.length ? rows[0].count : 0,
    complete: Boolean(w.complete) || (expected > 0 && revealed >= expected),
  };
}

/**
 * The weeks this feed can actually show a distribution for, ascending.
 *
 * A week only qualifies once at least one pick is VISIBLE, which for the
 * Sleeper pool means at least one game has kicked off. That is what makes the
 * board's week selector honest: a week nobody can see into yet is not offered
 * as if it were empty.
 */
export function weeksWithPicks(survivor, season) {
  if (!survivor || Number(survivor.year) !== Number(season)) return [];

  return Object.keys(survivor.weeks || {})
    .map(Number)
    .filter(Number.isFinite)
    .filter((w) => (survivor.weeks[String(w)]?.picks || [])
      .some((p) => Number(p?.count) > 0))
    .sort((a, b) => a - b);
}

/* ── Which pool I am playing, shared across tabs ──────────────────────────
   The Grid and Planning both have to know which pool is in front of me, and
   two switchers that can disagree is a bug with a long fuse: the Grid strikes
   one pool's used teams while Planning maps what is left of another, and both
   look right.

   This is deliberately NOT the Grid's `grid:prefs.league`, even though it
   seeds from it. That pref carries an extra 'none' value meaning "don't strike
   anything", which is a display choice about the grid rather than a statement
   about which pool I am in -- so turning the striking off must not blank
   Planning. `setActivePool` ignores anything that is not a real pool.
   ------------------------------------------------------------------------ */

const POOL_KEY = 'survivor:pool';

/** The pool in play, falling back to the Grid's stored choice and then to the
 *  first real pool. Seeding from `grid:prefs` matters once: without it, an
 *  existing user who has been working in Mike's pool opens Planning on the
 *  Sleeper pool and sees a map of the wrong game. */
export function activePool() {
  try {
    const stored = localStorage.getItem(POOL_KEY);
    if (stored && leagueById(stored)) return stored;

    const grid = JSON.parse(localStorage.getItem('grid:prefs'));
    if (grid?.league && leagueById(grid.league)) return grid.league;
  } catch { /* unreadable storage -- fall through to the default */ }

  return LEAGUES[0].id;
}

export function setActivePool(id) {
  if (!leagueById(id)) return;
  try {
    localStorage.setItem(POOL_KEY, id);
  } catch { /* private browsing -- the tab still works, it just won't persist */ }
}
