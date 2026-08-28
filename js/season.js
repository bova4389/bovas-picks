/* ==========================================================================
   Season identity, and the cross-feed guard that keeps two different seasons
   from being silently combined.

   THE FAILURE THIS EXISTS TO PREVENT. Every feed here carries its own year,
   and nothing used to check that they agreed. With SEASON pinned to 2025
   while the odds feed had rolled to 2026, the Recommend tab happily joined
   2025 Week 1 field popularity to 2026 preseason moneylines and printed
   confident leverage numbers for games that were never on the same slate.
   Nothing threw. Nothing looked wrong. That is the whole danger — a pool
   tool that fails loudly costs you nothing, and one that fails quietly costs
   you the week.

   The schedule feed is the authority: it comes from ESPN, covers all 18
   weeks, and is refreshed weekly, so it is the one source that always knows
   what season it actually is. Everything else is checked against it.

   PURE MODULE — deliberately imports nothing. data.js imports activeSeason()
   to derive its SEASON constant, so any import back into data.js would be a
   cycle. Callers load the feeds and hand them in.

   NEVER add a ?v= to this file — see data.js's note on why a versioned and an
   unversioned import are two separate module instances.
   ========================================================================== */

/**
 * The NFL season year for an instant.
 *
 * A season is named for the year it kicks off in, so January and February
 * playoff dates still belong to the *previous* season — 2027-01-10 is a 2026
 * season game. March is the cut point: the league year flips in mid-March and
 * nothing is scheduled between the Super Bowl and then, so any boundary in
 * that gap works and March is the least surprising one.
 */
export function seasonOf(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCMonth() + 1 >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Which season "now" falls in. Derived, never hardcoded — a pinned constant
 *  is exactly what went stale and caused the mismatch described above. */
export function activeSeason(now = new Date()) {
  return seasonOf(now);
}

/** The season a set of odds events belongs to — the most common season across
 *  their kickoff times, so one stray mis-dated event can't swing the verdict. */
export function seasonOfOdds(events) {
  if (!Array.isArray(events) || !events.length) return null;

  const tally = new Map();
  for (const ev of events) {
    const s = seasonOf(ev.commenceTime);
    if (s != null) tally.set(s, (tally.get(s) || 0) + 1);
  }
  if (!tally.size) return null;

  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Check every loaded feed against the active season.
 *
 * Feeds are passed in already-loaded and each may be null (not fetched, or
 * doesn't exist yet) — a missing feed is reported as `missing`, never as a
 * mismatch, because "the 2026 workbook hasn't arrived" and "you are looking
 * at last season's workbook" need very different messages.
 *
 *   feeds = { season, schedule, numberMap, odds, popularity }
 *
 * Returns { season, feeds: {...}, problems: [...], ok, blocking }
 * where each problem is { level: 'error'|'warn', feed, message }.
 * `blocking` is true when any error-level problem exists — tabs that would
 * otherwise compute across feeds must refuse to render numbers.
 */
export function auditSeason({
  season = activeSeason(),
  schedule = null,
  numberMap = null,
  odds = null,
  popularity = null,
} = {}) {
  const problems = [];
  const found = {};

  const check = (name, year, { level = 'error', label, missing } = {}) => {
    found[name] = year ?? null;
    if (year == null) {
      if (missing) problems.push({ level: 'warn', feed: name, message: missing });
      return;
    }
    if (year !== season) {
      problems.push({
        level,
        feed: name,
        message: `${label} is ${year} data, but the ${season} season is active.`,
      });
    }
  };

  check('schedule', schedule?.year, {
    label: 'The schedule',
    missing: `No schedule loaded for ${season}. Run \`python scripts/fetch_schedule.py ${season}\`.`,
  });

  check('numberMap', numberMap?.year, {
    label: "The commissioner's week sheet",
    missing: `The ${season} week sheet has not been parsed yet — the pool's picks and leverage views stay closed until it arrives.`,
  });

  check('odds', seasonOfOdds(odds?.events), {
    label: 'The odds snapshot',
    missing: 'No odds snapshot loaded — favorite badges and leverage will be blank.',
  });

  check('popularity', popularity?.year, { label: 'The field popularity file' });

  // The pairing that actually produces wrong answers rather than blank ones.
  // Worth calling out separately: each feed could individually match the
  // season and this would still be the check that matters most.
  if (found.popularity != null && found.odds != null && found.popularity !== found.odds) {
    problems.push({
      level: 'error',
      feed: 'leverage',
      message:
        `Leverage would combine ${found.popularity} field popularity with ` +
        `${found.odds} market odds. Those are different seasons — the ranking ` +
        `would be meaningless, so it is not being shown.`,
    });
  }

  return {
    season,
    feeds: found,
    problems,
    ok: problems.length === 0,
    blocking: problems.some((p) => p.level === 'error'),
  };
}

/**
 * The cross-check for the two survivor tabs — Grid and Planning.
 *
 * Both read the same three feeds and neither touches the commissioner's number
 * map, so auditSeason()'s report on that map would hang a permanent "waiting
 * on data" banner over tables that are completely fine without it. Filtered
 * out here rather than ignored by each caller.
 *
 * Projections are checked here instead of inside auditSeason() because they
 * are the feed these two tabs introduced: a projections file from the wrong
 * season would fill 576 grid cells and every planning number with plausible
 * nonsense, which is the exact failure this module exists to catch.
 *
 * Shared rather than copied. Two tabs deciding independently whether the feeds
 * agree is two chances to decide differently, and the one that says yes is the
 * one that prints the nonsense.
 */
export function auditSurvivorFeeds({ season, schedule, odds, projections }) {
  const base = auditSeason({ season, schedule, odds });
  const problems = base.problems.filter((p) => p.feed !== 'numberMap');

  if (projections && Number(projections.year) !== Number(season)) {
    problems.push({
      level: 'error', feed: 'projections',
      message: `The projections file is ${projections.year} data, but the ${season} season is active.`,
    });
  }

  return {
    ...base, problems,
    ok: problems.length === 0,
    blocking: problems.some((p) => p.level === 'error'),
  };
}
