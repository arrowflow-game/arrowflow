/* ============================================
   ArrowFlow 3D — polycube.js
   ============================================ */

// JS port of tools/polycube.py - kept as a direct, mechanical translation
// (same constants, same structure) specifically to minimize transcription
// risk, since this file's math can't be unit-tested the way the Python
// version was (self-checked against the old hand-derived single-cube ADJ
// table - see polycube.py's module docstring). Any change here should be
// mirrored back into polycube.py and vice versa.
const Polycube = (() => {
  const AXIS_SIGN = { 0: ['x', 1], 1: ['x', -1], 2: ['y', 1], 3: ['y', -1], 4: ['z', 1], 5: ['z', -1] };
  const ROWCOL_AXIS = { x: ['y', 'z'], y: ['z', 'x'], z: ['y', 'x'] }; // [row_axis, col_axis]
  const ROW0_MIN = { 0: false, 1: false, 2: true, 3: false, 4: false, 5: false };
  const COL0_MIN = { 0: false, 1: true, 2: true, 3: true, 4: true, 5: false };
  const EDGES = ['top', 'bottom', 'left', 'right'];
  const NEIGHBOR_DELTA = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function faceKey(pos, d) { return `${pos[0]},${pos[1]},${pos[2]}|${d}`; }
  function ptKey(pt) { return `${pt[0]},${pt[1]},${pt[2]}`; }

  // 4 corners of unit cube at integer pos=[px,py,pz], face direction d
  // (0..5, materialIndex order), keyed by 'redge,cedge' in {0,1}x{0,1}.
  function faceCorners(pos, d) {
    const [px, py, pz] = pos;
    const [axis, sign] = AXIS_SIGN[d];
    const [rowAxis, colAxis] = ROWCOL_AXIS[axis];
    const base = { x: px, y: py, z: pz };
    const planeVal = base[axis] + (sign === 1 ? 1 : 0);
    const row0Min = ROW0_MIN[d], col0Min = COL0_MIN[d];
    const corners = {};
    for (const redge of [0, 1]) {
      for (const cedge of [0, 1]) {
        const rv = base[rowAxis] + (row0Min ? redge : 1 - redge);
        const cv = base[colAxis] + (col0Min ? cedge : 1 - cedge);
        const pt = { x: base.x, y: base.y, z: base.z };
        pt[axis] = planeVal;
        pt[rowAxis] = rv;
        pt[colAxis] = cv;
        corners[`${redge},${cedge}`] = [pt.x, pt.y, pt.z];
      }
    }
    return corners;
  }

  function edgesOf(corners) {
    return {
      top: [corners['0,0'], corners['0,1']],
      bottom: [corners['1,0'], corners['1,1']],
      left: [corners['0,0'], corners['1,0']],
      right: [corners['0,1'], corners['1,1']],
    };
  }

  // Builds the face graph for one polycube shape (array of [x,y,z] integer
  // unit-cube positions). Mirrors tools/polycube.py's PolycubeGraph exactly.
  function buildGraph(cubePositions) {
    const cubeSet = new Set(cubePositions.map(ptKey));
    const faces = []; // { pos, d, key }
    const faceEdges = {}; // key -> edgesOf(corners)
    const faceByKey = {};

    for (const pos of cubePositions) {
      for (let d = 0; d < 6; d++) {
        const [axis, sign] = AXIS_SIGN[d];
        const delta = NEIGHBOR_DELTA[axis];
        const npos = [pos[0] + sign * delta[0], pos[1] + sign * delta[1], pos[2] + sign * delta[2]];
        if (!cubeSet.has(ptKey(npos))) {
          const key = faceKey(pos, d);
          const face = { pos, d, key };
          faces.push(face);
          faceByKey[key] = face;
          faceEdges[key] = edgesOf(faceCorners(pos, d));
        }
      }
    }

    // Match every exposed face's 4 edges to the other exposed face sharing
    // that exact edge (unordered pair of corner points) - same algorithm as
    // polycube.py, covering both same-cube and cross-cube ("step") adjacency.
    const edgeOwner = new Map(); // "ptA|ptB" (sorted) -> [{key,edge}, ...]
    for (const face of faces) {
      for (const edge of EDGES) {
        const [a, b] = faceEdges[face.key][edge];
        const [ka, kb] = [ptKey(a), ptKey(b)].sort();
        const ekey = `${ka}|${kb}`;
        if (!edgeOwner.has(ekey)) edgeOwner.set(ekey, []);
        edgeOwner.get(ekey).push({ key: face.key, edge });
      }
    }

    const adj = {}; // key -> { edge: [neighborKey, neighborEdge, relation] }
    for (const face of faces) adj[face.key] = {};
    for (const [, owners] of edgeOwner) {
      if (owners.length !== 2) {
        throw new Error(`invalid polycube: edge shared by ${owners.length} faces`);
      }
      const [ownerA, ownerB] = owners;
      const [a0, a1] = faceEdges[ownerA.key][ownerA.edge];
      const [b0, b1] = faceEdges[ownerB.key][ownerB.edge];
      const rel = (ptKey(a0) === ptKey(b0) && ptKey(a1) === ptKey(b1)) ? 'direct' : 'reverse';
      adj[ownerA.key][ownerA.edge] = [ownerB.key, ownerB.edge, rel];
      adj[ownerB.key][ownerB.edge] = [ownerA.key, ownerA.edge, rel];
    }

    return { faces, faceByKey, faceEdges, adj };
  }

  // True if faceKey's edge in `direction` is a genuine exterior boundary of
  // the WHOLE polycube - wraps to another exposed face of the SAME physical
  // unit cube - rather than an interior seam bordering a DIFFERENT cube
  // glued onto the shape. Mirrors tools/generate_level.py's is_open_edge()
  // exactly (see its comment for the full why) - the level generator already
  // guarantees every path's exitDir is open, but findBlocker() checks this
  // too as defense-in-depth rather than trusting level data unconditionally.
  const DIR_TO_EDGE = { up: 'top', down: 'bottom', left: 'left', right: 'right' };
  function isOpenEdge(faceKey, direction, graph) {
    const edge = DIR_TO_EDGE[direction];
    const [neighborKey] = graph.adj[faceKey][edge];
    return neighborKey.split('|')[0] === faceKey.split('|')[0];
  }

  return { AXIS_SIGN, ROWCOL_AXIS, faceKey, faceCorners, buildGraph, isOpenEdge };
})();
