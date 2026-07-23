"""One-off generator for raster favicon/touch-icon PNGs (no PIL available).
Draws a bold, simplified version of the Thalathoor house-glyph mark directly
into a pixel buffer and encodes PNG bytes manually via zlib.
Run once: python3 scripts/gen_favicons.py
"""
import struct
import zlib
import os

CREAM = (0xf6, 0xea, 0xd0)
GOLD = (0xc9, 0xa2, 0x3c)
BROWN = (0x3b, 0x24, 0x15)

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "assets", "icons")
os.makedirs(OUT_DIR, exist_ok=True)


def write_png(path, w, h, pixels):
    def chunk(tag, data):
        c = tag + data
        return struct.pack("!I", len(data)) + c + struct.pack("!I", zlib.crc32(c) & 0xffffffff)

    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack("!IIBBBBB", w, h, 8, 6, 0, 0, 0)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            raw += bytes((r, g, b, a))
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def rounded_square(x, y, w, h, r, px, py):
    if px < x or px >= x + w or py < y or py >= y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    if (px - x - r < 0 or px - (x + w - r) >= 0) and (py - y - r < 0 or py - (y + h - r) >= 0):
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    return True


def in_triangle(p, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign(p, a, b)
    d2 = sign(p, b, c)
    d3 = sign(p, c, a)
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def render(size):
    w = h = size
    px = [(0, 0, 0, 0)] * (w * h)
    border = max(1, round(size * 0.045))

    for y in range(h):
        for x in range(w):
            if rounded_square(0, 0, w, h, size * 0.22, x, y):
                on_border = not rounded_square(border, border, w - 2 * border, h - 2 * border, size * 0.18, x, y)
                px[y * w + x] = (*(GOLD if on_border else CREAM), 255)

    # roof: flared triangle with a flat ridge, plus finial
    peak_l = (size * 0.40, size * 0.34)
    peak_r = (size * 0.60, size * 0.34)
    eave_l = (size * 0.16, size * 0.56)
    eave_r = (size * 0.84, size * 0.56)
    apex = (size * 0.5, size * 0.30)

    for y in range(h):
        for x in range(w):
            p = (x + 0.5, y + 0.5)
            if in_triangle(p, apex, peak_l, eave_l) or in_triangle(p, apex, peak_r, eave_r) or \
               in_triangle(p, peak_l, peak_r, eave_l) or in_triangle(p, peak_r, eave_r, eave_l):
                px[y * w + x] = (*BROWN, 255)

    # finial
    fcx, fcy, fr = size * 0.5, size * 0.24, size * 0.035
    for y in range(h):
        for x in range(w):
            if (x + 0.5 - fcx) ** 2 + (y + 0.5 - fcy) ** 2 <= fr * fr:
                px[y * w + x] = (*BROWN, 255)

    # beam
    beam_y0, beam_y1 = size * 0.56, size * 0.60
    beam_x0, beam_x1 = size * 0.18, size * 0.82
    for y in range(h):
        if not (beam_y0 <= y < beam_y1):
            continue
        for x in range(w):
            if beam_x0 <= x < beam_x1:
                px[y * w + x] = (*BROWN, 255)

    # pillars
    pillar_w = size * 0.045
    for cxr in (0.42, 0.50, 0.58):
        cx = size * cxr
        for y in range(h):
            if not (beam_y1 <= y < size * 0.82):
                continue
            for x in range(w):
                if cx - pillar_w / 2 <= x < cx + pillar_w / 2:
                    px[y * w + x] = (*BROWN, 255)

    return px


def main():
    for size, name in [(16, "favicon-16.png"), (32, "favicon-32.png"),
                        (180, "apple-touch-icon.png"), (192, "icon-192.png"),
                        (512, "icon-512.png")]:
        write_png(os.path.join(OUT_DIR, name), size, size, render(size))
        print("wrote", name)


if __name__ == "__main__":
    main()
