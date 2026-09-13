/* ==========================================================================
   Standings — how I am doing against Mike's two pools, live, while the
   week's games are still being played.

   Answers the Sunday question the rest of the site could not: "with the 4pm,
   the night game and Monday still to go, can I still win this week, and what
   do I need?" The math is in js/liveModel.js; this file fetches and draws.

   One panel reached from both nav rows (the Odds precedent): the pick'em half
   belongs to Season Long, the suicide half to Survivor.

   PRE-GAME PRICES ONLY. The odds bot keeps snapshotting during games, and a
   snapshot taken at 2:30pm is an in-play price that already knows the score.
   Feeding that to liveProb(), which adds the score itself, would count the
   lead twice -- so each game uses the last snapshot taken BEFORE kickoff.

   Polls on the Schedule tab's policy: only while this panel is showing, the
   browser tab is in front, and a game is live or about to be.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import {
  getSchedule, tryNumberMap, scoredGames, getSurvivor,
  getOddsSnapshot, getOddsHistory,
} from './data.js';
import { loadWeek, currentWeek, anyLive, msToNextKickoff } from './gameState.js';
import { buildSeasonOddsIndex, matchSeasonOdds, orientProbs } from './oddsMatch.js';
import { clearScoreboardCache } from './espn.js';
import { ABBR_TO_MASCOT } from './teams.js';
import {
  slateRows, scoreEntries, rankNow, bestCase, winChance, survivorWeek, fractionLeft,
} from './liveModel.js';

/* Which entry is mine in Mike's files. Both workbooks list it by this
   nickname (#238 pick'em, #208 suicide in 2026). */
const MY_NICK = 'Bova';

const POLL_MS = 25_000;
const PREKICK_MS = 15 * 60 * 1000;

const S = {
  root: null, panel: null, season: null, week: null,
  schedule: null, map: null, cards: null, survivor: null,
  prices: new Map(), totals: new Map(),
  view: null, timer: null, busy: false,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const pct = (p) => (p == null ? '—' : p >= 0.995 && p < 1 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;

/* ── Boot ─────────────────────────────────────────────────────────────── */

export async function initStandings(root, season) {
  if (!root) return;
  S.root = root;
  S.panel = root.closest('.panel');
  S.season = season;

  const [schedule, map, survivor, odds] = await Promise.all([
    getSchedule(season), tryNumberMap(season), getSurvivor(season), getOddsSnapshot(),
  ]);
  S.schedule = schedule;
  S.map = map && Number(map.year) === Number(season) ? map : null;
  S.survivor = survivor && Number(survivor.year) === Number(season) ? survivor : null;

  if (!schedule?.games?.length) {
    root.innerHTML = head() + '<p class="lede">No schedule loaded for this season.</p>';
    return;
  }
  S.week = currentWeek(schedule);

  const [cards] = await Promise.all([loadCards(season, S.week), loadPrices(odds)]);
  S.cards = cards;

  root.addEventListener('click', (e) => {
    if (e.target.closest('#st-refresh')) { clearScoreboardCache(); refresh(true); }
  });
  document.addEventListener('visibilitychange', onShow);
  document.addEventListener('panelchange', onShow);
  await refresh(true);
}

async function loadCards(season, week) {
  try {
    const res = await fetch(`data/raw/entries-${season}-w${String(week).padStart(2, '0')}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return Number(data.year) === Number(season) && Number(data.week) === Number(week) ? data : null;
  } catch {
    return null;
  }
}

/** Pre-kickoff away win probability and total, per "Away|Home" mascot pair. */
async function loadPrices(odds) {
  if (!odds?.events) return;
  const index = buildSeasonOddsIndex(odds.events);
  const games = S.schedule.games.filter((g) => g.week === S.week);
  await Promise.all(games.map(async (g) => {
    const game = { away: ABBR_TO_MASCOT[g.away], home: ABBR_TO_MASCOT[g.home], date: g.date };
    const ev = matchSeasonOdds(game, index);
    if (!ev) return;
    const kick = new Date(g.date).getTime();
    const history = await getOddsHistory(ev.id);
    const pre = [...history].reverse().find((h) => new Date(h.fetchedAt).getTime() < kick)
      || (new Date(odds.fetchedAt).getTime() < kick ? ev : null);
    if (!pre) return;
    const key = `${game.away}|${game.home}`;
    S.prices.set(key, orientProbs(game, pre).awayProb);
    if (pre.total != null) S.totals.set(key, pre.total);
  }));
}

/* ── Refresh + polling ────────────────────────────────────────────────── */

const showing = () => !document.hidden && S.panel && !S.panel.hidden;

function onShow() {
  if (showing()) refresh();
  else stop();
}

async function refresh(force = false) {
  if (S.busy) return;
  S.busy = true;
  try {
    S.view = await loadWeek(S.season, S.week, { live: true, maxAgeMs: force ? 0 : POLL_MS });
    render();
  } finally {
    S.busy = false;
  }
  schedule();
}

function schedule() {
  stop();
  if (!S.view || !showing()) return;
  const next = msToNextKickoff(S.view.games);
  if (anyLive(S.view.games) || (next != null && next <= PREKICK_MS)) {
    S.timer = setTimeout(() => refresh(), POLL_MS);
  }
}

function stop() {
  if (S.timer) clearTimeout(S.timer);
  S.timer = null;
}

/* ── Render ───────────────────────────────────────────────────────────── */

function head() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Mike's pools · live</p>
        <h2>Standings</h2>
      </div>
      <button type="button" class="btn btn-ghost" id="st-refresh">Refresh</button>
    </div>`;
}

function render() {
  const live = S.view.games;
  const updated = S.view.fetchedAt
    ? `Scores as of ${new Date(S.view.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'Scores from the committed schedule (live feed unavailable)';

  S.root.innerHTML = `
    ${head()}
    <p class="lede">Week ${S.week} · ${esc(updated)}</p>
    ${pickemSection(live)}
    ${survivorSection(live)}`;
}

/* ── Pick'em ──────────────────────────────────────────────────────────── */

function pickemSection(live) {
  if (!S.map || !S.cards) {
    return card("Mike's pick'em", 'Waiting on the cards',
      `<p class="lede">Week ${S.week}'s picks from Mike haven't been loaded yet. Run
       <code>scripts/parse_pool_picks.py</code> on his "Weekly picks" workbook.</p>`);
  }

  const byPair = new Map(live.map((g) => [`${g.away}|${g.home}`, g]));
  const rows = slateRows(scoredGames(S.map, S.week), byPair, S.prices);
  const scored = scoreEntries(S.cards.entries.map((e) => ({ ...e, mnf: typeof e.mnf === 'number' ? e.mnf : null })), rows);
  const me = scored.find((e) => String(e.nick).trim() === MY_NICK);
  if (!me) {
    return card("Mike's pick'em", 'Your card is not in the file',
      `<p class="lede">No entry named "${esc(MY_NICK)}" in Mike's Week ${S.week} cards.</p>`);
  }
  const field = scored.filter((e) => e !== me);
  const ranked = rankNow(scored);

  const tbRow = rows.find((r) => r.tiebreaker) || null;
  const tbGame = tbRow?.live;
  const tb = {
    total: tbGame?.state === 'post' ? tbGame.awayScore + tbGame.homeScore : null,
    floor: tbGame && tbGame.state !== 'pre' ? (tbGame.awayScore || 0) + (tbGame.homeScore || 0) : 0,
    expected: tbRow ? S.totals.get(`${tbRow.away}|${tbRow.home}`) ?? null : null,
    fractionLeft: tbGame ? fractionLeft(tbGame) : 1,
  };

  const done = rows.every((r) => r.decided);
  const best = bestCase(me, field, rows, tb);
  const sim = done || !best.alive ? null : winChance(me, field, rows, tb, 8000, seeded(S.week * 7919));
  const leaderCorrect = ranked[0].correct;
  const tiedWithMe = scored.filter((e) => e.correct === me.correct).length;
  const priced = rows.filter((r) => !r.decided && r.awayPre != null).length;
  const open = rows.filter((r) => !r.decided).length;

  let verdict;
  if (done) {
    verdict = me.rank === 1 && ranked.filter((r) => r.correct === me.correct).length === 1
      ? '<span class="st-verdict is-win">You won the week</span>'
      : best.alive ? '<span class="st-verdict is-win">Tied for first — tiebreaker decides</span>'
        : '<span class="st-verdict is-out">Week over — not a winner</span>';
  } else if (best.alive) {
    verdict = `<span class="st-verdict is-alive">Still alive to win the week</span>`;
  } else {
    verdict = `<span class="st-verdict is-out">Can't win the week</span>`;
  }

  const bestLine = best.alive
    ? (best.outright
      ? `If every remaining pick hits you finish with ${best.myMax} and nobody catches you.`
      : `If every remaining pick hits you finish with ${best.myMax}, tied with ${best.tied} — then it comes down to the Monday total.`)
    : best.ahead
      ? `Even if every remaining pick hits (${best.myMax}), ${best.ahead} ${best.ahead === 1 ? 'entry finishes' : 'entries finish'} ahead of you.`
      : `Even if every remaining pick hits (${best.myMax}), the tied entries win the tiebreaker at any total still possible.`;

  const summary = `
    <div class="st-stats">
      <div><strong>${me.correct}</strong><span>correct</span></div>
      <div><strong>${me.winningNow}</strong><span>winning now</span></div>
      <div><strong>${me.remaining}</strong><span>still to play</span></div>
      <div><strong>${ordinal(scored.filter((e) => e.correct > me.correct).length + 1)}</strong><span>of ${scored.length}${tiedWithMe > 1 ? ` (${tiedWithMe} tied)` : ''}</span></div>
    </div>
    <p class="st-verdict-row">${verdict}${sim ? ` <span class="st-chance">≈ ${pct(sim.chance)} to win</span>` : ''}</p>
    <p class="st-note">${esc(bestLine)} Leader has ${leaderCorrect} correct.</p>
    ${sim ? `<p class="st-note st-fine">The percentage is an estimate: pre-game prices${priced < open ? ` (${open - priced} of ${open} games unpriced, treated as coin flips)` : ''}, adjusted for the current score and time left, ties split.</p>` : ''}`;

  return card("Mike's pick'em", `Week ${S.week}: you vs. ${field.length} others`, `
    ${summary}
    ${gamesLeft(rows, me, sim, best.alive)}
    ${tiebreakerLine(me, tbRow, tb)}
    ${leaderboard(ranked, me)}`);
}

function gamesLeft(rows, me, sim, alive) {
  const open = rows.filter((r) => !r.decided)
    .sort((a, b) => (a.live?.kickoff || '').localeCompare(b.live?.kickoff || ''));
  if (!open.length) return '';
  const cond = new Map((sim?.games || []).map((g) => [g.row.awayNum, g]));
  const picks = new Set(me.picks);

  const items = open.map((r) => {
    const myNum = picks.has(r.awayNum) ? r.awayNum : picks.has(r.homeNum) ? r.homeNum : null;
    const myTeam = myNum === r.awayNum ? r.away : myNum === r.homeNum ? r.home : null;
    const g = r.live;
    const c = cond.get(r.awayNum);
    const ifHit = c ? (myNum === r.awayNum ? c.ifAway : c.ifHome) : null;
    const ifMiss = c ? (myNum === r.awayNum ? c.ifHome : c.ifAway) : null;
    const pMine = myNum == null ? null : myNum === r.awayNum ? r.awayNow : 1 - r.awayNow;

    let need = '';
    if (alive && myNum != null && c) {
      if (ifMiss === 0) need = '<span class="st-tag is-must">Must win</span>';
      else if (ifHit != null && ifMiss >= ifHit * 0.85) need = '<span class="st-tag">Barely matters</span>';
    }

    const status = !g ? '' : g.state === 'in'
      ? `${esc(g.away)} ${g.awayScore}–${g.homeScore} ${esc(g.home)} · Q${g.period > 4 ? 'OT' : g.period} ${esc(g.clock || '')}`
      : `${new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;

    return `
      <li class="st-game${g?.state === 'in' ? ' is-live' : ''}">
        <div class="st-game-top">
          <span class="st-matchup">${esc(r.away)} at ${esc(r.home)}${r.tiebreaker ? ' <span class="st-tag">Tiebreaker</span>' : ''}</span>
          <span class="st-status">${status}</span>
        </div>
        <div class="st-game-pick">
          ${myTeam ? `Your pick: <strong>${esc(myTeam)}</strong> · ${pct(pMine)} to win ${need}` : 'Not on your card'}
        </div>
        ${c && myNum != null ? `<div class="st-swing">Your chance if ${esc(myTeam)} win: <strong>${pct(ifHit)}</strong> · if they lose: <strong>${pct(ifMiss)}</strong></div>` : ''}
      </li>`;
  }).join('');

  return `<h4 class="st-sub">Games still to decide</h4><ul class="st-games">${items}</ul>`;
}

function tiebreakerLine(me, row, tb) {
  if (!row) return '';
  const now = row.live && row.live.state !== 'pre' ? ` · ${tb.floor} points so far` : '';
  const market = tb.expected != null ? ` · market total ${tb.expected}` : '';
  return `<p class="st-note">Monday tiebreaker (${esc(row.away)} at ${esc(row.home)}): your guess <strong>${me.mnf ?? 'none'}</strong>${market}${now}${tb.total != null ? ` · final ${tb.total}` : ''}.</p>`;
}

function leaderboard(ranked, me) {
  const top = ranked.slice(0, 10);
  if (!top.includes(me)) top.push(me);
  const rows = top.map((e) => `
    <tr class="${e === me ? 'is-me' : ''}">
      <td>${e.rank}</td>
      <td class="st-name">${esc(e.nick || e.name || `#${e.entry}`)}</td>
      <td>${e.correct}</td>
      <td>${e.winningNow}</td>
      <td>${e.max}</td>
      <td>${e.mnf ?? '—'}</td>
    </tr>`).join('');
  return `
    <h4 class="st-sub">Leaderboard</h4>
    <div class="st-tablewrap"><table class="st-table">
      <thead><tr><th>#</th><th>Entry</th><th>Right</th><th>Winning</th><th>Max</th><th>MNF</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/* ── Suicide ──────────────────────────────────────────────────────────── */

function survivorSection(live) {
  if (!S.survivor) {
    return card("Mike's suicide pool", 'Waiting on the sheet',
      '<p class="lede">Run <code>scripts/parse_survivor.py</code> on Mike\'s Suicide workbook.</p>');
  }
  const byTeam = new Map();
  for (const g of live) { byTeam.set(g.awayAbbr, g); byTeam.set(g.homeAbbr, g); }
  const wk = survivorWeek(S.survivor.entries, S.week, byTeam);
  if (!wk.total) {
    return card("Mike's suicide pool", `Week ${S.week}`, `<p class="lede">No Week ${S.week} picks in the sheet yet.</p>`);
  }

  const mineEntry = S.survivor.entries.find((e) => String(e.nick).trim() === MY_NICK);
  const myTeam = mineEntry?.picks?.[String(S.week)];
  const myRow = wk.teams.find((t) => t.team === myTeam);
  const label = {
    won: 'Won', lost: 'Lost', tie: 'Tied (counts as a loss?)', leading: 'Winning', trailing: 'Losing', tied: 'Tied', pre: 'Not started',
  };

  const mine = myRow
    ? `<p class="st-verdict-row"><span class="st-verdict ${myRow.status === 'won' ? 'is-win' : myRow.status === 'lost' ? 'is-out' : 'is-alive'}">
        Your pick ${esc(ABBR_TO_MASCOT[myTeam] || myTeam)}: ${label[myRow.status]}${scoreText(myRow)}</span></p>`
    : '<p class="st-note">No pick found for you this week.</p>';

  const teamRows = wk.teams.map((t) => `
    <tr class="st-s-${t.status}${t.team === myTeam ? ' is-me' : ''}">
      <td class="st-name">${esc(ABBR_TO_MASCOT[t.team] || t.team)}</td>
      <td>${t.count}</td>
      <td>${Math.round((100 * t.count) / wk.total)}%</td>
      <td>${label[t.status]}${scoreText(t)}</td>
    </tr>`).join('');

  return card("Mike's suicide pool", `Week ${S.week}: ${wk.total} entries`, `
    ${mine}
    <div class="st-stats">
      <div><strong>${wk.won}</strong><span>survived</span></div>
      <div><strong>${wk.lost}</strong><span>out</span></div>
      <div><strong>${wk.playing}</strong><span>playing now</span></div>
      <div><strong>${wk.notStarted}</strong><span>not started</span></div>
    </div>
    <p class="st-note">Whatever happens next, between <strong>${wk.floor}</strong> and <strong>${wk.ceiling}</strong> of ${wk.total} get through Week ${S.week}.</p>
    <div class="st-tablewrap"><table class="st-table">
      <thead><tr><th>Team</th><th>Entries</th><th>Share</th><th>Status</th></tr></thead>
      <tbody>${teamRows}</tbody>
    </table></div>`);
}

function scoreText(t) {
  const g = t.game;
  if (!g || g.state === 'pre') return '';
  const us = t.side === 'away' ? g.awayScore : g.homeScore;
  const them = t.side === 'away' ? g.homeScore : g.awayScore;
  return ` ${us}–${them}${g.state === 'in' ? ` · Q${g.period > 4 ? 'OT' : g.period}` : ''}`;
}

/* ── Bits ─────────────────────────────────────────────────────────────── */

function card(eyebrow, title, body) {
  return `
    <section class="card st-card">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h3>${esc(title)}</h3>
      ${body}
    </section>`;
}

/** Same seed, same draws: the percentage only moves when a score does. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
