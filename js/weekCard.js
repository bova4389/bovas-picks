/* ==========================================================================
   Picks — the week's card, all four pools at once.

   The render half of js/weekCardModel.js, which holds every number on this
   tab. Same split as grid.js / gridModel.js and planning.js / planModel.js:
   no arithmetic worth the name here, no DOM or colors there.

   ── WHY THIS TAB HAS NO POOL SWITCHER, AND MUST NOT GROW ONE ─────────────

   Every other survivor view is scoped to `activePool()`. This one is the
   question you cannot ask a pool at a time -- four formats, four used-team
   boards, four submissions, and how correlated those four tickets are. A
   switcher here would turn it back into Planning with extra steps, and the
   cross-pool exposure line, which is the only thing on this site that
   answers "am I about to lose everything on one game", would have nothing
   to measure.

   Changing the pool on the Grid or Planning therefore does NOT change what
   this shows. That is the design, not an oversight.

   ── WHAT IT SHOWS WHEN IT IS NOT SURE, WHICH IS MOST OF THE WEEK ─────────

   The card is stamped Provisional / Firming / Final and is NEVER hidden.
   Mike's pool locks at midnight Saturday, before Sunday inactives post, so
   Saturday morning is the decision point and everything earlier is a draft.
   SURVIVOR-STRATEGY.md §2 confirms there is no late-information edge to wait
   for -- so a labeled draft on Tuesday is strictly better than an empty tab,
   and the change banner is what makes the draft safe to act on early.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

import { SEASON, getSchedule, getProjections, getOddsSnapshot } from './data.js';
import { auditSurvivorFeeds } from './season.js';
import { seasonBanner, isBlocked } from './seasonBanner.js';
import { buildGrid } from './gridModel.js';
import { currentWeek as currentWeekOf } from './gameState.js';
import { LEAGUES, loadLeagueState, usedTeams } from './survivorLeagues.js';
import {
  buildWeekCard, cardForLog, diffCards, modeledShare, loggedPicksFor, FLOOR, MIN_BOOKS,
} from './weekCardModel.js';
import { ABBR_TO_MASCOT } from './teams.js';

const S = {
  root: null, season: SEASON, model: null, projections: null, odds: null,
  audit: null, week: null, weeks: [], now: 1, card: null, changed: null, log: null,
};

/* ── Boot ─────────────────────────────────────────────────────────────────*/

export async function initWeekCard(root, season = SEASON) {
  if (!root) return;
  S.root = root;
  S.season = season;

  const [schedule, projections, odds, log] = await Promise.all([
    getSchedule(season), getProjections(season), getOddsSnapshot(), getLog(season),
  ]);

  S.projections = projections;
  S.odds = odds;
  S.log = log;
  S.audit = auditSurvivorFeeds({ season, schedule, odds, projections });

  if (!schedule?.games?.length) { root.innerHTML = head() + missing('schedule', season); return; }
  if (!projections?.teamOutlook) { root.innerHTML = head() + missing('projections', season); return; }
  if (!odds?.events?.length) { root.innerHTML = head() + missing('odds', season); return; }

  S.model = buildGrid({ schedule, projections, odds });
  S.weeks = S.model.weeks;
  S.now = currentWeekOf(schedule);
  S.week = S.weeks.includes(S.now) ? S.now : S.weeks[0];

  render();
  wire();
}

/**
 * The committed season log. §7 -- read at boot so a cleared browser does not
 * erase the season's record.
 *
 * Committed entries win for any week EARLIER than the current one, and
 * localStorage wins for the current week. That order is the whole point: the
 * file is written by hand from the copy button, so it is authoritative once
 * a week is settled and necessarily behind for the week in play.
 */
async function getLog(season) {
  try {
    const res = await fetch(`data/survivor-log-${season}.json`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/* ── State ────────────────────────────────────────────────────────────────*/

/** Every pool's board, each from its OWN state. Never merged -- see rule 1 in
 *  weekCardModel.js. */
function boards() {
  return LEAGUES.map((league) => ({
    league,
    used: usedTeams(loadLeagueState(league.id, S.season)),
  }));
}

const storeKey = () => `survivor:card:${S.season}:${S.week}`;

function readStored() {
  try {
    return JSON.parse(localStorage.getItem(storeKey()));
  } catch {
    return null;
  }
}

/** Store the card's SHAPE, not the card. The stored copy exists only to be
 *  diffed against on the next render, and keeping candidate lists and
 *  thresholds in it would mean a threshold change reads as a recommendation
 *  flip on the next load. */
function store(card) {
  try {
    localStorage.setItem(storeKey(), JSON.stringify({
      week: card.week,
      builtAt: card.builtAt,
      picks: card.picks.map((p) => ({
        leagueId: p.leagueId,
        pick: p.pick ? { team: p.pick.team, gap: p.pick.gap, p: p.pick.p } : null,
      })),
    }));
  } catch { /* private browsing -- the banner is what is lost, not the card */ }
}

/* ── Render ───────────────────────────────────────────────────────────────*/

function render() {
  const banner = seasonBanner(S.audit, { context: 'the week card' });

  if (isBlocked(S.audit)) { S.root.innerHTML = head() + banner; return; }

  const previous = readStored();
  const card = buildWeekCard({
    model: S.model, projections: S.projections, odds: S.odds,
    week: S.week, weeks: S.weeks, boards: boards(),
  });

  // Diffed BEFORE the new card is stored, or every render compares a card
  // against itself and no banner can ever fire.
  S.changed = diffCards(previous, card);
  S.card = card;
  store(card);

  S.root.innerHTML = head()
    + banner
    + controls(card)
    + driftWarning()
    + changeBanner(S.changed)
    + poolCards(card)
    + exposureBlock(card)
    + heldBlock(card)
    + logBlock(card);
}

function head() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Survivor</p>
        <h2>Picks</h2>
      </div>
    </div>
    <p class="lede">
      One pick per pool, every pool at once &mdash; and how much of the week rides on the
      same game. The four pools are four different games: what is right in a three-life
      pool of 20 can be wrong in a 235-entry pool with one life on the same Sunday, so
      <strong>nothing here is submitted anywhere as a set</strong>.
      Prices are the market's, at ${MIN_BOOKS}+ books. The week-against-week comparisons are
      modeled and are an <strong>ordering</strong>, never a probability.
    </p>`;
}

function controls(card) {
  const c = card.confidence;
  const spent = boards().reduce((n, b) => n + b.used.size, 0);

  return `
    <div class="planctl">
      <label class="planctl-item">
        <span>Week</span>
        <select id="wc-week">
          ${S.weeks.map((w) => `
            <option value="${w}"${w === S.week ? ' selected' : ''}>Week ${w}${
              w === S.now ? ' &mdash; now' : ''
            }</option>`).join('')}
        </select>
      </label>
      <span class="wc-state is-${c.state}" title="${esc(c.basis)}">${esc(c.label)}</span>
      <p class="planctl-note">
        ${esc(c.basis)}
        <span class="planctl-spent">${spent} spent across four pools</span>
      </p>
    </div>`;
}

/* ── Drift between the committed log and a hand-kept board ────────────────*/

/**
 * The one place the automation can be wrong, said out loud.
 *
 * The odds workflow rebuilds this card on every snapshot and commits the
 * result, and for the three Sleeper pools it reads my actual picks back from
 * the pool, so those cannot drift. Mike's has no feed and the mailed workbook
 * carries no flag saying which entry is mine, so CI has nothing to go on but
 * the log's own history -- which records what was RECOMMENDED, not what was
 * submitted.
 *
 * Follow the card and the two agree forever. Deviate once and they part, and
 * the failure is silent in the worst way: CI keeps recommending teams that are
 * already spent, and every number it prints about them is confident and wrong.
 *
 * The browser is the only place that knows the truth, so this is where the
 * mismatch has to be caught. It is a prompt to fix the log, not an error --
 * the local board is right and the file is behind it.
 */
function driftWarning() {
  const rows = [];

  for (const league of LEAGUES) {
    // Pools with a live feed cannot drift; their used-set comes from the pool.
    if (league.sleeper) continue;

    const logged = loggedPicksFor(S.log, league.id);
    const mine = loadLeagueState(league.id, S.season).picks || {};

    // ONLY WEEKS ALREADY BEHIND US. The log has no entry for the week being
    // decided -- CI writes it as the week runs -- so comparing this week would
    // report a disagreement the moment a pick is recorded, every single week,
    // and a warning that always fires is one nobody reads on the week it is
    // real.
    const weeks = new Set([
      ...logged.keys(),
      ...Object.keys(mine).map(Number),
    ].filter((w) => Number.isFinite(w) && w < S.week));

    const conflicts = [];
    for (const w of [...weeks].sort((a, b) => a - b)) {
      const was = logged.get(w) || null;
      const is = mine[String(w)] || null;
      if (was !== is) conflicts.push({ week: w, logged: was, mine: is });
    }

    if (conflicts.length) rows.push({ league, conflicts });
  }

  if (!rows.length) return '';

  return `
    <div class="wc-drift" role="status">
      <strong>The committed log disagrees with your board</strong>
      <ul>
        ${rows.map((r) => `
          <li><b>${esc(r.league.short)}:</b>
            ${r.conflicts.map((c) => `week ${c.week} &mdash;
              log says ${c.logged ? esc(mascot(c.logged)) : 'nothing'},
              your board says ${c.mine ? esc(mascot(c.mine)) : 'nothing'}`).join('; ')}.</li>`).join('')}
      </ul>
      <p>
        ${rows.map((r) => esc(r.league.short)).join(' and ')}
        ${rows.length === 1 ? 'has' : 'have'} no live feed, so the automation carries
        used teams forward from what the log says was <em>recommended</em> &mdash; which is not
        always what was <em>submitted</em>. <b>Your board is the truth and the file is behind
        it.</b> Fix the team names in <code>data/survivor-log-${S.season}.json</code> and commit,
        or this tab will keep offering teams that are already gone.
      </p>
    </div>`;
}

/* ── The change banner ────────────────────────────────────────────────────*/

/**
 * §6, and the highest-value thing on the tab.
 *
 * Only a CHANGED RECOMMENDATION appears here. A price that drifted a tenth of
 * a point is not news, and a banner that fires every three hours is a banner
 * nobody reads by Week 3 -- which would cost exactly the week it mattered.
 */
function changeBanner(changed) {
  if (!changed) return '';

  return `
    <div class="wc-changed" role="status">
      <strong>Changed since ${esc(stamp(changed.since))}</strong>
      <ul>
        ${changed.flips.map((f) => {
          const L = LEAGUES.find((l) => l.id === f.leagueId);
          const why = (f.gapWas != null && f.gapNow != null)
            ? ` &mdash; gap ${f.gapWas > f.gapNow ? 'narrowed' : 'widened'}
                ${pts(f.gapWas)} &rarr; ${pts(f.gapNow)}`
            : '';
          return `<li><b>${esc(L?.short || f.leagueId)}:</b>
            ${esc(mascot(f.from) || 'nothing')} &rarr;
            <b>${esc(mascot(f.to) || 'nothing')}</b>${why}</li>`;
        }).join('')}
      </ul>
    </div>`;
}

/* ── The four pool cards ──────────────────────────────────────────────────*/

function poolCards(card) {
  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">Week ${card.week} &middot; four pools</p>
          <h3>What to submit</h3>
        </div>
        ${card.exposure ? `<span class="pill${card.exposure.games > 1 ? ' ok' : ' warn'}">${
          esc(card.exposure.label)} exposure</span>` : ''}
      </div>
      <div class="wc-pools">
        ${card.picks.map((p) => poolCard(p, card)).join('')}
      </div>
      <p class="plannote">
        A pick must clear the market's ${pct(FLOOR)} floor on a ${MIN_BOOKS}+ book line
        &mdash; SURVIVOR-STRATEGY.md's test, and a market test only. <b>Gap</b> is points
        behind the best team still available <em>on that pool's own board</em>, so the same
        team can carry a different gap in two pools.
      </p>
    </section>`;
}

function poolCard(entry, card) {
  const L = LEAGUES.find((l) => l.id === entry.leagueId);
  const p = entry.pick;

  if (!p) {
    return `
      <article class="wc-pool is-empty">
        ${poolHead(L, entry)}
        <p class="wc-empty">${
          entry.empty === 'no-candidate'
            ? `No team on this board clears the ${pct(FLOOR)} floor this week.`
            : `Nothing is inside this pool's ${pts(entry.band)} band.`
        }</p>
        <p class="wc-why">
          The floor is not relaxed to fill the slot. A pick below it is a pick the
          strategy says not to make, and printing one anyway would be the tab
          disagreeing with itself.
        </p>
      </article>`;
  }

  const dup = card.exposure?.byGame.find((g) => String(g.gameId) === String(p.gameId));
  const shared = dup && dup.pools.length > 1;

  return `
    <article class="wc-pool">
      ${poolHead(L, entry)}
      <p class="wc-pick">
        <b>${esc(mascot(p.team))}</b>
        <span class="wc-opp">${p.isHome ? 'vs' : 'at'} ${esc(mascot(p.opp))}</span>
      </p>
      <p class="wc-price">
        <span class="planrow-pct is-market">${pct(p.p)}</span>
        <span class="planrow-src">market &middot; ${p.books} books</span>
      </p>
      <dl class="wc-facts">
        <div><dt>Gap</dt><dd>${p.gap > 0.0005 ? pts(p.gap) : 'the chalk'}</dd></div>
        <div><dt>Costs later</dt><dd class="${p.fvCost > 0.05 ? 'is-dear' : p.fvCost <= 0 ? 'is-free' : ''}">${
          p.fvCost == null ? 'no model line'
            : p.fvCost <= 0 ? 'nothing &mdash; best spot left'
            : `${pts(p.fvCost)} (w${p.bestWeek})`
        }</dd></div>
        <div><dt>Field share</dt><dd>${shareCell(entry, p)}</dd></div>
      </dl>
      <p class="wc-why">${reasonFor(entry, L)}</p>
      ${entry.swapped ? `
        <p class="wc-swap">
          Split off ${esc(mascot(entry.swapped.from.team))}, which
          ${esc(LEAGUES.find((l) => l.id === biggerPoolOn(card, entry.swapped.from.team))?.short || 'the bigger pool')}
          is carrying. ${esc(swapWhy(entry.swapped))}
        </p>` : ''}
      ${shared ? `
        <p class="wc-shared">Also picked in ${
          dup.pools.filter((id) => id !== entry.leagueId)
            .map((id) => esc(LEAGUES.find((l) => l.id === id)?.short || id)).join(', ')
        }.</p>` : ''}
    </article>`;
}

function poolHead(L, entry) {
  return `
    <header class="wc-pool-head">
      <b>${esc(L.short)}</b>
      <span>${L.entrants} ${L.entrants === 1 ? 'entry' : 'entries'} &middot;
        ${L.lives} ${L.lives === 1 ? 'life' : 'lives'}${
          L.economics?.potShare === 0.5 ? ' &middot; half pot' : ''
        }</span>
    </header>`;
}

/**
 * Pick share, and the label is the point.
 *
 * A MODELED share is shown for context and wears the same dotted underline a
 * modeled probability wears everywhere on this site. It is never what ranked
 * the pick -- see pickFor() in the model on why a modeled share cannot
 * produce a contrarian pick at all.
 */
function shareCell(entry, p) {
  if (entry.share != null) {
    return `<span class="wc-share is-measured">${pct(entry.share)}</span>
            <span class="planrow-src">measured</span>`;
  }
  const est = modeledShare(p.p);
  return est == null ? '&mdash;' : `
    <span class="wc-share is-modeled" title="Modeled, not measured — see the note below">${pct(est)}</span>
    <span class="planrow-src">modeled</span>`;
}

/** One line saying why this pool picked this team, in the pool's own terms. */
function reasonFor(entry, L) {
  if (entry.basis === 'leverage') {
    return `Ranked on leverage &mdash; ${pct(entry.pick.p)} against a measured
      ${pct(entry.share)} of the field, in a pool of ${L.entrants} where a fade
      actually buys something.`;
  }
  if (entry.basis === 'future-value') {
    return `One life among ${L.entrants}, so this pool runs to Week&nbsp;10+ and future value
      leads. <b>No measured pick share exists for this week</b> &mdash; the field's picks arrive
      after kickoff &mdash; and a modeled share is a function of the price, so it would only
      re-derive the favorite. Ranked on what is cheapest to spend inside the
      ${pts(entry.band)} band instead.`;
  }
  return `${L.entrants} entries and ${L.lives} lives: too few rivals for a fade to buy
    anything, so this is close to pure win probability, with future value as the
    tie-break.${entry.band < 0.05 ? ` The band is tightened to ${pts(entry.band)} here
    because half the pot goes to charity, which makes a buy-back ~8% of the playable
    money rather than ~1%.` : ''}`;
}

function swapWhy(swap) {
  if (swap.clause === 'near-free') {
    return `The two are ${pts(swap.costPts)} apart, so the split costs almost nothing
      and roughly quarters the chance both tickets die on the same Sunday.`;
  }
  if (swap.clause === 'dead-weight') {
    return `This team has no better spot left all season, so spending it here costs
      nothing later and keeps the other pool's team available for its own best week.`;
  }
  return `Costs ${pts(swap.fvSaved)} less in future value, so the split both decorrelates
    the two tickets and burns the team with less of a season ahead of it &mdash; at
    ${pts(swap.costPts)} of win probability.`;
}

/** Which same-format pool kept the duplicate, for the swap note. */
function biggerPoolOn(card, team) {
  return card.picks.find((p) => p.pick?.team === team && !p.swapped)?.leagueId || null;
}

/* ── Exposure ─────────────────────────────────────────────────────────────*/

function exposureBlock(card) {
  const e = card.exposure;
  if (!e) return '';


  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">Correlation</p>
          <h3>How much rides on one game</h3>
        </div>
        <span class="pill${e.games > 1 ? ' ok' : ' warn'}">${esc(e.label)}</span>
      </div>
      <div class="planwall">
        ${e.byGame.map((g) => `
          <div class="planwall-col">
            <p class="wc-exp-teams">${g.teams.map((t) => esc(mascot(t))).join(' / ')}</p>
            <p class="wc-exp-p">${pct(g.p)}</p>
            <p class="wc-exp-pools">${g.pools.map((id) =>
              esc(LEAGUES.find((l) => l.id === id)?.short || id)).join(', ')}</p>
          </div>`).join('')}
      </div>
      <p class="wc-exp-line">
        ${e.tickets} tickets across <b>${e.games} ${e.games === 1 ? 'game' : 'games'}</b>.
        All four lose <b>${pct1(e.pAllLose)}</b> of the time; at least one survives
        ${pct1(e.pAnySurvives)}.
        ${e.games > 1
          ? `Carrying one team in all four would have been ${pct1(e.pAllLoseIfSingle)} &mdash;
             so the split cuts the joint-wipeout risk by roughly
             ${(e.pAllLoseIfSingle / e.pAllLose).toFixed(1)}x.`
          : `<b>Every ticket is on the same game.</b> One result takes all four pools at once,
             and nothing on this board was close enough to split off.`}
      </p>
      <p class="plannote">
        Multiplied as independent events, which they are not &mdash; games in one week share
        weather, officiating and league-wide variance. There is no way to estimate that
        correlation from anything this site holds, so the number is computed the simple way
        and labeled rather than adjusted by a fudge factor that would look more careful and
        be less true. Read it as a floor on the joint risk, not a measurement.
      </p>
    </section>`;
}

/* ── Held ─────────────────────────────────────────────────────────────────*/

/**
 * Teams that cleared the floor and are going nowhere.
 *
 * Named out loud rather than left as an absence. "DET is held because Week 3
 * is a better spot" is a decision the card made, and a card that lists only
 * what it spent looks like it never considered the rest.
 */
function heldBlock(card) {
  if (!card.held.length) return '';

  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">Above the floor, not spent</p>
          <h3>Held</h3>
        </div>
      </div>
      <ol class="planlist">
        ${card.held.map((h) => `
          <li class="planrow ${h.fvCost > 0.05 ? 'cost-dear' : 'cost-mid'}">
            <span class="planrow-team">
              <strong>${esc(mascot(h.team))}</strong>
              <span class="planrow-opp">${h.isHome ? 'vs' : 'at'} ${esc(mascot(h.opp))}</span>
            </span>
            <span class="planrow-price">
              <span class="planrow-pct is-market">${pct(h.p)}</span>
              <span class="planrow-src">market</span>
            </span>
            <span class="planrow-cost">
              <span class="planrow-cost-v">${h.fvCost == null ? '&mdash;' : pts(h.fvCost)} better later</span>
              <span class="planrow-src">week ${h.bestWeek ?? '?'}</span>
            </span>
          </li>`).join('')}
      </ol>
      <p class="plannote">
        Available in every pool that has not spent them, and worth more later than this
        week's price. The comparison is modeled &mdash; it says which week is the better
        spot, not what either week's probability is.
      </p>
    </section>`;
}

/* ── The log ──────────────────────────────────────────────────────────────*/

/**
 * §7, and it keeps itself.
 *
 * `.github/workflows/fetch-odds.yml` runs `scripts/log_week_card.mjs` on every
 * odds snapshot -- eight times a day Thursday to Saturday, once daily
 * otherwise -- rebuilding this card with the same model and committing the
 * result. Nothing here has to be done by hand for the record to exist.
 *
 * A FINAL ENTRY IS FROZEN once written, so Saturday's card is what the season
 * remembers, and the Sunday runs cannot rewrite it on post-lock prices.
 *
 * The copy button stays as the manual path -- for a week CI missed, for a
 * correction, and for the case where the recommendation was not what was
 * actually submitted. It is a fallback now rather than the weekly routine it
 * used to be.
 */
function logBlock(card) {
  const weeks = Object.keys(S.log?.weeks || {}).length;

  return `
    <section class="card planblock">
      <div class="section-head">
        <div>
          <p class="eyebrow">The record</p>
          <h3>Log this week</h3>
        </div>
        <span class="pill${weeks ? ' ok' : ''}">${
          weeks ? `${weeks} ${weeks === 1 ? 'week' : 'weeks'} committed` : 'automated'
        }</span>
      </div>
      <p class="lede">
        <b>This writes itself.</b> The odds workflow rebuilds this card on every snapshot and
        commits <code>data/survivor-log-${S.season}.json</code> &mdash; eight times a day
        Thursday to Saturday, once daily otherwise &mdash; using the same model this page runs.
        Saturday's card is frozen once written, so the season remembers what stood at the
        deadline rather than what the odds did afterward.
        Copy below only to correct a week, or to fill one CI missed.
      </p>
      <div class="wc-logbar">
        <button type="button" class="btn" id="wc-copy">Copy week ${card.week} as JSON</button>
        <span class="wc-copied" id="wc-copied" hidden>Copied</span>
      </div>
      <pre class="wc-json" id="wc-json">${esc(JSON.stringify(logEntry(card), null, 2))}</pre>
    </section>`;
}

function logEntry(card) {
  const teamsLeft = new Map(boards().map((b) => [b.league.id, 32 - b.used.size]));
  return { [String(card.week)]: cardForLog(card, { teamsLeft }) };
}

/* ── Wiring ───────────────────────────────────────────────────────────────*/

function wire() {
  S.root.addEventListener('change', (e) => {
    if (e.target.id !== 'wc-week') return;
    S.week = Number(e.target.value);
    render();
  });

  S.root.addEventListener('click', async (e) => {
    if (!e.target.closest('#wc-copy')) return;

    const text = document.getElementById('wc-json')?.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard permission can be refused, and an unreachable button is
      // worse than a manual copy -- select the block so Ctrl+C still works.
      const pre = document.getElementById('wc-json');
      if (pre) {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
    const flag = document.getElementById('wc-copied');
    if (flag) { flag.hidden = false; setTimeout(() => { flag.hidden = true; }, 2000); }
  });

  // The Grid owns the Sleeper refresh and both it and Planning can spend a
  // team while this panel is hidden. Re-read every board on the way in rather
  // than holding the copy taken at boot -- a team spent elsewhere is a team
  // this tab would otherwise recommend twice.
  document.addEventListener('panelchange', (e) => {
    if (e.detail?.panel !== 'picks' || !S.model) return;
    render();
  });
}

/* ── Formatting ───────────────────────────────────────────────────────────*/

const mascot = (abbr) => ABBR_TO_MASCOT[abbr] || abbr;
const pct = (p) => (p == null ? '&mdash;' : `${Math.round(p * 100)}%`);
const pct1 = (p) => (p == null ? '&mdash;' : `${(p * 100).toFixed(1)}%`);

/** A difference between two probabilities, in points. The compressed scale
 *  makes decimals meaningless below a point, so gaps round to one. */
const pts = (d) => (d == null ? '&mdash;' : `${(Math.abs(d) * 100).toFixed(1)} pts`);

function stamp(iso) {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : 'the last card';
}

function missing(feed, season) {
  const what = {
    schedule: { title: `No ${season} schedule`, how: `python scripts/fetch_schedule.py ${season}` },
    projections: { title: `No ${season} projections`, how: `python scripts/build_projections.py ${season}` },
    odds: { title: 'No odds snapshot', how: 'ODDS_API_KEY=xxxxx python scripts/fetch_odds.py' },
  }[feed];

  return `
    <div class="notice">
      <strong>${esc(what.title)} &mdash; the week card needs it.</strong>
      <p class="notice-hint">
        Every pick here is a market price tested against the ${pct(FLOOR)} floor, ordered by a
        modeled future value. Without all three feeds the tab would be guessing, so it says so
        instead. Build it with <code>${esc(what.how)}</code>.
      </p>
    </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
