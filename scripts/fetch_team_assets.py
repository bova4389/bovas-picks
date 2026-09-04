#!/usr/bin/env python3
"""Refresh team logos and wordmarks from official CDNs.

The everyday build (scripts/build_team_identity.py) reads GitHub mirrors,
because that is all a Claude Code web session in this repo can reach -- its
egress policy allows GitHub and answers 403 for nfl.com and espncdn.com. Run
this one from a machine with normal network access.

Fetch current logos or wordmarks from a CDN:

    python scripts/fetch_team_assets.py logos --dry-run
    python scripts/fetch_team_assets.py logos
    python scripts/fetch_team_assets.py wordmarks --only NYJ,DEN,HOU

Nothing is overwritten until the replacement decodes as a real PNG, so a 403
error page can never land on top of a good asset. Re-run
scripts/check_team_assets.py afterwards either way.
"""
from __future__ import annotations

import argparse
import struct
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "lib"))

REPO = Path(__file__).resolve().parent.parent
ASSETS = REPO / "assets" / "teams"

TEAMS = [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAC", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
]

# Both CDNs spell a few teams differently from this repo, same reasoning as
# build_team_identity.py's ALIASES.
CDN_ABBR = {"JAC": "JAX", "LAR": "LA"}

SOURCES = {
    "logos": {
        # The league's own club endpoint serves the mark the club currently
        # uses, so it is the one that moves on a rebrand. ESPN is the fallback.
        #
        # The path segment is a Cloudinary transform, and the choice of
        # transform decides the ENCODING, not just the byte size. `t_q-best`
        # -- what this used to request -- returns an 8-bit *palette* PNG:
        # 79-256 colors and ~27 partial-alpha pixels per mark, which flattens
        # the antialiasing on every curved edge. `f_png` returns 8-bit RGBA
        # with ~800-1100 colors and the alpha ramp intact, for roughly twice
        # the bytes. Always fetch `f_png`; a palette-quantized mark looks
        # visibly ragged against a dark cell background.
        #
        # Do not use `t_lazy` as a quality reference when comparing: it is
        # Cloudinary's blurred lazy-load placeholder, not the original.
        "nfl": "https://static.www.nfl.com/f_png/league/api/clubs/logos/{cdn}.png",
        "espn": "https://a.espncdn.com/i/teamlogos/nfl/500/{lower}.png",
    },
    # NO WORKING WORDMARK ENDPOINT (re-checked 2026-08-13).
    #
    # Both templates below 404 on every team. nfl.com itself no longer serves
    # club wordmarks from a templated per-club path at all -- its pages now
    # reference opaque Cloudinary asset ids
    # (/image/private/f_auto/league/kujtrvt65vrfbzvlp9p7), which cannot be
    # derived from an abbreviation. ESPN has no NFL wordmark directory either;
    # /500/wordmark/, /wordmarks/, /500-dark/wordmark/ and the combiner form
    # all 404. Note that ESPN answers some *unknown* logo subpaths (500-dark/,
    # 500/scoreboard/) with the plain logo bytes rather than a 404, so verify a
    # candidate by comparing bytes, not just by getting a 200.
    #
    # The installed wordmarks come from the nflverse/nflplotR mirror via
    # build_team_identity.py and are current. `fetch_team_assets.py wordmarks`
    # is therefore expected to fail until a real endpoint is found; it will
    # skip every team rather than damage what is installed.
    "wordmarks": {
        "nfl": "https://static.www.nfl.com/f_png/league/api/clubs/wordmarks/{cdn}.png",
        "espn": "https://a.espncdn.com/i/teamlogos/nfl/500/wordmark/{lower}.png",
    },
}

USER_AGENT = "bovas-picks/1.0 (personal pick'em tool; asset refresh)"
TIMEOUT = 30
MIN_EDGE = 64


def png_dims(blob: bytes):
    """(width, height) if this is a usable PNG, else None."""
    if len(blob) < 24 or blob[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width, height = struct.unpack_from(">II", blob, 16)
    if width < MIN_EDGE or height < MIN_EDGE:
        return None
    return width, height


def fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.read()
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as exc:
        print(f"    {type(exc).__name__}: {exc}")
        return None


def cmd_fetch(kind, teams, source, dry_run):
    template = SOURCES[kind][source]
    out = ASSETS / kind
    out.mkdir(parents=True, exist_ok=True)
    ok = skipped = 0

    for abbr in teams:
        cdn = CDN_ABBR.get(abbr, abbr)
        url = template.format(cdn=cdn, lower=cdn.lower())
        print(f"  {abbr}: {url}")
        if dry_run:
            skipped += 1
            continue

        blob = fetch(url)
        if blob is None:
            skipped += 1
            continue
        dims = png_dims(blob)
        if dims is None:
            print(f"    not a usable PNG ({len(blob)} bytes) -- keeping existing")
            skipped += 1
            continue

        (out / f"{abbr}.png").write_bytes(blob)
        print(f"    wrote {dims[0]}x{dims[1]}, {len(blob)} bytes")
        ok += 1

    return ok, skipped


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=["logos", "wordmarks"])
    ap.add_argument("--source", choices=["nfl", "espn"], default="nfl",
                    help="which CDN to fetch from (default nfl)")
    ap.add_argument("--only", default=None,
                    help="comma-separated abbreviations, e.g. NYJ,DEN,HOU")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would happen and change nothing")
    args = ap.parse_args()

    teams = TEAMS
    if args.only:
        want = [t.strip().upper() for t in args.only.split(",") if t.strip()]
        unknown = [t for t in want if t not in TEAMS]
        if unknown:
            sys.exit(f"unknown abbreviation(s): {', '.join(unknown)}")
        teams = want

    suffix = " (dry run)" if args.dry_run else ""

    print(f"Fetching {len(teams)} {args.action} from the {args.source} CDN{suffix}")
    ok, skipped = cmd_fetch(args.action, teams, args.source, args.dry_run)
    print(f"\n{ok} written, {skipped} skipped")
    if skipped and not args.dry_run:
        print(f"Some failed -- try --source "
              f"{'espn' if args.source == 'nfl' else 'nfl'} for those")
    if ok:
        print("Now run: python scripts/check_team_assets.py")
    return 0 if (ok or args.dry_run) else 1


if __name__ == "__main__":
    sys.exit(main())
