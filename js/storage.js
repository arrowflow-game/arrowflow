const Storage = (() => {
  const KEY = 'arrowflow3d_save';
  const defaults = { currentLevel: 1, highestUnlocked: 1, levelData: {}, totalStars: 0, hints: 3, theme: 'light', sound: true };

  function load() {
    try { const raw = localStorage.getItem(KEY); return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }; }
    catch { return { ...defaults }; }
  }
  function save(data) { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }

  let _state = load();

  return {
    get: (key) => _state[key],
    set: (key, val) => { _state[key] = val; save(_state); },
    completeLevel(levelNum, stars, moves) {
      const prev = _state.levelData[levelNum];
      const bestStars = prev ? Math.max(prev.stars, stars) : stars;
      const bestMoves = prev ? Math.min(prev.moves, moves) : moves;
      _state.levelData[levelNum] = { stars: bestStars, moves: bestMoves, completed: true };
      if (levelNum >= _state.highestUnlocked) {
        _state.highestUnlocked = levelNum + 1;
        _state.currentLevel = levelNum + 1;
      }
      _state.totalStars = Object.values(_state.levelData).reduce((s, d) => s + (d.stars || 0), 0);
      save(_state);
    },
    getLevelData: (n) => _state.levelData[n] || null,
    addHints: (n) => { _state.hints = Math.max(0, _state.hints + n); save(_state); }
  };
})();
