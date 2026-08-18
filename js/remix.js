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
    // Tighten the move budget each lap - never below the path count itself
    // (the theoretical minimum: one move per path).
    base.parMoves = Math.max(base.paths.length, base.parMoves - lap);
    base.maxMoves = Math.max(base.parMoves + 1, base.maxMoves - Math.floor(lap / 2));
    return base;
  }

  return { getRemixLevel };
})();
