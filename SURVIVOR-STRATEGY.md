# SURVIVOR-STRATEGY.md — Survivor / Suicide Pool Philosophy

Companion to `STRATEGY.md` (the straight-up pickem pool). Different game, different math,
deliberately a separate document.

The pickem pool asks *"how many can I get right?"* Survivor asks *"which single team can I spend
this week, given I can never spend it again?"* Almost nothing transfers between them.

---

## The Four Pools

**All four exist and all four are in the Grid tab's dropdown.** Pools are added to
`js/survivorLeagues.js` as they are created — a listed pool nobody has entered is a dead dropdown
option that invites picks being logged against a pool that cannot receive them. The Yahoo pool
this document once analyzed was never created and was removed 2026-08-14; Deadpool and East
Orange Squeeze were added 2026-09-01 and are real.

| | **Mike's Suicide League** | **Poop 2026** | **Deadpool** | **East Orange Squeeze** |
|---|---|---|---|---|
| Entries | **235** (2025 Wk 1) | **18** | **1 so far** | **8 so far** |
| Lives | **1 — one loss and out** | 3 (2 buy-backs) | 3 (2 buy-backs) | 3 (2 buy-backs) |
| Submission | Same email as the pickem, **as a team name** | In-app | In-app | In-app |
| Deadline | **Midnight Sat** (6pm before a Wed/Thu game) | In-app | In-app | In-app |
| Entry / buy-back | — (one life) | $30–50 / $15–25 | **$30 / $15** | **$25 / $15** |
| Pot played for | all | all | all | **half — the rest to charity** |
| Field data | Full weekly spreadsheet | **Live from Sleeper** | **Live from Sleeper** | **Live from Sleeper** |
| Strategy driver | **Leverage + future value** | Survival + future value | same | **see the half-pot note** |

**Deadpool and Poop are the two played hardest**, and they are the same game at different sizes.
East Orange is a charity pool and is the odd one out on economics, below. Entry counts are
snapshots — the live pools report their real size on every refresh, and Deadpool had only my
entry in it the day it was added.

### East Orange's half pot changes its buy-back maths, and not by a little

§2 "Settled: play the aggressive line" rests on a buy-back costing **~2% of the pot**, which makes
aggression a rounding error. That arithmetic does not survive contact with a pool that only plays
for half its money.

At 8 entries and $25 in, the pot is ~$200 and **~$100 of it is actually winnable**. A $15
buy-back is therefore **~15% of the playable pot** — not 2%. It is roughly *seven times* more
expensive in real terms than the same buy-back in Deadpool, and it is 60% of a fresh entry rather
than the "half an entry" the aggressive case assumes.

**So play East Orange straighter than the other two.** Not conservatively for its own sake, but
because the specific thing aggression buys — cheap extra attempts — is not cheap here. Hoarding
elite teams still survives (that part never depended on the fee); treating elimination as a
low-cost reset does not. If the pool fills out to 15–20 entries the ratio improves and this note
should be recomputed rather than trusted.

**`num_revives_allowed` from Sleeper is wrong in three different directions and gates nothing.**
Poop reports 0, Deadpool reports 2, East Orange reports 10; the commissioners run re-entry by hand
outside the app, so the field describes Sleeper's own bookkeeping rather than the pool's rules.
The numbers in the table above are the commissioners', which is the only authority. Do not "fix"
this document from the API, and do not let the API value gate any buy-back feature. Corollary —
`metadata.is_eliminated` is Sleeper's opinion too.

**Other entrants' picks are withheld until their game kicks off, by us.** Sleeper's API will hand
them over weeks early; the app's own UI will not, and the pools play by the UI's rule. The tool
enforces that rule rather than taking the edge — see "The kickoff gate" in `CLAUDE.md`, which now
lives in `js/sleeperApi.js` and is shared by every pool the site reads, survivor and pick'em
alike. A mid-week read is therefore partial by design, and the pool data row says how partial.

**These pools require different play, and the difference is not a matter of taste.** A pick that
is correct in a three-life pool can be actively wrong in Mike's on the same Sunday. Do not submit
one set of picks across all four.

**Infinity War is not in this document.** It is a season-long pick'em — eight games a week,
straight up, no elimination — so none of the survivor maths below applies to it. Its own analysis
lives in the Infinity War section of `CLAUDE.md` and in `js/infinityModel.js`.

---

## 1. The Core Math

### Expected value, and why win probability alone is the wrong target

The naive play is "pick whoever is most likely to win." That is wrong for a reason worth
internalizing: **you don't win a survivor pool by surviving. You win it by surviving weeks that
other people don't.**

If 34% of the pool picks the same team you do, then in the world where that team wins, 34% of the
pool advances alongside you and you have gained nothing on them. Your equity only improves when
rivals are eliminated.

The working approximation:

```
             w(T)
EV(T)  ≈  ─────────────────────────
          p(T)  +  Σ  p(i) · w(i)
                  i≠T
```

- `w(T)` — your team's win probability, from the **de-vigged moneyline**
- `p(T)` — the share of the field picking that team
- The denominator is the fraction of the field expected to survive **given your team wins**:
  everyone on your team advances, plus everyone else who happens to win

Read as a multiplier: **1.00 is neutral**, above 1.00 improves your position, below 1.00 destroys
it. The published tools (SurvivorGrid, PoolGenius, RotoWire) compute this by simulation rather
than closed form; treat the formula above as the intuition, not as their exact output.

### The result that actually matters

Work the formula against Mike's real Week 1 field and a genuinely important asymmetry appears:

| Your pick | Win prob | Pick share | Rough EV |
|---|---|---|---|
| The chalk (DEN-style) | 85% | 34% | ~1.02 |
| Slight fade | 82% | 3% | ~1.03 |
| Bigger fade | 78% | 2% | ~0.99 |

*(Win probabilities illustrative — the shape is what counts, not the decimals.)*

**Giving up ~3 points of win probability to shed ~30 points of popularity is clearly good. Giving
up ~7 points is already a losing trade.** That is the opposite of the pickem pool, where a dog
pick costs ~0.16 of a win and buys a full point of separation cheaply. Here a loss is terminal, so
the win-probability term dominates and contrarianism has a **narrow** profitable band.

**Rule: never sacrifice more than ~4–5 points of win probability for popularity, and never pick a
team below ~70% to win.** Cute survivor picks are how people go out in Week 3.

### Future value — the constraint that makes this a planning problem

Each team can be used once. So the real question is never "who wins this week" but "**is this the
best week I will ever get to spend this team?**"

A 92% favorite is a *bad* pick if that team is also the only credible option in Week 11 when the
slate is thin. Spending it now means arriving at Week 11 with nothing. RotoWire's grid frames this
well by starring each team's single best matchup of the season — the discipline is to **spend
teams at or near their best spot, not before it.**

Three practical consequences:

1. **Look 3–4 weeks ahead every single week.** Not the whole season — projections that far out are
   too noisy — but far enough to see a wall coming.
2. **Bye weeks silently remove options.** Six teams gone in a bye-heavy week can turn a comfortable
   slate into a forced bad pick. Check the bye schedule when planning, not on Saturday.
3. **The elite teams are a budget, not a menu.** There are only so many 85%+ spots in a season.
   Map them before Week 1.

---

## 2. Pool-Specific Playbooks

### Mike's pool — 235 entries, one life

The pool will run deep. With 235 entries, expect it to reach Week 10+ before it resolves, so
**future value is a first-class concern from Week 1**.

- **Leverage matters here, and only here.** With 235 rivals you need weeks where the field takes
  losses. The measured field is brutally concentrated (below), which is exactly the condition that
  makes a modest fade profitable.
- **Target the profitable band:** a team within ~3–4 points of the week's best win probability, at
  a materially lower pick share. Do not reach further than that.
- **Never take the top pick when it is over ~30% of the field and a near-equal alternative exists
  under 10%.** That is the single most repeatable edge in this pool.
- **Do not fade for the sake of fading.** If the chalk is 92% and the next option is 78%, take the
  chalk. The formula says so and so does common sense.
- **No late-information edge in this pool. CONFIRMED 2026-09-01.** Picks share the pickem's
  deadline — **midnight Saturday**, locked before Sunday inactives post. Price a questionable-tag
  game as a coin-flip per STRATEGY.md's Saturday-deadline caveat; don't plan around information
  that won't exist yet.
- **A Wednesday or Thursday team is legal here, and costs information. CONFIRMED 2026-09-01.**
  Unlike the pickem — where those games are unnumbered and excluded outright — the suicide pool
  accepts them, but the pick **must be in by 6pm before that game**, two to three days ahead of the
  Saturday deadline. A Thursday pick is therefore not free: it buys nothing and spends the rest of
  the week's injury news. Take one only when the spot is clearly better than anything Sunday
  offers, never when it is merely equal.
- **The pick is submitted as a team name, never a sheet number** — *"do not give me a number off
  the sheets, just a City or team name."* The numbers belong to the pickem pool alone. Both pools
  go out in one email; the format is in CLAUDE.md's Submission Format section.

### The three app pools — Poop, Deadpool, East Orange — 8–20 entries, three lives

Genuinely different, in two ways that pull in opposite directions.

**Ignore pick popularity almost entirely.** With 15–20 entries, the leverage term barely moves —
there simply aren't enough rivals for a fade to buy anything. **Play close to pure win
probability, filtered by future value.** Chasing contrarian value in a 15-person pool is a pure
cost.

**But do not treat these as short pools.** The standard advice — small pools end early, so ignore
future value — assumes one life each. With 2 buy-backs across ~18 entries, the pool holds roughly
**50 lives**, so it will very likely run deep into the season. **Future value matters as much here
as in Mike's pool, possibly more.**

**Lock timing may differ from Mike's pool — low priority, not worth chasing.** In-app survivor
platforms commonly lock each pick at that game's own kickoff rather than one shared weekly
deadline, which in principle opens a late-window play: parking a pick early to lock in value, or
holding a decision until Sunday morning for injury/inactive news on a later game. This is solo
analysis with no rival watching the clock, so there's no competitive pressure making that edge
worth engineering the process around — note it in §7 if the actual lock behavior comes up
naturally, don't go verify it as a task.

### The buy-back decision, stated plainly

Buy-backs change the shape of the problem: elimination is no longer terminal, it is priced. That
supports one of two coherent strategies, and the failure mode is drifting between them.

| | **Aggressive** | **Conservative** |
|---|---|---|
| Early weeks | Spend risky/mid-tier teams, **hoard the elite** | Spend whatever wins now |
| If eliminated | Buy back, now holding elite teams nobody else has | Don't buy back; walk away |
| Ends up | Higher chance to win outright, higher expected spend | Lower cost, lower ceiling |

**Pick one before Week 1 and write it down.** The expensive mistake is playing aggressive, losing,
and then declining to buy back — you paid the cost of the strategy and refused its payoff.

### Settled: play the aggressive line in Poop and Deadpool

**This settles Poop and Deadpool. East Orange is excluded** — its half pot makes a buy-back
~15% of the winnable money rather than 2%, which is the one thing this argument rests on. See
"East Orange's half pot" above.

The fees make this one-sided. Entry is **$30–50**, a buy-back is **$15–25** — roughly *half* an
entry. Run it at midpoints with ~18 entrants:

| | |
|---|---|
| Base pot | 18 × $40 ≈ **$720** |
| Buy-back revenue (cheap fee → many take it) | ~$300 |
| Realistic pot | **~$1,000** |
| Our maximum possible spend (entry + 2 buy-backs) | **$80** |

**A buy-back costs ~2% of the pot. Burning both costs ~5%.** Aggression is priced as a rounding
error, and it buys something real: arriving at Week 6 holding elite teams that everyone else has
already spent.

The expected-cost side is smaller still. Suppose aggression raises the chance of an early
elimination from ~10% to ~30% — that is only `0.20 × $20 ≈ $4` of extra expected spend. Against a
~$1,000 pot, moving win probability by even one percentage point is worth $10. **The trade clears
by a wide margin.** Play aggressive in Poop and Deadpool, and commit to actually
buying back — that commitment is the strategy, not an afterthought.

### The buy-back rules — CONFIRMED 2026-08-28, no longer open

Both open questions were answered by the commissioner's own account of the pool, 2026-08-28.
They are recorded as facts, not inferences, and neither should be re-derived from Sleeper's
settings — see the contradiction note at the end.

- **A buy-back does NOT reset the used-teams list. Confirmed.** A team you have picked is spent
  permanently, *whether it won or lost for you.* Re-entering does not hand back the teams that
  eliminated you.

  **This is the single most consequential fact in this document, and it reverses part of the
  case above.** The aggressive line was argued partly on "re-enter holding elite teams nobody
  else has" — that payoff does not exist here. Burning mid-tier teams early and losing means
  re-entering with those teams *already gone* and the elite ones still unspent, which is simply
  a shorter run at the same schedule. Aggression is still cheap (a buy-back is ~2% of the pot),
  but it now buys only extra attempts, not a stronger board. **Hoarding the elite teams is the
  part that survives; treating elimination as a cheap reset is the part that does not.**

  It also makes the Planning tab's elite budget strictly more important, not less: with no reset,
  the used-teams list is monotonic for the whole season across every life you buy.

- **Buy-backs do not close on a cutoff WEEK. The deadline is weekly.** Re-entry closes just
  before the Sunday 1:00 PM ET kickoffs of the week being bought into. So the earlier worry —
  "aggression is only correct inside the window, and reckless after it" — does not apply: there
  is no window to fall out of. The correct read is the opposite one, that a buy-back is available
  all season at the same price, which is what keeps these pools running long.

- **Most of the field buys back twice; a few lose and walk.** Observed, not modeled. This
  confirms the second-order effect predicted above — the pools run long — and it means the
  surviving field late in the season is *not* thinned the way a one-life pool's is. Scarcity
  numbers should be read with that in mind.

- **Buy-back state is tracked by hand, and cannot be read from any feed.** There is no
  elimination or re-entry flag to fetch: the only signal that someone bought back is that they
  keep submitting picks. Any tooling here must therefore be **manual entry with an override**,
  never an inference — a derived "they must be out" that is wrong once is worse than no number,
  because it silently understates the field for the rest of the season.

**Sleeper's `num_revives_allowed: 0` remains contradicted and remains unresolved.** The pool
plainly runs buy-backs, so that setting describes Sleeper's own bookkeeping rather than the
pool's rules — the commissioner administers re-entry outside the app. Do not "fix" this
document from the API, and do not let the API value gate any buy-back feature.

---

## 3. What Mike's Field Actually Does — 2025 Week 1, 235 entries

| Team | Picks | Share | Cumulative |
|---|---|---|---|
| DEN | 79 | **33.6%** | 33.6% |
| WAS | 39 | 16.6% | 50.2% |
| ARI | 37 | 15.7% | 66.0% |
| PHI | 31 | 13.2% | 79.1% |
| CIN | 15 | 6.4% | **85.5%** |
| PIT | 9 | 3.8% | 89.4% |
| JAC | 5 | 2.1% | 91.5% |
| 13 others | 20 | 8.5% | 100% |

**Five teams absorbed 85.5% of the pool. One team took a third of it.**

This is the single most useful fact about this pool, and it cuts both ways:

- **The danger:** on any week you are on the top pick, you are sharing survival with a third of the
  field. Winning gains you almost nothing.
- **The opportunity:** if DEN had lost, **79 entries die at once** and everyone else's equity
  roughly triples overnight. Those are the weeks the pool is actually won.

Only 20 distinct teams were used in a week with 16 games — the field ignores over a third of the
board. That is where a defensible fade lives, provided it clears the ~70% floor.

---

## 4. Where To Get Future-Week Odds

The explicit requirement — and there is one hard limit to state first.

**Corrected 2026-08-11 against a real snapshot.** An earlier draft of this file said flatly that
books never price beyond ~10–12 days. That is right *during* the season and wrong in the
preseason. The live feed returned **all 272 games of 2026** — but the depth tells the real story:

| | Week 1 | Weeks 2–18 |
|---|---|---|
| Bookmakers quoting | **8.5 average** | **~1.0–1.3** |
| What that is | a consensus market | one shop's early number |

So the whole season is nominally priced right now, but everything past the current week is a
single book's speculative line that will move a lot. Once the season starts, books pull distant
weeks entirely and only ~10–12 days stay posted. Either way there is a stretch of schedule the
market does not price *meaningfully*.

**`bookmakerCount` in our odds snapshot is the trust signal — read it before trusting a number.**
8+ books is a market. 1 book is an opinion. Treat a 1-book line as better than our projection but
far softer than a Week 1 consensus price.

Even thin, the market discriminates better than our compressed projections:

| Across the 2026 season | Market feed | Our projections |
|---|---|---|
| Highest win probability | **85%** | 75% |
| Games at ≥80% | **10** | 0 |
| Games at ≥70% | **58** | 16 |

Which is the practical answer to §1's 70% floor: **the floor is workable against market odds even
this early** — 58 games clear it — and remains unusable against projections.

**Free, and closest to what you asked for:**

- **RotoWire Survivor Grid** — all 32 teams × all 18 weeks, showing win probability and an EV that
  nets out future opportunity cost. Week 1 uses posted spreads; **Weeks 2–18 are projected from
  Vegas season win totals with home field +2**, refreshed weekly as real lines appear. Marks each
  team's single best matchup of the season with a star, and has a pool-size selector. This is the
  best free version of "look a little into the future for favourable spots."
- **SurvivorGrid.com** — win %, **pick %**, and EV. Win probability from consensus money lines via
  SportsCrunch; pick percentages aggregated from Yahoo and OFP. Carries a future-value rating
  across remaining games. Updates Tuesdays. The pick-percentage data is the part we cannot generate
  ourselves for the app pools — though as of 2026-09-01 we can, for all three of them, straight
  from Sleeper. See the pool table above.

**Paid, best documented record:**

- **PoolGenius / TeamRankings** — the only survivor product with a published multi-year record;
  they report winning up to **7.7× expected** in large survivor contests. Given Mike's pool size,
  this is the one paid tool plausibly worth the fee.

**Built in-house** — `scripts/fetch_schedule.py` (full season from ESPN) plus
`scripts/build_projections.py` (power ratings → projected win probability for every unplayed game,
including a per-team "best remaining week"). Constants were grid-searched on 2021–24 and checked
against 2025 as a held-out season. Two sources, two trust levels, never blended silently: market
odds for this week and next, projections beyond, always labeled.

**Measured performance** (`python scripts/build_projections.py 2025 --backtest`):

| | 2021–24 | 2025 |
|---|---|---|
| Model, straight up | **~65%** | ~55% |
| "Better record wins" control | ~62% | ~59% |
| Always pick home | ~55% | ~51% |

Scored across **8 completed seasons** (2017–19, 2021–25; 2020 excluded, since empty stadiums
distort home field) at two holdout points each — 16 cells:

| Straight-up accuracy | Mean of 16 cells | Best cell | 2025 |
|---|---|---|---|
| **Model** | **63.6%** | 73.1% | 52–58% |
| "Better record wins" control | 62.3% | 76.3% | 57–62% |
| Always pick home | 56.1% | 63.8% | 51% |

Brier **0.2247** against 0.25 for a coin flip. The model beats the naive record control in **9 of
16 cells** — a modest edge — but it also produces *calibrated probabilities*, which a record
comparison cannot, and probabilities are exactly what the EV formula in §1 consumes.

Seven of the eight seasons land in the low-to-mid 60s. **2025 is the lone collapse**, and the
model, the control, and the home baseline all fell together that year — an unusually unpredictable
season rather than a parameter problem. Re-run the backtest once 2026 has ~12 weeks in it.

### The compression limit — the rule that matters most here

Regressing last season toward the mean is correct for accuracy, but it flattens the probability
spread hard. Measured for 2026:

- 2025 final ratings spanned **19.7 points**; after carryover, **7.9 points**
- Highest projected win probability anywhere: **75%**
- Games at 80%+: **0 of 272.** Games at 70%+: **16 of 272**

**So the ~70% floor in §1 applies to market odds only — never to a projection.** Filtering
projections against it would reject the entire season. Two consequences:

1. **Weeks 1–2: use the market.** It has priced the whole slate, and that is exactly when the
   projections are weakest.
2. **Use projections for ordering, not levels.** Compression hits every game about equally, so
   "is Week 9 a better Seattle spot than Week 6" still answers correctly even though both numbers
   read low. That ordering *is* the elite-team budget — which is what we needed future weeks for.

Projections sharpen from around Week 4 as real results displace the carried-over prior.

**RotoWire remains the cross-check**, as intended. If our ordering of a team's best weeks diverges
sharply from theirs, treat it as a bug signal rather than an edge.

---

## 5. Source Guardrails

Same rules as `STRATEGY.md` §3 — proven, independently tracked sources only. Specifically:

**Use:** de-vigged moneylines (current + lookahead), nfelo, RotoWire grid, SurvivorGrid,
PoolGenius, official injury reports, the bye schedule.

**Banned, same as the pickem doc:** touts and pick-sellers, social/Reddit consensus, situational
"trend" stats, revenge-game and letdown narratives, preseason results as in-season inputs, and
rest/bye-week advantage (the bye edge collapsed to statistical insignificance after the 2011 CBA
cut practice time).

**One survivor-specific ban: never pick a team because you "have to use them eventually."** That is
sunk-cost reasoning. If a team's best remaining spot is bad, the correct move is to accept you will
never use them, not to spend a week proving it.

---

## 6. Weekly Process

1. **De-vig the moneylines** for every game. Anything under ~70% is not a candidate, full stop.
2. **Cross off used teams** — per pool, since the three pools diverge immediately.
3. **Look 3–4 weeks ahead.** For each candidate, ask whether this is at or near their best
   remaining spot. Check byes in that window.
4. **Add pick popularity — Mike's pool only.** From the weekly spreadsheet (lagged one week) and
   SurvivorGrid's national numbers as a proxy for the current week.
5. **Apply the band.** Best available win probability, minus at most 4–5 points, at the lowest
   pick share available in that band.
6. **Sanity check the elite budget.** If this pick spends a team whose starred week is still ahead,
   require a specific reason to do it anyway.
7. **Log it** — pick, win probability, pick share, which teams remain, and the reason. Same
   accountability discipline as the pickem pool.

---

## 7. Still Needed

- **Does a buy-back reset the used-teams list, or is it just an extra life?** The highest-value
  unknown in either pool — it is the difference between "aggressive is good" and "aggressive is
  overwhelmingly good." Check the league settings before Week 1.
- **Buy-back cutoff week** in each pool — many close around Week 4. Aggression is correct *inside*
  that window and reckless outside it, so this sets the expiry date on the §2 recommendation.
- ~~Entry fee and pot size~~ — **answered 2026-08-11:** $30–50 entry, $15–25 buy-backs. The
  aggressive line is settled; see §2.
- **Does Mike's pool allow team reuse after a certain point?** Some large pools reset in the back
  half. Confirm before planning an elite budget around 18 weeks.
- *(Low priority)* **Exact pick-lock mechanism for the app pools** — per-game kickoff or one
  shared weekly cutoff like Mike's pool. Would matter for a competitive edge; doesn't for solo
  analysis with no rival racing the deadline, so no need to go confirm this deliberately.
- **Tie/rollover rules** — what happens if everyone remaining loses in the same week, and whether
  the pot splits or rolls.

**Not needed: field history for the app pools.** All three are brand-new leagues with no past
seasons, so there is nothing to look back at. This costs us essentially nothing, because §2 already
concludes that pick popularity is not worth acting on at 15–20 entries — the leverage term is too
small to pay for any win probability given up. The strategy for those pools was never going to
consume field data.

Two things follow from them being new, though, and both point the same way:

- **Assume a casual field.** A first-year league of friends has no selection for sophistication.
  Expect heavy chalk and little future-value planning from opponents — which is an argument for
  disciplined team-budgeting on our side, not for fancy picks.
- **History accrues from Week 1.** Each week's results are worth capturing as they happen, if only
  to confirm the "small fields don't concentrate enough to matter" assumption rather than trusting
  it indefinitely. Low effort, low urgency — nothing depends on it.

---

## Sources

- [Survivor Pool Strategy Guide — PoolGenius](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/survivor-strategy-guide-how-to-win-nfl-survivor-pools-knockout-pools/)
- [Expected Value & Why It Matters For Survivor Picks — PoolGenius](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/expected-value-survivor-pool-picks/)
- [Are You Playing the Right Survivor Strategy for Your Pool Size? — PoolGenius](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/why-pool-size-should-influence-nfl-survivor-picks/)
- [How Survivor Pool Rules Affect Pick Strategy (buy-backs, strikes) — PoolGenius](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/how-survivor-pool-rules-affect-pick-strategy/)
- [Circa Survivor Strategy: EV and Future Value — PoolGenius](https://poolgenius.teamrankings.com/circa-survivor-picks/articles/circa-survivor-strategy-core-concepts/)
- [NFL Survivor Pool Strategy 101 — Survivor Grid](https://www.survivorgrid.com/strategy)
- [Survivor Grid FAQ (data sources, update schedule)](https://www.survivorgrid.com/faq)
- [NFL Survivor Pool Picks: Grid, Odds & Strategy — RotoWire](https://www.rotowire.com/football/article/nfl-survivor-pool-picks-2026-grid-odds-strategy-126290)
- [How NFL Survivor Pools Work: Rules & Formats — PoolGenius](https://poolgenius.teamrankings.com/nfl-survivor-pool-picks/articles/how-nfl-survivor-pools-work-rules-formats-tips/)
- [Bye-Bye, Bye Advantage: rest differential in the NFL — Frontiers](https://www.frontiersin.org/journals/behavioral-economics/articles/10.3389/frbhe.2024.1479832/full)
