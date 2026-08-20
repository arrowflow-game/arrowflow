/* ============================================
   ArrowFlow 3D — game.js
   ============================================ */

const Game = (() => {
  const LIVES_MAX = 3;

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
    failed: false,
    won: false,
    lastMovePathId: null,
    canUndo: false,
    startTime: 0
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

  function localDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Shared setup used by loadLevel/loadDailyLevel/loadRemixLevel - only the
  // mode tag, the level-number bookkeeping field, and the source data differ.
  function applyLevelState(mode, data, extra) {
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
      lives: LIVES_MAX,
      failed: false,
      won: false,
      lastMovePathId: null,
      canUndo: false,
      startTime: Date.now()
    };

    Scene3D.setLevelData(data.shape, data.unitGrid, state.paths, extra.sceneTier || data.tier, extra.isMilestone || false);
    UI.hideAllModals();
    UI.updateHUD(buildHudPayload());

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animateLogic();
    fireEvent('level-loaded', state.levelNum);
  }

  function loadLevel(n) {
    const data = getLevel(n);
    if (!data) return false;
    applyLevelState('campaign', data, { levelNum: n, isMilestone: isMilestoneLevel(n) });
    return true;
  }

  function loadDailyLevel() {
    const dateStr = localDateStr();
    const data = getDailyLevel(dateStr);
    if (!data) return false;
    applyLevelState('daily', data, { levelNum: 'daily-' + dateStr, sceneTier: 'DAILY' });
    return true;
  }

  function loadRemixLevel(remixIndex) {
    const data = Remix.getRemixLevel(remixIndex);
    if (!data) return false;
    applyLevelState('remix', data, { levelNum: 'remix-' + remixIndex, remixIndex, sceneTier: 'REMIX' });
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
      hints: Storage.get('hints'),
      lives: state.lives,
      livesMax: LIVES_MAX,
      canUndo: state.canUndo
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

  function onArrowTap(facePos, faceDir, u, v) {
    if (state.failed || state.won) return;
    const unitGrid = state.levelData.unitGrid;
    const col = Math.floor(u * unitGrid);
    const row = Math.floor((1 - v) * unitGrid);
    const faceKey = Polycube.faceKey(facePos, faceDir);

    // Any cell along the path is tappable, not just the head - matches the reference app's feel.
    const path = state.paths.find(p => !p.cleared && p.status === 'idle' && p.segments.some(s => segFaceKey(s) === faceKey && s.r === row && s.c === col));

    if (path) {
      handlePathTap(path);
    }
  }

  function handlePathTap(path) {
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
    fireEvent('tap-success', path);
  }

  // Shared by useHint() and the tutorial's getFirstOpenPathId() - both need
  // "the first path that can exit right now", but only useHint() should
  // spend a hint/touch Storage.
  function findOpenPath() {
    return state.paths.find(p => !p.cleared && p.status === 'idle' && !findBlocker(p).blockedBy);
  }

  function useHint() {
    if (state.failed || state.won) return;
    if (Storage.get('hints') <= 0) return;

    const target = findOpenPath();
    if (!target) return;

    Storage.addHints(-1);
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
    state.lives = LIVES_MAX;
    state.failed = false;
    UI.updateHUD(buildHudPayload());
  }

  function animateLogic() {
    let needsUpdate = false;
    const dirtyFaces = new Set();

    state.paths.forEach(p => {
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

  // Time-based scoring: no per-level data needed, "par" time scales with how many
  // paths the level has. Faster-than-par clears earn a bonus, hearts kept and stars
  // earned each add a flat bonus, so a full-hearts fast 3-star clear scores highest.
  function computeScore(elapsedSec) {
    const parTime = state.paths.length * 2.5;
    const timeBonus = Math.max(0, Math.round((parTime - elapsedSec) * 20));
    const heartsBonus = state.lives * 100;
    const starBonus = (state.stars || 0) * 200;
    return 500 + timeBonus + heartsBonus + starBonus;
  }

  function onWin() {
    state.won = true;
    state.canUndo = false;
    let stars = 1;
    if (state.moves <= state.levelData.parMoves) stars = 3;
    else if (state.moves <= state.levelData.maxMoves) stars = 2;
    state.stars = stars;

    const elapsedSec = (Date.now() - state.startTime) / 1000;
    const score = computeScore(elapsedSec);
    const isCampaignFinale = state.mode === 'campaign' && state.levelNum === 300;

    if (state.mode === 'daily') {
      const rewarded = Storage.completeDaily();
      if (rewarded) Storage.addHints(2); // bonus hints, only on first completion of the day
    } else if (state.mode === 'remix') {
      Storage.completeRemix(state.remixIndex, stars, score);
    } else {
      Storage.completeLevel(state.levelNum, stars, state.moves, score, elapsedSec);
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
    UI.showWin(state.levelNum, state.hintsUsed, stars, score, elapsedSec, state.mode, isCampaignFinale);
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
    loadLevel, loadDailyLevel, loadRemixLevel, onArrowTap, useHint, undo, restart, continueAfterFail, redrawTheme, setOnEvent,
    getLevelNum: () => state.levelNum,
    getMode: () => state.mode,
    getRemixIndex: () => state.remixIndex,
    getHudPayload: () => state.levelData ? buildHudPayload() : null,
    getFirstOpenPathId
  };
})();