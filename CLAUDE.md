# CLAUDE.md — NFL Pickem Analyzer

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Site name**: NFL Pickem Analyzer
- **GitHub repo**: local `git init` done (2026-08-11), own nested repo per the workspace convention
  (see workspace `CLAUDE.md` Git Setup). Not yet pushed — no remote created (`gh` isn't installed
  in this environment; create `bova4389/nfl-pickem-analyzer` on github.com and
  `git remote add origin` when ready).
- **Hosting**: TBD — likely GitHub Pages if it becomes a live site, otherwise a local tool
- **Status**: Pick Sheet and Odds tabs are functional. Recommend, Lookback, Survivor still "Soon".

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

## Site Architecture

Tabbed single page. Each tab's logic is its own ES module under `js/` — deliberately **not** one
large `index.html`, which is the pain point Sleeper FF has grown into.

```
index.html          shell + tab markup + placeholder panels
css/styles.css      design system (see below)
js/app.js           tab navigation, deep links (#odds), boots the active tab   [versioned]
js/data.js          SHARED data layer — fetch + cache + localStorage           [NEVER versioned]
js/teams.js         team-name crosswalk (mascot ↔ full name ↔ abbreviation)    [NEVER versioned]
js/picksheet.js     Pick Sheet tab
js/odds.js          Odds tab — reads data/odds/, no fetching of its own
```

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
snapshots the result. Run manually or via `.github/workflows/fetch-odds.yml`, which fires densely
Thursday–Saturday and sparsely the rest of the week to stay inside budget.

```bash
ODDS_API_KEY=xxxxx python scripts/fetch_odds.py
```

→ `data/odds/current.json` — latest snapshot, **safe to commit** (no PII, just market prices)
→ `data/odds/history/<bucket>.json` — every snapshot for that game-week bucket, appended to; the
  Odds tab's line-movement numbers come from the first vs. latest entry per game
→ `data/odds/quota.json` — requests-remaining as of the last call

Buckets are relative to "now" (`current`, `bucket+1`, …), not Mike's week numbers — the API has no
concept of Mike's numbering. Reconciling odds to a specific pool week is the Recommend tab's job,
matched by date and team. **Needs `ODDS_API_KEY` as a repo secret before the GitHub Action will run**
— sign up at the-odds-api.com (an account Claude cannot create on your behalf) and add the secret
once the repo has a remote.

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

### Analysis / decision support
- Per-week matchup view to inform picks — likely pulling live schedule/scores and possibly odds.
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
    └── history/<bucket>.json       ← snapshot trail per game-week bucket
```

Straight-up and survivor *tracking* (picks marked correct/incorrect, running totals) is still
draft-only — no schema exists yet. Build it against real results once Week 1 is graded rather than
guessing the shape now.

## Open Questions

- Personal local tool vs. a deployed live site — decide once the core tracking logic works.
- Data entry: manual JSON updates each week (like `Majors Golf Pool/standings.js`) vs. pulling live scores automatically to auto-grade picks.
- Whether to include odds/spread data at all, or keep this to schedule + team performance stats only — **resolved: yes**, the Odds tab is built on it.

## GitHub Setup

`git init` and the initial commit are done locally (2026-08-11) — own nested repo per the
workspace convention, no remote yet. To finish:

1. Create `bova4389/nfl-pickem-analyzer` on github.com (public by default unless told otherwise —
   `gh repo create` isn't available since `gh` isn't installed in this environment) and
   `git remote add origin <url>`, run from inside `NFL Pickems/`.
2. `git push -u origin main`
3. Repo Settings → Secrets → Actions → add `ODDS_API_KEY` (sign up at the-odds-api.com first —
   that account creation is a step only you can do) so `.github/workflows/fetch-odds.yml` can run.
4. When ready to deploy: repo Settings → Pages → deploy from `main`.
