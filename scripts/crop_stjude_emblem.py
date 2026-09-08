"""Crop the cross-and-sunburst emblem out of the St. Jude parish lockup.

Pure stdlib: there is no Pillow here and this project has no build step, so the
PNG is decoded, unfiltered, sliced and re-encoded by hand. RGBA 8-bit only,
which is what the source file is (colortype 6, depth 8).

The crop bounds are MEASURED, not guessed: the emblem and the wordmark are
separated by a band of fully transparent columns, so the cut is the first such
gap wide enough to be the real gap rather than a space between glyph strokes.
"""
import os
import struct
import sys
import tempfile
import zlib

SRC = 'assets/stjude/saint-jude-parish.png'
DEST = 'assets/stjude/saint-jude-emblem.png'


def chunks(data):
    i = 8
    while i < len(data):
        length = struct.unpack('>I', data[i:i + 4])[0]
        kind = data[i + 4:i + 8]
        yield kind, data[i + 8:i + 8 + length]
        i += 12 + length


def decode(path):
    raw = open(path, 'rb').read()
    idat = b''
    for kind, payload in chunks(raw):
        if kind == b'IHDR':
            w, h, depth, color, _, _, interlace = struct.unpack('>IIBBBBB', payload)
            assert (depth, color, interlace) == (8, 6, 0), (depth, color, interlace)
        elif kind == b'IDAT':
            idat += payload

    data = zlib.decompress(idat)
    stride = w * 4
    rows = []
    prev = bytearray(stride)

    at = 0
    for _ in range(h):
        ftype = data[at]
        line = bytearray(data[at + 1:at + 1 + stride])
        at += 1 + stride

        # Undo the per-scanline filter (PNG spec 9.2).
        for x in range(stride):
            a = line[x - 4] if x >= 4 else 0
            b = prev[x]
            c = prev[x - 4] if x >= 4 else 0
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

    return w, h, rows


def encode(path, w, h, rows):
    out = bytearray()
    for line in rows:
        out.append(0)          # filter type 0 — none; the art is small
        out.extend(line)

    def chunk(kind, payload):
        return (struct.pack('>I', len(payload)) + kind + payload
                + struct.pack('>I', zlib.crc32(kind + payload) & 0xFFFFFFFF))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(bytes(out), 9))
           + chunk(b'IEND', b''))

    d = os.path.dirname(path) or '.'
    fd, tmp = tempfile.mkstemp(dir=d, suffix='.tmp')
    with os.fdopen(fd, 'wb') as f:
        f.write(png)
    os.replace(tmp, path)


w, h, rows = decode(SRC)

# Column occupancy: how many pixels in each column are not fully transparent.
cols = [sum(1 for y in range(h) if rows[y][x * 4 + 3] > 8) for x in range(w)]
first = next(x for x, n in enumerate(cols) if n)

# The emblem and the wordmark are JOINED by the gold rule that runs the full
# width of the lockup, so there is no fully transparent column anywhere between
# them. The boundary has to be read from the TOP THIRD, above that rule, where
# the sunburst and the "S" of SAINT are genuinely separate.
band = int(h * 0.35)
top_cols = [sum(1 for y in range(band) if rows[y][x * 4 + 3] > 8) for x in range(w)]

# Start from where the EMBLEM starts in that band, not from `first`: the gold
# rule reaches further left than the sunburst does, so scanning from the
# lockup's global left edge finds the empty space before the emblem and calls
# that the gap.
emblem_left = next(x for x, n in enumerate(top_cols) if n)

right = None
run = 0
for x in range(emblem_left, w):
    if top_cols[x] == 0:
        run += 1
        if run >= 6:
            right = x - run + 1
            break
    else:
        run = 0

if right is None:
    sys.exit('no gap found between emblem and wordmark')
top = next(y for y in range(h) if any(rows[y][x * 4 + 3] > 8 for x in range(first, right)))
bottom = max(y for y in range(h) if any(rows[y][x * 4 + 3] > 8 for x in range(first, right))) + 1

pad = 6
x0, x1 = max(0, first - pad), min(w, right)
y0, y1 = max(0, top - pad), min(h, bottom + pad)

crop = [rows[y][x0 * 4:x1 * 4] for y in range(y0, y1)]
encode(DEST, x1 - x0, y1 - y0, crop)

print(f'source   {w} x {h}')
print(f'emblem   x {x0}..{x1}  y {y0}..{y1}')
print(f'wrote    {DEST}  {x1 - x0} x {y1 - y0}  {os.path.getsize(DEST)} bytes')
