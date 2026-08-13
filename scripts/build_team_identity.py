#!/usr/bin/env python3
"""Build the team identity backbone: logos, wordmarks, palettes, uniforms.

Writes
  assets/teams/logos/<ABBR>.png            500x500 primary logo
  assets/teams/wordmarks/<ABBR>.png        team wordmark
  data/teams/team-identity.json            palettes + home/away uniforms + asset paths

Everything is keyed by the 32 abbreviations in js/teams.js, which is the crosswalk
authority for this repo. The upstream sources spell three of them differently
(JAX for JAC, LA for LAR, OAK/Oakland for LV), so every lookup goes through
ALIASES rather than assuming the key matches.

Sources are public GitHub repos, cloned into a cache dir. GitHub is the only
egress this repo's web sessions get, which is why nothing here talks to
espncdn.com or nfl.com directly -- see scripts/fetch_team_assets.py for the
refresh path that does, for running somewhere with open network access.

    python scripts/build_team_identity.py [--cache DIR] [--no-clone]
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import struct
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, timezone, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "lib"))
from rdata import read_rda  # noqa: E402

REPO = Path(__file__).resolve().parent.parent

# Upstream repos. Pinned to a branch rather than a SHA on purpose: these are
# the maintained mirrors, and a rebrand should flow in on the next rebuild.
SOURCES = {
    "nflplotR": ("https://github.com/nflverse/nflplotR.git", "main"),
    "nfl-images": ("https://github.com/ajreinhard/data-viz.git", "master"),
    "teamcolors": ("https://github.com/jimniels/teamcolors.git", "main"),
    "nfldata": ("https://github.com/nflverse/nfldata.git", "master"),
}

# The 32 current teams, in the order js/teams.js lists them.
TEAMS = [
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE",
    "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAC", "KC",
    "LAC", "LAR", "LV", "MIA", "MIN", "NE", "NO", "NYG",
    "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
]

# Our abbreviation -> the abbreviations upstream sources use for the same team,
# best first. Lookups walk the list and take the first hit.
ALIASES = {
    "JAC": ["JAC", "JAX"],
    "LAR": ["LAR", "LA", "STL"],
    "LV": ["LV", "OAK"],
    "LAC": ["LAC", "SD"],
}

DIVISIONS = {
    "AFC East": ["BUF", "MIA", "NE", "NYJ"],
    "AFC North": ["BAL", "CIN", "CLE", "PIT"],
    "AFC South": ["HOU", "IND", "JAC", "TEN"],
    "AFC West": ["DEN", "KC", "LAC", "LV"],
    "NFC East": ["DAL", "NYG", "PHI", "WAS"],
    "NFC North": ["CHI", "DET", "GB", "MIN"],
    "NFC South": ["ATL", "CAR", "NO", "TB"],
    "NFC West": ["ARI", "LAR", "SEA", "SF"],
}

# teamcolors keys on full name and still carries some pre-relocation ones.
TEAMCOLORS_NAMES = {"LV": "Oakland Raiders"}

# Helmets are deliberately not built. The 2023 upstream renders were dropped on
# 2026-08-13 -- at the ~28px this site shows a team mark at, they read as grey
# blobs, and the two that were rebuilt to the current designs did not change
# that. `uniforms.<side>.helmet` is a COLOUR and still comes from the uniform
# observations; only the images are gone. Git history has them.

# Uniform observations run 1999-2020. Anything earlier is a different era of
# uniform design; anything later doesn't exist in the feed.
UNIFORM_WINDOW = (2015, 2020)

# Teams that changed uniform design after the observation window closed, so the
# derived uniform is a palette-correct approximation of a since-redesigned kit.
REDESIGNED_SINCE = {
    "WAS": "Rebranded to Commanders in 2022.",
    "NYJ": "New uniform set in 2024.",
    "DEN": "New uniform set in 2024.",
    "HOU": "New uniform set in 2024.",
}

WHITE, BLACK = "#FFFFFF", "#000000"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def alias(abbr):
    """Candidate upstream keys for one of our abbreviations, best first."""
    return ALIASES.get(abbr, [abbr])


def pick(mapping, abbr):
    """First value in `mapping` matching any alias of `abbr`."""
    for key in alias(abbr):
        if key in mapping:
            return mapping[key]
    return None


def norm_hex(value):
    """'97233f' / '#97233F' -> '#97233F'. None passes through."""
    if not value:
        return None
    value = str(value).strip().lstrip("#")
    if len(value) != 6:
        return None
    return "#" + value.upper()


def rgb(hex_value):
    h = hex_value.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def snap(sampled, palette):
    """Snap a colour sampled off a broadcast still to the nearest official one.

    The uniform feed's values come from images, so a white jersey reads as
    #FEFEFE and a red one lands a few points off the style-guide red. Snapping
    keeps the JSON to real palette colours instead of near-miss noise.
    """
    if not sampled:
        return None
    target = rgb(sampled)
    candidates = list(dict.fromkeys(palette + [WHITE, BLACK]))
    return min(candidates, key=lambda c: sum((a - b) ** 2 for a, b in zip(target, rgb(c))))


def png_size(blob):
    return struct.unpack_from(">II", blob, 16)


def ensure_sources(cache: Path, clone: bool):
    cache.mkdir(parents=True, exist_ok=True)
    for name, (url, branch) in SOURCES.items():
        dest = cache / name
        if dest.exists():
            continue
        if not clone:
            sys.exit(f"missing source {dest} and --no-clone was passed")
        print(f"  cloning {name} ...", flush=True)
        subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", branch, "--quiet", url, str(dest)],
            check=True,
        )
    return cache


# --------------------------------------------------------------------------- #
# extraction
# --------------------------------------------------------------------------- #
def extract_images(cache: Path, out: Path):
    """Logos + wordmarks out of nflplotR's R blob."""
    sysdata = read_rda(cache / "nflplotR" / "R" / "sysdata.rda")
    logos, wordmarks = sysdata["logo_list"], sysdata["wordmark_list"]

    written = defaultdict(dict)

    for kind in ("logos", "wordmarks"):
        (out / kind).mkdir(parents=True, exist_ok=True)

    for abbr in TEAMS:
        logo = pick(logos, abbr)
        if not logo or logo[:4] != b"\x89PNG":
            sys.exit(f"{abbr}: no logo PNG in sysdata.rda")
        (out / "logos" / f"{abbr}.png").write_bytes(logo)
        written[abbr]["logo"] = png_size(logo)

        mark = pick(wordmarks, abbr)
        if mark and mark[:4] == b"\x89PNG":
            (out / "wordmarks" / f"{abbr}.png").write_bytes(mark)
            written[abbr]["wordmark"] = png_size(mark)

    return written


def load_names(cache: Path, season: int):
    rows = list(csv.DictReader(open(cache / "nfldata" / "data" / "teams.csv")))
    latest = max(int(r["season"]) for r in rows)
    year = min(season, latest)
    by_abbr = {}
    for row in rows:
        if int(row["season"]) != year:
            continue
        for abbr in TEAMS:
            if row["team"] in alias(abbr):
                by_abbr[abbr] = {
                    "fullName": row["full"],
                    "location": row["location"],
                    "mascot": row["nickname"],
                }
    return by_abbr, year


def load_palettes(cache: Path):
    """nflverse primary/secondary, enriched with style-guide depth where it agrees.

    These are two different colour authorities, not a good one and a bad one:

    - nflverse mirrors ESPN's team feed. It tracks rebrands promptly, and the
      values are screen-tuned -- often a more saturated take on the same ink.
    - jimniels/teamcolors mirrors club style guides, so it is the only source of
      Pantone and CMYK, but it lags rebrands by years.

    Web design wants the screen values, so nflverse sets primary/secondary.
    Pantone/CMYK is attached only when the style guide agrees on those exact
    hexes -- a print reference bound to the wrong colour is worse than none.
    Sampling the logo artwork to break ties was tried and abandoned: ESPN
    re-renders the marks with their own colour treatment (the Bears logo ships
    as #FF3F00 against an official #C83803), so it is a third opinion rather
    than a tiebreaker.
    """
    sysdata = read_rda(cache / "nflplotR" / "R" / "sysdata.rda")
    primary = {k: norm_hex(v) for k, v in sysdata["primary_colors"].items()}
    secondary = {k: norm_hex(v) for k, v in sysdata["secondary_colors"].items()}

    raw = json.load(open(cache / "teamcolors" / "src" / "teams.json"))
    by_name = {t["name"]: t for t in raw if t.get("league") == "nfl"}

    out, notes = {}, {}
    for abbr in TEAMS:
        prim, sec = pick(primary, abbr), pick(secondary, abbr)
        if not prim:
            sys.exit(f"{abbr}: no primary colour in sysdata.rda")

        entry = {
            "primary": {"hex": prim, "source": "nflverse"},
            "secondary": {"hex": sec, "source": "nflverse"} if sec else None,
            "additional": [],
        }

        name = TEAMCOLORS_NAMES.get(abbr)
        record = by_name.get(name) if name else None
        if record is None:
            record = next(
                (t for n, t in by_name.items() if n.endswith(" " + _mascot_hint(abbr))),
                None,
            )

        if record:
            hexes = [norm_hex(h) for h in record["colors"]["hex"]]
            pms = record["colors"].get("pms") or []
            cmyk = record["colors"].get("cmyk") or []
            detail = {
                h: {"pantone": pms[i] if i < len(pms) else None,
                    "cmyk": cmyk[i] if i < len(cmyk) else None}
                for i, h in enumerate(hexes) if h
            }
            # Agreement is tested as a set, not in order. Several teams'
            # style guides lead with black (Bengals, Jaguars, Raiders) while the
            # maintained feed leads with the colour you'd actually paint a card
            # in, and that ordering difference is not staleness.
            present = {h for h in hexes}
            agrees = prim in present and (sec is None or sec in present)

            if agrees:
                for key in ("primary", "secondary"):
                    slot = entry[key]
                    if slot and slot["hex"] in detail:
                        slot.update(detail[slot["hex"]])
                        slot["source"] = "nflverse+style-guide"
                taken = {prim, sec}
                entry["additional"] = [
                    {"hex": h, "source": "style-guide", **detail[h]}
                    for h in hexes if h not in taken
                ]
            else:
                # The two authorities describe different palettes. Record both
                # rather than silently picking one: usually the style guide
                # predates a rebrand, but sometimes the screen feed carries a
                # shifted value, and which is which needs an eye on the actual
                # club style guide.
                entry["disagreement"] = {
                    "screen": {"primary": prim, "secondary": sec},
                    "styleGuideMirror": hexes,
                }
                notes[abbr] = (
                    "Colour authorities disagree, so Pantone/CMYK is withheld. "
                    f"Screen feed: {prim}" + (f" / {sec}" if sec else "")
                    + f". Style-guide mirror: {', '.join(h for h in hexes if h)}. "
                    "The primary/secondary here are the screen values, correct "
                    "for web use; confirm against the club style guide before "
                    "any print or apparel use."
                )

        out[abbr] = entry
    return out, notes


_MASCOT_HINTS = {
    "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills",
    "CAR": "Panthers", "CHI": "Bears", "CIN": "Bengals", "CLE": "Browns",
    "DAL": "Cowboys", "DEN": "Broncos", "DET": "Lions", "GB": "Packers",
    "HOU": "Texans", "IND": "Colts", "JAC": "Jaguars", "KC": "Chiefs",
    "LAC": "Chargers", "LAR": "Rams", "LV": "Raiders", "MIA": "Dolphins",
    "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants",
    "NYJ": "Jets", "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks",
    "SF": "49ers", "TB": "Buccaneers", "TEN": "Titans", "WAS": "Commanders",
}


def _mascot_hint(abbr):
    return _MASCOT_HINTS[abbr]


def load_uniforms(cache: Path, palettes):
    """Derive each team's home and away kit from per-game uniform observations.

    game_id is SEASON_WEEK_AWAY_HOME, so the same feed says which side a team
    was on. Take the modal jersey/pants/helmet for each side, then snap to the
    official palette.
    """
    path = cache / "nfl-images" / "uniforms" / "team_game_uniforms.csv"
    rows = list(csv.DictReader(open(path)))
    lo, hi = UNIFORM_WINDOW

    # abbr -> side -> Counter of (jersey, pants, helmet, socks)
    seen = defaultdict(lambda: defaultdict(Counter))
    whites = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    # Upstream key -> our abbreviation. Note the direction: the feed says JAX,
    # LA and OAK, and we need to arrive at JAC, LAR and LV. Building this the
    # other way round silently leaves exactly those four teams with no uniform
    # at all, which is why check_team_assets.py now asserts both sides exist.
    canonical = {key: abbr for abbr in TEAMS for key in alias(abbr)}

    for row in rows:
        season = int(row["game_id"][:4])
        if not lo <= season <= hi:
            continue
        parts = row["game_id"].split("_")
        if len(parts) < 4:
            continue
        away, home = parts[2], parts[3]
        team = row["team"]
        abbr = canonical.get(team)
        if abbr is None:
            continue
        side = "home" if team == home else "away" if team == away else None
        if side is None:
            continue

        kit = tuple(norm_hex(row[c]) for c in ("backbone", "pants", "helmet", "socks"))
        seen[abbr][side][kit] += 1

        tally = whites[abbr][side]
        tally[1] += 1
        if min(rgb(kit[0])) > 200:
            tally[0] += 1

    out = {}
    for abbr in TEAMS:
        # Snap against every colour known for the team, including the
        # style-guide hexes withheld from the published palette. Those are still
        # real team colours, and without them a navy jersey snaps to black:
        # the Chargers publish only powder blue and yellow, so their navy had
        # nowhere nearer to land.
        palette = [c["hex"] for c in _palette_colors(palettes[abbr])]
        withheld = palettes[abbr].get("disagreement", {}).get("styleGuideMirror") or []
        snap_targets = list(dict.fromkeys(palette + [h for h in withheld if h]))
        team_out = {}
        for side in ("home", "away"):
            counts = seen[abbr][side]
            if not counts:
                team_out[side] = None
                continue
            kit, n = counts.most_common(1)[0]
            jersey, pants, helmet, socks = kit
            white_n, total = whites[abbr][side]
            team_out[side] = {
                "jersey": snap(jersey, snap_targets),
                "pants": snap(pants, snap_targets),
                "helmet": snap(helmet, snap_targets),
                "socks": snap(socks, snap_targets),
                # What was actually observed, before snapping. Kept so a
                # surprising colour can be traced to either the sample or the
                # snap rather than guessed at.
                "sampled": {"jersey": jersey, "pants": pants,
                            "helmet": helmet, "socks": socks},
                "kind": "white" if min(rgb(jersey)) > 200 else "color",
                "whiteJerseyRate": round(white_n / total, 3) if total else None,
                "observations": total,
                "modalShare": round(n / sum(counts.values()), 3),
            }
        out[abbr] = team_out
    return out


def _palette_colors(entry):
    colors = [entry["primary"]]
    if entry.get("secondary"):
        colors.append(entry["secondary"])
    colors.extend(entry.get("additional") or [])
    return colors


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default=None,
                    help="where to clone upstream sources (default .cache/team-sources)")
    ap.add_argument("--no-clone", action="store_true",
                    help="fail instead of cloning missing sources")
    ap.add_argument("--season", type=int, default=None,
                    help="season to label the output with (default: current)")
    args = ap.parse_args()

    today = date.today()
    season = args.season or (today.year if today.month >= 3 else today.year - 1)
    cache = Path(args.cache) if args.cache else REPO / ".cache" / "team-sources"

    print("Sources")
    ensure_sources(cache, clone=not args.no_clone)

    print("Images")
    assets = REPO / "assets" / "teams"
    written = extract_images(cache, assets)
    print(f"  {len(written)} teams: logos, wordmarks")

    print("Names")
    names, name_year = load_names(cache, season)
    missing = [t for t in TEAMS if t not in names]
    if missing:
        sys.exit(f"no {name_year} name rows for: {', '.join(missing)}")
    print(f"  from the {name_year} team table")

    print("Palettes")
    palettes, palette_notes = load_palettes(cache)
    enriched = sum(1 for p in palettes.values() if p["additional"])
    print(f"  32 primary/secondary; {enriched} with Pantone/CMYK depth; "
          f"{len(palette_notes)} where the authorities disagree")

    print("Uniforms")
    uniforms = load_uniforms(cache, palettes)
    lo, hi = UNIFORM_WINDOW
    white_home = [t for t in TEAMS
                  if (uniforms[t].get("home") or {}).get("kind") == "white"]
    print(f"  derived from {lo}-{hi} observations; "
          f"white at home: {', '.join(white_home) or 'none'}")

    division_of = {t: d for d, ts in DIVISIONS.items() for t in ts}

    teams = {}
    for abbr in TEAMS:
        conf, div = division_of[abbr].split(" ")
        rel = f"assets/teams"
        entry = {
            "abbr": abbr,
            **names[abbr],
            "conference": conf,
            "division": div,
            "palette": palettes[abbr],
            "uniforms": uniforms[abbr],
            "assets": {
                "logo": f"{rel}/logos/{abbr}.png",
                "wordmark": f"{rel}/wordmarks/{abbr}.png",
            },
        }
        notes = []
        if abbr in palette_notes:
            notes.append(palette_notes[abbr])
        if abbr in REDESIGNED_SINCE:
            notes.append(
                f"{REDESIGNED_SINCE[abbr]} Uniform colours are derived from "
                f"{lo}-{hi} observations snapped to the current palette, so the "
                "colours are right and the design details may not be."
            )
        if notes:
            entry["notes"] = notes
        teams[abbr] = entry

    doc = {
        "season": season,
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generatedBy": "scripts/build_team_identity.py",
        "provenance": {
            "palettePrimary": "nflverse/nflplotR, mirroring ESPN's team feed: "
                              "screen-tuned and tracks rebrands promptly",
            "paletteExtended": "jimniels/teamcolors, mirroring club style guides "
                               "(Pantone/CMYK); lags rebrands, so it is withheld "
                               "per-team wherever it disagrees on primary or "
                               "secondary",
            "logos": "nflverse/nflplotR embedded 500x500 PNGs",
            "wordmarks": "nflverse/nflplotR embedded PNGs",
            "uniforms": f"ajreinhard/data-viz per-game uniform observations, "
                        f"{lo}-{hi}, modal kit per side, snapped to palette",
            "names": f"nflverse/nfldata {name_year} team table",
            "trademarkNotice": "assets/teams/NOTICE.md",
        },
        "uniformWindow": {"from": lo, "to": hi},
        "teams": teams,
    }

    out = REPO / "data" / "teams" / "team-identity.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"\nWrote {out.relative_to(REPO)}")

    total = sum(1 for _ in (assets).rglob("*.png"))
    print(f"Wrote {total} images under {assets.relative_to(REPO)}")


if __name__ == "__main__":
    main()
