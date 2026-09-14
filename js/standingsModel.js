/* ==========================================================================
   Standings math for the Sleeper pools — pure data, no DOM, no fetching.

   js/liveModel.js already holds Mike's pools (his workbooks). This file holds
   what the Sleeper pools need on top of it, and exists as a NEW file rather
   than as new exports on liveModel.js or infinityModel.js for a deploy reason:
   those modules are unversioned and already cached in visitors' browsers, and
   a fresh standings.js importing a name a cached copy lacks blanks the whole
   site ("does not provide an export named"). A file nobody has cached cannot
   be stale. Fold it into infinityModel.js later if that ever reads better.

   THE KICKOFF GATE SHAPES EVERY NUMBER HERE. The cached feeds hold other
   entrants' picks only for games that had kicked off when the feed was last
   refreshed. So for anyone but me, "picks" is what is VISIBLE, not what was
   submitted, and each function below says how it copes.

   NEVER add a ?v= to this file -- see data.js's note on module identity.
   ========================================================================== */

/** Live games keyed by team abbreviation, for looking up any pick. */
export function teamIndex(games) {
  const byTeam = new Map();
  for (const g of games || []) {
    byTeam.set(g.awayAbbr, g);
    byTeam.set(g.homeAbbr, g);
  }
  return byTeam;
}

/** What happened to one pick: won / lost / tie / leading / trailing / tied / pre. */
export function pickStatus(abbr, byTeam) {
  const g = byTeam.get(abbr) || null;
  if (!g) return { status: 'pre', game: null, side: null };
  const side = g.awayAbbr === abbr ? 'away' : 'home';
  let status = 'pre';
  if (g.state === 'post') status = g.winner === side ? 'won' : g.winner === 'tie' ? 'tie' : 'lost';
  else if (g.state === 'in') status = g.leader === side ? 'leading' : g.leader ? 'trailing' : 'tied';
  return { status, game: g, side };
}

/**
 * Grade one week of a pick-several pool (Infinity War) against live scores.
 *
 * `max` is `limit - lost`, NOT `correct + visible picks still open`. Another
 * entrant's picks on games that have not kicked off are hidden by the gate,
 * so counting only visible open picks would tell me a rival is capped at 5
 * when three of their picks simply have not been revealed yet. Assuming a full
 * card overstates a rival who skipped picks, which is the safe direction: it
 * never tells me a week is locked up when it is not.
 *
 * A tied game is not a correct pick.
 *
 * @param {Array} entries  feed.entries, each { name, isMe, picks: { week: [abbr] } }
 * @param {number} week
 * @param {Map} byTeam     teamIndex(liveGames)
 * @param {number} limit   picks per card (8 in Infinity War)
 */
export function gradePickemWeek(entries, week, byTeam, limit = 8) {
  const rows = (entries || []).map((e) => {
    const picks = e.picks?.[String(week)] || [];
    let correct = 0;
    let lost = 0;
    let winning = 0;
    let live = 0;
    for (const abbr of picks) {
      const { status } = pickStatus(abbr, byTeam);
      if (status === 'won') correct += 1;
      else if (status === 'lost' || status === 'tie') lost += 1;
      else if (status !== 'pre') {
        live += 1;
        if (status === 'leading') winning += 1;
      }
    }
    return {
      name: e.name || e.nick || `Entry ${e.entry}`,
      isMe: Boolean(e.isMe),
      visible: picks.length,
      correct,
      lost,
      winning,
      live,
      open: Math.max(0, picks.length - correct - lost),
      max: Math.max(correct, limit - lost),
    };
  });

  rows.sort((a, b) => b.correct - a.correct || b.max - a.max || a.name.localeCompare(b.name));

  // Competition ranking: two entries on 6 are both 1st, the next is 3rd.
  let rank = 0;
  rows.forEach((r, i) => {
    if (i === 0 || r.correct !== rows[i - 1].correct) rank = i + 1;
    r.rank = rank;
  });
  return rows;
}

/**
 * The week's prize, as far as it can be called.
 *
 * Final only once every game of the week is final. Before that it reports who
 * leads and whether I can still catch them on `max`. Ties split the prize, per
 * the pool's rule ($20 splits n ways -- see Infinity War in CLAUDE.md).
 *
 * @returns {{ final: boolean, top: number, leaders: Array, share: number|null,
 *            meIn: boolean, meAlive: boolean }}
 */
export function weekPrize(rows, games, prize = 20) {
  const final = (games || []).length > 0 && games.every((g) => g.state === 'post');
  const top = rows.length ? rows[0].correct : 0;
  const leaders = rows.filter((r) => r.correct === top);
  const me = rows.find((r) => r.isMe) || null;
  return {
    final,
    top,
    leaders,
    share: final && leaders.length ? Math.round((prize / leaders.length) * 100) / 100 : null,
    meIn: Boolean(me && me.correct === top),
    meAlive: Boolean(me && me.max >= top),
  };
}

/**
 * How much of a survivor week the cached feed actually shows.
 *
 * `hidden` is picks submitted but still behind the gate when the feed was
 * fetched. While it is non-zero, survived/out counts and the floor/ceiling
 * line are counts of the VISIBLE picks only, and the page must say so.
 */
export function survivorCoverage(feed, week) {
  const w = feed?.weeks?.[String(week)] || null;
  if (!w) return { known: false, hidden: 0, revealed: 0, expected: feed?.entries?.length || 0, complete: false };
  const revealed = Number(w.revealed ?? w.entrants ?? 0);
  const submitted = Number(w.submitted ?? revealed);
  const expected = Number(w.expected ?? feed?.entries?.length ?? revealed);
  return {
    known: true,
    hidden: Math.max(0, submitted - revealed),
    revealed,
    expected,
    complete: Boolean(w.complete) || revealed >= expected,
  };
}
