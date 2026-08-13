"""Minimal reader for R's XDR serialization (RDX2/RDX3 .rda files).

Enough of the format to pull named lists of raw vectors and character
vectors out of nflplotR's R/sysdata.rda. Not a general R reader.
"""
import bz2
import gzip
import struct
import sys

NILVALUE = 254
GLOBALENV = 253
REF = 255
SYMSXP, LISTSXP, CLOSXP = 1, 2, 3
CHARSXP, LGLSXP, INTSXP, REALSXP = 9, 10, 13, 14
STRSXP, VECSXP = 16, 19
RAWSXP = 24
ALTREP = 238


class Reader:
    def __init__(self, buf):
        self.b = buf
        self.i = 0
        self.refs = []

    def int(self):
        v = struct.unpack_from(">i", self.b, self.i)[0]
        self.i += 4
        return v

    def dbl(self):
        v = struct.unpack_from(">d", self.b, self.i)[0]
        self.i += 8
        return v

    def raw(self, n):
        v = self.b[self.i:self.i + n]
        self.i += n
        return v

    def item(self):
        flags = self.int()
        typ = flags & 0xFF
        has_attr = bool(flags & (1 << 9))
        has_tag = bool(flags & (1 << 10))

        if typ == NILVALUE:
            return None
        if typ == REF:
            idx = flags >> 8
            if idx == 0:
                idx = self.int()
            return self.refs[idx - 1]
        if typ == GLOBALENV:
            return "<globalenv>"

        if typ == SYMSXP:
            name = self.item()
            self.refs.append(name)
            return name

        if typ == CHARSXP:
            n = self.int()
            if n < 0:
                return None
            return self.raw(n).decode("latin-1")

        if typ == LISTSXP:
            # pairlist: used for attributes
            out = {}
            while True:
                tag = self.item() if has_tag else None
                val = self.item()
                out[tag] = val
                flags = self.int()
                typ = flags & 0xFF
                if typ == NILVALUE:
                    break
                has_tag = bool(flags & (1 << 10))
            return out

        if typ in (LGLSXP, INTSXP):
            n = self.int()
            vals = [self.int() for _ in range(n)]
        elif typ == REALSXP:
            n = self.int()
            vals = [self.dbl() for _ in range(n)]
        elif typ == RAWSXP:
            n = self.int()
            vals = self.raw(n)
        elif typ == STRSXP:
            n = self.int()
            vals = [self.item() for _ in range(n)]
        elif typ == VECSXP:
            n = self.int()
            vals = [self.item() for _ in range(n)]
        else:
            raise NotImplementedError(f"SEXP type {typ} at byte {self.i}")

        if has_attr:
            attrs = self.item()
            names = attrs.get("names") if isinstance(attrs, dict) else None
            if names and len(names) == len(vals):
                return dict(zip(names, vals))
        return vals


def read_rda(path):
    blob = open(path, "rb").read()
    if blob[:2] == b"BZ":
        blob = bz2.decompress(blob)
    elif blob[:2] == b"\x1f\x8b":
        blob = gzip.decompress(blob)

    assert blob[:4] in (b"RDX2", b"RDX3"), blob[:4]
    nl = blob.index(b"\n")
    rest = blob[nl + 1:]
    assert rest[:2] == b"X\n", rest[:2]
    r = Reader(rest[2:])
    r.int()          # serialization version
    r.int()          # writer R version
    r.int()          # min reader R version
    if blob[:4] == b"RDX3":
        n = r.int()  # native encoding string
        r.raw(n)
    # top level of an .rda is a tagged pairlist of objects
    return r.item()


if __name__ == "__main__":
    objs = read_rda(sys.argv[1])
    for k, v in objs.items():
        kind = type(v).__name__
        size = len(v) if hasattr(v, "__len__") else "-"
        print(f"{k:24} {kind:6} n={size}")
