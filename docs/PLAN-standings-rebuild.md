# Plan — Standings rebuild, Sleeper reconnect, and Lock/Unlock

Written 2026-09-14 from a Claude Code **web** session (no local checkout, GitHub-only egress,
so nothing here was run against Sleeper or a browser). Hand this to a local session.

Branch in flight: `claude/bovas-picks-redesign-bjmoit`.

---

## 0. What the owner asked for, verbatim in substance

1. Standings should cover **all my leagues**, not just Mike's.
   * **Season Long** row → two league cards: **Mike's Pick'em** and **Infinity War** (Sleeper).
   * **Survivor** row → three league cards: **Mike's Suicide**, **Poop 2026**, **Deadpool**.
2. Stop the duplication: the survivor pool currently renders on the Season Long standings, and
   Mike's pick'em renders on the Survivor standings. Each half belongs to one row only.
3. Mike's survivor results appear **twice** on the Survivor row — the pick board at the bottom of
   the Grid, and the table on Standings. Keep the **pick-board format**, move it to Standings,
   keep the four summary boxes above it.
4. Table formatting: text sits too close to the card edge and sometimes overflows. Fix on both
   the survivor and the season-long standings tables.
5. **Week dropdown** on Standings, defaulting to the current pool week, rolling over **Wednesday
   evening** (so Week 1 stays on screen until Wed evening, then Week 2).
6. An **All Weeks** option in that dropdown.
   * Season long: year-to-date correct picks.
   * Survivor: something showing teams and remaining availability (shape was left open — see §6).
7. **Payouts** in the summary blocks, cumulative across the season, so it is visible who is
   winning money. Same cumulative view for **Infinity War** at $20/week.
8. **Lock / Unlock** buttons on the Pick Sheet (Season Long) and the Picks tab (Survivor), so a
   submitted card cannot be changed by a stray tap.
9. **East Orange Squeeze is dissolved** — remove it from the site's knowledge.
10. The Sleeper token instructions must live **inside the Connect Sleeper box**, and getting the
    token must not require DevTools every time.

---

## 1. Read these first

`CLAUDE.md` is the authority and several rules below are quoted from it rather than invented.
The ones this work touches:

* **Never put `?v=` on a shared ES module.** Every file under §3 marked SHARED is unversioned.
  Bump `css/styles.css` and `js/app.js` in `index.html` only (letter suffix on a same-day edit).
* **A new export on a shared module is a two-deploy change** when it matters on a game day
  (Pages serves the unversioned module with its own max-age). Push the shared module first.
* **The odds join is `buildSeasonOddsIndex` / `matchSeasonOdds`**, never `buildOddsIndex`.
* **The kickoff gate is not optional** and is imported from `sleeperApi.js`, never reimplemented.
* **Pre-game prices only** in `standings.js` — an in-play snapshot already knows the score.
* **Buy-backs cannot be derived** from any feed. Never compute "eliminated"; count losses.
* `data/odds/` is bot-owned; do not hand-edit.

---

## 2. Order of work

Each phase is independently shippable and independently revertable. Ship in this order — the
early phases are pure win with no data dependency, and the later ones need either a Sleeper
token or a graded week.

| # | Phase | Blocked on |
|---|---|---|
| 1 | East Orange removal | nothing |
| 2 | Sleeper connect: bookmarklet + in-box instructions | nothing to build; verification needs a real token |
| 3 | Split the Standings panel in two | nothing |
| 4 | Table formatting pass | nothing |
| 5 | Week dropdown + Wednesday cutover | nothing |
| 6 | Multi-league standings (Infinity, Poop, Deadpool) | a connected Sleeper token to see real data |
| 7 | Payouts + All Weeks | `data/results/` existing (first Tuesday grading run) |
| 8 | Lock / Unlock | nothing |
| 9 | Docs | after the rest |

---

## 3. Phase 1 — Remove East Orange Squeeze

The pool was dissolved. Remove it as a **live pool**, keep it in the **historical record**.

**Remove from:**

* `js/survivorLeagues.js` — the `eastorange` entry in `LEAGUES` (currently the 4th, after Mike's).
  Nothing else in that file names it except a comment on `potShare`.
* `test/weekcard.test.html` — 7 assertions reference `eastorange`
  (lines ~100, 103, 104–105, 114, 151, 297, 307). The Week-1-2026 golden case is
  **JAC / LAC / JAC / LAC with 2/2 exposure and DET held** across four pools; with three pools the
  expected card becomes **JAC / LAC / JAC** — recompute rather than assuming, and update the
  assertion count in the file's header.
* `CLAUDE.md` — lines ~485, 839, 862–863, 935, 987, 1106, 1118, 1911, 1914.
* `SURVIVOR-STRATEGY.md` — the pool table at ~19, and §"East Orange's half pot" (~34–61, 72,
  195, 234–236, 487). Do not delete the half-pot *reasoning*; mark the pool dissolved and keep
  the analysis, because it is the only worked example of how `potShare` changes buy-back maths.
* `scripts/log_week_card.mjs` — the header table at ~28.

**Keep, deliberately:**

* `data/survivor-log-2026.json` (the Week 1 entry with `"pool": "eastorange"`) and
  `data/picks-sent-2026.json`. Those are records of what was actually recommended and submitted.
  Rewriting them to agree with today would falsify the log, which is the one thing the freeze
  rule in `weekCardModel` exists to prevent. Add a line to the sent file's `note` saying the pool
  was dissolved after Week 1.
* `js/weekCardModel.js`'s `potShare` band mechanism. It is keyed on economics, not on a league
  id (CLAUDE.md: "Bands come off `economics.potShare`, never a league id"). No league uses the
  half-pot band now; the code stays so the next charity pool gets it for free.

**Already handled, do not add migration code:** `knownLeague()` in `grid.js` resolves a stored
`grid:prefs.league` that is no longer in `LEAGUES` back to the default, and `setActivePool()`
ignores anything that is not a real pool. A device sitting on East Orange recovers on its own.

**Check:** open the Grid, Planning and Picks tabs with `survivor:pool` manually set to
`eastorange` in localStorage and confirm all three land on Poop rather than rendering blank.

---

## 4. Phase 2 — Sleeper connect made survivable

### 4a. What actually happened (put this in CLAUDE.md too)

Nothing changed in our code. On **2026-09-13** Sleeper started answering `"Unauthorized"` to
unauthenticated `get_pickem_picks_for_league` (and every sibling pick query). REST still serves
leagues, users and rosters. This is almost certainly Sleeper closing the leak we documented on
2026-08-14 — their app hides a pick until kickoff and their API did not.

`js/sleeperAuth.js` already solves it with a per-device JWT. The problems are ergonomic:

* The instructions require DevTools, which is a computer-only workflow, and the owner uses an
  iPad.
* Nothing says how often this is needed. (Answer: the JWT runs about a year. Re-paste is needed
  on expiry, on Sleeper logout, or on a password change. It is not a weekly chore.)

### 4b. Build the bookmarklet

New file `js/sleeperBookmarklet.js` (SHARED, unversioned), exporting `bookmarkletHref()`.

The bookmarklet runs on `sleeper.com` and must:

* Scan **both** `localStorage` and `sessionStorage`, every key, plus every value that parses as
  JSON, one level deep — do not hardcode a key name. Sleeper can rename a key at any time and a
  hardcoded lookup fails silently, which is the failure mode this whole phase is fixing.
* Accept a value as a candidate only if it matches `^[\w-]+\.[\w-]+\.[\w-]+$` **and** its
  base64url payload contains `"user_id"` and an `"exp"` in the future. That is the same test
  `tokenInfo()` applies, so anything the bookmarklet copies is something `saveToken()` accepts.
* Copy via `navigator.clipboard.writeText`, falling back to a `prompt()` box holding the token
  (iOS Safari refuses clipboard writes outside a user gesture in some versions; a bookmark tap
  usually counts, but the fallback costs four lines and removes the whole class of failure).
* Say what happened either way: "Sleeper token copied — paste it into Bova's Picks" or
  "No Sleeper token found on this page. Make sure you are logged in at sleeper.com, then tap
  again."
* Be a single-line `javascript:` URL, `encodeURIComponent`-safe, with no external fetch. It must
  not call anything of ours — it runs on Sleeper's origin, and a bookmarklet that phones home is
  a bookmarklet that gets flagged.

**It cannot be tested from the web session.** First real run is the test. If it finds nothing,
the DevTools path is still there.

### 4c. Rework the Connect box — `js/sleeperAuth.js`, `boxHtml()`

Disconnected state, in this order:

1. The paste field and Save button (unchanged).
2. **"Get my token" — the bookmarklet**, primary path:
   * A **Copy bookmarklet** button (writes `bookmarkletHref()` to the clipboard).
   * Three numbered lines: save it as a bookmark → open sleeper.com logged in → tap the
     bookmark, then come back here and paste.
   * iPad-specific note, because it is the surface this is for: in Safari, add any bookmark,
     then edit it and replace the address with what you copied.
3. A `<details>` **"If that doesn't work"** carrying the existing DevTools steps verbatim.
4. The standing warning, kept: it works like your password, it stays in this browser only, never
   paste it anywhere else.

Connected state:

* Keep "Sleeper connected as X · expires <date>".
* Add an **amber "time to reconnect"** state when `exp` is inside 30 days — new branch on
  `tokenInfo()`, e.g. `expiringSoon`. The point is that it warns in August, not on a Sunday.

### 4d. Put a Connect box where the failure happens

`mountConnectBoxes()` already repaints every box on the page on the `sleeperauth` event, so
this is just markup. Add `data-sl-connect` to:

* the two new standings panels (§5), in the league-card error state, not permanently — a box
  that only appears when a pool could not be read.

Keep the existing two (Grid live row, Infinity War controls).

### 4e. Rules that do not move

* Token in `localStorage` (`sleeper:token`) and nowhere else. Never committed, never in `data/`,
  **never given to CI** — `log_week_card.mjs` keeps its existing unauthenticated fallback to the
  log, and its `continue-on-error` stays.
* No password login, no proxy holding the token. The repo is public.
* `user_id` is regex-read from the payload text, never `JSON.parse`d (18-digit bare number).

---

## 5. Phase 3 — Split Standings into two panels

Today `standings` is one panel listed in both `GROUPS`, and `standings.js` renders
`pickemSection()` + `survivorSection()` unconditionally. That is the duplication.

**`js/app.js`**

* `PANELS`: add `'survivor-standings': { label: 'Standings' }`.
* `GROUPS.season.panels` → `['picksheet', 'standings', 'odds', 'recommend', 'infinity', 'lookback']`
  (unchanged — `standings` becomes season-long only).
* `GROUPS.survivor.panels` → `['grid', 'odds', 'survivor', 'picks', 'survivor-standings']`.
* Boot: `initStandings(root, SEASON, 'season')` and
  `initStandings(document.getElementById('survivor-standings-root'), SEASON, 'survivor')`.
* `fromHash()` needs no change: a bookmarked `#survivor/standings` re-homes to the group that
  still carries `standings`, which is Season Long. That is the wrong row for a survivor
  bookmark but it is the documented behaviour and it is not worth a special case — note it in
  CLAUDE.md rather than building a redirect table.

**`index.html`** — add `panel-survivor-standings` with `#survivor-standings-root`, modelled on
`panel-standings`. Bump `?v=` on `css/styles.css` and `js/app.js`.

**`js/standings.js`** — the module state `S` is currently a single module-level object, and two
instances of the tab cannot share it. Options, in order of preference:

1. **Preferred:** make the module export a factory — `initStandings(root, season, mode)` creates
   its own `state` object and closes over it. The fetched feeds (schedule, number map, survivor
   file, odds snapshot, odds history) are all memoised by `loadJSON` in `data.js`, so two
   instances cost no extra network.
2. Keep one `S` keyed by mode (`S.season`, `S.survivor`). Works, but two polling timers writing
   one object is exactly the kind of thing that reads fine and misbehaves once.

Either way the polling gate must be per instance: `showing()` reads *that* instance's
`.closest('.panel')`, so the hidden panel never polls. Verify only one timer is live at a time
by logging in dev.

**Then:** `mode === 'season'` renders pick'em + Infinity; `mode === 'survivor'` renders Mike's
suicide + Poop + Deadpool. Neither renders the other's half.

**Grid:** remove `paintPickBoard()` and the `#g-pickboard` mount, its week `<select>` handler,
and `S.pickWeek`. `js/survivorPicks.js` stays as-is — it was written pure specifically so this
move is a change of mount point and nothing else. Do not delete `weekDistribution()` /
`weeksWithPicks()` in `survivorLeagues.js`; the new home calls them.

---

## 6. Phase 4 — The league card, and what each one shows

Introduce one component used by all five cards, so a sixth pool is a config entry rather than a
render path. Suggested new file `js/standingsCards.js` (SHARED, unversioned, pure render) taking
already-computed data from `standings.js`.

Common shape, top to bottom:

1. Eyebrow: league name. Title: `Week N: <the one-line fact>`.
2. **Summary boxes** (`.st-stats`, 4 up) — the format the owner called out as the one to keep.
3. **Payout line** (§8).
4. The league's own body.

### Season Long

**Mike's Pick'em** — as built today: summary boxes (correct / winning now / still to play /
rank of N), the verdict pill, "games still to decide", the Monday tiebreaker line, leaderboard.
Keep all of it. `MY_NICK = 'Bova'` (#238 pick'em, #208 suicide in 2026).

**Infinity War** — new. Reads the cached pool from `loadCachedPool(season, pool)` in
`js/infinityFeed.js`; **never fetches** (the Infinity War tab owns that button, same rule
Planning follows for the Grid).

* Grading: each entry has up to 8 picks for the week; score against final/live results from
  `gameState.loadWeek()`. Put the grading in `js/infinityModel.js` next to the existing
  `gradeCard()` rather than in the render file.
* Boxes: my correct / leader's correct / my rank of N / weekly $20 status.
* Table: entry, correct, still to play, max. Same kickoff-gate caveat line the pick board uses —
  mid-week the visible picks are not the pool.
* Disconnected: render the Connect box (§4d) instead of numbers. Never render a half-read pool
  as if it were the pool.

### Survivor

All three survivor cards use the **pick-board format** (`renderPickBoard()`), with the summary
boxes above it. `js/sleeperSurvivor.js` normalises the Sleeper answer into the same shape as
`data/survivor-<year>.json`, so `survivorWeek()` in `liveModel.js` and `weekDistribution()` in
`survivorLeagues.js` both work on either source **without branching**. Do not add a branch.

**Mike's Suicide** — feed `data/survivor-<year>.json`. Boxes: survived / out / playing now /
not started. Keep the exact "Whatever happens next, between X and Y of N get through Week N"
line — it is the honest floor/ceiling and it is the thing the owner screenshotted.

**Poop 2026** and **Deadpool** — feed from `survivor:feed:<pool>:<year>` in localStorage
(populated by the Grid's Refresh). Same boxes. Additionally: my pick and its status, and lives
used — but **lives is displayed only, never derived**. `metadata.is_eliminated` is Sleeper's
opinion and a buy-back is administered outside the app; count losses, never eliminations.

---

## 7. Phase 5 — Table formatting

The complaint is text sitting on, and sometimes over, the card edge.

* `.st-tablewrap` currently is bare `overflow-x: auto` inside a padded `.card`, so a wide table
  scrolls with its first column flush to the padding edge and long names collide with the next
  column.
* Fixes, all in `css/styles.css`:
  * Give `.st-tablewrap` its own inline padding and let the table breathe:
    `padding-inline: 2px; margin-inline: -2px;` plus a right-edge fade so a scrollable table
    looks scrollable.
  * `.st-table` gets `table-layout: auto` with a `min-width` so it scrolls rather than crushes,
    and `.st-name { min-width: 8.5rem; }`.
  * Numeric columns `white-space: nowrap; text-align: right;` and headers matched.
  * First column `position: sticky; left: 0;` with the row background, so a name stays readable
    while the numbers scroll on a phone. Note the Grid's `.gteam-in` trap: do **not** put
    `display:flex` on a `<th>` or `<td>` — wrap the contents in an inner `<span>`.
  * `.st-stats` at 375px: four boxes at `repeat(4, minmax(0,1fr))` give ~78px each and the
    three-digit counts crowd. Go `repeat(2, minmax(0,1fr))` below 420px.
* Contrast: any new text colour inside a tinted row must be measured, not eyeballed — 4.5:1
  minimum, and `--ink-faint` fails on paint (CLAUDE.md, Grid "Text inside a painted cell").
* Verify at **375px** across every week, which is the site's stated primary surface.

Same treatment applies to the season-long leaderboard, which shares `.st-table`.

---

## 8. Phase 6 — Week dropdown, Wednesday cutover, All Weeks

**New shared module `js/poolWeek.js`** (unversioned, pure, imports nothing).

* `poolWeek(schedule, now = new Date())` → the week to show by default.
* Rule: hold a week on screen until the **Wednesday evening after its last game**, then flip.
  Proposed hour: **6:00 PM local**. Squares' `defaultWeek()` / `cutoverFor()` in
  `js/squaresModel.js` already implements exactly this shape at 2pm with a **36-hour tail** —
  read it before writing this, because the tail is what makes one rule cover a Monday nighter
  without a special case, and the one week that needs it (a Monday-only week) is the week nobody
  remembers to test.
* Do **not** use `currentWeek()` from `gameState.js` here. It rolls over a few hours after the
  last game, which is right for a schedule and wrong for a pool — it would replace Sunday's
  settled standings with an empty Week 2 before anyone had looked.
* ~~Squares should keep its own 2pm rule.~~ **Superseded — owner unified both on 6pm; see §13.1.**

**The control** — one `<select>` at the top of each standings panel, shared by every card on
that panel: `All weeks`, then each week that has data, newest last. Selected week is **not**
persisted (same reasoning as `S.pickWeek` on the pick board: a remembered Week 3 is still on
screen in December).

**All Weeks — Season Long**

* Mike's: per entry, cumulative correct, weeks won, YTD payout, rank; my row highlighted.
  Source `data/results/pickem-<year>-w<NN>.json` for graded weeks, the live week appended from
  what is on screen and labelled in-progress.
* Infinity: cumulative correct, weeks won, $ YTD.

**All Weeks — Survivor**

The owner explicitly left this shape open. Recommendation: a **32 × weeks burn matrix** — for
each team, which weeks the pool has already spent it and how heavily, plus entries alive by
week. It is the pool-level mirror of the Grid, it answers "what is the field still holding",
and it reuses `fieldAvailability()` / `scarcityFor()`, which already exist and are currently
only half-used. Confirm with the owner before building; a simpler fallback is a week-by-week
survivors-remaining line with the losing teams named.

---

## 9. Phase 7 — Payouts

**New hand-maintained file `data/payouts-<year>.json`.** Hand-maintained is correct and is not
an omission — these numbers arrive in a commissioner's email, exactly like `squares-<year>.json`.

Each pool cites its own source. **Infinity War is not one of Mike's pools** — an earlier draft
of this file filed it under Mike's email, which was wrong; its terms come from the owner.

```json
{
  "year": 2026,
  "pools": {
    "mike-pickem":  { "name": "Mike's Weekly Pool", "source": "Mike Lowe season email, 2026-09-13",
                      "entries": 284, "weekly": 1270, "season": 2540 },
    "mike-suicide": { "name": "Mike's Suicide Pool", "source": "Mike Lowe season email, 2026-09-13",
                      "entries": 247, "survivor": 5650 },
    "infinity":     { "name": "Infinity War", "source": "owner, 2026-09-14",
                      "entries": 18, "entry": 50, "weekly": 20, "season": { "first": 380, "second": 160 } },
    "sleeper":      { "name": "Poop 2026", "source": "owner, 2026-09-14",
                      "base": 870, "buyback": 15, "buybacksByWeek": {} },
    "deadpool":     { "name": "Deadpool", "source": "owner, 2026-09-14",
                      "base": 600, "buyback": 15, "buybacksByWeek": { "1": 2 } }
  }
}
```

`mike-pickem.season` ($2,540) goes to Mike's season-long winner, confirmed by the owner 9/14/2026.

* **CLAUDE.md is stale on these figures** — it says "$1,000 paid out each week" and "roughly
  $5–6k to the season-long winners". Correct it to $1,270 / $2,540 / $5,650 and cite the email.
* The entry counts also disagree with what we parsed: the email says 284 in the weekly pool,
  `data/raw/entries-2026-w01.json` holds 281 cards, and `survivor-2026.json` holds 247 (which
  matches). `LEAGUES` still says Mike's suicide is 235. Use the **parsed file** for anything
  computed and the **email** for the advertised pot; show the parsed count in the UI, since that
  is the number the ranking is actually against. Update `entrants: 235` → 247 in
  `survivorLeagues.js`, and note in CLAUDE.md that that field is a fallback before the first
  read, nothing more.
* Cumulative: sum weekly payouts by winner across graded weeks; **split evenly on a tie** — and
  flag it, because the pool's tie rule is still not on record (`grade_week.py` already prints a
  warning and credits nobody). Ask Mike the first time it happens and write the answer into
  CLAUDE.md.
* Infinity: $20 × weeks won, accumulating, plus the season prizes of **$380 to 1st and $160 to
  2nd**. Show those as "at stake" next to the current top two until the season is complete;
  never add them to anyone's total early.
* A payout is shown only for a **complete** week (`"complete": true` in the results file). A
  provisional winner who changes on Monday night is worse than no figure.

---

## 10. Phase 8 — Lock / Unlock

Applies to **Pick Sheet** (`js/picksheet.js`) and **Picks** (`js/weekCard.js`).

* Storage: `picks:lock:<year>:w<N>` (season-long) and `survivor:lock:<year>:w<N>` (Picks tab).
  Per week, so locking Week 1 does not lock Week 2.
* Locked state: every input/button that changes a pick gets `disabled`, the card gets a
  `.is-locked` class (a quiet tinted edge, not a colour that reads as an error — nothing is
  wrong), and the button reads **Unlock**. Unlocked reads **Lock**.
* **Default:** locked when `js/myPicks.js` reports this week's card came from
  `data/picks-sent-<year>.json` — i.e. it has actually been emailed. Otherwise unlocked. That
  makes the default correct without the owner having to remember to press anything.
* The lock guards *editing only*. It must not stop the sheet re-rendering, polling live results,
  or the Picks tab recomputing its recommendation — a locked card still needs to show what
  happened to it.
* Unlocking is one tap with no confirm dialog. The failure being prevented is a stray tap on a
  phone, not a determined edit.

---

## 11. Phase 9 — Documentation

`CLAUDE.md` edits, all of them corrections rather than additions:

* Nav table: Season Long and Survivor each list their own Standings; the shared-panel note for
  Standings goes away (Odds remains the one shared panel).
* Grid Tab: the pick board section moves to a Standings section; leave a one-line pointer where
  it was, since the file explicitly predicted this move.
* Sleeper section: what changed on 2026-09-13, that the bookmarklet is the primary path, the
  ~1-year token life, and that CI still never gets a token.
* New sections: Standings (multi-league), `js/poolWeek.js` and why it is not `currentWeek()`,
  payouts file, Lock/Unlock.
* Corrections: payout figures, suicide entrant count, East Orange dissolved.
* Module table at the top: add `poolWeek.js`, `standingsCards.js`, `sleeperBookmarklet.js`,
  each marked NEVER versioned.

`SURVIVOR-STRATEGY.md`: mark East Orange dissolved, keep the half-pot analysis.

---

## 12. Acceptance checks before pushing

1. `#season/standings` shows **only** Mike's pick'em and Infinity War. `#survivor/standings`
   shows **only** the three survivor pools. Neither shows the other's half.
2. The Grid no longer carries the pick board; the survivor standings do, in the same format.
3. Only the visible standings panel polls — one timer, confirmed in dev.
4. With `sleeper:token` cleared, Poop / Deadpool / Infinity cards render a Connect box and no
   numbers. With a token, they render the pool. Neither state throws.
5. The week dropdown defaults to Week 1 until Wednesday 6pm local, Week 2 after. Test by
   stubbing `now` into `poolWeek()` rather than by changing the system clock.
6. All Weeks renders correctly with `data/results/` **absent** (says "waiting on grading", not
   an error) and present.
7. At 375px: no table text touches or crosses a card edge, on any week, on either panel.
8. `test/weekcard.test.html` passes with the East Orange assertions replaced, and the golden
   case recomputed for three pools.
9. `python scripts/grade_week.py 2026` and `node scripts/log_week_card.mjs` still run clean.
10. Hard-reload check: a new export added to a shared module is deployed **before** or with its
    caller, and locally use `fetch(path,{cache:'reload'})` then reload — a plain reload keeps the
    cached module.

---

## 13. Owner decisions (answered 9/14/2026 in the local session)

These override anything earlier in this file that disagrees.

1. **Cutover is Wednesday 6:00 PM local for both Standings and Squares.** One clock, not two.
   So §8's "Squares keeps its own 2pm rule" is void: `cutoverFor()` moves from
   `js/squaresModel.js` into `js/poolWeek.js` at 18:00 (the 36-hour tail stays), and
   `squaresModel.js` imports it instead of keeping a copy. Update the Squares comments and the
   CLAUDE.md "week changeover — 2pm Wednesday" section to match.
2. **Survivor All Weeks: the owner left it to us, so it's the burn matrix** (§8), with one
   phone-driven change: rows only for teams the pool has actually picked, the same filter the
   pick board uses, plus an entries-alive row on top. A full 32-row matrix is the Grid's 375px
   problem all over again.
3. **Mike's weekly pool tie rule:** most correct picks wins; a tie on correct picks goes to the
   Monday night total, closest by absolute value; **only if that is also tied is the payout
   split evenly.** `grade_week.py` must apply the tiebreaker before declaring a tie, and the
   cumulative payout splits only a true double tie. (Its current `ties` list is about a *game*
   ending tied, which is a separate, still-unrecorded rule; leave that warning alone.)
4. **Infinity War season prizes: $380 to 1st, $160 to 2nd**, plus $20 each week. Infinity War is
   **not** Mike's league; nothing about it comes from Mike's email. **Mike's weekly pool season
   winner gets $2,540.**
5. **Poop / Deadpool pots grow with buy-backs** ($15 each, hand-counted, since buy-backs cannot
   be read from any feed):
   * Deadpool: $600 base (20 × $30), $630 after 2 buy-backs as of Week 1.
   * Poop 2026: **$870 base** (29 × $30, matching `LEAGUES`; the owner's earlier $900 was a
     miscount), Week 1 buy-backs unknown.
   * Goes in `data/payouts-2026.json` as `base` plus a hand-entered buy-back count per week, and
     the card shows the current pot. **Both pots are winner-take-all** (owner, 9/14/2026). Buy-back
     counts come from the owner each week and are entered by hand; nothing derives them.
