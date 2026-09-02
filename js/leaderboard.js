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
    appId: "1:968667057133:web:f8cad8133133f4aed8f5e4",
    measurementId: "G-1TVVKGR7KF"
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
        // signInAnonymously() used to be called unconditionally, right here.
        // Firebase restores a persisted session asynchronously, so on a cold
        // start that raced the restore and often REPLACED a signed-in Google
        // user with a brand-new anonymous one - silently unlinking cloud save
        // (js/cloudsave.js) on app restart and orphaning that account's
        // saves/{uid} document. onAuthStateChanged's first callback is the
        // authoritative answer to "is there a session?": sign in anonymously
        // only when it says there is none (which fires the callback again with
        // the new user).
        firebase.auth().onAuthStateChanged(user => {
          if (user) {
            uid = user.uid;
            resolve(true);
          } else {
            firebase.auth().signInAnonymously().catch(() => resolve(false));
          }
        });
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

  // "ล้างข้อมูล" (reset progress) support - signs out of the current anonymous
  // Firebase session so the next signInAnonymously() (on reload, via ensureInit())
  // gets a BRAND NEW uid. The old uid's players/{uid} Firestore doc is untouched -
  // it stays on the world leaderboard forever under its old nickname/score, frozen
  // at whatever it last had, since nothing will ever write to that uid again. Without
  // this, resetting local data alone would keep re-using the same uid, and the next
  // submitScore() would silently overwrite the old leaderboard entry instead of
  // starting a fresh one - see the aa/bb conversation this was designed around.
  async function resetIdentity() {
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        await firebase.auth().signOut();
      }
    } catch {}
  }

  function setNickname(name) {
    const clean = String(name).trim().slice(0, 20);
    Storage.set('nickname', clean);
    return clean;
  }

  // Pushes this player's current total score (not per-call delta) - the doc
  // always reflects the latest known total, so a submit from an older/smaller
  // score never needs special-casing. `highestLevel` (1-300) rides along so
  // the leaderboard can show progress, not just score - a player who reached
  // level 300 is shown as "จบเกม!" (done) rather than a bare number.
  async function submitScore(totalScore, highestLevel) {
    const ok = await ensureInit();
    if (!ok || !db || !uid) return false;
    const nickname = getNickname();
    if (!nickname) return false;
    try {
      await db.collection('players').doc(uid).set({
        nickname,
        totalScore: Math.round(totalScore),
        highestLevel: highestLevel || 1,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
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
      return snap.docs.map(d => ({
        id: d.id, nickname: d.data().nickname, totalScore: d.data().totalScore,
        highestLevel: d.data().highestLevel || 1
      }));
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

  // Per-level world-best score, kept in its own small collection (one doc
  // per level actually played by anyone) rather than trying to compute "max
  // score for level N across all players" from the players collection, which
  // Firestore can't query directly (would need a composite index per level
  // or a Cloud Function - out of scope for a client-only backend). Written
  // via a transaction so a slower client reading a stale "current best"
  // can't clobber a higher score that landed in between.
  async function submitLevelScore(levelId, score) {
    const ok = await ensureInit();
    if (!ok || !db || !uid) return false;
    const nickname = getNickname();
    if (!nickname) return false;
    try {
      const ref = db.collection('levelBests').doc(String(levelId));
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const current = snap.exists ? snap.data().score : -1;
        if (score > current) {
          tx.set(ref, { score: Math.round(score), nickname, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        }
      });
      return true;
    } catch (e) {
      // Best-effort by design (see file header), but silently swallowing this
      // hid a real bug once already (a stale/mismatched console-deployed Rules
      // publish vs. the committed firestore.rules) - surface it so it's visible
      // in remote devtools instead of just showing "-" with no trace.
      console.warn('[Leaderboard] submitLevelScore failed', e);
      return false;
    }
  }

  async function fetchLevelBest(levelId) {
    const ok = await ensureInit();
    if (!ok || !db) return null;
    try {
      const snap = await db.collection('levelBests').doc(String(levelId)).get();
      if (!snap.exists) return null;
      return { score: snap.data().score, nickname: snap.data().nickname };
    } catch (e) {
      console.warn('[Leaderboard] fetchLevelBest failed', e);
      return null;
    }
  }

  return {
    ensureInit, getNickname, setNickname, submitScore, fetchTop, fetchMyRank,
    submitLevelScore, fetchLevelBest, resetIdentity
  };
})();
