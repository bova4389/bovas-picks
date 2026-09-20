#!/usr/bin/env python3
"""
Fold a new week of Mike's suicide pool into data/survivor-<year>.json.

`parse_survivor.py` reads his ORIGINAL sheet. Once he starts grading, every
week's eliminated entries move to the top of the sheet and are renumbered
1..N in column A, so their numbers collide with entries still alive — which is
why that parser refuses the graded sheet outright (CLAUDE.md, Data Pipeline).

This is the other half of that refusal: it merges the graded sheet's picks into
the file we already have, pairing rows by PERSON and keeping OUR entry numbers.
The pairing is `grade_week.pair_suicide_rows`, the same one
`grade_week.py --check-suicide` reports from — a second copy would be a second
chance to pair a row differently, and this one writes.

Rules it will not bend:

  * Our entry numbers are the pool's identity. His column A is ignored.
  * A row it cannot pair is a refusal, not a guess. An entry added or dropped
    mid-season has to be looked at by hand.
  * A pick we hold and he does not is never cleared. He hides eliminated
    entries' later cells; a blank is not a retraction.
  * Losses are recorded, eliminations are not. `alive` is "picked in the most
    recent week with any activity", exactly as parse_survivor derives it, and
    nothing here reads or writes buy-backs.

    python scripts/merge_survivor_week.py "path/to/Suicide 26.xlsx" 2026 [--dry-run]
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
sys.path.insert(0, str(ROOT / "scripts"))

from grade_week import load, pair_suicide_rows, read_suicide_sheet, write_if_changed  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook")
    ap.add_argument("year", type=int)
    ap.add_argument("--dry-run", action="store_true", help="report the merge, write nothing")
    args = ap.parse_args()

    path = DATA / f"survivor-{args.year}.json"
    pool = load(path)
    his_rows = read_suicide_sheet(args.workbook)
    pairs, his_left, ours_left = pair_suicide_rows(his_rows, pool["entries"])

    if his_left or ours_left:
        for h in his_left:
            print(f"  unpaired on his sheet: {h['key'][0]!r} (his row #{h['sheet_no']})")
        for o in ours_left:
            print(f"  unpaired in our file:  #{o['entry']} {o['nick']}")
        sys.exit(
            f"REFUSING TO MERGE: {len(his_left)} row(s) on his sheet and {len(ours_left)} in "
            f"{path.relative_to(ROOT)} did not pair.\nAn entry was added or dropped, or a name was "
            "retyped past what the pairing can follow. Resolve those by hand first."
        )

    added, changed = 0, 0
    for h, o in sorted(pairs, key=lambda p: (p[1]["entry"] is None, p[1]["entry"] or 0)):
        label = f"#{o['entry']} {str(o['nick'] or '').strip()}"
        for wk in sorted(h["picks"], key=int):
            if wk not in o["picks"]:
                o["picks"][wk] = h["picks"][wk]
                added += 1
            elif o["picks"][wk] != h["picks"][wk]:
                print(f"  correction {label} week {wk}: {o['picks'][wk]} -> {h['picks'][wk]}")
                o["picks"][wk] = h["picks"][wk]
                changed += 1

    played = sorted({int(w) for e in pool["entries"] for w in e["picks"]})
    if not played:
        sys.exit("no picks found — is this a blank template?")
    current = max(played)

    for e in pool["entries"]:
        e["picks"] = {str(w): e["picks"][str(w)] for w in sorted(map(int, e["picks"]))}
        e["alive"] = str(current) in e["picks"]
        e["used"] = sorted(set(e["picks"].values()))

    weekly = {}
    for week in played:
        counts = Counter(e["picks"][str(week)] for e in pool["entries"] if str(week) in e["picks"])
        total = sum(counts.values())
        weekly[str(week)] = {
            "entrants": total,
            "distinctTeams": len(counts),
            "picks": [{"team": t, "count": n, "pct": round(100 * n / total, 1)}
                      for t, n in counts.most_common()],
        }

    pool["currentWeek"] = current
    pool["weeks"] = weekly

    for week in played:
        w = weekly[str(week)]
        top = w["picks"][0]
        cum5 = sum(p["pct"] for p in w["picks"][:5])
        print(f"week {week:2d}: {w['entrants']:3d} picked, {w['distinctTeams']:2d} teams | "
              f"top {top['team']} {top['pct']}% | top-5 {cum5:.1f}%")
    print(f"\n{added} pick(s) added, {changed} correction(s) applied, "
          f"{len(pairs)} entries paired")

    if args.dry_run:
        print("dry run — nothing written")
        return
    print(("wrote " if write_if_changed(path, pool) else "unchanged ")
          + str(path.relative_to(ROOT)))


if __name__ == "__main__":
    main()
