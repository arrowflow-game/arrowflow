/* ============================================
   ArrowFlow 3D — ads.js
   Real AdMob rewarded ads, native-only. On the plain web build (GitHub Pages)
   and in any headless/browser test context there is no native ad SDK at all -
   Capacitor.Plugins.AdMob simply doesn't exist there - so this module falls
   back to an instant grant in those contexts (see fakeGrant()), matching the
   exact placeholder behavior js/ui.js used before this module existed. That's
   a deliberate product choice (no web monetization story to protect, and the
   daily-cap gating in js/storage.js still applies either way), not a bug.

   TODO: swap REWARDED_AD_UNIT_ID below, and the AdMob Application ID
   meta-data in android/app/src/main/AndroidManifest.xml, for real values once
   a real AdMob account + ad units exist. Both currently use Google's own
   published TEST ids, safe to ship during development but never real ads.
   ============================================ */

const Ads = (() => {
  const REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917'; // Google test rewarded unit

  let initialized = false;
  let adReady = false;

  function isNative() {
    return typeof Capacitor !== 'undefined' && !!Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  }

  function admob() {
    return Capacitor.Plugins && Capacitor.Plugins.AdMob;
  }

  async function init() {
    if (!isNative() || initialized) return;
    try {
      await admob().initialize({ initializeForTesting: true });
      initialized = true;
      await prepare();
    } catch {
      // Best-effort - a failed init just means showRewardedAd() falls back
      // to fakeGrant() below via the adReady check, never blocks the game.
    }
  }

  async function prepare() {
    if (!isNative() || !initialized) return;
    try {
      await admob().prepareRewardVideoAd({ adId: REWARDED_AD_UNIT_ID, isTesting: true });
      adReady = true;
    } catch {
      adReady = false;
    }
  }

  function fakeGrant(onGranted) {
    // Same 1200ms placeholder behavior the old UI.playFakeRewardedAd() used -
    // kept intentionally for web/test contexts with no ad SDK available.
    setTimeout(onGranted, 1200);
  }

  // showRewardedAd(onGranted, onFailed): the only entry point ui.js needs.
  // onGranted fires only once a reward is actually earned (native) or on the
  // web/test fallback; onFailed fires on a real no-fill/show failure/dismiss-
  // without-earning, letting the caller restore its button without granting.
  async function showRewardedAd(onGranted, onFailed) {
    if (!isNative()) return fakeGrant(onGranted);

    if (!adReady) await prepare();
    if (!adReady) {
      if (onFailed) onFailed();
      else fakeGrant(onGranted);
      return;
    }

    let earned = false;
    const rewardListener = await admob().addListener('onRewardedVideoAdReward', () => { earned = true; });
    const dismissListener = await admob().addListener('onRewardedVideoAdDismissed', () => {
      rewardListener.remove();
      dismissListener.remove();
      adReady = false;
      prepare(); // pre-load the next one for next time
      if (earned) onGranted();
      else if (onFailed) onFailed();
    });

    try {
      await admob().showRewardVideoAd();
    } catch {
      rewardListener.remove();
      dismissListener.remove();
      adReady = false;
      if (onFailed) onFailed();
      else fakeGrant(onGranted);
    }
  }

  return { init, showRewardedAd, isNative };
})();
