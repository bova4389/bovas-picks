/* ==========================================================================
   The Monday-night tiebreaker guess -- the line, and the number to write.

   Mike's pool breaks a tie on most correct by the Monday total CLOSEST BY
   ABSOLUTE VALUE. The guess only matters in a tied week, and in a tied week
   the question is not "what will the total be" but "what number beats the
   two or three people I am tied with".

   MEASURED, 2026 Weeks 1-4 (STRATEGY.md §5):
     * About half the pool guesses within 3 points of the market total,
       every week (55%, 54%, 48%, 46%).
     * Ties at the top were small: 1, 2, 3 and 3 entries.
     * Simulated against those real guesses, with totals landing around the
       line at the historical SD of 13.9: against 2-3 tied rivals a guess
       ~7 points off the line wins the tie ~30% of the time; on the line,
       ~20%. Anywhere 6-9 off, either side, is about as good -- the peak is
       a plateau, not a point.

   So the suggestion is the line plus SUGGEST_OFFSET, with the line minus it
   as the alternative. The high side measured a hair better this season
   (the pool leans slightly over, and NFL totals run long more than short);
   the low side is within noise and is offered beside it.

   Added 2026-10-06 at the owner's request. This module replaces the old rule
   that the site showed the line and refused to suggest a number.

   A NEW FILE on purpose: picksheet.js and recommend.js both import it, and a
   new export on an existing unversioned module can meet a cached copy that
   lacks it (CLAUDE.md, cache busting). Imports nothing. Pure.
   NEVER add a ?v= to this file.
   ========================================================================== */

export const SUGGEST_OFFSET = 7;

/**
 * `{ line, guess, alt }` for a market total, or null without one.
 * `line` is the total as posted (54.5); `guess` and `alt` are whole numbers,
 * because the actual total always is.
 */
export function tiebreakSuggestion(total) {
  const t = Number(total);
  if (!Number.isFinite(t) || t <= 0) return null;
  return {
    line: t,
    guess: Math.round(t + SUGGEST_OFFSET),
    alt: Math.max(0, Math.round(t - SUGGEST_OFFSET)),
  };
}

/** The one-line reason, shared so both tabs say the same thing. */
export const TIEBREAK_WHY =
  'About half the pool guesses within 3 points of the line, so a tie is usually lost there. '
  + 'In 2026 so far, about 7 points off the line won a tied week about 30% of the time, against '
  + 'about 20% on the line.';
