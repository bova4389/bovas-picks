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
 * The pools, in the order they matter. `lives` and `entrants` are display
 * facts from SURVIVOR-STRATEGY.md, not calculation inputs -- nothing here
 * infers strategy from them, it just labels the switcher honestly so the
 * one-life pool is never mistaken for a three-life one at a glance.
 */
export const LEAGUES = [
  {
    id: 'sleeper', name: '2026 Poop', short: 'Poop',
    entrants: 12, lives: 3, hasField: true, live: true,
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
    id: 'mike', name: "Mike's Suicide League", short: "Mike's",
    entrants: 235, lives: 1, hasField: true,
    note: 'One life. No buy-back.',
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

/** That week's field pick distribution, as team -> percent. Empty when the
 *  week has not been played (and so has not been parsed) yet. */
export function weekPickShare(survivor, week, season) {
  if (!survivor || Number(survivor.year) !== Number(season)) return new Map();
  const picks = survivor.weeks?.[String(week)]?.picks || [];
  return new Map(picks.map((p) => [p.team, p.pct]));
}
