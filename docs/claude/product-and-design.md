# Product Scope, Data Model, and Team Identity — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

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
  took each, and the shape of that as a bar chart. On Survivor Standings (moved from the Grid
  2026-09-14); see "The pick board" under Grid Tab. Fills in through the Sunday as the kickoff gate releases each pick.
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
