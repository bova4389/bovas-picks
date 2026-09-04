# STRATEGY.md — Season-Long Straight-Up Pick'em Philosophy

Guardrails and decision rules for the **straight-up season-long pool**. Survivor strategy is a
separate problem with different math — see `SURVIVOR-STRATEGY.md` when written.

This file exists so that every weekly pick is made the same way, from the same sources, for the
same reasons. Consistency is the point. A pick we can't justify from the rules below is a pick
we don't make.

## The Pool

| | |
|---|---|
| Format | Straight up, no point spread |
| Entrants | **268** submitted cards in 2025 Week 1 |
| Games per week | **12–16, mean 13.9** (2025 actual) |
| Excluded | The Thursday game every week (plus the Week 1 Friday game). **Week 13 is the exception** — Thanksgiving Thursday *and* Black Friday games all counted, 16 games, nothing excluded |
| Deadline | End of day **Saturday** — holiday weeks due before Thursday kickoff |
| Submission | Email the **numbers** from the commissioner's weekly sheet. Away = odd, home = even, sequential down the page |
| Weekly prize | **$1,000**, most correct picks, MNF total points as tiebreaker |
| Season prize | **~$5,000–6,000** to the season-long winner(s) |

Both workbooks are parsed into `data/` — see `scripts/parse_weekly_sheets.py` (the number map,
which also validates our outgoing picks) and `scripts/parse_pool_picks.py` (the weekly field
cards). Everything in §3a below is measured from those files, not assumed.

Two structural facts drive everything below:

1. **Weekly money is ~$18,000 across the season; the season prize is ~$5–6k.** Roughly **75% of
   the pot pays out weekly.** The weekly prize is the primary target, not a consolation.
2. **The Saturday deadline means we never see Sunday inactives** (released ~90 minutes before
   kickoff). Every other entrant is equally blind, so this is a constraint, not a disadvantage —
   but it does mean questionable-status players must be handled probabilistically, not waited on.

---

## 1. The Core Finding: Picking Favorites Cannot Win This Pool

This is the single most important conclusion in the document, and it is not intuitive.

NFL favorites win outright about **67%** of the time (2024 was an outlier at 71.7%). So picking
every favorite is by far the highest-*expected-score* strategy. In a 10-person office pool that
would be close to correct.

**In a 250-person pool it wins nothing.** Here is why.

Define **C** = the number of favorites that actually won this week. A pure-chalk entry scores
exactly C, every week, with zero variance relative to the field. But so does everyone else who
picked chalk — and in a 250-entry pool, dozens of people do. Meanwhile, anyone who picked one
underdog that won scores **C+1**.

Let **k** = how many underdogs we pick, and **j** = how many of them win. Our score relative to
chalk is:

```
score = C + 2j − k
```

Each dog pick we get wrong costs 1 versus the chalk field; each one we get right gains 1. With
live underdogs (+1 to +3 on the spread) winning outright roughly **40–45%** of the time, the
expected cost of a single dog pick is only:

```
E[2j − k] per pick = 2(0.42) − 1 = −0.16 wins
```

**A dog pick costs about one-sixth of a win in expectation, and buys a full point of separation
when it hits.** That is extraordinarily cheap leverage.

### What it takes to win a week

Pure chalk scores C. In any week where even one underdog wins — which is nearly every week —
a large number of the other 249 entries will be at C+1 or better. Realistically the weekly
winner sits at **C+2 to C+4**, meaning they hit 2–4 underdogs.

Probability of reaching at least C+3, by number of dogs picked (p = 0.42 each):

| Dogs picked (k) | P(score ≥ C+3) |
|---|---|
| 0 (pure chalk) | **0%** |
| 2 | ~4% |
| 3 | ~7% |
| 5 | ~9% |
| 7 | ~10% |

Note the top row. **A pure-chalk entry has a mathematically zero chance of an outright weekly
win** — it can only tie into the tiebreaker, alongside everyone else who played it safe.

### The season prize does not rescue chalk either

The instinct is "play chalk for the season, since expected score is maximized." That is true and
still loses.

Over ~240 games, a chalk entry lands exactly at the season chalk total. An entry taking ~3 dogs a
week (54 on the season) has an expected score about 9 wins *below* chalk — but with a standard
deviation of roughly ±7. Around 7% of such entries finish above chalk, and with 250 entries in
the pool, the best of them finishes roughly **10–15 wins above chalk**.

Pure chalk therefore finishes somewhere around **15th–20th of 250**. Perfectly respectable. Pays
nothing.

**Conclusion: we take underdogs for both prizes. The only real question is how many.** Given that
weekly money is 3× season money *and* the weekly prize demands more aggression, we lean toward
the aggressive end.

### What this field actually does — measured, 2025 Week 1

The theory above assumed a chalk-heavy field. The real cards say otherwise, and this changes the
recommendation. From 268 entries across 14 games:

| Minority picks on the card | Entries | Share |
|---|---|---|
| 0 (pure chalk) | 8 | **3.0%** |
| 1 | 28 | 10.4% |
| 2 | 69 | 25.7% |
| 3 | 58 | 21.6% |
| 4 | 37 | 13.8% |
| 5 | 34 | 12.7% |
| 6+ | 34 | 12.7% |

**Mean: 3.32 minority picks per entry. Only 3% play pure chalk.** This is not a field of sheep,
and "just be contrarian" is not by itself an edge here — 97% of them are already doing it.

Two further measurements matter more than the count:

**1. The field is heavily concentrated on a handful of games.** Mean majority share was **76.2%**.
Five of fourteen games ran above 85% agreement (Broncos 93%, Commanders 92%, Jaguars 89%, Bengals
87%, Cardinals 87%), while only two games were closer than 60/40. So the *distribution* of
leverage is lumpy: on half the slate there is nothing to buy, and on a few games a correct
minority pick would have leapfrogged 90% of the pool at once.

**2. The field wastes a sixth of its differentiation on hopeless picks.** Of 891 total minority
picks:

| Field concentration on the game | Games | Minority picks spent | Share |
|---|---|---|---|
| 50–60% (coin flip) | 2 | 222 | 24.9% |
| 60–75% (live dog) | 5 | 428 | **48.0%** |
| 75–85% (stretch) | 2 | 101 | 11.3% |
| 85%+ (longshot) | 5 | 140 | **15.7%** |

That bottom row is the opportunity. Roughly 140 picks a week are thrown at teams the field itself
rates at 15% or less — lottery tickets that mostly lose and leave those entrants a game or two
behind before the week starts. **Only 37% of entrants took two or more live dogs while avoiding
every longshot.** That disciplined profile is the one we want, and nearly two thirds of the pool
fails to hold it.

*Caveat: pick share is not win probability.* These bands describe what the field believed, not
what the market priced. The real selection filter is still §4 Step 4 — a de-vigged moneyline
crossed against these percentages. A game at 88% field concentration where the market says the
dog wins 35% of the time is a very different proposition from one where the market agrees with
the crowd, and only the moneyline can tell those apart.

---

## 2. The Philosophy

Five sentences, in priority order.

1. **We are playing a game-theory problem, not a handicapping problem.** The goal is not to
   maximize correct picks. It is to maximize the probability of finishing *first in a given week*.
   Those are different objectives and optimizing the first one guarantees losing the second.
2. **Separation is the product. Accuracy is the raw material.** Every pick is evaluated on two
   axes: how likely the team is to win, and how few other entrants are on it. A pick that is
   right and universal is worth nothing.
3. **The market's no-vig moneyline is our truth for win probability.** We do not out-handicap the
   market. We use its probabilities and apply pool game theory on top of them.
4. **Target the cheap dogs.** Underdogs of roughly +1 to +3 win outright ~40–45% of the time and
   are picked by a fraction of the field. Big dogs (+7 or worse) win ~15–20% of the time and are
   a bad deal at any price. There is a narrow band where the leverage lives.
5. **Consistency beats cleverness.** The same process, all 18 weeks. The variance is brutal by
   design — we will have many weeks finishing mid-pack. That is what the strategy *looks like*
   when it is working correctly.

---

## 3. Source Guardrails (Non-Negotiable)

The requirement: **proven sources with published, verifiable track records.** No random fans, no
Twitter touts, no "lock of the week."

### Tier 1 — Required Inputs

**a) No-vig moneyline win probability.** The single most accurate public forecast of who wins an
NFL game. Convert and de-vig every game:

```
Favorite (−150):  150 / (150 + 100)      = 0.600
Underdog (+130):  100 / (130 + 100)      = 0.435
Sum = 1.035  →  divide each by 1.035
True: favorite 58.0%, underdog 42.0%
```

Never use the raw implied numbers — the vig inflates both sides by 3–5 points and would make
every dog look worse than it is.

**b) Pick popularity.** In a straight-up pool this is **as important as win probability** and is
what most entrants ignore entirely. We need to know what share of the field is on each side.
Sources: PoolGenius (forecasts pick popularity for ESPN/Yahoo-style pools), OfficePoolStop
league-wide trends, ESPN/Yahoo public pick percentages. If our own pool shows pick distribution,
that is better than any national proxy — check whether it does.

### Tier 2 — Models With Public, Independently-Tracked Records

To qualify, a model must publish picks in advance and have accuracy tracked by someone other than
itself. That last clause is the whole guardrail.

- **nfelo** (`nfeloapp.com`) — Elo with QB adjustment and explicit market regression. Publicly
  backtested to 2009, code on GitHub, picks tracked by PredictionTracker, repeatedly top-decile in
  538's pick'em competition. Publishes win probabilities directly, which is exactly our input.
- **PredictionTracker** (`thepredictiontracker.com`) — not a model, the *scoreboard* for models.
  Independently tracks dozens of systems weekly. This is where we verify anyone before trusting
  them.
- **Sagarin Predictor**, **Massey Ratings**, **ESPN FPI**, **Inpredictable** — long-running systems
  with multi-decade public records. Consensus inputs, not standalone authorities.
- **PoolGenius / TeamRankings** (paid) — the only *pool-strategy* product with a published
  multi-year record: subscribers report winning a prize in 56% of pools against a 37% baseline,
  and 3.2× expected in season-long football pools since 2014. Given a $1,000 weekly prize and a
  250-person field, the subscription is likely worth it purely for the pick-popularity forecasts.

### Tier 3 — Underlying Metrics (inputs, never conclusions)

Used to stress-test a disagreement with the market, never to generate a pick alone.

- **EPA/play** — most predictive single public team metric, especially passing EPA. Offensive EPA
  is meaningfully stickier week to week than defensive; weight accordingly.
- **Success rate** — consistency companion to EPA.
- **DVOA** — opponent-adjusted and useful, but proprietary weights, descriptive by design, and very
  noisy before ~Week 6. Never lead with early-season DVOA.
- **nflfastR / Open Source Football** — raw play-by-play if we compute our own numbers.
- **Official injury reports** (Wed/Thu/Fri participation) — see §4 Step 3.

### Banned Outright

Excluded by rule, not by judgment call, because each has a documented history of being noise
dressed as signal:

- ❌ Any tout, capper, or handicapping service selling picks. Records are self-reported and
  unaudited. Zero exceptions.
- ❌ Social media consensus, Reddit threads, YouTube previews, message-board "sharp money" reports.
- ❌ **Situational trend stats** — "Team X is 7-2 SU in road games after a home loss." These are
  filtered post-hoc until a winning record appears. Sample-size rule: <20 games is noise, 20–50
  suggestive at best, 100+ before we would even discuss it. Almost no cited trend clears this.
- ❌ Narrative and motivation angles: revenge games, "must-win," "they're due," letdown and
  lookahead spots. No credible evidence base, and priced in already if they mattered.
- ❌ Preseason results and preseason win totals as in-season inputs.
- ❌ Our own gut feeling about a team, and anything about how we feel about a fanbase.
- ❌ **Rest and bye-week advantage.** Research is clear the bye advantage collapsed from ~2.2 points
  to ~0.31 after the 2011 CBA cut practice time, and is no longer statistically significant. It was
  practice time, not rest. Whatever remains is in the number.

### The Verification Rule

Before any new source enters Tier 2, check it against PredictionTracker or an equivalent
third-party record. If its accuracy is not independently tracked, it does not go in. Write the
check and the date into this file when a source is added.

---

## 4. The Weekly Process

Same order, every week.

**Step 1 — Build the probability table.** For every game on the slate, pull the moneyline, de-vig
it, and record the true win probability for both sides. Cross-check against nfelo's win
probability and 1–2 other Tier 2 models. Where the market and the model consensus disagree
materially, trust the market — but flag the game, because a model-market disagreement on a dog is
the best possible candidate for Step 4.

**Step 2 — Add the popularity column.** For every game, estimate the share of the field on each
side. This is the column that turns a probability table into a strategy.

**Step 3 — Injury adjustment, and essentially only injuries.** The one piece of news that reliably
moves a game and the one place a Saturday deadline can still be exploited:

- **Starting QB out: worth 3–7 points of spread**, more with a weak backup. This dwarfs every
  other factor combined and is the most common source of a genuinely live underdog.
- Competent veteran backup: **2–4 points**.
- Non-QB stars: fractional, and almost always already priced.
- Lines begin shading on Wednesday/Thursday practice reports, before the official "OUT" tag.
- **Saturday-deadline caveat:** any player still listed questionable is a coin flip we must price,
  not wait on. If a game's outcome hinges on a questionable QB, prefer the side that is robust to
  both outcomes, or treat the game as higher variance than the market implies.

**Step 4 — Select the dogs. This is the whole strategy.**

Compute a leverage score for every underdog:

```
leverage = win_probability / estimated_pick_share
```

Rank all underdogs by it. A dog at 42% win probability picked by 20% of the field (leverage 2.1)
is excellent. The same 42% dog picked by 40% of the field (leverage 1.05) is nearly worthless —
we take the hit to our score without buying separation.

**Selection rules:**

- **Hard floor: only pick underdogs at ≥38% true win probability.** Below that, the expected cost
  per pick climbs steeply and the leverage does not compensate. Big dogs are a trap — they feel
  bold and they lose 80%+ of the time.
- **Sweet spot: dogs in the 40–47% band, ideally home dogs of +1 to +3.** Home underdogs win
  outright meaningfully more often than road underdogs.
- **Best of all: a dog whose price is stale for a reason we can name** — the market is still
  adjusting to a QB return, or a Tier 2 model consensus is materially higher on them than the
  market is.
- **Never pick a dog we cannot write a one-line reason for.** Random contrarianism is not the
  strategy; *cheap* contrarianism is.

**Step 5 — Set the dog count for the week.**

Calibrated against the measured field (§1), which averages 3.32 minority picks and only rarely
shows discipline about *which* ones:

| Situation | Dogs to take |
|---|---|
| Default | **4–5** |
| Slate has few live dogs (nothing ≥40% at good leverage) | 3 |
| Slate is loaded with live dogs / many near-coin-flip games | 5–6 |
| Behind in season standings after ~Week 14, season prize unreachable | Ignore season entirely; 5–6 every week |
| Genuinely contending for the season prize late (top 3 of 268) | Drop to 2–3 and protect position |

Four to five puts us around the 75th–87th percentile of contrarianism in this pool — meaningfully
bolder than the median entrant without being reckless.

**But the count is the least important part of this step.** Since the field already averages 3.32,
simply matching or slightly exceeding it buys nothing. **Our edge is composition, not volume:**

- **Zero longshots.** Never take a minority side the field rates below 15%, no matter how tempting
  the story. Roughly 140 such picks are thrown away by this pool every week and we will not be
  among them. This single rule is most of the edge.
- **Concentrate in the 60–85% band**, where the minority side is a genuinely live team and we still
  leapfrog most of the pool when it hits.
- **Coin-flip games (50–60%) are nearly free but buy little separation** — half the field is already
  on our side. Take them when the moneyline likes us; don't count them toward the dog quota.
- **The 85%+ games are where a hit is worth the most and costs the most.** Only go there when the
  de-vigged moneyline materially disagrees with the crowd — i.e. the market says 30%+ while the
  field says 10%. That is a real mispricing. Anything else in that band is a lottery ticket.

**Step 6 — Everything else is chalk.** On every game where we are not deliberately taking a dog,
take the favorite. Do not agonize. Roughly 9–11 of 13 games each week are decided by this rule
and should take about ninety seconds total.

**Step 7 — Set the tiebreaker.** See §5. Do not treat this as an afterthought — it is worth real
money in this pool.

**Step 8 — Log it.** Every pick gets: no-vig win probability, estimated pick share, whether it was
a deliberate dog, and the one-line reason. See §6.

---

## 5. The Monday Night Tiebreaker

**In this pool the tiebreaker is worth serious money.** With only 12–15 games and a field that
picks heavily chalk, scores cluster tightly at the top and ties are frequent. In a 250-person
pool, the MNF total plausibly decides a large share of the eighteen $1,000 payouts. Any week we
finish tied for the lead, this number *is* the $1,000.

**Baseline:** start from the market total for the MNF game. It is the best available estimate and
any deviation costs accuracy.

**Then deviate deliberately** — guided by the actual density, not by folklore. Measured from 267
guesses in 2025 Week 1:

```
 26 #      31 ##     36 #      41 #################   46 ###########   51 ######   56 #
 27 ###    32 #####  37 ##########      42 ##############################   47 ########################
 28 ##     33 #      38 ##############  43 ########################  48 ####################   59 ###
 32-36 sparse        39 ###             44 #############################    49 ######
 29,30 EMPTY         40 #########       45 ##########################       50 ####    52-55 thin
```

- **68% of the entire field guessed between 41 and 48.** That eight-point band is the war zone. A
  guess inside it is very unlikely to win a tie outright.
- **I was wrong to assume round-number clustering** — only 16% picked a multiple of 5, and 50 drew
  just 4 guesses against 30 on 42. Do not waste the deviation avoiding 45 and 50; avoid the *band*.
- **Exploit the holes inside the band.** Density is spiky, not smooth: **46 drew 11 guesses while
  its neighbors 45 and 47 drew 26 and 24**, and 39 drew 3 against 14 on 38. If the honest estimate
  lands mid-band, take the local minimum — same accuracy, a third of the competition.
- **The tails are wide open.** Nothing at all on 29, 30, 57, 58; single digits across 33–36 and
  49–56. If the market total is genuinely low or high, the tails cost little and win outright.
- **Lean under.** The field skews high on primetime: 111 guesses sat above 45, only 47 below 40.
- **Scale the deviation to expected ties.** Tied with one other entry is a coin flip and argues for
  a small nudge; tied with five means a ~17% share and justifies going to the edge of the range.

Re-run this histogram every week from `data/popularity/` — it is cheap, and this field's habits
may shift over a season.

---

## 6. Accountability — How We Know If This Works

Without this section the whole document is unfalsifiable, which is exactly the failure mode we
banned in §3.

Track every week:

- **Raw record**, and **record vs. pure chalk** (the C benchmark). The second number is the real
  one. Expect to trail chalk by ~0.5–1 win per week on average. **That is the strategy working
  as designed, not evidence against it.**
- **Dog pick hit rate.** Our selected dogs should win at or above the ~40–45% base rate. If they
  are hitting at 30% over a real sample, our selection process is worse than random and needs
  rebuilding.
- **Weekly finish position** (e.g. 12th of 250). This is the metric that actually maps to the
  $1,000. Top-5 finishes are the leading indicator of eventual wins.
- **Tiebreaker performance in weeks we were tied for the lead.** Small sample, high value — log
  every instance.
- **Leverage-bucket analysis.** Dogs taken at leverage >2.0 should outperform dogs taken at <1.5.
  If they don't, the popularity estimates are wrong.

**Review thresholds:**

- Do **not** change the process based on any single week. Thirteen games is nothing.
- Expect long stretches with no weekly win. At a realistic ~5% chance per week, going eight weeks
  without cashing is completely ordinary and means nothing.
- Sample floor for any process change: **~50 dog picks** (roughly 10 weeks) before concluding
  anything about selection quality.
- **The one thing that would genuinely falsify the approach:** if our dogs hit at the expected rate
  *and* our leverage estimates are accurate *and* we still never finish top-5 in a week, then the
  field is more contrarian than modeled and the dog count needs to go up.

---

## 7. Remaining Unknowns

Answer these before Week 1:

**Answered:** the pool *does* publish full pick distribution — the commissioner mails every
entrant's card each Sunday. This is the best possible version of that unknown and it is already
wired into `data/popularity/`. The one limitation: it arrives **after** our Saturday deadline, so
each week we are picking against *last* week's measured behavior, not this week's. That is fine —
the field's habits (76% mean concentration, ~3.3 minority picks, the 41–48 tiebreaker band) are
stable tendencies, not week-specific facts. Track them for drift; don't expect precision.

Still open:

- **Are multiple entries allowed?** If so the math changes substantially: multiple entries let us
  run a chalk entry for the season prize *and* an aggressive entry for weekly prizes instead of
  compromising between the two objectives in one submission.
- **Do the excluded Thursday games really never count outside Week 13?** 2025 is one season of
  evidence. Confirm against the 2026 sheet when it arrives rather than assuming.
- **Exact weekly payout structure** — does the $1,000 go entirely to first, or split among a top
  few? A top-3 split meaningfully reduces the optimal dog count, since finishing 2nd–3rd would
  then pay.
- **What happens on ties** — is the MNF tiebreaker winner-take-all, or is the $1,000 split among
  tied entries when the tiebreaker also ties? Determines exactly how much §5 is worth.
- **Season prize structure** — is the ~$5–6k one winner or a top-3 split?

---

## Sources

Straight-up rates, underdogs, and market probability:
- [NFL betting favorites on verge of completing historic season — ESPN](https://www.espn.com/espn/betting/story/_/id/43235257/nfl-betting-favorites-verge-completing-historic-season)
- [NFL Underdog Betting Trends: Straight Up & ATS — Odds Shark](https://www.oddsshark.com/nfl/underdog-nfl-picks-trends)
- [NFL Underdogs Report: ATS & SU Trends — Covers](https://www.covers.com/nfl/underdog-nfl-picks-trends)
- [How to Remove Juice/Vig from Sports Betting Odds — Action Network](https://www.actionnetwork.com/education/remove-juice-vig)

Pool game theory:
- [PoolGenius NFL Pool Strategy Guide 2025 — RotoGrinders](https://rotogrinders.com/articles/poolgenius-nfl-pool-strategy-guide-2025-tips-win-survivor-pickem-pools-4137330)
- [NFL Pick'em Pool Strategy: Four Things You Need To Know — 4for4](https://www.4for4.com/2025/preseason/nfl-pick%E2%80%99em-pool-strategy-four-things-you-need-know-2025)
- [Optimal NFL Pick'Em Pool Strategy — Action Network](https://www.actionnetwork.com/nfl/optimal-nfl-pick-em-pool-strategy-2022)
- [PoolGenius Past Performance](https://poolgenius.teamrankings.com/football-pool-picks/performance/)
- [Strategies for selecting a MNF point total — Footballguys Forums](https://forums.footballguys.com/threads/strategies-for-selecting-a-mnf-point-total-in-pickem-pools.814098/)

Models and verification:
- [About nfelo](https://www.nfeloapp.com/about/)
- [NFL Prediction Tracker Results](https://www.thepredictiontracker.com/nflresults.php)
- [Using Market Regression to Improve Prediction Accuracy in the NFL — nfelo](https://www.nfeloapp.com/analysis/using-market-regression-to-improve-prediction-accuracy-in-the-nfl/)

Factors to ignore, and metrics that matter:
- [Bye-Bye, Bye Advantage: rest differential in the NFL — Frontiers](https://www.frontiersin.org/journals/behavioral-economics/articles/10.3389/frbhe.2024.1479832/full)
- [NFL Schedule Rest Differential Analysis — SumerSports](https://sumersports.com/the-zone/nfl-schedule-rest-differential-analysis/)
- [NFL Betting Trends: Signal or Noise?](https://juicereel.beehiiv.com/p/nfl-betting-trends-signal-or-noise)
- [NFL Advanced Metrics and Stats: DVOA, EPA, CPOE — Covers](https://www.covers.com/nfl/key-advanced-metrics-betting-tips)
- [How much every NFL QB is worth to the spread — ESPN](https://www.espn.com/chalk/story/_/id/28162566/how-much-every-nfl-qb-worth-spread)
