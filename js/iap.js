/* ============================================
   ArrowFlow 3D — iap.js
   Real Google Play Billing purchases, two product families:
     - 4 "remove ads" tiers (7/15/30 days, plus a permanent one)
     - 3 hint packs (10/30/100 hints)
   Native-only, same web/test fallback pattern as js/ads.js - no native
   purchase SDK exists on the plain web build (GitHub Pages) or in headless
   test contexts, so isNative() gates every call there. Unlike ads.js's
   rewarded-ad fallback, this is real money - there is no fake-grant
   equivalent on web (see [[arrowflow_monetization_placeholder]]).

   Every product here is CONSUMABLE except remove_ads_forever (isConsumable:
   true on purchaseProduct auto-consumes the token right after granting
   entitlement, which is what makes re-buying possible at all - Play Billing
   otherwise permanently blocks re-buying an un-consumed one-time product).
   "Forever" is the one plain non-consumable product - once owned it's owned
   for good, never needs to be bought again.

   All 7 product IDs below must exist in Play Console → Monetize → Products
   → In-app products with these exact IDs before a real purchase can succeed.
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
      const productIdentifiers = [...Object.values(ADS_TIERS), ...Object.values(HINT_PACKS)].map(t => t.productId);
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

  async function purchaseProductFor(entry, isConsumable, onGranted, onFailed) {
    if (!entry || !isNative()) {
      if (onFailed) onFailed();
      return;
    }
    try {
      await plugin().purchaseProduct({
        productIdentifier: entry.productId,
        productType: 'inapp',
        isConsumable
      });
      onGranted(entry);
    } catch {
      // Covers both a real error and the user cancelling the purchase sheet -
      // either way nothing was charged, so just restore the button.
      if (onFailed) onFailed();
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

  return { init, priceLabel, hintPackPriceLabel, purchaseRemoveAds, purchaseHintPack, isNative };
})();
