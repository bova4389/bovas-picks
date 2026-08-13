#!/usr/bin/env python3
"""Refresh team marks from official CDNs, or install ones grabbed by hand.

The everyday build (scripts/build_team_identity.py) reads GitHub mirrors,
because that is all a Claude Code web session in this repo can reach -- its
egress policy allows GitHub and answers 403 for nfl.com and espncdn.com. Run
this one from a machine with normal network access.

Fetch current logos or wordmarks from a CDN:

    python scripts/fetch_team_assets.py logos --dry-run
    python scripts/fetch_team_assets.py logos
    python scripts/fetch_team_assets.py wordmarks --only NYJ,DEN,HOU

Install helmets downloaded by hand (see docs/REFRESH-TEAM-ASSETS.md):

    python scripts/fetch_team_assets.py ingest-helmets ~/Downloads/helmets

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
        "nfl": "https://static.www.nfl.com/t_q-best/league/api/clubs/logos/{cdn}.png",
        "espn": "https://a.espncdn.com/i/teamlogos/nfl/500/{lower}.png",
    },
    "wordmarks": {
        "nfl": "https://static.www.nfl.com/t_q-best/league/api/clubs/wordmarks/{cdn}.png",
        "espn": "https://a.espncdn.com/i/teamlogos/nfl/500/wordmark/{lower}.png",
    },
}

# Helmet decals face forward on BOTH sides of a real helmet, so the two facings
# are drawn separately rather than mirrored -- flipping one reverses the decal
# and gives you backwards lettering. Measured against the hand-drawn pair, a
# flip matches the shell silhouette to ~2% but the decal region differs by
# 7-12%. These teams' marks are symmetric enough for --mirror to pass; every
# other team needs both facings sourced properly.
MIRROR_SAFE = {"DAL", "IND", "GB", "CLE", "NYG", "CHI", "PIT", "NO"}

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


def cmd_ingest_helmets(folder: Path, teams, mirror: bool, dry_run: bool):
    """Install hand-downloaded helmets from `folder` into assets/teams/helmets.

    Accepts, per team, either both facings (ABBR-left.png / ABBR-right.png) or
    a single ABBR.png plus --facing, which is only installed for both sides
    when --mirror is passed and the team's decal survives mirroring.
    """
    out = ASSETS / "helmets"
    out.mkdir(parents=True, exist_ok=True)
    installed = []
    problems = []

    for abbr in teams:
        found = {}
        for facing in ("left", "right"):
            for name in (f"{abbr}-{facing}.png", f"{abbr}_{facing}.png"):
                cand = folder / name
                if cand.exists():
                    found[facing] = cand
                    break

        single = next((folder / n for n in (f"{abbr}.png",) if (folder / n).exists()), None)

        if not found and single is None:
            continue  # team not in this drop; leave whatever is installed

        # A single file can only cover both facings by mirroring, which is
        # lossy for directional decals -- refuse rather than ship a helmet with
        # backwards lettering.
        if single is not None and len(found) < 2:
            if not mirror:
                problems.append(
                    f"{abbr}: only {single.name} supplied. Provide "
                    f"{abbr}-left.png and {abbr}-right.png, or pass --mirror "
                    "to flip one (reverses the decal)")
                continue
            if abbr not in MIRROR_SAFE:
                problems.append(
                    f"{abbr}: --mirror would reverse a directional decal. "
                    f"Supply {abbr}-left.png and {abbr}-right.png instead")
                continue
            found = {"right": single}

        for facing, src in sorted(found.items()):
            blob = src.read_bytes()
            dims = png_dims(blob)
            if dims is None:
                problems.append(f"{abbr}: {src.name} is not a usable PNG")
                continue
            print(f"  {abbr} {facing:5} <- {src.name} ({dims[0]}x{dims[1]})")
            if not dry_run:
                (out / f"{abbr}-{facing}.png").write_bytes(blob)
            installed.append(f"{abbr}-{facing}")

        # Mirror to fill the other facing when allowed.
        if mirror and len(found) == 1 and abbr in MIRROR_SAFE:
            have = next(iter(found))
            other = "left" if have == "right" else "right"
            print(f"  {abbr} {other:5} <- mirrored from {have} (decal reversed)")
            if not dry_run:
                from pngwrite import flip_horizontal
                flip_horizontal(out / f"{abbr}-{have}.png", out / f"{abbr}-{other}.png")
            installed.append(f"{abbr}-{other}")

    return installed, problems


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("action", choices=["logos", "wordmarks", "ingest-helmets"])
    ap.add_argument("folder", nargs="?", default=None,
                    help="for ingest-helmets: the folder holding downloaded PNGs")
    ap.add_argument("--source", choices=["nfl", "espn"], default="nfl",
                    help="which CDN to fetch from (default nfl)")
    ap.add_argument("--only", default=None,
                    help="comma-separated abbreviations, e.g. NYJ,DEN,HOU")
    ap.add_argument("--mirror", action="store_true",
                    help="ingest: fill a missing facing by flipping the other "
                         "(only for teams whose decal survives it)")
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

    if args.action == "ingest-helmets":
        if not args.folder:
            sys.exit("ingest-helmets needs a folder: "
                     "python scripts/fetch_team_assets.py ingest-helmets ~/Downloads/helmets")
        folder = Path(args.folder).expanduser()
        if not folder.is_dir():
            sys.exit(f"not a folder: {folder}")

        print(f"Ingesting helmets from {folder}{suffix}")
        installed, problems = cmd_ingest_helmets(folder, teams, args.mirror, args.dry_run)
        print(f"\n{len(installed)} facing(s) installed")
        if problems:
            print(f"{len(problems)} skipped:")
            for p in problems:
                print(f"  {p}")
        if not installed and not problems:
            print("  Nothing matched. Files must be named ABBR-left.png / "
                  "ABBR-right.png, e.g. NYJ-left.png")
        if installed and not args.dry_run:
            print("\nNow run: python scripts/check_team_assets.py")
        return 1 if problems and not installed else 0

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
