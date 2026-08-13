"""Write PNGs, and mirror one horizontally.

The companion to pngstat.py's reader, and it exists for one job: a helmet
grabbed by hand arrives facing one way, and the site needs both facings so the
two teams in a matchup face each other. Flipping it here means sourcing 32
images instead of 64.

Still no Pillow and still no build step, per the workspace convention, so this
encodes by hand: raw scanlines with filter 0, deflated, wrapped in the three
chunks that matter. Output is always 8-bit RGBA, which normalises whatever mix
of color types the sources hand us.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

from pngstat import CHANNELS, _chunks, _unfilter


def _chunk(kind: bytes, data: bytes) -> bytes:
    return (struct.pack(">I", len(data)) + kind + data
            + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF))


def write_rgba(path, width: int, height: int, pixels: bytes):
    """Write 8-bit RGBA `pixels` (width*height*4 bytes) as a PNG."""
    expected = width * height * 4
    if len(pixels) != expected:
        raise ValueError(f"expected {expected} bytes of RGBA, got {len(pixels)}")

    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter 0: none. Costs a little size, keeps this simple.
        raw += pixels[y * stride:(y + 1) * stride]

    blob = (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + _chunk(b"IEND", b"")
    )
    Path(path).write_bytes(blob)
    return len(blob)


def read_rgba(path):
    """Decode any supported PNG to (width, height, RGBA bytes)."""
    blob = Path(path).read_bytes()
    width = height = depth = ctype = interlace = None
    idat = bytearray()
    palette = None
    trns = b""

    for kind, data in _chunks(blob):
        if kind == b"IHDR":
            width, height, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", data)
        elif kind == b"PLTE":
            palette = [tuple(data[i:i + 3]) for i in range(0, len(data), 3)]
        elif kind == b"tRNS":
            trns = data
        elif kind == b"IDAT":
            idat += data
        elif kind == b"IEND":
            break

    if interlace != 0:
        raise ValueError(f"{path}: interlaced PNGs not supported")
    if depth != 8:
        raise ValueError(f"{path}: only 8-bit PNGs can be re-encoded (got {depth}); "
                         "convert it first or supply both facings by hand")

    nchan = CHANNELS[ctype]
    src = _unfilter(zlib.decompress(bytes(idat)), width, height, nchan)

    out = bytearray()
    for i in range(0, len(src), nchan):
        px = src[i:i + nchan]
        if ctype == 6:
            out += px
        elif ctype == 2:
            out += bytes((px[0], px[1], px[2], 255))
        elif ctype == 4:
            out += bytes((px[0], px[0], px[0], px[1]))
        elif ctype == 0:
            out += bytes((px[0], px[0], px[0], 255))
        elif ctype == 3:
            r, g, b = palette[px[0]]
            alpha = trns[px[0]] if px[0] < len(trns) else 255
            out += bytes((r, g, b, alpha))
    return width, height, bytes(out)


def flip_horizontal(src, dest):
    """Mirror a PNG left-to-right. Returns (width, height)."""
    width, height, pixels = read_rgba(src)
    stride = width * 4
    out = bytearray(len(pixels))
    for y in range(height):
        row = pixels[y * stride:(y + 1) * stride]
        # Reverse pixel order without reversing the bytes inside each pixel.
        flipped = b"".join(row[x * 4:(x + 1) * 4] for x in range(width - 1, -1, -1))
        out[y * stride:(y + 1) * stride] = flipped
    write_rgba(dest, width, height, bytes(out))
    return width, height
