/* ============================================
   ArrowFlow 3D — cloudsave.js
   Google Sign-In + Firestore cloud save, so progress/nickname can be restored
   after a reinstall. Same best-effort philosophy as js/leaderboard.js (every
   call swallows its own errors and resolves to a safe fallback) - signing in,
   pushing, or restoring must never be able to break gameplay.

   Architecture note: capacitor.config.json's FirebaseAuthentication plugin is
   configured with skipNativeAuth: true, so the native Google Sign-In result is
   NOT automatically synced into any Firebase Auth session on its own - only the
   plugin's own native-side state would change. js/leaderboard.js's Firestore
   reads/writes go through the JS compat SDK's firebase.auth() session (that's
   what Firestore's security rules check against), so every sign-in here
   deliberately feeds the native result's idToken/accessToken into that SAME JS
   SDK session via GoogleAuthProvider.credential() + linkWithCredential() -
   never relies on the plugin's own internal native auth state.
   ============================================ */

const CloudSave = (() => {
  // Deliberately NOT every Storage key - see the cloud-save plan
  // (twinkling-foraging-grove.md) for why theme/sound/vibration/tutorial flags
  // and the daily ad-cap counters are excluded.
  const SYNCED_FIELDS = [
    'currentLevel', 'highestUnlocked', 'levelData', 'totalStars', 'totalScore',
    'hints', 'paidHints', 'gems', 'paidGems',
    'ownedGemSkins', 'ownedIapSkins', 'ownedStreakSkins', 'selectedSkin',
    'dailyStreak', 'dailyLastCompletedDate', 'remixHighest', 'remixBestScoreByLevel',
    'adsRemovedUntil', 'adsRemovedForever', 'nickname'
  ];

  // One-time reward for linking a Google account (see storage.js's
  // googleLinkRewardGiven flag) - small enough not to be worth chasing by
  // sign-out/sign-in cycling (the flag blocks that anyway), just a nudge.
  const LINK_REWARD_GEMS = 20;
  const LINK_REWARD_HINTS = 2;

  const PUSH_DEBOUNCE_MS = 5000;
  let pushTimer = null;
  let linked = false; // mirrors firebase.auth().currentUser?.isAnonymous === false

  function nativePlugin() {
    return (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()
      && Capacitor.Plugins && Capacitor.Plugins.FirebaseAuthentication) || null;
  }

  function isGoogleLinked() {
    return linked;
  }

  // "Never actually played" fingerprint - matches Storage's own defaults, so a
  // genuinely fresh install can restore silently instead of prompting a choice
  // between "nothing" and "nothing" wrapped in a modal.
  function isFreshLocalState() {
    return Storage.get('highestUnlocked') === 1 && Storage.get('totalScore') === 0 && Storage.get('gems') === 0;
  }

  function snapshotFromStorage() {
    const snap = {};
    SYNCED_FIELDS.forEach(k => { snap[k] = Storage.get(k) ?? null; });
    return snap;
  }

  function maybeGrantLinkReward() {
    if (Storage.get('googleLinkRewardGiven')) return;
    Storage.set('googleLinkRewardGiven', true);
    Storage.addGems(LINK_REWARD_GEMS);
    Storage.addHints(LINK_REWARD_HINTS);
  }

  // Returns { ok, conflict } - conflict is either null (nothing to resolve,
  // caller does nothing more) or the cloud snapshot for ui.js to show a
  // restore-vs-keep choice modal over.
  async function signInWithGoogle() {
    const plugin = nativePlugin();
    if (!plugin) return { ok: false };
    try {
      const result = await plugin.signInWithGoogle();
      const idToken = result && result.credential && result.credential.idToken;
      if (!idToken) return { ok: false };
      const accessToken = result.credential.accessToken;

      const ready = await Leaderboard.ensureInit();
      if (!ready || typeof firebase === 'undefined') return { ok: false };

      const cred = firebase.auth.GoogleAuthProvider.credential(idToken, accessToken);
      try {
        await firebase.auth().currentUser.linkWithCredential(cred);
      } catch (e) {
        // Already linked from a previous install/device - this IS the reinstall-
        // restore path, not a real error. Sign in as that existing account instead.
        if (e && e.code === 'auth/credential-already-in-use') {
          await firebase.auth().signInWithCredential(cred);
        } else {
          throw e;
        }
      }

      linked = true;
      maybeGrantLinkReward();
      const conflict = await checkForRestore();
      return { ok: true, conflict };
    } catch (e) {
      console.warn('[CloudSave] signInWithGoogle failed', e);
      return { ok: false };
    }
  }

  async function signOutGoogle() {
    try {
      const plugin = nativePlugin();
      if (plugin) await plugin.signOut();
    } catch {}
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        await firebase.auth().signOut();
      }
    } catch {}
    linked = false;
  }

  async function pushNow() {
    if (!linked || typeof firebase === 'undefined') return;
    try {
      const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
      if (!uid) return;
      const data = snapshotFromStorage();
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      await firebase.firestore().collection('saves').doc(uid).set(data, { merge: true });
    } catch (e) {
      console.warn('[CloudSave] pushNow failed', e);
    }
  }

  function schedulePush() {
    if (!linked) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, PUSH_DEBOUNCE_MS);
  }

  // Returns the cloud snapshot if there's a real conflict for ui.js to resolve,
  // or null if there's nothing to do (no cloud doc yet, already restored
  // silently, or local already matches cloud).
  async function checkForRestore() {
    if (!linked || typeof firebase === 'undefined') return null;
    try {
      const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
      if (!uid) return null;
      const snap = await firebase.firestore().collection('saves').doc(uid).get();
      if (!snap.exists) return null;
      const cloud = snap.data();

      if (isFreshLocalState()) {
        applyCloudSnapshot(cloud);
        return null;
      }

      const local = snapshotFromStorage();
      const identical = SYNCED_FIELDS.every(k => JSON.stringify(local[k] ?? null) === JSON.stringify(cloud[k] ?? null));
      return identical ? null : cloud;
    } catch (e) {
      console.warn('[CloudSave] checkForRestore failed', e);
      return null;
    }
  }

  // Writes every synced field from a cloud snapshot into Storage, then reloads -
  // same pattern ui.js's btn-reset-confirm already uses after Storage.resetAll(),
  // so every module re-initializes clean against the new state instead of trying
  // to patch already-running screens/HUD in place.
  function applyCloudSnapshot(cloud) {
    SYNCED_FIELDS.forEach(k => {
      if (cloud[k] !== undefined) Storage.set(k, cloud[k]);
    });
    location.reload();
  }

  // Best-effort startup check (native only) - if a Google session is already
  // active from a previous launch, silently resolves any restore conflict the
  // same way a fresh sign-in would. Returns the conflict snapshot (or null) so
  // main.js can hand it to ui.js's choice modal.
  async function init() {
    const plugin = nativePlugin();
    if (!plugin) return null;
    Storage.onChange(schedulePush);
    try {
      const ready = await Leaderboard.ensureInit();
      if (!ready || typeof firebase === 'undefined') return null;
      const user = firebase.auth().currentUser;
      if (user && !user.isAnonymous) {
        linked = true;
        return await checkForRestore();
      }
    } catch (e) {
      console.warn('[CloudSave] init failed', e);
    }
    return null;
  }

  return { init, signInWithGoogle, signOutGoogle, isGoogleLinked, pushNow, checkForRestore, applyCloudSnapshot };
})();
