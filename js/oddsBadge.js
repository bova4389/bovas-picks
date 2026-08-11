/* ==========================================================================
   Odds badge — the reusable "who's favored" inline fragment.

   One job: turn a matchup plus an odds index into a short piece of markup
   like `Jaguars <strong>85%</strong>`, or '' if there's no market line yet.
   Callers own the wrapping element (Pick Sheet uses .game-odds; a future
   Survivor grid or Lookback row will want its own container to match their
   own layout), so this stays a plain text fragment rather than a fixed
   component — that's what makes it drop into a different tab's markup
   without a rewrite. See js/oddsMatch.js for the join this builds on.
   ========================================================================== */

import { matchOdds, orientProbs } from './oddsMatch.js';

/**
 * `Jaguars <strong>85%</strong>` for whichever side is favored, or '' if
 * `game` has no matching odds event. '' means "render nothing" — callers
 * should never treat it as an error state; most weeks most games have no
 * line yet (see js/data.js getOddsSnapshot).
 */
export function favoriteLine(game, oddsIndex) {
  const ev = matchOdds(game, oddsIndex);
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
