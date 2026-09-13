/* ==========================================================================
   Squares — Season tab. Eighteen weeks of payouts, and where the money went.

   READS FROZEN RESULTS, NOT THE LIVE FEED, for every week but the current
   one. Each finished game's four quarter scores are written into
   data/squares-<year>.json once and never asked for again, so the ledger is
   permanent, works offline, and cannot be quietly rewritten by ESPN dropping
   an old week. The week in progress is the single exception and comes through
   js/gameState.js like everything else. See frozenGame() in squaresModel.js.

   WHAT IT DELIBERATELY DOES NOT DO is project your winnings. Every square is
   worth the same over a season (the digits are redrawn weekly), so the only
   honest forecast is the pool-wide one already on the Board tab, and dressing
   it up per-square would be inventing an edge that does not exist.
   ========================================================================== */

import { SEASON, getSquares, getSchedule } from './data.js';
import { loadWeek, currentWeek } from './gameState.js';
import {
  markPath, teamColors, tintOn, readableTeamInk, markBox,
} from './teamIdentity.js';
import { ABBR_TO_MASCOT } from './teams.js';
import { clubBanner, clubNav, applyClubTheme, wireClubNav } from './squaresChrome.js';
import {
  poolById, payoutWeeks, ledger, leaderboard, frozenGame,
  hasDigits, hasEntries, economics,
} from './squaresModel.js';

const POOL_ID = 'st-jude-mens-club';

let pool = null;
let identity = new Map();
let root = null;
let panel = null;
let liveWeek = null;

export async function initSquaresLedger(node, season = SEASON) {
  root = node;
  panel = node.closest('.panel');
  applyClubTheme(root);
  wireClubNav(root);

  const doc = await getSquares(season);
  pool = poolById(doc, POOL_ID);

  if (!pool) {
    root.innerHTML = `
      <div class="notice">
        <strong>No squares pool configured for ${escape(season)}.</strong>
      </div>`;
    return;
  }

  await loadIdentity();

  const schedule = await getSchedule(season);
  liveWeek = schedule ? currentWeek(schedule) : null;

  await render();

  // The ledger only moves when a game does, so it refreshes on becoming
  // visible rather than polling a timer of its own — the Board tab owns the
  // live loop and there is no reason for two.
  document.addEventListener('panelchange', (e) => {
    if (e.detail?.panel === 'squares-season') render();
  });
}

async function loadIdentity() {
  const abbrs = new Set();
  for (const w of pool.weeks) { abbrs.add(w.away); abbrs.add(w.home); }

  await Promise.all([...abbrs].map(async (abbr) => {
    const [logo, colors, box] = await Promise.all([
      markPath(abbr, 'logo'), teamColors(abbr), markBox(abbr, MARK_AREA, { min: 14, max: 26 }),
    ]);
    identity.set(abbr, { logo, colors, box });
  }));
}

/* Smaller than the board's marks — these sit inline in a table row — but the
   same optical-area rule, so a Ravens shield and a Colts horseshoe cover the
   same ink here too. See markBox() in js/teamIdentity.js. */
const MARK_AREA = 190;

const logoOf = (abbr) => identity.get(abbr)?.logo || '';
const markSize = (abbr) => identity.get(abbr)?.box || 18;
const primaryOf = (abbr) => identity.get(abbr)?.colors?.primary || '#6E6B67';
const mascotOf = (abbr) => ABBR_TO_MASCOT[abbr] || abbr;

/* ── Render ───────────────────────────────────────────────────────────── */

async function render() {
  const games = new Map();

  // Frozen first, so a week that has both a committed result and a stale live
  // payload takes the committed one.
  for (const w of pool.weeks) {
    const frozen = frozenGame(w);
    if (frozen) games.set(w.week, frozen);
  }

  if (liveWeek != null && !games.has(liveWeek)) {
    const cfg = pool.weeks.find((w) => w.week === liveWeek);
    if (cfg) {
      const view = await loadWeek(SEASON, liveWeek, { live: true });
      const live = (view?.games || []).find((g) => g.id === String(cfg.gameId));
      if (live) games.set(liveWeek, live);
    }
  }

  const book = ledger(pool, games);
  const board = leaderboard(book.rows);

  root.innerHTML = `
    ${clubBanner({ pool: pool.name, subtitle: 'The season', season: SEASON })}

    <div class="section-head">
      <div>
        <p class="eyebrow">All ${pool.weeks.length} payout weeks</p>
        <h2>The season</h2>
      </div>
      <span class="pill${book.settledWeeks ? ' ok' : ''}">
        ${book.settledWeeks} of ${pool.weeks.length} settled
      </span>
    </div>

    ${summary(book)}
    ${weekTable(book)}
    ${board.length ? leaderboardCard(board) : ''}
    ${clubNav('squares-season')}
  `;
}

/* ── Summary ──────────────────────────────────────────────────────────── */

function summary(book) {
  const ec = economics(pool);
  const staked = book.stake > 0;
  const net = book.net;

  return `
    <div class="sq-summary">
      ${stat('In', staked ? money(book.stake) : '&mdash;',
        staked ? `${book.stake / pool.buyIn} square at ${money(pool.buyIn)}` : 'No square recorded')}
      ${stat('Won', money(book.won),
        `${book.hits} ${book.hits === 1 ? 'quarter' : 'quarters'} of ${pool.weeks.length * pool.periods.length}`)}
      ${stat('Net', `${net >= 0 ? '+' : '&minus;'}${money(Math.abs(net))}`,
        staked ? 'Against your buy-in' : 'Once a square is recorded',
        net > 0 ? 'is-up' : net < 0 ? 'is-down' : '')}
      ${stat('Still out there', money(book.remaining),
        `${money(ec.evPerSquare)} of it is a square&rsquo;s share`)}
    </div>`;
}

function stat(label, value, note, mod = '') {
  return `
    <div class="card sq-stat ${mod}">
      <p class="eyebrow">${label}</p>
      <p class="sq-stat-value">${value}</p>
      <p class="sq-stat-note">${note}</p>
    </div>`;
}

/* ── Week by week ─────────────────────────────────────────────────────── */

function weekTable(book) {
  const rows = book.rows.map((row) => {
    const cfg = row.weekCfg;
    const cells = row.periods.map((p) => {
      const cls = p.mine ? 'is-mine' : p.graded ? 'is-graded' : '';
      const body = p.graded
        ? `<span class="sq-wk-score">${p.colsScore}&ndash;${p.rowsScore}</span>
           <span class="sq-wk-who">${p.winner ? escape(p.winner) : '&mdash;'}</span>`
        : `<span class="sq-wk-score is-tbd">&mdash;</span>`;
      return `<td class="sq-wk-cell ${cls}"><span class="sq-wk-key">${escape(p.key)}</span>${body}</td>`;
    }).join('');

    return `
      <tr${row.week === liveWeek ? ' class="is-current"' : ''}>
        <th scope="row" class="sq-wk-head">
          <span class="sq-wk-head-in">
            <span class="sq-wk-num">${row.week}</span>
            <span class="sq-wk-teams">
              ${teamChip(cfg.away)}<span class="sq-wk-at">@</span>${teamChip(cfg.home)}
            </span>
            ${cfg.substitute ? '<span class="sq-wk-flag">Bye &middot; MNF</span>' : ''}
            ${!hasDigits(cfg) ? '<span class="sq-wk-flag is-quiet">No draw</span>' : ''}
          </span>
        </th>
        ${cells}
        <td class="sq-wk-money${row.won ? ' is-won' : ''}">
          ${row.won ? money(row.won) : '&mdash;'}
        </td>
      </tr>`;
  }).join('');

  return `
    <div class="card sq-wk-card">
      <div class="sq-wk-scroll">
        <table class="sq-wk-table">
          <caption class="sq-wk-caption">
            Every payout week. ${hasEntries(pool)
              ? 'Names come from the club&rsquo;s board.'
              : 'Winner names fill in once the club&rsquo;s board is loaded.'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              ${pool.periods.map((p) => `<th scope="col">${escape(p.label)}</th>`).join('')}
              <th scope="col">You</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/**
 * A team chip: washed field, team-colored type, team-colored edge.
 *
 * These were solid brand at full saturation, which put eighteen rows of
 * near-black slabs down the left of the table and made the abbreviations hard
 * to pick out — worse the darker the team. The same wash treatment the board's
 * axis bands use fixes it and makes the two tabs agree about what a team looks
 * like. `readableTeamInk()` keeps the type at 4.5:1 against the wash while
 * leaving it recognisably the team's own color.
 */
function teamChip(abbr) {
  const logo = logoOf(abbr);
  const primary = primaryOf(abbr);
  const wash = tintOn(primary, '#FFFFFF', 0.10);
  const px = markSize(abbr);

  return `
    <span class="sq-wk-team"
          style="--team:${primary};
                 --team-wash:${wash};
                 --team-ink:${readableTeamInk(primary, wash)}">
      <span class="sq-wk-mark">
        ${logo ? `<img src="${escape(logo)}" alt="" width="${px}" height="${px}" loading="lazy" />` : ''}
      </span>
      <span class="sq-wk-abbr">${escape(abbr)}</span>
    </span>`;
}

/* ── Leaderboard ──────────────────────────────────────────────────────── */

function leaderboardCard(board) {
  const rows = board.slice(0, 12).map((e, i) => `
    <li class="sq-lb-row">
      <span class="sq-lb-rank">${i + 1}</span>
      <span class="sq-lb-name">${escape(e.name)}</span>
      <span class="sq-lb-hits">${e.hits}&times;</span>
      <span class="sq-lb-money">${money(e.won)}</span>
    </li>`).join('');

  return `
    <div class="section-head sq-section">
      <div>
        <p class="eyebrow">Who is collecting</p>
        <h3>Board leaderboard</h3>
      </div>
    </div>
    <div class="card sq-lb"><ol class="sq-lb-list">${rows}</ol></div>`;
}

/* ── Formatting ───────────────────────────────────────────────────────── */

function money(n) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
