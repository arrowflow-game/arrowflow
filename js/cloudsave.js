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
    'dailyStreak', 'dailyLastCompletedDate', 'remixHighest', 'remixBestScoreByLevel', 'remixHighestWarnedLap',
    'adsRemovedUntil', 'adsRemovedForever', 'nickname',
    // Synced so reinstalling can't re-farm the one-time link reward - the flag
    // has to travel with the account, not the device.
    'googleLinkRewardGiven'
  ];

  // Fields backed by real money. A restore replaces local state with the
  // cloud's, which would DESTROY anything bought on this device before signing
  // in (paid gems/hints are consumables - Play Billing can't re-grant them like
  // it does non-consumables). These merge instead of being overwritten.
  const MERGE_MAX = ['paidGems', 'paidHints', 'adsRemovedUntil'];
  const MERGE_UNION = ['ownedIapSkins'];
  const MERGE_OR = ['adsRemovedForever'];

  // One-time reward for linking a Google account (see storage.js's
  // googleLinkRewardGiven flag) - small enough not to be worth chasing by
  // sign-out/sign-in cycling (the flag blocks that anyway), just a nudge.
  const LINK_REWARD_GEMS = 20;
  const LINK_REWARD_HINTS = 2;

  const PUSH_DEBOUNCE_MS = 5000;
  // @capacitor-firebase/authentication's signInWithGoogle can never settle at
  // all: on a device whose Google account is in a bad-credential state, Play
  // services' Credential Manager returns neither a result nor an error, so the
  // plugin's promise stays pending and ui.js's button sits disabled on "..."
  // for the rest of the session. Observed on the test tablet (logcat:
  // "GetToken failed ... BadAuthentication" / "Long live credential not
  // available"). Nothing here can fix the account, but it must not hang.
  const SIGNIN_TIMEOUT_MS = 60000;

  function withTimeout(promise, ms) {
    let timer = null;
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('signin_timeout')), ms); })
    ]);
  }
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

  // Firestore hands object fields back in ITS key order, not the order they
  // went up in: levelData round-trips as {score, moves, completed, stars, time}
  // where Storage holds {stars, moves, score, time, completed}. A plain
  // JSON.stringify comparison therefore never matched, so checkForRestore()
  // reported a conflict on every single launch for anyone who had finished even
  // one level - the "your cloud save differs" modal, forever, over nothing.
  // Sorting keys at every depth makes the comparison order-insensitive; array
  // order is left alone, since for arrays it IS meaningful.
  function stableStringify(v) {
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
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
      const result = await withTimeout(plugin.signInWithGoogle(), SIGNIN_TIMEOUT_MS);
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
      // Freshness MUST be sampled before the reward is granted: the reward adds
      // gems, and isFreshLocalState() reads gems === 0. Granting first made
      // every genuinely fresh reinstall look like a conflict, so the one case
      // this whole feature exists for - reinstall, sign in, get your save back
      // silently - showed a "which do you want to keep?" modal instead.
      const wasFresh = isFreshLocalState();
      const conflict = await checkForRestore(wasFresh);
      // Granted after the restore so a restored cloud flag (or a restored gem
      // balance) is what decides, not the pre-restore local state.
      maybeGrantLinkReward();
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
    // Without this the app is left with no Firebase session at all: signOut()
    // clears currentUser, but Leaderboard.ensureInit() caches its promise
    // forever and never signs in again, so score submissions silently fail and
    // a second sign-in attempt throws on a null currentUser - both until the
    // app is restarted. Minting a fresh anonymous session restores the exact
    // state a never-linked player is in.
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        await firebase.auth().signInAnonymously();
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
  async function checkForRestore(freshOverride) {
    if (!linked || typeof firebase === 'undefined') return null;
    try {
      const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
      if (!uid) return null;
      const snap = await firebase.firestore().collection('saves').doc(uid).get();
      if (!snap.exists) return null;
      const cloud = snap.data();

      const fresh = (freshOverride === undefined) ? isFreshLocalState() : freshOverride;
      if (fresh) {
        applyCloudSnapshot(cloud);
        return null;
      }

      const local = snapshotFromStorage();
      // A field the cloud doc simply doesn't carry (written by an older build,
      // before that field was added to SYNCED_FIELDS) is not a difference - it's
      // an absence. Counting it as one would show every already-linked player a
      // conflict modal the first time they launched a version that synced one
      // more field.
      const identical = SYNCED_FIELDS.every(k =>
        !(k in cloud) || stableStringify(local[k] ?? null) === stableStringify(cloud[k] ?? null));
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
      if (cloud[k] === undefined) return;
      const local = Storage.get(k);
      let value = cloud[k];
      if (MERGE_MAX.includes(k)) {
        value = Math.max(Number(local) || 0, Number(cloud[k]) || 0);
      } else if (MERGE_UNION.includes(k)) {
        value = [...new Set([...(Array.isArray(local) ? local : []), ...(Array.isArray(cloud[k]) ? cloud[k] : [])])];
      } else if (MERGE_OR.includes(k)) {
        value = !!local || !!cloud[k];
      }
      Storage.set(k, value);
    });
    location.reload();
  }

  // Permanently deletes the signed-in account: its cloud save, its leaderboard
  // entry, and the Firebase user itself. Required by Google Play for any app
  // that offers account creation (the public web route is delete-account.html).
  //
  // Deliberately NOT best-effort like everything else in this module: a delete
  // that silently half-failed would leave the player's data behind while telling
  // them it was gone, so this reports what actually happened and the caller only
  // wipes local data once the account is really gone.
  //
  // Real-money entitlements are untouched on purpose - they live in the player's
  // Google Play account, not ours, and js/iap.js's restore sweep re-grants them.
  // Returns { ok } or { ok: false, reason }.
  async function deleteAccount() {
    if (typeof firebase === 'undefined') return { ok: false, reason: 'unavailable' };
    const user = firebase.auth().currentUser;
    if (!user || user.isAnonymous) return { ok: false, reason: 'not_signed_in' };
    const uid = user.uid;
    try {
      const db = firebase.firestore();
      // Both docs first, while the credential is still valid: deleting the auth
      // user revokes the token these writes are authorised by, so doing it the
      // other way round would orphan the data permanently with no way back in.
      await db.collection('saves').doc(uid).delete();
      await db.collection('players').doc(uid).delete();
    } catch (e) {
      console.warn('[CloudSave] deleteAccount: data delete failed', e);
      return { ok: false, reason: 'data' };
    }
    try {
      await user.delete();
    } catch (e) {
      // auth/requires-recent-login: Firebase refuses to delete a user whose
      // sign-in is old. The data is already gone at this point, so the honest
      // outcome is "signed out, data deleted, auth record remains" - the player
      // is told to sign in again and repeat, rather than shown a bare failure.
      console.warn('[CloudSave] deleteAccount: user.delete failed', e);
      linked = false;
      try { await signOutGoogle(); } catch {}
      return { ok: false, reason: (e && e.code === 'auth/requires-recent-login') ? 'stale_login' : 'auth' };
    }
    linked = false;
    // user.delete() ends the session, so mint the anonymous one the app expects
    // to always have (same reasoning as signOutGoogle).
    try { await firebase.auth().signInAnonymously(); } catch {}
    return { ok: true };
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

  return { init, signInWithGoogle, signOutGoogle, isGoogleLinked, pushNow, checkForRestore, applyCloudSnapshot, deleteAccount };
})();
