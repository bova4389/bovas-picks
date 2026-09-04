/* ==========================================================================
   Team identity — colors, uniforms, and mark paths for all 32 teams.

   The design backbone. Anything that renders a team (pick buttons, the
   Survivor grid, Lookback rows, matchup cards) reads its colors and its logo
   or helmet path from here rather than hardcoding a hex or an image path, so a
   rebrand is one rebuild of data/teams/team-identity.json and not a sweep
   through every tab.

   Lookups take anything the three upstream spellings throw at a team —
   "Buccaneers", "Tampa Bay Buccaneers", or "TB" — because that is already the
   problem js/teams.js exists to solve, and this defers to it rather than
   inventing a second crosswalk.

   NEVER add a ?v= to this file: it holds module state (the fetch cache below),
   and a versioned and unversioned import are two separate instances with
   separate state. See js/data.js for the full account of that outage.
   ========================================================================== */

import { MASCOT_TO_ABBR, ABBR_TO_MASCOT, mascotOf } from './teams.js';

const IDENTITY_PATH = 'data/teams/team-identity.json';

/**
 * Abbreviations other feeds use for teams this repo spells differently.
 * ESPN and nflverse say JAX where the commissioner's sheet says JAC, and the
 * relocated franchises still show up under their old cities in older data.
 * Mapping them here keeps every caller from having to know that.
 */
const FOREIGN_ABBR = {
  JAX: 'JAC',
  LA: 'LAR', STL: 'LAR',
  OAK: 'LV',
  SD: 'LAC',
  WSH: 'WAS',
};

let identityPromise = null;

/**
 * The whole identity document, memoized. Null on failure rather than throwing —
 * a missing palette should cost a team its color, not blank the tab, same
 * contract as data.js getOddsSnapshot.
 */
export async function getIdentity() {
  if (identityPromise) return identityPromise;

  identityPromise = fetch(IDENTITY_PATH)
    .then((res) => {
      if (!res.ok) throw new Error(`${IDENTITY_PATH} → HTTP ${res.status}`);
      return res.json();
    })
    .catch(() => null);

  return identityPromise;
}

/**
 * Resolve any of the three upstream spellings to an abbreviation.
 * Returns null for anything unrecognized — callers fall back to neutral styling.
 */
export function toAbbr(team) {
  if (!team) return null;
  const raw = String(team).trim();
  if (!raw) return null;

  const upper = raw.toUpperCase();
  if (ABBR_TO_MASCOT[upper]) return upper;
  if (FOREIGN_ABBR[upper]) return FOREIGN_ABBR[upper];

  // Handles both "Buccaneers" and "Tampa Bay Buccaneers": mascot is the last word.
  return MASCOT_TO_ABBR[mascotOf(raw)] ?? null;
}

/** One team's full identity record, or null if unknown. */
export async function getTeam(team) {
  const doc = await getIdentity();
  const abbr = toAbbr(team);
  if (!doc || !abbr) return null;
  return doc.teams[abbr] ?? null;
}

/**
 * A team's colors, flattened for styling: `{ primary, secondary, ink }`.
 *
 * `ink` is the color to set text in when it sits on `primary`, chosen by
 * contrast rather than by eye — several teams' primaries (Chargers powder blue,
 * Vikings gold, Saints old gold) are light enough that white-on-brand fails
 * the 4.5:1 floor this site holds itself to. Returns null if unknown so callers
 * can keep the site's own palette instead of guessing at a team's.
 */
export async function teamColors(team) {
  const record = await getTeam(team);
  if (!record) return null;

  const primary = record.palette?.primary?.hex ?? null;
  const secondary = record.palette?.secondary?.hex ?? null;
  if (!primary) return null;

  return { primary, secondary, ink: readableInkOn(primary) };
}

/**
 * A team's home or away kit: `{ jersey, pants, helmet, socks, kind }`.
 * `kind` is 'white' or 'color', which is the part most designs actually branch
 * on. Null when the team or side is unknown.
 */
export async function teamUniform(team, side = 'home') {
  const record = await getTeam(team);
  return record?.uniforms?.[side] ?? null;
}

/**
 * Path to one of a team's marks, or '' if unavailable — same "'' means render
 * nothing" contract as oddsBadge's favoriteLine(), so callers treat a missing
 * asset as a layout decision rather than an error.
 *
 * `kind` is 'logo' | 'wordmark'. There is no 'helmet': the helmet images were
 * dropped on 2026-08-13 because they did not read at the ~28px a team mark gets
 * here. An unknown kind returns '' like any other missing asset, so a stale
 * caller renders nothing rather than throwing.
 */
export async function markPath(team, kind = 'logo') {
  const record = await getTeam(team);
  if (!record) return '';
  return record.assets?.[kind] ?? '';
}

/**
 * `hex` mixed into `background` at `amount` (0–1), as a solid hex.
 *
 * Solid rather than `rgba()` on purpose. A translucent team color over an
 * unknown backdrop makes the resulting contrast unknowable, and this site
 * verifies contrast rather than assuming it — mixing to an opaque value means
 * the text sitting on top can be checked once and stay checked. Measured at
 * the 0.08 the Schedule tab uses, on white: the worst of the 32 is 8.40:1 for
 * --ink and 17.62:1 for pure black, both far above the 4.5:1 floor. Raising
 * the amount is what would put that at risk, so re-measure if you do.
 */
export function tintOn(hex, background = '#FFFFFF', amount = 0.08) {
  const parse = (v) => {
    const h = String(v).replace('#', '');
    return h.length === 6 ? [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
  };
  const fg = parse(hex);
  const bg = parse(background);
  if (!fg || !bg) return background;

  return `#${fg
    .map((c, i) => Math.round(c * amount + bg[i] * (1 - amount)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Black or white, whichever reads on `background`.
 *
 * WCAG relative luminance, not a lightness eyeball. This site's contrast is
 * verified rather than assumed — the AWAY/HOME label needed a bespoke #5F5C58
 * because the obvious choice measured 2.65:1 — and team primaries span from
 * Bears navy to Vikings gold, so the choice has to be computed per team.
 */
export function readableInkOn(background) {
  const hex = String(background).replace('#', '');
  if (hex.length !== 6) return '#000000';

  const channel = (pair) => {
    const c = parseInt(pair, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(hex.slice(0, 2)) +
    0.7152 * channel(hex.slice(2, 4)) +
    0.0722 * channel(hex.slice(4, 6));

  // Contrast against white vs. black; 0.179 is where the two cross over.
  return luminance > 0.179 ? '#000000' : '#FFFFFF';
}
