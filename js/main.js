/* ============================================
   ArrowFlow 3D — main.js
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Init UI
  UI.applyTheme(Storage.get('theme'));
  UI.applySound(Storage.get('sound'));
  UI.applyMusic(Storage.get('music'));
  UI.applyVibration(Storage.get('vibration'));
  UI.wireEvents();
  
  // Init 3D Scene
  Scene3D.init();
  Scene3D.setOnArrowTap(Game.onArrowTap);

  // First-run tutorial (level 1 only, gated on Storage's tutorialSeen flag) -
  // wires its listeners now so it's ready before the first Game.loadLevel() call below.
  Tutorial.init();

  // Expose current level on Game object for UI
  Game.getCurrentLevel = () => {
    // hacky way if state is hidden, but let's just use Storage
    return Storage.get('currentLevel');
  };
  
  // Start
  const debugLevel = parseInt(new URLSearchParams(location.search).get('level'));
  if (debugLevel >= 1) {
    UI.showScreen('screen-game');
    Game.loadLevel(debugLevel);
  } else {
    UI.runSplash();
    UI.promptNicknameIfNeeded();
  }
});
