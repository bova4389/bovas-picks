# Standings — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Out of Mike's Suicide Pool (after Week 5) and Poop (after Week 6), 2026

Dallas lost Week 5 (Tampa Bay 24–16); one life, no buy-back. Recorded once, as
`out: { week: 5, team: 'DAL', why }` on Mike's entry in `js/survivorLeagues.js`, and every consumer
reads that rather than a hardcoded week. For any week **after** `out.week`: the Pick Sheet email
has **no `Suicide` line** and no missing-pick warning; the Grid and Planning list it in the pool
dropdown as a **disabled, greyed option** (`Mike's Suicide League (out after Week 5)`) and never
default to it (`activePool()` and `knownLeague()` skip an `out` pool); the
Picks tab leaves it out of the model (no recommendation, exposure or duplicate split) and shows it
as a greyed card with no controls; Survivor Standings moves its card below the Sleeper pools,
greyed; and `scripts/log_week_card.mjs` logs no card for it. Weeks up to and including Week 5
render exactly as before.

**Poop 2026 is out after Week 6**: the Rams lost 18–16 to Arizona, the third strike after the
Chargers (Week 1) and Dallas (Week 5), with both buy-backs spent. It is recorded as
`out: { week: 6, team: 'LAR', why }` on the `sleeper` entry and follows the same contract. Three
more things apply because it is a Sleeper pool. **Survivor Standings shows it as one greyed
line** past Week 6 and in All weeks, with no numbers, no Refresh button, and nothing fetched; the
Refresh handler also ignores any out pool. **`scripts/fetch_sleeper_feeds.mjs` stops fetching
it**, but carries its last copy forward in `data/sleeper/feeds-<year>.json`, so Weeks 1–6 still
render on every device. And Deadpool now has no same-format partner, so the Picks tab's
duplicate split has nothing to do. The Grid and Planning now default to Deadpool.

Next season, delete both `out` lines.

## Standings — Every Pool, Live, One Panel Per Row

Built 2026-09-13. `js/standings.js` (render + polling) over `js/liveModel.js` (pure math).
**Split into two panels 2026-09-14:** `initStandings(root, season, mode)` builds an independent
instance per row — `'season'` draws only the pick'em, `'survivor'` only the suicide pool. Each
instance closes over its own state and polling timer and polls only while its own panel shows;
there is no module-level state, because two timers writing one object is a bug waiting to happen. It reads Mike's cards (`data/raw/entries-<year>-w<NN>.json`, `data/survivor-<year>.json`)
against live ESPN state, so it needs nothing from his answer key. My entry is found by nickname
(`MY_NICK = 'Bova'`, #238 / #208 in 2026).

- **"Still alive to win the week" is exact.** The best outcome for me is always every remaining
  pick of mine hitting (flipping a game never helps me against anyone), so `bestCase()` scores that
  one outcome. A tie at the top is alive if some whole-number Monday total, no lower than the points
  already scored, leaves my guess strictly closest. Cross-checked in Python on 2026-09-13.
- **The percentage is an estimate and is labeled one.** `winChance()` simulates open games from
  `liveProb()`: pre-game price → expected margin, updated for score and time left (margin SD 13.45,
  scaling with √time left). Ties split; the Monday total is sampled around the market total. The
  RNG is seeded so the number only moves when a score does.
- **Pre-game prices only.** The odds bot snapshots during games, and those in-play prices already
  know the score (Jaguars went 78% → 90% after kickoff). Each game uses the last history snapshot
  taken before kickoff; adding the score on top of an in-play price would count the lead twice.
- **Every game on the card is listed, decided ones included** (changed 2026-09-20). The list used
  to filter to `!r.decided`, so a finished game vanished off the page and "which games am I
  winning or losing" had no answer anywhere — the only trace of the week was a pair of counters.
  `weekGames()` now renders all of them in kickoff order (stable: a list that re-sorts live games
  to the top cannot be scanned on a phone you reopen every ten minutes), each with a result chip
  oriented to **my** pick — `Won 27–20` / `Lost 20–27` / `Tied` / `Winning 14–7` / `Losing 7–14` —
  plus a tally line above. The chips are `.st-res`, the same five states and the same measured
  color pairs as the Picks tab's `.wc-res`, so a result looks identical on both tabs.
- **Per game it shows my chance if my pick wins vs. loses**, tagged `Must win` and
  `Barely matters`. **Both tags are measured relative to that same game's other branch**
  (`MUST_WIN_FRAC` 0.05, `BARELY_FRAC` 0.85) — `Must win` was `ifMiss === 0` until 2026-09-20,
  which is not a fact about the pool but **the simulation's resolution floor**: at 8,000 trials
  against a 282-entry field a branch worth 0.05% never lands once, so as soon as the week turned
  against us nearly every open game tagged `Must win`. A tag that fires everywhere says nothing,
  and it said it loudest in the week it mattered. Two rules follow: a game where **both** branches
  come back 0 is unresolved, not decisive, and gets **no tag**; and a probability below the sim's
  resolution prints as `<0.1%` via `finePct()`, never as `0%`. Raising the trial count would not
  fix either — the floor just moves.
- Suicide half: my pick's status, survived / out / playing / not started, the floor–ceiling of
  survivors, then the pick board (see "The pick board" under Grid Tab) with each team's result. A tied game says "counts as a loss?" — the rule is not on record.
- **The Sleeper cards (2026-09-14): Infinity War on Season Long, Poop and Deadpool on Survivor.**
  They read the pool copy the Grid / Infinity War tabs cache (`survivor:feed:<pool>:<year>`,
  `infinity:feed:infinity:<year>`), and each card has its **own Refresh from Sleeper** button
  that calls the same `fetchSleeperSurvivor` / `fetchInfinityPool` and cache writers — the plan
  said Standings should never fetch, but on a phone on a Sunday that meant leaving the page to
  update a pool, so it fetches only when the button is pressed. A survivor refresh also folds my
  picks into that pool's league state (`mergeMyPicks` + `saveLeagueState`), exactly as the Grid
  does, so the two stay in step.
  - **No usable token (missing or expired): the Connect box, no numbers.** A pool never fetched
    on this device: no numbers and a Refresh button. Never a half-read pool as if it were the pool.
  - **The kickoff gate is stated, not hidden.** Other entrants' picks exist only for games that
    had kicked off at the last refresh. Survivor cards say how many picks are still hidden, fold
    them into "not started", and drop the floor–ceiling line while any are hidden. Infinity War's
    **Max** is `limit − losses` (a full card of 8 assumed), not correct + visible open picks,
    which would cap a rival whose picks simply have not been revealed.
  - **Infinity War's week prize** is final only once every game of the week is final; before that
    it says leading / alive / out on Max. Ties split the $20.
  - **The math lives in the NEW file `js/standingsModel.js`**, not as new exports on
    `liveModel.js` or `infinityModel.js`: those are cached in visitors' browsers, and a fresh
    caller importing a name a cached copy lacks blanks the site. A file nobody has cached cannot
    be stale.
- **Payouts and "All weeks" (2026-09-14).** Prize money lives in the hand-kept
  `data/payouts-<year>.json` — Mike's $1,270 weekly / $2,540 season, the suicide pool's $5,650,
  Infinity War's $20 weekly with $380 / $160 season prizes, and Poop / Deadpool as a base pot plus
  **hand-entered** `buybacksByWeek` (buy-backs cannot be read from Sleeper; update the file when
  the owner reports them). Every card shows its payout line; the dropdown's **All weeks** swaps in
  season views. Rules that each have a reason:
  - **The season is graded in the browser, week by week, from ESPN scores** — it does not wait on
    `scripts/grade_week.py` or `data/results/`, which did not exist when this shipped.
  - **Money counts only for a complete week** (every game final). An unfinished week shows its
    leaders and pays nobody. Mike's weekly tie rule: most correct, then Monday total closest by
    absolute value, then an even split (`pickemWeekResult()`); Infinity War splits ties.
  - **Mike's pick'em weeks with no parsed cards are skipped and named**, not guessed.
  - **The survivor season view is a burn matrix**: teams down, weeks across, how many entries took
    each team each week, tinted won / lost / playing, my pick ringed. The owner left the shape open;
    it is the pool-level mirror of the Grid. Losses are **counted, never turned into
    eliminations** — buy-backs happen outside Sleeper.
  - Math in the new `js/payouts.js`, for the same cached-module reason as `standingsModel.js`.
- **Week dropdown (2026-09-14).** Defaults to `poolWeek()` — the Wednesday 6pm rule above, shared
  with Squares — never `currentWeek()`, which would replace Monday night's settled standings with
  an empty week hours after the last game. It offers Week 1 through that default, never a future
  week, and the choice is not remembered. The header holds the dropdown and is drawn once; only
  the body re-renders on a poll, so a live refresh cannot snap an open dropdown shut. A switch
  mid-fetch drops the stale answer (`loadSeq`, and `refresh()` re-checks the week after its
  await). Prices reload per week because rivalry pairs repeat.
- **`.card` has no padding, so `.st-card` supplies its own** (added 2026-09-14). Without it every
  Standings card put its text on the rounded border. Tables fit the card rather than scroll:
  numbers `nowrap` and right-aligned (`.st-num`), the name column wraps, and the table caps at
  640px so a desktop card does not strand the numbers far from the names. Summary boxes go two-up
  below 420px.
- No new exports were added to shared modules for this (it fetches the raw cards itself), so it
  can ship mid-game without the stale-shared-module blank page described under Cache busting.
