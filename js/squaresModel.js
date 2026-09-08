/* ==========================================================================
   Squares — the math, as pure data. No DOM, no fetch.

   A squares board is 100 cells owned by name. AFTER the board is full, ten
   digits are drawn across the top and ten down the side; a cell wins a period
   when the two teams' scores END that period on its pair of digits. This pool
   pays every quarter of every Colts game, eighteen weeks, and REDRAWS THE
   DIGITS EVERY WEEK while the names stay put.

   THAT REDRAW IS THE WHOLE CHARACTER OF THE GAME, and it is worth stating
   plainly because it is the opposite of a one-off Super Bowl board. There,
   7-0 is a gold ticket and 2-5 is wastepaper. Here every square is dealt a
   fresh pair eighteen times, so all 100 are worth exactly the same over a
   season — there is nothing to angle for, and no square to feel bad about.
   The variance lives entirely inside a single week. That is why nothing in
   this file scores or ranks a square: the only honest per-square number is
   "here is what you drew this week", and the tabs say exactly that.

   NEVER add a ?v= to this file — see js/data.js on module identity.
   ========================================================================== */

/* ── Pool + week lookup ───────────────────────────────────────────────────*/

/** One pool out of the document, by id. Null when absent. */
export function poolById(doc, id) {
  return (doc?.pools || []).find((p) => p.id === id) || null;
}

/** One week's configuration out of a pool. Null when absent. */
export function weekConfig(pool, week) {
  return (pool?.weeks || []).find((w) => w.week === Number(week)) || null;
}

/** Ascending week numbers the pool pays out on. */
export function payoutWeeks(pool) {
  return (pool?.weeks || []).map((w) => w.week).sort((a, b) => a - b);
}

/**
 * Whether the digits for a week have been drawn and entered.
 *
 * Both axes must be a full set of ten distinct digits. A half-entered draw is
 * treated as no draw at all rather than rendered as a partial board — a board
 * showing six of ten digits invites reading a square off it that isn't yours.
 */
export function hasDigits(weekCfg) {
  const d = weekCfg?.digits;
  return Boolean(d) && isDigitSet(d.cols) && isDigitSet(d.rows);
}

function isDigitSet(list) {
  return Array.isArray(list)
    && list.length === 10
    && new Set(list).size === 10
    && list.every((n) => Number.isInteger(n) && n >= 0 && n <= 9);
}

/** Whether the 100 names have been loaded. */
export function hasEntries(pool) {
  return Array.isArray(pool?.entries) && pool.entries.length === 10;
}

/** The name in a cell, or '' when the board has not arrived. */
export function entryAt(pool, row, col) {
  return hasEntries(pool) ? (pool.entries[row]?.[col] ?? '') : '';
}

/** Whether a cell is one of yours. */
export function isMine(pool, row, col) {
  return (pool?.mine || []).some((s) => s.row === row && s.col === col);
}

/* ── Reading the game ─────────────────────────────────────────────────────
   ESPN reports points scored IN each period; a squares board is graded on the
   running score AT the end of one. Everything below converts between those.
   ------------------------------------------------------------------------ */

/**
 * Whether period `n` (1-indexed) has finished.
 *
 * ESPN leaves `period` at 2 for the whole of halftime rather than advancing
 * it, so the clock alone would call the half unfinished right up until the
 * second-half kickoff — which is exactly when a halftime payout is being
 * looked up. The status text is the tiebreaker: ESPN writes "Halftime" and
 * "End of 1st" itself.
 */
function periodClosed(game, n) {
  if (!game) return false;
  if (game.state === 'post') return true;
  if ((game.period ?? 0) > n) return true;

  const detail = String(game.detail || '');
  if (n === 2 && /halftime/i.test(detail)) return true;

  const endOf = detail.match(/end of (\d)/i);
  return endOf ? Number(endOf[1]) >= n : false;
}

/** Running total through period `n`, or null when ESPN has not reported it. */
function through(line, n) {
  if (!Array.isArray(line) || line.length < n) return null;
  return line.slice(0, n).reduce((sum, pts) => sum + pts, 0);
}

/**
 * The four graded scores for a game: `{ key, label, away, home, closed }`.
 *
 * `away`/`home` stay null until that period is both closed and reported, and
 * the two conditions are separate on purpose — a week ESPN cannot serve still
 * grades its Final from the committed schedule, because that file carries
 * final scores even though it carries no period breakdown at all.
 *
 * `overtime` is the commissioner's rule for the last payout: 'final' pays on
 * the score the game actually ended on, 'regulation' pays on the score at the
 * end of the fourth. Identical for any game that did not go to overtime.
 */
export function periodScores(game, periods, { overtime = 'final' } = {}) {
  return periods.map((period, i) => {
    const n = i + 1;
    const isLast = n === periods.length;

    if (isLast) {
      const closed = game?.state === 'post';
      const regulation = overtime === 'regulation';
      return {
        key: period.key,
        label: period.label,
        closed,
        away: closed
          ? (regulation ? through(game.awayLine, 4) ?? game.awayScore : game.awayScore)
          : null,
        home: closed
          ? (regulation ? through(game.homeLine, 4) ?? game.homeScore : game.homeScore)
          : null,
      };
    }

    const closed = periodClosed(game, n);
    return {
      key: period.key,
      label: period.label,
      closed,
      away: closed ? through(game?.awayLine, n) : null,
      home: closed ? through(game?.homeLine, n) : null,
    };
  });
}

/**
 * Point an away/home score pair at the board's two axes.
 *
 * The board is labeled by team, not by home and away, and on the Colts' bye
 * week it is not a Colts game at all — so which axis a team sits on is stored
 * per week rather than inferred. Nulls pass straight through.
 */
export function orient(weekCfg, awayScore, homeScore) {
  const colsIsHome = weekCfg?.colsTeam === weekCfg?.home;
  return {
    cols: colsIsHome ? homeScore : awayScore,
    rows: colsIsHome ? awayScore : homeScore,
  };
}

/** Last digit of a score. Null in, null out. */
export const lastDigit = (score) => (score == null ? null : Math.abs(score) % 10);

/**
 * Which cell a pair of scores lands on: `{ row, col }`, or null.
 *
 * Null covers three different situations that all mean "highlight nothing" —
 * no digits drawn, the period not graded, or a digit somehow missing from the
 * drawn set — and every caller treats them identically.
 */
export function cellFor(weekCfg, colsScore, rowsScore) {
  if (!hasDigits(weekCfg) || colsScore == null || rowsScore == null) return null;

  const col = weekCfg.digits.cols.indexOf(lastDigit(colsScore));
  const row = weekCfg.digits.rows.indexOf(lastDigit(rowsScore));
  return col < 0 || row < 0 ? null : { row, col };
}

/**
 * The square the score is sitting on RIGHT NOW, or null.
 *
 * Distinct from the graded cells in gradeWeek(): those are periods that have
 * closed and paid, this is where the ball is this second. A cell can be both,
 * and the board draws them differently, so they are computed separately
 * rather than one being derived from the other.
 */
export function liveCell(weekCfg, game) {
  if (!game || game.state !== 'in') return null;

  const { cols, rows } = orient(weekCfg, game.awayScore, game.homeScore);
  return cellFor(weekCfg, cols, rows);
}

/* ── Which week to open on ─────────────────────────────────────────────────────────*/

/** Wednesday, as getDay() counts them. */
const WEDNESDAY = 3;

/**
 * A week stays on screen until 2pm the Wednesday after its game.
 *
 * The pool's rhythm, not the NFL's: the game is played, the four payouts are
 * settled, and people look at what they won for a few days afterward. Flipping
 * to next week's empty board the moment the whistle blows would hide the only
 * thing anybody wants to see on a Monday morning. Wednesday 2pm local is the
 * changeover, so the board turns over midweek and is ready before Thursday.
 *
 * The 36-hour tail is what makes one rule cover every kickoff slot. Measured
 * from a Sunday afternoon game it lands early Monday, so the cutover is that
 * same week's Wednesday; measured from a Monday nighter -- which is what the
 * Colts' bye week grades on -- it lands Wednesday morning, so the cutover is
 * that afternoon rather than eight days later. Without it, a Monday game would
 * have to be special-cased, and the one week that needs the special case is the
 * one nobody would remember to test.
 */
export function cutoverFor(kickoff, tailHours = 36) {
  const settled = new Date(new Date(kickoff).getTime() + tailHours * 3_600_000);

  const at = new Date(settled);
  at.setHours(14, 0, 0, 0);
  while (at.getDay() !== WEDNESDAY || at < settled) {
    at.setDate(at.getDate() + 1);
    at.setHours(14, 0, 0, 0);
  }
  return at;
}

/**
 * The week to show on open: the first one whose cutover has not passed.
 *
 * Local time throughout, deliberately -- this is a pool played in one room in
 * Indianapolis, and "Wednesday at 2" means the clock on the wall there, which
 * for anyone actually using this is the clock on their own phone.
 *
 * Falls back to the last payout week once the season is over, so January opens
 * on Week 18 rather than on nothing.
 */
export function defaultWeek(pool, now = new Date()) {
  const weeks = [...(pool?.weeks || [])].sort((a, b) => a.week - b.week);
  if (!weeks.length) return null;

  const live = weeks.find((w) => w.kickoff && cutoverFor(w.kickoff) > now);
  return (live || weeks[weeks.length - 1]).week;
}

/* ── Grading a week ───────────────────────────────────────────────────────*/

/**
 * Every payout for one week: who won each period and what it paid.
 *
 * Always returns one entry per period, graded or not, so the board and the
 * ledger render a stable four-row shape from kickoff onward instead of
 * growing rows as the game goes.
 */
export function gradeWeek(pool, weekCfg, game) {
  const scores = periodScores(game, pool.periods, { overtime: pool.overtime });

  return scores.map((s) => {
    const { cols, rows } = orient(weekCfg, s.away, s.home);
    const cell = cellFor(weekCfg, cols, rows);

    return {
      key: s.key,
      label: s.label,
      closed: s.closed,
      graded: cell != null,
      colsScore: cols,
      rowsScore: rows,
      colsDigit: lastDigit(cols),
      rowsDigit: lastDigit(rows),
      cell,
      winner: cell ? entryAt(pool, cell.row, cell.col) : '',
      mine: cell ? isMine(pool, cell.row, cell.col) : false,
      payout: pool.payoutPerQuarter,
    };
  });
}

/**
 * Season totals across every week that has been graded.
 *
 * `games` is a Map of week number to game state; a week missing from it is
 * simply ungraded, which is the normal state for most of the season.
 */
export function ledger(pool, games) {
  const rows = (pool.weeks || []).map((weekCfg) => {
    const game = games.get(weekCfg.week) || null;
    const periods = game ? gradeWeek(pool, weekCfg, game) : blankPeriods(pool);
    const hits = periods.filter((p) => p.mine).length;

    return {
      week: weekCfg.week,
      weekCfg,
      game,
      periods,
      hits,
      won: hits * pool.payoutPerQuarter,
      settled: periods.every((p) => p.graded),
    };
  });

  const stake = (pool.mine?.length || 0) * pool.buyIn;
  const won = rows.reduce((sum, r) => sum + r.won, 0);
  const openWeeks = rows.filter((r) => !r.settled).length;

  return {
    rows,
    stake,
    won,
    net: won - stake,
    hits: rows.reduce((sum, r) => sum + r.hits, 0),
    settledWeeks: rows.length - openWeeks,
    // What is still on the table across the rest of the season, at the pool
    // level — not an expectation for your square. The per-square share of it
    // is economics().evPerSquare.
    remaining: openWeeks * pool.periods.length * pool.payoutPerQuarter,
  };
}

function blankPeriods(pool) {
  return pool.periods.map((p) => ({
    key: p.key, label: p.label, closed: false, graded: false,
    colsScore: null, rowsScore: null, colsDigit: null, rowsDigit: null,
    cell: null, winner: '', mine: false, payout: pool.payoutPerQuarter,
  }));
}

/**
 * A finished week rebuilt from the result frozen into the pool document.
 *
 * WHY FREEZE AT ALL, when ESPN can be asked again: the committed schedule
 * carries final scores but no period breakdown, so a week graded only from it
 * loses its three quarter payouts the moment ESPN stops serving that week.
 * Writing the four numbers into data/squares-<year>.json once, when the game
 * ends, makes the ledger permanent, offline and immune to a feed changing its
 * mind — the same reason the Majors pool hardcodes a tournament once it is
 * over. The live path stays authoritative for the week in progress.
 */
export function frozenGame(weekCfg) {
  const r = weekCfg?.result;
  if (!r) return null;

  const away = r.awayScore ?? null;
  const home = r.homeScore ?? null;

  return {
    id: String(weekCfg.gameId),
    week: weekCfg.week,
    state: 'post',
    completed: true,
    isLive: false,
    awayAbbr: weekCfg.away,
    homeAbbr: weekCfg.home,
    awayScore: away,
    homeScore: home,
    awayLine: r.awayLine || [],
    homeLine: r.homeLine || [],
    period: (r.awayLine || []).length || 4,
    clock: null,
    detail: r.detail || 'Final',
    winner: away == null || home == null ? null
      : away === home ? 'tie' : away > home ? 'away' : 'home',
    leader: null,
  };
}

/**
 * Who has collected what, across every graded period.
 *
 * Rows come from ledger(). Squares with no name attached are skipped rather
 * than pooled into an "unknown" line — before the board arrives that would be
 * a single row claiming every dollar in the pool.
 */
export function leaderboard(rows) {
  const tally = new Map();

  for (const row of rows) {
    for (const p of row.periods) {
      if (!p.graded || !p.winner) continue;
      const entry = tally.get(p.winner) || { name: p.winner, hits: 0, won: 0 };
      entry.hits += 1;
      entry.won += p.payout;
      tally.set(p.winner, entry);
    }
  }

  return [...tally.values()].sort((a, b) => b.won - a.won || a.name.localeCompare(b.name));
}

/* ── The pool's economics ─────────────────────────────────────────────────*/

/**
 * What the pool collects, what it pays, and what a square is worth.
 *
 * Stated rather than buried, because it is the one number a $250 buy-in
 * should come with: this is a charity board, the rake IS the donation, and a
 * square returns less than it costs by exactly the amount St. Jude receives.
 */
export function economics(pool) {
  const collected = pool.squareCount * pool.buyIn;
  const payouts = pool.weeks.length * pool.periods.length;
  const paid = payouts * pool.payoutPerQuarter;

  return {
    collected,
    paid,
    charity: collected - paid,
    charityPct: collected ? (collected - paid) / collected : 0,
    payouts,
    evPerSquare: paid / pool.squareCount,
    returnPct: pool.buyIn ? paid / pool.squareCount / pool.buyIn : 0,
  };
}

/* ── Live: what would put you in the money ────────────────────────────────*/

/** The ways a football team's score moves in one scoring play. */
const SCORING_PLAYS = [
  { delta: 2, label: 'a safety' },
  { delta: 3, label: 'a field goal' },
  { delta: 6, label: 'a touchdown, missed kick' },
  { delta: 7, label: 'a touchdown' },
  { delta: 8, label: 'a touchdown and two' },
];

/**
 * Single scores that would move a live game onto one of your squares.
 *
 * ONE score by ONE team, deliberately — not every two- and three-score
 * sequence that eventually lands there. With ten digits per axis, some
 * combination almost always reaches any square, so listing them all would say
 * nothing; the useful question during a game is what the NEXT score does.
 *
 * Returns `{ onIt, plays }`. `onIt` means the score is already sitting on one
 * of your squares, which is the thing to say loudest.
 */
export function liveOutlook(pool, weekCfg, colsScore, rowsScore) {
  if (!hasDigits(weekCfg) || colsScore == null || rowsScore == null) {
    return { onIt: false, plays: [] };
  }

  const here = cellFor(weekCfg, colsScore, rowsScore);
  const onIt = Boolean(here) && isMine(pool, here.row, here.col);

  const plays = [];
  for (const axis of ['cols', 'rows']) {
    for (const play of SCORING_PLAYS) {
      const cols = axis === 'cols' ? colsScore + play.delta : colsScore;
      const rows = axis === 'rows' ? rowsScore + play.delta : rowsScore;

      const cell = cellFor(weekCfg, cols, rows);
      if (!cell || !isMine(pool, cell.row, cell.col)) continue;

      plays.push({
        team: axis === 'cols' ? weekCfg.colsTeam : weekCfg.rowsTeam,
        label: play.label,
        delta: play.delta,
        colsScore: cols,
        rowsScore: rows,
      });
    }
  }

  // Cheapest first: a field goal is a likelier rescue than a two-point try.
  plays.sort((a, b) => a.delta - b.delta);
  return { onIt, plays };
}
