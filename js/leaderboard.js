/* ============================================
   ArrowFlow 3D — leaderboard.js
   Global leaderboard via Firebase (Anonymous Auth + Firestore).
   Every call is best-effort: gameplay must never depend on network/Firebase
   being reachable, so every method swallows errors and resolves to a safe
   fallback (null / empty array) instead of throwing.
   ============================================ */

const Leaderboard = (() => {
  const firebaseConfig = {
    apiKey: "AIzaSyCOX7RkuFQuji_rBgfPq_nogyvmPUkddtk",
    authDomain: "arrowflow-8d6a8.firebaseapp.com",
    projectId: "arrowflow-8d6a8",
    storageBucket: "arrowflow-8d6a8.firebasestorage.app",
    messagingSenderId: "968667057133",
    appId: "1:968667057133:web:f8cad8133133f4aed8f5e4"
  };

  let db = null;
  let authReadyPromise = null;
  let uid = null;

  function ensureInit() {
    if (authReadyPromise) return authReadyPromise;
    authReadyPromise = new Promise((resolve) => {
      try {
        if (typeof firebase === 'undefined') return resolve(false);
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        firebase.auth().onAuthStateChanged(user => {
          if (user) {
            uid = user.uid;
            resolve(true);
          }
        });
        firebase.auth().signInAnonymously().catch(() => resolve(false));
        // Don't hang forever if auth never responds (offline, provider disabled, etc).
        setTimeout(() => resolve(!!uid), 6000);
      } catch {
        resolve(false);
      }
    });
    return authReadyPromise;
  }

  function getNickname() {
    return Storage.get('nickname') || null;
  }

  function setNickname(name) {
    const clean = String(name).trim().slice(0, 20);
    Storage.set('nickname', clean);
    return clean;
  }

  // Pushes this player's current total score (not per-call delta) - the doc
  // always reflects the latest known total, so a submit from an older/smaller
  // score never needs special-casing.
  async function submitScore(totalScore) {
    const ok = await ensureInit();
    if (!ok || !db || !uid) return false;
    const nickname = getNickname();
    if (!nickname) return false;
    try {
      await db.collection('players').doc(uid).set({
        nickname,
        totalScore: Math.round(totalScore),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch {
      return false;
    }
  }

  async function fetchTop(n) {
    const ok = await ensureInit();
    if (!ok || !db) return [];
    try {
      const snap = await db.collection('players').orderBy('totalScore', 'desc').limit(n).get();
      return snap.docs.map(d => ({ id: d.id, nickname: d.data().nickname, totalScore: d.data().totalScore }));
    } catch {
      return [];
    }
  }

  // Rank = 1 + count of players with a strictly higher score. Firestore's
  // count() aggregation isn't available in this project's compat SDK build
  // (only the modular API exposes it), so this downloads the higher-scoring
  // docs themselves - fine at this game's scale, would need revisiting if
  // the player base ever got large enough for that to matter.
  async function fetchMyRank(myScore) {
    const ok = await ensureInit();
    if (!ok || !db) return null;
    try {
      const higherSnap = await db.collection('players').where('totalScore', '>', myScore).get();
      return higherSnap.size + 1;
    } catch {
      return null;
    }
  }

  return { ensureInit, getNickname, setNickname, submitScore, fetchTop, fetchMyRank };
})();
