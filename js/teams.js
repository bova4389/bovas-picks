/* ==========================================================================
   Team identity crosswalk.

   Three different sources spell the same 32 teams three different ways:
     - number-map (commissioner's sheet)  → mascot only, "Buccaneers"
     - The Odds API                        → full name, "Tampa Bay Buccaneers"
     - Suicide pool workbook (survivor)    → abbreviation, "TB"

   Matching on the mascot (the full name's last word) is enough — no two NFL
   teams share one. NEVER add a ?v= to this file: see data.js's note on why a
   versioned and unversioned import of a stateful module are different
   instances. This one holds no state, but keep the convention uniform so
   nobody has to re-derive the reasoning per file.
   ========================================================================== */

export const ABBR_TO_MASCOT = {
  ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills',
  CAR: 'Panthers', CHI: 'Bears', CIN: 'Bengals', CLE: 'Browns',
  DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers',
  HOU: 'Texans', IND: 'Colts', JAC: 'Jaguars', KC: 'Chiefs',
  LAC: 'Chargers', LAR: 'Rams', LV: 'Raiders', MIA: 'Dolphins',
  MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants',
  NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers', SEA: 'Seahawks',
  SF: '49ers', TB: 'Buccaneers', TEN: 'Titans', WAS: 'Commanders',
};

export const MASCOT_TO_ABBR = Object.fromEntries(
  Object.entries(ABBR_TO_MASCOT).map(([abbr, mascot]) => [mascot, abbr])
);

/** "Tampa Bay Buccaneers" -> "Buccaneers". Mascot is always the last word. */
export function mascotOf(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  return parts[parts.length - 1];
}
