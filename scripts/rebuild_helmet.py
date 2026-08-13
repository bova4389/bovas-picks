#!/usr/bin/env python3
"""Re-render a helmet in the set's own style, from parts already in the repo.

There is no free source of current NFL helmet renders -- see
docs/REFRESH-TEAM-ASSETS.md section 2. The way out is that we do not need one.
Every file in assets/teams/helmets is the *same drawing*: the silhouette IoU
between any two helmets in the set is exactly 1.0000. A helmet here is only

    shell colour + shared linework + facemask + decal

so a helmet that has changed can be rebuilt from pieces that are already
present, rather than traced from a photograph. A photo cannot work anyway: it
is a three-quarter view against a set drawn in flat side profile, and mirroring
one facing to make the other reverses the lettering.

Recipes live in RECIPES at the bottom. Two are implemented:

  TEN  2026 rebrand -- white shell, new Shield decal, six-string crown stripe.
       The shell comes from IND, which is the template's white-shelled
       instance, so the linework is correct for free.
  NYJ  2024 Legacy   -- keeps its green shell; the 2019 "JETS over a football"
       decal is removed and the 2024 "JETS with a jet" glyph goes on, and the
       facemask changes from black to light.

Both decals are lifted from assets/teams/logos/<ABBR>.png, which the mirror
already carries at the current design.

    python scripts/rebuild_helmet.py TEN --dry-run
    python scripts/rebuild_helmet.py TEN NYJ --out ~/helmets

Then install what it wrote, the same as any hand-grabbed artwork:

    python scripts/fetch_team_assets.py ingest-helmets ~/helmets
    python scripts/check_team_assets.py

Requires numpy. Everything else is stdlib, consistent with the rest of the repo.
"""
from __future__ import annotations

import argparse
import struct
import sys
import zlib
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "scripts" / "lib"))

from pngstat import _chunks, CHANNELS          # noqa: E402
from pngwrite import write_rgba                # noqa: E402

HELMETS = REPO / "assets" / "teams" / "helmets"
LOGOS = REPO / "assets" / "teams" / "logos"

# The template's shared components, read off IND. The facemask is identical
# across the whole set -- (149,149,149) covers exactly 0.12177 of every helmet
# -- and (200,200,200) is the light bar that team colour replaces.
FACEMASK_SHARED = 149
FACEMASK_BAR = 200


# --------------------------------------------------------------------------- #
# PNG io
# --------------------------------------------------------------------------- #
def _unfilter_any(raw, w, h, bpp, stride):
    """Scanline unfilter that also handles sub-byte bit depths.

    pngstat._unfilter assumes at least 8 bits per sample. That holds for the
    helmet renders but not for every logo -- NYJ.png is a 4-bit palette PNG.
    """
    out = bytearray()
    prev = bytearray(stride)
    i = 0
    for _ in range(h):
        f = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 255
        elif f == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
        out += line
        prev = line
    return bytes(out)


def load(path) -> np.ndarray:
    """Any non-interlaced PNG in this repo -> HxWx4 uint8."""
    blob = Path(path).read_bytes()
    hdr = idat = plte = trns = None
    idat = b""
    for kind, data in _chunks(blob):
        if kind == b"IHDR":
            hdr = data
        elif kind == b"IDAT":
            idat += data
        elif kind == b"PLTE":
            plte = data
        elif kind == b"tRNS":
            trns = data
    w, h = struct.unpack_from(">II", hdr, 0)
    depth, ct = hdr[8], hdr[9]
    if hdr[12]:
        raise ValueError(f"{path}: interlaced PNGs are not supported")
    stride = (w * CHANNELS[ct] * depth + 7) // 8
    bpp = max(1, CHANNELS[ct] * depth // 8)
    raw = _unfilter_any(zlib.decompress(idat), w, h, bpp, stride)

    if ct == 6:
        return np.frombuffer(raw, np.uint8).reshape(h, stride)[:, :w * 4].reshape(h, w, 4).copy()
    if ct == 2:
        rgb = np.frombuffer(raw, np.uint8).reshape(h, stride)[:, :w * 3].reshape(h, w, 3)
        return np.dstack([rgb, np.full((h, w), 255, np.uint8)])

    out = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        row = raw[y * stride:(y + 1) * stride]
        for x in range(w):
            if ct == 3:
                if depth == 8:
                    idx = row[x]
                elif depth == 4:
                    idx = (row[x // 2] >> (4 if x % 2 == 0 else 0)) & 15
                elif depth == 2:
                    idx = (row[x // 4] >> (6 - 2 * (x % 4))) & 3
                else:
                    idx = (row[x // 8] >> (7 - (x % 8))) & 1
                out[y, x, 0] = plte[idx * 3]
                out[y, x, 1] = plte[idx * 3 + 1]
                out[y, x, 2] = plte[idx * 3 + 2]
                out[y, x, 3] = trns[idx] if trns and idx < len(trns) else 255
            else:
                out[y, x, :3] = row[x]
                out[y, x, 3] = 255
    return out


def box_resize(rgba, tw, th):
    """Alpha-weighted box downscale. Good enough, and avoids a dependency."""
    h, w, _ = rgba.shape
    out = np.zeros((th, tw, 4), np.uint8)
    ys = np.arange(th + 1) * h // th
    xs = np.arange(tw + 1) * w // tw
    for j in range(th):
        for i in range(tw):
            cell = rgba[ys[j]:max(ys[j] + 1, ys[j + 1]),
                        xs[i]:max(xs[i] + 1, xs[i + 1])].astype(np.float64)
            a = cell[:, :, 3:4] / 255.0
            s = a.sum()
            if s < 1e-6:
                continue
            out[j, i, :3] = np.clip((cell[:, :, :3] * a).sum(axis=(0, 1)) / s, 0, 255)
            out[j, i, 3] = np.clip(cell[:, :, 3].mean(), 0, 255)
    return out


# --------------------------------------------------------------------------- #
# template helpers
# --------------------------------------------------------------------------- #
def facemask_masks(side):
    """(shared grey, light bar) masks, read off the template's IND instance."""
    ind = load(HELMETS / f"IND-{side}.png")
    rgb = ind[:, :, :3].astype(int)
    op = ind[:, :, 3] > 128
    shared = (np.abs(rgb - FACEMASK_SHARED).max(axis=2) < 14) & op
    bar = (np.abs(rgb - FACEMASK_BAR).max(axis=2) < 14) & op
    return ind, shared, bar


def flood_from_border(passable):
    reach = np.zeros_like(passable)
    reach[0, :] = passable[0, :]
    reach[-1, :] = passable[-1, :]
    reach[:, 0] = passable[:, 0]
    reach[:, -1] = passable[:, -1]
    while True:
        grown = reach.copy()
        grown[1:, :] |= reach[:-1, :]
        grown[:-1, :] |= reach[1:, :]
        grown[:, 1:] |= reach[:, :-1]
        grown[:, :-1] |= reach[:, 1:]
        grown &= passable
        if np.array_equal(grown, reach):
            return reach
        reach = grown


def inpaint(img, holes, known):
    """Fill `holes` by diffusion from their rim.

    A per-row median is not enough: the shells carry a two-dimensional
    gradient, so one colour per row leaves the removed decal legible as
    letter-shaped banding. Growing inward from known pixels follows the
    gradient in both directions and leaves no ghost.
    """
    val = img[:, :, :3].astype(np.float64)
    val[holes] = 0.0
    known = known.copy()
    todo = holes.copy()
    for _ in range(400):
        if not todo.any():
            break
        acc = np.zeros_like(val)
        cnt = np.zeros(todo.shape, np.float64)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(val, (dy, dx), axis=(0, 1)) * np.roll(known, (dy, dx), axis=(0, 1))[:, :, None]
            cnt += np.roll(known, (dy, dx), axis=(0, 1))
        fill = todo & (cnt > 0)
        if not fill.any():
            break
        val[fill] = acc[fill] / cnt[fill][:, None]
        known |= fill
        todo &= ~fill
    out = img.copy()
    out[:, :, :3] = np.clip(val, 0, 255).astype(np.uint8)
    return out


def interior_ink(logo, colour_min=225):
    """The wordmark inside a mark, without its outer keyline.

    Several logos are a coloured field with a white keyline around the outside
    and white lettering inside. Taking "all white" grabs the ring too and you
    composite an ellipse onto the helmet. The ring touches the outside, the
    lettering does not, so a flood inward through white separates them.
    """
    rgb = logo[:, :, :3].astype(int)
    a = logo[:, :, 3] > 128
    white = a & (rgb.min(axis=2) > colour_min)
    return white & ~flood_from_border(white | ~a)


def glyph_from(mask, colour=(255, 255, 255)):
    ys, xs = np.nonzero(mask)
    sub = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    g = np.zeros((sub.shape[0], sub.shape[1], 4), np.uint8)
    g[:, :, :3] = colour
    g[:, :, 3] = np.where(sub, 255, 0)
    return g


def paste(img, glyph, centre, width, surface):
    """Composite `glyph` centred at `centre`, clipped to the shell surface.

    The clip matters: at the decal's height the mark can be wider than the flat
    part of the shell, and without it the glyph runs over the crown edge into
    transparency on one facing.
    """
    gw = width
    gh = max(1, round(glyph.shape[0] * gw / glyph.shape[1]))
    g = box_resize(glyph, gw, gh)
    cx, cy = centre
    x0, y0 = cx - gw // 2, cy - gh // 2
    sub = surface[y0:y0 + gh, x0:x0 + gw]
    a = (g[:, :, 3].astype(float) / 255.0) * sub
    reg = img[y0:y0 + gh, x0:x0 + gw]
    reg[:, :, :3] = (g[:, :, :3] * a[:, :, None] + reg[:, :, :3] * (1 - a[:, :, None])).astype(np.uint8)
    img[y0:y0 + gh, x0:x0 + gw] = reg
    return img


def crown_stripe(img, side, bands, span):
    """Bands hugging the crown, drawn only where the crown is near-horizontal.

    Past the shoulders of the shell the top edge falls away steeply and a band
    measured down from it becomes a vertical smear; the front lip flattens again
    and picks up a stray fragment. Hence both a slope gate and an explicit span.
    """
    out = img.copy()
    a = img[:, :, 3] > 128
    h, w = a.shape
    tops = np.full(w, -1)
    for x in range(w):
        col = np.nonzero(a[:, x])[0]
        if col.size:
            tops[x] = col.min()
    total = sum(t for _, t in bands)
    lo, hi = int(w * span[0]), int(w * span[1])
    for x in range(max(2, lo), min(w - 2, hi)):
        if tops[x] < 0 or tops[x - 2] < 0 or tops[x + 2] < 0:
            continue
        if abs(int(tops[x + 2]) - int(tops[x - 2])) / 4.0 > 0.9:
            continue
        y = tops[x] + 4
        if y + total >= h or not a[y:y + total, x].all():
            continue
        for colour, thick in bands:
            out[y:y + thick, x, :3] = colour
            y += thick
    return out


# --------------------------------------------------------------------------- #
# recipes
# --------------------------------------------------------------------------- #
def build_ten(side):
    """2026: white shell from IND, Shield decal, six-string crown stripe."""
    blue = np.array([75, 146, 219])     # #4B92DB, the audited palette value
    red = np.array([200, 16, 46])       # #C8102E
    base, _, _ = facemask_masks(side)
    img = base.copy()

    # Clear the Colts horseshoe -- the only strongly blue ink on that helmet.
    rgb = img[:, :, :3].astype(int)
    op = img[:, :, 3] > 0
    shoe = op & (rgb[:, :, 2] - rgb[:, :, 0] > 25) & (rgb[:, :, 2] > 60)
    img[shoe, :3] = 255

    img = crown_stripe(img, side,
                       [(red, 2), (np.array([255, 255, 255]), 1), (blue, 8),
                        (np.array([255, 255, 255]), 1), (red, 2)],
                       (0.10, 0.62) if side == "right" else (0.38, 0.90))

    # Recolour the mark onto the audited hexes: ESPN renders the Shield in the
    # pre-rebrand values, so the artwork is current but its colour is not.
    logo = load(LOGOS / "TEN.png")
    lr = logo[:, :, :3].astype(int)
    la = logo[:, :, 3] > 8
    sat = lr.max(axis=2) - lr.min(axis=2)
    logo[la & (sat > 30) & (lr[:, :, 2] > lr[:, :, 0]), :3] = blue
    logo[la & (sat > 30) & (lr[:, :, 0] > lr[:, :, 2]), :3] = red

    surface = img[:, :, 3] > 128
    centre = (150, 92) if side == "right" else (200, 92)
    return paste(img, logo, centre, 108, surface)


def build_nyj(side):
    """2024: keep the green shell, swap the decal, lighten the facemask.

    NOT IDEMPOTENT. Unlike the TEN recipe, which composes from IND every time,
    this one edits the Jets' own render in place -- so it must run against the
    2023 artwork. Run it against its own output and it inpaints the new decal
    away and pastes a second one on top. Restore the source first if needed:

        git checkout <2023-commit> -- assets/teams/helmets/NYJ-left.png \\
                                      assets/teams/helmets/NYJ-right.png
    """
    ind, shared, bar = facemask_masks(side)
    img = load(HELMETS / f"NYJ-{side}.png")
    protect = shared | bar

    # The 2023 helmet has a black facemask; a light one means this file has
    # already been rebuilt. Refuse rather than quietly degrade it.
    if img[bar, :3].mean() > 150:
        raise SystemExit(
            f"NYJ-{side}.png already has a light facemask, so it has already been "
            "rebuilt. This recipe edits in place and must start from the 2023 "
            "artwork -- restore it from git before re-running.")

    rgb = img[:, :, :3].astype(int)
    op = img[:, :, 3] > 128
    shell = (op & ~protect
             & (rgb[:, :, 0] < 45)
             & (rgb[:, :, 1] > 60) & (rgb[:, :, 1] < 115)
             & (rgb[:, :, 2] > 20) & (rgb[:, :, 2] < 60))

    # The 2019 mark is white lettering over a dark keyline, so removing "white"
    # strips the fill and leaves the outline as a ghost. Define the decal as
    # whatever inside the panel is not shell green -- fill and keyline alike.
    zone = np.zeros_like(op)
    zone[62:150, 70:242] = True
    decal = op & zone & ~protect & ~shell
    img = inpaint(img, decal, op & ~decal & ~protect)

    img[bar, :3] = FACEMASK_BAR                       # black facemask -> light

    glyph = glyph_from(interior_ink(load(LOGOS / "NYJ.png")))
    surface = (img[:, :, 3] > 128) & ~protect
    centre = (150, 96) if side == "right" else (196, 96)
    return paste(img, glyph, centre, 150, surface)


RECIPES = {"TEN": build_ten, "NYJ": build_nyj}


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("teams", nargs="+", help=f"one or more of: {', '.join(sorted(RECIPES))}")
    ap.add_argument("--out", default=None,
                    help="folder to write into (default: a helmets/ beside the repo)")
    ap.add_argument("--dry-run", action="store_true", help="report and write nothing")
    args = ap.parse_args()

    unknown = [t for t in args.teams if t.upper() not in RECIPES]
    if unknown:
        sys.exit(f"no recipe for: {', '.join(unknown)}. Have: {', '.join(sorted(RECIPES))}")

    out = Path(args.out).expanduser() if args.out else REPO.parent / "helmets"
    if not args.dry_run:
        out.mkdir(parents=True, exist_ok=True)

    for abbr in (t.upper() for t in args.teams):
        for side in ("left", "right"):
            img = RECIPES[abbr](side)
            h, w, _ = img.shape
            print(f"  {abbr}-{side}: {w}x{h}")
            if not args.dry_run:
                write_rgba(out / f"{abbr}-{side}.png", w, h, img.tobytes())

    if args.dry_run:
        print("\ndry run, nothing written")
    else:
        print(f"\nwrote {2 * len(args.teams)} file(s) to {out}")
        print(f"Now run: python scripts/fetch_team_assets.py ingest-helmets {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
