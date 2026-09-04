/* ============================================
   ArrowFlow 3D — game.js
   ============================================ */

const Game = (() => {
  const LIVES_MAX = 3;
  // Golden Path Bonus flat score award (see computeScore()'s note on the ~500-900
  // typical score range this needs to feel proportionate against).
  const GOLDEN_BONUS = 250;

  let state = {
    mode: 'campaign', // 'campaign' | 'daily' | 'remix'
    levelNum: 1,
    remixIndex: 0,
    levelData: null,
    paths: [],
    moves: 0,
    hintsUsed: 0,
    clearedCount: 0,
    lives: LIVES_MAX,
    livesMax: LIVES_MAX,
    hintsDisabled: false,
    failed: false,
    won: false,
    lastMovePathId: null,
    canUndo: false,
    startTime: 0,
    pausedMs: 0,
    pauseStartedAt: null,
    // Color-Match Combo (see arrowflow-level-mechanics plan, 2026-08-31): consecutive
    // successful taps on same-colored paths build a combo streak, reset by a blocked
    // tap or a different color. Off entirely on AWAKENING (levelNum<=50) - see
    // comboEnabledForLevel().
    combo: 0,
    comboBest: 0,
    lastClearedColor: null,
    // Golden Path Bonus (see arrowflow-level-mechanics plan, 2026-08-31): one path per
    // level, deterministically picked from the paths that are open right at level
    // start, gives a big bonus if cleared within the first goldenTapWindow taps. Off
    // entirely below levelNum 56 - see goldenEnabledForLevel(). Window tightened to 1
    // (must be the player's very first tap of the level) on 2026-09-01 - user feedback
    // that 3 taps made it trivial to just glance at the glow and grab it for free,
    // undermining the "spot it and act fast" challenge it was meant to be.
    goldenPathId: null,
    goldenClaimed: false,
    goldenBonusAwarded: 0,
    goldenTapWindow: 1
  };

  let animationFrameId = null;

  // Optional tutorial hook: fired with ('tap-success' | 'tap-blocked', path) from
  // handlePathTap(), and ('level-loaded', levelNum) from loadLevel(). Not used by
  // normal gameplay - only the first-run tutorial (js/tutorial.js) listens, to know
  // when the player actually performed each taught action rather than just being
  // told about it.
  let onEventCallback = null;
  function setOnEvent(cb) { onEventCallback = cb; }
  function fireEvent(name, data) { if (onEventCallback) onEventCallback(name, data); }

  function isMilestoneLevel(n) { return typeof n === 'number' && n % 10 === 0; }

  // Color-Match Combo is off entirely on AWAKENING (campaign levels 1-50, the pure
  // onboarding tier - see arrowflow_tutorial memory) so a first-time player only ever
  // learns one new idea at a time. Daily/Remix levels are always past-AWAKENING
  // difficulty (see arrowflow_daily_remix_i18n memory - Daily sits between MOMENTUM/
  // CASCADE, Remix cycles ASCENSION boards), so combo is always on for them.
  function comboEnabledForLevel() {
    if (state.mode !== 'campaign') return true;
    return typeof state.levelNum === 'number' && state.levelNum > 50;
  }

  // Golden Path activates 5 levels after Combo (56 vs 51) so a first-time MOMENTUM
  // player learns one new idea at a time instead of two coach-marks back to back -
  // see the plan's "การอยู่ร่วมกันของ 3 กลไก" section.
  function goldenEnabledForLevel() {
    if (state.mode !== 'campaign') return true;
    return typeof state.levelNum === 'number' && state.levelNum >= 56;
  }

  // Small deterministic string hash (djb2-ish) - same level id always picks the same
  // golden path, so Daily's "levelNum" (a date-keyed string like 'daily-2026-08-31')
  // and Remix's ('remix-3') both work as well as a plain campaign number.
  function hashStringToInt(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // Picks the golden path from whatever's ACTUALLY clearable right at level start
  // (reuses findBlocker() - the same "can this path exit right now" check hints use)
  // so the promised bonus is always reachable, never a path buried behind others.
  // Also excludes any already-`locked` path (Lock-Key mechanic, not yet built this
  // session, but paths may carry that flag once it ships) - a golden path must never
  // require a mechanic ITSELF gates behind clearing something else first.
  function pickGoldenPath() {
    const openPaths = state.paths.filter(p => !p.cleared && p.status === 'idle' && !p.locked && !findBlocker(p).blockedBy);
    if (!openPaths.length) return null;
    const idx = hashStringToInt(String(state.levelNum)) % openPaths.length;
    return openPaths[idx].id;
  }

  // Which cosmetic color-intensity variant (see Scene3D's VARIANT_RECIPES)
  // applies to a given campaign level - 'epic' (every 100th) is a
  // deliberately stronger look than 'milestone' (every 10th), purely
  // cosmetic escalation, not a real difficulty signal (that's still governed
  // by tier/tools/generate_campaign.py, unchanged).
  function skinVariantForLevel(n) {
    if (typeof n !== 'number') return 'normal';
    if (n % 100 === 0) return 'epic';
    if (n % 10 === 0) return 'milestone';
    return 'normal';
  }

  function localDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Shared setup used by loadLevel/loadDailyLevel/loadRemixLevel - only the
  // mode tag, the level-number bookkeeping field, and the source data differ.
  function applyLevelState(mode, data, extra) {
    // REMIX escalates its own lives ceiling and hint availability per lap
    // (js/remix.js) - every other mode keeps the base LIVES_MAX/hints-allowed
    // behaviour untouched, since data.remixLivesMax is only ever set there.
    const livesMax = data.remixLivesMax || LIVES_MAX;
    state = {
      mode,
      levelNum: extra.levelNum,
      remixIndex: extra.remixIndex || 0,
      levelData: data,
      graph: Polycube.buildGraph(data.shape), // for findBlocker()'s open-edge check
      paths: data.paths, // deeply cloned by the caller's data getter
      moves: 0,
      hintsUsed: 0,
      clearedCount: 0,
      lives: livesMax,
      livesMax,
      hintsDisabled: !!data.remixHintsDisabled,
      failed: false,
      won: false,
      lastMovePathId: null,
      canUndo: false,
      startTime: Date.now(),
      pausedMs: 0,
      pauseStartedAt: null,
      combo: 0,
      comboBest: 0,
      lastClearedColor: null,
      goldenPathId: null,
      goldenClaimed: false,
      goldenBonusAwarded: 0,
      goldenTapWindow: 1
    };

    // Picked AFTER state.paths/state.graph/state.levelData are all set above, since
    // pickGoldenPath() -> findBlocker() reads all three.
    if (goldenEnabledForLevel()) state.goldenPathId = pickGoldenPath();

    const skinVariant = extra.skinVariant || 'normal';
    const isMilestone = skinVariant === 'milestone' || skinVariant === 'epic';
    // setGoldenPath() BEFORE setLevelData() deliberately - setLevelData() does its own
    // synchronous full-shape redraw internally, and that redraw must already see the
    // NEW level's goldenPathId (or null), not the previous level's stale id (which
    // could otherwise false-match a same-named path id, e.g. "p3", in the new level
    // and paint a stray glow that never gets cleaned up on levels where golden is off).
    Scene3D.setGoldenPath(state.goldenPathId);
    Scene3D.setLevelData(data.shape, data.unitGrid, state.paths, extra.sceneTier || data.tier, isMilestone, skinVariant, comboEnabledForLevel());
    Sound.setLevelContext(mode, isMilestone);
    UI.hideAllModals();
    UI.updateHUD(buildHudPayload());

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animateLogic();
    fireEvent('level-loaded', state.levelNum);
    // Golden Path's glow is visible from the moment the level loads (unlike the combo
    // badge, which only appears once a combo starts) - see the plan for why the
    // tutorial coach-mark timing differs between the two mechanics.
    if (state.goldenPathId) fireEvent('golden-available', state.goldenPathId);
  }

  function loadLevel(n) {
    const data = getLevel(n);
    if (!data) return false;
    applyLevelState('campaign', data, { levelNum: n, skinVariant: skinVariantForLevel(n) });
    return true;
  }

  function loadDailyLevel() {
    const dateStr = localDateStr();
    const data = getDailyLevel(dateStr);
    if (!data) return false;
    applyLevelState('daily', data, { levelNum: 'daily-' + dateStr, sceneTier: 'DAILY', skinVariant: 'daily' });
    return true;
  }

  function loadRemixLevel(remixIndex) {
    const data = Remix.getRemixLevel(remixIndex);
    if (!data) return false;
    applyLevelState('remix', data, { levelNum: 'remix-' + remixIndex, remixIndex, sceneTier: 'REMIX', skinVariant: 'remix' });
    return true;
  }

  function buildHudPayload() {
    let levelLabel = state.levelNum;
    if (state.mode === 'daily') levelLabel = 'DAILY';
    else if (state.mode === 'remix') levelLabel = 'R' + (state.remixIndex + 1);
    return {
      level: levelLabel,
      mode: state.mode,
      tier: state.levelData.tier,
      isMilestone: isMilestoneLevel(state.levelNum),
      difficulty: state.levelData.difficulty,
      remaining: state.paths.length - state.clearedCount,
      hints: Storage.getHintsTotal(),
      hintsDisabled: !!state.hintsDisabled,
      lives: state.lives,
      livesMax: state.livesMax,
      remixLap: state.levelData.remixLap,
      canUndo: state.canUndo,
      combo: state.combo || 0,
      // Which color the streak is currently riding on. The badge only ever said
      // "x2" before, so on a 6-colour Daily board the player had to remember
      // which path colour they last cleared to keep chaining (asked for directly
      // after test t55, 2026-09-04).
      comboColor: state.lastClearedColor || null
    };
  }

  // Segments identify their face by (cube position, direction) rather than a
  // single 0-5 index, since a level's surface is now an arbitrary polycube
  // (see [[arrowflow_level_roadmap]] v7) with a variable, per-level face
  // count - Polycube.faceKey gives both a stable string key for comparisons
  // and matches exactly what scene.js uses for the same faces.
  function segFaceKey(s) { return Polycube.faceKey(s.cube, s.dir); }

  function getPathCell(faceKey, r, c) {
    // Check if any active path occupies this cell. A path that's already committed to
    // exiting (status 'moving') is treated as fully passable immediately, not just the
    // portion it's visually slid past yet - once a tap has confirmed it can leave, it
    // shouldn't keep blocking other paths' exit checks while its slide animation plays
    // out. Bumped/returning paths haven't committed to leaving (they're stuck), so they
    // still block normally.
    for (let p of state.paths) {
      if (p.cleared || p.status === 'moving') continue;
      if (p.segments.some(s => segFaceKey(s) === faceKey && s.r === r && s.c === c)) {
        return p;
      }
    }
    return null;
  }

  // Walks a path's exit direction from its head until it either reaches the
  // face's own edge (free) or hits another path (blocked). Shared by tap-
  // handling and hint-scanning so both agree on what counts as "can exit
  // right now". Every exposed face in the polycube system is a uniform
  // unitGrid x unitGrid square, so the bound check is the same constant
  // regardless of which face the head is on.
  function findBlocker(path) {
    const head = path.segments.find(s => s.isHead);
    const headKey = segFaceKey(head);
    let checkR = head.r;
    let checkC = head.c;
    let blockedBy = null;
    let blockDist = 0;

    const unitGrid = state.levelData.unitGrid;
    while (true) {
      if (path.exitDir === 'up') checkR--;
      else if (path.exitDir === 'down') checkR++;
      else if (path.exitDir === 'left') checkC--;
      else if (path.exitDir === 'right') checkC++;

      blockDist++;
      if (checkR < 0 || checkR >= unitGrid || checkC < 0 || checkC >= unitGrid) {
        // Reached this face's own edge - only actually free if that edge is a
        // real exterior boundary of the shape, not a seam into another cube's
        // face (see Polycube.isOpenEdge()). The generator already guarantees
        // every path's exitDir is open, so this should never trip on
        // generated data - it's a defensive backstop, not the primary fix.
        if (!Polycube.isOpenEdge(headKey, path.exitDir, state.graph)) {
          blockedBy = { id: null, wall: true };
        }
        break;
      }

      // Self-collision now counts too (changed 2026-08-17, was previously
      // excluded via `obstacle.id !== path.id`) - matches
      // tools/generate_level.py's gen_path(), which now rejects any path
      // whose own exit ray would run through its own earlier body at
      // generation time (verified: 0/300 levels have one). Kept as a real
      // check rather than a no-op for defense-in-depth: if it ever
      // triggers, that's a real dead-end bug in the level data worth
      // surfacing, not something to silently allow through.
      const obstacle = getPathCell(headKey, checkR, checkC);
      if (obstacle) {
        blockedBy = obstacle;
        break;
      }
    }

    return { blockedBy, blockDist };
  }

  // How close a missed tap is allowed to "snap" to a nearby path's cell, in
  // cell-units - see the fallback below. 0.75 reaches just past a cell's own
  // border into an empty neighboring cell, but can never reach a second ring
  // of cells (that would need >=1.5), so it only rescues genuine near-misses.
  const TAP_FALLBACK_MAX_DIST = 0.75;

  function onArrowTap(facePos, faceDir, u, v) {
    if (state.failed || state.won) return;
    const unitGrid = state.levelData.unitGrid;
    const colF = u * unitGrid;
    const rowF = (1 - v) * unitGrid;
    const col = Math.floor(colF);
    const row = Math.floor(rowF);
    const faceKey = Polycube.faceKey(facePos, faceDir);
    const idlePaths = state.paths.filter(p => !p.cleared && p.status === 'idle');

    // Any cell along the path is tappable, not just the head - matches the reference app's feel.
    let path = idlePaths.find(p => p.segments.some(s => segFaceKey(s) === faceKey && s.r === row && s.c === col));

    // Fat-finger fallback (reported directly: tapping a path felt hard to land):
    // the tap missed every cell outright (landed on an empty gap/border cell).
    // Rather than blindly widening the hit area - which would risk grabbing
    // whichever DIFFERENT path happens to sit in a neighboring cell even when
    // the finger was clearly aimed elsewhere - measure the actual distance
    // from the tap point to every idle path segment's cell center on this
    // face and take the nearest one, only if it's within TAP_FALLBACK_MAX_DIST.
    // This resolves two paths running in adjacent cells by real proximity to
    // the tap, not by whichever happens to be found first.
    if (!path) {
      let best = null, bestDist = Infinity;
      idlePaths.forEach(p => {
        p.segments.forEach(s => {
          if (segFaceKey(s) !== faceKey) return;
          const dist = Math.hypot((s.r + 0.5) - rowF, (s.c + 0.5) - colF);
          if (dist < bestDist) { bestDist = dist; best = p; }
        });
      });
      if (best && bestDist <= TAP_FALLBACK_MAX_DIST) path = best;
    }

    if (path) {
      handlePathTap(path);
    }
  }

  function handlePathTap(path) {
    // Lock-Key: checked BEFORE the normal findBlocker() ray-cast, since a locked
    // path's own geometry may already be perfectly clear (locking is a separate,
    // explicitly telegraphed rule layered on top, not a geometric block) - see the
    // plan's design decision: unlike a hidden geometric bump, this is NOT a wrong
    // guess (the padlock icon already told the player), so it costs no heart and
    // never turns the path red/wasBlocked. `path.locked` is cleared the instant its
    // key path finishes clearing (see animateLogic()'s 'done' branch below), so a
    // stale locked flag can never survive past that point.
    if (path.locked) {
      path.status = 'locked_shake';
      path.progress = 0;
      Sound.playLockedDeny();
      Haptics.bump();
      UI.updateHUD(buildHudPayload());
      const keyPath = state.paths.find(p => p.id === path.keyPathId);
      if (keyPath) Scene3D.highlightPath(keyPath.id);
      fireEvent('locked-tap', path);
      return;
    }

    const { blockedBy, blockDist } = findBlocker(path);

    if (blockedBy) {
      path.status = 'bumped';
      path.progress = 0;
      path.maxBump = blockDist - 0.5; // distance it can move before visual collision
      // Stays red even after the bump/return animation finishes, until this path
      // actually moves - a persistent "you tried this one, it was stuck" marker
      // (paths no longer carry a per-path identity color to read at a glance).
      path.wasBlocked = true;

      state.lives = Math.max(0, state.lives - 1);
      if (state.lives <= 0) state.failed = true;
      // A wrong guess breaks the combo streak - see Color-Match Combo note on `state`.
      if (comboEnabledForLevel()) { state.combo = 0; state.lastClearedColor = null; }
      Sound.playBump();
      Haptics.bump();
      UI.updateHUD(buildHudPayload());
      fireEvent('tap-blocked', path);
      return;
    }

    // Success! Start moving
    path.status = 'moving';
    path.progress = 0;
    path.wasBlocked = false;
    state.moves++;
    state.lastMovePathId = path.id;
    state.canUndo = false; // becomes undoable once the slide finishes, see animateLogic

    // Color-Match Combo: consecutive clears of the SAME path.color extend the streak,
    // any other color restarts it at 1 (this tap still "counts" as the new streak's
    // first link, it just doesn't chain off the previous color).
    let comboJustStarted = false;
    if (comboEnabledForLevel()) {
      state.combo = (path.color && path.color === state.lastClearedColor) ? state.combo + 1 : 1;
      state.lastClearedColor = path.color || null;
      if (state.combo > state.comboBest) state.comboBest = state.combo;
      comboJustStarted = state.combo === 2;
      // Feedback for every chained clear (2026-09-02, reported directly: combo had
      // no sound/vibration at all, only the silent HUD badge) - not on combo===1
      // (that's just a normal clear that happens to start a new streak, nothing to
      // celebrate yet).
      if (state.combo > 1) {
        Sound.playCombo(state.combo);
        Haptics.combo();
      }
    }

    // Golden Path Bonus: claiming happens at most once per level (goldenClaimed
    // guards re-triggering on a later tap of the same path after an undo->retap), and
    // only within the first goldenTapWindow taps - state.moves was just incremented
    // above, so this check is inclusive of exactly that many taps (moves<=3 means
    // taps 1, 2, 3).
    let goldenJustClaimed = false;
    if (state.goldenPathId && path.id === state.goldenPathId && !state.goldenClaimed && state.moves <= state.goldenTapWindow) {
      state.goldenClaimed = true;
      state.goldenBonusAwarded = GOLDEN_BONUS;
      goldenJustClaimed = true;
    }

    // A 'moving' path is drawn as instantly gone (see scene.js's updateFrame) rather
    // than progressively slid off - redraw its faces right now so the line vanishes
    // on this exact frame, in sync with the exit-shot flourish that's about to fire.
    // Previously the in-shape slide animated over up to ~(L+3)/0.32 frames while the
    // flourish finished in ~410ms regardless of length - on a long path the two fell
    // out of sync and read as two disconnected lines (reported directly with a
    // screenshot: a short stray line floating apart from the arrow already at the
    // screen edge).
    Scene3D.updateFrame(state.paths, new Set(path.segments.map(segFaceKey)));

    Scene3D.shootExitArrow(path);
    Sound.playSlide();
    UI.updateHUD(buildHudPayload());
    // Fired only after UI.updateHUD() above, so the combo badge is already visible
    // in the DOM by the time tutorial.js tries to spotlight it - see
    // comboJustStarted's own comment.
    if (comboJustStarted) fireEvent('combo-first', path);
    if (goldenJustClaimed) UI.showGoldenBonusToast(GOLDEN_BONUS);
    fireEvent('tap-success', path);
  }

  // Shared by useHint() and the tutorial's getFirstOpenPathId() - both need
  // "the first path that can exit right now", but only useHint() should
  // spend a hint/touch Storage.
  function findOpenPath() {
    return state.paths.find(p => !p.cleared && p.status === 'idle' && !p.locked && !findBlocker(p).blockedBy);
  }

  function useHint() {
    if (state.failed || state.won) return;
    if (state.hintsDisabled) return;
    if (Storage.getHintsTotal() <= 0) return;

    const target = findOpenPath();
    if (!target) return;

    Storage.spendHint();
    state.hintsUsed++;
    Scene3D.highlightPath(target.id);
    UI.updateHUD(buildHudPayload());
  }

  // Read-only lookup for the tutorial's tap step - points the player at a path
  // that's actually exitable right now (never a blocked one), without spending
  // a hint or touching Storage. Returns null if the level somehow starts with
  // no open path at all (shouldn't happen - the generator guarantees at least
  // one - but the tutorial handles null by just not highlighting anything).
  function getFirstOpenPathId() {
    const target = findOpenPath();
    return target ? target.id : null;
  }

  function undo() {
    if (state.failed || state.won || !state.canUndo || !state.lastMovePathId) return;

    const path = state.paths.find(p => p.id === state.lastMovePathId);
    if (!path || path.status !== 'done') return;

    path.cleared = false;
    path.status = 'idle';
    path.progress = 0;
    state.clearedCount--;
    state.moves--;
    state.canUndo = false;
    state.lastMovePathId = null;

    // Golden Path Bonus rollback: undoing the exact tap that claimed it must reverse
    // the claim too, or re-tapping it again afterward would silently double-award
    // (goldenClaimed's guard would otherwise think it was already claimed forever).
    if (path.id === state.goldenPathId && state.goldenClaimed) {
      state.goldenClaimed = false;
      state.goldenBonusAwarded = 0;
    }

    // Lock-Key rollback: if this path being cleared is what unlocked some other
    // path(s), undoing it must re-lock those too - otherwise a player could tap the
    // key, let it unlock a dependent, undo the key tap, and keep the dependent
    // permanently unlocked despite its key no longer actually being cleared. Skips
    // any dependent that's ALREADY been tapped itself (cleared or mid-slide) - that
    // one would need its own separate undo, not something this single undo can
    // retroactively fix.
    const toRelock = state.paths.filter(op => op.keyPathId === path.id && !op.cleared && op.status !== 'moving');
    toRelock.forEach(op => { op.locked = true; });

    Scene3D.updateFrame(state.paths, true);
    UI.updateHUD(buildHudPayload());
  }

  function restart() {
    if (state.mode === 'daily') loadDailyLevel();
    else if (state.mode === 'remix') loadRemixLevel(state.remixIndex);
    else loadLevel(state.levelNum);
  }

  // Fail-screen "watch ad to continue" placeholder (see Storage.useRewardedAd) - refills
  // lives and clears the fail flag WITHOUT reloading the level, so already-cleared paths,
  // move count, and hints-used all stay intact (unlike restart()).
  function continueAfterFail() {
    if (!state.failed) return;
    state.lives = 1;
    state.failed = false;
    UI.updateHUD(buildHudPayload());
  }

  function animateLogic() {
    let needsUpdate = false;
    const dirtyFaces = new Set();

    state.paths.forEach(p => {
      if (p.status === 'locked_shake') {
        // Short-lived, unlike bumped/bumped_return - just enough ticks for scene.js
        // to draw a brief denial flash on the padlock icon, then back to idle. Never
        // touches lives/wasBlocked (see handlePathTap()'s locked branch).
        p.progress += 1;
        needsUpdate = true;
        p.segments.forEach(s => dirtyFaces.add(segFaceKey(s)));
        if (p.progress > 10) {
          p.progress = 0;
          p.status = 'idle';
        }
        return;
      }
      if (p.status === 'bumped' || p.status === 'bumped_return') {
        // Capture before this tick's status flip, so the final frame where a
        // path finishes (bumped_return -> idle) still redraws. Only the faces
        // actually inside the currently-drawn [startD,endD] window (matches
        // scene.js's own strokePath range) need to redraw - marking the
        // path's entire face list here was forcing every face a long path ever
        // touches to re-upload its texture for the whole animation, even faces
        // the slide-out already scrolled past. That's the main GPU cost on denser,
        // multi-face-crossing levels. ('moving' paths are excluded here - see
        // handlePathTap(), which redraws their faces once, immediately, instead
        // of every frame, since a moving path is drawn as instantly gone now.)
        const L = p.segments.length - 1;
        const off = p.progress || 0;
        const lo = Math.max(0, Math.floor(off));
        const hi = Math.min(L, Math.ceil(L + off));
        if (lo <= hi) {
          for (let idx = lo; idx <= hi; idx++) dirtyFaces.add(segFaceKey(p.segments[idx]));
        } else {
          dirtyFaces.add(segFaceKey(p.segments[L]));
        }
      }

      if (p.status === 'moving') {
        // Fixed short grace period instead of one proportional to path length -
        // the path is already drawn as instantly gone (see handlePathTap()), so
        // this now only times the undo/win bookkeeping below, roughly matching
        // the exit-shot flourish's own ~410ms duration (see EXIT_SHOT_DURATION_MS
        // in scene.js) rather than however long the old length-based slide took.
        // No needsUpdate here - the path was already redrawn as gone the instant
        // it started moving (handlePathTap()), so nothing visually changes per tick.
        p.progress += 1;
        if (p.progress > 24) {
          p.status = 'done';
          p.cleared = true;
          state.clearedCount++;
          if (p.id === state.lastMovePathId) state.canUndo = true;
          // Lock-Key: unlock every path whose key was THIS path, the instant it
          // finishes clearing - not lazily on their next tap attempt, so the
          // padlock icon disappears from the scene right away too.
          const unlocked = state.paths.filter(op => op.locked && op.keyPathId === p.id);
          if (unlocked.length) {
            unlocked.forEach(op => { op.locked = false; });
            Scene3D.updateFrame(state.paths, true);
          }
          UI.updateHUD(buildHudPayload());
          if (state.clearedCount >= state.paths.length) {
            // Re-check at fire time: an undo in the meantime could have
            // dropped clearedCount back below the total.
            setTimeout(() => { if (state.clearedCount >= state.paths.length) onWin(); }, 100);
          }
        }
      } else if (p.status === 'bumped') {
        p.progress += 0.3;
        needsUpdate = true;
        if (p.progress > p.maxBump) {
          p.progress = p.maxBump;
          p.status = 'bumped_return';
        }
      } else if (p.status === 'bumped_return') {
        p.progress -= 0.3;
        needsUpdate = true;
        if (p.progress <= 0) {
          p.progress = 0;
          p.status = 'idle';
          if (state.failed) onFail();
        }
      }
    });

    if (needsUpdate) {
      Scene3D.updateFrame(state.paths, dirtyFaces);
    }

    animationFrameId = requestAnimationFrame(animateLogic);
  }

  // Pause/resume (js/ui.js's modal-pause) - time spent paused must not count against
  // the player's score/best-time. pausedMs accumulates each closed pause span;
  // pauseStartedAt (if still set) covers an in-progress one, so totalPausedMs() is
  // correct even if called while still paused, not just after resume().
  function pause() {
    if (state.pauseStartedAt == null) state.pauseStartedAt = Date.now();
  }
  function resume() {
    if (state.pauseStartedAt != null) {
      state.pausedMs += Date.now() - state.pauseStartedAt;
      state.pauseStartedAt = null;
    }
  }
  function totalPausedMs() {
    return state.pausedMs + (state.pauseStartedAt != null ? Date.now() - state.pauseStartedAt : 0);
  }

  // Time-based scoring: no per-level data needed, "par" time scales with how many
  // paths the level has. Faster-than-par clears earn a bonus, hearts kept and stars
  // earned each add a flat bonus, so a full-hearts fast 3-star clear scores highest.
  function computeScore(elapsedSec) {
    const parTime = state.paths.length * 2.5;
    const timeBonus = Math.max(0, Math.round((parTime - elapsedSec) * 20));
    const heartsBonus = state.lives * 100;
    const starBonus = (state.stars || 0) * 200;
    // Color-Match Combo bonus: rewards the longest same-color streak reached this run,
    // not the final streak (so a big combo still pays off even if the player breaks it
    // right after, e.g. on the level's last, differently-colored path). comboBest=1 is
    // just a single clear with no chain, so only the streak LENGTH BEYOND 1 counts.
    const comboBonus = Math.max(0, (state.comboBest || 0) - 1) * 15;
    const goldenBonus = state.goldenBonusAwarded || 0;
    return 500 + timeBonus + heartsBonus + starBonus + comboBonus + goldenBonus;
  }

  function onWin() {
    state.won = true;
    state.canUndo = false;
    const elapsedSec = (Date.now() - state.startTime - totalPausedMs()) / 1000;

    // Star rating (2026-09-01 redesign): the old parMoves/maxMoves thresholds
    // compared against state.moves, but state.moves only counts SUCCESSFUL
    // clears (see the wrong-tap branch above, which increments lives lost
    // instead) - so moves always equalled exactly the level's path count on
    // any win, making moves <= parMoves trivially true every single time.
    // Reported directly: every level ever won gave 3 stars, no exceptions.
    // Replaced with two independent criteria, final stars = the WORSE of the
    // two (a clean run that took forever, or a fast run full of mistakes,
    // should both fall short of 3 stars):
    //  - accuracy: state.livesMax - state.lives = misses this run (against
    //    THIS run's own lives ceiling, not always 3 - REMIX's escalating
    //    livesMax means a flawless 1-life REMIX clear must read as 0 misses,
    //    not "3-1=2 misses" against a ceiling this run never had).
    //  - pace: elapsedSec (pause time excluded via totalPausedMs(), same as
    //    computeScore()'s time bonus below) against the same parTime basis
    //    already used for scoring, loosened 5x/9x since parTime's 2.5s/path
    //    assumes instant taps with no time to actually look at the cube.
    const missCount = state.livesMax - state.lives;
    let accuracyStars = 1;
    if (missCount <= 0) accuracyStars = 3;
    else if (missCount <= 1) accuracyStars = 2;

    const parTime = state.paths.length * 2.5;
    let paceStars = 1;
    // Multipliers are Remote-Config tunable (js/remoteconfig.js) so the pacing
    // can be loosened or tightened against real completion times without a
    // release; both default to the values this shipped with.
    if (elapsedSec <= parTime * RemoteConfig.get('star_pace_fast_multiplier')) paceStars = 3;
    else if (elapsedSec <= parTime * RemoteConfig.get('star_pace_ok_multiplier')) paceStars = 2;

    // Both forms are load-bearing and must stay in sync: state.stars is read by
    // computeScore() below (via its starBonus), while every reward/analytics/UI
    // call further down takes the local. The 2026-09-01 star redesign set only
    // state.stars and left those five call sites referencing a bare `stars` that
    // no longer existed anywhere - a ReferenceError thrown on EVERY win, in every
    // mode. Because onWin() is invoked from inside a setTimeout, the throw never
    // reached the animation loop: the paths all cleared normally and then simply
    // nothing happened, with no error visible in the game itself. Reported as
    // "level 1 finished but the level won't end".
    const stars = Math.min(accuracyStars, paceStars);
    state.stars = stars;

    const score = computeScore(elapsedSec);
    const isCampaignFinale = state.mode === 'campaign' && state.levelNum === 300;

    let newlyUnlockedSkin = null;
    let gemsEarned = 0;
    let gemsBonusType = null; // null | 'daily' | 'milestone', drives the win screen's bonus badge
    let hintsBonus = 0;
    if (state.mode === 'daily') {
      const prevStreak = Storage.get('dailyStreak') || 0;
      const rewarded = Storage.completeDaily();
      if (rewarded) {
        Storage.addHints(2); // bonus hints, only on first completion of the day
        gemsEarned = Storage.awardDailyGems(stars);
        if (gemsEarned > 0) gemsBonusType = 'daily';
        // First real engagement moment for reminder notifications - the player
        // just finished a Daily Challenge and now has a streak worth protecting,
        // so this is where it's worth asking for notification permission (true =
        // prompting allowed, unlike the silent app-start refresh in main.js).
        Notifications.refresh(true);
      }
      const newStreak = Storage.get('dailyStreak') || 0;
      newlyUnlockedSkin = Skins.ALL.find(s => s.unlock.type === 'streak' && s.unlock.value > prevStreak && s.unlock.value <= newStreak) || null;
      // Permanently record every streak-skin threshold reached so far (not just the one
      // picked for the win banner above) - grantStreakSkin is idempotent, and re-granting
      // already-owned ones every daily win is harmless. This is what keeps a skin unlocked
      // even after the streak itself later breaks - see storage.js's ownedStreakSkins.
      Skins.ALL.filter(s => s.unlock.type === 'streak' && s.unlock.value <= newStreak)
        .forEach(s => Storage.grantStreakSkin(s.id));
    } else if (state.mode === 'remix') {
      Storage.completeRemix(state.remixIndex, stars, score);
    } else {
      const prevUnlocked = Storage.get('highestUnlocked') || 1;
      const result = Storage.completeLevel(state.levelNum, stars, state.moves, score, elapsedSec);
      gemsEarned = result.gemsEarned;
      if (result.isMilestoneGems) gemsBonusType = 'milestone';
      hintsBonus = result.hintsBonus;
      const newUnlocked = Storage.get('highestUnlocked') || 1;
      newlyUnlockedSkin = Skins.ALL.find(s => s.unlock.type === 'level' && s.unlock.value > prevUnlocked && s.unlock.value <= newUnlocked) || null;
    }
    Storage.noteLevelCompletedForInterstitial();
    UI.updateHUD(buildHudPayload());
    Sound.playWin();
    Haptics.win();
    Analytics.logEvent('level_complete', {
      mode: state.mode, level: state.levelNum, stars, score,
      hints_used: state.hintsUsed, time_sec: Math.round(elapsedSec)
    });
    if (isCampaignFinale) Analytics.logEvent('campaign_complete', {});
    UI.showWin(state.levelNum, state.hintsUsed, stars, score, elapsedSec, state.mode, isCampaignFinale, newlyUnlockedSkin, gemsEarned, gemsBonusType, hintsBonus, state.comboBest || 0, state.goldenBonusAwarded || 0);
    // In-app rating prompt (js/rating.js) - levels-completed trigger. Only from a
    // real campaign win (not daily/remix, which don't count toward it either -
    // see storage.js's shouldPromptRating()). Delayed so it never fights the win
    // screen's own entrance animation/confetti for attention.
    if (state.mode === 'campaign') setTimeout(() => Rating.maybePrompt(), 1500);
  }

  function onFail() {
    Sound.playFail();
    Analytics.logEvent('level_fail', { mode: state.mode, level: state.levelNum });
    UI.showFail();
  }

  // Re-strokes every face with the current theme's colors without touching game state -
  // unlike loadLevel(), this is safe to call mid-level (won't reset progress/hearts/moves).
  function redrawTheme() {
    Scene3D.updateFrame(state.paths, true);
    Scene3D.refreshMoodForTheme();
  }

  return {
    loadLevel, loadDailyLevel, loadRemixLevel, onArrowTap, useHint, undo, restart, continueAfterFail, redrawTheme, setOnEvent, pause, resume,
    getLevelNum: () => state.levelNum,
    getMode: () => state.mode,
    getRemixIndex: () => state.remixIndex,
    getHudPayload: () => state.levelData ? buildHudPayload() : null,
    getFirstOpenPathId,
    isComboEnabled: comboEnabledForLevel,
    isHintAllowed: () => !state.hintsDisabled,
    // Read-only debug/test getters (no side effects, same spirit as getFirstOpenPathId
    // above) - not used by any real gameplay UI, only automated smoke tests.
    getGoldenPathId: () => state.goldenPathId,
    getGoldenClaimed: () => state.goldenClaimed,
    getLockedPaths: () => state.paths.filter(p => p.locked).map(p => ({ id: p.id, keyPathId: p.keyPathId }))
  };
})();