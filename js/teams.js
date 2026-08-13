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

/**
 * Divisions, for the Grid tab's matchup classification.
 *
 * Two teams are in the same division when their keys match, and in the same
 * conference when the first three characters do. That is the whole reason
 * this is a flat map of strings rather than nested objects — divisional and
 * conference are one string comparison each, on 576 cells.
 */
export const DIVISION_OF = {
  BUF: 'AFC East',  MIA: 'AFC East',  NE:  'AFC East',  NYJ: 'AFC East',
  BAL: 'AFC North', CIN: 'AFC North', CLE: 'AFC North', PIT: 'AFC North',
  HOU: 'AFC South', IND: 'AFC South', JAC: 'AFC South', TEN: 'AFC South',
  DEN: 'AFC West',  KC:  'AFC West',  LAC: 'AFC West',  LV:  'AFC West',
  DAL: 'NFC East',  NYG: 'NFC East',  PHI: 'NFC East',  WAS: 'NFC East',
  CHI: 'NFC North', DET: 'NFC North', GB:  'NFC North', MIN: 'NFC North',
  ATL: 'NFC South', CAR: 'NFC South', NO:  'NFC South', TB:  'NFC South',
  ARI: 'NFC West',  LAR: 'NFC West',  SEA: 'NFC West',  SF:  'NFC West',
};

/** 'AFC' | 'NFC'. */
export function conferenceOf(abbr) {
  return (DIVISION_OF[abbr] || '').slice(0, 3);
}

/** Division order for grouped row sorting — AFC first, East to West, which is
 *  the order every standings page in the sport uses. */
export const DIVISION_ORDER = [
  'AFC East', 'AFC North', 'AFC South', 'AFC West',
  'NFC East', 'NFC North', 'NFC South', 'NFC West',
];

/** "Tampa Bay Buccaneers" -> "Buccaneers". Mascot is always the last word. */
export function mascotOf(fullName) {
  const parts = String(fullName).trim().split(/\s+/);
  return parts[parts.length - 1];
}
