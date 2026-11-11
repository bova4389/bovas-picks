# CLAUDE.md — Bova's Picks

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Site name**: Bova's Picks (renamed from "NFL Pickem Analyzer" 2026-08-11; the local folder is
  still `NFL Pickems/` — see the note at the end of this section for why).
- **GitHub repo**: [`bova4389/bovas-picks`](https://github.com/bova4389/bovas-picks) — own nested
  repo per the workspace convention (see workspace `CLAUDE.md` Git Setup). Pushed since 2026-08-11.
- **Hosting**: **GitHub Pages, live** at `https://bova4389.github.io/bovas-picks/` (enabled
  2026-08-11), deploying from `main`. See GitHub Setup below.
- **Status**: Every tab is functional. **Lookback was the last "Soon" panel and was built
  2026-10-31**; see Lookback Tab below.

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
   Thursday kickoff. **$1,270 paid out each week** to the most correct picks, with the Monday night
   game's total points as the tiebreaker; **$2,540** to the season-long winner (corrected 2026-09-14
   from "$1,000 a week / $5–6k season": Mike's 2026 email says **$1,270 a week**, and the owner
   confirmed the season prize). Tied on correct and on the Monday guess: **split evenly**.
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
js/sleeperAuth.js   SHARED — per-device Sleeper token + the Connect box    [NEVER versioned]
js/sharedFeeds.js   SHARED — seeds the pool caches from the GitHub job's copy [NEVER versioned]
js/infinityPool.js  SHARED — Infinity War's league id, importable by Node   [NEVER versioned]
js/sleeperBookmarklet.js SHARED — the "Get Sleeper token" bookmark        [NEVER versioned]
js/pickShare.js     SHARED — modeled pick share + k calibration            [NEVER versioned]
js/recordShare.js   SHARED — the record-aware share curve, pure          [NEVER versioned]
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
js/weekCard.js      Picks tab — one pick per pool, every pool at once
js/package.json     TYPE-ONLY, for Node in CI. Not a build step — see Picks Tab.
js/infinityModel.js SHARED — the pick-eight math, pure data                 [NEVER versioned]
js/infinityFeed.js  SHARED — pick'em-shaped Sleeper read                    [NEVER versioned]
js/infinityWar.js   Infinity War tab — pick 8 of the slate, small field
js/squaresModel.js  SHARED — squares math, pure data                       [NEVER versioned]
js/poolWeek.js      SHARED — which week a pool page opens on (Wed 6pm)     [NEVER versioned]
js/squaresChrome.js SHARED — St. Jude banner, theme hook, footer nav       [NEVER versioned]
js/myPicks.js       SHARED — what I picked: Pick Sheet card + survivor picks [NEVER versioned]
js/liveModel.js     SHARED — live pool standings math, pure data           [NEVER versioned]
js/standingsModel.js SHARED — Sleeper pools' standings math, pure data     [NEVER versioned]
js/payouts.js       SHARED — prize winners, season tables, burn matrix     [NEVER versioned]
js/pickLock.js      SHARED — per-week Lock / Unlock for pick editing       [NEVER versioned]
js/githubSync.js    SHARED — Lock saves the sent file to GitHub, per device key [NEVER versioned]
js/tiebreak.js      SHARED — the Monday-total suggestion (line ± 7), pure       [NEVER versioned]
js/lookback.js      Lookback tab — the season graded on process, reads data/results/lookback-<year>.json
js/standings.js     Standings — Season Long: Mike's pick'em + Infinity War; Survivor: Mike's suicide + Poop + Deadpool
js/squares.js       Squares Board tab — one week: matchup, board, payouts
js/squaresLedger.js Squares Season tab — 18 weeks of payouts and P&L
```

## Reference Docs — Read the Matching One Before Touching That Area

Most of what used to be in this file now lives in `docs/claude/`, moved verbatim on 2026-11-11 so
a session only pays for the parts it needs. Those docs hold the rules that stop known bugs from
coming back. **Before you change a tab, a feed, or a number, read its doc.** Do not work from what
the code seems to imply.

| Before touching… | Read |
|---|---|
| The two nav rows, deep links, or adding a tab | [`docs/claude/navigation.md`](docs/claude/navigation.md) |
| Grid tab, any highlight or painted cell, the pick board | [`docs/claude/grid.md`](docs/claude/grid.md) |
| Recommend tab, thresholds, the pick-share model, injuries / line movement | [`docs/claude/recommend.md`](docs/claude/recommend.md) |
| Planning or Lookback tab | [`docs/claude/planning-and-lookback.md`](docs/claude/planning-and-lookback.md) |
| Picks tab (cross-pool week card), its survivor log, Node in CI, tests | [`docs/claude/picks-tab.md`](docs/claude/picks-tab.md) |
| Sleeper pools, the shared feed, **the kickoff gate**, the removed site gate | [`docs/claude/sleeper-pools.md`](docs/claude/sleeper-pools.md) |
| Infinity War tab or its numbers | [`docs/claude/infinity-war.md`](docs/claude/infinity-war.md) |
| Squares (board, colors, St. Jude theme, week changeover, polling) | [`docs/claude/squares.md`](docs/claude/squares.md) |
| Odds tab, any script in `scripts/`, any workflow, anything under `data/` | [`docs/claude/odds-and-data-pipeline.md`](docs/claude/odds-and-data-pipeline.md) |
| Pick Sheet, submission format, tiebreaker guess, Lock / Unlock, GitHub save, My Picks | [`docs/claude/pick-sheet.md`](docs/claude/pick-sheet.md) |
| Standings panels, payouts, pools the owner is out of | [`docs/claude/standings.md`](docs/claude/standings.md) |
| Betting / DFS ideas (settled: no fixed-odds), data model, team colors and logos | [`docs/claude/product-and-design.md`](docs/claude/product-and-design.md) |
| Git trouble: rejected push, odds-file conflict, pulling a web-session branch | [`docs/claude/git-and-sync.md`](docs/claude/git-and-sync.md) |

**Code comments that say "see CLAUDE.md, <section>" mean a section that has moved to one of these
docs.** Grep `docs/claude/` for the heading. Those comments were left alone on purpose, because
editing them would mean bumping the cache-busting version on every JS file involved.

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

## Which Data File Feeds Which View

`data/raw/` (per-entrant cards) and `data/popularity/` (aggregate percentages) are both tracked and
both fair game. Pick the one whose *shape* matches the calculation:

- **Pick-leverage views read `data/popularity/`** — `leverage = win_probability ÷ pick_share` needs
  the aggregate percentage, not individual cards.
- **Lookback / "who picks well" views read `data/raw/`** — per-entrant analysis needs the cards, and
  can name entrants freely.

The source `.xlsx` workbooks are gitignored, so every parser takes a path argument rather than
reading a committed file.

## Syncing — The Short Version

`origin/main` is almost always ahead: the odds bot commits several times a day, and web sessions
push too. **Start every session with `git fetch origin && git pull --ff-only origin main`.** Fix a
rejected push with `git pull --rebase`, never with force. On a `data/odds/` conflict, take the
remote copy. Details are in [`docs/claude/git-and-sync.md`](docs/claude/git-and-sync.md).
