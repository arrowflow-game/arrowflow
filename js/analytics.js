/* ============================================
   ArrowFlow 3D — analytics.js
   Firebase Analytics (Google Analytics for Firebase) + a global error/crash
   logger. Same best-effort philosophy as leaderboard.js - gameplay must
   never depend on this working, so every call swallows its own errors and
   silently no-ops if Analytics isn't enabled for the Firebase project yet
   (a console step, not a code step - see arrowflow_monetization_placeholder
   -era memory notes for the equivalent Firestore Rules console step).
   ============================================ */

const Analytics = (() => {
  // Same project/config as js/leaderboard.js (public-safe for a Firebase web
  // app - see that file's own comment). Duplicated rather than imported so
  // this module has no load-order dependency on leaderboard.js; whichever
  // one runs first calls firebase.initializeApp(), guarded the same way in
  // both files, so re-running it here is a harmless no-op either way.
  const firebaseConfig = {
    apiKey: "AIzaSyCOX7RkuFQuji_rBgfPq_nogyvmPUkddtk",
    authDomain: "arrowflow-8d6a8.firebaseapp.com",
    projectId: "arrowflow-8d6a8",
    storageBucket: "arrowflow-8d6a8.firebasestorage.app",
    messagingSenderId: "968667057133",
    appId: "1:968667057133:web:f8cad8133133f4aed8f5e4"
  };

  let analytics = null;
  let ready = false;

  function init() {
    try {
      if (typeof firebase === 'undefined' || typeof firebase.analytics !== 'function') return;
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      analytics = firebase.analytics();
      ready = true;
    } catch {
      // Analytics not enabled for this Firebase project yet, or offline -
      // stays silently disabled, never blocks the game.
    }

    // Global crash/error logging - GA4's own "exception" event shape
    // (description/fatal), viewable in the Firebase console without any
    // extra collection/rules of our own to maintain (unlike a custom
    // Firestore errorLogs collection, which would need its own write-abuse
    // guarding - logEvent() is already rate-limited by the SDK itself).
    window.addEventListener('error', (e) => {
      logEvent('exception', {
        description: `${e.message} @ ${e.filename}:${e.lineno}`,
        fatal: false
      });
    });
    window.addEventListener('unhandledrejection', (e) => {
      logEvent('exception', {
        description: `unhandled rejection: ${e.reason}`,
        fatal: false
      });
    });
  }

  function logEvent(name, params) {
    if (!ready || !analytics) return;
    try { analytics.logEvent(name, params); } catch {}
  }

  return { init, logEvent };
})();
