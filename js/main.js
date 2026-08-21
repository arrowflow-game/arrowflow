/* ============================================
   ArrowFlow 3D — main.js
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Android 15+ (targetSdk 35) enforces edge-to-edge by default, so the WebView
  // draws under the OS status bar and covers the top HUD buttons unless we opt
  // out. capacitor.config.json's plugins.StatusBar.overlaysWebView already does
  // this on native launch; this JS call is a belt-and-suspenders backup (no-op
  // on the plain web build, where window.Capacitor isn't injected).
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
    try { window.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: false }); } catch (e) {}
  }

  // Best-effort analytics/crash logging - set up first so the global error
  // handler below is listening before anything else can throw.
  Analytics.init();

  // In-app rating prompt bookkeeping (js/rating.js) - counts this as one more app
  // launch toward Storage.shouldPromptRating()'s session-count trigger.
  Storage.markSessionOpened();

  // Check Play Store for a newer version and start downloading it in the
  // background if one exists (native only, no-op on web) - see js/appUpdate.js.
  AppUpdate.init();

  // Pre-load the first rewarded ad now (native only, no-op on web) so it's
  // ready by the time the player first taps a "watch ad" button instead of
  // loading at that moment.
  Ads.init();

  // Pre-fetch the "remove ads" IAP's localized store price (native only, no-op
  // on web) so the buy buttons can show a real price instead of the fallback
  // as soon as they're first rendered.
  Iap.init();

  // Init UI
  I18N.applyToDOM();
  UI.applyTheme(Storage.get('theme'));
  UI.applySound(Storage.get('sound'));
  UI.applyMusic(Storage.get('music'));
  UI.applyVibration(Storage.get('vibration'));
  UI.wireEvents();
  
  // Init 3D Scene
  Scene3D.init();
  Scene3D.setOnArrowTap(Game.onArrowTap);

  // First-run tutorial (level 1 only, gated on Storage's tutorialSeen flag) -
  // wires its listeners now so it's ready before the first Game.loadLevel() call below.
  Tutorial.init();

  // Debug convenience (matches the existing ?level=N param): ?tutorial=1 clears the
  // 'seen' flag so the tutorial can be re-triggered on a link/device that already
  // played level 1 once, without having to manually clear browser storage.
  if (new URLSearchParams(location.search).get('tutorial') === '1') Storage.set('tutorialSeen', false);

  // Debug convenience: ?debugall=1 unlocks every level and every skin (level/streak/gems/iap
  // tracks all satisfied) and clears today's Daily Challenge claim so it can be replayed
  // repeatedly for testing, without manually grinding progress or clearing storage by hand.
  if (new URLSearchParams(location.search).get('debugall') === '1') {
    Storage.set('highestUnlocked', 300);
    Storage.set('currentLevel', 300);
    Storage.set('dailyStreak', 999);
    Storage.set('gems', 999999);
    // Covers both primary-iap-only skins (the "royale" prestige tier, unlock.type
    // === 'iap') and the streak-track skins whose altUnlock is an iap bypass -
    // previously only the latter was included, leaving the royale tier locked.
    Storage.set('ownedIapSkins', Skins.ALL.filter(s => s.unlock.type === 'iap' || (s.altUnlock && s.altUnlock.type === 'iap')).map(s => s.id));
    // Gems-track skins need to actually be "owned" (not just affordable) to show
    // unlocked - the debug gems balance above doesn't do that by itself.
    Storage.set('ownedGemSkins', Skins.ALL.filter(s => s.unlock.type === 'gems').map(s => s.id));
    Storage.set('dailyLastCompletedDate', null);
  }

  // Expose current level on Game object for UI
  Game.getCurrentLevel = () => {
    // hacky way if state is hidden, but let's just use Storage
    return Storage.get('currentLevel');
  };
  
  // Start
  const debugLevel = parseInt(new URLSearchParams(location.search).get('level'));
  if (debugLevel >= 1) {
    UI.showScreen('screen-game');
    Game.loadLevel(debugLevel);
  } else {
    UI.runSplash();
    UI.promptNicknameIfNeeded();
  }
});
