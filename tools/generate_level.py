#!/usr/bin/env python3
"""
Generates a non-overlapping, maze-style ArrowFlow level as JSON, on an
arbitrary connected polycube shape (N unit cubes glued face-to-face - not
just a single cube or a single stretched box).

Why this exists: paths are drawn across the exposed unit-cube faces of a
polycube's surface, one 2D canvas texture per exposed face. A path segment
that crosses from one face to another only looks continuous on the rendered
mesh if the cell it lands on is the mesh's *actual* geometric neighbor across
that shared edge. tools/polycube.py computes that adjacency for any shape by
matching each exposed face's corner 3D positions (generalizing the single-
cube case, which was originally hand-derived from three.js BoxGeometry UVs -
see polycube.py's module docstring and its self-check against that old table).

Usage:
    py tools/generate_level.py                          # single cube, 4x4 grid, 6 paths
    py tools/generate_level.py --shape 0,0,0 1,0,0 1,0,1 --unit-grid 4 --paths 10
"""
import argparse
import json
import random

from polycube import PolycubeGraph

DIRS = ['up', 'down', 'left', 'right']
OPP = {'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left'}
EDGE_TO_DIR = {'top': 'up', 'bottom': 'down', 'left': 'left', 'right': 'right'}
DIR_TO_EDGE = {'up': 'top', 'down': 'bottom', 'left': 'left', 'right': 'right'}

# 12 colors: the original 10 plus indigo/deep-red to fill the two remaining hue gaps
# (needed once tiers pack more than 10 simultaneous paths onto one cube - see
# generate_campaign.py's TIERS, raised after the reference app's ex1.mp4 showed
# visibly denser levels than this game's original curve even at low levels).
COLORS = ['#FF3366', '#1a7fe8', '#33CC66', '#FFB300', '#9933FF', '#00E5FF',
          '#FF7A00', '#E040FB', '#00BFA5', '#C0CA33', '#3D5AFE', '#D50000']


def step(face, r, c, direction, graph, unit_grid):
    """Returns (nface, nr, nc, crossed, continue_dir). Every exposed face is a
    uniform unit_grid x unit_grid square (unlike the old per-axis box case,
    a polycube's per-unit-cube faces are always square, one simplification
    this generalization buys back) - see step()'s original docstring
    (generate_level.py git history) for why `continue_dir` matters."""
    if direction == 'up':
        if r > 0: return (face, r - 1, c, False, direction)
        edge, idx = 'top', c
    elif direction == 'down':
        if r < unit_grid - 1: return (face, r + 1, c, False, direction)
        edge, idx = 'bottom', c
    elif direction == 'left':
        if c > 0: return (face, r, c - 1, False, direction)
        edge, idx = 'left', r
    elif direction == 'right':
        if c < unit_grid - 1: return (face, r, c + 1, False, direction)
        edge, idx = 'right', r
    else:
        raise ValueError(direction)

    nface, nedge, rel = graph.adj[face][edge]
    nidx = idx if rel == 'direct' else (unit_grid - 1 - idx)
    continue_dir = OPP[EDGE_TO_DIR[nedge]]
    if nedge == 'top': return (nface, 0, nidx, True, continue_dir)
    if nedge == 'bottom': return (nface, unit_grid - 1, nidx, True, continue_dir)
    if nedge == 'left': return (nface, nidx, 0, True, continue_dir)
    if nedge == 'right': return (nface, nidx, unit_grid - 1, True, continue_dir)


def is_open_edge(face, direction, graph):
    """True if face's edge in `direction` is a genuine exterior boundary of
    the WHOLE polycube - one that wraps to another exposed face of the SAME
    physical unit cube - rather than an interior seam bordering a DIFFERENT
    cube glued onto the shape. Every exposed face's every edge has SOME
    neighbor in `graph.adj` (a polycube surface has no literal gaps - see
    PolycubeGraph's own invariant check), so "reaching the edge" alone can't
    tell open air from a fold in the shape; only checking which cube owns
    the neighbor across that edge can. Reported directly by the user with a
    screenshot circling paths whose line ran off into an interior seam
    between two faces of the same shape, expecting it to look like it left
    the shape entirely - it must only be able to exit through an edge that's
    actually this cube's own exterior."""
    edge = DIR_TO_EDGE[direction]
    nface, _nedge, _rel = graph.adj[face][edge]
    return nface[0] == face[0]


def exit_ray_clear(face, r, c, direction, occupied, self_cells, unit_grid, graph):
    """Mirrors game.js's findBlocker() exactly: the slide-off animation never
    actually crosses to a neighbor face - it just walks the head's OWN face
    grid in `direction` until it runs past that face's own bounds (open edge
    -> free, interior seam -> permanently blocked) or hits another path's
    cell (blocked).

    Tried widening this to also check perpendicular neighbor cells (a line
    rendered close enough to look like it's touching the exit path should
    block it, per direct user feedback) - even scoped to just the first 2
    steps near the head, this broke solvability on 246/250 of the already-
    live levels, at their normal ~30-50% fill. Turns out lines running
    adjacent-but-not-colinear is completely ordinary, expected maze packing
    (that's what makes it read as a maze at all), not a special near-miss
    case - widening the ray at all is incompatible with how this puzzle
    works, not just a tuning problem. Reverted 2026-08-17; back to the
    original single-cell ray. See [[arrowflow_open_issues]] for the fuller
    writeup of what was tried and why it doesn't generalize."""
    r2, c2 = r, c
    while True:
        if direction == 'up': r2 -= 1
        elif direction == 'down': r2 += 1
        elif direction == 'left': c2 -= 1
        elif direction == 'right': c2 += 1
        if r2 < 0 or r2 >= unit_grid or c2 < 0 or c2 >= unit_grid:
            return is_open_edge(face, direction, graph)
        if (face, r2, c2) in occupied and (face, r2, c2) not in self_cells:
            return False


def gen_path(occupied, rng, graph, unit_grid, min_len, max_len, attempts=400, cross_bias=0.0):
    faces = graph.faces
    for _ in range(attempts):
        face = faces[rng.randrange(len(faces))]
        r, c = rng.randrange(unit_grid), rng.randrange(unit_grid)
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
            # A face is unitGrid x unitGrid cells - plenty of room for a whole
            # path to curl up without ever leaving it, which reads as "short
            # and easy" even at a long nominal length (reported directly: user
            # wants long paths to visibly SPAN multiple faces/sides, not just
            # be long while sitting on one face). With probability `cross_bias`,
            # reorder this step's candidate directions so ones that actually
            # cross to a neighbor face are tried first - still random which
            # face-crossing direction wins, just biased away from staying put.
            if cross_bias > 0 and rng.random() < cross_bias:
                fromf0, fromr0, fromc0 = cells[-1]
                def _crosses(d):
                    return step(fromf0, fromr0, fromc0, d, graph, unit_grid)[3]
                choices.sort(key=lambda d: not _crosses(d))
            moved = False
            for d in choices:
                if last_dir and d == OPP[last_dir]:
                    continue
                fromf, fromr, fromc = cells[-1]
                nf, nr, nc, crossed, continue_dir = step(fromf, fromr, fromc, d, graph, unit_grid)
                if (nf, nr, nc) in occupied or (nf, nr, nc) in cellset:
                    continue
                if crossed:
                    # The renderer infers which edge a segment sits on purely from
                    # whether its own r/c is at a face boundary (r checked before c),
                    # which is ambiguous for a corner cell (boundary in both). Avoid
                    # routing a crossing through one.
                    from_corner = fromr in (0, unit_grid - 1) and fromc in (0, unit_grid - 1)
                    to_corner = nr in (0, unit_grid - 1) and nc in (0, unit_grid - 1)
                    if from_corner or to_corner:
                        continue
                # Self-adjacency buffer: reject a move that lands next to (not just on)
                # another cell of THIS SAME path elsewhere along its route. Two strands
                # of one path running parallel a single cell apart aren't actually
                # blocked (the game excludes self-collision) but they read as a dead
                # end/self-block to a player looking at the idle shape - don't draw
                # that shape at all rather than relying on the mechanic being forgiving.
                # (Tried extending this to also buffer against OTHER paths, 2026-08-17 -
                # fixes the "looks connected to a different path" ambiguity but caps
                # density at ~41-46% fill, down from ~74-90%. Reverted per user's
                # explicit call: they'd rather keep the density and accept that dense
                # boards will have close-but-separate paths - see
                # [[arrowflow_open_issues]] for the fuller history.)
                touches_self = False
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nnr, nnc = nr + dr, nc + dc
                    if 0 <= nnr < unit_grid and 0 <= nnc < unit_grid:
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
        # The path's terminal direction must lead to a genuine exterior
        # opening, not an interior seam bordering a different cube of the
        # same shape (see is_open_edge()) - otherwise this path could never
        # actually be exited by the player no matter what clears around it.
        if not is_open_edge(cells[-1][0], last_continue_dir, graph):
            continue
        # A path whose own exit ray would run straight through an EARLIER part of
        # its own body must never be generated - unlike being blocked by another
        # path (temporary, clears once that other path moves), a path can't ever
        # unblock itself: its own cells only disappear when the whole path exits,
        # which is exactly what this check would be blocking. Reuses
        # exit_ray_clear() against the path's own cellset (self_cells=empty, so
        # nothing is excluded) purely to detect this - unrelated to the game's
        # actual self-collision-exempt runtime rule.
        head_face, head_r, head_c = cells[-1]
        if not exit_ray_clear(head_face, head_r, head_c, last_continue_dir, cellset, set(), unit_grid, graph):
            continue
        # A newly placed path is allowed to be blocked by paths already on the
        # board right now - that's a real, intended puzzle feature (the player
        # has to clear something else first). Overall solvability - that SOME
        # clearing order exists - is checked once for the whole assembled level
        # in is_solvable(), not per-path here.
        return cells, last_continue_dir
    return None


def is_solvable(paths, unit_grid, graph):
    """True if there's some order to tap paths in that clears the whole board -
    mirrors game.js exactly: a path can go once its exit ray (checked against
    only the paths still on the board, INCLUDING its own cells - self-collision
    counts too, changed 2026-08-17) is clear, and clearing it can unblock
    others. This is deliberately weaker than requiring every path clear
    simultaneously from the start - that would make blocking (the actual
    puzzle mechanic) impossible to ever generate. Self-collision never actually
    triggers here in practice since gen_path() already rejects any path whose
    own exit ray would hit its own body at generation time - this just keeps
    the check honest rather than silently assuming that guarantee holds."""
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
            if exit_ray_clear(*cells[-1], exit_dir, occupied, set(), unit_grid, graph):
                cleared[i] = True
                occupied -= set(cells)
                remaining -= 1
                progress = True
    return remaining == 0


def fill_to_saturation(paths, occupied, rng, graph, unit_grid, filler_min_len=2,
                        filler_max_len=5, max_consecutive_fail=60, cross_bias=0.0):
    """Tops up an already-solvable path set with short filler paths dropped into
    whatever cells are still empty, re-checking is_solvable() after each addition
    and discarding any filler that would break it. Cranking the main generator's
    own length/path-count knobs plateaus around ~50-55% fill on AWAKENING before
    solvability starts failing outright ~15-20% of the time (probed directly,
    2026-08-17) - short filler slots into leftover gaps far more reliably than
    asking gen_path's single random walk to blanket a whole shape from scratch,
    because each addition only has to fit whatever room is left, not compete
    with everything else being placed at once."""
    paths = list(paths)
    occupied = set(occupied)
    consecutive_fail = 0
    while consecutive_fail < max_consecutive_fail:
        result = gen_path(occupied, rng, graph, unit_grid, filler_min_len, filler_max_len,
                           attempts=200, cross_bias=cross_bias)
        if not result:
            consecutive_fail += 1
            continue
        cells, exit_dir = result
        candidate = paths + [(cells, exit_dir)]
        if is_solvable(candidate, unit_grid, graph):
            paths = candidate
            occupied |= set(cells)
            consecutive_fail = 0
        else:
            consecutive_fail += 1
    return paths, occupied


def try_generate(seed, graph, unit_grid, num_paths, min_len, max_len, cross_bias=0.0):
    rng = random.Random(seed)
    occupied = set()
    paths = []
    tries = 0
    while len(paths) < num_paths and tries < 600:
        tries += 1
        result = gen_path(occupied, rng, graph, unit_grid, min_len, max_len, attempts=800, cross_bias=cross_bias)
        if not result:
            continue
        cells, exit_dir = result
        occupied.update(cells)
        paths.append((cells, exit_dir))

    if len(paths) < num_paths:
        return None

    if not is_solvable(paths, unit_grid, graph):
        return None
    return paths


def _face_to_json(face):
    pos, d = face
    return {"cube": list(pos), "dir": d}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shape', nargs='+', default=['0,0,0'],
                     help='space-separated x,y,z unit-cube positions, e.g. 0,0,0 1,0,0 1,0,1')
    ap.add_argument('--unit-grid', type=int, default=4, help='cells per exposed face edge')
    ap.add_argument('--paths', type=int, default=6)
    ap.add_argument('--min-len', type=int, default=6)
    ap.add_argument('--max-len', type=int, default=None)
    ap.add_argument('--max-seed', type=int, default=500)
    args = ap.parse_args()
    max_len = args.max_len or (args.min_len + 4)
    cube_positions = [tuple(int(v) for v in s.split(',')) for s in args.shape]
    graph = PolycubeGraph(cube_positions)

    colors = COLORS

    paths = None
    seed = 0
    while paths is None and seed < args.max_seed:
        paths = try_generate(seed, graph, args.unit_grid, args.paths, args.min_len, max_len)
        seed += 1
    if paths is None:
        print(f"FAILED to generate a valid level within {args.max_seed} seeds")
        return
    print(f"// seed used: {seed - 1}, shape: {cube_positions}, unit_grid: {args.unit_grid}, faces: {len(graph.faces)}")

    out = []
    for i, (cells, exit_dir) in enumerate(paths):
        segs = []
        for j, (f, r, c) in enumerate(cells):
            seg = dict(_face_to_json(f), r=r, c=c)
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
    print(f"\n// total cells used: {sum(len(c) for c, _ in paths)} / {len(graph.faces) * args.unit_grid * args.unit_grid}")


if __name__ == '__main__':
    main()


def solve_rounds(paths, unit_grid, graph):
    """Like is_solvable() but returns the number of sequential clearing 'rounds'
    needed (None if unsolvable) - a proxy for how layered/blocked a level's
    dependency structure is, used to pick harder candidate boards among several
    generated attempts rather than just accepting the first solvable one."""
    n = len(paths)
    cleared = [False] * n
    occupied = set()
    for cells, _ in paths:
        occupied.update(cells)
    rounds = 0
    remaining = n
    progress = True
    while progress and remaining > 0:
        progress = False
        this_round = []
        for i, (cells, exit_dir) in enumerate(paths):
            if cleared[i]:
                continue
            if exit_ray_clear(*cells[-1], exit_dir, occupied, set(), unit_grid, graph):
                this_round.append(i)
        if this_round:
            rounds += 1
            for i in this_round:
                cleared[i] = True
                occupied -= set(paths[i][0])
                remaining -= 1
            progress = True
    return rounds if remaining == 0 else None


def find_dependency_pairs(paths, unit_grid, graph):
    """Lock-Key mechanic (see arrowflow-level-mechanics plan, 2026-08-31): finds
    which paths' becoming-clearable can be attributed to ONE specific other path's
    clearance - a clean 1:1 dependency, suitable for a visible padlock+key pairing
    in the UI. Returns a list of (locked_index, key_index) pairs into `paths`
    (positional indices, same order the caller already has).

    This does NOT invent any new blocking rule - it just re-runs the exact same
    round-based clearing simulation solve_rounds()/is_solvable() already use (via
    exit_ray_clear(), the single source of truth for "can this path's ray exit
    right now") and asks a more specific question of an already-known-solvable
    board: for a path that only becomes clearable partway through, was that
    because of exactly one other path, or a genuine multi-path tangle? Only the
    former gets tagged - a multi-path dependency has no single path to point a
    key icon at, so tagging it would show the player a misleading "clear this
    one" promise. A path that's clearable from round 1 (no dependency at all) is
    never tagged either - locking is meant to be a deliberate exception, not the
    norm.
    """
    n = len(paths)
    cleared = [False] * n
    round_of = [None] * n
    occupied = set()
    for cells, _ in paths:
        occupied.update(cells)

    rounds_order = []
    remaining = n
    progress = True
    r = 0
    while progress and remaining > 0:
        progress = False
        this_round = []
        for i, (cells, exit_dir) in enumerate(paths):
            if cleared[i]:
                continue
            if exit_ray_clear(*cells[-1], exit_dir, occupied, set(), unit_grid, graph):
                this_round.append(i)
        if this_round:
            r += 1
            for i in this_round:
                cleared[i] = True
                round_of[i] = r
                occupied -= set(paths[i][0])
                remaining -= 1
            rounds_order.append(this_round)
            progress = True

    if remaining > 0:
        return []  # unsolvable - shouldn't happen on a board that already passed
                   # is_solvable(), but this function must never assume that.

    # occupied_before[R] = every path's cells still on the board at the exact
    # moment round R is about to run (paths cleared in rounds < R already removed).
    occupied_before = {}
    occ = set()
    for cells, _ in paths:
        occ.update(cells)
    occupied_before[1] = set(occ)
    for idx, this_round in enumerate(rounds_order, start=1):
        for i in this_round:
            occ -= set(paths[i][0])
        occupied_before[idx + 1] = set(occ)

    pairs = []
    for i, (cells, exit_dir) in enumerate(paths):
        R = round_of[i]
        if R is None or R <= 1:
            continue  # open from the very start - nothing to attribute
        base_occupied = occupied_before[R]
        # Which strictly-earlier-clearing path(s), if put back on the board, would
        # re-block this path's exit ray? A clean single cause means exactly one.
        blockers = [
            j for j, (kcells, _) in enumerate(paths)
            if round_of[j] is not None and round_of[j] < R and j != i
            and not exit_ray_clear(*cells[-1], exit_dir, base_occupied | set(kcells), set(), unit_grid, graph)
        ]
        if len(blockers) == 1:
            pairs.append((i, blockers[0]))
    return pairs
