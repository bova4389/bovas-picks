# Infinity War — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Infinity War — Read Before Changing Any Number

Built 2026-09-01. A Sleeper **classic pick'em** (`pickem_type: 0`, `weekly_pick_limit: 8`),
**18 entrants**, **$50 in**. **$20 a week to the most correct**; at the end of the season
**$380 to 1st and $160 to 2nd** (confirmed by the owner 2026-09-14). Not one of Mike's pools —
nothing about it comes from his emails. Sits on the Season Long row — row 1 is the size of the *kinds* of
game, not the count of leagues.

`js/infinityWar.js` (render) over `js/infinityModel.js` (pure math), the same split as
`grid.js` / `gridModel.js`. It reads the **same** matrix from `buildGrid()` that the Grid paints.

### The two prizes want opposite things — this is the whole tab

- **The season prize wants maximum expected correct.** That is the chalk eight — the eight most
  lopsided games — every week, with no cleverness at all. `chalkSet()` does it in one line.
- **The weekly $20 wants the highest chance of beating 17 people.** Different objective, and
  in a small pool it actively conflicts with the first.

**The weekly $20 is never split (owner, 2026-09-15).** Tied on correct, the Monday night
total-points guess closest by absolute value wins; tied on that too, the pot rolls to the next
week. Week 1 2026: a three-way tie at 7, won by djbogardus72 (43 vs a 41 total). `weekPrize()`
in `standingsModel.js` grades this for Standings, reading each entry's guess that
`infinityFeed.js` now captures (`entry.tiebreakers[week]`, kickoff-gated). A pool cached before
2026-09-15 has no guesses; a tied week then reads "refresh from Sleeper", never a split.
The tab itself got a **Week N results** block the same day (`blockResults()` in
`infinityWar.js`): every entry graded with `gradePickemWeek` + `weekPrize` against
`gameState.loadWeek` scores, walking earlier weeks to carry a rolled-over pot. Before it, a
finished week showed nothing but the pick-count table. The cached pool's team codes are the
site's (`JAX` → `JAC` via `sleeperApi.team()`); hand-built test pools must match or a pick
silently grades as `pre`.
**The strategy simulation below still models a tie as a split** (`share` of 1/n) and has not
been reworked for this rule.

**"Your eight" shows the Sleeper card when there is one (2026-09-16).** Week 1 read "0 of 8" with
every game grayed out, after a successful refresh: the card only ever read this device's
`infinity:<year>:<week>` or fell back to chalk, and **the odds feed drops a game once it is
played**, so a finished week has no prices and no chalk either. `loadWeek()` now takes my picks
from the cached feed first (the same precedence as `infinityPicks()`), keeps the side I took in
`S.sides`, and grades each pick against *that side* — a dog pick is right when the dog wins, and an
unpicked game is never marked missed. A Sleeper card is read-only here (change it on Sleeper, then
Refresh), `refresh()` rebuilds the card, and a week with every game final drops the two forecast
blocks. The simulation still models every pick as the favorite; the swap block says so when a
Sleeper card holds an underdog.

**If everyone picks chalk, everyone picks the same eight and everyone scores identically.** The
week is an n-way tie, decided only by the tiebreaker. Verified in the model: at `spread = 0` the tab
reports 0% outright, 100% tie, and a share of exactly 1/12 against 11 opponents. **Picking well
does not win the weekly prize; picking differently and being right does.** The tab shows both
numbers and refuses to blend them into one recommendation, because they are separate money and
the trade is the user's call.

### Why the field is simulated rather than computed

Scores here are **not independent draws** — every entrant who picked a game shares that game's
single outcome. A model treating opponents' scores as independent shows chalk winning outright far
more often than it can, and the error is invisible because the number still looks sensible. So
`simulateField()` draws the outcomes once per trial and scores everyone on the same draws.

Four things about it that are decisions, not details:

- **One simulation serves the whole render, and is cached across pick toggles.** The field does
  not depend on my picks, so re-simulating on every click spent ~400ms reproducing a result
  already in memory. Rebuilt only when week, field size or spread changes. Toggling a game is
  ~80ms.
- **Every swap candidate is scored against that same simulation.** This is what took the swap
  search from minutes to 71ms — but it is also *more correct*: comparing cards against the same
  simulated weeks is a paired comparison, so a swap worth half a percent is not buried in
  sampling noise. Scored against independent draws it would be indistinguishable from nothing.
- **The RNG is seeded.** Same card, same numbers, every render. A figure that drifts each repaint
  reads as noise, and a number nobody trusts is worse than no number.
- **`spread` — how far the field strays from chalk — IS A GUESS AND IS NOT CALIBRATED.** It is a
  visible control rather than a buried constant precisely so it can be argued with. **Re-fit it
  against real picks once the pool has played a few weeks**; until then the *ordering* of the
  outputs is the useful part and the absolute percentages are soft.

### The source rule, sharpened

`planModel.js` obeys SURVIVOR-STRATEGY.md §4's compression limit by never comparing a market
number to a projected one **across weeks**. Here the trap is closer, because this file ranks games
**within** one week: if eleven games are market-priced and three are projection-only, ranking all
fourteen together silently buries the three — their compressed numbers cannot compete, so they are
never in the eight, and nothing looks wrong. `sourceWarning()` says so out loud and the ordering
is labeled advisory. As of 2026-09-01 the odds snapshot covers all 272 games, so the warning
never fires in practice; it is there for when the feed lapses or a week runs past the market's
lookahead.

### Not shared with the Pick Sheet, on purpose

The Pick Sheet renders Mike's **number map** — scored games only, every game picked, numbers
emailed. This tab renders the **schedule feed** — all games, eight of them chosen. Different
pools, different rules, different sources. **A change to one must not be propagated to the other
on the assumption they should agree**, the same trap as the Thursday-games note above.

`js/infinityFeed.js` is likewise separate from `js/sleeperSurvivor.js` rather than a flag on it.
A survivor week is one pick per roster, teams spent permanently, rosters that die; a pick'em week
is up to eight picks, teams reusable, nobody eliminated. `used` would be meaningless and scarcity
does not exist. One normaliser serving both means a shape where half the keys are null for half
the callers — and the survivor grid's scarcity paint would read a pick'em's reused teams as a pool
that had spent everything. **The kickoff gate is imported from `sleeperApi.js`, not
reimplemented** — this pool leaks eight picks at a time rather than one, so it matters more here,
not less.

### Open

- **The pool had one entry — mine — when this was built.** Field-based numbers use the modeled
  default (11 opponents) until it fills; the live count overrides it only once there is more than
  just me, because a one-entry pool is a pool that has not filled, not a pool of one.
- **Payout split between 1st and 2nd at season's end is undecided** ("top 1 or 2"). Nothing models
  the season prize yet, so nothing depends on it — but a season-long standings view would.
- **`spread` wants calibrating** against real picks. See above.
