# Driving the real app on a device

The debug build enables WebView remote debugging, so a connected Android device can be driven from a desktop with Playwright over the Chrome DevTools Protocol. This is by far the fastest way to verify anything in this project — install once, then load levels, switch skins, measure frame rate, click every button and solve a level end to end without touching the tablet.

It found six defects in cloud save that a manual pass had missed entirely, and it is how the Lock-Key frame-rate regression was measured.

## Connecting

`adb` is not on `PATH`; use the SDK copy.

```bash
adb=D:/Android/Sdk/platform-tools/adb.exe

$adb install -r app-debug.apk
$adb shell am force-stop com.arrowflowgame.puzzle
$adb shell monkey -p com.arrowflowgame.puzzle -c android.intent.category.LAUNCHER 1

# The socket name carries the app's pid, so it changes every restart.
$adb shell "cat /proc/net/unix | grep webview_devtools"     # -> webview_devtools_remote_<pid>
$adb forward --remove-all
$adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>
```

Then connect and pick the game's page. **Match on the URL, not on a global**: the AdMob SDK keeps its own WebViews open, and right after a reload the game's own globals don't exist yet.

```js
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://localhost:9333');
const page = browser.contexts()[0].pages().find(p => /^https:\/\/localhost\/?$/.test(p.url()));
await page.waitForFunction(() => typeof Game !== 'undefined' && typeof Storage !== 'undefined');
```

From there the whole app is addressable: `Game.loadLevel(n)`, `Game.onArrowTap(...)`, `Storage.get/set`, `UI.showScreen(...)`, `CloudSave.*`.

Native dialogs (the Google account picker, the share sheet) can't be driven this way — dismiss or tap them with `adb shell input tap X Y`, using `adb shell screencap -p /sdcard/s.png` + `pull` to find the coordinates.

## Gotchas that cost real time

**MIUI blocks a *new* `adb install`** with `INSTALL_FAILED_USER_RESTRICTED`, even with USB install permission granted. **Upgrades of an already-installed app with the same signature work fine.** To get the first install on, `adb push` the APK to `/sdcard/Download/` and tap it in the Files app.

**Git Bash mangles device paths.** `adb shell screencap -p /sdcard/s.png` becomes a Windows path and fails. Set `MSYS2_ARG_CONV_EXCL='*'`, or use PowerShell. `adb exec-out screencap -p > file` also corrupts the PNG in PowerShell — use `shell screencap` then `pull`.

**Playwright's own `page.screenshot()` cannot see the WebGL canvas here.** It returns the page with `#three-canvas` blank — correct canvas dimensions, no covering modal, nothing wrong with the app. Believing it costs an hour chasing a rendering regression that does not exist. Every visual check has to go through `adb shell screencap -p /sdcard/s.png` + `adb pull`; CDP screenshots are only good for DOM-only screens.

**A tap looks ineffective if you read the HUD on the same tick.** A cleared path animates out over several `requestAnimationFrame`s, so `remaining` does not drop until it finishes. A sweep that taps and immediately compares will report every level in the game as broken. Wait on the value (`wait_for_function`), don't sample it.

**A full-campaign sweep at real animation speed takes hours.** Override `requestAnimationFrame` to `setTimeout(cb, 0)` and stub `Scene3D.updateFrame` to a no-op — 300 levels then run in tens of minutes. That trades away rendering coverage, so pair it with a smaller sweep that leaves rendering on.

**`performance.memory` is frozen on Android WebView** — it returns the same number forever. Real memory comes from `adb shell dumpsys meminfo com.arrowflowgame.puzzle`.

**Timing `updateFrame()` measures the wrong thing.** Marking face textures dirty makes three.js re-upload them inside the *next* `renderer.render()`, so `updateFrame` once reported 173 ms for a frame the player experienced as 1090 ms. Always measure the `requestAnimationFrame` delta.

**A test that calls `Game.redrawTheme()` will produce a stall it then blames on the app.** Wait out the redraw before sampling.

**Order matters in a full sweep.** Backgrounding/pause checks must run *before* any button sweep: the sweep taps "watch ad" buttons whose ads never resolve on a debug build, and `adInProgress` then legitimately suppresses the background-pause for the watchdog's 90 seconds.

**`Product not found` console errors are expected** on a debug build — it isn't signed with the release key Play Billing knows.

## Restoring state afterwards

A sweep changes real settings (it clicks the language toggle, the music switch, the sign-out button). Snapshot and restore around any destructive run:

```js
const backup = await page.evaluate(() => localStorage.getItem('arrowflow3d_save'));
// ... run the tests ...
await page.evaluate(b => localStorage.setItem('arrowflow3d_save', b), backup);
await page.reload();
```

`UI.applySound(v)` / `applyMusic(v)` / `applyVibration(v)` are **setters** — calling them with no argument writes `undefined` into storage.
