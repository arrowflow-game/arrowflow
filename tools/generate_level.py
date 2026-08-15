#!/usr/bin/env python3
"""
Generates a non-overlapping, maze-style ArrowFlow level as JSON.

Why this exists: paths are drawn across 6 independent 2D canvas textures, one
per face of a Three.js BoxGeometry cube. A path segment that crosses from one
face to another only looks continuous on the rendered cube if the cell it
lands on is the cube's *actual* geometric neighbor across that edge - which
is not simply "same row" or "same column", because BoxGeometry's UV mapping
mirrors/rotates some face pairs relative to others. The ADJ table below was
derived directly from three.js r128's BoxGeometry buildPlane() UV formulas
(see js/scene.js materialIndex order: 0=+X,1=-X,2=+Y,3=-Y,4=+Z,5=-Z) and
independently verified by recomputing each face's corner 3D positions and
matching shared edges - see chat history for the derivation if this ever
needs to be redone for a non-cube geometry.

Usage:
    py tools/generate_level.py                      # 4x4 grid, 6 paths
    py tools/generate_level.py --grid 5 --paths 8

Paste the printed `paths: [...]` array into a new entry in js/levels.js's
LEVELS array (add id, tier, difficulty, parMoves, maxMoves alongside it).
"""
import argparse
import json
import random

# For each face + edge: (neighbor_face, neighbor_edge, relation).
# relation 'direct'  -> index i (0..GRID-1) maps to i on the neighbor edge
# relation 'reverse' -> index i maps to (GRID-1-i) on the neighbor edge
# The varying coordinate along top/bottom edges is c; along left/right is r.
ADJ = {
    0: {'top': (2, 'right', 'reverse'), 'bottom': (3, 'right', 'direct'),
        'left': (4, 'right', 'direct'), 'right': (5, 'left', 'direct')},
    1: {'top': (2, 'left', 'direct'), 'bottom': (3, 'left', 'reverse'),
        'left': (5, 'right', 'direct'), 'right': (4, 'left', 'direct')},
    2: {'top': (5, 'top', 'reverse'), 'bottom': (4, 'top', 'direct'),
        'left': (1, 'top', 'direct'), 'right': (0, 'top', 'reverse')},
    3: {'top': (4, 'bottom', 'direct'), 'bottom': (5, 'bottom', 'reverse'),
        'left': (1, 'bottom', 'reverse'), 'right': (0, 'bottom', 'direct')},
    4: {'top': (2, 'bottom', 'direct'), 'bottom': (3, 'top', 'direct'),
        'left': (1, 'right', 'direct'), 'right': (0, 'left', 'direct')},
    5: {'top': (2, 'top', 'reverse'), 'bottom': (3, 'bottom', 'reverse'),
        'left': (0, 'right', 'direct'), 'right': (1, 'left', 'direct')},
}

DIRS = ['up', 'down', 'left', 'right']
OPP = {'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}
EDGE_TO_DIR = {'top': 'up', 'bottom': 'down', 'left': 'left', 'right': 'right'}

# 12 colors: the original 10 plus indigo/deep-red to fill the two remaining hue gaps
# (needed once tiers pack more than 10 simultaneous paths onto one cube - see
# generate_campaign.py's TIERS, raised after the reference app's ex1.mp4 showed
# visibly denser levels than this game's original curve even at low levels).
COLORS = ['#FF3366', '#1a7fe8', '#33CC66', '#FFB300', '#9933FF', '#00E5FF',
          '#FF7A00', '#E040FB', '#00BFA5', '#C0CA33', '#3D5AFE', '#D50000']


def step(face, r, c, direction, grid):
    """Returns (nface, nr, nc, crossed, continue_dir).

    `crossed` is True if this step moved onto a different face. When it did,
    `continue_dir` is the direction label that keeps moving *straight ahead*
    on the new face - which is generally NOT the same label as `direction`,
    because crossing a cube edge can swap which local axis (r vs c) is
    'forward' and/or flip its sign. Concretely: entering a face through its
    top edge means 'straight ahead' from here is 'down' (away from the edge
    you just came through), not 'up' again.

    This matters for exitDir: a path's head arrow/slide-direction must be
    the *continue* direction, not the direction used to arrive. Using the
    arrival direction verbatim after a cross-face final step draws the
    arrowhead pointing back into the path's own tail - this was a real,
    shipped bug (see chat history) affecting any path whose last segment
    happened to cross a face.
    """
    if direction == 'up':
        if r > 0: return (face, r - 1, c, False, direction)
        edge, idx = 'top', c
    elif direction == 'down':
        if r < grid - 1: return (face, r + 1, c, False, direction)
        edge, idx = 'bottom', c
    elif direction == 'left':
        if c > 0: return (face, r, c - 1, False, direction)
        edge, idx = 'left', r
    elif direction == 'right':
        if c < grid - 1: return (face, r, c + 1, False, direction)
        edge, idx = 'right', r
    else:
        raise ValueError(direction)

    nface, nedge, rel = ADJ[face][edge]
    nidx = idx if rel == 'direct' else (grid - 1 - idx)
    continue_dir = OPP[EDGE_TO_DIR[nedge]]
    if nedge == 'top': return (nface, 0, nidx, True, continue_dir)
    if nedge == 'bottom': return (nface, grid - 1, nidx, True, continue_dir)
    if nedge == 'left': return (nface, nidx, 0, True, continue_dir)
    if nedge == 'right': return (nface, nidx, grid - 1, True, continue_dir)


def exit_ray_clear(face, r, c, direction, occupied, self_cells, grid):
    """Mirrors game.js's findBlocker() exactly: the slide-off animation never
    actually crosses to a neighbor face - it just walks the head's OWN face
    grid in `direction` until it runs past that face's own bounds (free) or
    hits another path's cell (blocked)."""
    r2, c2 = r, c
    while True:
        if direction == 'up': r2 -= 1
        elif direction == 'down': r2 += 1
        elif direction == 'left': c2 -= 1
        elif direction == 'right': c2 += 1
        if r2 < 0 or r2 >= grid or c2 < 0 or c2 >= grid:
            return True
        if (face, r2, c2) in occupied and (face, r2, c2) not in self_cells:
            return False


def gen_path(occupied, rng, grid, min_len, max_len, attempts=400):
    for _ in range(attempts):
        face, r, c = rng.randrange(6), rng.randrange(grid), rng.randrange(grid)
        if (face, r, c) in occupied:
            continue
        length = rng.randint(min_len, max_len)
        cells = [(face, r, c)]
        cellset = {(face, r, c)}
        last_dir = None
        last_continue_dir = None  # direction that continues straight past the *head*
        ok = True
        for _i in range(length - 1):
            choices = DIRS[:]
            rng.shuffle(choices)
            moved = False
            for d in choices:
                if last_dir and d == OPP[last_dir]:
                    continue
                fromf, fromr, fromc = cells[-1]
                nf, nr, nc, crossed, continue_dir = step(fromf, fromr, fromc, d, grid)
                if (nf, nr, nc) in occupied or (nf, nr, nc) in cellset:
                    continue
                if crossed:
                    # The renderer infers which edge a segment sits on purely from
                    # whether its own r/c is at a face boundary (r checked before c),
                    # which is ambiguous for a corner cell (boundary in both). Avoid
                    # routing a crossing through one.
                    from_corner = fromr in (0, grid - 1) and fromc in (0, grid - 1)
                    to_corner = nr in (0, grid - 1) and nc in (0, grid - 1)
                    if from_corner or to_corner:
                        continue
                # Self-adjacency buffer: reject a move that lands next to (not just on)
                # another cell of THIS SAME path elsewhere along its route. Two strands
                # of one path running parallel a single cell apart aren't actually
                # blocked (the game excludes self-collision) but they read as a dead
                # end/self-block to a player looking at the idle shape - don't draw
                # that shape at all rather than relying on the mechanic being forgiving.
                touches_self = False
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nnr, nnc = nr + dr, nc + dc
                    if 0 <= nnr < grid and 0 <= nnc < grid:
                        if (nf, nnr, nnc) in cellset and (nf, nnr, nnc) != (fromf, fromr, fromc):
                            touches_self = True
                            break
                if touches_self:
                    continue
                cells.append((nf, nr, nc))
                cellset.add((nf, nr, nc))
                last_dir = d
                last_continue_dir = continue_dir if crossed else d
                moved = True
                break
            if not moved:
                ok = False
                break
        if not ok or len(cells) < min_len:
            continue
        # A newly placed path is allowed to be blocked by paths already on the
        # board right now - that's a real, intended puzzle feature (the player
        # has to clear something else first). Overall solvability - that SOME
        # clearing order exists - is checked once for the whole assembled level
        # in is_solvable(), not per-path here.
        return cells, last_continue_dir
    return None


def is_solvable(paths, grid):
    """True if there's some order to tap paths in that clears the whole board -
    mirrors game.js exactly: a path can go once its exit ray (checked against
    only the paths still on the board) is clear, and clearing it can unblock
    others. This is deliberately weaker than requiring every path clear
    simultaneously from the start - that would make blocking (the actual
    puzzle mechanic) impossible to ever generate."""
    n = len(paths)
    cleared = [False] * n
    occupied = set()
    for cells, _ in paths:
        occupied.update(cells)

    progress = True
    remaining = n
    while progress and remaining > 0:
        progress = False
        for i, (cells, exit_dir) in enumerate(paths):
            if cleared[i]:
                continue
            if exit_ray_clear(*cells[-1], exit_dir, occupied, set(cells), grid):
                cleared[i] = True
                occupied -= set(cells)
                remaining -= 1
                progress = True
    return remaining == 0


def try_generate(seed, grid, num_paths, min_len, max_len):
    rng = random.Random(seed)
    occupied = set()
    paths = []
    tries = 0
    while len(paths) < num_paths and tries < 600:
        tries += 1
        result = gen_path(occupied, rng, grid, min_len, max_len, attempts=800)
        if not result:
            continue
        cells, exit_dir = result
        occupied.update(cells)
        paths.append((cells, exit_dir))

    if len(paths) < num_paths:
        return None

    if not is_solvable(paths, grid):
        return None
    return paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--grid', type=int, default=4)
    ap.add_argument('--paths', type=int, default=6)
    ap.add_argument('--min-len', type=int, default=6)
    ap.add_argument('--max-len', type=int, default=None)
    ap.add_argument('--max-seed', type=int, default=500)
    args = ap.parse_args()
    max_len = args.max_len or (args.min_len + 4)

    colors = COLORS

    paths = None
    seed = 0
    while paths is None and seed < args.max_seed:
        paths = try_generate(seed, args.grid, args.paths, args.min_len, max_len)
        seed += 1
    if paths is None:
        print(f"FAILED to generate a valid level within {args.max_seed} seeds")
        return
    print(f"// seed used: {seed - 1}, grid: {args.grid}")

    out = []
    for i, (cells, exit_dir) in enumerate(paths):
        segs = []
        for j, (f, r, c) in enumerate(cells):
            seg = {"face": f, "r": r, "c": c}
            if j == len(cells) - 1:
                seg["isHead"] = True
            segs.append(seg)
        out.append({
            "id": f"p{i + 1}",
            "color": colors[i % len(colors)],
            "exitDir": exit_dir,
            "status": "idle",
            "progress": 0,
            "segments": segs
        })

    print(json.dumps(out, indent=2))
    print(f"\n// total cells used: {sum(len(c) for c, _ in paths)} / {6 * args.grid * args.grid}")


if __name__ == '__main__':
    main()
