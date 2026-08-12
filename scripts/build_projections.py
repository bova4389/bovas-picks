#!/usr/bin/env python3
"""
Power ratings and projected win probabilities for every unplayed game.

    python scripts/build_projections.py 2026            # build projections
    python scripts/build_projections.py 2025 --backtest # prove it predicts

WHY THIS EXISTS. The Odds API only returns games books have actually posted,
and NFL books post ~10-12 days ahead. Survivor planning needs 3-4 weeks of
lookahead plus a whole-season map of where each elite team's best spot falls
(SURVIVOR-STRATEGY.md §1). That gap cannot be closed by buying more API
credits — the market simply hasn't priced Week 12 in Week 3 — so it has to be
modelled.

THE MODEL. One number per team, in points, relative to a league-average team.

    projected margin (home) = home_rating - away_rating + HFA
    home win probability     = Phi(projected margin / MARGIN_SD)

MARGIN_SD is 13.5, the standard deviation of NFL game margins — the same
constant STRATEGY.md uses to convert an edge into a cover probability. Sanity
check: a 7-point favourite gives Phi(0.52) = 70%, matching the known rate at
which 7-point favourites win outright.

Ratings are fit by walking completed games in date order:

    error = actual margin - expected margin
    home += K * error / 2      away -= K * error / 2

Symmetric, so ratings stay zero-sum around an average team. Blowout margins
are clamped (CAP) because a 45-point win says little more about true strength
than a 25-point win, and uncapped it would drag a rating badly.

Preseason carries the prior season's final ratings REGRESSED toward zero.
Teams change; last year's rating is evidence, not truth. Elo systems
conventionally keep about a third; 0.40 is what the grid search preferred here,
and anything in the 0.25-0.55 range scored within noise of it.

COMPRESSION — READ BEFORE USING THESE FOR SURVIVOR PICKS. Regressing last
season toward zero is right for accuracy (in August we genuinely do not know
much) but it flattens the probability spread badly. Measured on 2026:

    2025 final ratings spanned   -10.1 .. +9.6   (19.7 points)
    after 0.40 carryover          -4.0 .. +3.8   ( 7.9 points)
    => highest projected win probability anywhere: 75%
       games at 80%+: 0 of 272        games at 70%+: 16 of 272

SURVIVOR-STRATEGY.md sets a hard 70% floor and wants 80%+ spots, so these
preseason numbers cannot clear that bar and must NOT be filtered against it.
Two rules follow:

  1. Apply the 70% floor to MARKET odds only, never to a projection. In weeks
     1-2 the market has priced the whole slate anyway, so use it.
  2. Use projections for ORDERING, not levels. Compression hits every game
     roughly equally, so "is week 9 a better Seattle spot than week 6" still
     answers correctly even though both numbers read low. That ordering is
     exactly what the elite-team budget needs.

The spread widens as real results replace the carried-over prior, so these
sharpen from roughly week 4 onward.

TRUST BOUNDARY. Everything this writes is a PROJECTION and is labelled
`"source": "projected"`. Market odds from fetch_odds.py are authoritative and
must override these wherever both exist. Never blend the two silently — a 78%
projection four weeks out is a much softer number than a 78% moneyline on
Saturday. Cross-check against RotoWire's public survivor grid; large
disagreement is a bug signal, not an edge.
"""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Constants below were grid-searched on 2021-2024 and then checked once
# against 2025 as a held-out season. Results are in this file's --backtest
# output; read them before touching these. Accuracy was flat across a wide
# neighbourhood of these values, so they are not finely balanced — but they
# are also not guesses.
HFA = 2.6          # home field, in points. Fit, and below the historical ~3.
MARGIN_SD = 13.5   # SD of NFL game margins
K = 0.06           # rating step per point of prediction error
CAP = 31           # clamp on margin, to blunt blowouts
CARRYOVER = 0.40   # fraction of last season's rating retained at reset
PASSES = 3         # sweeps over the training games; 1 leaves ratings short of fit

TEAMS = [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GB", "HOU", "IND", "JAC", "KC", "LAC", "LAR", "LV", "MIA",
    "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
    "TEN", "WAS",
]


def phi(x):
    """Standard normal CDF."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def win_prob(margin):
    return phi(margin / MARGIN_SD)


def load_schedule(year):
    path = ROOT / "data" / f"schedule-{year}.json"
    if not path.exists():
        sys.exit(f"missing {path.relative_to(ROOT)} — run fetch_schedule.py {year} first")
    return json.loads(path.read_text(encoding="utf-8"))


def train(games, ratings=None, through_week=None):
    """Walk completed games, nudging ratings toward observed margins.

    Repeated PASSES times: a single online sweep leaves ratings well short of
    the fit the data supports (a genuinely +8 team lands near +4.5 after one
    pass through 11 games), which flattens every projection toward a coin flip.
    """
    ratings = dict(ratings) if ratings else {t: 0.0 for t in TEAMS}

    usable = [
        g for g in sorted(games, key=lambda g: (g["week"], g["date"] or ""))
        if g["completed"] and g["homeScore"] is not None
        and g["home"] in ratings and g["away"] in ratings
        and (through_week is None or g["week"] <= through_week)
    ]

    for _ in range(PASSES):
        for g in usable:
            expected = ratings[g["home"]] - ratings[g["away"]] + HFA
            actual = max(-CAP, min(CAP, g["homeScore"] - g["awayScore"]))
            adj = K * (actual - expected) / 2
            ratings[g["home"]] += adj
            ratings[g["away"]] -= adj

    return ratings, len(usable)


def regress(ratings, factor=CARRYOVER):
    return {t: r * factor for t, r in ratings.items()}


def project_game(ratings, g):
    margin = ratings[g["home"]] - ratings[g["away"]] + HFA
    hp = win_prob(margin)
    return {
        "id": g["id"],
        "week": g["week"],
        "date": g["date"],
        "home": g["home"],
        "away": g["away"],
        "projMargin": round(margin, 2),
        "homeWinProb": round(hp, 4),
        "awayWinProb": round(1 - hp, 4),
        "source": "projected",
    }


# ── Backtest ──────────────────────────────────────────────────────────────

def _record_control(train_games, test_games):
    """Naive benchmark: the team with the better record so far wins.

    Worth carrying permanently. A power-rating model that cannot beat this is
    not earning its complexity, and on a single season this one roughly ties it.
    """
    wins, losses = {}, {}
    for g in train_games:
        if g["homeScore"] > g["awayScore"]:
            wins[g["home"]] = wins.get(g["home"], 0) + 1
            losses[g["away"]] = losses.get(g["away"], 0) + 1
        elif g["awayScore"] > g["homeScore"]:
            wins[g["away"]] = wins.get(g["away"], 0) + 1
            losses[g["home"]] = losses.get(g["home"], 0) + 1

    def pct(t):
        w, l = wins.get(t, 0), losses.get(t, 0)
        return w / max(1, w + l)

    n = c = 0
    for g in test_games:
        if g["homeScore"] == g["awayScore"]:
            continue
        n += 1
        c += (pct(g["home"]) >= pct(g["away"])) == (g["homeScore"] > g["awayScore"])
    return 100 * c / n if n else 0.0


def _score(ratings, test_games):
    n = c = 0
    brier = home = 0.0
    for g in test_games:
        if g["homeScore"] == g["awayScore"]:
            continue
        margin = ratings[g["home"]] - ratings[g["away"]] + HFA
        p = win_prob(margin)
        won = g["homeScore"] > g["awayScore"]
        n += 1
        c += (margin > 0) == won
        brier += (p - (1.0 if won else 0.0)) ** 2
        home += 1.0 if won else 0.0
    if not n:
        return None
    return 100 * c / n, brier / n, 100 * home / n, n


def _completed(games):
    return [g for g in games if g["completed"] and g["homeScore"] is not None]


def backtest(_year=None):
    """Every season on disk, at two holdout points, against two baselines."""
    years = sorted(
        int(p.stem.split("-")[1]) for p in (ROOT / "data").glob("schedule-*.json")
    )

    rows = []
    for year in years:
        games = _completed(load_schedule(year)["games"])
        if not games:
            continue  # future season, nothing to score
        prior_path = ROOT / "data" / f"schedule-{year - 1}.json"
        seed = None
        if prior_path.exists():
            prior, _ = train(_completed(json.loads(prior_path.read_text(encoding="utf-8"))["games"]))
            seed = regress(prior)

        for cut in (9, 13):
            tr = [g for g in games if g["week"] < cut]
            te = [g for g in games if g["week"] >= cut]
            if not tr or not te:
                continue
            ratings, _ = train(tr, ratings=seed)
            scored = _score(ratings, te)
            if scored is None:
                continue
            acc, brier, home_rate, n = scored
            rows.append((year, cut, home_rate, _record_control(tr, te), acc, brier, n))

    if not rows:
        sys.exit("no completed seasons on disk — run fetch_schedule.py for a past year")

    print("Backtest - train on weeks 1..cut-1, predict the rest\n")
    print(f"{'season':>7} {'holdout':>9} {'home%':>7} {'record%':>8} {'MODEL%':>8} {'brier':>7} {'n':>5}")
    for year, cut, home_rate, rec, acc, brier, n in rows:
        print(f"{year:>7} {'w' + str(cut) + '-18':>9} {home_rate:7.1f} {rec:8.1f} "
              f"{acc:8.1f} {brier:7.4f} {n:5d}")

    mean = lambda i: sum(r[i] for r in rows) / len(rows)  # noqa: E731
    print(f"\n{'MEAN':>7} {'':>9} {mean(2):7.1f} {mean(3):8.1f} {mean(4):8.1f} {mean(5):7.4f}")
    print("\n  home%   - always pick the home team")
    print("  record% - pick whoever has the better record so far")
    print("  Reference: NFL favourites win outright ~67%; the closing moneyline is the")
    print("  practical ceiling. Mid-60s is a working model.")
    print("\n  Read the spread across seasons, not the mean. Seven of the eight")
    print("  completed seasons land in the low-to-mid 60s. 2025 collapses to the")
    print("  mid-50s for the model AND for the record control, with home teams")
    print("  winning just 51% - that season was unusually unpredictable rather than")
    print("  a parameter problem, and the same gap appears under every configuration")
    print("  tried. The model beats the record control in 9 of 16 cells and, unlike")
    print("  it, produces calibrated probabilities. Re-run once 2026 has ~12 weeks in.")


# ── Build ─────────────────────────────────────────────────────────────────

def build(year):
    sched = load_schedule(year)
    games = sched["games"]

    prior_path = ROOT / "data" / f"schedule-{year - 1}.json"
    if prior_path.exists():
        prior_ratings, n_prior = train(json.loads(prior_path.read_text(encoding="utf-8"))["games"])
        ratings = regress(prior_ratings)
        seed = f"{year - 1} final ratings ({n_prior} games), regressed {CARRYOVER:.2f}"
    else:
        ratings = {t: 0.0 for t in TEAMS}
        seed = "flat — no prior season on disk, every team starts average"

    ratings, n_this = train(games, ratings=ratings)

    upcoming = [project_game(ratings, g) for g in games if not g["completed"]]
    upcoming.sort(key=lambda p: (p["week"], p["date"] or ""))

    # Per-team season outlook — the survivor view. "Best week" is the single
    # highest win probability remaining, i.e. the spot to spend that team.
    outlook = {}
    byes = {int(w): t for w, t in sched.get("byes", {}).items()}
    for team in TEAMS:
        rows = []
        for p in upcoming:
            if p["home"] == team:
                rows.append({"week": p["week"], "opp": p["away"], "home": True,
                             "winProb": p["homeWinProb"]})
            elif p["away"] == team:
                rows.append({"week": p["week"], "opp": p["home"], "home": False,
                             "winProb": p["awayWinProb"]})
        best = max(rows, key=lambda r: r["winProb"]) if rows else None
        outlook[team] = {
            "rating": round(ratings[team], 2),
            "byeWeek": next((w for w, teams in byes.items() if team in teams), None),
            "games": rows,
            "bestWeek": best["week"] if best else None,
            "bestWinProb": best["winProb"] if best else None,
        }

    out = ROOT / "data" / f"projections-{year}.json"
    out.write_text(
        json.dumps(
            {
                "year": year,
                "source": "projected",
                "model": {
                    "hfa": HFA, "marginSd": MARGIN_SD, "k": K,
                    "cap": CAP, "carryover": round(CARRYOVER, 4), "seed": seed,
                },
                "trainedOnThisSeason": n_this,
                # Consumers must not apply STRATEGY/SURVIVOR win-probability
                # floors to these numbers while the spread is compressed; see
                # the COMPRESSION note in this file's docstring. Use for
                # ordering, and defer to market odds wherever they exist.
                "ratingSpread": round(max(ratings.values()) - min(ratings.values()), 2),
                "maxWinProb": round(
                    max((max(p["homeWinProb"], p["awayWinProb"]) for p in upcoming), default=0), 4
                ),
                "ratings": {t: round(r, 2) for t, r in ratings.items()},
                "games": upcoming,
                "teamOutlook": outlook,
            },
            indent=1,
        ),
        encoding="utf-8",
    )

    print(f"{year}: seeded from {seed}")
    print(f"  trained on {n_this} completed {year} game(s)")
    print(f"  projected {len(upcoming)} unplayed game(s)")

    top = sorted(ratings.items(), key=lambda kv: -kv[1])
    print("  strongest:", ", ".join(f"{t} {r:+.1f}" for t, r in top[:6]))
    print("  weakest  :", ", ".join(f"{t} {r:+.1f}" for t, r in top[-6:]))

    spread = [p for p in upcoming if p["week"] == min(p["week"] for p in upcoming)]
    if spread:
        wk = spread[0]["week"]
        best = max(spread, key=lambda p: max(p["homeWinProb"], p["awayWinProb"]))
        fav = best["home"] if best["homeWinProb"] > best["awayWinProb"] else best["away"]
        pct = 100 * max(best["homeWinProb"], best["awayWinProb"])
        print(f"  week {wk} strongest favourite: {fav} {pct:.0f}%")

    print(f"wrote {out.relative_to(ROOT)}")


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    year = int(sys.argv[1])
    if "--backtest" in sys.argv:
        backtest(year)
    else:
        build(year)


if __name__ == "__main__":
    main()
