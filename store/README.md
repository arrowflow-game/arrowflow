# Play Console store listing — assets and copy

Everything Google Play asks for on the "Main store listing" page, ready to paste
or upload. Text lives in `listing-th.md` and `listing-en.md`; every character
count in them was checked against Play's limits when they were written.

## Files

| File | Where it goes in Play Console | Requirement |
|---|---|---|
| `play-icon-512.png` | App icon | 512×512, 32-bit PNG, no transparency |
| `feature-graphic-1024x500.png` | Feature graphic (en-US) | 1024×500, no transparency |
| `feature-graphic-1024x500-th.png` | Feature graphic (th-TH) | same |
| `screenshots/en-*.png` | Phone screenshots (en-US) | 7 shots, 1080×1920 (9:16) |
| `screenshots/th-*.png` | Phone screenshots (th-TH) | 7 shots, 1080×1920 (9:16) |

Play accepts 2–8 phone screenshots; the order of the filenames is the order they
should be uploaded in, and it is deliberate: menu, an easy board, two boards that
show off a mechanic, the biggest shape in the game, skins, the daily wheel.

## How these were made

The screenshots are real frames from the actual game, captured from the web build
through Playwright at a 540×960 viewport with `device_scale_factor=2`, which lands
exactly on 1080×1920. That matters: a phone's own screenshot is 1080×2340 on the
test device, and **2.17:1 is outside the aspect ratio Play accepts**, so a raw
device capture would have to be cropped anyway.

The save state used for them (level 137 of 300, 389 stars, 480 gems, 12 hints) is
set up in the capture script rather than played, and the first-run tutorial flags
are pre-set so no coach mark covers the board.

The feature graphic composites a cube cut out of one of those same screenshots —
`en-3-level-combo.png`, background keyed out by colour distance — onto a gradient
with the game's own fonts (Outfit, plus Noto Sans Thai for the Thai copy).

Scripts: `shots2.py` (gameplay), `shots3.py` (screens reached by clicking real
menu buttons — `UI.showScreen()` alone leaves Skins and Level Select empty,
because it does not build their contents) and `feature.html`, all in this
session's scratchpad.

## Still to fill in, in the console (forms, not assets)

- App category: **Games → Puzzle**
- Contact email: kheehlow@gmail.com
- Privacy policy URL: https://arrowflow-game.github.io/arrowflow/privacy.html
- Account deletion URL: https://arrowflow-game.github.io/arrowflow/delete-account.html
- Content rating questionnaire
- Data safety form — the app collects a nickname, scores and (once signed in)
  cloud saves; Analytics, Crashlytics and AdMob are already disclosed in
  `privacy.html`, and the form must match what that page says
- Target audience and ads declaration (the app **does** contain ads)
