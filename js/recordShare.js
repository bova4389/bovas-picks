/* ==========================================================================
   The record-aware pick-share curve -- pure, no state, no fetching.

   The field picks the team with the better RECORD over and above the price
   (STRATEGY.md "Lookback -- 2026 Weeks 1-7"): a 4-2 underdog against a 2-5
   favorite draws about half the pool, not the ~31% the price alone predicts.
   scripts/fit_pick_share.py fits the curve and writes it into
   data/popularity/fit-<year>.json as `record`:

       logit(dog share) = intercept + price * logit(dog win prob)
                          + record * (dog win% - favorite win%)

   This describes the FIELD, never who wins. Win probability still comes only
   from the market; nothing here touches it.

   Its own file rather than new exports on js/pickShare.js: that module is
   unversioned and sits in visitors' caches, and a fresh caller importing a
   name a cached copy lacks blanks the page (CLAUDE.md "Cache busting").
   ========================================================================== */

/** abbr -> {w, l, t} over completed games strictly before `week`. */
export function teamRecords(schedule, week) {
  const out = new Map();
  for (const g of schedule?.games || []) {
    if (g.week >= week || !g.completed || g.awayScore == null || g.homeScore == null) continue;
    for (const [team, mine, theirs] of [[g.away, g.awayScore, g.homeScore], [g.home, g.homeScore, g.awayScore]]) {
      const r = out.get(team) || { w: 0, l: 0, t: 0 };
      if (mine > theirs) r.w += 1; else if (mine < theirs) r.l += 1; else r.t += 1;
      out.set(team, r);
    }
  }
  return out;
}

/** Shrunk toward .500 by half a game each way, so 1-0 reads .75, not 1.00.
 *  Same formula as win_pct() in scripts/fit_pick_share.py. */
export function winPct(r) {
  const { w = 0, l = 0, t = 0 } = r || {};
  return (w + t / 2 + 0.5) / (w + l + t + 1);
}

/** True when a fit file's `record` block is usable. */
export function usableRecordFit(fit) {
  return !!fit && ['intercept', 'price', 'record'].every((k) => Number.isFinite(fit[k]));
}

/** Modeled share of the pool on the UNDERDOG, given its win probability and
 *  the two teams' records. */
export function recordShare(pDog, dogRecord, favRecord, fit) {
  const diff = winPct(dogRecord) - winPct(favRecord);
  const x = fit.intercept + fit.price * Math.log(pDog / (1 - pDog)) + fit.record * diff;
  return 1 / (1 + Math.exp(-x));
}
