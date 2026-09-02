/* ==========================================================================
   Sleeper — shared transport for every pool this site reads.

   Extracted from js/sleeperSurvivor.js on 2026-09-01, when Infinity War (a
   classic pick'em, not a survivor pool) became the second consumer. Both read
   the same undocumented endpoints and both owe the pool the same secrecy, so
   this file exists to keep ONE copy of the parts where a divergence would be
   a bug rather than a difference:

     * the endpoints and their quirks
     * the JAX/JAC spelling fix
     * the leg id format
     * THE KICKOFF GATE

   The kickoff gate is the one that matters most. Sleeper's API hands over
   other entrants' picks days before kickoff; Sleeper's own app does not, and
   this project plays by the app's rule rather than taking the edge. A second
   copy of that rule is a second chance to get it wrong, and getting it wrong
   means quietly reading picks the pool intended to be secret.

   ── How this reaches the data, and why it is not the documented API ───────

   Pick'em pools -- survivor and classic alike -- are NOT fantasy leagues in
   Sleeper's data model. Their `sport` is "pickem:nfl" and docs.sleeper.com has
   no pick'em section at all. Three surfaces carry them:

     REST  api.sleeper.app/v1/user/<id>/leagues/pickem:nfl/<year>
                                                  every pool I am in
           api.sleeper.app/v1/league/<id>         name, settings, metadata
           api.sleeper.app/v1/league/<id>/users   user_id -> display name
           api.sleeper.app/v1/league/<id>/rosters roster_id -> owner, alive
           api.sleeper.app/schedule/nfl/regular/<yr>  game_id -> week + matchup

     GQL   api.sleeper.app/graphql
           get_pickem_picks_for_league(league_id, leg_id, include_tiebreaker)

   THE USER-LEAGUES ROUTE NEEDS sport="pickem:nfl", NOT "nfl". This project
   used to record that pick'em pools "never appear" on that endpoint, which
   came from trying it with sport="nfl" and getting only fantasy leagues back.
   With the right sport it lists every pool, which is how the three 2026 pools
   were found (2026-09-01) rather than copied out of a browser URL bar.

   Both surfaces answer unauthenticated and both send
   `access-control-allow-origin: *`, which is the only reason any of this can
   be a plain browser fetch instead of a server-side job. Verified 2026-09-01.

   THE GRAPHQL ENDPOINT IS UNDOCUMENTED. It can change or start demanding a
   token without notice, so every caller must leave its last good cached feed
   in place on failure rather than writing a partial one over a complete one.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

export const REST = 'https://api.sleeper.app/v1';
export const GQL = 'https://api.sleeper.app/graphql';

/** Sleeper spells Jacksonville JAX; every other feed in this project, and
 *  js/teams.js, spells it JAC. One team, one direction, no crosswalk needed. */
const TEAM_FIX = { JAX: 'JAC' };
export const team = (code) => TEAM_FIX[code] || code;

/* `leg_id` is "v1:regular:<week>" -- NOT the bare week number. Passing "1"
   returns {} with a 200 and no error, which reads exactly like an empty week.
   league.metadata.current_pickem_leg_id holds the current one. */
export const legId = (week) => `v1:regular:${week}`;
export const weekOfLeg = (id) => Number(String(id).split(':').pop()) || null;

/* ── Transport ────────────────────────────────────────────────────────────*/

export async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Sleeper ${res.status} on ${url.replace(REST, '')}`);
  return res.json();
}

/**
 * One GraphQL query. Sleeper answers a bad field with HTTP 200 and an `errors`
 * array, so the status code alone proves nothing -- both have to be checked or
 * a schema change lands as an empty pool rather than as an error.
 */
export async function gql(query, variables) {
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
 *
 * The same query serves a survivor pool and a classic pick'em unchanged. The
 * only difference is how many games ride in `picks`: one per roster in a
 * survivor pool, up to `weekly_pick_limit` in a pick'em (verified against
 * Infinity War, 2026-09-01).
 */
export const PICKS_QUERY = `
  query Picks($league_id: Snowflake!, $leg_id: String!) {
    get_pickem_picks_for_league(
      league_id: $league_id, leg_id: $leg_id, include_tiebreaker: true
    )
  }`;

/** The pick map for one roster, from either shape above. Game ids are numeric
 *  strings, so a `picks` key can only ever be the wrapper. */
export function picksOf(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const inner = payload.picks;
  return inner && typeof inner === 'object' ? inner : payload;
}

/** Every roster's picks for one week of one pool, keyed by roster id. */
export async function fetchWeekPicks(leagueId, week) {
  const data = await gql(PICKS_QUERY, {
    league_id: String(leagueId),
    leg_id: legId(week),
  });
  return data?.get_pickem_picks_for_league || {};
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

   THIS APPLIES TO EVERY POOL, NOT JUST SURVIVOR. A pick'em week whose picks
   leaked early would be exactly as compromised, and Infinity War leaks eight
   at a time rather than one.
   ------------------------------------------------------------------------ */

const HIDE_WHILE = new Set(['pre_game', 'canceled', 'postponed']);

export const hasKickedOff = (game) =>
  Boolean(game) && !HIDE_WHILE.has(String(game.status));

/* ── Pool discovery ───────────────────────────────────────────────────────*/

/**
 * Every pick'em pool a user is in for a season, with settings attached.
 *
 * Not called by the site at runtime -- pools are configured by hand in
 * js/survivorLeagues.js and js/infinityWar.js, because a pool appearing in
 * this list is not the same as a pool I intend the tool to play. It is here
 * so the next pool's id can be looked up from the console instead of dug out
 * of a browser URL, and so the settings that describe a pool (weekly pick
 * limit, confidence, spread) can be checked against what the commissioner
 * said rather than assumed.
 */
export async function listPickemLeagues(userId, season) {
  return getJSON(`${REST}/user/${userId}/leagues/pickem:nfl/${season}`);
}
