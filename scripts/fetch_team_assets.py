#!/usr/bin/env python3
"""Refresh team logos and helmets from the league and ESPN CDNs.

The everyday build (scripts/build_team_identity.py) reads GitHub mirrors,
because that is all a Claude Code web session in this repo can reach — its
egress allowlist covers GitHub and nothing else, so nfl.com and espncdn.com
answer 403 there. Run this one from a machine with open network access when the
mirrors fall behind a rebrand.

    python scripts/fetch_team_assets.py --what logos
    python scripts/fetch_team_assets.py --what logos --dry-run
    python scripts/fetch_team_assets.py --what helmets --only NYJ,DEN,HOU

Only files that actually arrive as valid PNGs are written, and each is written
over its existing asset only after it decodes -- a 403 HTML error page saved
over a good logo is exactly the kind of quiet breakage this repo's season audit
was built to stop.

NOTE: this script is unexercised in the sandbox it was written in, for the
reason above. Run it with --dry-run first.
"""
from __future__ import annotations

import argparse
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ASSETS = REPO / "assets" / "teams"

TEAMS = [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAC", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
]

# Both CDNs spell a few teams differently from this repo. Same reasoning as
# build_team_identity.py's ALIASES, kept separate so neither script has to
# import the other.
CDN_ABBR = {"JAC": "JAX", "LAR": "LA"}

# ESPN serves the round primary logo; the league's own club endpoint serves the
# mark the club currently uses, which is the one that changes on a rebrand.
LOGO_SOURCES = {
    "nfl": "https://static.www.nfl.com/t_q-best/league/api/clubs/logos/{cdn}.png",
    "espn": "https://a.espncdn.com/i/teamlogos/nfl/500/{espn}.png",
}

USER_AGENT = "bovas-picks/1.0 (personal pick'em tool; asset refresh)"
TIMEOUT = 30


def is_png(blob: bytes) -> bool:
    if len(blob) < 24 or blob[:8] != b"\x89PNG\r\n\x1a\n":
        return False
    width, height = struct.unpack_from(">II", blob, 16)
    return width >= 64 and height >= 64


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        print(f"    {type(exc).__name__}: {exc}")
        return None


def refresh_logos(teams, source, dry_run):
    out = ASSETS / "logos"
    template = LOGO_SOURCES[source]
    ok = skipped = 0

    for abbr in teams:
        cdn = CDN_ABBR.get(abbr, abbr)
        url = template.format(cdn=cdn, espn=cdn.lower())
        print(f"  {abbr}: {url}")
        if dry_run:
            skipped += 1
            continue

        blob = fetch(url)
        if blob is None:
            skipped += 1
            continue
        if not is_png(blob):
            print(f"    not a usable PNG ({len(blob)} bytes) -- keeping existing")
            skipped += 1
            continue

        (out / f"{abbr}.png").write_bytes(blob)
        width, height = struct.unpack_from(">II", blob, 16)
        print(f"    wrote {width}x{height}, {len(blob)} bytes")
        ok += 1

    return ok, skipped


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--what", choices=["logos", "helmets"], default="logos")
    ap.add_argument("--source", choices=sorted(LOGO_SOURCES), default="nfl",
                    help="which CDN to pull logos from (default nfl)")
    ap.add_argument("--only", default=None,
                    help="comma-separated abbreviations, e.g. NYJ,DEN,HOU")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the URLs that would be fetched and stop")
    args = ap.parse_args()

    teams = TEAMS
    if args.only:
        want = [t.strip().upper() for t in args.only.split(",") if t.strip()]
        unknown = [t for t in want if t not in TEAMS]
        if unknown:
            sys.exit(f"unknown abbreviation(s): {', '.join(unknown)}")
        teams = want

    if args.what == "helmets":
        sys.exit(
            "No public CDN serves per-team helmet renders, which is why the\n"
            "helmet set comes from the ajreinhard/data-viz mirror that\n"
            "build_team_identity.py already reads. To refresh helmets, update\n"
            "that mirror's 2023_helm folder upstream (or point HELMET_DIR in\n"
            "build_team_identity.py at a newer folder) and rebuild."
        )

    print(f"Refreshing {len(teams)} logo(s) from the {args.source} CDN"
          f"{' (dry run)' if args.dry_run else ''}")
    ok, skipped = refresh_logos(teams, args.source, args.dry_run)

    print(f"\n{ok} written, {skipped} skipped")
    if ok:
        print("Now re-run: python scripts/check_team_assets.py")
    return 0 if (ok or args.dry_run) else 1


if __name__ == "__main__":
    sys.exit(main())
