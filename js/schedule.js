/* ==========================================================================
   Schedule — the full 2026 season, with live scoring during the games.

   This is the tab you leave open on a Sunday. It is also the project's source
   of truth for game state: every other tab reads what happened here through
   js/gameState.js rather than deriving it again (see that file's header).

   POLLING POLICY, because an always-on 25-second loop against a public
   endpoint is rude and pointless six days a week. The loop only runs when all
   of these hold:

     - this panel is the visible tab, AND
     - the browser tab itself is foregrounded (document.hidden), AND
     - the week on screen has a game in progress, or a kickoff within 15 min

   Outside that window the tab renders from the committed schedule and does
   nothing. Switching away stops the timer; switching back restarts it and
   refreshes immediately, so you never look at a stale score without knowing.

   NEVER add a ?v= to this file — see data.js's note on module identity.
   ========================================================================== */

import { getSchedule } from './data.js';
import { clearScoreboardCache } from './espn.js';
import {
  loadWeek, weeksIn, currentWeek, anyLive, msToNextKickoff,
} from './gameState.js';
import { getIdentity, tintOn } from './teamIdentity.js';

const POLL_MS = 25_000;
/** How close to kickoff we start polling, so the first snap isn't missed. */
const PREKICK_MS = 15 * 60 * 1000;

let panel = null;
let season = null;
let schedule = null;
let week = null;
let view = null;      // last loadWeek() result
/* The identity document, resolved once at boot. render() is synchronous and
   runs on every poll tick, so the colors and logo paths have to be sitting in
   memory by then rather than awaited per card. Null if it failed to load, in
   which case every team just renders without a tint or a logo. */
let identity = null;
let timer = null;
let agoTimer = null;
let refreshing = false;

const el = (id) => document.getElementById(id);

/* ── Boot ─────────────────────────────────────────────────────────────── */

export async function initSchedule(root, activeSeason) {
  panel = root.closest('.panel');
  season = activeSeason;
  // Fetched alongside the schedule rather than after it: both are needed for
  // the first paint, and getIdentity() resolves null on failure instead of
  // throwing, so a missing identity file costs the tint and logos, not the tab.
  [schedule, identity] = await Promise.all([getSchedule(season), getIdentity()]);

  if (!schedule || !schedule.games?.length) {
    root.innerHTML = emptyState(season);
    return;
  }

  const weeks = weeksIn(schedule);
  week = currentWeek(schedule);

  root.innerHTML = shell(weeks);
  el('sched-week-select').value = String(week);

  el('sched-week-select').addEventListener('change', async (e) => {
    week = Number(e.target.value);
    await refresh({ force: true });
  });

  el('sched-refresh').addEventListener('click', async () => {
    clearScoreboardCache();
    await refresh({ force: true });
  });

  // Coming back to a backgrounded tab, or to this panel from another one,
  // should never show a stale score — refresh first, then resume the loop.
  document.addEventListener('visibilitychange', onVisibilityChange);
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => queueMicrotask(onVisibilityChange));
  }

  agoTimer = setInterval(paintFreshness, 5_000);
  await refresh({ force: true });
}

function onVisibilityChange() {
  if (isShowing()) refresh();
  else stopPolling();
}

function isShowing() {
  return !document.hidden && panel && !panel.hidden;
}

/* ── Refresh + polling ────────────────────────────────────────────────── */

async function refresh({ force = false } = {}) {
  if (refreshing) return;
  refreshing = true;

  const wasLive = view ? anyLive(view.games) : false;
  el('sched-refresh')?.classList.add('is-busy');

  try {
    // A week that's wholly finished needs no live layer; the committed file
    // already has its final scores. `force` overrides so the manual refresh
    // button always actually does something.
    view = await loadWeek(season, week, {
      live: force || shouldPoll() || wasLive,
      maxAgeMs: force ? 0 : POLL_MS,
    });
    render();
  } finally {
    refreshing = false;
    el('sched-refresh')?.classList.remove('is-busy');
  }

  schedulePoll();
}

/** Whether the week on screen warrants live polling right now. */
function shouldPoll() {
  if (!view || !isShowing()) return false;
  if (anyLive(view.games)) return true;

  const next = msToNextKickoff(view.games);
  return next != null && next <= PREKICK_MS;
}

function schedulePoll() {
  stopPolling();
  if (!shouldPoll()) return;
  timer = setTimeout(() => refresh(), POLL_MS);
}

function stopPolling() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/* ── Render ───────────────────────────────────────────────────────────── */

function shell(weeks) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">The season</p>
        <h2>Schedule</h2>
      </div>
      <span id="sched-live" class="pill" hidden></span>
    </div>

    <div class="card controls">
      <div class="field">
        <label for="sched-week-select">Week</label>
        <select id="sched-week-select">
          ${weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join('')}
        </select>
      </div>
      <div class="field field-grow">
        <label>Updated</label>
        <div class="sched-freshness">
          <span id="sched-ago">—</span>
          <button type="button" class="btn btn-ghost" id="sched-refresh">Refresh</button>
        </div>
      </div>
    </div>

    <div id="sched-body"></div>`;
}

function render() {
  const body = el('sched-body');
  if (!body || !view) return;

  // Grouped by calendar day and ordered by the day's first kickoff — NOT by a
  // fixed Thu–Mon weekday list. The 2026 season opens on a *Wednesday*, and a
  // hardcoded order buried that game at the bottom of Week 1. International
  // games and holiday slates break the assumption too.
  const byDay = new Map();
  for (const g of view.games) {
    const day = weekdayOf(g.kickoff);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(g);
  }
  const days = [...byDay.keys()].sort(
    (a, b) => firstKickoff(byDay.get(a)) - firstKickoff(byDay.get(b))
  );

  body.innerHTML = `
    ${summaryLine()}
    ${days.map((d) => `
      <div class="daygroup">
        <h3>${escape(d)}${dayDateSuffix(byDay.get(d))}</h3>
        ${byDay.get(d).map(gameCard).join('')}
      </div>`).join('')}
    ${byeLine()}
    ${view.liveAvailable ? '' : offlineNote()}`;

  paintLivePill();
  paintFreshness();
}

function summaryLine() {
  const live = view.games.filter((g) => g.state === 'in').length;
  const done = view.games.filter((g) => g.state === 'post').length;
  const total = view.games.length;

  const parts = [`${total} game${total === 1 ? '' : 's'}`];
  if (live) parts.push(`<strong>${live} in progress</strong>`);
  if (done) parts.push(`${done} final`);

  // Says the away/home convention once, here, rather than putting an "at"
  // label on all 16 cards — position carries it after the first glance.
  return `
    <p class="lede">
      Week ${view.week} · ${parts.join(' · ')}
      <span class="sched-legend">Away left · Home right</span>
    </p>`;
}

/**
 * One game as a scoreboard bar: away on the left, home on the right, status
 * between them.
 *
 * AWAY IS ALWAYS LEFT, HOME ALWAYS RIGHT — never reordered by who is winning.
 * A fixed side per role is what lets the eye scan a column of 16 games, and it
 * matches the Pick Sheet's existing away/at/home order so the two tabs don't
 * disagree about which team is which.
 *
 * The outermost element on each side is an empty `.schedteam-badge` slot,
 * reserved for the team logo. It collapses to nothing while empty (`:empty` in
 * the CSS), so it costs no space until it is filled. Putting the teams on
 * opposite edges is the whole reason that slot can exist. See
 * assets-review.html for what the filled slot looks like at 28px, and why the
 * helmet images that used to be the plan were dropped.
 */
function gameCard(g) {
  const cls = [
    'card', 'schedgame',
    `is-${g.state}`,
    g.isLive ? 'is-live' : '',
    g.redZone ? 'is-redzone' : '',
  ].filter(Boolean).join(' ');

  const meta = metaText(g);

  return `
    <div class="${cls}${g.neutral ? ' is-neutral' : ''}">
      ${teamSide(g, 'away')}
      <div class="schedgame-center">
        <div class="schedgame-status">${statusText(g)}</div>
        ${venueHtml(g)}
        ${meta ? `<div class="schedgame-meta">${meta}</div>` : ''}
      </div>
      ${teamSide(g, 'home')}
    </div>`;
}

/** One team's record from the identity doc, or null. */
function identityOf(abbr) {
  return (abbr && identity?.teams?.[abbr]) || null;
}

/**
 * Where the game is played, as a short label — or '' for the 263 games of a
 * season played at the home team's own stadium.
 *
 * Worth stating because "home" in every upstream feed means the team that owns
 * the fixture, not whose building it is. Nine 2026 games are abroad, and on
 * those the home side has no crowd, no travel advantage and none of what the
 * word implies. The city is the useful half — "London" tells you more than
 * "Tottenham Hotspur Stadium" in a 104px column.
 */
function venueLabel(g) {
  if (!g.neutral) return '';
  const city = g.venue?.city;
  const country = g.venue?.country;
  // US neutral sites do exist (a displaced game, a Super Bowl); naming the
  // country only helps when it is not the usual one.
  if (city && country && country !== 'USA') return `${city}, ${country}`;
  return city || g.venue?.name || 'Neutral site';
}

/**
 * The venue pill's markup, city and country in separate spans.
 *
 * Split so the country can be dropped at phone widths by CSS alone. The centre
 * grid track is `auto`, so it sizes to its widest child — "Mexico City, Mexico"
 * grew that column and took the width straight off the two team names, which
 * ellipsised "49ers". The city alone is the part that carries the meaning.
 */
function venueHtml(g) {
  if (!g.neutral) return '';
  const city = g.venue?.city;
  const country = g.venue?.country;
  const title = `Neutral site — not the home team's stadium${
    g.venue?.name ? ` (${g.venue.name})` : ''}`;

  const inner = city
    ? `${escape(city)}${
        country && country !== 'USA' ? `<span class="venue-country">, ${escape(country)}</span>` : ''
      }`
    : escape(g.venue?.name || 'Neutral site');

  return `<div class="schedgame-venue" title="${escape(title)}">${inner}</div>`;
}

function teamSide(g, side) {
  const name = side === 'away' ? g.away : g.home;
  const abbr = side === 'away' ? g.awayAbbr : g.homeAbbr;

  // ESPN reports "0" for both sides before kickoff, which renders as a 0–0
  // scoreline on a game that hasn't started. Only show a score once there is
  // one to show.
  const raw = side === 'away' ? g.awayScore : g.homeScore;
  const score = g.state === 'pre' ? null : raw;

  // Only one of these ever applies: `winner` is null until final, `leader` is
  // null once it is. See gameState.js resolveLeader().
  const mark =
    g.winner === side ? 'is-winner'
    : g.winner && g.winner !== 'tie' ? 'is-loser'
    : g.leader === side ? 'is-leading'
    : '';

  const hasPossession = g.state === 'in' && g.possession === side;

  const team = identityOf(abbr);
  const logo = team?.assets?.logo || '';
  const primary = team?.palette?.primary?.hex || '';

  // An 8% wash of the team's own color behind its half of the bar. Mixed to a
  // solid rather than set with rgba() so the black name on top has a knowable
  // contrast — see tintOn(). Every team lands above 19:1 at this strength, so
  // the name stays plain black for all 32 and no team reads louder than another.
  const tint = primary ? tintOn(primary, '#FFFFFF', 0.08) : '';

  // "AWAY" / "HOME" spelled out rather than implied by position. Position alone
  // works only if you already know the convention, and it silently misleads on
  // a neutral-site game, where the home team is not at home at all. Matches the
  // Pick Sheet's existing .pick-side label so the two tabs agree.
  const roleLabel = side === 'away' ? 'Away' : 'Home';
  const roleTitle = side === 'home' && g.neutral
    ? `Home team, but this game is at a neutral site${venueLabel(g) ? ` — ${venueLabel(g)}` : ''}`
    : `${roleLabel} team`;

  // DOM order is the same for both sides — badge, name, possession, score —
  // and the home side is mirrored with `flex-direction: row-reverse` in CSS.
  // That keeps the markup semantic (and the reading order away-then-home for a
  // screen reader) while putting badges on the outer edges and scores inward,
  // flanking the clock.
  return `
    <div class="schedteam schedteam-${side} ${mark}${g.neutral && side === 'home' ? ' is-displaced' : ''}"
         data-abbr="${escape(abbr || '')}"${tint ? ` style="background:${tint}"` : ''}>
      <span class="schedteam-badge" aria-hidden="true">${
        logo ? `<img src="${escape(logo)}" alt="" loading="lazy" decoding="async">` : ''
      }</span>
      <span class="schedteam-text">
        <span class="schedteam-side" title="${escape(roleTitle)}">${roleLabel}</span>
        <span class="schedteam-name">${escape(name)}</span>
      </span>
      ${hasPossession ? '<span class="poss-dot" title="Has possession" aria-label="Has possession"></span>' : ''}
      <span class="schedteam-score">${score == null ? '' : score}</span>
    </div>`;
}

function statusText(g) {
  // Not escaped here — formatKickoff returns markup and escapes its own parts.
  if (g.state === 'pre') return formatKickoff(g.kickoff);

  if (g.state === 'in') {
    const q = g.period > 4 ? 'OT' : `Q${g.period}`;
    return `<span class="live-dot"></span>${escape(g.clock ? `${q} ${g.clock}` : q)}`;
  }

  // ESPN says "Final/OT" for overtime finishes; keep its wording.
  return escape(g.detail?.startsWith('Final') ? g.detail : 'Final');
}

/** Secondary line under the clock. Returns '' when there is nothing to say —
 *  gameCard() then omits the element entirely rather than rendering a blank
 *  line, so a pre-game card and a final card stay the same height. */
function metaText(g) {
  if (g.state === 'in') {
    // Broadcast is dropped once a game is live: down-and-distance is what you
    // are looking at the card for, and the narrow centre column can't carry
    // both without wrapping.
    const bits = [g.downDistance, g.redZone ? 'Red zone' : null];
    return escape(bits.filter(Boolean).join(' · '));
  }
  if (g.state === 'pre') return escape(g.broadcast || '');
  if (g.winner === 'tie') return 'Tie';
  return '';
}

function byeLine() {
  if (!view.byes.length) return '';
  return `
    <div class="daygroup">
      <h3>On bye</h3>
      <p class="lede bye-list">${view.byes.map(escape).join(' · ')}</p>
    </div>`;
}

function paintLivePill() {
  const pill = el('sched-live');
  if (!pill) return;

  const live = anyLive(view.games);
  pill.hidden = !live;
  pill.className = live ? 'pill pill-live' : 'pill';
  pill.innerHTML = live ? '<span class="live-dot"></span>Live' : '';
}

/** Only touches one text node, so it can tick every few seconds without
 *  fighting the render or losing scroll position. */
function paintFreshness() {
  const node = el('sched-ago');
  if (!node || !view) return;

  if (!view.fetchedAt) {
    node.textContent = 'Committed schedule';
    return;
  }

  const secs = Math.max(0, Math.round((Date.now() - new Date(view.fetchedAt)) / 1000));
  node.textContent =
    secs < 10 ? 'Just now'
    : secs < 90 ? `${secs}s ago`
    : `${Math.round(secs / 60)}m ago`;
}

function offlineNote() {
  return `
    <p class="lede sched-offline">
      Live scores unavailable right now — showing the committed schedule.
      Scores fill in from ESPN when the connection returns.
    </p>`;
}

function emptyState(year) {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">The season</p>
        <h2>Schedule</h2>
      </div>
    </div>
    <div class="notice">
      <strong>No schedule for ${escape(year)} yet.</strong><br />
      <code>data/schedule-${escape(year)}.json</code> is written by
      <code>scripts/fetch_schedule.py</code>, and refreshed weekly by
      <code>.github/workflows/fetch-schedule.yml</code>.
      <br /><br />
      To build it now:
      <br /><code>python scripts/fetch_schedule.py ${escape(year)}</code>
    </div>`;
}

/* ── Formatting ───────────────────────────────────────────────────────── */

function weekdayOf(iso) {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
}

/** Earliest kickoff in a day group, for ordering. Games with no kickoff sort
 *  last rather than to the epoch. */
function firstKickoff(games) {
  const times = games
    .map((g) => (g.kickoff ? new Date(g.kickoff).getTime() : NaN))
    .filter(Number.isFinite);
  return times.length ? Math.min(...times) : Infinity;
}

/** " · Sep 13" after the weekday, so a week that straddles a month is
 *  unambiguous without repeating the date on every single game row. */
function dayDateSuffix(games) {
  const iso = games.find((g) => g.kickoff)?.kickoff;
  if (!iso) return '';
  const d = new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return ` <span class="daygroup-date">${escape(d)}</span>`;
}

/**
 * Kickoff time with the zone in its own span.
 *
 * Split so CSS can drop the zone at phone widths. It costs ~26px, and the
 * centre column's width comes straight out of the two team columns either side
 * of it — with "EDT" showing, "Commanders" (91px at 15px) doesn't fit the ~82px
 * left for a name at 375px, and CLAUDE.md's rule is that no team name
 * truncates on a phone. The date is already on the day header, and the time is
 * rendered in the reader's own zone, so the label is the least useful thing on
 * the card to spend that space on.
 */
function formatKickoff(iso) {
  if (!iso) return 'TBD';

  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).formatToParts(new Date(iso));

  // Everything up to the zone, literals included — the ":" between hour and
  // minute is a literal part, so filtering those out would render "100 PM".
  const tz = parts.findIndex((p) => p.type === 'timeZoneName');
  const zone = tz >= 0 ? parts[tz].value : '';
  const time = (tz >= 0 ? parts.slice(0, tz) : parts).map((p) => p.value).join('').trim();

  return `${escape(time)}${zone ? ` <span class="kick-tz">${escape(zone)}</span>` : ''}`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
