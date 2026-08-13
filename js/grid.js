/* ==========================================================================
   Grid — the whole season as one table. 32 teams down, 18 weeks across.

   This is the Excel view, rebuilt: every team's opponent in every week, at a
   glance, with the current week and the next few in the same eyeline. It
   serves both pools. The straight-up pool reads it for this week's favourable
   spots; survivor reads it for which weeks a team can still be spent in.

   THE COLOURS MEAN ONE THING AT A TIME. A cell has one background, so exactly
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
import { auditSeason } from './season.js';
import { seasonBanner } from './seasonBanner.js';
import { currentWeek as currentWeekOf } from './gameState.js';
import { ABBR_TO_MASCOT, DIVISION_OF, DIVISION_ORDER } from './teams.js';
import { buildGrid, key, windowStrength } from './gridModel.js';
import {
  LEAGUES, leagueById, loadLeagueState, saveLeagueState,
  setPick, usedTeams, weekUsed, fieldAvailability, scarcityFor,
} from './survivorLeagues.js';

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
  zoom: 2,              // index into ZOOMS
  sort: 'abbr',
  weeks: 'all',         // 'all' | 'ahead3' | 'ahead6' | 'rest'
  league: 'mike',
  hidden: [],           // team abbrs switched off
};

const ZOOMS = ['z0', 'z1', 'z2', 'z3'];

const S = {
  root: null, season: SEASON,
  schedule: null, model: null, audit: null, now: 1,
  survivor: null, field: null,
  league: null, tags: {},
  prefs: { ...DEFAULTS },
  sel: null,            // {team, week}
};

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    return {
      ...DEFAULTS, ...raw,
      marks: { ...DEFAULTS.marks, ...(raw.marks || {}) },
      hidden: Array.isArray(raw.hidden) ? raw.hidden : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
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

  const [schedule, projections, odds, survivor] = await Promise.all([
    getSchedule(season), getProjections(season), getOddsSnapshot(), getSurvivor(season),
  ]);

  S.schedule = schedule;
  S.survivor = survivor;
  S.field = fieldAvailability(survivor, season);
  S.audit = gridAudit({ season, schedule, odds, projections });

  if (!schedule?.games?.length) {
    root.innerHTML = shellHead() + missingSchedule(season);
    return;
  }

  S.model = buildGrid({ schedule, projections, odds });
  S.now = currentWeekOf(schedule);
  S.league = loadLeagueState(S.prefs.league, season);

  root.innerHTML = shellHead() + banner() + controls() + detailShell() + tableShell() + legend();
  wire();
  renderTable();
  scrollToCurrentWeek();
}

/**
 * The season cross-check, narrowed to the feeds this tab actually reads.
 *
 * auditSeason() also reports on the commissioner's number map, which the grid
 * never touches -- leaving that in would put a permanent "waiting on data"
 * banner above a table that is completely fine without it. Projections are
 * checked here instead of in season.js because they are the one feed this tab
 * introduced; a projections file from the wrong season would fill 272 cells
 * with plausible nonsense, which is exactly the failure that module exists to
 * catch.
 */
function gridAudit({ season, schedule, odds, projections }) {
  const base = auditSeason({ season, schedule, odds });
  const problems = base.problems.filter((p) => p.feed !== 'numberMap');

  if (projections && Number(projections.year) !== Number(season)) {
    problems.push({
      level: 'error', feed: 'projections',
      message: `The projections file is ${projections.year} data, but the ${season} season is active.`,
    });
  }

  return {
    ...base, problems,
    ok: problems.length === 0,
    blocking: problems.some((p) => p.level === 'error'),
  };
}

/* ── Chrome ───────────────────────────────────────────────────────────────*/

function shellHead() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">The whole season, one screen</p>
        <h2>Grid</h2>
      </div>
      <span class="pill" id="grid-source"></span>
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

function controls() {
  const p = S.prefs;
  return `
    <div class="card controls gridctl">
      <div class="field">
        <label for="g-paint">Colour</label>
        <select id="g-paint">
          ${opt('prob', 'Win probability', p.paint)}
          ${opt('surv', 'Survivor usable', p.paint)}
          ${opt('type', 'Matchup type', p.paint)}
          ${opt('none', 'No colour', p.paint)}
        </select>
      </div>

      <div class="field">
        <label for="g-weeks">Weeks</label>
        <select id="g-weeks">
          ${opt('all', 'All 18', p.weeks)}
          ${opt('rest', `Week ${S.now} on`, p.weeks)}
          ${opt('ahead3', `Next 3 (${S.now}-${Math.min(18, S.now + 2)})`, p.weeks)}
          ${opt('ahead6', `Next 6 (${S.now}-${Math.min(18, S.now + 5)})`, p.weeks)}
        </select>
      </div>

      <div class="field">
        <label for="g-sort">Rows</label>
        <select id="g-sort">
          ${opt('abbr', 'A to Z', p.sort)}
          ${opt('division', 'By division', p.sort)}
          ${opt('ahead', 'Best spots first', p.sort)}
        </select>
      </div>

      <div class="field">
        <label for="g-league">Survivor pool</label>
        <select id="g-league">
          ${LEAGUES.map((l) => opt(l.id, l.short, p.league)).join('')}
          ${opt('none', 'Off', p.league)}
        </select>
      </div>

      <div class="field">
        <label>Zoom</label>
        <div class="gzoom">
          <button type="button" class="btn btn-ghost" id="g-zoom-out" aria-label="Zoom out">&minus;</button>
          <button type="button" class="btn btn-ghost" id="g-zoom-in" aria-label="Zoom in">+</button>
        </div>
      </div>

      <div class="field field-grow">
        <label>Marks</label>
        <div class="gmarks">
          ${mark('div', 'Div + conf')}
          ${mark('thu', 'Thursday')}
          ${mark('prime', 'Primetime')}
          ${mark('rest', 'Rest days')}
          ${mark('tags', 'My tags')}
        </div>
      </div>

      <div class="field field-grow gteams-field">
        <label>Teams shown <span id="g-teamcount" class="gcount"></span></label>
        <details class="gteams">
          <summary>Show, hide, isolate</summary>
          <div class="gteams-actions">
            <button type="button" class="btn btn-ghost" data-teams="all">All 32</button>
            <button type="button" class="btn btn-ghost" data-teams="none">None</button>
            <button type="button" class="btn btn-ghost" data-teams="invert">Invert</button>
            <button type="button" class="btn btn-ghost" data-teams="unused">Only unused</button>
          </div>
          <div class="gteams-list" id="g-teams-list"></div>
        </details>
      </div>
    </div>`;
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
      <summary>What the colours and marks mean</summary>
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
            different games and their used lists are never merged. Where a parsed field file
            exists, the team column also shows what share of surviving entries still holds that
            team.
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
  const span = weeks === 'ahead3' ? 3 : weeks === 'ahead6' ? 6 : 99;
  return all.filter((w) => w >= S.now && w < S.now + span);
}

function visibleTeams() {
  // Used teams are struck through, not removed. Hiding them is one click away
  // ("Only unused"), but it is a choice: a team you have already spent is
  // still the thing you compare an available team's week against.
  const hidden = new Set(S.prefs.hidden);
  const teams = S.model.teams.filter((t) => !hidden.has(t));
  const weeks = visibleWeeks();

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
  renderSourcePill();
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

function teamCell(team) {
  const rec = S.model.records.get(team);
  const played = rec.w + rec.l + rec.t;
  const usedWeek = S.prefs.league === 'none' ? null : weekUsed(S.league, team);
  const scarce = S.prefs.league !== 'none' && leagueById(S.prefs.league)?.hasField
    ? scarcityFor(S.field, team) : null;

  return `
    <th scope="row" class="gteam ${usedWeek ? 'is-used' : ''}" data-team="${team}">
      <span class="gteam-abbr">${team}</span>
      <span class="gteam-meta">
        ${played ? `<span class="grec">${rec.w}-${rec.l}${rec.t ? `-${rec.t}` : ''}</span>` : ''}
        ${usedWeek ? `<span class="gused" title="Spent in Week ${usedWeek}">W${usedWeek}</span>` : ''}
        ${scarce ? `<span class="gscarce" title="${Math.round(scarce.availablePct * 100)}% of surviving entries still hold ${team}">${Math.round(scarce.availablePct * 100)}%</span>` : ''}
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
  // grid whose colours were mixed from two different seasons. The opponent
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

function renderSourcePill() {
  const pill = document.getElementById('grid-source');
  if (!pill) return;
  const { market, projected, none } = S.model.counts;
  const bits = [];
  if (market) bits.push(`${market} priced`);
  if (projected) bits.push(`${projected} modelled`);
  if (none) bits.push(`${none} unpriced`);
  pill.textContent = bits.join(' · ');
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
    ...Object.entries(p.marks).filter(([, on]) => on).map(([k]) => `mk-${k}`),
    p.league === 'none' ? '' : 'has-league',
  ].filter(Boolean).join(' ');

  paintSelection();
}

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
 *  showing Week 1 in November is a grid you have to scroll before you can use. */
function scrollToCurrentWeek() {
  const scroll = document.getElementById('g-scroll');
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

  root.addEventListener('change', (e) => {
    const t = e.target;

    if (t.id === 'g-paint') { S.prefs.paint = t.value; savePrefs(); applyDisplay(); return; }
    if (t.id === 'g-weeks') { S.prefs.weeks = t.value; savePrefs(); renderTable(); scrollToCurrentWeek(); return; }
    if (t.id === 'g-sort') { S.prefs.sort = t.value; savePrefs(); renderTable(); return; }

    if (t.id === 'g-league') {
      S.prefs.league = t.value;
      S.league = t.value === 'none' ? loadLeagueState('none', S.season) : loadLeagueState(t.value, S.season);
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

    if (btn?.id === 'g-zoom-in') return setZoom(S.prefs.zoom + 1);
    if (btn?.id === 'g-zoom-out') return setZoom(S.prefs.zoom - 1);
    if (btn?.id === 'g-detail-close') { S.sel = null; applyDisplay(); renderDetail(); return; }
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

function setZoom(z) {
  S.prefs.zoom = clampZoom(z);
  savePrefs();
  applyDisplay();
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

function bulkTeams(action) {
  const all = S.model.teams;
  const hidden = new Set(S.prefs.hidden);

  if (action === 'all') hidden.clear();
  else if (action === 'none') all.forEach((t) => hidden.add(t));
  else if (action === 'invert') all.forEach((t) => (hidden.has(t) ? hidden.delete(t) : hidden.add(t)));
  else if (action === 'unused') {
    const used = S.prefs.league === 'none' ? new Set() : usedTeams(S.league);
    hidden.clear();
    used.forEach((t) => hidden.add(t));
  }

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
