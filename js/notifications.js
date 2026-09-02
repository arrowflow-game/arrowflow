/* ============================================
   ArrowFlow 3D — notifications.js
   Local (on-device) reminder notifications - no server, no FCM, nothing sent
   from outside the phone. Everything scheduled here is derived from state the
   app already knows locally (today's Daily Challenge claim, today's free wheel
   spin), which is exactly why local notifications are enough: the reminders are
   deterministic, not driven by anything happening on a backend.

   Native-only and best-effort throughout, same philosophy as js/ads.js and
   js/cloudsave.js - a failure here (permission denied, plugin missing, web
   build) must never surface as an error or block gameplay.
   ============================================ */

const Notifications = (() => {
  // Fixed ids so re-scheduling can cancel the previous copy instead of stacking
  // duplicates - every schedule call fully replaces what it scheduled last time.
  const ID_DAILY_CHALLENGE = 1001;
  const ID_WHEEL_SPIN = 1002;

  // Evening local time, when someone is most likely free to play a short puzzle
  // and still has hours left before the daily reset invalidates their streak.
  const REMINDER_HOUR = 19;

  function plugin() {
    return (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()
      && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications) || null;
  }

  // Next occurrence of REMINDER_HOUR:00 local time - today if it hasn't passed
  // yet, otherwise tomorrow. Deliberately re-computed on every schedule call
  // rather than using the plugin's own repeating schedules: the reminders are
  // conditional ("only if you haven't played today"), and a repeating OS-level
  // schedule would keep firing regardless of that condition once set.
  function nextReminderTime() {
    const t = new Date();
    t.setHours(REMINDER_HOUR, 0, 0, 0);
    if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
    return t;
  }

  // allowPrompt=false means "only proceed if permission was already granted" -
  // used by the app-start refresh so a brand new player never gets an OS
  // permission dialog in their first seconds, with nothing yet explaining why
  // notifications would be useful. The first real prompt instead comes from the
  // engagement moments that call refresh() with prompting allowed (finishing a
  // Daily Challenge / spinning the wheel), where "remind me tomorrow" is
  // self-evidently the point.
  async function ensurePermission(allowPrompt) {
    const p = plugin();
    if (!p) return false;
    try {
      const status = await p.checkPermissions();
      if (status.display === 'granted') return true;
      if (status.display === 'denied') return false; // don't re-prompt a hard denial
      if (!allowPrompt) return false;
      const asked = await p.requestPermissions();
      return asked.display === 'granted';
    } catch {
      return false;
    }
  }

  // Cancels and re-schedules both reminders from current Storage state. Safe to
  // call as often as convenient (app start, after finishing the Daily Challenge,
  // after spinning the wheel) - it always clears the previous pair first, so
  // repeat calls can't pile up duplicate notifications.
  async function refresh(allowPrompt) {
    const p = plugin();
    if (!p) return;
    try {
      const granted = await ensurePermission(allowPrompt === true);
      if (!granted) return;

      await p.cancel({ notifications: [{ id: ID_DAILY_CHALLENGE }, { id: ID_WHEEL_SPIN }] });

      const at = nextReminderTime();
      const pending = [];

      if (!Storage.isDailyCompletedToday()) {
        pending.push({
          id: ID_DAILY_CHALLENGE,
          title: I18N.t('notif.daily_title'),
          body: I18N.t('notif.daily_body'),
          schedule: { at }
        });
      }
      if (Storage.isWheelFreeSpinAvailable()) {
        pending.push({
          id: ID_WHEEL_SPIN,
          title: I18N.t('notif.wheel_title'),
          body: I18N.t('notif.wheel_body'),
          // Staggered an hour after the daily-challenge nudge so a player who
          // has both pending doesn't get two notifications in the same minute.
          schedule: { at: new Date(at.getTime() + 60 * 60 * 1000) }
        });
      }

      if (pending.length) await p.schedule({ notifications: pending });
    } catch {
      // Best-effort - see file header.
    }
  }

  async function cancelAll() {
    const p = plugin();
    if (!p) return;
    try {
      await p.cancel({ notifications: [{ id: ID_DAILY_CHALLENGE }, { id: ID_WHEEL_SPIN }] });
    } catch {}
  }

  return { refresh, cancelAll };
})();
