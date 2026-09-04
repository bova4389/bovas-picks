/* ==========================================================================
   Odds -- what the betting market thinks, one week at a time.

   Reads the snapshot scripts/fetch_odds.py commits to data/odds/. This tab
   does no fetching of its own: The Odds API key must never reach client JS,
   and a page full of visitors hitting the API directly would blow the free
   tier's monthly budget in a day. Static JSON, updated on a schedule, is the
   whole design.

   THIS TAB IS SCOPED TO A WEEK, and that is a correction rather than a
   preference. It used to render all 272 games at once, grouped by the
   snapshot's `bucket` field -- which counts game-weeks forward from TODAY, so
   in August the page opened on a heading that read "4 weeks out" immediately
   above a Week 1 game in September. The label was accurate and useless: a
   bucket is a distance, not a week, it renumbers itself every Tuesday, and it
   is documented in fetch_odds.py as a display grouping only. Weeks come from
   the schedule feed now (the one source that always knows what week it is),
   joined per game through js/oddsMatch.js's season-wide index.

   `bucket` is deliberately not read anywhere in this file. If a week number
   is wanted, take it from the schedule.
   ========================================================================== */

import {
  SEASON, getOddsSnapshot, getOddsHistory, getOddsQuota, getSchedule,
} from './data.js';
import { buildSeasonOddsIndex, matchSeasonOdds, orientProbs } from './oddsMatch.js';
import { loadWeek, weeksIn, currentWeek } from './gameState.js';
import { getIdentity } from './teamIdentity.js';

/** Inside this band of the market's own numbers, the game is a toss-up. */
const COINFLIP_LO = 0.45;
const COINFLIP_HI = 0.55;

/** Movement smaller than this is snapshot noise, not a market signal. */
const MOVER_FLOOR = 1;

let root = null;
let snapshot = null;
let seasonIndex = null;
let week = null;
/** The team-identity doc, fetched once at boot. Null on failure — see badge(). */
let identity = null;

const el = (id) => document.getElementById(id);

/* ── Boot ─────────────────────────────────────────────────────────────── */

export async function initOdds(node) {
  root = node;

  // Identity rides along with the two feeds this tab cannot render without.
  // It is the only one of the three that is allowed to fail: getIdentity()
  // resolves null rather than throwing, and a null doc costs the marks and
  // nothing else — the same contract markPath() states with its '' return.
  const [snap, schedule, ident] = await Promise.all([
    getOddsSnapshot(), getSchedule(SEASON), getIdentity(),
  ]);
  snapshot = snap;
  identity = ident;

  if (!snapshot || !snapshot.events.length) {
    root.innerHTML = shellHead() + emptyState();
    return;
  }

  // No schedule means no week numbers, and a week number invented from
  // kickoff dates is exactly the guesswork the bucket grouping was.
  if (!schedule || !schedule.games?.length) {
    root.innerHTML = shellHead() + missingSchedule();
    return;
  }

  seasonIndex = buildSeasonOddsIndex(snapshot.events);

  const weeks = weeksIn(schedule);
  week = currentWeek(schedule);

  root.innerHTML = shell(weeks, await getOddsQuota());

  el('odds-week-select').addEventListener('change', async (e) => {
    week = Number(e.target.value);
    await render();
  });

  await render();
}

/* ── Chrome ───────────────────────────────────────────────────────────── */

function shellHead(quota) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Market data</p>
        <h2>Odds</h2>
      </div>
      ${quota ? budgetNote(quota) : ''}
    </div>`;
}

function shell(weeks, quota) {
  return `
    ${shellHead(quota)}
    <p class="lede">
      What the sportsbooks price each game at, and how far that price has moved
      since the line opened. Win probability is the de-vigged moneyline averaged
      across the books that posted one &mdash; 63% means the market expects that
      team to win about two games in three. The <strong>movement</strong> is the
      part worth watching: money arriving on a side is the closest thing here to
      new information, and closing line value, not win rate, is the edge metric
      (STRATEGY.md &sect;3).
    </p>

    <div class="card controls">
      <div class="field">
        <label for="odds-week-select">Week</label>
        <select id="odds-week-select">
          ${weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join('')}
        </select>
      </div>
      <div class="field field-grow">
        <label>Snapshot</label>
        <div class="sched-freshness">${escape(formatTimestamp(snapshot.fetchedAt))}</div>
      </div>
    </div>

    <div id="odds-body"><p class="eyebrow">Loading</p></div>`;
}

/* ── One week ─────────────────────────────────────────────────────────── */

async function render() {
  const body = el('odds-body');
  el('odds-week-select').value = week;

  const { games } = await loadWeek(SEASON, week, { live: false });
  const rows = games.map(buildRow);

  // Only this week's histories -- 16 files, not 272. Fetching every game's
  // full snapshot trail at boot was the other half of why this tab was slow.
  const histories = await Promise.all(
    rows.map((r) => (r.ev ? getOddsHistory(r.ev.id) : Promise.resolve([])))
  );
  rows.forEach((r, i) => { r.move = movementFor(r, histories[i]); });

  const priced = rows.filter((r) => r.ev);
  if (!priced.length) {
    body.innerHTML = unpriced(rows.length);
    return;
  }

  body.innerHTML = summary(rows, priced) + dayGroups(rows);
}

function buildRow(g) {
  const ev = matchSeasonOdds({ away: g.away, home: g.home, date: g.kickoff }, seasonIndex);
  const { awayProb, homeProb } = orientProbs(g, ev);

  const favSide = awayProb == null ? null : (homeProb >= awayProb ? 'home' : 'away');
  return {
    game: g, ev, awayProb, homeProb, favSide,
    favName: favSide === 'home' ? g.home : favSide === 'away' ? g.away : null,
    favAbbr: favSide === 'home' ? g.homeAbbr : favSide === 'away' ? g.awayAbbr : null,
    favProb: favSide === 'home' ? homeProb : favSide === 'away' ? awayProb : null,
    move: null,
  };
}

/**
 * How far this game's price has travelled, expressed from the CURRENT
 * favorite's point of view -- "Seahawks 60% to 63%" reads as a line, where a
 * signed delta on a fixed side reads as arithmetic.
 *
 * The now-side is taken from the live snapshot rather than the tail of the
 * history file, so a history that has not caught up yet understates the move
 * instead of inventing one.
 */
function movementFor(row, history) {
  if (!row.ev || !history || history.length < 2 || row.favSide == null) return null;

  const open = orientProbs(row.game, history[0]);
  const openProb = row.favSide === 'home' ? open.homeProb : open.awayProb;
  if (openProb == null) return null;

  const openPct = Math.round(openProb * 100);
  const nowPct = Math.round(row.favProb * 100);
  const delta = nowPct - openPct;

  return {
    delta,
    dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    // The unchanged case says nothing about the number, because the number is
    // already on the row two lines up -- repeating it on all 16 games buries
    // the two or three rows that actually moved.
    text: delta === 0
      ? 'Unchanged since open'
      : `${escape(row.favName)} ${openPct}% &rarr; ${nowPct}%`,
  };
}

/* ── The "what am I looking at" strip ─────────────────────────────────── */

function summary(rows, priced) {
  const movers = priced
    .filter((r) => r.move && Math.abs(r.move.delta) >= MOVER_FLOOR)
    .sort((a, b) => Math.abs(b.move.delta) - Math.abs(a.move.delta))
    .slice(0, 3);

  const biggest = [...priced].sort((a, b) => b.favProb - a.favProb)[0];
  const coinflips = priced.filter(
    (r) => r.favProb >= COINFLIP_LO && r.favProb <= COINFLIP_HI
  ).length;
  const missing = rows.length - priced.length;

  return `
    <div class="oddsum">
      <div class="oddsum-cell">
        <p class="eyebrow">Biggest mismatch</p>
        <p class="oddsum-value oddsum-team">
          ${badge(biggest.favAbbr, 'ol-badge')}
          <span>${escape(biggest.favName)} <strong class="is-fav">${pct(biggest.favProb)}%</strong></span>
        </p>
      </div>
      <div class="oddsum-cell">
        <p class="eyebrow">Toss-ups</p>
        <p class="oddsum-value"><strong>${coinflips}</strong> game${coinflips === 1 ? '' : 's'} inside 45&ndash;55%</p>
      </div>
      <div class="oddsum-cell oddsum-movers">
        <p class="eyebrow">Line has moved most</p>
        <p class="oddsum-value">${
          movers.length
            ? movers.map((r) => `<span class="odds-move ${r.move.dir}">${r.move.text}</span>`).join('')
            : '<span class="oddsum-quiet">Nothing has moved a point yet</span>'
        }</p>
      </div>
      ${missing ? `
      <div class="oddsum-cell">
        <p class="eyebrow">Not priced</p>
        <p class="oddsum-value"><strong>${missing}</strong> game${missing === 1 ? '' : 's'} with no line</p>
      </div>` : ''}
    </div>`;
}

/* ── Rows ─────────────────────────────────────────────────────────────── */

function dayGroups(rows) {
  const byDay = new Map();
  for (const r of rows) {
    const key = dayKey(r.game.kickoff);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(r);
  }

  return [...byDay.entries()].map(([, list]) => `
    <div class="daygroup">
      <h3>${escape(dayLabel(list[0].game.kickoff))}</h3>
      ${list.map(oddsRow).join('')}
    </div>`).join('');
}

function oddsRow(r) {
  const g = r.game;

  if (!r.ev) {
    return `
      <div class="card oddsline is-unpriced">
        <div class="oddsline-kick">${escape(kickTime(g.kickoff))}</div>
        <div class="oddsline-teams">
          ${badge(g.awayAbbr, 'ol-badge ol-badge-away')}
          <span class="ol-team ol-away">${escape(g.away)}</span>
          ${badge(g.homeAbbr, 'ol-badge ol-badge-home')}
          <span class="ol-team ol-home">${escape(g.home)}</span>
        </div>
        <div class="oddsline-meta"><span>No market line yet</span></div>
      </div>`;
  }

  const awayPct = pct(r.awayProb);
  const homePct = 100 - awayPct;

  // Which side of the PRICE, never which side of the row -- the same one
  // color axis the Recommend tab reads on, so a 62% is the same purple on
  // both tabs and the dog is the same rust. Before this, away was purple and
  // home was teal, which meant nothing could be read down a column.
  const sideCls = (side) => (
    r.favSide == null ? '' : (r.favSide === side ? ' is-fav' : ' is-dog')
  );
  // The bar keeps away on the left to match the names beside it, so WHICH
  // segment carries which class flips with the favorite. The wide segment is
  // prob-fav on every row.
  const awaySeg = r.favSide === 'away' ? 'prob-fav' : 'prob-dog';
  const homeSeg = r.favSide === 'home' ? 'prob-fav' : 'prob-dog';

  return `
    <div class="card oddsline">
      <div class="oddsline-kick">${escape(kickTime(g.kickoff))}</div>
      <div class="oddsline-teams">
        ${badge(g.awayAbbr, 'ol-badge ol-badge-away')}
        <span class="ol-team ol-away${sideCls('away')}">${escape(g.away)}</span>
        <span class="ol-pct ol-pct-away${sideCls('away')}">${awayPct}%</span>
        <span class="ol-at">at</span>
        <span class="ol-pct ol-pct-home${sideCls('home')}">${homePct}%</span>
        <span class="ol-team ol-home${sideCls('home')}">${escape(g.home)}</span>
        ${badge(g.homeAbbr, 'ol-badge ol-badge-home')}
      </div>
      <div class="prob-bar" role="img" aria-label="${escape(g.away)} ${awayPct}%, ${escape(g.home)} ${homePct}%">
        <div class="prob-seg ${awaySeg}" style="width:${awayPct}%"></div>
        <div class="prob-seg ${homeSeg}" style="width:${homePct}%"></div>
      </div>
      <div class="oddsline-meta">
        <span>${r.ev.bookmakerCount} book${r.ev.bookmakerCount === 1 ? '' : 's'} &middot; ${(r.ev.vig * 100).toFixed(1)}% hold</span>
        ${r.move
          ? `<span class="odds-move ${r.move.dir}">${r.move.text}</span>`
          : '<span class="odds-move">Opening line</span>'}
      </div>
    </div>`;
}

/**
 * The team's mark, or an empty slot.
 *
 * `:empty` collapses the slot in CSS, so a team with no artwork -- or a failed
 * identity fetch, which takes all 32 at once -- costs its own 22px and nothing
 * else, rather than leaving a hole where the logo would be. Same reserved-slot
 * pattern the Schedule card and the Recommend chip use.
 */
function badge(abbr, cls) {
  const logo = abbr ? identity?.teams?.[abbr]?.assets?.logo : '';
  return `<span class="${cls}" aria-hidden="true">${
    logo ? `<img src="${escape(logo)}" alt="" loading="lazy" decoding="async">` : ''
  }</span>`;
}

/* ── Empty and degraded states ────────────────────────────────────────── */

function unpriced(count) {
  return `
    <div class="notice">
      <strong>No lines for Week ${escape(week)} yet.</strong><br />
      The market prices roughly two weeks ahead, so later weeks stay blank
      until the books post them. All ${escape(count)} games are in the schedule
      and will fill in here on their own.
    </div>`;
}

function missingSchedule() {
  return `
    <div class="notice">
      <strong>No schedule for ${escape(SEASON)} yet.</strong><br />
      This tab groups games by week, and the week number comes from
      <code>data/schedule-${escape(SEASON)}.json</code>:
      <br /><code>python scripts/fetch_schedule.py ${escape(SEASON)}</code>
    </div>`;
}

function emptyState() {
  return `
    <div class="notice">
      <strong>No odds snapshot yet.</strong><br />
      <code>data/odds/current.json</code> is written by
      <code>scripts/fetch_odds.py</code>, run on a schedule by
      <code>.github/workflows/fetch-odds.yml</code> once the repo is pushed
      and an <code>ODDS_API_KEY</code> secret is set.
      <br /><br />
      To generate a snapshot locally:
      <br /><code>ODDS_API_KEY=xxxxx python scripts/fetch_odds.py</code>
    </div>`;
}

/* ── Formatting ───────────────────────────────────────────────────────── */

const pct = (p) => Math.round(p * 100);

/** Local calendar day, so a Thursday-night game never lands in Friday's group
 *  for a viewer whose clock is behind Eastern. */
function dayKey(iso) {
  return new Date(iso).toLocaleDateString('en-CA');
}

function dayLabel(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  });
}

function kickTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

function formatTimestamp(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
}

/**
 * The remaining Odds API budget — shown ONLY when it is low enough to be a
 * decision.
 *
 * The free tier is 500 requests a month and the workflow spends about 200, so
 * for three weeks out of four this pill read "486 API credits left", which is
 * a number nobody can act on sitting in the same eyeline as the numbers the
 * tab exists for. A permanently-green status light trains you to stop reading
 * the spot it occupies, which is exactly the spot the warning needs.
 *
 * Below the floor it comes back, and it comes back looking like a warning.
 * Returns '' otherwise — same "'' means render nothing" contract as
 * oddsBadge's favoriteLine().
 */
const BUDGET_WARN_AT = 100;

function budgetNote(quota) {
  const left = Number(quota.requestsRemaining);
  if (!Number.isFinite(left) || left >= BUDGET_WARN_AT) return '';
  return `<span class="pill" title="Odds API requests left this month — the free tier resets monthly">${
    escape(String(left))} API credits left</span>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
