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
import sys

from generate_level import try_generate, COLORS

TIERS = [
    dict(name='AWAKENING', start=1, end=50, grid=6, paths=(20, 24), length=(4, 6)),
    dict(name='MOMENTUM', start=51, end=100, grid=6, paths=(24, 27), length=(4, 6)),
    dict(name='CASCADE', start=101, end=150, grid=7, paths=(28, 31), length=(5, 7)),
    dict(name='VORTEX', start=151, end=200, grid=7, paths=(31, 34), length=(5, 7)),
    dict(name='LABYRINTH', start=201, end=250, grid=8, paths=(34, 38), length=(6, 8)),
    dict(name='ASCENSION', start=251, end=300, grid=8, paths=(38, 40), length=(6, 8)),
]

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


def generate_one(level_id, tier, seed_budget=4000):
    span = tier['end'] - tier['start']
    frac = (level_id - tier['start']) / span if span else 0.0

    num_paths = lerp_int(tier['paths'][0], tier['paths'][1], frac)
    min_len, max_len = tier['length']
    grid = tier['grid']

    difficulty = DIFFICULTY_BASE[tier['name']]
    if frac >= 0.6:
        difficulty = DIFFICULTY_NEXT[difficulty]

    base_seed = level_id * 977  # deterministic, spread out across the RNG space
    paths = None
    tried_paths = num_paths
    while paths is None and tried_paths >= 4:
        for offset in range(seed_budget):
            result = try_generate(base_seed + offset, grid, tried_paths, min_len, max_len)
            if result:
                paths = result
                break
        if paths is None:
            tried_paths -= 1  # fall back to fewer paths rather than fail the level outright
    if paths is None:
        return None, None, None

    return paths, tried_paths, difficulty


def build_level(level_id, tier, paths, difficulty):
    segs_out = []
    for i, (cells, exit_dir) in enumerate(paths):
        segs = []
        for j, (f, r, c) in enumerate(cells):
            seg = {"face": f, "r": r, "c": c}
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
        "grid": tier['grid'],
        "parMoves": num_paths + 2,
        "maxMoves": num_paths + 5,
        "paths": segs_out,
    }


def main():
    levels = []
    for level_id in range(1, 301):
        tier = tier_for(level_id)
        paths, actual_paths, difficulty = generate_one(level_id, tier)
        if paths is None:
            print(f"// LEVEL {level_id} FAILED to generate", file=sys.stderr)
            continue
        levels.append(build_level(level_id, tier, paths, difficulty))
        if actual_paths != lerp_int(tier['paths'][0], tier['paths'][1],
                                     (level_id - tier['start']) / max(1, tier['end'] - tier['start'])):
            print(f"// level {level_id}: fell back to {actual_paths} paths", file=sys.stderr)
        print(f"// generated level {level_id}/300 ({tier['name']}, {actual_paths} paths, {difficulty})",
              file=sys.stderr)

    print("const LEVELS = " + json.dumps(levels, separators=(',', ':')) + ";")
    print(f"// {len(levels)}/300 levels generated successfully", file=sys.stderr)


if __name__ == '__main__':
    main()
