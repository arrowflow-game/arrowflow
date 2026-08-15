/* ============================================
   ArrowFlow 3D — main.js
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Init UI
  UI.applyTheme(Storage.get('theme'));
  UI.applySound(Storage.get('sound'));
  UI.wireEvents();
  
  // Init 3D Scene
  Scene3D.init();
  Scene3D.setOnArrowTap(Game.onArrowTap);

  // Expose current level on Game object for UI
  Game.getCurrentLevel = () => {
    // hacky way if state is hidden, but let's just use Storage
    return Storage.get('currentLevel');
  };
  
  // Patch UI next/replay buttons if they relied on Game.levelNum
  const oldReplay = document.getElementById('btn-replay').onclick;
  document.getElementById('btn-replay').addEventListener('click', () => {
    document.getElementById('modal-win').classList.add('hidden');
    // Read from DOM instead of Game object
    const lvl = parseInt(document.getElementById('hud-lvl-num').textContent) || Storage.get('currentLevel');
    Game.loadLevel(lvl);
  });
  
  document.getElementById('btn-next').addEventListener('click', () => {
    document.getElementById('modal-win').classList.add('hidden');
    const lvl = parseInt(document.getElementById('hud-lvl-num').textContent) || Storage.get('currentLevel');
    Game.loadLevel(lvl + 1);
  });

  // Start
  UI.runSplash();
});
