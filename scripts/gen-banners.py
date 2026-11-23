"""README banner and GitHub social preview from the logo and real screenshots.

Usage: python scripts/gen-banners.py   (run from the repo root; needs Pillow and Windows' Segoe UI)
Writes media/banner/wake11-banner.png (1280x400) and media/banner/wake11-social.png (1280x640).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "media" / "banner"
FONTS = Path("C:/Windows/Fonts")
BG = (0, 0, 0)
TEXT = (242, 243, 245)
TEXT2 = (154, 160, 166)
TAGLINE = "The alarm clock that makes sure you actually get up"
SUB = "Offline alarm, timers and focus for Android"


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def phone(path, width):
    shot = Image.open(path).convert("RGB")
    shot = shot.resize((width, round(shot.height * width / shot.width)), Image.LANCZOS)
    frame = Image.new("RGB", (shot.width + 16, shot.height + 16), (42, 45, 51))
    frame.paste(shot, (8, 8))
    return rounded(rounded(frame, 44), 44)


def text_block(draw, x, y, title_size, tag_size, sub_size):
    draw.text((x, y), "WAKE11", font=font("seguisb.ttf", title_size), fill=TEXT)
    y += round(title_size * 1.25)
    draw.text((x, y), TAGLINE, font=font("segoeui.ttf", tag_size), fill=TEXT)
    y += round(tag_size * 1.6)
    draw.text((x, y), SUB, font=font("segoeui.ttf", sub_size), fill=TEXT2)


def banner():
    im = Image.new("RGB", (1280, 400), BG)
    icon = Image.open(ROOT / "media/logo/wake11-icon-1024.png").resize((216, 216), Image.LANCZOS)
    im.paste(icon, (96, 92), icon)
    text_block(ImageDraw.Draw(im), 360, 118, 72, 28, 22)
    return im


def social():
    im = Image.new("RGB", (1280, 640), BG)
    icon = Image.open(ROOT / "media/logo/wake11-icon-1024.png").resize((120, 120), Image.LANCZOS)
    im.paste(icon, (72, 150), icon)
    d = ImageDraw.Draw(im)
    d.text((72, 300), "WAKE11", font=font("seguisb.ttf", 64), fill=TEXT)
    tag = font("segoeui.ttf", 28)
    d.text((72, 392), "The alarm clock that makes", font=tag, fill=TEXT)
    d.text((72, 430), "sure you actually get up", font=tag, fill=TEXT)
    d.text((72, 492), SUB, font=font("segoeui.ttf", 20), fill=TEXT2)
    # Two phones rising from the bottom edge, the ring screen in front.
    back = phone(ROOT / "media/screenshots/dark/02-alarms.png", 268)
    front = phone(ROOT / "media/screenshots/dark/11-ring-challenge.png", 288)
    shadow = Image.new("RGBA", (front.width + 60, front.height + 60), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((30, 30, front.width + 30, front.height + 30), 44, fill=(0, 0, 0, 200))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    im.paste(back, (1240 - back.width, 150), back)
    im.paste(shadow, (720 - 30, 96 - 30), shadow)
    im.paste(front, (720, 96), front)
    return im


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    banner().save(OUT / "wake11-banner.png", optimize=True)
    social().save(OUT / "wake11-social.png", optimize=True)
    print("wrote", OUT)
