/* ==========================================================================
   Infinity War model — picking 8 of a full slate, against 10-15 people.

   Pure data. Takes the 32 x 18 matrix from js/gridModel.js and answers the
   questions this pool asks, which are NOT the questions Mike's pool asks.
   No DOM, no fetching, no colors. js/infinityWar.js decides what it looks
   like.

   ── WHY THIS IS NOT A COPY OF THE RECOMMEND TAB ──────────────────────────

   Mike's pool: pick every game, most correct over the season. There, the only
   thing to maximize is expected correct picks, one game at a time, and each
   game is a separate decision.

   Infinity War: pick EIGHT games out of the whole slate. That changes the
   problem twice over.

     1. SELECTION IS THE GAME. Which eight you sit out matters as much as
        which side you take. Expected correct is maximized by simply taking
        the eight most lopsided games -- that part is easy, and `chalkSet()`
        does it in one line.

     2. THE TWO PRIZES WANT OPPOSITE THINGS, and this is the whole reason the
        tab exists. $20 goes weekly to the most correct; the rest goes to the
        top one or two at season's end.

          * The SEASON prize wants maximum expected correct. That is the
            chalk eight, every week, with no cleverness at all.

          * The WEEKLY prize wants the highest chance of BEATING 10-15
            people. Those are different objectives, and in a small pool they
            actively conflict.

   ── THE RESULT THAT SURPRISES PEOPLE, AND THE ONE THIS FILE EXISTS FOR ────

   If everyone picks the chalk eight, everyone picks the SAME eight, and
   everyone therefore scores IDENTICALLY. The week is an n-way tie and the $20
   splits n ways. Picking well does not win the weekly prize; picking
   DIFFERENTLY and being right wins it.

   That is why `fieldOutlook()` simulates the field rather than reporting a
   win probability. Scores in this pool are not independent draws -- every
   entrant who picked the same game shares that game's single outcome. A model
   that treated opponents' scores as independent would show chalk winning
   outright far more often than it can, which is exactly backward, and the
   error would be invisible because the number would still look sensible.

   ── THE SOURCE RULE, INHERITED AND SHARPENED ─────────────────────────────

   SURVIVOR-STRATEGY.md §4 "The compression limit": projections are regressed
   toward the mean and run 10-15 points flatter than market prices. planModel
   .js obeys this by never comparing a market number to a projected one ACROSS
   WEEKS.

   Here the trap is worse and closer, because this file ranks games WITHIN one
   week. If eleven games in a week have market prices and three have only
   projections, ranking all fourteen together silently buries the three: their
   compressed numbers cannot compete with market ones, so they are never in
   the eight, and nothing looks wrong. `rankGames()` therefore reports the
   source mix and `sourceWarning()` says so out loud. A mixed week's ordering
   is advisory, not a ranking.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { key } from './gridModel.js';

/** How many games this pool picks each week. Sleeper's own
 *  `settings.weekly_pick_limit` reports 8; this is the fallback and the thing
 *  the UI counts against. */
export const PICKS_PER_WEEK = 8;

/* ── One week's slate ─────────────────────────────────────────────────────*/

/**
 * Every game in a week, once, as a pickable row.
 *
 * gridModel stores a cell per TEAM per week, so each game appears twice. This
 * folds the pair back into one row and orients it to the side the numbers
 * favour, because that is the side that will actually be picked.
 *
 * A game with no probability from either source is returned with
 * `prob: null` rather than dropped. It is still a real game that can be
 * picked, and hiding it would make the slate quietly disagree with the
 * schedule.
 */
export function weekGames(model, week) {
  const seen = new Set();
  const rows = [];

  for (const team of model.teams) {
    const cell = model.cells.get(key(team, week));
    if (!cell || cell.bye || !cell.gameId || seen.has(cell.gameId)) continue;
    seen.add(cell.gameId);

    const oppCell = model.cells.get(key(cell.opp, week));
    const home = cell.isHome ? cell : oppCell;
    const away = cell.isHome ? oppCell : cell;
    if (!home || !away) continue;

    const hp = home.winProb;
    const ap = away.winProb;

    // Orient to the favorite. With no numbers at all there is no favorite
    // to name, so the row stays unoriented and the UI has to say so.
    let pick = null;
    let prob = null;
    if (hp != null || ap != null) {
      const hv = hp != null ? hp : 1 - ap;
      const av = ap != null ? ap : 1 - hp;
      pick = hv >= av ? home.team : away.team;
      prob = Math.max(hv, av);
    }

    rows.push({
      gameId: cell.gameId,
      week,
      home: home.team,
      away: away.team,
      kickoff: cell.kickoff,
      slot: cell.slot,
      divisional: cell.divisional,
      pick,
      prob,
      source: cell.probSource,
      homeProb: hp,
      awayProb: ap,
      state: cell.state,
      // Who actually won, once it is over -- so a finished week can be graded
      // rather than only projected.
      winner: cell.state === 'post'
        ? (home.result === 'won' ? home.team : away.result === 'won' ? away.team : null)
        : null,
    });
  }

  return rows;
}

/**
 * The slate ordered by how confident the numbers are, plus the source mix.
 *
 * Games with no probability sort last and are never auto-selected: an unknown
 * is not a coin flip, and treating it as 50% would rank it above nothing.
 */
export function rankGames(games) {
  const ranked = [...games].sort((a, b) => {
    if (a.prob == null && b.prob == null) return 0;
    if (a.prob == null) return 1;
    if (b.prob == null) return -1;
    return b.prob - a.prob;
  });

  const counts = { market: 0, projection: 0, none: 0 };
  for (const g of games) counts[g.source || 'none'] += 1;

  return { ranked, counts };
}

/**
 * Whether this week's ordering can be trusted as a ranking.
 *
 * Returns null when it can. Otherwise a sentence saying why not -- see the
 * source rule in this file's header. A week that is all market or all
 * projection is internally consistent and ranks fine; it is the MIX that
 * lies, because projected numbers are compressed and lose every comparison
 * to a market one on a difference that is an artefact of the source.
 */
export function sourceWarning(counts) {
  const priced = counts.market;
  const projected = counts.projection;
  if (!priced || !projected) return null;

  return `${priced} game${priced === 1 ? '' : 's'} priced by the market, `
    + `${projected} by projection. Projections run flatter, so the projected `
    + `games rank lower than they deserve — treat the order as advisory and `
    + `compare within a source, not across.`;
}

/** The n most lopsided games. Maximizes expected correct, and nothing else. */
export function chalkSet(games, n = PICKS_PER_WEEK) {
  return rankGames(games).ranked.filter((g) => g.prob != null).slice(0, n);
}

/* ── My card ──────────────────────────────────────────────────────────────*/

/** Expected number correct — just the sum of the probabilities. */
export function expectedCorrect(probs) {
  return probs.reduce((a, p) => a + p, 0);
}

/**
 * The exact distribution of how many I get right: index k holds P(exactly k).
 *
 * Poisson-binomial by convolution. Exact rather than simulated, and cheap at
 * this size (eight picks is nine outcomes), so the headline numbers on the
 * tab never wobble between renders the way a sampled figure would.
 */
export function scoreDistribution(probs) {
  let dist = [1];
  for (const p of probs) {
    const next = new Array(dist.length + 1).fill(0);
    for (let k = 0; k < dist.length; k += 1) {
      next[k] += dist[k] * (1 - p);
      next[k + 1] += dist[k] * p;
    }
    dist = next;
  }
  return dist;
}

/** P(at least k correct). */
export function atLeast(dist, k) {
  return dist.slice(k).reduce((a, b) => a + b, 0);
}

/* ── The field ────────────────────────────────────────────────────────────*/

/* Seeded so the tab shows the SAME numbers every render for the same inputs.
   A figure that drifts each time the panel repaints reads as noise, and a
   number nobody trusts is worse than no number. mulberry32 -- small, fast,
   good enough for this, and deterministic, which is the only property that
   actually matters here. */
function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller, one draw. */
function gauss(next) {
  const u = Math.max(next(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

/**
 * Simulate the week ONCE: the outcomes, and what the field scores on them.
 *
 * ── Why this is separate from scoring a card ─────────────────────────────
 *
 * The field's best score depends on the field's picks and the games, and NOT
 * on what I picked. So it is computed once and every candidate card is scored
 * against the same draws.
 *
 * That is not only faster -- the swap search was re-simulating the entire
 * field for all 64 candidate cards, which locked the tab for a minute -- it
 * is more correct. Comparing two cards against the SAME simulated weeks is a
 * paired comparison, so the difference between them is not buried in sampling
 * noise. Scored against independent draws, a swap worth half a percent would
 * be indistinguishable from one worth nothing at these trial counts.
 *
 * ── What is modeled, and what is assumed ────────────────────────────────
 *
 * Outcomes: each game resolves once, with the favorite winning at its own
 * probability. THE SAME DRAW IS SHARED by every entrant who picked that game.
 * This is the part a naive model gets wrong, and it is the reason chalk ties
 * instead of winning.
 *
 * Opponents: nobody's picks are known before kickoff (see the kickoff gate in
 * js/sleeperApi.js -- this tool will not read them early even though the API
 * would serve them). So the field is modeled rather than observed: each
 * opponent scores every game as its probability plus Gaussian noise of width
 * `spread`, then takes their best eight. spread = 0 makes the whole field
 * pick pure chalk and hands back an n-way tie; larger values scatter them.
 *
 * `spread` IS A GUESS AND IS NOT CALIBRATED. It is exposed as a control
 * rather than buried as a constant precisely so it can be argued with, and it
 * should be re-fitted against real picks once the pool has played a few weeks
 * and the Sleeper feed has some history to fit to. Until then, treat the
 * ordering of the outputs as the useful part and the absolute percentages as
 * soft.
 */
export function simulateField(slate, {
  fieldSize = 12, spread = 0.05, trials = 4000, seed = 20260901,
} = {}) {
  const playable = slate.filter((g) => g.prob != null);
  const n = playable.length;
  if (!n || fieldSize < 1) return null;

  const probs = playable.map((g) => g.prob);
  const index = new Map(playable.map((g, i) => [g.gameId, i]));
  const take = Math.min(PICKS_PER_WEEK, n);

  const next = rng(seed);
  const won = new Uint8Array(trials * n);
  const best = new Int16Array(trials);
  const bestCount = new Int16Array(trials);

  const noisy = new Float64Array(n);
  const order = new Array(n);

  for (let t = 0; t < trials; t += 1) {
    const base = t * n;
    for (let i = 0; i < n; i += 1) won[base + i] = next() < probs[i] ? 1 : 0;

    let top = -1;
    let ties = 0;

    for (let j = 0; j < fieldSize; j += 1) {
      for (let i = 0; i < n; i += 1) {
        noisy[i] = probs[i] + gauss(next) * spread;
        order[i] = i;
      }
      order.sort((x, y) => noisy[y] - noisy[x]);

      let s = 0;
      for (let k = 0; k < take; k += 1) s += won[base + order[k]];

      if (s > top) { top = s; ties = 1; }
      else if (s === top) ties += 1;
    }

    best[t] = top;
    bestCount[t] = ties;
  }

  return { playable, index, probs, n, trials, fieldSize, spread, won, best, bestCount };
}

/**
 * How one card places, against an already-simulated field.
 *
 * `share` is the fraction of the weekly prize this card takes on average,
 * splits included -- the number to actually compare cards on, because in a
 * pool this size most of the money arrives through ties rather than wins.
 */
export function scoreCard(sim, mine) {
  if (!sim) return null;

  const idx = [];
  for (const id of mine) {
    const i = sim.index.get(id);
    if (i !== undefined) idx.push(i);
  }
  if (!idx.length) return null;

  let outright = 0;
  let tied = 0;
  let payout = 0;
  let scoreSum = 0;

  for (let t = 0; t < sim.trials; t += 1) {
    const base = t * sim.n;
    let s = 0;
    for (const i of idx) s += sim.won[base + i];
    scoreSum += s;

    if (s > sim.best[t]) { outright += 1; payout += 1; }
    else if (s === sim.best[t]) { tied += 1; payout += 1 / (sim.bestCount[t] + 1); }
  }

  return {
    trials: sim.trials,
    fieldSize: sim.fieldSize,
    spread: sim.spread,
    outright: outright / sim.trials,
    tied: tied / sim.trials,
    top: (outright + tied) / sim.trials,
    share: payout / sim.trials,
    meanScore: scoreSum / sim.trials,
  };
}

/** Simulate and score in one call, for a caller that only needs one card. */
export function fieldOutlook(slate, mine, opts = {}) {
  return scoreCard(simulateField(slate, opts), mine);
}

/**
 * Every one-for-one swap out of my current card, scored on both objectives.
 *
 * `dCorrect` is what the swap costs in expected correct picks -- the season
 * prize. `dShare` is what it buys in expected share of the weekly $20. A swap
 * worth making for the week is one where `dShare` is positive and `dCorrect`
 * is a rounding error; the tab sorts on `dShare` and shows `dCorrect` beside
 * it rather than blending them into one score, because the two prizes are
 * genuinely separate money and the trade between them is the user's call.
 *
 * Every candidate is scored against ONE shared simulation -- see
 * simulateField() for why that is both the fast path and the accurate one.
 *
 * Capped at `limit` results because the full cross product is every pick
 * against every bench game, and a list that long is not a recommendation.
 */
export function swapCandidates(slate, mine, opts = {}, limit = 6, sim = null) {
  const field = sim || simulateField(slate, opts);
  const base = scoreCard(field, mine);
  if (!base) return [];

  const byId = new Map(field.playable.map((g) => [g.gameId, g]));
  const mineSet = new Set(mine);
  const bench = field.playable.filter((g) => !mineSet.has(g.gameId));

  const baseCorrect = expectedCorrect(mine.map((id) => byId.get(id)?.prob || 0));
  const out = [];

  for (const drop of mine) {
    if (!byId.has(drop)) continue;
    for (const add of bench) {
      const cand = mine.filter((id) => id !== drop).concat(add.gameId);
      const res = scoreCard(field, cand);
      if (!res) continue;
      out.push({
        drop: byId.get(drop),
        add,
        dShare: res.share - base.share,
        dCorrect: expectedCorrect(cand.map((id) => byId.get(id)?.prob || 0)) - baseCorrect,
        share: res.share,
      });
    }
  }

  return out.sort((a, b) => b.dShare - a.dShare).slice(0, limit);
}

/* ── Grading a finished week ──────────────────────────────────────────────*/

/** How a card actually did, once the games are final. `null` until some are. */
export function gradeCard(slate, mine) {
  const byId = new Map(slate.map((g) => [g.gameId, g]));
  const rows = mine.map((id) => byId.get(id)).filter(Boolean);
  const done = rows.filter((g) => g.state === 'post' && g.winner);
  if (!done.length) return null;

  const right = done.filter((g) => g.winner === g.pick).length;
  return { correct: right, settled: done.length, picked: rows.length };
}
