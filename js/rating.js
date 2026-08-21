/* ============================================
   ArrowFlow 3D — rating.js
   Google Play in-app review prompt (Capacitor @capacitor-community/in-app-review),
   native-only - same isNative() gate pattern as js/ads.js/js/iap.js. No web
   equivalent exists (there's no app store to review on GitHub Pages), so this
   is a plain no-op there rather than a fake/placeholder flow like ads.js's
   fakeGrant() - there's nothing meaningful to simulate.

   Google's own native dialog decides on its own (silently, with no callback)
   whether to actually show anything - it has a strict internal quota (a
   handful of times per year per Play Store account) regardless of how often
   this app calls requestReview(). js/storage.js's ratingPromptShown flag is
   OUR OWN separate one-time gate on top of that, so this app never even asks
   more than once per player - see storage.js's shouldPromptRating().
   ============================================ */

const Rating = (() => {
  function isNative() {
    return typeof Capacitor !== 'undefined' && !!Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  }

  function plugin() {
    return Capacitor.Plugins && Capacitor.Plugins.InAppReview;
  }

  // maybePrompt(): call from a "positive moment" (see storage.js's
  // shouldPromptRating() call sites) - marks the one-time flag BEFORE the
  // native call resolves, not after, so a slow or failed native call can
  // never cause a second attempt on the next trigger check.
  function maybePrompt() {
    if (!isNative() || !Storage.shouldPromptRating()) return;
    Storage.markRatingPrompted();
    try { plugin().requestReview(); } catch { /* best-effort, never blocks the game */ }
  }

  return { maybePrompt, isNative };
})();
