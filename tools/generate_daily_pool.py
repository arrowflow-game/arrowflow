#!/usr/bin/env python3
"""
Builds a pool of pre-generated "Daily Challenge" puzzles as js/daily-levels.js.

Daily Challenge (see checkpoint.md / [[arrowflow_level_roadmap]]) is a single
rotating special puzzle picked deterministically by calendar date, kept
entirely separate from the 300-level campaign. Since the real generator
(try_generate / is_solvable / fill_to_saturation in generate_level.py) is
Python-only and has no client-side JS port, the pool is generated offline
here and shipped as static data - getDailyLevel(dateStr) in
js/daily-levels.js just picks an index into this pool by date hash, no
runtime generation needed.

Reuses generate_campaign.py's generate_one_dense()/build_level() machinery
(the same "level 50 recipe" solve_rounds-maximizing search used for the real
300 levels) rather than reimplementing generation - just fed a synthetic
DAILY_TIER config instead of one of the 6 campaign tiers.

Usage:
    py tools/generate_daily_pool.py > js/daily-levels.js
"""
import json
import sys

from generate_campaign import generate_one_dense, build_level, DIFFICULTY_BASE

DIFFICULTY_BASE['DAILY'] = 'medium'

POOL_SIZE = 30

# Mid-pack difficulty/density (between MOMENTUM and CASCADE in the campaign's
# own tier table) - a daily puzzle should be a satisfying one-off challenge,
# not a 5-minute freebie or a 20-minute grind.
DAILY_TIER = dict(name='DAILY', start=9000, end=9000 + POOL_SIZE - 1,
                   n_cubes=(11, 15), unit_grid=6,
                   base_paths=(35, 50), base_len=(12, 18), filler_len=(6, 12),
                   cross_bias=0.7)


def main():
    levels = []
    for i in range(POOL_SIZE):
        level_id = DAILY_TIER['start'] + i
        paths, difficulty, shape, unit_grid = generate_one_dense(level_id, DAILY_TIER)
        if paths is None:
            print(f"// DAILY POOL slot {i} FAILED to generate", file=sys.stderr)
            continue
        level = build_level(level_id, DAILY_TIER, paths, difficulty, shape, unit_grid)
        levels.append(level)
        print(f"// generated daily pool slot {i + 1}/{POOL_SIZE} ({len(paths)} paths, {difficulty})",
              file=sys.stderr)

    print("// Pre-generated Daily Challenge puzzle pool - see tools/generate_daily_pool.py")
    print("// Do not hand-edit; regenerate via: py tools/generate_daily_pool.py > js/daily-levels.js")
    print("const DAILY_LEVELS = " + json.dumps(levels, separators=(',', ':')) + ";")
    print("""
function getDailyLevel(dateStr) {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  const src = DAILY_LEVELS[h % DAILY_LEVELS.length];
  return JSON.parse(JSON.stringify(src));
}""")
    print(f"// {len(levels)}/{POOL_SIZE} daily puzzles generated successfully", file=sys.stderr)


if __name__ == '__main__':
    main()
