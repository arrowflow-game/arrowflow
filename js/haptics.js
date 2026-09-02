/* ============================================
   ArrowFlow 3D — haptics.js
   Vibration feedback via the Vibration API. Note this is a no-op on iOS Safari
   (Apple doesn't implement navigator.vibrate at all, web or PWA) - it only has
   an effect on Android. Kept as its own toggle/module separate from Sound
   since it's a distinct sense the player may want off independently of audio.
   ============================================ */

const Haptics = (() => {
  function supported() {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  function enabled() {
    return Storage.get('vibration') !== false;
  }

  function fire(pattern) {
    if (!enabled() || !supported()) return;
    navigator.vibrate(pattern);
  }

  function bump() { fire(60); }
  function win() { fire([40, 30, 40, 30, 90]); }
  // Color-Match Combo (2026-09-02): a single short, light pulse per chained clear -
  // deliberately shorter/lighter than bump() (that one signals "wrong guess", this
  // one signals "nice, keep going") so the two never feel interchangeable.
  function combo() { fire(25); }

  return { bump, win, combo, supported };
})();
