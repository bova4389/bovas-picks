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

     mode 'season'    Mike's pick'em, Infinity War           (panel-standings)
     mode 'survivor'  Mike's suicide pool, Poop, Deadpool    (panel-survivor-standings)

   THE SLEEPER CARDS (Infinity War, Poop, Deadpool; added 2026-09-14) read the
   pool copy cached by the Grid / Infinity War tabs, and carry their own
   "Refresh from Sleeper" button that runs the SAME fetch and cache functions
   those tabs use -- so on a phone on a Sunday nobody has to leave Standings to
   update a pool. A survivor refresh also folds my picks into that pool's
   league state, exactly as the Grid's refresh does. Without a usable token a
   card shows the Connect Sleeper box instead of numbers; a pool that has never
   been fetched shows no numbers either. Never a half-read pool as the pool.

   Other entrants' picks only exist in the cache for games that had kicked off
   at the last refresh (the kickoff gate), so every Sleeper card says how many
   picks are still hidden and treats its counts as counts of what is visible.

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

   PAYOUTS AND "ALL WEEKS" (2026-09-14). Prize money comes from the
   hand-kept data/payouts-<year>.json. Every card carries a payout line, and
   the week dropdown's "All weeks" option swaps the week's cards for season
   views: Mike's pick'em and Infinity War as year-to-date tables (correct,
   weeks won, money), each survivor pool as a burn matrix of the teams it has
   spent. The season is graded here, from ESPN scores, week by week -- it does
   not wait on scripts/grade_week.py -- and money is counted only for a week
   whose every game is final. The math is in js/payouts.js.

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
import { LEAGUES, loadLeagueState, saveLeagueState } from './survivorLeagues.js';
import {
  fetchSleeperSurvivor, loadCachedFeed, saveCachedFeed, mergeMyPicks, freshness,
} from './sleeperSurvivor.js';
import { fetchInfinityPool, loadCachedPool, saveCachedPool } from './infinityFeed.js';
import { POOL as INFINITY } from './infinityWar.js';
import { getToken, tokenInfo, mountConnectBoxes, hasSharedFeed } from './sleeperAuth.js';
import {
  teamIndex, gradePickemWeek, weekPrize, survivorCoverage,
} from './standingsModel.js';
import {
  entryKey, pickemWeekResult, seasonTable, paidSoFar, potOf, burnMatrix, outcomeMap, money,
} from './payouts.js';
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
    poolBusy: new Set(), poolMsg: new Map(),
    payouts: null, allWeeks: false, ytd: null, ytdBusy: false, ytdAgain: false,
    cardCache: new Map(), weekViews: new Map(),
  };

  const [schedule, map, survivor, odds, identity, payouts] = await Promise.all([
    getSchedule(season),
    mode === 'season' ? tryNumberMap(season) : null,
    mode === 'survivor' ? getSurvivor(season) : null,
    mode === 'season' ? getOddsSnapshot() : null,
    mode === 'survivor' ? getIdentity() : null,
    loadPayouts(season),
  ]);
  S.payouts = payouts;
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
        updateSeason(S);
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
    const poolBtn = e.target.closest('[data-st-pool]');
    if (poolBtn) refreshPool(poolBtn.dataset.stPool);
  });

  /* One Sleeper pool, on request. The same fetch + cache calls the Grid and
     Infinity War tabs make; a failure keeps the last good copy and says why. */
  async function refreshPool(id) {
    if (S.poolBusy.has(id)) return;
    S.poolBusy.add(id);
    S.poolMsg.delete(id);
    if (S.view) render(S);
    try {
      if (id === INFINITY.id) {
        saveCachedPool(S.season, id, await fetchInfinityPool(INFINITY.sleeper, S.season));
      } else {
        const league = LEAGUES.find((l) => l.id === id);
        if (!league?.sleeper) return;
        const feed = await fetchSleeperSurvivor(league.sleeper, S.season);
        saveCachedFeed(S.season, id, feed);
        saveLeagueState(id, S.season, mergeMyPicks(loadLeagueState(id, S.season), feed));
      }
    } catch (err) {
      S.poolMsg.set(id, `Couldn't refresh — ${err.message}.`);
    } finally {
      S.poolBusy.delete(id);
      if (S.view) render(S);
      updateSeason(S);
    }
  }

  // Connecting or disconnecting anywhere on the site changes what the Sleeper
  // cards can show.
  window.addEventListener('sleeperauth', () => { if (S.view) render(S); updateSeason(S); });
  root.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-st="week"]')) return;
    // "All weeks" keeps the CURRENT week loaded underneath, so live polling
    // and the in-progress week's numbers carry on while the season shows.
    const all = e.target.value === 'all';
    const week = all ? S.defaultWeek : Number(e.target.value);
    if (!Number.isFinite(week)) return;
    const was = S.allWeeks;
    S.allWeeks = all;
    if (week === S.week) {
      if (was !== all && S.view) { render(S); updateSeason(S); }
      return;
    }
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
          <option value="all"${S.allWeeks ? ' selected' : ''}>All weeks</option>
          ${weeks.map((w) => `
            <option value="${w}"${!S.allWeeks && w === S.week ? ' selected' : ''}>Week ${w}${w === S.defaultWeek ? ' — this week' : ''}</option>`).join('')}
        </select>
      </label>` : ''}`;
}

function render(S) {
  const live = S.view.games;
  const updated = S.view.fetchedAt
    ? `Scores as of ${new Date(S.view.fetchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'Scores from the committed schedule (live feed unavailable)';

  if (S.allWeeks) {
    S.body.innerHTML = `
      <p class="lede">Season to date · ${esc(updated)}</p>
      ${S.mode === 'survivor' ? allSurvivor(S) : allPickem(S) + allInfinity(S)}`;
    mountConnectBoxes(S.body);
    return;
  }

  S.body.innerHTML = `
    <p class="lede">Week ${S.week} · ${esc(updated)}</p>
    ${S.mode === 'survivor'
      ? survivorSection(S, live)
        + LEAGUES.filter((l) => l.sleeper).map((l) => sleeperSurvivorCard(S, l, live)).join('')
      : pickemSection(S, live) + infinityCard(S, live)}`;
  mountConnectBoxes(S.body);
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
    <p class="st-verdict-row">${verdict}${sim ? ` <span class="st-chance">≈ ${finePct(sim.chance)} to win</span>` : ''}</p>
    <p class="st-note">${esc(bestLine)} Leader has ${leaderCorrect} correct.</p>
    ${sim ? `<p class="st-note st-fine">The percentage is an estimate: pre-game prices${priced < open ? ` (${open - priced} of ${open} games unpriced, treated as coin flips)` : ''}, adjusted for the current score and time left, ties split.</p>` : ''}`;

  const pool = S.payouts?.pools?.['mike-pickem'];
  const result = pool ? pickemWeekResult(scored, rows, pool.weekly) : null;
  const mineYtd = S.ytd?.pickem?.table?.find((r) => r.isMe) || null;
  const pay = pool ? payLines([
    result.complete
      ? `Week ${S.week} prize <strong>${money(pool.weekly)}</strong>: ${esc(listNames(result.winners.map((e) => nameOf(e))))}${result.winners.length > 1 ? ` (split, ${money(result.share)} each)` : ''}`
      : `Week ${S.week} prize <strong>${money(pool.weekly)}</strong> · leader${result.leaders.length > 1 ? 's' : ''} on ${result.top}: ${esc(listNames(result.leaders.map((e) => nameOf(e))))}`,
    mineYtd ? `Your season: <strong>${money(mineYtd.money)}</strong> · ${money(S.ytd.pickem.paid)} paid out so far` : '',
    `Season winner gets <strong>${money(pool.season)}</strong>`,
  ]) : '';

  return card("Mike's pick'em", `Week ${S.week}: you vs. ${field.length} others`, `
    ${summary}
    ${pay}
    ${weekGames(rows, me, sim, best.alive)}
    ${tiebreakerLine(me, tbRow, tb)}
    ${leaderboard(ranked, me)}`);
}

/* A pick is "must win" when losing it costs essentially all of the week --
   NOT when the simulation returns a bare zero. At 8,000 trials against a
   280-entry field, a branch worth 0.05% never lands once, so `ifMiss === 0`
   tagged Must win on nearly every open game the moment the week turned
   against us. A tag that fires everywhere says nothing, and it said it
   loudest in the week it mattered. Measured relative to the same game's
   winning branch, which is the comparison a reader is actually making. */
const MUST_WIN_FRAC = 0.05;
const BARELY_FRAC = 0.85;

/* Below the simulation's own resolution (1/8000) a probability is not zero,
   it is unresolved -- so it is printed as a bound, never as "0%". */
const finePct = (p) => {
  if (p == null) return '—';
  if (p < 0.001) return '<0.1%';
  if (p < 0.095) return `${(p * 100).toFixed(1)}%`;
  if (p >= 0.995 && p < 1) return '>99%';
  return `${Math.round(p * 100)}%`;
};

/* What my pick is doing right now, in the Picks tab's own chip vocabulary
   (.wc-res) so a result means the same thing on both tabs. Returns null
   before kickoff and for a game I have no pick in -- there is no result to
   state yet, and an empty chip reads as a missing one. */
function pickResult(r, myNum) {
  if (myNum == null) return null;
  const g = r.live;
  const mineIsAway = myNum === r.awayNum;
  if (r.decided) {
    const mine = mineIsAway ? g.awayScore : g.homeScore;
    const opp = mineIsAway ? g.homeScore : g.awayScore;
    if (r.tie) return { cls: 'is-tie', text: `Tied ${mine}–${opp}` };
    return r.winnerNum === myNum
      ? { cls: 'is-won', text: `Won ${mine}–${opp}` }
      : { cls: 'is-lost', text: `Lost ${mine}–${opp}` };
  }
  if (g?.state !== 'in') return null;
  const mine = mineIsAway ? g.awayScore : g.homeScore;
  const opp = mineIsAway ? g.homeScore : g.awayScore;
  if (mine > opp) return { cls: 'is-winning', text: `Winning ${mine}–${opp}` };
  if (mine < opp) return { cls: 'is-losing', text: `Losing ${mine}–${opp}` };
  return { cls: 'is-tie', text: `Tied ${mine}–${opp}` };
}

/* Every game on the card, not just the open ones. The old list filtered to
   `!r.decided`, so a finished game vanished off the page entirely and the
   only trace of how the week had gone was a pair of counters at the top --
   "which games am I winning or losing" had no answer anywhere. Kickoff order
   is kept rather than sorting live games to the top, because a list that
   reshuffles under your thumb every few minutes cannot be scanned. */
function weekGames(rows, me, sim, alive) {
  if (!rows.length) return '';
  const order = [...rows].sort((a, b) => (a.live?.kickoff || '').localeCompare(b.live?.kickoff || ''));
  const cond = new Map((sim?.games || []).map((g) => [g.row.awayNum, g]));
  const picks = new Set(me.picks);
  const tally = { won: 0, lost: 0, winning: 0, losing: 0 };

  const items = order.map((r) => {
    const myNum = picks.has(r.awayNum) ? r.awayNum : picks.has(r.homeNum) ? r.homeNum : null;
    const myTeam = myNum === r.awayNum ? r.away : myNum === r.homeNum ? r.home : null;
    const g = r.live;
    const c = cond.get(r.awayNum);
    const ifHit = c ? (myNum === r.awayNum ? c.ifAway : c.ifHome) : null;
    const ifMiss = c ? (myNum === r.awayNum ? c.ifHome : c.ifAway) : null;
    const pMine = myNum == null ? null : myNum === r.awayNum ? r.awayNow : 1 - r.awayNow;

    const res = pickResult(r, myNum);
    if (res) {
      if (res.cls === 'is-won') tally.won += 1;
      else if (res.cls === 'is-lost') tally.lost += 1;
      else if (res.cls === 'is-winning') tally.winning += 1;
      else if (res.cls === 'is-losing') tally.losing += 1;
    }

    /* Both branches unresolved means the simulation cannot separate them,
       which is not the same as "this one decides the week" -- so no tag. */
    let need = '';
    if (alive && myNum != null && c && ifHit != null && ifMiss != null && ifHit > 0) {
      if (ifMiss <= ifHit * MUST_WIN_FRAC) need = '<span class="st-tag is-must">Must win</span>';
      else if (ifMiss >= ifHit * BARELY_FRAC) need = '<span class="st-tag">Barely matters</span>';
    }

    const status = !g ? '' : g.state === 'post'
      ? `Final · ${esc(g.away)} ${g.awayScore}–${g.homeScore} ${esc(g.home)}`
      : g.state === 'in'
        ? `${esc(g.away)} ${g.awayScore}–${g.homeScore} ${esc(g.home)} · ${g.period > 4 ? 'OT' : `Q${g.period}`} ${esc(g.clock || '')}`
        : `${new Date(g.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;

    const pickLine = myTeam
      ? `Your pick: <strong>${esc(myTeam)}</strong>${res ? '' : ` · ${pct(pMine)} to win`} ${need}`
      : 'Not on your card';

    return `
      <li class="st-game${g?.state === 'in' ? ' is-live' : ''}${r.decided ? ' is-done' : ''}">
        <div class="st-game-top">
          <span class="st-matchup">${esc(r.away)} at ${esc(r.home)}${r.tiebreaker ? ' <span class="st-tag">Tiebreaker</span>' : ''}</span>
          <span class="st-status">${status}</span>
        </div>
        <div class="st-game-pick">
          ${res ? `<span class="st-res ${res.cls}">${esc(res.text)}</span> ` : ''}${pickLine}
        </div>
        ${c && myNum != null && !r.decided
          ? `<div class="st-swing">Your chance if ${esc(myTeam)} win: <strong>${finePct(ifHit)}</strong> · if they lose: <strong>${finePct(ifMiss)}</strong></div>`
          : ''}
      </li>`;
  }).join('');

  const counts = [
    tally.won ? `<span class="st-res is-won">${tally.won} won</span>` : '',
    tally.lost ? `<span class="st-res is-lost">${tally.lost} lost</span>` : '',
    tally.winning ? `<span class="st-res is-winning">${tally.winning} winning</span>` : '',
    tally.losing ? `<span class="st-res is-losing">${tally.losing} losing</span>` : '',
  ].filter(Boolean).join(' ');

  return `<h4 class="st-sub">Your week, game by game</h4>${counts ? `<p class="st-tally">${counts}</p>` : ''}<ul class="st-games">${items}</ul>`;
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
    ${potLine(S, 'mike-suicide')}
    ${board}`);
}

/* ── Sleeper pools ────────────────────────────────────────────────────── */

/** A token that can actually be sent: present and not expired. */
const connected = () => Boolean(getToken()) && !tokenInfo()?.expired;

/** Pool numbers can be shown: this device is connected, or the shared feed
 *  (the GitHub job's copy, js/sharedFeeds.js) loaded. Refresh then re-reads
 *  that copy rather than failing. */
const readable = () => connected() || hasSharedFeed();

/** The strip under a Sleeper card: when the copy is from, the Refresh
 *  button, any error, and the Connect box when there is no usable token. */
function poolFoot(S, id, feed) {
  const busy = S.poolBusy.has(id);
  const msg = S.poolMsg.get(id);
  const button = readable()
    ? `<button type="button" class="btn btn-ghost" data-st-pool="${esc(id)}"${busy ? ' disabled' : ''}>${busy ? 'Refreshing…' : 'Refresh from Sleeper'}</button>`
    : '';
  return `
    <div class="st-pool-foot">
      <span class="st-note">Picks from Sleeper, ${esc(freshness(feed))}.</span>
      ${button}
    </div>
    ${msg ? `<p class="st-note st-err" role="alert">${esc(msg)}</p>` : ''}
    ${connected() ? '' : '<div class="st-connect" data-sl-connect></div>'}`;
}

/** The card body when there is nothing trustworthy to count. */
function poolEmpty(S, id, feed, what) {
  const lead = !readable()
    ? `Connect Sleeper to read ${what}. Until then there are no numbers to show.`
    : !feed
      ? `Nothing fetched from Sleeper for ${what} on this device yet.`
      : `No Week ${S.week} picks in ${what} yet.`;
  return `<p class="lede">${esc(lead)}</p>${poolFoot(S, id, feed)}`;
}

function sleeperSurvivorCard(S, league, live) {
  const feed = loadCachedFeed(S.season, league.id);
  if (!feed || !readable()) {
    return card(league.name, `Week ${S.week}`, poolEmpty(S, league.id, feed, league.name));
  }

  const wk = survivorWeek(feed.entries || [], S.week, teamIndex(live));
  const cov = survivorCoverage(feed, S.week);
  if (!wk.total && !cov.hidden) {
    return card(league.name, `Week ${S.week}`, poolEmpty(S, league.id, feed, league.name));
  }

  const meEntry = (feed.entries || []).find((e) => e.isMe);
  const myTeam = meEntry?.picks?.[String(S.week)];
  const myRow = wk.teams.find((t) => t.team === myTeam);
  const tone = myRow?.status === 'won' ? 'is-win' : myRow?.status === 'lost' ? 'is-out' : 'is-alive';
  const mine = myRow
    ? `<p class="st-verdict-row"><span class="st-verdict ${tone}">
        Your pick ${esc(ABBR_TO_MASCOT[myTeam] || myTeam)}: ${SURVIVOR_LABEL[myRow.status]}${scoreText(myRow)}</span></p>`
    : '<p class="st-note">No pick from you found for this week.</p>';

  // Mid-week the counts are of the picks the gate has released, not the pool,
  // and the floor/ceiling line would be a claim about people we cannot see.
  const gate = cov.hidden
    ? `<p class="st-note"><strong>${cov.hidden}</strong> ${cov.hidden === 1 ? 'pick is' : 'picks are'} still hidden until kickoff (as of the last refresh), so the counts above are of the ${wk.total} visible.</p>`
    : `<p class="st-note">Whatever happens next, between <strong>${wk.floor}</strong> and <strong>${wk.ceiling}</strong> of ${wk.total} get through Week ${S.week}.</p>`;

  const status = new Map(wk.teams.map((t) => [t.team, {
    text: statusText(t),
    tone: t.status === 'won' ? 'won'
      : t.status === 'lost' || t.status === 'tie' ? 'lost'
        : t.status === 'pre' ? 'pre' : 'live',
  }]));
  const host = document.createElement('div');
  renderPickBoard(host, {
    feed, season: S.season, league, identity: S.identity, week: S.week,
    mine: meEntry ? { picks: meEntry.picks } : null, status, embedded: true,
  });

  return card(league.name, `Week ${S.week}: ${cov.expected || wk.total} entries`, `
    ${mine}
    <div class="st-stats">
      <div><strong>${wk.won}</strong><span>survived</span></div>
      <div><strong>${wk.lost}</strong><span>lost</span></div>
      <div><strong>${wk.playing}</strong><span>playing now</span></div>
      <div><strong>${wk.notStarted + cov.hidden}</strong><span>not started</span></div>
    </div>
    ${gate}
    ${potLine(S, league.id)}
    ${host.innerHTML}
    ${poolFoot(S, league.id, feed)}`);
}

function infinityCard(S, live) {
  const id = INFINITY.id;
  const feed = loadCachedPool(S.season, id);
  if (!feed || !readable()) {
    return card(INFINITY.name, `Week ${S.week}`, poolEmpty(S, id, feed, INFINITY.name));
  }
  const limit = Number(feed.settings?.weeklyPickLimit) || 8;
  const rows = gradePickemWeek(feed.entries || [], S.week, teamIndex(live), limit);
  const wkInfo = feed.weeks?.[String(S.week)] || null;
  const locked = Number(wkInfo?.locked) || 0;
  if (!rows.some((r) => r.visible) && !locked) {
    return card(INFINITY.name, `Week ${S.week}`, poolEmpty(S, id, feed, INFINITY.name));
  }

  const me = rows.find((r) => r.isMe) || null;
  // A previous week's rolled-over pot rides on this one (see pickemSeason).
  const weekly = S.ytd?.infinity?.weeks?.find((w) => w.week === S.week)?.pot
    ?? INFINITY.economics?.weekly ?? 20;
  const prize = weekPrize(rows, live, weekly);
  const ahead = me ? rows.filter((r) => r.correct > me.correct).length : 0;
  const tied = me ? rows.filter((r) => r.correct === me.correct).length : 0;

  let prizeBox;
  let verdict;
  if (prize.final) {
    // Never split: one winner, a rollover, or a tie the cached pool can't break yet.
    const winner = prize.winners[0] || null;
    const tbNote = prize.leaders.length > 1 && prize.total != null
      ? ` · ${prize.leaders.length}-way tie at ${prize.top}, Monday total ${prize.total}${winner?.tiebreaker ? `, guess ${winner.tiebreaker.guess}` : ''}`
      : '';
    prizeBox = prize.rollover ? 'Rolls over' : prize.needsTiebreak ? 'Tied' : prize.meIn ? `$${fmtMoney(prize.share)}` : '$0';
    verdict = prize.rollover
      ? `<span class="st-verdict is-alive">Tied on picks and on the tiebreaker: the $${weekly} rolls to next week</span>`
      : prize.needsTiebreak
        ? `<span class="st-verdict is-alive">${prize.leaders.length}-way tie at ${prize.top}. Refresh from Sleeper to read the tiebreaker guesses.</span>`
        : prize.meIn
          ? `<span class="st-verdict is-win">You won the $${weekly}${esc(tbNote)}</span>`
          : `<span class="st-verdict is-out">$${weekly} to ${esc(winner ? winner.name : 'nobody')}${esc(tbNote)}</span>`;
  } else if (!me) {
    prizeBox = '—';
    verdict = '<span class="st-note">Your card is not in this copy of the pool.</span>';
  } else {
    prizeBox = prize.meIn ? 'Leading' : prize.meAlive ? 'Alive' : 'Out';
    verdict = prize.meIn
      ? `<span class="st-verdict is-alive">${prize.leaders.length > 1 ? `Tied for the lead (${prize.leaders.length})` : `Leading for the $${weekly}`}</span>`
      : prize.meAlive
        ? `<span class="st-verdict is-alive">Still alive for the $${weekly}</span>`
        : `<span class="st-verdict is-out">Can't reach the $${weekly} — leader has ${prize.top}</span>`;
  }

  const gate = locked
    ? `<p class="st-note"><strong>${locked}</strong> picks were still hidden until kickoff at the last refresh, so other entries' open picks are not shown. <strong>Max</strong> assumes a full card of ${limit}.</p>`
    : '';

  const body = rows.map((r) => `
    <tr class="${r.isMe ? 'is-me' : ''}">
      <td class="st-num">${r.rank}</td>
      <td class="st-name"><span>${esc(r.name)}</span></td>
      <td class="st-num">${r.correct}</td>
      <td class="st-num">${r.winning}</td>
      <td class="st-num">${r.max}</td>
    </tr>`).join('');

  const stats = me ? `
    <div class="st-stats">
      <div><strong>${me.correct}</strong><span>correct</span></div>
      <div><strong>${me.winning}</strong><span>winning now</span></div>
      <div><strong>${ordinal(ahead + 1)}</strong><span>of ${rows.length}${tied > 1 ? ` (${tied} tied)` : ''}</span></div>
      <div><strong>${prizeBox}</strong><span>week's $${weekly}</span></div>
    </div>` : '';

  return card(INFINITY.name, `Week ${S.week}: ${rows.length} entries`, `
    ${stats}
    <p class="st-verdict-row">${verdict}</p>
    ${infinityPay(S)}
    ${gate}
    <h4 class="st-sub">This week</h4>
    <div class="st-tablewrap"><table class="st-table">
      <thead><tr>
        <th class="st-num">#</th><th>Entry</th><th class="st-num">Right</th>
        <th class="st-num">Winning</th><th class="st-num">Max</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    ${poolFoot(S, id, feed)}`);
}

const fmtMoney = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/* ── Payouts ──────────────────────────────────────────────────────────── */

async function loadPayouts(season) {
  try {
    const res = await fetch(`data/payouts-${season}.json`);
    if (!res.ok) return null;
    const data = await res.json();
    return Number(data.year) === Number(season) ? data : null;
  } catch {
    return null;
  }
}

const nameOf = (e) => (String(e.nick || '').trim() === MY_NICK ? 'you' : e.nick || e.name || `#${e.entry}`);

/** "A, B and 3 more" -- a leader list that cannot swallow the card. */
function listNames(names, max = 3) {
  const list = names.slice(0, max).join(', ');
  return names.length > max ? `${list} and ${names.length - max} more` : list;
}

/** A short run of payout facts under a card's summary boxes. */
function payLines(lines) {
  const items = lines.filter(Boolean);
  return items.length ? `<ul class="st-pay">${items.map((l) => `<li>${l}</li>`).join('')}</ul>` : '';
}

function potLine(S, id) {
  const pool = S.payouts?.pools?.[id];
  const pot = potOf(pool);
  if (!pot) return '';
  const detail = pot.buybacks
    ? ` (${money(pot.base)} + ${pot.buybacks} buy-back${pot.buybacks === 1 ? '' : 's'})`
    : '';
  return payLines([
    `Pot <strong>${money(pot.total)}</strong>${detail}${pool.winnerTakeAll ? ' · winner take all' : ''} · paid when the pool ends`,
  ]);
}

function infinityPay(S) {
  const pool = S.payouts?.pools?.infinity;
  if (!pool) return '';
  const ytd = S.ytd?.infinity;
  const me = ytd?.table?.find((r) => r.isMe) || null;
  return payLines([
    me ? `Your season: <strong>${money(me.money)}</strong> · ${money(ytd.paid)} paid out so far` : '',
    `Season prizes: <strong>${money(pool.season?.first)}</strong> 1st · <strong>${money(pool.season?.second)}</strong> 2nd`,
  ]);
}

/* ── The season, graded week by week ─────────────────────────────────────
   Recomputed after every refresh, pool refresh and connection change. Past
   weeks' scores come through loadWeek's own cache and cards through
   S.cardCache, so a 25-second live poll re-reads almost nothing. A second
   request while one is running is folded into one more pass afterward. */

async function updateSeason(S) {
  if (S.ytdBusy) { S.ytdAgain = true; return; }
  S.ytdBusy = true;
  try {
    S.ytd = await computeSeason(S);
    if (S.view) render(S);
  } catch (err) {
    console.warn('standings: season view failed', err);
  } finally {
    S.ytdBusy = false;
  }
  if (S.ytdAgain) {
    S.ytdAgain = false;
    updateSeason(S);
  }
}

/** One week's scores: the live view for the week on screen, else a cached read. */
async function viewFor(S, week) {
  if (week === S.week && S.view) return S.view;
  const cached = S.weekViews.get(week);
  if (cached && Date.now() - cached.at < 10 * 60e3) return cached.view;
  const view = await loadWeek(S.season, week, { live: true, maxAgeMs: 10 * 60e3 });
  S.weekViews.set(week, { at: Date.now(), view });
  return view;
}

async function cardsFor(S, week) {
  if (week === S.week && S.cards) return S.cards;
  if (!S.cardCache.has(week)) S.cardCache.set(week, await loadCards(S.season, week));
  return S.cardCache.get(week);
}

async function computeSeason(S) {
  const weeks = S.weeks.length ? S.weeks : [S.defaultWeek];
  const views = new Map(await Promise.all(weeks.map(async (w) => [w, await viewFor(S, w)])));
  return S.mode === 'survivor' ? survivorSeason(S, weeks, views) : pickemSeason(S, weeks, views);
}

async function pickemSeason(S, weeks, views) {
  const out = {};

  // Mike's weekly pool: one card file per week, graded against that week's scores.
  const pool = S.payouts?.pools?.['mike-pickem'];
  if (S.map && pool) {
    const graded = [];
    const missing = [];
    for (const w of weeks) {
      const cards = await cardsFor(S, w);
      if (!cards) { missing.push(w); continue; }
      const games = views.get(w)?.games || [];
      const rows = slateRows(scoredGames(S.map, w), new Map(games.map((g) => [`${g.away}|${g.home}`, g])), new Map());
      const scored = scoreEntries(cards.entries.map((e) => ({ ...e, mnf: typeof e.mnf === 'number' ? e.mnf : null })), rows);
      const res = pickemWeekResult(scored, rows, pool.weekly);
      graded.push({
        week: w,
        complete: res.complete,
        winners: res.winners.map(entryKey),
        winnerNames: res.winners.map(nameOf),
        share: res.share,
        entries: scored.map((e) => ({
          key: entryKey(e), name: e.nick || e.name || `#${e.entry}`,
          isMe: String(e.nick || '').trim() === MY_NICK, correct: e.correct,
        })),
      });
    }
    out.pickem = { weeks: graded, missing, table: seasonTable(graded), paid: paidSoFar(graded) };
  }

  // Infinity War: the cached Sleeper pool, every week graded the same way the card is.
  const inf = S.payouts?.pools?.infinity;
  const feed = readable() ? loadCachedPool(S.season, INFINITY.id) : null;
  if (feed && inf) {
    const limit = Number(feed.settings?.weeklyPickLimit) || 8;
    // In week order, because a rolled-over pot is added to the next week's $20.
    let carried = 0;
    const graded = [...weeks].sort((a, b) => a - b).map((w) => {
      const games = views.get(w)?.games || [];
      const rows = gradePickemWeek(feed.entries || [], w, teamIndex(games), limit);
      const pot = inf.weekly + carried;
      const prize = weekPrize(rows, games, pot);
      const complete = prize.final && rows.some((r) => r.visible) && !prize.needsTiebreak;
      carried = complete && prize.rollover ? pot : complete ? 0 : carried;
      return {
        week: w,
        complete,
        pot,
        rollover: complete && prize.rollover,
        needsTiebreak: prize.final && prize.needsTiebreak,
        winners: prize.winners.map((r) => r.name),
        winnerNames: prize.winners.map((r) => (r.isMe ? 'you' : r.name)),
        share: prize.share,
        entries: rows.map((r) => ({ key: r.name, name: r.name, isMe: r.isMe, correct: r.correct })),
      };
    });
    out.infinity = { weeks: graded, table: seasonTable(graded), paid: paidSoFar(graded) };
  }
  return out;
}

function survivorSeason(S, weeks, views) {
  const results = Object.fromEntries(weeks.map((w) => [w, outcomeMap(views.get(w)?.games)]));
  const pools = {};
  if (S.survivor) {
    pools['mike-suicide'] = burnMatrix(S.survivor.entries.map((e) => ({
      key: entryKey(e), name: e.nick || e.name, isMe: String(e.nick || '').trim() === MY_NICK, picks: e.picks,
    })), weeks, results);
  }
  if (readable()) {
    for (const league of LEAGUES.filter((l) => l.sleeper)) {
      const feed = loadCachedFeed(S.season, league.id);
      if (!feed) continue;
      pools[league.id] = burnMatrix((feed.entries || []).map((e) => ({
        key: String(e.entry), name: e.nick, isMe: e.isMe, picks: e.picks,
      })), weeks, results);
      pools[league.id].feed = feed;
    }
  }
  return { weeks, pools };
}

/* ── All weeks: render ────────────────────────────────────────────────── */

const waiting = (title) => card(title, 'Season to date', '<p class="lede">Adding up the season…</p>');

function seasonRows(table, limit = 15) {
  const top = table.slice(0, limit);
  const me = table.find((r) => r.isMe);
  if (me && !top.includes(me)) top.push(me);
  return top.map((r) => `
    <tr class="${r.isMe ? 'is-me' : ''}">
      <td class="st-num">${r.rank}</td>
      <td class="st-name"><span>${esc(r.name)}</span></td>
      <td class="st-num">${r.correct}</td>
      <td class="st-num">${r.weeksWon ? fmtWeeks(r.weeksWon) : '—'}</td>
      <td class="st-num">${r.money ? money(r.money) : '—'}</td>
    </tr>`).join('');
}

const fmtWeeks = (n) => (Math.abs(n - Math.round(n)) < 0.01 ? String(Math.round(n)) : n.toFixed(2));

function seasonBoxes(table, paid) {
  const me = table.find((r) => r.isMe);
  if (!me) return '';
  const ahead = table.filter((r) => r.correct > me.correct).length;
  return `
    <div class="st-stats">
      <div><strong>${me.correct}</strong><span>correct</span></div>
      <div><strong>${ordinal(ahead + 1)}</strong><span>of ${table.length}</span></div>
      <div><strong>${money(me.money)}</strong><span>you've won</span></div>
      <div><strong>${money(paid)}</strong><span>paid out</span></div>
    </div>`;
}

function weekByWeek(weeks) {
  return payLines(weeks.map((w) => (w.rollover
    ? `Week ${w.week}: <strong>${money(w.pot)}</strong> rolls over (tied on the tiebreaker too)`
    : w.needsTiebreak
      ? `Week ${w.week}: tied on picks. Refresh from Sleeper to read the tiebreaker`
      : w.complete
        ? `Week ${w.week}: <strong>${money(w.share * w.winners.length)}</strong> to ${esc(listNames(w.winnerNames))}${w.winners.length > 1 ? ` (${money(w.share)} each)` : ''}`
        : `Week ${w.week}: in progress — counted in <em>correct</em>, not paid yet`)));
}

function seasonTableHtml(table) {
  return `
    <div class="st-tablewrap"><table class="st-table">
      <thead><tr>
        <th class="st-num">#</th><th>Entry</th><th class="st-num">Right</th>
        <th class="st-num">Weeks won</th><th class="st-num">$</th>
      </tr></thead>
      <tbody>${seasonRows(table)}</tbody>
    </table></div>`;
}

function allPickem(S) {
  const title = "Mike's pick'em";
  const pool = S.payouts?.pools?.['mike-pickem'];
  if (!S.ytd) return waiting(title);
  const p = S.ytd.pickem;
  if (!p || !pool) return card(title, 'Season to date', '<p class="lede">No cards or payouts file loaded for this season yet.</p>');
  const missing = p.missing.length
    ? `<p class="st-note">No cards loaded for Week ${p.missing.join(', ')} — those weeks are not counted. Run <code>scripts/parse_pool_picks.py</code> on Mike's workbook.</p>`
    : '';
  const leader = p.table[0];
  return card(title, `Season to date: ${p.weeks.length} week${p.weeks.length === 1 ? '' : 's'} graded`, `
    ${seasonBoxes(p.table, p.paid)}
    ${payLines([
      `Season winner gets <strong>${money(pool.season)}</strong>${leader?.correct ? ` · leading: ${esc(leader.isMe ? 'you' : leader.name)} on ${leader.correct}` : ''}`,
    ])}
    ${missing}
    <h4 class="st-sub">Week by week</h4>
    ${weekByWeek(p.weeks)}
    <h4 class="st-sub">Season leaderboard</h4>
    ${seasonTableHtml(p.table)}`);
}

function allInfinity(S) {
  const id = INFINITY.id;
  const pool = S.payouts?.pools?.infinity;
  const feed = loadCachedPool(S.season, id);
  if (!feed || !readable()) return card(INFINITY.name, 'Season to date', poolEmpty(S, id, feed, INFINITY.name));
  if (!S.ytd) return waiting(INFINITY.name);
  const p = S.ytd.infinity;
  if (!p || !pool) return card(INFINITY.name, 'Season to date', '<p class="lede">No payouts file loaded for this season yet.</p>');
  const [first, second] = p.table;
  return card(INFINITY.name, 'Season to date', `
    ${seasonBoxes(p.table, p.paid)}
    ${payLines([
      `Season prizes: <strong>${money(pool.season?.first)}</strong> 1st · <strong>${money(pool.season?.second)}</strong> 2nd`
        + (first?.correct ? ` · now: ${esc(first.isMe ? 'you' : first.name)} (${first.correct})${second ? `, ${esc(second.isMe ? 'you' : second.name)} (${second.correct})` : ''}` : ''),
    ])}
    <h4 class="st-sub">Week by week</h4>
    ${weekByWeek(p.weeks)}
    <h4 class="st-sub">Season leaderboard</h4>
    ${seasonTableHtml(p.table)}
    ${poolFoot(S, id, feed)}`);
}

function allSurvivor(S) {
  const cards = [["Mike's suicide pool", 'mike-suicide', null]]
    .concat(LEAGUES.filter((l) => l.sleeper).map((l) => [l.name, l.id, l]));
  return cards.map(([title, id, league]) => {
    if (league) {
      const feed = loadCachedFeed(S.season, league.id);
      if (!feed || !readable()) return card(title, 'Season to date', poolEmpty(S, id, feed, title));
    }
    if (!S.ytd) return waiting(title);
    const m = S.ytd.pools?.[id];
    if (!m || !m.rows.length) {
      return card(title, 'Season to date', `<p class="lede">No picks recorded for ${esc(title)} yet.</p>${league ? poolFoot(S, id, loadCachedFeed(S.season, id)) : ''}`);
    }
    return card(title, 'Season to date', burnHtml(S, id, m, league));
  }).join('');
}

function burnHtml(S, id, m, league) {
  const oneLife = !league;
  const weeks = S.ytd.weeks;
  const pot = potOf(S.payouts?.pools?.[id]);
  const cell = (c) => (c
    ? `<td class="st-num st-burn is-${c.outcome}${c.mine ? ' is-mine' : ''}"${c.mine ? ' title="Your pick"' : ''}>${c.count}</td>`
    : '<td class="st-num st-burn is-empty"></td>');
  const rows = m.rows.map((r) => `
    <tr>
      <td class="st-name"><span>${esc(ABBR_TO_MASCOT[r.team] || r.team)}</span></td>
      ${weeks.map((w) => cell(r.cells[w])).join('')}
      <td class="st-num"><strong>${r.total}</strong></td>
    </tr>`).join('');

  const hidden = league ? survivorCoverage(m.feed, S.defaultWeek).hidden : 0;
  return `
    <div class="st-stats">
      <div><strong>${m.entrants}</strong><span>entries</span></div>
      <div><strong>${m.unbeaten}</strong><span>${oneLife ? 'still alive' : 'no losses yet'}</span></div>
      <div><strong>${m.myLosses == null ? '—' : oneLife ? (m.myLosses ? 'Out' : 'Alive') : m.myLosses}</strong><span>${oneLife ? 'you' : 'your losses'}</span></div>
      <div><strong>${pot ? money(pot.total) : '—'}</strong><span>pot</span></div>
    </div>
    ${oneLife ? '' : '<p class="st-note">Losses are counted, not turned into eliminations: buy-backs are handled outside Sleeper, so an entry with a loss may still be playing.</p>'}
    ${hidden ? `<p class="st-note"><strong>${hidden}</strong> Week ${S.defaultWeek} picks were still hidden until kickoff at the last refresh and are not in the table yet.</p>` : ''}
    <h4 class="st-sub">Teams spent, week by week</h4>
    <p class="st-note st-fine">Each number is how many entries took that team that week. <span class="st-key is-won">won</span> <span class="st-key is-lost">lost</span> <span class="st-key is-live">playing</span> <span class="st-key is-mine">your pick</span></p>
    <div class="st-tablewrap"><table class="st-table st-burntable">
      <thead><tr>
        <th>Team</th>${weeks.map((w) => `<th class="st-num">W${w}</th>`).join('')}<th class="st-num">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td>Picks</td>${m.perWeek.map((p) => `<td class="st-num">${p.picks}</td>`).join('')}<td></td></tr>
        <tr><td>Lost</td>${m.perWeek.map((p) => `<td class="st-num">${p.lost}</td>`).join('')}<td></td></tr>
      </tfoot>
    </table></div>
    ${league ? poolFoot(S, id, m.feed) : ''}`;
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
