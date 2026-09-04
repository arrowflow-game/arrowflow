/* ============================================
   ArrowFlow 3D — ui.js
   ============================================ */

const UI = (() => {
  const TOTAL_LEVELS = 300; // matches manifest.json's "300 levels" and the menu progress bar
  // Which screen the Store's back button returns to - the menu button and the in-game
  // HUD shortcut both open the same screen-store, but need to land back in different places.
  let storeReturnScreen = 'screen-menu';
  // Same idea for Skins - the menu button and the Settings shortcut (reachable from
  // pause mid-game) both open screen-skins, but need to land back in different places.
  let skinsReturnScreen = 'screen-menu';
  // Holds the cloud snapshot between showing modal-cloudsave-conflict and the
  // player actually picking a side - set by openCloudSaveConflict(), read/cleared
  // by the modal's own two button handlers (wireEvents(), below).
  let pendingCloudSnapshot = null;

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

  // Colorblind-friendly path labels (js/scene.js's drawColorblindMarks) - just a
  // Storage flag, scene.js's per-frame render loop reads it live so no redraw
  // trigger is needed here.
  function applyColorblindMode(enabled) {
    Storage.set('colorblindMode', enabled);
  }

  function setSwitch(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', on);
  }

  function syncSettingsUI() {
    setSwitch('toggle-darkmode', Storage.get('theme') === 'dark');
    setSwitch('toggle-music', Storage.get('music') !== false);
    setSwitch('toggle-sfx', Storage.get('sound') !== false);
    setSwitch('toggle-vibration', Storage.get('vibration') !== false);
    setSwitch('toggle-colorblind', Storage.get('colorblindMode') === true);
    const isEn = I18N.currentLang() === 'en';
    setSwitch('toggle-lang', isEn);
    const langLabel = document.getElementById('lang-label');
    if (langLabel) langLabel.textContent = I18N.t('settings.language') + ' (' + (isEn ? 'Eng' : 'ไทย') + ')';
    const nickBtn = document.getElementById('btn-edit-nickname');
    if (nickBtn) nickBtn.textContent = Leaderboard.getNickname() || I18N.t('settings.nickname_btn');
    syncGoogleAccountUI();
    // AdMob/UMP consent (js/ads.js) - only shown for players Google's consent
    // form actually applies to (mainly EEA/UK); everyone else never sees this row.
    const privacyRow = document.getElementById('settings-row-privacy');
    if (privacyRow) privacyRow.classList.toggle('hidden', !Ads.isPrivacyOptionsRequired());
  }

  // Reflects CloudSave's current link state in the Settings row - shared by
  // syncSettingsUI() (every time Settings opens) and the sign-in/out button
  // handlers themselves (so the row updates immediately, not just next open).
  function syncGoogleAccountUI() {
    const label = document.getElementById('google-account-label');
    const btn = document.getElementById('btn-google-signin');
    if (!label || !btn) return;
    // Remote kill switch (js/remoteconfig.js) - cloud save is the newest and
    // least device-tested system here, and hiding its only entry point is a far
    // better first response to a report of lost progress than a release that
    // takes days to reach anyone. Hiding the row does NOT sign an already-linked
    // player out: their existing session and its syncing keep working, they just
    // can't start a new link while the switch is off.
    const row = document.getElementById('settings-row-google');
    if (row) row.classList.toggle('hidden', RemoteConfig.get('feature_cloud_save_enabled') === false);
    const linked = CloudSave.isGoogleLinked();
    label.textContent = linked ? I18N.t('settings.google_signed_in') : I18N.t('settings.google_account');
    btn.textContent = linked ? I18N.t('settings.google_signout_btn') : I18N.t('settings.google_signin_btn');
    // "Delete account" only means anything once one exists. Offering it to a
    // player who never signed in would just be a scarier-looking duplicate of
    // "ล้างข้อมูล" (which keeps purchases and is the thing they actually want).
    const delRow = document.getElementById('settings-row-delete-account');
    if (delRow) delRow.classList.toggle('hidden', !linked);
  }

  // Shared by the sign-in button's own flow and main.js's startup CloudSave.init()
  // check (a Google session already active from a previous launch can also surface
  // a conflict, e.g. this device's data changed on another device meanwhile).
  function openCloudSaveConflict(snapshot) {
    pendingCloudSnapshot = snapshot;
    document.getElementById('modal-cloudsave-conflict').classList.remove('hidden');
  }

  function showScreen(id) {
    document.querySelectorAll('.ovr-screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    // Background music only plays while actually in a level. Store/Skins are
    // reachable mid-level via the in-game HUD as a brief detour (not really
    // "leaving" the level), so they pause/resume in place rather than
    // stopping/restarting the track from 0:00 - every other screen (menu,
    // level select, ranking) really does end the level, so those still stop
    // it outright.
    if (id === 'screen-game') Sound.resumeMusic();
    else if (id === 'screen-store' || id === 'screen-skins') Sound.pauseMusic();
    else Sound.stopMusic();
  }

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    Storage.set('theme', theme);
    const iconText = theme === 'dark' ? '☀️' : '🌙';
    const icon = document.getElementById('theme-icon');
    if (icon) icon.textContent = iconText;
  }

  // Shared by the main menu card and the in-game HUD - both show the same
  // live gems balance, so a single refresh point keeps them in sync whenever
  // gems change (level completion, gems-skin purchase).
  function refreshGemsDisplay() {
    const g = Storage.getGemsTotal();
    const menuEl = document.getElementById('menu-gems');
    if (menuEl) menuEl.textContent = '💎 ' + g;
    const hudEl = document.getElementById('hud-gems-count');
    if (hudEl) hudEl.textContent = g;
  }

  // Every streak-track skin (js/skins.js), sorted by day-threshold ascending -
  // used both for the daily-tip nudge (always points at the very first one)
  // and the menu streak badge (points at whichever is next to unlock).
  function streakSkinsSorted() {
    return Skins.ALL.filter(s => s.unlock.type === 'streak').slice().sort((a, b) => a.unlock.value - b.unlock.value);
  }

  // Localized daily_tip.text with the first streak skin's own name substituted
  // in, so the one-time nudge tells the player a concrete reward instead of
  // just "you'll get a streak stat" (that vague version was the reason this
  // whole nudge got questioned in the first place).
  function dailyTipText() {
    const first = streakSkinsSorted()[0];
    const skinName = first ? (first.name[I18N.currentLang()] || first.name.en) : '';
    return I18N.t('daily_tip.text', { skin: skinName });
  }

  // Menu streak badge (#daily-streak-badge) - proactive "N more days for skin
  // X" callout under the Daily button, so the reward is visible without ever
  // opening the Skins screen. Uses the SAME permanent ownedStreakSkins set as
  // Skins.isUnlockedFor() (see [[arrowflow_holo_sync_fix]]-era memory system
  // note on streak skins never re-locking) - "next" is the lowest-threshold
  // skin not yet owned, not just whatever's above the live streak count.
  function updateDailyStreakBadge() {
    const badge = document.getElementById('daily-streak-badge');
    if (!badge) return;
    const streakSkins = streakSkinsSorted();
    if (streakSkins.length === 0) { badge.classList.add('hidden'); return; }
    const owned = new Set(Storage.get('ownedStreakSkins') || []);
    const streak = Storage.get('dailyStreak') || 0;
    const next = streakSkins.find(s => !owned.has(s.id));
    badge.classList.remove('hidden');
    if (!next) {
      badge.textContent = I18N.t('daily_streak.badge_maxed', { cur: streak });
    } else {
      const skinName = next.name[I18N.currentLang()] || next.name.en;
      badge.textContent = I18N.t('daily_streak.badge_progress', { cur: Math.min(streak, next.unlock.value), n: next.unlock.value, skin: skinName });
    }
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
    refreshGemsDisplay();

    const dailyBtn = document.getElementById('btn-daily');
    if (dailyBtn) {
      const done = Storage.isDailyCompletedToday();
      dailyBtn.classList.toggle('daily-done', done);
      dailyBtn.textContent = I18N.t(done ? 'menu.daily_done' : 'menu.daily');
    }
    updateDailyStreakBadge();
    updateWheelBadge();
    updateNotifyDots();

    // Bundle promo button (2026-08-20) - hidden on web (nothing purchasable
    // there, same rule every other real-money surface follows) and once
    // every skin in the game is already owned (nothing left to advertise).
    const promoBtn = document.getElementById('btn-bundle-promo');
    if (promoBtn) {
      const ownedIapSkins = new Set(Storage.get('ownedIapSkins') || []);
      const allOwned = Skins.bundleIds('all').every(id => ownedIapSkins.has(id));
      promoBtn.classList.toggle('hidden', !Iap.isNative() || allOwned);
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
    // Most recently reached (highest level) first, matches how a player wants to check
    // progress - and only the most recent RECENT_HISTORY_CAP get built into the DOM at
    // all (not just visually scroll-capped), since a player 300 levels in otherwise means
    // building/laying out hundreds of rows every time this screen opens for history nobody
    // scrolls back to - a hint line explains the rest still exists, just isn't rendered.
    const RECENT_HISTORY_CAP = 30;
    const recent = entries.slice().reverse().slice(0, RECENT_HISTORY_CAP);
    recent.forEach(e => {
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML =
        '<span class="stats-row-lvl">' + escapeHtml(I18N.t('stats.row_level')) + ' ' + e.level + '</span>' +
        '<span class="stats-row-stars">' + '★'.repeat(e.stars || 0) + '☆'.repeat(3 - (e.stars || 0)) + '</span>' +
        '<span class="stats-row-time">' + (e.time != null ? formatTime(e.time) : '—') + '</span>' +
        '<span class="stats-row-score">' + (e.score || 0) + '</span>';
      list.appendChild(row);
    });
    if (entries.length > RECENT_HISTORY_CAP) {
      const hint = document.createElement('div');
      hint.className = 'stats-more-hint';
      hint.textContent = I18N.t('stats.more_hidden', { n: entries.length - RECENT_HISTORY_CAP });
      list.appendChild(hint);
    }
  }

  function buildStoreScreen() {
    document.getElementById('store-hint-count').textContent = Storage.getHintsTotal();
    const btn = document.getElementById('btn-store-hint-ad');
    const remainingEl = document.getElementById('store-hint-ad-remaining');
    // Opt-in rewarded ads stay available even after buying remove-ads - that
    // purchase removes the forced/interstitial/banner ads, not the player's
    // own choice to watch one for a reward. Hiding this too would leave a
    // paying player with strictly fewer options than a free one (see
    // [[arrowflow_monetization_placeholder]]).
    btn.classList.remove('hidden');
    remainingEl.classList.remove('hidden');
    const remaining = Storage.remainingRewardedAds('hint');
    btn.disabled = remaining <= 0;
    remainingEl.textContent = I18N.t('store.ads_remaining', { n: Math.max(0, remaining), cap: Storage.rewardedAdCap('hint') });
    document.getElementById('store-hint-ad-dot').classList.toggle('hidden', remaining <= 0);
    updateNotifyDots();

    const section = document.getElementById('store-remove-ads-section');
    const statusEl = document.getElementById('store-remove-ads-status');
    const forever = Storage.get('adsRemovedForever');
    const adsRemoved = Storage.isAdsRemoved();
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

    // Gem packs (2026-08-20) - hidden outright on web like remove-ads/skin
    // sections above, since there's nothing a web player could do with them.
    const gemsSection = document.getElementById('store-gems-section');
    if (!Iap.isNative()) {
      gemsSection.classList.add('hidden');
    } else {
      gemsSection.classList.remove('hidden');
      GEM_PACK_KEYS.forEach(key => {
        const gbtn = document.getElementById('btn-gems-' + key);
        gbtn.disabled = false;
        gbtn.textContent = I18N.t('store.gem_pack_label', { n: key, price: gemPackPriceLabel(key) });
      });
    }

    // Skin bundles (2026-08-20) - price + "how many of this bundle's skins
    // are still locked" computed live so a bundle never gets advertised as
    // if it's selling skins the player already owns.
    const bundlesSection = document.getElementById('store-bundles-section');
    if (!Iap.isNative()) {
      bundlesSection.classList.add('hidden');
    } else {
      bundlesSection.classList.remove('hidden');
      const ownedIapSkins = new Set(Storage.get('ownedIapSkins') || []);
      const statusEl = document.getElementById('store-bundle-status');
      const allOwned = Skins.bundleIds('all').every(id => ownedIapSkins.has(id));
      statusEl.textContent = allOwned ? I18N.t('store.bundle_owned_all') : '';
      BUNDLE_KEYS.forEach(key => {
        const bbtn = document.getElementById('btn-bundle-' + key);
        const remaining = Skins.bundleIds(key).filter(id => !ownedIapSkins.has(id)).length;
        if (remaining === 0) { bbtn.classList.add('hidden'); return; }
        bbtn.classList.remove('hidden');
        bbtn.disabled = false;
        const i18nKey = key === 'streak' ? 'store.bundle_streak' : key === 'royale' ? 'store.bundle_royale' : 'store.bundle_all';
        bbtn.textContent = I18N.t(i18nKey, { n: remaining, price: bundlePriceLabel(key) });
      });
    }
  }

  // Resets then shrinks an element's own font-size (only that element - never
  // touches siblings/anything else) one px at a time until its text no longer
  // overflows its box, down to minPx. Requires the element's CSS to actually
  // allow it to be squeezed narrower than its text (min-width:0 + flex-shrink,
  // see .hud-difficulty-badge) - otherwise scrollWidth/clientWidth never
  // diverge and this is a no-op.
  function shrinkToFit(el, minPx) {
    el.style.fontSize = '';
    let size = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.clientWidth && size > minPx) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  }

  function updateHUD(payload) {
    const { level, tier, isMilestone, difficulty, remaining, hints, lives, livesMax, canUndo, combo } = payload;

    document.getElementById('hud-lvl-num').textContent = level;
    const tierEl = document.getElementById('hud-tier');
    // Campaign tier names (AWAKENING, ASCENSION, ...) are stylistic/branding,
    // kept as-is in both languages - only the DAILY/REMIX pseudo-tiers are
    // actual UI copy worth translating.
    tierEl.textContent = tier === 'DAILY' ? I18N.t('hud.tier.daily') : tier === 'REMIX' ? I18N.t('hud.tier.remix') : tier;
    tierEl.classList.toggle('milestone', !!isMilestone);
    document.getElementById('hud-hints').textContent = hints;
    refreshGemsDisplay();

    const arrowsEl = document.getElementById('hud-arrows-remaining');
    if (arrowsEl) arrowsEl.textContent = remaining;

    const diffEl = document.getElementById('hud-difficulty');
    if (diffEl) {
      diffEl.textContent = difficulty ? I18N.t('difficulty.' + difficulty) : '';
      // Scoped to just this one badge (see shrinkToFit below) - keeps it on
      // the same line as the arrows/hearts row instead of wrapping when a
      // longer translated difficulty word doesn't fit, per direct request
      // not to touch font sizing anywhere else.
      shrinkToFit(diffEl, 8);
    }

    const livesRow = document.getElementById('hud-lives-row');
    if (livesRow) {
      const hearts = livesRow.querySelectorAll('.heart-icon');
      // REMIX laps cut the heart budget (3 -> 2 -> 1, see js/remix.js). A heart
      // the player never had must be HIDDEN, not dimmed: dimming is exactly how
      // a heart already lost this level is drawn, so leaving all three in place
      // told a lap-2 player they had failed twice before their first tap.
      const max = livesMax || hearts.length;
      hearts.forEach((el, idx) => {
        el.classList.toggle('hidden', idx >= max);
        el.classList.toggle('lost', idx >= lives);
      });
    }

    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.disabled = !canUndo;

    // Color-Match Combo badge - hidden entirely below a 2-streak (a single clear isn't
    // really a "combo" yet, see game.js's computeScore comment), and on levels where
    // the mechanic is off (game.js never reports combo>1 there since it's never
    // incremented past 1 - see comboEnabledForLevel()).
    const comboBadge = document.getElementById('hud-combo-badge');
    if (comboBadge) {
      comboBadge.classList.toggle('hidden', !(combo > 1));
      const comboCountEl = document.getElementById('hud-combo-count');
      if (comboCountEl) comboCountEl.textContent = combo || 0;
    }

    updateRemoveAdsHud();
    updateNotifyDots();
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

  // Gem packs + skin bundles (2026-08-20) - same "hidden outright on web,
  // real Play Billing price once native has fetched it, else a fallback"
  // pattern as remove-ads above.
  const GEM_PACK_KEYS = ['100', '300', '800', '2000'];
  const GEM_PACK_FALLBACK_PRICES = { '100': '$0.99', '300': '$2.49', '800': '$5.99', '2000': '$12.99' };
  function gemPackPriceLabel(packKey) {
    return Iap.gemPackPriceLabel(packKey) || GEM_PACK_FALLBACK_PRICES[packKey];
  }

  const BUNDLE_KEYS = ['streak', 'royale', 'all'];
  const BUNDLE_FALLBACK_PRICES = { streak: '$4.99', royale: '$4.99', all: '$14.99' };
  function bundlePriceLabel(bundleKey) {
    return Iap.bundlePriceLabel(bundleKey) || BUNDLE_FALLBACK_PRICES[bundleKey];
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

  // One-time nudge, shown right after the player's first-ever successful
  // non-consumable real-money purchase (permanent skin/bundle/remove-ads-
  // forever) - teaches the free re-tap-to-restore flow (see js/iap.js's
  // isAlreadyOwnedError()) before they'd ever need it, rather than leaving
  // them to discover it cold after a reinstall. Fires at most once, ever.
  function maybeShowIapRestoreHint() {
    if (Storage.get('iapRestoreHintShown')) return;
    Storage.set('iapRestoreHintShown', true);
    alert(I18N.t('iap.restore_hint'));
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
        // Only the 'forever' tier is non-consumable (7/15/30-day tiers can
        // always just be bought again if lost, no restore concept needed).
        if (tierKey === 'forever') maybeShowIapRestoreHint();
      },
      () => {
        btn.disabled = false;
        alert(I18N.t('iap.purchase_failed'));
      }
    );
  }

  // Opens the Store screen scrolled to the skin-bundles section - the menu's
  // promo button (index.html's #btn-bundle-promo) is the only caller today,
  // mirrors openStoreForRemoveAds above exactly.
  function openStoreForBundles(returnScreen) {
    storeReturnScreen = returnScreen;
    buildStoreScreen();
    showScreen('screen-store');
    const section = document.getElementById('store-bundles-section');
    if (section && section.scrollIntoView) section.scrollIntoView({ block: 'nearest' });
  }

  // Real-money gem pack purchase (2026-08-20) - mirrors
  // handlePurchaseRemoveAdsTier above; onGranted(gems) calls
  // Storage.grantGems() (the ONE mutator for real-money gems, same "guard
  // the mutation in one place" pattern as spendGems).
  function handlePurchaseGemPack(btn, packKey) {
    if (!Iap.isNative()) return;
    btn.disabled = true;
    Iap.purchaseGemPack(packKey,
      (gems) => {
        Storage.grantGems(gems);
        Analytics.logEvent('gems_purchased', { pack: packKey, gems });
        refreshGemsDisplay();
        buildStoreScreen();
        alert(I18N.t('iap.gem_pack_success', { n: gems }));
      },
      () => {
        btn.disabled = false;
        alert(I18N.t('iap.purchase_failed'));
      }
    );
  }

  // Skin bundle purchase (2026-08-20) - grants every not-yet-owned skin id
  // in the bundle via Storage.grantIapSkin() (same mutator individual skin
  // purchases already use), so Skins.isUnlockedFor() picks them up
  // immediately with no separate "bundle owned" bookkeeping needed.
  function handlePurchaseBundle(btn, bundleKey) {
    if (!Iap.isNative()) return;
    btn.disabled = true;
    Iap.purchaseBundle(bundleKey,
      () => {
        Skins.bundleIds(bundleKey).forEach(id => Storage.grantIapSkin(id));
        Analytics.logEvent('skin_bundle_purchased', { bundle: bundleKey });
        buildStoreScreen();
        buildSkinsScreen();
        alert(I18N.t('iap.bundle_success'));
        maybeShowIapRestoreHint();
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

  function burstConfetti(intensity, areaId) {
    const area = document.getElementById(areaId || 'confetti-area');
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

  // --- Daily Wheel (2026-08-25) ---------------------------------------

  // Weighted prize table - gems 1/3/5/10 and hints 1/3 (the same hint bonus
  // amounts the game already grants at milestone/epic levels, see
  // storage.js's completeLevel()). Weight = relative slice size on the
  // wheel face AND relative pick probability (kept in sync deliberately -
  // a wedge's visible size should honestly reflect its odds).
  const WHEEL_PRIZES = [
    { type: 'gems', amount: 1, weight: 30 },
    { type: 'gems', amount: 3, weight: 20 },
    { type: 'hints', amount: 1, weight: 20 },
    { type: 'gems', amount: 5, weight: 15 },
    { type: 'hints', amount: 3, weight: 8 },
    { type: 'gems', amount: 10, weight: 7 }
  ];
  const WHEEL_WEDGE_COLORS = ['#1a7fe8', '#fbbf24', '#2ecc71', '#ff3b30', '#8e44ad', '#00b8b8'];

  // Cumulative rotation applied to #wheel-disc so far this session (not
  // persisted - just needs to always increase so every spin visually
  // continues turning forward instead of snapping backward).
  let wheelRotation = 0;

  // One-time layout pass: paints the conic-gradient wedge background and
  // positions one rotated label per wedge, sized proportionally to each
  // prize's weight (see WHEEL_PRIZES comment above).
  function renderWheelWedges() {
    const disc = document.getElementById('wheel-disc');
    if (!disc || disc.dataset.rendered) return; // static prize table, only needs building once
    disc.dataset.rendered = '1';
    const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
    let angle = 0;
    const stops = [];
    disc.innerHTML = '';
    WHEEL_PRIZES.forEach((prize, i) => {
      const slice = (prize.weight / total) * 360;
      const start = angle, end = angle + slice, mid = angle + slice / 2;
      stops.push(`${WHEEL_WEDGE_COLORS[i % WHEEL_WEDGE_COLORS.length]} ${start}deg ${end}deg`);
      // Positioned radially by trig (not CSS rotate) so the icon+number stay
      // upright and readable in every wedge at rest - a rotated label reads
      // sideways/upside-down past 90deg, which is what looked messy before.
      // They still spin along with the disc's own rotation during a spin
      // (expected motion, same as a real prize wheel) since they're children
      // of #wheel-disc.
      const rad = (mid * Math.PI) / 180;
      const radius = 34; // % of disc size from center
      const label = document.createElement('span');
      label.className = 'wheel-wedge-label';
      label.style.left = `calc(50% + ${(Math.sin(rad) * radius).toFixed(2)}%)`;
      label.style.top = `calc(50% - ${(Math.cos(rad) * radius).toFixed(2)}%)`;
      label.textContent = prize.type === 'gems' ? `💎${prize.amount}` : `💡${prize.amount}`;
      disc.appendChild(label);
      angle = end;
    });
    disc.style.background = `conic-gradient(${stops.join(', ')})`;
  }

  // Picks a prize honoring WHEEL_PRIZES' relative weights.
  function pickWheelPrize() {
    const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const prize of WHEEL_PRIZES) {
      if (r < prize.weight) return prize;
      r -= prize.weight;
    }
    return WHEEL_PRIZES[WHEEL_PRIZES.length - 1];
  }

  // Refreshes the free/bonus spin buttons' enabled state + remaining-count
  // label - same read-state-then-toggle pattern as updateFailContinueAdUI().
  function buildWheelModal() {
    const freeBtn = document.getElementById('btn-wheel-spin-free');
    const adBtn = document.getElementById('btn-wheel-spin-ad');
    const remainingEl = document.getElementById('wheel-ad-remaining');
    const resultEl = document.getElementById('wheel-result');
    resultEl.classList.add('hidden');
    resultEl.textContent = '';
    renderWheelWedges();

    const freeAvailable = Storage.isWheelFreeSpinAvailable();
    freeBtn.disabled = !freeAvailable;
    document.getElementById('wheel-spin-free-label').textContent = I18N.t(freeAvailable ? 'wheel.spin_free' : 'wheel.spin_free_done');
    document.getElementById('wheel-spin-free-dot').classList.toggle('hidden', !freeAvailable);

    const bonusRemaining = Storage.remainingWheelBonusSpins();
    adBtn.classList.toggle('hidden', bonusRemaining <= 0);
    remainingEl.classList.toggle('hidden', bonusRemaining <= 0);
    document.getElementById('wheel-spin-ad-dot').classList.toggle('hidden', bonusRemaining <= 0);
    if (bonusRemaining > 0) {
      remainingEl.textContent = I18N.t('wheel.bonus_remaining', { n: bonusRemaining, cap: 5 });
    }
    updateNotifyDots();
  }

  // source: 'free' | 'bonus' - caller has already confirmed the spin is
  // allowed (Storage.isWheelFreeSpinAvailable() / a granted rewarded ad) and,
  // for 'bonus', already consumed the daily ad-spin slot.
  function spinWheel(source) {
    const freeBtn = document.getElementById('btn-wheel-spin-free');
    const adBtn = document.getElementById('btn-wheel-spin-ad');
    freeBtn.disabled = true;
    adBtn.disabled = true;

    const prize = pickWheelPrize();
    const total = WHEEL_PRIZES.reduce((s, p) => s + p.weight, 0);
    let angle = 0, mid = 0;
    for (const p of WHEEL_PRIZES) {
      const slice = (p.weight / total) * 360;
      if (p === prize) { mid = angle + slice / 2; break; }
      angle += slice;
    }
    const disc = document.getElementById('wheel-disc');
    const extraTurns = 5 * 360;
    wheelRotation += extraTurns + ((360 - mid) - (wheelRotation % 360) + 360) % 360;
    disc.style.transform = `rotate(${wheelRotation}deg)`;
    Sound.playWheelSpin();

    setTimeout(() => {
      if (source === 'free') {
        Storage.useWheelFreeSpin();
        // Same "ask at a moment the reminder obviously pays off" reasoning as
        // game.js's Daily Challenge completion - they just used today's free
        // spin, so tomorrow's is worth a nudge (true = prompting allowed).
        Notifications.refresh(true);
      }
      if (prize.type === 'gems') Storage.addGems(prize.amount);
      else Storage.addHints(prize.amount);
      refreshGemsDisplay();
      const hintEl = document.getElementById('hud-hints');
      if (hintEl) hintEl.textContent = Storage.getHintsTotal();
      const storeHintEl = document.getElementById('store-hint-count');
      if (storeHintEl) storeHintEl.textContent = Storage.getHintsTotal();

      Sound.playWheelWin();
      burstConfetti(1, 'wheel-confetti-area');
      const resultEl = document.getElementById('wheel-result');
      resultEl.textContent = I18N.t(prize.type === 'gems' ? 'wheel.result_gems' : 'wheel.result_hints', { n: prize.amount });
      resultEl.classList.remove('hidden');
      Analytics.logEvent('wheel_spin', { prize_type: prize.type, amount: prize.amount, source });

      const freeAvailableNow = Storage.isWheelFreeSpinAvailable();
      freeBtn.disabled = !freeAvailableNow;
      document.getElementById('wheel-spin-free-label').textContent = I18N.t(freeAvailableNow ? 'wheel.spin_free' : 'wheel.spin_free_done');
      document.getElementById('wheel-spin-free-dot').classList.toggle('hidden', !freeAvailableNow);
      const bonusRemaining = Storage.remainingWheelBonusSpins();
      adBtn.disabled = bonusRemaining <= 0;
      adBtn.classList.toggle('hidden', bonusRemaining <= 0);
      document.getElementById('wheel-spin-ad-dot').classList.toggle('hidden', bonusRemaining <= 0);
      const remainingEl = document.getElementById('wheel-ad-remaining');
      remainingEl.classList.toggle('hidden', bonusRemaining <= 0);
      if (bonusRemaining > 0) remainingEl.textContent = I18N.t('wheel.bonus_remaining', { n: bonusRemaining, cap: 5 });
      updateWheelBadge();
      updateNotifyDots();
    }, 3000); // matches .wheel-disc's 3s CSS transition
  }

  // Main-menu wheel button badge - same on/off pattern as updateDailyStreakBadge().
  function updateWheelBadge() {
    const badge = document.getElementById('wheel-badge');
    if (!badge) return;
    badge.classList.toggle('hidden', !Storage.isWheelFreeSpinAvailable());
    if (!badge.classList.contains('hidden')) badge.textContent = I18N.t('wheel.badge_available');
  }

  // Small red "!" dots on the Wheel/Store entry points (menu + in-game HUD),
  // per direct request: unlike updateWheelBadge() above (which clears as soon
  // as just the free spin is used), these stay lit until EVERY free item
  // behind that button is claimed for the day - the wheel dot needs the free
  // spin used AND all 5 bonus ad-spins watched, the store dot needs all 5
  // free hint-ads watched. Called from every place that can change that
  // state (menu/HUD render, wheel modal build, hint-ad watched) so it never
  // shows stale.
  function updateNotifyDots() {
    // Remote kill switch (js/remoteconfig.js). Hides both entry points into the
    // wheel rather than disabling them - a visibly dead button invites taps and
    // then bug reports. Runs here because updateNotifyDots() is already called
    // from every menu/HUD render, so the switch takes effect on the same beat as
    // everything else about these buttons.
    const wheelEnabled = RemoteConfig.get('feature_daily_wheel_enabled') !== false;
    ['btn-wheel', 'btn-hud-wheel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !wheelEnabled);
    });

    const wheelHasReward = wheelEnabled && (Storage.isWheelFreeSpinAvailable() || Storage.remainingWheelBonusSpins() > 0);
    ['wheel-notify-dot', 'hud-wheel-notify-dot'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !wheelHasReward);
    });
    const storeHasReward = Storage.remainingRewardedAds('hint') > 0;
    ['store-notify-dot', 'hud-store-notify-dot'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('hidden', !storeHasReward);
    });
  }

  let wheelCountdownTimer = null;

  // Local midnight, matching Storage's localDateStr()-based daily reset - not
  // UTC midnight, so this stays correct across timezones.
  function msUntilNextLocalMidnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  function tickWheelCountdown() {
    const el = document.getElementById('wheel-reset-countdown');
    if (!el) return;
    const ms = msUntilNextLocalMidnight();
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const t = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    el.textContent = I18N.t('wheel.reset_in', { t });
  }

  function openWheel() {
    Sound.pauseMusic();
    buildWheelModal();
    document.getElementById('modal-wheel').classList.remove('hidden');
    tickWheelCountdown();
    clearInterval(wheelCountdownTimer);
    wheelCountdownTimer = setInterval(tickWheelCountdown, 1000);
  }

  // Shared by btn-pause's own click and the app-backgrounding hook below -
  // freezes the score/best-time clock (game.js's pause()/resume()) and pauses
  // music, same as tapping Pause manually.
  function openPauseModal() {
    // Storage.get('currentLevel') is the player's last-reached CAMPAIGN level,
    // not the level actually in play - it showed the wrong number when pausing
    // mid-replay of an earlier level, and was never even a number for Daily
    // ('daily-2026-09-03') or REMIX ('remix-110'). Game.getHudPayload().level
    // is the same mode-aware label the in-level HUD pill already shows.
    const hud = Game.getHudPayload();
    document.getElementById('pause-lvl').textContent = hud ? hud.level : Storage.get('currentLevel');
    document.getElementById('modal-pause').classList.remove('hidden');
    Game.pause();
    Sound.pauseMusic();
  }

  // Reported directly (test47.mp4): an incoming phone call or the screen
  // simply locking mid-level didn't pause anything - the level clock kept
  // running and music kept going once the OS gave the WebView focus back,
  // instead of landing on the same pause modal a manual pause tap would.
  // Both cases fire the exact same OS-level background/foreground signal
  // Sound.js already listens to for silencing music (document.visibilitychange
  // / Capacitor's appStateChange) - reuse it here to also open the real pause
  // modal, so a call/lock is indistinguishable from tapping Pause: the player
  // has to explicitly tap "เล่นต่อ" (btn-resume) to get moving again, same as
  // any other pause. Deliberately does nothing on the return-to-foreground
  // half - staying paused until an explicit resume tap is the whole point.
  // adInProgress: set for the duration of any Ads.showRewardedAd()/
  // showInterstitial() call (see watchRewardedAd() and btn-next below) - a
  // real background event (e.g. a phone call) during an ad already gets
  // music/context handling from Sound.js's own listener, and the ad-flow
  // code already decides for itself whether to resume music once the ad
  // resolves. Auto-opening the pause modal on top of that would leave it
  // showing the level BEFORE the ad's own callback proceeds (a reward grant
  // or Game.loadLevel()) hides every modal again without the player ever
  // tapping "เล่นต่อ" - the exact silent-resume this feature exists to
  // prevent, just relocated instead of fixed.
  let adInProgress = false;
  let adWatchdogTimer = null;
  // An ad in flight is the one thing allowed to suppress both the
  // background-pause modal and the music-resume-on-return, so a callback that
  // never arrives - a failed load, a dropped network, an SDK that swallows its
  // own completion - would silently disable both for the rest of the session:
  // from then on a phone call would not pause the level and music would not come
  // back. Found exactly that way, by an automated sweep that tapped a "watch ad"
  // button whose ad never resolved. Same "never bet on a third-party callback
  // settling" reasoning as iap.js's purchase fail-safe timer.
  //
  // Generous enough to outlast any real rewarded ad including its reward screen;
  // firing late is harmless, since by then the ad flow has finished either way.
  const AD_WATCHDOG_MS = 90000;
  function beginAd() {
    adInProgress = true;
    clearTimeout(adWatchdogTimer);
    adWatchdogTimer = setTimeout(() => { adInProgress = false; }, AD_WATCHDOG_MS);
  }
  function endAd() {
    adInProgress = false;
    clearTimeout(adWatchdogTimer);
  }
  let wasBackgroundedForPause = false;
  // Set when backgrounding froze the level clock WITHOUT showing the pause modal
  // (something was already covering the screen). Nothing would ever tap
  // btn-resume in that case, so the foreground handler has to unfreeze it.
  let clockFrozenSilently = false;
  function handleBackgroundForPause() {
    if (wasBackgroundedForPause) return;
    wasBackgroundedForPause = true;
    if (adInProgress) return;
    const inLevel = document.getElementById('screen-game').classList.contains('active');
    // .modal-overlay covers Pause/Fail/Win/Wheel/Store etc.; .tutorial-overlay
    // covers both Tutorial.js's level-1 coach-marks and the skin-unlock one
    // (js/tutorial.js always removes its overlay on dismiss, so this reads
    // as "not currently showing" the same way .hidden does for real modals) -
    // opening the pause modal underneath either would render it invisible
    // (both use a higher z-index) while still freezing the game clock.
    const anyModalOpen = document.querySelector('.modal-overlay:not(.hidden)') || document.querySelector('.tutorial-overlay');
    if (!inLevel) return;
    if (!anyModalOpen) { openPauseModal(); return; }
    // A covering modal only means the pause modal can't be SHOWN - it doesn't
    // mean the level clock should keep running. An incoming call (from the
    // dialer or any app - LINE, Messenger, a game invite) that arrived while
    // Settings or a tutorial coach-mark happened to be open used to leave the
    // clock ticking for the whole call, quietly costing the player their pace
    // stars and best time for something entirely outside the game. Freeze it
    // here and let handleForegroundForPause() unfreeze it on the way back.
    Game.pause();
    clockFrozenSilently = true;
  }
  function handleForegroundForPause() {
    wasBackgroundedForPause = false;

    // Counterpart to the silent freeze above - the pause modal never appeared,
    // so there is no "เล่นต่อ" tap coming to unfreeze the clock.
    if (clockFrozenSilently) {
      clockFrozenSilently = false;
      Game.resume();
    }

    // Sound.js silences music on EVERY backgrounding, but only the pause modal
    // asks the player to tap "เล่นต่อ" to get it back - and handleBackgroundForPause
    // above deliberately skips opening that modal whenever something is already
    // covering the screen. So backgrounding while a tutorial coach-mark, the
    // Settings modal, the fail modal, the leaderboard - anything but Pause - was
    // showing left music paused with nothing anywhere that would ever resume it,
    // and the player finished the level in silence. That is the recurring
    // "switched apps and the music never came back" report: each round of fixes
    // added resumeMusic() to one more button, and the next modal added
    // reintroduced it.
    //
    // Fixed at the source instead: on returning to the foreground, restore music
    // if this context is one where music belongs. Excluded, deliberately:
    //   - the pause modal, which owns the explicit-resume rule (test47.mp4 - a
    //     phone call must behave exactly like tapping Pause);
    //   - the Wheel, which pauses music for its own sound effects;
    //   - an ad in flight, whose own callback decides whether to resume;
    //   - anything outside screen-game (Store/Skins/menu), where music is
    //     supposed to be stopped and showScreen() restores it on the way back.
    // resumeMusic() no-ops when music is already playing, so the per-button
    // calls elsewhere stay harmless.
    const gameActive = document.getElementById('screen-game').classList.contains('active');
    const pauseOpen = !document.getElementById('modal-pause').classList.contains('hidden');
    const wheelOpen = !document.getElementById('modal-wheel').classList.contains('hidden');
    if (gameActive && !pauseOpen && !wheelOpen && !adInProgress) Sound.resumeMusic();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handleBackgroundForPause();
    else handleForegroundForPause();
  });
  if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleForegroundForPause();
      else handleBackgroundForPause();
    });
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.round(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function showWin(levelNum, hints, stars, score, elapsedSec, mode, isCampaignFinale, newlyUnlockedSkin, gemsEarned, gemsBonusType, hintsBonus, comboBest, goldenBonusAwarded) {
    const winModal = document.getElementById('modal-win');
    const skinBtn = document.getElementById('win-new-skin');
    if (skinBtn) {
      if (newlyUnlockedSkin) {
        const name = newlyUnlockedSkin.name[I18N.currentLang()] || newlyUnlockedSkin.name.en;
        skinBtn.textContent = I18N.t('win.new_skin', { name });
        skinBtn.classList.remove('hidden');
        skinBtn.onclick = () => {
          winModal.classList.add('hidden');
          skinsReturnScreen = 'modal-win';
          buildSkinsScreen();
          showScreen('screen-skins');
        };
      } else {
        skinBtn.classList.add('hidden');
        skinBtn.onclick = null;
      }
    }
    // Share-my-score (2026-09-02) - offered on the win screen because that's
    // the one moment the player has something they're actually pleased about.
    // Hidden rather than disabled where nothing could handle a share (desktop
    // browser with no clipboard access), and hidden for the Daily Challenge /
    // REMIX, whose "level number" is an internal index that would mean nothing
    // to whoever receives the message.
    const shareBtn = document.getElementById('btn-share-score');
    if (shareBtn) {
      const shareable = typeof levelNum === 'number' && mode !== 'daily' && mode !== 'remix' && Share.isAvailable();
      shareBtn.classList.toggle('hidden', !shareable);
      shareBtn.onclick = !shareable ? null : async () => {
        shareBtn.disabled = true;
        const result = await Share.shareScore(levelNum, score, stars);
        shareBtn.disabled = false;
        // 'copied' is the desktop fallback - say so, since no share sheet
        // appeared and otherwise the tap would look like it did nothing.
        if (result === 'copied') alert(I18N.t('share.copied'));
        if (result) Analytics.logEvent('score_shared', { level: levelNum, stars });
      };
    }

    winModal.classList.remove('hidden');
    winModal.classList.toggle('campaign-complete', !!isCampaignFinale);
    const titleEl = document.getElementById('win-title');
    if (titleEl) {
      if (isCampaignFinale) titleEl.textContent = I18N.t('win.finale_title');
      else if (mode === 'daily') titleEl.textContent = I18N.t('win.title_daily');
      else if (mode === 'remix') titleEl.textContent = I18N.t('win.title_remix');
      else if (typeof levelNum === 'number') titleEl.textContent = I18N.t('win.title_num', { n: levelNum });
      else titleEl.textContent = I18N.t('win.title');
    }
    const subEl = document.getElementById('win-sub');
    if (subEl) {
      subEl.classList.toggle('hidden', !isCampaignFinale);
      subEl.textContent = isCampaignFinale ? I18N.t('win.finale_sub') : '';
    }
    document.getElementById('ws-hints').textContent = hints;
    const hintsBonusEl = document.getElementById('ws-hints-bonus');
    if (hintsBonusEl) {
      if (hintsBonus > 0) {
        hintsBonusEl.textContent = I18N.t('win.hints_bonus', { n: hintsBonus });
        hintsBonusEl.classList.remove('hidden');
      } else {
        hintsBonusEl.classList.add('hidden');
      }
    }
    const gemsRowEl = document.getElementById('ws-gems-row');
    const gemsValEl = document.getElementById('ws-gems');
    const gemsBonusEl = document.getElementById('ws-gems-bonus');
    if (gemsRowEl && gemsValEl && gemsBonusEl) {
      gemsRowEl.classList.toggle('hidden', !gemsEarned);
      if (gemsEarned) {
        gemsValEl.textContent = '+' + gemsEarned;
        if (gemsBonusType === 'daily' || gemsBonusType === 'milestone') {
          gemsBonusEl.textContent = I18N.t('win.gems_bonus_' + gemsBonusType);
          gemsBonusEl.classList.remove('hidden');
        } else {
          gemsBonusEl.classList.add('hidden');
        }
      }
    }
    const scoreEl = document.getElementById('ws-score');
    if (scoreEl) scoreEl.textContent = score;
    const comboRowEl = document.getElementById('ws-combo-row');
    const comboValEl = document.getElementById('ws-combo');
    // Same "not really a combo below 2" threshold as the live HUD badge above.
    if (comboRowEl && comboValEl) {
      comboRowEl.classList.toggle('hidden', !(comboBest > 1));
      if (comboBest > 1) comboValEl.textContent = 'x' + comboBest;
    }
    const goldenRowEl = document.getElementById('ws-golden-row');
    const goldenValEl = document.getElementById('ws-golden');
    if (goldenRowEl && goldenValEl) {
      goldenRowEl.classList.toggle('hidden', !(goldenBonusAwarded > 0));
      if (goldenBonusAwarded > 0) goldenValEl.textContent = '+' + goldenBonusAwarded;
    }
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
      Leaderboard.fetchTop(5),
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
  // Which grouping mode the Skins screen grid is currently rendered in -
  // toggled by the 2 tabs above the grid (index.html's .skins-view-tabs).
  // Not persisted to Storage - resets to 'unlock' every time the screen is
  // freshly entered, which is fine since it's a view preference, not progress.
  let skinsViewMode = 'unlock'; // 'unlock' | 'style'

  // Style category derived from the existing `material` field (2026-08-20) -
  // no new per-skin data needed, since material already cleanly implies a
  // visual family: 'badge' is the 6 real-art mascot skins, 'holo' is every
  // animated-rainbow skin (the majority of the streak/gems/iap tracks), and
  // everything else (flat/marble/glass/neon/metal) reads as one "special
  // themed" bucket - added per direct request to make the by-price grouping
  // optional rather than the only way to scan the (now 37-skin) roster.
  function skinStyleCategory(skin) {
    if (skin.material === 'badge') return 'animal';
    if (skin.material === 'holo') return 'rainbow';
    return 'special';
  }

  function buildSkinsScreen() {
    const wrap = document.getElementById('skins-grid');
    wrap.innerHTML = '';
    const tabUnlock = document.getElementById('btn-skins-view-unlock');
    const tabStyle = document.getElementById('btn-skins-view-style');
    if (tabUnlock && tabStyle) {
      tabUnlock.classList.toggle('active', skinsViewMode === 'unlock');
      tabStyle.classList.toggle('active', skinsViewMode === 'style');
    }
    // Debug convenience (?unlockskins=1): treat every skin as unlocked for this
    // screen only, without touching real Storage.highestUnlocked progress, so
    // skins beyond level 1 can be tried without grinding the campaign first.
    const debugUnlockAll = new URLSearchParams(location.search).get('unlockskins') === '1';
    // Debug convenience (?debugstreak=N): view-only override for dailyStreak fed
    // into the unlock check below, so a streak-gated skin's tile states can be
    // tried without actually playing N consecutive Daily Challenge days - never
    // touches real Storage, same spirit as ?unlockskins=1 above.
    const debugStreakParam = parseInt(new URLSearchParams(location.search).get('debugstreak'));
    const unlocked = debugUnlockAll ? 300 : (Storage.get('highestUnlocked') || 1);
    const liveDailyStreak = debugStreakParam >= 0 ? debugStreakParam : (Storage.get('dailyStreak') || 0);
    // Real permanent ownership (see storage.js's ownedStreakSkins) plus, under
    // ?debugstreak=N, a view-only simulation of what N would unlock - never touches
    // real Storage, same spirit as ?unlockskins=1's debugUnlockAll.
    const streakOwnedSkins = new Set(Storage.get('ownedStreakSkins') || []);
    if (debugStreakParam >= 0) {
      Skins.ALL.filter(s => s.unlock.type === 'streak' && s.unlock.value <= debugStreakParam)
        .forEach(s => streakOwnedSkins.add(s.id));
    }
    const ctx = {
      debugUnlockAll,
      highestUnlocked: unlocked,
      dailyStreak: liveDailyStreak,
      streakOwnedSkins,
      gemsOwnedSkins: new Set(Storage.get('ownedGemSkins') || []),
      iapOwnedSkins: new Set(Storage.get('ownedIapSkins') || [])
    };
    const selected = Storage.get('selectedSkin');
    const dark = Storage.get('theme') === 'dark';
    // Grouped by unlock track (level/streak/gems/iap) in 'unlock' mode - the
    // grid reads as 4 clearly separated sections instead of one long flat
    // list - requested directly once the roster grew past ~30 skins across
    // the 4 tracks. Skins.ALL is already contiguous per track in file
    // order, so a simple "insert a header when the key changes" pass over
    // it preserves that order rather than needing a real sort. 'style' mode
    // groups by skinStyleCategory() instead - Skins.ALL is NOT already
    // contiguous by material, so that mode builds an explicitly reordered
    // list first (animal/rainbow/special, in that order) before the same
    // header-on-key-change pass runs over it.
    const orderedSkins = skinsViewMode === 'style'
      ? ['animal', 'rainbow', 'special'].flatMap(cat => Skins.ALL.filter(s => skinStyleCategory(s) === cat))
      : Skins.ALL;
    const groupKeyFor = skin => skinsViewMode === 'style' ? skinStyleCategory(skin) : skin.unlock.type;

    let lastGroupKey = null;
    orderedSkins.forEach(skin => {
      const groupKey = groupKeyFor(skin);
      if (groupKey !== lastGroupKey) {
        lastGroupKey = groupKey;
        const header = document.createElement('div');
        header.className = 'skin-group-header';
        header.textContent = I18N.t('skins.group.' + groupKey);
        wrap.appendChild(header);
      }
      const isUnlocked = Skins.isUnlockedFor(skin, ctx);
      const btn = document.createElement('button');
      btn.className = 'skin-btn' + (isUnlocked ? '' : ' locked') + (isUnlocked && selected === skin.id ? ' selected' : '');
      btn.dataset.skinId = skin.id;
      // Visible in the grid regardless of lock state, so a premium skin
      // stands out from the level track at a glance, before the player even
      // opens the preview modal.
      if (skin.unlock.type !== 'level') {
        const badge = document.createElement('span');
        badge.className = 'skin-btn-premium-badge';
        badge.textContent = '✨';
        btn.appendChild(badge);
      }
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
        lockEl.textContent = skinLockLabel(skin, ctx);
        btn.appendChild(lockEl);
        // Real-money alt-unlock price, shown directly on the grid tile
        // (reported directly: had to tap into the preview modal just to see
        // if a skin even had a money option, or what it cost) - every
        // gems/streak-track skin's altUnlock, and every level/gems-track
        // skin's altUnlock2, that's type:'iap' gets a second small price
        // line here so the whole decision is visible without opening
        // anything. Web/no-native still omits it (same "no fake IAP UI on
        // web" rule as everywhere else this price is shown).
        const iapAlt = (skin.altUnlock && skin.altUnlock.type === 'iap') ? skin.altUnlock
          : (skin.altUnlock2 && skin.altUnlock2.type === 'iap') ? skin.altUnlock2 : null;
        if (iapAlt && Iap.isNative()) {
          const priceLabel = Iap.skinPriceLabel(skin.id);
          const altPriceEl = document.createElement('span');
          altPriceEl.className = 'skin-btn-alt-price';
          altPriceEl.textContent = priceLabel || '···';
          btn.appendChild(altPriceEl);
        }
        // Locked tiles of every type open the preview modal on tap (used to be
        // inert - no handler at all) - the modal is where the actual buy/
        // unlock-condition detail lives; the grid tile itself just shows the
        // condensed label above so scanning the grid still tells you at a
        // glance what each skin needs, per the user's request.
        btn.addEventListener('click', () => openSkinPreview(skin, ctx));
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
      // Scoped to type:'level' skins only - that's the only unlock method with
      // an inherent "newest" ordering by campaign progress. Streak/gems/iap
      // unlocks get their own immediate feedback (win-banner for streak,
      // purchase-success state in the preview modal for gems/iap) instead of
      // being retrofit into this same "spotlight the newest" mechanism.
      const unlockedNonDefault = Skins.ALL.filter(s => s.id !== 'default' && s.unlock.type === 'level' && unlocked >= s.unlock.value);
      const newest = unlockedNonDefault[unlockedNonDefault.length - 1];
      if (newest && newest.id !== selected) {
        const target = wrap.querySelector('[data-skin-id="' + newest.id + '"]');
        if (target) setTimeout(() => showSkinTutorial(target), 50);
      }
    }
  }

  // Condensed unlock-condition text shown directly on a locked grid tile -
  // always visible without opening the preview modal, so scanning the grid
  // tells you at a glance what each skin needs.
  function skinLockLabel(skin, ctx) {
    switch (skin.unlock.type) {
      case 'level':
        return '🔒 ' + I18N.t('skins.locked', { n: skin.unlock.value });
      case 'streak':
        return '🔥 ' + I18N.t('skins.locked_streak', { cur: Math.min(ctx.dailyStreak, skin.unlock.value), n: skin.unlock.value });
      case 'gems':
        return I18N.t('skins.buy_gems', { price: skin.unlock.value });
      case 'iap': {
        const price = Iap.isNative() ? Iap.skinPriceLabel(skin.id) : null;
        return I18N.t('skins.buy_iap', { price: price || '···' });
      }
      default:
        return '';
    }
  }

  // Preview modal - opened by tapping any locked skin tile (see buildSkinsScreen
  // above). Draws a live animated preview via Scene3D.renderSkinPreviewFrame()
  // (reusing the exact same material/arrow/particle drawing the real game
  // uses, see [[arrowflow_render_perf]]-era note in scene.js) and hosts the
  // actual buy/unlock-condition action for gems/iap skins - the grid tile
  // itself is now purely informational (skinLockLabel above), all purchase
  // interaction happens here.
  let skinPreviewRAF = null;
  function closeSkinPreview() {
    if (skinPreviewRAF) cancelAnimationFrame(skinPreviewRAF);
    skinPreviewRAF = null;
    document.getElementById('modal-skin-preview').classList.add('hidden');
  }

  function openSkinPreview(skin, ctx) {
    const modal = document.getElementById('modal-skin-preview');
    document.getElementById('skin-preview-name').textContent = skin.name[I18N.currentLang()] || skin.name.en;

    const conditionEl = document.getElementById('skin-preview-condition');
    const actionWrap = document.getElementById('skin-preview-action');
    actionWrap.innerHTML = '';

    if (skin.unlock.type === 'level') {
      conditionEl.textContent = '🔒 ' + I18N.t('skins.locked', { n: skin.unlock.value });
    } else if (skin.unlock.type === 'streak') {
      conditionEl.textContent = '🔥 ' + I18N.t('skins.locked_streak', { cur: Math.min(ctx.dailyStreak, skin.unlock.value), n: skin.unlock.value });
    } else if (skin.unlock.type === 'gems') {
      conditionEl.textContent = I18N.t('skins.buy_gems', { price: skin.unlock.value });
      const buyBtn = document.createElement('button');
      buyBtn.className = 'btn btn-primary';
      buyBtn.textContent = I18N.t('skins.buy_gems', { price: skin.unlock.value });
      buyBtn.disabled = Storage.getGemsTotal() < skin.unlock.value;
      buyBtn.addEventListener('click', () => {
        if (Storage.spendGems(skin.unlock.value, skin.id)) {
          closeSkinPreview();
          buildSkinsScreen();
          refreshGemsDisplay();
        }
      });
      actionWrap.appendChild(buyBtn);
    } else if (skin.unlock.type === 'iap') {
      if (!Iap.isNative()) {
        conditionEl.textContent = I18N.t('skins.iap_web_unavailable');
      } else {
        const priceLabel = Iap.skinPriceLabel(skin.id);
        conditionEl.textContent = priceLabel ? I18N.t('skins.buy_iap', { price: priceLabel }) : '···';
        const buyBtn = document.createElement('button');
        buyBtn.className = 'btn btn-primary';
        buyBtn.textContent = priceLabel ? I18N.t('skins.buy_iap', { price: priceLabel }) : '···';
        buyBtn.addEventListener('click', () => {
          buyBtn.disabled = true;
          Iap.purchaseSkin(skin.id, () => {
            Storage.grantIapSkin(skin.id);
            closeSkinPreview();
            buildSkinsScreen();
            maybeShowIapRestoreHint();
          }, () => {
            // Was silent before (button just re-enabled with no feedback at
            // all) - reported as "bought it, nothing happened, looks like a
            // bug" since a real Play Billing failure (e.g. re-attempting a
            // non-consumable the account already owns from earlier testing)
            // gave no indication anything went wrong. Matches the alert the
            // bundle purchase path already shows on failure.
            buyBtn.disabled = false;
            alert(I18N.t('iap.purchase_failed'));
          });
        });
        actionWrap.appendChild(buyBtn);
      }
    }

    // Appends a real-money "skip with real money" button for skin.id - shared
    // by both altUnlock (streak-track, money-only) and altUnlock2 (level-
    // track, money ALONGSIDE the gems button below) since both key off the
    // exact same SKINS_IAP/Storage.grantIapSkin(skin.id) plumbing regardless
    // of which field named the bypass.
    function appendIapAltButton() {
      // On web (no native purchase) this bypass is silently omitted rather
      // than showing a second "unavailable" line - the primary condition
      // above (streak progress / level) already explains the only route there.
      const priceLabel = Iap.skinPriceLabel(skin.id);
      const altBtn = document.createElement('button');
      altBtn.className = 'btn btn-outline';
      altBtn.textContent = priceLabel ? I18N.t('skins.buy_alt_iap', { price: priceLabel }) : '···';
      altBtn.addEventListener('click', () => {
        altBtn.disabled = true;
        Iap.purchaseSkin(skin.id, () => {
          Storage.grantIapSkin(skin.id);
          closeSkinPreview();
          buildSkinsScreen();
          maybeShowIapRestoreHint();
        }, () => {
          altBtn.disabled = false;
          alert(I18N.t('iap.purchase_failed'));
        });
      });
      actionWrap.appendChild(altBtn);
    }

    // altUnlock (2026-08-20): a secondary bypass button, shown alongside
    // whichever primary condition/button rendered above - never replaces it.
    // Level-track skins carry a gems altUnlock; streak-track skins carry a
    // money-only (iap) altUnlock instead, see js/skins.js.
    if (skin.altUnlock) {
      if (skin.altUnlock.type === 'gems') {
        const price = skin.altUnlock.value;
        const altBtn = document.createElement('button');
        altBtn.className = 'btn btn-outline';
        altBtn.textContent = I18N.t('skins.buy_alt_gems', { price });
        altBtn.disabled = Storage.getGemsTotal() < price;
        altBtn.addEventListener('click', () => {
          if (Storage.spendGems(price, skin.id)) {
            closeSkinPreview();
            buildSkinsScreen();
            refreshGemsDisplay();
          }
        });
        actionWrap.appendChild(altBtn);
      } else if (skin.altUnlock.type === 'iap' && Iap.isNative()) {
        appendIapAltButton();
      }
    }
    // altUnlock2 (2026-08-21): level-track skins ALSO get a real-money bypass
    // on top of the gems one above (priced cheaper than gems at every tier,
    // per direct request, so money reads as the convenient shortcut).
    if (skin.altUnlock2 && skin.altUnlock2.type === 'iap' && Iap.isNative()) {
      appendIapAltButton();
    }

    modal.classList.remove('hidden');

    const canvas = document.getElementById('skin-preview-canvas');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const pctx = canvas.getContext('2d');
    pctx.scale(dpr, dpr);
    const state = { particles: [] };
    const start = performance.now();
    if (skinPreviewRAF) cancelAnimationFrame(skinPreviewRAF);
    function frame() {
      Scene3D.renderSkinPreviewFrame(pctx, skin, w, h, performance.now() - start, state);
      skinPreviewRAF = requestAnimationFrame(frame);
    }
    frame();
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
    // Reported directly (screenshot: the win-screen's "ปลดล็อคสกินใหม่" button
    // leading into a Skins screen that "looked grayed out, nothing tappable,
    // had to go back and re-enter"): .tutorial-overlay is shared with
    // Tutorial.js's level-1 step tutorial, which deliberately keeps
    // pointer-events:none so real gameplay taps pass through it - but this
    // skin coach-mark has no such requirement, and depending on that same
    // passthrough working perfectly on every WebView to reach the one
    // highlighted tile underneath is fragile (a miscalculated target rect
    // or an inconsistent WebView pointer-events quirk leaves the whole
    // darkened screen looking stuck with no way out). Make this specific
    // overlay instance capture taps itself and dismiss on ANY of them,
    // instead of relying on passthrough to the exact target underneath.
    overlay.style.pointerEvents = 'auto';
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
    // Dismiss on a tap anywhere on the overlay (backdrop, spotlight, or the
    // bubble/button all bubble up here) - selecting the actual skin now
    // takes a second tap after dismissing, a fine trade for never leaving
    // the player stuck with no visible way to continue.
    overlay.addEventListener('click', dismissSkinTutorial);
    skinTutorialEls = { overlay };
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
    // Opt-in rewarded ads stay available even after buying remove-ads - see
    // the matching comment in buildStoreScreen()'s hint-ad button.
    const remaining = Storage.remainingRewardedAds('continue');
    if (remaining <= 0) {
      btn.classList.add('hidden');
      remainingEl.classList.add('hidden');
    } else {
      btn.classList.remove('hidden');
      remainingEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = I18N.t('fail.continue_ad');
      remainingEl.textContent = I18N.t('store.ads_remaining', { n: remaining, cap: Storage.rewardedAdCap('continue') });
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
  // Non-blocking confirmation toast - see the .app-toast CSS comment for why
  // this exists instead of alert() for anything reachable from an ad SDK
  // dismiss callback.
  let toastHideTimer = null;
  function showToast(message) {
    let el = document.getElementById('app-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'app-toast';
      el.className = 'app-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastHideTimer);
    toastHideTimer = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // One-time notice the first time a player reaches each REMIX difficulty
  // tier (js/remix.js's remixLap escalation) - the standing rule for any
  // gameplay-mechanic change is that the player must be told about it before
  // being surprised by it, not just left to notice the HUD has fewer hearts
  // than last time. Gated by Storage.remixHighestWarnedLap so re-entering an
  // already-seen tier stays silent (same "seen once" pattern as
  // googleLinkRewardGiven/iapRestoreHintShown).
  function announceRemixTierIfNew() {
    const hud = Game.getHudPayload();
    if (!hud || hud.mode !== 'remix') return;
    const lap = hud.remixLap || 0;
    if (lap <= Storage.get('remixHighestWarnedLap')) return;
    Storage.set('remixHighestWarnedLap', lap);
    const key = lap === 1 ? 'remix.tier1_notice' : lap === 2 ? 'remix.tier2_notice' : 'remix.tier3_notice';
    showToast(I18N.t(key));
  }

  function watchRewardedAd(btn, onGranted, onFailed) {
    btn.disabled = true;
    // Swap text on a child [data-i18n] label when one exists (btn-wheel-spin-ad/
    // btn-store-hint-ad now carry a sibling notify-dot span) rather than the
    // button's own textContent - textContent wipes ALL children, silently
    // destroying that dot permanently (confirmed via test32.mp4: the dot never
    // came back after the first ad watch, and later code that looked it up by
    // id threw on the now-missing element, aborting whatever ran after it -
    // e.g. the wheel's remaining-spins counter never updating). Falls back to
    // the button itself for plain buttons with no such child (btn-fail-continue-ad).
    const labelEl = btn.querySelector('[data-i18n]') || btn;
    const original = labelEl.textContent;
    labelEl.textContent = I18N.t('store.ad_loading');
    // Reported directly (test43.mp4: watching the out-of-hearts continue-ad):
    // background music kept playing under the ad's own audio the whole time.
    // Neither Sound.pauseMusic() nor any app-lifecycle event fires here on
    // their own - some ad SDKs render as an overlay within the same Activity
    // rather than a real task switch, so nothing tells Sound to pause. Pause
    // explicitly and only resume after if music was actually playing before -
    // e.g. this same function also drives btn-wheel-spin-ad, where openWheel()
    // already paused music for the whole modal and it must stay paused until
    // the modal itself closes, not resume early just because the ad ended.
    const wasPlaying = Sound.isMusicPlaying();
    Sound.pauseMusic();
    beginAd();
    Ads.showRewardedAd(
      () => { endAd(); labelEl.textContent = original; if (wasPlaying) Sound.resumeMusic(); onGranted(); },
      () => {
        endAd();
        labelEl.textContent = original;
        btn.disabled = false;
        if (wasPlaying) Sound.resumeMusic();
        if (onFailed) onFailed();
      }
    );
  }

  function hideAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    ['confetti-area', 'wheel-confetti-area'].forEach(id => {
      const area = document.getElementById(id);
      if (area) area.innerHTML = ''; // stop any still-running burst
    });
  }

  // Android hardware/gesture back button - Capacitor's own default handling
  // (no history to go back to in this single-page app) just exits the whole
  // app immediately, from ANY screen or modal, which is jarring compared to
  // an in-app back button. This mirrors what tapping the visible back/close
  // control on the currently-open thing would do: any open modal closes via
  // its own data-back-close target (declared per-modal in index.html, since
  // "close" means something different per modal - e.g. pause resumes play,
  // fail returns to menu, reset-confirm cancels rather than confirming);
  // otherwise an overlay screen (Store/Skins/Ranking/Levels) returns to
  // whatever its own back button targets; mid-level it opens the pause modal
  // instead of exiting; only at the bare main menu does back actually exit.
  function handleHardwareBack() {
    const openModal = document.querySelector('.modal-overlay:not(.hidden)');
    if (openModal) {
      const closeBtnId = openModal.dataset.backClose;
      if (closeBtnId) document.getElementById(closeBtnId).click();
      return;
    }

    const activeScreen = document.querySelector('.ovr-screen.active');
    if (!activeScreen) return;
    // Splash is '.ovr-screen active' from initial page load, before any
    // screen-switch logic has run - not in screenBackButtons and not
    // 'screen-game' below, so without this it fell all the way through to
    // the exitApp() branch, closing the app within the first second of
    // opening it (confirmed via test19.mp4). Just a no-op here; the splash
    // finishes on its own in well under a second regardless.
    if (activeScreen.id === 'screen-splash') return;

    const screenBackButtons = {
      'screen-levels': 'btn-back-lvl',
      'screen-skins': 'btn-back-skins',
      'screen-ranking': 'btn-back-ranking',
      'screen-store': 'btn-back-store'
    };
    if (screenBackButtons[activeScreen.id]) {
      document.getElementById(screenBackButtons[activeScreen.id]).click();
      return;
    }
    if (activeScreen.id === 'screen-game') {
      // Clicking the real pause button (not just un-hiding the modal directly)
      // so this takes the same Game.pause()/Sound.pauseMusic() path as tapping
      // it normally would.
      document.getElementById('btn-pause').click();
      return;
    }
    // Bare main menu, nothing open - ask for confirmation before actually
    // exiting the app (reported directly: a single stray back-press used to
    // close the whole app immediately, no way to cancel a misfire).
    document.getElementById('modal-exit-confirm').classList.remove('hidden');
  }

  function wireEvents() {
    const toggleTheme = () => {
      applyTheme(Storage.get('theme') === 'dark' ? 'light' : 'dark');
      // Redraw the cube's face textures with the new theme's colors - safe to call even
      // mid-level, since it doesn't touch game state (progress/hearts/moves survive).
      Game.redrawTheme();
    };
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    // The in-game theme button was removed from the HUD; Settings owns it now.
    document.getElementById('toggle-darkmode').addEventListener('click', () => {
      toggleTheme();
      syncSettingsUI();
    });

    document.getElementById('btn-play').addEventListener('click', () => {
      // Storage.remixHighest was written on every REMIX win, synced to the cloud,
      // and then read by nothing at all: a player who closed the app mid-REMIX
      // came back to Play sending them at level 300 (currentLevel is capped
      // there), and finishing it dropped them back at REMIX 1 with the lap
      // escalation reset to lap 0. Resume where they actually were instead.
      // remixHighest counts COMPLETED remix levels, so it is already the index
      // of the next one. Non-zero only after the campaign is finished, which is
      // the only way into REMIX, so it needs no separate campaign-complete test.
      const remixNext = Storage.get('remixHighest') || 0;
      if (remixNext > 0) {
        Game.loadRemixLevel(remixNext);
        announceRemixTierIfNew();
      } else {
        Game.loadLevel(Storage.get('currentLevel'));
      }
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
      skinsReturnScreen = 'screen-menu';
      buildSkinsScreen();
      showScreen('screen-skins');
    });
    document.getElementById('btn-settings-skins').addEventListener('click', () => {
      // Reachable both from the main menu's settings and from in-game pause ->
      // settings, so remember which screen was underneath to return to it
      // (rather than always bouncing back to the main menu mid-game).
      skinsReturnScreen = document.getElementById('screen-game').classList.contains('active') ? 'screen-game' : 'screen-menu';
      document.getElementById('modal-settings').classList.add('hidden');
      document.getElementById('modal-pause').classList.add('hidden');
      buildSkinsScreen();
      showScreen('screen-skins');
    });
    document.getElementById('btn-back-skins').addEventListener('click', () => {
      dismissSkinTutorial();
      // 'modal-win' isn't a real screen id - it means Skins was opened from the
      // win modal's new-skin button (see showWin), which was hidden (not replaced)
      // to get there. Without re-showing it here, a back tap leaves the player on
      // a bare screen-game with the level already solved and nothing tappable.
      if (skinsReturnScreen === 'modal-win') {
        showScreen('screen-game');
        document.getElementById('modal-win').classList.remove('hidden');
      } else {
        showScreen(skinsReturnScreen);
      }
    });
    document.getElementById('skin-preview-close').addEventListener('click', closeSkinPreview);

    // Skins-screen grouping tabs (2026-08-20) - just flips skinsViewMode and
    // rebuilds; buildSkinsScreen() itself syncs the tabs' .active class.
    document.getElementById('btn-skins-view-unlock').addEventListener('click', () => {
      skinsViewMode = 'unlock';
      buildSkinsScreen();
    });
    document.getElementById('btn-skins-view-style').addEventListener('click', () => {
      skinsViewMode = 'style';
      buildSkinsScreen();
    });

    // Menu promo button -> Store's bundles section (2026-08-20). Hidden
    // outright when there's nothing to sell (web, or every skin already
    // owned) - see updateMenu()'s refreshBundlePromoButton() call.
    document.getElementById('btn-bundle-promo').addEventListener('click', () => {
      openStoreForBundles('screen-menu');
    });

    // js/appUpdate.js: a flexible in-app update finished downloading in the
    // background - completeFlexibleUpdate() restarts the app into it.
    document.getElementById('update-ready-banner').addEventListener('click', () => {
      AppUpdate.completeUpdate();
    });

    document.getElementById('btn-pause').addEventListener('click', openPauseModal);
    document.getElementById('btn-resume').addEventListener('click', () => {
      document.getElementById('modal-pause').classList.add('hidden');
      Game.resume();
      Sound.resumeMusic();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      document.getElementById('modal-pause').classList.add('hidden');
      Game.restart();
      // Restarting directly from pause (without tapping Resume first) skips
      // the btn-resume handler's Sound.resumeMusic() call - music stays
      // paused from btn-pause's pauseMusic() forever otherwise.
      Sound.resumeMusic();
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      document.getElementById('modal-pause').classList.add('hidden');
      Game.resume();
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

    document.getElementById('btn-privacy-options').addEventListener('click', () => {
      Ads.showPrivacyOptions();
    });

    document.getElementById('btn-open-reset').addEventListener('click', () => {
      document.getElementById('modal-settings').classList.add('hidden');
      document.getElementById('modal-reset-confirm').classList.remove('hidden');
    });
    document.getElementById('btn-reset-cancel').addEventListener('click', () => {
      document.getElementById('modal-reset-confirm').classList.add('hidden');
    });
    document.getElementById('btn-reset-confirm').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = I18N.t('reset.working');
      Analytics.logEvent('progress_reset', {});
      if (CloudSave.isGoogleLinked()) {
        // Google-linked identity IS "the account" now - keep it (don't sign out
        // into a fresh anonymous uid like the branch below). Storage.resetAll()
        // runs first so pushNow() uploads the ALREADY-reset (purchases-preserved)
        // state; otherwise the next checkForRestore() (next launch, or another
        // device signed into the same account) would silently pull the pre-reset
        // progress right back down, defeating the whole point of resetting.
        Storage.resetAll();
        await CloudSave.pushNow();
      } else {
        // Sign out of the current anonymous Firebase session FIRST (so a fresh uid
        // gets minted on next load - see Leaderboard.resetIdentity()), then clear
        // local save data.
        await Leaderboard.resetIdentity();
        Storage.resetAll();
      }
      // Hard-reload so every module (Game/UI/Tutorial/Leaderboard/CloudSave)
      // re-initializes clean rather than trying to patch live state.
      location.reload();
    });

    document.getElementById('btn-open-delete-account').addEventListener('click', () => {
      document.getElementById('modal-settings').classList.add('hidden');
      document.getElementById('modal-delete-account').classList.remove('hidden');
    });
    document.getElementById('btn-delete-account-cancel').addEventListener('click', () => {
      document.getElementById('modal-delete-account').classList.add('hidden');
    });
    document.getElementById('btn-delete-account-confirm').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = I18N.t('delete_account.working');
      const { ok, reason } = await CloudSave.deleteAccount();
      if (!ok) {
        btn.disabled = false;
        btn.textContent = I18N.t('delete_account.confirm');
        document.getElementById('modal-delete-account').classList.add('hidden');
        // stale_login is the one failure the player can actually act on, and by
        // then the cloud data IS already deleted - say so plainly rather than
        // implying nothing happened.
        alert(I18N.t(reason === 'stale_login' ? 'delete_account.stale_login' : 'delete_account.failed'));
        return;
      }
      Analytics.logEvent('account_deleted', {});
      // Only wipe the device once the account is really gone. resetAll() keeps
      // purchases, which is correct: those belong to the player's Google Play
      // account, not to the account just deleted.
      Storage.resetAll();
      alert(I18N.t('delete_account.done'));
      location.reload();
    });

    document.getElementById('btn-google-signin').addEventListener('click', async (e) => {
      if (CloudSave.isGoogleLinked()) {
        await CloudSave.signOutGoogle();
        syncGoogleAccountUI();
        return;
      }
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = '...';
      const { ok, conflict } = await CloudSave.signInWithGoogle();
      btn.disabled = false;
      syncGoogleAccountUI();
      if (!ok) {
        btn.textContent = original;
        showToast(I18N.t('cloudsave.signin_failed'));
        return;
      }
      Analytics.logEvent('google_account_linked', {});
      if (conflict) {
        document.getElementById('modal-settings').classList.add('hidden');
        openCloudSaveConflict(conflict);
      } else if (Storage.get('googleLinkRewardGiven')) {
        showToast(I18N.t('cloudsave.link_reward'));
      }
    });
    document.getElementById('btn-cloudsave-restore').addEventListener('click', () => {
      document.getElementById('modal-cloudsave-conflict').classList.add('hidden');
      if (pendingCloudSnapshot) CloudSave.applyCloudSnapshot(pendingCloudSnapshot);
      pendingCloudSnapshot = null;
    });
    document.getElementById('btn-cloudsave-keep-local').addEventListener('click', () => {
      document.getElementById('modal-cloudsave-conflict').classList.add('hidden');
      pendingCloudSnapshot = null;
      CloudSave.pushNow();
    });

    document.getElementById('btn-exit-cancel').addEventListener('click', () => {
      document.getElementById('modal-exit-confirm').classList.add('hidden');
    });
    document.getElementById('btn-exit-confirm').addEventListener('click', () => {
      if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
        Capacitor.Plugins.App.exitApp();
      }
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
        document.getElementById('daily-tip-text').textContent = dailyTipText();
        document.getElementById('modal-daily-tip').classList.remove('hidden');
        return;
      }

      if (!Storage.isAdsRemoved() && Storage.shouldShowInterstitial()) {
        // Same music-under-the-ad bug as watchRewardedAd() above, for the
        // random post-level interstitial - pause before showing, resume only
        // if it was actually playing (it always should be here, since this
        // only runs right after a win on screen-game, but same guard for
        // consistency/safety).
        const wasPlaying = Sound.isMusicPlaying();
        Sound.pauseMusic();
        beginAd();
        await new Promise(resolve => Ads.showInterstitial(resolve));
        endAd();
        if (wasPlaying) Sound.resumeMusic();
        Storage.recordInterstitialShown();
      }

      if (mode === 'remix') {
        Game.loadRemixLevel(Game.getRemixIndex() + 1);
        announceRemixTierIfNew();
        Sound.resumeMusic();
      } else if (mode === 'daily') {
        // Only one puzzle per day - "next" just returns to the menu.
        updateMenu();
        showScreen('screen-menu');
      } else {
        const cur = Game.getLevelNum();
        if (cur >= TOTAL_LEVELS) { Game.loadRemixLevel(0); announceRemixTierIfNew(); } // campaign just finished -> REMIX
        else Game.loadLevel(cur + 1);
        // Game.loadLevel()/loadRemixLevel() -> Sound.setLevelContext() only
        // crossfades if music is ALREADY playing (see sound.js) - it never
        // starts/resumes music on its own. If the win modal was open when the
        // app got backgrounded (screen-game stays "active" but a modal is
        // open, so the app-backgrounding pause-modal hook skips it - see
        // handleBackgroundForPause's anyModalOpen check), Sound.js's own
        // independent background listener still paused the music underneath,
        // and nothing here used to resume it - advancing to the next level
        // left it silent until the player toggled the music setting off/on.
        // resumeMusic() itself no-ops if music is already playing, so this is
        // safe to call unconditionally on every advance.
        Sound.resumeMusic();
      }
    });

    document.getElementById('btn-replay').addEventListener('click', () => {
      hideAllModals();
      Game.restart();
      Sound.resumeMusic();
    });

    document.getElementById('btn-daily-tip-go').addEventListener('click', () => {
      hideAllModals();
      Game.loadDailyLevel();
      showScreen('screen-game');
    });

    document.getElementById('btn-daily-tip-later').addEventListener('click', () => {
      hideAllModals();
      Game.loadLevel(4);
      Sound.resumeMusic(); // same win-modal-backgrounded gap as btn-next above
    });

    document.getElementById('btn-daily').addEventListener('click', () => {
      Game.loadDailyLevel();
      showScreen('screen-game');
    });

    document.getElementById('btn-wheel').addEventListener('click', () => openWheel());
    document.getElementById('btn-hud-wheel').addEventListener('click', () => openWheel());
    document.getElementById('btn-wheel-spin-free').addEventListener('click', () => {
      if (!Storage.isWheelFreeSpinAvailable()) return;
      spinWheel('free');
    });
    document.getElementById('btn-wheel-spin-ad').addEventListener('click', (e) => {
      watchRewardedAd(e.currentTarget, () => {
        if (!Storage.useWheelBonusSpin()) { buildWheelModal(); return; }
        Analytics.logEvent('wheel_bonus_ad_used', {});
        spinWheel('bonus');
      }, () => alert(I18N.t('store.ad_failed')));
    });
    document.getElementById('btn-wheel-close').addEventListener('click', () => {
      Sound.resumeMusic();
      clearInterval(wheelCountdownTimer);
      document.getElementById('modal-wheel').classList.add('hidden');
      updateMenu();
    });

    document.getElementById('btn-hint').addEventListener('click', () => {
      // REMIX turns hints off entirely at its hardest tier (js/remix.js) -
      // Game.useHint() would just silently no-op there too, same problem as
      // the out-of-hints case below, so it needs its own explicit message.
      if (!Game.isHintAllowed()) {
        showToast(I18N.t('remix.hints_disabled'));
        return;
      }
      // Out of hints -> Game.useHint() would just silently no-op, leaving the
      // player with no idea why nothing happened. Send them straight to the
      // Store instead, same shortcut pattern as btn-hud-store.
      if (Storage.getHintsTotal() <= 0) {
        storeReturnScreen = 'screen-game';
        buildStoreScreen();
        showScreen('screen-store');
        return;
      }
      Game.useHint();
    });
    document.getElementById('btn-undo').addEventListener('click', () => Game.undo());

    document.getElementById('toggle-music').addEventListener('click', () => {
      applyMusic(Storage.get('music') === false);
      syncSettingsUI();
    });

    document.getElementById('toggle-sfx').addEventListener('click', () => {
      applySound(Storage.get('sound') === false);
      syncSettingsUI();
    });

    document.getElementById('toggle-colorblind').addEventListener('click', () => {
      applyColorblindMode(Storage.get('colorblindMode') !== true);
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
      // Game.restart() -> Sound.setLevelContext() only crossfades if music is
      // ALREADY playing (see sound.js) - it never starts/resumes music on its
      // own. If music had gone silent earlier this session (e.g. a rewarded-ad
      // interruption that never recovered), restarting from the fail modal
      // left it silent forever since this path never called resumeMusic().
      Sound.resumeMusic();
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
        Sound.resumeMusic(); // same win-modal-backgrounded gap as btn-next above
        showToast(I18N.t('fail.continue_ad_success'));
      }, () => alert(I18N.t('store.ad_failed')));
    });

    document.getElementById('btn-fail-remove-ads').addEventListener('click', () => {
      document.getElementById('modal-fail').classList.add('hidden');
      openStoreForRemoveAds('modal-fail');
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
    document.getElementById('btn-hud-skins').addEventListener('click', () => {
      skinsReturnScreen = 'screen-game';
      buildSkinsScreen();
      showScreen('screen-skins');
    });
    document.getElementById('btn-back-store').addEventListener('click', () => {
      // Buying/ad-earning hints in-level doesn't otherwise touch the HUD until the next
      // updateHUD() call (e.g. on hint use) - refresh it immediately so the count shown
      // in the HUD matches what the store just showed.
      if (storeReturnScreen === 'screen-game' || storeReturnScreen === 'modal-fail') {
        const hudHints = document.getElementById('hud-hints');
        if (hudHints) hudHints.textContent = Storage.getHintsTotal();
      }
      // 'modal-fail' isn't a real screen id - it means the store was opened from the
      // no-hearts fail modal (see btn-fail-remove-ads), which was hidden (not replaced)
      // to get there. Without re-showing it here, a no-purchase back leaves the player
      // on a bare screen-game with hearts still at 0 and nothing left tappable.
      if (storeReturnScreen === 'modal-fail') {
        showScreen('screen-game');
        showFail();
      } else {
        showScreen(storeReturnScreen);
      }
    });

    document.getElementById('btn-store-hint-ad').addEventListener('click', (e) => {
      watchRewardedAd(e.currentTarget, () => {
        if (!Storage.useRewardedAd('hint')) { buildStoreScreen(); return; }
        Analytics.logEvent('hint_ad_used', {});
        Storage.addHints(1);
        buildStoreScreen();
        showToast(I18N.t('store.hint_ad_success'));
      }, () => alert(I18N.t('store.ad_failed')));
    });

    // Hint packs - real Google Play Billing purchase (js/iap.js). data-hints
    // doubles as the pack key ('10'/'30'/'100') since HINT_PACKS in iap.js is
    // keyed by the same hint count. Falls back to the coming-soon alert on
    // web/test builds where there's no purchase SDK at all (see iap.js).
    document.querySelectorAll('.store-pack-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const packKey = btn.dataset.hints;
        if (!Iap.isNative()) {
          Analytics.logEvent('pack_purchase_clicked', { hints: packKey || null });
          alert(I18N.t('store.coming_soon'));
          return;
        }
        // Use the closured `btn`, not e.currentTarget - the DOM spec clears
        // Event.currentTarget to null once the listener's dispatch finishes,
        // and purchaseHintPack()'s callbacks fire later (async native billing
        // round-trip). Reading e.currentTarget.disabled from inside them threw
        // (null), which crashed the granted-callback right before its success
        // alert, was swallowed as a generic failure, and left the button
        // disabled forever - the exact "bought once, can't buy again" bug
        // reported after real hint-pack purchases (test27.mp4), even though
        // the hints themselves were already correctly granted beforehand.
        btn.disabled = true;
        Iap.purchaseHintPack(packKey,
          (hints) => {
            Storage.grantPaidHints(hints);
            Analytics.logEvent('hint_pack_purchased', { hints });
            btn.disabled = false;
            buildStoreScreen();
            alert(I18N.t('iap.hint_pack_success', { n: hints }));
          },
          () => {
            btn.disabled = false;
            alert(I18N.t('iap.purchase_failed'));
          }
        );
      });
    });

    // Gem packs + skin bundles (2026-08-20) - both native-only, same pattern
    // as remove-ads-tier-btn/store-pack-btn above (handlers live in
    // handlePurchaseGemPack/handlePurchaseBundle since the win/fail logic is
    // identical across every key, mirrors handlePurchaseRemoveAdsTier).
    document.querySelectorAll('.gem-pack-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handlePurchaseGemPack(e.currentTarget, e.currentTarget.dataset.gems));
    });
    document.querySelectorAll('.bundle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => handlePurchaseBundle(e.currentTarget, e.currentTarget.dataset.bundle));
    });

    if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform() && Capacitor.Plugins && Capacitor.Plugins.App) {
      Capacitor.Plugins.App.addListener('backButton', handleHardwareBack);
    }
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
          // In-app rating prompt (js/rating.js) - session-count trigger. Skipped
          // when the nickname modal is about to show on top of it (brand new
          // player, see promptNicknameIfNeeded() called right after this in
          // main.js) so the two never stack; it'll just be checked again next
          // launch since ratingPromptShown isn't set unless this actually fires.
          if (!Leaderboard.getNickname()) return;
          Rating.maybePrompt();
        }, 300);
      }
    }, 100);
  }

  // Golden Path Bonus (see arrowflow-level-mechanics plan, 2026-08-31) - reuses the
  // existing non-blocking app-toast, no new UI chrome needed for the in-level moment.
  function showGoldenBonusToast(bonus) {
    showToast(I18N.t('golden.claimed', { n: bonus }));
  }

  return { showScreen, applyTheme, applySound, applyMusic, applyVibration, updateMenu, updateHUD, showWin, showFail, hideAllModals, wireEvents, runSplash, buildStatsScreen, buildRankingScreen, promptNicknameIfNeeded, showGoldenBonusToast, openCloudSaveConflict };
})();