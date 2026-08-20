/* ============================================
   ArrowFlow 3D — skins.js
   Cosmetic skin data - recolors cube face fill + idle path/arrow color only.
   Unlocked purely by campaign progress (Storage.get('highestUnlocked')), one
   skin every 25 levels. See [[arrowflow skin plan]]: face seam color and the
   moving/blocked status colors are deliberately NOT part of a skin - those
   stay fixed so gameplay-critical state reads the same regardless of skin.
   ============================================ */

const Skins = (() => {
  // id: 'default' reproduces today's exact colors (COLOR_IDLE_LIGHT/DARK and
  // the '#ffffff'/'#1a1a2e' face fill in scene.js) - a player who never opens
  // the Skins screen and whoever has Storage.selectedSkin unset/invalid must
  // see this and only this, so first-run/legacy visuals never change.
  const ALL = [
    { id: 'default',  unlockLevel: 1,   name: { th: 'ค่าเริ่มต้น',      en: 'Default' },
      colors: { face: { light: '#ffffff', dark: '#1a1a2e' }, path: { light: '#1a7fe8', dark: '#00f5ff' } } },
    { id: 'emerald',  unlockLevel: 25,  name: { th: 'มรกต',            en: 'Emerald' },
      colors: { face: { light: '#eafff3', dark: '#0d2418' }, path: { light: '#0e9f6e', dark: '#2be8a0' } } },
    { id: 'sunset',   unlockLevel: 50,  name: { th: 'อัสดง',           en: 'Sunset' },
      colors: { face: { light: '#fff2e6', dark: '#2a1608' }, path: { light: '#e8641a', dark: '#ff9d4d' } } },
    { id: 'violet',   unlockLevel: 75,  name: { th: 'ม่วงไวโอเล็ต',     en: 'Violet' },
      colors: { face: { light: '#f5edff', dark: '#1d1033' }, path: { light: '#8a3ff0', dark: '#b57bff' } } },
    { id: 'crimson',  unlockLevel: 100, name: { th: 'แดงเลือดหมู',      en: 'Crimson' },
      colors: { face: { light: '#ffecec', dark: '#2a0d0d' }, path: { light: '#d61f3c', dark: '#ff4d6a' } } },
    { id: 'gold',     unlockLevel: 125, name: { th: 'ทองคำ',           en: 'Gold' },
      colors: { face: { light: '#fff9e6', dark: '#2a2205' }, path: { light: '#c9971a', dark: '#ffd147' } } },
    { id: 'mint',     unlockLevel: 150, name: { th: 'มินต์',            en: 'Mint' },
      colors: { face: { light: '#e8fffb', dark: '#062622' }, path: { light: '#12b8a3', dark: '#4dffe6' } } },
    { id: 'rose',     unlockLevel: 175, name: { th: 'กุหลาบ',           en: 'Rose' },
      colors: { face: { light: '#fff0f6', dark: '#2a0a1a' }, path: { light: '#e0348e', dark: '#ff6fc0' } } },
    { id: 'cyber',    unlockLevel: 200, name: { th: 'ไซเบอร์',          en: 'Cyber' },
      colors: { face: { light: '#f0eaff', dark: '#0a0a1a' }, path: { light: '#c400ff', dark: '#ff00e6' } } },
    { id: 'obsidian', unlockLevel: 225, name: { th: 'ออบซิเดียน',       en: 'Obsidian' },
      colors: { face: { light: '#eceef2', dark: '#050507' }, path: { light: '#2b2f38', dark: '#e8ebf2' } } },
    { id: 'aurora',   unlockLevel: 250, name: { th: 'ออโรรา',           en: 'Aurora' },
      colors: { face: { light: '#e8fff5', dark: '#04211c' }, path: { light: '#0aa8a8', dark: '#5dffd9' } } },
    { id: 'celestial',unlockLevel: 275, name: { th: 'จักรวาล',          en: 'Celestial' },
      colors: { face: { light: '#fdf6e3', dark: '#0a0820' } , path: { light: '#a8842f', dark: '#ffd77a' } } },
    { id: 'legendary',unlockLevel: 300, name: { th: 'ตำนาน',            en: 'Legendary' },
      colors: { face: { light: '#fff8e1', dark: '#1a0a05' }, path: { light: '#d4232c', dark: '#ffb020' } } }
  ];

  function getById(id) {
    return ALL.find(s => s.id === id) || null;
  }

  return { ALL, getById };
})();
