/* ==========================================================================
   Sleeper survivor pool — live feed.

   Mike's pool arrives as a mailed workbook that scripts/parse_survivor.py
   turns into data/survivor-<year>.json. The Sleeper pool needs no workbook and
   no script: Sleeper will hand over the whole pool on request, so this module
   fetches it in the browser and normalises it into THE SAME SHAPE the parser
   emits. That is the point of the file -- fieldAvailability(), scarcityFor(),
   weekDistribution() and weeksWithPicks() in survivorLeagues.js work on the
   result untouched, and neither the Grid tab nor the pick board below it can
   tell which pool's field it is painting.

   ── How this reaches the data, and why it is not the documented API ───────

   Survivor pools are NOT fantasy leagues in Sleeper's data model. The pool's
   `sport` is "pickem:nfl", so it never appears in the documented
   /v1/user/<id>/leagues/nfl/<year> endpoint and docs.sleeper.com has no
   pick'em section at all. Two surfaces do carry it:

     REST  api.sleeper.app/v1/league/<id>            name, settings, metadata
           api.sleeper.app/v1/league/<id>/users      user_id -> display name
           api.sleeper.app/v1/league/<id>/rosters    roster_id -> owner, alive
           api.sleeper.app/schedule/nfl/regular/<yr> game_id -> week + matchup

     GQL   api.sleeper.app/graphql
           get_pickem_picks_for_league(league_id, leg_id, include_tiebreaker)

   Both answer unauthenticated and both send `access-control-allow-origin: *`,
   which is the only reason the Refresh button can be a plain browser fetch
   instead of a server-side job. Verified 2026-08-14.

   THE GRAPHQL ENDPOINT IS UNDOCUMENTED. It can change or start demanding a
   token without notice, so every failure path here leaves the last good cached
   feed in place and reports the problem, rather than writing a partial file
   over a complete one. A stale field number is recoverable; a half-parsed one
   silently understates scarcity, which is exactly the failure js/season.js
   exists to prevent one layer up.

   ── Two formats worth knowing before editing ─────────────────────────────

     leg_id    "v1:regular:<week>" -- NOT the bare week number. Passing "1"
               returns {} with a 200 and no error, which reads exactly like an
               empty week. league.metadata.current_pickem_leg_id holds the
               current one.
     game_id   "202610129" -- Sleeper's own id, not ESPN's. Only the schedule
               feed resolves it, which is why that request is made at all.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

const REST = 'https://api.sleeper.app/v1';
const GQL = 'https://api.sleeper.app/graphql';

/** Sleeper spells Jacksonville JAX; every other feed in this project, and
 *  js/teams.js, spells it JAC. One team, one direction, no crosswalk needed. */
const TEAM_FIX = { JAX: 'JAC' };
const team = (code) => TEAM_FIX[code] || code;

const legId = (week) => `v1:regular:${week}`;
const weekOfLeg = (id) => Number(String(id).split(':').pop()) || null;

/* ── Transport ────────────────────────────────────────────────────────────*/

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper ${res.status} on ${url.replace(REST, '')}`);
  return res.json();
}

/**
 * One GraphQL query. Sleeper answers a bad field with HTTP 200 and an `errors`
 * array, so the status code alone proves nothing -- both have to be checked or
 * a schema change lands as an empty pool rather than as an error.
 */
async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Sleeper GraphQL ${res.status}`);

  const body = await res.json();
  if (body.errors?.length) throw new Error(`Sleeper GraphQL: ${body.errors[0].message}`);
  return body.data;
}

/**
 * `include_tiebreaker` changes the response SHAPE, not just whether a
 * tiebreaker rides along. This is the single most expensive thing to
 * rediscover about this endpoint, so it is asserted here rather than left to
 * the next reader:
 *
 *   true   { "<roster_id>": { picks: { "<game_id>": {...} }, tiebreaker: {} } }
 *   false  { "<roster_id>": {          "<game_id>": {...}                   } }
 *
 * With `false` the picks are hoisted to the top of the roster object and the
 * `picks` wrapper does not exist -- so reading `.picks` returns undefined and
 * the pool comes back looking empty, with a 200 and no error anywhere. We ask
 * for `true` because the wrapped form is self-describing, and picksOf() below
 * still reads either, because an undocumented endpoint is entitled to change
 * its mind.
 */
const PICKS_QUERY = `
  query Picks($league_id: Snowflake!, $leg_id: String!) {
    get_pickem_picks_for_league(
      league_id: $league_id, leg_id: $leg_id, include_tiebreaker: true
    )
  }`;

/** The pick map for one roster, from either shape above. Game ids are numeric
 *  strings, so a `picks` key can only ever be the wrapper. */
function picksOf(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const inner = payload.picks;
  return inner && typeof inner === 'object' ? inner : payload;
}

/* ── The kickoff gate ─────────────────────────────────────────────────────
   Sleeper's app hides a pick until its game kicks off. Sleeper's API does
   NOT -- it will hand over a pick weeks before the game (verified 2026-08-14
   against a Sept 13 kickoff). This project enforces the lock itself, so the
   tool never shows something the pool intends to be secret.

   Keyed on the schedule feed's `status` rather than on a clock, because the
   feed carries a DATE ONLY ("2026-09-13") with no kickoff time -- a
   date comparison would reveal the 8:20pm game at midnight.

   Written as "hide these" rather than "reveal these" on purpose. The only
   statuses observed are `pre_game`, `complete` and `canceled`, so the string
   for a game in progress is unknown; an allowlist would keep picks hidden
   through the game they were meant to be revealed for, which is the failure
   that would look like the gate working. An unknown game is still hidden --
   missing data must never open the gate.
   ------------------------------------------------------------------------ */

const HIDE_WHILE = new Set(['pre_game', 'canceled', 'postponed']);

const hasKickedOff = (game) => Boolean(game) && !HIDE_WHILE.has(String(game.status));

/* ── Fetch + normalise ────────────────────────────────────────────────────*/

/**
 * Pull the whole pool and return it in survivor-<year>.json's shape.
 *
 * Throws rather than returning a partial pool. Callers keep whatever they had
 * cached and surface the message.
 *
 * @param {{leagueId: string, userId?: string}} pool
 * @param {number|string} season
 */
export async function fetchSleeperSurvivor(pool, season) {
  const { leagueId, userId } = pool;
  if (!leagueId) throw new Error('No Sleeper league id configured for this pool');

  const [league, users, rosters, schedule] = await Promise.all([
    getJSON(`${REST}/league/${leagueId}`),
    getJSON(`${REST}/league/${leagueId}/users`),
    getJSON(`${REST}/league/${leagueId}/rosters`),
    getJSON(`https://api.sleeper.app/schedule/nfl/regular/${season}`),
  ]);

  // The season check is the same guard js/season.js applies to every other
  // feed, made before any picks are fetched: joining last season's pool to
  // this season's grid produces a confident, plausible, meaningless number.
  if (Number(league?.season) !== Number(season)) {
    throw new Error(`Sleeper pool is season ${league?.season}, grid is ${season}`);
  }

  const currentWeek = weekOfLeg(league?.metadata?.current_pickem_leg_id) || 1;

  const games = new Map(schedule.map((g) => [String(g.game_id), g]));
  const nameOf = new Map(users.map((u) => [String(u.user_id), u.display_name]));

  // roster_id is the key every pick is filed under, so the roster list is what
  // turns the picks into people. `is_eliminated` arrives as the STRING 'true'
  // or 'false' -- comparing it as a boolean marks the whole pool alive.
  const entries = new Map();
  for (const r of rosters) {
    const owner = String(r.owner_id ?? '');
    entries.set(Number(r.roster_id), {
      entry: Number(r.roster_id),
      name: null,
      nick: nameOf.get(owner) || `Roster ${r.roster_id}`,
      userId: owner,
      isMe: Boolean(userId) && owner === String(userId),
      picks: {},
      problems: [],
      alive: String(r.metadata?.is_eliminated) !== 'true',
      used: [],
    });
  }

  // Weeks are fetched in one burst rather than in sequence: it is currentWeek
  // requests, and the pool is small enough that ordering buys nothing. Sleeper
  // asks callers to stay under 1000 calls/minute; a full 18-week season is 18.
  const legs = await Promise.all(
    range(1, currentWeek).map(async (week) => ({
      week,
      data: (await gql(PICKS_QUERY, { league_id: leagueId, leg_id: legId(week) }))
        ?.get_pickem_picks_for_league || {},
    }))
  );

  const weeks = {};

  for (const { week, data } of legs) {
    const counts = new Map();
    let revealed = 0;
    let submitted = 0;

    for (const [rosterId, payload] of Object.entries(data)) {
      const entry = entries.get(Number(rosterId));
      if (!entry) continue;

      // Survivor is one pick a week (weekly_pick_limit: 1), but the payload is
      // shaped as a map because the same query serves full pick'em pools. Take
      // every pick rather than assuming one, so a rules change degrades into
      // extra data instead of a silent drop.
      for (const pick of Object.values(picksOf(payload))) {
        const abbr = team(pick?.team);
        if (!abbr) continue;

        submitted += 1;

        const game = games.get(String(pick.game_id));
        if (game && Number(game.week) !== week) {
          entry.problems.push(`Week ${week} pick is on a Week ${game.week} game`);
        }

        // The gate. My own pick is never withheld -- I already know it, and
        // withholding it would leave the ledger this feed exists to maintain
        // permanently a week behind. Everyone else's is dropped on the floor
        // here rather than stored and hidden at render time: a pick that never
        // enters the cache cannot leak out of it later.
        if (!entry.isMe && !hasKickedOff(game)) continue;

        entry.picks[String(week)] = abbr;
        counts.set(abbr, (counts.get(abbr) || 0) + 1);
        revealed += 1;
      }
    }

    weeks[String(week)] = {
      entrants: revealed,
      distinctTeams: counts.size,
      // Percentages are of the picks actually VISIBLE, not of the pool. A week
      // where two of twelve games have kicked off would otherwise report every
      // share at a sixth of its real value, and this feed is read mid-week by
      // design.
      picks: [...counts.entries()]
        .map(([t, count]) => ({
          team: t,
          count,
          pct: revealed ? Math.round((count / revealed) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count || a.team.localeCompare(b.team)),

      // Three numbers, because they answer different questions and collapsing
      // them hides the gate: `submitted` is how many have picked at all,
      // `revealed` how many of those are ours to see yet, `expected` the pool.
      // A caller that shows only `revealed` implies people have not picked
      // when in fact their game has not started.
      submitted,
      revealed,
      expected: entries.size,
      complete: revealed >= entries.size,
    };
  }

  for (const entry of entries.values()) {
    entry.used = Object.values(entry.picks);
  }

  return {
    year: Number(season),
    currentWeek,
    weeks,
    entries: [...entries.values()].sort((a, b) => a.entry - b.entry),

    // Provenance, so a cached blob can always answer where it came from and
    // how old it is without being re-fetched.
    source: 'sleeper',
    leagueId: String(leagueId),
    leagueName: league?.name || 'Sleeper pool',
    fetchedAt: Date.now(),
    settings: {
      revivesAllowed: Number(league?.settings?.num_revives_allowed ?? 0),
      picksPerTeam: Number(league?.settings?.num_picks_allowed_per_team ?? 1),
      weeklyPickLimit: Number(league?.settings?.weekly_pick_limit ?? 1),
    },
  };
}

const range = (from, to) =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

/* ── Cache ────────────────────────────────────────────────────────────────*/

/* Per season, and separate from `survivor:<season>:<pool>` (which holds MY
   picks). One is a copy of someone else's data that a refresh may replace
   wholesale; the other is mine and must never be dropped by a failed fetch. */
const feedKey = (season) => `survivor:feed:sleeper:${season}`;

export function loadCachedFeed(season) {
  try {
    const raw = JSON.parse(localStorage.getItem(feedKey(season)));
    return Number(raw?.year) === Number(season) ? raw : null;
  } catch {
    return null;
  }
}

export function saveCachedFeed(season, feed) {
  try {
    localStorage.setItem(feedKey(season), JSON.stringify(feed));
  } catch {
    /* private browsing / quota -- the feed still works for this session */
  }
}

/* ── Reading the feed ─────────────────────────────────────────────────────*/

/** My own picks out of the pool, as the `week -> TEAM` map loadLeagueState
 *  uses. Empty when the pool has no entry flagged as mine. */
export function myPicksFrom(feed) {
  const me = feed?.entries?.find((e) => e.isMe);
  return me ? { ...me.picks } : {};
}

/**
 * Fold the pool's answer into my stored picks.
 *
 * Sleeper wins for every week it reports, because it is the pool itself and I
 * cannot have picked something else there. Weeks it says nothing about keep
 * whatever is stored -- a refresh must never silently erase a pick typed in
 * for a week the feed has not reached yet.
 */
export function mergeMyPicks(state, feed) {
  const picks = { ...(state?.picks || {}), ...myPicksFrom(feed) };
  return { ...state, picks };
}

/** Freshness, phrased for a human. */
export function freshness(feed, now = Date.now()) {
  if (!feed?.fetchedAt) return 'never refreshed';

  const mins = Math.round((now - feed.fetchedAt) / 60000);
  if (mins < 1) return 'updated just now';
  if (mins < 60) return `updated ${mins} min ago`;

  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `updated ${hrs} hr ago`;
  return `updated ${Math.round(hrs / 24)} d ago`;
}

/**
 * One line describing what the newest week actually contains.
 *
 * Says how many picks are being WITHHELD as well as how many are shown. A
 * bare "2 of 12 visible" reads as a quiet pool; "2 of 12 shown, 7 more locked
 * until kickoff" is the same fact without the wrong implication, and it is
 * the line that tells you the gate is doing something.
 */
export function coverageNote(feed) {
  const week = feed?.currentWeek;
  const w = feed?.weeks?.[String(week)];
  if (!w) return '';

  if (w.complete) return `Week ${week} complete — all ${w.expected} picks in`;

  const locked = Math.max(0, (w.submitted ?? 0) - (w.revealed ?? 0));
  const shown = `Week ${week} — ${w.revealed ?? 0} of ${w.expected} shown`;
  return locked ? `${shown}, ${locked} locked until kickoff` : shown;
}
