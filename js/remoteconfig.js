/* ============================================
   ArrowFlow 3D — remoteconfig.js
   Firebase Remote Config: a handful of tuning numbers and feature kill
   switches that can be changed from the Firebase console without shipping a
   new build through Play review (which takes days, and reaches players slower
   still - many never update at all).

   WHY THESE KEYS AND NOT MORE
   Every value exposed here is one more thing that can be wrong in production
   in a way that isn't reproducible from the source tree, so this is
   deliberately a short list rather than "make everything configurable":
     - the three kill switches exist because the features behind them are the
       newest and least device-tested (cloud save especially), and turning a
       broken one off in thirty seconds beats an emergency release;
     - the ad and economy numbers are the ones actually worth A/B tuning
       against real players, and they're pure numbers with no code depending
       on their exact value.
   Level design, prices, and anything Play Billing owns stay in the build.

   DEFAULTS ARE THE SOURCE OF TRUTH
   Every key below defaults to the value this app already shipped with, so an
   install that never reaches Firebase - offline, console never touched, this
   whole file failing to load - behaves exactly as it did before Remote Config
   existed. Nothing here is required for the game to run.
   ============================================ */

const RemoteConfig = (() => {
  // Must mirror the constants they replace, one for one. If you change a
  // default here, change it at the original site too (noted per key) - a
  // default that disagrees with the code it feeds is worse than no remote
  // config at all, because it silently changes behaviour on first launch.
  const DEFAULTS = {
    // Kill switches - all on, i.e. current behaviour.
    feature_daily_wheel_enabled: true,
    feature_cloud_save_enabled: true,
    feature_share_enabled: true,

    // Ads. interstitial_min/max feed storage.js's rollInterstitialThreshold()
    // (currently 3-5 levels between interstitials); the two caps feed its
    // DAILY_AD_CAPS (currently 5/day each).
    interstitial_min_levels: 3,
    interstitial_max_levels: 5,
    rewarded_ad_cap_hint: 5,
    rewarded_ad_cap_continue: 5,

    // Economy - storage.js's GEMS_PER_STAR / GEMS_PER_STAR_MILESTONE.
    gems_per_star: 5,
    gems_per_star_milestone: 6,

    // Star pacing - game.js's onWin(). A clear within parTime x the first
    // number keeps 3 stars, within x the second keeps 2 (see
    // [[arrowflow_star_rating_redesign]] for how these were chosen).
    star_pace_fast_multiplier: 3,
    star_pace_ok_multiplier: 6
  };

  let values = { ...DEFAULTS };
  let rc = null;

  function get(key) {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined;
  }

  // Coerces a Remote Config string into the same type as its default, and
  // rejects anything that doesn't survive the trip. A console typo ("five",
  // an empty string, a number where a flag belongs) must fall back to the
  // shipped default rather than propagate a NaN into the ad cadence or the
  // gem math, where it would be far harder to trace back to here.
  function coerce(key, raw) {
    const def = DEFAULTS[key];
    if (typeof def === 'boolean') {
      const s = String(raw).trim().toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0') return false;
      return def;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : def;
  }

  function readAll() {
    const next = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach(key => {
      try {
        const raw = rc.getString(key);
        // An untouched key comes back as the empty string (source 'static'),
        // which must mean "keep the default", not "coerce empty to zero".
        if (raw !== '' && raw != null) next[key] = coerce(key, raw);
      } catch { /* keep the default for this key */ }
    });
    values = next;
  }

  // Pushes whatever is now in `values` into the modules that own the behaviour.
  // Storage takes its numbers through a setter rather than importing this file,
  // so it stays dependency-free the same way it does for js/cloudsave.js (see
  // the _listeners comment in storage.js).
  function apply() {
    try {
      Storage.applyTuning({
        gemsPerStar: get('gems_per_star'),
        gemsPerStarMilestone: get('gems_per_star_milestone'),
        adCapHint: get('rewarded_ad_cap_hint'),
        adCapContinue: get('rewarded_ad_cap_continue'),
        interstitialMin: get('interstitial_min_levels'),
        interstitialMax: get('interstitial_max_levels')
      });
    } catch { /* best-effort, defaults already in place */ }
  }

  // Activate-then-fetch, deliberately in that order: this launch runs on what
  // was fetched LAST launch, and whatever arrives now takes effect on the NEXT
  // one. Values therefore never change underneath a session - a player mid-run
  // can't have their star thresholds or ad cadence shift between one level and
  // the next, which fetch-then-activate would allow.
  async function init() {
    apply(); // defaults first, so everything is consistent even if the rest fails
    try {
      if (typeof firebase === 'undefined' || !firebase.remoteConfig) return;
      const ready = await Leaderboard.ensureInit(); // owns firebase.initializeApp()
      if (!ready) return;
      rc = firebase.remoteConfig();
      rc.defaultConfig = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)]));
      // An hour is Firebase's own production recommendation and is plenty here:
      // nothing in this config is time-critical, and a shorter interval would
      // just spend the player's data to re-download values that rarely change.
      rc.settings = { minimumFetchIntervalMillis: 3600000, fetchTimeoutMillis: 15000 };

      await rc.activate();
      readAll();
      apply();

      // Not awaited - this is groundwork for the next launch, and nothing on
      // screen should wait for it.
      rc.fetch().catch(() => {});
    } catch {
      // Offline, config unreachable, SDK missing - the defaults applied at the
      // top of this function stand, which is exactly the shipped behaviour.
    }
  }

  return { init, get, DEFAULTS };
})();
