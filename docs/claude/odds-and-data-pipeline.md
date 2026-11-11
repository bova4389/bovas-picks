# Odds Tab and Data Pipeline — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

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

**We grade the week ourselves; Mike's answer key is the check, not the source** (decided
2026-09-13). He fills in Week N's results by hand and mails them with Week N+1's picks, so
waiting on him leaves a week ungraded for most of the next week. `scripts/grade_week.py` derives
the answer key from the ESPN final scores in `data/schedule-<year>.json` and grades every card
(most correct, then closest Monday-night total by absolute value) and every suicide pick.
`fetch-schedule.yml` runs it every Tuesday right after the score fetch.

```bash
python scripts/grade_week.py 2026 [week]
python scripts/grade_week.py 2026 1 --check "Weekly picks 26.xlsx" --check-suicide "Suicide 26.xlsx"
```

→ `data/results/pickem-<year>-w<NN>.json` — answer key, graded cards, rank, winner(s), **tracked**
→ `data/results/survivor-<year>.json` — per-week won/lost counts and who lost, **tracked**

- **Run `--check` when the next week's workbooks arrive.** It diffs his answer key against ours,
  lists every card whose picks or tiebreaker changed since we parsed it (his keying fixes, usually
  one or two), and compares his per-card totals to ours. It only reports; if his corrections should
  be the record, re-run `parse_pool_picks.py` for that week and grade again.
- **Mike's graded suicide sheet is laid out differently, and it cannot be re-parsed.** Each week's
  eliminated entries get a red fill (`FFFF0000`) on that week's pick cell, move to the top of the
  sheet, and are **renumbered 1..N in column A**, so their numbers collide with entries still
  alive (Week 1 of 2026: 87 renumbered, 62 numbers duplicated). He also keys corrections into it
  (Week 1: Gbaby LAC→DET, AllieGator LAC→JAC, Momoneymac CHI→LAC, nickname AP8→AR8). So:
  - `--check-suicide` pairs his rows with ours by **(nickname, real name)**, never by entry
    number, allowing for one person holding several entries under the same pair (Danny Diamonds).
    A retyped nickname is paired on a unique real name or pick history and reported as `renamed`.
    It then compares his red cells with the losers we graded, for final weeks only, and prints
    `agree` / `DISAGREE`, or "marked partway" when his red cells are a subset of ours: he marks
    Thursday losers before mailing the pre-results sheet (Rackley 2, Rams, Week 1).
  - **`parse_survivor.py` refuses any sheet with duplicate entry numbers** and exits non-zero
    without writing. That refusal is only half an answer, so **`scripts/merge_survivor_week.py`
    is the other half** (added 2026-09-20): it folds the graded sheet's new week, and any
    corrections in it, into the existing `data/survivor-<year>.json`, pairing rows by person and
    keeping **our** entry numbers. Then re-run `grade_week.py`.

    ```bash
    python scripts/merge_survivor_week.py "Suicide 26.xlsx" 2026 --dry-run   # report only
    python scripts/merge_survivor_week.py "Suicide 26.xlsx" 2026
    python scripts/grade_week.py 2026 --check-suicide "Suicide 26.xlsx"      # confirm agreement
    ```

    Three rules in it, each the reason it is a script rather than a hand edit:
    **(a) it shares one pairing with the check** — `pair_suicide_rows()` was moved out of
    `grade_week.check_survivor()` rather than copied, because two pairings are two chances to
    pair a row differently and this is the one that *writes*;
    **(b) an unpaired row on either side is a refusal, not a guess** — an entry added or dropped
    mid-season gets looked at by hand;
    **(c) a pick we hold and his sheet does not is never cleared** — he hides eliminated entries'
    later cells, and a blank is not a retraction.
- **A tied game credits nobody — confirmed from Mike's sheet, Week 5 2026.** Giants 22, Commanders
  22: his answer key left that game blank, and all 281 of his card totals matched ours scored that
  way. `grade_week.py` still prints a `TIE` line so a tied week is visible, but it is not a question
  any more. (The suicide-pool rule for a tie is still not on record.)
- **Suicide results record losses, never eliminations.** Buy-backs cannot be read from any feed.
- A week with games still to play is written `"complete": false` with no ranking.

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
