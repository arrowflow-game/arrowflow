/* ============================================
   ArrowFlow 3D — tutorial.js
   First-run interactive tutorial, shown only the very first time level 1 is
   played (gated on Storage's 'tutorialSeen' flag, same persistence pattern as
   'currentLevel'/'levelData'). Teaches 5 things in sequence, each step only
   advancing once the player actually performs the action (or, for the
   "wrong tap loses a heart" step, watches a scripted demo - see the note on
   that step below for why a real forced-wrong-tap wasn't used).

   Pure UI layer: never mutates real level/path/lives state. Hooks into
   Game.setOnEvent() and Scene3D.setOnGesture(), both additive/optional hooks
   that don't change normal gameplay when nothing is listening.
   ============================================ */

const Tutorial = (() => {
  function centerRect(size, topFrac) {
    const left = window.innerWidth / 2 - size / 2;
    const top = window.innerHeight * topFrac;
    return { left, top, width: size, height: size };
  }

  const STEPS = [
    {
      id: 'tap',
      icon: '👆',
      titleKey: 'tutorial.tap.title',
      textKey: 'tutorial.tap.text',
      getRect: () => centerRect(260, 0.30),
      mode: 'event',
      waitEvents: ['tap-success']
    },
    {
      id: 'rotate',
      icon: '🔄',
      titleKey: 'tutorial.rotate.title',
      textKey: 'tutorial.rotate.text',
      getRect: () => centerRect(300, 0.26),
      mode: 'gesture',
      gestureType: 'rotate',
      threshold: 35
    },
    {
      id: 'zoom',
      icon: '🔍',
      titleKey: 'tutorial.zoom.title',
      textKey: 'tutorial.zoom.text',
      getRect: () => centerRect(300, 0.26),
      mode: 'gesture',
      gestureType: 'zoom',
      threshold: 6
    },
    {
      id: 'hint',
      icon: '💡',
      titleKey: 'tutorial.hint.title',
      textKey: 'tutorial.hint.text',
      getRect: () => {
        const el = document.getElementById('btn-hint');
        const r = el.getBoundingClientRect();
        return { left: r.left - 8, top: r.top - 8, width: r.width + 16, height: r.height + 16 };
      },
      circle: true,
      mode: 'domclick',
      clickTargetId: 'btn-hint'
    },
    {
      id: 'wrong-tap',
      icon: '💔',
      titleKey: 'tutorial.wrong_tap.title',
      textKey: 'tutorial.wrong_tap.text',
      getRect: () => {
        const el = document.getElementById('hud-lives-row');
        const r = el.getBoundingClientRect();
        return { left: r.left - 10, top: r.top - 8, width: r.width + 20, height: r.height + 16 };
      },
      // Demonstration only - level 1 is the simplest onboarding layout and may
      // have zero naturally-blocked paths at start (see ONBOARDING_SINGLE_CUBE_THROUGH
      // in tools/generate_campaign.py), so this step can't reliably wait for a real
      // blocked tap. Rather than force-flag a real path as blocked for one tap (which
      // risks a stray real heart loss if the timing/restore ever slips), it plays a
      // purely visual demo - a heart icon "breaking" - that never touches Game's
      // actual state, then a button lets the player continue when ready.
      mode: 'demo',
      continueLabelKey: 'tutorial.wrong_tap.continue'
    }
  ];

  let active = false;
  let stepIndex = 0;
  let gestureAccum = 0;
  let els = {};
  let repositionHandler = null;
  let hintsAtStart = 0;
  let tapHighlightInterval = null;

  function init() {
    if (typeof Game !== 'undefined' && Game.setOnEvent) Game.setOnEvent(handleGameEvent);
    if (typeof Scene3D !== 'undefined' && Scene3D.setOnGesture) Scene3D.setOnGesture(handleGesture);
  }

  function handleGameEvent(name, data) {
    if (name === 'level-loaded') {
      maybeStart(data);
      return;
    }
    if (name === 'combo-first') {
      showOneShotCoach({
        flagKey: 'comboTutorialSeen',
        icon: '🔥',
        titleKey: 'tutorial.combo.title',
        textKey: 'tutorial.combo.text',
        getRect: () => {
          const el = document.getElementById('hud-combo-badge');
          const r = el.getBoundingClientRect();
          return { left: r.left - 8, top: r.top - 8, width: r.width + 16, height: r.height + 16 };
        }
      });
      return;
    }
    if (name === 'locked-tap') {
      // Fired every time a still-locked path is tapped (see game.js's handlePathTap)
      // - showOneShotCoach() itself no-ops instantly if lockKeyTutorialSeen is
      // already true, so it's cheap to just always call this rather than tracking a
      // separate "have I shown it yet" flag here too. The key path is already
      // highlighted by game.js's own Scene3D.highlightPath() call for this same
      // event, independent of whether the coach-mark shows - re-highlight it a
      // little longer here on the FIRST-ever encounter specifically, so a brand new
      // player has time to actually read the popup and then still see which path it
      // was pointing at.
      if (!Storage.get('lockKeyTutorialSeen')) {
        Scene3D.highlightPath(data.keyPathId, false);
        showOneShotCoach({
          flagKey: 'lockKeyTutorialSeen',
          icon: '🔒',
          titleKey: 'tutorial.lockkey.title',
          textKey: 'tutorial.lockkey.text',
          getRect: () => centerRect(280, 0.42)
        });
      }
      return;
    }
    if (name === 'golden-available') {
      // Unlike the combo coach-mark, the golden glow is already visible in the 3D
      // scene the instant the level loads (see game.js's applyLevelState / scene.js's
      // persistent per-frame glow) - a small delay lets that first frame actually
      // paint before spotlighting anything, matching the level-1 tutorial's own
      // "let the HUD/scene finish loading in" pattern (see maybeStart() below).
      setTimeout(() => {
        showOneShotCoach({
          flagKey: 'goldenTutorialSeen',
          icon: '⭐',
          titleKey: 'tutorial.golden.title',
          textKey: 'tutorial.golden.text',
          getRect: () => centerRect(280, 0.42)
        });
      }, 350);
      return;
    }
    if (!active) return;
    const step = STEPS[stepIndex];
    if (step.mode === 'event' && step.waitEvents.includes(name)) advanceStep();
  }

  // Lightweight one-shot coach-mark for mechanics that unlock mid-campaign (combo/
  // golden/lock-key - see arrowflow-level-mechanics plan, 2026-08-31), reusing the
  // same spotlight+bubble CSS as the level-1 STEPS tutorial above but as a single,
  // non-blocking dismissable popup rather than a multi-step forced sequence - these
  // mechanics don't need to teach a new physical ACTION (tap/rotate/zoom), just what
  // a new HUD element means, so one "got it" tap is enough.
  let oneShotActive = false;
  function showOneShotCoach(opts) {
    if (Storage.get(opts.flagKey)) return;
    if (active || oneShotActive) return; // never stack on top of the level-1 tutorial or another coach-mark
    oneShotActive = true;

    const overlay = document.createElement('div');
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML =
      '<div class="tutorial-spotlight' + (opts.circle ? ' circle' : '') + '"></div>' +
      '<div class="tutorial-bubble">' +
        '<div class="tutorial-icon"></div>' +
        '<h3></h3><p></p>' +
        '<button class="btn btn-primary btn-sm"></button>' +
      '</div>';
    document.body.appendChild(overlay);

    const spotlight = overlay.querySelector('.tutorial-spotlight');
    const bubble = overlay.querySelector('.tutorial-bubble');
    overlay.querySelector('.tutorial-icon').textContent = opts.icon;
    overlay.querySelector('h3').textContent = I18N.t(opts.titleKey);
    overlay.querySelector('p').textContent = I18N.t(opts.textKey);
    const btn = overlay.querySelector('button');
    btn.textContent = I18N.t('tutorial.got_it');

    function position() {
      const r = opts.getRect();
      spotlight.style.left = r.left + 'px';
      spotlight.style.top = r.top + 'px';
      spotlight.style.width = r.width + 'px';
      spotlight.style.height = r.height + 'px';
      const bubbleH = bubble.offsetHeight || 160;
      const spotCenterY = r.top + r.height / 2;
      const top = spotCenterY > window.innerHeight / 2
        ? Math.max(16, r.top - bubbleH - 20)
        : Math.min(window.innerHeight - bubbleH - 16, r.top + r.height + 20);
      bubble.style.top = top + 'px';
      bubble.style.left = '50%';
      bubble.style.transform = 'translateX(-50%)';
    }
    position();

    const resizeHandler = () => position();
    window.addEventListener('resize', resizeHandler);
    btn.addEventListener('click', () => {
      Storage.set(opts.flagKey, true);
      window.removeEventListener('resize', resizeHandler);
      overlay.remove();
      oneShotActive = false;
    });
  }

  function handleGesture(type, amount) {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (step.mode !== 'gesture' || step.gestureType !== type) return;
    if (type === 'rotate') {
      // scene.js reports the cumulative drag distance for the CURRENT drag on every
      // move, not a per-move delta, so just compare against the threshold directly.
      if (amount >= step.threshold) advanceStep();
    } else {
      gestureAccum += amount;
      if (gestureAccum >= step.threshold) advanceStep();
    }
  }

  function maybeStart(levelNum) {
    if (levelNum !== 1) return;
    if (Storage.get('tutorialSeen')) return;
    if (active) return;
    active = true;
    hintsAtStart = Storage.getHintsTotal();
    buildDOM();
    // Small delay so the HUD/scene has finished its own load-in before the first
    // spotlight measures element positions.
    setTimeout(() => showStep(0), 350);
  }

  function buildDOM() {
    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.className = 'tutorial-overlay';
    overlay.innerHTML =
      '<div class="tutorial-spotlight" id="tut-spotlight"></div>' +
      '<div class="tutorial-bubble" id="tut-bubble">' +
        '<div class="tutorial-progress" id="tut-progress"></div>' +
        '<div class="tutorial-icon" id="tut-icon"></div>' +
        '<h3 id="tut-title"></h3>' +
        '<p id="tut-text"></p>' +
        '<div class="tutorial-demo-hearts" id="tut-demo-hearts"></div>' +
        '<button id="tut-continue" class="btn btn-primary btn-sm" style="display:none;"></button>' +
        '<button id="tut-skip" class="tutorial-skip"></button>' +
      '</div>';
    document.body.appendChild(overlay);

    els = {
      overlay,
      spotlight: overlay.querySelector('#tut-spotlight'),
      bubble: overlay.querySelector('#tut-bubble'),
      progress: overlay.querySelector('#tut-progress'),
      icon: overlay.querySelector('#tut-icon'),
      title: overlay.querySelector('#tut-title'),
      text: overlay.querySelector('#tut-text'),
      demoHearts: overlay.querySelector('#tut-demo-hearts'),
      continueBtn: overlay.querySelector('#tut-continue'),
      skipBtn: overlay.querySelector('#tut-skip')
    };

    els.skipBtn.textContent = I18N.t('tutorial.skip');
    els.continueBtn.addEventListener('click', () => advanceStep());
    els.skipBtn.addEventListener('click', () => finish());

    // Step 4's completion is "the player actually clicked the hint button" -
    // listened for directly on the DOM button rather than via Game's useHint()
    // event, since useHint() can legitimately no-op (e.g. 0 hints left, or no
    // currently-unblocked path to highlight) and the tutorial shouldn't get
    // stuck waiting on internal game-state edge cases for a simple "tap this
    // button once" instruction.
    document.getElementById('btn-hint').addEventListener('click', onHintButtonClicked);

    repositionHandler = () => { if (active) positionForCurrentStep(); };
    window.addEventListener('resize', repositionHandler);
  }

  function onHintButtonClicked() {
    if (!active) return;
    const step = STEPS[stepIndex];
    if (step.mode === 'domclick' && step.clickTargetId === 'btn-hint') advanceStep();
  }

  function showStep(idx) {
    stepIndex = idx;
    gestureAccum = 0;
    const step = STEPS[idx];

    els.progress.textContent = I18N.t('tutorial.progress', { step: idx + 1, total: STEPS.length });
    els.icon.textContent = step.icon;
    els.title.textContent = I18N.t(step.titleKey);
    els.text.textContent = I18N.t(step.textKey);

    const isDemo = step.mode === 'demo';
    els.continueBtn.style.display = isDemo ? 'inline-flex' : 'none';
    els.continueBtn.textContent = step.continueLabelKey ? I18N.t(step.continueLabelKey) : I18N.t('tutorial.next');
    els.demoHearts.style.display = 'none';
    els.demoHearts.innerHTML = '';

    positionForCurrentStep();

    if (isDemo) playHeartDemo();

    if (tapHighlightInterval) { clearInterval(tapHighlightInterval); tapHighlightInterval = null; }
    if (step.id === 'tap') startTapHighlight();
  }

  // Points the player at a path that's actually exitable right now (never a
  // blocked one - level 1 can otherwise put a blocked path front-and-center,
  // which reads as "nothing happens" on tap and burns a heart with no
  // explanation this early). Also gets the shape to auto-rotate to face it
  // (see Scene3D.highlightPath's snapToFace), so the player doesn't have to
  // already know how to rotate (that's step 2) just to find it.
  // Re-fired every 3s since the highlight glow itself fades after
  // HINT_HIGHLIGHT_MS (3500ms in scene.js) and this step can wait indefinitely
  // for the real tap - but only the FIRST fire snaps the camera. Re-snapping on
  // every re-fire fought the player if they rotated away from the auto-picked
  // angle on their own (reported directly: line the tap up, hold still for a
  // moment, and the view snaps back to the original angle).
  function startTapHighlight() {
    let first = true;
    const fire = () => {
      if (typeof Game === 'undefined' || !Game.getFirstOpenPathId) return;
      const id = Game.getFirstOpenPathId();
      if (id != null && typeof Scene3D !== 'undefined' && Scene3D.highlightPath) Scene3D.highlightPath(id, first);
      first = false;
    };
    fire();
    tapHighlightInterval = setInterval(fire, 3000);
  }

  function playHeartDemo() {
    // Purely decorative - three static heart glyphs, the last one plays a
    // "breaking" CSS animation on a loop-in. No connection to real Game.state.lives.
    els.demoHearts.style.display = 'flex';
    els.demoHearts.innerHTML =
      '<span class="heart-icon">♥</span><span class="heart-icon">♥</span><span class="heart-icon th-break">♥</span>';
  }

  function positionForCurrentStep() {
    const step = STEPS[stepIndex];
    const r = step.getRect();
    els.spotlight.style.left = r.left + 'px';
    els.spotlight.style.top = r.top + 'px';
    els.spotlight.style.width = r.width + 'px';
    els.spotlight.style.height = r.height + 'px';
    els.spotlight.classList.toggle('circle', !!step.circle);

    const spotBottom = r.top + r.height;
    const spotCenterY = r.top + r.height / 2;
    const bubbleH = els.bubble.offsetHeight || 200;
    let top;
    if (spotCenterY > window.innerHeight / 2) {
      // Spotlight is in the lower half - put the bubble above it.
      top = Math.max(16, r.top - bubbleH - 20);
    } else {
      // Spotlight is in the upper half - put the bubble below it.
      top = Math.min(window.innerHeight - bubbleH - 16, spotBottom + 20);
    }
    els.bubble.style.top = top + 'px';
    els.bubble.style.left = '50%';
    els.bubble.style.transform = 'translateX(-50%)';
  }

  function advanceStep() {
    if (!active) return;
    if (stepIndex >= STEPS.length - 1) { finish(); return; }
    showStep(stepIndex + 1);
  }

  function finish() {
    if (!active) return;
    active = false;
    if (tapHighlightInterval) { clearInterval(tapHighlightInterval); tapHighlightInterval = null; }
    // Step 4 calls the real useHint() so the highlighted-path demo is genuine, not
    // faked - but that means it genuinely spends one of the player's 3 starting
    // hints. Refund whatever was actually spent during the tutorial (only ever 0 or
    // 1 in practice) so a first-time player doesn't start the real game down a hint
    // just for having followed the tutorial.
    const spent = hintsAtStart - Storage.getHintsTotal();
    if (spent > 0) Storage.addHints(spent);
    Storage.set('tutorialSeen', true);
    if (els.overlay) els.overlay.remove();
    if (repositionHandler) window.removeEventListener('resize', repositionHandler);
    els = {};
  }

  return { init };
})();
