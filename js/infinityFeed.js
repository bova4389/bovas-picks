/* ==========================================================================
   Infinity War — the live pool read.

   The pick'em-shaped sibling of js/sleeperSurvivor.js. Both talk to the same
   endpoints through js/sleeperApi.js; they differ in what a week MEANS, and
   that difference is why this is a separate file rather than a flag on the
   other one:

     survivor    one pick per roster per week. A team is spent permanently,
                 so the useful ledger is `used` -- a flat list -- and the
                 useful field number is how much of the pool still HOLDS a
                 team. Rosters die.

     pick'em     up to eight picks per roster per week. Teams are reusable
                 week to week, nothing is ever spent, and nobody is
                 eliminated. `used` would be meaningless and scarcity does
                 not exist. The useful field number is how many people took
                 each side THIS WEEK.

   Trying to serve both from one normaliser means a shape where half the keys
   are null for half the callers, and the survivor grid's scarcity paint would
   read a pick'em's reused teams as a pool that had spent everything.

   THE KICKOFF GATE IS NOT OPTIONAL HERE. It is imported, not reimplemented --
   see js/sleeperApi.js. Sleeper's API will hand over other entrants' picks
   days early and its own app will not; this pool leaks eight picks at a time
   rather than one, so the gate matters more here than it does for survivor,
   not less.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import {
  REST, team, weekOfLeg, getJSON, fetchWeekPicks, picksOf, hasKickedOff,
} from './sleeperApi.js';

/* ── Fetch + normalise ────────────────────────────────────────────────────*/

/**
 * Pull the whole pool for a season.
 *
 * Throws rather than returning a partial pool. Callers keep whatever they had
 * cached and surface the message.
 *
 * @param {{leagueId: string, userId?: string}} pool
 * @param {number|string} season
 */
export async function fetchInfinityPool(pool, season) {
  const { leagueId, userId } = pool;
  if (!leagueId) throw new Error('No Sleeper league id configured for this pool');

  const [league, users, rosters, schedule] = await Promise.all([
    getJSON(`${REST}/league/${leagueId}`),
    getJSON(`${REST}/league/${leagueId}/users`),
    getJSON(`${REST}/league/${leagueId}/rosters`),
    getJSON(`https://api.sleeper.app/schedule/nfl/regular/${season}`),
  ]);

  // The same guard every other feed applies, made before any picks are
  // fetched: joining last season's pool to this season's slate produces a
  // confident, plausible, meaningless number.
  if (Number(league?.season) !== Number(season)) {
    throw new Error(`Sleeper pool is season ${league?.season}, board is ${season}`);
  }

  const currentWeek = weekOfLeg(league?.metadata?.current_pickem_leg_id) || 1;

  const games = new Map(schedule.map((g) => [String(g.game_id), g]));
  const nameOf = new Map(users.map((u) => [String(u.user_id), u.display_name]));

  const entries = new Map();
  for (const r of rosters) {
    const owner = String(r.owner_id);
    entries.set(String(r.roster_id), {
      entry: Number(r.roster_id),
      name: nameOf.get(owner) || `Entry ${r.roster_id}`,
      isMe: Boolean(userId) && owner === String(userId),
      picks: {},
    });
  }

  // One request per week, in one burst. Sleeper asks callers to stay under
  // 1000/minute; a full season is 18.
  const legs = await Promise.all(
    range(1, currentWeek).map(async (week) => ({
      week,
      data: await fetchWeekPicks(leagueId, week),
    }))
  );

  const weeks = {};

  for (const { week, data } of legs) {
    const counts = new Map();
    let submitted = 0;
    let revealed = 0;

    for (const [rosterId, payload] of Object.entries(data)) {
      const entry = entries.get(String(rosterId));
      if (!entry) continue;

      const mine = [];

      for (const pick of Object.values(picksOf(payload))) {
        const abbr = team(pick?.team);
        if (!abbr) continue;
        submitted += 1;

        const game = games.get(String(pick.game_id));

        // My own card is mine to see whenever I like. Everyone else's waits
        // for kickoff -- the pool's rule, kept by this tool rather than
        // worked around.
        if (!entry.isMe && !hasKickedOff(game)) continue;

        revealed += 1;
        mine.push(abbr);
        counts.set(abbr, (counts.get(abbr) || 0) + 1);
      }

      if (mine.length) entry.picks[String(week)] = mine;
    }

    const rows = [...counts.entries()]
      .map(([t, count]) => ({ team: t, count }))
      .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team));

    weeks[String(week)] = {
      rows,
      submitted,
      revealed,
      locked: Math.max(0, submitted - revealed),
      entrants: entries.size,
    };
  }

  return {
    year: Number(season),
    currentWeek,
    weeks,
    entries: [...entries.values()].sort((a, b) => a.entry - b.entry),

    source: 'sleeper',
    leagueId: String(leagueId),
    leagueName: league?.name || 'Infinity War',
    fetchedAt: Date.now(),
    settings: {
      weeklyPickLimit: Number(league?.settings?.weekly_pick_limit ?? 8),
      useConfidence: Boolean(league?.settings?.use_confidence),
      useSpread: Boolean(league?.settings?.use_spread),
    },
  };
}

const range = (from, to) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/* ── Cache ────────────────────────────────────────────────────────────────*/

/* Per season and per pool, for the reason spelled out in
   js/sleeperSurvivor.js: a cache key that omits the pool silently serves one
   pool's data to another the moment a second pool exists. There is only one
   Infinity War today; the key carries the pool anyway, because "there is only
   one" is exactly what was true of the Sleeper survivor pool right up until
   it wasn't. */
const feedKey = (season, pool) => `infinity:feed:${pool}:${season}`;

export function loadCachedPool(season, pool) {
  if (!pool) return null;
  try {
    const raw = JSON.parse(localStorage.getItem(feedKey(season, pool)));
    return Number(raw?.year) === Number(season) ? raw : null;
  } catch {
    return null;
  }
}

export function saveCachedPool(season, pool, feed) {
  if (!pool) return;
  try {
    localStorage.setItem(feedKey(season, pool), JSON.stringify(feed));
  } catch {
    /* private browsing / quota -- the feed still works for this session */
  }
}

/** My own card for a week, as game-agnostic team abbreviations. */
export function myPicksFor(feed, week) {
  const me = feed?.entries?.find((e) => e.isMe);
  return me?.picks?.[String(week)] || [];
}
