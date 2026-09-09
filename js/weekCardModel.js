/* ==========================================================================
   The weekly cross-pool card — one pick per pool, and how correlated they are.

   Every other survivor view on this site is scoped to ONE pool. The Grid says
   what can be spent and when, the pick board says what the field just spent,
   Planning says whether this is the best week a team will ever get. All three
   read `activePool()` and paint that pool alone.

   This is the one view that must deliberately ignore the switcher. The
   question it answers cannot be asked one pool at a time:

     "Given four pools with four different formats and four different
      used-team boards, what do I submit in each one this week, and am I
      over-exposed to a single game?"

   No DOM, no fetching, no colors -- same contract as js/planModel.js, which
   this leans on rather than re-deriving. js/weekCard.js decides what any of it
   looks like.

   ── THE THREE RULES THAT SHAPE EVERY NUMBER HERE ─────────────────────────

   1. NEVER UNION USED-TEAM LISTS ACROSS POOLS. State is per league, and the
      Grid re-strikes its rows on a switch rather than merging them. Every
      board here is built from ONE league's used-set. A union would quietly
      remove teams that are still perfectly spendable in three of the four
      pools -- and it would look right.

   2. NEVER TEST A PROJECTION AGAINST THE 0.70 FLOOR. planModel.js's header
      has the long version: preseason regression compresses the spread so hard
      that only ~16 of 272 games reach 70%, against a market that prices 58
      there. The floor is a MARKET test. Applied to a projection it rejects
      the season. This is the single easiest way to get this file wrong.

   3. NEVER MIX THE TWO SCALES IN ONE SUBTRACTION. `gap` is market minus
      market. `fvCost` is projection minus projection. There is deliberately
      no expression anywhere below that combines them, because there is no
      honest exchange rate between the two -- which is exactly why the
      cross-pool swap in §4 is two separate clauses, one per scale, rather
      than one tidy EV formula. A tidy formula here would be a confident,
      plausible, meaningless number.

   ── WHAT THE MARKET ACTUALLY COVERS, WHICH IS LESS THAN IT LOOKS ─────────

   data/odds/current.json carries all 272 games, and reading that as "the
   season is priced" is a trap. Only the CURRENT WEEK has a market: 16 events
   at 9 books, and every other week at exactly one book. `bookmakerCount >= 4`
   is therefore not a nicety, it is the whole reason this file cannot look
   forward on the market scale at all, and it is why future value below is
   measured on projections and nowhere else.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { key } from './gridModel.js';
import { FLOOR, projSeries, bestRemaining } from './planModel.js';
import { shareFor, leverageFor, DEFAULT_K } from './pickShare.js';

/* Re-exported so the renderer has ONE place to read the card's constants
   from. It is planModel's floor, unchanged and never redefined here -- two
   modules each declaring a 0.70 is how they end up disagreeing about it. */
export { FLOOR };

/* ── The constants, and where each one comes from ─────────────────────────*/

/**
 * Books required before a line may drive a submitted pick.
 *
 * SURVIVOR-STRATEGY.md §4: "one book is an opinion, not a market". Four is
 * the threshold that section names. In practice this is a near-binary gate on
 * this feed -- the current week comes back at 8-9 books and every future week
 * at 1 -- which is the intended effect: the card prices the week in front of
 * it and refuses to pretend it can price the ones after.
 */
export const MIN_BOOKS = 4;

/**
 * How much win probability may be given up for a reason other than win
 * probability. §4.3's hard constraint, and the ceiling on every clause below.
 *
 * Five points in a full-pot pool. Two in a pool that plays for half its money,
 * because the thing a give-up buys there -- a cheap extra attempt -- is not
 * cheap: a buy-back runs ~8% of East Orange's playable pot against ~1% in Poop
 * and Deadpool (SURVIVOR-STRATEGY.md, "East Orange's half pot").
 *
 * Driven off `economics.potShare`, NEVER off a league id, so the tighter band
 * follows the economics if the pool grows or another half-pot pool is added.
 */
export const BAND = 0.05;
export const BAND_HALF_POT = 0.02;

/**
 * The gap inside which splitting a duplicated pick is close enough to free
 * that decorrelation alone justifies it. §4.4.
 *
 * A chosen threshold, not a measured one. Three points of win probability
 * against roughly a 4x cut in the joint-wipeout probability is the trade this
 * number prices, and it is deliberately tighter than BAND: the band is what a
 * pool may spend on its OWN best reason, and this is what one pool may spend
 * on another pool's behalf.
 */
export const SPLIT_BAND = 0.03;

/**
 * How much cheaper in future value the alternative must be before that alone
 * carries a split. §4.4's second clause.
 *
 * Also a chosen threshold. Two points on the PROJECTION scale, which is a
 * bigger claim than two points on the market scale sounds -- the projections
 * are regressed 0.40 with a 13.5-point margin SD, so anything smaller than
 * this is inside the model's own noise and would flip on a rebuild.
 *
 * BE AWARE THAT THIS ONE IS LOAD-BEARING AND CLOSE. On the Week 1 2026 case
 * the two candidates sit 2.2 points apart, so the clause fires at 0.02 and
 * would not at 0.03. That is not a flaw in the threshold; it is the honest
 * shape of that particular week, and it is precisely why change detection
 * exists -- a week decided this narrowly is a week that can flip on Thursday.
 */
export const FV_EDGE = 0.02;

/**
 * Entries below which the leverage term is not worth computing at all.
 *
 * SURVIVOR-STRATEGY.md §2: at 8-29 entries "there simply aren't enough rivals
 * for a fade to buy anything", and chasing contrarian value is a pure cost.
 * Only Mike's 235-entry pool is above this.
 */
export const LEVERAGE_MIN_ENTRIES = 100;

/* ── Candidates ───────────────────────────────────────────────────────────*/

/** Event id -> how many books priced it, from the odds snapshot. */
export function bookmakersIn(odds) {
  return new Map((odds?.events || []).map((e) => [String(e.id), Number(e.bookmakerCount) || 0]));
}

/** A pool's give-up band. See BAND above -- economics, never an id. */
export function bandFor(league) {
  const share = league?.economics?.potShare;
  return Number.isFinite(share) && share < 1 ? BAND_HALF_POT : BAND;
}

/**
 * Everything ONE pool could legally submit this week, best price first.
 *
 * Four filters, in the order §4.1 states them, and each one drops a team for a
 * different reason worth being able to name:
 *
 *   used     spent on this board -- and ONLY this board (rule 1)
 *   bye      not playing
 *   books    priced by fewer than MIN_BOOKS, so there is no market to read
 *   floor    priced below 0.70 by the market (rule 2 -- market only, always)
 *
 * `gap` is filled in against the best surviving candidate, so it is "points
 * behind the chalk ON THIS BOARD" -- a team already spent in one pool changes
 * what the gap means in the next one, which is the entire reason this is
 * computed per pool rather than once for the week.
 */
export function candidatesFor({ model, projections, week, weeks, used, books }) {
  const rows = [];

  for (const team of model.teams) {
    if (used.has(team)) continue;

    const cell = model.cells.get(key(team, week));
    if (!cell || cell.bye) continue;

    // The floor is a market test and nothing else. A projected price is not a
    // weaker candidate here, it is not a candidate at all.
    if (cell.probSource !== 'market' || cell.winProb == null) continue;

    const bookCount = books.get(String(cell.oddsEventId)) ?? 0;
    if (bookCount < MIN_BOOKS) continue;
    if (cell.winProb < FLOOR) continue;

    // Future value, entirely on the projection scale. `week + 1` because the
    // question is what spending the team NOW costs against its best spot
    // LATER -- including this week would make every team's cost zero or less.
    const series = projSeries(projections, team);
    const projNow = series.get(week) ?? null;
    const best = bestRemaining(series, week + 1, weeks);
    const fvCost = (projNow != null && best) ? best.prob - projNow : null;

    rows.push({
      team,
      opp: cell.opp,
      isHome: cell.isHome,
      kickoff: cell.kickoff,
      gameId: cell.gameId,
      oddsEventId: cell.oddsEventId,
      p: cell.winProb,
      books: bookCount,
      projNow,
      bestWeek: best?.week ?? null,
      bestProb: best?.prob ?? null,
      fvCost,
      // Free to spend: nothing left on the board is a better spot for this
      // team than this one. Measured projection-to-projection, NEVER by
      // testing a projection against 0.70 -- see rule 2. A team with no
      // remaining games at all (season's last week, or projections that do not
      // cover it) is dead weight for the same reason.
      deadWeight: fvCost == null ? best == null : fvCost <= 0,
      gap: null,
    });
  }

  rows.sort((a, b) => b.p - a.p || (a.fvCost ?? Infinity) - (b.fvCost ?? Infinity));

  const top = rows.length ? rows[0].p : null;
  for (const row of rows) row.gap = top == null ? null : top - row.p;

  return rows;
}

/* ── Per-pool selection ───────────────────────────────────────────────────*/

/**
 * Which of this pool's candidates to submit, and the one-line reason why.
 *
 * TWO RULES, and which one applies is a property of the POOL, not a setting.
 *
 * ONE LIFE, MANY RIVALS (Mike's, 235 entries). §4.3: leverage is real here and
 * only here, and the pool will run to Week 10+, so future value is the second
 * pillar rather than a tie-break. Ranked by leverage where a MEASURED share
 * exists; by future value inside the band where one does not.
 *
 *   Why not modeled share: `shareFor()` is a monotone function of p above
 *   ~0.71, so `leverageFor(p, shareFor(p))` is monotone there too and its
 *   argmax is ALWAYS the chalk. A modeled share cannot select a contrarian
 *   pick -- it can only re-derive the favorite and dress it up as leverage.
 *   That is not a bug in pickShare.js, whose header says plainly that the
 *   measured numbers arrive after kickoff; it means this branch must say it
 *   has no leverage rather than print one it cannot have.
 *
 * THREE LIVES, FEW RIVALS (Poop, Deadpool, East Orange). §2: "play close to
 * pure win probability, filtered by future value". Win probability leads and
 * future value breaks ties -- the reverse of Mike's, deliberately. With 2
 * buy-backs across 29 entries Poop holds ~85 lives and will run deep, so
 * future value still matters; it just does not outrank surviving the week.
 *
 * Both are subject to the same hard constraints from §4.3: the floor (already
 * applied in candidatesFor) and the pool's give-up band.
 */
export function pickFor({ league, candidates, measuredShare = null, k = DEFAULT_K }) {
  const band = bandFor(league);
  const eligible = candidates.filter((c) => c.gap != null && c.gap <= band);

  if (!eligible.length) {
    return {
      leagueId: league.id,
      pick: null,
      band,
      // Two different empty states, and they must not read the same. Nothing
      // on the board clears the floor at all, versus something clears it but
      // everything sits outside what this pool may give up.
      empty: candidates.length ? 'outside-band' : 'no-candidate',
      alternatives: candidates.slice(0, 4),
    };
  }

  const leverageApplies = league.lives === 1
    && (league.entrants ?? 0) >= LEVERAGE_MIN_ENTRIES;

  let ranked;
  let basis;

  if (leverageApplies && measuredShare) {
    ranked = [...eligible].sort((a, b) =>
      (leverageOf(b, measuredShare, k) ?? -1) - (leverageOf(a, measuredShare, k) ?? -1)
      || b.p - a.p);
    basis = 'leverage';
  } else if (leverageApplies) {
    // Leverage cannot separate these -- see the note above. Fall through to
    // the other pillar the one-life rule stands on rather than pretending.
    ranked = [...eligible].sort((a, b) =>
      (a.fvCost ?? Infinity) - (b.fvCost ?? Infinity) || b.p - a.p);
    basis = 'future-value';
  } else {
    ranked = [...eligible].sort((a, b) =>
      b.p - a.p || (a.fvCost ?? Infinity) - (b.fvCost ?? Infinity));
    basis = 'win-probability';
  }

  return {
    leagueId: league.id,
    pick: ranked[0],
    runnerUp: ranked[1] || null,
    band,
    basis,
    share: measuredShare ? shareOf(ranked[0], measuredShare) : null,
    leverage: measuredShare ? leverageOf(ranked[0], measuredShare, k) : null,
    empty: null,
    alternatives: ranked.slice(1, 4),
  };
}

/** A measured share for a team, as a fraction, or null. `measuredShare` is a
 *  plain team -> fraction map so this file never learns the popularity file's
 *  shape -- the caller owns that join. */
function shareOf(row, measuredShare) {
  const s = measuredShare?.get?.(row.team);
  return Number.isFinite(s) ? s : null;
}

function leverageOf(row, measuredShare, k) {
  const s = shareOf(row, measuredShare);
  // Only a MEASURED share may drive this. shareFor() is here for display of
  // what the model would have guessed, never for the ranking -- see pickFor.
  return s == null ? null : leverageFor(row.p, s);
}

/** What the modeled share would say, for display beside a measured one (or in
 *  place of it, clearly labeled). Never used to rank -- see pickFor. */
export function modeledShare(p, k = DEFAULT_K) {
  return shareFor(p, k);
}

/* ── The cross-pool layer ─────────────────────────────────────────────────*/

/**
 * Two pools are the same game when their terms are the same, not when their
 * names look alike.
 *
 * Poop and Deadpool are identical -- $30 in, $15 a buy-back, three lives, full
 * pot (confirmed 2026-09-09) -- which is what makes a duplicated pick across
 * them one correlated bet rather than two independent ones. Mike's is a
 * different game (one life) and East Orange is a different game (half pot), so
 * a pick shared with either of those is not the duplicate this layer means.
 */
export function formatKey(league) {
  const e = league?.economics || {};
  return [
    league?.lives ?? '?',
    e.potShare ?? 1,
    e.entry ?? '?',
    e.buyback ?? '?',
  ].join('|');
}

/**
 * Break up a duplicated pick between same-format pools where doing so is
 * close to free. §4.4 -- the part of this feature that exists nowhere else in
 * the codebase.
 *
 * The BIGGER pot keeps the better team. That is the only ordering that makes
 * sense: if one of the two tickets is going to carry slightly less win
 * probability, it should be the one playing for less money.
 *
 * Two independent clauses, each confined to ONE scale (rule 3), and either is
 * enough:
 *
 *   A  MARKET.     The two candidates are within SPLIT_BAND of each other, so
 *                  the split costs almost nothing this week and buys a ~4x cut
 *                  in the chance both tickets die on the same Sunday.
 *
 *   B  PROJECTION. The alternative is materially cheaper to spend in future
 *                  value than the duplicate -- so the swap does not merely
 *                  decorrelate, it also preserves the better team's later spot
 *                  and burns the team with less of a future. Still capped by
 *                  the pool's band, which is what implements §4.4's "when the
 *                  gap is 6+ points, win probability dominates".
 *
 * Anything else keeps the duplicate and lets the renderer show the warning.
 * A hedge is a thing you buy, and past the band the price is too high.
 */
export function splitDuplicates({ picks, leagues }) {
  const byId = new Map(leagues.map((l) => [l.id, l]));
  const out = picks.map((p) => ({ ...p, swapped: null }));

  const groups = new Map();
  for (const entry of out) {
    if (!entry.pick) continue;
    const league = byId.get(entry.leagueId);
    const gk = `${formatKey(league)}::${entry.pick.team}`;
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(entry);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Biggest pot first; it keeps the duplicate. Pot rather than entry count,
    // because a half-pot pool with more entries is still playing for less.
    group.sort((a, b) => potOf(byId.get(b.leagueId)) - potOf(byId.get(a.leagueId)));

    for (const entry of group.slice(1)) {
      const league = byId.get(entry.leagueId);
      const alt = entry.alternatives?.[0] || null;
      if (!alt) continue;

      const marketClause = (alt.p != null && entry.pick.p != null)
        && (entry.pick.p - alt.p) <= SPLIT_BAND;

      const futureClause = (alt.fvCost != null && entry.pick.fvCost != null)
        && (alt.fvCost + FV_EDGE) <= entry.pick.fvCost
        && alt.gap != null && alt.gap <= entry.band;

      // Kept separate from futureClause so the reason code can say which of
      // the two projection-scale facts carried it -- "cheaper" and "has no
      // future left at all" read very differently to someone checking the card.
      const deadWeightClause = alt.deadWeight && !entry.pick.deadWeight
        && alt.gap != null && alt.gap <= entry.band;

      if (!marketClause && !futureClause && !deadWeightClause) continue;

      entry.swapped = {
        from: entry.pick,
        to: alt,
        clause: marketClause ? 'near-free' : deadWeightClause ? 'dead-weight' : 'future-value',
        costPts: entry.pick.p - alt.p,
        fvSaved: (entry.pick.fvCost != null && alt.fvCost != null)
          ? entry.pick.fvCost - alt.fvCost : null,
      };
      entry.pick = alt;
      entry.alternatives = [entry.swapped.from, ...entry.alternatives.slice(1)];
    }
  }

  return out;
}

/** Playable money, which is what a pool is actually worth to us. Buy-back
 *  revenue is deliberately ignored -- this exists only to ORDER two pools
 *  against each other, and the take-up rate is an assumption where the entry
 *  fee is a fact. */
function potOf(league) {
  const e = league?.economics || {};
  const entry = Number(e.entry) || 0;
  const share = Number.isFinite(e.potShare) ? e.potShare : 1;
  return (Number(league?.entrants) || 0) * entry * share;
}

/* ── Exposure ─────────────────────────────────────────────────────────────*/

/**
 * How correlated the week's tickets are, and what that costs if it goes wrong.
 *
 * Counted by GAME, not by team. Two pools on the same team is obviously one
 * bet; the case worth catching is two pools on different teams in the SAME
 * game, which cannot happen with survivor picks today but would be silently
 * mis-counted as diversified if this keyed on the team.
 *
 * `pAllLose` multiplies as though the games were independent, and they are
 * not -- same weather, same officiating week, same league-wide variance. There
 * is no way to estimate that correlation from anything this site holds, so the
 * number is computed the honest simple way and LABELED, rather than adjusted
 * by a fudge factor that would look more sophisticated and be less true.
 */
export function exposureOf(picks) {
  const live = picks.filter((p) => p.pick);
  if (!live.length) return null;

  const games = new Map();
  for (const entry of live) {
    const g = String(entry.pick.gameId);
    if (!games.has(g)) games.set(g, { p: entry.pick.p, teams: new Set(), pools: [] });
    games.get(g).teams.add(entry.pick.team);
    games.get(g).pools.push(entry.leagueId);
  }

  let pAllLose = 1;
  for (const g of games.values()) pAllLose *= (1 - g.p);

  const single = 1 - Math.max(...live.map((e) => e.pick.p));

  // What a single ticket everywhere would have cost, so the split has
  // something to be measured against rather than being asserted as prudent.
  //
  // The counterfactual is the BEST of the picks carried across all four, not
  // the worst -- "I did not split" means every pool took the team the card
  // ranked first, so the honest comparison is against the strongest single
  // ticket. Measuring against the weakest would flatter the split by pricing
  // it against a concentration nobody would have chosen.

  return {
    tickets: live.length,
    games: games.size,
    label: `${games.size}/${games.size === live.length ? live.length : games.size}`,
    distinctTeams: new Set(live.map((e) => e.pick.team)).size,
    pAllLose,
    pAnySurvives: 1 - pAllLose,
    pAllLoseIfSingle: single,
    independent: true,
    byGame: [...games.entries()].map(([gameId, g]) => ({
      gameId, p: g.p, teams: [...g.teams], pools: g.pools,
    })),
  };
}

/* ── Confidence ───────────────────────────────────────────────────────────*/

/**
 * How much this card should be trusted, from the odds snapshot's age and the
 * day of the week. §5 -- and the point is that it is shown ALWAYS and gates
 * NOTHING.
 *
 * Hiding the card until Saturday would be worse than showing a labeled draft:
 * the decision is made Saturday morning because that is when Mike's locks, and
 * SURVIVOR-STRATEGY.md §2 confirms there is no late-information edge to wait
 * for. So everything before Saturday is an honest draft and says so.
 *
 * The three states track the odds workflow's own cadence, which is what
 * actually changes underneath the card: one anchor snapshot a day Sun-Wed,
 * every three hours Thu-Sat.
 *
 * Eastern time, hardcoded, for the same reason gridModel.js hardcodes it --
 * the NFL schedules in it and Mike's deadline is stated in it.
 */
export function confidenceOf(fetchedAt, now = new Date()) {
  const day = easternWeekday(now);
  const t = fetchedAt ? new Date(fetchedAt).getTime() : NaN;
  const ageMs = Number.isFinite(t) ? now.getTime() - t : null;

  const state = day === 'Sat' ? 'final' : (day === 'Thu' || day === 'Fri') ? 'firming' : 'provisional';

  return {
    state,
    day,
    ageMs,
    label: { final: 'Final', firming: 'Firming', provisional: 'Provisional' }[state],
    basis: {
      final: "Saturday. Mike's locks at midnight, before Sunday inactives post — this is the decision point.",
      firming: 'Odds resample every 3 hours through Saturday. Lines can still move.',
      provisional: 'One anchor snapshot a day until Thursday. Treat this as a draft.',
    }[state],
  };
}

const ET_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const easternWeekday = (d) => ET_DAY.format(d);

/* ── Change detection ─────────────────────────────────────────────────────*/

/**
 * What moved between two cards. §6 -- the part that earns the feature's keep.
 *
 * A week decided on a 3.2-point gap is a week a Thursday line move can turn
 * over, and the difference between knowing that on Thursday and rediscovering
 * it on Saturday is the whole reason the card recomputes on every snapshot
 * rather than being generated once.
 *
 * Only a CHANGED RECOMMENDATION is a flip. A pick whose probability drifted a
 * tenth of a point is not news and must not produce a banner -- a banner that
 * fires every three hours is a banner nobody reads by Week 3.
 */
export function diffCards(prev, next) {
  if (!prev || prev.week !== next.week) return null;

  const before = new Map((prev.picks || []).map((p) => [p.leagueId, p]));
  const flips = [];

  for (const entry of next.picks || []) {
    const was = before.get(entry.leagueId);
    if (!was) continue;

    const from = was.pick?.team ?? null;
    const to = entry.pick?.team ?? null;
    if (from === to) continue;

    flips.push({
      leagueId: entry.leagueId,
      from,
      to,
      // The gap is what these decisions turn on, so the banner can say WHY it
      // moved rather than only that it did.
      gapWas: was.pick?.gap ?? null,
      gapNow: entry.pick?.gap ?? null,
    });
  }

  return flips.length ? { since: prev.builtAt, flips } : null;
}

/* ── The card ─────────────────────────────────────────────────────────────*/

/**
 * The whole week, every pool at once.
 *
 * `boards` is [{ league, used }] -- the caller resolves each pool's own state
 * and hands it over. That shape is the enforcement of rule 1: there is no
 * signature here that could accept a merged used-set by accident.
 *
 * `measuredShares` is leagueId -> (team -> fraction), and only a MEASURED
 * share belongs in it. See pickFor on why a modeled one must not rank.
 */
export function buildWeekCard({
  model, projections, odds, week, weeks, boards,
  measuredShares = new Map(), k = DEFAULT_K, now = new Date(),
}) {
  const books = bookmakersIn(odds);
  const leagues = boards.map((b) => b.league);

  const byPool = boards.map(({ league, used }) => ({
    league,
    candidates: candidatesFor({ model, projections, week, weeks, used, books }),
  }));

  const chosen = byPool.map(({ league, candidates }) => pickFor({
    league,
    candidates,
    measuredShare: measuredShares.get(league.id) || null,
    k,
  }));

  const picks = splitDuplicates({ picks: chosen, leagues });

  // Teams that clear the floor and are going nowhere. Named explicitly rather
  // than left as an absence: "DET is held, it has a better spot in Week 3" is
  // a decision the card made, and a card that only lists what it spent looks
  // like it never considered the rest.
  const spent = new Set(picks.filter((p) => p.pick).map((p) => p.pick.team));
  const heldBy = new Map();
  for (const { league, candidates } of byPool) {
    for (const c of candidates) {
      if (spent.has(c.team)) continue;
      if (!heldBy.has(c.team)) heldBy.set(c.team, { ...c, pools: [] });
      heldBy.get(c.team).pools.push(league.id);
    }
  }

  return {
    season: model?.season ?? null,
    week,
    builtAt: now.toISOString(),
    oddsFetchedAt: odds?.fetchedAt ?? null,
    confidence: confidenceOf(odds?.fetchedAt, now),
    picks,
    byPool,
    held: [...heldBy.values()].sort((a, b) => b.p - a.p),
    exposure: exposureOf(picks),
  };
}

/**
 * The card reduced to what belongs in data/survivor-log-<season>.json. §7.
 *
 * Deliberately lossy: pool, team, price, gap, share, reason, and the count of
 * teams left. Enough for Lookback to ask "was the card right, and was it right
 * for the reason it gave" a season later, and nothing that would rot -- no
 * candidate lists, no thresholds, no rendered text.
 */
export function cardForLog(card, { teamsLeft = new Map() } = {}) {
  return {
    week: card.week,
    builtAt: card.builtAt,
    oddsFetchedAt: card.oddsFetchedAt,
    confidence: card.confidence.state,
    exposure: card.exposure && {
      tickets: card.exposure.tickets,
      games: card.exposure.games,
      pAllLose: round(card.exposure.pAllLose, 4),
    },
    picks: card.picks.map((p) => ({
      pool: p.leagueId,
      team: p.pick?.team ?? null,
      p: round(p.pick?.p, 4),
      gap: round(p.pick?.gap, 4),
      fvCost: round(p.pick?.fvCost, 4),
      share: round(p.share, 4),
      basis: p.basis ?? null,
      swappedFrom: p.swapped?.from?.team ?? null,
      swapClause: p.swapped?.clause ?? null,
      teamsLeft: teamsLeft.get(p.leagueId) ?? null,
    })),
  };
}

const round = (n, dp) => (Number.isFinite(n) ? Number(n.toFixed(dp)) : null);
