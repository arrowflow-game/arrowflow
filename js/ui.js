/* ============================================
   ArrowFlow 3D — ui.js
   ============================================ */

const UI = (() => {
  const DIFFICULTY_LABELS = { easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก' };
  const TOTAL_LEVELS = 300; // matches manifest.json's "300 levels" and the menu progress bar

  function applySound(enabled) {
    Storage.set('sound', enabled);
  }

  function applyMusic(enabled) {
    Storage.set('music', enabled);
    // Live-toggle rather than waiting for the next screen change, so muting
    // mid-level takes effect immediately.
    if (enabled) {
      if (document.getElementById('screen-game').classList.contains('active')) Sound.startMusic();
    } else {
      Sound.stopMusic();
    }
  }

  function applyVibration(enabled) {
    Storage.set('vibration', enabled);
  }

  function setSwitch(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on);
  }

  function syncSettingsUI() {
    setSwitch('toggle-music', Storage.get('music') !== false);
    setSwitch('toggle-sfx', Storage.get('sound') !== false);
    setSwitch('toggle-vibration', Storage.get('vibration') !== false);
    const nickBtn = document.getElementById('btn-edit-nickname');
    if (nickBtn) nickBtn.textContent = Leaderboard.getNickname() || 'ตั้งชื่อ';
  }

  function showScreen(id) {
    document.querySelectorAll('.ovr-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    // Background music only plays while actually in a level.
    if (id === 'screen-game') Sound.startMusic();
    else Sound.stopMusic();
  }

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    Storage.set('theme', theme);
    const iconText = theme === 'dark' ? '☀️' : '🌙';
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = iconText;
    const iconHud = document.getElementById('theme-icon-hud');
    if (iconHud) iconHud.textContent = iconText;
  }

  function updateMenu() {
    // currentLevel becomes levelNum+1 on completeLevel() even for the last
    // level (see storage.js), so it can read 301 once the whole campaign is
    // done - clamp for display so the menu never shows "Level 301 / 300".
    const cl = Math.min(Storage.get('currentLevel'), TOTAL_LEVELS);
    const ts = Storage.get('totalStars');
    document.getElementById('menu-cur-lvl').textContent = cl;
    document.getElementById('menu-total-stars').textContent = '★ ' + ts;
    document.getElementById('menu-prog').style.width = ((cl / TOTAL_LEVELS) * 100) + '%';
  }

  function buildStatsScreen() {
    const allData = Storage.getAllLevelData();
    const entries = Object.keys(allData)
      .map(n => ({ level: Number(n), ...allData[n] }))
      .sort((a, b) => a.level - b.level);

    document.getElementById('stats-total-score').textContent = Storage.get('totalScore') || 0;
    document.getElementById('stats-total-stars').textContent = Storage.get('totalStars') || 0;
    document.getElementById('stats-levels-completed').textContent = entries.length + ' / ' + TOTAL_LEVELS;

    const bestEntry = entries.reduce((best, e) => (!best || (e.score || 0) > (best.score || 0)) ? e : best, null);
    document.getElementById('stats-best-level').textContent = bestEntry ? ('ด่าน ' + bestEntry.level + ' (' + bestEntry.score + ' คะแนน)') : '—';

    const list = document.getElementById('stats-level-list');
    list.innerHTML = '';
    if (entries.length === 0) {
      list.innerHTML = '<div class="stats-empty">ยังไม่มีด่านที่ผ่าน</div>';
      return;
    }
    // Most recently reached (highest level) first, matches how a player wants to check progress.
    entries.slice().reverse().forEach(e => {
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML =
        '<span class="stats-row-lvl">ด่าน ' + e.level + '</span>' +
        '<span class="stats-row-stars">' + '★'.repeat(e.stars || 0) + '☆'.repeat(3 - (e.stars || 0)) + '</span>' +
        '<span class="stats-row-time">' + (e.time != null ? formatTime(e.time) : '—') + '</span>' +
        '<span class="stats-row-score">' + (e.score || 0) + '</span>';
      list.appendChild(row);
    });
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

  const CONFETTI_COLORS = ['#1a7fe8', '#4a9ff5', '#fbbf24', '#2ecc71', '#ff3b30'];

  function burstConfetti() {
    const area = document.getElementById('confetti-area');
    if (!area) return;
    area.innerHTML = ''; // clear any still-running burst from a rapid replay

    // Respect the user's OS-level motion preference rather than forcing this on everyone.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const w = area.clientWidth, h = area.clientHeight;
    if (!w || !h) return;

    const canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    area.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const COUNT = 90;
    const GRAVITY = 0.28;
    const DRAG = 0.988;
    const DURATION = 2200;

    const particles = Array.from({ length: COUNT }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 40,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 7 - 4,
      size: 5 + Math.random() * 5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.5 ? 'rect' : 'circle'
    }));

    const start = performance.now();
    function frame(now) {
      const t = now - start;
      // A burst that outlives its own modal (fast Replay tap) should stop drawing
      // into a canvas that's no longer attached, rather than run forever unseen.
      if (!area.contains(canvas)) return;
      ctx.clearRect(0, 0, w, h);
      const fade = Math.max(0, 1 - t / DURATION);
      particles.forEach(p => {
        p.vx *= DRAG;
        p.vy = p.vy * DRAG + GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      });
      if (t < DURATION) requestAnimationFrame(frame);
      else area.innerHTML = '';
    }
    requestAnimationFrame(frame);
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function showWin(levelNum, hints, stars, score, elapsedSec) {
    document.getElementById('modal-win').classList.remove('hidden');
    document.getElementById('ws-hints').textContent = hints;
    const scoreEl = document.getElementById('ws-score');
    if (scoreEl) scoreEl.textContent = score;
    const timeEl = document.getElementById('ws-time');
    if (timeEl) timeEl.textContent = formatTime(elapsedSec);
    const starEls = document.querySelectorAll('#win-stars-row .wstar');
    starEls.forEach((el, idx) => {
      if (idx < stars) el.classList.add('earned');
      else el.classList.remove('earned');
    });
    burstConfetti();

    // Personal best for THIS level - Storage.completeLevel() (called just
    // before showWin, see game.js's onWin) already merged this run's score
    // into the stored per-level best, so reading it back here naturally
    // shows whichever is higher: this run, or a past one.
    const personalBestEl = document.getElementById('ws-personal-best');
    if (personalBestEl) {
      const levelData = Storage.getLevelData(levelNum);
      personalBestEl.textContent = levelData ? levelData.score : score;
    }

    // World best for this level - best-effort, submitted then re-fetched so
    // a new personal record shows up immediately as the world best too
    // rather than waiting for a stale read.
    const worldBestEl = document.getElementById('ws-level-world-best');
    if (worldBestEl) {
      worldBestEl.textContent = '…';
      Leaderboard.submitLevelScore(levelNum, score)
        .then(() => Leaderboard.fetchLevelBest(levelNum))
        .then(best => {
          worldBestEl.textContent = best ? `${best.score} (${best.nickname})` : '—';
        });
    }

    // Submit + fetch rank are both best-effort network calls - never block the
    // win screen on them, just fill the badge in once (if) they resolve.
    const rankEl = document.getElementById('ws-rank');
    const badge = document.getElementById('win-rank-badge');
    if (rankEl && badge) {
      if (!Leaderboard.getNickname()) {
        badge.classList.add('hidden');
      } else {
        badge.classList.remove('hidden');
        rankEl.textContent = '…';
        const totalScore = Storage.get('totalScore') || 0;
        const highestLevel = Storage.get('highestUnlocked') || 1;
        Leaderboard.submitScore(totalScore, highestLevel).then(() => Leaderboard.fetchMyRank(totalScore)).then(rank => {
          rankEl.textContent = rank != null ? ('#' + rank) : '—';
        });
      }
    }
  }

  async function openLeaderboardModal() {
    document.getElementById('modal-leaderboard').classList.remove('hidden');
    const myRow = document.getElementById('lb-my-row');
    const list = document.getElementById('lb-list');
    myRow.textContent = 'กำลังโหลด…';
    list.innerHTML = '';

    const nickname = Leaderboard.getNickname();
    const myScore = Storage.get('totalScore') || 0;
    const [top, myRank] = await Promise.all([
      Leaderboard.fetchTop(10),
      nickname ? Leaderboard.fetchMyRank(myScore) : Promise.resolve(null)
    ]);

    const myProgress = progressLabel(Storage.get('highestUnlocked') || 1);
    myRow.textContent = nickname
      ? ('คุณ: ' + nickname + ' — อันดับ ' + (myRank != null ? '#' + myRank : '—') + ' (' + myScore + ' คะแนน, ' + myProgress + ')')
      : 'ตั้งชื่อผู้เล่นเพื่อเข้าร่วมอันดับ';

    if (top.length === 0) {
      list.innerHTML = '<div class="lb-empty">ยังไม่มีข้อมูลอันดับ (ตรวจสอบการเชื่อมต่อ)</div>';
      return;
    }
    top.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (nickname && p.nickname === nickname && p.totalScore === myScore ? ' lb-me' : '');
      row.innerHTML =
        '<span class="lb-rank">' + (idx + 1) + '</span>' +
        '<span class="lb-name">' + escapeHtml(p.nickname) + '</span>' +
        '<span class="lb-progress">' + progressLabel(p.highestLevel) + '</span>' +
        '<span class="lb-score">' + p.totalScore + '</span>';
      list.appendChild(row);
    });
  }

  // A player who has cleared/unlocked level 300 gets a "จบเกม!" (done) badge
  // instead of a bare "300/300" number - reads better as a finish line, and
  // matches the request that finishing the whole campaign stand out on the
  // leaderboard rather than looking like just another number.
  function progressLabel(highestLevel) {
    const lvl = Math.min(highestLevel || 1, TOTAL_LEVELS);
    return lvl >= TOTAL_LEVELS ? '🏁 จบเกม!' : ('ด่าน ' + lvl);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function promptNicknameIfNeeded() {
    if (Leaderboard.getNickname()) return;
    document.getElementById('modal-nickname').classList.remove('hidden');
  }

  function showFail() {
    document.getElementById('modal-fail').classList.remove('hidden');
  }

  function hideAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    const confettiArea = document.getElementById('confetti-area');
    if (confettiArea) confettiArea.innerHTML = ''; // stop any still-running burst
  }

  function wireEvents() {
    const toggleTheme = () => {
      applyTheme(Storage.get('theme') === 'dark' ? 'light' : 'dark');
      // Redraw the cube's face textures with the new theme's colors - safe to call even
      // mid-level, since it doesn't touch game state (progress/hearts/moves survive).
      Game.redrawTheme();
    };
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-hud-theme').addEventListener('click', toggleTheme);

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

    document.getElementById('btn-stats').addEventListener('click', () => {
      buildStatsScreen();
      showScreen('screen-stats');
    });
    document.getElementById('btn-back-stats').addEventListener('click', () => showScreen('screen-menu'));

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

    const openSettings = () => {
      syncSettingsUI();
      document.getElementById('modal-settings').classList.remove('hidden');
    };
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-pause-settings').addEventListener('click', openSettings);
    document.getElementById('btn-hud-settings').addEventListener('click', openSettings);
    document.getElementById('btn-settings-close').addEventListener('click', () => {
      document.getElementById('modal-settings').classList.add('hidden');
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      hideAllModals();
      Game.loadLevel(Game.getLevelNum() + 1);
    });

    document.getElementById('btn-replay').addEventListener('click', () => {
      hideAllModals();
      Game.loadLevel(Game.getLevelNum());
    });

    document.getElementById('btn-hint').addEventListener('click', () => Game.useHint());
    document.getElementById('btn-undo').addEventListener('click', () => Game.undo());

    document.getElementById('toggle-music').addEventListener('click', () => {
      applyMusic(Storage.get('music') === false);
      syncSettingsUI();
    });

    document.getElementById('toggle-sfx').addEventListener('click', () => {
      applySound(Storage.get('sound') === false);
      syncSettingsUI();
    });

    document.getElementById('toggle-vibration').addEventListener('click', () => {
      applyVibration(Storage.get('vibration') === false);
      syncSettingsUI();
    });

    document.getElementById('btn-nickname-confirm').addEventListener('click', () => {
      const input = document.getElementById('nickname-input');
      const val = input.value.trim();
      if (!val) { input.focus(); return; }
      Leaderboard.setNickname(val);
      document.getElementById('modal-nickname').classList.add('hidden');
    });
    document.getElementById('btn-nickname-skip').addEventListener('click', () => {
      document.getElementById('modal-nickname').classList.add('hidden');
    });

    document.getElementById('btn-view-leaderboard').addEventListener('click', () => openLeaderboardModal());

    document.getElementById('btn-edit-nickname').addEventListener('click', () => {
      document.getElementById('nickname-input').value = Leaderboard.getNickname() || '';
      document.getElementById('modal-nickname').classList.remove('hidden');
    });
    document.getElementById('btn-leaderboard-close').addEventListener('click', () => {
      document.getElementById('modal-leaderboard').classList.add('hidden');
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

  return { showScreen, applyTheme, applySound, applyMusic, applyVibration, updateMenu, updateHUD, showWin, showFail, hideAllModals, wireEvents, runSplash, buildStatsScreen, promptNicknameIfNeeded };
})();