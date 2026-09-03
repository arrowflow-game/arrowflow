/* ============================================
   ArrowFlow 3D — remix.js
   Endless post-campaign "REMIX" mode.

   True infinite procedural generation isn't feasible client-side (the real
   generator in tools/generate_level.py is Python-only, no JS port exists -
   see [[arrowflow_level_roadmap]]). REMIX instead cycles through the 50
   ASCENSION-tier boards (levels 251-300, the hardest/final campaign tier,
   already known-solvable) and tightens the move budget a little more each
   full lap, so it reads as "endless, escalating, distinct from the
   campaign" without re-solving anything.
   ============================================ */

const Remix = (() => {
  const SOURCE_START = 251;
  const SOURCE_END = 300;
  const LAP_SIZE = SOURCE_END - SOURCE_START + 1;

  function getRemixLevel(remixIndex) {
    const sourceId = SOURCE_START + (remixIndex % LAP_SIZE);
    const lap = Math.floor(remixIndex / LAP_SIZE); // how many full cycles completed
    const base = getLevel(sourceId);
    if (!base) return null;

    base.tier = 'REMIX';
    base.remixIndex = remixIndex;
    base.remixLap = lap;
    // Real difficulty escalation (2026-09-03). The move-budget tightening this
    // replaced computed parMoves/maxMoves that nothing ever read: every path
    // clears in exactly one successful tap and a wrong tap costs a LIFE, not a
    // move, so state.moves always equals paths.length on any win (see the
    // star-rating redesign note in game.js) - no move budget can ever be
    // exceeded, and a tester who reached lap 2+ (level 100+) reported REMIX
    // felt exactly as easy as lap 0. Escalate the one thing that genuinely
    // can get harder with the same 50 boards: how many mistakes a run
    // survives, then remove the hint crutch once three full laps (150 levels)
    // is enough to have this rotating set memorized.
    base.remixLivesMax = lap === 0 ? 3 : lap === 1 ? 2 : 1;
    base.remixHintsDisabled = lap >= 3;
    return base;
  }

  return { getRemixLevel };
})();
