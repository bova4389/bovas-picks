/* ==========================================================================
   Pick Sheet — a mirror of the commissioner's weekly sheet.

   Purpose is narrow and practical: pick every game, have the numbers checked
   before they go out, and get a clean message to paste into the email. A
   transposed number costs a game, and a game is what separates the top of
   this pool from the middle.

   LOCK / UNLOCK (2026-09-14): a week whose card has been emailed opens locked,
   so a stray tap cannot change it -- see js/pickLock.js. Locked disables the
   pick buttons, the Monday total and Clear week; copying and emailing the
   message still work.

   SAVED FOR EVERY DEVICE (2026-09-27): tapping Lock also writes the card --
   numbers, Monday total and the suicide line exactly as the message carries
   them -- to data/picks-sent-<year>.json through js/githubSync.js. Before
   this, a card locked on the iPad was a blank sheet on the phone. The line
   under the controls says whether the locked card matches the saved one, and
   offers Save / Connect GitHub when it does not.
   ========================================================================== */

import {
  SEASON, tryNumberMap, weekNumbers, scoredGames, tiebreakerGame,
  savePicks, getOddsSnapshot, getSeasonAudit, getSchedule,
} from './data.js';
import {
  buildSeasonOddsIndex, matchSeasonOdds, kickoffIndex, kickoffFor,
} from './oddsMatch.js';
import { currentWeek } from './gameState.js';
import {
  loadMyPicks, seasonCard, survivorPick, survivorRecommendation, sentCard,
} from './myPicks.js';
import { isLocked, setLocked, lockControl } from './pickLock.js';
import { tiebreakSuggestion, TIEBREAK_WHY } from './tiebreak.js';
import { hasGhToken, saveSentWeek, connectBox } from './githubSync.js';
import { ABBR_TO_MASCOT } from './teams.js';
import { favoriteLine } from './oddsBadge.js';
import { seasonBanner } from './seasonBanner.js';

const DAY_ORDER = [
  'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday',
];

let map = null;
let week = null;
let picks = {};          // { [awayNum]: chosenNumber }  — keyed by game
let seasonIndex = null;  // pair+kickoff, from buildSeasonOddsIndex
let kickoffs = new Map(); // "week|Away|Home" -> ISO kickoff, from the schedule
let sync = null;          // { week, status: 'saving'|'saved'|'error', at?, message? }

const el = (id) => document.getElementById(id);

/** Locked by default once this week's card is in the sent file. */
const locked = () => isLocked('picks', SEASON, week, Boolean(sentCard(week)?.numbers?.length));

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
  //
  // The SEASON index, keyed on pair AND kickoff, because the snapshot holds
  // all 272 games at once and 96 of them share a pair with another game. See
  // js/oddsBadge.js's header for what the pair-only join did here.
  const snapshot = await getOddsSnapshot();
  seasonIndex = snapshot ? buildSeasonOddsIndex(snapshot.events) : null;
  // The number map has no kickoffs in it — the commissioner's workbook only
  // prints a day name — so the dates the join needs come from the schedule.
  const schedule = await getSchedule(SEASON);
  kickoffs = kickoffIndex(schedule);
  await loadMyPicks();

  // Open on the week in play, not Week 1. Opening on the first week of the
  // sheet looked exactly like the saved card had been wiped from Week 2 on.
  const weeks = weekNumbers(map);
  const now = schedule ? currentWeek(schedule) : weeks[0];
  week = weeks.includes(now) ? now : weeks.find((w) => w >= now) ?? weeks[weeks.length - 1];
  picks = seasonCard(map, week).picks;

  root.innerHTML = shell(weeks);
  wireControls();
  render();

  // The survivor pick can change while this panel is hidden -- a team spent
  // on the Grid, or the Picks tab rendering a card -- so re-read it on the
  // way in rather than emailing the copy taken at boot.
  document.addEventListener('panelchange', (e) => {
    if (e.detail?.panel === 'picksheet') renderOutput();
  });

  // Connecting GitHub on a locked, unsaved card is a request to save it.
  window.addEventListener('ghauth', () => {
    if (hasGhToken() && locked() && !isSaved()) saveCard();
    else renderSync();
  });
  // Another tab (the Picks tab) saved the file: the lock default and the
  // saved line both read it.
  window.addEventListener('sentchange', () => render());
}

/* ── The odds join ────────────────────────────────────────────────────────
   Two steps rather than one because the number map and the odds snapshot
   have no key in common: the map names mascots and a day of the week, the
   snapshot names full team names and an exact kickoff. The schedule is the
   only thing holding both, so it is the bridge — built by kickoffIndex() in
   js/oddsMatch.js, which the Recommend tab shares.
   ------------------------------------------------------------------------ */

/**
 * The odds event for one number-map game, or null.
 *
 * The kickoff is what separates the two meetings of a division rivalry, so a
 * game the schedule can't date gets null rather than a guess.
 */
function oddsFor(g) {
  if (!seasonIndex) return null;
  const date = kickoffFor(kickoffs, week, g.away, g.home);
  if (!date) return null;
  return matchSeasonOdds({ away: g.away, home: g.home, date }, seasonIndex);
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
               placeholder="Total" value="" aria-describedby="mnf-game" />
        <span class="hint" id="mnf-game"></span>
        <div class="tb-suggest" id="tb-suggest"></div>
      </div>
      <button class="btn btn-ghost" id="clear-week" type="button">Clear week</button>
      <div class="field lock-field" id="lock-slot"></div>
      <div class="ghs" id="sync-slot" aria-live="polite"></div>
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
    picks = seasonCard(map, week).picks;
    el('mnf-points').value = picks.__mnf ?? '';
    render();
  });

  el('mnf-points').addEventListener('input', (e) => {
    if (locked()) { e.target.value = picks.__mnf ?? ''; return; }
    picks.__mnf = e.target.value === '' ? undefined : Number(e.target.value);
    persist();
    renderOutput();
  });

  el('lock-slot').addEventListener('click', (e) => {
    if (!e.target.closest('[data-lock-toggle]')) return;
    setLocked('picks', SEASON, week, !locked());
    render();
    if (locked() && !isSaved()) saveCard();
  });

  el('tb-suggest').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tb-use]');
    if (!btn || locked()) return;
    picks.__mnf = Number(btn.dataset.tbUse);
    persist();
    render();
  });

  el('sync-slot').addEventListener('click', (e) => {
    if (e.target.closest('[data-sync-save]')) saveCard();
  });

  el('clear-week').addEventListener('click', () => {
    if (locked()) return;
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
    const subject = `Week ${week} picks`;
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
  const isLockedNow = locked();
  el('lock-slot').innerHTML = lockControl(isLockedNow);
  el('mnf-points').disabled = isLockedNow;
  el('clear-week').disabled = isLockedNow;
  el('lock-slot').closest('.controls')?.classList.toggle('is-locked', isLockedNow);
  el('games').classList.toggle('is-locked', isLockedNow);
  renderGames();
  renderProgress();
  renderOutput();
  renderSync();
}

/* ── Saved for every device ───────────────────────────────────────────────*/

/** The card as the message carries it: ascending numbers, the Monday total,
 *  and the suicide line's team (a marked pick, or the recommendation the
 *  message fell back to -- either way, what was emailed). */
function cardToSave() {
  return {
    numbers: pickedNumbers().map(Number).sort((a, b) => a - b),
    points: Number.isFinite(picks.__mnf) ? picks.__mnf : null,
    mike: survivorPick('mike', week)?.team || survivorRecommendation('mike', week) || null,
  };
}

/** Whether the sent file already holds this card. An empty card counts as
 *  saved: there is nothing to put anywhere. */
function isSaved() {
  const c = cardToSave();
  const sent = sentCard(week);
  if (!c.numbers.length && c.points == null) return true;
  if (!sent) return false;
  const nums = (sent.numbers || []).map(Number);
  return nums.length === c.numbers.length
    && nums.every((n, i) => n === c.numbers[i])
    && (sent.points ?? null) === c.points
    && (!c.mike || sent.survivor?.mike === c.mike);
}

async function saveCard() {
  if (!hasGhToken()) { renderSync(); return; }
  const w = week;
  const c = cardToSave();
  if (!c.numbers.length && c.points == null) return;

  sync = { week: w, status: 'saving' };
  renderSync();
  try {
    // Rebuilt rather than patched so the keys keep the file's hand-written
    // order (numbers, points, survivor with mike first, then anything else).
    await saveSentWeek(SEASON, w, (card) => {
      const { numbers: _n, points: _p, survivor = {}, ...rest } = card;
      const pools = c.mike ? Object.assign({ mike: c.mike }, survivor, { mike: c.mike }) : survivor;
      return {
        numbers: c.numbers,
        ...(c.points != null ? { points: c.points } : {}),
        ...(Object.keys(pools).length ? { survivor: pools } : {}),
        ...rest,
      };
    }, `data: Week ${w} pick'em card, saved from the Pick Sheet`);
    sync = { week: w, status: 'saved', at: new Date() };
  } catch (err) {
    sync = { week: w, status: 'error', message: err.message };
  }
  if (week === w) render();
}

function renderSync() {
  const slot = el('sync-slot');
  if (!slot) return;
  const mine = sync?.week === week ? sync : null;

  if (!locked()) { slot.innerHTML = ''; return; }
  if (mine?.status === 'saving') {
    slot.innerHTML = '<p class="ghs-note">Saving for every device…</p>';
    return;
  }
  if (isSaved()) {
    const at = mine?.status === 'saved'
      ? ` · ${mine.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : '';
    slot.innerHTML = `<p class="ghs-note is-ok">Saved for every device${at}</p>`;
    return;
  }
  slot.innerHTML = `
    <p class="ghs-note is-local">${mine?.status === 'error'
      ? `Not saved: ${escape(mine.message)}`
      : 'Only on this device — other devices can’t see this card yet.'}</p>
    ${hasGhToken()
      ? `<button type="button" class="btn ghs-btn" data-sync-save>${mine?.status === 'error' ? 'Try again' : 'Save for every device'}</button>`
      : `<div data-gh-connect>${connectBox()}</div>`}`;
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
  renderTiebreak(tb);

  el('games').querySelectorAll('.pick').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (locked()) return;
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

/**
 * The market total for the Monday game and the number to write, with a
 * one-tap "Use" button (2026-10-06, at the owner's request -- this box used
 * to print the line and deliberately stop short of a number).
 *
 * The line alone is the worst answer: about half the pool guesses within 3
 * points of it, so a tie on it is split many ways. See js/tiebreak.js for the
 * measured basis of the suggestion. Renders nothing without a market total.
 */
function renderTiebreak(tb) {
  const slot = el('tb-suggest');
  if (!slot) return;
  const ev = tb ? oddsFor(tb) : null;
  const s = tiebreakSuggestion(ev?.total);
  if (!s) { slot.innerHTML = ''; return; }
  const using = picks.__mnf === s.guess || picks.__mnf === s.alt;
  slot.innerHTML = `
    <p class="tb-line">
      Line <strong>${s.line}</strong>
      <span class="tb-sep">·</span>
      Suggested <strong class="tb-guess">${s.guess}</strong>
      <span class="tb-alt">(or ${s.alt})</span>
    </p>
    ${using ? '' : `<button type="button" class="btn btn-ghost tb-use" data-tb-use="${s.guess}"${
      locked() ? ' disabled' : ''}>Use ${s.guess}</button>`}
    <p class="tb-why">${escape(TIEBREAK_WHY)}</p>`;
}

function gameRow(g) {
  const chosen = picks[g.awayNum];
  const fav = favoriteLine(g, oddsFor(g));
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
    <button class="pick" type="button"${locked() ? ' disabled' : ''}
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

  // Both pools go in one email and share the midnight-Saturday deadline, so a
  // missing suicide pick is a half-sent entry, not a separate errand. Warned
  // rather than blocked: the pick'em card is still valid on its own, and some
  // weeks the suicide entry is already out (a Wednesday or Thursday team has
  // to be in by 6pm before that game, which is days earlier).
  if (!survivorPickName()) {
    problems.push(`No suicide pick for Week ${week} yet — the Survivor Picks tab has no card for Mike's pool`);
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
      `<p>Ready — ${n} picks, numbers check out against the Week ${week} sheet.</p>` +
      (suicideIsRecommendation()
        ? `<p class="hint">Suicide line is the Picks tab's recommendation — mark your Mike's pick there if you go a different way.</p>`
        : '');
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
 * My suicide pick for this week, as a team name — or null if there is none.
 * Read from Mike's pool specifically: the Sleeper pools are different games
 * and their picks have no business in this email.
 *
 * My actual Mike's pick wins. With none marked, the Picks tab's
 * recommendation fills the line so the email is ready — and renderOutput()
 * says it is the recommendation, not a recorded pick.
 */
function survivorPickName() {
  const abbr = survivorPick('mike', week)?.team || survivorRecommendation('mike', week);
  return abbr ? (ABBR_TO_MASCOT[abbr] || abbr) : null;
}

const suicideIsRecommendation = () =>
  !survivorPick('mike', week) && Boolean(survivorRecommendation('mike', week));

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
