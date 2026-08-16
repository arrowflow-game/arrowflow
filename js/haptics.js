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

  return { bump, win, supported };
})();
