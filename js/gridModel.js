/* ==========================================================================
   Grid model — the 32 x 18 matrix behind the Grid tab.

   Pure data: takes already-loaded feeds and returns one cell per team-week,
   with every fact the grid can paint or mark. No DOM, no fetching, no
   colours. js/grid.js decides what any of it should look like.

   Splitting it out is not tidiness for its own sake. The same matrix answers
   "which weeks can this team be spent" for survivor and "who is favoured this
   week" for the straight-up pool, and those two views must never disagree
   about a game. One builder, two readers.

   WIN PROBABILITY HAS A SOURCE, ALWAYS. Market odds override projections
   where both exist, and `probSource` says which one a number came from --
   CLAUDE.md requires the UI to distinguish them, because a 78% projection
   four weeks out is a far softer claim than a 78% moneyline on Saturday.
   Never average the two.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { ABBR_TO_MASCOT, DIVISION_OF, conferenceOf } from './teams.js';
import { buildSeasonOddsIndex, matchSeasonOdds } from './oddsMatch.js';

const ET = 'America/New_York';
const DAY_MS = 86_400_000;

/** Kickoff slots, in the order a week runs. */
export const SLOTS = ['WED', 'THU', 'FRI', 'SAT', 'INTL', 'SUN', 'SNF', 'MNF', 'TBD'];

/** Slots that are their own standalone broadcast window -- one game, whole
 *  country watching, and the short week or the long rest that comes with it. */
const PRIMETIME = new Set(['SNF', 'MNF', 'THU', 'WED', 'FRI', 'SAT']);

/* ── Kickoff classification ─────────────────────────────────────────────── */

const etFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ET, weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false,
});

/** {weekday:'Thu', hour:20, minute:15} in Eastern time, or null. Eastern is
 *  hardcoded on purpose: the NFL schedules in it, so "Thursday night" means
 *  Thursday night in Charlotte no matter where the grid is being read. */
function easternParts(iso) {
  if (!iso) return null;
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return null;

  const parts = Object.fromEntries(
    etFormat.formatToParts(t).map((p) => [p.type, p.value])
  );
  return {
    weekday: parts.weekday,
    hour: Number(parts.hour) % 24,   // hour12:false yields "24" at midnight
    minute: Number(parts.minute),
  };
}

/**
 * Which window a game kicks in.
 *
 * MIDNIGHT EASTERN IS NOT A KICKOFF, IT IS A PLACEHOLDER. ESPN carries the
 * late-season flex games at 00:00 with no time assigned yet -- 24 of them in
 * the 2026 file, all in Weeks 16-18. Read literally, every one of those looks
 * like a Sunday game, and the rest-days figure either side of it is fiction.
 * They are reported as TBD instead, and the grid renders no slot mark and no
 * rest figure for them rather than a confident wrong one.
 */
export function slotOf(iso) {
  const p = easternParts(iso);
  if (!p) return 'TBD';

  const { weekday, hour, minute } = p;
  if (hour === 0 && minute === 0) return 'TBD';

  if (weekday === 'Wed') return 'WED';
  if (weekday === 'Thu') return 'THU';
  if (weekday === 'Fri') return 'FRI';
  if (weekday === 'Sat') return 'SAT';
  if (weekday === 'Mon' || weekday === 'Tue') return 'MNF';

  // Sunday. Nothing domestic kicks before 1pm Eastern, so the morning window
  // is the international slate -- all six of 2026's 9:30am games are abroad.
  if (hour < 12) return 'INTL';
  if (hour >= 19) return 'SNF';
  return 'SUN';
}

/* ── Matchup classification ─────────────────────────────────────────────── */

/** 'division' | 'conference' | 'interconference'. Divisional games are the
 *  ones the market prices tightest and the model trusts least; conference
 *  games are the tier below. Both are toggleable marks on the grid. */
export function matchupType(a, b) {
  if (DIVISION_OF[a] && DIVISION_OF[a] === DIVISION_OF[b]) return 'division';
  return conferenceOf(a) === conferenceOf(b) ? 'conference' : 'interconference';
}

/* ── The build ──────────────────────────────────────────────────────────── */

/**
 * One cell per team per week.
 *
 * @param schedule    data/schedule-<year>.json   (required -- the backbone)
 * @param projections data/projections-<year>.json (optional)
 * @param odds        data/odds/current.json       (optional)
 * @returns {{weeks:number[], teams:string[], cells:Map, records:Map,
 *            counts:{market:number, projected:number, none:number}}}
 *          `cells` is keyed `TEAM|WEEK`.
 */
export function buildGrid({ schedule, projections = null, odds = null } = {}) {
  const games = schedule?.games || [];
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  const teams = Object.keys(ABBR_TO_MASCOT).sort();

  const oddsIndex = odds?.events ? buildSeasonOddsIndex(odds.events) : new Map();
  const projById = new Map((projections?.games || []).map((g) => [String(g.id), g]));

  const cells = new Map();
  const records = new Map(teams.map((t) => [t, { w: 0, l: 0, t: 0 }]));
  const counts = { market: 0, projected: 0, none: 0 };

  // Bye cells first, so a team with no game in a week is never just a hole --
  // the grid has to say "bye", and a missing key would look like a data fault.
  for (const week of weeks) {
    const byes = schedule?.byes?.[String(week)] || [];
    for (const team of byes) {
      cells.set(key(team, week), { team, week, bye: true });
    }
  }

  for (const game of games) {
    const ev = matchSeasonOdds(
      { away: ABBR_TO_MASCOT[game.away], home: ABBR_TO_MASCOT[game.home], date: game.date },
      oddsIndex
    );
    const proj = projById.get(String(game.id));
    const slot = slotOf(game.date);
    const type = matchupType(game.away, game.home);
    const final = game.completed && game.homeScore != null && game.awayScore != null;

    if (ev) counts.market += 1;
    else if (proj) counts.projected += 1;
    else counts.none += 1;

    for (const side of ['away', 'home']) {
      const team = game[side];
      const opp = game[side === 'away' ? 'home' : 'away'];
      const isHome = side === 'home';

      // Both sources are oriented to the ODDS EVENT'S OWN home/away, which is
      // not guaranteed to match the schedule's for a neutral-site game. Match
      // on the team, never on the position.
      const prob = ev
        ? probFromEvent(ev, ABBR_TO_MASCOT[team])
        : proj
          ? (isHome ? proj.homeWinProb : proj.awayWinProb)
          : null;

      cells.set(key(team, game.week), {
        team,
        week: game.week,
        bye: false,
        gameId: String(game.id),
        opp,
        isHome,
        kickoff: game.date || null,
        slot,
        timeTBD: slot === 'TBD',
        primetime: PRIMETIME.has(slot),
        type,
        divisional: type === 'division',
        conference: type === 'conference',
        winProb: prob,
        probSource: prob == null ? null : (ev ? 'market' : 'projection'),
        oddsEventId: ev?.id || null,
        projMargin: proj ? (isHome ? proj.projMargin : -proj.projMargin) : null,
        // Rest is filled in below -- it needs the team's whole season, which
        // is not knowable one game at a time.
        restDays: null,
        offBye: false,
        shortWeek: false,
        state: final ? 'post' : 'pre',
        score: final ? { for: game[`${side}Score`], against: game[`${side === 'away' ? 'home' : 'away'}Score`] } : null,
        result: final ? resultFor(game, side) : null,
      });

      if (final) {
        const r = records.get(team);
        const res = resultFor(game, side);
        if (res === 'won') r.w += 1;
        else if (res === 'lost') r.l += 1;
        else r.t += 1;
      }
    }
  }

  addRest(cells, teams, weeks);

  return { weeks, teams, cells, records, counts };
}

export const key = (team, week) => `${team}|${week}`;

function probFromEvent(ev, mascot) {
  const last = (s) => String(s).trim().split(/\s+/).pop();
  if (last(ev.home) === mascot) return ev.homeWinProb ?? null;
  if (last(ev.away) === mascot) return ev.awayWinProb ?? null;
  return null;
}

function resultFor(game, side) {
  if (game.homeScore === game.awayScore) return 'tied';
  const homeWon = game.homeScore > game.awayScore;
  return (side === 'home') === homeWon ? 'won' : 'lost';
}

/**
 * Days between a team's previous kickoff and this one.
 *
 * Reported as a plain fact, never as an edge. STRATEGY.md bans situational
 * angles -- revenge games, letdown and lookahead spots -- because they are
 * post-hoc filtered noise, and "off a bye" highlighted in green is that same
 * move wearing a lab coat. Rest is here so the grid can say a team is on a
 * four-day turnaround, which is a property of the schedule, and it is left to
 * the market number in the same cell to say whether that matters.
 *
 * Games with no assigned kickoff (see slotOf) contribute nothing: they neither
 * receive a rest figure nor let the next game measure from them.
 */
function addRest(cells, teams, weeks) {
  for (const team of teams) {
    let prev = null;
    for (const week of weeks) {
      const cell = cells.get(key(team, week));
      if (!cell || cell.bye) continue;
      if (cell.timeTBD || !cell.kickoff) { prev = null; continue; }

      const t = new Date(cell.kickoff).getTime();
      if (prev != null) {
        const days = Math.round((t - prev) / DAY_MS);
        cell.restDays = days;
        cell.offBye = days >= 13;
        cell.shortWeek = days <= 5;
      }
      prev = t;
    }
  }
}

/* ── Derived views ──────────────────────────────────────────────────────── */

/** Mean win probability for a team over a window of weeks, ignoring byes and
 *  unpriced games. Null when the window holds nothing to average -- used for
 *  the "best spots ahead" row sort, where a team on bye must not sort as 0%. */
export function windowStrength(cells, team, weeks) {
  const probs = weeks
    .map((w) => cells.get(key(team, w)))
    .filter((c) => c && !c.bye && c.winProb != null)
    .map((c) => c.winProb);

  return probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : null;
}
