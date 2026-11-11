# Picks Tab — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Picks Tab — The Cross-Pool Week Card

Built 2026-09-09. `js/weekCard.js` (render) over `js/weekCardModel.js` (pure math), the same
split as `grid.js` / `gridModel.js`. It reads the **same** matrix from `buildGrid()` the Grid
paints and leans on `js/planModel.js` rather than re-deriving future value, so no survivor tab
can disagree with another about a game.

It answers the one question the site could not ask:

> "Given several pools with different formats and separate used-team boards, what do I submit in
> each one this week, and am I over-exposed to a single game?"

### It ignores the pool switcher, deliberately — do not add one

Every other survivor view is scoped to `activePool()`. This one reads every pool's board in a single
pass, and a switcher here would collapse it back into Planning with extra steps while leaving the
cross-pool exposure line — the only thing on this site that answers "am I about to lose
everything on one game" — with nothing to measure. **Changing the pool on the Grid or Planning
does not change this tab.** That is the design, not an oversight.

`boards()` builds one used-set per league from that league's own `loadLeagueState()`. **Never
union them.** A union silently removes teams that are still perfectly spendable in the other
pools, and it looks right.

### The three scale rules, which every number here obeys

Same compression limit as Planning (SURVIVOR-STRATEGY.md §4), stated as rules because this file
has more chances to break them:

1. **`gap` is market minus market. `fvCost` is projection minus projection.** There is
   deliberately **no expression that combines them** — there is no honest exchange rate between
   the two scales, which is exactly why the cross-pool swap below is two separate clauses rather
   than one tidy EV formula. A tidy formula would be a confident, plausible, meaningless number.
2. **The 0.70 floor is a market test only**, never applied to a projection.
3. **A projection is never printed as a probability.**

**`bookmakerCount >= 4` is load-bearing, and it is why this tab cannot look ahead on the market
scale at all.** `data/odds/current.json` carries all 272 games, and reading that as "the season is
priced" is the trap: measured 2026-09-09, only the current week has a market — **16 events at 9
books, and all 254 others at exactly one book.** One book is an opinion, not a market
(SURVIVOR-STRATEGY.md §4). So future value is measured on projections and nowhere else.

### Selection is a property of the pool, not a setting

| Pool shape | Ranked by | Why |
|---|---|---|
| One life, 100+ entries (Mike's) | leverage where a **measured** share exists; otherwise future value inside the band | runs to Week 10+, so future value is the second pillar, not a tie-break |
| Three lives, few entries (Poop, Deadpool) | win probability, future value as the tie-break | §2: too few rivals for a fade to buy anything |

**A modeled pick share cannot produce a contrarian pick, and the tab says so rather than
pretending otherwise.** `shareFor()` is monotone in `p` above ~0.71, so `leverageFor(p,
shareFor(p))` is monotone there too and its argmax is *always* the chalk — leverage computed from
a modeled share only re-derives the favorite and dresses it up as analysis. That is not a fault in
`js/pickShare.js`, whose header says plainly the measured numbers arrive after kickoff; it means
the Mike's branch must fall through to future value and label itself `future-value`, which is what
it does. **The moment a real `data/popularity/pop-<year>-w<NN>.json` lands, the branch flips to
`leverage` on its own.**

**Entry counts come from Sleeper, not from the file.** `entrantsOf()` prefers the count off the
feed and falls back to `entrants` in `js/survivorLeagues.js` only before the first fetch. That
number is a hand-taken snapshot and has been wrong twice — 12 while the pool was 18, then 18 while
it was 29 — and it is not decoration: it decides which of two same-format pools keeps the chalk
when they collide, so a stale one sends the better team to the smaller pot. The browser reads the
Grid's cached feeds (it never fetches — the Grid owns that button); CI passes the counts it just
fetched. A count that came off the file wears the dotted underline a modeled number wears
everywhere else, **but only for a pool that has a feed to be asked** — Mike's 247 is hand-recorded
because there is nothing to ask, and flagging it would point the reader at a Refresh button that
cannot help them.

**Bands come off `economics.potShare`, never a league id.** Five points in a full-pot pool, two in
a half-pot one, because a buy-back there is ~8% of the *playable* pot against ~1% in Poop and
Deadpool. East Orange was the only half-pot pool and is dissolved, so no live pool uses the tight
band today; the mechanism stays so the next charity pool gets it from its config alone.

### The cross-pool layer — the part that exists nowhere else

Duplicated picks are detected between **same-format** pools only (`formatKey()` — lives, potShare,
entry, buyback). Poop and Deadpool are identical; Mike's is a different game and so is East
Orange, so a pick shared with either of those is not the duplicate this layer means.

**The bigger pot keeps the better team.** If one of the two tickets is going to carry slightly
less win probability, it should be the one playing for less money.

Two clauses, each confined to one scale, either sufficient:

- **`near-free`** (market) — the two candidates are within `SPLIT_BAND` (3 pts), so the split
  costs almost nothing and roughly quarters the joint-wipeout probability.
- **`future-value` / `dead-weight`** (projection) — the alternative is at least `FV_EDGE` (2 pts)
  cheaper to spend, or has no better spot left at all. Capped by the pool's band, which is what
  implements §4.4's "at 6+ points, win probability dominates".

**`FV_EDGE` is a chosen threshold and the Week 1 2026 case sits 0.2 points inside it** — the
clause fires at 0.02 and would not at 0.03. That is the honest shape of that particular week
rather than a flaw in the number, and it is precisely why change detection exists.

`exposureOf()` counts by **game, not by team**, so two pools on different teams in the same game
would be caught rather than counted as diversified. `pAllLose` multiplies as independent events,
which they are not, and is **labeled** rather than adjusted by a fudge factor that would look more
careful and be less true.

### Confidence is shown always and gates nothing

Provisional (Sun–Wed) → Firming (Thu–Fri) → Final (Sat), tracking the odds workflow's own cadence.
**Hiding the card until Saturday would be worse than showing a labeled draft**: Mike's locks at
midnight Saturday and §2 confirms there is no late-information edge to wait for, so Saturday
morning is the decision point and everything earlier is an honest draft.

The three states are distinguished by weight and fill, **not** by a red/amber/green — none of them
is an error, and "Provisional" in a warning color would read as a fault in the data rather than as
a statement about the day of the week.

### The change banner earns the feature's keep

The card recomputes on every render and diffs against `survivor:card:<season>:<week>` in
localStorage. **Only a changed recommendation raises a banner** — a price that drifted a tenth of
a point is not news, and a banner firing every three hours is one nobody reads by Week 3, which
would cost exactly the week it mattered. The stored copy holds the card's *shape* only, so
changing a threshold cannot read as a recommendation flip on the next load.

### The log writes itself — and the one way it can be wrong

SURVIVOR-STRATEGY.md §6 step 7 asked for this and nothing implemented it. Each week's card reduces
to a record — pool, team, price, gap, future cost, share, reason code, teams left — in
**`data/survivor-log-<year>.json`**.

**`.github/workflows/fetch-odds.yml` writes it, on every odds snapshot.** It rides on that
workflow rather than having a schedule of its own on purpose: the card is a function of the odds,
so it should be rebuilt exactly when they change and never on a cadence that could drift out of
step with them. Nothing has to be done by hand for the record to exist. The copy button on the tab
is now the *fallback* — for a week CI missed, or a correction — rather than a weekly routine.
That routine was the original design and it was a bad one: a chore that gets done twice and then
never again produces a log with two weeks in it, which is worse than no log.

**A `final` entry is frozen once written.** Saturday is the decision point, so the Sunday runs must
not be able to rebuild the week on post-lock prices. Without the freeze the log would end the
season claiming recommendations it never made, and Lookback would be grading a record that had
been quietly edited to agree with the outcome. Provisional and firming entries *are* replaced —
they are drafts of the same week and the later one is better informed. An unchanged card writes
nothing at all, or eight runs a day would produce eight commits differing only in a timestamp.

**Where each pool's used teams come from, and which one can lie:**

| Pool | Source | Can drift? |
|---|---|---|
| Poop, Deadpool | Sleeper, live — my own picks come back with the field | No |
| Mike's | **the log's own previous weeks** | **Yes** |

Mike's has no feed, and the mailed workbook carries no flag saying which entry is mine, so CI has
nothing to go on but what the log says was *recommended* — which is not always what was
*submitted*. Follow the card and the two agree forever; deviate once and they part, and the
failure is silent in the worst way: CI keeps recommending teams that are already spent and every
number about them is confident and wrong.

The browser is the only place that holds the truth, so **`driftWarning()` in `js/weekCard.js`
compares the committed log against `survivor:<season>:mike` week by week and says so when they
disagree.** It compares **only weeks already behind us** — the log has no entry for the week being
decided, so including it would fire a warning the moment a pick was recorded, every single week,
and a warning that always fires is one nobody reads on the week it is real.

**This is the input the Lookback tab has been blocked on.**

### Node is in CI only, and this is not a build step

`scripts/log_week_card.mjs` **imports `js/weekCardModel.js` directly** rather than
reimplementing it. That is the whole design: a second copy of the model — in Python, or rewritten
in the script — would be two models that agree right up until the day they quietly do not, and the
log would then record a recommendation the site never made.

`js/package.json` is four lines (`{"type": "module"}`) and exists solely to tell Node those files
are ESM. **Nothing is installed, compiled or bundled**; there are no dependencies, `npm ci` would
have nothing to do, the browser never reads it, and `node` is never required to serve the site. It
is the same carve-out the Python scripts in `scripts/` already have — offline tooling that
produces data, not a toolchain the page depends on. **Do not "fix" it by deleting it**, and do not
read it as licence to add a bundler.

The workflow step is `continue-on-error: true` **and** the script has a catch-all that exits 0.
Doubled deliberately: the odds snapshot is the more important of the two jobs by a long way, and
Sleeper being down for ten minutes must never cost a sample in the Thursday-to-Saturday window
where lines actually move. A Sleeper failure falls back to the log rather than aborting — a
slightly stale used-set is recoverable and is labeled in the run output; no record at all is not.

### Tests

`test/weekcard.test.html` runs the model in the browser against
`test/fixtures/odds-2026-09-08.json` — a frozen 272-event snapshot reassembled from
`data/odds/history/`, so the golden case cannot drift as the live feed moves. 68 assertions
covering the model, the log's freeze and carry-forward rules, and the shape of a logged card; open
it on the dev server. There is no node in this environment and no build step, so the test is a
page rather than a runner — same reasoning as `assets-review.html`.

**The golden case is Week 1 2026**: LAC 80.7 / JAC 77.5 / DET 73.1 are the only three clearing the
floor at 4+ books, and the expected card is **JAC / LAC / JAC** (Mike's / Poop / Deadpool) with 2/2
exposure and DET *held*. It read JAC / LAC / JAC / LAC until East Orange was removed; the half-pot
band that pool exercised is now tested on a made-up half-pot league. If a change makes DET spendable, or collapses the exposure to 1/1, the change is wrong.
