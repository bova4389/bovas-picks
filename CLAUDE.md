# CLAUDE.md — NFL Pickem Analyzer

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

- **Site name**: NFL Pickem Analyzer
- **GitHub repo**: (not yet created — suggested name `nfl-pickem-analyzer`, public by default unless told otherwise)
- **Hosting**: TBD — likely GitHub Pages if it becomes a live site, otherwise a local tool
- **Status**: Planning / scaffold only. No features built yet.

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
js/picksheet.js     Pick Sheet tab
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

→ `data/raw/entries-<year>-w<NN>.json` — names + individual cards, **gitignored**
→ `data/popularity/pop-<year>-w<NN>.json` — aggregate percentages only, **safe to commit**

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

- **Schedule/scores data**: ESPN's public site API, e.g. `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` — same API family already used for tournament data in `Majors Golf Pool`.
- **Odds/spreads (optional)**: [The Odds API](https://the-odds-api.com/) has a free tier and could inform straight-up and survivor picks with market-implied win probabilities.

## Data Model (draft)

```
data/
├── straight-pickem.json   ← [{ week, picks: [{game, pickedTeam, actualWinner, correct}] }]
└── survivor.json          ← { usedTeams: [...], eliminatedWeek: null, boughtBack: false, picks: [{week, team, result}] }
```

## Open Questions

- Personal local tool vs. a deployed live site — decide once the core tracking logic works.
- Data entry: manual JSON updates each week (like `Majors Golf Pool/standings.js`) vs. pulling live scores automatically to auto-grade picks.
- Whether to include odds/spread data at all, or keep this to schedule + team performance stats only.

## GitHub Setup

1. `cd "NFL Pickems"`
2. `git init`
3. `gh repo create bova4389/nfl-pickem-analyzer --public --source=. --remote=origin` (or create on github.com and `git remote add origin <url>`; swap `--public` for `--private` if preferred)
4. `git add .`
5. `git commit -m "Initial scaffold"`
6. `git branch -M main`
7. `git push -u origin main`
8. When ready to deploy: repo Settings → Pages → deploy from `main`.
