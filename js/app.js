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
import { isAllowed, isUnlocked, PUBLIC_GROUP } from './siteGate.js';
import { initSchedule } from './schedule.js';
import { initGrid } from './grid.js';
import { initPickSheet } from './picksheet.js';
import { initOdds } from './odds.js';
import { initRecommend } from './recommend.js';
import { initPlanning } from './planning.js';
import { initInfinityWar } from './infinityWar.js';
import { initSquares } from './squares.js';
import { initSquaresLedger } from './squaresLedger.js';

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
  'squares-board':  { label: 'Board' },
  'squares-season': { label: 'Season' },
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
  {
    id: 'squares',
    label: 'Squares',
    // Its own document title, not this site's. A link to the board is shared
    // outside the pool, so the browser tab, the bookmark and the history entry
    // all have to name the club rather than name Bova's Picks -- the one place
    // the site's own branding would be actively unhelpful.
    title: "St. Jude Men's Club Squares",
    // A third KIND of game, which is what row 1 counts -- not a third league.
    // Squares shares no vocabulary with either pick'em: nothing is picked,
    // nothing is spent, and the only input is a pair of digits somebody else
    // drew. Folding it into Season Long would put a game with no picks under a
    // row whose every other view is about making them.
    //
    // Odds are deliberately absent. A moneyline says who wins; a squares
    // payout turns on the last digit of a score, which no market here prices.
    // Showing a favorite beside a board would imply a connection that is not
    // there -- the one place on this site where "odds are not siloed" does not
    // apply, because there are no relevant odds to un-silo.
    panels: ['squares-board', 'squares-season'],

    // THE ONLY GROUP THAT HIDES THE SITE'S OWN CHROME. Squares is built to be
    // lifted out and handed back to the club, so on its panels the purple
    // masthead and the underline row come off entirely and the club's own
    // banner is the top of the page. Its navigation moves to a footer that
    // js/squaresChrome.js renders in the club's style -- see `navigate`
    // below for how that footer gets back here.
    chromeOff: true,
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

/** The groups reachable right now. Squares is always one of them; the rest
 *  appear only once the site gate is unlocked. See js/siteGate.js. */
const openGroups = () => GROUPS.filter((g) => isAllowed(g.id));

function renderMainNav() {
  mainNav.innerHTML = openGroups().map((g) => `
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
/**
 * Name the document for whatever is on screen.
 *
 * Bookmarks, browser tabs and history entries are all fed by this, and a
 * single-page app that never touches it labels every one of them the same.
 * That matters most for Squares: its link goes to people outside the pool, and
 * "Bova's Picks" is the wrong name in their tab bar and their bookmarks.
 *
 * The static <title> in index.html is the fallback for the instant before the
 * first render, and is what a link-preview crawler sees, since crawlers do not
 * run this.
 */
function paintTitle() {
  const group = groupById(active.group);
  const panel = PANELS[active.panel];
  const site = group?.title || "Bova's Picks";

  document.title = panel && panel.label !== group?.label
    ? `${panel.label} · ${site}`
    : site;
}

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
  // The gate is enforced HERE rather than only in the nav, because the nav is
  // not the only way in: a deep link, a restored hash, or the footer's own
  // buttons all land in this function. One check, at the single point every
  // route passes through.
  const wanted = isAllowed(groupId) ? groupId : PUBLIC_GROUP;
  const group = groupById(wanted) || groupById(PUBLIC_GROUP) || GROUPS[0];
  const panel = group.panels.includes(panelId) ? panelId : lastPanel.get(group.id);

  active = { group: group.id, panel };
  lastPanel.set(group.id, panel);

  renderMainNav();
  renderSubNav();
  renderPanels();
  labelPanel();
  paintTitle();

  // A class on <body>, not inline styles on two elements: the masthead and the
  // subnav bar are the site's, and a tab has no business reaching up and
  // editing them. This way the rule lives in the stylesheet next to the things
  // it hides, and turning it off is one line here.
  document.body.classList.toggle('chrome-off', group.chromeOff === true);

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

/**
 * Navigation requested by a panel rather than by the nav rows.
 *
 * An event rather than an exported function, deliberately. app.js imports
 * every tab, so a tab importing app.js back would be a cycle -- and this is
 * the mirror of the `panelchange` event app.js already dispatches downward.
 * One direction each way, no module knowing more than it has to.
 */
document.addEventListener('navigate', (e) => {
  const { group, panel } = e.detail || {};
  if (group) show(group, panel ?? lastPanel.get(group));
});

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

arrowNav(mainNav, '.maintab', () => openGroups().map((g) => g.id),
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

/* The shell re-reads the gate when it moves: the nav rows gain or lose their
   entries, and a visitor who locks the site while sitting on a gated panel is
   moved off it rather than left looking at something they can no longer reach. */
document.addEventListener('gatechange', () => {
  if (isUnlocked()) bootGatedTabs();
  show(isAllowed(active.group) ? active.group : PUBLIC_GROUP, active.panel);
});

document.getElementById('brand-season').textContent = SEASON;

/* ── Boot the tabs ────────────────────────────────────────────────────────
   SQUARES BOOTS ALWAYS; THE REST BOOT ONLY ONCE UNLOCKED, and that is a
   privacy decision rather than a performance one. Every init() below fetches
   as it starts — the survivor field, the pool's popularity files, the odds
   snapshot. Booting them behind a hidden panel would put all of it in a club
   visitor's network tab, where "you cannot see this" is plainly untrue. Not
   booting them means the requests never happen.

   Schedule leads the gated set: it owns the live-score polling the other tabs
   read from.
   ------------------------------------------------------------------------ */

let gatedBooted = false;

function bootGatedTabs() {
  if (gatedBooted) return;
  gatedBooted = true;

  initSchedule(document.getElementById('schedule-root'), SEASON);
  initGrid(document.getElementById('grid-root'), SEASON);
  initPickSheet(document.getElementById('picksheet-root'));
  initOdds(document.getElementById('odds-root'));
  initRecommend(document.getElementById('recommend-root'));
  initPlanning(document.getElementById('survivor-root'), SEASON);
  initInfinityWar(document.getElementById('infinity-root'), SEASON);
}

initSquares(document.getElementById('squares-root'), SEASON);
initSquaresLedger(document.getElementById('squares-season-root'), SEASON);

if (isUnlocked()) bootGatedTabs();
