/* ============================================
   ArrowFlow 3D — scene.js (Three.js Renderer)
   ============================================ */

const Scene3D = (() => {
  let scene, camera, renderer;
  let shapeMesh, backMesh, shapeGroup;
  let faceCanvases = [];
  let faceContexts = [];
  let faceTextures = [];
  let frontMaterials = [];
  let backMaterials = [];

  // Per-cell texture resolution - every exposed face in the polycube system
  // (see [[arrowflow_level_roadmap]] v7) is a uniform unitGrid x unitGrid
  // square, so each face's canvas is simply unitGrid*PX_PER_CELL on a side.
  // 32 keeps the densest tier's unitGrid (6) well inside a crisp 384px face.
  const PX_PER_CELL = 32;
  const EDGES = ['top', 'bottom', 'left', 'right'];
  // World-space length of the whole polycube's LONGEST bounding-box axis -
  // kept constant across every level (same role the old fixed CUBE_SIZE=2
  // played) so the camera never needs to re-frame per level; only the
  // shape's proportions (from its actual cube positions) change.
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

  function getPathColor(path) {
    if (path.status === 'bumped' || path.status === 'bumped_return' || path.wasBlocked) return COLOR_BLOCKED;
    if (path.status === 'moving' || path.status === 'done') return COLOR_MOVING;
    return Storage.get('theme') === 'dark' ? COLOR_IDLE_DARK : COLOR_IDLE_LIGHT;
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
  // Matches COLOR_MOVING so the in-shape slide and the screen-space exit
  // flourish read as one continuous line/color, not two (was orange vs.
  // green - reported as visually confusing, single color requested).
  const EXIT_SHOT_COLOR = COLOR_MOVING;
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
    camera.position.set(3, 3, 4);
    camera.lookAt(0, 0, 0);
    cameraDistance = camera.position.length();

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
    return { center, scale };
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
  }

  function drawExitShots() {
    const now = performance.now();
    const fadeTail = 150;
    activeShots = activeShots.filter(s => now - s.start < EXIT_SHOT_DURATION_MS + fadeTail);
    fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    activeShots.forEach(shot => {
      const t = Math.min(1, (now - shot.start) / EXIT_SHOT_DURATION_MS);
      const grow = 1 - Math.pow(1 - t, 3); // ease-out
      const cx = shot.x0 + (shot.x1 - shot.x0) * grow;
      const cy = shot.y0 + (shot.y1 - shot.y0) * grow;
      const fadeStart = 0.7;
      const alpha = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / (1 - fadeStart)) : 1;

      fxCtx.globalAlpha = alpha;
      fxCtx.strokeStyle = EXIT_SHOT_COLOR;
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
      fxCtx.fillStyle = EXIT_SHOT_COLOR;
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

    const { center, scale } = shapeCenterAndScale(shape);
    currentCenter = center;
    currentScale = scale;
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

  function setLevelData(shape, unitGrid, paths) {
    rebuildGeometry(shape, unitGrid);
    highlightPathId = null;
    highlightedFaceIndices = [];
    updateFrame(paths, true);
  }

  function segFaceKey(s) { return Polycube.faceKey(s.cube, s.dir); }

  // Redrawing + re-uploading every dirty face's texture every animation frame is
  // expensive. Callers that know exactly which faces changed (game.js, mid-
  // animation) pass that set explicitly as a Set of face keys; `true` forces
  // every exposed face (level load / undo, where idle paths' appearance also
  // needs refreshing).
  function updateFrame(paths, dirtyFaces) {
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
      ctx.fillStyle = dark ? '#1a1a2e' : '#ffffff';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

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
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.35)' : 'rgba(20,30,50,0.28)';
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

  function highlightPath(id) {
    highlightPathId = id;
    highlightUntil = performance.now() + HINT_HIGHLIGHT_MS;
    const path = currentPaths.find(p => p.id === id);
    if (path && path.segments.length) {
      const head = path.segments.find(s => s.isHead) || path.segments[path.segments.length - 1];
      snapToFace(head.cube, head.dir);
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
      // in highlightPath()/clearHighlightBoost() below).
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
    ctx.strokeStyle = color;
    ctx.lineWidth = cellSize * 0.28;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const headPt = strokePath(ctx, path, faceKey, cellSize, startD, endD, L);

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
      drawPerfectArrowHead(ctx, headPt.x, headPt.y, dir, cellSize * 0.5, color);
    }
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

  function drawPerfectArrowHead(ctx, x, y, dir, size, color) {
    ctx.fillStyle = color;
    ctx.beginPath();

    const hw = size * 0.7;
    const hh = size * 0.6;

    ctx.translate(x, y);
    if (dir === 'up') { ctx.rotate(0); ctx.translate(0, -size*0.1); }
    else if (dir === 'right') { ctx.rotate(Math.PI / 2); ctx.translate(0, -size*0.1); }
    else if (dir === 'down') { ctx.rotate(Math.PI); ctx.translate(0, -size*0.1); }
    else if (dir === 'left') { ctx.rotate(-Math.PI / 2); ctx.translate(0, -size*0.1); }

    ctx.moveTo(0, -hh);
    ctx.lineTo(hw, hh);
    ctx.lineTo(-hw, hh);
    ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function animate() {
    requestAnimationFrame(animate);
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
    if (activeShots.length) drawExitShots();
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
  // (2026-08-15), then 0.2, then again here (2026-08-17) after a third
  // report that long sessions still felt dizzying.
  const DRAG_SENSITIVITY = 0.1;

  function applyDragRotation(dx, dy) {
    const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI/180 * (dy * DRAG_SENSITIVITY), Math.PI/180 * (dx * DRAG_SENSITIVITY), 0, 'XYZ')
    );
    shapeGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, shapeGroup.quaternion);
  }

  let dragDist = 0;
  function onPointerDown(e) {
    if (e.target.id !== 'three-canvas') return;
    if (e.touches && e.touches.length === 2) {
      isDragging = false; // a second finger landing mid-drag hands off to pinch, not rotate
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
    if (dragDist < 10 && e.target.id === 'three-canvas') {
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

  return { init, setLevelData, updateFrame, setOnArrowTap, setOnGesture, highlightPath, shootExitArrow };
})();
