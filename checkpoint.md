# ArrowFlow 3D - Progress Checkpoint
**Date:** 2026-08-10

## 🚀 Current Status: 3D Redesign Implemented
The game has been successfully transitioned from a 2D grid to a fully interactive 3D cube using Three.js.

### ✅ Completed Features
1. **3D Cube Rendering:** Implemented a transparent (70% opacity) 3D cube that can be freely rotated using touch or mouse drag.
2. **Complex Cross-Face Paths:** 
   - Replaced simple single-cell arrows with long, winding paths.
   - Paths seamlessly cross over the edges of the cube from one face to another.
   - Level 1 now features 6 intertwined paths covering all faces of the cube to create a labyrinth effect.
3. **Refined Arrow Aesthetics:** 
   - Grid lines removed for a clean, minimalist look.
   - Arrowhead shapes refined (sharp, no curved line caps poking through).
4. **Smooth Animations:**
   - **Slide Out:** Tapping a free arrowhead causes the entire path to smoothly slither forward and off the cube.
   - **Bump/Collision:** Tapping a blocked arrowhead triggers a "bump and return" animation, visually indicating the obstruction.
5. **Raycasting Interaction:** Accurate tap detection on the 3D canvas mapping to the specific 2D canvas texture paths.

### 📁 Code Structure (`D:\ArrowFlow`)
- `index.html`: Entry point, UI overlays.
- `js/scene.js`: Three.js setup, material generation, rendering logic (cross-face path drawing & animation interpolation).
- `js/levels.js`: Data structure defining levels, grid sizes, and path segments across faces.
- `js/game.js`: Game logic, state management, collision detection, and animation frame loops.
- `js/ui.js`: DOM UI logic, menus, and win screens.

## 🔜 Next Steps (as of 2026-08-10)
- Continue adding more complex levels (Levels 2-300).
- Refine lighting and background aesthetics if needed.
- Implement advanced path generation for higher levels.

---

# Update — 2026-08-15

## 🚀 Current Status: Game-economy systems added, matched against a reference app
Reviewed two reference recordings (`ex1.mp4`, `ex2.mp4` — screen captures of an existing
mobile game called "Arrow Puzzle 3D", kept at the project root as dev reference material,
excluded from git via `.gitignore`, not part of ArrowFlow's own assets) and ported the
game-economy pieces that were missing here.

### ✅ Completed Features
1. **Remaining-arrows HUD counter** (`↗ N` badge, top-left) — derived live from
   `state.paths.length - state.clearedCount`, no new data model needed.
2. **3-heart lives system** — a blocked/bumped tap costs a heart; hitting 0 shows a
   "หมดหัวใจ!" fail modal with Restart, which reloads the level and resets state.
3. **Per-level difficulty badge** (`levels.js` → `difficulty` field, Thai label map in `ui.js`).
4. **Working hint button** — highlights one solvable path on the cube (gold pulsing
   outline in `scene.js`; the first attempt used a white highlight color, which was
   invisible against the light-theme cube face — fixed).
5. **Undo** — reverses the single most recently *completed* slide (moves count and
   cleared count roll back); guarded against races with the win-trigger timeout.
6. **Sound toggle** wired to `Storage.sound` (no audio files exist in the project yet,
   so this is a persisted preference switch only, not real audio muting).
7. **Level-select grid now scales** with `highestUnlocked` instead of a hardcoded 10.
8. **Fixed a pre-existing bug**: the invisible `#screen-game` HUD had unconditional
   `pointer-events: all` on `.hud-top`/`.hud-bottom`, so it silently intercepted clicks
   meant for the menu screen underneath (confirmed even the original theme-toggle
   button was affected). Scoped the rule to `.ovr-screen.active.game-hud`.
9. All of the above verified end-to-end with a headless-Chromium (Playwright) driver:
   full clear → win, bump ×3 → fail → restart, hint call interception, undo, sound
   toggle, level-select count — no console errors in any pass.

### 🧰 Environment note
`D:\` was previously under Windows Controlled Folder Access (ransomware protection),
which silently blocked file writes from non-allowlisted processes (Git Bash, this
session's file tools). Protection for `D:\` was removed at the user's request so normal
tooling works without routing through PowerShell.

### 📦 Repo
Git initialized this session (`git init`); first commit covers the pre-existing 3D
implementation plus everything above. `*.mp4` is gitignored — the reference clips stay
on disk but are not tracked.

### 🔗 Test build
A bundled single-file build (Three.js + all six `js/` modules + CSS + inlined
Nunito/Outfit fonts, no external requests) was published as a Claude Artifact for
manual testing. Rebuild on request if the source changes and a fresh link is needed.

## 🔜 Next Steps
- Continue adding more complex levels (Levels 2-300) — still just Level 1 today.
- Decide whether to source real audio for the sound toggle, or leave it preference-only.
- Consider surfacing the `.mp4` reference clips' insights (drag-to-rotate vs tap-to-select,
  confetti win screen) into any future visual polish pass.

---

# Update — 2026-08-15 (cont'd): cube-geometry bugs fixed, perf pass, level generator, roadmap

## 🐛 Root-caused and fixed two real rendering bugs
Both were found through user-reported test recordings (`test1.mp4`–`test7.mp4`, same
gitignored/untracked convention as `ex1.mp4`/`ex2.mp4`), not caught by the earlier
Playwright pass (which checks game *state* transitions, not per-pixel rendering).

1. **Cross-face line discontinuity + backwards-pointing arrowheads.** The cube is a real
   `THREE.BoxGeometry`; each of its 6 faces is an independent 2D canvas texture. The
   renderer (`scene.js`) draws a path segment crossing from face A to face B by extending
   straight to A's texture edge and starting fresh from B's texture edge, trusting that the
   level data's cell coordinates on either side already line up. They didn't always — some
   face pairs mirror or swap axes when unfolded (BoxGeometry's UV mapping isn't a naive
   "same row/col" continuation across every edge). Derived the actual face-adjacency table
   from three.js r128's `BoxGeometry.buildPlane()` UV formulas, verified it two independent
   ways (recomputed 3D corner positions per face, cross-checked against the hand derivation
   — 0 mismatches), and used it to fix two things:
   - Which neighboring cell a crossing segment must land on (fixes visual jumps/kinks).
   - `exitDir` (the arrowhead direction / slide-off direction): when a path's *last* segment
     happens to cross a face, "continue in the same direction used to arrive" is wrong —
     crossing an edge can swap which local axis is 'forward'. Was computing this naively;
     fixed to derive the correct continuation direction from the adjacency table. (This was
     the literal cause of arrows rendering pointing backward into their own tail.)
2. **Self-adjacent-looking paths.** A path whose route passes within 1 cell of another,
   non-consecutive part of itself is not actually blocked (the game explicitly excludes
   self-collision), but *looks* self-blocked to a player reading the idle shape. Added a
   generation-time constraint so a path's route never comes within 1 cell of itself anywhere
   along its route, not just literal overlap.

## 🧰 New tool: `tools/generate_level.py`
Procedurally generates non-overlapping, maze-style levels as JSON, encoding all of the
above as hard constraints (validated, not just hoped for): correct cross-face adjacency,
correct `exitDir`, no self-adjacency, every path's exit ray simultaneously clear (no
solve-order dependency), no path routed through a face-corner cell (an inference ambiguity
in the renderer's own boundary-detection order). Usage: `py tools/generate_level.py --grid
4 --paths 6`. Paste the printed array into a new `LEVELS` entry in `js/levels.js`.
Independent one-off validator scripts used to cross-check generator output during this
session live only in the scratch dir, not the repo — the generator's own constraints are
the durable, reusable guarantee.

Levels 1 and 2 (both in `js/levels.js` now, replacing the earlier hand-placed Level 1)
were produced this way and pass all checks.

## ⚡ Performance pass
Two rounds, aimed at the actual dominant cost (`renderer.render()` running unconditionally
every frame forever, not just during animations):
- `updateFrame()` now only redraws/re-uploads the specific cube faces whose content
  actually changed this frame (tracked from which paths are mid-animation), instead of all
  6 faces on every frame.
- Capped `devicePixelRatio` at 2 (was unbounded — a phone reporting dpr=3 was rendering
  2.25x the useful pixels for no visible benefit).
- Texture size 512→384px per face; anisotropic filtering capped at 4 (was GPU max, often
  16, pure sampling cost with no benefit on a flat puzzle face).
- Cube material `MeshStandardMaterial` (PBR) → `MeshLambertMaterial` (this scene has one
  ambient + one directional light and flat 2D line art — PBR shading was pure waste).
- Google Fonts `<link>` in `index.html` switched to the preload+swap non-blocking pattern
  so first paint doesn't wait on it.

## 🎮 Gameplay/UX fixes from user testing
- Tap target widened: any cell along a path is tappable now, not just its head (matches
  reference-app feel). Updated the in-game instruction text to match.
- Win-screen delay after the last piece clears: 500ms → 200ms.
- Removed the "MOVES" counter from the in-game HUD — it turned out to be **dead code**,
  no script ever updated it, it always read "0". Also removed the win-modal's Moves stat
  for consistency with the reference apps, which don't show it. `state.moves` is still
  tracked internally (feeds the 1/2/3-star calculation against `parMoves`/`maxMoves`),
  just no longer surfaced as a raw number.

## 🗺️ Roadmap decision (2026-08-15, recorded per user request — not yet built)
Discussed whether the campaign should stay capped at 300 levels (matching the `TOTAL_LEVELS
= 300` progress bar / tier labels already built into `ui.js`) or go endless/procedural.
**Recommendation given: keep the 300-level cap.** This is the dominant pattern for this
genre (Two Dots, Water Sort, and this game's own `ex1`/`ex2` reference all ship a curated,
finite campaign rather than infinite auto-generated difficulty) — players value a visible
finish line, and hand-tuned-feeling curation matters more than infinite content here. The
menu already has an unused "📅 Daily" button (`btn-daily`, not wired to anything yet) that
would be a more natural home for an endless/rotating mode later, kept separate from the
main 300-level campaign.

**Difficulty curve — direction only, not finalized, not yet built:**
- Group the 300 levels into tiers (first tier already named AWAKENING in `levels.js`/
  `ui.js`'s difficulty-label map) of roughly 50-60 levels each.
- Grid size starts at 4x4, scales up over the tiers — likely capped around 6x6 or 7x7
  before cells get too small to comfortably tap on a phone screen.
- Path count and path length scale up alongside grid size. The generator's palette already
  has 10 colors ready (`tools/generate_level.py`'s `colors` list); beyond 10 simultaneous
  paths would need either more colors or a secondary visual distinguisher (pattern/texture).
- Once the curve's numbers are actually decided, the plan is a small pipeline script that
  calls the generator per-tier with that tier's grid/paths/length settings across many
  seeds, runs it through the same validation the generator already does internally, and
  emits the full `LEVELS` array in one pass — rather than continuing to hand-paste one
  level at a time into `levels.js`.
- **Explicitly not started**: the user asked to record this plan only; curve numbers,
  tier names/count, and the pipeline script are all still open.

---

# Update — 2026-08-15 (cont'd): full 300-level campaign generated

## 🗺️ Difficulty curve finalized and built
Turned the previous session's direction-only roadmap into concrete numbers and a pipeline,
per the earlier "Next Steps" item.

**New tool: `tools/generate_campaign.py`** — imports `try_generate`/`COLORS` from
`generate_level.py` (hoisted `COLORS` to module level there so it's importable) and runs the
whole campaign in one pass:

| Tier | Levels | Grid | Paths | Path length | Difficulty |
|---|---|---|---|---|---|
| AWAKENING | 1-50 | 4×4 | 5→6 | 6-9 | easy→medium |
| MOMENTUM | 51-100 | 4×4 | 6→7 | 7-10 | easy→medium |
| CASCADE | 101-150 | 5×5 | 7→8 | 8-11 | medium→hard |
| VORTEX | 151-200 | 5×5 | 8→9 | 9-12 | medium→hard |
| LABYRINTH | 201-250 | 6×6 | 9→10 | 10-13 | hard |
| ASCENSION | 251-300 | 6×6 | 10 | 11-14 | hard |

Path count/difficulty ramps linearly across each tier's 50 levels; grid/length are fixed
per tier. `parMoves`/`maxMoves` standardized to `numPaths + 2` / `numPaths + 5` for all 300
(the original hand-placed Levels 1-2 used an inconsistent formula — moves only increments on
a *successful* clear, never a bump, so this is purely a star-threshold choice, not a real
gap to close).

Each level uses a deterministic seed (`level_id * 977`) into the existing
solvability/adjacency validator, with automatic fallback to fewer paths if a level can't be
found within the seed budget — **all 300 generated on the first pass, zero fallbacks, zero
failures**, in ~60 seconds total.

`js/levels.js`'s `LEVELS` array was replaced end-to-end with the generated output (header
comment and `getLevel()` helper kept as-is). Output is minified JSON (no `indent=2`) to keep
the file size down — ~830KB instead of ~2.7MB pretty-printed.

## ✅ Verification (Playwright, headless Chromium)
- Parsed the generated JSON directly: exactly 300 levels, unique sequential ids 1-300, tier
  counts 50/50/50/50/50/50 as designed.
- Loaded a same-tier sample (levels 1, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275,
  300) in a live browser via `Game.loadLevel()` — correct grid/path-count/tier/difficulty
  for every one, zero console errors (only benign WebGL driver perf warnings).
- Programmatically solved levels 1/50/100/150/200/250/300 end-to-end using the same
  blocker-detection rule as `game.js`'s `findBlocker()` — every path clears, confirming
  solvability in any order (no forced sequence dependency), matching the guarantee the
  generator already makes internally.

## 🔜 Next Steps
- Playtest feel/pacing manually (grid 6 with 10 paths is dense — worth confirming tap
  targets stay comfortable at that size on an actual phone viewport).
- Sound: still preference-only, no audio files (carried over from the previous session).
- Visual polish pass (confetti win screen, drag-vs-tap feel) from the `ex1`/`ex2` reference
  clips — not started.

---

# Update — 2026-08-15 (cont'd): single-color paths, real blocking, denser curve

User tested the artifact build and reported it was still too easy/sparse, and asked to look
at `ex1.mp4` (the reference app recording) to gauge how many paths the reference actually
uses. Extracted frames with `ffmpeg` (1 fps) and zoomed/enhanced one of the clearer ones —
the reference's level 2, visible across only 2 of the cube's 6 faces, already showed ~6
distinct path arrowheads. That's denser than this game's entire level 1 (5 paths across all
6 faces) or level 2 (6 paths total) from the curve built earlier this session.

## 🐞 Bigger bug found while investigating: blocking never actually happened
While recalibrating path counts, tried to screenshot a "blocked" path for a color-behavior
test and found level 1 had zero blockable paths — checked further and this was true of every
generated level. Root cause: `generate_level.py`'s `try_generate()` had a final validation
step requiring *every* path's exit ray be simultaneously clear against *all* other paths'
full occupied cells, unconditionally. That guarantees every path is tappable in literally any
order from move 1 — the hearts/bump mechanic could never trigger on generated content. Fixed
by replacing that check with `is_solvable()`, which instead simulates the actual game rule
(repeatedly clear whatever's currently free, tracking which cells free up as paths clear) and
only requires that *some* clearing order exists — not that every path starts free. Also
removed a matching per-path immediate-clearance check inside `gen_path()` that was rejecting
any newly-placed path already blocked by earlier ones, for the same reason. Verified: 293/300
regenerated levels now have at least one genuinely-blocked path at start (was 0/300 before).

## 🎨 Switched from per-path identity colors to semantic status colors (user request)
Per-path colors were also running out of headroom once path counts rose (only 10 in the
palette). Replaced entirely with 3 semantic colors read from a path's live status in
`scene.js` (`getPathColor()`), independent of level data:
- **Idle** (untouched): the current theme's accent color (blue in light, cyan in dark).
- **Moving** (successfully sliding off): green.
- **Blocked**: red, and — per explicit request — **stays red** after the bump/return
  animation finishes, until the path is actually tapped successfully. Implemented as a
  `path.wasBlocked` flag set in `game.js`'s `handlePathTap()` on a bump, cleared only on a
  successful tap; `scene.js` reads it alongside `status` when picking stroke color.
`js/levels.js` and the generator still emit a `color` field per path (harmless, unused) —
not worth another full regen just to drop a dead field.

## 🗺️ Rebalanced the difficulty curve (denser, but grid-feasible)
First attempt at "just raise path counts" (up to 10 on grid 4×4) stalled generation for
minutes — 10 paths × 6-9 length on a 96-cell grid-4 cube (×6 faces) is a ~78% fill against
the self-adjacency buffer, effectively unsatisfiable at scale, and the seed-search kept
exhausting its budget before falling back. Rebalanced to stay feasible per grid size instead:

| Tier | Levels | Grid | Paths | Path length | Difficulty |
|---|---|---|---|---|---|
| AWAKENING | 1-50 | 4×4 | 6→8 | 5-8 | easy→medium |
| MOMENTUM | 51-100 | 4×4 | 8→9 | 6-8 | easy→medium |
| CASCADE | 101-150 | 5×5 | 9→10 | 7-9 | medium→hard |
| VORTEX | 151-200 | 5×5 | 10→11 | 8-10 | medium→hard |
| LABYRINTH | 201-250 | 6×6 | 11→12 | 9-11 | hard |
| ASCENSION | 251-300 | 6×6 | 12→13 | 10-13 | hard |

Also expanded `COLORS` in `generate_level.py` from 10 to 12 (added indigo `#3D5AFE` and deep
red `#D50000`) before the color scheme was dropped entirely — kept in place since it's now
harmless dead data, not worth reverting.

Regenerated all 300 levels with both fixes combined: **zero failures, zero fallbacks**.
Level 1 is now 6 paths (was 5), level 300 is 13 paths (was 10). 293/300 levels have real
starting blocking.

## ✅ Verification
- Parsed regenerated JSON: 300/300, correct id range, correct tier counts.
- Playwright: loaded levels 1/50/150/300 in a live browser, correct path/grid/tier data, zero
  console errors.
- Directly exercised the color states in a live browser and screenshotted each: idle (theme
  blue), moving (green — confirmed via screenshot mid-slide), and blocked (red, confirmed
  still red ~1.5s after the bump/return animation fully finished — the persistence works).
- Confirmed via HUD heart-loss that a real bump/block registers during play (previously
  impossible on generated content).

## 🔗 Test build
Republished to the same Artifact link from the previous session (same URL, `force` not
needed — read-then-republish flow) with the rebuilt bundle (new `scene.js`/`game.js`/
`levels.js` inlined alongside the existing Three.js + CSS + rest of the bundle).

## 🔜 Next Steps
- User has not yet confirmed the new build addresses "too easy" — awaiting their playtest.
- Grid 6 / 12-13 paths is very dense; still worth confirming tap targets stay comfortable on
  an actual phone viewport, now doubly so with real blocking chains possibly requiring more
  precise tap ordering.
- The unused per-path `color` field in generated level data could be dropped from the
  generator output in a future cleanup pass (cosmetic only, not urgent).

---

# Update — 2026-08-15 (cont'd): perf fix + much denser curve (level 1 = 20 paths)

User playtested the previous build: still felt trivially easy at level 26, and separately
reported the game feeling resource-heavy/stuttery. Also pointed at `ex2.mp4` level 11, which
shows ~30 visible path lines on a non-cubic (elongated) box - denser and geometrically
different from this game's uniform cube. **Asked whether to also rebuild the cube as a
variable-proportion box to match** - declined for now (would mean re-deriving the whole
face-adjacency table this session already spent real effort getting right, for real risk of
reintroducing the exact kink/backward-arrow bugs fixed earlier); user chose to prioritize
density + performance first, cube-shape change deferred to a future session.

## ⚡ Two real rendering-cost fixes (not just re-tuning grid/path knobs)
1. **`scene.js` `strokePath()` was oversampling by 5x.** It walked each unit of path
   distance in 10 substeps, but `getPointAtDist()` is provably piecewise-linear within a
   unit (straight cell-to-cell, or two straight halves meeting at the face-crossing edge
   point) - it never actually curves. 2 substeps per unit hits every real bend exactly;
   changed `* 10` to `* 2`. Free win, no visual change, less canvas work every dirty frame.
2. **`game.js`'s dirty-face marking was the real bottleneck.** `animateLogic()` marked a
   moving/bumped path's *entire* face list dirty for its whole animation, even faces the
   slide-out had already scrolled past minutes into the animation - each dirty face means a
   full texture re-upload to the GPU every frame, the classic WebGL cost center. Replaced
   with a windowed calculation matching exactly what `scene.js` actually draws each frame
   (`[floor(progress), ceil(segments.length-1+progress)]` clamped to the path's real
   segment range) - a long multi-face path now only keeps the *currently visible* faces
   dirty, not every face it will ever touch.
3. Texture anisotropy capped 4→2 (minor, GPU sampling cost with no benefit on flat 2D art).

Measured after the fix (Playwright, headless Chromium, 90-frame sample during a real
multi-face slide-out on the densest level): avg frame time 16.5ms, max 19.3ms - essentially
pinned to the 60fps/16.7ms vsync cap, not compute-bound.

## 🗺️ Curve rebuilt again, starting far denser
User's explicit numbers: level 1 = 20 lines, comparable to `ex2.mp4`'s level 11 at ~30.
Verified feasibility per-tier empirically before committing to a full 300-level run (a naive
"just raise the numbers" attempt at grid 8 / 44 paths stalled generation - ~92% cell fill is
past where the self-adjacency buffer can reliably find a layout):

| Tier | Levels | Grid | Paths | Path length |
|---|---|---|---|---|
| AWAKENING | 1-50 | 6×6 | 20→24 | 4-6 |
| MOMENTUM | 51-100 | 6×6 | 24→27 | 4-6 |
| CASCADE | 101-150 | 7×7 | 28→31 | 5-7 |
| VORTEX | 151-200 | 7×7 | 31→34 | 5-7 |
| LABYRINTH | 201-250 | 8×8 | 34→38 | 6-8 |
| ASCENSION | 251-300 | 8×8 | 38→40 | 6-8 |

Grid size itself had to grow too - 20+ paths simply don't fit a 4×4 or 6×6 cube at readable
path lengths. Regenerated all 300 levels: **zero failures, zero fallbacks**, and **300/300
now have real starting blocking** (up from 293/300 last pass, since denser boards leave less
room for an accidentally-already-solvable layout).

## ✅ Verification
- Parsed regenerated JSON: level 1 = 20 paths/grid 6 exactly as requested, level 300 = 40
  paths/grid 8.
- Playwright: loaded levels 1/150/300 live, zero console errors.
- Frame-timing test above, run against the path touching the most distinct faces on level
  300 (worst case for the old whole-path dirty marking).
- Visual screenshot of level 300 idle now reads as a genuine dense maze, closer to the
  `ex1`/`ex2` reference material's look.

## 🔜 Next Steps
- Still awaiting the user's playtest of this build on their actual machine - headless-Chromium
  frame timing is a proxy, not a guarantee, for real-device performance.
- Non-cubic box geometry (matching `ex2.mp4`'s elongated shape) explicitly deferred - would
  need a full re-derivation of the face-adjacency table for non-equal edge lengths before any
  implementation attempt.
- Grid 8 tap-target size on a real phone is an open question, now more pressing at 40
  concurrent paths.

---

# Update — 2026-08-15 (cont'd): reverted a self-inflicted rendering regression

User tested the just-published build (`test8.mp4` + two annotated screenshots) and reported
two real bugs: some paths render with no arrowhead at all, and lines don't connect
continuously across a face boundary.

## 🐛 Root cause: the earlier "5x oversampling" perf fix from this same session was wrong
`scene.js`'s `strokePath()` sample-density reduction (`Math.ceil(endD - startD) * 10` →
`* 2`, from the "perf fix" pass earlier today) was justified by "the path is piecewise-linear
within each unit, 2 samples suffice." That reasoning holds for the exact bend points, but
missed that consecutive samples land at fixed 0.5-unit spacing from a possibly-fractional
window origin — visually fine by luck at idle (offset exactly 0), but not reliably hitting
the exact face-crossing edge point in general. Reproduced directly: loaded level 1, rotated
the cube via simulated drag to the same angle as the user's screenshots, found the exact same
artifact (a solid-color path ending in a blunt rounded cap instead of a triangular
arrowhead). Reverting the multiplier back to `* 10` made the same path render correctly on
the next screenshot, in the same test - confirmed via direct before/after comparison, not
just code reasoning.

**Net effect on performance:** re-measured frame timing after the revert (same 90-frame
sample, same densest level/path) - 16.55ms avg / 18.40ms max, statistically the same as with
the broken `* 2` version (16.51-16.55ms range across all three measurements today). The
dirty-face windowing fix (the other half of today's perf pass) was the fix that actually
mattered; the stroke-sampling change was a false economy that broke rendering for zero
measurable benefit. Reverted, no replacement needed.

## ✅ Verification
- Direct visual repro/fix comparison via Playwright screenshots (see above).
- Playwright smoke test: levels 1/150/300 load with correct path/grid counts, zero console
  errors, in the rebuilt bundle.
- Frame-timing re-check confirms no perf regression from the revert.

Republished to the same artifact link.

## 🔜 Next Steps
- Still waiting on the user's next playtest to confirm both reported bugs are gone and no
  new ones appeared.
- General lesson for this codebase: don't reduce canvas/geometry sampling density based on
  "it's mathematically piecewise-linear" reasoning alone when the sampling window's *origin*
  can be fractional (mid-animation) - verify visually before and after, not just algebraically.

---

# Update — 2026-08-15 (cont'd): fixed a real gameplay race condition (false bumps)

User playtested (screenshot from `test9.mp4`, level 27) and reported: occasionally tapping a
path makes it slide forward, then reverse back to its start and turn red - even though
nothing visible is blocking it.

## 🐛 Root cause: `findBlocker()` checked a moving path's *original* cell list, not its
## *current* (partially-cleared) one
`game.js`'s `getPathCell()` had a pre-existing, self-documented simplification (the comment
literally said "we just check the base segments... if a path is moving, it might still
block"). A path currently sliding out (`status: 'moving'`) visually vacates its tail segments
as `progress` increases - `scene.js` only draws segments with index `>= floor(progress)` at
any given moment - but `getPathCell()` still matched against *all* of that path's original
segments regardless of animation progress. So: tap path B (starts moving, tail visually
clears within ~1-2 frames), then quickly tap path A whose exit ray happens to cross through
one of B's now-vacated tail cells - `findBlocker()` for A still found B "occupying" that
cell (using B's static segment list) and bumped A, even though the screen shows nothing
there anymore. This was always present in the code but only became noticeable now that
levels have 20-40 paths tapped in quick succession, raising the odds of hitting the timing
window.

**Fix:** `getPathCell()` now excludes a moving path's already-passed segments
(`idx >= Math.floor(p.progress)`), matching exactly what `scene.js` currently renders.
Bumped/returning paths are left as full-segment checks (their offset is always small, so the
difference is negligible there).

## ✅ Verification (not just code reasoning)
Built a Playwright repro using level 1's real data: found a concrete pair (`p1` blocked by
`p2`'s very first/tail segment) via a small script, then in a live browser: tapped `p2`
(free, starts moving), waited ~120ms (long enough for its progress to pass that tail
segment), tapped `p1`, and checked the HUD heart count.
- **Before the fix** (verified by temporarily reverting): hearts drop 3→2 - the exact
  reported bug, reproduced on demand.
- **After the fix**: hearts stay at 3 - `p1` starts moving instead of bumping.
Re-applied the fix, rebuilt the bundle, smoke-tested levels 1/27/150/300 load cleanly with
zero console errors, and republished to the same artifact link.

## 🔜 Next Steps
- Awaiting confirmation this specific race is gone in real play. Given it's timing-dependent
  (requires tapping a second path within roughly one `progress` unit's worth of frames after
  the first starts moving), it may take a few attempts to trigger even if a regression
  reappears - a quiet playtest isn't full proof, just supporting evidence.

---

# Update — 2026-08-15 (cont'd): simplified the false-bump fix per user's own diagnosis

User confirmed the false-bump race matched their own read of it and proposed the fix
directly: once a path has successfully started exiting, treat it as fully passable for other
paths immediately - not progressively as its slide-out animation plays.

## Simplified `getPathCell()` further
The previous fix (partial exemption: `idx >= Math.floor(p.progress)`) only exempted a moving
path's already-passed segments, matching the animation frame-by-frame. That's more
conservative than necessary and still has a tiny window right at the start of a slide
(`progress` near 0) where nearly the whole path still blocks. Per the user's suggested
behavior, changed to skip a path's cells entirely once `status === 'moving'` - once a tap has
confirmed a path can leave, it no longer blocks anything, from that instant, regardless of
how far its slide-out animation has actually played. Bumped/returning paths (haven't
committed to leaving) still block normally.

## ✅ Verification
Re-ran the same Playwright repro from the previous fix, plus a zero-delay variant (tap the
first path, then immediately tap the second with no wait at all) to prove the tightest
possible timing window is now covered too - both passed (hearts stay at 3, no false bump).
Rebuilt the bundle, smoke-tested levels 1/27/150/300, zero console errors, republished to the
same artifact link.

## 🔜 Next Steps
- Awaiting the user's next playtest to confirm the false-bump issue is fully gone, including
  in rapid-tap sequences the automated repro may not have covered.

---

# Update — 2026-08-15 (cont'd): cube see-through rendering fixed and confirmed

User reported (`test10.mp4`) some cube faces couldn't be seen through to the back. Went
through several iterations before landing on the right design:
1. First tried `depthWrite: false` on a single transparent box mesh — reduced but didn't
   fully fix view-angle-dependent occlusion (`test11.mp4` + screenshots still showed some
   faces gray/opaque).
2. Misread the reference clip `ex2.mp4` as "plain opaque box, no see-through" and reverted
   to fully opaque `MeshBasicMaterial` — wrong call, corrected once the user pointed at
   `ex3.jpg`, which shows the front face with the back face's paths faintly visible through
   it, confirming see-through *is* the intended design.
3. **Final fix**: split the cube into two `THREE.Mesh` objects sharing one `BoxGeometry` —
   a `BackSide` mesh (far walls, opacity 0.55, `renderOrder = 0`) and a `FrontSide` mesh (near
   walls, opacity 0.88, `renderOrder = 1`), both `depthWrite: false, depthTest: false` so
   `renderOrder` alone controls draw order instead of BoxGeometry's fixed per-face material
   order. Both live under a new `cubeGroup` that the drag-rotate handler rotates. Full
   rationale and rejected alternatives logged in memory (`arrowflow_render_perf`).

**Verified two ways:** built a self-contained single-file bundle and drove it with Playwright
(`python -m playwright`, works on this machine even without `node`) to visually match
`ex3.jpg`; then the user independently confirmed via their own `test12.mp4` that it's correct
and that resource usage feels fine now.

## 🔜 Next Steps (open, not started — carried over from earlier sessions)
- Sound: still preference-only, no real audio files.
- Visual polish pass (confetti win screen, drag-vs-tap feel) from the `ex1`/`ex2` reference
  clips.
- Non-cubic box geometry to match `ex2.mp4`'s elongated shape — explicitly deferred, would
  need a full face-adjacency re-derivation.
- Grid 8 tap-target size on a real phone — open question, now more pressing at 40 concurrent
  paths on the densest tier.
- Unused per-path `color` field in generated level data — cosmetic cleanup, not urgent.
- User has not yet said which of the above (if any) is next — check with them before starting.

---

# Update — 2026-08-15 (cont'd): visual/feel polish — drag inertia + win confetti

User picked "polish ภาพ/ฟีล (confetti, drag feel)" as the next phase from the open items
list above.

## ✅ Drag inertia (`js/scene.js`)
Rotation previously stopped dead the instant the pointer lifted. Added momentum: `onPointerMove`
now also tracks a smoothed velocity (`velX`/`velY`, exponential toward the latest per-move
delta, clamped to ±25 so one huge-delta frame can't launch it absurdly fast); `animate()`
keeps applying that velocity with 0.94/frame friction decay after release until it drops below
an epsilon. A new grab (`onPointerDown`) zeroes any in-flight velocity so re-grabbing the cube
feels like catching it, not fighting residual spin. Rotation logic itself was factored out into
`applyDragRotation(dx, dy)`, shared by both the live-drag and inertia paths. Also moved the
rotated object from the raw cube mesh to a new `cubeGroup` (needed anyway for the earlier
front/back dual-mesh see-through fix — see [[arrowflow_render_perf]]).

## ✅ Win-screen confetti (`js/ui.js` + `css/style.css`)
`#confetti-area` existed in `index.html` since the original 3D redesign but was never wired to
anything (empty div, no CSS, no JS). Implemented `burstConfetti()`: a canvas-based particle
burst (90 particles, gravity + drag physics, ~2.2s, fades and self-removes), colors drawn from
the existing accent/star/status palette. Respects `prefers-reduced-motion: reduce` (skips
entirely rather than forcing motion on everyone). Called from `showWin()`. `.modal-win-box`
needed `position: relative; z-index: 2` added — `.confetti-area` is absolutely positioned
(so it doesn't disturb the flex-centered modal box) which by CSS painting order would
otherwise paint *above* the static-flow win card and cover the text. `hideAllModals()` and the
win modal's Next/Replay handlers now clear `#confetti-area` immediately on close instead of
leaving a burst to finish unseen in the background.

## ✅ Verification
Rebuilt the Playwright bundle-and-screenshot method used throughout this session:
- Inertia: fast flick-drag, screenshotted at +0/150/450/1950ms — cube visibly kept rotating
  after release and had settled to a stop by ~450ms.
- Confetti: called `UI.showWin(1, 3)` directly (no need to actually solve a 20-path level),
  screenshotted at +150/650/2850ms — burst renders behind the card (doesn't obscure the win
  text/buttons), and is fully cleared by 2850ms as designed.
- Zero console errors in either pass.

Republished to the same artifact link (`arrowflow_test.html`, same URL as prior sessions).

## 🔜 Next Steps
- Awaiting the user's own playtest/feel-check of both changes on their machine.
- Remaining open items from the polish list: sound (still preference-only), non-cubic box
  geometry (deferred), grid-8 tap-target sizing on a real phone, unused per-path `color` field
  cleanup.

---

# Update — 2026-08-15 (cont'd): fixed a real bug in the test-bundle build process (not the game itself)

User tested the republished link (`test13.mp4` + a desktop screenshot) and reported the cube
rotation feel was great, but the win modal rendered completely unstyled - serif font, no blue
accent color, plain borders instead of filled buttons - even though layout/spacing (rounded
corners, shadows, padding) looked normal.

## 🐛 Root cause: every project source file has a UTF-8 BOM; the bundler script didn't strip it
`index.html`/`css/style.css`/every `js/*.js` file starts with a UTF-8 byte-order-mark (`EF BB
BF`). This is invisible and harmless when the browser loads each file as its own resource via
`<script src="...">`/`<link>` (the real game, `index.html`, was never affected) - browsers
correctly strip a BOM at the start of a standalone fetched file. But the single-file test
bundle this session has been building for the Artifact link concatenates all of them as literal
text inside shared `<script>`/`<style>` blocks - there, a BOM landing mid-document is not
guaranteed to be treated as harmless whitespace. Confirmed directly: isolated each of the 6
inlined JS files into its own minimal test page - all 6 threw `SyntaxError: Invalid or
unexpected token` on their own; reading with Python's `utf-8-sig` codec (strips BOM) instead of
plain `utf-8` fixed all 6 instantly, verified via Playwright (zero console errors after,
`getComputedStyle` confirmed `--accent`/font/button-background all resolve correctly).

**This was a bug in the test-bundle build script only, not in the actual project files or game
code** - `index.html`/`js/*.js`/`css/style.css` in the repo are untouched and were never
broken.

## ✅ Fix
Rebuilt the bundling script to read every source file with `utf-8-sig` (strips BOM) and added
an explicit `<meta charset="UTF-8" />` at the top of the bundle for good measure. Verified zero
BOM bytes remain anywhere in the output file, zero console errors, correct computed styles.
Republished to the same artifact link.

## 🔜 Next Steps
- Awaiting the user's fresh reload/retest to confirm the win-screen styling now renders
  correctly on their desktop browser too.
- Same open items as before (sound, non-cubic geometry, tap-target sizing, unused color field).

---

# Update — 2026-08-15 (cont'd): sound effects implemented

User confirmed the encoding fix (`test14.mp4` + desktop screenshot) - win modal now renders
correctly styled (blue accent, Nunito font, filled buttons). Said "ทำต่อได้เลย" (go ahead) to
continue; picked up the next open backlog item myself: sound was still preference-only with no
actual audio.

## ✅ New `js/sound.js` module
Rather than sourcing external audio files (licensing/asset-management overhead, and the
Artifact test bundle needs everything self-contained anyway), implemented four short
synthesized effects via the Web Audio API - oscillator + exponential-decay gain envelope, no
external assets at all:
- `playSlide()` - rising triangle-wave blip, on a successful tap (path starts exiting).
- `playBump()` - falling sawtooth, on a blocked tap (heart lost).
- `playWin()` - four-note rising triangle arpeggio, on level complete.
- `playFail()` - long falling sawtooth, on hearts-depleted fail.
`AudioContext` is created lazily on first `play*()` call rather than at page load - those calls
only ever happen inside real user-gesture handlers (a tap), so this satisfies browsers'
autoplay-blocking policy without a separate "unlock" step. Every play function checks
`Storage.get('sound')` itself, so the existing sound-toggle button (already wired to that same
flag from an earlier session, previously a no-op preference switch) now actually mutes/unmutes.
Wired into `js/game.js`: `handlePathTap()`'s two branches, `onWin()`, `onFail()`.

## ✅ Verification
Rebuilt the Playwright bundle (now 7 inlined scripts, `sound.js` added between `storage.js`
and `levels.js`) with the same `utf-8-sig` BOM-safe read process from the last fix. Called all
four `Sound.play*()` functions directly (zero errors), then ran a real tap sequence across the
cube's visible arrows in a live game session - a real bump occurred (heart count dropped in the
HUD, confirmed via DOM read) with zero console/page errors, confirming the in-game hooks fire
correctly, not just the synth functions in isolation. Republished to the same artifact link.

## 🔜 Next Steps
- Awaiting the user's own listen-test (headless Chromium can't confirm actual audio output,
  only that no exceptions were thrown and the context was created).
- Remaining open items: non-cubic box geometry (deferred), grid-8 tap-target sizing on a real
  phone, unused per-path `color` field cleanup.

---

# Update — 2026-08-15 (cont'd): background music + vibration

User confirmed sound effects work (`test15.mp4`), then asked whether adding background music
and vibration (on obstacle-hit and level-complete), each independently toggleable, would be
worth it - flagged as an exploratory question, so gave a recommendation first rather than
building immediately: vibration is cheap to add but iOS Safari doesn't implement
`navigator.vibrate` at all (Android-only effect); background music is more involved than the
short SFX already built (needs a loop that doesn't grate, separate volume handling, needs to
stop/start with screen transitions). User said to go ahead with both, reasoning that this will
eventually ship to app stores (a native wrapper there would get real haptics regardless of the
web Vibration API's iOS gap).

## ✅ New `js/haptics.js`
Thin wrapper around `navigator.vibrate()`: `Haptics.bump()` (60ms buzz), `Haptics.win()`
(short 5-pulse pattern). Guarded by both feature detection and a new `Storage` flag
(`vibration`, default `true`) - separate from the `sound` flag since haptics is a distinct
sense a player might want off independently of audio. New toggle button `#btn-vibration`
(📳/📴) added next to the existing sound toggle in the menu's top controls row (wrapped both
in a `.controls-group` flex container so `justify-content: space-between` still splits
theme-button vs. sound+vibration cleanly with a 3rd icon in the row). Wired into
`js/game.js`: `Haptics.bump()` alongside every `Sound.playBump()` call, `Haptics.win()`
alongside `Sound.playWin()`.

## ✅ Background music added to `js/sound.js`
`startMusic()`/`stopMusic()`: four soft sine-wave chords (C/G/Am/F) cycling every ~4.2s
indefinitely, each note with its own attack/release gain envelope so chord changes crossfade
rather than click - synthesized the same way as the SFX (no audio files/assets). Scheduling
uses the Web Audio clock (`startTime` params) for the actual audio timing, `setTimeout` only
triggers *when to schedule the next chord*, so a few ms of JS timer jitter doesn't audibly
matter for a slow ambient pad. Wired into `js/ui.js`'s `showScreen()`: starts automatically
entering `screen-game`, stops on any other screen (menu/level-select) - and into `applySound()`
so toggling the existing sound switch live-stops/starts music immediately rather than waiting
for the next screen change, and respects the same `Storage.sound` flag as the SFX (one master
audio switch controls both, per the earlier design conversation).

## ✅ Verification
Rebuilt the Playwright bundle (now 8 inlined scripts: `haptics.js` added after `sound.js`).
Checked: vibration toggle button flips its icon and `Storage.vibration` correctly; `play ->
pause -> quit` screen-transition sequence (which now starts/stops music) runs with zero
console/page errors; `Haptics.supported()` reports `true` in headless Chromium and
`bump()`/`win()` don't throw. Republished to the same artifact link. As with the SFX, headless
Chromium can't confirm actual audible/haptic output - only that nothing throws and state
updates correctly.

## 🔜 Next Steps
- Awaiting the user's own listen/feel-test on a real device (vibration especially - Android
  only, and headless testing can't simulate real hardware).
- Remaining open items: non-cubic box geometry (deferred), grid-8 tap-target sizing on a real
  phone, unused per-path `color` field cleanup.
- Explicitly flagged for whenever the app-store packaging work actually starts: a native
  wrapper (Capacitor/Cordova or similar) could use real native Haptics APIs to get vibration
  working on iOS too, instead of the web `navigator.vibrate` ceiling - worth revisiting then,
  not now.

---

# Update — 2026-08-15 (cont'd): dedicated Settings screen (music/SFX/vibration split)

User asked for a proper settings button/modal instead of scattered top-row icon toggles, with
independent on/off control for background music, sound effects, and vibration specifically
(these had been sharing one "sound" flag - music and SFX toggled together).

## ✅ Split music from SFX
`Storage` gets a new `music` flag (default `true`), separate from the existing `sound` flag
(now purely SFX). `js/sound.js`'s single `enabled()` check split into `sfxEnabled()` (gates
`playSlide`/`playBump`/`playWin`/`playFail`) and `musicEnabled()` (gates `startMusic`).

## ✅ New Settings modal (`#modal-settings`)
Replaced the two inline icon-toggle buttons (`btn-sound`, `btn-vibration`) in the main menu's
top row with a single gear button (`#btn-settings`, ⚙️) that opens a modal with three
iOS-style toggle switches (new `.switch`/`.switch-knob` CSS component): Music, Sound Effects,
Vibration - each independently on/off, backed by `Storage.music`/`Storage.sound`/
`Storage.vibration` respectively. Also reachable mid-game via a new "⚙ Settings" button added
to the pause modal's button list (opens on top of - not replacing - the pause modal, so
closing Settings returns you to Pause). Incidental fix: `btn-quit` was styled `btn-ghost`,
a CSS class that was never actually defined anywhere in `style.css` (rendered with zero
button styling) - changed to the existing `btn-outline` class to match its sibling buttons.

`UI.applySound`/`applyMusic`/`applyVibration` now just persist the flag (no more DOM
icon-text manipulation, since the old inline icons are gone); a new `syncSettingsUI()` reads
all three flags into the switch elements' visual state whenever the modal opens or a toggle
is clicked.

## ✅ Verification
Rebuilt the Playwright bundle. Opened Settings from the main menu, confirmed all three
switches default "on"; toggled all three off, confirmed `Storage.music`/`sound`/`vibration`
all became `false` and the switches visually reflect "off"; closed, entered a level, reopened
Settings via the pause modal, confirmed the switches still correctly show "off" (state
persisted across the screen change); toggled music back on live mid-game without error.
Zero console/page errors throughout. Republished to the same artifact link.

## 🔜 Next Steps
- Awaiting the user's playtest of the new Settings screen.
- Remaining open items: non-cubic box geometry (deferred), grid-8 tap-target sizing on a real
  phone, unused per-path `color` field cleanup, native-haptics revisit at app-store-packaging
  time.

---

# Update — 2026-08-15 (cont'd): Settings reachable directly from the in-game HUD

User confirmed the Settings modal works (`test16.mp4`), then raised a real friction point:
reaching Settings mid-game required pausing first. Asked for a recommendation between (a) a
second dedicated gear button in the gameplay HUD vs. (b) just adding a text label to the
existing pause button. Recommended (a) - the pause icon (⏸) is already unambiguous, and a
text label wouldn't reduce the actual number of taps needed to reach Settings, which was the
real complaint; a direct gear button lets players adjust audio/vibration without stopping
gameplay. User agreed, asked to proceed.

## ✅ New `#btn-hud-settings` in the gameplay HUD
Added next to `#btn-pause` in `hud-top`, both wrapped in a new `.hud-controls-group` flex
container so the existing 3-slot `justify-content: space-between` layout (controls / level
badge / hint button) still holds with a 4th button added. Refactored the three settings-open
handlers (`btn-settings`, `btn-pause-settings`, and now `btn-hud-settings`) into a single
shared `openSettings()` closure in `wireEvents()` instead of duplicating the same two lines a
third time.

## ✅ Verification
Rebuilt the Playwright bundle. Clicked `#btn-hud-settings` directly during live gameplay and
confirmed the pause modal never opened (`modal-pause` stayed hidden) while the settings modal
opened correctly (cube visibly still rendering/rotatable behind the blurred settings overlay,
matching the intent that opening Settings this way doesn't force a full pause). Confirmed the
pre-existing pause-modal path to Settings still works too. Zero console/page errors.
Republished to the same artifact link.

## ✅ User-confirmed
User tested the HUD settings button live and confirmed it works well - this closes out the
whole "visual/feel polish" backlog item (inertia, confetti, sound, music, vibration, and now
in-game settings access) that's been worked through across this session.

## 🔜 Next Steps
- Remaining open items unchanged: non-cubic box geometry (deferred), grid-8 tap-target sizing
  on a real phone, unused per-path `color` field cleanup, native-haptics revisit at
  app-store-packaging time.
- No open item is currently in progress - check with the user for the next priority.

---

# Update — 2026-08-15 (cont'd): time-based score + personal Stats screen

User asked for a stats view (best score per level, total score, "ranking"). Since the game is
entirely client-side (no backend, no other players' data exists anywhere), true cross-player
ranking isn't buildable without standing up a server - explained that tradeoff and user chose
the local/personal-best route, then asked for a scoring recommendation using level completion
time as the main criterion (like most games in this genre).

## ✅ Scoring formula (`js/game.js`, no level-data changes needed)
`computeScore()`: `parTime = numPaths * 2.5s` (derived live from the level's own path count,
not stored anywhere) → `timeBonus = max(0, round((parTime - elapsed) * 20))` (faster than par
earns points, slower earns zero rather than going negative) → `+ lives*100` (hearts-remaining
bonus) `+ stars*200` `+ 500` base. `state.startTime` set in `loadLevel()`, elapsed computed in
`onWin()`.

## ✅ Storage schema extended (`js/storage.js`)
`completeLevel()` now also takes `score`/`timeSec`; per-level `levelData[n]` gains `score`
(best-ever, max) and `time` (best-ever, min), alongside the existing `stars`/`moves`. New
`totalScore` (sum of every level's best score) tracked the same way `totalStars` already was.
New `getAllLevelData()` getter for the stats screen to enumerate.

## ✅ New Stats screen (`index.html` + `js/ui.js` + `css/style.css`)
Reachable via a new "📊 สถิติ" button on the main menu. Shows 4 summary cards (total score,
total stars, levels completed / 300, single best-scoring level) plus a scrollable per-level
list (stars/time/score), newest-completed-level first. Personal-best only, explicitly not a
multiplayer leaderboard - that's flagged as a future item requiring a real backend if ever
wanted. Win modal (`modal-win`) also gained คะแนน/เวลา (score/time) stats next to the existing
Hints counter.

## ✅ Verification
Playwright: empty-state stats screen (no levels completed yet) renders its "ยังไม่มีด่านที่ผ่าน"
message; injected fake `Storage.completeLevel()` calls for 2-3 levels and confirmed totals,
best-level card, and per-level rows all compute correctly; called `UI.showWin()` directly and
confirmed the win modal's new score/time fields render. Zero console errors throughout. (One
false alarm during testing: a screenshot taken immediately after clicking into the Stats
screen showed it translucent with the menu bleeding through - turned out to be a genuine
mid-transition frame, since `.ovr-screen` cross-fades over 0.4s; a screenshot taken after the
transition settled confirmed the screen renders solid and correctly, not a real bug.)

## 🔜 Next Steps
- Not yet published to the test-bundle Artifact link - do that next if the user wants to
  playtest this on their own device before it's considered done.
- True cross-player leaderboard/ranking explicitly deferred - would need a backend (e.g.
  Firebase/Supabase) to store other players' scores, out of scope for this pass.
- Same other open items as before: non-cubic box geometry, grid-8 tap-target sizing, unused
  per-path `color` field cleanup, native-haptics revisit.

---

# Update — 2026-08-15 (cont'd): global leaderboard built (Firebase Anonymous Auth + Firestore)

User tested the previous build's win modal and asked for a score+ranking popup after each level
- clarified this meant a real cross-player leaderboard, not just the personal-best stats screen
from the prior update. Since that needs a backend, walked the user through creating their own
Firebase project (`arrowflow-8d6a8`) live in this session: Firestore Database, Anonymous
Authentication (Auto clean-up left OFF so inactive players' scores don't silently expire after
30 days), and a Web app registration to get the client config.

## ✅ New `js/leaderboard.js`
Firebase compat SDK (`firebase-app-compat.js` / `-auth-compat.js` / `-firestore-compat.js`,
loaded via CDN `<script>` tags in `index.html` - matches this project's existing non-bundled,
non-module script style, no build step). `firebaseConfig` is embedded directly in the file,
which is the documented-safe approach for Firebase web apps (it's not a secret - real
protection is the Firestore Security Rules, not hiding this key).

Every exported function (`submitScore`, `fetchTop`, `fetchMyRank`) is best-effort: wrapped so a
network failure or disabled provider degrades to a safe empty/null return instead of throwing -
gameplay must never depend on the leaderboard being reachable. `ensureInit()` lazily signs in
anonymously on first use and races a 6s timeout so a dead network can't hang the UI.

**Identity model matches what the user asked for explicitly**: no email/password, just a
nickname (`Storage.set('nickname', ...)`) paired with a Firebase anonymous-auth UID generated
fresh in the browser. Clearing site data / reinstalling loses that UID, so the player starts
over under a new name next time - by design, not a bug to fix later.

## 🐛 One real bug found and fixed during testing: `.count()` isn't in this compat SDK build
Original `fetchMyRank()` used Firestore's count() aggregation
(`.where('totalScore','>',myScore).count().get()`) to avoid downloading every higher-scoring
doc just to size a query. Playwright testing against the live project threw `count is not a
function` - confirmed via direct eval that `typeof query.count` is `'undefined'` on this
project's `firebase-firestore-compat.js@10.14.1` (aggregation queries are apparently
modular-API-only in this build, not exposed on the compat namespace). Fixed by dropping to a
plain `.get()` + `snap.size` - fine at this game's actual scale, flagged in a comment as the
thing to revisit if the player base ever got large enough for that to matter.

## ✅ New UI pieces
- **Nickname modal** (`#modal-nickname`), shown once via `UI.promptNicknameIfNeeded()` on first
  launch (`main.js`) if no nickname is stored yet. Skippable - a skip leaves the leaderboard
  badge hidden in the win modal until a nickname is set later. Also reachable anytime via a new
  "👋 ชื่อผู้เล่น" row in the existing Settings modal (`btn-edit-nickname`), so skipping isn't a
  dead end.
- **Win modal** gained a "🏆 อันดับโลก: #N" badge, filled in asynchronously after the existing
  score/time/hints stats (submits the score, then fetches rank - never blocks the modal from
  showing), plus a "🏆 ดูอันดับ" button.
- **Leaderboard modal** (`#modal-leaderboard`): top-10 list plus a highlighted "your rank" row,
  opened from the win modal button. Player-supplied nicknames are rendered via `escapeHtml()`
  before going into `innerHTML` - the only place free-text from other users reaches the DOM, so
  this is the one spot that actually needed XSS-safety, not just style.

## ✅ Firestore Security Rules (given to the user to paste in the console, since I can't do
that step myself - it needs their account)
Public read on the `players` collection, write restricted to `request.auth.uid == uid` (a
player can only touch their own doc) with shape validation on `nickname`/`totalScore` - blocks
one client from writing fake scores under another player's identity or malformed data.

## ✅ Verification (Playwright, against the real live Firebase project - not a mock)
Full flow end-to-end: nickname prompt appears on first launch → set nickname → anonymous auth
resolves (`Leaderboard.ensureInit()` → `true`) → `Storage.completeLevel()` → `submitScore()`
returns `true` → `UI.showWin()`'s rank badge fills in "#1" → opening the leaderboard modal shows
both the "your rank" row and the top-10 list pulled from Firestore, correct nickname/score in
both. Zero console errors throughout. Caught and fixed the `.count()` bug above via this same
testing, not just code review.

**Cleanup note**: this testing created two real `TestPlayer_Claude` documents in the live
`players` collection (Firestore has no separate test/prod environment here) - asked the user to
delete them manually from the Firestore console's Data tab, since Security Rules mean I can't
delete another session's docs I no longer hold the auth token for.

## 🔜 Next Steps
- Awaiting the user's confirmation the two test documents are deleted from Firestore.
- Not yet republished to the test-bundle Artifact link - that bundler concatenates all `js/`
  files into inline `<script>` tags, so it'll need the new Firebase CDN `<script src>` tags
  added too, not just the existing inlining step. Do this next if the user wants to playtest on
  their own device.
- Same other open items as before: non-cubic box geometry, grid-8 tap-target sizing, unused
  per-path `color` field cleanup, native-haptics revisit.

---

# Update — 2026-08-16: deployed to GitHub Pages (real hosting, not the sandboxed Artifact link)

Realized the existing Artifact test-bundle link can't validate the leaderboard at all - Artifacts
render behind a strict CSP that blocks every external network request, which would silently kill
every Firebase call (auth, Firestore reads/writes), not just look different. Flagged this instead
of quietly rebuilding a bundle that would look fine but not actually prove the feature works.
Offered three real alternatives; user chose real hosting over Artifact-rebuild or LAN-serving.

## ✅ First-ever git remote + push for this project
Repo was git-initialized locally back on 2026-08-15 but had never been pushed anywhere. Walked
the user through creating a GitHub account (`DanielLK888`) and a new public repo
(`github.com/DanielLK888/arrowflow`) live in this session - I have no `gh` CLI in this
environment and can't create repos/push without the user's own authenticated session, so this
was necessarily an interactive, screen-by-screen walkthrough, including Git Credential Manager's
OAuth popup for the actual push.

**One fix made before the first push**: `ex3.jpg` (a reference screenshot of the *other*
"Arrow Puzzle 3D" app, kept at the project root purely as internal dev reference material per
[[arrowflow_render_perf]]) was untracked but not gitignored - added it to `.gitignore` alongside
the existing `*.mp4` reference-clip rule before committing, so a screenshot of someone else's app
doesn't end up published in this now-public repo.

**One real permission boundary hit**: the chained `git remote add && git branch -M main && git
push` command was blocked outright by the session's auto-mode action classifier before any of it
ran (risky/shared-state action - pushing to a real public GitHub repo). Split into separate
commands; `remote add` and `branch -M` succeeded standalone, then the `git push` itself required
the user's explicit confirmation before retrying, per this environment's safety policy on
actions with external visibility.

## ✅ GitHub Pages enabled
Repo Settings → Pages → source "Deploy from a branch" → `main` / `/(root)`. Live at
**https://daniellk888.github.io/arrowflow/** within about a minute of Save - confirmed via a
polling `curl` loop, not assumed.

## ✅ Verification - now genuinely end-to-end, not sandbox-approximated
Re-ran the same Playwright leaderboard script from the previous update, this time against the
real `daniellk888.github.io` URL instead of a local static server: nickname → anonymous auth →
score submit → rank fetch → leaderboard modal, all succeeded, zero console errors - and unlike
the Artifact-sandbox concern, this run proves real outbound network calls actually work from a
real host. **The user then independently tested on their own device/browser** (screenshots),
played to a nickname "LK", and watched their live rank/score update correctly (1450 → 3276
across two submissions) against the same real leaderboard data the Playwright run had also
written to - genuine cross-session confirmation, not just automated-test-says-so.

## 🔜 Next Steps
- Still need the 3 accumulated `TestPlayer_Claude` documents deleted from the live Firestore
  `players` collection (from this update's and the previous update's testing) - asked the user
  to do this via the Firestore console's Data tab, same as before.
- From now on, any further code change needs a fresh `git push` to `main` for
  `daniellk888.github.io/arrowflow` to pick it up - GitHub Pages does not auto-deploy from
  uncommitted local changes.
- The old Artifact link (`ArrowFlow Test Build`) is now superseded by the real GitHub Pages URL
  for anything leaderboard-related; still fine for pure UI/gameplay smoke-testing without a
  network dependency, but no longer the primary test link going forward.
- Same other open items as before: non-cubic box geometry, grid-8 tap-target sizing, unused
  per-path `color` field cleanup, native-haptics revisit.

---

# Update — 2026-08-16 (cont'd): moved off the daniellk888.github.io URL over a real branding risk

User tested the `daniellk888.github.io/arrowflow/` link from an unrelated machine (confirming it
works beyond this LAN), then raised a legitimate concern: "LK888" is a naming pattern extremely
common among Thai online-gambling sites (the digits "888" specifically are a recurring gambling-
brand convention), and since GitHub Pages URLs embed the account username directly, the live game
URL contained it. Real risk on two fronts - player trust (looks like a gambling site at a glance)
and automated keyword-based web filters (some corporate/ISP-level filters in Thailand block by
keyword match, not just domain reputation). Not a hypothetical: recommended fixing it rather than
leaving it, and the user agreed.

## ✅ Fix: moved the repo into a neutrally-named GitHub Organization
Created org `arrowflow-game` (owned by the same personal GitHub account, free tier), then used
GitHub's **repository transfer** (Settings → Danger Zone → Transfer ownership) rather than a
fresh push - this preserves full commit history and, it turns out, **GitHub Pages
configuration carries over automatically** on transfer (confirmed - the new URL was already
serving without needing to re-enable Pages).

**New canonical URL: `https://arrowflow-game.github.io/arrowflow/`** - no personal-account
username in it at all now. Old `daniellk888.github.io/arrowflow/` URL still resolves (repo
transfer doesn't kill the old owner's Pages the way a delete would - it's just now a different,
unrelated GitHub Pages site since Pages is served from wherever the repo currently lives, not
tied to a fixed slot) but should be treated as retired; told the user to stop sharing it.
Updated the local git remote (`git remote set-url origin ...`) to match, so future pushes go to
the right place.

## ✅ Verification
Re-ran the same Playwright leaderboard script against the new URL - full flow succeeds, zero
console errors, and (confirming the Firebase backend itself is unaffected by the hosting move,
since it's a separate project from GitHub) the leaderboard correctly showed the *same* live
data as before, including two real players who'd played in the interim (`LK` at 3276, `AAb` at
1647) alongside the accumulated test entries.

## 🔜 Next Steps
- Now 4 accumulated `TestPlayer_Claude` documents need deleting from Firestore (one more added
  by this update's re-verification pass) - same ask to the user as before.
- `js/leaderboard.js`'s Firebase config is unaffected by any of this (Firebase project identity
  is independent of where the frontend is hosted) - no code changes were needed for the move,
  purely a GitHub-side operation.
- Same other open items as before: non-cubic box geometry, grid-8 tap-target sizing, unused
  per-path `color` field cleanup, native-haptics revisit.

---

# Update — 2026-08-16 (cont'd): in-game theme toggle button

User asked for a way to switch light/dark theme from the gameplay screen itself - previously the
only theme toggle (`btn-theme`) lived on the main menu.

## ✅ New `#btn-hud-theme` button
Added to the gameplay HUD's `.hud-controls-group`, between the existing pause and settings
buttons. Same 🌙/☀️ icon convention as the menu button.

## 🐛 Avoided a real regression before it shipped: the existing toggle logic would have reset
## progress on every use
The menu's `applyTheme()` handler redraws the cube's face textures by calling
`Game.loadLevel(...)` again - fine on the menu screen (no live game state to lose), but reusing
that same handler for an in-game button would silently reset the current level's progress
(hearts lost, paths already cleared, move count) every time a player toggled theme mid-level.
Caught this before wiring the button, not after a bug report - added `Game.redrawTheme()`
instead, which calls `Scene3D.updateFrame(state.paths, true)` directly (forces every face's
texture to re-stroke with the new theme colors) without touching any game state at all. Both the
menu and HUD buttons now use this shared, non-destructive path; the old `Game.loadLevel()`
call in the theme handler is gone entirely.

## ✅ Verification
Playwright: entered a level, recorded `remaining`/level number, clicked the new HUD button,
confirmed `data-theme` flipped and the cube visibly re-rendered in the new palette while
`remaining`/level number stayed exactly unchanged - toggled back, confirmed it returns cleanly.
Zero console errors.

## 🔗 Deployed
Committed and pushed to `main` (`b76dd39`); confirmed live at
`https://arrowflow-game.github.io/arrowflow/` by polling for the new button's markup in the
served HTML, then the user confirmed visually in their own browser.

## 🔜 Next Steps
- Same open items as before: non-cubic box geometry, grid-8 tap-target sizing, unused per-path
  `color` field cleanup, native-haptics revisit, the 4 pending Firestore test-doc deletions.
- **Session checkpoint recorded here at the user's request (2026-08-16)** - current live state:
  game deployed at `https://arrowflow-game.github.io/arrowflow/` (org-owned URL, no
  personal-account name in it), Firebase project `arrowflow-8d6a8` backing the leaderboard,
  local git remote `origin` pointing at `github.com/arrowflow-game/arrowflow.git`. Any future
  code change needs `git add`/`commit`/`push origin main` to reach that URL - nothing
  auto-deploys from uncommitted local changes.
