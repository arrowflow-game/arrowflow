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
      title: 'แตะเพื่อเลื่อนออก',
      text: 'แตะเส้นทางที่ชี้ออกนอกลูกบาศก์ เพื่อเลื่อนมันออกจากด้าน',
      getRect: () => centerRect(260, 0.30),
      mode: 'event',
      waitEvents: ['tap-success']
    },
    {
      id: 'rotate',
      icon: '🔄',
      title: 'หมุนลูกบาศก์',
      text: 'ลากนิ้วหรือเมาส์บนหน้าจอ เพื่อหมุนดูรอบลูกบาศก์',
      getRect: () => centerRect(300, 0.26),
      mode: 'gesture',
      gestureType: 'rotate',
      threshold: 35
    },
    {
      id: 'zoom',
      icon: '🔍',
      title: 'ซูมเข้า-ออก',
      text: 'ใช้สองนิ้วบีบ (มือถือ) หรือเลื่อนล้อเมาส์ (คอมพิวเตอร์) เพื่อซูม',
      getRect: () => centerRect(300, 0.26),
      mode: 'gesture',
      gestureType: 'zoom',
      threshold: 6
    },
    {
      id: 'hint',
      icon: '💡',
      title: 'ใช้ไอเทมคำใบ้',
      text: 'แตะปุ่มคำใบ้เพื่อไฮไลต์เส้นทางที่แนะนำให้เลื่อนออกต่อไป',
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
      title: 'ระวังหัวใจ!',
      text: 'ถ้าแตะเส้นทางที่ยังออกไม่ได้ (ถูกบล็อกอยู่) หัวใจจะลดลง 1 ดวง — หมดหัวใจแล้วต้องเริ่มด่านใหม่',
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
      continueLabel: 'เข้าใจแล้ว เริ่มเล่นเลย!'
    }
  ];

  let active = false;
  let stepIndex = 0;
  let gestureAccum = 0;
  let els = {};
  let repositionHandler = null;

  function init() {
    if (typeof Game !== 'undefined' && Game.setOnEvent) Game.setOnEvent(handleGameEvent);
    if (typeof Scene3D !== 'undefined' && Scene3D.setOnGesture) Scene3D.setOnGesture(handleGesture);
  }

  function handleGameEvent(name, data) {
    if (name === 'level-loaded') {
      maybeStart(data);
      return;
    }
    if (!active) return;
    const step = STEPS[stepIndex];
    if (step.mode === 'event' && step.waitEvents.includes(name)) advanceStep();
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
        '<button id="tut-skip" class="tutorial-skip">ข้ามบทแนะนำ</button>' +
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

    els.progress.textContent = 'ขั้นตอนที่ ' + (idx + 1) + ' / ' + STEPS.length;
    els.icon.textContent = step.icon;
    els.title.textContent = step.title;
    els.text.textContent = step.text;

    const isDemo = step.mode === 'demo';
    els.continueBtn.style.display = isDemo ? 'inline-flex' : 'none';
    els.continueBtn.textContent = step.continueLabel || 'ต่อไป';
    els.demoHearts.style.display = 'none';
    els.demoHearts.innerHTML = '';

    positionForCurrentStep();

    if (isDemo) playHeartDemo();
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
    Storage.set('tutorialSeen', true);
    if (els.overlay) els.overlay.remove();
    if (repositionHandler) window.removeEventListener('resize', repositionHandler);
    els = {};
  }

  return { init };
})();
