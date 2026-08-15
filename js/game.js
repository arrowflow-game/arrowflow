/* ============================================
   ArrowFlow 3D — game.js
   ============================================ */

const Game = (() => {
  const LIVES_MAX = 3;

  let state = {
    levelNum: 1,
    levelData: null,
    paths: [],
    moves: 0,
    hintsUsed: 0,
    clearedCount: 0,
    lives: LIVES_MAX,
    failed: false,
    won: false,
    lastMovePathId: null,
    canUndo: false
  };

  let animationFrameId = null;

  function loadLevel(n) {
    const data = getLevel(n);
    if (!data) return false;

    state = {
      levelNum: n,
      levelData: data,
      paths: data.paths, // deeply cloned in getLevel()
      moves: 0,
      hintsUsed: 0,
      clearedCount: 0,
      lives: LIVES_MAX,
      failed: false,
      won: false,
      lastMovePathId: null,
      canUndo: false
    };

    Scene3D.setLevelData(data.grid, state.paths);
    UI.hideAllModals();
    UI.updateHUD(buildHudPayload());

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animateLogic();
    return true;
  }

  function buildHudPayload() {
    return {
      level: state.levelNum,
      tier: state.levelData.tier,
      difficulty: state.levelData.difficulty,
      remaining: state.paths.length - state.clearedCount,
      hints: Storage.get('hints'),
      lives: state.lives,
      livesMax: LIVES_MAX,
      canUndo: state.canUndo
    };
  }

  function getPathCell(face, r, c) {
    // Check if any active path occupies this cell
    for (let p of state.paths) {
      if (p.cleared) continue;
      // We don't count paths that have moved past this cell.
      // For simplicity, we just check the base segments. If a path is moving, it might still block.
      if (p.segments.some(s => s.face === face && s.r === r && s.c === c)) {
        return p;
      }
    }
    return null;
  }

  // Walks a path's exit direction from its head until it either reaches the
  // cube edge (free) or hits another path (blocked). Shared by tap-handling
  // and hint-scanning so both agree on what counts as "can exit right now".
  function findBlocker(path) {
    const head = path.segments.find(s => s.isHead);
    let checkR = head.r;
    let checkC = head.c;
    let blockedBy = null;
    let blockDist = 0;

    while (true) {
      if (path.exitDir === 'up') checkR--;
      else if (path.exitDir === 'down') checkR++;
      else if (path.exitDir === 'left') checkC--;
      else if (path.exitDir === 'right') checkC++;

      blockDist++;
      if (checkR < 0 || checkR >= state.levelData.grid || checkC < 0 || checkC >= state.levelData.grid) {
        break; // Reached edge, free!
      }

      const obstacle = getPathCell(head.face, checkR, checkC);
      if (obstacle && obstacle.id !== path.id) {
        blockedBy = obstacle;
        break;
      }
    }

    return { blockedBy, blockDist };
  }

  function onArrowTap(faceIndex, u, v) {
    if (state.failed || state.won) return;
    const gridSize = state.levelData.grid;
    const col = Math.floor(u * gridSize);
    const row = Math.floor((1 - v) * gridSize);

    const path = state.paths.find(p => !p.cleared && p.status === 'idle' && p.segments.some(s => s.face === faceIndex && s.isHead && s.r === row && s.c === col));

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

      state.lives = Math.max(0, state.lives - 1);
      if (state.lives <= 0) state.failed = true;
      UI.updateHUD(buildHudPayload());
      return;
    }

    // Success! Start moving
    path.status = 'moving';
    path.progress = 0;
    state.moves++;
    state.lastMovePathId = path.id;
    state.canUndo = false; // becomes undoable once the slide finishes, see animateLogic

    UI.updateHUD(buildHudPayload());
  }

  function useHint() {
    if (state.failed || state.won) return;
    if (Storage.get('hints') <= 0) return;

    const target = state.paths.find(p => !p.cleared && p.status === 'idle' && !findBlocker(p).blockedBy);
    if (!target) return;

    Storage.addHints(-1);
    state.hintsUsed++;
    Scene3D.highlightPath(target.id);
    UI.updateHUD(buildHudPayload());
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

    Scene3D.updateFrame(state.paths);
    UI.updateHUD(buildHudPayload());
  }

  function restart() {
    loadLevel(state.levelNum);
  }

  function animateLogic() {
    let needsUpdate = false;

    state.paths.forEach(p => {
      if (p.status === 'moving') {
        p.progress += 0.2; // speed
        needsUpdate = true;
        // Total length of path = p.segments.length - 1
        // It needs to slide completely off, so progress needs to reach length + a few extra cells
        if (p.progress > p.segments.length + 3) {
          p.status = 'done';
          p.cleared = true;
          state.clearedCount++;
          if (p.id === state.lastMovePathId) state.canUndo = true;
          UI.updateHUD(buildHudPayload());
          if (state.clearedCount >= state.paths.length) {
            // Re-check at fire time: an undo in the meantime could have
            // dropped clearedCount back below the total.
            setTimeout(() => { if (state.clearedCount >= state.paths.length) onWin(); }, 500);
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
      Scene3D.updateFrame(state.paths);
    }

    animationFrameId = requestAnimationFrame(animateLogic);
  }

  function onWin() {
    state.won = true;
    state.canUndo = false;
    let stars = 1;
    if (state.moves <= state.levelData.parMoves) stars = 3;
    else if (state.moves <= state.levelData.maxMoves) stars = 2;

    Storage.completeLevel(state.levelNum, stars, state.moves);
    UI.updateHUD(buildHudPayload());
    UI.showWin(state.moves, state.hintsUsed, stars);
  }

  function onFail() {
    UI.showFail();
  }

  return { loadLevel, onArrowTap, useHint, undo, restart, getLevelNum: () => state.levelNum };
})();