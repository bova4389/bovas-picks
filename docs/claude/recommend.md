# Recommend Tab — Bova's Picks reference

Moved verbatim out of `CLAUDE.md` on 2026-11-11 so it loads only when needed. "Below" and "above" in this file can point to a section that now lives in another `docs/claude/` file; grep the folder for the heading.

## Recommend Tab — Read Before Changing Any Threshold

`leverage = win_probability ÷ pick_share`, per STRATEGY.md §4. **Every threshold in
`js/recommend.js` is quoted from that document, not tuned here** — 38% floor for a live dog,
40–47% sweet spot, 40% thin-share cutoff, and **3 live dogs + 1 lonely longshot** (25–37% to win,
≤12% of the field on it, never more than one). If one needs to change, change STRATEGY.md first;
the doc is the authority and the tab is its implementation.

**Revised 2026-10-03 from the Weeks 1–3 lookback** (STRATEGY.md, below §4 Step 8). The old rules
were a 15% "never below this share" cutoff and 4–5 dogs. Simulated against the real field cards,
the revised rule averaged ~0.96% a week to win against 0.83% for the old rules and 0.60% for the
cards we actually sent; every best-possible card held a 25–37% dog with 2–5% of the pool on it,
which is exactly what the 15% cutoff forbade. The `longshot` tier is gone; `lonely` replaces it.
**The longshot is the most likely lonely dog, not the highest-leverage one** (fixed 2026-10-06):
leverage on a modeled share always grows as the price falls, so it took the 25–27% dog every
week and all four lost. `markPicks()` and the tier list sort lonely dogs by `dogProb`.
**Line movement was checked and is not a signal** (Weeks 1–4, 59 games): the Saturday price was
as accurate as the closing one, no line moved 3+ points after the Saturday deadline, and the side
a 5+ point move went toward won 4 of 7 against 4.2 expected. Use the Saturday price; do not
add a follow-the-move or fade-the-move rule.
The tab also opens on the current week now (`currentWeek()`), not Week 1.

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

**It self-corrects — through a committed fit, since 2026-10-03.** `calibrate()` reads
`data/popularity/fit-<year>.json` first, written by `python scripts/fit_pick_share.py <year>`
(**run it after every `parse_pool_picks.py`**). The in-browser fit it falls back to pairs each
popularity file with the *current* odds snapshot, and the snapshot drops a game once it is played
— so for every past week it found no prices and the whole season silently ran on k=2.0. The
script prices each game from its last pre-kickoff history snapshot, with the same objective as
`fitK()`. **Measured 2026 Weeks 1–3: k = 2.75 over 44 games** — on a 74% favorite the pool is 95%
chalk, not the 89% k=2 predicts. It runs **once at boot**; measured share always beats modeled
for any week that has a file.

**From Week 2 on, the modeled share is record-aware (2026-10-31).** The field picks the team
with the better record over and above the price, so `fit-<year>.json` also carries a `record`
block: `logit(dog share) = intercept + price·logit(p) + record·(dog win% − fav win%)`, with
win% shrunk by half a game each way. That cut share error from 9.3 to 7.6 points, and raised
the rules' weekly win chance from 0.99% to 1.13% on weeks the curve was not fitted on.
`modeledShare()` in `recommend.js` applies it through `js/recordShare.js`, a new file for the
cached-module reason. It falls back to the k curve when the fit has no `record` block or either
team has not played yet. It models **the field only**; win probability never sees a record.
`scripts/lookback.py` applies the same model, so the Lookback tab grades the rules the site uses.

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
