/* ==========================================================================
   Grid — the whole season as one table. 32 teams down, 18 weeks across.

   This is the Excel view, rebuilt: every team's opponent in every week, at a
   glance, with the current week and the next few in the same eyeline. It
   serves both pools. The straight-up pool reads it for this week's favourable
   spots; survivor reads it for which weeks a team can still be spent in.

   THE COLORS MEAN ONE THING AT A TIME. A cell has one background, so exactly
   one "paint" is active -- win probability, survivor usability, or matchup
   type. Everything else (divisional, Thursday, primetime, rest, my tags) is a
   MARK: a border, a corner, a glyph. That separation is why the layers can be
   stacked without turning the grid into a swatch book, and it is why toggling
   any of them is a single class swap on the container rather than a re-render.

   WHERE THE NUMBERS COME FROM is js/gridModel.js's problem, not this file's.
   It hands back a cell per team-week carrying `winProb` and `probSource`, and
   this file's only obligation is to never render the two sources as if they
   were the same claim -- market probabilities are solid, projected ones are
   muted with a dotted rule and say so in the legend and the detail strip.

   NOT A SECOND ODDS ENGINE. The join to the market runs through
   js/oddsMatch.js, as CLAUDE.md requires. It uses that module's season-wide
   pair+date variant rather than the single-week one, because keying on the
   pair alone collapses both meetings of a division rivalry, and a season grid
   has all 96 of those cells in it at once.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import {
  SEASON, getSchedule, getProjections, getOddsSnapshot, getOddsHistory, getSurvivor,
} from './data.js';
import { auditSurvivorFeeds } from './season.js';
import { seasonBanner } from './seasonBanner.js';
import { currentWeek as currentWeekOf } from './gameState.js';
import { getIdentity, tintOn } from './teamIdentity.js';
import { ABBR_TO_MASCOT, DIVISION_OF, DIVISION_ORDER } from './teams.js';
import { buildGrid, key, windowStrength } from './gridModel.js';
import {
  LEAGUES, leagueById, isLive, loadLeagueState, saveLeagueState, setActivePool,
  setPick, usedTeams, weekUsed, fieldAvailability, scarcityFor,
} from './survivorLeagues.js';
import {
  fetchSleeperSurvivor, loadCachedFeed, saveCachedFeed,
  mergeMyPicks, freshness, coverageNote,
} from './sleeperSurvivor.js';
import { pickBoardShell, renderPickBoard } from './survivorPicks.js';

/* ── Preferences ──────────────────────────────────────────────────────────
   Everything the user has bent to their liking survives a refresh. The grid
   is a view you set up once and live in for a season, so losing the setup on
   every visit would make the flexibility worthless.
   ------------------------------------------------------------------------ */

const PREFS_KEY = 'grid:prefs';
const TAGS_KEY = (season) => `grid:tags:${season}`;

const DEFAULTS = {
  paint: 'prob',
  marks: { div: true, thu: true, prime: false, rest: false, tags: true },
  fit: true,            // size the table to the page instead of scrolling it
  zoom: 2,              // index into ZOOMS -- only consulted when fit is off
  sort: 'abbr',
  weeks: 'all',         // 'all' | 'rest' | 'ahead3' | 'ahead6' | 'from:<week>'
  league: 'mike',
  hidden: [],           // team abbrs switched off by hand
  hideUsed: false,      // and, separately, every team already spent in the pool
};

const ZOOMS = ['z0', 'z1', 'z2', 'z3'];

/* The row height and team-column width each zoom step produces. Duplicated
   from styles.css on purpose: what fits inside a cell has to be decided from a
   NUMBER, and fit mode's sizes are computed rather than named, so the reveal
   rules cannot key off the zoom class the way they used to. Keep in step with
   the .gridwrap.zN blocks in styles.css. */
const ZOOM_CH = [24, 32, 40, 54];
const ZOOM_TW = [64, 80, 96, 118];

/* How tall a cell has to be before another line of text is worth showing.
   Reveal order is the order of usefulness: opponent, then the number, then the
   slot, then rest days. Nothing is ever truncated to squeeze one more in. */
const ROOM = { prob: 30, slot: 38, rest: 50 };

/* Fit-mode geometry. The floor is the point below which shrinking stops being
   "fit on the page" and starts being "unreadable" -- at 18 weeks on a phone
   the arithmetic asks for ~17px a cell, which is a grey smear. Below the floor
   the grid keeps its own scrollbar and says so by not claiming to fit; hiding
   past weeks is what makes it fit there. */
const FIT = {
  minCell: 30,          // px -- narrower than this and fit is abandoned
  minTeamCol: 72,
  maxTeamCol: 118,
  metaTeamCol: 96,      // team column has to be at least this wide to show meta
};

const S = {
  root: null, season: SEASON,
  schedule: null, model: null, audit: null, now: 1,
  survivor: null, field: null, identity: null,
  league: null, tags: {},
  prefs: { ...DEFAULTS },
  sel: null,            // {team, week}
  // Which week the pick board is showing. Deliberately NOT in prefs: it is a
  // glance at the week in play, not a view you set up and live in, and a
  // remembered Week 3 would still be on screen in December.
  pickWeek: null,
};

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    return {
      ...DEFAULTS, ...raw,
      marks: { ...DEFAULTS.marks, ...(raw.marks || {}) },
      hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
      league: knownLeague(raw.league),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * A stored pool that no longer exists resolves to the default, not to itself.
 *
 * Pools are added and removed from LEAGUES as they are created and wound up,
 * and the selection outlives them in localStorage. Without this, a pref left
 * pointing at a removed pool survives the spread above while the <select> --
 * having no matching <option> -- displays its FIRST one instead. The grid then
 * strikes through one pool's used teams under another pool's name, with no
 * error anywhere. Anything read from storage and rendered as a choice needs
 * this check; `paint` and `sort` get it free by being validated in CSS.
 */
function knownLeague(id) {
  if (id === 'none') return 'none';
  return leagueById(id) ? id : DEFAULTS.league;
}

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(S.prefs)); } catch { /* quota */ }
}

function loadTags() {
  try { return JSON.parse(localStorage.getItem(TAGS_KEY(S.season))) || {}; } catch { return {}; }
}

function saveTags() {
  try { localStorage.setItem(TAGS_KEY(S.season), JSON.stringify(S.tags)); } catch { /* quota */ }
}

/* ── Boot ─────────────────────────────────────────────────────────────────*/

export async function initGrid(root, season = SEASON) {
  S.root = root;
  S.season = season;
  S.prefs = loadPrefs();
  S.tags = loadTags();

  // Write the validated prefs straight back, so a value knownLeague() had to
  // correct is repaired in storage rather than re-corrected on every boot for
  // the rest of the season. loadPrefs() is lossless -- unknown keys survive
  // the round trip -- so this is idempotent for prefs that needed nothing.
  savePrefs();

  // Identity rides along with the rest: the team column paints each row with
  // that team's own color and mark, the same way the Schedule card does, and
  // getIdentity() resolves null on failure rather than throwing -- a missing
  // file costs the wash and the logos, not the tab.
  const [schedule, projections, odds, survivor, identity] = await Promise.all([
    getSchedule(season), getProjections(season), getOddsSnapshot(), getSurvivor(season),
    getIdentity(),
  ]);

  S.schedule = schedule;
  S.survivor = survivor;
  S.identity = identity;
  S.audit = auditSurvivorFeeds({ season, schedule, odds, projections });

  // One field feed per pool, all in survivor-<year>.json's shape, so nothing
  // downstream branches on which pool it is painting. Mike's is a parsed file
  // shipped with the site; every live pool's is whatever that pool's last
  // Refresh cached, and null until its button has been pressed once.
  //
  // Built from LEAGUES rather than listed by hand: there are three Sleeper
  // pools now, and a hand-written list is how the fourth one silently gets no
  // cache at all.
  S.feeds = { mike: survivor };
  for (const l of LEAGUES) {
    if (l.live) S.feeds[l.id] = loadCachedFeed(season, l.id);
  }

  if (!schedule?.games?.length) {
    root.innerHTML = shellHead() + missingSchedule(season);
    return;
  }

  S.model = buildGrid({ schedule, projections, odds });
  S.now = currentWeekOf(schedule);
  S.league = loadLeagueState(S.prefs.league, season);
  applyField();

  root.innerHTML = shellHead() + banner() + controls() + detailShell() + tableShell()
    + legend() + pickBoardShell();
  wire();
  renderTable();
  paintPickBoard();
  scrollToCurrentWeek();
}

/**
 * The field's week, under the grid. Re-rendered rather than re-mounted, so the
 * board follows the pool switcher and the Refresh button without the grid
 * having to know what is inside it.
 *
 * S.pickWeek is left null until the user picks one: the board then shows the
 * latest week that has any visible picks, which is the week being decided.
 * Pinning it to a week at boot would leave it stranded there once the next
 * Sunday's picks unlock.
 */
function paintPickBoard() {
  renderPickBoard(document.getElementById('g-pickboard'), {
    feed: S.feeds?.[S.prefs.league] || null,
    season: S.season,
    league: leagueById(S.prefs.league),
    identity: S.identity,
    week: S.pickWeek,
    mine: S.league,
  });
}

/** Point S.field at the active pool's feed. Called on boot and on every pool
 *  switch -- scarcity is a property of the pool, not of the grid. */
function applyField() {
  S.field = fieldAvailability(S.feeds?.[S.prefs.league] || null, S.season);
}

/**
 * Fit is measured, so it has to be re-measured whenever the measurement could
 * have changed.
 *
 * A ResizeObserver on the container rather than a window `resize` listener:
 * the container's width changes for reasons the window's never does -- the
 * page gaining a vertical scrollbar as rows are unhidden takes ~15px off it,
 * and a browser zoom does not always fire `resize` at all. Observing the thing
 * actually being measured means the size can never disagree with the space.
 *
 * The panelchange half is still needed, and is not redundant: a hidden panel
 * measures zero, the grid boots hidden unless the hash points straight at it,
 * and a zero measurement is skipped rather than acted on -- so without this,
 * the first visit would show whatever geometry the last render happened to
 * leave behind.
 */
function watchGeometry() {
  const wrap = document.getElementById('g-wrap');

  document.addEventListener('panelchange', (e) => {
    if (e.detail?.panel === 'grid') applyFit();
  });

  // Kept alongside the observer, not instead of it. ResizeObserver callbacks
  // are delivered at a rendering step, so a backgrounded or non-compositing
  // tab can bank them until it is next painted; `resize` fires regardless.
  // Both land on the same idempotent function, so a double fire costs nothing.
  window.addEventListener('resize', applyFit);

  if (!wrap || typeof ResizeObserver === 'undefined') return;

  // Guarded against re-entry: applyFit only writes custom properties, and the
  // table it sizes never widens its own container, so this cannot loop -- but
  // an observer that fires on its own writes is a nasty enough bug to be worth
  // making structurally impossible rather than merely unlikely.
  let last = 0;
  new ResizeObserver(() => {
    const w = wrap.clientWidth;
    if (w === last) return;
    last = w;
    applyFit();
  }).observe(wrap);
}

/* ── Chrome ───────────────────────────────────────────────────────────────*/

/* NO SOURCE PILL HERE. This used to carry "271 priced · 1 modelled", a count
   of which cells came from the market and which from the projection model —
   true, and unreadable without knowing the vocabulary, on a tab whose header
   should say what the tab is. The distinction still matters and is still made,
   but at the only place it can be acted on: the cell itself, where a modelled
   number wears a dotted underline, with the legend below explaining it. A
   season-wide tally of the two was never a number to do anything with. */
function shellHead() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">The whole season, one screen</p>
        <h2>Grid</h2>
      </div>
    </div>`;
}

function banner() {
  return seasonBanner(S.audit, { context: 'the grid' });
}

function missingSchedule(season) {
  return `
    <div class="notice">
      <strong>No schedule for ${esc(season)} yet.</strong><br />
      The grid is built from <code>data/schedule-${esc(season)}.json</code>.
      Build it with <code>python scripts/fetch_schedule.py ${esc(season)}</code>.
    </div>`;
}

/**
 * Three flat rows, not a wrapping field of stacked label-over-control blocks.
 *
 * The old layout used the site's standard `.field` (label above input) for
 * eight controls in one wrapping flex row, which on a laptop came out four
 * rows tall and pushed the table itself below the fold -- on the one tab whose
 * entire value is seeing everything at once. The rows are now grouped by what
 * they do rather than laid out by what they are: pickers, then marks, then the
 * row filter. Labels sit inline to the left of each row so a row is one line
 * high, and the whole card is capped to the table's width so it stops looking
 * like a banner.
 */
function controls() {
  const p = S.prefs;
  const canUsePool = p.league !== 'none';

  return `
    <div class="card gridctl">
      <div class="gridctl-row">
        ${picker('g-paint', 'Color', `
          ${opt('prob', 'Win probability', p.paint)}
          ${opt('surv', 'Survivor usable', p.paint)}
          ${opt('type', 'Matchup type', p.paint)}
          ${opt('none', 'No color', p.paint)}`)}

        ${picker('g-weeks', 'Weeks', weekOptions())}

        ${picker('g-sort', 'Rows', `
          ${opt('abbr', 'A to Z', p.sort)}
          ${opt('division', 'By division', p.sort)}
          ${opt('ahead', 'Best spots first', p.sort)}`)}

        ${/* Full names here, `short` only where a name sits inside a sentence
             (the detail panel's Spend button). The dropdown is where you pick
             which real pool you are looking at, and "Mike's" vs "Poop" is not
             enough to be sure. */''}
        ${picker('g-league', 'Pool', `
          ${LEAGUES.map((l) => opt(l.id, l.name, p.league)).join('')}
          ${opt('none', 'Off', p.league)}`)}

        <div class="gzoom" role="group" aria-label="Size">
          <button type="button" class="gzoom-fit ${p.fit ? 'is-on' : ''}"
                  id="g-fit" aria-pressed="${p.fit}">Fit</button>
          <button type="button" class="gzoom-btn" id="g-zoom-out" aria-label="Zoom out">&minus;</button>
          <button type="button" class="gzoom-btn" id="g-zoom-in" aria-label="Zoom in">+</button>
        </div>
      </div>

      ${liveRow()}

      <div class="gridctl-row">
        <span class="gridctl-label" id="g-marks-label">Marks</span>
        <div class="gmarks" role="group" aria-labelledby="g-marks-label">
          ${mark('div', 'Div + conf')}
          ${mark('thu', 'Thursday')}
          ${mark('prime', 'Primetime')}
          ${mark('rest', 'Rest days')}
          ${mark('tags', 'My tags')}
        </div>
      </div>

      <div class="gridctl-row">
        <span class="gridctl-label">Teams <span id="g-teamcount" class="gcount"></span></span>

        <label class="gmark" title="${canUsePool
          ? 'Hides every team already spent in this pool, and keeps hiding them as you spend more'
          : 'Pick a survivor pool first — there are no spent teams to exclude with the pool off'}">
          <input type="checkbox" id="g-hideused"
                 ${p.hideUsed ? 'checked' : ''}${canUsePool ? '' : ' disabled'} />
          <span>Exclude my picks</span>
        </label>

        <details class="gteams">
          <summary>Choose teams</summary>
          <div class="gteams-body">
            <div class="gteams-actions">
              <button type="button" class="btn btn-ghost" data-teams="all">All 32</button>
              <button type="button" class="btn btn-ghost" data-teams="none">None</button>
              <button type="button" class="btn btn-ghost" data-teams="invert">Invert</button>
            </div>
            <div class="gteams-list" id="g-teams-list"></div>
          </div>
        </details>
      </div>
    </div>`;
}

const picker = (id, label, options) => `
  <span class="gpick">
    <label for="${id}">${esc(label)}</label>
    <select id="${id}">${options}</select>
  </span>`;

/* ── The live-pool row ────────────────────────────────────────────────────
   Only Sleeper can be fetched, so this row is present for every pool and
   hidden for the ones it cannot serve, rather than being added and removed
   from the DOM on each switch. Toggling `hidden` keeps the button's identity
   stable, which matters because a refresh in flight has to survive the user
   changing pool and changing back.
   ------------------------------------------------------------------------ */

function liveRow() {
  return `
    <div class="gridctl-row glive" id="g-live-row" ${isLive(S.prefs.league) ? '' : 'hidden'}>
      <span class="gridctl-label">Pool data</span>
      <button type="button" class="btn btn-ghost glive-btn" id="g-refresh">Refresh from Sleeper</button>
      <span class="glive-status" id="g-live-status" role="status" aria-live="polite">${liveStatus()}</span>
    </div>`;
}

/**
 * What the row says between refreshes.
 *
 * Deliberately leads with coverage rather than with the timestamp. Picks are
 * withheld until their game kicks off (see the kickoff gate in
 * sleeperSurvivor.js), so "updated 2 min ago" on its own reads as "this is the
 * whole pool" when it may be three entries out of twelve. How much is in the
 * number outranks how recently it was asked for.
 */
function liveStatus() {
  const feed = S.feeds?.[S.prefs.league];
  if (!feed) return 'Not fetched yet — Refresh pulls every entry’s picks from Sleeper.';

  // Deadpool sat at one entry for its first weeks, so the plural is not
  // cosmetic here -- "1 entries" is the line that makes a new pool look broken.
  const n = feed.entries?.length ?? 0;
  const bits = [`${n} ${n === 1 ? 'entry' : 'entries'}`];
  const cover = coverageNote(feed);
  if (cover) bits.push(cover);
  bits.push(freshness(feed));
  return esc(bits.join(' · '));
}

function paintLiveRow() {
  const row = document.getElementById('g-live-row');
  if (row) row.hidden = !isLive(S.prefs.league);

  const status = document.getElementById('g-live-status');
  if (status) status.innerHTML = liveStatus();
}

/**
 * Go and get the pool.
 *
 * On failure the cached feed is left exactly as it was. An undocumented
 * endpoint that changes shape must degrade to "yesterday's numbers, and it
 * said why" -- never to a half-filled pool, which would understate scarcity
 * without looking wrong.
 */
async function refreshLivePool() {
  const league = leagueById(S.prefs.league);
  const btn = document.getElementById('g-refresh');
  const status = document.getElementById('g-live-status');
  if (!league?.sleeper || !btn) return;

  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  if (status) status.innerHTML = 'Asking Sleeper…';

  try {
    const feed = await fetchSleeperSurvivor(league.sleeper, S.season);

    S.feeds[league.id] = feed;
    saveCachedFeed(S.season, league.id, feed);

    // My own picks come back with everyone else's, so the ledger that used to
    // be hand-typed fills itself in. Merged, not replaced: a week the feed has
    // not reached yet keeps whatever was entered by hand.
    S.league = mergeMyPicks(S.league, feed);
    saveLeagueState(league.id, S.season, S.league);

    applyField();
    renderTable();
    // A refresh is the one action that can turn the board's empty state into
    // a chart, so it has to repaint with the rest.
    paintPickBoard();
  } catch (err) {
    if (status) {
      const had = S.feeds?.[league.id];
      status.innerHTML = esc(
        `Couldn’t refresh — ${err.message}. ${had ? 'Showing the last good copy.' : 'Nothing cached yet.'}`
      );
    }
    return;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Refresh from Sleeper';
  }

  paintLiveRow();
}

/**
 * The week window, including the "hide everything before week N" half.
 *
 * One select rather than a select plus a separate "hide past weeks" checkbox,
 * because the two would contradict each other the moment you set a range and
 * then a floor. The named ranges track the current week automatically; the
 * `from:` group is the manual floor, and picking the current week there is the
 * plain-language version of "hide the weeks that are already played".
 */
function weekOptions() {
  const p = S.prefs.weeks;
  const last = S.model.weeks[S.model.weeks.length - 1] ?? 18;

  return `
    ${opt('all', `All ${S.model.weeks.length}`, p)}
    ${opt('rest', `Week ${S.now} on — hide past`, p)}
    ${opt('ahead3', `Next 3 (${S.now}-${Math.min(last, S.now + 2)})`, p)}
    ${opt('ahead6', `Next 6 (${S.now}-${Math.min(last, S.now + 5)})`, p)}
    <optgroup label="Hide weeks before">
      ${S.model.weeks.map((w) => opt(`from:${w}`, `Week ${w} on`, p)).join('')}
    </optgroup>`;
}

const opt = (value, label, current) =>
  `<option value="${value}"${value === current ? ' selected' : ''}>${esc(label)}</option>`;

const mark = (id, label) => `
  <label class="gmark">
    <input type="checkbox" data-mark="${id}"${S.prefs.marks[id] ? ' checked' : ''} />
    <span>${esc(label)}</span>
  </label>`;

function detailShell() {
  return `<div class="card gdetail" id="g-detail" hidden></div>`;
}

function tableShell() {
  return `
    <div class="gridwrap" id="g-wrap">
      <div class="gridscroll" id="g-scroll">
        <table class="gtable" id="g-table">
          <thead id="g-head"></thead>
          <tbody id="g-body"></tbody>
        </table>
      </div>
    </div>`;
}

function legend() {
  return `
    <details class="card glegend">
      <summary>What the colors and marks mean</summary>
      <div class="glegend-body">
        <div>
          <h3>Win probability</h3>
          <p class="lede">
            The row team's chance of winning that game.
            <span class="gswatch p-6"></span> 75%+
            <span class="gswatch p-5"></span> 65
            <span class="gswatch p-4"></span> 55
            <span class="gswatch p-3"></span> even
            <span class="gswatch p-2"></span> 45
            <span class="gswatch p-1"></span> 35
            <span class="gswatch p-0"></span> under 25%
          </p>
          <p class="lede">
            A <span class="gproj-demo">dotted number</span> is modelled, not priced. Market odds
            always win where both exist -- a 78% projection weeks out is a much softer claim
            than a 78% moneyline on Saturday, and the two are never averaged.
          </p>
        </div>
        <div>
          <h3>Survivor usable</h3>
          <p class="lede">
            Paints only what clears SURVIVOR-STRATEGY.md's floor: never pick a team below about
            70% to win. Everything under it greys out, so the question the grid answers becomes
            "which weeks can this team be spent at all" rather than "who is slightly better".
          </p>
        </div>
        <div>
          <h3>Marks</h3>
          <p class="lede">
            Divisional games get a purple edge and conference games a lighter one -- the tightest
            games on the board and the ones a season-long model reads worst. THU, SNF and MNF flag
            the standalone windows. Rest days are shown as a fact, not an edge: STRATEGY.md bans
            situational angles, so a short week is labelled and left for the market number beside
            it to price.
          </p>
        </div>
        <div>
          <h3>Survivor pool</h3>
          <p class="lede">
            Used teams are struck through for the selected pool only -- the three pools are
            different games and their used lists are never merged. Where a field is available the
            team column also shows what share of surviving entries still holds that team: Mike's
            pool from the weekly workbook, the Sleeper pool live from Sleeper itself. Other
            entrants' Sleeper picks stay hidden until their game kicks off, the same rule the
            Sleeper app plays by, so mid-week that share is partial -- the Pool data row says how
            partial, including how many picks are in but still locked.
          </p>
        </div>
      </div>
    </details>`;
}

/* ── Table ────────────────────────────────────────────────────────────────*/

function visibleWeeks() {
  const all = S.model.weeks;
  const { weeks } = S.prefs;
  if (weeks === 'all') return all;

  if (String(weeks).startsWith('from:')) {
    const from = Number(String(weeks).slice(5));
    return Number.isFinite(from) ? all.filter((w) => w >= from) : all;
  }

  const span = weeks === 'ahead3' ? 3 : weeks === 'ahead6' ? 6 : 99;
  return all.filter((w) => w >= S.now && w < S.now + span);
}

function visibleTeams() {
  // Two independent filters, deliberately not merged into one list.
  //
  // `hidden` is a manual choice and survives everything. "Exclude my picks" is
  // a standing rule read off the pool state, so a team spent after the box was
  // ticked disappears on its own -- which the old one-shot "Only unused"
  // button could not do, since it wrote the used set into `hidden` once and
  // then went stale. Keeping them separate also means unticking the box gives
  // back exactly the teams it took, not everything.
  const hidden = new Set(S.prefs.hidden);
  let teams = S.model.teams.filter((t) => !hidden.has(t));
  const weeks = visibleWeeks();

  if (S.prefs.hideUsed && S.prefs.league !== 'none') {
    const used = usedTeams(S.league);
    teams = teams.filter((t) => !used.has(t));
  }

  if (S.prefs.sort === 'division') {
    return teams.sort((a, b) => {
      const d = DIVISION_ORDER.indexOf(DIVISION_OF[a]) - DIVISION_ORDER.indexOf(DIVISION_OF[b]);
      return d || a.localeCompare(b);
    });
  }

  if (S.prefs.sort === 'ahead') {
    // Sorted by the average win probability across the weeks ON SCREEN, not a
    // fixed lookahead -- so narrowing the week filter re-ranks the rows to
    // answer "who has the best run over exactly this stretch".
    const strength = new Map(teams.map((t) => [t, windowStrength(S.model.cells, t, weeks)]));
    return teams.sort((a, b) => {
      const sa = strength.get(a), sb = strength.get(b);
      if (sa == null && sb == null) return a.localeCompare(b);
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa || a.localeCompare(b);
    });
  }

  return teams.sort();
}

function renderTable() {
  const weeks = visibleWeeks();
  const teams = visibleTeams();

  document.getElementById('g-head').innerHTML = headRows(weeks);
  document.getElementById('g-body').innerHTML = teams.map((t) => row(t, weeks)).join('');

  renderTeamList();
  applyDisplay();
  renderDetail();

  const count = document.getElementById('g-teamcount');
  if (count) count.textContent = `${teams.length} of 32`;
}

/** Month band above the week numbers, the way the paper grid does it -- it is
 *  what turns "Week 11" into "mid-November" without a lookup. */
function headRows(weeks) {
  const spans = [];
  for (const w of weeks) {
    const label = monthOf(w);
    const last = spans[spans.length - 1];
    if (last && last.label === label) last.n += 1;
    else spans.push({ label, n: 1 });
  }

  return `
    <tr class="gmonths">
      <th class="gcorner" scope="col"><span class="gcorner-label">TEAM</span></th>
      ${spans.map((s) => `<th colspan="${s.n}" scope="colgroup">${esc(s.label)}</th>`).join('')}
    </tr>
    <tr class="gweeks">
      <th class="gcorner gcorner-2" scope="col"></th>
      ${weeks.map((w) => `
        <th scope="col" data-week="${w}" class="${w === S.now ? 'is-now' : ''}">${w}</th>
      `).join('')}
    </tr>`;
}

function monthOf(week) {
  const first = S.schedule.games
    .filter((g) => g.week === week && g.date)
    .map((g) => g.date)
    .sort()[0];
  if (!first) return '';
  return new Date(first).toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' });
}

function row(team, weeks) {
  return `
    <tr data-team="${team}">
      ${teamCell(team)}
      ${weeks.map((w) => cell(team, w)).join('')}
    </tr>`;
}

/**
 * The row header: the team's mark on an 8% wash of its own color, exactly the
 * treatment the Schedule card uses, so the same team reads the same way on
 * both tabs and the eye can find a row by color before it reads the letters.
 *
 * The wash is mixed to a solid by tintOn() rather than set with opacity, so
 * the text contrast on top is a fixed measured number. It is delivered as a
 * custom property rather than `background:` because the selection crosshair
 * and the sticky header both need to paint over it, and an inline background
 * would outrank every stylesheet rule that tries.
 *
 * The inner span is what carries the flexbox: `display:flex` on the <th>
 * itself would take it out of the table's internal layout, and with it the
 * sticky column and the fixed width.
 */
function teamCell(team) {
  const rec = S.model.records.get(team);
  const played = rec.w + rec.l + rec.t;
  const usedWeek = S.prefs.league === 'none' ? null : weekUsed(S.league, team);
  const scarce = S.prefs.league !== 'none' && leagueById(S.prefs.league)?.hasField
    ? scarcityFor(S.field, team) : null;

  const ident = S.identity?.teams?.[team] || null;
  const logo = ident?.assets?.logo || '';
  const primary = ident?.palette?.primary?.hex || '';
  const tint = primary ? tintOn(primary, '#FFFFFF', 0.08) : '';

  return `
    <th scope="row" class="gteam ${usedWeek ? 'is-used' : ''}" data-team="${team}"${
      tint ? ` style="--team-tint:${tint}"` : ''
    }>
      <span class="gteam-in">
        <span class="gteam-badge" aria-hidden="true">${
          logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async">` : ''
        }</span>
        <span class="gteam-abbr">${team}</span>
        <span class="gteam-meta">
          ${played ? `<span class="grec">${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ''}</span>` : ''}
          ${usedWeek ? `<span class="gused" title="Spent in Week ${usedWeek}">W${usedWeek}</span>` : ''}
          ${scarce ? `<span class="gscarce" title="${Math.round(scarce.availablePct * 100)}% of surviving entries still hold ${team}">${Math.round(scarce.availablePct * 100)}%</span>` : ''}
        </span>
      </span>
    </th>`;
}

function cell(team, week) {
  const c = S.model.cells.get(key(team, week));
  if (!c) return `<td class="gc is-empty" data-team="${team}" data-week="${week}"></td>`;
  if (c.bye) {
    return `<td class="gc is-bye" data-team="${team}" data-week="${week}"><span class="gc-opp">BYE</span></td>`;
  }

  const cls = ['gc', c.isHome ? 'is-home' : 'is-away', TYPE_CLASS[c.type]];
  if (week === S.now) cls.push('is-now');

  // A blocked audit withholds every computed number rather than painting a
  // grid whose colors were mixed from two different seasons. The opponent
  // and the bye weeks come from the schedule alone, so those still render.
  if (!S.audit.blocking && c.winProb != null) {
    cls.push(probClass(c.winProb), survClass(c.winProb));
    if (c.probSource === 'projection') cls.push('is-proj');
  } else {
    cls.push('p-none', 's-none');
  }

  if (c.divisional) cls.push('is-div');
  if (c.conference) cls.push('is-conf');
  if (c.slot === 'THU' || c.slot === 'WED' || c.slot === 'FRI' || c.slot === 'SAT') cls.push('is-thu');
  if (c.slot === 'SNF' || c.slot === 'MNF') cls.push('is-prime');
  if (c.slot === 'INTL') cls.push('is-intl');
  if (c.shortWeek) cls.push('is-short');
  if (c.offBye) cls.push('is-rested');
  if (c.result) cls.push('is-post', `is-${c.result}`);

  const usedWeek = S.prefs.league === 'none' ? null : weekUsed(S.league, team);
  if (usedWeek != null) cls.push(usedWeek === week ? 'is-mypick' : 'is-usedrow');

  const tag = S.tags[key(team, week)];
  if (tag) cls.push(`tag-${tag}`);

  const prob = c.winProb == null || S.audit.blocking ? '' : Math.round(c.winProb * 100);

  return `
    <td class="${cls.join(' ')}" data-team="${team}" data-week="${week}" tabindex="-1">
      <span class="gc-opp">${c.isHome ? '' : '@'}${c.opp}</span>
      <span class="gc-prob">${prob}</span>
      <span class="gc-slot">${c.slot === 'SUN' || c.slot === 'TBD' ? '' : c.slot}</span>
      <span class="gc-rest">${c.restDays ? `${c.restDays}d` : ''}</span>
    </td>`;
}

const TYPE_CLASS = {
  division: 't-div', conference: 't-conf', interconference: 't-inter',
};

/** Seven buckets, centred on a coin flip. Even steps of 10 points either side
 *  of 45-55, so the eye reads distance from even rather than absolute value. */
function probClass(p) {
  if (p >= 0.75) return 'p-6';
  if (p >= 0.65) return 'p-5';
  if (p >= 0.55) return 'p-4';
  if (p >= 0.45) return 'p-3';
  if (p >= 0.35) return 'p-2';
  if (p >= 0.25) return 'p-1';
  return 'p-0';
}

/** SURVIVOR-STRATEGY.md: never pick a team below ~70% to win, and giving up
 *  more than ~4-5 points of win probability for popularity is a losing trade.
 *  Those two rules are the only thresholds here on purpose -- anything finer
 *  would imply a precision the preseason numbers do not have. */
function survClass(p) {
  if (p >= 0.75) return 's-hi';
  if (p >= 0.70) return 's-ok';
  if (p >= 0.65) return 's-edge';
  return 's-no';
}

function renderTeamList() {
  const list = document.getElementById('g-teams-list');
  if (!list) return;

  const hidden = new Set(S.prefs.hidden);
  const used = S.prefs.league === 'none' ? new Set() : usedTeams(S.league);

  list.innerHTML = S.model.teams.map((t) => `
    <label class="gteamchip ${used.has(t) ? 'is-used' : ''}">
      <input type="checkbox" data-team-toggle="${t}"${hidden.has(t) ? '' : ' checked'} />
      <span>${t}</span>
    </label>`).join('');
}

/** Paint, marks, zoom and selection are all container classes, so changing any
 *  of them never rebuilds 576 cells or loses the scroll position. */
function applyDisplay() {
  const wrap = document.getElementById('g-wrap');
  if (!wrap) return;

  const p = S.prefs;
  wrap.className = [
    'gridwrap',
    `paint-${p.paint}`,
    ZOOMS[clampZoom(p.zoom)],
    p.fit ? 'is-fit' : '',
    ...Object.entries(p.marks).filter(([, on]) => on).map(([k]) => `mk-${k}`),
    p.league === 'none' ? '' : 'has-league',
  ].filter(Boolean).join(' ');

  applyFit();
  paintSelection();
}

/**
 * Size the table to the page rather than giving it a scrollbar of its own.
 *
 * A nested scroller was the wrong default here. The grid's whole claim is
 * "the season, one screen", and a 62px fixed cell width meant the season was
 * actually behind a horizontal scrollbar you had to drag to compare Week 4
 * with Week 12 -- and a vertical one that fought the page's own. So the cell
 * geometry is now DERIVED from the space available: measure the container,
 * divide by the number of weeks on screen, and write the result into the same
 * custom properties the zoom classes set. Inline properties outrank the class,
 * so zooming is simply fit switched off.
 *
 * Two honest failure modes, both handled rather than papered over:
 *
 *  - Below FIT.minCell there is no fit worth having (18 weeks on a 375px phone
 *    wants 17px a cell). The grid keeps its scrollbar and drops `fit-ok`, so
 *    the CSS knows not to claim otherwise. Narrowing the week window is what
 *    fixes it, which is exactly what the Weeks control is now for.
 *  - 32 rows never fit a viewport vertically, and pretending otherwise would
 *    mean 12px rows. Vertical overflow goes to the PAGE, not to a box inside
 *    it: one scrollbar, and the sticky header sticks to the top of the window
 *    instead of to the top of a box that is itself scrolled off.
 */
function applyFit() {
  const wrap = document.getElementById('g-wrap');
  if (!wrap) return;

  if (!S.prefs.fit) {
    const z = clampZoom(S.prefs.zoom);
    for (const v of ['--cw', '--ch', '--fs', '--tw']) wrap.style.removeProperty(v);
    wrap.classList.remove('fit-ok');
    applyDensity(wrap, ZOOM_CH[z], ZOOM_TW[z]);
    return;
  }

  // A hidden panel measures zero. Leave the last good geometry in place and
  // wait for the panelchange that makes it measurable.
  const avail = wrap.clientWidth;
  if (avail < 200) return;

  const n = visibleWeeks().length;
  if (!n) return;

  const tw = Math.max(FIT.minTeamCol, Math.min(FIT.maxTeamCol, Math.round(avail * 0.12)));

  // Fractional, not floored. Flooring 18 columns throws away up to 18px on the
  // right, which reads as the table failing to reach the edge of its own card;
  // sub-pixel cell widths sum back to the measured space instead.
  const cw = (avail - tw - 2) / n;
  const ok = cw >= FIT.minCell;
  const cell = Math.max(FIT.minCell, Math.round(cw * 100) / 100);

  // Height and type follow width, so a squeezed grid stays in proportion
  // instead of turning into tall thin slivers. The clamps are the z0 and z3
  // extremes -- fit is allowed to land anywhere inside the zoom range, never
  // outside it.
  const ch = clamp(Math.round(cell * 0.62), 24, 54);

  wrap.style.setProperty('--cw', `${cell}px`);
  wrap.style.setProperty('--ch', `${ch}px`);
  wrap.style.setProperty('--fs', `${clamp(+(cell / 5.2).toFixed(1), 10, 13.5)}px`);
  wrap.style.setProperty('--tw', `${tw}px`);

  wrap.classList.toggle('fit-ok', ok);
  applyDensity(wrap, ch, tw);
}

/** What there is room to render, decided from the geometry rather than from
 *  the zoom step — fit mode has no zoom step to read. */
function applyDensity(wrap, ch, tw) {
  wrap.classList.toggle('d-prob', ch >= ROOM.prob);
  wrap.classList.toggle('d-slot', ch >= ROOM.slot);
  wrap.classList.toggle('d-rest', ch >= ROOM.rest);
  wrap.classList.toggle('tw-wide', tw >= FIT.metaTeamCol);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The crosshair. Applied by toggling classes rather than by re-rendering,
 * because selection moves with the arrow keys and a re-render would take the
 * focused cell out from under the caret on every keystroke.
 */
function paintSelection() {
  for (const node of document.querySelectorAll('.is-selrow, .is-selcol, .is-sel')) {
    node.classList.remove('is-selrow', 'is-selcol', 'is-sel');
  }
  if (!S.sel) return;

  const { team, week } = S.sel;
  for (const node of document.querySelectorAll(`.gc[data-week="${week}"], .gweeks th[data-week="${week}"]`)) {
    node.classList.add('is-selcol');
  }
  for (const node of document.querySelectorAll(`.gc[data-team="${team}"], .gteam[data-team="${team}"]`)) {
    node.classList.add('is-selrow');
  }
  document.querySelector(`.gc[data-team="${team}"][data-week="${week}"]`)?.classList.add('is-sel');
}

const clampZoom = (z) => Math.max(0, Math.min(ZOOMS.length - 1, Number(z) || 0));

/** Puts the current week under the eye on open. A season grid that opens
 *  showing Week 1 in November is a grid you have to scroll before you can use.
 *  A no-op once the table fits — there is nothing to scroll to. */
function scrollToCurrentWeek() {
  const scroll = document.getElementById('g-scroll');
  if (document.getElementById('g-wrap')?.classList.contains('fit-ok')) return;
  const th = scroll?.querySelector('.gweeks th.is-now');
  if (!scroll || !th) return;
  const teamColW = scroll.querySelector('.gcorner')?.offsetWidth || 0;
  scroll.scrollLeft = Math.max(0, th.offsetLeft - teamColW - 8);
}

/* ── Detail strip ─────────────────────────────────────────────────────────*/

function selectCell(team, week) {
  const c = S.model.cells.get(key(team, week));
  if (!c || c.bye) return;
  S.sel = { team, week };
  applyDisplay();
  renderDetail();

  const td = document.querySelector(`.gc[data-team="${team}"][data-week="${week}"]`);
  td?.focus({ preventScroll: true });
}

function renderDetail() {
  const box = document.getElementById('g-detail');
  if (!box) return;

  if (!S.sel) { box.hidden = true; box.innerHTML = ''; return; }

  const { team, week } = S.sel;
  const c = S.model.cells.get(key(team, week));
  if (!c || c.bye) { box.hidden = true; return; }

  const league = leagueById(S.prefs.league);
  const mine = S.prefs.league !== 'none' && S.league.picks[String(week)] === team;
  const spentWeek = S.prefs.league === 'none' ? null : weekUsed(S.league, team);
  const tag = S.tags[key(team, week)] || '';

  box.hidden = false;
  box.innerHTML = `
    <div class="gdetail-head">
      <div>
        <p class="eyebrow">Week ${week} · ${esc(kickoffLabel(c))}</p>
        <h3>${esc(ABBR_TO_MASCOT[team])} ${c.isHome ? 'vs' : 'at'} ${esc(ABBR_TO_MASCOT[c.opp])}</h3>
      </div>
      <button type="button" class="btn btn-ghost" id="g-detail-close" aria-label="Close">Close</button>
    </div>

    <p class="lede gdetail-facts">${detailFacts(c)}</p>
    <p class="lede gdetail-move" id="g-move"></p>

    <div class="gdetail-actions">
      ${league ? `
        <button type="button" class="btn ${mine ? '' : 'btn-ghost'}" id="g-use">
          ${mine ? `Spent in ${esc(league.short)} — undo` : `Spend ${team} here (${esc(league.short)})`}
        </button>
        ${!mine && spentWeek ? `<span class="gdetail-note">Already spent in Week ${spentWeek} — this moves it.</span>` : ''}
      ` : ''}
      <span class="gtagset">
        ${tagBtn('target', 'Target', tag)}
        ${tagBtn('avoid', 'Avoid', tag)}
        ${tagBtn('watch', 'Watch', tag)}
      </span>
    </div>`;

  loadMovement(c);
}

const tagBtn = (id, label, current) =>
  `<button type="button" class="gtagbtn tag-${id} ${current === id ? 'is-on' : ''}" data-tag="${id}">${esc(label)}</button>`;

function detailFacts(c) {
  const bits = [];

  if (S.audit.blocking) {
    bits.push('Numbers withheld — the feeds disagree about the season.');
  } else if (c.winProb == null) {
    bits.push('No market line and no projection for this game yet.');
  } else {
    const pct = Math.round(c.winProb * 100);
    bits.push(c.probSource === 'market'
      ? `<strong>${c.team} ${pct}%</strong> to win (de-vigged market)`
      : `<strong>${c.team} ${pct}%</strong> to win (modelled — no market line)`);
  }

  if (c.projMargin != null) {
    const m = c.projMargin;
    bits.push(`model margin ${m > 0 ? '+' : ''}${m.toFixed(1)}`);
  }

  bits.push(c.divisional ? 'divisional' : c.conference ? 'same conference' : 'inter-conference');
  if (c.restDays != null) bits.push(`${c.restDays} days rest`);
  if (c.result) bits.push(`Final: ${c.result} ${c.score.for}-${c.score.against}`);

  const scarce = leagueById(S.prefs.league)?.hasField ? scarcityFor(S.field, c.team) : null;
  if (scarce) bits.push(`${Math.round(scarce.availablePct * 100)}% of the surviving field still holds ${c.team}`);

  return bits.join(' · ');
}

function kickoffLabel(c) {
  if (c.timeTBD || !c.kickoff) return 'time not set';
  const d = new Date(c.kickoff);
  const when = d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
  const slot = c.slot === 'INTL' ? ' ET (international window)'
    : c.slot === 'SUN' ? ' ET' : ` ET · ${c.slot}`;
  return when + slot;
}

/**
 * How the market has moved on this game since it first appeared.
 *
 * Read off the per-game history file, which is keyed by the Odds API's event
 * id rather than by week bucket -- so `history[0]` is genuinely the opening
 * price for this game, not just the first snapshot taken after it drifted
 * into the current week's bucket. Loaded on selection rather than up front;
 * pulling 272 history files to render a table nobody has clicked would be
 * absurd.
 */
async function loadMovement(c) {
  const node = document.getElementById('g-move');
  if (!node || !c.oddsEventId) return;

  const history = await getOddsHistory(c.oddsEventId);
  if (!history.length || S.sel?.team !== c.team || S.sel?.week !== c.week) return;

  const mascot = ABBR_TO_MASCOT[c.team];
  const probOf = (snap) => {
    const last = (s) => String(s).trim().split(/\s+/).pop();
    if (last(snap.home) === mascot) return snap.homeWinProb;
    if (last(snap.away) === mascot) return snap.awayWinProb;
    return null;
  };

  const open = probOf(history[0]);
  const now = probOf(history[history.length - 1]);
  if (open == null || now == null) return;

  const delta = Math.round((now - open) * 100);
  node.innerHTML = history.length < 2
    ? `One snapshot on record — no movement to show yet.`
    : `Opened <strong>${Math.round(open * 100)}%</strong>, now
       <strong>${Math.round(now * 100)}%</strong>
       (${delta > 0 ? '+' : ''}${delta} pts across ${history.length} snapshots).`;
}

/* ── Events ───────────────────────────────────────────────────────────────*/

function wire() {
  const root = S.root;

  watchGeometry();

  root.addEventListener('change', (e) => {
    const t = e.target;

    if (t.id === 'g-paint') { S.prefs.paint = t.value; savePrefs(); applyDisplay(); return; }
    if (t.id === 'g-weeks') { S.prefs.weeks = t.value; savePrefs(); renderTable(); scrollToCurrentWeek(); return; }
    if (t.id === 'g-sort') { S.prefs.sort = t.value; savePrefs(); renderTable(); return; }

    if (t.id === 'g-league') {
      S.prefs.league = t.value;
      S.league = t.value === 'none' ? loadLeagueState('none', S.season) : loadLeagueState(t.value, S.season);
      savePrefs();
      // Planning reads the same pool. 'none' is the grid's own "stop striking
      // rows" switch, not a pool, so it is deliberately not shared -- see
      // activePool() in survivorLeagues.js.
      setActivePool(t.value);
      // "Exclude my picks" reads the pool, so turning the pool off has to
      // release it rather than leave a dead checkbox hiding rows.
      const box = document.getElementById('g-hideused');
      if (box) box.disabled = t.value === 'none';
      applyField();
      paintLiveRow();
      renderTable();
      // Each pool is a different game played over different weeks, so a week
      // chosen in one has no meaning in the next. Cleared rather than carried.
      S.pickWeek = null;
      paintPickBoard();
      return;
    }

    if (t.id === 'g-pickboard-week') {
      S.pickWeek = Number(t.value);
      paintPickBoard();
      return;
    }

    if (t.id === 'g-hideused') {
      S.prefs.hideUsed = t.checked;
      savePrefs();
      renderTable();
      return;
    }

    if (t.dataset.mark) {
      S.prefs.marks[t.dataset.mark] = t.checked;
      savePrefs();
      applyDisplay();
      return;
    }

    if (t.dataset.teamToggle) {
      const team = t.dataset.teamToggle;
      const hidden = new Set(S.prefs.hidden);
      if (t.checked) hidden.delete(team); else hidden.add(team);
      S.prefs.hidden = [...hidden];
      savePrefs();
      renderTable();
    }
  });

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button');

    if (btn?.id === 'g-fit') return setFit(true);
    if (btn?.id === 'g-zoom-in') return setZoom(S.prefs.zoom + 1);
    if (btn?.id === 'g-zoom-out') return setZoom(S.prefs.zoom - 1);
    if (btn?.id === 'g-detail-close') { S.sel = null; applyDisplay(); renderDetail(); return; }
    if (btn?.id === 'g-refresh') { refreshLivePool(); return; }
    if (btn?.id === 'g-use') return spendPick();
    if (btn?.dataset.tag) return setTag(btn.dataset.tag);
    if (btn?.dataset.teams) return bulkTeams(btn.dataset.teams);

    const cellEl = e.target.closest('.gc');
    if (cellEl && !cellEl.classList.contains('is-bye') && !cellEl.classList.contains('is-empty')) {
      selectCell(cellEl.dataset.team, Number(cellEl.dataset.week));
    }
  });

  // Arrow keys walk the grid, so a week-by-week comparison never needs the
  // mouse. Roving focus: only the selected cell is tabbable.
  root.addEventListener('keydown', (e) => {
    const cellEl = e.target.closest?.('.gc');
    if (!cellEl) return;

    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;

    e.preventDefault();
    const weeks = visibleWeeks();
    const teams = visibleTeams();
    let wi = weeks.indexOf(Number(cellEl.dataset.week));
    let ti = teams.indexOf(cellEl.dataset.team);

    // Step until a real game is found. A bye is not a destination -- stopping
    // on one strands the caret, since selectCell refuses to select it and the
    // next keypress would then start from a cell that never took focus.
    // Roughly one cell in eighteen is a bye, so this is not a rare path.
    for (;;) {
      wi += dx;
      ti += dy;
      if (wi < 0 || wi >= weeks.length || ti < 0 || ti >= teams.length) return;

      const next = S.model.cells.get(key(teams[ti], weeks[wi]));
      if (next && !next.bye) return selectCell(teams[ti], weeks[wi]);
    }
  });
}

/** Zooming IS leaving fit — the two are the same control, and a "+" that left
 *  the table fitted would do nothing visible. Stepping from the stored zoom
 *  rather than from wherever fit happened to land keeps the buttons
 *  predictable: they always move one notch on the same four-stop scale. */
function setZoom(z) {
  S.prefs.fit = false;
  S.prefs.zoom = clampZoom(z);
  savePrefs();
  syncSizeButtons();
  applyDisplay();
  scrollToCurrentWeek();
}

function setFit(on) {
  S.prefs.fit = on;
  savePrefs();
  syncSizeButtons();
  applyDisplay();
}

function syncSizeButtons() {
  const btn = document.getElementById('g-fit');
  if (!btn) return;
  btn.classList.toggle('is-on', S.prefs.fit);
  btn.setAttribute('aria-pressed', String(S.prefs.fit));
}

function spendPick() {
  if (!S.sel || S.prefs.league === 'none') return;
  S.league = setPick(S.league, S.sel.week, S.sel.team);
  saveLeagueState(S.prefs.league, S.season, S.league);
  renderTable();
}

function setTag(tag) {
  if (!S.sel) return;
  const k = key(S.sel.team, S.sel.week);
  if (S.tags[k] === tag) delete S.tags[k];
  else S.tags[k] = tag;
  saveTags();
  renderTable();
}

/* No "Only unused" here any more: it wrote the used set into `hidden` once and
   then went stale the next time a team was spent. "Exclude my picks" is the
   live version of it and lives on the checkbox instead. */
function bulkTeams(action) {
  const all = S.model.teams;
  const hidden = new Set(S.prefs.hidden);

  if (action === 'all') hidden.clear();
  else if (action === 'none') all.forEach((t) => hidden.add(t));
  else if (action === 'invert') all.forEach((t) => (hidden.has(t) ? hidden.delete(t) : hidden.add(t)));

  S.prefs.hidden = [...hidden];
  savePrefs();
  renderTable();
}

/* ── Utils ────────────────────────────────────────────────────────────────*/

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
