# Planning and Lookback Tabs — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Lookback Tab — Process, Not Outcome

Built 2026-10-31. `js/lookback.js` renders `data/results/lookback-<year>.json`, which
`scripts/lookback.py <year>` writes. The Tuesday schedule workflow reruns it right after grading,
and it should also be run by hand after `parse_pool_picks.py`. The findings it produced are in
STRATEGY.md, "Lookback — 2026 Weeks 1–7".

- **The headline is a chance, not a result.** Each carded, graded week is replayed 40,000 times
  from every game's last pre-kickoff price and scored against the real cards, with the real tie
  rule (most correct, then closest Monday total, then split). The same simulated weeks score
  every card, so differences between cards are paired comparisons, not noise.
- **The simulation is offline because it is heavy**, around 2 seconds a week in Python. The browser
  only formats. It is stdlib only, so CI needs no pip install. It is seeded, so an unchanged
  week writes an identical file.
- **"The site's rules" card is a copy of `markPicks()` / `tierOf()`** in `js/recommend.js`,
  chosen from the **Saturday** price with a **modeled** share, because the field's cards arrive
  after the deadline. If Recommend's rules change, change the `RULES` block in `lookback.py` in
  the same commit, or the tab grades a rulebook the site no longer uses.
- **"Best card possible" is a ceiling.** It comes from a one-game-at-a-time hill-climb with every
  card known. The bar is hatched so it never reads as a result someone achieved.
- It borrows the Standings classes (`.st-card`, `.st-stats`, `.st-table`, `.st-res`). Only the
  chance bars (`.lb-*`) are its own.

## Planning Tab — Read Before Adding Any Number

Built 2026-08-28. `js/planning.js` (render) over `js/planModel.js` (pure math), the same split as
`grid.js` / `gridModel.js`. It reads the **same** 32 × 18 matrix from `buildGrid()` that the Grid
paints, so the two survivor tabs can never disagree about a game.

The Grid answers "what can I spend, and when", a cell at a time. Planning answers the question
SURVIVOR-STRATEGY.md §1 says is the real one: *is this the best week I will ever get to spend this
team?* Three blocks, each straight out of §1 "Future value":

| Block | Answers | §1 line it implements |
|---|---|---|
| **What this week costs** | which available team is cheapest to spend now | "spend teams at or near their best spot, not before it" |
| **The wall ahead** | is a week coming where I have nothing left | "look 3–4 weeks ahead"; "bye weeks silently remove options" |
| **The elite budget** | where each team's one best spot falls | "the elite teams are a budget, not a menu — map them before Week 1" |

### The source rule — the thing to not break

**Two probability scales are on screen at once and they are not interchangeable.** §4's compression
limit: the 2026 projections top out at 75% and only ~16 of 272 games clear 70%, against a market
pricing 10 games at 80%+ and 58 at 70%+. So:

- **The market number is this week's price.** It is the only figure on the tab anyone should read
  as a real probability, and the only one the 70% floor is tested against.
- **The projection is an ordering device.** It says Week 11 is a better Seattle spot than Week 6.
  It does not say either is 61%.

**Every "cost to spend now" is projection *minus* projection**, both ends read off the same team's
`teamOutlook.games` series so the subtraction means something. The market price sits beside it and
never enters the arithmetic. Mixing the two would produce a confident, plausible, meaningless
number — the exact failure `js/season.js` exists to prevent, one layer up. Worked example: in Week
1 the Chargers show **81% market** and a cost of **+5 pts**, because that 5 points is `0.6978`
(their projected Week 11 peak) minus `0.6499` (their projected Week 1) — the 81% is nowhere in it.

Three consequences, all of them corrections waiting to happen:

- **`clearsFloor` is `null`, not `false`, when there is no market price.** Absent evidence is not
  evidence of absence, and a team with no line must not sort or render as one that failed the bar.
  The shortlist sorts cleared → unknown → failed for this reason.
- **The floor is never applied to a projection.** Against projections it rejects the entire season.
- **The wall's `credible` count is meaningless without `priced` beside it.** Past the market's
  lookahead there are no prices, so the count is 0 — which must render as "not priced yet", never
  as "no options". Those two states look identical in a bare number and mean opposite things.

### Smaller decisions that each have a reason

- **Cost is banded, not printed raw.** `free` / `cheap` / `mid` / `dear` as a left border color.
  Three decimals of a compressed number is false precision; what is real is cheap versus expensive.
  The band is an **edge**, not a fill — a filled row would be a fourth background competing with
  the Grid's paint vocabulary, and this is a list, not a heat map.
- **A modeled percentage wears the Grid's dotted underline**, so "modeled" looks the same on both
  survivor tabs. Color is spent on cost, which is the one thing this tab ranks.
- **Spent teams stay on the elite budget, struck through**, on the week their best spot *was* —
  removing them would hide whether they were spent well, which is the entire discipline §1 is
  about. `spentEarly` (used strictly before its best week) gets a rust border. Spending a team
  *after* its best week is not flagged: the earlier week may have been needed elsewhere.
- **`bestRemaining()` is recomputed, not read from `teamOutlook.bestWeek`.** That field is the best
  week of the whole season, which is the wrong answer the moment a week has passed or a team's peak
  sits behind us. Spent teams are the one exception and are mapped over the whole season, because
  the question they answer is "did I spend this well", not "what is left".
- **No field feed is loaded.** Blocks A–C are about *my* remaining teams; what the rest of the pool
  holds is a different question, answered by the pick board and Recommend. Loading it would be a
  feed this tab never reads and a second chance to render a stale one.
- **Planning never fetches from Sleeper.** The Grid owns that button. Two tabs racing the same
  undocumented endpoint is how a half-written feed lands on top of a complete one.
- **It re-reads pool state on `panelchange`.** The Grid can change the pool or pull a fresh feed
  while Planning is hidden, and a used team this tab did not notice is a team it would offer twice.

### Two things this shares with the Grid, deliberately

- **`survivor:pool` (localStorage) is the pool in play, sitewide.** Added 2026-08-28 with
  `activePool()` / `setActivePool()` in `survivorLeagues.js`. It seeds from `grid:prefs.league` on
  first read, so an existing user does not open Planning on the wrong pool. It is deliberately
  **not** `grid:prefs.league` itself: that pref carries an extra `none` meaning "stop striking
  rows", which is a display choice about the grid, not a statement about which pool I am in — so
  turning the striking off must not blank Planning. `setActivePool()` ignores anything that is not
  a real pool.
- **`auditSurvivorFeeds()` in `js/season.js`** is the schedule + odds + projections cross-check,
  used by both tabs. It was `gridAudit()`, private to `grid.js`, and was moved rather than copied:
  two tabs deciding independently whether the feeds agree is two chances to decide differently, and
  the one that says yes is the one that prints the nonsense.

### Not built

- **Buy-back tracking.** `survivorLeagues.js` still carries a `buybacks` counter nothing reads.
  The pool's rules were confirmed 2026-08-28 and are in SURVIVOR-STRATEGY.md §2 "The buy-back
  rules"; three of them constrain any implementation:
  **(a) a buy-back does not reset the used-teams list**, so `usedTeams()` stays monotonic across
  every life and nothing may ever clear it on re-entry;
  **(b) there is no cutoff week** — re-entry closes weekly at Sunday 1:00 PM ET, so do not build a
  season-wide window;
  **(c) buy-back state cannot be read from any feed** and must be hand-entered. The only signal
  that someone re-entered is that they keep picking, so a *derived* "they must be eliminated" is
  forbidden: wrong once, it understates the surviving field for the rest of the season.
- **Field scarcity inside the shortlist.** §1's EV formula divides by pick share, and a team 34% of
  the pool holds is worth less than its win probability suggests. The data exists
  (`fieldAvailability()` / `scarcityFor()`), so this is the natural next addition — but it needs a
  live field, which in preseason is empty.
