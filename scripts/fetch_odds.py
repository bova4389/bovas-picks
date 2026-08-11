#!/usr/bin/env python3
"""
Fetch NFL moneyline odds from The Odds API and snapshot them into data/odds/.

Run manually:

    ODDS_API_KEY=xxxxx python scripts/fetch_odds.py

Or via .github/workflows/fetch-odds.yml on a schedule: a consistent once-daily
snapshot every day of the week (so Monday's opening line and Saturday's
closing line are both on record), with denser sampling layered on top
Thursday through Saturday as injury news lands. Stays inside the free tier's
500 requests/month. The key lives in the repo's ODDS_API_KEY secret, never in
this file or in committed JSON.

What it writes:

    data/odds/current.json           latest snapshot, one row per upcoming
                                      game, de-vigged win probabilities
    data/odds/history/<event-id>.json every snapshot ever taken of that
                                      specific game, oldest first — this is
                                      the line-movement trail the Odds tab
                                      reads, and it is NOT split by week
                                      bucket. A game's own history starts
                                      whenever it first appears in the feed
                                      (days before it becomes "this week")
                                      and keeps accumulating straight through
                                      to kickoff, so "movement since first
                                      snapshot" is always the true opening
                                      line for that game — never truncated by
                                      which relative bucket it happened to be
                                      in on a given day.
    data/odds/quota.json             requests-remaining as of the last call,
                                      so the UI can show the budget honestly

`bucket` on each event in current.json is a *display* grouping only (0 =
this game-week by wall-clock proximity, 1 = next, …), recomputed fresh every
run — not a storage key. It floors to the Wednesday between two NFL slates
(games run Thursday through Monday, so Wednesday is always a gap), and reset
each run because "this week" drifts forward as time passes. Matching an odds
event to a specific pool week (Mike's numbering) is the Recommend tab's job,
by date and team — this script only knows relative proximity to "now".

The Odds API returns two-way American moneylines per bookmaker. This script
averages across whatever bookmakers are returned for the `us` region, then
de-vigs the averaged line. That is a deliberate simplification — median or
sharpest-book-only would both be defensible too — and is the one thing most
likely worth revisiting once real snapshots are being compared to results.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_URL = (
    "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/"
    "?apiKey={key}&regions=us&markets=h2h&oddsFormat=american"
)


def american_to_prob(odds):
    """American odds -> raw (vig-included) implied win probability."""
    if odds > 0:
        return 100 / (odds + 100)
    return -odds / (-odds + 100)


def devig(prob_a, prob_b):
    """Two-way de-vig: normalise so the pair sums to 1.0."""
    total = prob_a + prob_b
    if total <= 0:
        return None, None
    return prob_a / total, prob_b / total


def week_bucket(commence_iso, anchor):
    """
    Days since the most recent Wednesday at/before `anchor`, floor-divided
    into 7-day buckets. Games run Thu-Mon, so every bucket boundary lands in
    a dead Tuesday/Wednesday gap regardless of what week of the season it is.
    """
    dt = datetime.fromisoformat(commence_iso.replace("Z", "+00:00"))
    # Anchor to the Wednesday <= anchor, in UTC, at midnight.
    anchor_wed = anchor - timedelta(days=(anchor.weekday() - 2) % 7)
    anchor_wed = anchor_wed.replace(hour=0, minute=0, second=0, microsecond=0)
    delta_days = (dt - anchor_wed).days
    bucket = delta_days // 7
    return bucket


def summarize_event(ev):
    home, away = ev["home_team"], ev["away_team"]
    home_probs, away_probs = [], []

    for bk in ev.get("bookmakers", []):
        for market in bk.get("markets", []):
            if market["key"] != "h2h":
                continue
            prices = {o["name"]: o["price"] for o in market["outcomes"]}
            if home not in prices or away not in prices:
                continue
            home_probs.append(american_to_prob(prices[home]))
            away_probs.append(american_to_prob(prices[away]))

    if not home_probs:
        return None

    avg_home = sum(home_probs) / len(home_probs)
    avg_away = sum(away_probs) / len(away_probs)
    dv_home, dv_away = devig(avg_home, avg_away)

    return {
        "id": ev["id"],
        "commenceTime": ev["commence_time"],
        "home": home,
        "away": away,
        "bookmakerCount": len(home_probs),
        "rawHomeProb": round(avg_home, 4),
        "rawAwayProb": round(avg_away, 4),
        "homeWinProb": round(dv_home, 4) if dv_home is not None else None,
        "awayWinProb": round(dv_away, 4) if dv_away is not None else None,
        "vig": round((avg_home + avg_away) - 1, 4),
    }


def fetch(api_key):
    url = API_URL.format(key=api_key)
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            body = json.loads(res.read())
            headers = dict(res.headers)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        sys.exit(f"Odds API request failed: HTTP {e.code}\n{detail}")

    quota = {
        "requestsRemaining": headers.get("x-requests-remaining"),
        "requestsUsed": headers.get("x-requests-used"),
        "lastCost": headers.get("x-requests-last"),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }
    return body, quota


def main():
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        sys.exit(
            "ODDS_API_KEY is not set.\n"
            "Sign up at https://the-odds-api.com/ (free tier: 500 requests/month), "
            "then run:\n  ODDS_API_KEY=xxxxx python scripts/fetch_odds.py"
        )

    events, quota = fetch(api_key)
    fetched_at = quota["fetchedAt"]
    anchor = datetime.now(timezone.utc)

    by_bucket = {}
    rows = []
    for ev in events:
        summary = summarize_event(ev)
        if summary is None:
            continue
        summary["bucket"] = week_bucket(ev["commence_time"], anchor)
        rows.append(summary)
        by_bucket.setdefault(summary["bucket"], 0)
        by_bucket[summary["bucket"]] += 1

    rows.sort(key=lambda r: r["commenceTime"])

    odds_dir = ROOT / "data" / "odds"
    history_dir = odds_dir / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    current = {"fetchedAt": fetched_at, "events": rows}
    (odds_dir / "current.json").write_text(
        json.dumps(current, indent=1), encoding="utf-8"
    )
    (odds_dir / "quota.json").write_text(
        json.dumps(quota, indent=1), encoding="utf-8"
    )

    # Per-game history, not per-bucket: a bucket is where the game sits
    # *today*, which changes as weeks roll over. Keying by event id instead
    # means a game's history file is continuous from the moment it first
    # appears in the feed through kickoff, so "first snapshot" is always the
    # real opening line, not just the first one taken since it became "this
    # week".
    for summary in rows:
        safe_id = "".join(c if c.isalnum() else "_" for c in summary["id"])
        hist_path = history_dir / f"{safe_id}.json"
        try:
            history = json.loads(hist_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            history = []
        entry = dict(summary)
        entry["fetchedAt"] = fetched_at
        history.append(entry)
        hist_path.write_text(json.dumps(history, indent=1), encoding="utf-8")

    print(f"fetched {len(rows)} games across {len(by_bucket)} bucket(s)")
    for bucket in sorted(by_bucket):
        label = "this week" if bucket == 0 else f"bucket {bucket:+d}"
        print(f"  {label}: {by_bucket[bucket]} games")
    print(
        f"quota: {quota['requestsUsed']} used, "
        f"{quota['requestsRemaining']} remaining, "
        f"last call cost {quota['lastCost']}"
    )


if __name__ == "__main__":
    main()
