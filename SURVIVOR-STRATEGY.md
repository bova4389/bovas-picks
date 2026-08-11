# SURVIVOR-STRATEGY.md — Survivor / Suicide Pool Philosophy

Companion to `STRATEGY.md` (the straight-up pickem pool). Different game, different math,
deliberately a separate document.

The pickem pool asks *"how many can I get right?"* Survivor asks *"which single team can I spend
this week, given I can never spend it again?"* Almost nothing transfers between them.

---

## The Three Pools

| | **Mike's pool** | **Yahoo pool** | **Sleeper pool** |
|---|---|---|---|
| Entries | **235** (2025 Wk 1) | 15–20 | 15–20 |
| Lives | **1 — one loss and out** | 3 (2 buy-backs) | 3 (2 buy-backs) |
| Submission | Same email as the pickem | In-app | In-app |
| Field data | Full weekly spreadsheet | Screenshots | Screenshots |
| Strategy driver | **Leverage + future value** | **Survival + future value** | same |

**These three require different play, and the difference is not a matter of taste.** A pick that
is correct in the Yahoo pool can be actively wrong in Mike's on the same Sunday. Do not submit one
set of picks across all three.

---

## 1. The Core Math

### Expected value, and why win probability alone is the wrong target

The naive play is "pick whoever is most likely to win." That is wrong for a reason worth
internalising: **you don't win a survivor pool by surviving. You win it by surviving weeks that
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

A 92% favourite is a *bad* pick if that team is also the only credible option in Week 11 when the
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
- **No late-information edge in this pool.** Picks share the pickem's Saturday deadline — same as
  the straight-up pool, locked before Sunday inactives post. Price a questionable-tag game as a
  coin-flip per STRATEGY.md's Saturday-deadline caveat; don't plan around information that won't
  exist yet.

### Yahoo and Sleeper pools — 15–20 entries, three lives

Genuinely different, in two ways that pull in opposite directions.

**Ignore pick popularity almost entirely.** With 15–20 entries, the leverage term barely moves —
there simply aren't enough rivals for a fade to buy anything. **Play close to pure win
probability, filtered by future value.** Chasing contrarian value in a 15-person pool is a pure
cost.

**But do not treat these as short pools.** The standard advice — small pools end early, so ignore
future value — assumes one life each. With 2 buy-backs across ~18 entries, the pool holds roughly
**50 lives**, so it will very likely run deep into the season. **Future value matters as much here
as in Mike's pool, possibly more.**

**Lock timing may differ from Mike's pool — confirm before relying on it.** In-app survivor
platforms commonly lock each pick at that game's own kickoff rather than one shared weekly
deadline, which would open a real edge Mike's pool doesn't have: parking a pick in the early
window to lock in value, or holding a decision until Sunday morning for injury/inactive news on a
later game. Do not assume this is available — verify the app's actual lock behavior first (see §7).

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

The aggressive line is only correct if you are genuinely willing to spend the buy-back fees. That
depends on the entry fee and pot size in each pool — **numbers still needed** (see §6).

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

**Sportsbooks only post lines about 10–12 days out.** Lookahead lines cover roughly *next* week,
get pulled during the current week, and repost Sunday evening. **There is no market price for Week
11 in Week 4, anywhere, at any price.** Anything you see for distant weeks on any site is a model
projection derived from power ratings or preseason win totals. That does not make it useless — it
makes it a projection, and it must be labelled as one.

**Free, and closest to what you asked for:**

- **RotoWire Survivor Grid** — all 32 teams × all 18 weeks, showing win probability and an EV that
  nets out future opportunity cost. Week 1 uses posted spreads; **Weeks 2–18 are projected from
  Vegas season win totals with home field +2**, refreshed weekly as real lines appear. Marks each
  team's single best matchup of the season with a star, and has a pool-size selector. This is the
  best free version of "look a little into the future for favourable spots."
- **SurvivorGrid.com** — win %, **pick %**, and EV. Win probability from consensus money lines via
  SportsCrunch; pick percentages aggregated from Yahoo and OFP. Carries a future-value rating
  across remaining games. Updates Tuesdays. The pick-percentage data is the part we cannot generate
  ourselves for the Yahoo and Sleeper pools.

**Paid, best documented record:**

- **PoolGenius / TeamRankings** — the only survivor product with a published multi-year record;
  they report winning up to **7.7× expected** in large survivor contests. Given Mike's pool size,
  this is the one paid tool plausibly worth the fee.

**For our own tool:** future weeks come from power ratings (nfelo) projected across the schedule,
stored separately from market-derived numbers and always displayed as projections. Current and
next week come from the de-vigged moneyline. Two sources, two trust levels, never blended silently.

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

- **Entry fee and pot size for the Yahoo and Sleeper pools**, plus the exact buy-back cost. The
  aggressive-vs-conservative decision in §2 cannot be settled without them.
- **Buy-back cutoff week** in each pool — many pools close buy-backs around Week 4, which sharply
  changes how long the aggressive line stays available.
- **Does Mike's pool allow team reuse after a certain point?** Some large pools reset in the back
  half. Confirm before planning an elite budget around 18 weeks.
- **Exact pick-lock mechanism for Yahoo and Sleeper** — per-game kickoff (opens the late-window
  play described in §2) or one shared weekly cutoff like Mike's pool. This determines whether the
  Saturday-deadline constraint applies there too.
- **Tie/rollover rules** — what happens if everyone remaining loses in the same week, and whether
  the pot splits or rolls.
- Weekly Yahoo/Sleeper screenshots, to see whether those small fields concentrate the way Mike's
  does.

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
