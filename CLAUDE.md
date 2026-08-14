# CLAUDE.md — Bova's Picks

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Site name**: Bova's Picks (renamed from "NFL Pickem Analyzer" 2026-08-11; the local folder is
  still `NFL Pickems/` — see the note at the end of this section for why).
- **GitHub repo**: [`bova4389/bovas-picks`](https://github.com/bova4389/bovas-picks) — own nested
  repo per the workspace convention (see workspace `CLAUDE.md` Git Setup). Pushed since 2026-08-11.
- **Hosting**: **GitHub Pages, live** at `https://bova4389.github.io/bovas-picks/` (enabled
  2026-08-11), deploying from `main`. See GitHub Setup below.
- **Status**: Schedule, Grid, Pick Sheet, Odds and Recommend tabs are functional. Lookback and
  Survivor still "Soon" — though the Grid tab already carries the survivor used-team tracking that
  the Survivor tab was going to open with.

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
js/oddsMatch.js      SHARED — join a {away,home} game to an odds event         [NEVER versioned]
js/oddsBadge.js      SHARED — inline "who's favored" text fragment            [NEVER versioned]
js/season.js        SHARED — season identity + the cross-feed audit          [NEVER versioned]
js/seasonBanner.js  SHARED — the audit's rendering half                      [NEVER versioned]
js/espn.js          SHARED — live scoreboard fetch, cached                   [NEVER versioned]
js/gameState.js     SHARED — canonical "what happened in this game"          [NEVER versioned]
js/gridModel.js     SHARED — the 32 x 18 team-week matrix, pure data         [NEVER versioned]
js/survivorLeagues.js SHARED — per-pool used teams + field scarcity          [NEVER versioned]
js/teamIdentity.js  SHARED — team colors, uniforms, logo/wordmark paths     [NEVER versioned]
js/schedule.js      Schedule tab — one week, live scores
js/grid.js          Grid tab — the whole season as one table
js/picksheet.js     Pick Sheet tab
js/odds.js          Odds tab — one week of market prices, reads data/odds/
js/recommend.js     Recommend tab — leverage = win prob ÷ pick share, per STRATEGY.md §4
```

## Navigation — Two Levels, One Model

The site covers **two different games**, so the nav says so. `js/app.js` holds a `GROUPS` /
`PANELS` model and writes **both** rows from it; `index.html` holds only the panels.

| Row 1 (the pool) | Row 2 (views inside it) |
|---|---|
| **Schedule** | *(none — it belongs to neither pool and is read from both)* |
| **Season Long** | Grid · Pick Sheet · Odds · Recommend · Lookback |
| **Survivor** | Grid · Odds · Planning |

Rules that keep this from rotting:

- **Grid and Odds are one panel each, reached from two rows — not two copies.** Every panel is
  booted once at load and shown or hidden after that, so crossing rows never re-renders and never
  drops the Grid's scroll position or a half-filled pick sheet. Adding a third route to a panel is
  one line in `GROUPS`.
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
(`favoriteLine(game, oddsIndex)` → a text fragment like `` Jaguars <strong>85%</strong> ``, or `''`
if there's no market line — callers treat `''` as "render nothing"). Both `recommend.js` and
`picksheet.js` already build their `oddsIndex` the same way:

```js
import { getOddsSnapshot } from './data.js';
import { buildOddsIndex } from './oddsMatch.js';
import { favoriteLine } from './oddsBadge.js';

const snapshot = await getOddsSnapshot();               // null-safe, never throws
const oddsIndex = snapshot ? buildOddsIndex(snapshot.events) : new Map();
// per matchup: favoriteLine(game, oddsIndex) — '' means don't render anything
```

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
  anywhere; every feed is memoised by `loadJSON`.
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
| `grid:prefs` | paint, marks, zoom, sort, week window, active pool, hidden teams |
| `grid:tags:<year>` | per-cell target / avoid / watch flags, keyed `TEAM\|WEEK` |
| `survivor:<year>:<pool>` | my used teams for one pool, as `week -> team` |

Used teams are stored **per pool and never merged** — SURVIVOR-STRATEGY.md's three pools are
different games, and a pick that is right in the Yahoo pool can be wrong in Mike's the same
Sunday. Field scarcity ("what share of surviving entries still holds this team") comes from
`data/survivor-<year>.json` and is Mike's pool only; the two app pools have no such feed and are
not getting one, because that document concludes pick popularity is not worth acting on at 15-20
entrants.

**Not built yet, in rough priority order:** free-text notes per cell (the tags are the flag half
of that feature); ESPN team news and injury links in the detail strip; venue/neutral-site data,
which would need `scripts/fetch_schedule.py` to capture `competitions[0].venue` and `neutralSite`
— today the international slate is inferred from the 9:30am Eastern Sunday window, which catches
all six of 2026's but would miss a Friday or Saturday game abroad.

## Odds Tab

One week of market prices at a time, chosen with the same week selector Schedule and Recommend
use. Three things about it are corrections rather than preferences, so don't undo them:

- **It is scoped to a week, and the week comes from the schedule feed.** See the `bucket` note
  under Data Pipeline for what it did before. `matchSeasonOdds` (pair **and** kickoff) does the
  join, not `buildOddsIndex` — all 272 games are in the snapshot at once here, so the pair-only
  index would collapse both meetings of every division rivalry.
- **It fetches ~16 history files, not 272.** The old version pulled every game's full snapshot
  trail at boot to compute line movement for rows nobody had scrolled to. Histories are fetched
  per selected week, and `loadJSON` memoises them across week switches.
- **The tab leads with what it is telling you.** A summary strip (biggest mismatch, toss-up count,
  which lines have moved most) sits above the rows, because "I have no idea what this tab is for"
  was the actual complaint and a wall of percentages did not answer it. Movement is expressed as
  `Bears 57% → 58%` from the current favourite's side; an unmoved game says "Unchanged since open"
  and deliberately does **not** repeat its own percentage, or all 16 rows shout equally and the two
  that moved disappear.

Line movement, not win rate, is the metric STRATEGY.md §3 cares about — that is why movement gets
its own summary cell rather than being one more number in the meta line.

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

→ `data/number-map-<year>.json` (teams, numbers, byes — **tracked**)

Layout notes that cost time to work out: away = odd number, home = even, sequential down the page.
Unnumbered games are excluded from scoring — normally the Thursday game, but **Week 13
(Thanksgiving) numbered everything including the Black Friday game**. Each sheet ends with a "Bye
Week" block listing bye teams in the same columns games use; only real games have `at` in column D,
which is the only reliable discriminator. The parser validates that every week's numbers form a
clean `1..2N` run with home = away + 1, and exits non-zero if not.

**2. "Weekly picks" — every Sunday once games kick off.** Every entrant's card for the week: entry
number, real name, nickname, their picked numbers, and their Monday-night tiebreaker guess. Row 2
is the answer key, filled in as results post. Columns U–AK are `=IF(pick=answer,1,0)` per game plus
a week total.

```bash
python scripts/parse_pool_picks.py "path/to/Weekly picks 26.xlsx" 2026 [week]
```

→ `data/raw/entries-<year>-w<NN>.json` — names + individual cards, **tracked**
→ `data/popularity/pop-<year>-w<NN>.json` — aggregate percentages only, **tracked**

**3. Odds — on a schedule, not mailed.** `scripts/fetch_odds.py` pulls NFL moneylines from
[The Odds API](https://the-odds-api.com/) (free tier, 500 requests/month), de-vigs them, and
snapshots the result. Run manually or via `.github/workflows/fetch-odds.yml`, which fires on a
consistent daily anchor (14:00 UTC, every day of the week — so Monday's opening line and
Saturday's closing line are both on record at the same clock time) with denser sampling layered on
top Thursday–Saturday, all inside budget.

```bash
ODDS_API_KEY=xxxxx python scripts/fetch_odds.py
```

→ `data/odds/current.json` — latest snapshot, **tracked** (market prices only)
→ `data/odds/history/<event-id>.json` — every snapshot ever taken of that specific game, oldest
  first, keyed by the Odds API's event id rather than by week bucket. This is deliberate: a bucket
  is only where a game sits *today*, and it drifts forward as weeks roll over, so bucket-keyed
  history would silently lose whatever a game's line did while it was still "next week." Per-game
  files mean "movement since first snapshot" is always the true opening line for that game — the
  Odds tab's line-movement numbers read straight off `history[0]` vs. the latest entry.
→ `data/odds/quota.json` — requests-remaining as of the last call

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
  "Only unused" hides spent teams entirely.
- **Field scarcity (built, Mike's pool only)** — what share of surviving entries still holds each
  team, from `data/survivor-<year>.json`.
- Buy-back tracking (elimination date, re-entry date, new pick history restarting after buy-back)
  — **not built.** `survivorLeagues.js` carries a `buybacks` counter in each pool's state and
  nothing reads it yet.
- **Whichever row lists remaining/available teams must show the favorite inline** (win %, from
  `js/oddsBadge.js`'s `favoriteLine()` — see "Odds are not siloed" under Site Architecture). Not
  optional: this is what lets a glance at the grid answer "which of my remaining teams has a good
  matchup this week" without a tab switch, which is the whole point of the tool sharing one odds
  engine across pools.

### Analysis / decision support
- **Recommend tab (built)** — `js/recommend.js` computes `leverage = win_probability ÷ pick_share`
  per STRATEGY.md §4 Step 4 for every game in the selected week, joining the Odds tab's snapshot to
  `data/popularity/`. Ranks candidates clearing the 38% floor by leverage descending; if that
  week's popularity file doesn't exist yet (the normal case before Sunday), falls back to ranking
  live underdogs by win probability alone rather than hiding the tab. Full slate always shown below
  the ranked list, including games below the floor or missing a market line.
- Survivor strategy view — highlight strong remaining teams by upcoming schedule difficulty, so a team isn't wasted on an easy week too early.

## Candidate Tech (no build step, CDN-only — matches workspace convention)

- **Odds/spreads**: [The Odds API](https://the-odds-api.com/) — **decided, implemented.** Free
  tier, fetched on a schedule per the Data Pipeline section above. Needs `ODDS_API_KEY`.
- **Schedule/scores data**: ESPN's public site API, e.g. `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` — same API family already used for tournament data in `Majors Golf Pool`. Not yet wired up; the commissioner's own workbook covers the pool's schedule for now, and Odds API events carry their own schedule too.
- **Future-week power ratings (for the lookahead window beyond ~10-12 days)**: undecided. nfelo is
  named in `SURVIVOR-STRATEGY.md` §4 as the source, but it has no public API — would mean scraping
  a Tier 2 model site (not a banned tout, but still adds a dependency). Not built; the Odds tab
  labels weeks it can't cover rather than guessing.

## Data Model

```
data/
├── number-map-<year>.json          ← weekly sheet + numbers, from parse_weekly_sheets.py
├── raw/entries-<year>-w<NN>.json   ← per-entrant cards, from parse_pool_picks.py
├── popularity/pop-<year>-w<NN>.json ← aggregate pick %, from parse_pool_picks.py
├── survivor-<year>.json            ← entries + weekly pick %, from parse_survivor.py
├── teams/team-identity.json        ← palettes + uniforms + mark paths, from build_team_identity.py
└── odds/
    ├── current.json                ← latest snapshot, from fetch_odds.py
    ├── quota.json                  ← Odds API requests remaining
    └── history/<event-id>.json     ← full snapshot trail for one game, oldest first

assets/teams/
├── logos/<ABBR>.png                ← 500×500 primary logo
├── wordmarks/<ABBR>.png            ← team name, single ink
└── NOTICE.md                       ← provenance + trademark terms. Read before reusing.
```

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
