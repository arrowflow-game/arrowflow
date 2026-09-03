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
    appId: "1:968667057133:web:f8cad8133133f4aed8f5e4",
    measurementId: "G-1TVVKGR7KF"
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

    // Global crash/error logging, sent to BOTH sinks because they see
    // different things:
    //  - GA4's `exception` event gives a count next to the rest of the funnel,
    //    and is the only one that works on the web build.
    //  - Crashlytics gives the stack trace, groups identical errors, and is the
    //    only place a NATIVE crash (the app dying outright) shows up at all -
    //    GA4 never sees those, since nothing is left running to report them.
    window.addEventListener('error', (e) => {
      logEvent('exception', {
        description: `${e.message} @ ${e.filename}:${e.lineno}`,
        fatal: false
      });
      recordCrash(e.error || e.message, `${e.filename}:${e.lineno}:${e.colno}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
      logEvent('exception', {
        description: `unhandled rejection: ${e.reason}`,
        fatal: false
      });
      recordCrash(e.reason, 'unhandledrejection');
    });
  }

  // Native-only, best-effort, and never allowed to throw from inside an error
  // handler - a reporter that crashes while reporting would replace a legible
  // bug with an infinite loop.
  function recordCrash(err, where) {
    try {
      const plugin = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()
        && Capacitor.Plugins && Capacitor.Plugins.FirebaseCrashlytics;
      if (!plugin) return;
      const message = (err && err.message) ? err.message : String(err);
      const stack = (err && err.stack) ? err.stack : '';
      plugin.recordException({ message: `${message} (${where})`, stacktrace: buildStack(stack) });
    } catch {}
  }

  // The plugin wants structured frames, not a raw string. Parse what V8 gives
  // us ("    at fn (url:line:col)") and fall back to one synthetic frame so a
  // stack we can't parse still arrives as something rather than nothing.
  function buildStack(stack) {
    const frames = String(stack).split('\n').map(line => {
      const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (!m) return null;
      return { fileName: m[2], lineNumber: parseInt(m[3], 10), methodName: m[1] || '<anonymous>' };
    }).filter(Boolean);
    return frames.length ? frames : [{ fileName: 'unknown', lineNumber: 0, methodName: '<no stack>' }];
  }

  function logEvent(name, params) {
    if (!ready || !analytics) return;
    try { analytics.logEvent(name, params); } catch {}
  }

  return { init, logEvent };
})();
