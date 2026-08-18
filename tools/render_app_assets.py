"""
One-off generator for the Android app icon / splash source PNGs (resources/*.png),
consumed by `npx @capacitor/assets generate`. Renders small HTML/SVG snippets with
headless Chromium (same Playwright already used by tools/e2e_smoke_test.py) instead
of needing ImageMagick/Inkscape, neither of which is installed on this machine.

Not part of any build step - run manually whenever the brand mark changes, then
re-run `npx @capacitor/assets generate --android` and commit the regenerated
android/ resources.
"""
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).parent.parent / "resources"
OUT.mkdir(exist_ok=True)

ACCENT = "#1a7fe8"
SPLASH_BG = "#dff0fb"
FONT = "'Outfit', 'Arial', sans-serif"

ARROW_SVG = """
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 35 L55 35 L55 18 L85 50 L55 82 L55 65 L20 65 Z" fill="white"/>
</svg>
"""

def page_html(size, body):
    return f"""<!DOCTYPE html><html><head><style>
    html,body{{margin:0;padding:0;width:{size}px;height:{size}px;overflow:hidden;}}
    </style></head><body>{body}</body></html>"""

def icon_foreground(size=1024):
    # Adaptive-icon foreground: transparent bg, glyph kept inside the ~66% safe zone.
    glyph = int(size * 0.5)
    off = (size - glyph) // 2
    body = f'<div style="position:absolute;left:{off}px;top:{off}px;width:{glyph}px;height:{glyph}px;">{ARROW_SVG}</div>'
    return page_html(size, body), True

def icon_background(size=1024):
    body = f'<div style="width:{size}px;height:{size}px;background:{ACCENT};"></div>'
    return page_html(size, body), False

def icon_legacy(size=1024):
    glyph = int(size * 0.5)
    off = (size - glyph) // 2
    body = (
        f'<div style="width:{size}px;height:{size}px;background:{ACCENT};'
        f'border-radius:{int(size*0.2)}px;position:relative;box-sizing:border-box;">'
        f'<div style="position:absolute;left:{off}px;top:{off-int(size*0.04)}px;width:{glyph}px;height:{glyph}px;">{ARROW_SVG}</div>'
        f'</div>'
    )
    return page_html(size, body), False

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

TARGETS = {
    "icon-foreground.png": icon_foreground,
    "icon-background.png": icon_background,
    "icon.png": icon_legacy,
    "splash.png": splash,
    "splash-dark.png": splash,
}

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, fn in TARGETS.items():
            html, transparent = fn()
            size = 2732 if "splash" in name else 1024
            page = browser.new_page(viewport={"width": size, "height": size})
            page.set_content(html)
            page.screenshot(path=str(OUT / name), omit_background=transparent)
            page.close()
            print(f"wrote {name}")
        browser.close()

if __name__ == "__main__":
    main()
