const Storage = (() => {
  const KEY = 'arrowflow3d_save';
  const TOTAL_LEVELS = 300; // kept in sync with TOTAL_LEVELS in js/ui.js
  const defaults = {
    currentLevel: 1, highestUnlocked: 1, levelData: {}, totalStars: 0, totalScore: 0, hints: 3, paidHints: 0,
    theme: 'light', sound: true, music: true, vibration: true, tutorialSeen: false, dailyTipSeen: false, lang: 'en',
    dailyLastCompletedDate: null, dailyStreak: 0,
    remixHighest: 0, remixBestScoreByLevel: {},
    continueAdsUsedToday: 0, continueAdsDate: null,
    hintAdsUsedToday: 0, hintAdsDate: null,
    adsRemovedUntil: 0, adsRemovedForever: false,
    levelsSinceInterstitial: 0, nextInterstitialThreshold: 0,
    selectedSkin: null, skinTutorialSeen: false,
    // gems/hints = earned via play, reset on resetAll(). paidGems/paidHints = bought with
    // real money (gem packs / hint packs), always survive resetAll() - see resetAll()'s
    // keep-list below and spendGems()'s earned-first spend order.
    gems: 0, paidGems: 0, ownedGemSkins: [], ownedIapSkins: [],
    // Streak skins are unlocked once dailyStreak reaches their threshold, but unlike
    // highestUnlocked/gems, dailyStreak can go BACKWARDS (missing a day resets it to 1 -
    // see completeDaily() below). Without this set, a skin earned at streak 30 would look
    // re-locked the moment the streak breaks. grantStreakSkin() below records the unlock
    // permanently the first time a threshold is crossed; isUnlockedFor() in skins.js checks
    // this set, never the live dailyStreak value. Earned (not paid), so wiped on resetAll()
    // like ownedGemSkins.
    ownedStreakSkins: [],
    // In-app rating prompt (js/rating.js) - sessionCount increments once per app
    // launch (see markSessionOpened()); ratingPromptShown is a one-time gate so
    // this app only ever calls the native review dialog once per player, ever.
    // See shouldPromptRating() below for the actual trigger conditions.
    sessionCount: 0, ratingPromptShown: false
  };

  const RATING_SESSION_THRESHOLD = 5;
  const RATING_LEVELS_THRESHOLD = 5;

  const GEMS_PER_STAR = 5;
  const GEMS_PER_STAR_MILESTONE = 6;
  function isMilestoneLevel(n) { return typeof n === 'number' && n % 10 === 0; }
  function isEpicLevel(n) { return typeof n === 'number' && n % 100 === 0; }

  const REWARDED_AD_DAILY_CAP = 3;

  function rollInterstitialThreshold() {
    return 3 + Math.floor(Math.random() * 3); // 3, 4, or 5 inclusive
  }

  function localDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }; }
    catch { return { ...defaults }; }
  }
  function save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }

  let _state = load();

  return {
    get: (key) => _state[key],
    set: (key, val) => { _state[key] = val; save(_state); },
    completeLevel(levelNum, stars, moves, score, timeSec) {
      const prev = _state.levelData[levelNum];
      const prevStars = prev ? prev.stars : 0;
      const bestStars = prev ? Math.max(prev.stars, stars) : stars;
      const bestMoves = prev ? Math.min(prev.moves, moves) : moves;
      const bestScore = prev ? Math.max(prev.score || 0, score) : score;
      const bestTime = prev && prev.time != null ? Math.min(prev.time, timeSec) : timeSec;
      _state.levelData[levelNum] = { stars: bestStars, moves: bestMoves, score: bestScore, time: bestTime, completed: true };
      // Gems reward only the positive delta in this level's best-ever star
      // rating, once - replaying a level at the same star count nets 0, so
      // it can't be farmed by replaying (only genuinely improving pays out).
      const starDelta = Math.max(0, bestStars - prevStars);
      const gemsEarned = starDelta > 0 ? starDelta * (isMilestoneLevel(levelNum) ? GEMS_PER_STAR_MILESTONE : GEMS_PER_STAR) : 0;
      if (gemsEarned > 0) _state.gems += gemsEarned;
      // Bonus hints on milestone/epic levels, tiered to match the existing visual
      // escalation (see js/scene.js's VARIANT_RECIPES) - gated to the level's first-ever
      // clear (not starDelta>0) so it can't be farmed by replaying for a better star count.
      let hintsBonus = 0;
      if (!prev) {
        if (isEpicLevel(levelNum)) hintsBonus = 3;
        else if (isMilestoneLevel(levelNum)) hintsBonus = 1;
        if (hintsBonus > 0) _state.hints = Math.max(0, _state.hints + hintsBonus);
      }
      if (levelNum >= _state.highestUnlocked) {
        // Capped at TOTAL_LEVELS: the campaign is a fixed 300-level set, not
        // endless (see [[arrowflow_level_roadmap]]) - progress past 300 lives
        // separately in remixHighest, never here.
        _state.highestUnlocked = Math.min(TOTAL_LEVELS, levelNum + 1);
        _state.currentLevel = Math.min(TOTAL_LEVELS, levelNum + 1);
      }
      _state.totalStars = Object.values(_state.levelData).reduce((s, d) => s + (d.stars || 0), 0);
      _state.totalScore = Object.values(_state.levelData).reduce((s, d) => s + (d.score || 0), 0);
      save(_state);
      return { gemsEarned, isMilestoneGems: gemsEarned > 0 && isMilestoneLevel(levelNum), hintsBonus };
    },
    getLevelData: (n) => _state.levelData[n] || null,
    getAllLevelData: () => _state.levelData,
    // Earned hints only (from milestones/daily/rewarded ads/tutorial refund) - resets
    // on resetAll(). Real-money hint packs go through grantPaidHints() instead.
    addHints: (n) => { _state.hints = Math.max(0, _state.hints + n); save(_state); },
    // Real-money hint packs (js/iap.js's HINT_PACKS) - separate pool from addHints()
    // so resetAll() can wipe earned hints while keeping what was actually paid for.
    grantPaidHints: (n) => { _state.paidHints = Math.max(0, _state.paidHints + n); save(_state); },
    getHintsTotal: () => (_state.hints || 0) + (_state.paidHints || 0),
    // Spends from the earned pool first, falling back to paid hints only once earned
    // hints are exhausted - matches spendGems()'s earned-first order below.
    spendHint() {
      if (_state.hints > 0) _state.hints -= 1;
      else if (_state.paidHints > 0) _state.paidHints -= 1;
      else return false;
      save(_state);
      return true;
    },
    // Real-money gem packs (js/iap.js's GEM_PACKS) - separate pool from the earned
    // `gems` balance so resetAll() can wipe earned gems while keeping what was paid
    // for (see spendGems()'s earned-first spend order, which decides per-purchase
    // whether an item counts as "funded by real money" and should survive a reset).
    // Deliberately no negative-guard on n since this only ever fires from a
    // completed purchase (Iap.purchaseGemPack's onGranted), never user input.
    grantGems: (n) => { _state.paidGems += n; save(_state); },
    getGemsTotal: () => (_state.gems || 0) + (_state.paidGems || 0),

    // Gems currency (earned via completeLevel() above) - spend is guarded here
    // (not a raw set('gems', ...) from UI code) so the balance can't go
    // negative and the deduction + ownership grant always happen together.
    // Spends earned gems first; only dips into paid gems once earned gems run out.
    // Whenever paid gems cover any part of the cost, the purchase is considered
    // "funded by real money" and goes into ownedIapSkins (survives resetAll())
    // instead of ownedGemSkins (wiped on resetAll(), same as the rest of earned progress).
    spendGems(amount, skinId) {
      const total = (_state.gems || 0) + (_state.paidGems || 0);
      if (total < amount || _state.ownedGemSkins.includes(skinId) || _state.ownedIapSkins.includes(skinId)) return false;
      if (amount <= _state.gems) {
        _state.gems -= amount;
        _state.ownedGemSkins = [..._state.ownedGemSkins, skinId];
      } else {
        _state.paidGems -= (amount - _state.gems);
        _state.gems = 0;
        _state.ownedIapSkins = [..._state.ownedIapSkins, skinId];
      }
      save(_state);
      return true;
    },
    grantIapSkin(skinId) {
      if (!_state.ownedIapSkins.includes(skinId)) _state.ownedIapSkins = [..._state.ownedIapSkins, skinId];
      save(_state);
    },
    // Permanently records a streak-track skin unlock, once its threshold is first reached -
    // see the ownedStreakSkins comment above for why this can't just be a live dailyStreak
    // comparison. Idempotent, safe to call every daily win regardless of whether this
    // particular threshold was already granted.
    grantStreakSkin(skinId) {
      if (!_state.ownedStreakSkins.includes(skinId)) _state.ownedStreakSkins = [..._state.ownedStreakSkins, skinId];
      save(_state);
    },

    // In-app rating prompt (js/rating.js). Call once per app launch (main.js).
    markSessionOpened() { _state.sessionCount = (_state.sessionCount || 0) + 1; save(_state); },
    // True at most once ever per player (gated on ratingPromptShown) - fires on
    // whichever "positive moment" condition is reached first: RATING_SESSION_THRESHOLD
    // app opens, or RATING_LEVELS_THRESHOLD campaign levels completed. Both are cheap
    // proxies for "this player is actually engaged," not a real quality signal -
    // Google's own native dialog still decides on its own whether to show anything.
    shouldPromptRating() {
      if (_state.ratingPromptShown) return false;
      const levelsCompleted = Object.keys(_state.levelData).length;
      return _state.sessionCount >= RATING_SESSION_THRESHOLD || levelsCompleted >= RATING_LEVELS_THRESHOLD;
    },
    markRatingPrompted() { _state.ratingPromptShown = true; save(_state); },

    // Daily Challenge - deliberately separate from campaign progress above.
    isDailyCompletedToday: () => _state.dailyLastCompletedDate === localDateStr(),
    // Daily has no persistent per-level best to diff against - each calendar day's
    // completion is a fresh, first-and-only-ever clear of that day's level (completeDaily()
    // above already blocks a second same-day claim), so full stars x rate is correct here,
    // unlike completeLevel()'s delta-over-previous-best gems math.
    awardDailyGems(stars) {
      const gemsEarned = stars * GEMS_PER_STAR * 2;
      _state.gems += gemsEarned;
      save(_state);
      return gemsEarned;
    },
    completeDaily() {
      const today = localDateStr();
      if (_state.dailyLastCompletedDate === today) return false; // already claimed, no double reward
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yesterdayStr = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      _state.dailyStreak = _state.dailyLastCompletedDate === yesterdayStr ? _state.dailyStreak + 1 : 1;
      _state.dailyLastCompletedDate = today;
      save(_state);
      return true;
    },

    // REMIX (post-campaign endless) - also separate from campaign progress.
    completeRemix(remixIndex, stars, score) {
      _state.remixHighest = Math.max(_state.remixHighest, remixIndex + 1);
      const prev = _state.remixBestScoreByLevel[remixIndex];
      _state.remixBestScoreByLevel[remixIndex] = prev ? Math.max(prev, score) : score;
      save(_state);
    },

    // "ล้างข้อมูล" (reset progress) from Settings - wipes everything EXCEPT the player's
    // own device preferences (theme/sound/music/vibration/lang) and anything that's
    // real money already spent: adsRemovedUntil/Forever, ownedIapSkins (includes
    // skins bought with gems where paidGems covered any part of the cost - see
    // spendGems()'s earned-first logic above), paidGems, and paidHints.
    // `hints` and `gems` (the EARNED pools) and `ownedGemSkins` (skins funded entirely
    // by earned gems) are NOT kept - those reset to defaults along with campaign
    // progress, same as any other earned-not-paid state.
    // Deliberately drops `nickname` (not in `defaults`, so it's
    // absent after this) - the caller (ui.js) also signs out of Firebase so the next
    // nickname+play starts a genuinely new leaderboard identity, leaving the old
    // one's entry frozen in place rather than overwritten.
    resetAll() {
      // sessionCount/ratingPromptShown ride along too - "reset progress" clears campaign
      // state, not this device's usage history, and re-asking for a rating right after a
      // reset would be an annoying non-sequitur for a player who already answered once.
      const keep = { theme: _state.theme, sound: _state.sound, music: _state.music, vibration: _state.vibration, lang: _state.lang, adsRemovedUntil: _state.adsRemovedUntil, adsRemovedForever: _state.adsRemovedForever, ownedIapSkins: _state.ownedIapSkins, paidGems: _state.paidGems, paidHints: _state.paidHints, sessionCount: _state.sessionCount, ratingPromptShown: _state.ratingPromptShown };
      _state = { ...defaults, ...keep };
      save(_state);
    },

    // Rewarded-ad placeholders (no real ad SDK yet - see [[arrowflow_daily_remix_i18n]]-era
    // memory system). 'continue' = fail-screen continue, 'hint' = store's free-hint ad. Each
    // has its own independent daily cap, reset on calendar-day rollover like dailyStreak above.
    remainingRewardedAds(kind) {
      const usedKey = kind === 'hint' ? 'hintAdsUsedToday' : 'continueAdsUsedToday';
      const dateKey = kind === 'hint' ? 'hintAdsDate' : 'continueAdsDate';
      const used = _state[dateKey] === localDateStr() ? _state[usedKey] : 0;
      return Math.max(0, REWARDED_AD_DAILY_CAP - used);
    },
    useRewardedAd(kind) {
      const usedKey = kind === 'hint' ? 'hintAdsUsedToday' : 'continueAdsUsedToday';
      const dateKey = kind === 'hint' ? 'hintAdsDate' : 'continueAdsDate';
      const today = localDateStr();
      if (_state[dateKey] !== today) { _state[usedKey] = 0; _state[dateKey] = today; }
      if (_state[usedKey] >= REWARDED_AD_DAILY_CAP) return false;
      _state[usedKey]++;
      save(_state);
      return true;
    },

    // "Remove ads" IAP (real money, js/iap.js) - a time-boxed grant rather than a
    // permanent flag or an auto-renewing subscription (see [[arrowflow_monetization_placeholder]]),
    // so a repeat purchase just extends the window. grantAdsRemoved() extends from
    // whichever is later - now or the current expiry - so buying early never wastes
    // remaining paid-for days.
    isAdsRemoved: () => _state.adsRemovedForever || _state.adsRemovedUntil > Date.now(),
    daysAdsRemovedLeft: () => Math.max(0, Math.ceil((_state.adsRemovedUntil - Date.now()) / 86400000)),
    grantAdsRemoved(days) {
      _state.adsRemovedUntil = Math.max(_state.adsRemovedUntil, Date.now()) + days * 86400000;
      save(_state);
    },

    // Interstitial ad cadence - a rolling counter (unlike the daily-reset rewarded-ad
    // caps above), so it persists across calendar days and app restarts and only
    // resets when an interstitial actually fires (see js/ui.js #btn-next handler).
    noteLevelCompletedForInterstitial() {
      if (!_state.nextInterstitialThreshold) _state.nextInterstitialThreshold = rollInterstitialThreshold();
      _state.levelsSinceInterstitial++;
      save(_state);
    },
    shouldShowInterstitial() {
      if (!_state.nextInterstitialThreshold) _state.nextInterstitialThreshold = rollInterstitialThreshold();
      return _state.levelsSinceInterstitial >= _state.nextInterstitialThreshold;
    },
    recordInterstitialShown() {
      _state.levelsSinceInterstitial = 0;
      _state.nextInterstitialThreshold = rollInterstitialThreshold();
      save(_state);
    }
  };
})();
