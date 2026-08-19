/* ============================================
   ArrowFlow 3D — i18n.js
   Minimal TH/EN string dictionary + DOM-string swapper. No build step, no
   framework - static index.html strings are tagged with data-i18n / data-
   i18n-placeholder, dynamic strings built in JS (ui.js, tutorial.js) call
   I18N.t(key) directly instead of hardcoding a literal.
   ============================================ */

const I18N = (() => {
  const STRINGS = {
    th: {
      'menu.play': '▶  เล่น',
      'menu.levels': '☰ ด่าน',
      'menu.daily': '📅 รายวัน',
      'menu.daily_done': '✅ รายวัน (เล่นแล้ว)',
      'menu.ranking': '🏆 อันดับ',
      'menu.store': '🛒 ร้านค้า',
      'menu.tagline': 'เลื่อนลูกศรออกจากลูกบาศก์ให้หมด!',
      'menu.level_label': 'ด่าน',

      'hud.level': 'ด่าน',
      'hud.instruction': 'ลากเพื่อหมุน • แตะเส้นทางเพื่อเลื่อนออก!',
      'hud.undo': '↩ ย้อนกลับ',
      'hud.tier.daily': 'รายวัน',
      'hud.tier.remix': 'เรมิกซ์',

      'levels.title': 'เลือกด่าน',

      'ranking.title': '🏆 อันดับ',
      'ranking.world_section': '🌍 อันดับโลก',
      'ranking.personal_section': '📊 สถิติของฉัน',
      'stats.total_score': 'คะแนนรวม',
      'stats.total_stars': 'ดาวรวม',
      'stats.levels_completed': 'ด่านที่ผ่าน',
      'stats.best_level': 'คะแนนสูงสุด',
      'stats.col_level': 'ด่าน',
      'stats.col_stars': 'ดาว',
      'stats.col_time': 'เวลา',
      'stats.col_score': 'คะแนน',
      'stats.empty': 'ยังไม่มีด่านที่ผ่าน',
      'stats.row_level': 'ด่าน',
      'stats.best_row': 'ด่าน {level} ({score} คะแนน)',

      'pause.title': '⏸ หยุดชั่วคราว',
      'pause.level_label': 'ด่าน',
      'pause.resume': '▶ เล่นต่อ',
      'pause.settings': '⚙ ตั้งค่า',
      'pause.restart': '↺ เริ่มใหม่',
      'pause.quit': '✕ เมนู',

      'settings.title': '⚙ ตั้งค่า',
      'settings.music': '🎵 เพลง',
      'settings.sfx': '🔊 เสียงเอฟเฟกต์',
      'settings.vibration': '📳 การสั่น',
      'settings.nickname': '👋 ชื่อผู้เล่น',
      'settings.nickname_btn': 'ตั้งชื่อ',
      'settings.tutorial': '🎓 บทแนะนำ',
      'settings.tutorial_btn': 'ดูอีกครั้ง',
      'settings.language': '🌐 ภาษา',
      'settings.reset': '🗑️ ล้างข้อมูล',
      'settings.reset_btn': 'ล้างข้อมูล',
      'settings.close': 'ปิด',

      'reset.title': '⚠️ ล้างข้อมูล?',
      'reset.warning': 'การกระทำนี้จะลบความคืบหน้า ดาว คะแนน คำใบ้ และชื่อผู้เล่นทั้งหมดในเครื่องนี้ ไม่สามารถย้อนกลับได้ (คะแนนที่เคยขึ้นอันดับโลกแล้วจะยังคงอยู่ในตารางเหมือนเดิม)',
      'reset.confirm': 'ล้างข้อมูลและเริ่มใหม่',
      'reset.cancel': 'ยกเลิก',
      'reset.working': 'กำลังล้างข้อมูล...',

      'win.title': 'ผ่านด่านแล้ว!',
      'win.finale_title': '🏆 จบแคมเปญแล้ว!',
      'win.finale_sub': 'จบแคมเปญ 300 ด่านแล้ว! ไปต่อกับโหมด REMIX ที่ยากขึ้นเรื่อยๆ',
      'win.score': 'คะแนน',
      'win.time': 'เวลา',
      'win.hints': 'คำใบ้',
      'win.personal_best': 'สถิติของคุณด่านนี้:',
      'win.world_best': 'สูงสุดโลกด่านนี้:',
      'win.rank': '🏆 อันดับโลก:',
      'win.next': 'ด่านต่อไป →',
      'win.leaderboard': '🏆 ดูอันดับ',
      'win.replay': '↺ เล่นใหม่',

      'nickname.title': '👋 ตั้งชื่อผู้เล่น',
      'nickname.sub': 'ใช้แสดงในอันดับโลก (ไม่ต้องใช้อีเมล)',
      'nickname.placeholder': 'ชื่อเล่นของคุณ',
      'nickname.confirm': 'เริ่มเล่น',
      'nickname.skip': 'ข้าม',

      'leaderboard.title': '🏆 อันดับโลก',
      'leaderboard.close': 'ปิด',
      'leaderboard.loading': 'กำลังโหลด…',
      'leaderboard.empty': 'ยังไม่มีข้อมูลอันดับ (ตรวจสอบการเชื่อมต่อ)',
      'leaderboard.set_nickname': 'ตั้งชื่อผู้เล่นเพื่อเข้าร่วมอันดับ',
      'leaderboard.my_row': 'คุณ: {nickname} — อันดับ {rank} ({score} คะแนน, {progress})',

      'fail.title': '💔 หมดหัวใจ!',
      'fail.sub': 'ลองด่านนี้อีกครั้ง',
      'fail.continue_ad': '📺 ดูโฆษณาเพื่อต่อชีวิต',
      'fail.restart': '↺ ลองอีกครั้ง',
      'fail.quit': '✕ เมนู',

      'store.title': '🛒 ร้านค้า',
      'store.hints_section': '💡 คำใบ้',
      'store.watch_ad_hint': '📺 ดูโฆษณาเพื่อรับคำใบ้ฟรี (+1)',
      'store.ad_loading': '⏳ กำลังโหลดโฆษณา...',
      'store.ad_failed': 'ไม่มีโฆษณาให้ดูตอนนี้ ลองใหม่อีกครั้ง',
      'store.ads_remaining': 'เหลือวันนี้ {n}/3',
      'store.hint_packs': '📦 แพ็กคำใบ้',
      'store.pack_10': '10 คำใบ้ - ฿29',
      'store.pack_30': '30 คำใบ้ - ฿69',
      'store.pack_100': '100 คำใบ้ - ฿149',
      'store.coming_soon': 'เร็วๆ นี้ 🙏 ระบบซื้อยังไม่เปิดใช้งาน',

      'iap.store_section': '🚫📺 ปิดโฆษณา',
      'iap.buy_days': '🚫📺 ปิดโฆษณา {days} วัน - {price}',
      'iap.buy_forever': '♾️ ปิดโฆษณาตลอดไป - {price}',
      'iap.days_left': 'เหลือ {n} วัน',
      'iap.active_status': '✅ ไม่มีโฆษณา เหลือ {n} วัน',
      'iap.active_status_forever': '✅ ไม่มีโฆษณาตลอดไป',
      'iap.hud_cta_label': 'ปิดโฆษณา',
      'iap.purchase_failed': 'การซื้อไม่สำเร็จ ลองใหม่อีกครั้ง',
      'iap.purchase_success': '🎉 ปิดโฆษณาเรียบร้อย เหลือ {n} วัน!',
      'iap.purchase_success_forever': '🎉 ปิดโฆษณาตลอดไปแล้ว!',
      'iap.fail_hint': '🚫📺 เบื่อโฆษณา? ไปเลือกแพ็กปิดโฆษณาในร้านค้า',
      'iap.hint_pack_label': '{n} คำใบ้ - {price}',
      'iap.hint_pack_success': '🎉 ได้รับคำใบ้ {n} อันแล้ว!',

      'progress.done': '🏁 จบเกม!',
      'progress.level': 'ด่าน',

      'difficulty.easy': 'ง่าย',
      'difficulty.medium': 'ปานกลาง',
      'difficulty.hard': 'ยาก',
      'difficulty.extreme': 'สุดโหด',

      'tutorial.tap.title': 'แตะเพื่อเลื่อนออก',
      'tutorial.tap.text': 'แตะเส้นทางที่ชี้ออกนอกลูกบาศก์ เพื่อเลื่อนมันออกจากด้าน',
      'tutorial.rotate.title': 'หมุนลูกบาศก์',
      'tutorial.rotate.text': 'ลากนิ้วหรือเมาส์บนหน้าจอ เพื่อหมุนดูรอบลูกบาศก์',
      'tutorial.zoom.title': 'ซูมเข้า-ออก',
      'tutorial.zoom.text': 'ใช้สองนิ้วบีบ (มือถือ) หรือเลื่อนล้อเมาส์ (คอมพิวเตอร์) เพื่อซูม',
      'tutorial.hint.title': 'ใช้ไอเทมคำใบ้',
      'tutorial.hint.text': 'แตะปุ่มคำใบ้เพื่อไฮไลต์เส้นทางที่แนะนำให้เลื่อนออกต่อไป',
      'tutorial.wrong_tap.title': 'ระวังหัวใจ!',
      'tutorial.wrong_tap.text': 'ถ้าแตะเส้นทางที่ยังออกไม่ได้ (ถูกบล็อกอยู่) หัวใจจะลดลง 1 ดวง — หมดหัวใจแล้วต้องเริ่มด่านใหม่',
      'tutorial.wrong_tap.continue': 'เข้าใจแล้ว เริ่มเล่นเลย!',
      'tutorial.skip': 'ข้ามบทแนะนำ',
      'tutorial.next': 'ต่อไป',
      'tutorial.progress': 'ขั้นตอนที่ {step} / {total}'
    },
    en: {
      'menu.play': '▶  PLAY',
      'menu.levels': '☰ Levels',
      'menu.daily': '📅 Daily',
      'menu.daily_done': '✅ Daily (Done)',
      'menu.ranking': '🏆 Ranking',
      'menu.store': '🛒 Store',
      'menu.tagline': 'Slide all arrows off the cube!',
      'menu.level_label': 'Level',

      'hud.level': 'LEVEL',
      'hud.instruction': 'Drag to rotate • Tap a path to slide it off!',
      'hud.undo': '↩ Undo',
      'hud.tier.daily': 'DAILY',
      'hud.tier.remix': 'REMIX',

      'levels.title': 'SELECT LEVEL',

      'ranking.title': '🏆 Ranking',
      'ranking.world_section': '🌍 World Ranking',
      'ranking.personal_section': '📊 My Stats',
      'stats.total_score': 'Total Score',
      'stats.total_stars': 'Total Stars',
      'stats.levels_completed': 'Levels Cleared',
      'stats.best_level': 'Best Score',
      'stats.col_level': 'Level',
      'stats.col_stars': 'Stars',
      'stats.col_time': 'Time',
      'stats.col_score': 'Score',
      'stats.empty': 'No levels cleared yet',
      'stats.row_level': 'Level',
      'stats.best_row': 'Level {level} ({score} pts)',

      'pause.title': '⏸ PAUSED',
      'pause.level_label': 'Level',
      'pause.resume': '▶ Resume',
      'pause.settings': '⚙ Settings',
      'pause.restart': '↺ Restart',
      'pause.quit': '✕ Menu',

      'settings.title': '⚙ SETTINGS',
      'settings.music': '🎵 Music',
      'settings.sfx': '🔊 Sound Effects',
      'settings.vibration': '📳 Vibration',
      'settings.nickname': '👋 Player Name',
      'settings.nickname_btn': 'Set Name',
      'settings.tutorial': '🎓 Tutorial',
      'settings.tutorial_btn': 'Replay',
      'settings.language': '🌐 Language',
      'settings.reset': '🗑️ Reset Progress',
      'settings.reset_btn': 'Reset',
      'settings.close': 'Close',

      'reset.title': '⚠️ Reset progress?',
      'reset.warning': "This deletes all progress, stars, score, hints, and your player name on this device. This can't be undone (any score you already have on the world ranking stays exactly as it is).",
      'reset.confirm': 'Reset & Start Over',
      'reset.cancel': 'Cancel',
      'reset.working': 'Resetting...',

      'win.title': 'LEVEL COMPLETE!',
      'win.finale_title': '🏆 CAMPAIGN COMPLETE!',
      'win.finale_sub': "You beat all 300 levels! Keep going in REMIX mode - it only gets harder.",
      'win.score': 'Score',
      'win.time': 'Time',
      'win.hints': 'Hints',
      'win.personal_best': 'Your best on this level:',
      'win.world_best': 'World best on this level:',
      'win.rank': '🏆 World rank:',
      'win.next': 'NEXT LEVEL →',
      'win.leaderboard': '🏆 Leaderboard',
      'win.replay': '↺ Replay',

      'nickname.title': '👋 Set Player Name',
      'nickname.sub': 'Shown on the world leaderboard (no email needed)',
      'nickname.placeholder': 'Your nickname',
      'nickname.confirm': 'Start',
      'nickname.skip': 'Skip',

      'leaderboard.title': '🏆 World Leaderboard',
      'leaderboard.close': 'Close',
      'leaderboard.loading': 'Loading…',
      'leaderboard.empty': 'No leaderboard data yet (check your connection)',
      'leaderboard.set_nickname': 'Set a nickname to join the leaderboard',
      'leaderboard.my_row': 'You: {nickname} — rank {rank} ({score} pts, {progress})',

      'fail.title': '💔 Out of Hearts!',
      'fail.sub': 'Try this level again',
      'fail.continue_ad': '📺 Watch Ad to Continue',
      'fail.restart': '↺ Try Again',
      'fail.quit': '✕ Menu',

      'store.title': '🛒 Store',
      'store.hints_section': '💡 Hints',
      'store.watch_ad_hint': '📺 Watch Ad for a Free Hint (+1)',
      'store.ad_loading': '⏳ Loading ad...',
      'store.ad_failed': 'No ad available right now - try again',
      'store.ads_remaining': '{n}/3 left today',
      'store.hint_packs': '📦 Hint Packs',
      'store.pack_10': '10 Hints - $0.99',
      'store.pack_30': '30 Hints - $1.99',
      'store.pack_100': '100 Hints - $3.99',
      'store.coming_soon': 'Coming soon 🙏 purchases aren’t live yet.',

      'iap.store_section': '🚫📺 Remove Ads',
      'iap.buy_days': '🚫📺 Remove Ads {days} Days - {price}',
      'iap.buy_forever': '♾️ Remove Ads Forever - {price}',
      'iap.days_left': '{n} days left',
      'iap.active_status': '✅ Ad-free, {n} days left',
      'iap.active_status_forever': '✅ Ad-free forever',
      'iap.hud_cta_label': 'No Ads',
      'iap.purchase_failed': 'Purchase failed - please try again',
      'iap.purchase_success': '🎉 Ads removed - {n} days left!',
      'iap.purchase_success_forever': '🎉 Ads removed forever!',
      'iap.fail_hint': '🚫📺 Tired of ads? Pick a plan in the Store',
      'iap.hint_pack_label': '{n} Hints - {price}',
      'iap.hint_pack_success': '🎉 Got {n} hints!',

      'progress.done': '🏁 Finished!',
      'progress.level': 'Level',

      'difficulty.easy': 'Easy',
      'difficulty.medium': 'Medium',
      'difficulty.hard': 'Hard',
      'difficulty.extreme': 'Extreme',

      'tutorial.tap.title': 'Tap to slide out',
      'tutorial.tap.text': 'Tap a path that points off the cube to slide it out that side.',
      'tutorial.rotate.title': 'Rotate the cube',
      'tutorial.rotate.text': 'Drag with your finger or mouse to look around the cube.',
      'tutorial.zoom.title': 'Zoom in and out',
      'tutorial.zoom.text': 'Pinch with two fingers (mobile) or scroll the mouse wheel (desktop) to zoom.',
      'tutorial.hint.title': 'Use a hint',
      'tutorial.hint.text': 'Tap the hint button to highlight a path that’s safe to slide out next.',
      'tutorial.wrong_tap.title': 'Watch your hearts!',
      'tutorial.wrong_tap.text': 'Tapping a path that’s still blocked costs 1 heart - run out and you’ll have to restart the level.',
      'tutorial.wrong_tap.continue': 'Got it, let’s play!',
      'tutorial.skip': 'Skip tutorial',
      'tutorial.next': 'Next',
      'tutorial.progress': 'Step {step} / {total}'
    }
  };

  function currentLang() { return Storage.get('lang') || 'en'; }

  function t(key, vars) {
    const lang = currentLang();
    let str = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(k => { str = str.replace('{' + k + '}', vars[k]); });
    }
    return str;
  }

  function applyToDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
  }

  function setLang(lang) {
    Storage.set('lang', lang);
    applyToDOM();
  }

  return { t, setLang, applyToDOM, currentLang };
})();
