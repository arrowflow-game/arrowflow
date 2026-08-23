/* ============================================
   ArrowFlow 3D — scene.js (Three.js Renderer)
   ============================================ */

const Scene3D = (() => {
  let scene, camera, renderer;
  let shapeMesh, backMesh, shapeGroup;
  let currentTier = null;
  let faceCanvases = [];
  let faceContexts = [];
  let faceTextures = [];
  let frontMaterials = [];
  let backMaterials = [];

  // Shared clock for the 'holo' material's rainbow animation - see updateFrame()'s
  // use of it and the animate() loop's periodic tick below for why this can't just
  // be a fresh performance.now() read at each face's own redraw time.
  let holoSyncMs = 0;
  let lastHoloSyncTickMs = 0;
  const HOLO_SYNC_INTERVAL_MS = 10000;

  // Per-cell texture resolution - every exposed face in the polycube system
  // (see [[arrowflow_level_roadmap]] v7) is a uniform unitGrid x unitGrid
  // square, so each face's canvas is simply unitGrid*PX_PER_CELL on a side.
  // 32 keeps the densest tier's unitGrid (6) well inside a crisp 384px face.
  const PX_PER_CELL = 32;
  const EDGES = ['top', 'bottom', 'left', 'right'];

  // Premium "mascot" skins (js/skins.js's mascotIcon field, e.g. streakbunny/
  // gemcat/royalebear) - real transparent-PNG artwork (icons/mascots/*.png,
  // cleaned up from AI-generated source images via
  // scripts/mascot-bg-remove.js), not a code-drawn vector silhouette. Kicked
  // off once at module load, not lazily per-skin-selection, so the first
  // frame that needs one doesn't have to wait on network - drawMascotIcon()
  // below just no-ops until an image's .complete flips true.
  const MASCOT_ICON_NAMES = ['bunny', 'panda', 'cat', 'dolphin', 'bear', 'dog'];
  const mascotImages = {};
  MASCOT_ICON_NAMES.forEach(name => {
    const img = new Image();
    img.src = 'icons/mascots/' + name + '.png';
    mascotImages[name] = img;
  });
  // Scratch canvas reused across calls (composited fresh each time, cheap -
  // no persistent state carried between skins/faces) so the glossy sheen
  // below can be masked to just the icon's own opaque pixels via
  // source-atop, rather than smearing across the whole face texture.
  let mascotIconOffscreen = null;
  function drawMascotIcon(ctx, icon, w, h) {
    const img = mascotImages[icon];
    if (!img || !img.complete || !img.naturalWidth) return;
    const size = Math.min(w, h) * 0.82;

    if (!mascotIconOffscreen) mascotIconOffscreen = document.createElement('canvas');
    const off = mascotIconOffscreen;
    off.width = size; off.height = size;
    const octx = off.getContext('2d');
    octx.clearRect(0, 0, size, size);
    // Soft drop shadow under the icon itself - lifts it off the flat face
    // background for a bit of depth, reported directly as wanted alongside
    // the sheen below ("ทำให้รูปของสัตว์ดูมีมิติขึ้นหรือวาววับขึ้น").
    octx.shadowColor = 'rgba(0,0,0,0.55)';
    octx.shadowBlur = size * 0.1;
    octx.shadowOffsetY = size * 0.045;
    octx.drawImage(img, 0, 0, size, size);
    octx.shadowColor = 'transparent';
    octx.shadowBlur = 0;
    octx.shadowOffsetY = 0;
    // Diagonal glossy sheen, masked to the icon's own opaque pixels only
    // (source-atop) so it never bleeds onto the transparent margin around it.
    octx.globalCompositeOperation = 'source-atop';
    const sheen = octx.createLinearGradient(0, 0, size * 0.6, size);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.42, 'rgba(255,255,255,0.65)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0.1)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    octx.fillStyle = sheen;
    octx.fillRect(0, 0, size, size);
    octx.globalCompositeOperation = 'source-over';

    ctx.drawImage(off, (w - size) / 2, (h - size) / 2, size, size);
  }
  // World-space length of the whole polycube's LONGEST bounding-box axis -
  // kept constant across every level (same role the old fixed CUBE_SIZE=2
  // played), so only the shape's proportions (from its actual cube
  // positions) change here. The camera USED to never re-frame per level on
  // top of this, but that alone let bulkier shapes (large across two+ axes,
  // not just long in one) feel harder to rotate than their longest-axis
  // size suggested - see fitCameraAndSensitivityToShape() further down for
  // the per-level correction now layered on top.
  const BOX_LONGEST_AXIS = 2;
  const FRONT_OPACITY = 0.88;
  const BACK_OPACITY = 0.55;
  // While a hint highlight is active, the faces it touches get bumped to
  // near-full opacity (both front AND back mesh) so the highlighted path
  // stays clearly visible even if it's currently on a face angled away from
  // the camera, seen dimly "through" the see-through front layer - a flat
  // color/pulse change alone wasn't enough (reported directly).
  const HIGHLIGHT_OPACITY = 1.0;

  // Paths are no longer distinguished by a per-path identity color (that scheme
  // ran out of headroom once levels started packing >10-12 simultaneous paths on
  // one cube, and colors that close together stop being readable anyway). Every
  // path now draws in one of three semantic colors instead - idle/blocked-once
  // state is read from shape and position alone, matching the reference app.
  const COLOR_IDLE_LIGHT = '#1a7fe8';
  const COLOR_IDLE_DARK = '#00f5ff';
  const COLOR_MOVING = '#2ecc71';
  const COLOR_BLOCKED = '#ff3b30';

  // Per-tier scene background mood - escalates from a calm/neutral tone at the
  // start of the campaign toward a warm, intense tone at ASCENSION (the final,
  // hardest tier), plus pseudo-tiers for DAILY and REMIX (post-300 endless) modes.
  // Kept close to each theme's own --bg-primary so the shift reads as "mood", not
  // a jarring color swap.
  const TIER_COLORS = {
    AWAKENING: { light: '#dff0fb', dark: '#0d0d1a' },
    MOMENTUM:  { light: '#d6ecff', dark: '#0f1430' },
    CASCADE:   { light: '#cfe8ff', dark: '#0a1a3a' },
    VORTEX:    { light: '#c9e0ff', dark: '#12103a' },
    LABYRINTH: { light: '#e8dcff', dark: '#1a0d33' },
    ASCENSION: { light: '#ffd9d0', dark: '#2a0a12' },
    // REMIX.light was originally a much more saturated coral (#ffb199) than
    // every other tier's light-theme color (all pale pastels) - reported
    // directly as eye-straining background glare. Softened to match the
    // same pastel intensity as the rest of the family.
    REMIX:     { light: '#ffe0d8', dark: '#3a0508' },
    // Softened alongside REMIX.light above, same eye-strain complaint -
    // #fff3c4 was more saturated than the rest of the pastel family.
    DAILY:     { light: '#fff8e1', dark: '#241a05' }
  };
  const MOOD_TRANSITION_MS = 600;
  let moodFrom = null, moodTo = null, moodStart = 0;
  let milestoneMoodActive = false;

  // Background now leans toward the active skin's own face color (a light
  // tint, not a replacement) so picking a skin recolors the whole scene, not
  // just the cube - same "never clash by construction" trick as the
  // milestone/epic variant blend below, just blending toward the skin's hue
  // instead of the tier's. 'default'/no skin selected stays pixel-identical
  // to the original tier-only background, per the skin system's phase-1 rule.
  function tierMoodColor(tier) {
    const pair = TIER_COLORS[tier] || TIER_COLORS.AWAKENING;
    const base = pair[Storage.get('theme') === 'dark' ? 'dark' : 'light'];
    const skin = activeSkin();
    if (!skin || skin.id === 'default') return base;
    const dark = Storage.get('theme') === 'dark';
    const tint = dark ? skin.colors.face.dark : skin.colors.face.light;
    return mixHex(base, tint, 0.18);
  }

  // --- Small hex color helpers for the skin "variant" effect below - pure
  // functions, no state, kept minimal (no need for HSL here).
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    const c = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function mixHex(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t);
  }
  function darkenHex(hex, factor) {
    const c = hexToRgb(hex);
    return rgbToHex(c.r * factor, c.g * factor, c.b * factor);
  }

  // Special-occasion color intensity - layered on TOP of whichever base color
  // is already active (the 'default' look or a chosen skin, see activeSkin()
  // below), completely independent of skin data itself. Blends the base color
  // toward the level's own background mood color (tierMoodColor) so the
  // result can never clash with the backdrop by construction, then darkens
  // the face (not the path, to keep arrows legible) for a heavier/more
  // intense feel on genuinely hard milestone levels. 'epic' (every 100th
  // level) is a deliberately stronger version of 'milestone' (every 10th) -
  // per the user's request this is purely a cosmetic escalation, not a signal
  // that level 100 is harder than level 90. 'daily'/'remix' use a much
  // subtler blend + a slight darken - the original full-strength blend
  // (0.30, no darken) toward a bright warm backdrop (DAILY/REMIX's own
  // light-theme colors are both quite saturated) produced a face nearly as
  // bright/saturated as the backdrop itself, which read as glare and a
  // "doesn't match" clash rather than harmony (reported directly against a
  // screenshot). Toning down the blend and adding a small darken keeps the
  // festive tint recognizable without the glare.
  const VARIANT_RECIPES = {
    milestone: { faceBlend: 0.35, faceDarken: 0.93, pathBlend: 0.20 },
    epic:      { faceBlend: 0.55, faceDarken: 0.85, pathBlend: 0.32 },
    daily:     { faceBlend: 0.14, faceDarken: 0.96, pathBlend: 0.10 },
    remix:     { faceBlend: 0.14, faceDarken: 0.96, pathBlend: 0.10 }
  };
  let currentSkinVariant = 'normal';

  function applyVariant(baseHex, kind) {
    const recipe = VARIANT_RECIPES[currentSkinVariant];
    if (!recipe) return baseHex;
    const target = tierMoodColor(currentTier);
    let mixed = mixHex(baseHex, target, kind === 'face' ? recipe.faceBlend : recipe.pathBlend);
    if (kind === 'face' && recipe.faceDarken !== 1.0) mixed = darkenHex(mixed, recipe.faceDarken);
    return mixed;
  }

  // --- Phase 2: cube face material patterns (Canvas 2D only, no lighting -
  // deliberately kept on the existing unlit MeshBasicMaterial pipeline, see
  // [[arrowflow_render_perf]] for why lighting was removed). Seeded per-face
  // (via face.key, not Math.random()) so the pattern stays put across the
  // frequent redraws updateFrame() already does (hint highlight, undo, etc) -
  // an unseeded RNG would make the material visibly "boil" every redraw.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
    return h;
  }

  // hue2rgb/hslToHex - only needed for the 'holo' material's animated rainbow
  // sweep below; every other material stays on the seeded-RNG hex helpers above.
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  // Classic 4-pointed "diamond glint" sparkle: a long thin diamond crossed
  // with a shorter perpendicular one, plus a bright core - the same shape
  // photo-editing "star" glints use, not a filled star polygon (which reads
  // as a badge/rating icon instead of a light glint). alpha (0-1) drives the
  // twinkle brightness from the caller.
  function drawSparkleGlint(ctx, x, y, size, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = '#fffbe6';
    const drawSpike = (len, width) => {
      ctx.beginPath();
      ctx.moveTo(0, -len);
      ctx.lineTo(width, 0);
      ctx.lineTo(0, len);
      ctx.lineTo(-width, 0);
      ctx.closePath();
      ctx.fill();
    };
    drawSpike(size, size * 0.14);
    ctx.save();
    ctx.rotate(Math.PI / 2);
    drawSpike(size * 0.62, size * 0.1);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMaterialPattern(ctx, material, baseHex, seedKey, w, h, tMs) {
    if (!material || material === 'flat') return;
    const rand = mulberry32(hashString(seedKey));
    const base = hexToRgb(baseHex);
    ctx.save();
    if (material === 'badge') {
      // Reserved for the 6 mascot-icon skins (streakbunny/gemcat/royalebear
      // etc). These deliberately do NOT use 'holo' (reported directly as
      // "too similar to the 15 rainbow skins already out there, doesn't feel
      // like its own thing") - just a soft radial glow for depth. The
      // "premium" cue lives on the cube's actual physical edges instead (see
      // the face-boundary seam stroke below, drawn gold for this material) -
      // a per-face inset gold frame was tried first and reported as "looks
      // weird" (doubled up oddly with that seam stroke); tracing the real
      // edges reads as one cohesive gold-trimmed object instead.
      const cx = w / 2, cy = h / 2;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
      glow.addColorStop(0, 'rgba(255,255,255,0.32)');
      glow.addColorStop(0.6, 'rgba(255,255,255,0.06)');
      glow.addColorStop(1, 'rgba(0,0,0,0.16)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      // One thin faint inset line for a touch more dimension - deliberately
      // NOT the earlier thick double gold frame (that read as cluttered
      // stacked on top of the cube's own gold edge trim); this is a single
      // subtle accent, closer to a card/medallion's inner engraving line.
      const inset = Math.min(w, h) * 0.06;
      ctx.strokeStyle = 'rgba(212,175,55,0.55)';
      ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.014);
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      // Diamond-sparkle glints near the 4 corners - the follow-up polish idea
      // floated after the badge material first landed ("small static 4-point
      // diamond-sparkle glints"), now actually built. Position is seeded per
      // face (rand(), same PRNG as the rest of this function) so it doesn't
      // boil across redraws, but each glint's brightness gently twinkles off
      // tMs with a per-corner phase offset so all 4 don't flash in lockstep -
      // reads as "catching the light," not a blinking icon.
      const corners = [
        { ax: 0.18, ay: 0.18 }, { ax: 0.82, ay: 0.18 },
        { ax: 0.18, ay: 0.82 }, { ax: 0.82, ay: 0.82 },
      ];
      corners.forEach((c, i) => {
        const jitterX = (rand() - 0.5) * Math.min(w, h) * 0.05;
        const jitterY = (rand() - 0.5) * Math.min(w, h) * 0.05;
        const sx = w * c.ax + jitterX;
        const sy = h * c.ay + jitterY;
        const phase = rand() * Math.PI * 2;
        const twinkle = 0.55 + 0.45 * Math.sin((tMs || 0) / 900 + phase + i * 1.7);
        drawSparkleGlint(ctx, sx, sy, Math.min(w, h) * 0.09, twinkle);
      });
    } else if (material === 'holo') {
      // Reserved exclusively for the top-tier prestige skins (streakcrown/
      // gemdragon/royaleemperor) - a genuinely animated diagonal rainbow
      // sweep, unlike every other material here which is seeded-static (see
      // [[arrowflow_render_perf]] on why: an unseeded/time-based pattern
      // "boils" on the frequent redraws updateFrame() already does). This is
      // a deliberate exception for a premium showcase - driven by the
      // caller's tMs (the shared animate() loop's clock, same timer as the
      // mood pulse), not recomputed from scratch on every redraw trigger.
      // Bumped from an earlier, much subtler pastel-wash version - reported
      // directly as "not different enough to make you want it" against
      // screenshots of the actual in-game cube. Now: a darkened base wash
      // first (so the rainbow bands have real contrast to pop against
      // instead of blending into an already-pale face), fewer/wider/opaque
      // bands, and a faint shimmer sweep line to read as "alive" even in a
      // single still frame, not just mid-animation. Saturation (0.95->0.55,
      // 2026-08-21) was toned down once the sync fix above still occasionally
      // let a mismatched band through - lower saturation makes any residual
      // seam far less eye-catching without losing the animated feel.
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, w, h);
      const t = (tMs || 0) / 20;
      const bands = 4;
      for (let i = 0; i < bands; i++) {
        const hue = t + i * (360 / bands);
        const bandX = ((i / bands) * w * 1.6) - w * 0.3 + (t % (w * 0.4)) * 0.02;
        const grad = ctx.createLinearGradient(bandX, 0, bandX + w * 0.35, h);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, hslToHex(hue, 0.55, 0.55) + 'e6');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
      const shimmerX = (t * 3) % (w * 2) - w * 0.5;
      const shimmer = ctx.createLinearGradient(shimmerX, 0, shimmerX + w * 0.12, h);
      shimmer.addColorStop(0, 'rgba(255,255,255,0)');
      shimmer.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      shimmer.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = shimmer;
      ctx.fillRect(0, 0, w, h);
    } else if (material === 'marble') {
      // A handful of soft bezier "veins", alternating lighter/darker than
      // the base fill, low opacity so the path/arrow art on top stays the
      // clearest thing on the face.
      for (let i = 0; i < 4; i++) {
        const lighter = rand() < 0.5;
        const shade = lighter ? rgbToHex(base.r + 40, base.g + 40, base.b + 40) : darkenHex(baseHex, 0.75);
        ctx.strokeStyle = shade;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1.5 + rand() * 2;
        ctx.beginPath();
        const x0 = rand() * w, y0 = rand() * h;
        ctx.moveTo(x0, y0);
        ctx.bezierCurveTo(rand() * w, rand() * h, rand() * w, rand() * h, rand() * w, rand() * h);
        ctx.stroke();
      }
    } else if (material === 'glass') {
      // Diagonal soft highlight bands - a cheap "glossy" read without real
      // reflections/lighting.
      for (let i = 0; i < 2; i++) {
        const bandX = rand() * w * 0.7;
        const grad = ctx.createLinearGradient(bandX, 0, bandX + w * 0.25, h);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }
    } else if (material === 'neon') {
      // Faint glowing grid, tinted from the base color itself (brightened)
      // rather than a separate accent input - keeps this self-contained.
      const glow = rgbToHex(Math.min(255, base.r + 90), Math.min(255, base.g + 90), Math.min(255, base.b + 90));
      ctx.strokeStyle = glow;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 6;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      const step = w / 4;
      for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } else if (material === 'metal') {
      // Brushed horizontal streaks...
      ctx.globalAlpha = 1;
      for (let y = 0; y < h; y += 3) {
        ctx.strokeStyle = rand() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + rand());
        ctx.lineTo(w, y + rand());
        ctx.stroke();
      }
      // ...plus rust blotches, the "rusted metal" the user asked for.
      const rustCount = 5 + Math.floor(rand() * 4);
      for (let i = 0; i < rustCount; i++) {
        const rx = rand() * w, ry = rand() * h, rr = 4 + rand() * 10;
        ctx.fillStyle = 'rgba(140,70,20,0.18)';
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr, rr * (0.6 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // --- Phase 2: shared themed-particle engine. Used three ways: a low-key
  // ambient loop while a skin with a particleTheme is active (see animate()),
  // a burst at a path's exit point (see shootExitArrow()), and (via the same
  // theme names) ui.js's win-screen confetti. Kept on the existing fxCanvas
  // overlay (already used by the exit-shot flourish below) rather than a new
  // canvas - one clear/draw pass per frame.
  const PARTICLE_THEMES = {
    leaves:  { gravity: 0.015,  drag: 0.995, spin: true,  shape: 'leaf' },
    embers:  { gravity: -0.02,  drag: 0.99,  spin: false, shape: 'circle', glow: true },
    sparks:  { gravity: 0.01,   drag: 0.96,  spin: false, shape: 'spark',  glow: true },
    bubbles: { gravity: -0.012, drag: 0.995, spin: false, shape: 'ring' },
    ash:     { gravity: 0.008,  drag: 0.997, spin: true,  shape: 'circle' },
    // Reserved for the top-tier prestige skins alongside 'holo' above - a
    // slower, longer-drifting, glowier cousin of 'sparks' so it reads as
    // more luxurious rather than just another recolor of an existing theme.
    stardust:{ gravity: -0.004, drag: 0.998, spin: false, shape: 'spark',  glow: true }
  };
  const AMBIENT_BASE = 14;
  // How much fiercer/busier the particle layer gets on a special-occasion
  // level - same currentSkinVariant driving applyVariant()'s color escalation
  // above, so "does the new skin also ramp up at milestone/epic/daily/remix"
  // is answered with the SAME intensity axis, not a separate one. epic (every
  // 100th level) reads noticeably busier than milestone (every 10th);
  // daily/remix get a smaller festive bump, not the "fiercer" treatment.
  const VARIANT_PARTICLE_INTENSITY = { milestone: 1.4, epic: 2.0, daily: 1.2, remix: 1.2 };
  function particleIntensity() {
    return VARIANT_PARTICLE_INTENSITY[currentSkinVariant] || 1.0;
  }
  let ambientParticles = [];
  let burstParticles = [];

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Runs the SAME milestone/epic/daily/remix blend+darken as the face/path
  // colors (applyVariant) so particle color escalates identically - answers
  // "should the new skin dimensions also intensify at special levels" with
  // one shared mechanism instead of a second one to keep in sync.
  function currentParticleColor() {
    const skin = activeSkin();
    if (!skin) return null;
    const dark = Storage.get('theme') === 'dark';
    const base = dark ? skin.colors.path.dark : skin.colors.path.light;
    return applyVariant(base, 'path');
  }

  function spawnAmbientParticle(theme) {
    const w = window.innerWidth, h = window.innerHeight;
    const rising = PARTICLE_THEMES[theme].gravity < 0;
    return {
      theme,
      x: Math.random() * w,
      y: rising ? h + 10 : -10,
      vx: (Math.random() - 0.5) * 0.3,
      vy: 0,
      size: 2 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.02,
      alpha: 0.35 + Math.random() * 0.25 // ambient stays subtle, never competes with gameplay
    };
  }

  function spawnBurst(x, y, theme) {
    if (!theme || theme === 'none' || !PARTICLE_THEMES[theme] || prefersReducedMotion()) return;
    const intensity = particleIntensity();
    const count = Math.round(10 * intensity);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const speed = (2 + Math.random() * 3) * Math.min(1.5, intensity);
      burstParticles.push({
        theme, x, y,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        size: 2 + Math.random() * 3,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        alpha: 1, life: 0, maxLife: 400 + Math.random() * 200
      });
    }
  }

  function stepParticle(p, recipe) {
    p.x += p.vx; p.y += p.vy;
    p.vy += recipe.gravity;
    p.vx *= recipe.drag; p.vy *= recipe.drag;
    if (recipe.spin) p.rot += p.vrot;
  }

  function drawParticleShape(ctx, p, recipe, color) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (recipe.spin) ctx.rotate(p.rot);
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (recipe.glow) { ctx.shadowColor = color; ctx.shadowBlur = p.size * 2; }
    if (recipe.shape === 'ring') {
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.stroke();
    } else if (recipe.shape === 'leaf') {
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (recipe.shape === 'spark') {
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function renderFxOverlay() {
    const haveShots = activeShots.length > 0;
    const skin = activeSkin();
    const ambientTheme = skin && skin.particleTheme !== 'none' && !prefersReducedMotion() ? skin.particleTheme : null;
    const haveBurst = burstParticles.length > 0;
    if (!haveShots && !ambientTheme && !haveBurst && ambientParticles.length === 0) return;

    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (ambientTheme) {
      const ambientMax = Math.round(AMBIENT_BASE * particleIntensity());
      while (ambientParticles.length < ambientMax) ambientParticles.push(spawnAmbientParticle(ambientTheme));
    }
    const w = window.innerWidth, h = window.innerHeight;
    const ambientColor = currentParticleColor();
    ambientParticles = ambientParticles.filter(p => {
      const recipe = PARTICLE_THEMES[p.theme];
      if (!recipe) return false;
      stepParticle(p, recipe);
      const offscreen = p.y < -20 || p.y > h + 20 || p.x < -20 || p.x > w + 20;
      if (offscreen) {
        if (!ambientTheme) return false; // theme was turned off mid-flight - let it go
        Object.assign(p, spawnAmbientParticle(ambientTheme));
        return true;
      }
      if (ambientColor) drawParticleShape(fxCtx, p, recipe, ambientColor);
      return true;
    });

    burstParticles = burstParticles.filter(p => {
      const recipe = PARTICLE_THEMES[p.theme];
      if (!recipe) return false;
      p.life += 16;
      stepParticle(p, recipe);
      p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      if (p.life >= p.maxLife) return false;
      const color = ambientColor || movingColor();
      drawParticleShape(fxCtx, p, recipe, color);
      return true;
    });

    if (haveShots) drawExitShots();
    fxCtx.globalAlpha = 1;
  }

  function setSceneMood(tier, isMilestone) {
    const hex = tierMoodColor(tier);
    moodFrom = scene.background ? scene.background.clone() : new THREE.Color(hex);
    moodTo = new THREE.Color(hex);
    moodStart = performance.now();
    if (!scene.background) scene.background = moodFrom.clone();
    milestoneMoodActive = !!isMilestone;
  }

  // Called on a light/dark theme toggle mid-level: re-picks the current
  // tier's color pair for the new theme instantly (no transition - it's a
  // deliberate user action, not a level change).
  function refreshMoodForTheme() {
    if (!currentTier) return;
    const hex = tierMoodColor(currentTier);
    moodFrom = new THREE.Color(hex);
    moodTo = new THREE.Color(hex);
    moodStart = 0;
    scene.background = new THREE.Color(hex);
  }

  // Skin selection recolors the face fill, idle path/arrow color, background
  // tint, and the moving/exit-shot color - blocked (red) stays a fixed status
  // color regardless of skin (still needs to read as "wrong" unambiguously).
  // null (unset/invalid id) or the 'default' skin fall back to today's
  // hardcoded look pixel-for-pixel.
  function activeSkin() {
    return Skins.getById(Storage.get('selectedSkin'));
  }

  // The "arrow is moving/exiting" color used to be a fixed green for every
  // skin. Now it's the active skin's own path color, brightened toward white
  // so it still reads as clearly distinct from that same skin's idle path
  // color - falls back to the original green when no skin (or 'default') is
  // selected, per the skin system's phase-1 pixel-identical rule.
  function movingColor() {
    const skin = activeSkin();
    if (!skin || skin.id === 'default') return COLOR_MOVING;
    const dark = Storage.get('theme') === 'dark';
    const base = dark ? skin.colors.path.dark : skin.colors.path.light;
    return mixHex(base, '#ffffff', 0.35);
  }

  function getPathColor(path) {
    if (path.status === 'bumped' || path.status === 'bumped_return' || path.wasBlocked) return COLOR_BLOCKED;
    if (path.status === 'moving' || path.status === 'done') return movingColor();
    const dark = Storage.get('theme') === 'dark';
    const skin = activeSkin();
    const base = skin ? (dark ? skin.colors.path.dark : skin.colors.path.light) : (dark ? COLOR_IDLE_DARK : COLOR_IDLE_LIGHT);
    return applyVariant(base, 'path');
  }

  // Pinch/scroll zoom: the camera dollies along its fixed initial viewing
  // direction (never orbits - shapeGroup itself carries all rotation), so
  // zoom is just a distance-from-origin scalar. Bounds keep the shape from
  // clipping past the near plane when zoomed in or shrinking to an unusable
  // dot when zoomed out.
  const CAMERA_DIR = new THREE.Vector3(3, 3, 4).normalize();
  const MIN_CAMERA_DISTANCE = 2.5;
  const MAX_CAMERA_DISTANCE = 11;
  let cameraDistance = 0;
  let pinchStartDist = 0;
  let pinchStartCameraDistance = 0;
  // Set the moment a second finger lands (pinch-zoom begins) and only cleared once
  // every finger is off the screen - see onPointerUp()'s dragDist guard below for why
  // this exists on top of it.
  let wasPinching = false;

  function setCameraDistance(dist) {
    cameraDistance = Math.max(MIN_CAMERA_DISTANCE, Math.min(MAX_CAMERA_DISTANCE, dist));
    camera.position.copy(CAMERA_DIR).multiplyScalar(cameraDistance);
    camera.lookAt(0, 0, 0);
  }

  function onWheelZoom(e) {
    e.preventDefault();
    setCameraDistance(cameraDistance + e.deltaY * 0.01);
    if (onGestureCallback) onGestureCallback('zoom', Math.abs(e.deltaY));
  }

  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let currentGraph = null;       // { faces, faceByKey, adj } from Polycube.buildGraph
  let currentUnitGrid = 6;
  let currentCenter = [0, 0, 0]; // from shapeCenterAndScale(), needed to place the exit-shot fx in the same local frame as the geometry
  let currentScale = 1;

  // Exit-shot effect: a screen-space overlay (see #fx-canvas), not a 3D
  // object, so it can fly past the shape's own silhouette to the actual
  // edge of the viewport - a per-face WebGL texture is clipped to that
  // face's own quad and can never do this (see [[arrowflow_render_perf]]'s
  // exit-overshoot writeup for why that path was deliberately clamped
  // small instead). Requested directly as a release/flourish effect for
  // when a path successfully exits, distinct from the small in-shape slide.
  let fxCanvas = null, fxCtx = null;
  let activeShots = [];
  const EXIT_SHOT_DURATION_MS = 260;
  let faceIndexByKey = {};       // faceKey -> index into faceCanvases/materials/geometry groups

  // Drag inertia: a flick keeps the cube spinning and easing to a stop instead of
  // stopping dead on release, matching the reference app's heavier, more physical feel.
  let velX = 0, velY = 0; // smoothed per-frame drag delta, degrees-equivalent (see applyDragRotation)
  const INERTIA_FRICTION = 0.94;
  const INERTIA_STOP_EPS = 0.01;

  let onArrowTapCallback = null;
  // Optional tutorial hook: fired with ('rotate', cumulativePixelsThisDrag) on every
  // drag move, and ('zoom', pixelOrWheelDelta) on every wheel/pinch move. Not used by
  // normal gameplay - only the first-run tutorial (js/tutorial.js) listens, to detect
  // that the player actually performed the gesture rather than just reading about it.
  let onGestureCallback = null;

  let currentPaths = [];
  let highlightPathId = null;
  let highlightUntil = 0;

  function init() {
    const canvas = document.getElementById('three-canvas');
    fxCanvas = document.getElementById('fx-canvas');
    fxCtx = fxCanvas.getContext('2d');
    resizeFxCanvas();
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // Uncapped devicePixelRatio means a phone reporting dpr=3 renders 2.25x the pixels
    // of dpr=2 for no visible benefit on a screen that size - this alone is often the
    // single biggest steady-state GPU cost of a WebGL page (paid every frame, forever,
    // not just while animating).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    // Mid-range start (vs. the old ~5.83, close to MIN_CAMERA_DISTANCE) so the shape
    // doesn't fill the whole screen on level load - reported as feeling too zoomed in.
    setCameraDistance(7.5);

    shapeGroup = new THREE.Group();
    scene.add(shapeGroup);
    rebuildGeometry([[0, 0, 0]], currentUnitGrid);

    window.addEventListener('resize', onWindowResize);

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, {passive: false});
    canvas.addEventListener('touchmove', onPointerMove, {passive: false});
    canvas.addEventListener('touchend', onPointerUp);
    canvas.addEventListener('wheel', onWheelZoom, {passive: false});

    animate();
  }

  // Outward normal for a face direction is analytically known (just the
  // signed axis unit vector) - used to guarantee correct triangle winding
  // below without having to hand-reason about corner ordering.
  function outwardNormal(d) {
    const [axis, sign] = Polycube.AXIS_SIGN[d];
    const n = { x: 0, y: 0, z: 0 };
    n[axis] = sign;
    return new THREE.Vector3(n.x, n.y, n.z);
  }

  function shapeCenterAndScale(shape) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    shape.forEach(p => {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i]);
        max[i] = Math.max(max[i], p[i] + 1);
      }
    });
    const center = [0, 1, 2].map(i => (min[i] + max[i]) / 2);
    const extent = [0, 1, 2].map(i => max[i] - min[i]);
    const scale = BOX_LONGEST_AXIS / Math.max(...extent);
    // Half the 3D diagonal of the normalized bounding box - how far the
    // farthest corner sits from the rotation pivot. Normalizing only the
    // longest axis (above) keeps a perfect-cube shape's apparent size
    // constant across levels, but a shape that's large across TWO or more
    // axes at once (a wide/thick cluster, not just "long") still ends up
    // with a bigger diagonal than a single elongated spike - that's the
    // actual quantity that determines how far a screen point swings per
    // degree of rotation, so it's what fitCameraAndSensitivityToShape()
    // below reacts to instead of raw extent.
    const radius = 0.5 * Math.hypot(extent[0] * scale, extent[1] * scale, extent[2] * scale);
    return { center, scale, radius };
  }

  // Reference: the plain 1x1x1 starting shape's own radius (extent [1,1,1]
  // at BOX_LONGEST_AXIS/1 scale) - "1x" camera distance and "1x" rotation
  // sensitivity are defined relative to this, so a typical small shape's
  // feel is completely unchanged by the code below.
  const REFERENCE_SHAPE_RADIUS = 0.5 * Math.hypot(BOX_LONGEST_AXIS, BOX_LONGEST_AXIS, BOX_LONGEST_AXIS);
  const BASE_CAMERA_DISTANCE = 7.5; // matches the old fixed initial value
  let rotationSensitivityMultiplier = 1;

  // Reported directly: big/long polycube shapes felt like they had a
  // stuck-in-place pivot and were "hard to rotate" compared to small ones -
  // their farther corners swing across much more screen distance per degree
  // of rotation than a small shape's do, at a fixed camera distance. Two
  // complementary corrections, both keyed off the shape's own radius vs. the
  // reference above:
  //  1) push the camera back proportionally so the shape's ON-SCREEN size
  //     (and therefore how far its corners visually swing per degree) stays
  //     closer to constant across shapes - the dominant fix, since it
  //     addresses the actual visual swing rather than just the finger's
  //     pixel-to-degree ratio.
  //  2) camera distance is clamped (MIN/MAX_CAMERA_DISTANCE) so an extreme
  //     shape can still get camera-clamped short of the "ideal" distance -
  //     rotation sensitivity picks up exactly that leftover gap, so even a
  //     shape big enough to hit the clamp still rotates at roughly the same
  //     felt rate as everything else.
  function fitCameraAndSensitivityToShape(radius) {
    const idealDistance = BASE_CAMERA_DISTANCE * (radius / REFERENCE_SHAPE_RADIUS);
    setCameraDistance(idealDistance);
    const residualRatio = idealDistance / cameraDistance; // >1 only when the clamp above capped us short
    rotationSensitivityMultiplier = 1 / residualRatio;
  }

  // Builds one BufferGeometry for the whole polycube shape: each exposed
  // face (from the graph) becomes a 2-triangle quad, with a materialIndex
  // group so each face can carry its own canvas texture. Triangle winding is
  // corrected per-face via the analytically-known outward normal rather than
  // relying on getting the corner-ordering convention right by hand - a
  // wrong winding would silently break the front/back see-through mesh trick.
  function buildPolycubeGeometry(faces, center, scale) {
    const positions = [];
    const normals = [];
    const uvs = [];

    const toWorld = (corners, key) => {
      const p = corners[key];
      return new THREE.Vector3((p[0] - center[0]) * scale, (p[1] - center[1]) * scale, (p[2] - center[2]) * scale);
    };

    faces.forEach(face => {
      const corners = Polycube.faceCorners(face.pos, face.d);
      const c00 = toWorld(corners, '0,0');
      const c01 = toWorld(corners, '0,1');
      const c10 = toWorld(corners, '1,0');
      const c11 = toWorld(corners, '1,1');
      const normal = outwardNormal(face.d);

      // uv(redge,cedge) = (cedge, 1-redge) - matches the old convention
      // game.js's onArrowTap already assumes (col=u*cols, row=(1-v)*rows).
      const uv00 = [0, 1], uv01 = [1, 1], uv10 = [0, 0], uv11 = [1, 0];

      const pushTri = (a, b, c, ua, ub, uc) => {
        const e1 = new THREE.Vector3().subVectors(b, a);
        const e2 = new THREE.Vector3().subVectors(c, a);
        const cross = new THREE.Vector3().crossVectors(e1, e2);
        let pa = a, pb = b, pc = c, qa = ua, qb = ub, qc = uc;
        if (cross.dot(normal) < 0) { pb = c; pc = b; qb = uc; qc = ub; }
        positions.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
        normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
        uvs.push(qa[0], qa[1], qb[0], qb[1], qc[0], qc[1]);
      };

      pushTri(c00, c01, c10, uv00, uv01, uv10);
      pushTri(c01, c11, c10, uv01, uv11, uv10);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    faces.forEach((face, i) => geometry.addGroup(i * 6, 6, i));
    return geometry;
  }

  // World-space position of an arbitrary point (r,c in cell units, can be
  // fractional/out-of-range) on a given face - same corner math and
  // uv/(row,col) convention as buildPolycubeGeometry()/onArrowTap() above,
  // but evaluated at an arbitrary interior point instead of just the 4
  // corners, and mapped through shapeGroup's LIVE rotation (so it tracks the
  // shape as the player drags it, not just its position at load time). Used
  // by the exit-shot effect below to know where a path's head/exit really
  // is on screen right now.
  function cellWorldPosition(faceObj, r, c, unitGrid) {
    const corners = Polycube.faceCorners(faceObj.pos, faceObj.d);
    const toLocal = (key) => {
      const p = corners[key];
      return new THREE.Vector3(
        (p[0] - currentCenter[0]) * currentScale,
        (p[1] - currentCenter[1]) * currentScale,
        (p[2] - currentCenter[2]) * currentScale
      );
    };
    const c00 = toLocal('0,0'), c01 = toLocal('0,1'), c10 = toLocal('1,0'), c11 = toLocal('1,1');
    const u = c / unitGrid, v = 1 - r / unitGrid; // matches uv00=(0,1) etc. above
    const top = c00.clone().lerp(c01, u);
    const bot = c10.clone().lerp(c11, u);
    const local = bot.lerp(top, v);
    return shapeGroup.localToWorld(local);
  }

  function projectToScreen(worldVec) {
    const v = worldVec.clone().project(camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (1 - (v.y * 0.5 + 0.5)) * window.innerHeight
    };
  }

  // Extends a ray from (x0,y0) in direction (dx,dy) to wherever it crosses
  // the viewport's own rectangle - dx/dy are mutually exclusive in sign per
  // axis for which edge is relevant, so at most one candidate per axis.
  function rayToViewportEdge(x0, y0, dx, dy) {
    const w = window.innerWidth, h = window.innerHeight;
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (w - x0) / dx);
    else if (dx < 0) t = Math.min(t, (0 - x0) / dx);
    if (dy > 0) t = Math.min(t, (h - y0) / dy);
    else if (dy < 0) t = Math.min(t, (0 - y0) / dy);
    if (!isFinite(t) || t <= 0) t = Math.max(w, h);
    return { x: x0 + dx * t, y: y0 + dy * t };
  }

  // Release/flourish effect for a path that just successfully exited -
  // requested directly as a distinct visual from the small in-shape slide
  // (see [[arrowflow_ux_polish]]): a straight line shoots from the exit
  // point out to the actual edge of the screen. Must be screen-space (see
  // #fx-canvas setup) since a per-face WebGL texture is clipped to that
  // face's own quad and can't visually leave the shape's silhouette.
  function shootExitArrow(path) {
    if (!path.segments.length) return;
    shapeGroup.updateMatrixWorld(true);
    camera.updateMatrixWorld();

    const head = path.segments[path.segments.length - 1];
    const faceObj = { pos: head.cube, d: head.dir };
    const p0 = cellWorldPosition(faceObj, head.r + 0.5, head.c + 0.5, currentUnitGrid);

    let r2 = head.r + 0.5, c2 = head.c + 0.5;
    const delta = 0.8; // just past the head, enough to establish a reliable screen-space direction
    if (path.exitDir === 'up') r2 -= delta;
    else if (path.exitDir === 'down') r2 += delta;
    else if (path.exitDir === 'left') c2 -= delta;
    else if (path.exitDir === 'right') c2 += delta;
    const p1 = cellWorldPosition(faceObj, r2, c2, currentUnitGrid);

    const s0 = projectToScreen(p0);
    const s1 = projectToScreen(p1);
    let dx = s1.x - s0.x, dy = s1.y - s0.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;

    const edge = rayToViewportEdge(s0.x, s0.y, dx, dy);
    activeShots.push({ x0: s0.x, y0: s0.y, x1: edge.x, y1: edge.y, start: performance.now() });
    // Phase 2: skin-themed particle burst layered alongside the green
    // status-color flourish above - never replaces it (see PARTICLE_THEMES).
    const skin = activeSkin();
    if (skin) spawnBurst(s0.x, s0.y, skin.particleTheme);
  }

  // Evenly-spaced points along a straight line - lets the lineStyle
  // renderers (which decorate based on neighboring-point tangents, e.g. the
  // water wobble or rope twist) work on the exit-shot trail the same way
  // they work on a face's own densely-sampled path polyline, even though
  // the trail itself is geometrically just two endpoints.
  function sampleLine(x0, y0, x1, y1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
    }
    return pts;
  }

  // Draws a skin-themed trail (used by the exit-shot flourish below) onto a
  // reusable scratch canvas at full opacity first, then composites that
  // scratch onto fxCtx with the shot's own fade alpha - needed because the
  // lineStyle renderers set their own internal globalAlpha values (glow
  // layers, highlight streaks) which would otherwise stomp on the fade
  // instead of combining with it.
  let trailScratch = null, trailScratchCtx = null;
  function drawStyledTrailToFx(fxCtx, x0, y0, x1, y1, color, style, tMs, alpha) {
    const pad = 40;
    const minX = Math.min(x0, x1) - pad, minY = Math.min(y0, y1) - pad;
    const w = Math.abs(x1 - x0) + pad * 2, h = Math.abs(y1 - y0) + pad * 2;
    if (!trailScratch) trailScratch = document.createElement('canvas');
    trailScratch.width = Math.ceil(w);
    trailScratch.height = Math.ceil(h);
    trailScratchCtx = trailScratch.getContext('2d');
    trailScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    trailScratchCtx.clearRect(0, 0, trailScratch.width, trailScratch.height);
    trailScratchCtx.translate(-minX, -minY);

    const dist = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(6, Math.round(dist / 6));
    const points = sampleLine(x0, y0, x1, y1, n);
    drawStyledPath(trailScratchCtx, [points], 22, color, style, 'exitshot', tMs);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    drawStyledArrowHeadAtAngle(trailScratchCtx, x1, y1, angle, 16, color, style, tMs);
    trailScratchCtx.setTransform(1, 0, 0, 1, 0, 0);

    fxCtx.save();
    fxCtx.globalAlpha = alpha;
    fxCtx.drawImage(trailScratch, minX, minY);
    fxCtx.restore();
  }

  function drawExitShots() {
    // No fxCtx.clearRect() here anymore - renderFxOverlay() (Phase 2) now
    // owns clearing the shared overlay canvas once per frame, since ambient
    // particles also draw to it and would otherwise get wiped by this call.
    const now = performance.now();
    const fadeTail = 150;
    activeShots = activeShots.filter(s => now - s.start < EXIT_SHOT_DURATION_MS + fadeTail);
    const shotColor = movingColor();
    const skin = activeSkin();
    const lineStyle = skin && skin.lineStyle;
    activeShots.forEach(shot => {
      const t = Math.min(1, (now - shot.start) / EXIT_SHOT_DURATION_MS);
      const grow = 1 - Math.pow(1 - t, 3); // ease-out
      const cx = shot.x0 + (shot.x1 - shot.x0) * grow;
      const cy = shot.y0 + (shot.y1 - shot.y0) * grow;
      const fadeStart = 0.7;
      const alpha = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart)) : 1;

      if (lineStyle) {
        drawStyledTrailToFx(fxCtx, shot.x0, shot.y0, cx, cy, shotColor, lineStyle, now, alpha);
        return;
      }

      fxCtx.globalAlpha = alpha;
      fxCtx.strokeStyle = shotColor;
      fxCtx.lineWidth = 6;
      fxCtx.lineCap = 'round';
      fxCtx.beginPath();
      fxCtx.moveTo(shot.x0, shot.y0);
      fxCtx.lineTo(cx, cy);
      fxCtx.stroke();

      const ang = Math.atan2(cy - shot.y0, cx - shot.x0);
      const headLen = 16;
      fxCtx.beginPath();
      fxCtx.moveTo(cx, cy);
      fxCtx.lineTo(cx - headLen * Math.cos(ang - Math.PI / 7), cy - headLen * Math.sin(ang - Math.PI / 7));
      fxCtx.lineTo(cx - headLen * Math.cos(ang + Math.PI / 7), cy - headLen * Math.sin(ang + Math.PI / 7));
      fxCtx.closePath();
      fxCtx.fillStyle = shotColor;
      fxCtx.fill();
    });
    fxCtx.globalAlpha = 1;
  }

  function disposeFaceResources() {
    frontMaterials.forEach(m => m.dispose());
    backMaterials.forEach(m => m.dispose());
    faceTextures.forEach(t => t.dispose());
    frontMaterials = [];
    backMaterials = [];
    faceTextures = [];
    faceCanvases = [];
    faceContexts = [];
  }

  // Swaps in the level's polycube shape: rebuilds the face graph, one canvas
  // texture per exposed face (a variable count now, not a fixed 6), the
  // shared custom geometry, and both meshes' material arrays to match.
  function rebuildGeometry(shape, unitGrid) {
    currentGraph = Polycube.buildGraph(shape);
    currentUnitGrid = unitGrid;
    faceIndexByKey = {};

    disposeFaceResources();

    currentGraph.faces.forEach((face, i) => {
      faceIndexByKey[face.key] = i;
      const c = document.createElement('canvas');
      c.width = unitGrid * PX_PER_CELL;
      c.height = unitGrid * PX_PER_CELL;
      const ctx = c.getContext('2d');
      const tex = new THREE.CanvasTexture(c);
      // The GPU's max anisotropy (often 16) buys sharpness at grazing viewing angles
      // that a flat puzzle face never needs; it's pure sampling cost paid every frame.
      tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 2);

      faceCanvases.push(c);
      faceContexts.push(ctx);
      faceTextures.push(tex);

      // Basic (unlit) rather than Lambert/Standard: this is flat-colored 2D line art
      // baked into the canvas texture, not a lit 3D surface - it doesn't need per-pixel
      // lighting shading, just the texture as-is, and Basic is cheaper to boot.
      // depthTest/depthWrite ARE enabled here (unlike the back mesh below) -
      // a polycube shape (see [[arrowflow_polycube_system]]) is often
      // non-convex, so two different exterior faces can both be
      // camera-facing at once while sitting at different real depths (e.g.
      // the inner wall of a step). With depth testing off, the front mesh's
      // many face-groups draw in a fixed array order rather than by actual
      // distance, so the farther exterior face could paint over the nearer
      // one - reported directly as "the front line fades and the back line
      // becomes prominent instead" on a 23-cube LABYRINTH-tier shape. This
      // only affects the front mesh's self-occlusion; the back mesh is
      // still drawn first via renderOrder with depthWrite left off, so it
      // can't block the front mesh from painting over it as before.
      frontMaterials.push(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: FRONT_OPACITY, side: THREE.FrontSide,
        depthWrite: true, depthTest: true
      }));
      backMaterials.push(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: BACK_OPACITY, side: THREE.BackSide,
        depthWrite: false, depthTest: false
      }));
    });

    const { center, scale, radius } = shapeCenterAndScale(shape);
    currentCenter = center;
    currentScale = scale;
    fitCameraAndSensitivityToShape(radius);
    const geometry = buildPolycubeGeometry(currentGraph.faces, center, scale);

    // Two meshes sharing one geometry instead of a single transparent mesh: a
    // single mesh with transparent materials draws its face groups in a
    // fixed index order, not sorted by camera distance, so whichever face
    // happened to draw last "won" the blend - which face looked see-through
    // vs. opaque depended on view angle (see git history). Splitting into a
    // BackSide mesh (the far walls, seen from inside the shape) and a
    // FrontSide mesh (the near walls) and forcing draw order with
    // renderOrder - back always first, front always on top - makes the
    // nearest face always render crisp with the far faces faintly visible
    // through it, regardless of how the shape is rotated. The back mesh
    // still skips depth test/write entirely (mesh-level renderOrder alone
    // decides it always loses to the front mesh); the front mesh now DOES
    // depth test/write against itself (see its material above) so that on a
    // non-convex polycube shape, two different exterior faces that are both
    // camera-facing at once resolve by real distance instead of by array
    // order.
    if (shapeMesh) { shapeGroup.remove(shapeMesh); shapeMesh.geometry.dispose(); }
    if (backMesh) { shapeGroup.remove(backMesh); }

    backMesh = new THREE.Mesh(geometry, backMaterials);
    backMesh.renderOrder = 0;
    shapeMesh = new THREE.Mesh(geometry, frontMaterials);
    shapeMesh.renderOrder = 1;

    shapeGroup.add(backMesh);
    shapeGroup.add(shapeMesh);
  }

  function setLevelData(shape, unitGrid, paths, tier, isMilestone, skinVariant) {
    rebuildGeometry(shape, unitGrid);
    highlightPathId = null;
    highlightedFaceIndices = [];
    // currentTier/currentSkinVariant must be set BEFORE updateFrame() below -
    // applyVariant() (used by updateFrame's face fill and getPathColor) reads
    // both, and updateFrame used to run before currentTier was assigned here,
    // which would have drawn the very first frame of a new level using the
    // PREVIOUS level's tier/variant.
    currentTier = tier || currentTier;
    currentSkinVariant = skinVariant || 'normal';
    updateFrame(paths, true);
    setSceneMood(currentTier, isMilestone);
  }

  function segFaceKey(s) { return Polycube.faceKey(s.cube, s.dir); }

  // Redrawing + re-uploading every dirty face's texture every animation frame is
  // expensive. Callers that know exactly which faces changed (game.js, mid-
  // animation) pass that set explicitly as a Set of face keys; `true` forces
  // every exposed face (level load / undo, where idle paths' appearance also
  // needs refreshing).
  function updateFrame(paths, dirtyFaces) {
    // Guards a caller (e.g. picking a skin from the main menu, before any
    // level has ever been loaded this session) asking for a full redraw
    // while currentGraph is still null - nothing to redraw yet, the new
    // colors apply naturally on the next real setLevelData() call.
    if (dirtyFaces === true && !currentGraph) return;
    currentPaths = paths;

    const facesToRedraw = dirtyFaces === true
      ? new Set(currentGraph.faces.map(f => f.key))
      : new Set(dirtyFaces);

    if (highlightPathId !== null) {
      const hp = paths.find(p => p.id === highlightPathId);
      if (hp) hp.segments.forEach(s => facesToRedraw.add(segFaceKey(s)));
    }

    facesToRedraw.forEach(key => {
      const i = faceIndexByKey[key];
      if (i === undefined) return;
      const ctx = faceContexts[i];
      const dark = Storage.get('theme') === 'dark';
      const skin = activeSkin();
      const baseFace = skin ? (dark ? skin.colors.face.dark : skin.colors.face.light) : (dark ? '#1a1a2e' : '#ffffff');
      const variantFace = applyVariant(baseFace, 'face');
      ctx.fillStyle = variantFace;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      // Material pattern is drawn from the POST-variant color (not the raw
      // skin base) so it darkens/tints alongside the face at milestone/epic/
      // daily/remix levels too, instead of looking static while everything
      // else around it escalates.
      // tMs uses performance.now() for every material except 'holo'. 'holo' instead
      // uses holoSyncMs, a value shared module-wide that only advances on its own
      // periodic timer (see the animate() loop's holo-sync tick) - NOT a fresh
      // performance.now() read here. A face that redraws often (e.g. a path bouncing
      // off a blocked tap, redrawn every animation-frame tick for ~1-2 real seconds)
      // would otherwise race through the rainbow cycle on its own while every
      // untouched face around it sits frozen at a much older phase - reported
      // directly as one face flashing a wildly different color mid-bump while its
      // neighbors stayed static. Reading a shared, slow-moving clock instead means
      // ANY redraw of ANY face, however frequent, always paints the level's current
      // shared phase - never its own private one.
      const tMs = skin && skin.material === 'holo' ? holoSyncMs : performance.now();
      if (skin) drawMaterialPattern(ctx, skin.material, variantFace, key, ctx.canvas.width, ctx.canvas.height, tMs);
      // Mascot art (premium skins only, e.g. royalebear/gemcat) - drawn after
      // the material pattern but still well before path lines/arrows below,
      // at reduced alpha so it reads as decoration, not something competing
      // with the actual gameplay signal.
      if (skin && skin.mascotIcon) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        drawMascotIcon(ctx, skin.mascotIcon, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      }

      // Face-boundary seam: findBlocker() only ever checks the head's own
      // face (see [[arrowflow_open_issues]]) - a path can look like it
      // crosses another path's line when really they're on two different
      // faces that happen to align visually from the current angle. Drawing
      // a border around each face's own canvas gives a constant visual cue
      // for "this is a separate face" without touching blocking logic.
      // Only drawn on edges where the neighbor face (via the adjacency
      // graph) actually turns a corner (different outward direction) - two
      // coplanar faces from different cubes of the same polycube (e.g. two
      // cubes glued side by side, both contributing to one flat exterior
      // wall) share NO real visual seam and should read as one continuous
      // sheet, not a grid of squares. Reported directly with a screenshot
      // circling exactly those flush, same-plane seams as ones that
      // shouldn't be there.
      // Gold seam for 'badge' skins (the 6 animal-mascot skins) - the cube's
      // actual physical edges become the "premium trim" cue instead of a
      // per-face inset frame (see drawMaterialPattern's 'badge' branch for
      // why the per-face frame was dropped).
      ctx.strokeStyle = (skin && skin.material === 'badge') ? '#d4af37' : (dark ? 'rgba(255,255,255,0.35)' : 'rgba(20,30,50,0.28)');
      const bw = PX_PER_CELL * 0.12;
      const W = ctx.canvas.width, H = ctx.canvas.height;
      ctx.lineWidth = bw;
      const thisFace = currentGraph.faceByKey[key];
      EDGES.forEach(edge => {
        const [neighborKey] = currentGraph.adj[key][edge];
        const neighborFace = currentGraph.faceByKey[neighborKey];
        if (neighborFace && neighborFace.d === thisFace.d) return; // coplanar continuation - no seam
        ctx.beginPath();
        if (edge === 'top') { ctx.moveTo(0, bw / 2); ctx.lineTo(W, bw / 2); }
        else if (edge === 'bottom') { ctx.moveTo(0, H - bw / 2); ctx.lineTo(W, H - bw / 2); }
        else if (edge === 'left') { ctx.moveTo(bw / 2, 0); ctx.lineTo(bw / 2, H); }
        else if (edge === 'right') { ctx.moveTo(W - bw / 2, 0); ctx.lineTo(W - bw / 2, H); }
        ctx.stroke();
      });

      paths.forEach(p => {
        // A path that's already committed to exiting ('moving') is drawn as
        // instantly gone from the face, not progressively slid off - see
        // the exit-shot flourish in shootExitArrow()/drawExitShots(), which
        // is now the ONLY visual for a clearing path (previously the two
        // ran concurrently at different speeds and read as two disconnected
        // lines, reported directly with a screenshot).
        if (!p.cleared && p.status !== 'moving' && p.segments.some(s => segFaceKey(s) === key)) {
          const highlighted = p.id === highlightPathId && performance.now() < highlightUntil;
          drawPathOnFace(ctx, p, key, highlighted);
        }
      });
      faceTextures[i].needsUpdate = true;
    });
  }

  // Longer than the old 1200ms, and now paired with an auto-rotate (see
  // snapToFace() below) - on a dense many-face polycube shape (see
  // [[arrowflow_level_roadmap]] v8), the hinted path is often on a face the
  // player isn't currently looking at, so a pulse alone was easy to miss
  // entirely (reported directly: "มองไม่ค่อยเห็นว่าช่วยเหลือแล้ว").
  const HINT_HIGHLIGHT_MS = 3500;

  let highlightedFaceIndices = [];
  function boostHighlightedFacesOpacity(path) {
    restoreHighlightedFacesOpacity();
    const keys = new Set(path.segments.map(segFaceKey));
    highlightedFaceIndices = [...keys].map(k => faceIndexByKey[k]).filter(i => i !== undefined);
    highlightedFaceIndices.forEach(i => {
      frontMaterials[i].opacity = HIGHLIGHT_OPACITY;
      backMaterials[i].opacity = HIGHLIGHT_OPACITY;
    });
  }
  function restoreHighlightedFacesOpacity() {
    highlightedFaceIndices.forEach(i => {
      if (frontMaterials[i]) frontMaterials[i].opacity = FRONT_OPACITY;
      if (backMaterials[i]) backMaterials[i].opacity = BACK_OPACITY;
    });
    highlightedFaceIndices = [];
  }

  // `snap` defaults true (useHint()'s one-shot use of this). The tutorial's tap
  // step re-fires this repeatedly to keep the glow from fading while it waits
  // for the player - passing snap:false there stops each re-fire from yanking
  // the camera back to face the target if the player has since rotated away on
  // their own (reported directly: rotate to line the tap up, hold still for a
  // moment, and the view "bounces back" - that was this re-snapping every 3s).
  function highlightPath(id, snap = true) {
    highlightPathId = id;
    highlightUntil = performance.now() + HINT_HIGHLIGHT_MS;
    const path = currentPaths.find(p => p.id === id);
    if (path && path.segments.length) {
      if (snap) {
        const head = path.segments.find(s => s.isHead) || path.segments[path.segments.length - 1];
        snapToFace(head.cube, head.dir);
      }
      boostHighlightedFacesOpacity(path);
    }
  }

  // Smoothly auto-rotates the shape so the given face turns to directly face
  // the camera - the hint highlight alone isn't enough to find a path once a
  // shape has many faces (see highlightPath() above).
  let targetQuaternion = null;
  function snapToFace(pos, d) {
    const localNormal = outwardNormal(d);
    const cameraDir = camera.position.clone().normalize();
    targetQuaternion = new THREE.Quaternion().setFromUnitVectors(localNormal, cameraDir);
  }

  // Cells are always square (every exposed face's canvas is a uniform
  // unitGrid x unitGrid square - see rebuildGeometry()), so cellSize is just
  // the constant regardless of which face.
  function drawPathOnFace(ctx, path, faceKey, highlighted) {
    const cellSize = PX_PER_CELL;
    const offset = path.progress || 0;

    const L = path.segments.length - 1;
    const startD = offset;
    const endD = L + offset;

    if (highlighted) {
      // Magenta doesn't collide with any of the semantic path colors (idle
      // blue/cyan, moving green, blocked red) in either theme, and the pulse
      // floor is kept high (never dims below ~65% alpha) so it stays
      // readable even at the trough - a full 0-to-1 pulse was reported as
      // hard to notice, especially on a face seen through the see-through
      // back-mesh at reduced opacity (see also the per-face opacity boost
      // in highlightPath()/clearHighlightBoost() below). This overlay stays
      // a plain pulse regardless of skin lineStyle - it's a status cue, not
      // a cosmetic decoration.
      const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 130);
      ctx.shadowColor = '#FF2DF5';
      ctx.shadowBlur = cellSize * 0.6;
      ctx.strokeStyle = `rgba(255,45,245,${pulse})`;
      ctx.lineWidth = cellSize * 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePath(ctx, path, faceKey, cellSize, startD, endD, L);
      ctx.shadowBlur = 0;
    }

    const color = getPathColor(path);
    const skin = activeSkin();
    const lineStyle = (skin && skin.lineStyle) || 'plain';
    const { polylines, headPt } = collectPathPoints(path, faceKey, cellSize, startD, endD, L);

    if (lineStyle === 'plain') {
      ctx.strokeStyle = color;
      ctx.lineWidth = cellSize * 0.28;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      polylines.forEach(poly => poly.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    } else {
      drawStyledPath(ctx, polylines, cellSize, color, lineStyle, path.id + ':' + faceKey, performance.now());
    }

    if (headPt) {
      let dir = path.exitDir;
      if (endD < L) {
        let idx = Math.floor(endD);
        let sA = path.segments[idx];
        let sB = path.segments[idx+1];
        if (segFaceKey(sA) === segFaceKey(sB)) {
          if (sB.r < sA.r) dir = 'up';
          else if (sB.r > sA.r) dir = 'down';
          else if (sB.c < sA.c) dir = 'left';
          else if (sB.c > sA.c) dir = 'right';
        }
      }
      if (lineStyle === 'plain') {
        drawPerfectArrowHead(ctx, headPt.x, headPt.y, dir, cellSize * 0.5, color, skin ? skin.arrowShape : 'triangle');
      } else {
        drawStyledArrowHead(ctx, headPt.x, headPt.y, dir, cellSize * 0.5, color, lineStyle, performance.now());
      }
    }
  }

  // Same distance-walking logic as strokePath() below but collects raw
  // {x,y} points per contiguous on-this-face run instead of stroking them
  // directly - needed so the themed lineStyle renderers (rope/neon/water/
  // etc, see drawStyledPath) can post-process the geometry (offsets, wobble,
  // decorations) instead of just drawing a single flat stroke.
  function collectPathPoints(path, faceKey, cellSize, startD, endD, L) {
    const result = { polylines: [], headPt: null };
    const steps = Math.ceil(endD - startD) * 10;
    if (steps <= 0) return result;
    const stepSize = (endD - startD) / steps;
    let current = null;

    for (let i = 0; i <= steps; i++) {
      let d = startD + i * stepSize;
      let actualD = d;
      if (i === steps && endD >= L) actualD -= 0.25;

      let pt = getPointAtDist(path, actualD, cellSize, L);
      let realHeadPt = getPointAtDist(path, d, cellSize, L);

      if (pt.faceKey === faceKey) {
        if (!current) { current = []; result.polylines.push(current); }
        current.push({ x: pt.x, y: pt.y });
      } else {
        current = null;
      }

      if (i === steps && realHeadPt.faceKey === faceKey) result.headPt = realHeadPt;
    }
    return result;
  }

  function strokePath(ctx, path, faceKey, cellSize, startD, endD, L) {
    ctx.beginPath();
    let hasMoved = false;

    const steps = Math.ceil(endD - startD) * 10;
    if (steps <= 0) return null;
    const stepSize = (endD - startD) / steps;

    let headPt = null;

    for(let i = 0; i <= steps; i++) {
      let d = startD + i * stepSize;

      // Stop the stroke slightly before the exact head tip to prevent line cap poking out
      let actualD = d;
      if (i === steps && endD >= L) {
         actualD -= 0.25; // shorten by a fraction of a cell
      }

      let pt = getPointAtDist(path, actualD, cellSize, L);
      let realHeadPt = getPointAtDist(path, d, cellSize, L);

      if (pt.faceKey === faceKey) {
        if (!hasMoved) {
          ctx.moveTo(pt.x, pt.y);
          hasMoved = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      } else {
        hasMoved = false;
      }

      if (i === steps && realHeadPt.faceKey === faceKey) {
        headPt = realHeadPt;
      }
    }
    ctx.stroke();
    return headPt;
  }

  // Determines which of sA's 4 edges (top/bottom/left/right) actually leads
  // to keyB, using the real adjacency graph rather than guessing from sA's
  // row/col boundary position - a corner cell (e.g. r=0 AND c=0) sits on TWO
  // boundaries at once, and picking the wrong one sent the stroke to the
  // wrong wall, leaving a visible gap where the line should have continued
  // onto the neighboring face (reported by the user as broken corners).
  function edgeTowards(fromKey, toKey) {
    const adj = currentGraph && currentGraph.adj[fromKey];
    if (adj) {
      for (const edge in adj) {
        if (adj[edge][0] === toKey) return edge;
      }
    }
    return null;
  }

  function clampToEdge(edge, cx, cy, texSize, fallbackR, fallbackC) {
    let ex = cx, ey = cy;
    if (edge === 'top') ey = 0;
    else if (edge === 'bottom') ey = texSize;
    else if (edge === 'left') ex = 0;
    else if (edge === 'right') ex = texSize;
    else {
      // Fallback: old boundary-guessing, only reached if the graph lookup
      // above somehow fails (e.g. mismatched keys) - keeps rendering from
      // hard-breaking rather than leaving the stroke stuck at the cell center.
      if (fallbackR === 0) ey = 0;
      else if (fallbackR === currentUnitGrid - 1) ey = texSize;
      else if (fallbackC === 0) ex = 0;
      else if (fallbackC === currentUnitGrid - 1) ex = texSize;
    }
    return { ex, ey };
  }

  function getPointAtDist(path, d, cellSize, L) {
    const texSize = currentUnitGrid * cellSize;
    if (d <= 0) {
      const s0 = path.segments[0];
      return { faceKey: segFaceKey(s0), x: s0.c * cellSize + cellSize/2, y: s0.r * cellSize + cellSize/2 };
    }
    if (d <= L) {
      let idx = Math.floor(d);
      let t = d - idx;
      if (idx === L) { idx = L - 1; t = 1; }
      let sA = path.segments[idx];
      let sB = path.segments[idx+1];
      const keyA = segFaceKey(sA), keyB = segFaceKey(sB);

      if (keyA === keyB) {
        let x = (sA.c + t * (sB.c - sA.c)) * cellSize + cellSize/2;
        let y = (sA.r + t * (sB.r - sA.r)) * cellSize + cellSize/2;
        return { faceKey: keyA, x, y };
      } else {
        // Cross face logic: extend to edge
        if (t < 0.5) {
          let t2 = t * 2;
          let cx = sA.c * cellSize + cellSize/2;
          let cy = sA.r * cellSize + cellSize/2;
          const edge = edgeTowards(keyA, keyB);
          const { ex, ey } = clampToEdge(edge, cx, cy, texSize, sA.r, sA.c);
          return { faceKey: keyA, x: cx + t2 * (ex - cx), y: cy + t2 * (ey - cy) };
        } else {
          let t2 = (t - 0.5) * 2;
          let cx = sB.c * cellSize + cellSize/2;
          let cy = sB.r * cellSize + cellSize/2;
          const edge = edgeTowards(keyB, keyA);
          const { ex, ey } = clampToEdge(edge, cx, cy, texSize, sB.r, sB.c);
          return { faceKey: keyB, x: ex + t2 * (cx - ex), y: ey + t2 * (cy - ey) };
        }
      }
    } else {
      let head = path.segments[L];
      let ext = d - L;
      // A clearing path's whole stroke has to travel its own length L for
      // the tail to catch up to where the head started (see animateLogic()'s
      // comment in game.js) - that part is correct and uses real segment
      // data via the d<=L branch above. But once the WINDOW's start (not
      // just its end) also passes L, near the end of the slide, this crude
      // "extend head's r/c in a straight line on its own face" fallback was
      // being asked to draw up to L+4 cells out - for a longer path that's
      // a long straight line cutting across (or past) the head's face,
      // completely disconnected from the path's actual maze shape,
      // reported directly as "the line dives away before the true edge,
      // then a stray line shoots out to the edge of the screen". Clamping
      // the overshoot to a small constant keeps the intended "pokes a
      // little past the edge, then gone" look regardless of path length -
      // points beyond the clamp return no face (faceKey: null never matches
      // any real key) so strokePath() just stops drawing there instead of
      // rendering the runaway line.
      const MAX_EXIT_OVERSHOOT = 1.5;
      if (ext > MAX_EXIT_OVERSHOOT) return { faceKey: null, x: 0, y: 0 };
      let r = head.r, c = head.c;
      if (path.exitDir === 'up') r -= ext;
      else if (path.exitDir === 'down') r += ext;
      else if (path.exitDir === 'left') c -= ext;
      else if (path.exitDir === 'right') c += ext;
      return { faceKey: segFaceKey(head), x: c * cellSize + cellSize/2, y: r * cellSize + cellSize/2 };
    }
  }

  // `shape` (Phase 2, per-skin arrowShape) only changes the silhouette drawn
  // in this already-rotated local frame - direction/position logic above is
  // untouched, so every shape still points the same way 'triangle' always did.
  function drawPerfectArrowHead(ctx, x, y, dir, size, color, shape) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.beginPath();

    const hw = size * 0.7;
    const hh = size * 0.6;

    ctx.translate(x, y);
    if (dir === 'up') { ctx.rotate(0); ctx.translate(0, -size*0.1); }
    else if (dir === 'right') { ctx.rotate(Math.PI / 2); ctx.translate(0, -size*0.1); }
    else if (dir === 'down') { ctx.rotate(Math.PI); ctx.translate(0, -size*0.1); }
    else if (dir === 'left') { ctx.rotate(-Math.PI / 2); ctx.translate(0, -size*0.1); }

    if (shape === 'diamond') {
      ctx.moveTo(0, -hh); ctx.lineTo(hw * 0.75, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw * 0.75, 0);
      ctx.closePath();
      ctx.fill();
    } else if (shape === 'chevron') {
      ctx.lineWidth = size * 0.3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(-hw, hh); ctx.lineTo(0, -hh * 0.2); ctx.lineTo(hw, hh);
      ctx.stroke();
    } else if (shape === 'star') {
      const spikes = 4, outerR = hh, innerR = hh * 0.4;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (Math.PI / spikes) * i - Math.PI / 2;
        const px = Math.cos(a) * r, py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // --- Per-skin lineStyle: full path-line + arrowhead theming (rope/vine,
  // neon tube, water stream, chain link, paw-print trail, ribbon, laser
  // beam), layered on top of the material/arrowShape/particleTheme system
  // above. Unlike `arrowShape` (a silhouette swap only), a lineStyle also
  // replaces how the connecting line itself is drawn - see drawStyledPath
  // vs. the single ctx.stroke() the 'plain' skins still use in
  // drawPathOnFace. All 10 requested themes are wired up: emerald/rope,
  // cyber/neon, mint+gemdolphin/water, obsidian/chain, the 5 land-mammal
  // mascots/pawprint, rose/ribbon, royaleneon/laser, streakcandy/candy,
  // gemorigami/origami, royalecircuit/circuit (see js/skins.js).
  function drawStyledPath(ctx, polylines, cellSize, color, style, seedKey, tMs) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    polylines.forEach((points, polyIdx) => {
      if (points.length < 2) return;
      const rand = mulberry32(hashString(seedKey + ':' + polyIdx));
      if (style === 'rope') drawRopeSegment(ctx, points, cellSize, color, rand);
      else if (style === 'neon') drawNeonSegment(ctx, points, cellSize, color, tMs);
      else if (style === 'water') drawWaterSegment(ctx, points, cellSize, color, tMs);
      else if (style === 'chain') drawChainSegment(ctx, points, cellSize, color);
      else if (style === 'pawprint') drawPawprintSegment(ctx, points, cellSize, color);
      else if (style === 'ribbon') drawRibbonSegment(ctx, points, cellSize, color);
      else if (style === 'laser') drawLaserSegment(ctx, points, cellSize, color, tMs);
      else if (style === 'candy') drawCandySegment(ctx, points, cellSize, color);
      else if (style === 'origami') drawOrigamiSegment(ctx, points, cellSize, color);
      else if (style === 'circuit') drawCircuitSegment(ctx, points, cellSize, color);
      else {
        ctx.strokeStyle = color;
        ctx.lineWidth = cellSize * 0.28;
        ctx.beginPath();
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // Assumes the context is already translated to the tip position and
  // rotated so "forward" is -y (matches drawPerfectArrowHead's own
  // convention) - the two callers below just differ in how they get there:
  // one from a face-local 4-way dir, the other from a free screen-space angle.
  function drawStyledArrowHeadShape(ctx, size, color, style, tMs) {
    if (style === 'rope') drawVineLeafTip(ctx, size, color);
    else if (style === 'neon') drawNeonBulbTip(ctx, size, color, tMs);
    else if (style === 'water') drawSplashTip(ctx, size, color);
    else if (style === 'chain') drawHookTip(ctx, size, color);
    else if (style === 'pawprint') drawPawMark(ctx, 0, 0, 0, size * 1.3, color);
    else if (style === 'ribbon') drawBowTip(ctx, size, color);
    else if (style === 'laser') drawEnergyBurstTip(ctx, size, color, tMs);
    else if (style === 'candy') drawCandyTip(ctx, size, color);
    else if (style === 'origami') drawOrigamiTip(ctx, size, color);
    else if (style === 'circuit') drawSolderTip(ctx, size, color);
    else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.6); ctx.lineTo(size * 0.7, size * 0.6); ctx.lineTo(-size * 0.7, size * 0.6);
      ctx.fill();
    }
  }

  function drawStyledArrowHead(ctx, x, y, dir, size, color, style, tMs) {
    ctx.save();
    ctx.translate(x, y);
    if (dir === 'up') ctx.rotate(0);
    else if (dir === 'right') ctx.rotate(Math.PI / 2);
    else if (dir === 'down') ctx.rotate(Math.PI);
    else if (dir === 'left') ctx.rotate(-Math.PI / 2);
    ctx.translate(0, -size * 0.1);
    drawStyledArrowHeadShape(ctx, size, color, style, tMs);
    ctx.restore();
  }

  // Free-angle variant (screen-space effects like the exit-shot trail below,
  // which travel at whatever on-screen angle the shape's current rotation
  // happens to put the exit direction at, not one of the 4 face-local dirs).
  // rotate(angle + PI/2) maps this function's local "forward" (-y) onto the
  // world direction (cos(angle), sin(angle)) - same derivation as the
  // pawprint trail's per-mark rotation below.
  function drawStyledArrowHeadAtAngle(ctx, x, y, angle, size, color, style, tMs) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    drawStyledArrowHeadShape(ctx, size, color, style, tMs);
    ctx.restore();
  }

  // 1. Rope/Vine - a thick darkened base cord with lighter perpendicular
  // "twist" ticks alternating sides every few samples, suggesting braided
  // fiber without needing a real 3D twist. Stride widened (was 5, reported
  // as too busy once several paths share a face - see the general density
  // note above drawPawprintSegment) so it reads as texture, not clutter.
  function drawRopeSegment(ctx, points, cellSize, color, rand) {
    const w = cellSize * 0.3;
    ctx.strokeStyle = darkenHex(color, 0.65);
    ctx.lineWidth = w;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = mixHex(color, '#ffffff', 0.35);
    ctx.lineWidth = Math.max(1, w * 0.16);
    const stride = 10;
    for (let i = stride; i < points.length - 1; i += stride) {
      const a = points[i - 1], b = points[Math.min(i + 1, points.length - 1)];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const len = w * 0.5;
      const dir = (Math.floor(i / stride) % 2 === 0) ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(points[i].x - nx * len * dir, points[i].y - ny * len * dir);
      ctx.lineTo(points[i].x + nx * len * dir, points[i].y + ny * len * dir);
      ctx.stroke();
    }
    void rand; // seed reserved for future jitter, geometry-derived pattern is enough for now
  }
  // Sharp point only at the front (-y, direction of travel), rounded/lobed
  // leaf-base at the back (+y, where the rope trails in) - the old shape
  // tapered to a point at BOTH ends (a symmetric vesica/eye), which read
  // ambiguously as "which end is actually the tip" and got reported as being
  // mistaken for the rope's tail rather than the arrowhead. A one-directional
  // point matches how every other skin's arrowShape already reads.
  function drawVineLeafTip(ctx, size, color) {
    ctx.fillStyle = mixHex(color, '#2e7d32', 0.35);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.85);
    ctx.quadraticCurveTo(size * 0.5, -size * 0.05, size * 0.4, size * 0.45);
    ctx.quadraticCurveTo(0, size * 0.28, -size * 0.4, size * 0.45);
    ctx.quadraticCurveTo(-size * 0.5, -size * 0.05, 0, -size * 0.85);
    ctx.fill();
    ctx.strokeStyle = darkenHex(color, 0.6);
    ctx.lineWidth = Math.max(1, size * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7); ctx.lineTo(0, size * 0.32);
    ctx.stroke();
  }

  // 2. Neon Tube - REDESIGNED (2026-08-20): the traveling pulse dot was
  // computed fresh per polyline fragment (this function runs once per
  // on-this-face contiguous run, see drawStyledPath's forEach), and since
  // this game's paths cross faces constantly, that meant a dot near the
  // start of nearly every fragment - i.e. a dot at nearly every corner,
  // same corner-clustering bug reported on chain/circuit above and now
  // confirmed still visible here too. Removed entirely - just the glow
  // underlayer + bright core line now, with the single "current" dot
  // reserved for the arrowhead's neon-bulb tip only.
  function drawNeonSegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.3;
    ctx.shadowColor = color;
    ctx.shadowBlur = w * 1.4;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mixHex(color, '#ffffff', 0.6);
    ctx.lineWidth = w * 0.4;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  function drawNeonBulbTip(ctx, size, color, tMs) {
    const pulse = 0.7 + 0.3 * Math.sin((tMs || 0) / 250);
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 1.2 * pulse;
    ctx.fillStyle = mixHex(color, '#ffffff', 0.5);
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -size * 0.05, size * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Water Stream - the line itself wobbles perpendicular to its own
  // tangent via a traveling sine wave (driven by tMs, same "redraws on
  // change only" caveat as the neon pulse above), plus a thin translucent
  // highlight stroke on top for a wet/glossy read.
  function drawWaterSegment(ctx, points, cellSize, color, tMs) {
    const w = cellSize * 0.28;
    const t = (tMs || 0) / 300;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    points.forEach((p, i) => {
      let x = p.x, y = p.y;
      if (i > 0 && i < points.length - 1) {
        const a = points[i - 1], b = points[i + 1];
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const nx = -Math.sin(angle), ny = Math.cos(angle);
        const wob = Math.sin(i * 0.9 + t) * w * 0.22;
        x += nx * wob; y += ny * wob;
      }
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = w * 0.25;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  function drawSplashTip(ctx, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, size * 0.05, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    [[-0.5, -0.3], [0.5, -0.3], [0, -0.65]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx * size, dy * size, size * 0.14, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 4. Chain Link - REDESIGNED (2026-08-20, same corner-clustering bug as
  // circuit's via dots below): the per-stride link loop restarted at i=0 for
  // EVERY polyline fragment (a face-crossing corner starts a new fragment,
  // see collectPathPoints), and this game's paths cross faces constantly -
  // so a link/dot landed at nearly every corner regardless of the intended
  // stride spacing, reported directly as "confusing, can't find the real
  // head." Now just a two-tone rail (thin dark outline + lighter core) with
  // no discrete stamped shapes at all - the chain identity lives entirely
  // in the hook-shaped arrowhead below, the one dot that's actually meant
  // to mark something.
  function drawChainSegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.3;
    ctx.strokeStyle = darkenHex(color, 0.55);
    ctx.lineWidth = w * 0.34;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = mixHex(color, '#ffffff', 0.2);
    ctx.lineWidth = w * 0.16;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  function drawHookTip(ctx, size, color) {
    ctx.strokeStyle = mixHex(color, '#ffffff', 0.2);
    ctx.lineWidth = size * 0.22;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -size * 0.05, size * 0.4, Math.PI * 0.15, Math.PI * 1.65, false);
    ctx.stroke();
  }

  // 5. Dotted Trail with Paw/Footprint - REDESIGNED (2026-08-20, reported as
  // "very hard to read" on real gameplay screenshots): the original version
  // had NO connecting line at all, just alternating-side paw marks - fine
  // for a single isolated path, but this game routinely has many paths
  // sharing one face (a maze, not one line), and without a real line to
  // trace, dense corridors of overlapping paw blobs stopped reading as
  // paths entirely. Now draws the same thin base line every other style
  // gets (so the maze stays legible regardless of skin, matching 'plain'),
  // with paw marks centered ON the line (no more alternating perpendicular
  // offset, which doubled the visual footprint into a solid "belt") as a
  // light, sparse accent - much wider stride, smaller, slightly
  // translucent, closer in spirit to the sparkle-glint accent than to a
  // texture that has to carry the whole line by itself.
  function drawPawMark(ctx, x, y, forwardAngle, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(forwardAngle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, size * 0.15, size * 0.42, size * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    [[-0.32, -0.35], [0, -0.48], [0.32, -0.35]].forEach(([tx, ty]) => {
      ctx.beginPath();
      ctx.ellipse(tx * size, ty * size, size * 0.16, size * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
  function drawPawprintSegment(ctx, points, cellSize, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = cellSize * 0.22;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    const w = cellSize * 0.4;
    const stride = 16;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < points.length; i += stride) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      drawPawMark(ctx, p.x, p.y, angle + Math.PI / 2, w, color);
    }
    ctx.globalAlpha = 1;
  }

  // 6. Ribbon - a darker shadow-side edge behind a narrower main body plus a
  // glossy offset highlight streak, faking a folded satin cross-section
  // without real lighting.
  function drawRibbonSegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.32;
    ctx.strokeStyle = darkenHex(color, 0.75);
    ctx.lineWidth = w;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w * 0.8;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = w * 0.22;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y - w * 0.15) : ctx.lineTo(p.x, p.y - w * 0.15));
    ctx.stroke();
  }
  function drawBowTip(ctx, size, color) {
    ctx.fillStyle = color;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * size * 0.7, -size * 0.5, side * size * 0.55, size * 0.15);
      ctx.quadraticCurveTo(side * size * 0.2, size * 0.1, 0, 0);
      ctx.fill();
    });
    ctx.fillStyle = darkenHex(color, 0.7);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // 7. Laser/Energy Beam - REDESIGNED (2026-08-20): same corner-clustering
  // bug as neon's pulse dot above - the traveling radial-gradient pulse was
  // computed fresh per polyline fragment, so it landed near nearly every
  // face-crossing corner instead of sliding smoothly along one path. Removed
  // - just the glow underlayer + bright core now, with the pulse look kept
  // exclusively for the energy-burst arrowhead tip.
  function drawLaserSegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.28;
    ctx.shadowColor = color;
    ctx.shadowBlur = w * 1.6;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = w * 0.6;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = w * 0.18;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  function drawEnergyBurstTip(ctx, size, color, tMs) {
    const t = (tMs || 0) / 300;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = size * 0.08;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t;
      const r1 = size * 0.3, r2 = size * 0.65;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }
  }

  // 8. Candy Trail - REDESIGNED (2026-08-20, reported as unreadable: on a
  // real gameplay screenshot the base "cane" was drawn in a near-white
  // '#fffaf0', which is nearly invisible against this skin's own pale
  // cream/pink face color - only the diagonal red stripe ticks stayed
  // visible, so the trail read as disconnected dashes with no line
  // connecting them at all, and the old fully-circular swirl arrowhead had
  // no directional cue, reading as an ambiguous blob rather than an arrow.
  // Base is now a light TINT OF THE SKIN'S OWN COLOR (always has contrast
  // against any face, unlike a fixed cream) and the tip is a clipped
  // "candy drop" silhouette (clear forward point) filled with the same
  // diagonal stripe pattern instead of a full spiral.
  function drawCandySegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.32;
    ctx.strokeStyle = mixHex(color, '#ffffff', 0.7);
    ctx.lineWidth = w;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w * 0.34;
    const stride = 7;
    for (let i = 0; i < points.length - 1; i += stride) {
      const a = points[i], b = points[Math.min(i + stride, points.length - 1)];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const half = w * 0.55;
      ctx.beginPath();
      ctx.moveTo(a.x - nx * half, a.y - ny * half);
      ctx.lineTo(a.x + nx * half, a.y + ny * half);
      ctx.stroke();
    }
  }
  function drawCandyTip(ctx, size, color) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.65);
    ctx.quadraticCurveTo(size * 0.6, size * 0.05, 0, size * 0.6);
    ctx.quadraticCurveTo(-size * 0.6, size * 0.05, 0, -size * 0.65);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.strokeStyle = mixHex(color, '#ffffff', 0.7);
    ctx.lineWidth = size * 0.24;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-size + i * size * 0.5, size);
      ctx.lineTo(size + i * size * 0.5, -size);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 9. Origami Fold Line - alternating light/shadow flat facets (hard edges,
  // no round cap/join - the opposite look from every rounded-tube style
  // above) with a crease line at each facet boundary, faking a folded paper
  // strip without any real lighting.
  function drawOrigamiSegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.3;
    const half = w * 0.5;
    const lightShade = mixHex(color, '#ffffff', 0.35);
    const darkShade = darkenHex(color, 0.6);
    const stride = 7;
    for (let i = 0; i < points.length - 1; i += stride) {
      const a = points[i], b = points[Math.min(i + stride, points.length - 1)];
      if (a === b) continue;
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(angle), ny = Math.cos(angle);
      const shade = (Math.floor(i / stride) % 2 === 0) ? lightShade : darkShade;
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(a.x - nx * half, a.y - ny * half);
      ctx.lineTo(a.x + nx * half, a.y + ny * half);
      ctx.lineTo(b.x + nx * half, b.y + ny * half);
      ctx.lineTo(b.x - nx * half, b.y - ny * half);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = darkenHex(shade, 0.7);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x - nx * half, a.y - ny * half);
      ctx.lineTo(a.x + nx * half, a.y + ny * half);
      ctx.stroke();
    }
  }
  function drawOrigamiTip(ctx, size, color) {
    const light = mixHex(color, '#ffffff', 0.35);
    const dark = darkenHex(color, 0.6);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.65); ctx.lineTo(size * 0.55, size * 0.5); ctx.lineTo(0, size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.65); ctx.lineTo(-size * 0.55, size * 0.5); ctx.lineTo(0, size * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = darkenHex(color, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.65); ctx.lineTo(0, size * 0.15);
    ctx.stroke();
  }

  // 10. Circuit Trace - REDESIGNED (2026-08-20): the via-dot loop had the
  // same corner-clustering bug as chain's link loop above - it restarted at
  // i=0 for every polyline fragment, and this game's paths cross faces
  // (start a new fragment) constantly, so a white via dot landed at nearly
  // every corner. Reported directly from a real gameplay screenshot: it
  // looked like a dot at every turn, made the actual head (the one dot that
  // matters) impossible to pick out. Now just the copper trace itself
  // (square caps/miter joins - the underlying points are already
  // axis-aligned, since game paths only ever move one grid step at a time,
  // so this alone reads as real right-angle PCB routing) with the solder
  // dot reserved for the arrowhead only, below.
  function drawCircuitSegment(ctx, points, cellSize, color) {
    const w = cellSize * 0.18;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = darkenHex(color, 0.5);
    ctx.lineWidth = w * 1.6;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }
  function drawSolderTip(ctx, size, color) {
    ctx.fillStyle = darkenHex(color, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mixHex(color, '#ffffff', 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function animate() {
    requestAnimationFrame(animate);
    // Periodic holo-sync tick - advances the shared holoSyncMs clock (see its
    // declaration and updateFrame()'s use of it) at most once every
    // HOLO_SYNC_INTERVAL_MS, and only actually redraws faces when a 'holo' skin is
    // active. This is the ONLY place holoSyncMs changes, decoupling the rainbow's
    // animation speed from however often gameplay happens to redraw individual
    // faces - a single cheap full redraw every 1.5s here keeps every face on
    // screen always agreeing on the current phase, instead of active/bumped paths
    // racing ahead of idle ones.
    const nowMs = performance.now();
    if (nowMs - lastHoloSyncTickMs >= HOLO_SYNC_INTERVAL_MS) {
      lastHoloSyncTickMs = nowMs;
      holoSyncMs = nowMs;
      const skin = activeSkin();
      if (skin && skin.material === 'holo' && currentGraph) updateFrame(currentPaths, true);
    }
    if (moodTo && scene.background) {
      const t = Math.min(1, (performance.now() - moodStart) / MOOD_TRANSITION_MS);
      scene.background.copy(moodFrom).lerp(moodTo, t);
      if (milestoneMoodActive) {
        const pulse = 1 + 0.06 * Math.sin(performance.now() / 300);
        scene.background.multiplyScalar(pulse);
      }
    }
    if (highlightPathId) {
      if (performance.now() < highlightUntil) {
        updateFrame(currentPaths);
      } else {
        highlightPathId = null;
        restoreHighlightedFacesOpacity();
        updateFrame(currentPaths);
      }
    }
    if (!isDragging && (Math.abs(velX) > INERTIA_STOP_EPS || Math.abs(velY) > INERTIA_STOP_EPS)) {
      applyDragRotation(velX, velY);
      velX *= INERTIA_FRICTION;
      velY *= INERTIA_FRICTION;
    }
    if (targetQuaternion && !isDragging) {
      shapeGroup.quaternion.slerp(targetQuaternion, 0.08);
      if (shapeGroup.quaternion.angleTo(targetQuaternion) < 0.01) targetQuaternion = null;
    }
    renderer.render(scene, camera);
    renderFxOverlay();
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeFxCanvas();
  }

  function resizeFxCanvas() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    fxCanvas.width = window.innerWidth * dpr;
    fxCanvas.height = window.innerHeight * dpr;
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getEventPos(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  // Degrees of rotation per pixel of drag - lowered from 0.5, then 0.32
  // (2026-08-15), then 0.2, then 0.1 (2026-08-17) after a third report
  // that long sessions still felt dizzying; bumped back up slightly here
  // (2026-08-18) after that landed as feeling too slow.
  const DRAG_SENSITIVITY = 0.15;

  function applyDragRotation(dx, dy) {
    const sensitivity = DRAG_SENSITIVITY * rotationSensitivityMultiplier;
    const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI/180 * (dy * sensitivity), Math.PI/180 * (dx * sensitivity), 0, 'XYZ')
    );
    shapeGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, shapeGroup.quaternion);
  }

  let dragDist = 0;
  function onPointerDown(e) {
    if (e.target.id !== 'three-canvas') return;
    if (e.touches && e.touches.length === 2) {
      isDragging = false; // a second finger landing mid-drag hands off to pinch, not rotate
      wasPinching = true;
      velX = 0; velY = 0;
      pinchStartDist = touchDistance(e.touches);
      pinchStartCameraDistance = cameraDistance;
      return;
    }
    isDragging = true;
    dragDist = 0;
    velX = 0; velY = 0; // grabbing the shape stops any in-flight inertia spin
    targetQuaternion = null; // ...and any in-flight hint auto-rotate
    previousMousePosition = getEventPos(e);
  }

  function onPointerMove(e) {
    if (e.touches && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDistance(e.touches);
      if (pinchStartDist > 0) {
        setCameraDistance(pinchStartCameraDistance * (pinchStartDist / dist));
        if (onGestureCallback) onGestureCallback('zoom', Math.abs(dist - pinchStartDist));
      }
      return;
    }
    if (!isDragging) return;
    const pos = getEventPos(e);
    const deltaMove = { x: pos.x - previousMousePosition.x, y: pos.y - previousMousePosition.y };
    dragDist += Math.abs(deltaMove.x) + Math.abs(deltaMove.y);

    applyDragRotation(deltaMove.x, deltaMove.y);
    if (onGestureCallback) onGestureCallback('rotate', dragDist);
    // Smooth toward the latest delta (not a running average of the whole drag) so the
    // release velocity reflects how the drag ended, not an early fast flick that already slowed down.
    // Clamped so a single huge-delta frame (fast swipe, or a touch-event coordinate jump)
    // can't launch the shape into an absurdly fast spin.
    const VEL_CLAMP = 25;
    velX += (Math.max(-VEL_CLAMP, Math.min(VEL_CLAMP, deltaMove.x)) - velX) * 0.5;
    velY += (Math.max(-VEL_CLAMP, Math.min(VEL_CLAMP, deltaMove.y)) - velY) * 0.5;
    previousMousePosition = pos;
  }

  function onPointerUp(e) {
    pinchStartDist = 0;
    isDragging = false;
    // Bug fix: dragDist alone doesn't catch this - during a 2-finger pinch,
    // onPointerMove's 2-touch branch returns early and never touches dragDist, so
    // it can still read <10 (e.g. 0, if the pinch started right after touchdown)
    // purely because pinching never counted as "drag" in the first place. Lifting
    // a finger off a pinch then fired touchend -> handleTap() at whatever position
    // the still-down finger happened to be, landing on an arrow and blocking it
    // for real - reported directly as "zooming loses me a heart." wasPinching is
    // a separate flag set for the whole gesture (see onPointerDown), so any lift
    // during/after a pinch is never treated as a tap, regardless of dragDist.
    const touchesRemaining = e.touches ? e.touches.length : 0;
    const pinched = wasPinching;
    if (touchesRemaining === 0) wasPinching = false;
    if (!pinched && dragDist < 10 && e.target.id === 'three-canvas') {
      velX = 0; velY = 0;
      handleTap(getEventPos(e));
    }
  }

  function handleTap(pos) {
    const mouse = new THREE.Vector2();
    mouse.x = (pos.x / window.innerWidth) * 2 - 1;
    mouse.y = -(pos.y / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(shapeMesh);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const faceObj = currentGraph.faces[intersect.face.materialIndex];
      if (onArrowTapCallback) onArrowTapCallback(faceObj.pos, faceObj.d, intersect.uv.x, intersect.uv.y);
    }
  }

  function setOnArrowTap(cb) { onArrowTapCallback = cb; }
  function setOnGesture(cb) { onGestureCallback = cb; }

  // Skins-screen "preview before you buy" modal (js/ui.js's openSkinPreview)
  // draws into its own small canvas via this, reusing the SAME material/
  // arrow/particle drawing functions the real game uses instead of
  // duplicating look-and-feel logic in ui.js - keeps scene.js the one place
  // that knows how to render a skin. `state` is an opaque object the caller
  // owns and passes back in every call (holds this preview's own tiny
  // particle array, entirely separate from the main game's ambient/burst
  // arrays above) - callers should start with `{ particles: [] }` and drive
  // this once per animation frame via their own requestAnimationFrame loop.
  function renderSkinPreviewFrame(ctx, skin, w, h, tMs, state) {
    const dark = Storage.get('theme') === 'dark';
    const faceColor = dark ? skin.colors.face.dark : skin.colors.face.light;
    const pathColor = dark ? skin.colors.path.dark : skin.colors.path.light;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = faceColor;
    ctx.fillRect(0, 0, w, h);
    drawMaterialPattern(ctx, skin.material, faceColor, 'skin-preview:' + skin.id, w, h, tMs);
    if (skin.mascotIcon) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      drawMascotIcon(ctx, skin.mascotIcon, w, h);
      ctx.restore();
    }

    const size = Math.min(w, h) * 0.22;
    const arrows = [
      { x: w * 0.28, y: h * 0.5, dir: 'right' },
      { x: w * 0.5, y: h * 0.28, dir: 'down' },
      { x: w * 0.72, y: h * 0.5, dir: 'left' }
    ];
    if (skin.lineStyle) {
      // Connects the same 3 preview points with the skin's real trail
      // renderer so the lineStyle (not just the arrowhead) is visible before
      // a player unlocks it - the 3 points make a gentle zigzag, giving the
      // wobble/twist-based styles (water/rope) enough length to read.
      drawStyledPath(ctx, [arrows.map(a => ({ x: a.x, y: a.y }))], size * 1.3, pathColor, skin.lineStyle, 'skin-preview:' + skin.id, tMs);
      arrows.forEach(a => drawStyledArrowHead(ctx, a.x, a.y, a.dir, size, pathColor, skin.lineStyle, tMs));
    } else {
      arrows.forEach(a => drawPerfectArrowHead(ctx, a.x, a.y, a.dir, size, pathColor, skin.arrowShape));
    }

    const recipe = PARTICLE_THEMES[skin.particleTheme];
    if (recipe && !prefersReducedMotion()) {
      while (state.particles.length < 10) {
        state.particles.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.3, vy: 0,
          size: 2 + Math.random() * 3, rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.02, alpha: 0.6 + Math.random() * 0.3
        });
      }
      state.particles.forEach(p => {
        stepParticle(p, recipe);
        if (p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
          p.x = Math.random() * w; p.y = Math.random() * h; p.vx = (Math.random() - 0.5) * 0.3; p.vy = 0;
        }
        drawParticleShape(ctx, p, recipe, pathColor);
      });
    }
  }

  return { init, setLevelData, updateFrame, setOnArrowTap, setOnGesture, highlightPath, shootExitArrow, refreshMoodForTheme, renderSkinPreviewFrame };
})();
