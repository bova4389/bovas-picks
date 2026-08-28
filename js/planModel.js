/* ==========================================================================
   Survivor planning model — what a team costs to spend now.

   Pure data. Takes the already-built 32 x 18 matrix from js/gridModel.js plus
   my used-teams state, and answers the three questions SURVIVOR-STRATEGY.md
   §1 "Future value" says a survivor player has to ask every week:

     shortlist()   is this the best week I will ever get to spend this team?
     wallAhead()   is a week coming where I have nothing left to spend?
     eliteBudget() where does each remaining team's one best spot fall?

   No DOM, no fetching, no colors. js/planning.js decides what it looks like.

   ── THE SOURCE RULE, which shapes every number in this file ──────────────

   SURVIVOR-STRATEGY.md §4 "The compression limit": regressing last season
   toward the mean flattens the probability spread hard. Nothing in the 2026
   projections reaches 80% and only ~16 games of 272 reach 70%, against a
   market that prices 10 games at 80%+ and 58 at 70%+.

   Two consequences, and getting either wrong makes this file lie:

   1. NEVER COMPARE A MARKET NUMBER TO A PROJECTED ONE. A 72% moneyline this
      week and a 62% projection in Week 11 does NOT mean this week is the
      better spot -- the projection is compressed, not pessimistic. Every
      across-week comparison here is projection-to-projection, drawn from
      `teamOutlook` so both ends of the subtraction come off the same scale.
      The market price rides ALONGSIDE as this week's trust anchor; it never
      enters the arithmetic that ranks one week against another.

   2. NEVER APPLY THE 70% FLOOR TO A PROJECTION. Against projections it
      rejects the entire season. The floor is a market-only test, and
      `clearsFloor` is null -- not false -- when only a projection exists.
      Absent evidence is not evidence of absence, and rendering the two the
      same way is how a team gets written off for a number that was never
      allowed to clear the bar.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { key } from './gridModel.js';

/** SURVIVOR-STRATEGY.md §1: "never pick a team below ~70% to win". Market
 *  odds only -- see rule 2 in the header. */
export const FLOOR = 0.70;

/** How far ahead the wall looks. §1: "Look 3-4 weeks ahead every single week.
 *  Not the whole season -- projections that far out are too noisy -- but far
 *  enough to see a wall coming." Four, so the current week plus three. */
export const LOOKAHEAD = 4;

/* ── Reading the projection series ──────────────────────────────────────── */

/**
 * One team's projected win probability by week, as a Map.
 *
 * Read from `teamOutlook`, NOT from the grid cells, and that is the whole
 * point: the outlook is a single self-consistent series per team, so any two
 * weeks in it are on the same scale and can be subtracted. The grid cells
 * carry market where market exists, which makes them right for display and
 * wrong for this.
 */
export function projSeries(projections, team) {
  const games = projections?.teamOutlook?.[team]?.games || [];
  return new Map(games.map((g) => [Number(g.week), Number(g.winProb)]));
}

/**
 * The best week left to spend a team, measured on the projection scale.
 *
 * `bestWeek` / `bestWinProb` already sit in the projections file, but they are
 * the best week of the WHOLE season -- which is the wrong answer the moment a
 * week has gone by, or when a team's peak sits behind us. Recomputed here over
 * the remaining weeks only.
 *
 * Weeks the team is on bye are absent from the series, so they cannot be
 * chosen; a team with nothing left returns null rather than 0.
 */
export function bestRemaining(series, fromWeek, weeks) {
  let best = null;

  for (const week of weeks) {
    if (week < fromWeek) continue;
    const p = series.get(week);
    if (p == null) continue;
    if (!best || p > best.prob) best = { week, prob: p };
  }

  return best;
}

/* ── Block A: this week's shortlist ─────────────────────────────────────── */

/**
 * Every team I could still spend this week, with what spending it costs.
 *
 * `holdCost` is the heart of it: how much better this team's best remaining
 * week is than this one, projection-to-projection. Zero means this IS the
 * best week left -- a free spend, RotoWire's star. A large number means the
 * team is worth more later and spending it now burns that.
 *
 * Sorted by the spend-now case: teams that clear the market floor first, then
 * cheapest to spend. A team with no market price is not sorted above one that
 * has a good price -- an unpriced team is an unknown, not a bargain.
 *
 * Teams already used are excluded outright rather than listed as unavailable:
 * this is a shortlist of what can be picked, and a used team cannot.
 */
export function shortlist({ model, projections, week, used, weeks }) {
  const rows = [];

  for (const team of model.teams) {
    if (used.has(team)) continue;

    const cell = model.cells.get(key(team, week));
    if (!cell || cell.bye) continue;

    const series = projSeries(projections, team);
    const projNow = series.get(week) ?? null;
    const best = bestRemaining(series, week, weeks);

    // Only meaningful when both ends came off the projection series. A team
    // the projections do not cover gets no cost rather than a cost of zero,
    // which would read as "free to spend".
    const holdCost = (projNow != null && best) ? best.prob - projNow : null;

    rows.push({
      team,
      opp: cell.opp,
      isHome: cell.isHome,
      kickoff: cell.kickoff,
      divisional: cell.divisional,
      // What the market says about THIS week, for display and for the floor.
      winProb: cell.winProb,
      probSource: cell.probSource,
      // The floor is a market test only -- null means "no market price", which
      // is not the same as failing it.
      clearsFloor: cell.probSource === 'market' ? cell.winProb >= FLOOR : null,
      // The projection scale, for comparing weeks against each other.
      projNow,
      bestWeek: best?.week ?? null,
      bestProb: best?.prob ?? null,
      isBestWeek: Boolean(best && best.week === week),
      holdCost,
    });
  }

  return rows.sort(compareShortlist);
}

/** Clears the market floor first, then cheapest to spend, then by market
 *  price. An unknown floor sorts below a cleared one and above a failed one:
 *  it is a question, not an answer either way. */
function compareShortlist(a, b) {
  const rank = (r) => (r.clearsFloor === true ? 0 : r.clearsFloor == null ? 1 : 2);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);

  const cost = (r) => (r.holdCost == null ? Infinity : r.holdCost);
  if (cost(a) !== cost(b)) return cost(a) - cost(b);

  return (b.winProb ?? 0) - (a.winProb ?? 0);
}

/* ── Block B: the wall ahead ────────────────────────────────────────────── */

/**
 * The next few weeks, counted in terms of what I have left to spend.
 *
 * SURVIVOR-STRATEGY.md §1: "Bye weeks silently remove options. Six teams gone
 * in a bye-heavy week can turn a comfortable slate into a forced bad pick.
 * Check the bye schedule when planning, not on Saturday."
 *
 * So this counts MY REMAINING TEAMS ONLY -- a bye-heavy week is not a problem
 * if none of the teams on bye were ever mine to spend. That is the difference
 * between this and reading the bye column off the schedule.
 *
 * `credible` counts teams clearing the market floor. Past the market's
 * lookahead window there are no market prices at all, so it is 0 with
 * `priced: 0` beside it -- which the renderer must show as "not priced yet"
 * rather than "no options". Those two states look identical in a bare count
 * and mean opposite things.
 */
export function wallAhead({ model, week, used, weeks, span = LOOKAHEAD }) {
  const ahead = weeks.filter((w) => w >= week).slice(0, span);
  const mine = model.teams.filter((t) => !used.has(t));

  return ahead.map((w) => {
    let onBye = 0;
    let priced = 0;
    let credible = 0;
    let playing = 0;

    for (const team of mine) {
      const cell = model.cells.get(key(team, w));
      if (!cell) continue;
      if (cell.bye) { onBye += 1; continue; }

      playing += 1;
      if (cell.probSource === 'market') {
        priced += 1;
        if (cell.winProb >= FLOOR) credible += 1;
      }
    }

    return { week: w, remaining: mine.length, onBye, playing, priced, credible };
  });
}

/* ── Block C: the elite budget ──────────────────────────────────────────── */

/**
 * Every team placed on its one best week, spent and unspent alike.
 *
 * §1: "The elite teams are a budget, not a menu. There are only so many 85%+
 * spots in a season. Map them before Week 1."
 *
 * Spent teams stay in the list rather than being filtered out, carrying the
 * week they actually went. That is the only way to see whether a team was
 * spent at or near its best spot -- which is the discipline the section is
 * about, and it is invisible if spending a team removes it from the map.
 *
 * `spentEarly` is the regret flag: used strictly before its best week, so the
 * value was left on the table. Spending a team AT its best week is the goal,
 * and spending it after is not automatically wrong -- the earlier week may
 * have been needed elsewhere.
 */
export function eliteBudget({ model, projections, used, usedWeek, weeks, fromWeek = 1 }) {
  return model.teams
    .map((team) => {
      const series = projSeries(projections, team);
      // Spent teams are mapped over the whole season, not the weeks left --
      // the question they answer is "did I spend this well", which is about
      // where its peak WAS, not where the rest of its peaks are.
      const isUsed = used.has(team);
      const best = bestRemaining(series, isUsed ? 1 : fromWeek, weeks);
      const week = isUsed ? usedWeek(team) : null;

      return {
        team,
        used: isUsed,
        usedWeek: week,
        bestWeek: best?.week ?? null,
        bestProb: best?.prob ?? null,
        byeWeek: projections?.teamOutlook?.[team]?.byeWeek ?? null,
        rating: projections?.teamOutlook?.[team]?.rating ?? null,
        spentEarly: Boolean(isUsed && week != null && best && week < best.week),
      };
    })
    .sort((a, b) => (b.bestProb ?? -1) - (a.bestProb ?? -1) || a.team.localeCompare(b.team));
}

/**
 * The budget grouped by week, for a timeline: which teams peak when.
 *
 * Only weeks that are somebody's best week appear. A week nothing peaks in is
 * a real fact about the season -- it is a week you will be spending a team
 * below its best -- but it is carried by the gaps between the weeks that do
 * appear, not by an empty row for every one of them.
 */
export function budgetByWeek(rows) {
  const byWeek = new Map();

  for (const row of rows) {
    if (row.bestWeek == null) continue;
    if (!byWeek.has(row.bestWeek)) byWeek.set(row.bestWeek, []);
    byWeek.get(row.bestWeek).push(row);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, teams]) => ({ week, teams }));
}
