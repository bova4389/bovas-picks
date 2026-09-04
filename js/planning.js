/* ==========================================================================
   Survivor Planning — the spend-now-or-hold decision.

   The Grid answers "what can I spend, and when", one cell at a time. This
   answers the question SURVIVOR-STRATEGY.md §1 says is the real one:

     "The real question is never 'who wins this week' but 'is this the best
      week I will ever get to spend this team?'"

   Three blocks, each straight out of §1 "Future value":

     Shortlist     what I can spend this week, and what spending it costs
     The wall      the next four weeks, counted in teams I still hold
     Elite budget  where each team's one best spot falls across the season

   ── WHY THE NUMBERS LOOK MIXED, AND WHY THAT IS CORRECT ─────────────────

   Two probability sources are on screen at once and they are NOT
   interchangeable. §4's compression limit: preseason projections top out
   around 75% and only ~16 games of 272 clear 70%, while the market prices 10
   games at 80%+ and 58 at 70%+. So:

     - The market number is THIS WEEK'S PRICE. It is what the 70% floor is
       tested against, and it is the only number here anyone should read as a
       real probability.
     - The projection is an ORDERING DEVICE. It says Week 11 is a better
       Seattle spot than Week 6. It does not say either is 61%.

   Every "cost to spend now" figure is projection-minus-projection, so both
   ends come off the same compressed scale and the difference means something.
   The market price sits beside it and never enters the subtraction. Mixing
   them would produce a confident, plausible, meaningless number -- the exact
   failure js/season.js exists to prevent, one layer up.

   The model half is js/planModel.js: no DOM, no fetching, no colors there;
   no arithmetic worth the name here.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { SEASON, getSchedule, getProjections, getOddsSnapshot } from './data.js';
import { auditSurvivorFeeds } from './season.js';
import { seasonBanner, isBlocked } from './seasonBanner.js';
import { buildGrid } from './gridModel.js';
import { currentWeek as currentWeekOf } from './gameState.js';
import {
  LEAGUES, leagueById, activePool, setActivePool,
  loadLeagueState, usedTeams, weekUsed,
} from './survivorLeagues.js';
import { shortlist, wallAhead, eliteBudget, budgetByWeek, FLOOR, LOOKAHEAD } from './planModel.js';
import { ABBR_TO_MASCOT } from './teams.js';

const S = {
  root: null, season: SEASON, model: null, projections: null,
  audit: null, pool: null, league: null, week: null, weeks: [], now: 1,
};

/* ── Boot ─────────────────────────────────────────────────────────────────*/

export async function initPlanning(root, season = SEASON) {
  if (!root) return;
  S.root = root;
  S.season = season;
  S.pool = activePool();

  // No field feed here on purpose. Blocks A-C are about MY remaining teams;
  // what the rest of the pool holds is a different question, answered by the
  // pick board and by Recommend. Loading it would be a feed this tab never
  // reads and a second chance to render a stale one.
  const [schedule, projections, odds] = await Promise.all([
    getSchedule(season), getProjections(season), getOddsSnapshot(),
  ]);

  S.projections = projections;
  S.audit = auditSurvivorFeeds({ season, schedule, odds, projections });

  if (!schedule?.games?.length) {
    root.innerHTML = head() + missing('schedule', season);
    return;
  }
  if (!projections?.teamOutlook) {
    // Every block here is built on the projection series. Without it the tab
    // cannot order one week against another at all, which is the whole tab --
    // so it says so rather than rendering three blocks of market-only numbers
    // that look like planning and are not.
    root.innerHTML = head() + missing('projections', season);
    return;
  }

  S.model = buildGrid({ schedule, projections, odds });
  S.weeks = S.model.weeks;
  S.now = currentWeekOf(schedule);
  S.week = S.weeks.includes(S.now) ? S.now : S.weeks[0];

  // Mike's pool ships as a parsed file; Sleeper's is whatever the Grid's
  // Refresh last cached. Planning reads the cache and never fetches -- the
  // Grid owns that button, and two tabs racing the same endpoint is how a
  // half-written feed lands on top of a complete one.
  loadPool();

  render();
  wire();
}

function loadPool() {
  S.league = leagueById(S.pool);
  S.state = loadLeagueState(S.pool, S.season);
}

/* ── Render ───────────────────────────────────────────────────────────────*/

function render() {
  const banner = seasonBanner(S.audit, { context: 'survivor planning' });

  if (isBlocked(S.audit)) {
    S.root.innerHTML = head() + banner;
    return;
  }

  const used = usedTeams(S.state);
  const ctx = { model: S.model, projections: S.projections, week: S.week, used, weeks: S.weeks };

  S.root.innerHTML = head()
    + banner
    + controls()
    + blockShortlist(shortlist(ctx), used)
    + blockWall(wallAhead({ model: S.model, week: S.week, used, weeks: S.weeks }))
    + blockBudget(eliteBudget({
        model: S.model, projections: S.projections, used,
        usedWeek: (t) => weekUsed(S.state, t), weeks: S.weeks, fromWeek: S.week,
      }));
}

function head() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Survivor</p>
        <h2>Planning</h2>
      </div>
    </div>
    <p class="lede">
      One team a week, never twice, and a loss ends the run &mdash; so the question is not who
      wins on Sunday but whether this is the best week you will ever get to spend a team.
      Prices are the market's. The week-against-week comparisons are modeled, and are an
      <strong>ordering</strong>: they say Week&nbsp;11 is a better spot than Week&nbsp;6, not
      that either is 61%.
    </p>`;
}

function controls() {
  return `
    <div class="planctl">
      <label class="planctl-item">
        <span>Pool</span>
        <select id="pl-pool">
          ${LEAGUES.map((l) => `
            <option value="${l.id}"${l.id === S.pool ? ' selected' : ''}>${esc(l.name)}</option>
          `).join('')}
        </select>
      </label>
      <label class="planctl-item">
        <span>Week</span>
        <select id="pl-week">
          ${S.weeks.map((w) => `
            <option value="${w}"${w === S.week ? ' selected' : ''}>Week ${w}${
              w === S.now ? ' — now' : ''
            }</option>
          `).join('')}
        </select>
      </label>
      <p class="planctl-note">
        ${esc(S.league?.note || '')}
        ${S.league ? `<span class="planctl-spent">${usedTeams(S.state).size} of 32 spent</span>` : ''}
      </p>
    </div>`;
}

/* ── Block A: the shortlist ───────────────────────────────────────────────*/

function blockShortlist(rows, used) {
  if (!rows.length) {
    return card('Week ' + S.week, 'Nothing left to spend', `
      <p class="lede">Every team is either used or on bye this week.</p>`);
  }

  const free = rows.filter((r) => r.isBestWeek).length;

  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">Week ${S.week} &middot; ${rows.length} available</p>
          <h3>What this week costs</h3>
        </div>
        ${free ? `<span class="pill ok">${free} at their best week</span>` : ''}
      </div>
      <p class="lede">
        <strong>Cost</strong> is how much better that team's best remaining week looks than this
        one. Zero means this is the best week left to spend it &mdash; a free spend. A big number
        means the team is worth more later, and spending it now burns that.
      </p>
      <ol class="planlist">
        ${rows.map(shortRow).join('')}
      </ol>
      <p class="plannote">
        Sorted by whether the market has the team above ${pct(FLOOR)} &mdash;
        SURVIVOR-STRATEGY.md's floor, and a market test only &mdash; then by cost to spend.
        ${used.size ? `${used.size} used ${used.size === 1 ? 'team is' : 'teams are'} not listed.` : ''}
      </p>
    </section>`;
}

function shortRow(r) {
  const cost = r.holdCost;
  // Banded rather than printed raw. The projection scale is compressed, so
  // three decimal places of a compressed number is false precision -- what is
  // real is "this is cheap to spend" versus "this is expensive".
  const band = cost == null ? 'unknown' : cost <= 0.005 ? 'free' : cost < 0.04 ? 'cheap' : cost < 0.09 ? 'mid' : 'dear';

  return `
    <li class="planrow cost-${band}">
      <span class="planrow-team">
        <strong>${esc(mascot(r.team))}</strong>
        <span class="planrow-opp">${r.isHome ? 'vs' : 'at'} ${esc(mascot(r.opp))}${
          r.divisional ? ' <span class="planrow-div" title="Divisional game">div</span>' : ''
        }</span>
      </span>

      <span class="planrow-price">
        ${priceCell(r)}
      </span>

      <span class="planrow-cost">
        ${costCell(r, band)}
      </span>
    </li>`;
}

/** This week's price. A projected number wears the same dotted underline the
 *  Grid gives it, because it is a far softer claim than a moneyline and the
 *  two must never read alike. */
function priceCell(r) {
  if (r.winProb == null) return `<span class="planrow-none">not priced</span>`;

  const market = r.probSource === 'market';
  const cls = market ? 'is-market' : 'is-proj';
  const floor = r.clearsFloor === true ? 'above floor'
    : r.clearsFloor === false ? 'below floor'
    : 'no market price';

  return `
    <span class="planrow-pct ${cls}" title="${esc(floor)}">${pct(r.winProb)}</span>
    <span class="planrow-src">${market ? 'market' : 'modeled'}</span>`;
}

function costCell(r, band) {
  if (r.holdCost == null) {
    return `<span class="planrow-none">no model line</span>`;
  }
  if (band === 'free') {
    return `
      <span class="planrow-cost-v">best week</span>
      <span class="planrow-src">spend it here</span>`;
  }
  return `
    <span class="planrow-cost-v">+${pts(r.holdCost)}</span>
    <span class="planrow-src">peaks Wk&nbsp;${r.bestWeek}</span>`;
}

/* ── Block B: the wall ────────────────────────────────────────────────────*/

function blockWall(rows) {
  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">Next ${LOOKAHEAD} weeks</p>
          <h3>The wall ahead</h3>
        </div>
      </div>
      <p class="lede">
        Counted in the teams <em>you</em> still hold, which is the only count that matters &mdash;
        a bye-heavy week is not a problem if none of those teams were ever yours to spend.
        Look this far and no further: past four weeks out the model is too noisy to plan against.
      </p>
      <div class="planwall">
        ${rows.map(wallCol).join('')}
      </div>
    </section>`;
}

function wallCol(w) {
  // A week the market has not reached yet has no credible count, and showing
  // that as "0 options" would read as a catastrophe rather than as silence.
  const unpriced = w.priced === 0;
  const tight = !unpriced && w.credible <= 3;

  return `
    <div class="planwall-col ${w.week === S.now ? 'is-now' : ''} ${tight ? 'is-tight' : ''}">
      <p class="planwall-wk">Week ${w.week}${w.week === S.now ? ' <span>now</span>' : ''}</p>
      <p class="planwall-big">${unpriced ? '&mdash;' : w.credible}</p>
      <p class="planwall-lbl">${unpriced ? 'not priced yet' : `above ${pct(FLOOR)}`}</p>
      <p class="planwall-meta">
        ${w.playing} of your ${w.remaining} playing${w.onBye ? ` &middot; ${w.onBye} on bye` : ''}
      </p>
    </div>`;
}

/* ── Block C: the elite budget ────────────────────────────────────────────*/

function blockBudget(rows) {
  const groups = budgetByWeek(rows);
  const early = rows.filter((r) => r.spentEarly);

  if (!groups.length) {
    return card('Elite budget', 'Nothing to map', `
      <p class="lede">No team has a projected week left.</p>`);
  }

  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">Week ${S.week} onward</p>
          <h3>The elite budget</h3>
        </div>
        ${early.length ? `<span class="pill">${early.length} spent early</span>` : ''}
      </div>
      <p class="lede">
        There are only so many good spots in a season, so the elite teams are a budget rather than
        a menu. Each team sits on its single best remaining week. Teams you have already spent stay
        on the map, struck through, on the week their best spot <em>was</em> &mdash; that is how you
        see whether you spent them well.
      </p>
      <div class="planbudget">
        ${groups.map(budgetRow).join('')}
      </div>
    </section>`;
}

function budgetRow(g) {
  return `
    <div class="planbudget-row ${g.week === S.week ? 'is-now' : ''}">
      <p class="planbudget-wk">Wk ${g.week}</p>
      <ul class="planbudget-teams">
        ${g.teams.map(budgetChip).join('')}
      </ul>
    </div>`;
}

function budgetChip(t) {
  const title = t.used
    ? `Spent in Week ${t.usedWeek}${t.spentEarly ? ` — its best spot was Week ${t.bestWeek}` : ''}`
    : `Best remaining spot${t.byeWeek ? `, bye Week ${t.byeWeek}` : ''}`;

  return `
    <li class="planchip ${t.used ? 'is-used' : ''} ${t.spentEarly ? 'is-early' : ''}"
        title="${esc(title)}">
      <span class="planchip-team">${esc(t.team)}</span>
      <span class="planchip-pct">${t.bestProb == null ? '&mdash;' : pct(t.bestProb)}</span>
      ${t.used ? `<span class="planchip-note">wk ${t.usedWeek ?? '?'}</span>` : ''}
    </li>`;
}

/* ── Chrome helpers ───────────────────────────────────────────────────────*/

function card(eyebrow, title, body) {
  return `
    <section class="card planblock">
      <div class="section-head"><div>
        <p class="eyebrow">${esc(eyebrow)}</p><h3>${esc(title)}</h3>
      </div></div>
      ${body}
    </section>`;
}

/**
 * A feed this tab cannot work without.
 *
 * Named rather than generic, and it says what produces the file. "Waiting on
 * data" with no subject is the message that sends you reading source to find
 * out which data.
 */
function missing(feed, season) {
  const what = {
    schedule: {
      title: `No ${season} schedule`,
      how: `python scripts/fetch_schedule.py ${season}`,
    },
    projections: {
      title: `No ${season} projections`,
      how: `python scripts/build_projections.py ${season}`,
    },
  }[feed];

  return `
    <div class="notice">
      <strong>${esc(what.title)} — planning needs it.</strong>
      <p class="notice-hint">
        Every comparison on this tab orders one week against another, and that ordering comes from
        <code>data/${feed === 'schedule' ? `schedule-${season}` : `projections-${season}`}.json</code>.
        Without it the tab would be a list of this week's prices, which is the Odds tab.
        Build it with <code>${esc(what.how)}</code>.
      </p>
    </div>`;
}

/* ── Wiring ───────────────────────────────────────────────────────────────*/

function wire() {
  S.root.addEventListener('change', (e) => {
    const t = e.target;

    if (t.id === 'pl-pool') {
      S.pool = t.value;
      setActivePool(t.value);
      loadPool();
      render();
      return;
    }

    if (t.id === 'pl-week') {
      S.week = Number(t.value);
      render();
    }
  });

  // The Grid can change the pool and can pull a fresh Sleeper feed, and both
  // change what is spent. Re-read on the way in rather than holding a copy
  // taken at boot -- a used team that is not used here is a team this tab
  // would offer twice.
  document.addEventListener('panelchange', (e) => {
    if (e.detail?.panel !== 'survivor' || !S.model) return;

    const pool = activePool();
    if (pool !== S.pool) S.pool = pool;
    loadPool();
    render();
  });
}

/* ── Formatting ───────────────────────────────────────────────────────────*/

const mascot = (abbr) => ABBR_TO_MASCOT[abbr] || abbr;

const pct = (p) => `${Math.round(p * 100)}%`;

/** A difference between two probabilities, in points. The compressed scale
 *  makes a decimal meaningless, so this rounds to whole points. */
const pts = (d) => `${Math.round(d * 100)} pts`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
