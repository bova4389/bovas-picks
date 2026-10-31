/* ==========================================================================
   Lookback tab -- the season-long pool, graded on process.

   Renders data/results/lookback-<year>.json, which scripts/lookback.py
   writes. Nothing is computed here beyond sums and formatting: the
   simulation (40,000 seasons of each week, scored against every real card in
   the pool) is far too heavy for a phone, and the tab's whole job is to show
   the same numbers STRATEGY.md's lookback quotes. One source, two readers.

   The headline is a CHANCE, not a result. Thirteen games is nothing
   (STRATEGY.md §6), so "did our card win" says almost nothing about whether
   it was a good card. "What was its chance of winning the week, against the
   cards the field actually sent" does, and it is the only number on the page
   the strategy can be judged by. Results are shown too, labeled as results.

   A new file, not exports on a shared module, for the stale-cached-module
   reason in CLAUDE.md "Cache busting".
   ========================================================================== */

import { SEASON } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const pct = (x, digits = 2) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`);
const whole = (x) => `${Math.round(x * 100)}%`;
const ord = (n) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/* The cards compared, in the order a reader should meet them: the two
   baselines, what we did, what the site would have done, and the ceiling. */
const CARDS = [
  { key: 'chalk', label: 'Pure chalk', note: 'every favorite' },
  { key: 'random', label: 'An average entry', note: '1 in N' },
  { key: 'actual', label: 'Our cards', note: 'what we sent' },
  { key: 'rules', label: "The site's rules", note: 'Recommend, Saturday info' },
  { key: 'rulesKnown', label: 'Rules + real pick shares', note: 'if we knew the field' },
  { key: 'best', label: 'Best card possible', note: 'knowing every card — a ceiling' },
];

const chanceOf = (w, key) => (key === 'random' ? w.random : w.cards[key].chance);

export async function initLookback(root, season = SEASON) {
  let data = null;
  try {
    const res = await fetch(`data/results/lookback-${season}.json`, { cache: 'no-cache' });
    if (res.ok) data = await res.json();
  } catch { /* rendered as the waiting state below */ }

  if (!data || !data.weeks?.length) {
    root.innerHTML = `
      ${head(null)}
      <section class="card st-card">
        <p class="lede">Nothing to look back on yet. This fills in once a week's cards are parsed
        and its games are graded: <code>scripts/lookback.py ${season}</code>.</p>
      </section>`;
    return;
  }
  root.innerHTML = [
    head(data),
    seasonCard(data),
    weeksCard(data),
    fieldCard(data),
    marketCard(data),
    methodNote(data),
  ].join('');
}

function head(data) {
  const weeks = data?.weeks || [];
  const span = weeks.length
    ? `Weeks ${weeks[0].week}–${weeks[weeks.length - 1].week}`
    : 'Waiting on graded weeks';
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Mike's pick'em · ${esc(span)}</p>
        <h2>Lookback</h2>
      </div>
    </div>`;
}

/* ── The season at a glance ─────────────────────────────────────────────*/

function seasonCard(data) {
  const W = data.weeks;
  const ours = W.reduce((a, w) => a + w.cards.actual.correct, 0);
  const chalk = W.reduce((a, w) => a + w.cards.chalk.correct, 0);
  const dogs = W.flatMap((w) => w.cards.actual.dogs).filter((d) => d.won != null);
  const dogsWon = dogs.filter((d) => d.won).length;
  const dogsExp = dogs.reduce((a, d) => a + d.p, 0);
  const ranked = W.filter((w) => w.rank);
  const best = ranked.reduce((b, w) => (!b || w.rank < b.rank ? w : b), null);

  const means = CARDS.map((c) => ({ ...c, v: avg(W.map((w) => chanceOf(w, c.key))) }));
  const top = Math.max(...means.map((m) => m.v));
  const diff = ours - chalk;

  return `
    <section class="card st-card">
      <p class="eyebrow">This season</p>
      <h3>How our cards have done</h3>
      <div class="st-stats">
        <div><strong>${pct(means.find((m) => m.key === 'actual').v)}</strong>
          <span>our chance to win a week</span></div>
        <div><strong>${diff > 0 ? '+' : ''}${diff}</strong>
          <span>right vs. pure chalk (${ours} to ${chalk})</span></div>
        <div><strong>${dogsWon} of ${dogs.length}</strong>
          <span>our underdogs won (${dogsExp.toFixed(1)} expected)</span></div>
        <div><strong>${best ? ord(best.rank) : '—'}</strong>
          <span>best finish${best ? `, Week ${best.week}` : ''}</span></div>
      </div>
      <h4 class="st-sub">Average chance of winning a week</h4>
      <ul class="lb-bars">
        ${means.map((m) => `
          <li class="lb-bar${m.key === 'actual' ? ' is-ours' : ''}${m.key === 'best' ? ' is-ceiling' : ''}">
            <span class="lb-bar-label">${esc(m.label)} <span class="lb-bar-note">${esc(m.note)}</span></span>
            <span class="lb-bar-track"><span class="lb-bar-fill" style="width:${(100 * m.v / top).toFixed(1)}%"></span></span>
            <span class="lb-bar-val">${pct(m.v)}</span>
          </li>`).join('')}
      </ul>
      <p class="st-note">A chance, not a result: each week is replayed ${data.trials.toLocaleString()}
        times from the closing prices and scored against every card the pool really sent. The
        weekly prize is <strong>$1,270</strong>, so each 0.1 point is worth about $1.27 a week.</p>
    </section>`;
}

/* ── Week by week ───────────────────────────────────────────────────────*/

function weeksCard(data) {
  const rows = [...data.weeks].reverse().map((w) => {
    const a = w.cards.actual;
    const winners = w.winners.map((x) => `${esc(x.nick)} (${x.dogs} dog${x.dogs === 1 ? '' : 's'}, ${x.dogsWon} hit)`).join(', ');
    return `
      <li class="lb-week">
        <div class="st-game-top">
          <span class="st-matchup">Week ${w.week}</span>
          <span class="st-status">${w.rank ? `${ord(w.rank)} of ${w.entrants}` : `${w.entrants} entries`}</span>
        </div>
        <p class="lb-line"><strong>${a.correct}</strong> right · chalk ${w.cards.chalk.correct} ·
          field median ${w.median} · winner ${w.top}</p>
        <p class="lb-line lb-chances">Chance to win: <strong>ours ${pct(a.chance)}</strong> ·
          rules ${pct(w.cards.rules.chance)} · best ${pct(w.cards.best.chance)} ·
          chalk ${pct(w.cards.chalk.chance)}</p>
        ${a.dogs.length ? `
          <p class="lb-dogs">${a.dogs.map((d) => `
            <span class="st-res ${d.won == null ? 'is-tie' : d.won ? 'is-won' : 'is-lost'}">${esc(d.team)}
              ${whole(d.p)}${d.share != null ? ` · ${whole(d.share)} of pool` : ''}</span>`).join('')}</p>`
          : '<p class="lb-line">No underdogs — an all-chalk card.</p>'}
        <p class="lb-line lb-quiet">Won by ${winners || '—'}${w.tiedAtTop > 1 ? ` · ${w.tiedAtTop} tied on ${w.top}` : ''}.
          Monday total ${w.mnfTotal ?? '—'} (line ${w.marketTotal ?? '—'}, we guessed ${w.myMnf ?? '—'}).</p>
      </li>`;
  }).join('');
  return `
    <section class="card st-card">
      <p class="eyebrow">Week by week</p>
      <h3>Our card each week</h3>
      <p class="st-note">Underdogs we took, each with its win chance and the share of the pool on it.
        Green won, red lost.</p>
      <ul class="st-games">${rows}</ul>
    </section>`;
}

/* ── The field ──────────────────────────────────────────────────────────*/

function fieldCard(data) {
  const chalkTotal = data.weeks.reduce((a, w) => a + w.cards.chalk.correct, 0);
  const full = data.field.filter((p) => p.weeks === data.fullSeasonWeeks);
  const chalkRank = 1 + full.filter((p) => p.correct > chalkTotal).length;
  const rows = data.field.map((p) => `
    <tr class="${p.me ? 'is-me' : ''}">
      <td class="st-num">${p.rank}</td>
      <td class="st-name"><span>${esc(p.nick)}</span></td>
      <td class="st-num">${p.correct}</td>
      <td class="st-num">${p.vsChalk > 0 ? '+' : ''}${p.vsChalk}</td>
      <td class="st-num">${p.dogsWon}/${p.dogs}</td>
      <td class="st-num">${p.wins || ''}</td>
    </tr>`).join('');
  return `
    <section class="card st-card">
      <p class="eyebrow">The field</p>
      <h3>Season leaders</h3>
      <p class="st-note">Pure chalk would have <strong>${chalkTotal}</strong> right, which ranks about
        <strong>${ord(chalkRank)}</strong> of ${data.fieldSize}. Nobody in the pool is more than a few
        games better than chalk over the season. That is why the weekly prize, not the season one,
        is the game.</p>
      <div class="st-tablewrap"><table class="st-table">
        <thead><tr>
          <th class="st-num">#</th><th>Entry</th><th class="st-num">Right</th>
          <th class="st-num">vs chalk</th><th class="st-num">Dogs won</th><th class="st-num">Weeks won</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="st-note st-fine">Entries that played every week. Ties share a rank.</p>
    </section>`;
}

/* ── Is the market right? ───────────────────────────────────────────────*/

function marketCard(data) {
  if (!data.calibration?.length) return '';
  const rows = data.calibration.map((c) => `
    <tr>
      <td>${esc(c.band)}</td>
      <td class="st-num">${c.games}</td>
      <td class="st-num">${c.favWon}</td>
      <td class="st-num">${c.expected}</td>
    </tr>`).join('');
  const won = data.calibration.reduce((a, c) => a + c.favWon, 0);
  const exp = data.calibration.reduce((a, c) => a + c.expected, 0);
  return `
    <section class="card st-card">
      <p class="eyebrow">Market check</p>
      <h3>Do favorites win as often as priced?</h3>
      <p class="st-note">Favorites won <strong>${won}</strong> games against <strong>${exp.toFixed(1)}</strong>
        expected. If the market were badly wrong, this is where it would show.</p>
      <div class="st-tablewrap"><table class="st-table">
        <thead><tr>
          <th>Favorite's price</th><th class="st-num">Games</th>
          <th class="st-num">Fav. won</th><th class="st-num">Expected</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`;
}

function methodNote(data) {
  return `
    <p class="st-note st-fine lb-method">How this is worked out: every game is priced from its last
      odds snapshot before kickoff. "The site's rules" pick from the last price before the Saturday
      deadline, with a modeled pick share (k = ${esc(data.k)}), because the field's cards arrive
      after picks are due. "Best card possible" is the best card found by changing one game at a
      time with every card already known, so it is a ceiling, not a target. Rebuilt by
      <code>scripts/lookback.py</code>; the reasoning is in STRATEGY.md §4.</p>`;
}
