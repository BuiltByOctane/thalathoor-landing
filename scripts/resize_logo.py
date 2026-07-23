"""Pure-Python PNG decode + box-downsample + encode (no PIL available).
Reads the user-supplied logo PNG and produces the on-page working copy plus
the full favicon/touch-icon set, all without any external image library.
"""
import struct
import zlib
import os

BASE = os.path.join(os.path.dirname(__file__), "..")
SRC = os.path.join(BASE, "assets", "logo", "ccf0ada9-8cd7-46c2-a25c-56f87260829e.png")
LOGO_OUT = os.path.join(BASE, "assets", "logo", "logo-mark.png")
ICON_DIR = os.path.join(BASE, "assets", "icons")


def read_png(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    idx = 8
    w = h = color_type = bit_depth = None
    idat = b""
    while idx < len(data):
        length = struct.unpack("!I", data[idx:idx + 4])[0]
        typ = data[idx + 4:idx + 8]
        chunk = data[idx + 8:idx + 8 + length]
        if typ == b"IHDR":
            w, h, bit_depth, color_type = struct.unpack("!IIBB", chunk[:10])
        elif typ == b"IDAT":
            idat += chunk
        idx += 8 + length + 4
    assert bit_depth == 8, "only 8-bit PNGs supported"
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
    raw = zlib.decompress(idat)
    stride = w * channels + 1
    bpp = channels
    prev = bytearray(w * channels)
    out_rows = []
    for y in range(h):
        row = raw[y * stride:(y + 1) * stride]
        filt = row[0]
        cur = bytearray(row[1:])
        if filt == 1:
            for i in range(bpp, len(cur)):
                cur[i] = (cur[i] + cur[i - bpp]) & 0xff
        elif filt == 2:
            for i in range(len(cur)):
                cur[i] = (cur[i] + prev[i]) & 0xff
        elif filt == 3:
            for i in range(len(cur)):
                a = cur[i - bpp] if i >= bpp else 0
                cur[i] = (cur[i] + (a + prev[i]) // 2) & 0xff
        elif filt == 4:
            for i in range(len(cur)):
                a = cur[i - bpp] if i >= bpp else 0
                b_ = prev[i]
                c_ = prev[i - bpp] if i >= bpp else 0
                p = a + b_ - c_
                pa, pb, pc = abs(p - a), abs(p - b_), abs(p - c_)
                pr = a if (pa <= pb and pa <= pc) else (b_ if pb <= pc else c_)
                cur[i] = (cur[i] + pr) & 0xff
        out_rows.append(cur)
        prev = cur

    # normalize to RGBA
    pixels = [(0, 0, 0, 0)] * (w * h)
    for y in range(h):
        row = out_rows[y]
        for x in range(w):
            o = x * channels
            if channels == 3:
                r, g, b = row[o], row[o + 1], row[o + 2]
                a = 255
            elif channels == 4:
                r, g, b, a = row[o], row[o + 1], row[o + 2], row[o + 3]
            elif channels == 1:
                r = g = b = row[o]
                a = 255
            else:
                r, g = row[o], row[o + 1]
                b = r
                a = g
            pixels[y * w + x] = (r, g, b, a)
    return w, h, pixels


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


def box_resize(src_w, src_h, src_px, dst_w, dst_h):
    dst = [(0, 0, 0, 0)] * (dst_w * dst_h)
    for dy in range(dst_h):
        y0 = dy * src_h // dst_h
        y1 = max(y0 + 1, (dy + 1) * src_h // dst_h)
        for dx in range(dst_w):
            x0 = dx * src_w // dst_w
            x1 = max(x0 + 1, (dx + 1) * src_w // dst_w)
            rs = gs = bs = as_ = 0
            n = 0
            for sy in range(y0, y1):
                base = sy * src_w
                for sx in range(x0, x1):
                    r, g, b, a = src_px[base + sx]
                    rs += r; gs += g; bs += b; as_ += a
                    n += 1
            dst[dy * dst_w + dx] = (rs // n, gs // n, bs // n, as_ // n)
    return dst


def main():
    w, h, px = read_png(SRC)
    print("source:", w, "x", h)

    # working copy for on-page <img> use (2x for retina at ~120px max display)
    logo_size = 300
    logo_px = box_resize(w, h, px, logo_size, logo_size)
    write_png(LOGO_OUT, logo_size, logo_size, logo_px)
    print("wrote logo-mark.png", logo_size)

    os.makedirs(ICON_DIR, exist_ok=True)
    for size, name in [(16, "favicon-16.png"), (32, "favicon-32.png"),
                        (180, "apple-touch-icon.png"), (192, "icon-192.png"),
                        (512, "icon-512.png")]:
        icon_px = box_resize(w, h, px, size, size)
        write_png(os.path.join(ICON_DIR, name), size, size, icon_px)
        print("wrote", name)


if __name__ == "__main__":
    main()
