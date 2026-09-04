/* ==========================================================================
   Estimated pick share — what fraction of the field takes each side.

   STRATEGY.md §4 Step 2 calls this "the column that turns a probability table
   into a strategy", and §4 Step 4's leverage score cannot be computed without
   it. The real numbers arrive in data/popularity/pop-<year>-w<NN>.json once
   the commissioner mails that week's workbook -- which is AFTER Sunday
   kickoff, i.e. after every decision it would have informed.

   So for the week you are actually picking, the honest options are: no
   leverage ranking at all, or a modeled share that is labeled as modeled.
   This file is the second option. Nothing here ever overwrites a measured
   number; getPopularity() wins wherever it exists.

   ── The model ────────────────────────────────────────────────────────────

       share(p) = p^k / (p^k + (1-p)^k)

   One parameter. k = 1 would mean the field picks exactly in proportion to
   win probability; k > 1 means it piles onto favorites harder than the
   probability warrants, which is the well-documented behavior of public
   pools and the whole reason cheap underdogs exist. The curve is symmetric --
   share(p) + share(1-p) = 1 -- so one call answers both sides of a game.

   ── Why k defaults to 2.0 rather than to a fit ───────────────────────────

   Fitting k needs (win probability, observed share) PAIRS. We have exactly
   one prior popularity file (2025 Week 1) and no odds snapshot from that week
   to pair it with, so those pairs do not exist yet.

   Distribution-matching was tried instead -- choose k so the modeled shares
   for this week land on the same spread as last year's observed shares -- and
   it is NOT used, because it conflates two different things. 2026 Week 1 is a
   genuinely flatter slate than 2025 Week 1 was (best favorite 82% against
   93%), so forcing the share distributions to match pushes k to 2.41 and
   attributes the difference to a more decisive field rather than to an easier
   schedule. The residual said so: the fit was visibly poor at both tails.

   k = 2.0 is the documented default instead: at 55/70/85% win probability it
   predicts 60/84/97% share, which brackets the real 2025 Week 1 spread of
   58-93%. It is a starting point, not a measurement, and the UI says so.

   ── How it stops being a guess ───────────────────────────────────────────

   fitK() takes real pairs and returns a fitted k. The moment ONE week of this
   season has both a popularity file and an odds snapshot, the caller can fit
   against that and every later week's estimate improves. That is the intended
   life cycle: modeled at first, self-correcting after Week 1, and replaced
   outright by the measured file for any week that has one.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

/** The public over-picks favorites. See the header for why this number. */
export const DEFAULT_K = 2.0;

/** Plausible range for a fitted k. Outside this, something is wrong with the
 *  inputs rather than interesting about the field -- k < 1 would mean the
 *  field systematically fades favorites, which no pool does. */
const K_MIN = 1.0;
const K_MAX = 4.0;

/**
 * Estimated share of the field on a side with win probability `p`.
 *
 * Returns null for a p we cannot use, so callers can distinguish "no estimate"
 * from "estimated zero" -- the difference matters, because leverage divides by
 * this and a zero would produce Infinity.
 */
export function shareFor(p, k = DEFAULT_K) {
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const a = p ** k;
  const b = (1 - p) ** k;
  return a / (a + b);
}

/**
 * Leverage for one side: win probability divided by the share of the field on
 * it. STRATEGY.md §4 Step 4.
 *
 * Above 1.0 means you gain ground when it hits; below means you are paying for
 * company. Null when either input is missing rather than a default, because a
 * missing leverage must not sort as though it were a bad one.
 */
export function leverageFor(p, share) {
  if (!Number.isFinite(p) || !Number.isFinite(share) || share <= 0) return null;
  return p / share;
}

/**
 * Fit k from real (winProb, observedShare) pairs by coarse-to-fine search.
 *
 * A search rather than a closed form because the loss is over a bounded
 * one-dimensional parameter and clarity beats cleverness at 0.01 resolution;
 * the whole thing is a few hundred multiplications.
 *
 * Pairs at or beyond the probability bounds are dropped -- a 0% or 100% side
 * carries no information about how hard the field leans and would dominate
 * the squared error.
 */
export function fitK(pairs) {
  const usable = (pairs || []).filter(
    (d) => Number.isFinite(d?.p) && d.p > 0.02 && d.p < 0.98
      && Number.isFinite(d?.share) && d.share > 0 && d.share < 1
  );
  if (usable.length < 4) return null;

  let best = { k: DEFAULT_K, err: Infinity };
  for (let k = K_MIN; k <= K_MAX + 1e-9; k += 0.01) {
    let err = 0;
    for (const d of usable) {
      const diff = shareFor(d.p, k) - d.share;
      err += diff * diff;
    }
    if (err < best.err) best = { k: Math.round(k * 100) / 100, err };
  }

  return {
    k: best.k,
    n: usable.length,
    rmse: Math.sqrt(best.err / usable.length),
  };
}

/**
 * Build fit pairs by joining a popularity file to the odds for the same week.
 *
 * `probOf(game)` is supplied by the caller rather than resolved here, because
 * the join from a pool game to an odds event is oddsMatch.js's job and this
 * module must not grow a second copy of it.
 */
export function pairsFrom(popularity, probOf) {
  const out = [];
  for (const g of popularity?.games || []) {
    const probs = probOf(g);
    if (!probs) continue;
    if (Number.isFinite(probs.awayProb) && Number.isFinite(g.awayPct)) {
      out.push({ p: probs.awayProb, share: g.awayPct / 100 });
    }
    if (Number.isFinite(probs.homeProb) && Number.isFinite(g.homePct)) {
      out.push({ p: probs.homeProb, share: g.homePct / 100 });
    }
  }
  return out;
}

/**
 * What a prior season's field actually did, as plain measured fact.
 *
 * Deliberately NOT fed into the model. It is shown to the reader as context --
 * "here is how hard this pool leans, and how many people you are beating" --
 * which is the question a first-week entrant is really asking. Mixing it into
 * this season's numbers is the exact failure js/season.js exists to prevent.
 */
export function priorProfile(popularity) {
  const games = popularity?.games || [];
  if (!games.length) return null;

  const conc = games.map((g) => g.concentration / 100).sort((a, b) => a - b);
  const mid = Math.floor(conc.length / 2);

  return {
    year: popularity.year,
    week: popularity.week,
    entrants: popularity.entrants,
    games: games.length,
    median: conc.length % 2 ? conc[mid] : (conc[mid - 1] + conc[mid]) / 2,
    min: conc[0],
    max: conc[conc.length - 1],
    // How many games the field treated as near-locks. The count that matters
    // for a survivor-style read of "where is there no separation to be had".
    lopsided: conc.filter((c) => c >= 0.85).length,
    contested: conc.filter((c) => c < 0.65).length,
  };
}
