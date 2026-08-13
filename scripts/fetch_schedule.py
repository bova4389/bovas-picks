#!/usr/bin/env python3
"""
Fetch a full NFL regular season (schedule + final scores) from ESPN.

    python scripts/fetch_schedule.py 2026
    python scripts/fetch_schedule.py 2025      # completed season = rating input

Writes data/schedule-<year>.json: every game with its week, kickoff, both
teams, and the final score once played. Two consumers:

  * build_projections.py — completed games train the power ratings, unplayed
    games are what get projected.
  * The survivor view — needs the whole season laid out to plan an elite-team
    budget and spot bye weeks, which the odds feed can never show (books post
    only ~10-12 days ahead).

ENDPOINT NOTE. The obvious `site.api.espn.com/apis/site/v2/...` host returns
403 from here, so this uses ESPN's CDN core endpoint instead:

    cdn.espn.com/core/nfl/schedule?xhr=1&year=<y>&week=<w>&seasontype=2

Same data, different shape: `content.schedule` is keyed by yyyymmdd date, each
holding a `games` list. If this ever breaks, check that host first — the 403
on the site API is the thing most likely to have changed.

No API key, no rate limit worth worrying about; 18 requests per run.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = (
    "https://cdn.espn.com/core/nfl/schedule"
    "?xhr=1&year={year}&week={week}&seasontype=2"
)

# ESPN's abbreviations differ from the project's canonical set in js/teams.js.
# Anything not listed passes through unchanged.
#
# OAK matters for seasons before 2020: ESPN back-maps the Rams and Chargers
# relocations to LAR/LAC but still calls the pre-move Raiders OAK. Mapping it
# to LV keeps the franchise continuous, which is what power ratings want — the
# team's strength carries across the move even though the city does not.
ESPN_FIXES = {"WSH": "WAS", "JAX": "JAC", "OAK": "LV", "SD": "LAC", "STL": "LAR"}

CANONICAL = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GB", "HOU", "IND", "JAC", "KC", "LAC", "LAR", "LV", "MIA",
    "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
    "TEN", "WAS",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read())


def norm(abbr):
    return ESPN_FIXES.get(abbr, abbr)


def parse_week(payload, week):
    games = []
    schedule = payload.get("content", {}).get("schedule", {}) or {}

    for day in sorted(schedule):
        for g in schedule[day].get("games", []):
            comp = g["competitions"][0]
            status = comp["status"]["type"]
            sides = {c["homeAway"]: c for c in comp["competitors"]}
            if "home" not in sides or "away" not in sides:
                continue

            home, away = sides["home"], sides["away"]
            completed = bool(status.get("completed"))

            def score(side):
                raw = side.get("score")
                try:
                    return int(raw)
                except (TypeError, ValueError):
                    return None

            # "Home" in this feed means the team that owns the fixture, not the
            # team whose stadium it is played in. The league sends nine 2026
            # games abroad -- Melbourne, Rio, London x3, Paris, Madrid, Munich,
            # Mexico City -- and each still has a nominal home side. Record the
            # flag explicitly rather than leaving it implied, so the Schedule tab
            # can say "not at their place" instead of quietly lying.
            #
            # `neutral` is always written, so its ABSENCE means the file predates
            # this field rather than "played at home". The venue block is only
            # carried for neutral games, since for the other 263 it is just the
            # home team's own stadium and would trebble the file for nothing.
            record = {
                "id": g["id"],
                "week": week,
                "date": g.get("date"),
                "home": norm(home["team"]["abbreviation"]),
                "away": norm(away["team"]["abbreviation"]),
                "homeScore": score(home) if completed else None,
                "awayScore": score(away) if completed else None,
                "completed": completed,
                "neutral": bool(comp.get("neutralSite")),
            }

            if record["neutral"]:
                venue = comp.get("venue") or {}
                address = venue.get("address") or {}
                record["venue"] = {
                    "name": venue.get("fullName"),
                    "city": address.get("city"),
                    "country": address.get("country"),
                }

            games.append(record)
    return games


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    year = int(sys.argv[1])

    all_games, unknown = [], set()
    for week in range(1, 19):
        try:
            payload = get(URL.format(year=year, week=week))
        except Exception as e:  # noqa: BLE001 — one bad week shouldn't lose the rest
            # Seasons before 2021 ran 17 weeks, so week 18 legitimately returns
            # nothing. Only worth reporting for weeks that should exist.
            if not (week == 18 and year < 2021):
                print(f"  week {week}: FAILED - {e}", file=sys.stderr)
            continue

        games = parse_week(payload, week)
        all_games += games
        for g in games:
            unknown |= {t for t in (g["home"], g["away"]) if t not in CANONICAL}
        time.sleep(0.15)  # be polite; this is an uncredentialled public endpoint

    if not all_games:
        sys.exit("no games returned — check the endpoint note in this file's docstring")

    # Byes are derivable rather than stored: any team absent from a week.
    byes = {}
    for week in range(1, 19):
        playing = {t for g in all_games if g["week"] == week for t in (g["home"], g["away"])}
        if playing:
            byes[week] = sorted(CANONICAL - playing)

    played = sum(1 for g in all_games if g["completed"])
    out = ROOT / "data" / f"schedule-{year}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(
            {"year": year, "games": all_games, "byes": byes,
             "gameCount": len(all_games), "completed": played},
            indent=1,
        ),
        encoding="utf-8",
    )

    weeks = sorted({g["week"] for g in all_games})
    print(f"{year}: {len(weeks)} weeks, {len(all_games)} games, {played} completed")
    bye_weeks = {w: t for w, t in byes.items() if t}
    if bye_weeks:
        print("byes: " + ", ".join(f"w{w} ({len(t)})" for w, t in sorted(bye_weeks.items())))
    print(f"wrote {out.relative_to(ROOT)}")

    if unknown:
        print(f"\nUNRECOGNISED TEAM CODES: {sorted(unknown)}")
        print("Add them to ESPN_FIXES — projections key on these codes.")
        sys.exit(1)


if __name__ == "__main__":
    main()
