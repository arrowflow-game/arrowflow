/* ============================================
   ArrowFlow 3D — share.js
   "Share my score" - the native Android share sheet on device, the Web Share
   API in a mobile browser, clipboard as the last resort. One entry point
   (shareScore) so callers never have to care which of the three they got.

   Every path is best-effort and silent on failure, same as js/ads.js /
   js/notifications.js: sharing is a nice-to-have social gesture attached to a
   celebration screen, and a share sheet that won't open must never turn a win
   into an error message.
   ============================================ */

const Share = (() => {
  // Where a friend who taps the shared link actually lands. Deliberately the
  // web build rather than a Play Store listing: the app is still in closed
  // testing, so a store link would show most recipients "item not found",
  // while this URL plays immediately for anyone on any platform. Swap it for
  // the Play Store URL once the app is public - see [[arrowflow_leaderboard]]
  // for why this game lives on the arrowflow-game org account.
  const SHARE_URL = 'https://arrowflow-game.github.io/arrowflow/';

  function plugin() {
    return (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()
      && Capacitor.Plugins && Capacitor.Plugins.Share) || null;
  }

  // True when there is any way at all to share, so callers can hide the button
  // rather than offer one that would do nothing. Checked at render time, not
  // cached - navigator.share is absent on desktop browsers but present on
  // mobile ones, and this same page is served to both.
  function isAvailable() {
    // Remote kill switch (js/remoteconfig.js) - lets sharing be turned off from
    // the console if the shared link or wording ever needs pulling, without a
    // release. Guarded because share.js loads before remoteconfig.js runs.
    try { if (RemoteConfig.get('feature_share_enabled') === false) return false; } catch {}
    return !!plugin() || (typeof navigator !== 'undefined' && !!navigator.share) ||
      (typeof navigator !== 'undefined' && !!navigator.clipboard);
  }

  // Builds the message a friend receives. Kept here rather than at the call
  // site so the wording stays consistent wherever sharing gets added later.
  function scoreText(levelNum, score, stars) {
    return I18N.t('share.score_text')
      .replace('{level}', levelNum)
      .replace('{score}', score.toLocaleString())
      .replace('{stars}', '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars)));
  }

  // Resolves to true only if something actually happened that the player would
  // recognize as sharing - a dismissed share sheet counts as false, so callers
  // don't congratulate someone who backed out.
  async function shareScore(levelNum, score, stars) {
    const text = scoreText(levelNum, score, stars);
    const title = I18N.t('share.title');

    const p = plugin();
    if (p) {
      try {
        // dialogTitle is the Android chooser's own header, distinct from the
        // `title` most target apps use as a subject line.
        await p.share({ title, text, url: SHARE_URL, dialogTitle: title });
        return true;
      } catch {
        // Includes the player dismissing the sheet - nothing more to try.
        return false;
      }
    }

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text, url: SHARE_URL });
        return true;
      } catch {
        return false;
      }
    }

    // Desktop browsers: no share sheet exists, so put the message somewhere the
    // player can paste it. Returns 'copied' rather than true so the caller can
    // say what actually happened - silently "succeeding" with no visible share
    // sheet would just look broken.
    try {
      await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
      return 'copied';
    } catch {
      return false;
    }
  }

  return { shareScore, isAvailable, SHARE_URL };
})();
