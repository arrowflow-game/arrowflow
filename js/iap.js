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
      await plugin().purchaseProduct({
        productIdentifier: entry.productId,
        productType: 'inapp',
        isConsumable
      });
      clearTimeout(failSafeTimer);
      onGranted(entry);
    } catch (err) {
      clearTimeout(failSafeTimer);
      if (!isConsumable && isAlreadyOwnedError(err)) {
        // Already genuinely owned by this account - treat exactly like a
        // fresh successful purchase (same grant path, no re-charge since
        // Google itself didn't charge anything here either).
        onGranted(entry);
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
