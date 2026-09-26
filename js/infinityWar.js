/* ==========================================================================
   Infinity War — the season-long pick'em where you pick eight.

   A Sleeper classic pick'em (`pickem_type: 0`, `weekly_pick_limit: 8`), 18
   entrants, $50 in. $20 a week to the most correct; $380 to 1st and $160 to
   2nd at the end of the season (owner, 2026-09-14). 18 x $50 = $900 =
   18 weekly prizes + $380 + $160, so the pot is fully accounted for.

   READ js/infinityModel.js's HEADER BEFORE CHANGING ANY NUMBER HERE. The two
   prizes in this pool want opposite things -- the season prize wants the
   chalk eight every week, the weekly prize wants separation from a field that
   is also picking chalk -- and this tab exists to show both rather than to
   blend them into one recommendation. The model computes; this file only
   decides what it looks like.

   ── What this tab does NOT share with the Pick Sheet ─────────────────────

   The Pick Sheet renders Mike's number map: scored games only, every game
   picked, numbers emailed. This tab renders the SCHEDULE FEED -- all games,
   eight of them chosen. They are different pools with different rules and
   they read different sources on purpose. A change to one must not be
   propagated to the other on the assumption they should agree; see the
   "Thursday games" note in CLAUDE.md for the same trap in the other
   direction.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { SEASON, getSchedule, getProjections, getOddsSnapshot } from './data.js';
import { auditSurvivorFeeds } from './season.js';
import { seasonBanner, isBlocked } from './seasonBanner.js';
import { buildGrid } from './gridModel.js';
import { currentWeek as currentWeekOf } from './gameState.js';
import { ABBR_TO_MASCOT } from './teams.js';
import { infinityTeamsKey } from './myPicks.js';
import { loadCachedPool, saveCachedPool, myPicksFor } from './infinityFeed.js';
import { mountConnectBoxes } from './sleeperAuth.js';
import { loadWeek as loadScores } from './gameState.js';
import { teamIndex, gradePickemWeek, weekPrize } from './standingsModel.js';
import {
  PICKS_PER_WEEK, weekGames, rankGames, sourceWarning, chalkSet,
  expectedCorrect, scoreDistribution, atLeast, simulateField, scoreCard,
  swapCandidates,
} from './infinityModel.js';

/* The pool itself lives in js/infinityPool.js so Node can import it without
   the rest of this tab. Re-exported so every `import { POOL }` still works. */
import { POOL } from './infinityPool.js';
export { POOL };

const PREF_KEY = 'infinity:prefs';
const PICKS_KEY = (season, week) => `infinity:${season}:${week}`;

const DEFAULTS = {
  // Opponents, NOT counting me: 18 entrants (owner, 2026-09-14) minus one.
  // Overwritten by the live count once Refresh has been pressed. A stored
  // `infinity:prefs` from before this change keeps its old number until then.
  fieldSize: 17,
  // How far the field strays from chalk. A guess, deliberately exposed as a
  // control rather than buried as a constant -- see simulateField()'s note.
  spread: 5,
};

const S = {
  root: null, season: SEASON, model: null, audit: null,
  week: null, weeks: [], now: 1, slate: [], picks: [],
  // gameId -> the team I took, for a card read from Sleeper. A card built on
  // this device always takes the favorite, so it leaves this empty.
  sides: new Map(), fromSleeper: false,
  prefs: { ...DEFAULTS }, feed: null, liveCount: null,
  sim: null, simKey: null,
  results: null, resultsKey: null, resultsBusy: null,
};

/* ── Boot ─────────────────────────────────────────────────────────────────*/

export async function initInfinityWar(root, season = SEASON) {
  if (!root) return;
  S.root = root;
  S.season = season;
  S.prefs = loadPrefs();
  S.feed = loadCachedPool(season, POOL.id);

  const [schedule, projections, odds] = await Promise.all([
    getSchedule(season), getProjections(season), getOddsSnapshot(),
  ]);

  S.audit = auditSurvivorFeeds({ season, schedule, odds, projections });

  if (!schedule?.games?.length) {
    root.innerHTML = head() + missing('schedule', season);
    return;
  }

  S.model = buildGrid({ schedule, projections, odds });
  S.weeks = S.model.weeks;
  S.now = currentWeekOf(schedule);
  S.week = S.weeks.includes(S.now) ? S.now : S.weeks[0];

  loadWeek();
  render();
  wire();
}

/** The slate and my stored card for whichever week is showing. */
function loadWeek() {
  S.slate = weekGames(S.model, S.week);
  S.sides = new Map();
  S.fromSleeper = false;

  // The card I actually submitted beats anything planned on this device --
  // the same precedence infinityPicks() in myPicks.js gives the Schedule.
  // Without this a finished week showed 0 of 8: the odds feed drops games
  // once they are played, so there is no chalk to fall back on either, and
  // every game renders "no line".
  const sent = sleeperCard();
  if (sent.length) {
    S.picks = sent.map((p) => p.gameId);
    for (const p of sent) S.sides.set(p.gameId, p.team);
    S.fromSleeper = true;
    return;
  }

  const stored = loadPicks(S.season, S.week);
  const valid = new Set(S.slate.map((g) => g.gameId));

  // A stored card is kept only where it still matches the schedule. A game
  // that moved weeks or was canceled drops out rather than sitting in the
  // card as an id that resolves to nothing -- the Pick Sheet learned this the
  // expensive way, where a stale number rendered as a silent blank.
  S.picks = stored.filter((id) => valid.has(id));

  // A card saved before the Schedule read its sides has ids but no teams.
  if (S.picks.length) saveTeams();

  // Nothing stored: open on the chalk eight rather than an empty card. It is
  // the correct answer for the season prize and the honest starting point for
  // the weekly one, and an empty card would make every block below say
  // "pick something first".
  if (!S.picks.length) S.picks = chalkSet(S.slate).map((g) => g.gameId);
}

/** My Sleeper picks for the week on screen, resolved to this slate's games. */
function sleeperCard() {
  const out = [];
  for (const team of myPicksFor(S.feed, S.week)) {
    const g = S.slate.find((x) => x.home === team || x.away === team);
    if (g && !out.some((p) => p.gameId === g.gameId)) out.push({ gameId: g.gameId, team });
  }
  return out;
}

/** The side I am on in a game: the Sleeper pick if there is one, else the favorite. */
const sideOf = (g) => S.sides.get(g.gameId) || g.pick;

/** That side's win probability, which is not `g.prob` when I took the dog. */
function sideProb(g) {
  const side = sideOf(g);
  if (side && side === g.home && g.homeProb != null) return g.homeProb;
  if (side && side === g.away && g.awayProb != null) return g.awayProb;
  if (side && side !== g.pick && g.prob != null) return 1 - g.prob;
  return g.prob;
}

const weekOver = () => S.slate.length > 0 && S.slate.every((g) => g.state === 'post');

/* ── Storage ──────────────────────────────────────────────────────────────*/

function loadPicks(season, week) {
  try {
    const raw = JSON.parse(localStorage.getItem(PICKS_KEY(season, week)));
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch { return []; }
}

function savePicks() {
  try {
    localStorage.setItem(PICKS_KEY(S.season, S.week), JSON.stringify(S.picks));
    saveTeams();
  } catch { /* private browsing -- the card still works, it just won't persist */ }
}

/** The side of each saved game, for the Schedule's tags -- see myPicks.js. */
function saveTeams() {
  const byId = new Map(S.slate.map((g) => [g.gameId, g]));
  const teams = S.picks.map((id) => byId.get(id)?.pick).filter(Boolean);
  try {
    localStorage.setItem(infinityTeamsKey(S.season, S.week), JSON.stringify(teams));
  } catch { /* ignore */ }
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREF_KEY));
    return { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch { return { ...DEFAULTS }; }
}

function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(S.prefs)); } catch { /* ignore */ }
}

/* ── Render ───────────────────────────────────────────────────────────────*/

function render() {
  const banner = seasonBanner(S.audit, { context: 'Infinity War' });
  if (isBlocked(S.audit)) {
    S.root.innerHTML = head() + banner;
    return;
  }

  const { counts } = rankGames(S.slate);
  const warn = sourceWarning(counts);

  // A finished week has nothing left to model -- and no prices to model it
  // with, since the odds feed drops games once they are played -- so the two
  // forecast blocks would only say "pick some games" under a graded card.
  const over = weekOver();
  const sim = over ? null : simulation();

  S.root.innerHTML = head()
    + banner
    + controls()
    + (warn && !over ? note(warn) : '')
    + blockResults()
    + blockCard()
    + (over ? '' : blockOutlook(sim) + blockSwaps(sim))
    + blockField();
  mountConnectBoxes(S.root);
}

function head() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Season Long</p>
        <h2>Infinity War</h2>
      </div>
    </div>
    <p class="lede">
      Eight games a week out of the whole slate, straight up. <strong>$20 a week to the most
      correct, the rest to the top one or two at the end</strong> &mdash; and those two prizes
      do not want the same card. The season prize wants the eight safest games every week.
      The weekly prize wants a card the other ten people did not also submit.
    </p>`;
}

function controls() {
  const live = S.liveCount != null
    ? `<span class="iw-live">Sleeper says ${S.liveCount} ${S.liveCount === 1 ? 'entry' : 'entries'}</span>`
    : '';

  return `
    <div class="planctl">
      <label class="planctl-item">
        <span>Week</span>
        <select id="iw-week">
          ${S.weeks.map((w) => `
            <option value="${w}"${w === S.week ? ' selected' : ''}>Week ${w}${
              w === S.now ? ' — now' : ''
            }</option>`).join('')}
        </select>
      </label>
      <label class="planctl-item">
        <span>Others in the pool</span>
        <input id="iw-field" type="number" min="1" max="40" value="${S.prefs.fieldSize}" />
      </label>
      <label class="planctl-item iw-spread">
        <span>How much the field strays from chalk</span>
        <input id="iw-spread" type="range" min="0" max="20" value="${S.prefs.spread}" />
        <output>${spreadLabel(S.prefs.spread)}</output>
      </label>
      <div class="planctl-item">
        <button id="iw-refresh" class="btn" type="button">Refresh from Sleeper</button>
        ${live}
      </div>
      <div class="planctl-item iw-connect" data-sl-connect></div>
      <p class="planctl-note" id="iw-status">
        The field is modeled, not read &mdash; nobody's picks are visible before kickoff.
      </p>
    </div>`;
}

const spreadLabel = (v) => (
  v === 0 ? 'everyone picks chalk'
    : v <= 4 ? 'barely — near-identical cards'
      : v <= 9 ? 'a little — the usual disagreement'
        : v <= 14 ? 'a lot — several contrarians'
          : 'wildly — nobody agrees'
);

/* ── Results: how the week actually went ──────────────────────────────────

   Every entry graded against the live scores, with the weekly prize called
   the same way Standings calls it (weekPrize): never split -- a tie on
   correct goes to the Monday night total-points guess, and a tie on that
   rolls the pot to next week. Scores load asynchronously, so the block shows
   a placeholder and re-renders once they arrive. */

function resultsKey() {
  return `${S.week}|${S.feed?.fetchedAt || 0}`;
}

function blockResults() {
  const title = `Week ${S.week} results`;
  if (!S.feed) {
    return card(title, 'How the pool did', `
      <p class="lede">No pool loaded yet. <strong>Connect Sleeper</strong> above (Sleeper now
      requires your login to read picks), then press <strong>Refresh from Sleeper</strong>.</p>`);
  }
  if (S.resultsKey !== resultsKey()) {
    refreshResults();
    return card(title, 'How the pool did', '<p class="lede">Grading the week…</p>');
  }
  const r = S.results;
  if (!r || !r.rows.some((x) => x.visible)) {
    return card(title, 'How the pool did', `
      <p class="lede">No picks visible for Week ${S.week} in the last refresh. Picks show once
      their games kick off; press <strong>Refresh from Sleeper</strong> to update.</p>`);
  }

  const { rows, prize, pot } = r;
  const winner = prize.winners[0] || null;
  const who = (x) => (x.isMe ? 'you' : x.name);
  let verdict;
  if (!prize.final) {
    verdict = `In progress. ${prize.leaders.length > 1 ? `${prize.leaders.length} tied` : esc(who(prize.leaders[0]))} leading at ${prize.top}.`;
  } else if (prize.rollover) {
    verdict = `${prize.leaders.length}-way tie at ${prize.top}, and tied on the tiebreaker too: the <strong>${money(pot)}</strong> rolls to next week.`;
  } else if (prize.needsTiebreak) {
    verdict = `${prize.leaders.length}-way tie at ${prize.top}. This copy of the pool has no tiebreaker guesses; press <strong>Refresh from Sleeper</strong>.`;
  } else {
    verdict = `<strong>${esc(who(winner))}</strong> ${winner.isMe ? 'win' : 'wins'} the <strong>${money(pot)}</strong> at ${prize.top}`
      + (prize.leaders.length > 1 && winner.tiebreaker
        ? `, on the tiebreaker: ${prize.leaders.length}-way tie, guessed ${winner.tiebreaker.guess} of a ${prize.total}-point Monday night.`
        : '.');
  }

  const tied = new Set(prize.leaders);
  const body = rows.map((x) => {
    const tb = x.tiebreaker ? x.tiebreaker.guess : '—';
    const off = prize.total != null && x.tiebreaker && tied.has(x) ? ` <span class="iw-fine">(off ${Math.abs(x.tiebreaker.guess - prize.total)})</span>` : '';
    const paid = prize.winners.includes(x) ? ` <strong>${money(pot)}</strong>` : '';
    return `
      <tr>
        <td>${x.rank}</td>
        <td>${esc(x.isMe ? `${x.name} (you)` : x.name)}${paid}</td>
        <td>${x.correct}${prize.final ? '' : ` <span class="iw-fine">max ${x.max}</span>`}</td>
        <td>${tb}${off}</td>
      </tr>`;
  }).join('');

  return card(title, 'How the pool did', `
    <p class="lede">${verdict}</p>
    <table class="iw-swaps">
      <thead><tr><th>#</th><th>Entry</th><th>Right</th><th>Tiebreaker</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="iw-fine">The $${POOL.economics.weekly} is never split. Tied on correct, the Monday
      night total-points guess closest either way wins; tied on that too, it rolls to next week.
      Guesses show once the Monday game kicks off.</p>`);
}

async function refreshResults() {
  const key = resultsKey();
  if (S.resultsBusy === key) return;
  S.resultsBusy = key;
  try {
    const limit = Number(S.feed.settings?.weeklyPickLimit) || PICKS_PER_WEEK;
    // Walk the season up to this week so a rolled-over pot is carried forward.
    let carried = 0;
    let out = null;
    for (let w = Math.min(...S.weeks); w <= S.week; w += 1) {
      const view = await loadScores(S.season, w, { live: true, maxAgeMs: 10 * 60e3 });
      const games = view?.games || [];
      const rows = gradePickemWeek(S.feed.entries || [], w, teamIndex(games), limit);
      const pot = POOL.economics.weekly + carried;
      const prize = weekPrize(rows, games, pot);
      if (w === S.week) { out = { rows, prize, pot }; break; }
      const settled = prize.final && rows.some((x) => x.visible) && !prize.needsTiebreak;
      if (settled) carried = prize.rollover ? pot : 0;
    }
    if (resultsKey() !== key) return;
    S.results = out;
    S.resultsKey = key;
  } catch (err) {
    console.warn('infinity war: results failed', err);
    S.results = null;
    S.resultsKey = key;
  } finally {
    if (S.resultsBusy === key) S.resultsBusy = null;
  }
  render();
}

/* ── Block A: the card ────────────────────────────────────────────────────*/

function blockCard() {
  const picked = new Set(S.picks);
  const { ranked } = rankGames(S.slate);
  // Read from Sleeper, my eight lead the list: with no prices left on a
  // finished week the ranking is only schedule order, and the card is the
  // point. Planning on this device keeps the pure price order.
  const rowsIn = S.fromSleeper
    ? ranked.filter((g) => picked.has(g.gameId)).concat(ranked.filter((g) => !picked.has(g.gameId)))
    : ranked;

  let correct = 0;
  let settledPicks = 0;

  const rows = rowsIn.map((g) => {
    const on = picked.has(g.gameId);
    const side = on ? sideOf(g) : g.pick;
    const prob = on ? sideProb(g) : g.prob;
    const settled = g.state === 'post' && g.winner;
    // Graded against the side I took, and only for games I took: an unpicked
    // game cannot be missed, and a dog pick is right when the dog wins.
    const right = on && settled && g.winner === side;
    if (on && settled) { settledPicks += 1; if (right) correct += 1; }
    const mark = on && settled ? (right ? ' is-right' : ' is-wrong') : '';

    const sideText = side
      ? esc(name(side))
      : settled ? `${esc(name(g.winner))} won` : 'no line';
    const tail = on && settled
      ? `<span class="iw-result ${right ? 'is-right' : 'is-wrong'}">${right ? 'Right' : 'Missed'}</span>`
      : settled && g.prob == null ? '<span></span>'
      : `<span class="iw-src ${esc(g.source || 'none')}">${
        g.source === 'market' ? 'market' : g.source === 'projection' ? 'proj' : 'no data'
      }</span>`;

    // A Sleeper card is changed on Sleeper, so its rows are not toggles here.
    const locked = S.fromSleeper || g.prob == null;

    return `
      <button class="iw-game${on ? ' is-on' : ''}${mark}" type="button"
              data-game="${esc(g.gameId)}"${locked ? ' disabled' : ''} aria-pressed="${on}">
        <span class="iw-matchup">${esc(name(g.away))} at ${esc(name(g.home))}</span>
        <span class="iw-side">${sideText}</span>
        <span class="iw-prob">${prob == null ? '—' : pct(prob)}</span>
        ${tail}
      </button>`;
  }).join('');

  const n = S.picks.length;
  const short = n !== PICKS_PER_WEEK;
  const grade = settledPicks
    ? `<span class="iw-grade">${correct} right of ${settledPicks} settled</span>` : '';

  const control = S.fromSleeper
    ? '<span class="iw-fine">Your card as submitted on Sleeper. Change it there, then Refresh.</span>'
    : '<button id="iw-chalk" class="btn btn-quiet" type="button">Reset to chalk</button>';

  return card('Week ' + S.week, 'Your eight', `
    <p class="iw-count${short ? ' is-short' : ''}">
      <strong>${n} of ${PICKS_PER_WEEK}</strong> picked${
        short ? (n > PICKS_PER_WEEK ? ' — too many' : ' — the card is short') : ''
      }
      ${grade}
      ${control}
    </p>
    <div class="iw-games${S.fromSleeper ? ' is-sleeper' : ''}">${rows}</div>`);
}

/* ── Block B: what the card is worth ──────────────────────────────────────*/

function blockOutlook(sim) {
  const byId = new Map(S.slate.map((g) => [g.gameId, g]));
  const probs = S.picks.map((id) => byId.get(id)).filter(Boolean)
    .map(sideProb).filter((p) => p != null);

  if (!probs.length) {
    return card('This week', 'What the card is worth',
      '<p class="lede">Pick some games and this fills in.</p>');
  }

  const dist = scoreDistribution(probs);
  const ev = expectedCorrect(probs);
  const out = scoreCard(sim, S.picks);

  const max = Math.max(...dist);
  const bars = dist.map((p, k) => `
    <div class="iw-bar" title="${pct(p)} chance of exactly ${k}">
      <div class="iw-bar-fill" style="height:${Math.round((p / max) * 100)}%"></div>
      <span class="iw-bar-k">${k}</span>
    </div>`).join('');

  return card('This week', 'What the card is worth', `
    <div class="iw-stats">
      <div class="iw-stat">
        <span class="iw-stat-n">${ev.toFixed(2)}</span>
        <span class="iw-stat-l">expected correct, of ${probs.length}</span>
      </div>
      <div class="iw-stat">
        <span class="iw-stat-n">${pct(atLeast(dist, 7))}</span>
        <span class="iw-stat-l">chance of 7 or more</span>
      </div>
      <div class="iw-stat">
        <span class="iw-stat-n">${pct(dist[dist.length - 1])}</span>
        <span class="iw-stat-l">chance of a perfect card</span>
      </div>
      ${out ? `
      <div class="iw-stat">
        <span class="iw-stat-n">${money(out.share * (POOL.economics.weekly))}</span>
        <span class="iw-stat-l">expected share of the $${POOL.economics.weekly}</span>
      </div>` : ''}
    </div>
    <div class="iw-dist">${bars}</div>
    <p class="iw-axis">how many of the eight come in</p>`);
}

/* ── Block C: winning the week ────────────────────────────────────────────*/

function blockOutlookCopy(out) {
  if (out.spread === 0) {
    return `With the field on pure chalk, every card is the same card and the week is a
      ${out.fieldSize + 1}-way tie by construction. That is the point: <strong>picking well does
      not win this prize, picking differently and being right does.</strong>`;
  }
  if (out.outright < 0.05) {
    return `Almost never wins outright. This card is close enough to what everyone else will
      submit that the usual result is a split — the money comes from ties, not wins.`;
  }
  if (out.outright > 0.2) {
    return `A genuinely separated card: it wins the week on its own more often than a
      chalk card can, at some cost to expected correct.`;
  }
  return `Wins outright about ${pct(out.outright)} of the time and shares the week ${
    pct(out.tied)}. In a pool this size, ties are the common case and worth planning around.`;
}

function blockSwaps(sim) {
  const out = scoreCard(sim, S.picks);
  if (!out) {
    return card('The week', 'Winning it',
      '<p class="lede">Pick some games and this fills in.</p>');
  }

  const swaps = swapCandidates(S.slate, S.picks, modelOpts(), 6, sim);

  const rows = swaps.length ? swaps.map((s) => `
    <tr>
      <td class="iw-swap-out">${esc(name(s.drop?.pick || '—'))}</td>
      <td class="iw-swap-in">${esc(name(s.add?.pick || '—'))}</td>
      <td class="${s.dShare > 0 ? 'is-up' : 'is-down'}">${signed(s.dShare * 100, 1)}%</td>
      <td class="${s.dCorrect >= 0 ? 'is-up' : 'is-down'}">${signed(s.dCorrect, 2)}</td>
      <td>${S.fromSleeper ? '' : `<button class="btn btn-quiet iw-do-swap" type="button"
                  data-drop="${esc(s.drop?.gameId || '')}"
                  data-add="${esc(s.add?.gameId || '')}">Apply</button>`}</td>
    </tr>`).join('') : `
    <tr><td colspan="5">No swap improves this card at the current settings.</td></tr>`;

  return card('The week', 'Winning it', `
    <div class="iw-stats">
      <div class="iw-stat">
        <span class="iw-stat-n">${pct(out.outright)}</span>
        <span class="iw-stat-l">win the week outright</span>
      </div>
      <div class="iw-stat">
        <span class="iw-stat-n">${pct(out.tied)}</span>
        <span class="iw-stat-l">tie for the lead</span>
      </div>
      <div class="iw-stat">
        <span class="iw-stat-n">${pct(out.share)}</span>
        <span class="iw-stat-l">of the weekly prize, on average</span>
      </div>
    </div>
    <p class="lede">${blockOutlookCopy(out)}</p>
    ${S.picks.some((id) => S.sides.has(id) && S.sides.get(id) !== S.slate.find((g) => g.gameId === id)?.pick)
    ? `<p class="iw-fine">Your Sleeper card takes at least one underdog; these figures model
        every pick as the favorite, so read them as the chalk version of your card.</p>`
    : ''}
    <table class="iw-swaps">
      <thead>
        <tr>
          <th>Drop</th><th>Add</th>
          <th>Weekly prize</th><th>Expected correct</th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="iw-fine">
      <strong>Weekly prize</strong> is the change in your average share of the $${
        POOL.economics.weekly}; <strong>expected correct</strong> is what the swap costs the
      season-long total. They are separate money and the trade is yours to make — a swap that
      buys weekly upside for a hundredth of a pick is usually worth it, one that costs half a
      pick a week for the whole season is not. Modeled over ${out.trials.toLocaleString()}
      simulated weeks against ${out.fieldSize} opponents.
    </p>`);
}

/* ── Block D: the field, once it exists ───────────────────────────────────*/

function blockField() {
  if (!S.feed) {
    return card('The field', 'What everyone else did', `
      <p class="lede">
        Nothing fetched yet. <strong>Refresh from Sleeper</strong> pulls the pool's entries and
        their picks &mdash; though picks stay hidden until their game kicks off, which is the
        pool's own rule and this tool keeps it.
      </p>`);
  }

  const wk = S.feed.weeks?.[String(S.week)];
  if (!wk || !wk.rows?.length) {
    return card('The field', 'What everyone else did', `
      <p class="lede">
        ${S.feed.entries.length} ${S.feed.entries.length === 1 ? 'entry' : 'entries'} in the pool.
        Nothing visible for Week ${S.week} yet${
          wk?.locked ? ` — ${wk.locked} pick${wk.locked === 1 ? '' : 's'} in and held until kickoff` : ''
        }.
      </p>`);
  }

  const rows = wk.rows.map((r) => `
    <tr>
      <td>${esc(name(r.team))}</td>
      <td>${r.count}</td>
      <td>${pct(r.count / Math.max(1, wk.revealed))}</td>
    </tr>`).join('');

  return card('The field', 'What everyone else did', `
    <p class="lede">
      Week ${S.week}: ${wk.revealed} pick${wk.revealed === 1 ? '' : 's'} visible${
        wk.locked ? `, ${wk.locked} still held until kickoff` : ''
      }.
    </p>
    <table class="iw-swaps">
      <thead><tr><th>Team</th><th>Picked by</th><th>Share</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

/* ── Wiring ───────────────────────────────────────────────────────────────*/

/**
 * The simulated field for the current week and settings.
 *
 * Cached, because THE FIELD DOES NOT DEPEND ON MY PICKS. Toggling a game
 * changes which games I am scored on, not what the other eleven people did or
 * how the games came out -- so re-simulating on every click was spending
 * ~400ms to reproduce, seed for seed, a result already in memory. It is
 * rebuilt only when the week, the field size or the spread changes.
 *
 * One simulation also serves both blocks that need it. They used to call
 * fieldOutlook() separately, which scored them against different draws, so
 * the headline share and the swap table could disagree slightly about the
 * same card.
 */
function simulation() {
  const opts = modelOpts();
  const k = `${S.week}|${opts.fieldSize}|${opts.spread}|${opts.seed}`;
  if (S.simKey !== k) {
    S.sim = simulateField(S.slate, opts);
    S.simKey = k;
  }
  return S.sim;
}

function modelOpts() {
  return {
    fieldSize: Math.max(1, Number(S.prefs.fieldSize) || DEFAULTS.fieldSize),
    // The slider is 0-20 for a usable control; the model wants a probability
    // width, and 20 -> 0.20 is a field that disagrees about almost everything.
    spread: (Number(S.prefs.spread) || 0) / 100,
    // Fixed seed: same card, same numbers, every render. See rng() in the
    // model for why that matters more than sampling freshness.
    seed: 20260901 + S.week,
  };
}

/**
 * Re-render, then put focus back where it was.
 *
 * `render()` rewrites the whole panel, so the control that triggered it is a
 * different DOM node afterwards and focus lands on <body>. For a mouse user
 * that is invisible; for anyone driving the spread slider or the field-size
 * box from the keyboard it is not, because every arrow press fires `change`
 * and would throw them out of the control they were adjusting.
 *
 * Range inputs also keep their caret-equivalent (the thumb) purely from
 * value, so restoring focus is enough -- no selection to preserve.
 */
function rerender(focusId) {
  render();
  if (!focusId) return;
  const el = document.getElementById(focusId);
  if (el) el.focus({ preventScroll: true });
}

function wire() {
  const root = S.root;

  root.addEventListener('change', (e) => {
    if (e.target.id === 'iw-week') {
      S.week = Number(e.target.value);
      loadWeek();
      rerender('iw-week');
      return;
    }
    if (e.target.id === 'iw-field') {
      S.prefs.fieldSize = Math.max(1, Number(e.target.value) || DEFAULTS.fieldSize);
      savePrefs();
      rerender('iw-field');
    }
  });

  // `input` rather than `change` so the slider's label tracks the thumb, but
  // the expensive re-render waits for release -- the model runs thousands of
  // simulated weeks and doing that on every pixel makes the control stutter.
  root.addEventListener('input', (e) => {
    if (e.target.id !== 'iw-spread') return;
    S.prefs.spread = Number(e.target.value);
    const out = e.target.parentElement?.querySelector('output');
    if (out) out.textContent = spreadLabel(S.prefs.spread);
  });
  root.addEventListener('change', (e) => {
    if (e.target.id !== 'iw-spread') return;
    // Re-read the value rather than trusting the `input` handler to have run.
    // Range inputs do fire `input` before `change`, but relying on that makes
    // the committed value depend on event ordering for no benefit.
    S.prefs.spread = Number(e.target.value);
    savePrefs();
    rerender('iw-spread');
  });

  root.addEventListener('click', (e) => {
    const game = e.target.closest('.iw-game');
    if (game && !game.disabled) {
      toggle(game.dataset.game);
      return;
    }
    if (e.target.id === 'iw-chalk') {
      S.picks = chalkSet(S.slate).map((g) => g.gameId);
      savePicks();
      render();
      return;
    }
    const swap = e.target.closest('.iw-do-swap');
    if (swap) {
      S.picks = S.picks.filter((id) => id !== swap.dataset.drop).concat(swap.dataset.add);
      savePicks();
      render();
      return;
    }
    if (e.target.id === 'iw-refresh') refresh();
  });
}

function toggle(gameId) {
  S.picks = S.picks.includes(gameId)
    ? S.picks.filter((id) => id !== gameId)
    : S.picks.concat(gameId);
  savePicks();
  render();
}

/**
 * Pull the pool from Sleeper.
 *
 * Leaves the last good feed in place on failure and says why, rather than
 * writing a partial pool over a complete one -- the rule every consumer of
 * js/sleeperApi.js follows, for an endpoint that is undocumented and entitled
 * to change without notice.
 */
async function refresh() {
  const btn = document.getElementById('iw-refresh');
  const status = document.getElementById('iw-status');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  if (status) status.textContent = 'Asking Sleeper…';

  try {
    const { fetchInfinityPool } = await import('./infinityFeed.js');
    const feed = await fetchInfinityPool(POOL.sleeper, S.season);
    S.feed = feed;
    S.liveCount = feed.entries.length;
    // Cached so the Schedule can tag my Sleeper picks -- see myPicks.js.
    saveCachedPool(S.season, POOL.id, feed);

    // The pool's real size beats the guess, but only once there is more than
    // just me in it -- a one-entry pool is a pool that has not filled, not a
    // pool of one, and writing 0 opponents into the model would blank every
    // number below.
    if (feed.entries.length > 1) {
      S.prefs.fieldSize = feed.entries.length - 1;
      savePrefs();
    }
    // Rebuild the card too, so a card just read from Sleeper replaces
    // whatever this device was showing without a reload.
    loadWeek();
    render();
  } catch (err) {
    if (status) {
      status.textContent = `Couldn't refresh — ${err.message}. ${
        S.feed ? 'Showing the last good copy.' : 'Nothing cached yet.'}`;
    }
  } finally {
    const b = document.getElementById('iw-refresh');
    if (b) { b.disabled = false; b.textContent = 'Refresh from Sleeper'; }
  }
}

/* ── Bits ─────────────────────────────────────────────────────────────────*/

function card(eyebrow, title, body) {
  return `
    <section class="card planblock">
      <div class="section-head"><div>
        <p class="eyebrow">${esc(eyebrow)}</p><h3>${esc(title)}</h3>
      </div></div>
      ${body}
    </section>`;
}

function note(text) {
  return `<p class="iw-warn">${esc(text)}</p>`;
}

function missing(feed, season) {
  return `
    <section class="card">
      <p class="lede">
        No ${esc(feed)} for ${esc(season)}. Run <code>scripts/fetch_schedule.py</code> and reload.
      </p>
    </section>`;
}

const name = (abbr) => ABBR_TO_MASCOT[abbr] || abbr || '—';
const pct = (p) => `${Math.round(p * 100)}%`;
const money = (n) => `$${n.toFixed(2)}`;
const signed = (n, dp) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
