/* ============================================
   ArrowFlow 3D — scene.js (Three.js Renderer)
   ============================================ */

const Scene3D = (() => {
  let scene, camera, renderer;
  let cube, cubeGroup;
  let faceCanvases = [];
  let faceContexts = [];
  let faceTextures = [];

  // 384 rather than 512: at grid=4 each cell is still 96px of texture (plenty crisp for
  // a 4x4 puzzle), but it cuts the per-face pixel count (and GPU texture-upload bandwidth,
  // paid every time a face redraws) by ~44%, across all 6 faces, every animated frame.
  const TEX_SIZE = 384;
  const CUBE_SIZE = 2;

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

  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let currentGridSize = 4;

  // Drag inertia: a flick keeps the cube spinning and easing to a stop instead of
  // stopping dead on release, matching the reference app's heavier, more physical feel.
  let velX = 0, velY = 0; // smoothed per-frame drag delta, degrees-equivalent (see applyDragRotation)
  const INERTIA_FRICTION = 0.94;
  const INERTIA_STOP_EPS = 0.01;

  let onArrowTapCallback = null;

  let currentPaths = [];
  let highlightPathId = null;
  let highlightUntil = 0;

  function init() {
    const canvas = document.getElementById('three-canvas');
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

    createCube();

    window.addEventListener('resize', onWindowResize);

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, {passive: false});
    canvas.addEventListener('touchmove', onPointerMove, {passive: false});
    canvas.addEventListener('touchend', onPointerUp);

    animate();
  }

  function createCube() {
    const geometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
    const frontMaterials = [];
    const backMaterials = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = TEX_SIZE; c.height = TEX_SIZE;
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
      frontMaterials.push(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.88, side: THREE.FrontSide,
        depthWrite: false, depthTest: false
      }));
      backMaterials.push(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.55, side: THREE.BackSide,
        depthWrite: false, depthTest: false
      }));
    }

    // Two meshes sharing one geometry instead of a single transparent box: a single
    // box with transparent materials draws its 6 face groups in a fixed index order,
    // not sorted by camera distance, so whichever face happened to draw last "won"
    // the blend - which face looked see-through vs. opaque depended on view angle
    // (see git history). Splitting into a BackSide mesh (the far walls, seen from
    // inside the box) and a FrontSide mesh (the near walls) and forcing draw order
    // with renderOrder - back always first, front always on top - makes the nearest
    // face always render crisp with the far faces faintly visible through it,
    // regardless of how the cube is rotated.
    const backMesh = new THREE.Mesh(geometry, backMaterials);
    backMesh.renderOrder = 0;
    cube = new THREE.Mesh(geometry, frontMaterials);
    cube.renderOrder = 1;

    cubeGroup = new THREE.Group();
    cubeGroup.add(backMesh);
    cubeGroup.add(cube);
    scene.add(cubeGroup);
  }

  function setLevelData(gridSize, paths) {
    currentGridSize = gridSize;
    highlightPathId = null;
    updateFrame(paths, true);
  }

  // Redrawing + re-uploading all 6 face textures every animation frame is expensive
  // (each is a 512x512 GPU upload). Callers that know exactly which faces changed
  // (game.js, mid-animation) pass that set explicitly; `true` forces every face
  // (level load / undo, where idle paths' appearance also needs refreshing).
  function updateFrame(paths, dirtyFaces) {
    currentPaths = paths;

    const facesToRedraw = dirtyFaces === true ? new Set([0, 1, 2, 3, 4, 5]) : new Set(dirtyFaces);

    if (highlightPathId !== null) {
      const hp = paths.find(p => p.id === highlightPathId);
      if (hp) hp.segments.forEach(s => facesToRedraw.add(s.face));
    }

    facesToRedraw.forEach(i => {
      const ctx = faceContexts[i];
      ctx.fillStyle = Storage.get('theme') === 'dark' ? '#1a1a2e' : '#ffffff';
      ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

      paths.forEach(p => {
        if (!p.cleared && p.segments.some(s => s.face === i)) {
          const highlighted = p.id === highlightPathId && performance.now() < highlightUntil;
          drawPathOnFace(ctx, p, i, currentGridSize, highlighted);
        }
      });
      faceTextures[i].needsUpdate = true;
    });
  }

  function highlightPath(id) {
    highlightPathId = id;
    highlightUntil = performance.now() + 1200;
  }

  function drawPathOnFace(ctx, path, faceIdx, gridSize, highlighted) {
    const cellSize = TEX_SIZE / gridSize;
    const offset = path.progress || 0;

    const L = path.segments.length - 1;
    const startD = offset;
    const endD = L + offset;

    if (highlighted) {
      const pulse = 0.4 + 0.4 * Math.sin(performance.now() / 130);
      ctx.strokeStyle = `rgba(255,209,63,${pulse})`;
      ctx.lineWidth = cellSize * 0.45;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      strokePath(ctx, path, faceIdx, gridSize, cellSize, startD, endD, L);
    }

    const color = getPathColor(path);
    ctx.strokeStyle = color;
    ctx.lineWidth = cellSize * 0.28;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const headPt = strokePath(ctx, path, faceIdx, gridSize, cellSize, startD, endD, L);

    if (headPt) {
      let dir = path.exitDir;
      if (endD < L) {
        let idx = Math.floor(endD);
        let sA = path.segments[idx];
        let sB = path.segments[idx+1];
        if (sA.face === sB.face) {
          if (sB.r < sA.r) dir = 'up';
          else if (sB.r > sA.r) dir = 'down';
          else if (sB.c < sA.c) dir = 'left';
          else if (sB.c > sA.c) dir = 'right';
        }
      }
      drawPerfectArrowHead(ctx, headPt.x, headPt.y, dir, cellSize * 0.5, color);
    }
  }

  function strokePath(ctx, path, faceIdx, gridSize, cellSize, startD, endD, L) {
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

      if (pt.face === faceIdx) {
        if (!hasMoved) {
          ctx.moveTo(pt.x, pt.y);
          hasMoved = true;
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      } else {
        hasMoved = false;
      }

      if (i === steps && realHeadPt.face === faceIdx) {
        headPt = realHeadPt;
      }
    }
    ctx.stroke();
    return headPt;
  }

  function getPointAtDist(path, d, cellSize, L) {
    if (d <= 0) {
      return { face: path.segments[0].face, x: path.segments[0].c * cellSize + cellSize/2, y: path.segments[0].r * cellSize + cellSize/2 };
    }
    if (d <= L) {
      let idx = Math.floor(d);
      let t = d - idx;
      if (idx === L) { idx = L - 1; t = 1; }
      let sA = path.segments[idx];
      let sB = path.segments[idx+1];

      if (sA.face === sB.face) {
        let x = (sA.c + t * (sB.c - sA.c)) * cellSize + cellSize/2;
        let y = (sA.r + t * (sB.r - sA.r)) * cellSize + cellSize/2;
        return { face: sA.face, x, y };
      } else {
        // Cross face logic: extend to edge
        if (t < 0.5) {
          let t2 = t * 2;
          let cx = sA.c * cellSize + cellSize/2;
          let cy = sA.r * cellSize + cellSize/2;
          let ex = cx, ey = cy;
          if (sA.r === 0) ey = 0;
          else if (sA.r === currentGridSize - 1) ey = TEX_SIZE;
          else if (sA.c === 0) ex = 0;
          else if (sA.c === currentGridSize - 1) ex = TEX_SIZE;
          return { face: sA.face, x: cx + t2 * (ex - cx), y: cy + t2 * (ey - cy) };
        } else {
          let t2 = (t - 0.5) * 2;
          let cx = sB.c * cellSize + cellSize/2;
          let cy = sB.r * cellSize + cellSize/2;
          let ex = cx, ey = cy;
          if (sB.r === 0) ey = 0;
          else if (sB.r === currentGridSize - 1) ey = TEX_SIZE;
          else if (sB.c === 0) ex = 0;
          else if (sB.c === currentGridSize - 1) ex = TEX_SIZE;
          return { face: sB.face, x: ex + t2 * (cx - ex), y: ey + t2 * (cy - ey) };
        }
      }
    } else {
      let head = path.segments[L];
      let ext = d - L;
      let r = head.r, c = head.c;
      if (path.exitDir === 'up') r -= ext;
      else if (path.exitDir === 'down') r += ext;
      else if (path.exitDir === 'left') c -= ext;
      else if (path.exitDir === 'right') c += ext;
      return { face: head.face, x: c * cellSize + cellSize/2, y: r * cellSize + cellSize/2 };
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
        updateFrame(currentPaths);
      }
    }
    if (!isDragging && (Math.abs(velX) > INERTIA_STOP_EPS || Math.abs(velY) > INERTIA_STOP_EPS)) {
      applyDragRotation(velX, velY);
      velX *= INERTIA_FRICTION;
      velY *= INERTIA_FRICTION;
    }
    renderer.render(scene, camera);
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function getEventPos(e) {
    if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function applyDragRotation(dx, dy) {
    const deltaRotationQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.PI/180 * (dy * 0.5), Math.PI/180 * (dx * 0.5), 0, 'XYZ')
    );
    cubeGroup.quaternion.multiplyQuaternions(deltaRotationQuaternion, cubeGroup.quaternion);
  }

  let dragDist = 0;
  function onPointerDown(e) {
    if (e.target.id !== 'three-canvas') return;
    isDragging = true;
    dragDist = 0;
    velX = 0; velY = 0; // grabbing the cube stops any in-flight inertia spin
    previousMousePosition = getEventPos(e);
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    const pos = getEventPos(e);
    const deltaMove = { x: pos.x - previousMousePosition.x, y: pos.y - previousMousePosition.y };
    dragDist += Math.abs(deltaMove.x) + Math.abs(deltaMove.y);

    applyDragRotation(deltaMove.x, deltaMove.y);
    // Smooth toward the latest delta (not a running average of the whole drag) so the
    // release velocity reflects how the drag ended, not an early fast flick that already slowed down.
    // Clamped so a single huge-delta frame (fast swipe, or a touch-event coordinate jump)
    // can't launch the cube into an absurdly fast spin.
    const VEL_CLAMP = 25;
    velX += (Math.max(-VEL_CLAMP, Math.min(VEL_CLAMP, deltaMove.x)) - velX) * 0.5;
    velY += (Math.max(-VEL_CLAMP, Math.min(VEL_CLAMP, deltaMove.y)) - velY) * 0.5;
    previousMousePosition = pos;
  }

  function onPointerUp(e) {
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
    const intersects = raycaster.intersectObject(cube);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      const faceIndex = Math.floor(intersect.faceIndex / 2);
      if (onArrowTapCallback) onArrowTapCallback(faceIndex, intersect.uv.x, intersect.uv.y);
    }
  }

  function setOnArrowTap(cb) { onArrowTapCallback = cb; }

  return { init, setLevelData, updateFrame, setOnArrowTap, highlightPath };
})();