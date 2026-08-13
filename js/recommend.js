/* ==========================================================================
   Recommend — the leverage calculation STRATEGY.md §4 Step 4 describes.

       leverage = win_probability / estimated_pick_share

   Win probability comes from the Odds tab's snapshot (de-vigged moneyline).
   Pick share comes from scripts/parse_pool_picks.py's popularity output —
   the actual field, not a national proxy. That file only exists for weeks
   the commissioner has already mailed (usually after Sunday kickoff), so
   for an upcoming week this tab is often working from win probability alone
   until that lands. It says so rather than guessing at a popularity number.
   ========================================================================== */

import {
  SEASON, tryNumberMap, weekNumbers, scoredGames, getPopularity, getOddsSnapshot,
  getSeasonAudit,
} from './data.js';
import { buildOddsIndex, matchOdds, orientProbs } from './oddsMatch.js';
import { seasonBanner, isBlocked } from './seasonBanner.js';

// STRATEGY.md §4 Step 4.
const FLOOR = 0.38;
const SWEET_LO = 0.40;
const SWEET_HI = 0.47;

let map = null;
let week = null;
let snapshot = null;

const el = (id) => document.getElementById(id);

export async function initRecommend(root) {
  map = await tryNumberMap();

  // This tab is the one that produced confident, meaningless numbers by
  // joining one season's field popularity to another season's odds. It gets
  // the strictest gate in the project: no sheet for the active season, no
  // leverage at all. See js/season.js.
  if (!map || map.year !== SEASON) {
    root.innerHTML = shellHead() + seasonBanner(await getSeasonAudit(), {
      context: 'a leverage ranking',
    });
    return;
  }
  snapshot = await getOddsSnapshot();

  const weeks = weekNumbers(map);
  week = weeks[0];

  root.innerHTML = shell(weeks);
  el('rec-week-select').addEventListener('change', async (e) => {
    week = Number(e.target.value);
    await render();
  });
  await render();
}

function shellHead() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Leverage</p>
        <h2>Recommend</h2>
      </div>
    </div>`;
}

function shell(weeks) {
  return `
    ${shellHead()}
    <div class="card controls">
      <div class="field">
        <label for="rec-week-select">Week</label>
        <select id="rec-week-select">
          ${weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="rec-body"></div>`;
}

async function render() {
  el('rec-week-select').value = week;
  const body = el('rec-body');

  // Re-audited per week, not just at boot: the popularity file is per-week,
  // so week 3 can be clean while week 1 still holds last season's parse. This
  // is the check that actually stops the wrong-answer case.
  const audit = await getSeasonAudit(week);
  if (isBlocked(audit)) {
    body.innerHTML = seasonBanner(audit, { context: 'a leverage ranking' });
    return;
  }

  if (!snapshot) {
    body.innerHTML = notice(`
      <strong>No odds snapshot yet.</strong> Leverage needs a market win
      probability for every game — see the Odds tab for how to generate one.
    `);
    return;
  }

  const games = scoredGames(map, week);
  const pop = await getPopularity(week);
  const oddsIndex = buildOddsIndex(snapshot.events);
  const rows = games.map((g) => buildRow(g, oddsIndex, pop));
  const withOdds = rows.filter((r) => r.ev);

  body.innerHTML = `
    ${pop ? '' : notice(`
      <strong>No pick-popularity file for Week ${week} yet.</strong>
      <code>data/popularity/pop-${SEASON}-w${String(week).padStart(2, '0')}.json</code> is
      written by <code>scripts/parse_pool_picks.py</code> once the commissioner's
      weekly-picks workbook is out — usually after Sunday kickoff. Win probabilities
      below are real; leverage can't be ranked until pick share lands, so this shows
      live underdogs by win probability alone.
    `)}
    ${rankedSection(withOdds, !!pop)}
    <div class="daygroup"><h3>Full slate</h3></div>
    ${rows.map(recRow).join('')}`;
}

function rankedSection(withOdds, havePop) {
  if (havePop) {
    const candidates = withOdds
      .filter((r) => r.leverage != null && r.underdogProb >= FLOOR)
      .sort((a, b) => b.leverage - a.leverage);
    if (!candidates.length) {
      return notice('No underdog clears the 38% floor this week — take the chalk (STRATEGY.md §4 Step 6).');
    }
    return `
      <div class="daygroup"><h3>Ranked by leverage</h3></div>
      ${candidates.map(recRow).join('')}`;
  }

  const liveDogs = withOdds
    .filter((r) => r.underdogProb != null && r.underdogProb >= FLOOR)
    .sort((a, b) => b.underdogProb - a.underdogProb);
  if (!liveDogs.length) {
    return notice('No underdog clears the 38% floor this week — take the chalk (STRATEGY.md §4 Step 6).');
  }
  return `
    <div class="daygroup"><h3>Live underdogs — win probability only</h3></div>
    ${liveDogs.map(recRow).join('')}`;
}

function buildRow(g, oddsIndex, pop) {
  const ev = matchOdds(g, oddsIndex);
  const popGame = pop ? pop.games.find((p) => p.awayNum === g.awayNum) : null;
  const { awayProb, homeProb } = orientProbs(g, ev);

  let underdogSide = null;
  let underdogProb = null;
  let underdogPct = null;
  let leverage = null;
  if (awayProb != null && homeProb != null) {
    underdogSide = awayProb <= homeProb ? 'away' : 'home';
    underdogProb = underdogSide === 'away' ? awayProb : homeProb;
    if (popGame) {
      underdogPct = underdogSide === 'away' ? popGame.awayPct : popGame.homePct;
      if (underdogPct > 0) leverage = underdogProb / (underdogPct / 100);
    }
  }

  return { game: g, ev, awayProb, homeProb, underdogSide, underdogProb, underdogPct, leverage };
}

function recRow(r) {
  const g = r.game;
  if (!r.ev) {
    return `
      <div class="card oddsgame">
        <div class="oddsgame-teams">
          <div class="oddsteam"><span class="oddsteam-name">${escape(g.away)}</span></div>
          <div class="oddsteam oddsteam-home"><span class="oddsteam-name">${escape(g.home)}</span></div>
        </div>
        <div class="oddsgame-meta"><span>No market line yet</span></div>
      </div>`;
  }

  const awayPct = Math.round(r.awayProb * 100);
  const homePct = 100 - awayPct;
  const isCandidate = r.leverage != null && r.underdogProb >= FLOOR;
  const sweet = r.underdogProb >= SWEET_LO && r.underdogProb <= SWEET_HI;
  const underdogName = r.underdogSide === 'away' ? g.away : g.home;

  let metaRight = '';
  if (r.leverage != null) {
    metaRight = `<span class="leverage-score${isCandidate ? ' ok' : ''}">${r.leverage.toFixed(2)}x leverage${sweet ? ' · sweet spot' : ''}${!isCandidate ? ' · below floor' : ''}</span>`;
  } else if (r.underdogProb != null && r.underdogProb >= FLOOR) {
    metaRight = `<span class="leverage-score ok">${Math.round(r.underdogProb * 100)}% dog${sweet ? ' · sweet spot' : ''}</span>`;
  }

  return `
    <div class="card oddsgame${isCandidate ? ' is-candidate' : ''}">
      <div class="oddsgame-teams">
        <div class="oddsteam">
          <span class="oddsteam-name">${escape(g.away)}</span>
          <span class="oddsteam-pct">${awayPct}%</span>
        </div>
        <div class="oddsteam oddsteam-home">
          <span class="oddsteam-name">${escape(g.home)}</span>
          <span class="oddsteam-pct">${homePct}%</span>
        </div>
      </div>
      <div class="prob-bar" role="img" aria-label="${escape(g.away)} ${awayPct}%, ${escape(g.home)} ${homePct}%">
        <div class="prob-seg prob-away" style="width:${awayPct}%"></div>
        <div class="prob-seg prob-home" style="width:${homePct}%"></div>
      </div>
      <div class="oddsgame-meta">
        <span>${r.underdogPct != null
          ? `${escape(underdogName)} picked by ${r.underdogPct}% of the field`
          : (r.underdogProb != null ? `${escape(underdogName)} is the underdog` : '')}</span>
        ${metaRight}
      </div>
    </div>`;
}

function notice(html) {
  return `<div class="notice">${html}</div>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
