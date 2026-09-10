/* ==========================================================================
   Odds badge — the reusable "who's favored" inline fragment.

   One job: turn a matchup plus its already-matched odds event into a short
   piece of markup like `Jaguars <strong>85%</strong>`, or '' if there's no
   market line yet. Callers own the wrapping element (Pick Sheet uses
   .game-odds; a future Survivor grid or Lookback row will want its own
   container to match their own layout), so this stays a plain text fragment
   rather than a fixed component — that's what makes it drop into a different
   tab's markup without a rewrite. See js/oddsMatch.js for the join.

   IT TAKES THE EVENT, NOT AN INDEX, AND THAT IS THE POINT. It used to take
   an index and call matchOdds() itself, which quietly decided for every
   caller that the pair-only join was the right one. It is not: fed a whole
   season's snapshot, a pair-only lookup collapses both meetings of a
   division rivalry and returns whichever was written last, so the Pick Sheet
   spent the 2026 preseason naming Denver the favorite in Broncos-at-Chiefs
   off the November line, with Denver at home. Choosing the join is the
   caller's job — it is the only party that knows whether its index spans a
   week or a season — so this renders whatever it is handed.
   ========================================================================== */

import { orientProbs } from './oddsMatch.js';

/**
 * `Jaguars <strong>85%</strong>` for whichever side is favored, or '' when
 * `ev` is null. '' means "render nothing" — callers should never treat it as
 * an error state; most weeks most games have no line yet (see js/data.js
 * getOddsSnapshot).
 *
 * `ev` comes from matchOdds() or matchSeasonOdds() — see the header on why
 * this does not pick one for you.
 */
export function favoriteLine(game, ev) {
  if (!ev) return '';

  const { awayProb, homeProb } = orientProbs(game, ev);
  if (awayProb == null || homeProb == null) return '';

  const favIsHome = homeProb >= awayProb;
  const favName = favIsHome ? game.home : game.away;
  const favPct = Math.round((favIsHome ? homeProb : awayProb) * 100);
  return `${escape(favName)} <strong>${favPct}%</strong>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
