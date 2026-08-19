const Storage = (() => {
  const KEY = 'arrowflow3d_save';
  const TOTAL_LEVELS = 300; // kept in sync with TOTAL_LEVELS in js/ui.js
  const defaults = {
    currentLevel: 1, highestUnlocked: 1, levelData: {}, totalStars: 0, totalScore: 0, hints: 3,
    theme: 'light', sound: true, music: true, vibration: true, tutorialSeen: false, lang: 'en',
    dailyLastCompletedDate: null, dailyStreak: 0,
    remixHighest: 0, remixBestScoreByLevel: {},
    continueAdsUsedToday: 0, continueAdsDate: null,
    hintAdsUsedToday: 0, hintAdsDate: null,
    adsRemovedUntil: 0, adsRemovedForever: false
  };

  const REWARDED_AD_DAILY_CAP = 3;

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
      const bestStars = prev ? Math.max(prev.stars, stars) : stars;
      const bestMoves = prev ? Math.min(prev.moves, moves) : moves;
      const bestScore = prev ? Math.max(prev.score || 0, score) : score;
      const bestTime = prev && prev.time != null ? Math.min(prev.time, timeSec) : timeSec;
      _state.levelData[levelNum] = { stars: bestStars, moves: bestMoves, score: bestScore, time: bestTime, completed: true };
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
    },
    getLevelData: (n) => _state.levelData[n] || null,
    getAllLevelData: () => _state.levelData,
    addHints: (n) => { _state.hints = Math.max(0, _state.hints + n); save(_state); },

    // Daily Challenge - deliberately separate from campaign progress above.
    isDailyCompletedToday: () => _state.dailyLastCompletedDate === localDateStr(),
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
    // own device preferences (theme/sound/music/vibration/lang) and the paid
    // adsRemovedUntil entitlement, none of which are "game progress" and would be
    // surprising to lose - especially real money already spent. Deliberately drops
    // `nickname` (not in `defaults`, so it's absent after this) - the caller (ui.js)
    // also signs out of Firebase so the next nickname+play starts a genuinely new
    // leaderboard identity, leaving the old one's entry frozen in place rather than
    // overwritten.
    resetAll() {
      const keep = { theme: _state.theme, sound: _state.sound, music: _state.music, vibration: _state.vibration, lang: _state.lang, adsRemovedUntil: _state.adsRemovedUntil, adsRemovedForever: _state.adsRemovedForever };
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
    isAdsRemoved: () => _state.adsRemovedUntil > Date.now(),
    daysAdsRemovedLeft: () => Math.max(0, Math.ceil((_state.adsRemovedUntil - Date.now()) / 86400000)),
    grantAdsRemoved(days) {
      _state.adsRemovedUntil = Math.max(_state.adsRemovedUntil, Date.now()) + days * 86400000;
      save(_state);
    }
  };
})();
