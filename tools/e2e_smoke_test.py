"""
ArrowFlow - end-to-end smoke test suite (Playwright, headless Chromium).

Formalizes the manual verification passes done ad-hoc throughout development
into one repeatable script. Not a unit-test suite (this codebase has no
build/bundler step and most modules assume browser globals like `document`/
`localStorage`/`firebase`, so plain Node unit tests aren't a natural fit
here) - this drives the real page in a real (headless) browser instead,
the same way every feature in this project has actually been verified.

Usage:
    py -m http.server 8000          (from the repo root, in another terminal)
    py tools/e2e_smoke_test.py      (defaults to http://localhost:8000)
    py tools/e2e_smoke_test.py --url http://localhost:8000

Exits 0 if every check passes, 1 otherwise (prints a PASS/FAIL summary and
the first failure's traceback). Each check is independent - one failing
doesn't stop the rest from running, so a single run reports everything
broken, not just the first thing.
"""
import argparse
import sys
import traceback

from playwright.sync_api import sync_playwright

RESULTS = []
URL = "http://localhost:8000/index.html"  # overwritten by --url in main()


def check(name):
    """Decorator: run fn(page), record PASS/FAIL, never let one check kill the run."""
    def deco(fn):
        RESULTS.append((name, fn))
        return fn
    return deco


def fresh_page(browser, width=390, height=844, lang=None):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.goto(URL)
    page.evaluate("localStorage.clear()")
    if lang:
        # langExplicit mirrors what picking a language in Settings does. Without
        # it, I18N.currentLang() falls back to detecting the BROWSER's language
        # (2026-09-03), which in CI is en-US - so a `lang='th'` page would have
        # quietly rendered English and the Thai-specific checks below would have
        # passed while testing nothing.
        page.evaluate(
            "localStorage.setItem('arrowflow3d_save', JSON.stringify("
            f"{{lang: '{lang}', langExplicit: true}}))"
        )
    page.reload()
    page.wait_for_timeout(1200)
    if page.is_visible("#modal-nickname"):
        page.click("#btn-nickname-skip")
        page.wait_for_timeout(150)
    return page


def skip_tutorial(page):
    page.evaluate("Storage.set('tutorialSeen', true)")


@check("Menu loads with no console errors")
def test_menu_loads(page):
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(URL)
    page.evaluate("localStorage.clear()")
    page.reload()
    page.wait_for_timeout(1200)
    assert page.is_visible("#btn-play") or page.is_visible("#modal-nickname"), "menu/nickname modal never appeared"
    # The Firebase SDK itself logs this internally (not a thrown exception we
    # can catch) until Google Analytics is linked to the Firebase project in
    # the console - expected/harmless until that one-time console step is
    # done, same pattern as the Firestore Rules paste-in. Any OTHER console
    # error still fails this check.
    real_errors = [e for e in errors if '@firebase/analytics' not in e]
    assert real_errors == [], f"console errors on fresh load: {real_errors}"


@check("Play a level, tap a path, win flow reachable")
def test_play_level(page):
    skip_tutorial(page)
    page.evaluate("Game.loadLevel(1)")
    page.evaluate("UI.showScreen('screen-game')")
    page.wait_for_timeout(500)
    hud = page.evaluate("Game.getHudPayload()")
    assert hud is not None, "level 1 didn't produce a HUD payload"
    assert hud["level"] == 1


@check("Hint button spends a hint and highlights a path")
def test_hint(page):
    skip_tutorial(page)
    page.evaluate("Game.loadLevel(1)")
    page.evaluate("UI.showScreen('screen-game')")
    page.wait_for_timeout(300)
    before = page.evaluate("Storage.get('hints')")
    page.click("#btn-hint")
    page.wait_for_timeout(200)
    after = page.evaluate("Storage.get('hints')")
    assert after == before - 1, f"hint count didn't decrement: {before} -> {after}"


# Both ad tests below exercise js/ads.js's *web-fallback* path only (headless
# Chromium has no window.Capacitor, so Ads.isNative() is false and every
# showRewardedAd() call takes the instant-grant fallback after ~1200ms, same
# as before real AdMob existed). They do not - and cannot - verify the real
# AdMob SDK path; that only runs on-device inside the native app.
@check("Fail-screen continue-ad grants a life and enforces the daily cap")
def test_fail_continue_ad(page):
    # Read the cap instead of hardcoding it: it was raised 3 -> 5 in the
    # 2026-09-01 balance pass and is Remote-Config tunable, so a literal here
    # only guarantees this test rots again the next time it moves.
    cap = page.evaluate("Storage.remainingRewardedAds('continue')")
    assert cap > 0, "expected some continue-ads available on a fresh save"
    for i in range(cap):
        page.evaluate("UI.showFail()")
        page.wait_for_timeout(150)
        assert page.is_visible("#btn-fail-continue-ad"), f"continue-ad button should still be visible on use {i+1}/{cap}"
        page.click("#btn-fail-continue-ad")
        page.wait_for_timeout(1400)
    remaining = page.evaluate("Storage.remainingRewardedAds('continue')")
    assert remaining == 0, f"expected continue-ad cap ({cap}) exhausted, got {remaining} left"
    page.evaluate("UI.showFail()")
    page.wait_for_timeout(150)
    assert "hidden" in (page.get_attribute("#btn-fail-continue-ad", "class") or ""), \
        "continue-ad button should hide once the daily cap is hit"


@check("Store: hint-ad grants +1 hint, cap enforced, buy button shows coming-soon")
def test_store(page):
    dialogs = []
    page.on("dialog", lambda d: (dialogs.append(d.message), d.accept()))
    page.click("#btn-store")
    page.wait_for_timeout(200)
    assert "active" in page.get_attribute("#screen-store", "class")
    before = int(page.text_content("#store-hint-count"))
    page.click("#btn-store-hint-ad")
    page.wait_for_timeout(1400)
    after = int(page.text_content("#store-hint-count"))
    assert after == before + 1, f"store hint-ad didn't grant a hint: {before} -> {after}"
    page.click(".store-pack-btn")
    page.wait_for_timeout(200)
    assert len(dialogs) == 1, "buy-pack button should trigger a 'coming soon' dialog"
    page.click("#btn-back-store")


@check("HUD store shortcut opens Store and returns to the same level")
def test_hud_store_shortcut(page):
    skip_tutorial(page)
    page.evaluate("Game.loadLevel(1)")
    page.evaluate("UI.showScreen('screen-game')")
    page.wait_for_timeout(300)
    page.click("#btn-hud-store")
    page.wait_for_timeout(200)
    assert "active" in page.get_attribute("#screen-store", "class")
    page.click("#btn-back-store")
    page.wait_for_timeout(200)
    assert "active" in page.get_attribute("#screen-game", "class"), \
        "HUD store shortcut's back button should return to the game, not the menu"


@check("Ranking screen shows world leaderboard + personal stats, no errors")
def test_ranking_screen(page):
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.click("#btn-ranking")
    page.wait_for_timeout(4000)
    assert "active" in page.get_attribute("#screen-ranking", "class")
    my_row_text = page.text_content("#ranking-my-row")
    assert my_row_text and my_row_text != "…", "ranking my-row never resolved"
    assert page.is_visible("#stats-total-score")
    assert errors == [], f"console errors on ranking screen: {errors}"
    page.click("#btn-back-ranking")


@check("Reset progress: cancel is a no-op, confirm wipes progress but keeps prefs")
def test_reset_progress(page):
    page.evaluate("""
      Storage.set('currentLevel', 42);
      Storage.set('totalStars', 99);
      Storage.set('theme', 'dark');
      Storage.set('lang', 'th');
    """)
    page.click("#btn-settings")
    page.wait_for_timeout(150)
    page.click("#btn-open-reset")
    page.wait_for_timeout(150)
    page.click("#btn-reset-cancel")
    page.wait_for_timeout(150)
    assert page.evaluate("Storage.get('currentLevel')") == 42, "cancel should not touch data"

    page.click("#btn-settings")
    page.wait_for_timeout(150)
    page.click("#btn-open-reset")
    page.wait_for_timeout(150)
    page.click("#btn-reset-confirm")
    page.wait_for_timeout(2500)  # signOut + reload

    assert page.evaluate("Storage.get('currentLevel')") == 1, "confirm should reset progress"
    assert page.evaluate("Storage.get('totalStars')") == 0
    assert page.evaluate("Storage.get('theme')") == 'dark', "theme preference should survive reset"
    assert page.evaluate("Storage.get('lang')") == 'th', "language preference should survive reset"


@check("Thai menu labels fit on one line at common phone widths")
def test_thai_menu_wrap(page_factory):
    for width in (320, 390, 430):
        page = page_factory(width=width, lang='th')
        assert page.evaluate("I18N.currentLang()") == 'th',             f"width={width}: page is not actually in Thai, so this check would prove nothing"
        # Only buttons that are actually rendered: btn-bundle-promo is legitimately
        # hidden on a fresh save and reports height 0, which is not a wrap.
        heights = page.evaluate("""
          () => Array.from(document.querySelectorAll('.menu-btn-row .btn'))
            .filter(b => b.getBoundingClientRect().height > 0)
            .map(b => b.getBoundingClientRect().height)
        """)
        # A wrapped 2-line label roughly doubles the button's height vs its
        # single-line siblings - catch that instead of hardcoding a px value.
        assert max(heights) - min(heights) < 10, f"width={width}: button heights suggest line-wrap: {heights}"
        page.close()


def main():
    global URL
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8000/index.html")
    args = parser.parse_args()
    URL = args.url

    passed, failed = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def page_factory(**kwargs):
            return fresh_page(browser, **kwargs)

        for name, fn in RESULTS:
            page = fresh_page(browser)
            try:
                if name == "Thai menu labels fit on one line at common phone widths":
                    fn(page_factory)
                else:
                    fn(page)
                passed.append(name)
                print(f"PASS  {name}")
            except Exception:
                failed.append(name)
                print(f"FAIL  {name}")
                traceback.print_exc()
            finally:
                page.close()

        browser.close()

    print(f"\n{len(passed)} passed, {len(failed)} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
