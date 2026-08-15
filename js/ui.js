/* ============================================
   ArrowFlow 3D — ui.js
   ============================================ */

const UI = (() => {
  const DIFFICULTY_LABELS = { easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก' };
  const TOTAL_LEVELS = 300; // matches manifest.json's "300 levels" and the menu progress bar

  function applySound(enabled) {
    Storage.set('sound', enabled);
    const icon = document.getElementById('sound-icon');
    if (icon) icon.textContent = enabled ? '🔊' : '🔇';
  }

  function showScreen(id) {
    document.querySelectorAll('.ovr-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    Storage.set('theme', theme);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function updateMenu() {
    const cl = Storage.get('currentLevel');
    const ts = Storage.get('totalStars');
    document.getElementById('menu-cur-lvl').textContent = cl;
    document.getElementById('menu-total-stars').textContent = '★ ' + ts;
    document.getElementById('menu-prog').style.width = ((cl / 300) * 100) + '%';
  }

  function updateHUD(payload) {
    const { level, tier, difficulty, remaining, hints, lives, livesMax, canUndo } = payload;

    document.getElementById('hud-lvl-num').textContent = level;
    document.getElementById('hud-tier').textContent = tier;
    document.getElementById('hud-hints').textContent = hints;

    const arrowsEl = document.getElementById('hud-arrows-remaining');
    if (arrowsEl) arrowsEl.textContent = remaining;

    const diffEl = document.getElementById('hud-difficulty');
    if (diffEl) diffEl.textContent = DIFFICULTY_LABELS[difficulty] || difficulty || '';

    const livesRow = document.getElementById('hud-lives-row');
    if (livesRow) {
      const hearts = livesRow.querySelectorAll('.heart-icon');
      hearts.forEach((el, idx) => {
        el.classList.toggle('lost', idx >= lives);
      });
    }

    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = !canUndo;
  }

  function showWin(hints, stars) {
    document.getElementById('modal-win').classList.remove('hidden');
    document.getElementById('ws-hints').textContent = hints;
    const starEls = document.querySelectorAll('#win-stars-row .wstar');
    starEls.forEach((el, idx) => {
      if (idx < stars) el.classList.add('earned');
      else el.classList.remove('earned');
    });
  }

  function showFail() {
    document.getElementById('modal-fail').classList.remove('hidden');
  }

  function hideAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
  }

  function wireEvents() {
    document.getElementById('btn-theme').addEventListener('click', () => {
      applyTheme(Storage.get('theme') === 'dark' ? 'light' : 'dark');
      // Force scene to redraw level with new theme colors
      Game.loadLevel(Game.levelNum || Storage.get('currentLevel'));
    });

    document.getElementById('btn-play').addEventListener('click', () => {
      Game.loadLevel(Storage.get('currentLevel'));
      showScreen('screen-game');
    });

    document.getElementById('btn-levels').addEventListener('click', () => {
      // Build the level grid. Render up to a buffer past the player's
      // unlocked level rather than the whole 300 so the DOM stays light
      // while still growing as the player progresses.
      const wrap = document.getElementById('levels-grid');
      wrap.innerHTML = '';
      const unlocked = Storage.get('highestUnlocked');
      const visibleCount = Math.min(TOTAL_LEVELS, unlocked + 20);
      for(let i=1; i<=visibleCount; i++) {
        const btn = document.createElement('button');
        btn.className = 'lvl-btn ' + (i > unlocked ? 'locked' : i === unlocked ? 'current' : 'completed');
        btn.textContent = i;
        if(i <= unlocked) {
          btn.addEventListener('click', () => {
            Game.loadLevel(i);
            showScreen('screen-game');
          });
        }
        wrap.appendChild(btn);
      }
      showScreen('screen-levels');
    });

    document.getElementById('btn-back-lvl').addEventListener('click', () => showScreen('screen-menu'));
    document.getElementById('btn-pause').addEventListener('click', () => {
      document.getElementById('pause-lvl').textContent = Storage.get('currentLevel');
      document.getElementById('modal-pause').classList.remove('hidden');
    });
    document.getElementById('btn-resume').addEventListener('click', () => document.getElementById('modal-pause').classList.add('hidden'));
    document.getElementById('btn-quit').addEventListener('click', () => {
      document.getElementById('modal-pause').classList.add('hidden');
      updateMenu();
      showScreen('screen-menu');
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      document.getElementById('modal-win').classList.add('hidden');
      const next = (Game.levelNum || Storage.get('currentLevel')) + 1;
      Game.loadLevel(next);
    });

    document.getElementById('btn-replay').addEventListener('click', () => {
      document.getElementById('modal-win').classList.add('hidden');
      Game.loadLevel(Game.levelNum || Storage.get('currentLevel'));
    });

    document.getElementById('btn-hint').addEventListener('click', () => Game.useHint());
    document.getElementById('btn-undo').addEventListener('click', () => Game.undo());

    document.getElementById('btn-sound').addEventListener('click', () => {
      applySound(!Storage.get('sound'));
    });

    document.getElementById('btn-fail-restart').addEventListener('click', () => {
      document.getElementById('modal-fail').classList.add('hidden');
      Game.restart();
    });

    document.getElementById('btn-fail-quit').addEventListener('click', () => {
      document.getElementById('modal-fail').classList.add('hidden');
      updateMenu();
      showScreen('screen-menu');
    });
  }

  function runSplash() {
    let p = 0;
    const bar = document.getElementById('splash-bar');
    const iv = setInterval(() => {
      p += 15;
      if (bar) bar.style.width = p + '%';
      if (p >= 100) {
        clearInterval(iv);
        setTimeout(() => {
          updateMenu();
          showScreen('screen-menu');
        }, 300);
      }
    }, 100);
  }

  return { showScreen, applyTheme, applySound, updateMenu, updateHUD, showWin, showFail, hideAllModals, wireEvents, runSplash };
})();