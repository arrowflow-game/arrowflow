"""
One-off generator for the Android app icon / splash source PNGs (resources/*.png),
consumed by `npx @capacitor/assets generate`.

The icon is a hand-authored glossy-cube illustration (resources/icon-source.png,
transparent bg) rather than something generated here - this script just composites
it into the three files Android's adaptive-icon system needs (foreground/background/
legacy) at the right scale and padding. The splash screen is still rendered from HTML/
CSS via headless Chromium (same Playwright already used by tools/e2e_smoke_test.py)
since no ImageMagick/Inkscape is installed on this machine.

Not part of any build step - run manually whenever the brand mark changes, then
re-run `npx @capacitor/assets generate --android` and commit the regenerated
android/ resources.
"""
import pathlib
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).parent.parent / "resources"
OUT.mkdir(exist_ok=True)

ACCENT = "#1a7fe8"
SPLASH_BG = "#dff0fb"
FONT = "'Outfit', 'Arial', sans-serif"
ICON_BG = (15, 20, 38, 255)  # dark navy, sampled from the cube artwork's own glassy faces

ARROW_SVG = """
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 35 L55 35 L55 18 L85 50 L55 82 L55 65 L20 65 Z" fill="white"/>
</svg>
"""

def page_html(size, body):
    return f"""<!DOCTYPE html><html><head><style>
    html,body{{margin:0;padding:0;width:{size}px;height:{size}px;overflow:hidden;background:transparent;}}
    </style></head><body>{body}</body></html>"""

def _composite_icon(scale, bg=None, radius=None, size=1024):
    src = Image.open(OUT / "icon-source.png").convert("RGBA")
    canvas = Image.new("RGBA", (size, size), bg or (0, 0, 0, 0))
    new_w = int(size * scale)
    resized = src.resize((new_w, new_w), Image.LANCZOS)
    off = (size - new_w) // 2
    canvas.alpha_composite(resized, (off, off))
    if radius:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size, size], radius=radius, fill=255)
        canvas.putalpha(Image.composite(canvas.split()[3], Image.new("L", (size, size), 0), mask))
    return canvas

def write_icons():
    # foreground: transparent, scaled to sit within the adaptive-icon ~66% safe zone
    _composite_icon(0.70).save(OUT / "icon-foreground.png")
    # background: solid fill only (shows past the foreground's silhouette/mask)
    Image.new("RGBA", (1024, 1024), ICON_BG).save(OUT / "icon-background.png")
    # legacy/Play-Store icon: must be fully opaque, so solid bg + rounded corners
    _composite_icon(0.84, bg=ICON_BG, radius=int(1024 * 0.2)).save(OUT / "icon.png")
    print("wrote icon-foreground.png, icon-background.png, icon.png")

def splash(size=2732):
    badge = int(size * 0.22)
    glyph = int(badge * 0.55)
    goff = (badge - glyph) // 2
    title_size = int(size * 0.075)
    sub_size = int(size * 0.03)
    body = f"""
    <div style="width:{size}px;height:{size}px;background:{SPLASH_BG};display:flex;
                flex-direction:column;align-items:center;justify-content:center;
                font-family:{FONT};">
      <div style="width:{badge}px;height:{badge}px;background:{ACCENT};
                  border-radius:{int(badge*0.22)}px;position:relative;
                  box-shadow:0 {int(size*0.01)}px {int(size*0.03)}px rgba(26,127,232,0.35);">
        <div style="position:absolute;left:{goff}px;top:{goff}px;width:{glyph}px;height:{glyph}px;">{ARROW_SVG}</div>
      </div>
      <div style="margin-top:{int(size*0.045)}px;font-size:{title_size}px;font-weight:900;
                  color:{ACCENT};">ArrowFlow</div>
      <div style="margin-top:{int(size*0.012)}px;font-size:{sub_size}px;font-weight:700;
                  color:#6b7d94;">3D Brain Puzzle</div>
    </div>
    """
    return page_html(size, body), False

SPLASH_TARGETS = {
    "splash.png": splash,
    "splash-dark.png": splash,
}

def main():
    write_icons()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, fn in SPLASH_TARGETS.items():
            html, transparent = fn()
            page = browser.new_page(viewport={"width": 2732, "height": 2732})
            page.set_content(html)
            page.screenshot(path=str(OUT / name), omit_background=transparent)
            page.close()
            print(f"wrote {name}")
        browser.close()

if __name__ == "__main__":
    main()
