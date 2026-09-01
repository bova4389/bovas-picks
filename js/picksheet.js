/* ==========================================================================
   Pick Sheet — a mirror of the commissioner's weekly sheet.

   Purpose is narrow and practical: pick every game, have the numbers checked
   before they go out, and get a clean message to paste into the email. A
   transposed number costs a game, and a game is what separates the top of
   this pool from the middle.
   ========================================================================== */

import {
  SEASON, tryNumberMap, weekNumbers, scoredGames, tiebreakerGame,
  loadPicks, savePicks, loadProfile, saveProfile, getOddsSnapshot,
  getSeasonAudit,
} from './data.js';
import { buildOddsIndex } from './oddsMatch.js';
import { loadLeagueState } from './survivorLeagues.js';
import { ABBR_TO_MASCOT } from './teams.js';
import { favoriteLine } from './oddsBadge.js';
import { seasonBanner } from './seasonBanner.js';

const DAY_ORDER = [
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday',
];

let map = null;
let week = null;
let picks = {};          // { [awayNum]: chosenNumber }  — keyed by game
let profile = loadProfile();
let oddsIndex = new Map();

const el = (id) => document.getElementById(id);

/* ── Boot ─────────────────────────────────────────────────────────────── */

export async function initPickSheet(root) {
  map = await tryNumberMap();

  // No sheet for the active season is the *normal* state until the workbook
  // arrives — not an error, and specifically not a reason to fall back to
  // last season's sheet. Rendering the previous year's games here is what
  // made the whole site quietly wrong; see js/season.js.
  if (!map || map.year !== SEASON) {
    root.innerHTML = header() + seasonBanner(await getSeasonAudit(), {
      context: 'the pick sheet',
    }) + missingSheetHint();
    return;
  }

  // Odds are best-effort here — a missing/failed snapshot (getOddsSnapshot
  // never throws) just means no favorite badges render, not a broken sheet.
  const snapshot = await getOddsSnapshot();
  oddsIndex = snapshot ? buildOddsIndex(snapshot.events) : new Map();

  const weeks = weekNumbers(map);
  week = weeks[0];
  picks = loadPicks(week);

  root.innerHTML = shell(weeks);
  wireControls();
  render();
}

function header() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Weekly submission</p>
        <h2>Pick sheet</h2>
      </div>
    </div>`;
}

/** What to actually do about it. The banner says the sheet is missing; this
 *  says how it stops being missing, since that step is a person emailing a
 *  spreadsheet rather than anything the site can do for itself. */
function missingSheetHint() {
  return `
    <div class="notice">
      <strong>What unblocks this.</strong><br />
      The pick sheet is a mirror of the commissioner's numbered weekly sheet,
      so it can't be built from ESPN data — the numbers are his. Once the
      <em>Weekly Sheets</em> workbook for ${escape(SEASON)} arrives:
      <br /><br />
      <code>python scripts/parse_weekly_sheets.py "Weekly Sheets.xlsx" ${escape(SEASON)}</code>
      <br /><br />
      Meanwhile the <strong>Schedule</strong> tab has every ${escape(SEASON)}
      matchup and kickoff, and <strong>Odds</strong> has the market lines.
    </div>`;
}

function shell(weeks) {
  return `
    ${header()}

    <div class="card controls">
      <div class="field">
        <label for="week-select">Week</label>
        <select id="week-select">
          ${weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="mnf-points">Monday night points</label>
        <input id="mnf-points" type="number" inputmode="numeric" min="0" max="120"
               placeholder="44" value="" aria-describedby="mnf-game" />
        <span class="hint" id="mnf-game"></span>
      </div>
      <div class="field" style="flex:1 1 190px">
        <label for="entry-name">Name on the entry</label>
        <input id="entry-name" type="text" placeholder="Your pool name"
               value="${escape(profile.name || '')}" />
      </div>
      <button class="btn btn-ghost" id="clear-week" type="button">Clear week</button>
    </div>

    <div class="progress" id="progress">
      <div class="progress-count"><strong id="picked-n">0</strong> <span id="picked-of">of 0</span></div>
      <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
      <span class="pill" id="progress-pill">Incomplete</span>
    </div>

    <div id="games"></div>

    <div class="card output">
      <h3>Message to send</h3>
      <p class="hint">Checked against the sheet, then paste into the email.</p>
      <div id="issues"></div>
      <textarea class="email-box" id="email-box" readonly
                aria-label="Generated pick message"></textarea>
      <div class="output-actions">
        <button class="btn" id="copy-btn" type="button">Copy message</button>
        <button class="btn btn-ghost" id="mail-btn" type="button">Open in email</button>
      </div>
    </div>`;
}

function wireControls() {
  el('week-select').addEventListener('change', (e) => {
    week = Number(e.target.value);
    picks = loadPicks(week);
    el('mnf-points').value = picks.__mnf ?? '';
    render();
  });

  el('mnf-points').addEventListener('input', (e) => {
    picks.__mnf = e.target.value === '' ? undefined : Number(e.target.value);
    persist();
    renderOutput();
  });

  el('entry-name').addEventListener('input', (e) => {
    profile.name = e.target.value;
    saveProfile(profile);
    renderOutput();
  });

  el('clear-week').addEventListener('click', () => {
    picks = {};
    persist();
    el('mnf-points').value = '';
    render();
  });

  el('copy-btn').addEventListener('click', async () => {
    const btn = el('copy-btn');
    try {
      await navigator.clipboard.writeText(el('email-box').value);
      btn.textContent = 'Copied';
    } catch {
      el('email-box').select();          // fallback: leave it selected
      btn.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { btn.textContent = 'Copy message'; }, 1800);
  });

  el('mail-btn').addEventListener('click', () => {
    const subject = `Week ${week} picks${profile.name ? ` — ${profile.name}` : ''}`;
    window.location.href =
      `mailto:?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(el('email-box').value)}`;
  });
}

function persist() { savePicks(week, picks); }

/* ── Render ───────────────────────────────────────────────────────────── */

function render() {
  el('week-select').value = week;
  el('mnf-points').value = picks.__mnf ?? '';
  renderGames();
  renderProgress();
  renderOutput();
}

function renderGames() {
  // Scored games only. The sheet prints the excluded Thursday (and any
  // Wednesday/Friday) game for reference, but there is nothing to pick on it
  // and a row you cannot act on is one more thing to read past on the way to
  // the twenty-eight numbers that matter.
  const games = scoredGames(map, week);
  const byDay = new Map();
  for (const g of games) {
    const day = g.day || 'Sunday';
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(g);
  }

  const days = [...byDay.keys()].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
  );

  el('games').innerHTML = days.map((day) => `
    <div class="daygroup">
      <h3>${escape(day)}</h3>
      ${byDay.get(day).map(gameRow).join('')}
    </div>`).join('');

  const tb = tiebreakerGame(map, week);
  el('mnf-game').textContent = tb
    ? `Total points in ${tb.away} at ${tb.home}`
    : 'Tiebreaker game not marked on this sheet';

  el('games').querySelectorAll('.pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      const away = Number(btn.dataset.away);
      const num = Number(btn.dataset.num);
      picks[away] = picks[away] === num ? undefined : num;
      if (picks[away] === undefined) delete picks[away];
      persist();
      renderGames();
      renderProgress();
      renderOutput();
    });
  });
}

function gameRow(g) {
  const chosen = picks[g.awayNum];
  const fav = favoriteLine(g, oddsIndex);
  return `
    <div class="game${chosen ? ' is-picked' : ''}${g.tiebreaker ? ' is-tiebreak' : ''}">
      ${g.tiebreaker ? '<div class="game-tb">Tiebreaker &mdash; total points</div>' : ''}
      ${fav ? `<div class="game-odds">${fav} favored</div>` : ''}
      ${side(g, g.awayNum, g.away, 'Away', chosen)}
      <div class="game-at">at</div>
      ${side(g, g.homeNum, g.home, 'Home', chosen)}
    </div>`;
}

function side(g, num, team, label, chosen) {
  return `
    <button class="pick" type="button"
            data-away="${g.awayNum}" data-num="${num}"
            aria-pressed="${chosen === num}"
            aria-label="Pick ${escape(team)}, number ${num}">
      <span class="pick-num">${num}</span>
      <span>
        <span class="pick-team">${escape(team)}</span>
        <span class="pick-side">${label}</span>
      </span>
    </button>`;
}

function renderProgress() {
  const total = scoredGames(map, week).length;
  const made = countPicks();
  const pct = total ? (made / total) * 100 : 0;

  el('picked-n').textContent = made;
  el('picked-of').textContent = `of ${total}`;
  el('progress-fill').style.width = `${pct}%`;

  const done = made === total && total > 0;
  el('progress').classList.toggle('is-complete', done);
  const pill = el('progress-pill');
  pill.textContent = done ? 'All games picked' : `${total - made} left`;
  pill.classList.toggle('ok', done);
}

function countPicks() {
  return scoredGames(map, week).filter((g) => picks[g.awayNum]).length;
}

/* ── Validation + message ─────────────────────────────────────────────── */

function validate() {
  const games = scoredGames(map, week);
  const problems = [];

  const missing = games.filter((g) => !picks[g.awayNum]);
  if (missing.length) {
    problems.push(
      `${missing.length} game${missing.length > 1 ? 's' : ''} still unpicked: ` +
      missing.map((g) => `${g.away} at ${g.home}`).join(', ')
    );
  }

  // Defensive: a stored pick that isn't one of the two valid numbers means the
  // sheet changed under a saved card. Silent here would be expensive.
  for (const g of games) {
    const p = picks[g.awayNum];
    if (p && p !== g.awayNum && p !== g.homeNum) {
      problems.push(
        `${g.away} at ${g.home}: saved number ${p} is not ${g.awayNum} or ${g.homeNum}` +
        ` — clear the week and re-pick`
      );
    }
  }

  const nums = pickedNumbers();
  if (new Set(nums).size !== nums.length) {
    problems.push('Duplicate numbers in the card');
  }

  if (picks.__mnf === undefined || picks.__mnf === null || Number.isNaN(picks.__mnf)) {
    problems.push('Monday night points not set — it is the tiebreaker');
  }

  if (!profile.name || !profile.name.trim()) {
    problems.push('No name on the entry');
  }

  // Both pools go in one email and share the midnight-Saturday deadline, so a
  // missing suicide pick is a half-sent entry, not a separate errand. Warned
  // rather than blocked: the pick'em card is still valid on its own, and some
  // weeks the suicide entry is already out (a Wednesday or Thursday team has
  // to be in by 6pm before that game, which is days earlier).
  if (!survivorPickName()) {
    problems.push(`No suicide pick recorded for Week ${week} — set it on the Survivor grid`);
  }

  return problems;
}

function pickedNumbers() {
  return scoredGames(map, week)
    .map((g) => picks[g.awayNum])
    .filter(Boolean);
}

function renderOutput() {
  const problems = validate();
  const box = el('issues');

  if (problems.length) {
    box.className = 'issues bad';
    box.innerHTML =
      `<p>Not ready to send</p><ul>${problems.map((p) => `<li>${escape(p)}</li>`).join('')}</ul>`;
  } else {
    box.className = 'issues ok';
    const n = pickedNumbers().length;
    box.innerHTML =
      `<p>Ready — ${n} picks, numbers check out against the Week ${week} sheet.</p>`;
  }

  el('email-box').value = buildMessage();
}

/**
 * The message to send, in the exact shape the commissioner asked for
 * (2026-09-01 email, "Please put your picks in like this"):
 *
 *     2,4,5,7,10,11,14,15,17,20,22,24,26,28
 *     points 50
 *     Suicide KC
 *
 * Three details from that email that this format is not free to drift from:
 *
 *   * Numbers are comma-separated with NO spaces, ascending.
 *   * The suicide pick is a CITY OR TEAM NAME, never a number — "do not give
 *     me a number off the sheets". The two pools are submitted in one email
 *     and are the one place where a number and a name mean different things,
 *     so the suicide line deliberately does not go anywhere near `picks`.
 *   * Both pools are due midnight Saturday.
 *
 * The name/number readback below the divider is ours, not Mike's. The numbers
 * are what he scores, but a human reading them back is how a transposition
 * actually gets caught, and it costs him one glance to ignore.
 */
function buildMessage() {
  const games = scoredGames(map, week);
  const lines = [];

  lines.push(pickedNumbers().join(',') || '(no picks yet)');
  lines.push(`points ${picks.__mnf ?? '—'}`);
  lines.push(`Suicide ${survivorPickName() ?? '—'}`);
  lines.push('');
  lines.push(profile.name || '(name)');

  lines.push('');
  lines.push(`--- Week ${week} check ---`);
  const tb = tiebreakerGame(map, week);
  if (tb) lines.push(`points = total in ${tb.away} at ${tb.home}`);
  for (const g of games) {
    const p = picks[g.awayNum];
    if (!p) continue;
    lines.push(`${String(p).padStart(2, ' ')}  ${p === g.awayNum ? g.away : g.home}`);
  }

  return lines.join('\n');
}

/**
 * My suicide pick for this week, as a team name — or null if I have not made
 * one. Read from Mike's pool specifically: the Sleeper pool is a different
 * game and its pick has no business in this email.
 */
function survivorPickName() {
  const abbr = loadLeagueState('mike', SEASON).picks[String(week)];
  return abbr ? (ABBR_TO_MASCOT[abbr] || abbr) : null;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
