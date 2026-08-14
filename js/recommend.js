/* ==========================================================================
   Recommend — STRATEGY.md §4 Steps 2-6, made operable.

       leverage = win_probability / pick_share

   ── What changed, and why the old gate was wrong ─────────────────────────

   This tab used to refuse to render anything without
   data/number-map-<year>.json -- the commissioner's workbook, which arrives
   days before the season. For the whole offseason it showed one line of
   "waiting on 2026 data" while sitting on a complete 272-game schedule and a
   271-event odds snapshot. Everything needed to rank underdogs was already
   here.

   The gate existed for a real reason: this is the tab that once joined 2025
   field popularity to 2026 moneylines and printed a confident, plausible,
   meaningless ranking. But that failure is a CROSS-SEASON JOIN, and the number
   map's absence is not one. The guard is now aimed at the actual hazard --
   getSeasonAudit()'s blocking verdict still stops the tab dead -- while a
   missing workbook costs only the pool's pick numbers, which are a submission
   detail rather than an input to any calculation.

   ── The three things it needs, and where each comes from ─────────────────

     slate        the number map when it exists (pool-specific: which games
                  count, what number to email). Otherwise the schedule feed,
                  which knows every game of the season.
     win prob     the odds snapshot, de-vigged. matchSeasonOdds -- pair AND
                  kickoff -- because a pair-only join collapses both meetings
                  of a division rivalry, and a full-season snapshot contains
                  both. This was measured: the pair-only join returned 21
                  matches for a 16-game week.
     pick share   the measured file where it exists, else js/pickShare.js's
                  model, labelled as modelled everywhere it is shown.

   ── Why it teaches rather than just prints ───────────────────────────────

   STRATEGY.md answers "what is a leverage pick", "how many should I take" and
   "which ones are traps" in detail, and none of it was in the UI -- the tab
   printed a bare `2.1x leverage` next to a game and left the reader to infer a
   strategy from a decimal. The bands, the floor, the dog count and the reason
   a pick qualifies are now rendered next to the number they govern. A number
   nobody can act on is the same as no number: see the Odds tab's API-budget
   pill for the same lesson learned the same way.

   ========================================================================== */

import {
  SEASON, tryNumberMap, weekNumbers, scoredGames, getPopularity, getOddsSnapshot,
  getSeasonAudit, getSchedule, getOddsHistory,
} from './data.js';
import { buildSeasonOddsIndex, matchSeasonOdds, orientProbs } from './oddsMatch.js';
import { seasonBanner, isBlocked } from './seasonBanner.js';
import { ABBR_TO_MASCOT, MASCOT_TO_ABBR } from './teams.js';
import {
  DEFAULT_K, shareFor, leverageFor, fitK, pairsFrom, priorProfile,
} from './pickShare.js';
import { fetchInjuries, forGame, isQB } from './injuries.js';

/* ── The rulebook, straight from STRATEGY.md §4 ───────────────────────────
   Every threshold below is quoted from that document rather than tuned here.
   If one of these needs to change, change it there first -- the doc is the
   authority and this file is its implementation.
   ------------------------------------------------------------------------ */

const FLOOR = 0.38;        // Step 4: "only pick underdogs at >=38% true win probability"
const SWEET_LO = 0.40;     // Step 4: "sweet spot: dogs in the 40-47% band"
const SWEET_HI = 0.47;
const LONGSHOT_SHARE = 0.15; // Step 5: "never take a minority side the field rates below 15%"
const THIN_SHARE = 0.40;     // Step 5: above this the minority side buys little separation

let state = {
  map: null, schedule: null, snapshot: null, seasonIndex: null,
  week: null, weeks: [], k: DEFAULT_K, kSource: 'default', prior: null,
  injuries: null, movement: new Map(),
};

const el = (id) => document.getElementById(id);

/* ── Boot ─────────────────────────────────────────────────────────────────*/

export async function initRecommend(root) {
  const [map, schedule, snapshot, prior] = await Promise.all([
    tryNumberMap(), getSchedule(SEASON), getOddsSnapshot(), priorPopularity(),
  ]);

  state.map = map && map.year === SEASON ? map : null;
  state.schedule = schedule;
  state.snapshot = snapshot;
  state.prior = prior ? priorProfile(prior) : null;
  state.seasonIndex = snapshot ? buildSeasonOddsIndex(snapshot.events) : null;

  state.weeks = state.map ? weekNumbers(state.map) : scheduleWeeks(schedule);
  if (!state.weeks.length) {
    root.innerHTML = shellHead() + notice(`
      <strong>No schedule for ${SEASON} yet.</strong>
      <code>python scripts/fetch_schedule.py ${SEASON}</code> writes
      <code>data/schedule-${SEASON}.json</code>, which every view here is built on.
    `);
    return;
  }

  state.week = state.weeks[0];

  // Fit k ONCE, at boot, over every week that has a measured file. Doing it
  // per render meant ~18 popularity lookups on every week switch, almost all
  // of them misses -- and the answer cannot change between renders anyway,
  // since it depends on committed files rather than on the selected week.
  await calibrate();

  root.innerHTML = shell();
  el('rec-week-select').addEventListener('change', async (e) => {
    state.week = Number(e.target.value);
    await render();
  });
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('#rec-refresh');
    if (btn) refreshNews(btn);
  });
  root.addEventListener('toggle', (e) => {
    if (e.target.id !== 'rec-explain') return;
    try { localStorage.setItem(DISMISS_KEY, e.target.open ? '0' : '1'); } catch { /* quota */ }
  }, true);

  await render();

  // The injury layer loads after the ranking is already on screen. It is a
  // third-party call that can be slow or fail, and the leverage numbers must
  // never wait on it -- same contract as the live scoreboard in espn.js.
  loadInjuries();
}

/** Any prior season's popularity, purely as measured context. Never joined to
 *  this season's numbers -- see pickShare.js's priorProfile note. */
async function priorPopularity() {
  for (let year = SEASON - 1; year >= SEASON - 3; year -= 1) {
    const pop = await getPopularity(1, year);
    if (pop) return pop;
  }
  return null;
}

const scheduleWeeks = (schedule) =>
  [...new Set((schedule?.games || []).map((g) => g.week))].sort((a, b) => a - b);

/* ── Slate ────────────────────────────────────────────────────────────────*/

/**
 * The week's games in a single shape, whichever source they came from.
 *
 * `{away, home, date, awayNum, homeNum}` with mascot-spelled teams, because
 * that is what matchSeasonOdds and the popularity file both key on. The
 * numbers are null when there is no workbook -- callers render them only if
 * present rather than showing a blank column.
 */
function slateFor(week) {
  if (state.map) {
    return scoredGames(state.map, week).map((g) => ({
      away: g.away, home: g.home, date: g.date || null,
      awayNum: g.awayNum ?? null, homeNum: g.homeNum ?? null,
      awayAbbr: MASCOT_TO_ABBR[g.away] || null,
      homeAbbr: MASCOT_TO_ABBR[g.home] || null,
    }));
  }

  return (state.schedule?.games || [])
    .filter((g) => g.week === week)
    .map((g) => ({
      away: ABBR_TO_MASCOT[g.away] || g.away,
      home: ABBR_TO_MASCOT[g.home] || g.home,
      date: g.date || null,
      awayNum: null, homeNum: null,
      awayAbbr: g.away, homeAbbr: g.home,
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/* ── Render ───────────────────────────────────────────────────────────────*/

async function render() {
  el('rec-week-select').value = state.week;
  const body = el('rec-body');

  // Still the strictest gate in the project -- but aimed at a genuine
  // cross-season mismatch, not at a workbook that has not been mailed.
  const audit = await getSeasonAudit(state.week);
  if (isBlocked(audit)) {
    body.innerHTML = seasonBanner(audit, { context: 'a leverage ranking' });
    return;
  }

  if (!state.snapshot) {
    body.innerHTML = notice(`
      <strong>No odds snapshot yet.</strong> Every number on this tab starts from a
      de-vigged moneyline. <code>data/odds/current.json</code> is written by
      <code>scripts/fetch_odds.py</code> — see the Odds tab.
    `);
    return;
  }

  const pop = await getPopularity(state.week);
  const rows = slateFor(state.week).map((g) => buildRow(g, pop));
  const priced = rows.filter((r) => r.awayProb != null);

  body.innerHTML = `
    ${explainer()}
    ${sourceStrip(pop, rows.length, priced.length)}
    ${plan(priced, pop)}
    ${tiers(priced, pop)}
    <div class="daygroup"><h3>Full slate</h3></div>
    ${rows.map(recRow).join('')}`;

  loadMovement(priced);
}

/**
 * Fit k against any week of THIS season that has both a popularity file and a
 * priced slate, so the estimate stops being a default as soon as it can.
 *
 * Only this season, and only weeks that are actually measured. A fit from last
 * season's field joined to last season's odds would be defensible in
 * principle, but we have no odds snapshot from a prior season to join, and
 * inventing one is the cross-season failure this tab is guarded against.
 */
async function calibrate() {
  const pairs = [];

  for (const week of state.weeks) {
    const pop = await getPopularity(week);
    if (!pop) continue;
    pairs.push(...pairsFrom(pop, (g) => {
      const game = { away: g.away, home: g.home, date: dateForPopGame(week, g) };
      const ev = matchSeasonOdds(game, state.seasonIndex);
      return ev ? orientProbs(game, ev) : null;
    }));
  }

  const fit = fitK(pairs);
  state.k = fit ? fit.k : DEFAULT_K;
  state.kSource = fit ? `fitted from ${fit.n} measured picks this season` : 'default';
  state.fit = fit;
}

/** The kickoff for a popularity-file game, needed so the odds join can tell
 *  two meetings of the same pair apart. */
function dateForPopGame(week, g) {
  const hit = (state.schedule?.games || []).find((s) => s.week === week
    && ABBR_TO_MASCOT[s.away] === g.away && ABBR_TO_MASCOT[s.home] === g.home);
  return hit?.date || null;
}

/* ── One game ─────────────────────────────────────────────────────────────*/

function buildRow(g, pop) {
  const ev = matchSeasonOdds(g, state.seasonIndex);
  const { awayProb, homeProb } = orientProbs(g, ev);

  const row = {
    game: g, ev, awayProb, homeProb,
    dogSide: null, dogTeam: null, dogAbbr: null, dogProb: null,
    share: null, shareSource: null, leverage: null,
  };
  if (awayProb == null || homeProb == null) return row;

  row.dogSide = awayProb <= homeProb ? 'away' : 'home';
  row.dogProb = row.dogSide === 'away' ? awayProb : homeProb;
  row.dogTeam = row.dogSide === 'away' ? g.away : g.home;
  row.dogAbbr = row.dogSide === 'away' ? g.awayAbbr : g.homeAbbr;
  row.isHomeDog = row.dogSide === 'home';

  // Measured share always wins. The model exists to fill the gap before the
  // workbook lands, never to override it once it has.
  const measured = pop?.games?.find((p) => p.away === g.away && p.home === g.home);
  if (measured) {
    row.share = (row.dogSide === 'away' ? measured.awayPct : measured.homePct) / 100;
    row.shareSource = 'measured';
  } else {
    row.share = shareFor(row.dogProb, state.k);
    row.shareSource = 'modelled';
  }

  row.leverage = leverageFor(row.dogProb, row.share);
  row.tier = tierOf(row);
  return row;
}

/**
 * Which bucket a dog falls in — the whole point of the tab.
 *
 * Ordered by what disqualifies fastest. STRATEGY.md §5 is explicit that
 * composition beats volume and that the longshot rule "is most of the edge",
 * so a sub-15% share is rejected before leverage is even considered: a 30%
 * dog that 4% of the field holds scores a spectacular 7.5x leverage and is
 * precisely the pick the strategy exists to stop you making.
 */
function tierOf(r) {
  if (r.dogProb == null || r.share == null) return 'none';
  if (r.dogProb < FLOOR) return 'below-floor';
  if (r.share < LONGSHOT_SHARE) return 'longshot';
  if (r.share > THIN_SHARE) return 'thin';
  return 'take';
}

/* ── The plan ─────────────────────────────────────────────────────────────*/

/**
 * How many dogs to take this week, per §4 Step 5's table.
 *
 * The table keys on how live the slate is, not on taste, so this counts the
 * qualifying dogs and reads the row off. The season-standings rows of that
 * table are deliberately not implemented -- they need a standings feed that
 * does not exist yet, and guessing at "are we contending" would be worse than
 * saying nothing.
 */
function dogCount(takeable) {
  const n = takeable.length;
  if (n <= 2) return { lo: 3, hi: 3, why: 'Thin slate — few live dogs at good leverage.' };
  if (n >= 6) return { lo: 5, hi: 6, why: 'Loaded slate — plenty of live dogs.' };
  return { lo: 4, hi: 5, why: 'Normal slate.' };
}

function plan(priced, pop) {
  if (!priced.length) return '';

  const take = priced.filter((r) => r.tier === 'take')
    .sort((a, b) => b.leverage - a.leverage);
  const { lo, hi, why } = dogCount(take);
  const picked = take.slice(0, hi);

  return `
    <div class="card rec-plan">
      <p class="eyebrow">This week's plan</p>
      <p class="rec-plan-line">
        Take <strong>${lo === hi ? lo : `${lo}–${hi}`} underdogs</strong>, chalk everywhere else.
        <span class="rec-plan-why">${escape(why)}</span>
      </p>
      ${picked.length ? `
        <p class="lede">
          In leverage order: ${picked.map((r) => `<strong>${escape(r.dogTeam)}</strong>`).join(', ')}.
          ${take.length > hi ? `${take.length - hi} more qualify below.` : ''}
        </p>` : `
        <p class="lede">
          Nothing on this slate clears the floor at usable pick share — that is a
          real answer, not a gap. Take the chalk (§4 Step 6).
        </p>`}
      ${pop ? '' : `
        <p class="rec-plan-caveat">
          Pick share is <strong>modelled</strong>, so treat the order as a shortlist to
          check rather than a verdict. ${escape(kNote())}
        </p>`}
    </div>`;
}

const kNote = () => `Curve k=${state.k} (${state.kSource}).`;

/* ── Tiers — the options ──────────────────────────────────────────────────*/

function tiers(priced, pop) {
  if (!priced.length) return '';

  const of = (t) => priced.filter((r) => r.tier === t)
    .sort((a, b) => (b.leverage ?? 0) - (a.leverage ?? 0));

  const take = of('take');
  const thin = of('thin');
  const longshot = of('longshot');

  return `
    ${group('Best dogs — take these', take, `
      Clear the ${Math.round(FLOOR * 100)}% floor and the field is light enough on them to buy
      real separation. Ranked by leverage.`)}

    ${group('Nearly free — but they buy little', thin, `
      Live enough, but ${Math.round(THIN_SHARE * 100)}%+ of the field is already here, so a hit
      leapfrogs almost nobody. §4 Step 5: don't count these toward the dog quota.`)}

    ${group('Traps — do not take', longshot, `
      Under ${Math.round(LONGSHOT_SHARE * 100)}% of the field holds these, which flatters the
      leverage score. §4 Step 5 calls this rule "most of the edge": ~140 such picks are thrown
      away by this pool every week.`, 'is-trap')}`;
}

function group(heading, rows, lede, cls = '') {
  if (!rows.length) return '';
  return `
    <div class="daygroup"><h3>${escape(heading)}</h3></div>
    <p class="lede rec-group-lede">${lede}</p>
    ${rows.map((r) => recRow(r, cls)).join('')}`;
}

/* ── Explainer ────────────────────────────────────────────────────────────*/

/**
 * Open by default the first time, collapsed once dismissed.
 *
 * "I'm not sure what a leverage pick is" was the actual complaint, and an
 * explainer behind a closed <details> answers it only for someone who already
 * suspects it is there.
 */
function explainer() {
  return `
    <details class="card rec-explain" ${dismissed() ? '' : 'open'} id="rec-explain">
      <summary><strong>How to read this</strong></summary>

      <p class="lede">
        You are not trying to get the most games right. In a 250-entry pool, picking
        every favourite has a <strong>mathematically zero chance</strong> of winning a
        week — a few hundred people do exactly that and you tie all of them. You win by
        being right where the field is wrong.
      </p>

      <p class="lede">
        <strong>Leverage = your team's win probability ÷ the share of the field on it.</strong>
        A 42% underdog that 20% of the field holds scores 2.1× — you gain ground on four
        fifths of the pool when it hits. The same 42% dog at 40% share scores 1.05× and is
        nearly worthless: you take the risk and buy almost no separation.
      </p>

      <ul class="rec-rules">
        <li><strong>Floor — ${Math.round(FLOOR * 100)}% win probability.</strong> Below that the
          cost climbs faster than the leverage compensates. Big dogs feel bold and lose 80%+
          of the time.</li>
        <li><strong>Sweet spot — ${Math.round(SWEET_LO * 100)}–${Math.round(SWEET_HI * 100)}%,</strong>
          ideally a <em>home</em> dog. Home underdogs win outright meaningfully more often.</li>
        <li><strong>Never below ${Math.round(LONGSHOT_SHARE * 100)}% pick share.</strong> The
          leverage score looks best exactly where the strategy says don't go. This one rule is
          most of the edge.</li>
        <li><strong>Take 4–5 dogs a week</strong>, more on a live slate. The field already
          averages 3.3 minority picks, so volume alone buys nothing —
          <em>composition</em> is the edge.</li>
        <li><strong>Every dog needs a one-line reason.</strong> Random contrarianism is not the
          strategy; cheap contrarianism is.</li>
      </ul>

      <p class="lede rec-explain-foot">
        Full reasoning in <code>STRATEGY.md</code> §4. Everything above is quoted from it —
        this tab is that document's implementation, not a second opinion.
      </p>
    </details>`;
}

const DISMISS_KEY = 'rec:explainer-dismissed';
const dismissed = () => {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/* ── Source strip ─────────────────────────────────────────────────────────*/

/**
 * Where every number on the page came from, in one line.
 *
 * This tab mixes a measured feed, a modelled one and a live one, and the whole
 * project's worst bug was a confident number whose provenance was invisible.
 */
function sourceStrip(pop, total, priced) {
  const bits = [];

  bits.push(state.map
    ? `Slate from the pool sheet (${total} games)`
    : `Slate from the schedule feed (${total} games) — pool numbers arrive with the workbook`);

  bits.push(`${priced} priced by the market`);

  bits.push(pop
    ? `pick share <strong>measured</strong> from ${pop.entrants} entries`
    : `pick share <strong>modelled</strong> — ${escape(kNote())}`);

  return `
    <p class="rec-sources">${bits.join(' · ')}</p>
    ${state.prior && !pop ? priorNote() : ''}
    <div id="rec-news"></div>`;
}

/**
 * Last season's field, as measured fact — the "how many people and what did
 * they do" question a first-week entrant is actually asking.
 *
 * Explicitly NOT an input. It is not joined to anything on this page; it is
 * shown so the modelled shares can be sanity-checked against a real field of
 * the same pool.
 */
function priorNote() {
  const p = state.prior;
  return `
    <div class="notice rec-prior">
      <strong>For scale, ${p.year} Week ${p.week} — the same pool, measured.</strong>
      ${p.entrants} entries across ${p.games} games. The field's majority side ran
      ${pct(p.min)}–${pct(p.max)} (median ${pct(p.median)}):
      ${p.lopsided} game${p.lopsided === 1 ? '' : 's'} at 85%+ where there was no separation to
      be had, and ${p.contested} under 65% where there was.
      <span class="rec-prior-note">Context only — last season's field is never joined to this
      season's numbers.</span>
    </div>`;
}

const pct = (x) => `${Math.round(x * 100)}%`;

/* ── News: injuries + line movement ───────────────────────────────────────*/

/**
 * The news half of the tab, and the reason it is client-side.
 *
 * A Wednesday QB injury reprices Sunday. Odds move first and are already
 * tracked; the injury report says WHY, which is what makes a stale price
 * identifiable rather than just noticeable. §4 Step 3 wants both.
 */
async function loadInjuries() {
  const box = el('rec-news');
  if (!box) return;

  state.injuries = await fetchInjuries();
  // render() rewrites the body, `#rec-news` included, so painting the news
  // line before it would be immediately wiped. Re-render first, then paint.
  if (state.injuries) await render();
  paintNews();
}

function paintNews() {
  const box = el('rec-news');
  if (!box) return;

  box.innerHTML = `
    <p class="rec-news-line">
      ${state.injuries
        ? `Injury report loaded — <strong>${state.injuries.size} teams</strong> with availability
           changes. Refreshed live from ESPN each time you open this tab.`
        : 'Injury report unavailable right now — the ranking below is unaffected.'}
      <button type="button" class="btn btn-ghost rec-refresh" id="rec-refresh">Refresh news &amp; odds</button>
    </p>`;
}

async function refreshNews(btn) {
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  state.injuries = await fetchInjuries({ maxAgeMs: 0 });
  state.movement = new Map();
  await render();
  paintNews();
}

/**
 * Line movement per game, fetched after first paint.
 *
 * Movement is the market's own record of the news cycle: a line that has moved
 * three points since opening has already priced something, and §3 names
 * closing-line value rather than win rate as the metric that matters. Fetched
 * per visible week, not for all 272 games -- the mistake the Odds tab already
 * made and fixed.
 */
async function loadMovement(rows) {
  const wanted = rows.filter((r) => r.ev?.id && !state.movement.has(r.ev.id));
  if (!wanted.length) return;

  await Promise.all(wanted.map(async (r) => {
    const history = await getOddsHistory(r.ev.id);
    if (history.length < 2) { state.movement.set(r.ev.id, null); return; }

    const first = history[0];
    const last = history[history.length - 1];
    // Oriented to the dog, because that is the side every decision here is
    // about. A dog whose price is drifting toward it is the "stale for a
    // reason we can name" case in §4 Step 4.
    const key = r.dogSide === 'away' ? 'awayWinProb' : 'homeWinProb';
    const from = first[key];
    const to = last[key];
    state.movement.set(r.ev.id, Number.isFinite(from) && Number.isFinite(to)
      ? { from, to, delta: to - from } : null);
  }));

  paintMovement();
}

function paintMovement() {
  for (const [id, mv] of state.movement) {
    const slot = document.querySelector(`[data-move="${id}"]`);
    if (!slot || !mv || Math.abs(mv.delta) < 0.02) continue;
    const dir = mv.delta > 0 ? 'toward' : 'away from';
    slot.innerHTML = `Line has moved ${dir} the dog: ${pct(mv.from)} → <strong>${pct(mv.to)}</strong>`;
  }
}

/* ── Row ──────────────────────────────────────────────────────────────────*/

function recRow(r, extraClass = '') {
  const g = r.game;

  if (r.awayProb == null) {
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
  const sweet = r.dogProb >= SWEET_LO && r.dogProb <= SWEET_HI;

  return `
    <div class="card oddsgame ${r.tier === 'take' ? 'is-candidate' : ''} ${extraClass}">
      <div class="oddsgame-teams">
        <div class="oddsteam">
          ${num(g.awayNum)}<span class="oddsteam-name">${escape(g.away)}</span>
          <span class="oddsteam-pct">${awayPct}%</span>
        </div>
        <div class="oddsteam oddsteam-home">
          ${num(g.homeNum)}<span class="oddsteam-name">${escape(g.home)}</span>
          <span class="oddsteam-pct">${homePct}%</span>
        </div>
      </div>
      <div class="prob-bar" role="img" aria-label="${escape(g.away)} ${awayPct}%, ${escape(g.home)} ${homePct}%">
        <div class="prob-seg prob-away" style="width:${awayPct}%"></div>
        <div class="prob-seg prob-home" style="width:${homePct}%"></div>
      </div>

      <div class="oddsgame-meta">
        <span>${escape(r.dogTeam)} is the dog at ${pct(r.dogProb)}${
          r.isHomeDog ? ' <em>at home</em>' : ''}${sweet ? ' · sweet spot' : ''}</span>
        ${verdict(r)}
      </div>

      <p class="rec-why">${why(r)}</p>
      <p class="rec-move" data-move="${escape(r.ev?.id || '')}"></p>
      ${injuryLine(r)}
    </div>`;
}

const num = (n) => (n == null ? '' : `<span class="oddsteam-num">${n}</span>`);

function verdict(r) {
  const lev = r.leverage != null ? `${r.leverage.toFixed(2)}×` : '—';
  const label = {
    take: 'take', thin: 'low value', longshot: 'trap', 'below-floor': 'below floor',
  }[r.tier] || '';
  const cls = r.tier === 'take' ? ' ok' : r.tier === 'longshot' ? ' bad' : '';
  return `<span class="leverage-score${cls}">${lev} leverage${label ? ` · ${label}` : ''}</span>`;
}

/**
 * The one-line reason §4 Step 4 insists every dog must have.
 *
 * Written from the numbers that decided the tier, so it can never disagree
 * with the badge beside it -- a hand-written rationale would drift.
 */
function why(r) {
  const share = `${pct(r.share)} of the field${r.shareSource === 'modelled' ? ' (est.)' : ''}`;

  switch (r.tier) {
    case 'take':
      return `${escape(r.dogTeam)} wins ${pct(r.dogProb)} of the time and only ${share} is on them`
        + `${r.isHomeDog ? ', and home dogs win outright more often than road dogs' : ''}.`;
    case 'thin':
      return `Live at ${pct(r.dogProb)}, but ${share} already holds them — a hit leapfrogs almost nobody.`;
    case 'longshot':
      return `Only ${share} is here, which is what flatters the leverage. Under `
        + `${Math.round(LONGSHOT_SHARE * 100)}% share is the one thing §4 Step 5 rules out outright.`;
    case 'below-floor':
      return `${pct(r.dogProb)} is under the ${Math.round(FLOOR * 100)}% floor — the cost climbs `
        + 'faster than the leverage repays.';
    default:
      return '';
  }
}

/**
 * Injuries, quarterback first.
 *
 * Deliberately shows the QB even when the game is chalk: §4 Step 3 rates a
 * starting QB at 3-7 points of spread, which is the single most common way a
 * dog becomes live between now and Saturday.
 */
function injuryLine(r) {
  const inj = forGame(state.injuries, r.game.awayAbbr, r.game.homeAbbr);
  if (!inj || !inj.all.length) return '';

  const qbs = inj.all.filter(isQB);
  const show = qbs.length ? qbs.slice(0, 2) : inj.all.slice(0, 1);

  return `
    <p class="rec-inj${qbs.length ? ' is-qb' : ''}">
      ${show.map((row) => `
        <span><strong>${escape(row.team)} ${escape(row.position || '')}</strong>
        ${escape(row.name)} — ${escape(row.status)}</span>`).join('')}
      ${qbs.length ? '<em>QB status moves a line 3–7 points; check whether the price already reflects it.</em>' : ''}
    </p>`;
}

/* ── Shell ────────────────────────────────────────────────────────────────*/

function shellHead() {
  return `
    <div class="section-head">
      <div>
        <p class="eyebrow">Leverage</p>
        <h2>Recommend</h2>
      </div>
    </div>`;
}

function shell() {
  return `
    ${shellHead()}
    <div class="card controls">
      <div class="field">
        <label for="rec-week-select">Week</label>
        <select id="rec-week-select">
          ${state.weeks.map((w) => `<option value="${w}">Week ${w}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="rec-body"></div>`;
}

function notice(html) {
  return `<div class="notice">${html}</div>`;
}

function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
