/* ============================================
   ArrowFlow 3D — ui.js
   ============================================ */

const UI = (() => {
  const TOTAL_LEVELS = 300; // matches manifest.json's "300 levels" and the menu progress bar
  // Which screen the Store's back button returns to - the menu button and the in-game
  // HUD shortcut both open the same screen-store, but need to land back in different places.
  let storeReturnScreen = 'screen-menu';

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
    const isEn = I18N.currentLang() === 'en';
    setSwitch('toggle-lang', isEn);
    const langLabel = document.getElementById('lang-label');
    if (langLabel) langLabel.textContent = I18N.t('settings.language') + ' (' + (isEn ? 'Eng' : 'ไทย') + ')';
    const nickBtn = document.getElementById('btn-edit-nickname');
    if (nickBtn) nickBtn.textContent = Leaderboard.getNickname() || I18N.t('settings.nickname_btn');
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

    const dailyBtn = document.getElementById('btn-daily');
    if (dailyBtn) {
      const done = Storage.isDailyCompletedToday();
      dailyBtn.classList.toggle('daily-done', done);
      dailyBtn.textContent = I18N.t(done ? 'menu.daily_done' : 'menu.daily');
    }
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
    document.getElementById('stats-best-level').textContent = bestEntry
      ? I18N.t('stats.best_row', { level: bestEntry.level, score: bestEntry.score }) : '—';

    const list = document.getElementById('stats-level-list');
    list.innerHTML = '';
    if (entries.length === 0) {
      list.innerHTML = '<div class="stats-empty">' + escapeHtml(I18N.t('stats.empty')) + '</div>';
      return;
    }
    // Most recently reached (highest level) first, matches how a player wants to check progress.
    entries.slice().reverse().forEach(e => {
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML =
        '<span class="stats-row-lvl">' + escapeHtml(I18N.t('stats.row_level')) + ' ' + e.level + '</span>' +
        '<span class="stats-row-stars">' + '★'.repeat(e.stars || 0) + '☆'.repeat(3 - (e.stars || 0)) + '</span>' +
        '<span class="stats-row-time">' + (e.time != null ? formatTime(e.time) : '—') + '</span>' +
        '<span class="stats-row-score">' + (e.score || 0) + '</span>';
      list.appendChild(row);
    });
  }

  function buildStoreScreen() {
    document.getElementById('store-hint-count').textContent = Storage.get('hints');
    const btn = document.getElementById('btn-store-hint-ad');
    const remainingEl = document.getElementById('store-hint-ad-remaining');
    const adsRemoved = Storage.isAdsRemoved();
    // Ads-removed players see no "watch ad" buttons anywhere at all, per the
    // product decision that the purchase means literally no ads shown, ever
    // (see [[arrowflow_monetization_placeholder]]) - not just the display ones.
    if (adsRemoved) {
      btn.classList.add('hidden');
      remainingEl.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      remainingEl.classList.remove('hidden');
      const remaining = Storage.remainingRewardedAds('hint');
      btn.disabled = remaining <= 0;
      remainingEl.textContent = I18N.t('store.ads_remaining', { n: Math.max(0, remaining) });
    }

    const section = document.getElementById('store-remove-ads-section');
    const statusEl = document.getElementById('store-remove-ads-status');
    const forever = Storage.get('adsRemovedForever');
    if (!Iap.isNative()) {
      section.classList.add('hidden');
    } else {
      section.classList.remove('hidden');
      // Once "forever" is owned every tier is redundant - just show status, no
      // buy buttons at all. A still-active timed tier (not forever) still shows
      // all 4 buttons: any of them can be bought again to extend/upgrade.
      if (forever) {
        statusEl.textContent = I18N.t('iap.active_status_forever');
      } else if (adsRemoved) {
        statusEl.textContent = I18N.t('iap.active_status', { n: Storage.daysAdsRemovedLeft() });
      } else {
        statusEl.textContent = '';
      }
      REMOVE_ADS_TIER_KEYS.forEach(key => {
        const btn = document.getElementById('btn-remove-ads-' + key);
        if (forever) { btn.classList.add('hidden'); return; }
        btn.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = key === 'forever'
          ? I18N.t('iap.buy_forever', { price: removeAdsPriceLabel('forever') })
          : I18N.t('iap.buy_days', { days: key, price: removeAdsPriceLabel(key) });
      });
    }

    // Hint packs - show the real Play Billing price once js/iap.js has fetched
    // it (native only); otherwise leave the static data-i18n price already in
    // the HTML (a reasonable approximation, already tuned per-locale in i18n.js)
    // untouched rather than overwriting it with a guess.
    document.querySelectorAll('.store-pack-btn').forEach(btn => {
      const key = btn.dataset.hints;
      const livePrice = Iap.isNative() ? Iap.hintPackPriceLabel(key) : null;
      if (livePrice) btn.textContent = I18N.t('iap.hint_pack_label', { n: key, price: livePrice });
    });
  }

  function updateHUD(payload) {
    const { level, tier, isMilestone, difficulty, remaining, hints, lives, livesMax, canUndo } = payload;

    document.getElementById('hud-lvl-num').textContent = level;
    const tierEl = document.getElementById('hud-tier');
    // Campaign tier names (AWAKENING, ASCENSION, ...) are stylistic/branding,
    // kept as-is in both languages - only the DAILY/REMIX pseudo-tiers are
    // actual UI copy worth translating.
    tierEl.textContent = tier === 'DAILY' ? I18N.t('hud.tier.daily') : tier === 'REMIX' ? I18N.t('hud.tier.remix') : tier;
    tierEl.classList.toggle('milestone', !!isMilestone);
    document.getElementById('hud-hints').textContent = hints;

    const arrowsEl = document.getElementById('hud-arrows-remaining');
    if (arrowsEl) arrowsEl.textContent = remaining;

    const diffEl = document.getElementById('hud-difficulty');
    if (diffEl) diffEl.textContent = difficulty ? I18N.t('difficulty.' + difficulty) : '';

    const livesRow = document.getElementById('hud-lives-row');
    if (livesRow) {
      const hearts = livesRow.querySelectorAll('.heart-icon');
      hearts.forEach((el, idx) => {
        el.classList.toggle('lost', idx >= lives);
      });
    }

    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = !canUndo;

    updateRemoveAdsHud();
  }

  // "Remove ads" IAP (js/iap.js + Storage.grantAdsRemoved/grantAdsRemovedForever) -
  // real money, so unlike the rewarded-ad fallback this has NO web/test equivalent
  // (see iap.js). Every surface that offers it is hidden outright when
  // Iap.isNative() is false rather than shown disabled, since there's nothing a
  // player on web could ever do with it. 4 tiers (7/15/30 days + forever) all buy
  // buttons live only in the Store screen - the HUD badge and fail-modal button
  // are single "go choose a tier" shortcuts into the Store, not direct purchases,
  // so there's exactly one purchase flow (buildStoreScreen's buttons) to reason about.
  const REMOVE_ADS_TIER_KEYS = ['7', '15', '30', 'forever'];
  const REMOVE_ADS_FALLBACK_PRICES = { '7': '$0.99', '15': '$1.99', '30': '$2.99', forever: '$7.99' };

  function removeAdsPriceLabel(tierKey) {
    return Iap.priceLabel(tierKey) || REMOVE_ADS_FALLBACK_PRICES[tierKey];
  }

  // HUD badge: a single status/CTA pill. Not-yet-removed -> tappable shortcut into
  // the Store's remove-ads section. Removed (any tier, including forever) -> a
  // non-interactive status readout instead, so the player can still see their
  // remaining paid time without a second button competing for the same spot.
  function updateRemoveAdsHud() {
    const btn = document.getElementById('btn-hud-remove-ads');
    if (!btn) return;
    if (!Iap.isNative()) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    const label = document.getElementById('hud-remove-ads-label');
    const forever = Storage.get('adsRemovedForever');
    if (forever) {
      btn.classList.add('active');
      btn.disabled = true;
      label.textContent = '♾️';
    } else if (Storage.isAdsRemoved()) {
      btn.classList.add('active');
      btn.disabled = true;
      label.textContent = I18N.t('iap.days_left', { n: Storage.daysAdsRemovedLeft() });
    } else {
      btn.classList.remove('active');
      btn.disabled = false;
      label.textContent = I18N.t('iap.hud_cta_label');
    }
  }

  // Opens the Store screen scrolled to the remove-ads section - shared by the HUD
  // badge and the fail-modal nudge, both of which only make sense as a shortcut
  // once ads aren't already removed (buildStoreScreen/updateFailContinueAdUI hide
  // them otherwise, so this never needs to guard against the "already owned" case).
  function openStoreForRemoveAds(returnScreen) {
    storeReturnScreen = returnScreen;
    buildStoreScreen();
    showScreen('screen-store');
    const section = document.getElementById('store-remove-ads-section');
    if (section && section.scrollIntoView) section.scrollIntoView({ block: 'nearest' });
  }

  // The one real purchase flow, called only from the Store screen's 4 tier
  // buttons. onGranted/onFailed handling (Storage update, UI refresh, alert) is
  // identical across tiers, so this is the single place that logic lives.
  function handlePurchaseRemoveAdsTier(btn, tierKey) {
    if (!Iap.isNative()) return;
    btn.disabled = true;
    Iap.purchaseRemoveAds(tierKey,
      (days) => {
        if (tierKey === 'forever') Storage.set('adsRemovedForever', true);
        else Storage.grantAdsRemoved(days);
        Analytics.logEvent('remove_ads_purchased', { tier: tierKey, days: days || null });
        updateRemoveAdsHud();
        buildStoreScreen();
        updateFailContinueAdUI();
        alert(tierKey === 'forever'
          ? I18N.t('iap.purchase_success_forever')
          : I18N.t('iap.purchase_success', { n: Storage.daysAdsRemovedLeft() }));
      },
      () => {
        btn.disabled = false;
        alert(I18N.t('iap.purchase_failed'));
      }
    );
  }

  const CONFETTI_COLORS = ['#1a7fe8', '#4a9ff5', '#fbbf24', '#2ecc71', '#ff3b30'];

  // Phase 2: win-screen confetti reuses the selected skin's own particleTheme
  // name (see js/skins.js/scene.js's PARTICLE_THEMES) just for the physics
  // direction (rise vs fall) - it does NOT share scene.js's shape-drawing
  // code (this canvas is a simple DOM overlay, not the WebGL fx layer), so
  // themes are approximated with the existing rect/circle particle here
  // rather than duplicating leaf/spark/ring shapes. 'none' (default skin, or
  // no skin selected) keeps today's exact rainbow confetti untouched.
  const RISING_THEMES = ['embers', 'bubbles'];

  function burstConfetti(intensity) {
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

    const skin = Skins.getById(Storage.get('selectedSkin'));
    const theme = skin && skin.particleTheme !== 'none' ? skin.particleTheme : null;
    const dark = Storage.get('theme') === 'dark';
    const themeColors = theme ? [skin.colors.path.light, skin.colors.path.dark, dark ? skin.colors.face.dark : skin.colors.face.light] : null;
    const colors = themeColors || CONFETTI_COLORS;
    const rising = theme && RISING_THEMES.includes(theme);

    const COUNT = Math.round(90 * (intensity || 1));
    const GRAVITY = rising ? -0.22 : 0.28;
    const DRAG = 0.988;
    const DURATION = 2200;

    const particles = Array.from({ length: COUNT }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 40,
      y: rising ? h * 0.65 : h * 0.35,
      vx: (Math.random() - 0.5) * 9,
      vy: rising ? Math.random() * 3 + 1 : -Math.random() * 7 - 4,
      size: 5 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.3,
      shape: !theme ? (Math.random() < 0.5 ? 'rect' : 'circle') : (theme === 'sparks' ? 'rect' : 'circle')
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

  function showWin(levelNum, hints, stars, score, elapsedSec, mode, isCampaignFinale, newlyUnlockedSkin) {
    const winModal = document.getElementById('modal-win');
    const skinBtn = document.getElementById('win-new-skin');
    if (skinBtn) {
      if (newlyUnlockedSkin) {
        const name = newlyUnlockedSkin.name[I18N.currentLang()] || newlyUnlockedSkin.name.en;
        skinBtn.textContent = I18N.t('win.new_skin', { name });
        skinBtn.classList.remove('hidden');
        skinBtn.onclick = () => {
          winModal.classList.add('hidden');
          buildSkinsScreen();
          showScreen('screen-skins');
        };
      } else {
        skinBtn.classList.add('hidden');
        skinBtn.onclick = null;
      }
    }
    winModal.classList.remove('hidden');
    winModal.classList.toggle('campaign-complete', !!isCampaignFinale);
    const titleEl = document.getElementById('win-title');
    if (titleEl) titleEl.textContent = I18N.t(isCampaignFinale ? 'win.finale_title' : 'win.title');
    const subEl = document.getElementById('win-sub');
    if (subEl) {
      subEl.classList.toggle('hidden', !isCampaignFinale);
      subEl.textContent = isCampaignFinale ? I18N.t('win.finale_sub') : '';
    }
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
    burstConfetti(isCampaignFinale ? 2 : 1);

    const isCampaign = !mode || mode === 'campaign';

    // Personal best / world best / rank are per-campaign-level concepts -
    // Daily/Remix track their own progress separately (see Storage.completeDaily/
    // completeRemix) and don't participate in the per-level leaderboard.
    const personalBestEl = document.getElementById('ws-personal-best');
    const worldBestEl = document.getElementById('ws-level-world-best');
    const rankEl = document.getElementById('ws-rank');
    const badge = document.getElementById('win-rank-badge');

    if (!isCampaign) {
      if (personalBestEl) personalBestEl.textContent = score;
      if (worldBestEl) worldBestEl.textContent = '—';
      if (badge) badge.classList.add('hidden');
      return;
    }

    // Personal best for THIS level - Storage.completeLevel() (called just
    // before showWin, see game.js's onWin) already merged this run's score
    // into the stored per-level best, so reading it back here naturally
    // shows whichever is higher: this run, or a past one.
    if (personalBestEl) {
      const levelData = Storage.getLevelData(levelNum);
      personalBestEl.textContent = levelData ? levelData.score : score;
    }

    // World best for this level - best-effort, submitted then re-fetched so
    // a new personal record shows up immediately as the world best too
    // rather than waiting for a stale read.
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

  // Shared by the win-screen's quick "ดูอันดับ" modal and the main-menu Ranking
  // screen - both just point it at their own myRow/list elements.
  async function renderLeaderboard(myRow, list) {
    myRow.textContent = I18N.t('leaderboard.loading');
    list.innerHTML = '';

    const nickname = Leaderboard.getNickname();
    const myScore = Storage.get('totalScore') || 0;
    const [top, myRank] = await Promise.all([
      Leaderboard.fetchTop(10),
      nickname ? Leaderboard.fetchMyRank(myScore) : Promise.resolve(null)
    ]);

    const myProgress = progressLabel(Storage.get('highestUnlocked') || 1);
    myRow.textContent = nickname
      ? I18N.t('leaderboard.my_row', { nickname, rank: myRank != null ? '#' + myRank : '—', score: myScore, progress: myProgress })
      : I18N.t('leaderboard.set_nickname');

    if (top.length === 0) {
      list.innerHTML = '<div class="lb-empty">' + escapeHtml(I18N.t('leaderboard.empty')) + '</div>';
      return;
    }
    top.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (nickname && p.nickname === nickname && p.totalScore === myScore ? ' lb-me' : '');
      // p.totalScore/p.nickname come from Firestore, written by other players' own
      // clients (Firestore Security Rules are the real gate, not this app's own
      // submitScore() call) - coerce/escape both before touching innerHTML so a
      // tampered doc (e.g. totalScore written as a string via a raw SDK call,
      // bypassing this app's Math.round()) can't inject markup into every other
      // player's leaderboard view.
      row.innerHTML =
        '<span class="lb-rank">' + (idx + 1) + '</span>' +
        '<span class="lb-name">' + escapeHtml(p.nickname) + '</span>' +
        '<span class="lb-progress">' + progressLabel(p.highestLevel) + '</span>' +
        '<span class="lb-score">' + (Number(p.totalScore) || 0) + '</span>';
      list.appendChild(row);
    });
  }

  function openLeaderboardModal() {
    document.getElementById('modal-leaderboard').classList.remove('hidden');
    renderLeaderboard(document.getElementById('lb-my-row'), document.getElementById('lb-list'));
  }

  // Ranking screen (main menu) = world leaderboard + the personal per-level
  // history that used to live on its own "Stats" screen, merged into one.
  function buildRankingScreen() {
    renderLeaderboard(document.getElementById('ranking-my-row'), document.getElementById('ranking-lb-list'));
    buildStatsScreen();
  }

  // Rebuilds the whole grid on every open (cheap - only 13 skins, unlike the
  // level grid's buffered-render trick) so a just-crossed unlock threshold or
  // a freshly-selected skin always reflects current Storage state.
  function buildSkinsScreen() {
    const wrap = document.getElementById('skins-grid');
    wrap.innerHTML = '';
    const unlocked = Storage.get('highestUnlocked') || 1;
    const selected = Storage.get('selectedSkin');
    const dark = Storage.get('theme') === 'dark';
    Skins.ALL.forEach(skin => {
      const isUnlocked = unlocked >= skin.unlockLevel;
      const btn = document.createElement('button');
      btn.className = 'skin-btn' + (isUnlocked ? '' : ' locked') + (isUnlocked && selected === skin.id ? ' selected' : '');
      btn.dataset.skinId = skin.id;
      const pathColor = dark ? skin.colors.path.dark : skin.colors.path.light;
      const faceColor = dark ? skin.colors.face.dark : skin.colors.face.light;
      const swatch = document.createElement('span');
      swatch.className = 'skin-swatch';
      swatch.style.background = faceColor;
      swatch.style.color = pathColor;
      btn.appendChild(swatch);
      const nameEl = document.createElement('span');
      nameEl.className = 'skin-btn-name';
      nameEl.textContent = skin.name[I18N.currentLang()] || skin.name.en;
      btn.appendChild(nameEl);
      if (!isUnlocked) {
        const lockEl = document.createElement('span');
        lockEl.className = 'skin-btn-lock';
        lockEl.textContent = '🔒 ' + I18N.t('skins.locked', { n: skin.unlockLevel });
        btn.appendChild(lockEl);
      } else {
        btn.addEventListener('click', () => {
          Storage.set('selectedSkin', skin.id);
          buildSkinsScreen();
          Game.redrawTheme();
        });
      }
      wrap.appendChild(btn);
    });

    // One-shot spotlight the very first time the player has ANY skin besides
    // the always-unlocked default to actually switch to - teaches "tap a
    // swatch to apply it" without building out a full multi-step Tutorial.js
    // flow for what's really a single action. Targets the newest unlocked
    // skin specifically (not just "first not-locked" in DOM order, which
    // would highlight the always-unlocked 'default' entry itself and point
    // the player at nothing new). Runs after appendChild above so
    // getBoundingClientRect() sees real, laid-out elements.
    if (!Storage.get('skinTutorialSeen')) {
      const unlockedNonDefault = Skins.ALL.filter(s => s.id !== 'default' && unlocked >= s.unlockLevel);
      const newest = unlockedNonDefault[unlockedNonDefault.length - 1];
      if (newest && newest.id !== selected) {
        const target = wrap.querySelector('[data-skin-id="' + newest.id + '"]');
        if (target) setTimeout(() => showSkinTutorial(target), 50);
      }
    }
  }

  let skinTutorialEls = null;
  function dismissSkinTutorial() {
    if (!skinTutorialEls) return;
    Storage.set('skinTutorialSeen', true);
    skinTutorialEls.overlay.remove();
    skinTutorialEls = null;
  }
  function showSkinTutorial(targetBtn) {
    dismissSkinTutorial();
    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML =
      '<div class="tutorial-spotlight" id="skin-tut-spotlight"></div>' +
      '<div class="tutorial-bubble" id="skin-tut-bubble">' +
        '<div class="tutorial-icon">🎨</div>' +
        '<h3>' + escapeHtml(I18N.t('skins.tutorial_title')) + '</h3>' +
        '<p>' + escapeHtml(I18N.t('skins.tutorial_text')) + '</p>' +
        '<button id="skin-tut-gotit" class="btn btn-primary btn-sm"></button>' +
      '</div>';
    document.body.appendChild(overlay);
    const spotlight = overlay.querySelector('#skin-tut-spotlight');
    const bubble = overlay.querySelector('#skin-tut-bubble');
    const r = targetBtn.getBoundingClientRect();
    spotlight.style.left = (r.left - 6) + 'px';
    spotlight.style.top = (r.top - 6) + 'px';
    spotlight.style.width = (r.width + 12) + 'px';
    spotlight.style.height = (r.height + 12) + 'px';
    const spotBottom = r.top + r.height;
    bubble.style.left = '50%';
    bubble.style.transform = 'translateX(-50%)';
    bubble.style.top = Math.min(window.innerHeight - 220, spotBottom + 16) + 'px';
    overlay.querySelector('#skin-tut-gotit').textContent = I18N.t('skins.tutorial_got_it');
    overlay.querySelector('#skin-tut-gotit').addEventListener('click', dismissSkinTutorial);
    skinTutorialEls = { overlay };
    // Tapping the actual highlighted skin should count as "got it" too - the
    // click still fires normally (this listener doesn't stopPropagation) so
    // the real skin-select handler on targetBtn also runs.
    targetBtn.addEventListener('click', dismissSkinTutorial, { once: true });
  }

  // A player who has cleared/unlocked level 300 gets a "จบเกม!" (done) badge
  // instead of a bare "300/300" number - reads better as a finish line, and
  // matches the request that finishing the whole campaign stand out on the
  // leaderboard rather than looking like just another number.
  function progressLabel(highestLevel) {
    const lvl = Math.min(highestLevel || 1, TOTAL_LEVELS);
    return lvl >= TOTAL_LEVELS ? I18N.t('progress.done') : (I18N.t('progress.level') + ' ' + lvl);
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
    updateFailContinueAdUI();
    document.getElementById('modal-fail').classList.remove('hidden');
  }

  // Fail-screen "watch ad to continue" placeholder button state - shows remaining daily
  // uses, hides the button entirely once the cap is hit (falls back to plain restart).
  function updateFailContinueAdUI() {
    const btn = document.getElementById('btn-fail-continue-ad');
    const remainingEl = document.getElementById('fail-continue-ad-remaining');
    const adsRemoved = Storage.isAdsRemoved();
    const remaining = Storage.remainingRewardedAds('continue');
    if (adsRemoved || remaining <= 0) {
      btn.classList.add('hidden');
      remainingEl.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      remainingEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = I18N.t('fail.continue_ad');
      remainingEl.textContent = I18N.t('store.ads_remaining', { n: remaining });
    }

    // Promotional nudge toward the "remove ads" IAP - a shortcut into the Store's
    // tier picker (see openStoreForRemoveAds), not a direct purchase. Only makes
    // sense to show while the player doesn't already have it, and only where a
    // real purchase is possible at all (native builds - see [[arrowflow_monetization_placeholder]]).
    const removeAdsBtn = document.getElementById('btn-fail-remove-ads');
    if (!Iap.isNative() || adsRemoved) {
      removeAdsBtn.classList.add('hidden');
    } else {
      removeAdsBtn.classList.remove('hidden');
      removeAdsBtn.disabled = false;
      removeAdsBtn.textContent = I18N.t('iap.fail_hint');
    }
  }

  // Drives a rewarded-ad button through Ads.showRewardedAd() - disables/relabels the
  // button while the ad loads/plays (DOM stays ui.js's job, ads.js never touches it),
  // then restores it either way. onGranted only runs on a real earned reward (or the
  // web/test fallback); onFailed runs on a genuine no-fill/dismiss-without-reward.
  function watchRewardedAd(btn, onGranted, onFailed) {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = I18N.t('store.ad_loading');
    Ads.showRewardedAd(
      () => { btn.textContent = original; onGranted(); },
      () => {
        btn.textContent = original;
        btn.disabled = false;
        if (onFailed) onFailed();
      }
    );
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

    document.getElementById('btn-ranking').addEventListener('click', () => {
      buildRankingScreen();
      showScreen('screen-ranking');
    });
    document.getElementById('btn-back-ranking').addEventListener('click', () => showScreen('screen-menu'));

    document.getElementById('btn-skins').addEventListener('click', () => {
      buildSkinsScreen();
      showScreen('screen-skins');
    });
    document.getElementById('btn-back-skins').addEventListener('click', () => {
      dismissSkinTutorial();
      showScreen('screen-menu');
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      document.getElementById('pause-lvl').textContent = Storage.get('currentLevel');
      document.getElementById('modal-pause').classList.remove('hidden');
    });
    document.getElementById('btn-resume').addEventListener('click', () => document.getElementById('modal-pause').classList.add('hidden'));
    document.getElementById('btn-restart').addEventListener('click', () => {
      document.getElementById('modal-pause').classList.add('hidden');
      Game.restart();
    });
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

    // Resets the 'seen' flag and reloads level 1, which makes Tutorial's own
    // 'level-loaded' listener re-arm it - no direct coupling to the Tutorial
    // module needed here, same as any other level load.
    document.getElementById('btn-replay-tutorial').addEventListener('click', () => {
      hideAllModals();
      Storage.set('tutorialSeen', false);
      Game.loadLevel(1);
      showScreen('screen-game');
    });

    document.getElementById('btn-open-reset').addEventListener('click', () => {
      document.getElementById('modal-settings').classList.add('hidden');
      document.getElementById('modal-reset-confirm').classList.remove('hidden');
    });
    document.getElementById('btn-reset-cancel').addEventListener('click', () => {
      document.getElementById('modal-reset-confirm').classList.add('hidden');
    });
    document.getElementById('btn-reset-confirm').addEventListener('click', async (e) => {
      // Sign out of the current anonymous Firebase session FIRST (so a fresh uid
      // gets minted on next load - see Leaderboard.resetIdentity()), then clear
      // local save data, then hard-reload so every module (Game/UI/Tutorial/
      // Leaderboard) re-initializes clean rather than trying to patch live state.
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = I18N.t('reset.working');
      Analytics.logEvent('progress_reset', {});
      await Leaderboard.resetIdentity();
      Storage.resetAll();
      location.reload();
    });

    document.getElementById('btn-next').addEventListener('click', async () => {
      hideAllModals();

      const mode = Game.getMode();

      // One-time nudge toward Daily Challenge, right after level 3 - the
      // natural "next" flow here would otherwise skip straight to level 4
      // without ever passing through the menu screen where the Daily button
      // lives. Deliberately skips the interstitial-ad check below this run
      // (not even counted as "shown") so a brand new player isn't hit with
      // an ad and this tip in the same tap.
      if (mode === 'campaign' && Game.getLevelNum() === 3 && !Storage.get('dailyTipSeen')) {
        Storage.set('dailyTipSeen', true);
        document.getElementById('modal-daily-tip').classList.remove('hidden');
        return;
      }

      if (!Storage.isAdsRemoved() && Storage.shouldShowInterstitial()) {
        await new Promise(resolve => Ads.showInterstitial(resolve));
        Storage.recordInterstitialShown();
      }

      if (mode === 'remix') {
        Game.loadRemixLevel(Game.getRemixIndex() + 1);
      } else if (mode === 'daily') {
        // Only one puzzle per day - "next" just returns to the menu.
        updateMenu();
        showScreen('screen-menu');
      } else {
        const cur = Game.getLevelNum();
        if (cur >= TOTAL_LEVELS) Game.loadRemixLevel(0); // campaign just finished -> REMIX
        else Game.loadLevel(cur + 1);
      }
    });

    document.getElementById('btn-replay').addEventListener('click', () => {
      hideAllModals();
      Game.restart();
    });

    document.getElementById('btn-daily-tip-go').addEventListener('click', () => {
      hideAllModals();
      Game.loadDailyLevel();
      showScreen('screen-game');
    });

    document.getElementById('btn-daily-tip-later').addEventListener('click', () => {
      hideAllModals();
      Game.loadLevel(4);
    });

    document.getElementById('btn-daily').addEventListener('click', () => {
      Game.loadDailyLevel();
      showScreen('screen-game');
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

    document.getElementById('toggle-lang').addEventListener('click', () => {
      I18N.setLang(I18N.currentLang() === 'en' ? 'th' : 'en');
      syncSettingsUI();
      updateMenu();
      // Re-render the in-game HUD's translated text (difficulty badge, DAILY/
      // REMIX tier label) if a level is currently loaded.
      const hudPayload = Game.getHudPayload();
      if (hudPayload) updateHUD(hudPayload);
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

    document.getElementById('btn-fail-continue-ad').addEventListener('click', (e) => {
      watchRewardedAd(e.currentTarget, () => {
        if (!Storage.useRewardedAd('continue')) { updateFailContinueAdUI(); return; }
        Analytics.logEvent('continue_ad_used', {});
        document.getElementById('modal-fail').classList.add('hidden');
        Game.continueAfterFail();
      }, () => alert(I18N.t('store.ad_failed')));
    });

    document.getElementById('btn-fail-remove-ads').addEventListener('click', () => {
      document.getElementById('modal-fail').classList.add('hidden');
      openStoreForRemoveAds('screen-game');
    });
    document.getElementById('btn-hud-remove-ads').addEventListener('click', () => {
      if (Storage.isAdsRemoved()) return; // status-only pill once owned, see updateRemoveAdsHud()
      openStoreForRemoveAds('screen-game');
    });
    document.querySelectorAll('.remove-ads-tier-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handlePurchaseRemoveAdsTier(e.currentTarget, e.currentTarget.dataset.tier));
    });

    document.getElementById('btn-store').addEventListener('click', () => {
      storeReturnScreen = 'screen-menu';
      buildStoreScreen();
      showScreen('screen-store');
    });
    document.getElementById('btn-hud-store').addEventListener('click', () => {
      storeReturnScreen = 'screen-game';
      buildStoreScreen();
      showScreen('screen-store');
    });
    document.getElementById('btn-back-store').addEventListener('click', () => {
      // Buying/ad-earning hints in-level doesn't otherwise touch the HUD until the next
      // updateHUD() call (e.g. on hint use) - refresh it immediately so the count shown
      // in the HUD matches what the store just showed.
      if (storeReturnScreen === 'screen-game') {
        const hudHints = document.getElementById('hud-hints');
        if (hudHints) hudHints.textContent = Storage.get('hints');
      }
      showScreen(storeReturnScreen);
    });

    document.getElementById('btn-store-hint-ad').addEventListener('click', (e) => {
      watchRewardedAd(e.currentTarget, () => {
        if (!Storage.useRewardedAd('hint')) { buildStoreScreen(); return; }
        Analytics.logEvent('hint_ad_used', {});
        Storage.addHints(1);
        buildStoreScreen();
      }, () => alert(I18N.t('store.ad_failed')));
    });

    // Hint packs - real Google Play Billing purchase (js/iap.js). data-hints
    // doubles as the pack key ('10'/'30'/'100') since HINT_PACKS in iap.js is
    // keyed by the same hint count. Falls back to the coming-soon alert on
    // web/test builds where there's no purchase SDK at all (see iap.js).
    document.querySelectorAll('.store-pack-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const packKey = btn.dataset.hints;
        if (!Iap.isNative()) {
          Analytics.logEvent('pack_purchase_clicked', { hints: packKey || null });
          alert(I18N.t('store.coming_soon'));
          return;
        }
        e.currentTarget.disabled = true;
        Iap.purchaseHintPack(packKey,
          (hints) => {
            Storage.addHints(hints);
            Analytics.logEvent('hint_pack_purchased', { hints });
            e.currentTarget.disabled = false;
            buildStoreScreen();
            alert(I18N.t('iap.hint_pack_success', { n: hints }));
          },
          () => {
            e.currentTarget.disabled = false;
            alert(I18N.t('iap.purchase_failed'));
          }
        );
      });
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

  return { showScreen, applyTheme, applySound, applyMusic, applyVibration, updateMenu, updateHUD, showWin, showFail, hideAllModals, wireEvents, runSplash, buildStatsScreen, buildRankingScreen, promptNicknameIfNeeded };
})();