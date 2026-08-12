# DFS-BETTING-ROI.md — Can a DraftKings/FanDuel Operation Actually Return Money?

Research brief for a proposed expansion of Bova's Picks into daily/weekly fantasy and sports
wagering. Commissioned as: *"find the best way to get a steady ROI; your job is to make sure I
don't lose all my money."*

This document is the answer to the first half and the discipline for the second. It is written to
be argued with — every number has a source in §8, and every assumption is a parameter in
`scripts/betting_roi_model.py`, which you can re-run with your own inputs.

**Nothing here is tax or investment advice.** §2 in particular describes positions that a CPA
needs to sign off on before a dollar moves.

---

## 1. The Verdict, Up Front

The research produced one finding large enough that it reorders everything else, so it goes first
rather than at the end of a build plan.

> **For an Indiana resident in 2026, retail sports betting on DraftKings/FanDuel's *sportsbook* is
> structurally unprofitable at almost any realistic skill level — not because you can't beat the
> market, but because you are taxed on gross winnings while your losses are only partially (or not
> at all) deductible. The break-even edge is roughly 4.5%–6.0% ROI on handle. The best documented
> sustained edge among professionals is 3%–7%.**

You would be trying to clear a bar set at the 90th percentile of professional performance just to
reach *zero*. That is not a business; it is a hobby with an unusually good disguise.

The same edge, run through a **net-reporting** vehicle (DFS contests, private pools), keeps most of
its value. Baseline model output — $200k handle, a genuine 3% edge, Marion County rates, one
$199/mo data subscription:

| | Sportsbook (gross reporting) | DFS (net reporting) |
|---|---|---|
| Real profit | $6,000 | $6,000 |
| Income reported to IRS | **$98,095** | **$6,000** |
| Federal tax | $3,346 | $1,320 |
| Indiana tax | $4,875 | $298 |
| Tool cost | $2,388 | $2,388 |
| **Take-home** | **−$4,609** | **+$1,994** |

Identical betting skill. A **$6,603/yr** swing, entirely from which form the operator files.

**So the answer to "which sites, which sports, which pool types" is not the answer you expected.**
The dominant variable is not sport selection or model quality. It is *reporting regime*, and it is
worth more than any handicapping edge you are realistically going to build. Everything in §4 is
ranked by that first and skill second.

**And the single best ROI vehicle in this research is one you already own** — the private pick'em
and survivor pools this repo was built for. See §4.1.

---

## 2. The Tax Wall (read this before anything else)

You were right on both instincts. The details are worse than you guessed.

### 2.1 Federal: the 90% rule is real, and it creates phantom income

The One Big Beautiful Bill Act amended IRC §165(d). For tax years **beginning after December 31,
2025** — i.e. starting with the 2026 return you file in 2027 — the wagering-loss deduction is:

> "equal to **90 percent** of the amount of such losses" and "allowed only to the extent of the
> gains from such transactions."

Two independent limits stack. You may deduct the lesser of (a) 90% of losses, or (b) 100% of gains.
The Joint Committee on Taxation scored it at **+$1.1 billion** of revenue over eight years — that
revenue comes from taxing money bettors never won.

In the baseline model: $98,095 of gains, $92,095 of losses, $6,000 real profit — but $15,210 of
federally taxable gambling income. **$9,210 of phantom income**, taxed at your marginal rate.

**The trap inside the trap:** wagering losses are an *itemized* deduction on Schedule A. If your
itemized deductions don't exceed the standard deduction, **you deduct nothing** and are taxed on
the full $98,095. The model's `--no-itemize` scenario turns a $6,000 profit into a **−$22,844**
year. This is the single most common way recreational bettors get destroyed at tax time, and it
happens to people who *won*.

### 2.2 Indiana: worse, and there is no workaround

Indiana is one of roughly nine states (with CT, IL, KS, LA, NC, OH, RI, VT) that **allow no
deduction for gambling losses at all.** Indiana computes state tax from federal AGI and does not
recognize Schedule A itemized deductions. Gross winnings land in AGI; the offsetting loss deduction
never follows them into the state calculation.

**Indiana taxes your gross winnings. Full stop.**

Rates for 2026 — note the second layer, which people routinely forget:

| Layer | Rate | Note |
|---|---|---|
| Indiana flat state | **2.95%** | 3.05% (2024) → 3.00% (2025) → 2.95% (2026) → 2.90% (2027) |
| County (resident) | **0.50%–3.00%** | Marion County (Indianapolis) is 2.02%. Set by county of residence as of Jan 1 |
| **Combined (Marion)** | **≈4.97%** | Applied to *gross* winnings, not profit |

At Marion County rates, gross winnings of $98,095 owe **$4,875** to Indiana on $6,000 of real
profit — an **81% effective state rate on actual income.** Your county of residence swings this
materially; the model takes `--county-rate`.

### 2.3 What that does to the required edge

Combining both layers, the break-even ROI on handle (gross regime):

| Scenario | Break-even edge required |
|---|---|
| Marion County (2.02%), $199/mo tools, itemizing | **6.00%** |
| Low-tax county (0.50%), no tool cost, itemizing | **3.47%** |
| $25k handle, no tools, Marion County | **4.45%** |
| Not itemizing | effectively unreachable |

Against a professional benchmark of **3%–7% ROI**, with ~**2% average closing line value** being
the mark of a genuinely sharp bettor. You are being asked to be world-class to break even.

### 2.4 The mitigations, honestly assessed

**Session method — partial help, unsettled for sports betting.** Netting wins and losses within a
"session" rather than per-wager shrinks reported gross dramatically. But the only IRS safe harbor
(Notice 2015-21) covers *electronically tracked slot play*, was only ever proposed, and explicitly
caps a session at 24 hours with no cross-venue combining. Applying it to online sports betting is a
practitioner position, not settled law. **Ask a CPA; do not assume it.** If it holds, it is the
single biggest lever available in the gross regime.

**Professional gambler status (Schedule C) — real, but a high bar.** A pro nets wins and losses
into a business result that flows to AGI, which means *Indiana taxes the net*. That structurally
fixes the state problem. Costs: self-employment tax of **15.3%** on net, the §165(d) 90% cap still
applies to losses, and you must meet the *Groetzinger* standard — pursued full-time, in good faith,
for a livelihood. Part-time betting alongside a day job does not qualify. Do not plan around this.

**DFS net reporting — the mitigation that actually works today, with one asterisk.** DraftKings and
FanDuel compute DFS 1099-MISC as *prizes − entry fees + bonuses*, and issue it only above the
reporting threshold (**$600** for TY2025, rising to **$2,000** for TY2026+). Only that net reaches
AGI, so Indiana taxes the real profit and the 90% cap never engages.

> **The asterisk, and it is a real one.** IRS Chief Counsel Advice **202042015** (Sept 2020)
> concluded that a DFS entry fee *is* an amount paid for a wagering transaction under §165(d).
> Read strictly, that invites gross-up treatment and would collapse the advantage. In practice the
> operators still report net, that is the only information return the IRS receives, and net is the
> prevailing practitioner treatment. A CCA is not precedent and binds no one. But this is a
> defensible position, not a bulletproof one, and it is the load-bearing assumption of the entire
> recommendation. **Get it blessed by a CPA in writing before scaling.**

---

## 3. Where Edge Actually Exists

### 3.1 DFS is a shark tank, and the data is unambiguous

The definitive study (McKinsey / Sports Business Journal, first half of the 2015 MLB season) remains
the best public dataset on DFS profit distribution:

- **91% of all DFS player profits were won by 1.3% of players.**
- The **top 11 players** averaged **$2,000,000** in entry fees and **$135,000** profit each — a
  ~6.75% ROI achieved through industrial-scale volume, not per-lineup brilliance.
- The rest of that top 1.3% averaged $9,100 in fees for $2,400 profit — **27% ROI**, and together
  took **77% of all profits** on **23% of all entry fees**.
- **80% of players are "minnows"** contributing ~8% of entry fees; 5% are "big fish" losing ~$1,100
  on $3,600 of entries.

Read that top line correctly: the whales aren't smarter per-lineup, they're *bigger*. They run
hundreds of entries through solvers and correlation engines. Entering a large-field GPP against them
with hand-built lineups is a donation.

**Rake is the second wall.** DFS rake runs **10%–13%**, higher on some formats — 8–9% on head-to-head,
10–12% on GPPs, and creeping up. Overlay (the site eating an unfilled guarantee) was the classic
free edge and is now **very hard to find on DK/FD**. A player with a genuine 5% edge over the field
still loses money at 10%+ rake unless they finish top-heavy. **Avoid anything above 14% rake.**

**Where DFS edge is most stable:** cash games (50/50s, double-ups, head-to-heads), not tournaments.
The documented elite cash-game performance — 77.3% win rate over 8,181 contests, run at a 90:10
cash-to-GPP allocation — is the profile that produces *steady* returns. GPPs produce lottery
outcomes and are the wrong shape for your stated goal. Note the tension: cash games are also where
the sharpest, most volume-driven players concentrate, because that's where edge compounds.

### 3.2 Sportsbook +EV: the edge is real, the account isn't

+EV betting and promo harvesting genuinely work. The problems are operational, not mathematical.

- **Promotional value is real but finite and front-loaded.** Free bets are worth **50%–75% of face
  value**, not 100% (you don't get the stake back), and are maximized on longshots. Sign-up offers
  are a one-time harvest across a fixed number of books.
- **You will be limited, and fast.** Books call it "stake factoring." ESPN's reporting has operators
  openly defending it; they limit for betting stale lines, promo abuse, or simply "having a better
  model." Limited accounts get cut to trivial max stakes. **Your $199/mo tool has a shelf life
  measured in months per book.**
- **The tool cost is a real drag and the signal is not proprietary.** OddsJam Gold **$199.99/mo**,
  Unabated Premium ~**$132/mo** effective, Outlier Pro **$79.99/mo**. On $200k of handle a $199/mo
  subscription is **1.2% of handle** — a third of a professional-grade edge, spent before you bet.
  And thousands of subscribers get the same alert simultaneously, which is precisely why those
  lines move and those accounts get limited.

This is the core structural problem with the "buy an edge from a subscription" model: **an edge
sold to everyone is an edge that no longer exists**, and the vendors are not the ones absorbing
that decay.

### 3.3 Pick'em apps (PrizePicks, Underdog) — soft lines, serious legal instability

Pick'em products historically carry softer pricing than sportsbooks, which is genuine edge. But
they are under sustained regulatory attack: multiple states have banned pick'em-style contests as
disguised prop betting, Michigan issued a cease-and-desist after initially permitting PrizePicks,
and class actions naming PrizePicks as illegal gambling were live into 2026. Indiana currently
licenses DFS under Indiana Gaming Commission oversight and both operators are listed as available
— **but sources conflict and this changes fast. Verify current Indiana status before depositing.**

Treat these as opportunistic, never as infrastructure. Do not build a system whose core dependency
can be cease-and-desisted out of your state in a week — and understand that funds on a platform
that exits your state are an operational problem, not a theoretical one.

### 3.4 Which sports

Ranked by exploitability for a part-time analyst who is already building NFL infrastructure:

1. **NFL** — deepest liquidity and sharpest lines, so raw edge is hardest to find; but it is where
   your existing data pipeline, pool infrastructure, and domain knowledge already live. Lowest
   marginal cost for you to work in.
2. **NBA** — highest DFS edge-per-hour historically. Late-breaking injury news is the single most
   reliable public edge in DFS; whoever reacts fastest to a scratch captures value. This rewards
   automation, which you can build.
3. **MLB** — most statistically modelable, weakest public modeling, but highest variance per
   contest. Rewards patience and volume.
4. **Niche markets** (college, lower-tier leagues) — softest lines, lowest limits, fastest
   limiting. Real edge, poor scalability.

Your existing NFL work is the cheapest place to extend. Chasing NBA/MLB means building a second
data pipeline from zero for a marginal edge you haven't demonstrated in a sport you know well.

---

## 4. What Actually Returns Money, Ranked

### 4.1 Your existing private pools — the best vehicle you have, already built

This deserves the top slot and it is not a consolation prize.

| Property | Private pool | DK/FD sportsbook |
|---|---|---|
| Rake to a house | ~0% (commissioner covers costs) | 4.5%–10% hold |
| Opponents | ~268 recreational entrants | Syndicates and pro modelers |
| Tax reporting | No 1099; net treatment | Gross W-2G / gross winnings |
| Your edge | Documented and structural (`STRATEGY.md`) | Undemonstrated |
| Cost to enter | Already in it | $2,388/yr in tools |
| Limiting risk | Nobody can limit you | Weeks to months |

The pool pays **$1,000/week (~$18,000/season)** plus **$5,000–6,000 season-long**, against ~268
entrants who are overwhelmingly picking favorites. `STRATEGY.md` already establishes the core
insight — that chalk-picking has a *mathematically zero* chance of winning a week, and that
`leverage = win_probability / estimated_pick_share` is the product. That is a real, structural,
non-decaying edge against a soft field with no rake and clean tax treatment.

**No DraftKings strategy in this document beats it on a risk-adjusted, after-tax basis.** The
highest-ROI move available to you is not opening a sportsbook account — it is **finding three more
pools like this one** and running the machine you have already built across all of them. Same
model, same code, multiplied stakes, zero additional decay.

### 4.2 DFS cash games, small scale, tightly measured

The legitimate DK/FD play, if you want one. Net 1099 reporting (subject to §2.4's asterisk), edge
that is real if you can beat 10% rake, and a format that produces steady rather than lottery
returns.

Constraints that are not optional:
- **Cash games only** (50/50s, double-ups, H2H) at a ~90:10 cash-to-GPP allocation.
- **Rake ceiling: 12%.** Walk away from anything higher.
- **Single-entry or small-field contests** where volume-scaled multi-entry players can't stack the
  field against you.
- **NBA first** if you extend beyond NFL — injury-news latency is the most reliable edge and it
  automates well.

### 4.3 One-time promotional harvest

Legitimate, meaningful, and finite. Sign-up offers across the Indiana-legal books are worth real
money at 50–75% of face value. Harvest deliberately, book by book, understand it generates *gross*
winnings (§2.2 applies), and accept that aggressive promo play accelerates limiting. **Budget it as
a one-time capital event, not recurring revenue.** Do not build a P&L that assumes it repeats.

### 4.4 What to skip outright

- **Large-field GPPs.** You are the minnow in the McKinsey data.
- **Parlays.** Compounding hold; the worst-priced product on the board.
- **Subscription "picks" services and touts.** `STRATEGY.md` §3 already bans them as sources and
  that ban should extend here.
- **Arbitrage as a primary strategy.** Thin margins, heavy capital float across many books, and it
  is the single fastest route to being limited everywhere.

---

## 5. If You Proceed: The Build Plan

Staged so each phase must prove itself before the next unlocks capital. **Every phase after 0 is
gated on the prior one's exit criteria.**

### Phase 0 — Instrumentation before capital (build now, bet nothing)

You cannot manage what you don't measure, and the tax regime makes measurement mandatory rather
than nice-to-have.

1. **A wager ledger.** Every position: timestamp, platform, sport, market, stake, American odds,
   your modeled probability, closing line, result, gross return. This is simultaneously your edge
   measurement and your **IRS substantiation** — contemporaneous records are required, and Indiana's
   gross taxation makes reconstruction after the fact impossible.
2. **CLV tracking as the primary KPI.** Win/loss is noise for at least a season. Closing line value
   is signal within weeks. **If you are not beating closing lines, you have no edge, regardless of
   your P&L.** Track average CLV per bet, not just hit rate.
3. **The tax engine.** `scripts/betting_roi_model.py` is the prototype. Extend it to run off the
   real ledger so at any point you can answer *"what do I actually keep?"* — never the gross number.
4. **A dashboard tab** in the existing site, matching the current architecture (own ES module under
   `js/`, shared data layer, no build step).

**Exit criteria: 200+ logged paper bets with positive average CLV.** No real money before this.

### Phase 1 — Paper trade for a full sport-season segment

Run the model live with zero capital. Log everything as if real. You are testing whether you can
beat closing lines, not whether you can pick winners.

**Exit criteria: average CLV ≥ +1.5% over 200+ bets.** Below that, stop — the rest of this document
is moot and you have saved yourself the money.

### Phase 2 — Minimum viable capital

Only on passing Phase 1.

- **Bankroll: money you can lose entirely without any change to your life.** Not an "investment
  allocation." The model says a genuine 3% edge still produces a **losing year 7.9% of the time** at
  $200k handle, and **30.9% of the time** at $25k handle. Small scale means variance dominates skill.
- **Flat stakes at 1% of bankroll**, or fractional Kelly at no more than half-Kelly. Full Kelly is
  too aggressive when your edge estimate is itself uncertain — and early on, it is.
- **No paid tools yet.** Prove edge on free data first. A subscription is 1.2% of handle; buying it
  before demonstrating edge means paying for a conclusion you haven't earned.
- **DFS cash games and pool play only.** No sportsbook volume until §2's tax question is settled
  with a CPA.

### Phase 3 — Scale only on demonstrated, after-tax, multi-season profit

Two full seasons of positive CLV *and* positive after-tax P&L before increasing stakes or buying
tools. Not one season — one season is inside the noise band.

---

## 6. What You're Not Thinking About

You asked. In rough order of how likely each is to hurt you.

1. **The AGI cascade.** This is the sleeper. Adding ~$98,000 of gross winnings to AGI doesn't just
   trigger gambling tax — it can raise ACA marketplace premiums, trigger **Medicare IRMAA**
   surcharges, inflate income-driven student loan payments, increase the taxable portion of Social
   Security, and phase out credits and deductions across your return. **The damage lands on income
   you never actually earned, and it lands outside the gambling section of your return where you
   won't be looking for it.** Model your *whole* return, not the wagering lines.

2. **Quarterly estimated taxes and underpayment penalties.** Gambling income has no withholding
   below the W-2G thresholds. Win in Q1, spend it, and you can owe estimated payments you no longer
   have. Set aside tax on **gross** winnings — in Indiana that reserve is far larger than your
   profit, which is exactly the counterintuitive part.

3. **Your edge is rented, and the landlord sells to everyone.** If the signal comes from a $199/mo
   subscription, thousands receive it simultaneously. That's why lines move fast and why books limit
   subscribers specifically. Any strategy whose moat is "I pay for OddsJam" has no moat.

4. **Account limiting is the business risk, not a nuisance.** A sportsbook operation that works
   perfectly gets throttled precisely *because* it works. Model your ROI over the **limited** life
   of an account, not the honeymoon. There is no appeal.

5. **Variance is much larger than intuition, and drawdowns are brutal.** A real 3% edge still loses
   money in ~1 of 12 years at scale, ~1 of 3 at small scale. Mid-season drawdowns are far worse than
   the annual figure. **The most common failure mode is a correct strategy abandoned during a normal
   losing stretch** — and the second most common is increasing stakes to recover.

6. **Hourly rate.** Real +EV betting is 10–20 hrs/week of line shopping, injury monitoring, and
   logging. At $6,000 gross profit, that's ~$6/hr *before* tax and *before* the model above turns it
   negative. Compare honestly against consulting hours, or against extending the pool tool.

7. **The DFS net-reporting position could unwind.** CCA 202042015 (§2.4) is the specific risk, and
   it sits under the entire recommendation. If the IRS pushes gross treatment on DFS, the tax
   advantage evaporates and §4.2 dies with it.

8. **Selling the system is a different business with different law.** "Market my approach for $$"
   means becoming a tout — a space with state licensing questions, FTC advertising-substantiation
   exposure, and consumer-protection litigation risk. Also note the tell: **if the edge scaled with
   capital, selling it would be irrational.** People sell picks when the picks don't scale. Your own
   `STRATEGY.md` bans touts as a source; be consistent about becoming one.

9. **Capital float across books.** Line shopping requires funded accounts at many books
   simultaneously. That capital is idle, illiquid, and exposed to operator risk and withdrawal
   friction. It belongs in your ROI denominator; nobody ever puts it there.

10. **Bonus and promo value is taxable too**, and generally at gross.

11. **Correlated risk with your existing pools.** If the pick'em pool, survivor pool, and DFS
    lineups all lean on the same model, a bad model week loses everything at once. These are not
    independent bets — the diversification is illusory.

12. **The behavioral risk is the real one.** Every structural protection in this document assumes a
    disciplined operator. The transition from "analyst running a tested model" to "person who needs
    to get even" is not announced in advance, and the tooling cannot detect it. Pre-commit to
    stop-loss limits *now*, while nothing is at stake, and give someone else the authority to
    enforce them. **A tool that makes betting more efficient also makes losing more efficient.**

---

## 7. Recommendation

**Do not open a sportsbook operation in Indiana.** The tax structure alone requires a top-decile
professional edge to reach break-even, and that is before limiting, tool decay, and variance. The
math is in §2.3; re-run it with your own county rate if you want to confirm.

**Do build Phase 0.** The ledger, the CLV tracker, and the after-tax model are worth having
regardless of what you decide, they cost only your time, and they are the only way to distinguish
edge from luck before capital is at risk.

**Do extend the machine you already have.** More private pools, same model, same code. Zero rake,
soft field, clean tax treatment, no limiting risk, and a documented structural edge you have
*already researched*. It is the highest after-tax risk-adjusted return in this entire document, and
you built most of it already.

**Consider DFS cash games as a small, measured experiment** — capped, cash-only, rake-disciplined,
and gated on Phase 1's CLV result and a CPA's sign-off on §2.4.

The uncomfortable framing, since you asked me to be the analyst: **you asked which sport and which
pool type returns the most, and the honest answer is that the question is one level too low.** The
tax regime and the rake structure dominate every handicapping decision you could make. Get those
right and a mediocre model prints money; get them wrong and a world-class model still loses. You
have already, without intending to, built your operation inside the best available structure. The
work now is to recognize that and scale it — not to go looking for a worse one with a better logo.

---

## 8. Sources

Tax law and rates:
- [Foster Garvey — OBBBA Part III: Gambling / Code §165(d)](https://www.foster.com/larry-s-tax-law/one-big-beautiful-bill-act-part-3-gambling-code-section-165-d)
- [Tax Foundation — OBBBA Creates Unequal Tax Treatment for Gambling Losses](https://taxfoundation.org/blog/gambling-losses-tax-big-beautiful-bill/)
- [Forbes — Gambling Tax Alert: New Law Cuts Loss Deductions](https://www.forbes.com/sites/nathangoldman/2026/01/13/gambling-tax-alert-new-law-cuts-loss-deductions-bettors-face-big-hit/)
- [Unabated — The State Of The 2026 Gambling Deduction Changes](https://unabated.com/post/the-state-of-the-2026-gambling-deduction-changes)
- [National Tax Tools — Gambling Loss Deduction Guide 2026: IRC §165(d)](https://nationaltaxtools.com/guides/gambling-loss-deduction/)
- [Financial Planning Association — A Study of the Taxation of Sports Betting](https://www.financialplanningassociation.org/learning/publications/journal/FEB25-study-taxation-sports-betting-OPEN) (states disallowing loss deductions)
- [PlayIndiana — Indiana Gambling Tax](https://www.playindiana.com/tax/)
- [Tax Foundation — State Individual Income Tax Rates and Brackets, 2026](https://taxfoundation.org/data/all/state/state-income-tax-rates-2026/)
- [Indiana DOR — Rates, Fees & Penalties](https://www.in.gov/dor/resources/tax-rates-and-reports/rates-fees-and-penalties/)
- [IRS CCA 202042015 (PDF)](https://www.irs.gov/pub/irs-wd/202042015.pdf) — DFS entry fees are wagering transactions
- [Current Federal Tax Developments — DFS Fee is a Wagering Transaction](https://www.currentfederaltaxdevelopments.com/blog/2020/10/17/daily-fantasy-sports-fee-is-a-wagering-transaction-deductions-limited-to-winnings-per-chief-counsel-advice)
- [IRS Notice 2015-21 (PDF)](https://www.irs.gov/pub/irs-drop/n-15-21.pdf) — proposed slot session safe harbor
- [The Tax Adviser — Taxation of Gambling](https://www.thetaxadviser.com/issues/2016/oct/taxation-of-gambling/)
- [Tax Notes — Taxation of Gambling After the OBBBA](https://www.taxnotes.com/special-reports/gains-and-losses/taxation-gambling-after-obbba/2025/08/14/7sxhn)
- [Monaco CPA — Fantasy Sports Taxes 2026](https://www.monacocpa.cpa/post/fantasy-sports-tax-dfs-guide) (1099-MISC thresholds)
- [FanDuel Support — Taxes FAQ: W-2G, 1099](https://support.fanduel.com/s/article/Taxes-Frequently-Asked-Questions)
- [TaxSlayer Pro — How is professional gambling reported?](https://support.taxslayerpro.com/hc/en-us/articles/9800523098650-How-is-professional-gambling-reported)

DFS market structure and profitability:
- [McKinsey / SBJ — For daily fantasy-sports operators, the curse of too much skill](https://www.mckinsey.com/industries/media-and-entertainment/our-insights/for-daily-fantasy-sports-operators-the-curse-of-too-much-skill)
- [CalvinAyre — 1.3% of DFS Players Win 91% of Profits](https://calvinayre.com/2015/09/04/business/tiny-sliver-daily-fantasy-sports-players-earn-bulk-profits)
- [Legal Sports Report — Rake Goes Up At DraftKings, FanDuel](https://www.legalsportsreport.com/15721/draftkings-fanduel-rake-increases/)
- [One Week Season — Defining 'Overlay' and 'Rake'](https://oneweekseason.com/defining-overlay-and-rake/)
- [Fantasy Footballers — DFS Contest Selection for DraftKings](https://www.thefantasyfootballers.com/dfs/nfl-dfs-contest-selection-for-draftkings/)
- [Footballguys — DFS Game Selection](https://www.footballguys.com/subscribers/apps/article.php?article=dfsgameselection)

Sportsbook edge, limiting, and tooling:
- [ESPN — Sportsbooks defend practice of limiting sharp customers](https://www.espn.com/sports-betting/story/_/id/41231266/espn-sports-betting-news-sportsbooks-defend-practice-limiting-sharp-customers)
- [DarkHorse Odds — Don't Get Limited By Sportsbooks](https://about.darkhorseodds.com/guides/dont-get-limited)
- [Unabated — Sportsbook Signup Promotions](https://unabated.com/articles/sportsbook-signup-promotions-want-you)
- [DRatings — What Is a Realistic Expected ROI Target for Sports Bettors?](https://www.dratings.com/what-is-a-realistic-expected-roi-target-for-sports-bettors/)
- [BettorEdge — What is Closing Line Value?](https://www.bettoredge.com/post/what-is-closing-line-value-in-sports-betting)
- [XCLSV — OddsJam vs AVO vs Outlier: +EV Software Compared 2026](https://xclsvmedia.com/oddsjam-vs-avo-vs-outlier-best-ev-betting-software-compared-2026/)
- [Outlier — Positive EV Betting](https://outlier.bet/sports-betting-strategy/positive-ev-betting/what-is-positive-ev-betting/)

Pick'em legal status:
- [BettingUSA — Indiana Daily Fantasy Sports 2026](https://www.bettingusa.com/states/in/daily-fantasy/)
- [Legal Sports Report — Which States Allow DFS Sites?](https://www.legalsportsreport.com/dfs-sites/legal-states/)
- [Straight To The Point — DFS 2.0 Under Fire](https://straighttothepoint.substack.com/p/dfs-20-under-fire)
