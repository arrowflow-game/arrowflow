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
import os
import random
import sys
import time

from generate_level import try_generate, fill_to_saturation, is_solvable, solve_rounds, find_dependency_pairs, COLORS
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
# v9 (2026-08-16, same day): path LENGTH bumped +1 on both ends of every
# tier, path COUNTS left unchanged. User reported the board reads "short and
# empty" rather than densely packed like the reference clips - probed with
# generate_level.py directly (5+ random shapes per tier before committing,
# per [[arrowflow_polycube_system]]'s established practice) and found: at the
# OLD length range fill was only ~24-28% of a shape's exposed cells; +1/+1
# length raised that to ~27-37% with generation still fast (under ~5s
# worst-case per shape, most well under 1s). Pushing paths UP at the same
# time (tried +15-25 paths on top of the length bump) reliably stalled/failed
# within the existing 1500-seed budget even on LABYRINTH/ASCENSION-sized
# shapes - see chat history's probe output - so path counts were deliberately
# left alone this pass. The existing shape-retry + paths-reduction fallback
# in generate_one() absorbs any individual unlucky shape same as before.
# v10 (2026-08-17, same day as v9): user asked for MORE fill after v9, but
# probing (see chat history) showed pushing PATH COUNT higher at v9's length
# reliably broke solvability (findBlocker()/exit_ray_clear() only checks a
# clear straight ray on the head's own face - the denser the board, the more
# often that ray is blocked, and a full 100%-tile prototype was 0/6
# solvable). User's own call when told this: prefer fewer, LONGER, more
# winding paths over more separate paths - re-probed that direction
# specifically (5-8 shapes per tier's densest point, timed, per established
# practice) and it's a clear win on both axes at once: cutting path counts
# ~10-20% below v9 while pushing length up further raised actual cell fill
# from v9's ~24-37% to ~30-60% (higher on the smaller/early tiers), AND
# generated faster and more reliably (fewer distinct blocking entities to
# sequence). Don't reintroduce v9's higher path counts without re-probing -
# that combination is the one that broke.
# v11 (2026-08-17, same day as v10): user compared a v10 AWAKENING-tier
# screenshot (level 12, dense) against a CASCADE/ASCENSION-tier one (level
# 252, visibly sparser) and asked for the LATER tiers to match the earlier
# ones' density - v10 only tuned length up tier-by-tier conservatively and
# the bigger/later tiers ended up notably lower fill% than the small early
# ones. Re-probed CASCADE through ASCENSION specifically (5-6 shapes each,
# timed, with the new TIME_BUDGET_SEC safety net already in place so a bad
# combination degrades gracefully instead of risking another stall) and
# found a further length increase (paired with a modest path-count pullback,
# same lesson as v10) raised fill from v10's ~29-40% to ~30-51% on these
# tiers. AWAKENING/MOMENTUM unchanged - already matched the target density.
#
# v12 (2026-08-17, same day): replaced the whole plain-try_generate
# generate_one() with the "level 50 recipe" worked out by hand this session
# (see generate_one_dense() below) as the new PERMANENT default for every
# level 6-300, not a one-off patch. v11's single-shot try_generate(), even
# at long lengths, tops out around ~50-55% fill before solvability starts
# failing outright, and gives no way to prefer a genuinely harder board over
# an easier one that happens to hit the same path count. The recipe fixes
# both: (1) generate many BASE candidates (long, multi-face-winding paths,
# cross_bias=0.7 so paths visibly span faces instead of curling on one) and
# keep only the one(s) with the highest solve_rounds() - the number of
# sequential clear-this-to-free-that rounds needed, a real difficulty proxy,
# not just path count; (2) top the best base candidates up to saturation
# with MEDIUM (6-12 cell, not tiny 2-5) filler paths via fill_to_saturation(),
# re-picking whichever final board has the highest solve_rounds(). Per-tier
# base_paths/base_len/filler_len were re-probed from scratch per this
# project's established practice (never assume params transfer across tiers)
# using representative start/mid/end shapes of each tier, timed - see chat
# history's probe output. Result across ALL 6 tiers, not just AWAKENING:
# ~72-78% fill, solve_rounds in the 12-24 range, ~2.0-2.6 avg faces touched
# per path, and every probed shape (including tier maximums) completed in
# well under 15s even with the generous 200-seed/3-candidate/3-filler-retry
# search - so TIME_BUDGET_SEC was raised from 25s to 90s (this approach is
# inherently slower per level than v11's single-shot generation, but the
# probe timings leave large headroom even at 90s) rather than because any
# individual level needed that long. base_len=(12,18) and filler_len=(6,12)
# turned out to generalize across every tier unchanged (unusual - normally
# per-tier numbers don't transfer, per the project's lesson - but here
# fill_to_saturation's own re-check-after-every-addition loop absorbs most
# of the size difference; only base_paths needed real per-tier retuning).
TIERS = [
    dict(name='AWAKENING', start=1, end=50, n_cubes=(4, 10), unit_grid=6,
         base_paths=(15, 45), base_len=(12, 18), filler_len=(6, 12), cross_bias=0.7),
    dict(name='MOMENTUM', start=51, end=100, n_cubes=(12, 16), unit_grid=6,
         base_paths=(40, 58), base_len=(12, 18), filler_len=(6, 12), cross_bias=0.7),
    dict(name='CASCADE', start=101, end=150, n_cubes=(14, 17), unit_grid=7,
         base_paths=(70, 88), base_len=(12, 18), filler_len=(6, 12), cross_bias=0.7),
    dict(name='VORTEX', start=151, end=200, n_cubes=(17, 20), unit_grid=7,
         base_paths=(75, 90), base_len=(12, 18), filler_len=(6, 12), cross_bias=0.7),
    dict(name='LABYRINTH', start=201, end=250, n_cubes=(20, 23), unit_grid=8,
         base_paths=(70, 100), base_len=(12, 18), filler_len=(6, 12), cross_bias=0.7),
    dict(name='ASCENSION', start=251, end=300, n_cubes=(23, 26), unit_grid=8,
         base_paths=(100, 120), base_len=(12, 18), filler_len=(6, 12), cross_bias=0.7),
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
    # Jitter around the interpolated target keeps some per-level variety without
    # reintroducing that mismatch - widened from +/-1 to +/-2 (2026-08-31, see
    # arrowflow-level-mechanics plan's "shape variety" tuning) after a direct report
    # that non-milestone levels all felt too visually similar in size within a tier.
    # Still clamped to the tier's own (lo,hi) range below, so this can never push a
    # level's shape outside what was already probed/verified safe for that tier - it
    # just uses more of that already-safe range per level instead of staying
    # clustered tight around the middle.
    span = tier['end'] - tier['start']
    frac = (level_id - tier['start']) / span if span else 0.0
    lo, hi = tier['n_cubes']
    target = lerp_int(lo, hi, frac)
    n = max(lo, min(hi, target + rng.randint(-2, 2)))
    return random_polycube(n, rng)


# Difficulty label steps up over the back half of each tier so every tier
# feels like it ramps rather than jumping straight to its ceiling.
DIFFICULTY_BASE = {
    'AWAKENING': 'easy', 'MOMENTUM': 'easy', 'CASCADE': 'medium',
    'VORTEX': 'medium', 'LABYRINTH': 'hard', 'ASCENSION': 'hard',
}
DIFFICULTY_NEXT = {'easy': 'medium', 'medium': 'hard', 'hard': 'hard'}

# Every tier gets its own "30/40/50" equivalent: three deliberately-hardest
# milestone levels near the tier's own end, tagged 'extreme' - generalizes
# the AWAKENING-specific 30/40/50 milestone spec from this session (level 50
# itself was the hand-tuned recipe this whole generator is built from) to
# all 6 tiers using the SAME fractional position within each tier
# (30/50=0.6, 40/50=0.8, 50/50=1.0 of the tier's own span), so e.g. MOMENTUM
# (51-100) gets its milestones at 81/91/100, CASCADE (101-150) at 131/141/150,
# etc. These ids also get a bigger candidate/filler search (see
# generate_one_dense()) so they're genuinely the hardest nearby level by
# solve_rounds, not just labeled that way.
MILESTONE_FRACS = (0.6, 0.8, 1.0)


def milestone_ids(tier):
    span = tier['end'] - tier['start']
    return {tier['start'] + round(f * span) for f in MILESTONE_FRACS}


def tier_for(level_id):
    for t in TIERS:
        if t['start'] <= level_id <= t['end']:
            return t
    raise ValueError(level_id)


# Lock-Key mechanic (see arrowflow-level-mechanics plan, 2026-08-31) - how many
# locked/key pairs (out of whatever find_dependency_pairs() actually finds - never
# forced) to tag per level. Deliberately starts 5 levels AFTER Golden Path (56) and
# 10 after Combo (51), same staggered-rollout reasoning as those two: a first-time
# MOMENTUM player never gets two new coach-marks in the same level. This directly
# targets the level-62 "feels flat" complaint that started this whole feature set -
# 62 already has both Combo and Golden Path active by the time Lock-Key also kicks
# in at 61.
def lock_key_range_for(level_id, tier):
    if tier['name'] == 'AWAKENING':
        return (0, 0)
    if tier['name'] == 'MOMENTUM':
        # 1-2 raised to 2-4 on 2026-09-01 (user feedback that the mechanic
        # unlocked "too easily" at level 62 - too few pairs to feel like a real
        # constraint at the tier that first introduces it) - still bounded by
        # however many honest 1:1 dependencies find_dependency_pairs() actually
        # finds; never padded with fakes.
        return (0, 0) if level_id < 61 else (2, 4)
    if tier['name'] in ('CASCADE', 'VORTEX'):
        return (2, 3)
    return (3, 5)  # LABYRINTH, ASCENSION


def lerp_int(lo, hi, frac):
    return round(lo + (hi - lo) * frac)


# Hard wall-clock ceiling for a SINGLE level's whole generate_one_dense()
# call, covering shape attempts + base-candidate search + filler search
# combined. Raised from v11's 25s to 90s in v12: the base+filler search is
# inherently slower per level than v11's single-shot try_generate() (it
# generates MANY base candidates, scores each with solve_rounds(), then
# tops the best few up with fill_to_saturation()'s own re-check-per-addition
# loop) - but direct timing across every tier's start/mid/end shapes (see
# chat history's probe output) showed even ASCENSION's biggest shapes
# finish the whole search in well under 15s, so 90s leaves large headroom
# rather than reflecting any observed need. The original 3.5-hour-stall
# lesson that introduced this budget (see v10/v11 history below) still
# applies - never remove this net, even though the new recipe hasn't been
# observed to need it.
TIME_BUDGET_SEC = 90

# How many base-candidate seeds / top-scoring-candidates-to-fill / filler
# RNG retries per candidate a normal level gets, vs. a milestone ('extreme')
# level - milestones get a bigger search so they land as the genuinely
# hardest (by solve_rounds) level near their position, not just labeled
# that way. Sized from the probe timings: 200/3/3 finished AWAKENING through
# ASCENSION's tier-maximum shapes in 2-15s, so milestones' ~1.5x bigger
# search (300/4/4) still comfortably fits TIME_BUDGET_SEC.
SEARCH_BUDGET = dict(base_seeds=200, top_k=3, filler_tries=3)
MILESTONE_SEARCH_BUDGET = dict(base_seeds=300, top_k=4, filler_tries=4)


def generate_one_dense(level_id, tier, shape_attempts=4):
    """The 'level 50 recipe', generalized to every level 6-300: generate many
    long, multi-face-winding BASE candidates (cross_bias biases growth toward
    crossing faces so paths visibly span the shape instead of curling on
    one), score each by solve_rounds() (the number of sequential clear-this-
    to-free-that rounds needed - a real difficulty proxy, unlike raw path
    count), keep the best few, and top each up to saturation with MEDIUM
    (not tiny) filler paths via fill_to_saturation(), re-checking
    is_solvable() after every addition - then keep whichever fully-filled
    candidate has the highest solve_rounds() of all combinations tried.
    Levels 1-5 (onboarding) never reach this function - see main()."""
    start_time = time.time()
    def out_of_time():
        return time.time() - start_time > TIME_BUDGET_SEC

    span = tier['end'] - tier['start']
    frac = (level_id - tier['start']) / span if span else 0.0
    unit_grid = tier['unit_grid']
    min_len, max_len = tier['base_len']
    fmin, fmax = tier['filler_len']
    cross_bias = tier['cross_bias']
    base_paths_target = lerp_int(tier['base_paths'][0], tier['base_paths'][1], frac)

    difficulty = DIFFICULTY_BASE[tier['name']]
    if frac >= 0.6:
        difficulty = DIFFICULTY_NEXT[difficulty]
    is_milestone = level_id in milestone_ids(tier)
    if is_milestone:
        difficulty = 'extreme'
    budget = MILESTONE_SEARCH_BUDGET if is_milestone else SEARCH_BUDGET

    # Some random shapes are pathologically hard to pack (a real, observed
    # failure mode) even though most shapes at the same n_cubes succeed
    # easily - re-roll a handful of DIFFERENT shapes rather than grinding one
    # unlucky shape down immediately (mirrors v11's same lesson).
    shape_rng = random.Random(level_id * 31 + 7)
    last_shape, last_graph = None, None
    best_overall = None  # (solve_rounds, paths, shape, unit_grid)
    for shape_try in range(shape_attempts):
        if out_of_time():
            break
        shape, graph = pick_shape(level_id, tier, shape_rng, shape_try)
        last_shape, last_graph = shape, graph
        base_seed = level_id * 977 + shape_try * 100003
        total_cells = len(graph.faces) * unit_grid * unit_grid
        capped_base = max(4, min(base_paths_target, total_cells // min_len))

        candidates = []
        for s in range(budget['base_seeds']):
            if s % 20 == 0 and out_of_time():
                break
            res = try_generate(base_seed + s, graph, unit_grid, capped_base, min_len, max_len, cross_bias=cross_bias)
            if res:
                candidates.append((solve_rounds(res, unit_grid, graph), base_seed + s, res))
        if not candidates:
            continue  # this shape attempt found nothing to build on - try another shape

        candidates.sort(key=lambda x: -x[0])
        best_final = None
        for sr0, seed, res in candidates[:budget['top_k']]:
            if out_of_time():
                break
            occ = set()
            for cells, _ in res:
                occ.update(cells)
            for ft in range(budget['filler_tries']):
                if out_of_time():
                    break
                frng = random.Random(seed * 13 + ft)
                filled, _occ2 = fill_to_saturation(list(res), occ, frng, graph, unit_grid,
                                                     fmin, fmax, 400, cross_bias)
                sr = solve_rounds(filled, unit_grid, graph)
                if best_final is None or sr > best_final[0]:
                    best_final = (sr, filled)
        if best_final and (best_overall is None or best_final[0] > best_overall[0]):
            best_overall = (best_final[0], best_final[1], shape, unit_grid)
        # A non-milestone level is happy with the first shape that produced a
        # solvable, filled board - milestones keep trying more shapes (time
        # budget permitting) to chase a higher solve_rounds.
        if best_overall and not is_milestone:
            break

    if best_overall:
        _, paths, shape, ug = best_overall
        return paths, difficulty, shape, ug

    # No shape attempt produced a usable base candidate at all within budget
    # - fall back to v11's plain single-shot try_generate() with reduced
    # path counts on the last shape tried, same reduction ladder as before.
    # Hard floor guards against a pathological shape stalling forever;
    # dropping to a trivial single cube guarantees this always terminates.
    shape, graph = last_shape, last_graph
    base_seed = level_id * 977
    paths = None
    tried_paths = max(4, min(base_paths_target, len(graph.faces) * unit_grid * unit_grid // min_len))
    reductions = 0
    while paths is None and tried_paths >= 4 and reductions < 20 and not out_of_time():
        for offset in range(200):
            if offset % 20 == 0 and out_of_time():
                break
            result = try_generate(base_seed + offset, graph, unit_grid, tried_paths, min_len, max_len, cross_bias=cross_bias)
            if result:
                paths = result
                break
        if paths is None:
            tried_paths -= 1
            reductions += 1
    if paths is None:
        # Last resort: a single plain cube at a small, capped-length path
        # count - guarantees every level generates something fast rather
        # than the batch stalling on one adversarial shape/length combo (see
        # v10/v11 history above - a real, observed 3.5-hour stall this net
        # exists to prevent).
        shape = [(0, 0, 0)]
        graph = PolycubeGraph(shape)
        tried_paths = 6
        fallback_min_len = min(min_len, 6)
        fallback_max_len = min(max_len, fallback_min_len + 2)
        for offset in range(500):
            result = try_generate(level_id * 977 + offset, graph, unit_grid, tried_paths,
                                   fallback_min_len, fallback_max_len)
            if result:
                paths = result
                break
    if paths is None:
        return None, None, None, None

    return paths, difficulty, shape, unit_grid


def build_level(level_id, tier, paths, difficulty, shape, unit_grid, lock_key_pairs=None):
    """lock_key_pairs: optional list of (locked_index, key_index) positional pairs
    into `paths` (see find_dependency_pairs()) - each becomes a `locked`/`keyPathId`
    field on the locked path's output object, referencing the key path's real "pN"
    id string. None/empty = no lock-key pairs this level (AWAKENING and most of
    early MOMENTUM), matching every pre-existing level's shape exactly."""
    locked_by_index = dict(lock_key_pairs or [])

    segs_out = []
    for i, (cells, exit_dir) in enumerate(paths):
        segs = []
        for j, (face, r, c) in enumerate(cells):
            pos, d = face
            seg = {"cube": list(pos), "dir": d, "r": r, "c": c}
            if j == len(cells) - 1:
                seg["isHead"] = True
            segs.append(seg)
        path_out = {
            "id": f"p{i + 1}",
            "color": COLORS[i % len(COLORS)],
            "exitDir": exit_dir,
            "status": "idle",
            "progress": 0,
            "segments": segs,
        }
        if i in locked_by_index:
            path_out["locked"] = True
            path_out["keyPathId"] = f"p{locked_by_index[i] + 1}"
        segs_out.append(path_out)

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


def load_existing_levels_js(path=None):
    """Reads the current js/levels.js LEVELS array so onboarding levels 1-5
    can be carried through byte-for-byte instead of regenerated - levels 1-5
    are always a single plain cube (see ONBOARDING_SINGLE_CUBE_THROUGH) and a
    separate task this session is turning level 1 specifically into a guided
    tutorial, so onboarding must stay untouched by this regen, not just
    'equivalent'."""
    import re
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'levels.js')
    with open(path, encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'const LEVELS = (\[.*\]);', text, re.S)
    return json.loads(m.group(1))


def main():
    existing = {lvl['id']: lvl for lvl in load_existing_levels_js()}

    levels = []
    for level_id in range(1, 301):
        if level_id <= ONBOARDING_SINGLE_CUBE_THROUGH:
            if level_id not in existing:
                print(f"// LEVEL {level_id} MISSING from existing js/levels.js - onboarding levels "
                      f"must already exist, not regenerated", file=sys.stderr)
                continue
            levels.append(existing[level_id])
            print(f"// kept existing onboarding level {level_id}/300 untouched", file=sys.stderr)
            continue

        tier = tier_for(level_id)
        paths, difficulty, shape, unit_grid = generate_one_dense(level_id, tier)
        if paths is None:
            print(f"// LEVEL {level_id} FAILED to generate", file=sys.stderr)
            continue

        graph = PolycubeGraph(shape)

        # Lock-Key mechanic: find every clean 1:1 dependency this board already has
        # (an additive discovery over an already-solvable board, not a new
        # constraint - see find_dependency_pairs()'s own docstring), then randomly
        # sample down to this tier's target count so early levels within a tier
        # aren't padlocked all over. Never pads with a fake pair if fewer clean
        # dependencies exist than the target - see lock_key_range_for().
        lo, hi = lock_key_range_for(level_id, tier)
        chosen_pairs = []
        if hi > 0:
            all_pairs = find_dependency_pairs(paths, unit_grid, graph)
            lk_rng = random.Random(level_id * 104729 + 3)  # distinct salt from every other RNG this file uses
            target_n = lk_rng.randint(lo, hi)
            if len(all_pairs) > target_n:
                chosen_pairs = lk_rng.sample(all_pairs, target_n)
            else:
                chosen_pairs = all_pairs

        levels.append(build_level(level_id, tier, paths, difficulty, shape, unit_grid, chosen_pairs))
        target = lerp_int(tier['base_paths'][0], tier['base_paths'][1],
                           (level_id - tier['start']) / max(1, tier['end'] - tier['start']))
        sr = solve_rounds(paths, unit_grid, graph)
        total_cells = len(graph.faces) * unit_grid * unit_grid
        fill = 100.0 * sum(len(c) for c, _ in paths) / total_cells if total_cells else 0.0
        print(f"// generated level {level_id}/300 ({tier['name']}, {len(paths)} paths, base_target~{target}, "
              f"{difficulty}, solve_rounds={sr}, fill={fill:.1f}%, lock_key_pairs={len(chosen_pairs)})", file=sys.stderr)

    levels.sort(key=lambda l: l['id'])
    print("const LEVELS = " + json.dumps(levels, separators=(',', ':')) + ";")
    print(f"// {len(levels)}/300 levels generated successfully", file=sys.stderr)


if __name__ == '__main__':
    main()
