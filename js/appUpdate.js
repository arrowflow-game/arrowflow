/* ============================================
   ArrowFlow 3D — appUpdate.js
   Google Play in-app update check (Capacitor @capawesome/capacitor-app-update),
   native-only - same isNative() gate pattern as js/ads.js/js/iap.js/js/rating.js.
   No web equivalent (GitHub Pages just serves the latest files on every load,
   there's nothing to "update").

   Uses the FLEXIBLE update flow only, never the immediate/blocking one - a
   flexible update downloads quietly in the background while the player keeps
   playing, then shows a small non-intrusive banner once it's actually ready
   to install (see #update-ready-banner in index.html). The immediate flow
   (a full-screen native "you must update now" prompt Google shows) exists in
   the plugin too but is meant for critical/security fixes gated behind
   Play Console's own updatePriority setting, which this app has never set -
   don't wire that path in without an explicit product decision to do so.
   ============================================ */

const AppUpdate = (() => {
  function isNative() {
    return typeof Capacitor !== 'undefined' && !!Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  }

  function plugin() {
    return Capacitor.Plugins && Capacitor.Plugins.AppUpdate;
  }

  function showReadyBanner() {
    const banner = document.getElementById('update-ready-banner');
    if (banner) banner.classList.remove('hidden');
  }

  // init(): call once at app boot (main.js). Checks Play Store for a newer
  // version and, if one exists, starts downloading it in the background -
  // best-effort throughout, since a failed check/download should never block
  // or interrupt the player from just playing the game.
  async function init() {
    if (!isNative()) return;
    try {
      const info = await plugin().getAppUpdateInfo();
      if (info.updateAvailability !== 2 /* AppUpdateAvailability.UPDATE_AVAILABLE */) return;
      if (!info.flexibleUpdateAllowed) return;

      await plugin().addListener('onFlexibleUpdateStateChange', (state) => {
        if (state.installStatus === 11 /* FlexibleUpdateInstallStatus.DOWNLOADED */) showReadyBanner();
      });
      const result = await plugin().startFlexibleUpdate();
      // OK (0) means the user accepted the confirmation dialog Google shows before
      // downloading - the actual "ready" signal still only comes from the listener
      // above once the download finishes, which can take a while on a slow connection.
    } catch {
      // Best-effort - no update check today, try again next launch.
    }
  }

  // Called by the update-ready banner's own tap handler (js/ui.js).
  async function completeUpdate() {
    if (!isNative()) return;
    try { await plugin().completeFlexibleUpdate(); } catch { /* best-effort */ }
  }

  return { init, completeUpdate, isNative };
})();
