/* ==========================================================================
   Injury layer — ESPN, straight from the browser.

   STRATEGY.md §4 Step 3 is blunt about why this exists: injuries are "the one
   piece of news that reliably moves a game and the one place a Saturday
   deadline can still be exploited." A starting QB out is worth 3-7 points of
   spread, "dwarfs every other factor combined", and is "the most common source
   of a genuinely live underdog."

   Everything else in the news cycle is deliberately NOT here. §3 bans touts,
   social consensus and situational trends by rule, and official injury reports
   are the one Tier 3 news input the strategy actually asks for. If a source
   is not the injury report, it does not get an integration.

   ── Why this fetches client-side ─────────────────────────────────────────

   Same reasoning as js/espn.js, and for this feed it is the entire point. The
   thing that makes injuries worth tracking is TIMELINESS -- a Wednesday
   practice report reprices Sunday's game, and a snapshot committed by a cron
   job is only as fresh as the last run. Fetching in the browser means the
   answer is current at the moment the question is asked, which is the only
   freshness that matters when the deadline is Saturday.

   The endpoint is keyless, public, and sends permissive CORS headers, so no
   secret can leak and no rate limit can be blown by a page view. Verified
   2026-08-14: 200, all 32 teams, from a browser origin.

   NEVER THROWS. Every caller treats null as "no injury layer available" and
   renders the tab without it, exactly as espn.js does for live scores. An
   ESPN outage must cost the injury notes, never the leverage ranking.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { toAbbr } from './teamIdentity.js';

const URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries';

/* Ten minutes. Practice reports move on a daily cadence, not a live one, so
   re-fetching per render would be pure waste -- but the cache still has to
   expire within a sitting, because the Wednesday report landing while the tab
   is open is exactly the case this feature is for. */
const MAX_AGE_MS = 10 * 60_000;

let cache = { at: 0, value: null };

/**
 * Statuses worth showing, and what each is worth.
 *
 * `weight` is a display ordering, NOT a spread adjustment. STRATEGY.md gives
 * point values for a QB out, but applying them to the market number here would
 * be double-counting: by the time a status is official the line has usually
 * already moved, and §4 Step 1 says to trust the market. So this flags what
 * changed and leaves the pricing to the odds -- which is also why the
 * Recommend tab shows injuries NEXT TO line movement rather than folded into
 * the win probability.
 */
const STATUS_WEIGHT = {
  out: 3,
  'injured reserve': 3,
  doubtful: 2,
  suspension: 3,
  suspended: 3,
  questionable: 1,
};

const normalise = (s) => String(s || '').trim().toLowerCase();

/**
 * Every meaningful injury, grouped by team abbreviation.
 *
 * Returns a Map of ABBR -> array of {name, position, status, weight, comment,
 * date}, sorted worst-first, or null when ESPN is unreachable.
 */
export async function fetchInjuries({ maxAgeMs = MAX_AGE_MS } = {}) {
  if (cache.value && Date.now() - cache.at < maxAgeMs) return cache.value;

  let payload;
  try {
    const res = await fetch(URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    payload = await res.json();
  } catch {
    return null;
  }

  const byTeam = new Map();

  for (const team of payload?.injuries || []) {
    const abbr = toAbbr(team?.displayName);
    if (!abbr) continue;

    const rows = [];
    for (const item of team?.injuries || []) {
      const status = normalise(item?.status);

      // ESPN lists the whole roster's injury history, most of it `Active`
      // (i.e. a note about someone who is fine). Only statuses that change
      // availability are of any use here.
      const weight = STATUS_WEIGHT[status];
      if (!weight) continue;

      rows.push({
        name: item?.athlete?.displayName || item?.athlete?.name || 'Unknown',
        position: item?.athlete?.position?.abbreviation || '',
        status: item?.status || '',
        weight,
        comment: item?.shortComment || '',
        date: item?.date || '',
      });
    }

    if (rows.length) byTeam.set(abbr, rows.sort(bySeverity));
  }

  cache = { at: Date.now(), value: byTeam };
  return byTeam;
}

/**
 * A quarterback outranks everyone, whatever the status.
 *
 * Not a stylistic choice: STRATEGY.md §4 Step 3 rates non-QB stars as
 * "fractional, and almost always already priced", so a questionable QB is more
 * decision-relevant than a receiver who is out, and sorting purely by severity
 * would bury it.
 */
function bySeverity(a, b) {
  const qb = (r) => (r.position === 'QB' ? 1 : 0);
  return (qb(b) - qb(a)) || (b.weight - a.weight) || a.name.localeCompare(b.name);
}

/** Is this the injury that actually moves a line? */
export const isQB = (row) => row.position === 'QB';

/**
 * One game's injury picture, as {away, home, worst, hasQB}.
 *
 * `worst` is the single row a one-line summary should quote -- the QB if there
 * is one on either side, else the most severe. Null when the feed is missing,
 * so the caller renders nothing rather than "no injuries", which would be a
 * claim the feed cannot support.
 */
export function forGame(injuries, awayAbbr, homeAbbr) {
  if (!injuries) return null;

  const away = injuries.get(awayAbbr) || [];
  const home = injuries.get(homeAbbr) || [];
  const all = [...away.map((r) => ({ ...r, team: awayAbbr })),
    ...home.map((r) => ({ ...r, team: homeAbbr }))].sort(bySeverity);

  return {
    away,
    home,
    all,
    worst: all[0] || null,
    hasQB: all.some(isQB),
  };
}

/** How fresh the loaded copy is, for an honest timestamp in the UI. */
export function injuriesFetchedAt() {
  return cache.value ? cache.at : null;
}
