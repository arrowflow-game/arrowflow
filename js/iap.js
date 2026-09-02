/* ============================================
   ArrowFlow 3D — iap.js
   Real Google Play Billing purchases, product families:
     - 4 "remove ads" tiers (7/15/30 days, plus a permanent one)
     - 3 hint packs (10/30/100 hints)
     - 4 gem packs (real money -> gems currency, 2026-08-20)
     - individual skin purchases (SKINS_IAP - the 8 original "royale" skins
       plus, as of 2026-08-20, an altUnlock money-only bypass for all 8
       streak-track skins, see js/skins.js)
     - 3 skin bundles (streak/royale/all, 2026-08-20)
   Native-only, same web/test fallback pattern as js/ads.js - no native
   purchase SDK exists on the plain web build (GitHub Pages) or in headless
   test contexts, so isNative() gates every call there. Unlike ads.js's
   rewarded-ad fallback, this is real money - there is no fake-grant
   equivalent on web (see [[arrowflow_monetization_placeholder]]).

   Every product here is CONSUMABLE except remove_ads_forever, the SKINS_IAP
   entries, and SKIN_BUNDLES (isConsumable: true on purchaseProduct
   auto-consumes the token right after granting entitlement, which is what
   makes re-buying possible at all - Play Billing otherwise permanently
   blocks re-buying an un-consumed one-time product). Skins and bundles,
   like "forever", are permanent non-consumable products - once owned
   they're owned for good, never bought again, and Play Billing itself
   blocks a re-purchase attempt.

   All product IDs below must exist in Play Console → Monetize → Products
   → In-app products with these exact IDs before a real purchase can
   succeed - as of this comment, the 8 streak-skin bypasses, 4 gem packs,
   and 3 bundles are NOT yet created there (same not-yet-created state the
   original 8 royale skin IDs were already in, see [[arrowflow_iap_remove_ads]]) -
   purchases against them fail gracefully (onFailed fires) until they are.
   ============================================ */

const Iap = (() => {
  const ADS_TIERS = {
    '7':       { productId: 'remove_ads_7d',  days: 7 },
    '15':      { productId: 'remove_ads_15d', days: 15 },
    '30':      { productId: 'remove_ads_30d', days: 30 },
    'forever': { productId: 'remove_ads_forever', days: null }
  };

  const HINT_PACKS = {
    '10':  { productId: 'hint_pack_10',  hints: 10 },
    '30':  { productId: 'hint_pack_30',  hints: 30 },
    '100': { productId: 'hint_pack_100', hints: 100 }
  };

  // Real-money gem packs (2026-08-20) - gems bought here land in Storage's
  // separate `paidGems` pool (Storage.grantGems), not the earned `gems` balance,
  // so a reset-progress can wipe earned gems while keeping what was paid for
  // (see storage.js's spendGems()/resetAll()). Storage.getGemsTotal() combines
  // both pools for display and affordability checks, so they still spend
  // identically on any gems-priced skin from the player's point of view.
  // Per-gem price drops as the pack size grows - standard F2P shape, exact
  // Play Console prices decided at product-creation time, not fixed here.
  const GEM_PACKS = {
    '100':  { productId: 'gems_pack_100',  gems: 100 },
    '300':  { productId: 'gems_pack_300',  gems: 300 },
    '800':  { productId: 'gems_pack_800',  gems: 800 },
    '2000': { productId: 'gems_pack_2000', gems: 2000 }
  };

  // Premium skins (js/skins.js's type:'iap' entries, PLUS every streak-track
  // skin's altUnlock as of 2026-08-20, PLUS every level-track skin's
  // altUnlock2 as of 2026-08-21 - a real-money bypass ALONGSIDE the existing
  // gems one, deliberately priced cheaper than the gems price at every tier
  // since gems are farmable for free and money is meant to read as the
  // convenient shortcut, not a discount on top of a discount) - keyed by
  // skin id so callers can go straight from a Skins.ALL entry to a purchase
  // without a second lookup table to keep in sync.
  const SKINS_IAP = {
    royaleneon:      { productId: 'skin_royaleneon' },
    royaleinferno:   { productId: 'skin_royaleinferno' },
    royaleemperor:   { productId: 'skin_royaleemperor' },
    royalevenom:     { productId: 'skin_royalevenom' },
    royalecelestial: { productId: 'skin_royalecelestial' },
    royalebear:      { productId: 'skin_royalebear' },
    royaledog:       { productId: 'skin_royaledog' },
    royalecircuit:   { productId: 'skin_royalecircuit' },
    streakflame:     { productId: 'skin_streakflame' },
    streakstorm:     { productId: 'skin_streakstorm' },
    streakcrown:     { productId: 'skin_streakcrown' },
    streakember:     { productId: 'skin_streakember' },
    streakaurora:    { productId: 'skin_streakaurora' },
    streakcandy:     { productId: 'skin_streakcandy' },
    streakbunny:     { productId: 'skin_streakbunny' },
    streakpanda:     { productId: 'skin_streakpanda' },
    // Level-track altUnlock2 (2026-08-21) - agreed price ladder ฿19/29/49/69
    // grouped 3-skins-per-tier by unlock.value (25-75/100-150/175-225/250-300).
    // Not yet created in Play Console - purchases fail gracefully (onFailed)
    // until the matching products exist there, same as every other
    // not-yet-created product in this file.
    emerald:   { productId: 'skin_emerald' },
    sunset:    { productId: 'skin_sunset' },
    violet:    { productId: 'skin_violet' },
    crimson:   { productId: 'skin_crimson' },
    gold:      { productId: 'skin_gold' },
    mint:      { productId: 'skin_mint' },
    rose:      { productId: 'skin_rose' },
    cyber:     { productId: 'skin_cyber' },
    obsidian:  { productId: 'skin_obsidian' },
    aurora:    { productId: 'skin_aurora' },
    celestial: { productId: 'skin_celestial' },
    legendary: { productId: 'skin_legendary' },
    // Gems-track altUnlock2 (2026-08-23) - mirrors the level-track price
    // ladder above, grouped by unlock.value (300/600/1000/1500 gems). Not
    // yet created in Play Console.
    gemshard:   { productId: 'skin_gemshard' },
    gemopal:    { productId: 'skin_gemopal' },
    gemamber:   { productId: 'skin_gemamber' },
    gemorigami: { productId: 'skin_gemorigami' },
    gemdragon:  { productId: 'skin_gemdragon' },
    gemphoenix: { productId: 'skin_gemphoenix' },
    gemcat:     { productId: 'skin_gemcat' },
    gemdolphin: { productId: 'skin_gemdolphin' }
  };

  // Skin bundles (2026-08-20) - skins only, per the user's explicit scope
  // call (doesn't bundle in remove-ads/hint packs). 'streak' and 'royale'
  // grant every skin in that one track; 'all' grants every skin in the
  // game. Which specific skin ids each key covers is computed in ui.js
  // (js/skins.js's Skins.ALL isn't loaded yet at this file's parse time -
  // script load order in index.html puts iap.js before skins.js - so the
  // membership list has to be resolved by the caller, not baked in here).
  const SKIN_BUNDLES = {
    streak: { productId: 'skin_bundle_streak' },
    royale: { productId: 'skin_bundle_royale' },
    all:    { productId: 'skin_bundle_all' }
  };

  // Every consumable product id in the file - used by sweepStuckConsumables()
  // below to recognize which returned purchases are safe to auto-consume.
  const CONSUMABLE_PRODUCT_IDS = new Set([...Object.values(HINT_PACKS), ...Object.values(GEM_PACKS)].map(e => e.productId));

  // --- Server-side purchase verification (2026-09-02) ---------------------
  // Every branch below that grants an entitlement now also asks the backend
  // (functions/index.js) whether Google agrees the purchase is real. The
  // grant itself is NOT gated on that answer: the player already went through
  // the purchase sheet, and making them wait on - or lose a purchase to - a
  // network round trip would punish paying customers to inconvenience
  // cheaters. Instead we grant immediately and reconcile after, revoking only
  // on a confident "invalid" and retrying anything inconclusive on a later
  // app start (see sweepPendingVerifications()).
  const VERIFY_URL = 'https://us-central1-arrowflow-8d6a8.cloudfunctions.net/verifyPurchase';

  // Reverse index: productId -> how to undo that product's grant. Built from
  // the tables above so it can't drift out of sync with them. Skin bundles are
  // resolved through Skins.bundleIds() at revoke time rather than baked in
  // here, since js/skins.js isn't loaded yet at this file's parse time (same
  // load-order constraint the SKIN_BUNDLES comment describes).
  const REVOKE_BY_PRODUCT = (() => {
    const map = {};
    Object.values(ADS_TIERS).forEach(t => { map[t.productId] = { kind: 'ads', days: t.days }; });
    Object.values(HINT_PACKS).forEach(p => { map[p.productId] = { kind: 'hints', amount: p.hints }; });
    Object.values(GEM_PACKS).forEach(p => { map[p.productId] = { kind: 'gems', amount: p.gems }; });
    Object.entries(SKINS_IAP).forEach(([skinId, e]) => { map[e.productId] = { kind: 'skin', skinId }; });
    Object.entries(SKIN_BUNDLES).forEach(([bundleKey, e]) => { map[e.productId] = { kind: 'bundle', bundleKey }; });
    return map;
  })();

  const cachedPriceLabels = {}; // productId -> localized price string

  function isNative() {
    return typeof Capacitor !== 'undefined' && !!Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  }

  function plugin() {
    return Capacitor.Plugins && Capacitor.Plugins.NativePurchases;
  }

  async function init() {
    if (!isNative()) return;
    try {
      const productIdentifiers = [...Object.values(ADS_TIERS), ...Object.values(HINT_PACKS), ...Object.values(GEM_PACKS), ...Object.values(SKINS_IAP), ...Object.values(SKIN_BUNDLES)].map(t => t.productId);
      const { products } = await plugin().getProducts({ productIdentifiers, productType: 'inapp' });
      (products || []).forEach(p => {
        // Field name isn't consistently documented across plugin versions - try
        // the common ones. Falls back to the hardcoded display prices in ui.js/
        // i18n if the store hasn't returned anything usable for a given product.
        const id = p.identifier || p.productIdentifier || p.productId;
        // priceString/localizedPrice are the currency-formatted strings (e.g. "฿33.00");
        // p.price is a bare number with no currency sign - only fall back to it if
        // neither formatted field is present.
        const price = p.priceString || p.localizedPrice || p.price;
        if (id && price) cachedPriceLabels[id] = price;
      });
    } catch {
      // Best-effort - the purchase functions below still work without cached prices.
    }
    sweepStuckConsumables();
    sweepPendingVerifications();
  }

  // Self-healing: consumable purchases (hint/gem packs) are supposed to be
  // consumed server-side right after granting, which is what lets the same
  // product be bought again. A prior Android plugin bug (fixed in
  // patches/@capgo+native-purchases+*.patch) closed the billing connection
  // before that consume call's async round-trip finished, permanently
  // stranding some already-made purchases as "still owned, never consumed" -
  // the patch only stops NEW purchases from getting stuck, it can't reach
  // back and fix tokens that were already stranded under the old broken
  // code. Every app start, sweep for any leftover unconsumed consumable and
  // consume it - this grants nothing (the player already got, or never got,
  // whatever that old purchase was for), it just unblocks a future purchase
  // attempt of the same product from failing with ITEM_ALREADY_OWNED.
  // Fire-and-forget from init(), best-effort, never surfaces an error to the
  // player - a no-op on every normal app start once nothing is stuck.
  async function sweepStuckConsumables() {
    if (!isNative()) return;
    try {
      const { purchases } = await plugin().getPurchases({ productType: 'inapp' });
      const stuck = (purchases || []).filter(p => {
        const id = p.productIdentifier || p.identifier || p.productId;
        // purchaseState '1' = PURCHASED (Google Play Billing's
        // Purchase.PurchaseState.PURCHASED) - skip PENDING (2) purchases,
        // those aren't stuck, they're still legitimately in progress.
        return id && CONSUMABLE_PRODUCT_IDS.has(id) && String(p.purchaseState) === '1';
      });
      for (const p of stuck) {
        const token = p.purchaseToken || p.transactionId;
        if (!token) continue;
        try {
          await plugin().consumePurchase({ purchaseToken: token });
        } catch {
          // One bad token shouldn't block the rest of the sweep.
        }
      }
    } catch {
      // Best-effort - no sweep this launch is fine, next app start retries.
    }
  }

  // Asks the backend to check this purchase token against Google Play.
  // Resolves to 'valid' | 'invalid' | 'unknown'. 'unknown' covers everything
  // that isn't a verdict about the player - offline, function not deployed,
  // Firebase session not ready, our own 503 - and is always treated as "keep
  // the purchase, ask again later", never as grounds to take anything away.
  async function verifyOnServer(productId, purchaseToken) {
    try {
      // The backend identifies the player by their Firebase ID token, so the
      // auth session has to exist before we can ask anything. Reuses
      // Leaderboard's own init (rather than signing in a second time) since
      // that's the single session this whole app authenticates with - it's
      // also what makes the token a stable identity across a Google link,
      // which is what the replay check on the server keys off.
      const ready = await Leaderboard.ensureInit();
      if (!ready || typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) return 'unknown';
      const user = firebase.auth().currentUser;
      if (!user) return 'unknown';
      const idToken = await user.getIdToken();
      const res = await fetch(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ productId, purchaseToken })
      });
      if (!res.ok) return 'unknown';
      const data = await res.json();
      return data.status === 'valid' ? 'valid' : data.status === 'invalid' ? 'invalid' : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // Undoes the entitlement a rejected productId had granted. Best-effort by
  // design: some of it may already have been spent (gems, hints), and
  // Storage's revoke* mutators clamp at zero rather than going negative -
  // under-collecting is a far better failure than corrupting a balance.
  function revokeEntitlement(productId) {
    const r = REVOKE_BY_PRODUCT[productId];
    if (!r) return;
    if (r.kind === 'ads') Storage.revokeAdsRemoved(r.days);
    else if (r.kind === 'hints') Storage.revokePaidHints(r.amount);
    else if (r.kind === 'gems') Storage.revokePaidGems(r.amount);
    else if (r.kind === 'skin') Storage.revokeIapSkins([r.skinId]);
    else if (r.kind === 'bundle') Storage.revokeIapSkins(Skins.bundleIds(r.bundleKey));
  }

  // Runs verification for one granted purchase and acts on the verdict, and
  // returns that verdict for the sweep's benefit. Never awaited by the purchase
  // flow itself - the player's UI has already moved on by then.
  async function reconcilePurchase(productId, purchaseToken) {
    const verdict = await verifyOnServer(productId, purchaseToken);
    if (verdict === 'valid') {
      Storage.removePendingVerification(purchaseToken);
      return verdict;
    }
    if (verdict === 'unknown') {
      // Queue (idempotently) for a retry on a future app start.
      Storage.addPendingVerification(productId, purchaseToken);
      return verdict;
    }
    // Confident rejection: forged token, refunded/cancelled order, or a real
    // receipt already claimed by a different account.
    Storage.removePendingVerification(purchaseToken);
    revokeEntitlement(productId);
    try { Analytics.logEvent('purchase_verification_failed', { product: productId }); } catch {}
    // Reload rather than trying to repaint whatever screen happens to be open:
    // a revoke can touch skins, currencies and the ads state at once, and this
    // path is rare enough (a real customer should never see it) that
    // correctness of what's on screen matters more than smoothness.
    try { alert(I18N.t('iap.purchase_invalid')); } catch {}
    location.reload();
  }

  // A purchase we still can't get an answer about after this long is given up
  // on - kept, not revoked. The realistic reason for hitting this isn't a
  // month-long outage, it's the backend never having been deployed at all
  // (functions/README.md's setup is deliberately deferrable), and retrying such
  // a purchase forever would only mean a growing queue of requests that are
  // known in advance to fail.
  const PENDING_VERIFICATION_TTL_MS = 30 * 86400000;

  // Retries every purchase left unresolved by an earlier launch. Fire-and-forget
  // from init(), sequential rather than parallel so a long backlog can't fire a
  // burst of requests at the function on a cold start.
  async function sweepPendingVerifications() {
    if (!isNative()) return;
    for (const p of Storage.getPendingVerifications()) {
      if (Date.now() - (p.firstSeen || 0) > PENDING_VERIFICATION_TTL_MS) {
        Storage.removePendingVerification(p.purchaseToken);
        continue;
      }
      const verdict = await reconcilePurchase(p.productId, p.purchaseToken);
      // One inconclusive answer means the backend is unreachable right now, so
      // every remaining entry would answer the same way - stop instead of
      // walking the whole queue to collect identical failures.
      if (verdict === 'unknown') return;
    }
  }

  // priceLabel('7' | '15' | '30' | 'forever') -> localized price string or null.
  function priceLabel(tierKey) {
    const tier = ADS_TIERS[tierKey];
    return (tier && cachedPriceLabels[tier.productId]) || null;
  }

  // hintPackPriceLabel('10' | '30' | '100') -> localized price string or null.
  function hintPackPriceLabel(packKey) {
    const pack = HINT_PACKS[packKey];
    return (pack && cachedPriceLabels[pack.productId]) || null;
  }

  // skinPriceLabel(skinId) -> localized price string or null (mirrors
  // hintPackPriceLabel above - same "real store price, no bare numbers"
  // pattern, see the file header note on currency formatting). Works for
  // BOTH the original royale skins and every streak skin's altUnlock
  // bypass - both live in the same SKINS_IAP dict.
  function skinPriceLabel(skinId) {
    const entry = SKINS_IAP[skinId];
    return (entry && cachedPriceLabels[entry.productId]) || null;
  }

  // gemPackPriceLabel('100' | '300' | '800' | '2000') -> localized price
  // string or null (mirrors hintPackPriceLabel above).
  function gemPackPriceLabel(packKey) {
    const pack = GEM_PACKS[packKey];
    return (pack && cachedPriceLabels[pack.productId]) || null;
  }

  // bundlePriceLabel('streak' | 'royale' | 'all') -> localized price string
  // or null (mirrors skinPriceLabel above).
  function bundlePriceLabel(bundleKey) {
    const bundle = SKIN_BUNDLES[bundleKey];
    return (bundle && cachedPriceLabels[bundle.productId]) || null;
  }

  // ITEM_ALREADY_OWNED fires when re-attempting a non-consumable (a skin,
  // bundle, or the remove-ads-forever tier) this Google account already
  // owns - the exact scenario a player hits after reinstalling the app or
  // switching devices, since Play Billing itself remembers the purchase even
  // though local Storage doesn't. Requires the patched
  // patches/@capgo+native-purchases+*.patch (see postinstall script) - the
  // plugin's unpatched Android code collapses every non-OK billing response
  // code, including this one, into the same generic rejection, making a
  // genuinely-already-owned item indistinguishable from an actual failure
  // or a user-cancelled purchase sheet.
  function isAlreadyOwnedError(err) {
    return !!err && typeof err.message === 'string' && err.message.includes('ITEM_ALREADY_OWNED');
  }

  async function purchaseProductFor(entry, isConsumable, onGranted, onFailed) {
    if (!entry || !isNative()) {
      if (onFailed) onFailed();
      return;
    }
    // Fail-safe: confirmed via device testing that cancelling the native purchase
    // sheet doesn't always reject this plugin's promise on Android - the button
    // stayed disabled forever (no onFailed ever fired) after tapping cancel on a
    // hint-pack purchase. Fall back to onFailed after a timeout so the UI always
    // recovers. A genuine purchase that completes after this still grants
    // normally below (correctness wins over a stuck promise) - only the
    // "failed" reaction is capped to firing once via failedAlready.
    let failedAlready = false;
    const failSafeTimer = setTimeout(() => {
      failedAlready = true;
      if (onFailed) onFailed();
    }, 20000);
    try {
      const tx = await plugin().purchaseProduct({
        productIdentifier: entry.productId,
        productType: 'inapp',
        isConsumable
      });
      clearTimeout(failSafeTimer);
      onGranted(entry);
      // After the grant, never before it - see the VERIFY_URL comment block.
      // On Android the plugin reports Play Billing's purchaseToken as
      // transactionId (NativePurchasesPlugin.handlePurchase puts
      // getPurchaseToken() in that field); without one there's nothing the
      // server could check, so the purchase simply stays unverified.
      const token = tx && (tx.transactionId || tx.purchaseToken);
      if (token) reconcilePurchase(entry.productId, token);
    } catch (err) {
      clearTimeout(failSafeTimer);
      if (!isConsumable && isAlreadyOwnedError(err)) {
        // Already genuinely owned by this account - treat exactly like a
        // fresh successful purchase (same grant path, no re-charge since
        // Google itself didn't charge anything here either). Nothing to
        // verify: Play Billing itself is the one asserting ownership here,
        // and it hands back no token with the rejection anyway.
        onGranted(entry);
        return;
      }
      if (isConsumable && isAlreadyOwnedError(err) && !failedAlready) {
        // Self-heal within the SAME app session: the plugin's own consumeAsync
        // for a prior purchase of this same product (kicked off fire-and-forget
        // from its native handlePurchase(), see sweepStuckConsumables() above)
        // may simply not have finished yet, so Play Billing still sees it as
        // owned. Sweep now and retry once before giving up, rather than making
        // the player force-restart the app just to buy the same hint/gem pack
        // again in one sitting.
        try { await sweepStuckConsumables(); } catch { /* best-effort */ }
        // Fire-and-forget (not awaited) with its own fail-safe timer, same
        // reasoning as the primary attempt's failSafeTimer above: this plugin
        // doesn't always settle its promise on Android, and an awaited retry
        // that never resolves would hang purchaseProductFor forever, leaving
        // the button disabled permanently - reproduced for real with a rapid
        // repeat-tier-purchase test (test29.mp4). If the retry resolves late,
        // after the fail-safe already fired onFailed, still grant it - never
        // silently drop a purchase that actually went through.
        let retryFailedAlready = false;
        const retryFailSafe = setTimeout(() => {
          retryFailedAlready = true;
          if (!failedAlready) { failedAlready = true; if (onFailed) onFailed(); }
        }, 15000);
        plugin().purchaseProduct({ productIdentifier: entry.productId, productType: 'inapp', isConsumable })
          .then((tx) => {
            clearTimeout(retryFailSafe);
            onGranted(entry);
            const token = tx && (tx.transactionId || tx.purchaseToken);
            if (token) reconcilePurchase(entry.productId, token);
          })
          .catch(() => {
            clearTimeout(retryFailSafe);
            if (!retryFailedAlready && !failedAlready) { failedAlready = true; if (onFailed) onFailed(); }
          });
        return;
      }
      // Covers both a real error and the user cancelling the purchase sheet -
      // either way nothing was charged, so just restore the button.
      if (!failedAlready && onFailed) onFailed();
    }
  }

  // purchaseRemoveAds(tierKey, onGranted, onFailed): onGranted(days) fires only
  // after a real completed purchase - days is null for the 'forever' tier.
  // onFailed fires on cancel/error, letting the caller restore its button
  // without granting anything.
  function purchaseRemoveAds(tierKey, onGranted, onFailed) {
    return purchaseProductFor(ADS_TIERS[tierKey], tierKey !== 'forever', (entry) => onGranted(entry.days), onFailed);
  }

  // purchaseHintPack(packKey, onGranted, onFailed): onGranted(hints) fires
  // only after a real completed purchase, with the hint count to grant.
  function purchaseHintPack(packKey, onGranted, onFailed) {
    return purchaseProductFor(HINT_PACKS[packKey], true, (entry) => onGranted(entry.hints), onFailed);
  }

  // purchaseSkin(skinId, onGranted, onFailed): non-consumable like
  // remove_ads_forever - onGranted() fires only after a real completed
  // purchase (caller is responsible for calling Storage.grantIapSkin()).
  // Works for both the original royale skins and every streak skin's
  // altUnlock bypass, since both share the SKINS_IAP dict above.
  function purchaseSkin(skinId, onGranted, onFailed) {
    return purchaseProductFor(SKINS_IAP[skinId], false, () => onGranted(), onFailed);
  }

  // purchaseGemPack(packKey, onGranted, onFailed): onGranted(gems) fires
  // only after a real completed purchase, with the gem count to grant
  // (caller is responsible for calling Storage.grantGems()).
  function purchaseGemPack(packKey, onGranted, onFailed) {
    return purchaseProductFor(GEM_PACKS[packKey], true, (entry) => onGranted(entry.gems), onFailed);
  }

  // purchaseBundle(bundleKey, onGranted, onFailed): non-consumable like
  // purchaseSkin - onGranted() fires only after a real completed purchase.
  // Which skin ids to actually grant is the caller's job (js/ui.js), since
  // this file doesn't have Skins.ALL available (see the SKIN_BUNDLES
  // comment above on load order).
  function purchaseBundle(bundleKey, onGranted, onFailed) {
    return purchaseProductFor(SKIN_BUNDLES[bundleKey], false, () => onGranted(), onFailed);
  }

  return {
    init, priceLabel, hintPackPriceLabel, skinPriceLabel, gemPackPriceLabel, bundlePriceLabel,
    purchaseRemoveAds, purchaseHintPack, purchaseSkin, purchaseGemPack, purchaseBundle, isNative
  };
})();
