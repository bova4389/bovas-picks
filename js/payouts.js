/* ==========================================================================
   Payouts and the season view — pure data, no DOM, no fetching.

   Who won each week's money, who has won what so far, and the survivor
   "burn matrix" (which teams each pool has spent, week by week). Built for the
   Standings panels' payout lines and their "All weeks" option (2026-09-14).

   A payout is counted only for a COMPLETE week -- every game of it final. A
   provisional winner who changes on Monday night is worse than no figure, so
   an unfinished week shows who LEADS and pays nobody.

   Prize amounts come from data/payouts-<year>.json, never from here.

   A new file rather than new exports on liveModel.js / standingsModel.js for
   the deploy reason those files' headers give: an unversioned module already
   cached in a browser cannot provide a name it did not have.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

/** A stable key for an entry across weeks: Mike's entry number, else the name. */
export const entryKey = (e) => String(e.entry ?? e.name ?? e.nick);

/**
 * Mike's weekly pool: who takes the week's prize.
 *
 * Owner's rule (2026-09-14): most correct; tied on correct, the Monday night
 * total closest by ABSOLUTE value; still tied, split evenly. A card with no
 * tiebreaker guess cannot win a tiebreak.
 *
 * @param {Array} scored   scoreEntries() output for the week
 * @param {Array} rows     slateRows() output, used for completeness and the MNF total
 * @param {number} prize
 */
export function pickemWeekResult(scored, rows, prize) {
  const complete = rows.length > 0 && rows.every((r) => r.decided);
  if (!scored.length) return { complete, top: 0, leaders: [], winners: [], share: null, total: null };

  const top = Math.max(...scored.map((e) => e.correct));
  const leaders = scored.filter((e) => e.correct === top);
  const tb = rows.find((r) => r.tiebreaker)?.live || null;
  const total = tb?.state === 'post' ? (tb.awayScore || 0) + (tb.homeScore || 0) : null;

  if (!complete) return { complete, top, leaders, winners: [], share: null, total };

  let winners = leaders;
  if (leaders.length > 1 && total != null) {
    const diff = (e) => (typeof e.mnf === 'number' ? Math.abs(e.mnf - total) : Infinity);
    const best = Math.min(...leaders.map(diff));
    winners = leaders.filter((e) => diff(e) === best);
  }
  return {
    complete, top, leaders, winners, total,
    share: winners.length ? prize / winners.length : null,
  };
}

/**
 * A season table from per-week results.
 *
 * @param {Array<{week:number, complete:boolean, entries:Array<{key,name,isMe,correct}>,
 *                winners:Array<string>, share:number|null}>} weeks
 * @returns rows sorted by correct, each { key, name, isMe, correct, weeksWon, money, rank }
 */
export function seasonTable(weeks) {
  const byKey = new Map();
  for (const w of weeks) {
    const winners = new Set(w.complete ? w.winners : []);
    for (const e of w.entries) {
      const row = byKey.get(e.key) || { key: e.key, name: e.name, isMe: false, correct: 0, weeksWon: 0, money: 0 };
      row.name = e.name || row.name;
      row.isMe = row.isMe || Boolean(e.isMe);
      row.correct += e.correct;
      if (winners.has(e.key)) {
        row.weeksWon += 1 / w.winners.length;
        row.money += w.share || 0;
      }
      byKey.set(e.key, row);
    }
  }
  const rows = [...byKey.values()]
    .sort((a, b) => b.correct - a.correct || b.money - a.money || a.name.localeCompare(b.name));
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.correct !== rows[i - 1].correct) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}

/** Total paid out across complete weeks. */
export const paidSoFar = (weeks) => weeks
  .filter((w) => w.complete && w.share != null)
  .reduce((n, w) => n + w.share * w.winners.length, 0);

/** A survivor pot: base plus every recorded buy-back. */
export function potOf(pool) {
  if (!pool) return null;
  if (Number.isFinite(pool.pot)) return { total: pool.pot, base: pool.pot, buybacks: 0 };
  const buybacks = Object.values(pool.buybacksByWeek || {}).reduce((n, v) => n + (Number(v) || 0), 0);
  const base = Number(pool.base) || 0;
  return { total: base + buybacks * (Number(pool.buyback) || 0), base, buybacks };
}

/**
 * The burn matrix: for every team a pool has picked, how many entries took it
 * each week and how that week went for it.
 *
 * `results` is week -> Map(team -> 'won'|'lost'|'tie'|'live'|'pre'). A tie counts
 * as a loss for survival, which is how survivorWeek() counts it too.
 *
 * Losses are COUNTED per entry, never turned into "eliminated": buy-backs are
 * administered outside every feed (SURVIVOR-STRATEGY.md), so an entry with a
 * loss may well still be playing.
 *
 * @param {Array} entries  each { key, name, isMe, picks: { week: TEAM } }
 * @param {Array<number>} weeks
 * @param {Object} results
 */
export function burnMatrix(entries, weeks, results) {
  const teams = new Map();
  const perWeek = weeks.map((w) => ({ week: w, picks: 0, lost: 0 }));
  const losses = new Map();

  for (const e of entries) {
    for (const [i, w] of weeks.entries()) {
      const team = e.picks?.[String(w)];
      if (!team) continue;
      const outcome = results[w]?.get(team) || 'pre';
      const row = teams.get(team) || { team, total: 0, cells: {} };
      const cell = row.cells[w] || { count: 0, outcome, mine: false };
      cell.count += 1;
      cell.mine = cell.mine || Boolean(e.isMe);
      row.cells[w] = cell;
      row.total += 1;
      teams.set(team, row);

      perWeek[i].picks += 1;
      if (outcome === 'lost' || outcome === 'tie') {
        perWeek[i].lost += 1;
        losses.set(e.key, (losses.get(e.key) || 0) + 1);
      }
    }
  }

  const me = entries.find((e) => e.isMe);
  return {
    rows: [...teams.values()].sort((a, b) => b.total - a.total || a.team.localeCompare(b.team)),
    perWeek,
    unbeaten: entries.filter((e) => Object.keys(e.picks || {}).length && !losses.get(e.key)).length,
    myLosses: me ? losses.get(me.key) || 0 : null,
    entrants: entries.length,
  };
}

/** A team's outcome in one week's live games. */
export function outcomeMap(games) {
  const out = new Map();
  for (const g of games || []) {
    for (const side of ['away', 'home']) {
      const team = side === 'away' ? g.awayAbbr : g.homeAbbr;
      let o = 'pre';
      if (g.state === 'post') o = g.winner === side ? 'won' : g.winner === 'tie' ? 'tie' : 'lost';
      else if (g.state === 'in') o = 'live';
      out.set(team, o);
    }
  }
  return out;
}

/** $1,270 / $6.67 -- whole dollars when whole. */
export function money(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const whole = Math.abs(n - Math.round(n)) < 0.005;
  return `$${whole ? Math.round(n).toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
