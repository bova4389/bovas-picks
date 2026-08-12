# CLAUDE.md — Bova's Picks

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Site name**: Bova's Picks (renamed from "NFL Pickem Analyzer" 2026-08-11; the local folder is
  still `NFL Pickems/` — see the note at the end of this section for why).
- **GitHub repo**: local `git init` done (2026-08-11), own nested repo per the workspace convention
  (see workspace `CLAUDE.md` Git Setup). Not yet pushed — no remote created (`gh` isn't installed
  in this environment; create `bova4389/bovas-picks` on github.com and
  `git remote add origin` when ready).
- **Hosting**: TBD — likely GitHub Pages if it becomes a live site, otherwise a local tool
- **Status**: Pick Sheet, Odds, and Recommend tabs are functional. Lookback and Survivor still "Soon".

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

- **Do not build sportsbook integrations or bet-placement features.** The vehicle is unprofitable
  after tax before a single pick is made.
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
index.html          shell + tab markup + placeholder panels
css/styles.css      design system (see below)
js/app.js           tab navigation, deep links (#odds), boots the active tab   [versioned]
js/data.js          SHARED data layer — fetch + cache + localStorage           [NEVER versioned]
js/teams.js         team-name crosswalk (mascot ↔ full name ↔ abbreviation)    [NEVER versioned]
js/oddsMatch.js      SHARED — join a {away,home} game to an odds event         [NEVER versioned]
js/oddsBadge.js      SHARED — inline "who's favored" text fragment            [NEVER versioned]
js/picksheet.js     Pick Sheet tab
js/odds.js          Odds tab — reads data/odds/, no fetching of its own
js/recommend.js     Recommend tab — leverage = win prob ÷ pick share, per STRATEGY.md §4
```

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

**Local dev** (fetch is blocked on `file://`, so it must be served):

```bash
python -m http.server 8765 -d "NFL Pickems"
```

`.claude/launch.json` at the workspace root defines this as the `pickem` preview server.

## Data Pipeline

The commissioner mails two Excel workbooks. Both are parsed into `data/`; neither is committed.

**1. "Weekly Sheets" — once at the start of the season.** One sheet per week, defining which games
are in the pool and what number each team carries. Picks are submitted by emailing those numbers,
so this is both the source of the pick form and the validator for outgoing picks.

```bash
python scripts/parse_weekly_sheets.py "path/to/Weekly Sheets 26.xlsx" 2026
```

→ `data/number-map-<year>.json` (teams, numbers, byes — **no PII, safe to commit**)

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

→ `data/raw/entries-<year>-w<NN>.json` — names + individual cards, **tracked** (see Data & Privacy
  below — this project doesn't follow the Majors PII rule)
→ `data/popularity/pop-<year>-w<NN>.json` — aggregate percentages only, **safe to commit**

**3. Odds — on a schedule, not mailed.** `scripts/fetch_odds.py` pulls NFL moneylines from
[The Odds API](https://the-odds-api.com/) (free tier, 500 requests/month), de-vigs them, and
snapshots the result. Run manually or via `.github/workflows/fetch-odds.yml`, which fires on a
consistent daily anchor (14:00 UTC, every day of the week — so Monday's opening line and
Saturday's closing line are both on record at the same clock time) with denser sampling layered on
top Thursday–Saturday, all inside budget.

```bash
ODDS_API_KEY=xxxxx python scripts/fetch_odds.py
```

→ `data/odds/current.json` — latest snapshot, **safe to commit** (no PII, just market prices)
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
this script's. **Needs `ODDS_API_KEY` as a repo secret before the GitHub Action will run** — sign
up at the-odds-api.com (an account Claude cannot create on your behalf) and add the secret once the
repo has a remote.

## Data & Privacy

**Entrant names are fine to commit and display.** This is a personal site, and the pool's own
weekly mailing already circulates every name to all ~270 entrants. `data/raw/` is tracked, and the
lookback "who picks well" analysis can name people freely. This project does **not** follow the
stricter Majors Golf Pool rule, and no PII hook is needed here.

Two narrow exclusions, both about contact details rather than names:

- **The source workbooks are gitignored** (`*.xlsx`/`*.xls`/`*.xlsm`). Every sheet footer carries
  the commissioner's personal email and cell number. The parsers extract only games, numbers, and
  picks, so nothing downstream needs the raw files — and the derived JSON is verified clean of both.
- **Entry 79's name field is an email address**, not a name — one entrant filled the form in
  wrong. It is a third party's address rather than the user's or the commissioner's. Harmless in a
  private/personal context; scrub it if this site ever becomes publicly reachable.

`data/popularity/` (percentages, no names) is still the right thing for the *pick-leverage* views
to read — not for privacy reasons, but because that is the shape those calculations need. The
lookback views read `data/raw/`.

**The one thing that would change this policy:** if the site is ever deployed to a public URL
rather than opened locally, ~270 real names become search-indexable. That is the moment to revisit,
not before.

## Features

### Straight-up pool tracker
- Weekly picks for every game, marked correct/incorrect once results are in.
- Running weekly win count and season-long total, mirroring how the pool itself scores.

### Survivor pool tracker
- Teams already used (locked out for future weeks).
- Remaining eligible teams, to help plan which strong teams to save for harder weeks later in the season.
- Buy-back tracking (elimination date, re-entry date, new pick history restarting after buy-back).
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
└── odds/
    ├── current.json                ← latest snapshot, from fetch_odds.py
    ├── quota.json                  ← Odds API requests remaining
    └── history/<event-id>.json     ← full snapshot trail for one game, oldest first
```

Straight-up and survivor *tracking* (picks marked correct/incorrect, running totals) is still
draft-only — no schema exists yet. Build it against real results once Week 1 is graded rather than
guessing the shape now.

## Open Questions

- Personal local tool vs. a deployed live site — decide once the core tracking logic works.
- Data entry: manual JSON updates each week (like `Majors Golf Pool/standings.js`) vs. pulling live scores automatically to auto-grade picks.
- Whether to include odds/spread data at all, or keep this to schedule + team performance stats only — **resolved: yes**, the Odds tab is built on it.

## GitHub Setup

**Done as of 2026-08-12** — remote is `https://github.com/bova4389/bovas-picks`, `main` is pushed,
and `ODDS_API_KEY` is configured (proven by `github-actions[bot]` odds commits landing on 8/11 and
8/12; the workflow cannot commit without it).

One step remains:

- **GitHub Pages is not enabled.** When ready to deploy: repo Settings → Pages → deploy from `main`.
  Revisit the public-URL question in Data & Privacy first — ~270 real names become search-indexable
  the moment this is publicly reachable.

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
