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

  // --- Background music: a slow, looping ambient pad, synthesized the same
  // way as the SFX above (no audio files). Four soft chords cycle indefinitely;
  // each note fades in/out with its own envelope so chord changes crossfade
  // smoothly rather than clicking, driven off the Web Audio clock (startTime
  // params), not JS timer precision - the setTimeout below only needs to be
  // roughly on time, not sample-accurate.
  const MUSIC_CHORDS = [
    [261.63, 329.63, 392.00], // C major
    [196.00, 246.94, 293.66], // G major
    [220.00, 261.63, 329.63], // A minor
    [174.61, 220.00, 261.63]  // F major
  ];
  const MUSIC_STEP_DUR = 4.2; // seconds per chord
  const MUSIC_PEAK_GAIN = 0.045; // quiet pad, well under the SFX gains above

  let musicPlaying = false;
  let musicTimer = null;
  let musicGain = null;

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
      amp.connect(musicGain);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }

  function scheduleMusicStep(stepIndex) {
    if (!musicPlaying) return;
    const c = getCtx();
    playChord(MUSIC_CHORDS[stepIndex % MUSIC_CHORDS.length], c.currentTime + 0.02, MUSIC_STEP_DUR);
    musicTimer = setTimeout(() => scheduleMusicStep(stepIndex + 1), MUSIC_STEP_DUR * 1000);
  }

  function startMusic() {
    if (musicPlaying || !musicEnabled()) return;
    musicPlaying = true;
    const c = getCtx();
    musicGain = c.createGain();
    musicGain.gain.value = 1;
    musicGain.connect(c.destination);
    scheduleMusicStep(0);
  }

  function stopMusic() {
    if (!musicPlaying) return;
    musicPlaying = false;
    if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
    if (musicGain) {
      const c = getCtx();
      const gainNode = musicGain;
      // Fade the whole music bus out quickly rather than cutting it off mid-note.
      gainNode.gain.setTargetAtTime(0, c.currentTime, 0.15);
      setTimeout(() => { try { gainNode.disconnect(); } catch (e) {} }, 500);
      musicGain = null;
    }
  }

  // Web Audio keeps running even once the app is backgrounded/minimized (unlike
  // <video>/<audio> elements, the browser/WebView doesn't pause it for you) - without
  // this, background music plays on indefinitely after the player leaves the app.
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

  return { playSlide, playBump, playWin, playFail, startMusic, stopMusic };
})();
