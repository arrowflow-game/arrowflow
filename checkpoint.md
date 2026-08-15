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
