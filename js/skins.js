/* ============================================
   ArrowFlow 3D — skins.js
   Cosmetic skin data - recolors cube face fill + idle path/arrow color only.
   Unlocked purely by campaign progress (Storage.get('highestUnlocked')), one
   skin every 25 levels. See [[arrowflow skin plan]]: face seam color and the
   moving/blocked status colors are deliberately NOT part of a skin - those
   stay fixed so gameplay-critical state reads the same regardless of skin.

   Phase 2 additions - material/arrowShape/particleTheme: bundled into the
   SAME 13 skins above (not a separate unlock track), consumed by scene.js's
   drawMaterialPattern()/drawPerfectArrowHead()/particle engine and ui.js's
   burstConfetti(). 'default' uses the neutral no-op value for all three
   ('flat'/'triangle'/'none') so a player who never opens the Skins screen
   sees zero change, same guarantee as the base colors above.
   ============================================ */

const Skins = (() => {
  const ALL = [
    { id: 'default',  unlock: { type: 'level', value: 1 },   name: { th: 'ค่าเริ่มต้น',      en: 'Default' },
      colors: { face: { light: '#ffffff', dark: '#1a1a2e' }, path: { light: '#1a7fe8', dark: '#00f5ff' } },
      material: 'flat', arrowShape: 'triangle', particleTheme: 'none' },
    { id: 'emerald',  unlock: { type: 'level', value: 25 },  altUnlock: { type: 'gems', value: 100 }, altUnlock2: { type: 'iap', productId: 'skin_emerald' }, name: { th: 'มรกต',            en: 'Emerald' },
      colors: { face: { light: '#eafff3', dark: '#0d2418' }, path: { light: '#0e9f6e', dark: '#2be8a0' } },
      material: 'marble', arrowShape: 'diamond', particleTheme: 'leaves', lineStyle: 'rope' },
    { id: 'sunset',   unlock: { type: 'level', value: 50 },  altUnlock: { type: 'gems', value: 200 }, altUnlock2: { type: 'iap', productId: 'skin_sunset' }, name: { th: 'อัสดง',           en: 'Sunset' },
      colors: { face: { light: '#fff2e6', dark: '#2a1608' }, path: { light: '#e8641a', dark: '#ff9d4d' } },
      material: 'glass', arrowShape: 'chevron', particleTheme: 'embers' },
    { id: 'violet',   unlock: { type: 'level', value: 75 },  altUnlock: { type: 'gems', value: 300 }, altUnlock2: { type: 'iap', productId: 'skin_violet' }, name: { th: 'ม่วงไวโอเล็ต',     en: 'Violet' },
      colors: { face: { light: '#f5edff', dark: '#1d1033' }, path: { light: '#8a3ff0', dark: '#b57bff' } },
      material: 'neon', arrowShape: 'star', particleTheme: 'sparks' },
    { id: 'crimson',  unlock: { type: 'level', value: 100 }, altUnlock: { type: 'gems', value: 400 }, altUnlock2: { type: 'iap', productId: 'skin_crimson' }, name: { th: 'แดงเลือดหมู',      en: 'Crimson' },
      colors: { face: { light: '#ffecec', dark: '#2a0d0d' }, path: { light: '#d61f3c', dark: '#ff4d6a' } },
      material: 'metal', arrowShape: 'chevron', particleTheme: 'embers' },
    { id: 'gold',     unlock: { type: 'level', value: 125 }, altUnlock: { type: 'gems', value: 500 }, altUnlock2: { type: 'iap', productId: 'skin_gold' }, name: { th: 'ทองคำ',           en: 'Gold' },
      colors: { face: { light: '#fff9e6', dark: '#2a2205' }, path: { light: '#c9971a', dark: '#ffd147' } },
      material: 'metal', arrowShape: 'diamond', particleTheme: 'sparks' },
    { id: 'mint',     unlock: { type: 'level', value: 150 }, altUnlock: { type: 'gems', value: 600 }, altUnlock2: { type: 'iap', productId: 'skin_mint' }, name: { th: 'มินต์',            en: 'Mint' },
      colors: { face: { light: '#e8fffb', dark: '#062622' }, path: { light: '#12b8a3', dark: '#4dffe6' } },
      material: 'glass', arrowShape: 'diamond', particleTheme: 'bubbles', lineStyle: 'water' },
    { id: 'rose',     unlock: { type: 'level', value: 175 }, altUnlock: { type: 'gems', value: 700 }, altUnlock2: { type: 'iap', productId: 'skin_rose' }, name: { th: 'กุหลาบ',           en: 'Rose' },
      colors: { face: { light: '#fff0f6', dark: '#2a0a1a' }, path: { light: '#e0348e', dark: '#ff6fc0' } },
      material: 'marble', arrowShape: 'star', particleTheme: 'bubbles', lineStyle: 'ribbon' },
    { id: 'cyber',    unlock: { type: 'level', value: 200 }, altUnlock: { type: 'gems', value: 800 }, altUnlock2: { type: 'iap', productId: 'skin_cyber' }, name: { th: 'ไซเบอร์',          en: 'Cyber' },
      colors: { face: { light: '#f0eaff', dark: '#0a0a1a' }, path: { light: '#c400ff', dark: '#ff00e6' } },
      material: 'neon', arrowShape: 'star', particleTheme: 'sparks', lineStyle: 'neon' },
    { id: 'obsidian', unlock: { type: 'level', value: 225 }, altUnlock: { type: 'gems', value: 900 }, altUnlock2: { type: 'iap', productId: 'skin_obsidian' }, name: { th: 'ออบซิเดียน',       en: 'Obsidian' },
      colors: { face: { light: '#eceef2', dark: '#050507' }, path: { light: '#2b2f38', dark: '#e8ebf2' } },
      material: 'metal', arrowShape: 'chevron', particleTheme: 'ash', lineStyle: 'chain' },
    { id: 'aurora',   unlock: { type: 'level', value: 250 }, altUnlock: { type: 'gems', value: 1000 }, altUnlock2: { type: 'iap', productId: 'skin_aurora' }, name: { th: 'ออโรรา',           en: 'Aurora' },
      colors: { face: { light: '#e8fff5', dark: '#04211c' }, path: { light: '#0aa8a8', dark: '#5dffd9' } },
      material: 'glass', arrowShape: 'diamond', particleTheme: 'bubbles' },
    { id: 'celestial',unlock: { type: 'level', value: 275 }, altUnlock: { type: 'gems', value: 1100 }, altUnlock2: { type: 'iap', productId: 'skin_celestial' }, name: { th: 'จักรวาล',          en: 'Celestial' },
      colors: { face: { light: '#fdf6e3', dark: '#0a0820' } , path: { light: '#a8842f', dark: '#ffd77a' } },
      material: 'neon', arrowShape: 'star', particleTheme: 'sparks' },
    { id: 'legendary',unlock: { type: 'level', value: 300 }, altUnlock: { type: 'gems', value: 1200 }, altUnlock2: { type: 'iap', productId: 'skin_legendary' }, name: { th: 'ตำนาน',            en: 'Legendary' },
      colors: { face: { light: '#fff8e1', dark: '#1a0a05' }, path: { light: '#d4232c', dark: '#ffb020' } },
      material: 'metal', arrowShape: 'diamond', particleTheme: 'embers' },

    // --- Premium tracks: streak / gems / iap (added alongside the level
    // track above, not replacing it). Every premium skin (not just the top
    // tier anymore) uses the animated 'holo' material - reported directly
    // against a screenshot that Diamond Emperor's shifting-rainbow look was
    // what actually read as "worth buying," so it's now the standard premium
    // treatment rather than a top-tier-only exclusive. 'stardust' particles
    // stay reserved for the top tier of each track, so there's still SOME
    // extra distinction at the highest price point, just via particles/
    // arrowShape variety rather than the material itself.
    // Face colors deepened well past the free-skin pastel range (reported
    // directly against screenshots as "not different enough to make you want
    // it") - a medium-saturation fill instead of near-white, with a darker,
    // more saturated path color to keep arrows legible against it.
    // altUnlock on every streak skin below (2026-08-20): a real-money bypass,
    // deliberately NOT gems - gems come from playing levels (free), so a
    // gems bypass here would let anyone skip the actual daily-return
    // incentive for free just by grinding levels normally instead. Money is
    // the only bypass that doesn't undercut streak's own purpose. See
    // js/iap.js's SKINS_IAP for the matching productId entries.
    { id: 'streakflame', unlock: { type: 'streak', value: 7 },  altUnlock: { type: 'iap', productId: 'skin_streakflame' }, name: { th: 'เปลวไฟสตรีค',     en: 'Streak Flame' },
      colors: { face: { light: '#ffcb8a', dark: '#2a1200' }, path: { light: '#a8330a', dark: '#ffb066' } },
      material: 'holo', arrowShape: 'chevron', particleTheme: 'embers', lineStyle: 'laser' },
    { id: 'streakstorm', unlock: { type: 'streak', value: 15 }, altUnlock: { type: 'iap', productId: 'skin_streakstorm' }, name: { th: 'พายุสตรีค',       en: 'Streak Storm' },
      colors: { face: { light: '#adc6ff', dark: '#0a1226' }, path: { light: '#0b3aa8', dark: '#8fb4ff' } },
      material: 'holo', arrowShape: 'triangle', particleTheme: 'ash', lineStyle: 'neon' },
    { id: 'streakcrown', unlock: { type: 'streak', value: 30 }, altUnlock: { type: 'iap', productId: 'skin_streakcrown' }, name: { th: 'มงกุฎสตรีค',      en: 'Streak Crown' },
      colors: { face: { light: '#ffdf80', dark: '#1a1400' }, path: { light: '#5c4200', dark: '#ffe066' } },
      material: 'holo', arrowShape: 'star', particleTheme: 'stardust', lineStyle: 'ribbon' },
    // Second option at the 7-day tier - same unlock cost, different look, so
    // players who already have streakflame still have something new to chase.
    { id: 'streakember', unlock: { type: 'streak', value: 7 },  altUnlock: { type: 'iap', productId: 'skin_streakember' }, name: { th: 'ถ่านสตรีค',       en: 'Streak Ember' },
      colors: { face: { light: '#8ae0d6', dark: '#031f1c' }, path: { light: '#004d43', dark: '#5dffe8' } },
      material: 'holo', arrowShape: 'star', particleTheme: 'embers', lineStyle: 'laser' },
    // Second holo/stardust prestige option at the 30-day tier.
    { id: 'streakaurora', unlock: { type: 'streak', value: 30 }, altUnlock: { type: 'iap', productId: 'skin_streakaurora' }, name: { th: 'ออโรร่าสตรีค',    en: 'Streak Aurora' },
      colors: { face: { light: '#ff9ecf', dark: '#1f0012' }, path: { light: '#7a0040', dark: '#ff8ad1' } },
      material: 'holo', arrowShape: 'diamond', particleTheme: 'stardust', lineStyle: 'neon' },
    // Third option at the 15-day tier - candy-cane lineStyle (see scene.js's
    // drawCandySegment/drawCandyTip), one of the 3 lineStyle themes added in
    // this same session alongside gemorigami/royalecircuit below.
    { id: 'streakcandy', unlock: { type: 'streak', value: 15 }, altUnlock: { type: 'iap', productId: 'skin_streakcandy' }, name: { th: 'ลูกอมสตรีค',       en: 'Streak Candy' },
      colors: { face: { light: '#fff0f0', dark: '#2a0a10' }, path: { light: '#e63950', dark: '#ff7a90' } },
      material: 'glass', arrowShape: 'diamond', particleTheme: 'bubbles', lineStyle: 'candy' },
    // 4th tier - a new top-of-track above 30 days. Real artwork
    // (`icons/mascots/*.png`, cleaned up from Gemini-generated JPGs via
    // scripts/mascot-bg-remove.js). material:'flat' (not 'holo') and colors
    // matched to each animal's real coloring on purpose - the 15 skins above
    // already cover the "rainbow/holo" look extensively, so these 6 lean
    // into the mascot art itself as the visual hook instead of repeating it.
    { id: 'streakbunny', unlock: { type: 'streak', value: 45 }, altUnlock: { type: 'iap', productId: 'skin_streakbunny' }, mascotIcon: 'bunny', name: { th: 'กระต่ายสตรีค',    en: 'Streak Bunny' },
      colors: { face: { light: '#fdeef2', dark: '#2a141a' }, path: { light: '#8a3d55', dark: '#ffb3c9' } },
      material: 'badge', arrowShape: 'diamond', particleTheme: 'bubbles', lineStyle: 'pawprint' },
    { id: 'streakpanda', unlock: { type: 'streak', value: 45 }, altUnlock: { type: 'iap', productId: 'skin_streakpanda' }, mascotIcon: 'panda', name: { th: 'แพนด้าสตรีค',     en: 'Streak Panda' },
      colors: { face: { light: '#f0f0f0', dark: '#0d0d0d' }, path: { light: '#1a1a1a', dark: '#f0f0f0' } },
      material: 'badge', arrowShape: 'chevron', particleTheme: 'ash', lineStyle: 'pawprint' },

    { id: 'gemshard', unlock: { type: 'gems', value: 300 },  name: { th: 'เศษผลึก',          en: 'Gem Shard' },
      colors: { face: { light: '#8fdcff', dark: '#031824' }, path: { light: '#03415c', dark: '#7fe0ff' } },
      material: 'holo', arrowShape: 'triangle', particleTheme: 'sparks', lineStyle: 'laser' },
    { id: 'gemamber', unlock: { type: 'gems', value: 600 },  name: { th: 'อำพัน',            en: 'Gem Amber' },
      colors: { face: { light: '#ffc880', dark: '#241304' }, path: { light: '#703300', dark: '#ffb066' } },
      material: 'holo', arrowShape: 'chevron', particleTheme: 'leaves', lineStyle: 'laser' },
    { id: 'gemdragon', unlock: { type: 'gems', value: 1000 }, name: { th: 'มังกรอัญมณี',      en: 'Gem Dragon' },
      colors: { face: { light: '#a3ef80', dark: '#0d1a02' }, path: { light: '#1f5c00', dark: '#a6ff66' } },
      material: 'holo', arrowShape: 'diamond', particleTheme: 'sparks', lineStyle: 'chain' },
    // Third option at the 600-gems tier - origami-fold lineStyle (see
    // scene.js's drawOrigamiSegment/drawOrigamiTip).
    { id: 'gemorigami', unlock: { type: 'gems', value: 600 }, name: { th: 'กระดาษพับอัญมณี',    en: 'Gem Origami' },
      colors: { face: { light: '#fdf6ec', dark: '#1f1a12' }, path: { light: '#3a4a8a', dark: '#8aa0ff' } },
      material: 'marble', arrowShape: 'chevron', particleTheme: 'leaves', lineStyle: 'origami' },
    // Second option at the 300-gems tier.
    { id: 'gemopal', unlock: { type: 'gems', value: 300 },  name: { th: 'โอปอล',            en: 'Gem Opal' },
      colors: { face: { light: '#c9a3ff', dark: '#12031f' }, path: { light: '#3d1a75', dark: '#c9a3ff' } },
      material: 'holo', arrowShape: 'triangle', particleTheme: 'bubbles', lineStyle: 'water' },
    // Second holo/stardust prestige option at the 1000-gems tier.
    { id: 'gemphoenix', unlock: { type: 'gems', value: 1000 }, name: { th: 'ฟีนิกซ์อัญมณี',    en: 'Gem Phoenix' },
      colors: { face: { light: '#ff8a70', dark: '#1f0500' }, path: { light: '#7a1600', dark: '#ff9e80' } },
      material: 'holo', arrowShape: 'star', particleTheme: 'sparks', lineStyle: 'laser' },
    // 4th tier - new top-of-track above 1000 gems.
    { id: 'gemcat', unlock: { type: 'gems', value: 1500 }, mascotIcon: 'cat', name: { th: 'แมวอัญมณี',        en: 'Gem Cat' },
      colors: { face: { light: '#ffddb0', dark: '#241505' }, path: { light: '#8a4a12', dark: '#ffddb0' } },
      material: 'badge', arrowShape: 'triangle', particleTheme: 'sparks', lineStyle: 'pawprint' },
    { id: 'gemdolphin', unlock: { type: 'gems', value: 1500 }, mascotIcon: 'dolphin', name: { th: 'โลมาอัญมณี',   en: 'Gem Dolphin' },
      colors: { face: { light: '#c2d6e6', dark: '#0a1a24' }, path: { light: '#2a4a5c', dark: '#c2d6e6' } },
      material: 'badge', arrowShape: 'chevron', particleTheme: 'bubbles', lineStyle: 'water' },

    { id: 'royaleneon',    unlock: { type: 'iap', productId: 'skin_royaleneon' },    name: { th: 'นีออนซิตี้',      en: 'Neon City' },
      colors: { face: { light: '#dc99ff', dark: '#12031f' }, path: { light: '#5c0080', dark: '#ff7fff' } },
      material: 'holo', arrowShape: 'diamond', particleTheme: 'ash', lineStyle: 'laser' },
    { id: 'royaleinferno', unlock: { type: 'iap', productId: 'skin_royaleinferno' }, name: { th: 'เปลวเพลิงปีศาจ',  en: 'Inferno Fiend' },
      colors: { face: { light: '#ff9980', dark: '#240603' }, path: { light: '#7a1400', dark: '#ff9166' } },
      material: 'holo', arrowShape: 'star', particleTheme: 'embers', lineStyle: 'laser' },
    { id: 'royaleemperor', unlock: { type: 'iap', productId: 'skin_royaleemperor' }, name: { th: 'จักรพรรดิเพชร',   en: 'Diamond Emperor' },
      colors: { face: { light: '#ffe680', dark: '#1a1400' }, path: { light: '#5c4200', dark: '#ffd77a' } },
      material: 'holo', arrowShape: 'chevron', particleTheme: 'stardust', lineStyle: 'ribbon' },
    // Second option at the ฿19 tier.
    { id: 'royalevenom', unlock: { type: 'iap', productId: 'skin_royalevenom' }, name: { th: 'พิษมรกต',          en: 'Venom Strike' },
      colors: { face: { light: '#c8f28a', dark: '#0d1a02' }, path: { light: '#2f4d00', dark: '#c8f28a' } },
      material: 'holo', arrowShape: 'star', particleTheme: 'ash', lineStyle: 'water' },
    // Third option at the ฿19 tier - circuit-board lineStyle (see scene.js's
    // drawCircuitSegment/drawSolderTip). Not yet a real Play Console
    // product (productId 'skin_royalecircuit') - same not-yet-created state
    // as the other 7 iap skin IDs, see [[arrowflow_iap_remove_ads]].
    { id: 'royalecircuit', unlock: { type: 'iap', productId: 'skin_royalecircuit' }, name: { th: 'วงจรไฟฟ้า',        en: 'Circuit Royale' },
      colors: { face: { light: '#e0f2e9', dark: '#031a0f' }, path: { light: '#8a4a12', dark: '#ffb066' } },
      material: 'neon', arrowShape: 'triangle', particleTheme: 'sparks', lineStyle: 'circuit' },
    // Second holo/stardust prestige option at the ฿59 tier.
    { id: 'royalecelestial', unlock: { type: 'iap', productId: 'skin_royalecelestial' }, name: { th: 'จักรวรรดิสวรรค์', en: 'Celestial Sovereign' },
      colors: { face: { light: '#a3b3ff', dark: '#05081a' }, path: { light: '#1a2266', dark: '#a3b3ff' } },
      material: 'holo', arrowShape: 'triangle', particleTheme: 'stardust', lineStyle: 'neon' },
    // 4th tier - new top-of-track above ฿59.
    { id: 'royalebear', unlock: { type: 'iap', productId: 'skin_royalebear' }, mascotIcon: 'bear', name: { th: 'หมีราชา',        en: 'Royale Bear' },
      colors: { face: { light: '#d9b38c', dark: '#241505' }, path: { light: '#5c3a1a', dark: '#d9b38c' } },
      material: 'badge', arrowShape: 'diamond', particleTheme: 'leaves', lineStyle: 'pawprint' },
    { id: 'royaledog', unlock: { type: 'iap', productId: 'skin_royaledog' }, mascotIcon: 'dog', name: { th: 'หมาราชา',        en: 'Royale Dog' },
      colors: { face: { light: '#f5dba3', dark: '#241a05' }, path: { light: '#8a6220', dark: '#f5dba3' } },
      material: 'badge', arrowShape: 'star', particleTheme: 'embers', lineStyle: 'pawprint' }
  ];

  function getById(id) {
    return ALL.find(s => s.id === id) || null;
  }

  // Single source of truth for "is this skin unlocked" - shared by ui.js
  // (skins-screen grid) and game.js (win-banner unlock-crossing detection),
  // so the 4 unlock types (level/streak/gems/iap) are only ever checked here.
  //
  // 2026-08-20 monetization pass: every skin can now ALSO be unlocked via an
  // optional `altUnlock` bypass (js/iap.js) on top of its primary
  // unlock.type - level-track skins get a gems price, streak-track skins
  // get a real-money-only bypass (deliberately no gems option there, see
  // the comment on the streak skins themselves for why). A skin owned via
  // its own altUnlock purchase OR swept into a bundle purchase
  // (js/iap.js's SKIN_BUNDLES) both funnel into the same ownedIapSkins set
  // via Storage.grantIapSkin(), checked first so it short-circuits
  // regardless of the skin's primary track.
  function isUnlockedFor(skin, ctx) {
    if (ctx.debugUnlockAll) return true;
    if (ctx.iapOwnedSkins.has(skin.id)) return true;
    switch (skin.unlock.type) {
      case 'level':  if (ctx.highestUnlocked >= skin.unlock.value) return true; break;
      // Checks the permanent ownedStreakSkins set, NOT a live ctx.dailyStreak >= value
      // comparison - dailyStreak can drop back down (missed day), and a skin already
      // earned must stay unlocked. See storage.js's ownedStreakSkins/grantStreakSkin.
      case 'streak': if (ctx.streakOwnedSkins.has(skin.id)) return true; break;
      case 'gems':   if (ctx.gemsOwnedSkins.has(skin.id)) return true; break;
      default: break;
    }
    if (skin.altUnlock && skin.altUnlock.type === 'gems') return ctx.gemsOwnedSkins.has(skin.id);
    return false;
  }

  return { ALL, getById, isUnlockedFor };
})();
