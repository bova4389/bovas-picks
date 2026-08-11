/* ==========================================================================
   Pick Sheet — a mirror of the commissioner's weekly sheet.

   Purpose is narrow and practical: pick every game, have the numbers checked
   before they go out, and get a clean message to paste into the email. A
   transposed number costs a game, and a game is what separates the top of
   this pool from the middle.
   ========================================================================== */

import {
  SEASON, getNumberMap, weekNumbers, gamesForWeek, scoredGames,
  loadPicks, savePicks, loadProfile, saveProfile,
} from './data.js';

const DAY_ORDER = ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'];

let map = null;
let week = null;
let picks = {};          // { [awayNum]: chosenNumber }  — keyed by game
let profile = loadProfile();

const el = (id) => document.getElementById(id);

/* ── Boot ─────────────────────────────────────────────────────────────── */

export async function initPickSheet(root) {
  try {
    map = await getNumberMap();
  } catch (err) {
    root.innerHTML = `
      <div class="notice">
        <strong>Couldn't load the number map.</strong><br />
        Expected <code>data/number-map-${SEASON}.json</code> — ${escape(err.message)}.
        <br /><br />
        Opening <code>index.html</code> straight off the disk blocks
        <code>fetch()</code>. Serve the folder instead:
        <br /><code>python -m http.server 8000</code>
      </div>`;
    return;
  }

  const weeks = weekNumbers(map);
  week = weeks[0];
  picks = loadPicks(week);

  root.innerHTML = shell(weeks);
  wireControls();
  render();
}

function shell(weeks) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Weekly submission</p>
        <h2>Pick sheet</h2>
      </div>
    </div>

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
               placeholder="44" value="" />
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
  const games = gamesForWeek(map, week);
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
  if (!g.counts) {
    return `
      <div class="game excluded">
        <div class="matchup">${escape(g.away)} at ${escape(g.home)}</div>
        <div class="why">Does not count this week</div>
      </div>`;
  }

  const chosen = picks[g.awayNum];
  return `
    <div class="game${chosen ? ' is-picked' : ''}">
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

function buildMessage() {
  const games = scoredGames(map, week);
  const lines = [`Week ${week} picks`, ''];

  lines.push(pickedNumbers().join(', ') || '(no picks yet)');
  lines.push('');

  // Team names alongside the numbers: the numbers are what count, but a human
  // reading it back is how a transposition actually gets caught.
  for (const g of games) {
    const p = picks[g.awayNum];
    if (!p) continue;
    lines.push(`${String(p).padStart(2, ' ')}  ${p === g.awayNum ? g.away : g.home}`);
  }

  lines.push('');
  lines.push(`Monday night points: ${picks.__mnf ?? '—'}`);
  lines.push(`Name: ${profile.name || '—'}`);
  return lines.join('\n');
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
