#!/usr/bin/env python3
"""Measure the visible artwork inside each team logo, so marks can be rendered
at a consistent optical size.

THE PROBLEM THIS SOLVES. Every logo in assets/teams/logos/ is a 500x500 canvas,
but the artwork inside is nowhere near the same shape: the Colts horseshoe fills
436x462 of it, the Ravens shield 461x222, the Chargers bolt 462x206. Because the
canvas is square, `object-fit: contain` in ANY box binds on the same dimension
for all 32 — so the box makes no difference and the wide marks render at half
the visual mass of the tall ones. Sizing the *image* per team is the only fix,
and that needs the artwork's real bounding box, which is what this measures.

The output is a hint, not a crop: nothing here modifies the images, so tabs that
do not read it are unaffected.

    python scripts/measure_logo_trim.py

    -> data/teams/logo-trim.json

Pure stdlib — no Pillow, no build step, same constraint as the rest of this
repo. Handles the two encodings actually present in the set (RGBA/8 for 31 of
them, 4-bit palette for one); anything else fails loudly rather than guessing,
because a silently wrong bounding box would just move the inconsistency around.
"""
import glob
import json
import os
import struct
import sys
import tempfile
import zlib

LOGOS = 'assets/teams/logos/*.png'
DEST = 'data/teams/logo-trim.json'

# Below this the pixel is transparent enough to be padding rather than art.
ALPHA_FLOOR = 8


def chunks(raw):
    i = 8
    while i < len(raw):
        length = struct.unpack('>I', raw[i:i + 4])[0]
        yield raw[i + 4:i + 8], raw[i + 8:i + 8 + length]
        i += 12 + length


def unfilter(data, w, h, bpp, stride):
    """Undo the per-scanline filters (PNG spec 9.2)."""
    rows = []
    prev = bytearray(stride)
    at = 0
    for _ in range(h):
        ftype = data[at]
        line = bytearray(data[at + 1:at + 1 + stride])
        at += 1 + stride
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if ftype == 1:
                line[x] = (line[x] + a) & 0xFF
            elif ftype == 2:
                line[x] = (line[x] + b) & 0xFF
            elif ftype == 3:
                line[x] = (line[x] + (a + b) // 2) & 0xFF
            elif ftype == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 0xFF
        rows.append(line)
        prev = line
    return rows


def alpha_bbox(path):
    """(width, height) of the visible artwork, and the canvas it sits on."""
    raw = open(path, 'rb').read()
    idat = b''
    trns = None
    for kind, payload in chunks(raw):
        if kind == b'IHDR':
            w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', payload)
            if interlace:
                sys.exit(f'{path}: interlaced PNGs are not supported')
        elif kind == b'tRNS':
            trns = payload
        elif kind == b'IDAT':
            idat += payload

    data = zlib.decompress(idat)

    if (depth, color) == (8, 6):                       # RGBA
        rows = unfilter(data, w, h, 4, w * 4)
        opaque = lambda x, y: rows[y][x * 4 + 3] > ALPHA_FLOOR

    elif color == 3 and depth in (1, 2, 4, 8):         # palette + tRNS
        per = 8 // depth
        stride = (w + per - 1) // per
        rows = unfilter(data, w, h, 1, stride)
        alpha = list(trns or b'')

        def opaque(x, y):
            byte = rows[y][x // per]
            shift = (per - 1 - (x % per)) * depth
            idx = (byte >> shift) & ((1 << depth) - 1)
            return (alpha[idx] if idx < len(alpha) else 255) > ALPHA_FLOOR

    else:
        sys.exit(f'{path}: unsupported depth {depth} / color type {color}')

    xs = [x for x in range(w) if any(opaque(x, y) for y in range(h))]
    ys = [y for y in range(h) if any(opaque(x, y) for x in range(w))]
    if not xs or not ys:
        sys.exit(f'{path}: image is entirely transparent')

    return xs[-1] - xs[0] + 1, ys[-1] - ys[0] + 1, w, h


marks = {}
for path in sorted(glob.glob(LOGOS)):
    abbr = os.path.basename(path)[:-4]
    bw, bh, cw, ch = alpha_bbox(path)
    marks[abbr] = {'w': bw, 'h': bh, 'canvas': max(cw, ch)}
    print(f'{abbr:4} art {bw:>3} x {bh:<3} on {cw}x{ch}   fill {bw * bh / (cw * ch):.2f}')

doc = {
    'note': ('Visible-artwork bounding box per team mark, in the source image\'s '
             'own pixels. Consumed by markBox() in js/teamIdentity.js to render '
             'marks at a consistent optical size. Regenerate with '
             'scripts/measure_logo_trim.py after any asset refresh.'),
    'marks': marks,
}

fd, tmp = tempfile.mkstemp(dir=os.path.dirname(DEST), suffix='.tmp')
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    json.dump(doc, f, indent=2, sort_keys=True)
    f.write('\n')
os.replace(tmp, DEST)

print(f'\nwrote {DEST} — {len(marks)} marks')
