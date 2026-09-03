# ArrowFlow 3D

A 3D puzzle game: slide every arrow path off the surface of a polycube. 300 hand-generated campaign levels, a daily challenge, an endless post-campaign mode, 37 skins, and a global leaderboard.

Ships as a **static web app** wrapped with **Capacitor** into an Android app on Google Play (currently closed testing). The same source serves both: GitHub Pages publishes the repo root directly, and `scripts/build-www.js` copies a clean subset into `www/` for the native build.

---

## Running it

There is no build step for the game itself — no bundler, no framework. Every module in `js/` is an IIFE assigned to a global, loaded in order by `index.html`.

```bash
python -m http.server 8000     # from the repo root
# open http://localhost:8000
```

Useful query parameters while developing:

| Parameter | Effect |
|---|---|
| `?level=N` | Jump straight into campaign level N (1–300) |
| `?tutorial=1` | Clear `tutorialSeen` so the first-run tutorial plays again |
| `?debugall=1` | Unlock every level |
| `?unlockskins=1` | Unlock every skin |

## Building the Android app

The Android build needs **JDK 21 exactly** — 17 fails with `invalid source release: 21`, and 25 is incompatible with this project's Gradle. CI is the reliable path:

```bash
npm ci
npm run cap:sync                 # build www/ + npx cap sync android
cd android && ./gradlew assembleDebug
```

Or let GitHub Actions do it:

- **`build-android.yml`** — runs on every push to `main`: lint → security-rules tests → backup-exporter test → e2e smoke test → debug APK artifact.
- **`release-android.yml`** — manual (`workflow_dispatch`) only: produces the signed AAB for Play. `versionCode` comes from the run number, so **each track needs its own run** (Play requires a strictly increasing `versionCode` per upload).

```bash
gh workflow run release-android.yml
gh run download <run-id>
```

## Testing

```bash
npm run lint                                  # ESLint, no-undef as a tripwire
npm run test:rules                            # firestore.rules against the emulator
npm run test:backup                           # the Firestore exporter
python -m http.server 8000 &                  # in another terminal
python tools/e2e_smoke_test.py                # drives the real page in headless Chromium
```

All four run in CI on every push. The emulator ones need a **JDK 21 or newer** —
on this machine, `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"`. There are no unit tests: the modules assume browser globals (`document`, `localStorage`, `firebase`), so driving the real page is the honest way to verify this codebase.

To drive the **real app on a connected Android device** over the Chrome DevTools Protocol (by far the fastest loop — change, install, measure, no manual play), see `docs/device-testing.md`.

## Levels are generated, never hand-written

`js/levels.js` and `js/daily-levels.js` are **build output**, ~33 MB of generated JSON. Do not hand-edit them.

```bash
python tools/generate_campaign.py             # regenerates all 300 levels
python tools/generate_daily_pool.py > js/daily-levels.js
```

Paths are drawn on the exposed unit-cube faces of a polycube, one 2D canvas texture per face. A path only *looks* continuous across a face boundary if the cell it lands on is the mesh's actual geometric neighbour across that shared edge — `tools/polycube.py` computes that adjacency for any shape. Placing level data by hand produces paths that visibly break at edges.

## Backend

Firebase project `arrowflow-8d6a8`, using the compat SDK from a CDN with SRI (no npm dependency).

| Collection | Purpose | Access |
|---|---|---|
| `players/{uid}` | Global leaderboard entry | Public read, owner write/delete |
| `levelBests/{levelId}` | Per-level world best | Public read, higher-score-only write |
| `saves/{uid}` | Cloud save backup | Owner only |
| `verifiedPurchases/{token}` | Purchase replay ledger | Cloud Function only |

```bash
npx firebase deploy --only firestore:rules
npx firebase deploy --only functions       # requires the Blaze plan
npm run backup                             # export every collection to JSON
```

The project is on the Spark plan, so Firestore's own managed backups aren't
available — `.github/workflows/backup-firestore.yml` exports the collections
daily instead. See `docs/firestore-backup.md` for the one-time secret it needs.

`functions/` holds server-side purchase verification (see `functions/README.md` for the console setup it needs). Remote Config carries three feature kill switches and eight tuning numbers — see `js/remoteconfig.js`.

## Layout

```
index.html            script order matters - modules are globals, not imports
js/                   game modules (IIFE per file)
  game.js             rules, scoring, win/fail
  scene.js            three.js rendering + per-face canvas textures
  ui.js               every screen, modal and button
  storage.js          localStorage, the single source of player state
  cloudsave.js        Google Sign-In + Firestore backup
  levels.js           GENERATED - do not edit
tools/                level generators, e2e smoke test, rules + backup tests
scripts/build-www.js  assembles www/ for the Capacitor build
android/              Capacitor Android wrap
functions/            Firebase Cloud Functions (purchase verification)
docs/                 device testing, Firestore backup, launch kit
privacy.html          served by GitHub Pages, linked from the Play listing
delete-account.html   public account-deletion route (Play requirement)
```

## Release checklist

1. `gh workflow run release-android.yml` — once per track, since `versionCode` must differ
2. Upload each AAB to its track in Play Console
3. Add the release note to `CHANGELOG.md`
4. If Firestore rules or Cloud Functions changed, deploy them separately — they are **not** part of the app build
