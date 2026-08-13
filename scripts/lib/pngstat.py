"""Just enough PNG decoding to count the colors in an image.

Pillow isn't available in this repo's toolchain (no build step anywhere, by
convention), and the only question being asked of these images is "which
colors are actually in the artwork, and how much of each" -- so a scanline
unfilter and a Counter is the whole requirement.

Handles 8-bit non-interlaced truecolor, truecolor+alpha, greyscale and
palette PNGs, which covers every asset in assets/teams/.
"""
from __future__ import annotations

import struct
import zlib
from collections import Counter

CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _chunks(blob):
    assert blob[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    i = 8
    while i < len(blob):
        (length,) = struct.unpack_from(">I", blob, i)
        kind = blob[i + 4:i + 8]
        yield kind, blob[i + 8:i + 8 + length]
        i += 8 + length + 4  # length + type + data + crc


def _unfilter(raw, width, height, bpp):
    """Reverse the per-scanline filters PNG applies before deflate."""
    stride = width * bpp
    out = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        filt = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride

        if filt == 1:      # Sub
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif filt == 2:    # Up
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif filt == 3:    # Average
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif filt == 4:    # Paeth
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        elif filt != 0:
            raise ValueError(f"unknown PNG filter {filt}")

        out[y * stride:(y + 1) * stride] = line
        prev = line
    return bytes(out)


def color_counts(path, min_alpha=200):
    """Counter of (r, g, b) -> pixel count, skipping transparent pixels."""
    blob = open(path, "rb").read()
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
    if depth not in (1, 2, 4, 8):
        raise ValueError(f"{path}: unsupported bit depth {depth}")

    nchan = CHANNELS[ctype]
    raw = zlib.decompress(bytes(idat))

    if depth < 8:
        # Sub-byte samples only occur for palette and greyscale images. The
        # filter unit is a whole byte at these depths, so unfilter over packed
        # bytes first, then expand to one index per pixel.
        packed_stride = (width * nchan * depth + 7) // 8
        packed = _unfilter(raw, packed_stride, height, 1)
        mask = (1 << depth) - 1
        per_byte = 8 // depth
        pixels = bytearray()
        for y in range(height):
            row = packed[y * packed_stride:(y + 1) * packed_stride]
            vals = []
            for byte in row:
                for k in range(per_byte):
                    vals.append((byte >> (8 - depth * (k + 1))) & mask)
            pixels.extend(vals[:width * nchan])
        pixels = bytes(pixels)
        bpp = nchan
    else:
        bpp = nchan
        pixels = _unfilter(raw, width, height, bpp)

    counts = Counter()
    for i in range(0, len(pixels), bpp):
        px = pixels[i:i + bpp]
        if ctype == 6:
            if px[3] < min_alpha:
                continue
            counts[(px[0], px[1], px[2])] += 1
        elif ctype == 2:
            counts[(px[0], px[1], px[2])] += 1
        elif ctype == 4:
            if px[1] < min_alpha:
                continue
            counts[(px[0], px[0], px[0])] += 1
        elif ctype == 0:
            counts[(px[0], px[0], px[0])] += 1
        elif ctype == 3:
            idx = px[0]
            if idx < len(trns) and trns[idx] < min_alpha:
                continue
            counts[palette[idx]] += 1
    return counts


def significant_colors(path, min_share=0.005, cap=40):
    """The colors making up at least `min_share` of the visible pixels.

    Anti-aliased edges produce thousands of one-off blends, so a share floor is
    what separates real ink from the gradient between two inks.
    """
    counts = color_counts(path)
    total = sum(counts.values()) or 1
    keep = [(c, n / total) for c, n in counts.most_common(cap) if n / total >= min_share]
    return keep
