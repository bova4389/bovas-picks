# CLAUDE.md — Bova's Picks

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Site name**: Bova's Picks (renamed from "NFL Pickem Analyzer" 2026-08-11; the local folder is
  still `NFL Pickems/` — see the note at the end of this section for why).
- **GitHub repo**: [`bova4389/bovas-picks`](https://github.com/bova4389/bovas-picks) — own nested
  repo per the workspace convention (see workspace `CLAUDE.md` Git Setup). Pushed since 2026-08-11.
- **Hosting**: **GitHub Pages, live** at `https://bova4389.github.io/bovas-picks/` (enabled
  2026-08-11), deploying from `main`. See GitHub Setup below.
- **Status**: Schedule, Grid, Pick Sheet, Odds, Recommend, Planning, Picks, Infinity War and
  Squares tabs are functional.
  **Lookback is the only "Soon" panel left**, and it is genuinely blocked rather than unstarted:
  it needs per-entrant weekly cards and the only ones parsed are 2025 Week 1. It un-stubs when the
  commissioner's workbooks start arriving, not before.

**Folder left as `NFL Pickems/`, not renamed to match.** The rename request was for *displayed*
branding — title, header, docs — not the repo's on-disk path. Renaming the folder now would touch
every relative import (`js/*.js`, `data/*.json`), the `.claude/launch.json` dev-server entry, and
every cross-reference from the workspace-root `CLAUDE.md`, for a directory nobody but Claude Code
ever sees — the live site and the future `bovas-picks` GitHub repo don't care what the local folder
is called. If the folder ever does get renamed (e.g. to keep the local path consistent with the
repo slug), update `.claude/launch.json`'s `pickem` entry and the workspace `CLAUDE.md`'s Git Setup
table in the same pass — see [`Git Setup` in the workspace CLAUDE.md](../CLAUDE.md).

## Concept

A personal analysis tool to help pick winners each week across two NFL pick'em pools:

1. **Season-long straight-up pool** — pick the outright winner of every game each week (no point
   spread). ~200–300 entrants. Picks due end of day **Saturday**, so Thursday night games are
   excluded except the Thanksgiving and Christmas holiday slates, where picks are due before
   Thursday kickoff. **$1,000 paid out each week** to the most correct picks, with the Monday night
   game's total points as the tiebreaker; roughly **$5–6k** to the season-long winners.
   **The tiebreaker is closest by ABSOLUTE value** — confirmed 2026-09-09 — not closest without
   going over. That distinction decides which direction to miss in, so do not re-derive it from
   the fact that most pools do it one way; see "The tiebreaker guess" below.
2. **Survivor pool** (most popular) — pick one team to win each week. Can't reuse a team once picked. A loss eliminates you, but buy-back re-entry is allowed.

The goal is a single dashboard that helps decide picks for both pools each week, plus tracks results/standings over the season.

## Picking Philosophy — Read First

[`STRATEGY.md`](STRATEGY.md) is the single source of truth for **how picks get made**: the source
guardrails (which sources are allowed and which are banned by rule), the pool game theory, the
weekly process, and the accountability metrics. Any analysis feature built into this tool must
implement that document, not improvise around it.

The headline finding, because it inverts what the tool would otherwise be built to do: in a
250-entry straight-up pool, **picking favorites has a mathematically zero chance of winning a
week**, and finishes ~15th–20th over the season. The tool's job is *not* to maximize correct
picks. It is to find cheap underdogs — high win probability, low pick popularity — and maximize
the chance of finishing first in a given week.

Four rules from it that constrain the build:

- **The core calculation is `leverage = win_probability / estimated_pick_share`**, computed for
  every underdog on the slate. Win probability comes from the de-vigged moneyline. That ranking is
  the product; everything else is supporting detail.
- **Pick popularity is a first-class data requirement, not a nice-to-have.** Without it the
  leverage calculation is impossible and the tool is just another scoreboard. If our pool exposes
  the field's picks, capturing that is feature #1.
- **Banned sources are banned in code too.** No scraping touts, social consensus, or situational
  "trend" stats (`Team X is 7-2 SU after a home loss`). If a data source isn't in STRATEGY.md §3
  Tier 1–3, it doesn't get an integration.
- **Every pick must log its inputs** — no-vig win probability, estimated pick share, whether it was
  a deliberate dog, and the reason. Also log **weekly finish position** and **record vs. pure
  chalk**, since those are the metrics that tell us the strategy is working. Capture from Week 1 or
  we can never evaluate the process.

The Saturday deadline is a hard constraint on the tool: it must produce a recommendation from
Saturday-morning information, never assume Sunday inactives are available, and handle
questionable-status players probabilistically. Thanksgiving and Christmas weeks need a separate
Thursday-kickoff deadline.

## Real-Money Betting — Settled, Do Not Re-Litigate

[`DFS-BETTING-ROI.md`](DFS-BETTING-ROI.md) researched expanding into DraftKings/FanDuel. **The
answer was no**, and the reason is structural rather than a matter of model quality: Indiana allows
**no** deduction for wagering losses and taxes **gross** winnings, while OBBBA capped the federal
loss deduction at **90%** of losses for tax years beginning after 2025. Together those put the
break-even edge on sportsbook handle at **~4.5%–6.0% ROI**, against a documented professional
benchmark of 3%–7%.

Consequences for anything built here:

- **"Sportsbook" means the fixed-odds product, not the company.** DraftKings and FanDuel each run
  several separately-licensed products under one login that file different tax forms: their
  **Sportsbook** tabs report GROSS on W-2G, their **DFS** tabs report NET on 1099-MISC. Playing
  DK/FD is fine; the fixed-odds tab is what the research rules out.
- **Do not build fixed-odds integrations or bet-placement features.** That vehicle is unprofitable
  after tax before a single pick is made. DFS-side tooling is not ruled out.
- **The private pools are the best-returning vehicle in the research** — no rake, ~268 recreational
  entrants, net tax treatment, no account-limiting risk. Extending this tool to more pools beats
  every DK/FD strategy evaluated.
- **Closing line value, not win rate, is the edge metric** if any wagering analysis is ever added.
- Figures are reproducible: `python scripts/betting_roi_model.py --help` takes county rate,
  marginal bracket, and handle as parameters.

## Site Architecture

Tabbed single page. Each tab's logic is its own ES module under `js/` — deliberately **not** one
large `index.html`, which is the pain point Sleeper FF has grown into.

```
index.html          shell + panels (the two nav rows are written by app.js)
css/styles.css      design system (see below)
js/app.js           two-level nav, deep links (#season/odds), boots every tab  [versioned]
js/data.js          SHARED data layer — fetch + cache + localStorage           [NEVER versioned]
js/teams.js         team-name crosswalk (mascot ↔ full name ↔ abbreviation)    [NEVER versioned]
js/oddsMatch.js      SHARED — odds join + the schedule kickoff bridge          [NEVER versioned]
js/oddsBadge.js      SHARED — inline "who's favored" text fragment            [NEVER versioned]
js/season.js        SHARED — season identity + the cross-feed audit          [NEVER versioned]
js/seasonBanner.js  SHARED — the audit's rendering half                      [NEVER versioned]
js/espn.js          SHARED — live scoreboard fetch, cached                   [NEVER versioned]
js/gameState.js     SHARED — canonical "what happened in this game"          [NEVER versioned]
js/gridModel.js     SHARED — the 32 x 18 team-week matrix, pure data         [NEVER versioned]
js/survivorLeagues.js SHARED — per-pool used teams + field scarcity          [NEVER versioned]
js/sleeperApi.js    SHARED — Sleeper transport + THE KICKOFF GATE           [NEVER versioned]
js/sleeperSurvivor.js SHARED — survivor-shaped Sleeper read, normalized     [NEVER versioned]
js/pickShare.js     SHARED — modeled pick share + k calibration            [NEVER versioned]
js/injuries.js      SHARED — ESPN injury report, live from the browser      [NEVER versioned]
js/teamIdentity.js  SHARED — team colors, uniforms, logo/wordmark paths     [NEVER versioned]
js/schedule.js      Schedule tab — one week, live scores
js/survivorPicks.js SHARED — the weekly pick board, pure render            [NEVER versioned]
js/grid.js          Grid tab — the whole season as one table
js/picksheet.js     Pick Sheet tab
js/odds.js          Odds tab — one week of prices + totals, reads data/odds/
js/recommend.js     Recommend tab — leverage = win prob ÷ pick share, per STRATEGY.md §4
js/planModel.js     SHARED — survivor planning math, pure data              [NEVER versioned]
js/planning.js      Planning tab — spend now or hold, per SURVIVOR-STRATEGY.md §1
js/weekCardModel.js SHARED — the cross-pool week card, pure data          [NEVER versioned]
js/weekCard.js      Picks tab — one pick per pool, all four at once
js/package.json     TYPE-ONLY, for Node in CI. Not a build step — see Picks Tab.
js/infinityModel.js SHARED — the pick-eight math, pure data                 [NEVER versioned]
js/infinityFeed.js  SHARED — pick'em-shaped Sleeper read                    [NEVER versioned]
js/infinityWar.js   Infinity War tab — pick 8 of the slate, small field
js/squaresModel.js  SHARED — squares math, pure data                       [NEVER versioned]
js/squaresChrome.js SHARED — St. Jude banner, theme hook, footer nav       [NEVER versioned]
js/siteGate.js      SHARED — password gate: Squares public, rest hidden    [NEVER versioned]
js/squares.js       Squares Board tab — one week: matchup, board, payouts
js/squaresLedger.js Squares Season tab — 18 weeks of payouts and P&L
```

## Navigation — Two Levels, One Model

The site covers **two different games**, so the nav says so. `js/app.js` holds a `GROUPS` /
`PANELS` model and writes **both** rows from it; `index.html` holds only the panels.

| Row 1 (the pool) | Row 2 (views inside it) |
|---|---|
| **Schedule** | *(none — it belongs to neither pool and is read from both)* |
| **Season Long** | Pick Sheet · Odds · Recommend · Infinity War · Lookback |
| **Survivor** | Grid · Odds · Planning · Picks |
| **Squares** | Board · Season |

Rules that keep this from rotting:

- **Squares hides both rows** — the only group that does. Its `chromeOff: true` flag makes
  `show()` put `chrome-off` on `<body>`, and the stylesheet hides the masthead, the subnav bar and
  the site footer. Those panels carry St. Jude's own banner and a club-styled footer nav instead.
  See the Squares section for why. A panel with no nav row on screen needs a way back, which is
  the `navigate` **event** `js/squaresChrome.js` dispatches and `app.js` listens for — an event
  rather than an exported `show()`, because app.js imports every tab and a tab importing it back
  would be a cycle. It is the mirror of the `panelchange` event app.js already dispatches
  downward: one direction each way.
- **Squares carries no Odds tab, and that is not a violation of "odds are not siloed."** That rule
  is about never rebuilding the join. Here there is nothing to join: a moneyline prices who wins,
  and a squares payout turns on the last digit of a score, which no market on this site quotes.
  Showing a favorite beside a board would imply a connection that does not exist.

- **Odds is one panel reached from two rows — not two copies.** Every panel is booted once at load
  and shown or hidden after that, so crossing rows never re-renders and never drops a half-filled
  pick sheet. Adding a third route to a panel is one line in `GROUPS`.
- **The Grid is Survivor-only** (changed 2026-08-14). It sat under both rows until then. Everything
  it actually answers — which weeks a team can still be spent in, what is left after the teams
  already used, how far ahead a run of good spots runs — is a survivor question; the straight-up
  pool is played one week at a time and is served by Pick Sheet, Odds and Recommend. Listing it
  twice implied two tools. Don't add it back to `season` without a reason that isn't "it's useful
  there too".
- **A two-level hash whose panel has since moved is re-homed, not discarded.** `fromHash()` keeps
  the panel half and finds a group that still carries it, so a bookmarked `#season/grid` lands on
  `#survivor/grid` rather than dumping the user on Schedule. That is what makes moving a panel
  between rows a safe edit.
- **The rows must not look alike.** Row 1 is pills on the purple field, row 2 is underline tabs on
  the paper below it. The old single row of seven peers gave no clue which game any tab belonged
  to, which is the whole reason this exists.
- **Neither row uses the old "active tab merges into the page" seam.** That only works when every
  group has a second row to hang the seam on, and Schedule has none.
- **A new season-long league (e.g. the confidence pool) is a control inside its views, not a new
  top-level tab** — the same way the three survivor pools are a switcher inside the Grid, per
  `js/survivorLeagues.js`. Row 1 stays the size of the *kinds* of game, not the count of leagues.
- **Hashes carry both levels** (`#survivor/grid`), so a reload returns to the row you were using.
  The bare legacy form (`#recommend`) still resolves, to the first group that carries that panel.

**Odds are not siloed in the Odds tab.** Any tab that lists matchups shows the favorite inline —
Pick Sheet does this now, and it's a requirement (not a nice-to-have) for the Survivor grid and
Lookback when they're built. The reusable half of this is `js/oddsMatch.js` (pure data: join a
`{away, home}` game to an odds event, oriented probabilities) and `js/oddsBadge.js`
(`favoriteLine(game, ev)` → a text fragment like `` Jaguars <strong>85%</strong> ``, or `''`
if there's no market line — callers treat `''` as "render nothing").

**Use `buildSeasonOddsIndex` / `matchSeasonOdds`, never `buildOddsIndex`.** `getOddsSnapshot()`
returns **all 272 games at once**, and the pair-only index collapses both meetings of every
division rivalry into whichever was written last — 96 games affected. Every tab now uses the
season join:

```js
import { getOddsSnapshot } from './data.js';
import { buildSeasonOddsIndex, matchSeasonOdds } from './oddsMatch.js';
import { favoriteLine } from './oddsBadge.js';

const snapshot = await getOddsSnapshot();               // null-safe, never throws
const seasonIndex = snapshot ? buildSeasonOddsIndex(snapshot.events) : null;
// per matchup, and the game needs a `date`:
const ev = matchSeasonOdds({ away, home, date }, seasonIndex);
favoriteLine(game, ev);   // '' means don't render anything
```

**This section used to print the `buildOddsIndex` version, and the Pick Sheet was built from it.**
The result was live for the whole 2026 preseason: the sheet named **Denver** the favorite in the
Week 1 Broncos-at-Chiefs tiebreaker game, reading the **November 1** line where Denver is at home.
Fixed 2026-09-09. `buildOddsIndex` now has **no callers** and is kept only because a genuinely
one-week set of events is still a valid thing to index; reach for it only when you can prove your
event list is one week.

**`favoriteLine()` takes the matched event, not an index** — for exactly this reason. Deciding the
join belongs to the caller, which is the only party that knows what its event list spans.

**A number-map game has no kickoff on it** (the workbook prints only a day name), so a tab
rendering the number map has to bridge through the schedule to get a date the join can use.
`kickoffIndex(schedule)` in `js/oddsMatch.js` builds that bridge once — a
`"week|Away|Home"` (mascots) → ISO kickoff Map — and `kickoffFor(kickoffs, week, away, home)`
reads it. Both the Pick Sheet (`oddsFor()`) and Recommend (`slateFor()`, `dateForPopGame()`)
call it; **do not write a third copy.** The popularity files are dateless for the same reason
and go through the same index.

**A missing date costs every game, not just the rivalries.** `matchSeasonOdds` returns null the
moment `game.date` is falsy — it never falls back to "the only event for this pair" — so a
dateless slate resolves *no* market line anywhere. `recommend.js` read `g.date || null` straight
off number-map games, which is always null, and its whole slate came back unpriced: **0 of 209
scored games for the 2026 season.** It read as "the market has no lines yet" rather than as a
bug, which is why it outlived the Pick Sheet's louder version of the same dateless join. Fixed
2026-09-10; Week 1 now prices 14 of 14, and the season 186 of 209 (the 23 are pairs genuinely
absent from the snapshot).

**What's deliberately NOT shared: the wrapper markup.** `favoriteLine()` returns a bare text
fragment, not a component with its own container — Pick Sheet wraps it in `.game-odds` (a
grid-spanning line above its pick buttons; see `css/styles.css`), because that's what fits its
grid layout. The Survivor grid will have a different row shape and needs its own wrapper class to
match — reuse the *function*, not `.game-odds` itself. Do not build a new odds-matching join for
Survivor/Lookback; do not duplicate `js/oddsMatch.js`'s logic inline in those tabs either.

**Cache busting:** `index.html` versions `css/styles.css` and `js/app.js` with `?v=YYYYMMDD`.
`js/data.js` and `js/picksheet.js` are imported *by JS*, never referenced from HTML, and
`data.js` holds module state — **never put a query string on it.** A versioned and an unversioned
import are two separate module instances with separate state; that exact mistake took the Majors
site down on U.S. Open launch day. Bump the CSS/app version with a letter suffix on same-day edits
(`20260810` → `20260810b`).

Hosted on **GitHub Pages** (no domain), so `.htaccess` cache headers do not apply here — the query
strings are the only layer. If this later moves to DreamHost, add the `.htaccess` per the workspace
CLAUDE.md.

**The gap that leaves, and it is real:** an unversioned shared module can be served stale while the
versioned entry point next to it is fresh. Bumping `app.js?v=` gives the browser a new URL, so the
new code loads immediately — but `js/teamIdentity.js` and friends have no query string, and GitHub
Pages serves them with its own `max-age`. **Add an export to a shared module and deploy it in the
same push as a caller that imports it, and some visitors get the new caller against the cached
module: `does not provide an export named 'x'`, and a blank page until the cache expires.** Hit
during the Squares build on 2026-09-08 when `contrastRatio` was added to `teamIdentity.js`.

Do **not** "fix" this by versioning the shared module — that is the module-identity outage the note
above describes, and these files hold state. The window is bounded (Pages' max-age, ~10 minutes)
and it self-heals. What helps:

- **A new export is a two-deploy change when it matters.** Push the shared module first, let it
  propagate, then push the caller. Only worth the ceremony for something on a live game day.
- **Locally, a reload is not enough** — Chrome holds the module. `fetch(path, {cache:'reload'})`
  from the console, then reload, or hard-reload with Ctrl+Shift+R.

**Design language** models Grant Thornton's site: `#4F2D7F` purple as the brand field, **light
display weights** (their h1 is weight 200 — ours matches), warm neutrals rather than cold greys
(`#44423F` ink on `#F2F0EE` paper), 20px card radii, `#A06DFF` violet and `#00838F` teal as
accents. Type is **Outfit** from Google Fonts — the closest free geometric match to their
proprietary GT Walsheim, and it has the light weights the look depends on.

Design constraints that are load-bearing, not preference:
- **Mobile is the primary surface.** Picks get made on a phone on Saturday. Every tap target is
  ≥46px; team names are tuned so none wrap at 375px across all 15 weeks.
- **Contrast is verified, not eyeballed.** All text ≥4.5:1. The AWAY/HOME label needed a bespoke
  `#5F5C58` because `--ink-faint` measured 2.65:1 there.
- Game rows use `minmax(0,1fr)` not `1fr`, or the two team buttons render unequal widths.
- **Page padding is written as `main.wrap`, never bare `main`.** `<main>` carries the `.wrap`
  class, and `.wrap { padding: 0 20px }` outranks an element selector on specificity no matter
  where it sits in the file — so a bare `main { padding: 28px 0 96px }` was silently overridden
  and every tab's heading sat flush against the nav for months. Same trap applies to `footer.wrap`.
- **`.section-head` aligns `flex-start`, not `baseline`.** With `baseline`, a `.pill` in the
  right-hand slot aligns its own baseline to the eyebrow's and pushes the whole left block down
  ~7px, so the tabs that carry a pill (Grid, Odds) sat lower than the ones that don't.

**Local dev** (fetch is blocked on `file://`, so it must be served):

```bash
python -m http.server 8765 -d "NFL Pickems"
```

`.claude/launch.json` at the workspace root defines this as the `pickem` preview server.

## Season Handling — Read Before Touching Any Tab

**The season is derived from the calendar, never hardcoded.** `js/data.js` sets
`SEASON = activeSeason()`, and `js/season.js` owns the rule: a season is named for the year it
kicks off in, so January and February belong to the *previous* season (2027-01-10 is a 2026 game).
March is the cut point.

This exists because of a real, silent failure. `SEASON` was pinned to `2025` and stayed correct
right up until the odds feed rolled over to 2026 on its own. Nothing threw. The Pick Sheet
rendered last season's games with next season's odds badges attached, and Recommend joined
**2025 Week 1 field popularity to 2026 preseason moneylines** and printed a confident, fully
plausible, completely meaningless leverage ranking. A tool that fails loudly costs nothing; one
that fails quietly costs the week.

The guard has three parts:

- **`js/season.js`** — pure, imports nothing (data.js imports *it*, so any import back would be a
  cycle). `auditSeason({season, schedule, numberMap, odds, popularity})` takes already-loaded
  feeds and returns `{problems, ok, blocking}`.
- **`data.getSeasonAudit(week)`** — loads the feeds and runs the audit. Cheap to call from
  anywhere; every feed is memoized by `loadJSON`.
- **`js/seasonBanner.js`** — renders the verdict. Returns `''` when everything agrees, so callers
  treat it exactly like `oddsBadge`'s `favoriteLine()`.

**The schedule feed is the authority.** It comes from ESPN, covers all 18 weeks, and refreshes
weekly, so it is the one source that always knows what season it actually is. Everything else is
checked against it.

Rules for new code:

- A tab that combines two feeds **must** call `getSeasonAudit(week)` and refuse to render numbers
  when `isBlocked(audit)`. Single-feed tabs (Schedule, Odds) are unaffected and stay accurate.
- Recommend re-audits **per week**, not just at boot — popularity files are per-week, so week 3
  can be clean while week 1 still holds last season's parse.
- Missing ≠ mismatched. A file that doesn't exist yet is a `warn` ("waiting on 2026 data", amber);
  a file from the wrong season is an `error` ("not showing this", red). Never render them the same
  way, or the one that matters gets skimmed past.
- **Never fall back to last season's file.** That fallback is the original bug.

**Seasonal rollover checklist** (the thing whose absence caused all of the above):

1. `python scripts/fetch_schedule.py <year>` — the backbone the Schedule tab and the audit need.
2. `python scripts/build_projections.py <year>` — needs the prior season's completed schedule.
3. When the commissioner's workbook arrives:
   `python scripts/parse_weekly_sheets.py "Weekly Sheets.xlsx" <year>`
4. `python scripts/build_team_identity.py && python scripts/check_team_assets.py` — picks up any
   offseason rebrand, relocation, or uniform change. Cheap, and skipping it is how a renamed team
   renders in last year's colors.
5. Confirm the site: the masthead year (written by `app.js` from `SEASON`, not hardcoded) should
   already read the new season, and Pick Sheet / Recommend should un-gate on their own.
6. `SEASON` needs no edit. If you find yourself editing a year literal anywhere, that is the bug.

## Grid Tab — Read Before Adding Any Highlight

The whole season as one table: 32 teams down, 18 weeks across, built from
`data/schedule-<year>.json` and painted from the odds snapshot. It replaces a hand-maintained
Excel sheet, and it is the tab that gets the most use, so the rules below exist to stop it
degrading into a swatch book.

**One paint, many marks.** A cell has one background, so exactly one *paint* is ever active —
win probability, survivor usability, or matchup type — and every background rule in `styles.css`
is scoped under a `.paint-<mode>` container class to enforce that. Everything else is a *mark*: a
border, a corner triangle, a glyph, a text line. **Any new highlight must be a mark, not a fourth
background**, unless it replaces one of the three paints outright.

**Toggles are container classes, never re-renders.** Paint, marks, zoom and the selection
crosshair are all switched by editing the class list on `.gridwrap`. Re-rendering 576 cells is
fast enough, but it drops the scroll position and the focused cell, and this grid is navigated
with the arrow keys. `renderTable()` is only for changes that alter *which* rows or columns exist.

**The table fits the page; it does not get a scrollbar of its own.** `applyFit()` measures
`.gridwrap`, divides by the number of weeks on screen, and writes `--cw` / `--ch` / `--fs` / `--tw`
as inline custom properties — which outrank the `.z0`–`.z3` classes, so *zooming is simply fit
switched off*. Rules that follow from that, all of them corrections rather than taste:

- **Two classes, not one.** `.is-fit` is what the user asked for; `.fit-ok` is whether the measured
  cells came out at least `FIT.minCell` wide. Only both together drop the scroller. 18 weeks on a
  375px phone wants 17px a cell, so there the grid keeps its scrollbar and honestly does not claim
  to fit — narrowing the week window is the fix, which is what the Weeks control is for.
- **Vertical overflow belongs to the page.** 32 rows never fit a viewport, and the old nested
  scroller meant two scrollbars fighting plus a sticky header pinned to the top of a box that was
  itself scrolled off. With `overflow: visible` the sticky header's scroll container becomes the
  window, so the week numbers pin to the top of the *screen*. Verified pinned at `top: 0`.
- **What a cell shows is keyed on measured height, not on the zoom step.** `.d-prob` / `.d-slot` /
  `.d-rest` (and `.tw-wide` for the team column's meta) are set from the geometry actually in
  force. The old `.z1 .gc-prob` selectors stopped meaning anything the moment heights were computed
  rather than picked from four. Thresholds live in `ROOM` in `js/grid.js`.
- **`ZOOM_CH` / `ZOOM_TW` in `js/grid.js` duplicate the `.gridwrap.zN` blocks in `styles.css`.**
  Deliberate — the density rules need a *number*, and a class name isn't one. Keep them in step.
- **Re-measure on a `ResizeObserver`, plus a `resize` listener, plus `panelchange`.** All three
  earn their place: the container's width changes without the window's (a page scrollbar appearing
  costs ~15px), observer callbacks are delivered at a rendering step so a non-compositing tab banks
  them, and a hidden panel measures zero — the grid boots hidden unless the hash points at it.
- **Cell widths are fractional, not floored.** Flooring 18 columns throws away up to 18px, which
  reads as the table failing to reach the edge of its own card.

**Weeks and rows are filtered by two different mechanisms, on purpose.** The Weeks select carries
both named ranges (`all`, `rest`, `ahead3`, `ahead6`) and a `from:<week>` group — one control, so a
range and a floor can never contradict each other. On the rows side, the hand-picked `hidden` list
and the standing **"Exclude my picks"** (`hideUsed`) are kept separate: the checkbox reads the pool
live, so a team spent *after* it was ticked disappears on its own. The old "Only unused" button
wrote the used set into `hidden` once and went stale on the next pick; it is gone, and reinstating
anything that copies pool state into `hidden` reinstates the bug.

**The team column carries the team's mark on an 8% wash of its own color**, the same `tintOn()`
treatment and badge size as the Schedule card, so a team looks like itself on both tabs. The wash
arrives as `--team-tint` rather than an inline `background`, because an inline background cannot be
beaten by a stylesheet and both the selection crosshair and the used-team state need to paint over
it. The flexbox lives on an inner `.gteam-in` span — `display: flex` on the `<th>` itself would
take it out of the table's internal layout and take the sticky column with it.

**The controls are three flat rows** (pickers · marks · team filter), inline labels, capped at one
line each — not the site's standard `.controls`, whose stacked label-over-input `.field`s came out
four rows tall and pushed the table below the fold on the one tab whose value is seeing everything
at once. Height came from flattening, never from shrinking tap targets: everything in there is
still ≥46px, and it is 202px on a 1280px desktop against ~300px before.

**No source pill in the header** (removed 2026-08-14). It read `271 priced · 1 modeled` — true,
unreadable without the vocabulary, and a season-wide tally nobody could act on. The market/model
distinction still matters and is still made in the only place it can be acted on: the cell, where a
modeled number wears a dotted underline, with the legend explaining it.

**The odds join is the season-wide one.** `js/oddsMatch.js`'s `buildOddsIndex` keys purely on the
team pair, which silently collapses both meetings of a division rivalry — harmless for one week's
slate, fatal here, where all 272 games are on screen and 96 of them share a pair with another
game. The grid uses `buildSeasonOddsIndex` / `matchSeasonOdds` from the same module, which key on
pair **and** kickoff. Do not add a third join.

`js/oddsBadge.js`'s `favoriteLine()` is deliberately **not** used here, and that is not a
violation of the "odds are not siloed" rule. That rule is about never rebuilding the join, and the
join is reused. `favoriteLine()` renders *the favorite*; every grid cell needs the probability
oriented to **that row's team**, including when it is the dog, which a favorite-only fragment
cannot express.

**Midnight Eastern is not a kickoff.** ESPN carries not-yet-scheduled flex games at 00:00 with no
time assigned — 24 of them in the 2026 file, all in Weeks 16-18. Read literally, every one looks
like a Sunday afternoon game and the rest-day figures either side of it are fiction.
`gridModel.js`'s `slotOf()` reports them as `TBD`, and those cells render no slot mark and no rest
figure rather than a confident wrong one.

**Rest days are a fact, not an edge.** STRATEGY.md §3 bans situational angles — revenge games,
letdown and lookahead spots — as post-hoc filtered noise. "Off a bye" painted green is the same
move wearing a lab coat. Rest is displayed as a plain number of days and left for the market
figure in the same cell to price. Do not add a lookahead/letdown/revenge mark.

**Text inside a painted cell uses the grid's own tones.** `--ink-soft` measures 5.30:1 on white
but 3.55:1 on the strongest warm paint step, and `--ink-faint` fails everywhere — the same trap
the AWAY/HOME label hit, one layer deeper. `--ink-quiet`, `--teal-ink` and `--amber-ink` were each
measured against the *worst* background they can land on and clear 4.5:1 on all seven paint steps.
Any new text in a `.gc` uses one of those.

**Where state lives** (all localStorage, all per season where it matters):

| Key | Holds |
|---|---|
| `grid:prefs` | paint, marks, fit, zoom, sort, week window, active pool, hidden teams, `hideUsed` |
| `grid:tags:<year>` | per-cell target / avoid / watch flags, keyed `TEAM\|WEEK` |
| `survivor:<year>:<pool>` | my used teams for one pool, as `week -> team` |
| `survivor:feed:<pool>:<year>` | the last fetched copy of ONE Sleeper pool (everyone's picks) |
| `infinity:<year>:<week>` | my eight picks for one Infinity War week |
| `infinity:prefs` | Infinity War's field size and spread |
| `infinity:feed:<pool>:<year>` | the last fetched copy of the Infinity War pool |
| `survivor:pool` | which pool is in play, shared with the Planning tab (see its section) |

Used teams are stored **per pool and never merged** — each pool is a different game, and a pick
that is right in a three-life pool can be wrong in a one-life pool the same Sunday. The two keys
above are separate for the same reason in miniature: one is mine and must survive a failed fetch,
the other is a copy of someone else's data that a refresh may replace whole.

**`LEAGUES` in `js/survivorLeagues.js` lists the pools that actually exist, in dropdown order** —
`Poop 2026`, `Deadpool`, `Mike's Suicide League`, `East Orange Squeeze`, then `Off`. The order is
the two played hardest, then the big one-life pool, then the charity pool. Pools are added as they are created;
SURVIVOR-STRATEGY.md may analyze one before it exists, which is not a reason to list it. The
Yahoo pool was listed for months without existing and was removed 2026-08-14. When a pool is
added or removed, note that `grid:prefs` outlives it: `knownLeague()` in `grid.js` resolves a
stored pool that is no longer in `LEAGUES` back to the default, because otherwise the pref
survives while the `<select>` — having no matching `<option>` — silently displays its first one,
and the grid strikes through one pool's used teams under another pool's name.

**Field scarcity now has two sources, in one shape.** Mike's pool comes from the mailed workbook
via `parse_survivor.py` into `data/survivor-<year>.json`; the Sleeper pool is fetched live by
`js/sleeperSurvivor.js`, which normalises Sleeper's answer into *that same shape* so
`fieldAvailability()` / `scarcityFor()` / `weekPickShare()` work on either without branching.
`S.feeds` in `grid.js` holds one per pool and `applyField()` points `S.field` at the active one.
A pool with no feed simply shows no share. See the Sleeper section below.

### The pick board — under the grid

`js/survivorPicks.js`, mounted at the bottom of the Grid by `paintPickBoard()`. The grid above it
answers "what can I spend, and when"; the board answers "what did everyone else just spend",
which is the other half of a survivor decision and the half the tool could not show at all.

- **Only teams somebody picked are listed.** Filtered in `weekDistribution()`. In a 12-entry pool
  20+ of the 32 teams have no takers, and listing them buries the eight that carry the week.
- **The bar is scaled to the week's biggest pick, not to 100%.** A 12-entry pool spread over eight
  teams tops out near 25%, so share-scaled bars would all be stubs carrying no information the
  percentage text does not already. Longest bar = most-picked team, every week. The percent is
  printed beside it so the absolute figure is never inferred from bar length.
- **The count column is a fixed 82px, not `auto`.** Sized to content it is narrower on a row
  reading `1 entry` than on `12 entries`, which shifts that row's bar origin and widens its track
   — so two teams on the same count could draw visibly different bars. Bars that do not share an
  origin and a scale are not a chart.
- **It renders the kickoff gate rather than working around it.** Percentages are of the picks
  *visible*, which mid-week is not the pool, so the count line carries all three of `revealed` /
  `expected` / `locked` and a caveat line appears while the week is partial — and disappears once
  it is complete, because a disclaimer that never goes away is one nobody reads on the week it
  matters.
- **The week selector offers only weeks with at least one visible pick** (`weeksWithPicks()`), and
  defaults to the latest of them. `S.pickWeek` is deliberately **not** in `grid:prefs`: it is a
  glance at the week in play, not a view you set up and live in, and a remembered Week 3 would
  still be on screen in December.
- **Bar color comes from `js/teamIdentity.js`**, never a hardcoded hex, per the Team Identity
  rule. `--pb-bar` is set inline per row with a `--purple-mid` fallback for an identity that did
  not load.
- Pure render, no state and no fetching — the Grid owns the feed, pool and week. That is what
  makes moving it to the Survivor **Planning** panel later a change of mount point and nothing
  else.

`weekDistribution()` / `weeksWithPicks()` **replaced `weekPickShare()`**, which returned
`team -> pct` and nothing else. It was exported, never called anywhere, and could not answer the
question the board is asked first — *how many people* — so it was widened rather than duplicated.

**Not built yet, in rough priority order:** free-text notes per cell (the tags are the flag half
of that feature); ESPN team news and injury links in the detail strip; venue/neutral-site data,
which would need `scripts/fetch_schedule.py` to capture `competitions[0].venue` and `neutralSite`
— today the international slate is inferred from the 9:30am Eastern Sunday window, which catches
all six of 2026's but would miss a Friday or Saturday game abroad.

## Recommend Tab — Read Before Changing Any Threshold

`leverage = win_probability ÷ pick_share`, per STRATEGY.md §4. **Every threshold in
`js/recommend.js` is quoted from that document, not tuned here** — 38% floor, 40–47% sweet spot,
15% longshot cutoff, 40% thin-share cutoff, the 4–5 dog count. If one needs to change, change
STRATEGY.md first; the doc is the authority and the tab is its implementation.

**The tab used to be gated on the number map, and that was wrong.** It refused to render without
`data/number-map-<year>.json` — the commissioner's workbook, which arrives days before the season
— so for the entire offseason it showed one line of "waiting on 2026 data" while sitting on a
complete 272-game schedule and a 271-event odds snapshot. Everything needed to rank underdogs was
already present. The guard that matters is `getSeasonAudit()`'s **blocking** verdict, which stops
a genuine cross-season join; a missing workbook costs only the pool's pick numbers, which are a
submission detail, not a calculation input. **Do not reinstate a hard gate on the number map.**

**Three inputs, three provenances, always labeled:**

| Input | Source | Fallback |
|---|---|---|
| Slate | number map when present (pool-specific) | schedule feed, all games |
| Win probability | odds snapshot, de-vigged, `matchSeasonOdds` | nothing — the game renders "no market line" |
| Pick share | `data/popularity/` when measured | `js/pickShare.js` model, labeled **modeled** |

**Use `matchSeasonOdds`, never `buildOddsIndex`.** The snapshot holds all 272 games at once, so
the pair-only join collapses both meetings of a division rivalry — measured: it returned **21
matches for a 16-game week**. Pair *and* kickoff is the only correct join here, same as the Grid.

**The kickoff comes from the schedule, never from the slate.** Neither the number map nor a
popularity file carries one, and `matchSeasonOdds` answers null without it — so `slateFor()` and
`dateForPopGame()` both stamp a date from `state.kickoffs` (`kickoffIndex()` in `js/oddsMatch.js`,
built once at boot). Reading `g.date` off a number-map game instead silently unpriced the entire
tab; see "Odds are not siloed" under Site Architecture.

### The row — two channels, and neither may carry the other

A row answers two different questions and they are **not** the same question, which is the
mistake the old row made by having only one channel to answer with.

**Channel 1, color: which side of the price.** `--fav` / `--fav-ink` (purple) is always the
higher percentage, `--dog` / `--dog-ink` (rust) always the lower — on every card, every week.
This replaced an `away = purple` / `home = teal` pairing that was wrong twice over. It keyed on
which side of the *row* a team sat rather than which side of the *price*, so the same 58% was
purple on one card and teal on the next and nothing could be read down a column; and the two hues
were only ~80° apart and equally dark, so they were hard to tell apart even once you knew the
convention. Purple to rust is ~110°, warm against cool. **A new color on this tab must not be
teal, green or violet** — those are the three the purple was already being confused with.

The `.prob-bar` segments keep away on the left to match the chips above them, so *which segment
gets which class flips with the dog*. The wide segment is `prob-fav` on all sixteen cards.

**The fav/dog axis is now the site's only price coloring, and the Odds tab reads on it too**
(changed 2026-08-15). This paragraph previously ruled the opposite way — it kept `.prob-away`
(purple) / `.prob-home` (teal) alive for the Odds tab on the grounds that a price list is not a
recommendation, so side was the right key there. That reasoning did not survive contact with the
two tabs side by side: they show the same sixteen games from the same snapshot, so a 64% that is
purple-because-favorite on Recommend and teal-because-home on Odds is one number wearing two
unrelated color systems a tab-switch apart. **`.prob-away` / `.prob-home` are deleted, not
merely unused** — nothing renders them, and re-adding a side-keyed color anywhere would
reintroduce exactly the ambiguity `--fav` / `--dog` exists to remove.

**Channel 2, the pick tag: which team to actually email in.** Exactly one of the two chips on
every row carries a tag, set by `markPicks()`:

| Tag | Side | Meaning |
|---|---|---|
| `Take` | the dog | Clears every §4 rule *and* is inside this week's quota |
| `Next up` | the dog | Clears every rule but sits below the quota cut |
| `Chalk` | the favorite | No dog worth taking here — §4 Step 6's real answer |

**`take` and `next` must stay separate states.** §4 Step 5's whole point is that composition
beats volume, so marking all eight qualifying dogs "take" on a loaded slate would recommend eight
picks in a week that calls for five. `markPicks()` runs **in `render()`, before any markup is
built** — not inside `plan()`. The plan card and the rows below it are the same verdict rendered
twice, and resting that on a template literal's left-to-right evaluation meant reordering two
lines of markup would silently unmark the slate.

The pick cannot be carried by color, because it *crosses* the color axis — it is the dog on
five games a week and the favorite on the other eleven. A ring plus a word is a second channel
that survives that; a "recommended" tint would be the same as the "favorite" tint most of the
time and different exactly when it mattered.

**Chalk rows are marked too, and that is the point.** Eleven of sixteen games are chalk, and the
old row named the dog in prose and never named the favorite at all — so on most of the slate
"which of these two am I picking" had no answer anywhere on the card.

**Logos come from `js/teamIdentity.js`, fetched once at boot**, not per row: `recRow()` is
synchronous and must stay that way. `getIdentity()` resolves `null` on failure rather than
throwing, and `.oddsteam-badge:empty` collapses, so a missing mark costs its own 22px and nothing
else. The name sizing is measured, not chosen — a phone gives each chip 147px, the badge and
furniture spend 48 of it, and "Commanders" needs 99px at 1rem. That is why the price sits *under*
the name rather than beside it and why the name steps up to 1rem only at 560px. All 18 weeks are
verified clip-free at 375px; re-check that sweep before changing any width in `.oddsteam`.

### The pick-share model

`share(p) = p^k / (p^k + (1-p)^k)`. One parameter. `k = 1` would mean the field picks exactly in
proportion to win probability; `k > 1` means it piles onto favorites harder than probability
warrants, which is why cheap dogs exist. Symmetric, so one call answers both sides.

**`k` defaults to 2.0 and that is a documented default, not a fit.** Fitting needs (win
probability, observed share) *pairs*, and we have one prior popularity file (2025 Week 1) with no
odds snapshot from that week to pair with it. Distribution-matching against the prior year was
tried and **rejected**: 2026 Week 1 is a genuinely flatter slate than 2025 Week 1 (best favorite
82% vs 93%), so forcing the share distributions to match pushes k to 2.41 and blames a more
decisive field for what is actually an easier schedule. The residual was visibly poor at both
tails. At k=2.0 a 55/70/85% favorite draws 60/84/97%, which brackets the real 2025 spread of
58–93%.

**It self-corrects.** `calibrate()` fits k from real pairs across every week of the *current*
season that has both a popularity file and a priced slate, and runs **once at boot** — doing it
per render meant ~18 popularity lookups on every week switch, and the answer cannot change between
renders anyway. Measured share always beats modeled for any week that has a file.

**Prior-season data is shown but never joined.** `priorProfile()` reports last season's real
entrant count and concentration spread as context for a first-week entrant ("how many people am I
beating, and how hard does this pool lean"). It is not an input to any number on the page — that
join is precisely the failure `js/season.js` exists to prevent.

### Injuries and line movement

STRATEGY.md §4 Step 3 is blunt: injuries are "the one piece of news that reliably moves a game and
the one place a Saturday deadline can still be exploited," and a starting QB is worth 3–7 points
of spread. `js/injuries.js` reads ESPN's public injury endpoint **from the browser**, for the same
reason `js/espn.js` reads scores that way — and here it is the entire point. What makes injuries
worth tracking is *timeliness*; a snapshot committed by a cron job is only as fresh as the last
run, and a Wednesday practice report reprices Sunday. Keyless, public, permissive CORS, verified
2026-08-14.

Three rules that keep it honest:

- **Injury status is displayed, never folded into the win probability.** By the time a status is
  official the line has usually already moved, so adding STRATEGY.md's point values on top would
  double-count. §4 Step 1 says trust the market. That is also why injuries render *next to* line
  movement — the market says how much, the report says why.
- **QBs sort above everyone regardless of severity.** §4 Step 3 rates non-QB stars as "fractional,
  and almost always already priced", so a questionable QB outranks a receiver who is out.
- **The ranking never waits on it.** `loadInjuries()` runs after first paint and a failure costs
  the injury notes, not the tab.

Line movement is fetched per visible week from `data/odds/history/` and shown only past **2
percentage points** — below that it is preseason drift. As of 2026-08-14 no game qualifies (the
largest move all season is 1.3 points), so the slot renders empty, which is correct rather than
broken. `.rec-move:empty` **must** stay `display: none`: the slot is always in the markup because
it fills in asynchronously, and a bare `<p>` keeps the UA's 16px margin even at zero height.

**Not built:** the season-standings rows of §4 Step 5's dog-count table ("behind after Week 14",
"contending late") need a standings feed that does not exist yet. Guessing at whether we are
contending would be worse than saying nothing, so `dogCount()` implements only the slate-shape
rows.

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

## Picks Tab — The Cross-Pool Week Card

Built 2026-09-09. `js/weekCard.js` (render) over `js/weekCardModel.js` (pure math), the same
split as `grid.js` / `gridModel.js`. It reads the **same** matrix from `buildGrid()` the Grid
paints and leans on `js/planModel.js` rather than re-deriving future value, so no survivor tab
can disagree with another about a game.

It answers the one question the site could not ask:

> "Given four pools with four different formats and four different used-team boards, what do I
> submit in each one this week, and am I over-exposed to a single game?"

### It ignores the pool switcher, deliberately — do not add one

Every other survivor view is scoped to `activePool()`. This one reads all four boards in a single
pass, and a switcher here would collapse it back into Planning with extra steps while leaving the
cross-pool exposure line — the only thing on this site that answers "am I about to lose
everything on one game" — with nothing to measure. **Changing the pool on the Grid or Planning
does not change this tab.** That is the design, not an oversight.

`boards()` builds one used-set per league from that league's own `loadLeagueState()`. **Never
union them.** A union silently removes teams that are still perfectly spendable in three of the
four pools, and it looks right.

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
| Three lives, few entries (Poop, Deadpool, East Orange) | win probability, future value as the tie-break | §2: too few rivals for a fade to buy anything |

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
everywhere else, **but only for a pool that has a feed to be asked** — Mike's 235 is hand-recorded
because there is nothing to ask, and flagging it would point the reader at a Refresh button that
cannot help them.

**Bands come off `economics.potShare`, never a league id.** Five points in a full-pot pool, two in
East Orange, because a buy-back there is ~8% of the *playable* pot against ~1% in Poop and
Deadpool. If East Orange grows, or another half-pot pool is added, the rule follows the economics.

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
| Poop, Deadpool, East Orange | Sleeper, live — my own picks come back with the field | No |
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
`data/odds/history/`, so the golden case cannot drift as the live feed moves. 67 assertions
covering the model, the log's freeze and carry-forward rules, and the shape of a logged card; open
it on the dev server. There is no node in this environment and no build step, so the test is a
page rather than a runner — same reasoning as `assets-review.html`.

**The golden case is Week 1 2026**: LAC 80.7 / JAC 77.5 / DET 73.1 are the only three clearing the
floor at 4+ books, and the expected card is **JAC / LAC / JAC / LAC** with 2/2 exposure and DET
*held*. If a change makes DET spendable, or collapses the exposure to 1/1, the change is wrong.

## Sleeper Pools — Live Feed

**Three survivor pools** (`Poop 2026` 29 entries, `Deadpool` 20, `East Orange Squeeze` 8 —
roster counts re-read 2026-09-09) plus the
**Infinity War** pick'em are fetched straight from Sleeper by a **Refresh from Sleeper** button —
on the Grid tab for the survivor pools, in the tab itself for Infinity War. No script, no
workflow, no committed file: the browser calls Sleeper and caches the answer in localStorage.

**The transport lives in `js/sleeperApi.js`.** Endpoints, the leg-id format, the JAX/JAC fix and
**the kickoff gate** are shared by every pool the site reads. `js/sleeperSurvivor.js` and
`js/infinityFeed.js` are the two shapes on top of it — see the Infinity War section for why they
are separate files rather than one with a flag.

**Pick'em pools are not fantasy leagues in Sleeper's data model.** Their `sport` is `pickem:nfl`
and [docs.sleeper.com](https://docs.sleeper.com/) has no pick'em section at all.

**This file used to say they "never appear" on the documented user-leagues endpoint. That was
wrong, and it cost a session.** The route works — it just needs the right sport:

```
GET /v1/user/<user_id>/leagues/pickem:nfl/<year>     ← every pool, with settings
GET /v1/user/<user_id>/leagues/nfl/<year>            ← fantasy only, which is what misled us
```

That is how all four 2026 league ids were found on 2026-09-01, rather than copied out of a
browser URL bar, and it is how the next one should be. `listPickemLeagues()` in `sleeperApi.js`
wraps it. The settings it returns are also worth reading — `weekly_pick_limit`, `use_confidence`,
`use_spread` and `pickem_type` independently confirmed Infinity War's rules.

The other surfaces, all unauthenticated, all sending `access-control-allow-origin: *` (verified
2026-09-01 — the CORS header is the only reason this can be a browser button rather than a server
job):

| Surface | Gives |
|---|---|
| `GET /v1/league/<id>` | name, settings, `metadata.current_pickem_leg_id` |
| `GET /v1/league/<id>/users` | `user_id` → display name |
| `GET /v1/league/<id>/rosters` | `roster_id` → owner, `metadata.is_eliminated` |
| `GET api.sleeper.app/schedule/nfl/regular/<yr>` | `game_id` → week + matchup |
| `POST api.sleeper.app/graphql` | `get_pickem_picks_for_league(league_id, leg_id, include_tiebreaker)` |

**The GraphQL endpoint is undocumented and may change without notice.** Every failure path leaves
the last good cached feed in place and says why, rather than writing a partial pool over a
complete one — a stale field number is recoverable, a half-parsed one silently understates
scarcity and looks fine. Introspection is currently open (`query { __schema { query_type { fields
{ name } } } }`), which is how these queries were found; that is the tool to reach for if the
shape changes.

Four details that each cost time to work out:

- **`include_tiebreaker` changes the response *shape*, not just its contents.** `true` gives
  `{"<roster_id>": {picks: {...}, tiebreaker: {}}}`; `false` hoists the picks to the top of the
  roster object and there is no `picks` key at all. Reading `.picks` after passing `false` returns
  undefined — **HTTP 200, no error, and a pool that looks empty.** We ask for `true`; `picksOf()`
  reads either.
- **`leg_id` is `"v1:regular:<week>"`, not the bare week number.** Passing `"1"` also returns
  `{}` with a 200.
- **`metadata.is_eliminated` is the string `'true'`/`'false'`.** Compared as a boolean, the whole
  pool reads alive and scarcity is measured against the wrong denominator.
- **Sleeper spells Jacksonville `JAX`; this project and `js/teams.js` use `JAC`.** One team, one
  direction, handled by `TEAM_FIX` — don't build a second crosswalk.

### The kickoff gate — do not remove

**Sleeper's app hides a pick until its game kicks off. Sleeper's API does not.** It handed over a
Week 1 pick on 2026-08-14, four weeks before the September 13 kickoff. This is a real money pool,
so **this project enforces the lock that the API doesn't**: `hasKickedOff()` in
`js/sleeperSurvivor.js` withholds any pick whose game has not started.

Four decisions in it, each of which would be easy to undo by accident:

- **Withheld picks are dropped during the fetch, never stored and hidden at render time.** A pick
  that never enters the cache cannot leak out of it later — not through localStorage, not through
  a future feature that reads the feed for something else. Verified: the cached blob does not
  contain the withheld team's abbreviation anywhere.
- **My own pick is exempt.** I already know it, and withholding it would leave the used-teams
  ledger this feed exists to maintain permanently a week behind.
- **The gate keys on the schedule feed's `status`, not on a clock.** That feed carries a *date
  only* (`"2026-09-13"`) with no kickoff time, so a date comparison would reveal the 8:20pm game
  at midnight.
- **It is a hide-list (`pre_game`, `canceled`, `postponed`), not a reveal-list.** The only
  statuses ever observed are `pre_game`, `complete` and `canceled`, so the string for a game in
  progress is unknown; a reveal-list would keep picks hidden right through the game they were
  meant to be revealed for — a failure that looks exactly like the gate working. An unknown or
  missing game is still hidden: missing data must never open the gate.

Each week therefore carries three counts, and collapsing them would hide the gate: `submitted`
(how many have picked at all), `revealed` (how many of those are ours to see yet), `expected`
(the pool). The status line reads `Week 1 — 0 of 12 shown, 1 locked until kickoff` — a bare
"0 of 12" would imply nobody has picked. Percentages are over `revealed`, not the pool, or a week
with two games kicked off reports every share at a sixth of its real value.

**The feed cache is keyed per pool, and that is load-bearing.** `survivor:feed:<pool>:<year>` was
`survivor:feed:sleeper:<year>` while exactly one Sleeper pool existed, which was indistinguishable
from correct. Adding Deadpool and East Orange on 2026-09-01 made it a live bug: refreshing either
overwrote the other's cached field, and the next reload handed Poop whichever pool was fetched
last — one pool's scarcity painted onto another's grid, no error, no visible seam. `S.feeds` in
`grid.js` is likewise built by iterating `LEAGUES`, not from a hand-written list, so a fourth pool
cannot silently get no cache. **Do not collapse either back.** Poop's pool id is still `sleeper`,
so its existing key was unchanged and no migration was needed.

**My own picks come back with everyone else's**, so `survivor:<year>:sleeper` fills itself in on
refresh instead of being hand-typed. `mergeMyPicks()` merges rather than replaces — a week the
feed has not reached keeps whatever was entered by hand.

**Explained 2026-08-28, still do not "fix" it — and now contradicted in three directions at
once.** Poop reports `num_revives_allowed: 0`, Deadpool `2`, East Orange `10`; all three pools
run two buy-backs by their commissioners' accounts. Sleeper's settings report
`num_revives_allowed: 0` for Poop while the pool plainly runs buy-backs — because the commissioner
administers re-entry **outside the app**, by hand. So that field describes Sleeper's own
bookkeeping, not the pool's rules. Treat the API value as inert: never let it gate a buy-back
feature, and never edit SURVIVOR-STRATEGY.md to agree with it. Corollary — `metadata.is_eliminated`
is Sleeper's opinion too, so an entry it calls eliminated may have bought back and still be
playing.

## Infinity War — Read Before Changing Any Number

Built 2026-09-01. A Sleeper **classic pick'em** (`pickem_type: 0`, `weekly_pick_limit: 8`),
10–15 entrants, **$50 in**. **$20 a week to the most correct**; the remainder to the top one or
two at the end of the season. Sits on the Season Long row — row 1 is the size of the *kinds* of
game, not the count of leagues.

`js/infinityWar.js` (render) over `js/infinityModel.js` (pure math), the same split as
`grid.js` / `gridModel.js`. It reads the **same** matrix from `buildGrid()` that the Grid paints.

### The two prizes want opposite things — this is the whole tab

- **The season prize wants maximum expected correct.** That is the chalk eight — the eight most
  lopsided games — every week, with no cleverness at all. `chalkSet()` does it in one line.
- **The weekly $20 wants the highest chance of beating 10–15 people.** Different objective, and
  in a small pool it actively conflicts with the first.

**If everyone picks chalk, everyone picks the same eight and everyone scores identically.** The
week is an n-way tie and the $20 splits n ways. Verified in the model: at `spread = 0` the tab
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

## The Site Gate — Squares is public, the rest is not

Added 2026-09-08 so the Squares board could be shared with the St. Jude Men's Club without
handing a hundred people a tour of the survivor grid and the strategy docs. `js/siteGate.js`
holds a SHA-256 of the password; `js/app.js` enforces it.

**What it does, and it is more than hiding a tab:**

- **`show()` is the single choke point.** Every route into a panel — the nav rows, a deep link, a
  restored hash, the Squares footer's own buttons — goes through it, so the check lives there
  rather than in the nav. `#season/picksheet` typed by hand lands on the Squares board.
- **Row 1 is filtered**, so a locked visitor sees one pill, and on Squares even that is hidden by
  `chromeOff`.
- **The gated tabs are not booted at all.** This is the part that matters: every `init()` fetches
  as it starts, so booting them behind a hidden panel would put `data/survivor-*.json`,
  `data/popularity/*` and the odds snapshot in a club visitor's network tab, where "you cannot see
  this" would be plainly untrue. Verified: a locked load requests only `squares-2026.json`,
  `schedule-2026.json`, `team-identity.json` and `logo-trim.json`.
- **The Squares footer nav is the gate's front door.** It listed Schedule / Season Long / Survivor
  unconditionally, which on the one page built to be shared outside the pool was a guided tour.
  Locked it offers a quiet **Admin** button; unlocked, the way back plus **Lock**.

**What it does NOT do, and this is the part to keep saying out loud: it does not protect a file.**
This repo is public and Pages serves it from the repo root, so `/STRATEGY.md`, `/CLAUDE.md` and
`/data/raw/entries-2025-w01.json` stay directly fetchable by anyone who types the path. A UI gate
cannot change that. **The real fix is the separate repo** — `bova4389/stjude-squares` at its own
origin, which is what `.sq-theme` and `js/squaresChrome.js` were scoped for — plus excluding the
internal docs from what Pages serves. Both are agreed and deferred, not dismissed.

Two consequences of a public hash: the password is recoverable offline, and a short or purely
numeric one falls in seconds because the search space is tiny. **Never put anything behind this
gate that would matter if it leaked**, and never commit an API key on the strength of it.

`sessionStorage`, not `localStorage` — the unlock lasts for the tab and no longer. Storage blocked
in private browsing **fails closed**.

### Titles and link previews

`paintTitle()` names the document per view: Squares panels read *"Board · St. Jude Men's Club
Squares"*, everything else *"Pick Sheet · Bova's Picks"*. The Squares group carries its own
`title` in `GROUPS` — its link goes to people outside the pool, and this site's branding is the
wrong name in their tab bar and their bookmarks.

**Link-preview crawlers never see any of that.** iMessage, WhatsApp and Slack fetch the URL and
read the markup without running scripts, and a `#hash` never reaches the server at all. So the
Open Graph tags in `index.html` are named for the Squares board — correct, because a locked
visitor lands there whatever URL they open. The static `<title>` stays this site's.

## Squares — Read Before Changing Any Color

Built 2026-09-08 for the **St. Jude Men's Club** board: 100 squares at **$250**, **$275** to every
quarter of every Colts game, **18 weeks**. `js/squares.js` (Board) and `js/squaresLedger.js`
(Season) over `js/squaresModel.js` (pure math), the same split as `grid.js` / `gridModel.js`.

**All 18 weeks are already wired** in `data/squares-2026.json` from the committed schedule. Week 13
is the Colts' bye, and the pool grades that week on the Monday nighter — **DAL @ SEA, Mon Dec 7**,
carried as `substitute: true` with the real `gameId`. Nothing about the bye is inferred at render
time.

### The redraw is the whole game — do not build strategy on top of it

The names are fixed for the season; **the ten digits on each axis are redrawn before every game.**
So every square is dealt eighteen independent pairs and **all 100 are worth exactly the same over a
season.** There is no good square to chase and no bad one to regret. A single week is wildly
uneven — a 7 and a 0 is a great draw, a 2 and a 5 is a dead one — but nobody owns either.

Consequences that constrain the code:

- **Nothing scores, ranks or projects a square.** The only honest per-square number is "here is
  what you drew this week", and both tabs say exactly that. `ledger()` reports what *has* happened
  and what is still in the pool; it must never grow a per-square forecast.
- **`economics()` states the rake out loud.** $25,000 in, $19,800 out, **$5,200 (20.8%) to St.
  Jude**; a square is worth $198 of a $250 buy-in. This is a charity board and the shortfall *is*
  the donation — that belongs on the page, not buried.
- **`liveOutlook()` lists ONE score by ONE team**, never multi-score sequences. With ten digits an
  axis some combination reaches almost any square, so the full list says nothing; during a game the
  only useful question is what the *next* score does.

### Quarter scores: the one piece of new plumbing

`js/espn.js` now carries `awayLine` / `homeLine` — points scored **in** each period, which is how
ESPN sends it. The running end-of-period totals are derived in `squaresModel.js`, not baked in,
because Squares is the only consumer.

- **`periodClosed()` reads the status *text*, not just the period number.** ESPN leaves `period` at
  2 for the whole of halftime, so the clock alone calls the half unfinished right up until the
  second-half kickoff — which is exactly when a halftime payout is being looked up. ESPN writes
  "Halftime" and "End of 1st" itself; that is the tiebreaker.
- **Closed and reported are separate conditions.** The committed schedule carries final scores but
  no period breakdown, so a week ESPN cannot serve still grades its **Final** and simply has no
  quarters. Never collapse the two.
- **`overtime` is a config flag**, `'final'` or `'regulation'`, because pools split on whether the
  last payout lands on the score the game ended on or the score at the end of the fourth.
  **St. Jude uses `'final'` — confirmed by the user 2026-09-11.** The fourth payout is the score the
  game ends on. In an overtime game the end-of-fourth score is ignored entirely and pays nothing;
  only the final score after overtime pays. There are four payouts, never five.

**Finished weeks get frozen into `data/squares-<year>.json`** via `result`, and `frozenGame()`
rebuilds them. That is what makes the ledger permanent and offline-capable rather than dependent on
ESPN still serving a week from October — the same reason the Majors pool hardcodes a tournament
once it is over. The live path stays authoritative only for the week in progress.

### The board: two bands, three channels

**The team banners are part of the grid, not cards above it.** `.sq-board-frame` spans them — the
column team runs full width above the digits, the row team runs full height down the left, no gap
and no padding anywhere, so each band's edge is the edge of the grid it names. `.sq-board-card`
carries **no padding** for that reason; any would reopen the seam.

This replaced two side-by-side cards, which was wrong rather than merely plain: it put the team
labelled *down the side* along the top, next to the one labelled *across the top*. The board
contradicted its own legend.

**Both bands are the same thickness**, held by one `--band` custom property on the frame rather
than two numbers that must be kept equal by eye. That also squares the corner cell, which is what
lets the parish emblem sit in it undistorted.

**The corner belongs to neither team.** The top band used to run on over the side band's column,
which left the row team's mark jammed under the column team's slab — two teams overlapping in the
one square that belongs to neither. Now each band starts at the corner and stops, and the corner
goes to the house: `assets/stjude/saint-jude-emblem.png`, the cross-and-sunburst cropped out of the
full lockup because the wordmark is illegible at 56px.

Four details in the band that are not decoration:

- **A mark at each end, not one in the middle.** The board scrolls sideways on a phone, so a single
  centered logo is off screen from whichever end you did not start at — and saying whose axis this
  is, is the band's entire job.
- **No "across the top" / "down the side" label.** The band's position says it. The words were
  restating the layout in the one place the layout is unambiguous.
- **A wash, not a saturated field.** At full strength the two bands were two slabs of near-black —
  Colts navy against Ravens purple read as one dark frame rather than as two teams. On a 10% wash
  the logo is itself, the name is the team's color, and the saturated hex is spent on a 3px edge
  where it works hardest.
- **`readableTeamInk()`, not `readableInkOn()`.** Black or white is the right answer on a saturated
  team field and is still what the digit bands use. On a 10% wash black is *safe* and also throws
  the team away, so the primary is mixed toward black in 5% steps until it clears 4.5:1 and no
  further. Most teams need no step; the pale ones (Vikings gold, Chargers powder) take a few and
  still look like themselves. `contrastRatio()` was exported from `js/teamIdentity.js` for it —
  "verified, not eyeballed" needs the number available to callers, not just internally.
- **The team name is text, not the wordmark art.** It has to fill the band, and a fixed-aspect
  image cannot. It takes the leftover space with `flex: 1` and a `clamp()` size; the wide
  letter-spacing is what carries a short name like Colts across the full width. **Both bands use
  the same clamp** — the side band having its own smaller one made the row team read as a
  subheading of the column team rather than its equal.

The corner is styled as a **cell**, not a panel: the board's own 3px gutter, the same corner
radius, and a 2px border in **St. Jude gold** — the one color on the page belonging to neither
team, so it cannot be misread as either one's axis. `--band` is 50px specifically so that the
corner's inner box lands at 44px, which is exactly the width of the board's digit column. At 56px
it read as a slab parked beside the table instead of the table's own top-left cell.

**A cell has three independent states and each gets its own CSS property.** A square can be all
three at once — yours, one that took the half, and one the live score has just come back to:

| State | Channel | Color |
|---|---|---|
| Your square | **wash** + 1px border | crimson (the club's, because this cell is about you) |
| Won a quarter | **3px border** | gold — the only heavy border on the board |
| Score right now | **outline**, offset, pulsing | charcoal — the third club color, nothing else uses it |

Any two of them sharing a property would mean the rarer combination silently disappears, and the
rarest combination — your square, live, having already won a quarter — is the one anybody would
most want to see.

**The legend always renders all three keys.** It was conditional at first — the live key only
during a game, the "your square" key only once a square was recorded, on the reasoning that a key
for a state nothing is currently in is one more thing to read past. That was wrong in the way
legends usually are: a key you only ever see at the moment you needed to already know it is a key
nobody has learned. The legend describes the board's vocabulary, not its current state, and the
quiet Tuesday is when there is time to read it. Do not make it conditional again.

### Marks are sized per team — `markBox()`, not a CSS box

**Every team logo is a 500×500 canvas, and the artwork inside them is not the same shape.** The
Steelers mark fills 462×462 of its canvas; the Seahawks 462×206. Rendered at one fixed size the
visual mass spans **2.24×** across the 32 — which is what "the Ravens logo looks smaller than the
Colts" actually was.

**A CSS box cannot fix this, and trying is the trap.** Because the canvas is square,
`object-fit: contain` binds on the same dimension for all 32 no matter what box you give it — a
wider box changes nothing at all. Only sizing the *image* per team does.

`scripts/measure_logo_trim.py` measures each mark's visible bounding box into
`data/teams/logo-trim.json`; `markBox(team, area)` in `js/teamIdentity.js` turns that into the
square pixel size at which a mark's artwork covers `area` square pixels. **Area, not height or
width** — "looks the same size" tracks how much ink is covered, not edge length. Squares asks for
600, clamped to 20–40px, which brings the spread to **1.07×**.

It is a *hint*, never a crop: nothing modifies the images, so every tab that does not read it is
unaffected.

**`readableTeamInk()` lives in `js/teamIdentity.js` alongside it**, and is the counterpart to
`readableInkOn()` rather than a replacement. On a *saturated* team field the only safe answers are
black and white, which is what `readableInkOn()` picks. On a pale *wash* of the team's color black
is safe too — and throws the team away, so `readableTeamInk()` mixes the primary toward black in 5%
steps until it clears the target and no further. Verified across all 32 at 4.5:1 on a 10% wash: 23
teams keep their exact brand hex, and nine pale or bright ones (Chargers powder, Saints old gold,
Dolphins teal, Browns orange, Lions, Panthers, Chiefs, Titans, Bengals) take a step or two and
still read as themselves. The Grid, Schedule, Odds and Recommend tabs all still size marks with a fixed box and
carry the same inconsistency; adopting `markBox()` there is a safe, self-contained improvement
whenever those are next touched.

**Re-run the script after any asset refresh** (`scripts/fetch_team_assets.py`,
`scripts/build_team_identity.py`) — a rebrand that changes a logo's proportions changes its
correct size, and the stale hint would size the new art wrongly.

### The matchup card — short on purpose, and it carries the clock

It sits between the banner and the board, so **every pixel of it is a pixel between the reader and
the 100 squares they came for**. It runs ~132px, down from ~220px: the marks shrank, the logo and
wordmark share one line, and the score lost a size step it did not need at that width.

The middle column has **one shape and a fixed width for all three states**, so the card does not
resize under your thumb when a live poll lands:

| | badge | line 2 | line 3 |
|---|---|---|---|
| Before kickoff | `AT` | kickoff, day over time | network |
| Live | `Q3` (pulsing, crimson) | **game clock**, the loud element | network |
| Final | `F` (charcoal) | ESPN's own final text | — |

**All three panels share one explicit row rhythm** (`.sq-matchup-grid > *` is a grid with fixed
`grid-template-rows`), rather than three flex columns each centring their own contents. Flex
centring is only equivalent while the contents are the same height, and they stopped being the same
height the moment marks began to be sized per team: a 38px Ravens shield beside a 27px Colts
horseshoe pushed one column's score and axis pill below the other's. The pills are what the eye
tracks across the card, so that drift is immediately visible. Explicit rows mean the three panels
cannot come apart again whatever goes in them.

`periodLabel()` reads **Half** off the status text rather than the period number, for the same
reason `periodClosed()` does in the model: ESPN leaves `period` at 2 for the whole break. `OT` is
period 5+.

**The network comes from the live ESPN payload only.** `scripts/fetch_schedule.py` does not capture
`broadcasts`, so the committed file has none and the chip is blank until the scoreboard has been
fetched at least once. Verified working 2026-09-08: Week 1 Ravens at Colts returns `CBS`.

**Late-season flex games genuinely have no network assigned**, and the chip says `Network TBD` in a
dashed outline rather than rendering nothing. That is deliberate — it is the cue to re-check, not a
rendering failure. **Weekly routine: glance at the network chip when the week's board is set.** If
it still reads TBD by game week, the game has not been picked up by a broadcaster yet, which is a
fact about the schedule and not a bug to chase.

**Team chips on the Season tab use the same wash**, added 2026-09-08. They were solid brand at full
saturation, which put eighteen rows of near-black slabs down the left of the table and buried the
abbreviations — worse the darker the team. Wash, team-colored type, team-colored 1px edge, and the
mark sized by `markBox()` at a smaller target area. The two tabs now agree about what a team looks
like, which they did not when one used washes and the other saturated fills.

**The row header is a flex line inside the cell, and both of its fixed sizes are load-bearing.**
Inline children align on their *baselines*, which is only the same thing as aligning them
centre-to-centre while they are all the same height — and they stopped being the same height the
moment chips began sizing their marks per team. A 22px Ravens shield and a 15px Colts horseshoe put
their two chips at different heights, and the shorter "No draw" pill sat lower than both. So:

- **The chip has a fixed height** (28px), so a per-team mark size cannot change its box, and the
  mark sits in a fixed 22px slot inside it.
- **The chip has a fixed min-width** (74px), so a two-letter abbreviation and a three-letter one
  occupy the same space. That is what puts the `@` and every flag after it at the same x on all
  eighteen rows — the column alignment you only notice by looking *down* the table rather than
  across one row of it.
- **The flex goes on an inner `<span>`, never on the `<th>`.** `display: flex` on a table cell takes
  it out of the table's internal layout — the same trap the Grid tab documents for `.gteam-in`.

Verified: every week number, chip, flag and score cell centres to within 0px of its row's centre
line, all 36 chips render at exactly 74px, and row heights are uniform.

*Known soft spot, not a defect:* the lightest artwork in the set (Steelers at 0.65 mean luminance,
Chiefs at 0.63) reads a little quietly on a pale wash. Nothing disappears — no logo in the set is
uniformly light, they all carry internal contrast — and it was no better on the saturated chips,
where Pittsburgh's gold sat on Pittsburgh's gold. If it ever needs solving, the fix is a white
plate behind the mark, not a return to saturated chips.

### The week changeover — 2pm Wednesday, not the NFL's rollover

`defaultWeek()` holds a week on screen **until 2pm the Wednesday after its game**, then flips to
the next. `currentWeek()` in `gameState.js` deliberately is **not** used here: it rolls over a few
hours after an NFL week's last game, which is right for a schedule and wrong for a pool — it would
replace Sunday's settled board with next week's empty one before anybody had looked at what they
won. The board turns over midweek and is ready before Thursday.

**The 36-hour tail in `cutoverFor()` is what makes one rule cover every kickoff slot.** Measured
from a Sunday afternoon game it lands early Monday, so the cutover is that same week's Wednesday;
measured from a Monday nighter — which is exactly what the Colts' bye week grades on — it lands
Wednesday morning, so the cutover is that afternoon rather than eight days later. Without it a
Monday game needs a special case, and the one week that needs it is the one nobody would remember
to test. Verified against the real 2026 file: Week 1 holds through Wed Sep 16 13:59 and flips to
Week 2 at 14:01; Week 13 (Mon Dec 7) flips to Week 14 on Wed Dec 9.

Local time throughout, deliberately: this is a pool played in one room in Indianapolis, and
"Wednesday at 2" means the clock on the wall there — which for anyone using this is the clock on
their own phone.

### Polling — already the conservative version, do not replace it with load-once

The board polls ESPN **every 30s, and only while all of these hold**: the panel is the visible one,
the browser tab is not backgrounded, and the game is either live or within ten minutes of kickoff.
Outside that window it makes **no requests at all** — a Tuesday visit costs one fetch. There is
also a manual **Refresh score** button, and a freshness line beside it reading `Scores as of 3:47
PM`, or `Committed schedule` when there is no live layer at all so an ESPN outage reads as an
outage rather than as a stale time.

Replacing this with load-once-plus-a-button was considered and **rejected**: the live square
highlight is the feature, and a highlight that only moves when someone remembers to press a button
is a highlight that is usually wrong. Wrong is worse than absent here, because you would act on it.
The endpoint is keyless, public and free (see `js/espn.js`), so the cost of the poll is a few
requests an hour on three afternoons of the week.

### The theme is St. Jude's, not this site's — and the scoping is the point

**Everything visual is scoped under `.sq-theme`** in `css/styles.css`, and the club's banner,
theme hook and footer nav all live in `js/squaresChrome.js`. Nothing else in `js/` knows the parish
exists. That is not tidiness: **these tabs are built to lift out whole and go back to the club as
their own product**, so they must leave as St. Jude's thing rather than as a purple page with a
logo dropped on it. Two rules enforce it — no rule in the block may match outside `.sq-theme`, and
nothing in it may reference a token from the site's `:root`.

Palette sampled from [stjudeindy.org](https://www.stjudeindy.org/), **contrast measured, not
eyeballed**, same bar the rest of the site holds:

| | |
|---|---|
| white on crimson `#BE1F24` | **6.16:1** — the banner bar, buttons |
| crimson on white | **6.16:1** — headings, emphasis |
| charcoal `#404041` on white | **10.36:1** — body copy |
| ink `#333` on gold `#D8A941` | **5.82:1** — gold chips carry DARK text |
| **gold on white** | **2.17:1 — FAILS** |

That last row is load-bearing: **gold is never type on white.** It is a rule, a fill or a border,
and where it must carry words the words are `--sq-ink` (or `#7A5B12`, measured at 5.68:1 on the
gold wash). Their own site uses it exactly this way. Type is **Lato**, loaded alongside Outfit in
`index.html` for this tab alone.

Three specific decisions that look wrong until you try the alternative:

- **The banner is a white logo plate over a crimson bar, not a logo on crimson.** The parish logo
  art is crimson-and-gold on a transparent ground, so reversing it onto the bar erases the
  wordmark. The obvious-looking layout is the wrong one.
- **`.sq-theme .sq-banner-title`, not `.sq-banner-title`.** The theme's own `.sq-theme h2` rule
  sets every heading charcoal and outranks a bare class, which rendered the title at 1.68:1 on the
  crimson bar — legible enough in a thumbnail to pass a glance, and a failure everywhere else.
- **Team color is NOT part of the theme.** The matchup card, axis bands and digit headers still
  read from `js/teamIdentity.js`, because eighteen different opponents are the *content* while
  crimson and gold are the *chrome*. Repainting the Colts in crimson is the one change that would
  make every week look the same.

**The board scrolls sideways rather than shrinking to fit, and its names wrap.** Shrinking a 10 × 10
board onto a 375px phone would give each cell ~28px, where no name is readable at any size — and a
board you cannot find your own name on has failed at the only thing it does. The digit column is
pinned with `position: sticky`, and the "your square" card above carries the answer for anyone who
would rather not scroll at all.

**Names wrap and are never cut off** (changed 2026-09-11). They used to be one line with an
ellipsis, which on a phone cut all 100 to "John …" — scrollable and still unreadable. `.sq-name` now
wraps at spaces and sizes itself off the board's visible width (`100cqi` of `.sq-board-scroll`, a
size container), clamped 10px–13px. The formula and the column minimums (68px, and 66px on a phone)
are **measured** so the longest word on the 2026 board, "Steinbrenner", fits one line at the 10px
floor; `overflow-wrap: break-word` is only a last resort. **If a longer surname joins the board,
re-measure** — the arithmetic is in the comment above `.sq-name`. A won cell carries top padding so
its Q1/Q2/Q3/F chips never sit on a wrapped name.

**There is no sample mode.** A "Preview with sample data" toggle filled the board with fake names and
a seeded draw while the club's board was outstanding. It was removed 2026-09-11, at the user's
request, once the real board was in: the checkbox, the overlay code, the banner and their styles.
Do not reinstate it — an empty board (next season, before the club sends it) already renders as a
deliberate hatched blank with a note in the legend.

### The board and all 18 draws — entered 2026-09-11

The club posted every week's board at once on stjudemensclub.com, and the 100 names, all 18 draws
and `mine` went into `data/squares-2026.json` from screenshots of it. `mine` is **Matt Bova**,
`{row: 9, col: 1}` (zero-indexed). `axisConfirmed` is now `true`: the Colts are across the top on
all 17 Colts weeks, and Seattle is across the top for the Week 13 substitute.

- **Names are verbatim from the club's board, typos included** — `Joe Huber#2`, `Stephen Reitz Jr2`,
  `Ryan Deiterding #2` beside `Ryan Deitering #1`. Do not tidy them: members find themselves on the
  board by the name the club printed.
- **`Mikey Cahill #2` appears twice on the club's own board** (row 1 col 1 and row 8 col 2), and is
  left that way by the user's call. `leaderboard()` tallies by name, so those two squares share one
  line on the Season tab. That is expected, not a bug to fix.
- **Checked against the images, not just re-read.** Each image's digit bands were cropped out of the
  original screenshot and laid over the digits the site rendered, for all 360 positions.
- **The screenshots live in `St Jude Squares Images/`, which is gitignored** because they show
  members' names. They are the record to go back to if a week's draw is ever disputed.

### What is still owed

- **The digit-probability layer** — an offline script pulling quarter-by-quarter scores from past
  ESPN seasons to answer "is this week's pair live or dead", including a Colts-specific table since
  they hold an axis 17 weeks of 18. Designed, not built.
- **Pools the user runs**, imported from a filled Google Sheet. `data/squares-<year>.json` is a
  `pools` array from day one for exactly this, and both tabs render any pool generically, so this
  is an import step rather than a new tab.

### Marks

`saint-jude-emblem.png` was cropped out of the lockup **in pure stdlib Python** — there is no
Pillow here and no build step, so the PNG was decoded, unfiltered, sliced and re-encoded by hand.
The cut is measured, not guessed: the emblem and the wordmark are joined by the gold rule, so the
boundary comes from the first transparent column run in the **top third**, above that rule. If the
parish ever reissues the logo, re-crop rather than eyeballing a new one.

The parish logo is served from `assets/stjude/`, **never hotlinked** from their CDN — a hotlink
breaks when they redeploy and reports every view of a private pool tool to their host. Parish and
NFL marks are nominative use, identifying the pool and its games, and the banner says so in a
permanent line. Same footing as [`assets/teams/NOTICE.md`](assets/teams/NOTICE.md): fine in a
personal tool, not on anything sold, sponsored or advertised. **If this is ever actually handed to
the club, get their sign-off on the logo use in writing first.**

## Odds Tab

One week of market prices at a time, chosen with the same week selector Schedule and Recommend
use. Three things about it are corrections rather than preferences, so don't undo them:

- **It is scoped to a week, and the week comes from the schedule feed.** See the `bucket` note
  under Data Pipeline for what it did before. `matchSeasonOdds` (pair **and** kickoff) does the
  join, not `buildOddsIndex` — all 272 games are in the snapshot at once here, so the pair-only
  index would collapse both meetings of every division rivalry.
- **The meta line carries the over/under** (`9 books · 4.3% hold · O/U 43`) when the snapshot has
  one, via `totalNote()`, and renders nothing when it does not — which is the state of every
  history entry predating 2026-09-09. Same `''` means "render nothing" contract as
  `favoriteLine()` and `budgetNote()`.
- **It fetches ~16 history files, not 272.** The old version pulled every game's full snapshot
  trail at boot to compute line movement for rows nobody had scrolled to. Histories are fetched
  per selected week, and `loadJSON` memoises them across week switches.
- **The tab leads with what it is telling you.** A summary strip (biggest mismatch, toss-up count,
  which lines have moved most) sits above the rows, because "I have no idea what this tab is for"
  was the actual complaint and a wall of percentages did not answer it. Movement is expressed as
  `Bears 57% → 58%` from the current favorite's side; an unmoved game says "Unchanged since open"
  and deliberately does **not** repeat its own percentage, or all 16 rows shout equally and the two
  that moved disappear.

- **The row is colored by price, not by side, and carries both teams' marks** (added
  2026-08-15). `.ol-pct.is-fav` is `--fav-ink` and `.ol-pct.is-dog` is `--dog-ink`, the same axis
  and the same two tokens the Recommend chip uses, so a percentage means the same thing on both
  tabs. See the reversal note under Recommend's "Channel 1" for what this replaced. Three details
  carried over deliberately: the **team name** stays `--ink` and signals the favorite by *weight*
  rather than taking the price color (the color belongs on the number, which is what reads down
  a column); the `.prob-bar` keeps away on the left, so which segment gets `prob-fav` flips with
  the favorite; and `.odds-move.up` / `.down` now use the same two inks, which also corrected a
  stale comment — `movementFor()` measures from the *current favorite's* side and never was
  home-oriented.
- **Marks come from `js/teamIdentity.js`, fetched once at boot** alongside the snapshot and the
  schedule, never per row. It is the only one of the three feeds allowed to fail: `getIdentity()`
  resolves `null`, and `.ol-badge:empty` collapses, so a failed fetch costs the marks and nothing
  else. `.ol-badge` is its own class rather than a reuse of `.oddsteam-badge` — the flat
  `.oddsline` grid needs the badge as a *named grid area* on both layouts (stacked on a phone,
  mirrored to the card's outer edges past 560px), which is the "reuse the function, not the
  wrapper markup" rule from Site Architecture applied one layer down.

Line movement, not win rate, is the metric STRATEGY.md §3 cares about — that is why movement gets
its own summary cell rather than being one more number in the meta line.

**The API budget pill only appears below 100 credits** (`BUDGET_WARN_AT` in `js/odds.js`, changed
2026-08-14). The free tier is 500 a month and the workflow spends ~200, so for three weeks in four
it read `486 API credits left` — a number nobody can act on, sitting in the same eyeline as the
numbers the tab exists for. A permanently-green status light trains you to stop reading the spot it
occupies, which is the spot the warning needs. `budgetNote()` returns `''` above the floor, same
"`''` means render nothing" contract as `favoriteLine()`.

**Not built:** closing line vs. actual result for completed weeks. The data is there (the schedule
carries final scores) and it is the natural next addition.

## Data Pipeline

The commissioner mails two Excel workbooks. Both are parsed into `data/`; neither is committed.

**1. "Weekly Sheets" — once at the start of the season.** One sheet per week, defining which games
are in the pool and what number each team carries. Picks are submitted by emailing those numbers,
so this is both the source of the pick form and the validator for outgoing picks.

```bash
python scripts/parse_weekly_sheets.py "path/to/Weekly Sheets 26.xlsx" 2026
```

→ `data/number-map-<year>.json` (teams, numbers, byes, tiebreaker — **tracked**)

Layout notes that cost time to work out: away = odd number, home = even, sequential down the page.
Unnumbered games are excluded from scoring — normally the Thursday game, but **the Thanksgiving
sheet numbers everything**, including the Wednesday and Friday games (2025 Week 13, 2026 Week 12).
Some weeks open on a Wednesday, so `DAYS` carries all six day names, not just Thursday–Monday.
Each sheet ends with a "Bye Week" block listing bye teams in the same columns games use; only real
games have `at` in column D, which is the only reliable discriminator. The parser validates that
every week's numbers form a clean `1..2N` run with home = away + 1, and exits non-zero if not.

**The Monday-night tiebreaker is derived here, not guessed at render time.** The sheet prints a
"Monday Night Points" box but never says which game it refers to, because in a week with one
Monday game there is nothing to say. `mark_tiebreaker()` sets `tiebreaker: true` on that game, and
`tiebreakerGame()` in `data.js` is the only way anything reads it.

A week with **two Monday games** is the case that cannot be derived, and it is a **hard validation
failure** until the answer is recorded in `TIEBREAKERS[<year>][<week>]` by away number. Do not
soften this into "take the later game" or "take the last one on the sheet": the whole reason the
flag exists is the week where that heuristic picks the wrong one of two, and a wrong tiebreaker
loses the week silently, in the one week the tiebreaker mattered. 2026 weeks 1–15 all have exactly
one Monday game, so the override table is empty; weeks 16–18 arrive later.

**2. "Weekly picks" — every Sunday once games kick off.** Every entrant's card for the week: entry
number, real name, nickname, their picked numbers, and their Monday-night tiebreaker guess. Row 2
is the answer key, filled in as results post. Columns U–AK are `=IF(pick=answer,1,0)` per game plus
a week total.

```bash
python scripts/parse_pool_picks.py "path/to/Weekly picks 26.xlsx" 2026 [week]
```

→ `data/raw/entries-<year>-w<NN>.json` — names + individual cards, **tracked**
→ `data/popularity/pop-<year>-w<NN>.json` — aggregate percentages only, **tracked**

**3. Odds — on a schedule, not mailed.** `scripts/fetch_odds.py` pulls NFL moneylines **and game
totals** from [The Odds API](https://the-odds-api.com/) (free tier, 500 requests/month), de-vigs
the moneylines, and snapshots the result. Run manually or via `.github/workflows/fetch-odds.yml`, which fires on a
consistent daily anchor (14:00 UTC, every day of the week — so Monday's opening line and
Saturday's closing line are both on record at the same clock time) with denser sampling layered on
top Thursday–Saturday, all inside budget.

```bash
ODDS_API_KEY=xxxxx python scripts/fetch_odds.py
```

→ `data/odds/current.json` — latest snapshot, **tracked** (market prices only)

**`total` is the consensus over/under, added 2026-09-09**, as the MEDIAN of the books' posted
points — not the mean. A total is a number books cluster on, so the median returns a line somebody
is actually offering (43.5) while the mean invents one nobody is (43.28) and lets one stale book at
39.5 drag the consensus. Win probability keeps the mean because it is derived rather than posted.
Only the point is stored, never the over/under prices: the consumer is the Monday-night tiebreaker
box, which wants "what does the market expect", not a de-vigged over.

**It doubled the quota cost and that is the ceiling to watch.** The Odds API bills
[markets] × [regions], so `h2h,totals` is 2 credits a call where `h2h` was 1. The workflow fires
~121 times a month, so monthly spend went from ~121 to ~242 against the free tier's 500 — still
inside it, but the headroom is ~2× now, not ~4×. **Check `data/odds/quota.json` before adding a
third market or a denser cron.**

`total` is **absent on every history entry written before 2026-09-09**, and history files keep
their old shape forever. Every consumer must treat missing as "no line" and render nothing —
never "O/U undefined".
→ `data/odds/history/<event-id>.json` — every snapshot ever taken of that specific game, oldest
  first, keyed by the Odds API's event id rather than by week bucket. This is deliberate: a bucket
  is only where a game sits *today*, and it drifts forward as weeks roll over, so bucket-keyed
  history would silently lose whatever a game's line did while it was still "next week." Per-game
  files mean "movement since first snapshot" is always the true opening line for that game — the
  Odds tab's line-movement numbers read straight off `history[0]` vs. the latest entry.
→ `data/odds/quota.json` — requests-remaining as of the last call

**The same workflow also rebuilds the survivor week card** and commits
`data/survivor-log-<year>.json` (`node scripts/log_week_card.mjs`). It is one job because the card
is a function of the odds — see "The log writes itself" under Picks Tab, and note that the Node
step is CI-only and adds no build step to the site.

The `bucket` field on each event in `current.json` is a *display* grouping only (0 = this
game-week, +1 = next, recomputed fresh every run) — not Mike's week numbers, and not a storage
key. Reconciling odds to a specific pool week is the Recommend tab's job, matched by team pair, not
this script's.

**Nothing in `js/` reads `bucket`, and nothing new should.** The Odds tab used to group all 272
games by it, which in August opened the page on a heading reading "4 weeks out" directly above a
Week 1 September game — accurate, useless, and renumbering itself every Tuesday. Week numbers come
from the schedule feed, joined per game through `oddsMatch.js`'s season-wide index. See the Odds
Tab section. **Needs `ODDS_API_KEY` as a repo secret before the GitHub Action will run** — sign
up at the-odds-api.com (an account Claude cannot create on your behalf) and add the secret once the
repo has a remote.

## Submission Format — Quoted From The Commissioner, Do Not Invent

Confirmed by Mike's 2026-09-01 email to the pool ("Please put your picks in like this"). **Both
pools go out in ONE email**, and `buildMessage()` in `js/picksheet.js` produces exactly this:

```
2,4,5,7,10,11,14,15,17,20,22,24,26,28
points 50
Suicide KC
```

- **Numbers are the pick'em pool only**, comma-separated with **no spaces**, ascending.
- **`points` is the Monday-night tiebreaker total** for the one Monday game (see Data Pipeline).
- **The suicide pick is a CITY OR TEAM NAME, never a number** — Mike's words: *"do not give me a
  number off the sheets, just a City or team name."* This is the one place a number and a name mean
  different things, so `survivorPickName()` reads the survivor state and never touches `picks`.
  **Do not "helpfully" add the sheet number to the suicide line.**
- **Everything below the `--- Week N check ---` divider is ours, not Mike's** — the name/number
  readback that catches a transposition. Safe to drop if it ever bothers him; the three lines above
  it are not.

**Deadlines, also from that email:**

| | |
|---|---|
| Both pools | **Midnight Saturday** |
| Suicide pick on a Wed/Thurs game | **6pm before that game** — days earlier |
| New entrants | Until Saturday the 12th |

The Wed/Thurs rule is a *strategy* fact, not just an operational one: taking a Thursday team in the
suicide pool costs you two days of injury news for no compensating edge, so it needs a genuinely
better spot to justify. It does not change SURVIVOR-STRATEGY.md §2's "no late-information edge" —
the deadline moves earlier, never later.

**Thursday games are excluded from the pick'em but ARE usable in the suicide pool.** These are not
in conflict: the Pick Sheet renders the number map (scored games only) and the Survivor grid renders
the schedule feed (all games). A change to one must not be propagated to the other on the assumption
they should agree.

## Pick Sheet — What It Renders

**Scored games only.** `renderGames()` reads `scoredGames()`, not `gamesForWeek()`. The workbook
prints the excluded Thursday (and any Wednesday/Friday) game for reference, and the tab used to
mirror that with a hatched `.game.excluded` row reading "Does not count this week". Those rows were
removed 2026-09-01 at the pool's request: there is nothing to pick on them, and a row you cannot
act on is one more thing to read past on the way to the twenty-eight numbers that matter. The
excluded games **stay in `number-map-<year>.json`** — `counts: false` is the record of why a game
is absent, and dropping them at parse time would make the sheet and the file disagree. If they are
ever wanted back, it is a render change, not a re-parse.

**The tiebreaker is marked in three places, from one flag.** `tiebreakerGame()` feeds the row badge
(`.game.is-tiebreak`), the hint under the Monday-night points input, and the game name appended to
the outgoing email line. All three read the parser's `tiebreaker` flag — none of them re-derives
it. See the Data Pipeline section for why that matters.

### The tiebreaker guess — the market number is the worst answer

The hint under the Monday-night input prints the market over/under **and warns you off it**:
`market O/U 43 (the field guesses this number)`. That parenthetical is the feature; the number
alone would be actively harmful.

Both halves are measured, not asserted:

- **The field guesses the line.** The 267 parsed cards in `data/raw/entries-2025-w01.json` are the
  only real sample we have. That week's total was ~43.5, and the field's median guess was 44, mean
  43.4, with **41% of all entries inside 42–45**.
- **Games do not land on the line.** 2,127 completed games across `data/schedule-*.json` give mean
  45.1, median 44, **SD 13.9**. Recentered on a 43 total, the chance of landing anywhere in 41–45
  is **15%**; it comes in at 36 or under 33% of the time and at 52 or over 25% of the time.

Simulated together — draw a real outcome, draw rivals from the real field, closest absolute wins —
the equity curve is a U with its trough exactly on the line: **~4% for guessing 43–44 against 8
tied rivals, ~24% for guessing 34–36 or 53–55.** Guessing the market number is the tiebreaker
equivalent of picking all favorites, and it fails for the same reason: you are only ever right at
the same moment as 25 other people.

The low side is preferred over the high side at equal simulated equity, because the recentered
distribution puts more mass below 37 than above 51, and because it is the half that survives if
the pool rule ever turns out to be closest-without-going-over.

**The tab prints the caveat and stops there. It does not recommend a number** — that is the same
line the Infinity War tab holds between the season prize and the weekly prize, for the same
reason: the trade is the user's.

**Do not restore `placeholder="44"` on the input.** It was there from the first build and it is a
nudge toward the exact worst answer, sitting inches from text that says so.

## Which Data File Feeds Which View

`data/raw/` (per-entrant cards) and `data/popularity/` (aggregate percentages) are both tracked and
both fair game. Pick the one whose *shape* matches the calculation:

- **Pick-leverage views read `data/popularity/`** — `leverage = win_probability ÷ pick_share` needs
  the aggregate percentage, not individual cards.
- **Lookback / "who picks well" views read `data/raw/`** — per-entrant analysis needs the cards, and
  can name entrants freely.

The source `.xlsx` workbooks are gitignored, so every parser takes a path argument rather than
reading a committed file.

## Features

### Straight-up pool tracker
- Weekly picks for every game, marked correct/incorrect once results are in.
- Running weekly win count and season-long total, mirroring how the pool itself scores.

### Survivor pool tracker
- **Teams already used (built)** — tracked per pool on the Grid tab, struck through in the team
  column with the week they were spent. See the Grid Tab section for the storage keys.
- **Remaining eligible teams (built)** — the Grid's "Survivor usable" paint colors only the weeks
  clearing the ~70% floor, so what is left to spend, and when, is the shape of the grid itself.
  **"Exclude my picks"** removes spent teams' rows entirely, and keeps doing so as more are spent.
- **Field scarcity (built — Mike's pool and Sleeper)** — what share of surviving entries still
  holds each team. Mike's from `data/survivor-<year>.json`; Sleeper live from the pool itself, on
  demand. See the Sleeper Survivor Pool section.
- **Weekly pick distribution (built)** — which teams the pool took this week, how many entries
  took each, and the shape of that as a bar chart. Bottom of the Grid tab; see "The pick board"
  under Grid Tab. Fills in through the Sunday as the kickoff gate releases each pick.
- Buy-back tracking — **not built.** `survivorLeagues.js` carries a `buybacks` counter in each
  pool's state and nothing reads it yet. Note the shape this feature must NOT take: "new pick
  history restarting after buy-back" was the original sketch and it is **wrong for this pool** —
  re-entry does not reset the used-teams list (SURVIVOR-STRATEGY.md §2). Lives are what restart;
  the spent teams never do.
- **Whichever row lists remaining/available teams must show the favorite inline** (win %, from
  `js/oddsBadge.js`'s `favoriteLine()` — see "Odds are not siloed" under Site Architecture). Not
  optional: this is what lets a glance at the grid answer "which of my remaining teams has a good
  matchup this week" without a tab switch, which is the whole point of the tool sharing one odds
  engine across pools.

### Analysis / decision support
- **Recommend tab (built)** — see the Recommend Tab section below.
- **Planning tab (built 2026-08-28)** — the survivor strategy view: what spending a team this week
  costs against its best remaining week, the four-week bye/option wall, and each team's single best
  spot mapped across the season. See the Planning Tab section below.

## Candidate Tech (no build step, CDN-only — matches workspace convention)

- **Odds/spreads**: [The Odds API](https://the-odds-api.com/) — **decided, implemented.** Free
  tier, fetched on a schedule per the Data Pipeline section above. Needs `ODDS_API_KEY`.
- **Schedule/scores data**: ESPN's public site API, e.g. `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` — same API family already used for tournament data in `Majors Golf Pool`. Not yet wired up; the commissioner's own workbook covers the pool's schedule for now, and Odds API events carry their own schedule too.
- **Future-week power ratings (for the lookahead window beyond ~10-12 days)**: **resolved in-house,
  no new dependency.** `scripts/build_projections.py` already produces a win probability for every
  unplayed game plus a per-team best week, and the Planning tab reads it. nfelo is still named in
  `SURVIVOR-STRATEGY.md` §4 and still has no public API; scraping it was considered and rejected
  2026-08-28 because the in-house series is enough for *ordering*, which is the only thing a
  future-week number is allowed to be used for (see the Planning Tab section). RotoWire stays the
  manual cross-check §4 describes, not an integration. The Odds tab still labels weeks it cannot
  cover rather than guessing.

## Data Model

```
data/
├── number-map-<year>.json          ← weekly sheet + numbers, from parse_weekly_sheets.py
├── raw/entries-<year>-w<NN>.json   ← per-entrant cards, from parse_pool_picks.py
├── popularity/pop-<year>-w<NN>.json ← aggregate pick %, from parse_pool_picks.py
├── survivor-<year>.json            ← entries + weekly pick %, from parse_survivor.py
├── squares-<year>.json             ← squares pools: board, weekly draws, frozen results (HAND-MAINTAINED)
├── teams/team-identity.json        ← palettes + uniforms + mark paths, from build_team_identity.py
├── teams/logo-trim.json            ← visible-artwork bbox per mark, from measure_logo_trim.py
└── odds/
    ├── current.json                ← latest snapshot, from fetch_odds.py
    ├── quota.json                  ← Odds API requests remaining
    └── history/<event-id>.json     ← full snapshot trail for one game, oldest first

assets/teams/
├── logos/<ABBR>.png                ← 500×500 primary logo
├── wordmarks/<ABBR>.png            ← team name, single ink
└── NOTICE.md                       ← provenance + trademark terms. Read before reusing.

assets/stjude/
├── saint-jude-parish.png           ← the full parish lockup, self-hosted (banner)
└── saint-jude-emblem.png           ← cross + sunburst only, cropped from it (board corner)
```

`data/squares-<year>.json` is the only feed here with **no generator script**, and that is not an
omission: the 100 names arrive as an emailed sheet and each week's ten-and-ten draw arrives as a
photo of a board. There is no API for either.

Straight-up and survivor *tracking* (picks marked correct/incorrect, running totals) is still
draft-only — no schema exists yet. Build it against real results once Week 1 is graded rather than
guessing the shape now.

## Team Identity — the design backbone

Colors, uniforms, and club marks for all 32 teams. **Anything that renders a team reads from
`js/teamIdentity.js`** — never a hardcoded hex or image path, so a rebrand is one rebuild instead of
a sweep through every tab. Same null-safe contract as the odds helpers: `teamColors()` returns
`null` and `markPath()` returns `''` when a team is unknown, and `''` means "render nothing."

```js
import { teamColors, teamUniform, markPath } from './teamIdentity.js';

const c = await teamColors('Buccaneers');        // {primary, secondary, ink} — or null
const kit = await teamUniform('Buccaneers', 'home');  // {jersey, pants, helmet, socks, kind}
const logo = await markPath('Buccaneers');            // 'logo' is the default
const wm = await markPath('Buccaneers', 'wordmark');  // '' means render nothing
```

Lookups accept all three upstream spellings (`TB`, `Buccaneers`, `Tampa Bay Buccaneers`) plus the
abbreviations other feeds use (`JAX`, `LA`, `OAK`, `SD`), deferring to `js/teams.js` rather than
inventing a second crosswalk.

**`ink` is computed, not chosen.** It's black-or-white by WCAG relative luminance against the team's
primary, because several primaries (Chargers powder blue, Vikings gold, Saints old gold) are light
enough that white-on-brand fails this site's 4.5:1 floor. All 32 verified passing. Don't replace it
with an eyeballed value.

Three things about the data that are load-bearing:

- **Two color authorities, deliberately.** `primary`/`secondary` come from the nflverse/ESPN feed —
  screen-tuned, tracks rebrands promptly. Pantone/CMYK comes from a style-guide mirror that lags
  rebrands, so it's attached **only** where both sources agree on the exact hexes; 15 teams have it.
  The other 10 carry a `palette.disagreement` block naming both candidates instead of silently
  picking one. Web work should use the screen values; **confirm against the club style guide before
  any print or apparel use.** Sampling the logo art to break ties does not work — ESPN re-renders
  the marks with its own color treatment (the Bears logo ships `#FF3F00` against an official
  `#C83803`), so it's a third opinion, not a tiebreaker.
- **Uniforms are derived, not asserted.** Modal jersey/pants/helmet per side from per-game
  observations (2015–2020), snapped to the team's official palette. The derivation independently
  reproduces the known conventions — Dallas and Miami are the only white-at-home teams — which is
  the check that it works. Teams with post-2020 redesigns (`WAS`, `NYJ`, `DEN`, `HOU`) carry a
  `notes` entry: colors current, design details may lag.
- **The marks are not ours and are not licensed.** Nominative use in a personal tool. See
  [`assets/teams/NOTICE.md`](assets/teams/NOTICE.md) before putting them anywhere else — and don't
  put them on anything sold, sponsored, or advertised.

```bash
python scripts/build_team_identity.py     # clones upstream mirrors, writes data + 128 images
python scripts/check_team_assets.py       # decodes all 64, fails on blank/missing artwork
python scripts/measure_logo_trim.py       # artwork bboxes -> data/teams/logo-trim.json
python scripts/fetch_team_assets.py logos --dry-run          # refresh from official CDNs
python scripts/fetch_team_assets.py wordmarks --dry-run      # (no endpoint today — see the doc)
```

**The Schedule row carries the team logo on an 8% wash of the team's own color**, with the name in
`--ink` and an explicit `AWAY` / `HOME` label on each side. The wash is mixed to a solid hex by
`tintOn()` in `js/teamIdentity.js` rather than set with opacity, so the text contrast on top is a
fixed measured number (worst of the 32 is 8.40:1) instead of depending on whatever is behind it.
`assets-review.html` carries the seven variants this was chosen from.

**Games not at the home team's stadium are flagged.** "Home" in every upstream feed means the team
that owns the fixture, not whose building it is — nine 2026 games are abroad. `fetch_schedule.py`
now records `neutral` on every game (its *absence* means the file predates the field, which is not
the same as "played at home") plus a `venue` block for the neutral ones, and the card shows an amber
city pill with a dotted underline under the displaced team's HOME label.

**There are no helmet images.** They were removed on 2026-08-13. The Schedule tab shows a team
mark at 28×28px, and a side-profile helmet is a grey blob at that size — two were first rebuilt
to their current 2024/2026 designs, which proved the problem was the form rather than the
currency. The set is logos and wordmarks only; `uniforms.<side>.helmet` is a *color* and is
unaffected. See [`assets-review.html`](assets-review.html) for how the marks read at real size,
and [`docs/REFRESH-TEAM-ASSETS.md`](docs/REFRESH-TEAM-ASSETS.md) for the refresh runbook.

`build_team_identity.py` reads **GitHub mirrors, not nfl.com or espncdn.com** — a Claude Code web
session in this repo has a GitHub-only egress allowlist, and those hosts answer 403 there. That is
why `scripts/lib/rdata.py` exists (a minimal R `.rda` reader, to pull logos out of nflplotR's
embedded blob) and `scripts/lib/pngstat.py` (a minimal PNG decoder, since there's no Pillow and no
build step). `fetch_team_assets.py` is the open-network refresh path and is **unexercised** —
`--dry-run` it first.

## Open Questions

- Personal local tool vs. a deployed live site — decide once the core tracking logic works.
- Data entry: manual JSON updates each week (like `Majors Golf Pool/standings.js`) vs. pulling live scores automatically to auto-grade picks.
- Whether to include odds/spread data at all, or keep this to schedule + team performance stats only — **resolved: yes**, the Odds tab is built on it.

## GitHub Setup

**Complete as of 2026-08-11.** All four setup steps are done:

| Step | Status | Evidence |
|---|---|---|
| Remote created + `git remote add origin` | Done | `origin` → `https://github.com/bova4389/bovas-picks` |
| `git push -u origin main` | Done | Root commit `fe0e6d4` onward on `origin/main` |
| `ODDS_API_KEY` repo secret | Done | `github-actions[bot]` odds commits land daily; the workflow cannot commit without it |
| **GitHub Pages enabled** | **Done 2026-08-11 23:11 UTC** | 5 successful `pages build and deployment` runs from `main`, latest 2026-08-12 14:48 UTC |

**The site is live at `https://bova4389.github.io/bovas-picks/`.** Pages serves the repository root,
so every tracked file is fetchable at its repo path — `data/odds/current.json` and the rest of
`data/` included. That is by design: the tabs fetch those paths directly.

## Syncing Local ↔ GitHub

Work reaches this repo from two places that never see each other: **a local machine**, and
**Claude Code on the web**, which runs in an ephemeral container that clones from GitHub and pushes
back. GitHub is the only shared ground. Nothing written in a web session exists anywhere else until
it is pushed, and nothing on the local drive is visible to a web session until it is pushed.

**A third writer moves `main` on its own:** `.github/workflows/fetch-odds.yml` commits to `main`
eight times a day Thursday–Saturday and once daily Sunday–Wednesday. **`origin/main` will almost
always be ahead of a local checkout that has sat overnight.** This is the single most likely source
of a surprising push rejection, and it is expected behavior rather than a problem.

### Start every local session with a pull

```bash
cd "path/to/NFL Pickems"
git fetch origin
git status -sb                    # shows how far behind main is
git pull --ff-only origin main    # refuses to invent a merge if histories diverged
```

`--ff-only` is deliberate: it fails loudly on divergence instead of silently creating a tangled
merge commit. If it fails, use `git pull --rebase origin main` to replay local commits on top.

### Pulling a branch pushed from a web session

```bash
git fetch origin <branch-name>
git checkout <branch-name>
```

To fold it into `main` (docs-only branches need no PR):

```bash
git checkout main
git pull --ff-only origin main
git merge --no-ff <branch-name>
git push origin main
```

### Why a local push cannot destroy web-session work

Three independent protections, worth knowing so the fear doesn't drive bad workarounds:

1. **Single root commit** (`fe0e6d4`, 2026-08-11). Local and GitHub share one lineage — there is no
   "unrelated histories" hazard, which is the failure mode where two repos silently overwrite.
2. **Branches are independent refs.** Pushing `main` cannot alter, remove, or ignore a branch like
   `claude/*`. Only an explicit push to that branch name touches it.
3. **Git refuses non-fast-forward pushes by default.** A local `main` behind `origin/main` gets a
   *rejection*, never a silent overwrite. The rejection is the safety net working.

**The one thing that does destroy remote work: `git push --force` (or `-f`, or
`--force-with-lease`).** Never use it here. A rejected push is solved with `git pull --rebase`, not
with force.

### Odds data conflicts

`data/odds/` is bot-owned. Do not hand-edit it locally. On a conflict there, take the remote copy —
the next scheduled run regenerates it anyway:

```bash
git checkout origin/main -- data/odds/
git add data/odds/
```
