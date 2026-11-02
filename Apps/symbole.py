#!/usr/bin/env python3
# App-Symbole und Startbilder für iOS und Android aus Code/public/img/app-512.png erzeugen (einmalig, Ergebnis wird
# mit den nativen Projekten eingecheckt). Aufruf in Apps/: python3 symbole.py   (braucht Pillow)
from pathlib import Path
from PIL import Image

APPS = Path(__file__).resolve().parent
SRC = Image.open(APPS.parent / 'Code' / 'public' / 'img' / 'app-512.png').convert('RGBA')
BG = (4, 6, 10, 255)  # Grund #04060a wie im Spiel


def scaled(size):
    return SRC.resize((size, size), Image.LANCZOS)


def on_black(w, h, mark):
    img = Image.new('RGBA', (w, h), BG)
    m = scaled(mark)
    img.alpha_composite(m, ((w - mark) // 2, (h - mark) // 2))
    return img.convert('RGB')


def mark_only(size, inner):
    # nur die Raute ohne den dunklen Grund (für das adaptive Android-Symbol): Symbol mittig, Rest transparent
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    m = scaled(inner)
    img.alpha_composite(m, ((size - inner) // 2, (size - inner) // 2))
    return img


# ---- iOS
ios = APPS / 'ios' / 'App' / 'App' / 'Assets.xcassets'
scaled(1024).convert('RGB').save(ios / 'AppIcon.appiconset' / 'AppIcon-512@2x.png')
for name in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    on_black(2732, 2732, 520).save(ios / 'Splash.imageset' / name)

# ---- Android
res = APPS / 'android' / 'app' / 'src' / 'main' / 'res'
dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for d, f in dens.items():
    s = round(48 * f)
    scaled(s).convert('RGB').save(res / f'mipmap-{d}' / 'ic_launcher.png')
    # rundes Symbol: Kreis-Maske
    r = scaled(s)
    mask = Image.new('L', (s, s), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).ellipse((0, 0, s - 1, s - 1), fill=255)
    rr = Image.new('RGBA', (s, s), (0, 0, 0, 0)); rr.paste(r, (0, 0), mask)
    rr.save(res / f'mipmap-{d}' / 'ic_launcher_round.png')
    fg = round(108 * f)
    mark_only(fg, round(fg * 0.92)).save(res / f'mipmap-{d}' / 'ic_launcher_foreground.png')
for orient, (w, h) in {'land': (480, 320), 'port': (320, 480)}.items():
    for d, f in dens.items():
        W, H = round(w * f), round(h * f)
        on_black(W, H, round(min(W, H) * 0.42)).save(res / f'drawable-{orient}-{d}' / 'splash.png')
on_black(480, 320, 136).save(res / 'drawable' / 'splash.png')
(res / 'values' / 'ic_launcher_background.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#04060A</color>\n</resources>\n')
print('Symbole und Startbilder erzeugt.')
