/* ============================================
   ArrowFlow 3D — ads.js
   Real AdMob rewarded ads, native-only. On the plain web build (GitHub Pages)
   and in any headless/browser test context there is no native ad SDK at all -
   Capacitor.Plugins.AdMob simply doesn't exist there - so this module falls
   back to an instant grant in those contexts (see fakeGrant()), matching the
   exact placeholder behavior js/ui.js used before this module existed. That's
   a deliberate product choice (no web monetization story to protect, and the
   daily-cap gating in js/storage.js still applies either way), not a bug.

   Real App ID (AndroidManifest.xml) and Ad Unit ID (below) for com.arrowflowgame.puzzle
   were created 2026-08-19. prepare() still passes isTesting:true, so ad requests
   currently only ever serve Google's test creative regardless of using the real
   unit ID - safe during development (never tap your own live ads - AdMob policy
   violation) and required until the app has actually gone through Play Store
   review. Flip isTesting off only when ready to serve/earn real ads.
   ============================================ */

const Ads = (() => {
  const REWARDED_AD_UNIT_ID = 'ca-app-pub-5407872195671640/2365362318';
  const INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-5407872195671640/1567054452';

  let initialized = false;
  let adReady = false;
  let interstitialReady = false;

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
      await prepareInterstitial();
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

  async function prepareInterstitial() {
    if (!isNative() || !initialized) return;
    try {
      await admob().prepareInterstitial({ adId: INTERSTITIAL_AD_UNIT_ID, isTesting: true });
      interstitialReady = true;
    } catch {
      interstitialReady = false;
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

  // showInterstitial(onClosed): the only entry point ui.js needs for the win-flow
  // interstitial. onClosed always fires exactly once - whether the ad was shown and
  // dismissed, failed to show, or there was no ad SDK/fill at all - since there's no
  // reward to gate on here, callers should never be blocked waiting on it.
  async function showInterstitial(onClosed) {
    if (!isNative()) return onClosed();

    if (!interstitialReady) await prepareInterstitial();
    if (!interstitialReady) { onClosed(); return; }

    const dismissListener = await admob().addListener('interstitialAdDismissed', () => {
      dismissListener.remove();
      failListener.remove();
      interstitialReady = false;
      prepareInterstitial(); // pre-load the next one for next time
      onClosed();
    });
    const failListener = await admob().addListener('interstitialAdFailedToShow', () => {
      dismissListener.remove();
      failListener.remove();
      interstitialReady = false;
      prepareInterstitial();
      onClosed();
    });

    try {
      await admob().showInterstitial();
    } catch {
      dismissListener.remove();
      failListener.remove();
      interstitialReady = false;
      onClosed();
    }
  }

  return { init, showRewardedAd, showInterstitial, isNative };
})();
