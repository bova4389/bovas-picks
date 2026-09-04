/* ==========================================================================
   Live scoreboard client — ESPN, straight from the browser.

   WHY THIS FETCHES CLIENT-SIDE when every other feed in this project is a
   committed JSON file: those feeds are slow-moving and one of them (odds)
   carries a rate-limited API key that must never reach client JS. Scores are
   the opposite on both counts. They change every few minutes for three hours
   on a Sunday, and the endpoint is keyless and public. Routing them through a
   cron job would mean either a stale scoreboard or a commit every 30 seconds.

   ENDPOINT NOTE, and it is the opposite of scripts/fetch_schedule.py's. That
   script uses cdn.espn.com because site.api.espn.com 403s from datacenter IPs
   (GitHub Actions runners included). From a *browser* the site API works fine
   and sends permissive CORS headers, and it is the better endpoint here: it
   carries live clock, possession, and red-zone state that the CDN schedule
   payload does not. So:

       browser  -> site.api.espn.com/.../scoreboard     (this file)
       CI / CLI -> cdn.espn.com/core/nfl/schedule       (fetch_schedule.py)

   If live scores ever go blank while the committed schedule keeps updating,
   that split is the first thing to check.

   NEVER add a ?v= to this file — see data.js's note on module identity.
   ========================================================================== */

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

/** Cached responses keyed by season+week, with the instant they were fetched.
 *  Callers pass their own freshness tolerance: the Schedule tab wants ~25s
 *  while games are live, and effectively forever for a week that is over. */
const cache = new Map();

/**
 * One week's games from ESPN, normalized — or null if ESPN is unreachable.
 *
 * NEVER THROWS. Every caller treats a null as "no live layer available" and
 * falls back to the committed schedule, so an ESPN outage or an offline phone
 * degrades to kickoff times rather than an empty page.
 */
export async function fetchScoreboard(season, week, { maxAgeMs = 25_000 } = {}) {
  const key = `${season}:${week}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;

  try {
    const url = `${BASE}?dates=${season}&seasontype=2&week=${week}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const value = {
      season: json.season?.year ?? season,
      week: json.week?.number ?? week,
      fetchedAt: new Date().toISOString(),
      games: (json.events || []).map(normalise).filter(Boolean),
    };

    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    // Keep serving the last good payload if we have one — a single dropped
    // poll on a flaky phone connection shouldn't blank out a live scoreboard.
    return hit ? hit.value : null;
  }
}

/** Drop cached weeks so the next call refetches. Used by the manual refresh. */
export function clearScoreboardCache() {
  cache.clear();
}

/* ── Normalization ────────────────────────────────────────────────────────
   ESPN's payload is deeply nested and every level is optional in practice
   (postponed games, TBD kickoffs, the odd malformed preseason entry). Pull
   out a flat shape and let anything unrecognisable fall out via null.
   ------------------------------------------------------------------------ */

function normalise(ev) {
  const comp = ev?.competitions?.[0];
  if (!comp || !Array.isArray(comp.competitors)) return null;

  const sides = {};
  for (const c of comp.competitors) sides[c.homeAway] = c;
  if (!sides.home || !sides.away) return null;

  const type = ev.status?.type || {};
  const state = type.state === 'in' ? 'in' : type.state === 'post' ? 'post' : 'pre';

  const awayScore = toScore(sides.away.score);
  const homeScore = toScore(sides.home.score);

  return {
    id: String(ev.id),
    kickoff: ev.date || comp.date || null,
    state,
    completed: Boolean(type.completed),

    awayAbbr: abbrOf(sides.away),
    homeAbbr: abbrOf(sides.home),
    awayScore,
    homeScore,

    period: ev.status?.period ?? 0,
    clock: ev.status?.displayClock ?? null,
    // ESPN's own phrasing — "Final/OT", "Postponed", "8:42 - 3rd Quarter".
    // Kept as the fallback label for states we don't format ourselves.
    detail: type.shortDetail || type.description || null,

    // `winner` is only trustworthy once the game is over; ESPN leaves it
    // undefined mid-game rather than marking the current leader.
    winner: state === 'post' ? sideWinner(sides, awayScore, homeScore) : null,

    broadcast: broadcastOf(comp),
    ...liveDetail(comp, sides, state),
  };
}

function toScore(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function abbrOf(side) {
  return side.team?.abbreviation || null;
}

function sideWinner(sides, awayScore, homeScore) {
  if (sides.away.winner === true) return 'away';
  if (sides.home.winner === true) return 'home';
  // Ties are real in the NFL and ESPN sets `winner: false` on both sides for
  // them, so fall back to the scores rather than reporting "no winner yet".
  if (awayScore == null || homeScore == null) return null;
  if (awayScore === homeScore) return 'tie';
  return awayScore > homeScore ? 'away' : 'home';
}

function broadcastOf(comp) {
  const names = comp.broadcasts?.flatMap((b) => b.names || []) || [];
  return names.length ? [...new Set(names)].join(', ') : null;
}

/** Possession and red-zone state, live games only. Absent otherwise. */
function liveDetail(comp, sides, state) {
  if (state !== 'in' || !comp.situation) return {};

  const byId = {
    [sides.away.id]: 'away',
    [sides.home.id]: 'home',
  };

  return {
    possession: byId[comp.situation.possession] || null,
    downDistance: comp.situation.downDistanceText || null,
    redZone: Boolean(comp.situation.isRedZone),
  };
}
