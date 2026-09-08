/* ==========================================================================
   Squares — Board tab. One week: the matchup, the 10x10 board, the payouts.

   The board is the deliverable here. Everything above it exists to answer the
   two questions you actually have on a Sunday — what did I draw this week,
   and what has to happen for it to pay — and everything below it records what
   the board did.

   TEAM IDENTITY DOES THE VISUAL WORK. Each week is a different opponent, so
   rather than a fixed palette the matchup card, the axis bands and the digit
   headers all take their color, logo and wordmark from js/teamIdentity.js.
   That is what makes eighteen otherwise identical boards feel like eighteen
   different games. Colors are mixed to solid values with tintOn() and text
   ink is chosen by measured contrast with readableInkOn(), never by eye —
   several primaries (Vikings gold, Chargers powder) are light enough that
   white-on-brand fails the 4.5:1 floor this site holds.

   THE SAMPLE TOGGLE IS A DESIGN TOOL, NOT A FEATURE. Until the club sends the
   filled board and the first draw, every cell is empty and there is nothing
   to look at. The toggle fills the grid with obviously fake names and a
   deterministic draw so the layout can be judged now. It is labeled SAMPLE
   everywhere it shows, and it never writes anything to the pool document.
   ========================================================================== */

import { SEASON, getSquares } from './data.js';
import { loadWeek, msToNextKickoff } from './gameState.js';
import { clearScoreboardCache } from './espn.js';
import {
  teamColors, markPath, readableInkOn, tintOn, markBox, readableTeamInk,
} from './teamIdentity.js';
import { ABBR_TO_MASCOT } from './teams.js';
import { clubBanner, clubNav, applyClubTheme, wireClubNav } from './squaresChrome.js';
import {
  poolById, weekConfig, payoutWeeks, hasDigits, hasEntries,
  entryAt, isMine, gradeWeek, orient, liveOutlook, economics,
  liveCell, defaultWeek,
} from './squaresModel.js';

const POOL_ID = 'st-jude-mens-club';

/* Matches the Schedule tab: poll while a game is live, and from a few minutes
   before kickoff so the card is already awake when it starts. */
const POLL_MS = 30_000;
const PREKICK_MS = 10 * 60_000;

let doc = null;
let basePool = null;      // the pool exactly as committed
let pool = null;          // basePool, or the sample overlay when toggled on
let week = null;
let view = null;          // loadWeek() result for the graded week
let game = null;          // the one game this week grades on
let identity = new Map(); // abbr -> { colors, logo, wordmark }
let sample = false;
let panel = null;
let pollTimer = null;
let refreshing = false;

const el = (id) => document.getElementById(id);

/* ── Boot ─────────────────────────────────────────────────────────────── */

export async function initSquares(root, season = SEASON) {
  panel = root.closest('.panel');
  applyClubTheme(root);
  wireClubNav(root);

  doc = await getSquares(season);
  basePool = poolById(doc, POOL_ID);

  if (!basePool) {
    root.innerHTML = header() + missingPool(season);
    return;
  }

  pool = basePool;
  await loadIdentity();

  week = pickOpeningWeek();

  root.innerHTML = shell();
  wire();
  await refresh({ force: true });

  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('panelchange', onVisibility);
}

/**
 * The week to open on — the pool's own calendar, not the NFL's.
 *
 * `currentWeek()` in gameState.js rolls over a few hours after the last game
 * of an NFL week, which is right for a schedule and wrong here: it would
 * replace Sunday's settled board with next week's empty one before anybody
 * had looked at what they won. defaultWeek() holds each week until 2pm the
 * Wednesday after it. See squaresModel.js for the rule.
 */
function pickOpeningWeek() {
  return defaultWeek(basePool) ?? payoutWeeks(basePool)[0];
}

/* How much ink a mark should cover, in square pixels of rendered artwork.
   One number for the whole tab: the band and the matchup card show the same
   teams a few hundred pixels apart, and a mark that changes size between them
   reads as a mistake. 600 is set by the widest logo in the set — the Seahawks
   hawk needs a 40px box to reach it, which is the most a 50px band can hold. */
const MARK_AREA = 600;

/** Colors, marks and per-team mark sizing, fetched once. */
async function loadIdentity() {
  const abbrs = new Set();
  for (const w of basePool.weeks) { abbrs.add(w.away); abbrs.add(w.home); }

  await Promise.all([...abbrs].map(async (abbr) => {
    const [colors, logo, wordmark, box] = await Promise.all([
      teamColors(abbr),
      markPath(abbr, 'logo'),
      markPath(abbr, 'wordmark'),
      markBox(abbr, MARK_AREA),
    ]);
    identity.set(abbr, { colors, logo, wordmark, box });
  }));
}

const idOf = (abbr) => identity.get(abbr) || { colors: null, logo: '', wordmark: '', box: null };

/** Mark dimensions, falling back to a fixed square if the trim data is
 *  missing — which is exactly how this looked before markBox() existed. */
const markSize = (abbr) => idOf(abbr).box || 30;
const primaryOf = (abbr) => idOf(abbr).colors?.primary || '#6E6B67';
const mascotOf = (abbr) => ABBR_TO_MASCOT[abbr] || abbr;

/* ── Shell ────────────────────────────────────────────────────────────── */

function header() {
  return `
    ${clubBanner({
      pool: basePool?.name || 'Squares',
      subtitle: 'The board',
      season: SEASON,
    })}

    <div class="section-head">
      <div>
        <p class="eyebrow">Week by week</p>
        <h2>The board</h2>
      </div>
      <span class="pill" id="sq-status">Loading</span>
    </div>`;
}

function shell() {
  const weeks = payoutWeeks(basePool);

  return `
    ${header()}

    <div class="card controls sq-controls">
      <div class="field">
        <label for="sq-week">Week</label>
        <select id="sq-week">
          ${weeks.map((w) => {
            const cfg = weekConfig(basePool, w);
            return `<option value="${w}">Week ${w} — ${escape(matchupLabel(cfg))}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="field sq-refresh-field">
        <label for="sq-refresh">Live score</label>
        <button class="btn btn-ghost" id="sq-refresh" type="button">Refresh</button>
        <span class="sq-updated" id="sq-updated"></span>
      </div>
      <label class="sq-sample-toggle">
        <input type="checkbox" id="sq-sample" />
        <span>Preview with sample data</span>
      </label>
    </div>

    <div id="sq-body"></div>`;
}

function matchupLabel(cfg) {
  if (!cfg) return '';
  return `${mascotOf(cfg.away)} at ${mascotOf(cfg.home)}`;
}

function wire() {
  el('sq-week').addEventListener('change', async (e) => {
    week = Number(e.target.value);
    await refresh({ force: true });
  });

  el('sq-refresh').addEventListener('click', async () => {
    clearScoreboardCache();
    await refresh({ force: true });
  });

  el('sq-sample').addEventListener('change', (e) => {
    sample = e.target.checked;
    applySample();
    render();
  });
}

/* ── Data ─────────────────────────────────────────────────────────────── */

async function refresh({ force = false } = {}) {
  if (refreshing) return;
  refreshing = true;
  el('sq-refresh')?.classList.add('is-busy');

  try {
    const wasLive = game ? game.isLive : false;
    view = await loadWeek(SEASON, week, {
      live: force || shouldPoll() || wasLive,
      maxAgeMs: force ? 0 : POLL_MS,
    });

    const cfg = weekConfig(basePool, week);
    game = (view?.games || []).find((g) => g.id === String(cfg?.gameId)) || null;

    applySample();
    render();
  } finally {
    refreshing = false;
    el('sq-refresh')?.classList.remove('is-busy');
  }

  schedulePoll();
}

function onVisibility() {
  if (isShowing()) refresh();
  else stopPolling();
}

const isShowing = () => !document.hidden && panel && !panel.hidden;

function shouldPoll() {
  if (!isShowing() || !game) return false;
  if (game.isLive) return true;

  const next = msToNextKickoff([game]);
  return next != null && next <= PREKICK_MS;
}

function schedulePoll() {
  stopPolling();
  if (shouldPoll()) pollTimer = setTimeout(() => refresh(), POLL_MS);
}

function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
}

/* ── Sample overlay ───────────────────────────────────────────────────────
   Deliberately silly names, so a screenshot of a sample board can never be
   mistaken for the real one. Seeded off the week number so the draw holds
   still across a refresh instead of reshuffling every thirty seconds.
   ------------------------------------------------------------------------ */

const SAMPLE_NAMES = [
  'Bova', 'Mitch', 'Deuce', 'Tank', 'Skip', 'Moose', 'Rooster', 'Cheeks',
  'Doc', 'Slim', 'Ace', 'Chief', 'Bear', 'Duke', 'Gus', 'Hoss',
  'Junior', 'Lefty', 'Mac', 'Nub', 'Ozzie', 'Pinky', 'Quinn', 'Red',
  'Sarge', 'Tiny', 'Vern', 'Whit', 'Yogi', 'Zeke', 'Boomer', 'Chip',
  'Dutch', 'Elmo', 'Flash', 'Goose', 'Hawk', 'Ike', 'Jinx', 'Knuckles',
  'Lucky', 'Meatball', 'Nails', 'Opie', 'Pops', 'Rocket', 'Scooter', 'Tex',
  'Buck', 'Curly',
];

/** Tiny seeded generator — same week in, same board out. */
function rng(seed) {
  let s = seed * 2654435761 % 2147483647;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function shuffled(list, rand) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Swap `pool` between the committed document and a filled-in copy of it.
 *
 * A copy, never a mutation: the sample must not be able to leak into anything
 * that later gets written back to data/squares-<year>.json.
 */
function applySample() {
  if (!sample) { pool = basePool; return; }

  // The names and the owned square are fixed for the season, so they are
  // seeded once rather than per week — same as the real thing.
  const nameRand = rng(1);
  const names = shuffled([...SAMPLE_NAMES, ...SAMPLE_NAMES], nameRand).slice(0, 100);
  const entries = Array.from({ length: 10 }, (_, r) => names.slice(r * 10, r * 10 + 10));
  entries[4][6] = 'Bova';

  const weeks = basePool.weeks.map((w) => {
    const rand = rng(w.week + 101);
    return {
      ...w,
      digits: {
        cols: shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rand),
        rows: shuffled([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rand),
      },
    };
  });

  pool = { ...basePool, entries, mine: [{ row: 4, col: 6 }], weeks };
}

/* ── Render ───────────────────────────────────────────────────────────── */

function render() {
  const cfg = weekConfig(pool, week);
  const grades = cfg && game ? gradeWeek(pool, cfg, game) : null;

  el('sq-body').innerHTML = [
    sample ? sampleBanner() : '',
    matchupCard(cfg),
    yourSquare(cfg, grades),
    board(cfg, grades),
    payouts(cfg, grades),
    footnotes(cfg),
    clubNav('squares-board'),
  ].join('');

  paintStatus(cfg);
  paintFreshness();
}

/**
 * When the score on screen was last read.
 *
 * Worth its own line because the board now paints a live square, and a
 * highlight that is quietly four minutes stale is worse than no highlight —
 * you would act on it. Says "committed schedule" rather than a time when there
 * is no live layer at all, so an ESPN outage reads as an outage.
 */
function paintFreshness() {
  const node = el('sq-updated');
  if (!node) return;

  if (!view?.liveAvailable) { node.textContent = 'Committed schedule'; return; }
  if (!view.fetchedAt) { node.textContent = ''; return; }

  const at = new Date(view.fetchedAt);
  node.textContent = `Scores as of ${at.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit',
  })}`;
}

function paintStatus(cfg) {
  const pill = el('sq-status');
  if (!pill) return;

  const ready = hasEntries(pool) && hasDigits(cfg);
  pill.textContent = sample ? 'Sample' : ready ? 'Board set' : 'Awaiting board';
  pill.className = `pill${ready && !sample ? ' ok' : ''}`;
}

function sampleBanner() {
  return `
    <div class="sq-sample-banner">
      <strong>Sample data.</strong> Made-up names and a made-up draw, so the
      layout can be judged before the club sends the real board. Nothing here
      is saved.
    </div>`;
}

/* ── The matchup ──────────────────────────────────────────────────────── */

function matchupCard(cfg) {
  if (!cfg) return '';

  const away = teamSide(cfg, cfg.away, 'away');
  const home = teamSide(cfg, cfg.home, 'home');

  return `
    <div class="card sq-matchup">
      <div class="sq-matchup-grid">
        ${away}
        <div class="sq-matchup-mid">
          ${statusLine(cfg)}
        </div>
        ${home}
      </div>
      ${cfg.substitute ? `
        <p class="sq-sub-note">
          <strong>Colts bye.</strong> ${escape(cfg.note || '')} — this week's four
          payouts are graded on ${escape(mascotOf(cfg.away))} at
          ${escape(mascotOf(cfg.home))}.
        </p>` : ''}
    </div>`;
}

function teamSide(cfg, abbr, side) {
  const { colors, wordmark, logo } = idOf(abbr);
  const primary = colors?.primary || '#6E6B67';
  const ink = readableInkOn(primary);
  const axis = cfg.colsTeam === abbr ? 'Top' : 'Side';

  // ESPN sends 0-0 for a game that has not kicked off, which on a card this
  // size is indistinguishable from a live scoreless first quarter. Before
  // kickoff there is no score, so the card says so.
  const score = game && game.state !== 'pre'
    ? (side === 'away' ? game.awayScore : game.homeScore)
    : null;

  const leading = game?.leader === side;
  const lost = game?.state === 'post' && game.winner && game.winner !== side && game.winner !== 'tie';

  return `
    <div class="sq-team${lost ? ' is-lost' : ''}"
         style="--team:${primary}; --team-ink:${ink}; --team-wash:${tintOn(primary, '#FFFFFF', 0.07)}">
      <div class="sq-team-id">
        ${logo ? `<img class="sq-team-logo" src="${escape(logo)}" alt=""
                       width="${markSize(abbr)}" height="${markSize(abbr)}" loading="lazy" />` : ''}
        ${wordmark
          ? `<img class="sq-team-wordmark" src="${escape(wordmark)}"
                  alt="${escape(mascotOf(abbr))}" loading="lazy" />`
          : `<span class="sq-team-name">${escape(mascotOf(abbr))}</span>`}
      </div>
      <div class="sq-team-score${leading ? ' is-leading' : ''}">
        ${score == null ? '&ndash;' : score}
      </div>
      <span class="sq-team-axis">${escape(axis)}</span>
    </div>`;
}

/**
 * The middle column: where the game is, in one glance.
 *
 * Three shapes for three states, all the same height so the card does not
 * jump as a game moves through them — a layout that resizes on a live poll is
 * a layout that moves under your thumb every thirty seconds.
 *
 *   before   AT     · kickoff       · network
 *   live     Q3     · game clock    · network
 *   final    F      · Final
 *
 * The badge is the loud element in all three, because "which quarter is this"
 * is the question a squares board is actually asking.
 */
function statusLine(cfg) {
  const kickoff = kickoffText(game?.kickoff || cfg.kickoff);
  const network = broadcastText();

  if (!game || game.state === 'pre') {
    return `
      <span class="sq-badge is-pre">At</span>
      <span class="sq-when">${escape(kickoff)}</span>
      ${network}`;
  }

  if (game.isLive) {
    return `
      <span class="sq-badge is-live">
        <span class="sq-live-dot" aria-hidden="true"></span>${escape(periodLabel(game))}
      </span>
      <span class="sq-when is-clock">${escape(game.clock || '')}</span>
      ${network}`;
  }

  return `
    <span class="sq-badge is-final">F</span>
    <span class="sq-when">${escape(game.detail || 'Final')}</span>`;
}

/**
 * Which period the game is in: Q1-Q4, HALF, OT, or F.
 *
 * Halftime comes from the status text rather than the period number for the
 * same reason periodClosed() does in squaresModel.js — ESPN leaves `period` at
 * 2 for the whole break, so the clock alone reads as "still in the second".
 */
function periodLabel(g) {
  if (g.state === 'post') return 'F';
  if (/halftime/i.test(g.detail || '')) return 'Half';

  const p = g.period ?? 0;
  if (p >= 5) return 'OT';
  return p ? `Q${p}` : '';
}

/**
 * Who is carrying the game.
 *
 * Comes from the live ESPN payload — `scripts/fetch_schedule.py` does not
 * capture it, so the committed file has none and this is blank until the
 * scoreboard has been fetched at least once. Late-season flex games genuinely
 * have no network assigned yet, and "TBD" is the honest answer for those
 * rather than a silently missing line: it is a thing to re-check each week,
 * not a bug. See the Squares weekly routine in CLAUDE.md.
 */
function broadcastText() {
  if (!view?.liveAvailable) return '';
  const net = game?.broadcast;
  return net
    ? `<span class="sq-network">${escape(net)}</span>`
    : '<span class="sq-network is-tbd">Network TBD</span>';
}

/**
 * Kickoff as two deliberate lines: `Sun 9/13` over `1:00 PM`.
 *
 * One `toLocaleString` produced "Sun, 9/13, 1:00 PM", which in a 124px column
 * broke wherever it felt like — usually orphaning "PM" on a line of its own.
 * Splitting it here means the break is a decision rather than an accident.
 */
function kickoffText(iso) {
  if (!iso) return 'Kickoff TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Kickoff TBD';

  const day = d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'numeric', day: 'numeric',
  }).replace(',', '');
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}
${time}`;
}

/* ── Your square ──────────────────────────────────────────────────────── */

function yourSquare(cfg, grades) {
  if (!cfg) return '';

  const mine = pool.mine || [];
  if (!mine.length) return awaitingSquare();
  if (!hasDigits(cfg)) return awaitingDraw(cfg);

  const cards = mine.map((sq) => {
    const colsDigit = cfg.digits.cols[sq.col];
    const rowsDigit = cfg.digits.rows[sq.row];
    const hits = (grades || []).filter((g) => g.mine);

    return `
      <div class="sq-mine-card">
        <div class="sq-mine-digits">
          ${digitChip(cfg.colsTeam, colsDigit)}
          <span class="sq-mine-x">&times;</span>
          ${digitChip(cfg.rowsTeam, rowsDigit)}
        </div>
        <div class="sq-mine-meta">
          <p class="eyebrow">Your square this week</p>
          <p class="sq-mine-line">
            Any period ending <strong>${escape(mascotOf(cfg.colsTeam))}</strong>
            on a <strong>${colsDigit}</strong> and
            <strong>${escape(mascotOf(cfg.rowsTeam))}</strong> on a
            <strong>${rowsDigit}</strong> pays
            <strong>${money(pool.payoutPerQuarter)}</strong>.
          </p>
          ${hits.length ? `
            <p class="sq-mine-won">
              Won ${hits.length === 1 ? 'the' : ''}
              ${hits.map((h) => escape(h.label.toLowerCase())).join(' and ')}
              &mdash; ${money(hits.length * pool.payoutPerQuarter)}
            </p>` : ''}
        </div>
      </div>`;
  }).join('');

  return `<div class="card sq-mine">${cards}${outlookLine(cfg)}</div>`;
}

function digitChip(abbr, digit) {
  const primary = primaryOf(abbr);
  return `
    <span class="sq-digit-chip"
          style="--team:${primary}; --team-ink:${readableInkOn(primary)}">
      ${digit}
    </span>`;
}

/**
 * "What puts you in the money" — live games only.
 *
 * Suppressed once the game is final, where it would read as a taunt, and
 * before kickoff, where every square is equally alive and the answer is
 * nothing but noise.
 */
function outlookLine(cfg) {
  if (!game?.isLive) return '';

  const { cols, rows } = orient(cfg, game.awayScore, game.homeScore);
  const { onIt, plays } = liveOutlook(pool, cfg, cols, rows);

  if (onIt) {
    return `
      <p class="sq-outlook is-on">
        <strong>You are on it right now</strong> at ${cols}&ndash;${rows}. If the
        period ends here, it pays ${money(pool.payoutPerQuarter)}.
      </p>`;
  }
  if (!plays.length) {
    return `
      <p class="sq-outlook">
        No single score reaches your square from ${cols}&ndash;${rows}. It takes
        a combination from here.
      </p>`;
  }

  const list = plays.slice(0, 3).map((p) => `
    <li>
      <strong>${escape(mascotOf(p.team))} ${escape(p.label)}</strong>
      &rarr; ${p.colsScore}&ndash;${p.rowsScore}
    </li>`).join('');

  return `
    <div class="sq-outlook">
      <p>From ${cols}&ndash;${rows}, what puts you on the square:</p>
      <ul class="sq-outlook-list">${list}</ul>
    </div>`;
}

function awaitingSquare() {
  return `
    <div class="notice">
      <strong>No square recorded yet.</strong> Once the club sends the filled
      board, the 100 names and your square go into
      <code>data/squares-${SEASON}.json</code> and this fills in for the whole
      season &mdash; the names never move again.
    </div>`;
}

function awaitingDraw(cfg) {
  return `
    <div class="notice">
      <strong>Week ${cfg.week} numbers not drawn yet.</strong> The board keeps
      its names all season; the ten digits across the top and down the side are
      redrawn before every game, so this fills in once the week's draw arrives.
    </div>`;
}

/* ── The board ────────────────────────────────────────────────────────── */

function board(cfg, grades) {
  if (!cfg) return '';

  const colsPrimary = primaryOf(cfg.colsTeam);
  const rowsPrimary = primaryOf(cfg.rowsTeam);
  const drawn = hasDigits(cfg);

  // Where the ball is this second, as opposed to where a period closed.
  const live = liveCell(cfg, game);

  // Which cells won which period, so a cell can carry more than one marker —
  // the same square taking the half and the final is entirely normal.
  const markers = new Map();
  for (const g of grades || []) {
    if (!g.cell) continue;
    const key = `${g.cell.row}:${g.cell.col}`;
    markers.set(key, [...(markers.get(key) || []), g]);
  }

  const digit = (list, i) => (drawn ? list[i] : '&middot;');

  const headRow = `
    <div class="sq-corner"></div>
    ${Array.from({ length: 10 }, (_, c) => `
      <div class="sq-head sq-head-col${drawn ? '' : ' is-blank'}">
        ${digit(cfg.digits?.cols, c)}
      </div>`).join('')}`;

  const bodyRows = Array.from({ length: 10 }, (_, r) => `
    <div class="sq-head sq-head-row${drawn ? '' : ' is-blank'}">
      ${digit(cfg.digits?.rows, r)}
    </div>
    ${Array.from({ length: 10 }, (_, c) => cell(
      r, c,
      markers.get(`${r}:${c}`),
      Boolean(live) && live.row === r && live.col === c,
    )).join('')}
  `).join('');

  return `
    <div class="card sq-board-card">
      <div class="sq-board-frame"
           style="--cols-team:${colsPrimary};
                  --rows-team:${rowsPrimary};
                  --cols-ink:${readableInkOn(colsPrimary)};
                  --rows-ink:${readableInkOn(rowsPrimary)}">
        ${boardCorner()}
        ${band(cfg.colsTeam, 'top')}
        ${band(cfg.rowsTeam, 'side')}

        <div class="sq-board-scroll">
          <div class="sq-board" role="table"
               aria-label="Squares board for week ${cfg.week}">
            ${headRow}
            ${bodyRows}
          </div>
        </div>
      </div>

      ${legend()}
    </div>`;
}

/**
 * A team's banner, welded to the edge of the grid it labels.
 *
 * A WASH, NOT A SATURATED FIELD. At full strength the two bands were two
 * slabs of near-black — Colts navy against Ravens purple read as one dark
 * frame rather than as two teams, and any mark drawn in the team's own color
 * vanished into it. On a 10% wash of the same hue the logo is itself, the
 * name is set in the team's color darkened only as far as 4.5:1 requires, and
 * the saturated hex is spent where it works hardest: a 3px edge.
 *
 * The name is text rather than the wordmark art because it has to fill the
 * band, and a fixed-aspect image cannot. `--team-ink` here is the measured
 * darkened primary, NOT readableInkOn's black-or-white.
 */
function band(abbr, which) {
  const { colors, logo } = idOf(abbr);
  const primary = colors?.primary || '#6E6B67';
  const wash = tintOn(primary, '#FFFFFF', 0.10);

  // A MARK AT EACH END. The board scrolls sideways on a phone, so a single
  // centred logo is off screen from whichever end you did not start at — and
  // the band's whole job is to say whose axis this is. Two marks means the
  // answer is always at the edge you are looking at. The second is aria-hidden
  // and the name carries the label, so a screen reader hears the team once.
  // Square, and sized per team — see markBox() in js/teamIdentity.js. The
  // canvas is square too, so an explicit width and height render the art
  // undistorted with no object-fit needed.
  const px = markSize(abbr);
  const mark = logo
    ? `<span class="sq-band-mark"><img src="${escape(logo)}" alt=""
             width="${px}" height="${px}" loading="lazy" /></span>`
    : '<span class="sq-band-mark"></span>';

  return `
    <div class="sq-band sq-band-${which}"
         style="--team:${primary};
                --team-wash:${wash};
                --team-ink:${readableTeamInk(primary, wash)}">
      ${mark}
      <span class="sq-band-name">${escape(mascotOf(abbr))}</span>
      ${mark}
    </div>`;
}

/**
 * The corner where the two bands meet.
 *
 * It used to be the top band running on over the side band's column, which
 * left the row team's mark jammed under the column team's slab — two teams
 * overlapping in the one cell that belongs to neither. Now each band starts at
 * this square and stops, and the square itself goes to the house: the parish
 * emblem, cropped out of the full lockup so it reads at 56px (the wordmark
 * does not). See assets/stjude/.
 */
function boardCorner() {
  return `
    <div class="sq-board-corner">
      <img src="assets/stjude/saint-jude-emblem.png" alt="St. Jude" />
    </div>`;
}

/**
 * What the borders mean.
 *
 * Three states can stack on one cell — yours, won, and live — so the board
 * needs a key.
 *
 * ALL THREE ALWAYS RENDER. This started out conditional: the live key appeared
 * only during a game, the "your square" key only once a square was recorded, on
 * the reasoning that a key for a state nothing is currently in is one more
 * thing to read past. That was wrong in the way legends are usually wrong — a
 * key you only ever see at the moment you needed to already know it is a key
 * nobody has learned. The legend describes the board's vocabulary, not the
 * board's current state, and the quiet Tuesday is when there is time to read
 * it.
 */
function legend() {
  const keys = [
    '<span class="sq-key sq-key-mine">Your square</span>',
    '<span class="sq-key sq-key-won">Won a quarter</span>',
    '<span class="sq-key sq-key-live">Score right now</span>',
  ].join('');

  const note = hasEntries(pool) ? '' : `
    <p class="sq-board-empty">
      The 100 names go here. Send the filled sheet and every cell fills in for
      the season.
    </p>`;

  return `<div class="sq-legend">${keys}</div>${note}`;
}

function cell(row, col, marks, isLiveCell = false) {
  const name = entryAt(pool, row, col);
  const mine = isMine(pool, row, col);
  const won = (marks || []).filter((m) => m.graded);

  // Three independent states on three independent channels — a cell can be all
  // three at once (your square, which took the half, and which the score has
  // come back to). Wash for mine, border for won, outline for live: any two of
  // them sharing a property would mean the rarer one silently disappears.
  const classes = ['sq-cell'];
  if (mine) classes.push('is-mine');
  if (won.length) classes.push('is-won');
  if (isLiveCell) classes.push('is-live');
  if (!name) classes.push('is-empty');

  const chips = won.map((m) => `<span class="sq-mark">${escape(m.key)}</span>`).join('');

  return `
    <div class="${classes.join(' ')}"${name ? ` title="${escape(name)}"` : ''} role="cell">
      ${chips ? `<span class="sq-marks">${chips}</span>` : ''}
      ${isLiveCell ? '<span class="sq-live-tag" aria-hidden="true"></span>' : ''}
      <span class="sq-name">${escape(name)}</span>
      ${mine ? '<span class="sq-you">You</span>' : ''}
    </div>`;
}

/* ── Payouts ──────────────────────────────────────────────────────────── */

function payouts(cfg, grades) {
  if (!cfg) return '';

  const list = (grades || pool.periods.map((p) => ({
    key: p.key, label: p.label, graded: false, closed: false,
    colsScore: null, rowsScore: null, winner: '', mine: false,
    payout: pool.payoutPerQuarter,
  }))).map((g) => {
    const state = g.graded ? 'is-graded' : g.closed ? 'is-pending' : '';

    return `
      <div class="sq-payout ${state}${g.mine ? ' is-mine' : ''}">
        <p class="eyebrow">${escape(g.label)}</p>
        <div class="sq-payout-score">
          ${g.colsScore == null
            ? '<span class="sq-payout-tbd">&mdash;</span>'
            : `<span>${g.colsScore}</span><span class="sq-payout-dash">&ndash;</span><span>${g.rowsScore}</span>`}
        </div>
        <p class="sq-payout-winner">
          ${g.graded
            ? (g.winner ? escape(g.winner) : 'Square unassigned')
            : g.closed ? 'Awaiting numbers' : 'Not played'}
        </p>
        <p class="sq-payout-money">${money(g.payout)}</p>
      </div>`;
  }).join('');

  return `
    <div class="section-head sq-section">
      <div>
        <p class="eyebrow">Four payouts a week</p>
        <h3>Week ${cfg.week} money</h3>
      </div>
    </div>
    <div class="sq-payouts">${list}</div>`;
}

/* ── Footnotes ────────────────────────────────────────────────────────── */

function footnotes(cfg) {
  const ec = economics(basePool);

  return `
    <div class="card sq-notes">
      <div class="sq-note">
        <p class="eyebrow">The pool</p>
        <p>
          100 squares at ${money(basePool.buyIn)} is
          ${money(ec.collected)} in. ${ec.payouts} payouts of
          ${money(basePool.payoutPerQuarter)} is ${money(ec.paid)} out, so
          <strong>${money(ec.charity)}</strong> (${pct(ec.charityPct)}) goes to
          St. Jude. A square is worth ${money(ec.evPerSquare)} of that back &mdash;
          the shortfall <em>is</em> the donation.
        </p>
      </div>
      <div class="sq-note">
        <p class="eyebrow">Why no square is better than another</p>
        <p>
          The names hold still all season but the digits are redrawn every week,
          so over ${basePool.weeks.length} weeks every square is dealt the same
          spread of pairs. A 7 and a 0 is a great week and a 2 and a 5 is a dead
          one, but nobody owns either &mdash; you just rent them for a Sunday.
        </p>
      </div>
      ${cfg && !basePool.axisConfirmed ? `
        <div class="sq-note">
          <p class="eyebrow">Unconfirmed</p>
          <p>
            This shows <strong>${escape(mascotOf(cfg.colsTeam))}</strong> across
            the top and <strong>${escape(mascotOf(cfg.rowsTeam))}</strong> down
            the side. If the club's board is the other way round, say so and it
            flips everywhere at once.
          </p>
        </div>` : ''}
    </div>`;
}

function missingPool(season) {
  return `
    <div class="notice">
      <strong>No squares pool configured for ${escape(season)}.</strong>
      The board, the weekly draws and the results live in
      <code>data/squares-${escape(season)}.json</code>.
    </div>`;
}

/* ── Formatting ───────────────────────────────────────────────────────── */

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function pct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
