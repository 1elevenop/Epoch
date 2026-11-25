"""Builds the launcher icon foreground from the 3D sleepy mascot (src/public/mascot/sleepy.webp).

Writes android res/drawable-<dpi>/ic_launcher_foreground.png (108 dp adaptive canvas, a bust whose
shoulders run off the mask) and media/logo/epoch-icon.png (1024 px, rounded tile on black).
The themed icon, status-bar icon and white/black marks are flat silhouettes from gen-icons.py.
Needs Pillow + numpy (dev tool only, not part of the app):  python scripts/gen-launcher.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
SRC = os.path.join(ROOT, 'src', 'public', 'mascot', 'sleepy.webp')

im = Image.open(SRC).convert('RGBA')
a = np.array(im)
ys, xs = np.where(a[..., 3] > 8)
fig = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
bust = fig.crop((0, 0, fig.width, int(fig.height * 0.86)))


def foreground(px):
    can = Image.new('RGBA', (px, px), (0, 0, 0, 0))
    k = px * 0.62 / bust.width
    b = bust.resize((round(bust.width * k), round(bust.height * k)), Image.LANCZOS)
    can.paste(b, ((px - b.width) // 2, round(px * 0.87) - b.height), b)
    return can


for dpi, px in (('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)):
    out = os.path.join(RES, f'drawable-{dpi}', 'ic_launcher_foreground.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    foreground(px).save(out, optimize=True)
    print('wrote', os.path.relpath(out, ROOT))

# README / store icon: the visible ~72 dp of the adaptive canvas, on black, rounded.
S = 1024
tile = Image.new('RGBA', (S, S), (0, 0, 0, 255))
tile.alpha_composite(foreground(S))
lo, hi = int(S * 0.15), int(S * 0.85)
tile = tile.crop((lo, lo, hi, hi)).resize((S, S), Image.LANCZOS)
mask = Image.new('L', (S, S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=230, fill=255)
icon = Image.new('RGBA', (S, S), (0, 0, 0, 0))
icon.paste(tile, (0, 0), mask)
out = os.path.join(ROOT, 'media', 'logo', 'epoch-icon.png')
icon.save(out, optimize=True)
print('wrote', os.path.relpath(out, ROOT))
