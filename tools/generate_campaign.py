#!/usr/bin/env python3
"""
Builds the entire 300-level campaign as one js/levels.js LEVELS array.

Implements the difficulty-curve plan recorded in checkpoint.md (2026-08-15):
6 tiers of 50 levels each, grid size and path count/length scaling up per
tier. Every level is produced and validated through generate_level.py's own
try_generate() - the same solvability / cross-face-adjacency / self-adjacency
checks used for the hand-picked Levels 1-2 - never hand-placed (see
js/levels.js's header comment for why that matters on a cube).

Usage:
    py tools/generate_campaign.py > tools/campaign_output.js
Then paste the printed array as the new LEVELS array in js/levels.js.
"""
import json
import random
import sys

from generate_level import try_generate, COLORS
from polycube import PolycubeGraph

# v8 (2026-08-16, same day): both denser AND more visibly "fused" than v7.
# Two problems found after a real device playtest: (1) v7's level 300 still
# only reached 50 paths - the reference app (ex6/7/8.mp4) hits ~101 paths by
# level 14 alone, "ยาก" (hard) difficulty, routinely needs hints - so path
# counts are pushed up roughly 5-6x across every tier; (2) v7's pure random-
# walk shape picker (grow from any existing cube in a random direction) often
# produced shapes that were technically multi-cube but happened to line up
# straight, reading as "just an elongated box" rather than a visibly stepped
# cluster - see random_polycube() below for the fix (grow a "snake" from the
# frontier, biased against repeating the last move direction).
#
# Path-count growth is paired with cube-COUNT growth (not just bigger
# unit_grid) to keep per-path solvability fast: pushing fill% (occupied
# cells / total exposed cells) past ~40-45% made generation stall for many
# seconds to minutes in testing, so bigger shapes are used to keep fill%
# nearer 30-40% at every tier's max, verified with real multi-seed timing
# before committing (see chat history's probe results) - the campaign
# generator's existing 4000-seed budget + fewer-paths fallback (unchanged
# from v5-v7) absorbs any remaining hard spots the same way it always has.
# Path-count ceilings dialed back slightly from an initial pass (300 at
# level 300) after real multi-shape timing showed diminishing returns past
# ~200-220 paths - worst-case per-level generation time was climbing toward
# a minute even with the shape-retry safety net, which would make a full
# 300-level regen impractically slow. These numbers were re-verified with 5
# different random shapes per tier's max (not just one) and all completed
# comfortably under 6s worst-case.
TIERS = [
    dict(name='AWAKENING', start=1, end=50, n_cubes=(2, 10), unit_grid=6, paths=(30, 100), length=(4, 6)),
    dict(name='MOMENTUM', start=51, end=100, n_cubes=(10, 14), unit_grid=6, paths=(100, 130), length=(5, 7)),
    dict(name='CASCADE', start=101, end=150, n_cubes=(14, 17), unit_grid=7, paths=(130, 155), length=(5, 7)),
    dict(name='VORTEX', start=151, end=200, n_cubes=(17, 20), unit_grid=7, paths=(155, 175), length=(5, 8)),
    dict(name='LABYRINTH', start=201, end=250, n_cubes=(20, 23), unit_grid=8, paths=(175, 195), length=(6, 8)),
    dict(name='ASCENSION', start=251, end=300, n_cubes=(23, 26), unit_grid=8, paths=(195, 220), length=(6, 9)),
]

# The first 5 levels are always a single plain cube (onboarding - don't hit a
# brand-new player with an unfamiliar fused shape before they've learned the
# basic mechanic). From level 6 on, EVERY level gets its own randomly grown
# polycube shape (not just a chance of one) - matching the reference app,
# where the box shape visibly changes level to level, not occasionally.
ONBOARDING_SINGLE_CUBE_THROUGH = 5

NEIGHBOR_DELTAS = [(1,0,0), (-1,0,0), (0,1,0), (0,-1,0), (0,0,1), (0,0,-1)]

# How often a growth step is ALLOWED to repeat the previous move's direction
# (i.e. keep going straight) - low on purpose. A 2-cube shape is always a
# straight domino no matter what (geometrically unavoidable), but from 3
# cubes up this is what makes a shape actually read as "stepped/fused"
# instead of "a slightly lumpy box", which is what v7's pure random-existing-
# cube walk kept producing (see module docstring above).
STRAIGHT_BIAS = 0.15


def random_polycube(n, rng, max_attempts=50):
    """Grows a random connected n-cube polycube as a 'snake' from the
    frontier cube, deprioritizing (not forbidding) repeating the previous
    move's direction so multi-cube shapes actually bend/step rather than
    lining up straight. Retries with a fresh walk if the result is a self-
    touching (non-manifold) shape - PolycubeGraph raises AssertionError for
    those (verified: happens for roughly 1 in 30 random shapes, not a
    hypothetical edge case - see chat history's stress test), which is a
    real, expected rejection case, not a bug to silence."""
    for _ in range(max_attempts):
        cubes = {(0, 0, 0)}
        cur = (0, 0, 0)
        last_dir = None
        while len(cubes) < n:
            choices = NEIGHBOR_DELTAS[:]
            rng.shuffle(choices)
            if last_dir is not None and rng.random() > STRAIGHT_BIAS:
                choices = [d for d in choices if d != last_dir] + [last_dir]
            placed = False
            for d in choices:
                cand = tuple(cur[i] + d[i] for i in range(3))
                if cand not in cubes:
                    cubes.add(cand)
                    last_dir = d
                    cur = cand
                    placed = True
                    break
            if not placed:
                # Frontier cube is fully boxed in by its own shape - fall back
                # to extending from any existing cube in any free direction
                # rather than getting stuck (rare once a shape gets dense).
                base2 = rng.choice(list(cubes))
                d2 = rng.choice(NEIGHBOR_DELTAS)
                cand2 = tuple(base2[i] + d2[i] for i in range(3))
                cubes.add(cand2)
                cur = cand2
                last_dir = d2
        shape = list(cubes)
        try:
            return shape, PolycubeGraph(shape)
        except AssertionError:
            continue
    # Extremely unlikely fallback: couldn't grow a valid n-cube shape in
    # max_attempts tries - drop back to a single cube rather than fail the level.
    return [(0, 0, 0)], PolycubeGraph([(0, 0, 0)])


def pick_shape(level_id, tier, rng, shape_try=0):
    if level_id <= ONBOARDING_SINGLE_CUBE_THROUGH:
        return [(0, 0, 0)], PolycubeGraph([(0, 0, 0)])
    # n_cubes must track the SAME progress fraction path-count uses (frac),
    # not just be uniform-random across the tier's whole (lo,hi) range - a
    # uniform pick let an early-tier level randomly land on a tiny 2-cube
    # shape while still being asked for that tier's near-maximum path count
    # (a real, observed bug: level 29 got a 2-cube/10-face shape asked to
    # hold 70 paths - ~97% fill, practically unsolvable, which is what was
    # actually stalling generation, not "some shapes are just unlucky").
    # +/-1 jitter around the interpolated target keeps some per-level
    # variety without reintroducing that mismatch.
    span = tier['end'] - tier['start']
    frac = (level_id - tier['start']) / span if span else 0.0
    lo, hi = tier['n_cubes']
    target = lerp_int(lo, hi, frac)
    n = max(lo, min(hi, target + rng.randint(-1, 1)))
    return random_polycube(n, rng)


# Difficulty label steps up over the back half of each tier so every tier
# feels like it ramps rather than jumping straight to its ceiling.
DIFFICULTY_BASE = {
    'AWAKENING': 'easy', 'MOMENTUM': 'easy', 'CASCADE': 'medium',
    'VORTEX': 'medium', 'LABYRINTH': 'hard', 'ASCENSION': 'hard',
}
DIFFICULTY_NEXT = {'easy': 'medium', 'medium': 'hard', 'hard': 'hard'}


def tier_for(level_id):
    for t in TIERS:
        if t['start'] <= level_id <= t['end']:
            return t
    raise ValueError(level_id)


def lerp_int(lo, hi, frac):
    return round(lo + (hi - lo) * frac)


def generate_one(level_id, tier, seed_budget=1500, shape_attempts=4):
    span = tier['end'] - tier['start']
    frac = (level_id - tier['start']) / span if span else 0.0

    num_paths = lerp_int(tier['paths'][0], tier['paths'][1], frac)
    min_len, max_len = tier['length']
    unit_grid = tier['unit_grid']

    difficulty = DIFFICULTY_BASE[tier['name']]
    if frac >= 0.6:
        difficulty = DIFFICULTY_NEXT[difficulty]

    # Some random shapes are pathologically hard to pack at the target
    # density (a real, observed failure mode - one shape ground for 10+
    # minutes without finishing, not a hypothetical) even though most
    # shapes at the same n_cubes/paths succeed in well under a second. Rather
    # than grinding an unlucky shape down to a trivially low path count
    # immediately, re-roll a handful of DIFFERENT shapes first (each at a
    # smaller seed_budget, so one bad shape can't stall the whole batch) and
    # only fall back to reducing paths on the last-tried shape once every
    # shape attempt has come up empty.
    shape_rng = random.Random(level_id * 31 + 7)
    last_shape, last_graph = None, None
    for shape_try in range(shape_attempts):
        shape, graph = pick_shape(level_id, tier, shape_rng, shape_try)
        last_shape, last_graph = shape, graph
        base_seed = level_id * 977 + shape_try * 100003  # deterministic, spread out per shape attempt
        capped_paths = min(num_paths, len(graph.faces) * unit_grid * unit_grid)
        for offset in range(seed_budget):
            result = try_generate(base_seed + offset, graph, unit_grid, capped_paths, min_len, max_len)
            if result:
                return result, capped_paths, difficulty, shape, unit_grid

    # No shape attempt hit the full target path count - fall back to fewer
    # paths on the last shape tried. Hard floor of 4 reductions below the
    # smallest length actually usable (min_len) guards against a
    # pathological shape where even path-count reduction stays slow -
    # dropping to a trivial single cube guarantees this always terminates.
    shape, graph = last_shape, last_graph
    base_seed = level_id * 977
    paths = None
    tried_paths = min(num_paths, len(graph.faces) * unit_grid * unit_grid)
    reductions = 0
    while paths is None and tried_paths >= 4 and reductions < 20:
        for offset in range(seed_budget):
            result = try_generate(base_seed + offset, graph, unit_grid, tried_paths, min_len, max_len)
            if result:
                paths = result
                break
        if paths is None:
            tried_paths -= 1  # fall back to fewer paths rather than fail the level outright
            reductions += 1
    if paths is None:
        # Last resort: a single plain cube at a small, always-solvable path
        # count - guarantees every level generates something rather than
        # the batch stalling on one adversarial shape.
        shape = [(0, 0, 0)]
        graph = PolycubeGraph(shape)
        tried_paths = 6
        for offset in range(seed_budget):
            result = try_generate(level_id * 977, graph, unit_grid, tried_paths, min_len, max_len)
            if result:
                paths = result
                break
    if paths is None:
        return None, None, None, None, None

    return paths, tried_paths, difficulty, shape, unit_grid


def build_level(level_id, tier, paths, difficulty, shape, unit_grid):
    segs_out = []
    for i, (cells, exit_dir) in enumerate(paths):
        segs = []
        for j, (face, r, c) in enumerate(cells):
            pos, d = face
            seg = {"cube": list(pos), "dir": d, "r": r, "c": c}
            if j == len(cells) - 1:
                seg["isHead"] = True
            segs.append(seg)
        segs_out.append({
            "id": f"p{i + 1}",
            "color": COLORS[i % len(COLORS)],
            "exitDir": exit_dir,
            "status": "idle",
            "progress": 0,
            "segments": segs,
        })

    num_paths = len(paths)
    return {
        "id": level_id,
        "tier": tier['name'],
        "difficulty": difficulty,
        "shape": [list(p) for p in shape],
        "unitGrid": unit_grid,
        "parMoves": num_paths + 2,
        "maxMoves": num_paths + 5,
        "paths": segs_out,
    }


def main():
    levels = []
    for level_id in range(1, 301):
        tier = tier_for(level_id)
        paths, actual_paths, difficulty, shape, unit_grid = generate_one(level_id, tier)
        if paths is None:
            print(f"// LEVEL {level_id} FAILED to generate", file=sys.stderr)
            continue
        levels.append(build_level(level_id, tier, paths, difficulty, shape, unit_grid))
        if actual_paths != lerp_int(tier['paths'][0], tier['paths'][1],
                                     (level_id - tier['start']) / max(1, tier['end'] - tier['start'])):
            print(f"// level {level_id}: fell back to {actual_paths} paths", file=sys.stderr)
        print(f"// generated level {level_id}/300 ({tier['name']}, {actual_paths} paths, {difficulty}, "
              f"shape={shape})", file=sys.stderr)

    print("const LEVELS = " + json.dumps(levels, separators=(',', ':')) + ";")
    print(f"// {len(levels)}/300 levels generated successfully", file=sys.stderr)


if __name__ == '__main__':
    main()
