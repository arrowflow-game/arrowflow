/* ============================================
   ArrowFlow 3D — sound.js
   Synthesized via Web Audio (no audio files/assets), so every effect is a
   couple oscillator+gain envelopes shaped to read as "slide", "bump", "win",
   "fail" - not meant to be musical, just quick game-feel feedback.
   ============================================ */

const Sound = (() => {
  let ctx = null;

  function getCtx() {
    // Created lazily on first play() call, which only ever happens inside a
    // real user-gesture handler (a tap/click) - browsers block AudioContext
    // autoplay otherwise, so there's no separate "unlock" step needed.
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Don't undo handleAppBackground()'s suspend - see the isBackgrounded
    // guards on the play*() functions below for why this matters.
    if (ctx.state === 'suspended' && !isBackgrounded) ctx.resume();
    return ctx;
  }

  function sfxEnabled() {
    return Storage.get('sound') !== false;
  }

  function musicEnabled() {
    return Storage.get('music') !== false;
  }

  // Bumps every SFX tone's gain relative to the (now loudness-normalized)
  // music tracks - user asked to try SFX "2 levels" louder than music as a
  // first pass; a single multiplier here keeps every SFX call's relative
  // balance intact while making it trivial to try a different level later.
  const SFX_GAIN_BOOST = 1.3;

  // One oscillator with a short exponential decay envelope, optionally sliding
  // its frequency from startFreq to endFreq over the note's lifetime.
  //
  // Guarded against isBackgrounded (2026-08-26, reported directly: spinning
  // the Wheel then immediately switching apps/locking the phone let the
  // reward chime play out loud in the background) - the Wheel's prize reveal
  // fires from a setTimeout() that keeps running while backgrounded, and
  // getCtx() below unconditionally resumes a suspended AudioContext, which
  // undid handleAppBackground()'s suspend for exactly that one delayed call.
  // Skipping here covers every SFX call site through this single choke point.
  function tone(startFreq, endFreq, duration, type, startTime, gain) {
    if (isBackgrounded) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
    amp.gain.setValueAtTime(gain * SFX_GAIN_BOOST, startTime);
    amp.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(amp);
    amp.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function playSlide() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    tone(520, 900, 0.14, 'triangle', c.currentTime, 0.18);
  }

  function playBump() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    tone(180, 90, 0.16, 'sawtooth', c.currentTime, 0.16);
  }

  function playWin() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    // A quick rising arpeggio, one short note per step.
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone(freq, freq, 0.16, 'triangle', c.currentTime + i * 0.09, 0.15);
    });
  }

  // Lock-Key mechanic (2026-08-31) - deliberately NOT playBump()'s harsh sawtooth
  // (that reads as "wrong guess, you lost a heart"; a locked tap costs nothing and
  // is expected, not a mistake) - a soft two-note "not yet" tick instead.
  function playLockedDeny() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    tone(340, 340, 0.08, 'sine', c.currentTime, 0.12);
    tone(260, 260, 0.1, 'sine', c.currentTime + 0.09, 0.12);
  }

  function playFail() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    tone(300, 120, 0.45, 'sawtooth', c.currentTime, 0.15);
  }

  // Daily wheel SFX (2026-08-25) - deliberately separate from the game's
  // background music, which pauses (Sound.pauseMusic()) for the whole wheel
  // flow rather than mixing with it. A quick descending tick-tick-tick, one
  // note per wedge tick, for the spin itself.
  function playWheelSpin() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    [880, 830, 780, 740].forEach((freq, i) => {
      tone(freq, freq, 0.06, 'square', c.currentTime + i * 0.08, 0.08);
    });
  }

  // Reward reveal chime - same rising-arpeggio shape as playWin() but its own
  // function so wheel-prize logic never has to piggyback on level-win logic.
  function playWheelWin() {
    if (!sfxEnabled() || isBackgrounded) return;
    const c = getCtx();
    [659.25, 830.61, 1046.5, 1318.51].forEach((freq, i) => {
      tone(freq, freq, 0.18, 'triangle', c.currentTime + i * 0.1, 0.16);
    });
  }

  // --- Background music: real mp3 tracks (from Suno), multiple per context,
  // randomized per level so it doesn't get repetitive - see setLevelContext().
  // Falls back to a synthesized ambient chord loop (the original approach)
  // whenever a track file is missing/fails to load, so the game never goes
  // silent or errors out before the real audio files are actually in place.
  const MUSIC_TRACKS = {
    normal: ['audio/music-normal-1.mp3', 'audio/music-normal-2.mp3', 'audio/music-normal-3.mp3',
             'audio/music-normal-4.mp3', 'audio/music-normal-5.mp3', 'audio/music-normal-6.mp3'],
    milestone: ['audio/music-milestone-1.mp3', 'audio/music-milestone-2.mp3'],
    daily: ['audio/music-daily-1.mp3', 'audio/music-daily-2.mp3']
  };
  const MUSIC_VOLUME = 0.5;
  const MUSIC_FADE_SEC = 1.2;

  let musicPlaying = false;
  let currentAudioEl = null;
  let currentTrackPath = null;
  let pendingTrackPath = null; // set by setLevelContext() before music has actually started
  let fadeIntervals = [];
  let usingFallbackSynth = false;
  // Bumped by pauseMusic()/stopMusic() so an in-flight resumeMusic() recovery
  // (see below) can tell it's been superseded by a later pause/resume and
  // must not fight it.
  let resumeGeneration = 0;

  function clearFades() {
    fadeIntervals.forEach(clearInterval);
    fadeIntervals = [];
  }

  function fadeVolume(el, from, to, seconds, onDone) {
    const steps = 20;
    const stepMs = (seconds * 1000) / steps;
    let i = 0;
    el.volume = from;
    const timer = setInterval(() => {
      i++;
      el.volume = from + (to - from) * (i / steps);
      if (i >= steps) {
        clearInterval(timer);
        el.volume = to;
        if (onDone) onDone();
      }
    }, stepMs);
    fadeIntervals.push(timer);
  }

  function pickTrackPath(trackKey) {
    const pool = MUSIC_TRACKS[trackKey] || MUSIC_TRACKS.normal;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function desiredTrackKey(mode, isMilestone) {
    if (mode === 'daily') return 'daily';
    if (isMilestone) return 'milestone';
    return 'normal';
  }

  // --- Fallback: original synthesized ambient chord loop, unchanged.
  const MUSIC_CHORDS = [
    [261.63, 329.63, 392.00], // C major
    [196.00, 246.94, 293.66], // G major
    [220.00, 261.63, 329.63], // A minor
    [174.61, 220.00, 261.63]  // F major
  ];
  const MUSIC_STEP_DUR = 4.2; // seconds per chord
  const MUSIC_PEAK_GAIN = 0.045; // quiet pad, well under the SFX gains above

  let fallbackTimer = null;
  let fallbackGain = null;

  function playChord(freqs, startTime, duration) {
    const c = getCtx();
    freqs.forEach(freq => {
      const osc = c.createOscillator();
      const amp = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(0.0001, startTime);
      amp.gain.exponentialRampToValueAtTime(MUSIC_PEAK_GAIN, startTime + 1.0);
      amp.gain.setValueAtTime(MUSIC_PEAK_GAIN, startTime + duration - 1.4);
      amp.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      osc.connect(amp);
      amp.connect(fallbackGain);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  function scheduleFallbackStep(stepIndex) {
    if (!usingFallbackSynth) return;
    const c = getCtx();
    playChord(MUSIC_CHORDS[stepIndex % MUSIC_CHORDS.length], c.currentTime + 0.02, MUSIC_STEP_DUR);
    fallbackTimer = setTimeout(() => scheduleFallbackStep(stepIndex + 1), MUSIC_STEP_DUR * 1000);
  }

  function startFallbackMusic() {
    if (usingFallbackSynth) return;
    usingFallbackSynth = true;
    const c = getCtx();
    fallbackGain = c.createGain();
    fallbackGain.gain.value = 1;
    fallbackGain.connect(c.destination);
    scheduleFallbackStep(0);
  }

  function stopFallbackMusic() {
    if (!usingFallbackSynth) return;
    usingFallbackSynth = false;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (fallbackGain) {
      const c = getCtx();
      const gainNode = fallbackGain;
      gainNode.gain.setTargetAtTime(0, c.currentTime, 0.15);
      setTimeout(() => { try { gainNode.disconnect(); } catch (e) {} }, 500);
      fallbackGain = null;
    }
  }

  // Pausing an <audio> element alone doesn't free its decoded/buffered data in
  // every browser - clearing src and calling load() releases it for real.
  // Without this, every level/context change (crossfadeTo) leaked the outgoing
  // track's buffer, growing memory over a long session (reported directly as
  // the game feeling increasingly laggy the longer it was played).
  function releaseAudio(el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }

  // --- Real-file playback, with the fallback wired into its error path.
  function playTrack(path, fadeIn) {
    currentTrackPath = path;
    const audio = new Audio(path);
    audio.loop = true;
    audio.volume = fadeIn ? 0 : MUSIC_VOLUME;
    audio.addEventListener('error', () => {
      if (currentAudioEl === audio) { currentAudioEl = null; currentTrackPath = null; }
      startFallbackMusic();
    });
    audio.play().catch(() => {}); // startMusic() only ever runs from a real screen-change/user action
    currentAudioEl = audio;
    if (fadeIn) fadeVolume(audio, 0, MUSIC_VOLUME, MUSIC_FADE_SEC);
  }

  function crossfadeTo(path) {
    clearFades();
    const outgoing = usingFallbackSynth ? null : currentAudioEl;
    const wasFallback = usingFallbackSynth;
    playTrack(path, true);
    if (wasFallback) stopFallbackMusic();
    else if (outgoing) fadeVolume(outgoing, outgoing.volume, 0, MUSIC_FADE_SEC, () => releaseAudio(outgoing));
  }

  // Called whenever a level (or daily/remix run) is loaded - see js/game.js's
  // applyLevelState(). Picks which track SHOULD be playing for this context;
  // only actually swaps audio if it differs from what's currently playing.
  function setLevelContext(mode, isMilestone) {
    const path = pickTrackPath(desiredTrackKey(mode, isMilestone));
    pendingTrackPath = path; // always kept current, so a later mute->unmute (no new level load in between) resumes on the right track
    if (!musicPlaying) return;
    if (path === currentTrackPath) return; // same file already playing, let it continue
    crossfadeTo(path);
  }

  function startMusic() {
    if (musicPlaying || !musicEnabled()) return;
    musicPlaying = true;
    // Safety net (2026-08-26, reported directly: tapping the Wheel/Store
    // buttons left music "starting over, overlapping, again and again", and
    // backgrounding the app didn't stop it either): if a previous track's
    // <audio> is still sitting in currentAudioEl - e.g. a pause that got
    // desynced from actual native playback state during an app
    // background/foreground cycle - release it before creating a new one, so
    // two tracks can never play at once outside of crossfadeTo()'s
    // deliberate brief overlap.
    if (currentAudioEl) { releaseAudio(currentAudioEl); currentAudioEl = null; }
    playTrack(pendingTrackPath || pickTrackPath('normal'), true);
  }

  function stopMusic() {
    resumeGeneration++;
    if (!musicPlaying) return;
    musicPlaying = false;
    clearFades();
    if (currentAudioEl) { releaseAudio(currentAudioEl); currentAudioEl = null; }
    currentTrackPath = null;
    stopFallbackMusic();
  }

  // isMusicPlaying(): lets a caller that's about to pauseMusic() for its own
  // reason (e.g. ui.js wrapping a rewarded/interstitial ad) remember whether
  // it should resumeMusic() again afterward, rather than unconditionally
  // resuming into a context (like the Wheel modal) that wants to stay paused.
  function isMusicPlaying() {
    return musicPlaying;
  }

  // pauseMusic/resumeMusic: like stopMusic/startMusic but preserve playback
  // position - for brief mid-level detours (Store/Skins opened from the
  // in-game HUD) that aren't really "leaving the level", so the same track
  // just continues where it left off instead of releasing the <audio>
  // element and fading a brand new one in from 0:00 (reported directly as
  // "music restarts every time" going into Store/Skins and back). Real
  // level exits still go through stopMusic/startMusic via showScreen().
  function pauseMusic() {
    resumeGeneration++;
    if (!musicPlaying) return;
    musicPlaying = false;
    clearFades();
    if (currentAudioEl) currentAudioEl.pause();
    if (usingFallbackSynth) stopFallbackMusic();
  }

  function resumeMusic() {
    if (musicPlaying || !musicEnabled()) return;
    // Bug (reported directly: music silent on cold start, only started
    // working after toggling the music setting off/on): this used to set
    // musicPlaying = true BEFORE falling back to startMusic() when there
    // was no currentAudioEl yet (i.e. every very first entry into the game
    // screen, since no track has ever played) - startMusic() itself opens
    // with `if (musicPlaying ...) return;`, so it always saw musicPlaying
    // already true and silently no-opped, never actually creating/playing
    // any <audio>. Only let startMusic() own that flag in this branch.
    if (currentAudioEl) {
      // Only set musicPlaying once play() actually succeeds - it used to be
      // set true right before calling play() (to satisfy the cold-start fix
      // above), but a rejected play() (e.g. right after a native rewarded-ad
      // activity hands focus back, before the WebView has a fresh user-gesture)
      // left musicPlaying stuck true with nothing actually playing - every
      // later resumeMusic() call then no-opped on the `if (musicPlaying...)`
      // guard above, silent until the player toggled the music setting
      // off/on. Reported directly: "music stops after watching a rewarded ad,
      // have to toggle music off/on to get it back."
      // Bug (reported directly: music stays silent forever after 1+ hour
      // backgrounded, even after tapping "เล่นต่อ" - only fixable by toggling
      // the music setting off/on): a long enough background period lets the
      // browser/WebView discard this <audio> element's decoded media, so
      // .play() rejects. Previously swallowed by a bare .catch(() => {}),
      // leaving currentAudioEl pointing at a permanently-broken element -
      // since it's still non-null, every later resumeMusic() call hit this
      // exact same doomed branch forever. Toggling the music setting only
      // "fixed" it because stopMusic() nulls currentAudioEl, forcing the
      // following startMusic() through playTrack()'s fresh-Audio() path.
      // Reproduce that same recovery here directly, without touching the
      // music Storage setting or requiring the Settings screen.
      const staleEl = currentAudioEl;
      const myGeneration = ++resumeGeneration;
      let settled = false;
      const recover = () => {
        // Superseded by a later pause/stop/resume - don't fight it.
        if (settled || myGeneration !== resumeGeneration) return;
        settled = true;
        releaseAudio(staleEl);
        if (currentAudioEl === staleEl) currentAudioEl = null;
        startMusic();
      };
      staleEl.play().then(() => {
        if (settled || myGeneration !== resumeGeneration) return;
        settled = true;
        musicPlaying = true;
      }).catch(recover);
      // Failsafe (same "never silently swallow" reasoning as iap.js's 20s
      // purchase timeout, just far shorter since this is inaudible music,
      // not a charged purchase): play()'s rejection contract is normally
      // reliable, but this exact function has already been bitten twice by
      // WebView-specific async edge cases (see the comment above) - don't
      // bet an indefinite silent-music hang on a promise that might not
      // settle here either.
      setTimeout(recover, 1500);
    } else {
      startMusic();
    }
  }

  // <audio> elements (unlike a bare AudioContext) already pause themselves
  // when backgrounded on most platforms, but the synth fallback's oscillators
  // keep running via the shared AudioContext - suspend/resume that explicitly.
  //
  // Reported directly (2026-08-26): switching apps left music playing
  // continuously instead of pausing. document.visibilitychange alone isn't a
  // reliable background/foreground signal inside a real Capacitor WebView -
  // Capacitor's own docs recommend the native App plugin's appStateChange
  // event for exactly this reason. Both listeners now feed the same
  // idempotent handlers (guarded by isBackgrounded) so whichever fires first
  // on a given platform wins and the other is just a no-op, rather than
  // risking a double-pause/double-resume race between the two APIs.
  //
  // Deliberately does NOT auto-resume music on returning to the foreground
  // (2026-08-27, test47.mp4: a phone call or the screen simply locking
  // mid-level should act exactly like tapping Pause, including needing an
  // explicit "เล่นต่อ" tap to get going again - not quietly resuming the
  // instant the OS hands focus back). ui.js's own background/foreground
  // listener now drives the real pause modal for that case, whose btn-resume
  // handler already calls resumeMusic() itself. Every other music-pausing
  // context (Store/Skins/Wheel) already requires its own explicit close/back
  // tap to resume too, so this only removes the one case that used to skip
  // that requirement.
  let isBackgrounded = false;
  function handleAppBackground() {
    if (isBackgrounded) return;
    isBackgrounded = true;
    pauseMusic();
    if (ctx && ctx.state === 'running') ctx.suspend();
  }
  function handleAppForeground() {
    if (!isBackgrounded) return;
    isBackgrounded = false;
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) handleAppBackground();
    else handleAppForeground();
  });
  if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App) {
    Capacitor.Plugins.App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) handleAppForeground();
      else handleAppBackground();
    });
  }

  // Cold-start fix: getCtx()'s ctx.resume() is async, so the very first SFX
  // triggered right after page load can get scheduled before the context is
  // actually running and silently drop (reported as "no sound until I toggle
  // sound off/on" - by then resume() had finished, so it was never really
  // about the toggle). Warm the context up on the earliest possible real user
  // gesture instead of waiting for the first deliberate sound trigger.
  function warmUpOnce() {
    getCtx();
  }
  document.addEventListener('pointerdown', warmUpOnce, { once: true });
  document.addEventListener('touchstart', warmUpOnce, { once: true });

  return { playSlide, playBump, playLockedDeny, playWin, playFail, playWheelSpin, playWheelWin, startMusic, stopMusic, pauseMusic, resumeMusic, isMusicPlaying, setLevelContext };
})();
