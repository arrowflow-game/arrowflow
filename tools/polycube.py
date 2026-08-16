"""
General polycube face-graph builder.

Generalizes generate_level.py's old single-cube ADJ table (hand-derived from
three.js BoxGeometry UVs) to an ARBITRARY connected polycube shape - N unit
cubes glued face-to-face in any arrangement, matching what ex4.mp4/ex5.mp4's
reference game actually does (fused/stepped cube clusters), not just a single
stretched box.

How it works: every exposed unit-cube face is a unit square in continuous 3D
space. Two exposed faces are edge-adjacent (a path can visually cross between
them) iff they share exactly one geometric edge (2 matching corner points) -
this covers BOTH the old "two faces of the same cube" case AND the new "two
faces on different, offset cubes" step case, with the same one algorithm.

The per-direction row/col orientation convention (which corner is r=0/c=0)
was calibrated by brute-force search to exactly reproduce the old hand-tested
single-cube ADJ table (see tools/calibrate output, chat history) - this file
hard-codes that calibrated result rather than re-deriving it, then extends it
to multi-cube shapes with the same corner-matching method.
"""
import itertools

AXIS_SIGN = {0: ('x', 1), 1: ('x', -1), 2: ('y', 1), 3: ('y', -1), 4: ('z', 1), 5: ('z', -1)}
ROWCOL_AXIS = {'x': ('y', 'z'), 'y': ('z', 'x'), 'z': ('y', 'x')}  # (row_axis, col_axis)

# Calibrated per-direction (row0_at_min, col0_at_min) - reproduces the old
# single-cube ADJ table exactly (verified: all 24 face+edge entries match).
ROW0_MIN = {0: False, 1: False, 2: True, 3: False, 4: False, 5: False}
COL0_MIN = {0: False, 1: True, 2: True, 3: True, 4: True, 5: False}

DIRS = ['up', 'down', 'left', 'right']
OPP = {'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}
EDGE_TO_DIR = {'top': 'up', 'bottom': 'down', 'left': 'left', 'right': 'right'}
EDGES = ('top', 'bottom', 'left', 'right')


def _face_corners(pos, d):
    """4 corners of unit cube at integer pos=(px,py,pz), face direction d
    (0..5, materialIndex order), keyed by (redge,cedge) in {0,1}x{0,1}."""
    px, py, pz = pos
    axis, sign = AXIS_SIGN[d]
    row_axis, col_axis = ROWCOL_AXIS[axis]
    base = {'x': px, 'y': py, 'z': pz}
    plane_val = base[axis] + (1 if sign == 1 else 0)
    row0_min, col0_min = ROW0_MIN[d], COL0_MIN[d]
    corners = {}
    for redge in (0, 1):
        for cedge in (0, 1):
            rv = base[row_axis] + (redge if row0_min else 1 - redge)
            cv = base[col_axis] + (cedge if col0_min else 1 - cedge)
            pt = dict(base)
            pt[axis] = plane_val
            pt[row_axis] = rv
            pt[col_axis] = cv
            corners[(redge, cedge)] = (pt['x'], pt['y'], pt['z'])
    return corners


def _edges_of(corners):
    return {
        'top': (corners[(0, 0)], corners[(0, 1)]),
        'bottom': (corners[(1, 0)], corners[(1, 1)]),
        'left': (corners[(0, 0)], corners[(1, 0)]),
        'right': (corners[(0, 1)], corners[(1, 1)]),
    }


class PolycubeGraph:
    """Face-graph for one specific polycube shape (a frozenset of integer
    (x,y,z) unit-cube positions). Exposes the same `step`/`exit_ray_clear`-
    facing interface generate_level.py's old fixed ADJ table did, but keyed
    by (pos, direction) face ids instead of a bare int 0-5, and built fresh
    per shape instead of hard-coded.
    """

    def __init__(self, cube_positions):
        self.cubes = set(cube_positions)
        if not self.cubes:
            raise ValueError('empty polycube')
        self.faces = []  # list of (pos, d)
        self._face_edges = {}
        for pos in self.cubes:
            for d in range(6):
                axis, sign = AXIS_SIGN[d]
                delta = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[axis]
                npos = tuple(pos[i] + sign * delta[i] for i in range(3))
                if npos not in self.cubes:
                    face = (pos, d)
                    self.faces.append(face)
                    self._face_edges[face] = _edges_of(_face_corners(pos, d))

        # Build adjacency: for every exposed face's 4 edges, find the other
        # exposed face sharing that exact edge (as an unordered pair of
        # corner points) and record direct/reverse orientation.
        edge_owner = {}  # frozenset({corner1,corner2}) -> [(face, edge), ...]
        for face in self.faces:
            for edge in EDGES:
                a, b = self._face_edges[face][edge]
                key = frozenset((a, b))
                edge_owner.setdefault(key, []).append((face, edge))

        self.adj = {}  # face -> {edge: (neighbor_face, neighbor_edge, relation)}
        for face in self.faces:
            self.adj[face] = {}
        for key, owners in edge_owner.items():
            if len(owners) != 2:
                # Boundary edge with no partner (shouldn't happen for a closed
                # polycube surface) or a degenerate >2 match (shouldn't happen
                # on a manifold unit-cube lattice) - fail loudly, don't guess.
                if len(owners) == 1:
                    raise AssertionError(f'unmatched exposed edge (non-manifold polycube?): {owners}')
                raise AssertionError(f'edge shared by {len(owners)} faces (invalid polycube): {owners}')
            (faceA, edgeA), (faceB, edgeB) = owners
            a0, a1 = self._face_edges[faceA][edgeA]
            b0, b1 = self._face_edges[faceB][edgeB]
            relAB = 'direct' if (a0, a1) == (b0, b1) else 'reverse'
            self.adj[faceA][edgeA] = (faceB, edgeB, relAB)
            self.adj[faceB][edgeB] = (faceA, edgeA, relAB)

        assert all(len(self.adj[f]) == 4 for f in self.faces), \
            'every exposed face must have all 4 edges resolved'

    def rowcol(self, face):
        pos, d = face
        axis, _ = AXIS_SIGN[d]
        row_axis, col_axis = ROWCOL_AXIS[axis]
        # row/col cell counts are supplied externally (unit_grid); this class
        # only deals in geometry/topology, not the puzzle's cell resolution.
        return row_axis, col_axis
