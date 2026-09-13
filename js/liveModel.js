/* ==========================================================================
   Live standings model — how I am doing against Mike's two pools while the
   week is still being played. Pure data: no DOM, no fetching.

   Inputs are the cards Mike mailed (data/raw/entries-<year>-w<NN>.json and
   data/survivor-<year>.json), the number map, and the live game state from
   js/gameState.js. Nothing here waits on his answer key.

   ── "DO I STILL HAVE A CHANCE" IS EXACT, NOT SIMULATED ─────────────────────

   The best outcome for me is always the one where every one of my remaining
   picks wins. Flipping any game away from my pick costs me one point and
   gains the entries on the other side one point each -- it never helps me
   against anyone. So `bestCase()` scores that single outcome and asks whether
   I finish on top; if I cannot win there, I cannot win anywhere. Ties at the
   top then go to the Monday-night total, closest by absolute value (confirmed
   rule, CLAUDE.md "The tiebreaker guess"), and a tie is still winnable if
   some final total leaves my guess strictly closest.

   ── THE PERCENTAGE IS AN ESTIMATE, AND SAYS SO ─────────────────────────────

   `winChance()` simulates the undecided games. Each game's chance comes from
   `liveProb()`: the pre-game market price turned into an expected margin,
   then updated for the current score and the time left (final margin ~
   normal, SD 13.45 points for a full game, shrinking with the square root of
   the time remaining). Crude, but it moves the right way at the right speed,
   which a pre-game price frozen through a 21-point third quarter does not.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

const MARGIN_SD = 13.45;   // NFL final-margin SD, full game
const TOTAL_SD = 13.9;     // measured over 2,127 games -- see CLAUDE.md
const GAME_SECONDS = 3600;

/* ── Game probability ─────────────────────────────────────────────────────*/

function normCdf(x) {
  // Abramowitz-Stegun 7.1.26; plenty for a displayed percentage.
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

function normInv(p) {
  // Bisection is fine at this call volume and cannot misbehave at the tails.
  let lo = -8, hi = 8;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (normCdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Fraction of regulation left, 0..1. Overtime counts as a sliver, not zero. */
export function fractionLeft(game) {
  if (game.state === 'pre') return 1;
  if (game.state === 'post') return 0;
  const period = Number(game.period) || 1;
  const [m, s] = String(game.clock || '0:00').split(':').map(Number);
  const inPeriod = (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
  if (period > 4) return Math.max(inPeriod / GAME_SECONDS, 0.01);
  return Math.max(((4 - period) * 900 + inPeriod) / GAME_SECONDS, 0.005);
}

/**
 * Chance the AWAY side wins from here. `awayPre` is the pre-game de-vigged
 * price, or null (treated as a coin flip, and flagged by the caller).
 */
export function liveProb(game, awayPre) {
  if (game.state === 'post') {
    if (game.winner === 'away') return 1;
    if (game.winner === 'home') return 0;
    return 0.5;
  }
  const p = awayPre == null ? 0.5 : Math.min(Math.max(awayPre, 0.01), 0.99);
  const expectedMargin = MARGIN_SD * normInv(p);          // away minus home, full game
  if (game.state === 'pre') return p;

  const f = fractionLeft(game);
  const lead = (Number(game.awayScore) || 0) - (Number(game.homeScore) || 0);
  const mean = lead + expectedMargin * f;
  const sd = MARGIN_SD * Math.sqrt(f);
  return normCdf(mean / sd);
}

/* ── Season-long pick'em ──────────────────────────────────────────────────*/

/**
 * One row per scored game, joined to live state.
 * `games`: number-map scored games; `live`: Map "Away|Home" (mascots) -> game;
 * `prices`: Map "Away|Home" -> away pre-game probability.
 */
export function slateRows(games, live, prices) {
  return games.map((g) => {
    const state = live.get(`${g.away}|${g.home}`) || null;
    const winnerNum = state?.state === 'post'
      ? (state.winner === 'away' ? g.awayNum : state.winner === 'home' ? g.homeNum : null)
      : null;
    const awayPre = prices.get(`${g.away}|${g.home}`) ?? null;
    return {
      ...g,
      live: state,
      decided: state?.state === 'post',
      winnerNum,
      tie: state?.state === 'post' && state.winner === 'tie',
      awayPre,
      awayNow: state ? liveProb(state, awayPre) : (awayPre ?? 0.5),
      leadingNum: state?.state === 'in' && state.leader
        ? (state.leader === 'away' ? g.awayNum : state.leader === 'home' ? g.homeNum : null)
        : null,
    };
  });
}

/** Everyone's score right now: `{ correct, winningNow, remaining, max }`. */
export function scoreEntries(entries, rows) {
  const open = rows.filter((r) => !r.decided);
  const won = new Set(rows.filter((r) => r.winnerNum != null).map((r) => r.winnerNum));
  const leading = new Set(open.map((r) => r.leadingNum).filter((n) => n != null));
  return entries.map((e) => {
    const picks = new Set(e.picks);
    const remaining = open.filter((r) => picks.has(r.awayNum) || picks.has(r.homeNum)).length;
    const correct = e.picks.filter((p) => won.has(p)).length;
    return {
      ...e,
      correct,
      winningNow: e.picks.filter((p) => leading.has(p)).length,
      remaining,
      max: correct + remaining,
    };
  });
}

/** Standard competition rank on (correct, then winning now). */
export function rankNow(scored) {
  const sorted = [...scored].sort((a, b) => b.correct - a.correct || b.winningNow - a.winningNow);
  let rank = 0;
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.correct !== r.correct) rank = i + 1;
    r.rank = rank;
  });
  return sorted;
}

/**
 * Where my guess wins the tiebreaker among `rivals`' guesses:
 * `{ lo, hi }` (inclusive-ish real interval) or null. Rivals with my exact
 * guess share rather than block, so they are ignored here and reported apart.
 */
function tiebreakWindow(myGuess, rivalGuesses) {
  if (myGuess == null) return null;
  let lo = -Infinity, hi = Infinity;
  for (const g of rivalGuesses) {
    if (g == null || g === myGuess) continue;
    if (g < myGuess) lo = Math.max(lo, (g + myGuess) / 2);
    else hi = Math.min(hi, (g + myGuess) / 2);
  }
  return { lo, hi };
}

/**
 * The exact answer to "can I still win the week?".
 * `tb`: { total: number|null (final), floor: current combined points }.
 */
export function bestCase(me, field, rows, tb) {
  const mine = new Set(me.picks);
  // The outcome where every open game goes my way. A game I did not pick
  // (13-pick card) goes to whichever side hurts the fewest -- irrelevant to
  // me, so give it to the side MORE of the field lacks.
  const winners = new Set();
  for (const r of rows) {
    if (r.decided) { if (r.winnerNum != null) winners.add(r.winnerNum); continue; }
    if (mine.has(r.awayNum)) winners.add(r.awayNum);
    else if (mine.has(r.homeNum)) winners.add(r.homeNum);
    else {
      const a = field.filter((e) => e.picks.includes(r.awayNum)).length;
      const h = field.filter((e) => e.picks.includes(r.homeNum)).length;
      winners.add(a <= h ? r.awayNum : r.homeNum);
    }
  }
  const score = (e) => e.picks.filter((p) => winners.has(p)).length;
  const myMax = score(me);
  const ahead = field.filter((e) => score(e) > myMax);
  const tied = field.filter((e) => score(e) === myMax);

  if (ahead.length) return { alive: false, myMax, ahead: ahead.length, tied: tied.length };
  if (!tied.length) return { alive: true, outright: true, myMax, ahead: 0, tied: 0 };

  const sameGuess = tied.filter((e) => e.mnf === me.mnf).length;
  const win = tiebreakWindow(me.mnf, tied.map((e) => e.mnf));
  let tiebreakOk = false;
  if (win && tb.total != null) {
    const diff = (g) => (g == null ? Infinity : Math.abs(tb.total - g));
    tiebreakOk = diff(me.mnf) <= Math.min(...tied.map((e) => diff(e.mnf)));
  } else if (win) {
    // Some whole-number final total, no lower than the points already on the
    // board, has to land strictly inside my window.
    const first = Math.max(tb.floor, Math.floor(win.lo) + 1);
    tiebreakOk = first < win.hi;
  }
  return {
    alive: tiebreakOk,
    outright: false,
    myMax,
    ahead: 0,
    tied: tied.length,
    sameGuess,
    window: win,
  };
}

/**
 * Simulated chance to win the week (ties split), plus my chance conditioned
 * on each side of every open game -- "what do I need from the 4pm games".
 * `tb`: { total, floor, expected, fractionLeft } for the tiebreaker game.
 */
export function winChance(me, field, rows, tb, sims = 8000, rand = Math.random) {
  const all = [me, ...field];
  const n = all.length;
  const base = new Int16Array(n);
  const open = rows.filter((r) => !r.decided);
  const won = new Set(rows.filter((r) => r.winnerNum != null).map((r) => r.winnerNum));
  all.forEach((e, i) => { base[i] = e.picks.filter((p) => won.has(p)).length; });

  // Per open game: which entries gain if away wins, which if home wins.
  const sides = open.map((r) => ({
    row: r,
    away: all.map((e, i) => (e.picks.includes(r.awayNum) ? i : -1)).filter((i) => i >= 0),
    home: all.map((e, i) => (e.picks.includes(r.homeNum) ? i : -1)).filter((i) => i >= 0),
  }));

  const guesses = all.map((e) => (typeof e.mnf === 'number' ? e.mnf : null));
  const cond = open.map(() => ({ awayWins: 0, awaySims: 0, homeWins: 0, homeSims: 0 }));
  let wins = 0;
  const score = new Int16Array(n);

  for (let s = 0; s < sims; s += 1) {
    score.set(base);
    const awayWon = new Array(sides.length);
    sides.forEach((side, k) => {
      const away = rand() < side.row.awayNow;
      awayWon[k] = away;
      for (const i of (away ? side.away : side.home)) score[i] += 1;
    });

    let top = -1;
    for (let i = 0; i < n; i += 1) if (score[i] > top) top = score[i];
    let share = 0;
    if (score[0] === top) {
      const tiedIdx = [];
      for (let i = 0; i < n; i += 1) if (score[i] === top) tiedIdx.push(i);
      if (tiedIdx.length === 1) share = 1;
      else {
        const total = tb.total != null ? tb.total : sampleTotal(tb, rand);
        let best = Infinity;
        for (const i of tiedIdx) if (guesses[i] != null) best = Math.min(best, Math.abs(guesses[i] - total));
        if (guesses[0] != null && Math.abs(guesses[0] - total) === best) {
          const co = tiedIdx.filter((i) => guesses[i] != null && Math.abs(guesses[i] - total) === best).length;
          share = 1 / co;
        }
      }
    }
    wins += share;
    awayWon.forEach((a, k) => {
      if (a) { cond[k].awaySims += 1; cond[k].awayWins += share; }
      else { cond[k].homeSims += 1; cond[k].homeWins += share; }
    });
  }

  return {
    chance: wins / sims,
    games: open.map((r, k) => ({
      row: r,
      ifAway: cond[k].awaySims ? cond[k].awayWins / cond[k].awaySims : null,
      ifHome: cond[k].homeSims ? cond[k].homeWins / cond[k].homeSims : null,
    })),
  };
}

function sampleTotal(tb, rand) {
  // Points still to come scale with the time left; the market total is the
  // full-game expectation. Never below what is already on the board.
  const f = Math.max(tb.fractionLeft ?? 1, 0.01);
  const mean = tb.floor + (tb.expected ?? 44) * f;
  const sd = TOTAL_SD * Math.sqrt(f);
  const u = Math.max(rand(), 1e-9);
  const t = Math.round(mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand()));
  return Math.max(t, tb.floor);
}

/* ── Mike's suicide pool ──────────────────────────────────────────────────*/

/**
 * Every entry's pick for the week, joined to its game.
 * `live`: Map abbr -> game (both sides keyed).
 */
export function survivorWeek(entries, week, live) {
  const byTeam = new Map();
  for (const e of entries) {
    const team = e.picks?.[String(week)];
    if (!team) continue;
    if (!byTeam.has(team)) byTeam.set(team, []);
    byTeam.get(team).push(e);
  }

  const teams = [...byTeam.entries()].map(([team, list]) => {
    const g = live.get(team) || null;
    const side = g ? (g.awayAbbr === team ? 'away' : 'home') : null;
    let status = 'pre';
    if (g?.state === 'post') status = g.winner === side ? 'won' : g.winner === 'tie' ? 'tie' : 'lost';
    else if (g?.state === 'in') status = g.leader === side ? 'leading' : g.leader ? 'trailing' : 'tied';
    return { team, count: list.length, entries: list, game: g, side, status };
  }).sort((a, b) => b.count - a.count);

  const sum = (pred) => teams.filter(pred).reduce((t, r) => t + r.count, 0);
  const total = sum(() => true);
  const won = sum((r) => r.status === 'won');
  const lost = sum((r) => r.status === 'lost' || r.status === 'tie');
  return {
    teams,
    total,
    won,
    lost,
    playing: sum((r) => ['leading', 'trailing', 'tied'].includes(r.status)),
    notStarted: sum((r) => r.status === 'pre'),
    // Survivors this week will land between these, whatever happens next.
    floor: won,
    ceiling: total - lost,
  };
}
