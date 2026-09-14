/* ==========================================================================
   Standings — how I am doing against Mike's pools, live, while the week's
   games are still being played.

   Answers the Sunday question the rest of the site could not: "with the 4pm,
   the night game and Monday still to go, can I still win this week, and what
   do I need?" The math is in js/liveModel.js; this file fetches and draws.

   TWO PANELS, ONE MODULE. Standings used to be one panel reached from both
   nav rows, and it rendered both halves on both -- so Season Long showed the
   suicide pool and Survivor showed the pick'em. Since 2026-09-14 each row has
   its own panel and `initStandings(root, season, mode)` builds an independent
   instance for each:

     mode 'season'    Mike's pick'em            (panel-standings)
     mode 'survivor'  Mike's suicide pool       (panel-survivor-standings)

   Every instance owns its own state and its own polling timer, closed over
   below. They share no module-level state on purpose: two timers writing one
   object reads fine and misbehaves once. Feeds are memoized by loadJSON in
   data.js, so a second instance costs no extra network.

   THE WEEK. Each panel carries a week dropdown, defaulting to poolWeek() from
   js/poolWeek.js: a week stays the default until 6pm the Wednesday after its
   last game, NOT gameState.currentWeek(), which would swap Monday night's
   settled standings for an empty week a few hours after the final whistle.
   The dropdown offers every week from 1 to that default -- never a future
   week, which would only ever say "waiting". The choice is deliberately not
   remembered: a Week 3 left selected would still be on screen in December.
   The header (with the dropdown) is drawn once and only the body re-renders
   on a poll, so a live-score refresh never snaps an open dropdown shut.

   The survivor half renders the pick board from js/survivorPicks.js -- the
   format that used to sit under the Grid -- with the summary boxes above it.
   The Grid no longer carries the board.

   PRE-GAME PRICES ONLY. The odds bot keeps snapshotting during games, and a
   snapshot taken at 2:30pm is an in-play price that already knows the score.
   Feeding that to liveProb(), which adds the score itself, would count the
   lead twice -- so each game uses the last snapshot taken BEFORE kickoff.

   Polls on the Schedule tab's policy: only while THIS instance's panel is
   showing, the browser tab is in front, and a game is live or about to be.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import {
  getSchedule, tryNumberMap, scoredGames, getSurvivor,
  getOddsSnapshot, getOddsHistory,
} from './data.js';
import { loadWeek, currentWeek, anyLive, msToNextKickoff } from './gameState.js';
import { poolWeek } from './poolWeek.js';
import { buildSeasonOddsIndex, matchSeasonOdds, orientProbs } from './oddsMatch.js';
import { clearScoreboardCache } from './espn.js';
import { ABBR_TO_MASCOT } from './teams.js';
import { getIdentity } from './teamIdentity.js';
import { renderPickBoard } from './survivorPicks.js';
import {
  slateRows, scoreEntries, rankNow, bestCase, winChance, survivorWeek, fractionLeft,
} from './liveModel.js';

/* Which entry is mine in Mike's files. Both workbooks list it by this
   nickname (#238 pick'em, #208 suicide in 2026). */
const MY_NICK = 'Bova';

const POLL_MS = 25_000;
const PREKICK_MS = 15 * 60 * 1000;

/* The suicide pool as the pick board expects a league: a name for the empty
   states, and `live: false` because it is parsed from the mailed workbook
   rather than refreshed from Sleeper. */
const MIKE_SUICIDE = { id: 'mike', name: "Mike's Suicide League", live: false };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const pct = (p) => (p == null ? '—' : p >= 0.995 && p < 1 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);
const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`;

/* ── Boot ─────────────────────────────────────────────────────────────── */

/**
 * @param {HTMLElement} root
 * @param {number} season
 * @param {'season'|'survivor'} mode  which row's standings this instance draws
 */
export async function initStandings(root, season, mode) {
  if (!root) return;

  const S = {
    root, mode, season,
    panel: root.closest('.panel'),
    week: null, weeks: [], defaultWeek: null, body: null, odds: null, loadSeq: 0,
    schedule: null, map: null, cards: null, survivor: null, identity: null,
    prices: new Map(), totals: new Map(),
    view: null, timer: null, busy: false, again: false,
  };

  const [schedule, map, survivor, odds, identity] = await Promise.all([
    getSchedule(season),
    mode === 'season' ? tryNumberMap(season) : null,
    mode === 'survivor' ? getSurvivor(season) : null,
    mode === 'season' ? getOddsSnapshot() : null,
    mode === 'survivor' ? getIdentity() : null,
  ]);
  S.schedule = schedule;
  S.map = map && Number(map.year) === Number(season) ? map : null;
  S.survivor = survivor && Number(survivor.year) === Number(season) ? survivor : null;
  S.identity = identity;
  S.odds = odds;

  if (!schedule?.games?.length) {
    root.innerHTML = head(S) + '<p class="lede">No schedule loaded for this season.</p>';
    return;
  }
  S.defaultWeek = poolWeek(schedule) ?? currentWeek(schedule);
  S.week = S.defaultWeek;
  S.weeks = [...new Set(schedule.games.map((g) => Number(g.week)))]
    .filter((w) => Number.isFinite(w) && w <= S.defaultWeek)
    .sort((a, b) => a - b);

  root.innerHTML = head(S) + '<div data-st="body"></div>';
  S.body = root.querySelector('[data-st="body"]');
  await loadWeekData(S);

  const showing = () => !document.hidden && S.panel && !S.panel.hidden;

  const stop = () => {
    if (S.timer) clearTimeout(S.timer);
    S.timer = null;
  };

  const schedulePoll = () => {
    stop();
    if (!S.view || !showing()) return;
    const next = msToNextKickoff(S.view.games);
    if (anyLive(S.view.games) || (next != null && next <= PREKICK_MS)) {
      S.timer = setTimeout(() => refresh(), POLL_MS);
    }
  };

  async function refresh(force = false) {
    if (S.busy) { S.again = S.again || force; return; }
    S.busy = true;
    const week = S.week;
    try {
      const view = await loadWeek(S.season, week, { live: true, maxAgeMs: force ? 0 : POLL_MS });
      // The week was switched mid-fetch: this answer is for the old one.
      if (week === S.week) {
        S.view = view;
        render(S);
      }
    } finally {
      S.busy = false;
    }
    if (week !== S.week || S.again) {
      S.again = false;
      return refresh(true);
    }
    schedulePoll();
  }

  const onShow = () => (showing() ? refresh() : stop());

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-st="refresh"]')) { clearScoreboardCache(); refresh(true); }
  });
  root.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-st="week"]')) return;
    const week = Number(e.target.value);
    if (!Number.isFinite(week) || week === S.week) return;
    stop();
    S.week = week;
    S.view = null;
    S.body.innerHTML = `<p class="lede">Loading Week ${week}…</p>`;
    const seq = await loadWeekData(S);
    // A second switch while this one was loading wins; drop the stale one.
    if (seq === S.loadSeq) refresh(true);
  });
  document.addEventListener('visibilitychange', onShow);
  document.addEventListener('panelchange', onShow);
  await refresh(true);
}

/** Everything that depends on the selected week, reloaded on a switch.
 *  Prices are keyed by team pair, and a division rivalry repeats a pair
 *  across weeks, so both maps start empty for every week. Returns this
 *  load's sequence number so a caller can tell whether it is still current. */
async function loadWeekData(S) {
  const seq = ++S.loadSeq;
  if (S.mode !== 'season') return seq;
  const prices = new Map();
  const totals = new Map();
  const [cards] = await Promise.all([
    loadCards(S.season, S.week),
    loadPrices({ ...S, prices, totals }, S.odds),
  ]);
  if (seq === S.loadSeq) {
    S.cards = cards;
    S.prices = prices;
    S.totals = totals;
  }
  return seq;
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
async function loadPrices(S, odds) {
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

/* ── Render ───────────────────────────────────────────────────────────── */

function head(S) {
  const weeks = S.weeks.length ? S.weeks : [S.week].filter(Boolean);
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">${S.mode === 'survivor' ? "Mike's suicide pool" : "Mike's pick'em"} · live</p>
        <h2>Standings</h2>
      </div>
      <button type="button" class="btn btn-ghost" data-st="refresh">Refresh</button>
    </div>
    ${weeks.length ? `
      <label class="st-weekpick">
        <span>Week</span>
        <select data-st="week">
          ${weeks.map((w) => `
            <option value="${w}"${w === S.week ? ' selected' : ''}>Week ${w}${w === S.defaultWeek ? ' — this week' : ''}</option>`).join('')}
        </select>
      </label>` : ''}`;
}

function render(S) {
  const live = S.view.games;
  const updated = S.view.fetchedAt
    ? `Scores as of ${new Date(S.view.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'Scores from the committed schedule (live feed unavailable)';

  S.body.innerHTML = `
    <p class="lede">Week ${S.week} · ${esc(updated)}</p>
    ${S.mode === 'survivor' ? survivorSection(S, live) : pickemSection(S, live)}`;
}

/* ── Pick'em ──────────────────────────────────────────────────────────── */

function pickemSection(S, live) {
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
      <td class="st-num">${e.rank}</td>
      <td class="st-name"><span>${esc(e.nick || e.name || `#${e.entry}`)}</span></td>
      <td class="st-num">${e.correct}</td>
      <td class="st-num">${e.winningNow}</td>
      <td class="st-num">${e.max}</td>
      <td class="st-num">${e.mnf ?? '—'}</td>
    </tr>`).join('');
  return `
    <h4 class="st-sub">Leaderboard</h4>
    <div class="st-tablewrap"><table class="st-table">
      <thead><tr>
        <th class="st-num">#</th><th>Entry</th><th class="st-num">Right</th>
        <th class="st-num">Winning</th><th class="st-num">Max</th><th class="st-num">MNF</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/* ── Suicide ──────────────────────────────────────────────────────────── */

const SURVIVOR_LABEL = {
  won: 'Won', lost: 'Lost', tie: 'Tied (counts as a loss?)',
  leading: 'Winning', trailing: 'Losing', tied: 'Tied', pre: 'Not started',
};

function survivorSection(S, live) {
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

  const mine = myRow
    ? `<p class="st-verdict-row"><span class="st-verdict ${myRow.status === 'won' ? 'is-win' : myRow.status === 'lost' ? 'is-out' : 'is-alive'}">
        Your pick ${esc(ABBR_TO_MASCOT[myTeam] || myTeam)}: ${SURVIVOR_LABEL[myRow.status]}${scoreText(myRow)}</span></p>`
    : '<p class="st-note">No pick found for you this week.</p>';

  // What happened to each team's game, for the board's status line. Built
  // from the same survivorWeek() result the boxes above are counted from, so
  // the two can never disagree about who survived.
  const status = new Map(wk.teams.map((t) => [t.team, {
    text: statusText(t),
    tone: t.status === 'won' ? 'won'
      : t.status === 'lost' || t.status === 'tie' ? 'lost'
        : t.status === 'pre' ? 'pre' : 'live',
  }]));

  // renderPickBoard into a detached element rather than pickBoardHtml(): the
  // older export name is the one a cached copy of survivorPicks.js is sure to
  // have -- see the note on renderPickBoard. A cached copy also ignores
  // `status` and `embedded`, which costs the status line for a few minutes
  // rather than the page.
  const host = document.createElement('div');
  renderPickBoard(host, {
    feed: S.survivor,
    season: S.season,
    league: MIKE_SUICIDE,
    identity: S.identity,
    week: S.week,
    mine: mineEntry ? { picks: mineEntry.picks } : null,
    status,
    embedded: true,
  });
  const board = host.innerHTML;

  return card("Mike's suicide pool", `Week ${S.week}: ${wk.total} entries`, `
    ${mine}
    <div class="st-stats">
      <div><strong>${wk.won}</strong><span>survived</span></div>
      <div><strong>${wk.lost}</strong><span>out</span></div>
      <div><strong>${wk.playing}</strong><span>playing now</span></div>
      <div><strong>${wk.notStarted}</strong><span>not started</span></div>
    </div>
    <p class="st-note">Whatever happens next, between <strong>${wk.floor}</strong> and <strong>${wk.ceiling}</strong> of ${wk.total} get through Week ${S.week}.</p>
    ${board}`);
}

/** A team's game as one short line: the result and score once it has
 *  started, the kickoff before. */
function statusText(t) {
  if (t.status === 'pre') {
    const k = t.game?.kickoff;
    return k
      ? new Date(k).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : SURVIVOR_LABEL.pre;
  }
  return `${SURVIVOR_LABEL[t.status]}${scoreText(t)}`;
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
