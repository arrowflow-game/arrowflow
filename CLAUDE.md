# Working in this repo

Read `README.md` first for layout, build and release. This file is the set of rules that are not obvious from the code and that have each been learned by shipping a bug.

## Hard rules

**Never hand-edit `js/levels.js` or `js/daily-levels.js`.** They are generated (`tools/generate_campaign.py`, `tools/generate_daily_pool.py`) and are ~33 MB. Paths are drawn across the faces of a polycube, and a path only looks continuous across a face boundary if the destination cell is the mesh's real geometric neighbour — `tools/polycube.py` computes that. Hand-placed data produces paths that visibly break at edges.

**Every module is a global, not a module.** `index.html` loads `js/*.js` in dependency order; each file is an IIFE assigned to a `const`. Adding a file means adding a `<script>` tag. There is no bundler and no import resolution to catch a typo — which is why `npm run lint` treats `no-undef` as a build failure. That exact bug class has shipped three times, most recently an undefined `stars` in `onWin()` that made **every level in every mode impossible to finish**, invisible because `onWin()` runs inside a `setTimeout`.

**A gameplay-mechanic change needs two things**, stated by the user as a standing rule: verify the old behaviour is unchanged, and ship a tutorial for the first level where a player meets the new mechanic.

**Keep `initializeForTesting: true` in `js/ads.js` until production.** Clicking a real ad on a test build risks a permanent AdMob ban.

**Respond in Thai** unless asked otherwise.

## Firestore rules: the trap that has now bitten three times

`request.resource` is **null** on any operation that isn't a create or update. Folding field validation into a combined `allow read, write` therefore makes the rule *throw*, and Firestore denies on error — silently, and only in production.

- `allow read, write` + field checks → every **read** denied. Broke cloud save restore completely.
- `allow write` + field checks → every **delete** denied. Would have broken account deletion.

Always spell out `allow read`, `allow create, update`, and `allow delete` separately. Rules changes are **not** part of the app build: `npx firebase deploy --only firestore:rules`.

## Rendering: a face repaint is expensive

`js/scene.js` keeps one 2D canvas texture per exposed cube face. Marking a face dirty repaints its whole canvas (material, mascot, borders, every path line on it) and re-uploads a GPU texture on the next frame.

Any continuous glow or pulse must (a) run well below the frame rate and (b) dirty only the faces that actually draw the animated element. The Lock-Key padlock glow ignored both and halved the frame rate across levels 61–300; throttling alone still left a 47 ms hitch ten times a second, so both glows became **standing rather than animated**. The `holo` skins have the same shape of problem — they must redraw the whole board to keep the rainbow phase in sync — and now skip the tick on boards too large to afford it, learning the safe size per session.

## Storage and money

`js/storage.js` is the single source of player state, and `Storage.set()` notifies `cloudsave.js` through `onChange`.

Currency is split into **earned** and **paid** pools, and spending draws from earned first. Anything paid must survive: `resetAll()` keeps it, and a cloud restore *merges* it (max/union) rather than overwriting — paid gems and hints are consumables that Google Play cannot re-grant, so an overwrite destroys something a player bought.

## Native plugins

Capacitor plugin calls can hang forever with no error and no log. `signInWithGoogle()` does this on a device whose Google account is in a bad-credential state (Play services answers Credential Manager with neither a result nor an error). Anything awaiting a native plugin in a path that disables UI needs a timeout, or the button stays dead for the rest of the session.

## Verifying

Prefer driving the real thing over reasoning about it — every bug of consequence in this project was found that way, and several "verified" fixes were not actually fixed. `docs/device-testing.md` covers driving the installed Android app over CDP; `tools/e2e_smoke_test.py` covers the web build and runs in CI.
