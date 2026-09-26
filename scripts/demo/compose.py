"""Compose the Shoebox demo: time remap (reading sped up), eased camera zooms, captions.
python3 compose.py <recdir> <outdir>
"""
import bisect
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

rec, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
m = json.load(open(os.path.join(rec, "manifest.json")))
start = m["marks"]["start"]
frames = m["frames"]
ts = [f["t"] - start for f in frames]
mk = {k: v - start for k, v in m["marks"].items()}
bx = m["boxes"]

FPS, W, H = 30, 1920, 1200
VW, VH, DSF = 1440, 900, 2

# ---------------- time: reading plays fast, everything else real time
T0, T1 = 0.35, mk["end"] - 0.25
A, B, SPEED = mk["click"] + 0.45, mk["done"] - 0.2, 6.0


def out_t(t):
    t = max(T0, min(T1, t))
    if t <= A:
        return t - T0
    if t <= B:
        return (A - T0) + (t - A) / SPEED
    return (A - T0) + (B - A) / SPEED + (t - B)


def in_t(o):
    oa = A - T0
    ob = oa + (B - A) / SPEED
    if o <= oa:
        return o + T0
    if o <= ob:
        return A + (o - oa) * SPEED
    return B + (o - ob)


DUR = out_t(T1)
O = {k: out_t(v) for k, v in mk.items()}

# ---------------- camera
FULL = (VW / 2, VH / 2, 1.0)


def region(*boxes, pad=30):
    x0 = min(b["x"] for b in boxes) - pad
    y0 = min(b["y"] for b in boxes) - pad
    x1 = max(b["x"] + b["w"] for b in boxes) + pad
    y1 = max(b["y"] + b["h"] for b in boxes) + pad
    w, h = x1 - x0, y1 - y0
    ratio = VW / VH
    if w / h < ratio:
        w = h * ratio
    return ((x0 + x1) / 2, (y0 + y1) / 2, VW / w)


HEAD = region(bx["stampFix"], bx["head"])
PROB = region(bx["grand"], bx["problem"])
OK = region(bx["stampOk"], bx["head"])

keys = [
    (0.0, FULL),
    (O["done"] - 0.05, FULL),
    (O["done"] + 0.6, HEAD),
    (O["scrollDown"], HEAD),
    (O["scrolled"] + 0.25, PROB),
    (O["typed"] + 0.05, PROB),
    (O["top"] + 0.1, OK),
    (O["save"] - 0.6, OK),
    (O["save"] + 0.05, FULL),
    (DUR + 1, FULL),
]


def ease(p):
    return 4 * p * p * p if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def camera(t):
    for (ta, ca), (tb, cb) in zip(keys, keys[1:]):
        if ta <= t <= tb:
            p = 0 if tb == ta else ease((t - ta) / (tb - ta))
            # interpolate zoom in log space so it feels even
            za, zb = ca[2], cb[2]
            z = za * (zb / za) ** p
            return (ca[0] + (cb[0] - ca[0]) * p, ca[1] + (cb[1] - ca[1]) * p, z)
    return keys[-1][1]


def crop_box(cx, cy, z):
    cw, ch = VW / z, VH / z
    cx = min(max(cx, cw / 2), VW - cw / 2)
    cy = min(max(cy, ch / 2), VH - ch / 2)
    return ((cx - cw / 2) * DSF, (cy - ch / 2) * DSF, (cx + cw / 2) * DSF, (cy + ch / 2) * DSF)


# ---------------- captions
captions = [
    (0.0, O["click"] + 0.05, "Shoebox: bill photo to GST ledger"),
    (O["click"] + 0.15, O["done"], "A local AI reads the photo  ·  6× speed"),
    (O["done"] + 0.1, O["scrollDown"] + 0.25, "Plain code checks every number"),
    (O["scrolled"] + 0.1, O["typing"], "Two digits swapped. Off by ₹90."),
    (O["typing"], O["fixed"], "Correct the total"),
    (O["fixed"] + 0.05, O["save"] - 0.05, "All checks pass"),
    (O["save"] + 0.2, DUR + 1, "Saved. Nothing left this laptop.", 150),
]

font = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", 44)
try:
    font.set_variation_by_name("Semibold")
except Exception:
    pass


def draw_caption(img, t):
    for a, b, text, *lift in captions:
        if a <= t < b:
            alpha = min(1, (t - a) / 0.18, (b - t) / 0.18)
            if alpha <= 0:
                return
            overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(overlay)
            l, tp, r, bt = d.textbbox((0, 0), text, font=font)
            tw, th = r - l, bt - tp
            px, py = 38, 22
            w, h = tw + 2 * px, th + 2 * py
            x = (W - w) / 2
            y = H - 64 - h - (lift[0] if lift else 0)
            d.rounded_rectangle((x, y, x + w, y + h), radius=h / 2, fill=(22, 27, 44, int(228 * alpha)))
            d.text((x + px - l, y + py - tp), text, font=font, fill=(255, 255, 255, int(255 * alpha)))
            img.alpha_composite(overlay)
            return


# ---------------- render
cache = {}


def frame_at(t_in):
    i = max(0, bisect.bisect_right(ts, t_in) - 1)
    if i not in cache:
        cache.clear()
        cache[i] = Image.open(os.path.join(rec, "frames", frames[i]["file"])).convert("RGB")
    return cache[i]


count = int(DUR * FPS)
for n in range(count):
    t = n / FPS
    src = frame_at(in_t(t))
    box = crop_box(*camera(t))
    img = src.resize((W, H), resample=Image.LANCZOS, box=box).convert("RGBA")
    draw_caption(img, t)
    img.convert("RGB").save(os.path.join(out, f"o{n:05d}.jpg"), quality=95)

print(f"{count} frames, {DUR:.2f} s; reading {B - A:.1f} s shown in {(B - A) / SPEED:.1f} s")
print({k: round(v, 2) for k, v in O.items()})
