#!/usr/bin/env python3
"""Verify every team asset is present and actually contains artwork.

A silently-empty logo is the failure mode that matters here: a 1x1, a fully
transparent frame, or a flat white rectangle all load without error and render
as nothing, which is exactly the kind of quiet wrong the season audit in
js/season.js exists to prevent elsewhere in this repo. So each image is decoded
and checked for real ink, not just stat()'d.

    python scripts/check_team_assets.py

Exits non-zero on any problem, so it can gate a rebuild.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "lib"))
from pngstat import significant_colors, color_counts  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
IDENTITY = REPO / "data" / "teams" / "team-identity.json"

MIN_EDGE = 64        # smallest sane dimension for any of these assets
MIN_VISIBLE = 0.02   # fraction of the frame that must be non-transparent

# Color count is reported but never failed on. Wordmarks are a single ink by
# design, and so are some primary logos -- the Giants' "ny" is one navy. An
# earlier version of this check treated monochrome as a broken extraction and
# flagged 13 perfectly good files.


def main():
    doc = json.loads(IDENTITY.read_text())
    teams = doc["teams"]
    problems = []
    mono = []
    checked = 0

    if len(teams) != 32:
        problems.append(f"expected 32 teams, found {len(teams)}")

    for abbr, team in sorted(teams.items()):
        # Data completeness, not just images. A null uniform side renders as a
        # colorless team rather than an error, and the abbreviation-alias bug
        # that first produced one hit only the four teams the upstream feeds
        # spell differently -- so all 32 get checked on every field that
        # something downstream will style from.
        if not team.get("palette", {}).get("primary", {}).get("hex"):
            problems.append(f"{abbr}: no primary color")
        for side in ("home", "away"):
            if not (team.get("uniforms") or {}).get(side):
                problems.append(f"{abbr}: no {side} uniform")

        for label, rel in team["assets"].items():
            path = REPO / rel
            if not path.exists():
                problems.append(f"{abbr} {label}: missing {rel}")
                continue

            try:
                counts = color_counts(path)
                colors = significant_colors(path)
            except Exception as exc:  # noqa: BLE001 - report, don't crash the sweep
                problems.append(f"{abbr} {label}: undecodable ({exc})")
                continue

            checked += 1
            visible = sum(counts.values())
            import struct
            blob = path.read_bytes()
            width, height = struct.unpack_from(">II", blob, 16)

            if min(width, height) < MIN_EDGE:
                problems.append(f"{abbr} {label}: {width}x{height} is too small")
            if visible / (width * height) < MIN_VISIBLE:
                problems.append(
                    f"{abbr} {label}: only {visible / (width * height):.1%} of the "
                    "frame is opaque -- looks blank")
            mono.append(f"{abbr} {label}") if len(colors) < 2 else None

    print(f"Checked {checked} images across {len(teams)} teams")
    if mono:
        print(f"  {len(mono)} single-ink by design (fine): "
              f"{', '.join(mono[:6])}{' ...' if len(mono) > 6 else ''}")
    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems:
            print(f"  {p}")
        return 1
    print("All assets present and carrying artwork")
    return 0


if __name__ == "__main__":
    sys.exit(main())
