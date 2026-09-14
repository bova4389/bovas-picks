/* ==========================================================================
   Survivor pick board — who the pool actually took, one week at a time.

   Lives on the Survivor Standings panel (moved from the bottom of the Grid on
   2026-09-14, so the pool's results are in one place, not two). The Grid
   answers "what CAN I spend, and when"; this answers "what did everyone else
   just spend", which is
   the other half of a survivor decision and the half the tool could not show
   at all. Surviving a week is not about being right, it is about being right
   when the field is wrong, so the shape of the field's week is the number that
   moves a pick.

   THREE RULES THIS FILE EXISTS TO HOLD:

   1. Only teams somebody picked are listed. Filtered in weekDistribution() --
      see the note there. A zero row is not a fact about the week.
   2. The bar is scaled to the WEEK'S BIGGEST PICK, not to 100%. In a 12-entry
      pool spread over 8 teams nothing clears 25%, so share-scaled bars would
      all be stubs and the chart would carry no information the percentage text
      does not already. Longest bar = most-picked team, every week. The percent
      is printed beside it, so the absolute number is never inferred from the
      bar's length.
   3. It renders the KICKOFF GATE, never around it. Percentages are of the
      picks visible so far, which mid-week is not the pool -- so the count line
      says how many are still locked. Presenting a third of the pool as if it
      were the whole thing is the one way this board could actively mislead.

   Pure render, no state and no fetching: the caller owns the feed, the pool
   and the week. Written this way so moving it off the Grid was a change of
   mount point and nothing else -- keep it that way for the next move.

   An optional `status` map (team -> { text, tone }) adds a line under each
   row saying what happened to that team's game. The Standings panel passes
   it from the same survivorWeek() result its summary boxes count, so the
   board and the boxes cannot disagree. Tones: won / lost / live / pre.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { weekDistribution, weeksWithPicks } from './survivorLeagues.js';
import { tintOn } from './teamIdentity.js';
import { ABBR_TO_MASCOT } from './teams.js';

/**
 * Render into an element. The original entry point, kept with its name and
 * signature ON PURPOSE: this file is unversioned, so for ~10 minutes after a
 * deploy a visitor can get a fresh caller against a cached copy of this
 * module. A caller that imports a name the cached copy lacks blanks the whole
 * site ("does not provide an export named"). Callers use this; the string
 * form below is internal until a deploy has passed with it in place.
 */
export function renderPickBoard(host, o) {
  if (!host) return;
  host.innerHTML = pickBoardHtml(o);
  host.hidden = !o.league;
}

/** Retired with the Grid's board (2026-09-14). Kept for the same cached-
 *  module reason as renderPickBoard; nothing calls it. Safe to delete in a
 *  later deploy. */
export function pickBoardShell() {
  return '<section class="card pboard" id="g-pickboard"></section>';
}

/**
 * The board as a string, for a caller that builds its own markup.
 *
 * @param {object}      o
 * @param {object|null} o.feed    survivor-<year>.json shape, either source
 * @param {number}      o.season
 * @param {object|null} o.league  the LEAGUES entry for the active pool
 * @param {object|null} o.identity team-identity doc, or null
 * @param {number|null} o.week    the week to show, or null to pick the latest
 * @param {object|null} o.mine    my own league state, for the "you" marker
 * @param {Map|null}    o.status  team -> { text, tone }, optional
 * @param {boolean}     o.embedded  inside another card: a subheading instead
 *                      of a card head, and no week select of its own
 */
export function pickBoardHtml(o) {
  // "Off" is a deliberate choice to stop showing pool data.
  if (!o.league) return '';

  const weeks = weeksWithPicks(o.feed, o.season);
  if (!weeks.length) return head(o) + empty(o);

  const week = weeks.includes(Number(o.week)) ? Number(o.week) : weeks[weeks.length - 1];
  const dist = weekDistribution(o.feed, week, o.season);
  if (!dist || !dist.rows.length) return head(o, weeks, week) + empty(o);

  const body = head(o, weeks, week) + note(dist, o) + list(dist, o, week);
  return o.embedded ? `<div class="pboard is-embedded">${body}</div>` : body;
}

/* ── Chrome ───────────────────────────────────────────────────────────────*/

function head(o, weeks = null, week = null) {
  if (o.embedded) return '<h4 class="st-sub">Who the pool picked</h4>';
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">${esc(o.league.name)}</p>
        <h3 class="pboard-title">Who the pool picked</h3>
      </div>
      ${weeks && weeks.length > 1 ? `
        <select class="pboard-week" id="g-pickboard-week" aria-label="Week to show">
          ${weeks.map((w) => `
            <option value="${w}"${w === week ? ' selected' : ''}>Week ${w}</option>`).join('')}
        </select>` : ''}
    </div>`;
}

/**
 * The count line, which is where the gate is made visible.
 *
 * Three numbers rather than one, for the reason coverageNote() gives in
 * sleeperSurvivor.js: "4 of 12" alone reads as a quiet pool when the truth may
 * be that eight people have picked and their games have not started. The
 * locked half is stated whenever it is non-zero.
 */
function note(dist, o) {
  const bits = [
    `<strong>${dist.revealed}</strong> of ${dist.expected} pick${dist.expected === 1 ? '' : 's'} shown`,
    `<strong>${dist.distinctTeams}</strong> team${dist.distinctTeams === 1 ? '' : 's'} taken`,
  ];
  if (dist.locked) {
    bits.push(`<span class="pboard-locked">${dist.locked} still locked until kickoff</span>`);
  }

  // The caveat is attached only while the week is still partial. Once every
  // pick is in, the percentages are the pool's and saying otherwise would be
  // its own small lie -- and a disclaimer that never goes away is one nobody
  // reads on the week it matters.
  const partial = !dist.complete ? `
    <p class="pboard-partial">
      Percentages are of the ${dist.revealed} pick${dist.revealed === 1 ? '' : 's'}
      visible so far, not of the full ${dist.expected}${dist.locked
        ? ' &mdash; they will move as the rest of the games kick off' : ''}.
    </p>` : '';

  return `<p class="pboard-note">${bits.join(' &middot; ')}</p>${partial}`;
}

/* ── The chart ────────────────────────────────────────────────────────────*/

function list(dist, o, week) {
  const mine = o.mine?.picks?.[String(week)] || null;

  return `
    <ol class="pboard-list${o.status ? ' has-status' : ''}">
      ${dist.rows.map((r) => row(r, dist, o, mine)).join('')}
    </ol>`;
}

function row(r, dist, o, mine) {
  const ident = o.identity?.teams?.[r.team] || null;
  const logo = ident?.assets?.logo || '';
  const primary = ident?.palette?.primary?.hex || '';

  // Scaled to the week's biggest pick -- see rule 2 in the header.
  const width = dist.topCount ? (r.count / dist.topCount) * 100 : 0;
  const isMine = mine === r.team;
  const st = o.status?.get?.(r.team) || null;

  return `
    <li class="pboard-row${isMine ? ' is-mine' : ''}"${
      primary ? ` style="--pb-bar:${primary};--pb-tint:${tintOn(primary, '#FFFFFF', 0.10)}"` : ''
    }>
      <span class="pboard-badge" aria-hidden="true">${
        logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async">` : ''
      }</span>
      <span class="pboard-team">
        ${esc(ABBR_TO_MASCOT[r.team] || r.team)}
        ${isMine ? '<span class="pboard-mine" title="Your pick this week">yours</span>' : ''}
      </span>
      <span class="pboard-count"><strong>${r.count}</strong> <span class="pboard-of">${
        r.count === 1 ? 'entry' : 'entries'
      }</span></span>
      <span class="pboard-bar">
        <span class="pboard-fill" style="width:${width.toFixed(1)}%"></span>
      </span>
      <span class="pboard-pct">${fmtPct(r.pct)}%</span>
      ${st ? `<span class="pboard-status is-${esc(st.tone)}">${esc(st.text)}</span>` : ''}
    </li>`;
}

/* ── Empty states ─────────────────────────────────────────────────────────
   This is what the board shows for the whole preseason, so it says which of
   the three reasons is in force rather than one generic line.
   ------------------------------------------------------------------------ */

function empty(o) {
  if (!o.feed) {
    return `<p class="pboard-empty">${o.league.live
      ? 'No pool data cached yet — <strong>Refresh from Sleeper</strong> above pulls every entry’s picks.'
      : `No field file for this pool yet. ${esc(o.league.name)} is parsed from the mailed workbook into <code>data/survivor-${o.season}.json</code>.`
    }</p>`;
  }

  return `
    <p class="pboard-empty">
      No picks are visible yet. ${o.league.live
        ? 'Each entry’s pick unlocks when its game kicks off, so this fills in through the Sunday.'
        : 'The week has not been played and parsed yet.'}
    </p>`;
}

/* ── Formatting ───────────────────────────────────────────────────────────*/

/** One decimal only where it earns its place: 33.3% is worth the digit, 25.0%
 *  is not, and a column of trailing .0s reads as false precision. */
function fmtPct(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
