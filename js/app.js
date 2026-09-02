/* ==========================================================================
   Shell: two-level tab navigation, then hand off to whichever tab owns the
   panel.

   NAV IS TWO LEVELS BECAUSE THE SITE COVERS TWO DIFFERENT GAMES. The top row
   is the pool type -- Season Long (straight-up, Mike Lowe's big pool, plus a
   confidence pool later) and Survivor (three separate leagues). The second
   row is the views available inside that pool. Schedule sits at the top level
   on its own because it belongs to neither and is read from both.

   Odds appears under BOTH pool types on purpose. It is one panel reached from
   two places -- not two copies. Every panel is booted once at load and simply
   shown or hidden, so switching rows never re-renders and never drops scroll
   position or in-progress state.

   THE GRID IS SURVIVOR-ONLY. It used to sit under Season Long as well, but
   everything it actually answers -- which weeks a team can still be spent in,
   what is left after the teams already used, how far ahead a run of good spots
   runs -- is a survivor question. The straight-up pool is a one-week-at-a-time
   game served by Pick Sheet, Odds and Recommend. Listing the Grid under both
   implied it was two tools; it is one, and it belongs to the pool that reads
   it. `fromHash()` still resolves the old "#season/grid" link to the Survivor
   row rather than dumping a bookmarked deep link on the Schedule tab.

   Each tab's logic lives in its own module. Sleeper FF's single 10k-line
   index.html is the cautionary tale -- keep these small and separate.
   ========================================================================== */

import { SEASON } from './data.js';
import { initSchedule } from './schedule.js';
import { initGrid } from './grid.js';
import { initPickSheet } from './picksheet.js';
import { initOdds } from './odds.js';
import { initRecommend } from './recommend.js';
import { initPlanning } from './planning.js';
import { initInfinityWar } from './infinityWar.js';

/* ── The nav model ────────────────────────────────────────────────────────
   The single source of truth for both rows. index.html holds the panels; the
   two <nav> rows are written from here, because the second row's contents
   change with the first row's selection and duplicating that markup by hand
   is how the two rows drift apart.
   ------------------------------------------------------------------------ */

const PANELS = {
  schedule:  { label: 'Schedule' },
  grid:      { label: 'Grid' },
  picksheet: { label: 'Pick Sheet' },
  odds:      { label: 'Odds' },
  recommend: { label: 'Recommend' },
  infinity:  { label: 'Infinity War' },
  lookback:  { label: 'Lookback', soon: true },
  survivor:  { label: 'Planning' },
};

const GROUPS = [
  {
    id: 'schedule',
    label: 'Schedule',
    // Shared ground: the schedule is not owned by either pool, so it gets no
    // second row rather than a row containing one redundant tab.
    panels: ['schedule'],
  },
  {
    id: 'season',
    label: 'Season Long',
    // No Grid here -- see the header note. The straight-up pool is played one
    // week at a time and these three are the week's tools.
    // Infinity War sits here rather than getting a row of its own: row 1 is
    // the size of the KINDS of game, not the count of leagues (see the nav
    // note in CLAUDE.md). It is a season-long pick'em, same as the Pick
    // Sheet's pool, and it goes after Recommend because it is a whole
    // decision rather than one input to one.
    panels: ['picksheet', 'odds', 'recommend', 'infinity', 'lookback'],
  },
  {
    id: 'survivor',
    label: 'Survivor',
    // Grid still leads, now that Planning is real: the Grid is the reference
    // -- the whole season at a glance -- and Planning is what you open once
    // you have a question about a specific week. Reference before answer.
    panels: ['grid', 'odds', 'survivor'],
  },
];

const groupById = (id) => GROUPS.find((g) => g.id === id) || null;

/* Which panel each group was last left on, so bouncing between pool types
   returns you to what you were reading rather than resetting to the first. */
const lastPanel = new Map(GROUPS.map((g) => [g.id, g.panels[0]]));

let active = { group: 'schedule', panel: 'schedule' };

const mainNav = document.getElementById('mainnav');
const subNav = document.getElementById('subnav');
const subBar = document.getElementById('subnav-bar');

/* ── Rendering ────────────────────────────────────────────────────────────*/

function renderMainNav() {
  mainNav.innerHTML = GROUPS.map((g) => `
    <button class="maintab" role="tab" type="button"
            id="maintab-${g.id}" data-group="${g.id}"
            aria-controls="subnav-bar"
            aria-selected="${g.id === active.group}">${g.label}</button>`).join('');
}

function renderSubNav() {
  const group = groupById(active.group);
  const single = group.panels.length < 2;

  // A one-panel group hides the row entirely instead of showing a lone tab.
  subBar.hidden = single;
  if (single) { subNav.innerHTML = ''; return; }

  subNav.innerHTML = group.panels.map((p) => {
    const meta = PANELS[p];
    return `
      <button class="subtab" role="tab" type="button"
              id="subtab-${p}" data-panel="${p}"
              aria-controls="panel-${p}"
              aria-selected="${p === active.panel}">${meta.label}${
        meta.soon ? '<span class="tab-soon">Soon</span>' : ''
      }</button>`;
  }).join('');
}

function renderPanels() {
  for (const id of Object.keys(PANELS)) {
    document.getElementById(`panel-${id}`).hidden = id !== active.panel;
  }
}

/**
 * Point the visible panel's `aria-labelledby` at whichever tab actually
 * selected it. Grid and Odds live under two groups, so the label cannot be
 * baked into the markup the way it can for a panel with one route in.
 */
function labelPanel() {
  const el = document.getElementById(`panel-${active.panel}`);
  const group = groupById(active.group);
  el.setAttribute(
    'aria-labelledby',
    group.panels.length < 2 ? `maintab-${group.id}` : `subtab-${active.panel}`
  );
}

/* ── Selection ────────────────────────────────────────────────────────────*/

function show(groupId, panelId) {
  const group = groupById(groupId) || GROUPS[0];
  const panel = group.panels.includes(panelId) ? panelId : lastPanel.get(group.id);

  active = { group: group.id, panel };
  lastPanel.set(group.id, panel);

  renderMainNav();
  renderSubNav();
  renderPanels();
  labelPanel();

  // Two levels, so the hash carries both -- "#survivor/grid" and
  // "#season/grid" are the same panel reached from different rows, and a
  // reload should land back on the row you were actually using.
  history.replaceState(null, '', `#${group.id}/${panel}`);

  // Announced rather than discovered. Schedule gates its live-score polling on
  // being the visible panel, and it used to find that out by binding a click
  // listener to every .tab at boot -- which breaks the moment the nav is
  // re-rendered, as both rows now are on every selection. A tab that needs to
  // know it has been shown or hidden listens for this; it does not reach into
  // the nav's markup.
  document.dispatchEvent(new CustomEvent('panelchange', {
    detail: { group: group.id, panel },
  }));
}

/* Delegated, because both rows are re-written on every selection and
   per-button listeners would be re-bound each time. */
mainNav.addEventListener('click', (e) => {
  const btn = e.target.closest('.maintab');
  if (btn) show(btn.dataset.group, lastPanel.get(btn.dataset.group));
});

subNav.addEventListener('click', (e) => {
  const btn = e.target.closest('.subtab');
  if (btn) show(active.group, btn.dataset.panel);
});

/** Roving arrow-key navigation within whichever row has focus. */
function arrowNav(row, selector, itemsOf, go) {
  row.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btn = e.target.closest(selector);
    if (!btn) return;

    const items = itemsOf();
    const i = items.indexOf(btn.dataset.group || btn.dataset.panel);
    if (i < 0) return;

    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = items[(i + step + items.length) % items.length];
    go(next);
    document.getElementById(`${selector === '.maintab' ? 'maintab' : 'subtab'}-${next}`)?.focus();
  });
}

arrowNav(mainNav, '.maintab', () => GROUPS.map((g) => g.id),
  (id) => show(id, lastPanel.get(id)));
arrowNav(subNav, '.subtab', () => groupById(active.group).panels,
  (id) => show(active.group, id));

/* ── Deep links ───────────────────────────────────────────────────────────
   Three forms are accepted: "#season/recommend" is what this writes, the bare
   "#recommend" the site used to write still resolves, and a two-level link
   whose panel has since moved out of that group -- "#season/grid" -- is
   re-homed to a group that still carries it rather than being thrown away.
   ------------------------------------------------------------------------ */

function fromHash(hash) {
  const [a, b] = hash.replace(/^#/, '').split('/');
  if (!a) return null;

  if (b && groupById(a)?.panels.includes(b)) return { group: a, panel: b };
  if (groupById(a) && !b) return { group: a, panel: lastPanel.get(a) };

  // The panel half is the part worth keeping: a saved "#season/grid" means
  // "show me the grid", and the grid now lives one row over.
  const wanted = groupById(a) && b ? b : a;
  const group = GROUPS.find((g) => g.panels.includes(wanted));
  return group ? { group: group.id, panel: wanted } : null;
}

const start = fromHash(location.hash) || active;
show(start.group, start.panel);

document.getElementById('brand-season').textContent = SEASON;

/* ── Boot the tabs ────────────────────────────────────────────────────────
   Schedule first: it owns the live-score polling every other tab reads from.
   ------------------------------------------------------------------------ */

initSchedule(document.getElementById('schedule-root'), SEASON);
initGrid(document.getElementById('grid-root'), SEASON);
initPickSheet(document.getElementById('picksheet-root'));
initOdds(document.getElementById('odds-root'));
initRecommend(document.getElementById('recommend-root'));
initPlanning(document.getElementById('survivor-root'), SEASON);
initInfinityWar(document.getElementById('infinity-root'), SEASON);
