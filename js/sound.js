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
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function sfxEnabled() {
    return Storage.get('sound') !== false;
  }

  function musicEnabled() {
    return Storage.get('music') !== false;
  }

  // One oscillator with a short exponential decay envelope, optionally sliding
  // its frequency from startFreq to endFreq over the note's lifetime.
  function tone(startFreq, endFreq, duration, type, startTime, gain) {
    const c = getCtx();
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, startTime);
    if (endFreq !== startFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
    amp.gain.setValueAtTime(gain, startTime);
    amp.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(amp);
    amp.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function playSlide() {
    if (!sfxEnabled()) return;
    const c = getCtx();
    tone(520, 900, 0.14, 'triangle', c.currentTime, 0.18);
  }

  function playBump() {
    if (!sfxEnabled()) return;
    const c = getCtx();
    tone(180, 90, 0.16, 'sawtooth', c.currentTime, 0.16);
  }

  function playWin() {
    if (!sfxEnabled()) return;
    const c = getCtx();
    // A quick rising arpeggio, one short note per step.
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone(freq, freq, 0.16, 'triangle', c.currentTime + i * 0.09, 0.15);
    });
  }

  function playFail() {
    if (!sfxEnabled()) return;
    const c = getCtx();
    tone(300, 120, 0.45, 'sawtooth', c.currentTime, 0.15);
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
    playTrack(pendingTrackPath || pickTrackPath('normal'), true);
  }

  function stopMusic() {
    if (!musicPlaying) return;
    musicPlaying = false;
    clearFades();
    if (currentAudioEl) { releaseAudio(currentAudioEl); currentAudioEl = null; }
    currentTrackPath = null;
    stopFallbackMusic();
  }

  // pauseMusic/resumeMusic: like stopMusic/startMusic but preserve playback
  // position - for brief mid-level detours (Store/Skins opened from the
  // in-game HUD) that aren't really "leaving the level", so the same track
  // just continues where it left off instead of releasing the <audio>
  // element and fading a brand new one in from 0:00 (reported directly as
  // "music restarts every time" going into Store/Skins and back). Real
  // level exits still go through stopMusic/startMusic via showScreen().
  function pauseMusic() {
    if (!musicPlaying) return;
    musicPlaying = false;
    clearFades();
    if (currentAudioEl) currentAudioEl.pause();
    if (usingFallbackSynth) stopFallbackMusic();
  }

  function resumeMusic() {
    if (musicPlaying || !musicEnabled()) return;
    musicPlaying = true;
    if (currentAudioEl) currentAudioEl.play().catch(() => {});
    else startMusic();
  }

  // <audio> elements (unlike a bare AudioContext) already pause themselves
  // when backgrounded on most platforms, but the synth fallback's oscillators
  // keep running via the shared AudioContext - suspend/resume that explicitly.
  let wasMusicPlaying = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      wasMusicPlaying = musicPlaying;
      stopMusic();
      if (ctx && ctx.state === 'running') ctx.suspend();
    } else {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (wasMusicPlaying) startMusic();
    }
  });

  return { playSlide, playBump, playWin, playFail, startMusic, stopMusic, pauseMusic, resumeMusic, setLevelContext };
})();
