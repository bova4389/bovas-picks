#!/usr/bin/env python3
"""
betting_roi_model.py — after-tax ROI model for sports wagering as an Indiana resident.

The headline problem this exists to quantify: Indiana taxes GROSS gambling winnings and allows
no deduction for losses, and federal law (post-OBBBA, tax years beginning after 2025) caps the
loss deduction at 90% of losses. A bettor is therefore taxed on money they never made. For a
high-volume, thin-edge bettor the tax on phantom income can exceed the entire real profit.

This model computes the break-even edge — the ROI on handle you must clear before you keep a
single dollar — under both reporting regimes:

  GROSS regime (sportsbook / W-2G): every winning wager is income; losses are a Schedule A
      itemized deduction, federally capped at 90%, and disallowed entirely by Indiana.

  NET regime (DFS / 1099-MISC): the operator reports prizes-minus-entry-fees. Only the net
      reaches AGI, so Indiana taxes the real profit and the 90% cap never bites.

Usage:
    python scripts/betting_roi_model.py
    python scripts/betting_roi_model.py --handle 200000 --roi 0.03 --county-rate 0.0202

Sources for every rate are documented in DFS-BETTING-ROI.md §2. Nothing here is tax advice;
it is a decision model whose assumptions are meant to be argued with and re-run.
"""

import argparse
from dataclasses import dataclass

# --- Statutory constants ------------------------------------------------------------------
# Indiana flat individual rate. 3.00% (2025) -> 2.95% (2026) -> 2.90% (2027).
INDIANA_RATE_2026 = 0.0295
# Indiana county tax is levied on the same base. Range across counties runs ~0.50%-3.00%;
# Marion County (Indianapolis) is 2.02%. This is a real, often-forgotten second layer.
DEFAULT_COUNTY_RATE = 0.0202
# OBBBA amended IRC 165(d): deduction = 90% of wagering losses, still capped at wagering gains.
# Effective for tax years beginning after 2025-12-31.
FEDERAL_LOSS_DEDUCTION_FACTOR = 0.90
# Self-employment tax, relevant only under professional-gambler (Schedule C) treatment.
SE_TAX_RATE = 0.153


@dataclass
class Scenario:
    handle: float          # total dollars staked across the year
    roi: float             # real profit / handle
    avg_odds: int          # American odds of the typical wager
    federal_marginal: float
    state_rate: float
    county_rate: float
    itemizes: bool         # can the bettor use the Schedule A gambling-loss deduction at all?
    tool_cost: float       # annual subscription / data cost


def decimal_payout(american_odds: int) -> float:
    """Profit per $1 staked on a winning wager."""
    if american_odds < 0:
        return 100.0 / abs(american_odds)
    return american_odds / 100.0


def implied_win_rate(roi: float, american_odds: int) -> float:
    """Win rate required to produce `roi` on handle at the given price."""
    b = decimal_payout(american_odds)
    # w*b - (1-w) = roi  ->  w = (roi + 1) / (b + 1)
    return (roi + 1.0) / (b + 1.0)


def gross_flows(scenario: Scenario):
    """Return (gross wagering gains, gross wagering losses, real net profit)."""
    b = decimal_payout(scenario.avg_odds)
    w = implied_win_rate(scenario.roi, scenario.avg_odds)
    gains = scenario.handle * w * b
    losses = scenario.handle * (1.0 - w)
    return gains, losses, gains - losses


def tax_gross_regime(scenario: Scenario):
    """Sportsbook treatment: gains hit AGI, losses are an itemized deduction (90% federal cap,
    zero at the Indiana level)."""
    gains, losses, net = gross_flows(scenario)

    deductible = FEDERAL_LOSS_DEDUCTION_FACTOR * losses if scenario.itemizes else 0.0
    deductible = min(deductible, gains)  # 165(d): never more than gains
    federal_taxable = gains - deductible
    federal_tax = federal_taxable * scenario.federal_marginal

    # Indiana starts from federal AGI and grants no itemized deduction for wagering losses,
    # so the entire gross gain is taxed at state + county.
    indiana_tax = gains * (scenario.state_rate + scenario.county_rate)

    return {
        "gains": gains,
        "losses": losses,
        "net_profit": net,
        "federal_taxable": federal_taxable,
        "federal_tax": federal_tax,
        "indiana_tax": indiana_tax,
        "total_tax": federal_tax + indiana_tax,
        "after_tax": net - federal_tax - indiana_tax - scenario.tool_cost,
    }


def tax_net_regime(scenario: Scenario):
    """DFS 1099-MISC treatment: only prizes-minus-entry-fees reaches AGI."""
    _, _, net = gross_flows(scenario)
    federal_tax = net * scenario.federal_marginal
    indiana_tax = net * (scenario.state_rate + scenario.county_rate)
    return {
        "net_profit": net,
        "federal_tax": federal_tax,
        "indiana_tax": indiana_tax,
        "total_tax": federal_tax + indiana_tax,
        "after_tax": net - federal_tax - indiana_tax - scenario.tool_cost,
    }


def breakeven_roi(scenario: Scenario, lo=0.0, hi=0.25, tol=1e-7) -> float:
    """Bisect for the ROI on handle at which after-tax profit crosses zero, gross regime."""
    def after_tax(r):
        s = Scenario(**{**scenario.__dict__, "roi": r})
        return tax_gross_regime(s)["after_tax"]

    if after_tax(hi) < 0:
        return float("nan")
    while hi - lo > tol:
        mid = (lo + hi) / 2.0
        if after_tax(mid) < 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def risk_of_losing_year(scenario: Scenario) -> float:
    """P(a full year finishes down) for a bettor with a genuine edge, normal approximation.
    Per-unit SD at even-ish money is ~1.0, so SD of the year is ~sqrt(n_bets)."""
    import math
    b = decimal_payout(scenario.avg_odds)
    w = implied_win_rate(scenario.roi, scenario.avg_odds)
    ev = w * b - (1 - w)
    var = w * (b - ev) ** 2 + (1 - w) * (-1 - ev) ** 2
    sd = math.sqrt(var)
    # Assume a $100 average stake to convert handle into a bet count.
    n = scenario.handle / 100.0
    z = (ev * n) / (sd * math.sqrt(n))
    return 0.5 * (1.0 - math.erf(z / math.sqrt(2.0)))


def money(x: float) -> str:
    return f"${x:,.0f}"


def report(scenario: Scenario) -> None:
    g = tax_gross_regime(scenario)
    n = tax_net_regime(scenario)
    be = breakeven_roi(scenario)
    n_bets = int(scenario.handle / 100)
    w = implied_win_rate(scenario.roi, scenario.avg_odds)

    print("=" * 78)
    print("AFTER-TAX WAGERING ROI — INDIANA RESIDENT")
    print("=" * 78)
    print(f"  Handle (total staked)      {money(scenario.handle)}  (~{n_bets:,} bets @ $100)")
    print(f"  Assumed edge               {scenario.roi:.2%} ROI on handle")
    print(f"  Typical price              {scenario.avg_odds:+d}  -> requires {w:.2%} win rate")
    print(f"  Federal marginal           {scenario.federal_marginal:.0%}")
    print(f"  Indiana state + county     {scenario.state_rate:.2%} + {scenario.county_rate:.2%}")
    print(f"  Itemizes deductions        {'yes' if scenario.itemizes else 'NO'}")
    print(f"  Annual tool/data cost      {money(scenario.tool_cost)}")
    print()

    print("-- GROSS REGIME (sportsbook: DraftKings / FanDuel sportsbook) " + "-" * 16)
    print(f"  Gross wagering gains       {money(g['gains'])}")
    print(f"  Gross wagering losses      {money(g['losses'])}")
    print(f"  REAL profit                {money(g['net_profit'])}")
    print(f"  Federal taxable gambling   {money(g['federal_taxable'])}"
          f"   <- phantom income of {money(g['federal_taxable'] - g['net_profit'])}")
    print(f"  Federal tax                {money(g['federal_tax'])}")
    print(f"  Indiana tax (on GROSS)     {money(g['indiana_tax'])}")
    print(f"  Total tax                  {money(g['total_tax'])}")
    print(f"  AFTER-TAX RESULT           {money(g['after_tax'])}"
          f"   ({g['after_tax'] / scenario.handle:+.2%} on handle)")
    print()

    print("-- NET REGIME (DFS 1099-MISC: prizes minus entry fees) " + "-" * 23)
    print(f"  Reported income            {money(n['net_profit'])}")
    print(f"  Federal tax                {money(n['federal_tax'])}")
    print(f"  Indiana tax                {money(n['indiana_tax'])}")
    print(f"  Total tax                  {money(n['total_tax'])}")
    print(f"  AFTER-TAX RESULT           {money(n['after_tax'])}"
          f"   ({n['after_tax'] / scenario.handle:+.2%} on handle)")
    print()

    print("-- VERDICT " + "-" * 66)
    delta = n["after_tax"] - g["after_tax"]
    print(f"  Same edge, net vs gross reporting is worth {money(delta)} per year.")
    if be != be:  # NaN
        print("  Break-even edge (gross): UNREACHABLE within a 25% ROI search bound.")
    else:
        print(f"  Break-even edge (gross regime): {be:.2%} ROI on handle.")
        print(f"    Elite documented sustained ROI is ~3-7%. Your required floor is {be:.2%}.")
    print(f"  P(losing year) even with a real {scenario.roi:.1%} edge: "
          f"{risk_of_losing_year(scenario):.1%}")
    print("=" * 78)


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--handle", type=float, default=200_000)
    p.add_argument("--roi", type=float, default=0.03)
    p.add_argument("--avg-odds", type=int, default=-110)
    p.add_argument("--federal-marginal", type=float, default=0.22)
    p.add_argument("--state-rate", type=float, default=INDIANA_RATE_2026)
    p.add_argument("--county-rate", type=float, default=DEFAULT_COUNTY_RATE)
    p.add_argument("--no-itemize", action="store_true",
                   help="Bettor takes the standard deduction — losses become 100%% non-deductible.")
    p.add_argument("--tool-cost", type=float, default=2_388,
                   help="Annual data/subscription cost (default: OddsJam Gold at $199/mo).")
    a = p.parse_args()

    report(Scenario(
        handle=a.handle,
        roi=a.roi,
        avg_odds=a.avg_odds,
        federal_marginal=a.federal_marginal,
        state_rate=a.state_rate,
        county_rate=a.county_rate,
        itemizes=not a.no_itemize,
        tool_cost=a.tool_cost,
    ))


if __name__ == "__main__":
    main()
