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
      'menu.skins': '🎨 สกิน',
      'menu.wheel': '🎡 วงล้อ',
      'menu.tagline': 'เลื่อนลูกศรออกจากลูกบาศก์ให้หมด!',
      'menu.level_label': 'ด่าน',

      'hud.level': 'ด่าน',
      'hud.instruction': 'ลากเพื่อหมุน • แตะเส้นทางเพื่อเลื่อนออก!',
      'hud.undo': '↩ ย้อนกลับ',
      'hud.tier.daily': 'รายวัน',
      'hud.tier.remix': 'เรมิกซ์',

      'levels.title': 'เลือกด่าน',

      'skins.title': '🎨 สกิน',
      'skins.group.level': '🏆 ปลดล็อคตามด่าน',
      'skins.group.streak': '🔥 สายสตรีค',
      'skins.group.gems': '💎 สายอัญมณี',
      'skins.group.iap': '👑 พรีเมียม',
      'skins.group.animal': '🐾 กลุ่มสัตว์',
      'skins.group.rainbow': '🌈 กลุ่มสีรุ้ง',
      'skins.group.special': '✨ กลุ่มธีมพิเศษ',
      'skins.view_by_unlock': 'ตามการปลดล็อค',
      'skins.view_by_style': 'ตามสไตล์',
      'skins.locked': 'ปลดล็อคที่ด่าน {n}',
      'skins.locked_streak': '{cur}/{n} วันติด',
      'skins.buy_gems': '💎 {price}',
      'skins.buy_iap': '{price}',
      'skins.buy_alt_gems': '💎 ซื้อลัดด้วยเพชร ({price})',
      'skins.buy_alt_iap': '💰 ซื้อลัดด้วยเงินจริง ({price})',
      'skins.iap_web_unavailable': 'ใช้งานได้บนแอปมือถือเท่านั้น',
      'skins.tutorial_title': '🎨 เปลี่ยนสกินได้แล้ว!',
      'skins.tutorial_text': 'แตะที่สกินซึ่งปลดล็อคแล้วเพื่อเปลี่ยนสีลูกบาศก์และเส้นทางทันที',
      'skins.tutorial_got_it': 'เข้าใจแล้ว',
      'win.new_skin': '🎉 ปลดล็อคสกินใหม่: {name}!',

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
      'stats.more_hidden': 'และอีก {n} ด่านก่อนหน้านี้ (แสดงเฉพาะด่านล่าสุด)',

      'pause.title': '⏸ หยุดชั่วคราว',
      'pause.level_label': 'ด่าน',
      'pause.resume': '▶ เล่นต่อ',
      'pause.settings': '⚙ ตั้งค่า',
      'pause.restart': '↺ เริ่มใหม่',
      'pause.quit': '✕ เมนู',

      'settings.title': '⚙ ตั้งค่า',
      'settings.darkmode': '🌙 โหมดมืด',
      'settings.music': '🎵 เพลง',
      'settings.sfx': '🔊 เสียงเอฟเฟกต์',
      'settings.vibration': '📳 การสั่น',
      'settings.colorblind': '👁️ โหมดช่วยแยกสี',
      'settings.google_account': '🔗 บัญชี Google',
      'settings.google_signin_btn': 'เชื่อมต่อ',
      'settings.google_signed_in': '✅ เชื่อมต่อแล้ว',
      'settings.google_signout_btn': 'ออกจากระบบ',
      'settings.nickname': '👋 ชื่อผู้เล่น',
      'settings.nickname_btn': 'ตั้งชื่อ',
      'settings.tutorial': '🎓 บทแนะนำ',
      'settings.tutorial_btn': 'ดูอีกครั้ง',
      'settings.skins': '🎨 สกิน',
      'settings.skins_btn': 'เปลี่ยนสกิน',
      'settings.language': '🌐 ภาษา',
      'settings.privacy': '🔒 ความเป็นส่วนตัว',
      'settings.privacy_btn': 'ตัวเลือกโฆษณา',
      'settings.reset': '🗑️ ล้างข้อมูล',
      'settings.reset_btn': 'ล้างข้อมูล',
      'settings.delete_account': '☠️ ลบบัญชี',
      'settings.delete_account_btn': 'ลบบัญชี',
      'delete_account.title': '☠️ ลบบัญชีถาวร?',
      'delete_account.warning': 'บัญชี Google ที่เชื่อมไว้ ข้อมูลสำรองบนคลาวด์ และอันดับบนกระดานโลกของคุณจะถูกลบถาวร กู้คืนไม่ได้ ความคืบหน้าในเครื่องนี้จะถูกล้างด้วย ส่วนสินค้าที่ซื้อด้วยเงินจริงยังผูกกับบัญชี Google Play ของคุณตามเดิม',
      'delete_account.confirm': 'ลบบัญชีถาวร',
      'delete_account.cancel': 'ยกเลิก',
      'delete_account.working': 'กำลังลบ...',
      'delete_account.done': 'ลบบัญชีเรียบร้อยแล้ว',
      'delete_account.failed': 'ลบบัญชีไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่',
      'delete_account.stale_login': 'ลบข้อมูลของคุณเรียบร้อยแล้ว แต่ต้องเข้าสู่ระบบ Google อีกครั้งเพื่อลบตัวบัญชีให้เสร็จสมบูรณ์',
      'settings.close': 'ปิด',

      'reset.title': '⚠️ ล้างข้อมูล?',
      'reset.warning': 'การกระทำนี้จะลบความคืบหน้า ดาว คะแนน คำใบ้ และชื่อผู้เล่นทั้งหมดในเครื่องนี้ ไม่สามารถย้อนกลับได้ (คะแนนที่เคยขึ้นอันดับโลกแล้วจะยังคงอยู่ในตารางเหมือนเดิม)',
      'reset.confirm': 'ล้างข้อมูลและเริ่มใหม่',
      'reset.cancel': 'ยกเลิก',

      'cloudsave.conflict_title': '☁️ พบข้อมูลเดิม',
      'cloudsave.conflict_warning': 'บัญชี Google นี้มีข้อมูลเกมที่บันทึกไว้ ซึ่งต่างจากข้อมูลในเครื่องนี้ ต้องการกู้คืนข้อมูลเดิม หรือเก็บข้อมูลในเครื่องนี้ไว้ (ข้อมูลอีกฝั่งจะถูกแทนที่)',
      'cloudsave.restore': 'กู้คืนข้อมูลเดิม',
      'cloudsave.keep_local': 'เก็บข้อมูลเครื่องนี้ไว้',
      'cloudsave.link_reward': 'เชื่อมต่อบัญชี Google สำเร็จ! รับโบนัส 💎 20 + 💡 2',
      'cloudsave.signin_failed': 'เชื่อมต่อ Google ไม่สำเร็จ ลองใหม่อีกครั้ง',

      'notif.daily_title': '🎯 ยังไม่ได้เล่นวันนี้!',
      'notif.daily_body': 'Daily Challenge วันนี้ยังรออยู่ เข้ามาต่อสตรีคก่อนหมดวัน',
      'notif.wheel_title': '🎡 หมุนวงล้อฟรี!',
      'notif.wheel_body': 'วันนี้ยังไม่ได้ใช้สิทธิ์หมุนวงล้อฟรี มารับรางวัลกันเถอะ',

      'exit.title': 'ออกจากเกม?',
      'exit.warning': 'ต้องการออกจาก ArrowFlow ใช่หรือไม่',
      'exit.confirm': 'ออกจากเกม',
      'exit.cancel': 'ยกเลิก',
      'reset.working': 'กำลังล้างข้อมูล...',

      'win.title': 'ผ่านด่านแล้ว!',
      'win.title_num': 'ผ่านด่าน {n} แล้ว!',
      'win.title_daily': '🗓️ ผ่านเควสประจำวันแล้ว!',
      'win.title_remix': '✨ ผ่านด่าน REMIX แล้ว!',
      'win.finale_title': '🏆 จบแคมเปญแล้ว!',
      'win.finale_sub': 'จบแคมเปญ 300 ด่านแล้ว! ไปต่อกับโหมด REMIX ที่ยากขึ้นเรื่อยๆ',
      'win.score': 'คะแนน',
      'win.time': 'เวลา',
      'win.hints': 'คำใบ้',
      'win.gems': '💎',
      'win.gems_bonus_daily': '2 เท่า!',
      'win.gems_bonus_milestone': '✨ โบนัส',
      'win.hints_bonus': '+{n} 🎁',
      'win.combo': '🔥 คอมโบ',
      'win.golden': '⭐ ทองคำ',
      'golden.claimed': '⭐ โบนัสเส้นทองคำ! +{n}',
      'win.personal_best': 'สถิติของคุณด่านนี้:',
      'win.world_best': 'สูงสุดโลกด่านนี้:',
      'win.rank': '🏆 อันดับโลก:',
      'win.next': 'ด่านต่อไป →',
      'win.leaderboard': '🏆 ดูอันดับ',
      'win.share': '📤 แชร์คะแนน',
      'share.title': 'ArrowFlow 3D',
      'share.score_text': 'ผมทำได้ {score} คะแนน {stars} ในด่าน {level} ของ ArrowFlow 3D! มาลองท้าดวลกันหน่อย 🎯',
      'share.copied': 'คัดลอกข้อความแล้ว นำไปวางแชร์ได้เลย',
      'win.replay': '↺ เล่นใหม่',

      'nickname.title': '👋 ตั้งชื่อผู้เล่น',
      'nickname.sub': 'ใช้แสดงในอันดับโลก (ไม่ต้องใช้อีเมล)',
      'nickname.placeholder': 'ชื่อเล่นของคุณ',
      'nickname.confirm': 'เริ่มเล่น',
      'nickname.skip': 'ข้าม',

      'daily_tip.title': '📅 รู้จักด่านรายวันหรือยัง?',
      'daily_tip.text': 'ด่านปริศนาใหม่ทุกวัน เล่นจบครั้งแรกของวันรับ hint ฟรีทันที 2 อัน แถมเล่นต่อเนื่องทุกวันครบ 7 วันจะได้สกิน "{skin}" ฟรีด้วย!',
      'daily_tip.go': 'ไปเล่นเลย',
      'daily_tip.later': 'เล่นทีหลัง',

      'daily_streak.badge_progress': '🔥 {cur}/{n} วันติด → ปลดล็อก {skin}',
      'daily_streak.badge_maxed': '🔥 สตรีค {cur} วัน — ปลดสกินสายสตรีคครบแล้ว!',

      'update.ready': '🔄 อัปเดตพร้อมแล้ว แตะเพื่อรีสตาร์ท',

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
      'store.hint_ad_success': '💡 ได้รับ 1 คำใบ้แล้ว!',
      'fail.continue_ad_success': '❤️ ได้รับสิทธิ์เล่นต่อแล้ว!',
      'store.ads_remaining': 'เหลือวันนี้ {n}/{cap}',
      'store.hint_packs': '📦 แพ็กคำใบ้',
      'store.pack_10': '10 คำใบ้ - ฿29',
      'store.pack_30': '30 คำใบ้ - ฿69',
      'store.pack_100': '100 คำใบ้ - ฿149',
      'store.coming_soon': 'เร็วๆ นี้ 🙏 ระบบซื้อยังไม่เปิดใช้งาน',
      'store.gem_packs': '💎 ซื้อเพชร',
      'store.gem_pack_label': '💎 {n} - {price}',
      'store.skin_bundles': '🎁 แพ็คเกจสกิน',
      'store.bundle_streak': '🔥 แพ็คสายสตรีค ({n} สกิน) - {price}',
      'store.bundle_royale': '👑 แพ็คพรีเมียม ({n} สกิน) - {price}',
      'store.bundle_all': '🌟 ปลดล็อคสกินทั้งหมด ({n} สกิน) - {price}',
      'store.bundle_owned_all': '✅ ปลดล็อคสกินครบทุกตัวแล้ว',
      'menu.bundle_promo': '🎁 ชุดสกินสุดคุ้ม',

      'iap.store_section': '🚫📺 ปิดโฆษณา',
      'iap.buy_days': '🚫📺 ปิดโฆษณา {days} วัน - {price}',
      'iap.buy_forever': '♾️ ปิดโฆษณาตลอดไป - {price}',
      'iap.days_left': 'เหลือ {n} วัน',
      'iap.active_status': '✅ ไม่มีโฆษณา เหลือ {n} วัน',
      'iap.active_status_forever': '✅ ไม่มีโฆษณาตลอดไป',
      'iap.hud_cta_label': 'ปิดโฆษณา',
      'iap.purchase_failed': 'การซื้อไม่สำเร็จ ลองใหม่อีกครั้ง',
      'iap.purchase_invalid': 'ไม่สามารถยืนยันการซื้อกับ Google Play ได้ ระบบจึงยกเลิกไอเทมนี้ หากคุณชำระเงินจริงแล้ว กรุณาติดต่อเราพร้อมหมายเลขคำสั่งซื้อจาก Google Play',
      'iap.restore_hint': '💡 ทราบไหม: ถ้าคุณเปลี่ยนเครื่องหรือถอนแอปแล้วติดตั้งใหม่ในอนาคต แค่กดปุ่ม "ซื้อ" ของไอเทมนี้อีกครั้ง ระบบจะปลดล็อคให้ทันทีโดยไม่เก็บเงินซ้ำ (Google Play จำได้ว่าคุณซื้อไปแล้ว)',
      'iap.purchase_success': '🎉 ปิดโฆษณาเรียบร้อย เหลือ {n} วัน!',
      'iap.purchase_success_forever': '🎉 ปิดโฆษณาตลอดไปแล้ว!',
      'iap.fail_hint': '🚫📺 เบื่อโฆษณา? ไปเลือกแพ็กปิดโฆษณาในร้านค้า',
      'iap.hint_pack_label': '{n} คำใบ้ - {price}',
      'iap.hint_pack_success': '🎉 ได้รับคำใบ้ {n} อันแล้ว!',
      'iap.gem_pack_success': '🎉 ได้รับเพชร {n} เม็ดแล้ว!',
      'iap.bundle_success': '🎉 ปลดล็อคสกินในแพ็คเรียบร้อย!',

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
      'tutorial.progress': 'ขั้นตอนที่ {step} / {total}',
      'tutorial.got_it': 'เข้าใจแล้ว',
      'tutorial.combo.title': 'คอมโบสี!',
      'tutorial.combo.text': 'แตะเส้นทางสีเดียวกันติดต่อกันเพื่อรับคอมโบ ยิ่งคอมโบยาว ยิ่งได้คะแนนโบนัสเยอะ',
      'tutorial.golden.title': 'เส้นทองคำ!',
      'tutorial.golden.text': 'เส้นที่เรืองแสงสีทองคือเส้นพิเศษ ต้องแตะให้สำเร็จเป็น "การแตะครั้งแรก" ของด่านเท่านั้นเพื่อรับโบนัสก้อนใหญ่',
      'tutorial.lockkey.title': 'เส้นถูกล็อก!',
      'tutorial.lockkey.text': 'เส้นที่มีไอคอนกุญแจแตะไม่ได้ ต้องเคลียร์เส้นที่ไฮไลต์อยู่ตอนนี้ก่อน ถึงจะปลดล็อกได้',

      'wheel.title': '🎡 วงล้อรายวัน',
      'wheel.badge_available': '🎡 มีสิทธิ์หมุนฟรีวันนี้!',
      'wheel.spin_free': 'หมุนฟรี',
      'wheel.spin_free_done': 'พรุ่งนี้ค่อยมาใหม่',
      'wheel.spin_ad': '📺 หมุนเพิ่ม (ดูโฆษณา)',
      'wheel.bonus_remaining': 'เหลือวันนี้ {n}/{cap}',
      'wheel.close': 'ปิด',
      'wheel.reset_in': 'รีเซ็ตใน {t}',
      'wheel.result_gems': '💎 ได้รับ {n} เพชร!',
      'wheel.result_hints': '💡 ได้รับ {n} คำใบ้!',

      // REMIX difficulty escalation (2026-09-03) - one-time notice per tier.
      'remix.tier1_notice': '🔥 REMIX รอบใหม่: เหลือหัวใจแค่ 2 ดวงจากนี้ไป ระวังให้ดี!',
      'remix.tier2_notice': '💀 REMIX โหมดหัวใจเดียว: พลาดครั้งเดียวจบทันที!',
      'remix.tier3_notice': '🚫 REMIX ปิดใช้งานคำใบ้แล้ว: ใช้ความจำล้วนๆ จากนี้ไป!',
      'remix.hints_disabled': 'คำใบ้ปิดใช้งานใน REMIX รอบนี้'
    },
    en: {
      'menu.play': '▶  PLAY',
      'menu.levels': '☰ Levels',
      'menu.daily': '📅 Daily',
      'menu.daily_done': '✅ Daily (Done)',
      'menu.ranking': '🏆 Ranking',
      'menu.store': '🛒 Store',
      'menu.skins': '🎨 Skins',
      'menu.wheel': '🎡 Wheel',
      'menu.tagline': 'Slide all arrows off the cube!',
      'menu.level_label': 'Level',

      'hud.level': 'LEVEL',
      'hud.instruction': 'Drag to rotate • Tap a path to slide it off!',
      'hud.undo': '↩ Undo',
      'hud.tier.daily': 'DAILY',
      'hud.tier.remix': 'REMIX',

      'levels.title': 'SELECT LEVEL',

      'skins.title': '🎨 Skins',
      'skins.group.level': '🏆 Level Unlocks',
      'skins.group.streak': '🔥 Streak Track',
      'skins.group.gems': '💎 Gems Track',
      'skins.group.iap': '👑 Premium',
      'skins.group.animal': '🐾 Animals',
      'skins.group.rainbow': '🌈 Rainbow',
      'skins.group.special': '✨ Special Themes',
      'skins.view_by_unlock': 'By Unlock',
      'skins.view_by_style': 'By Style',
      'skins.locked': 'Unlock at level {n}',
      'skins.locked_streak': '{cur}/{n}-day streak',
      'skins.buy_gems': '💎 {price}',
      'skins.buy_iap': '{price}',
      'skins.buy_alt_gems': '💎 Skip with Gems ({price})',
      'skins.buy_alt_iap': '💰 Skip with Real Money ({price})',
      'skins.iap_web_unavailable': 'Available on the mobile app only',
      'skins.tutorial_title': '🎨 Skins unlocked!',
      'skins.tutorial_text': 'Tap an unlocked skin to instantly recolor the cube and paths.',
      'skins.tutorial_got_it': 'Got it',
      'win.new_skin': '🎉 New skin unlocked: {name}!',

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
      'stats.more_hidden': 'and {n} earlier level(s) not shown',

      'pause.title': '⏸ PAUSED',
      'pause.level_label': 'Level',
      'pause.resume': '▶ Resume',
      'pause.settings': '⚙ Settings',
      'pause.restart': '↺ Restart',
      'pause.quit': '✕ Menu',

      'settings.title': '⚙ SETTINGS',
      'settings.darkmode': '🌙 Dark mode',
      'settings.music': '🎵 Music',
      'settings.sfx': '🔊 Sound Effects',
      'settings.vibration': '📳 Vibration',
      'settings.colorblind': '👁️ Colorblind Assist',
      'settings.google_account': '🔗 Google Account',
      'settings.google_signin_btn': 'Connect',
      'settings.google_signed_in': '✅ Connected',
      'settings.google_signout_btn': 'Sign Out',
      'settings.nickname': '👋 Player Name',
      'settings.nickname_btn': 'Set Name',
      'settings.tutorial': '🎓 Tutorial',
      'settings.tutorial_btn': 'Replay',
      'settings.skins': '🎨 Skins',
      'settings.skins_btn': 'Change Skin',
      'settings.privacy': '🔒 Privacy',
      'settings.privacy_btn': 'Ad Options',
      'settings.language': '🌐 Language',
      'settings.reset': '🗑️ Reset Progress',
      'settings.reset_btn': 'Reset',
      'settings.delete_account': '☠️ Delete account',
      'settings.delete_account_btn': 'Delete',
      'delete_account.title': '☠️ Delete your account?',
      'delete_account.warning': 'Your linked Google account, your cloud backup and your world-ranking entry will be permanently deleted and cannot be recovered. Progress on this device is cleared too. Anything you bought with real money stays tied to your Google Play account.',
      'delete_account.confirm': 'Delete permanently',
      'delete_account.cancel': 'Cancel',
      'delete_account.working': 'Deleting...',
      'delete_account.done': 'Your account has been deleted.',
      'delete_account.failed': 'Could not delete the account. Check your internet connection and try again.',
      'delete_account.stale_login': 'Your data has been deleted, but you need to sign in with Google once more to finish removing the account itself.',
      'settings.close': 'Close',

      'reset.title': '⚠️ Reset progress?',
      'reset.warning': "This deletes all progress, stars, score, hints, and your player name on this device. This can't be undone (any score you already have on the world ranking stays exactly as it is).",
      'reset.confirm': 'Reset & Start Over',
      'reset.cancel': 'Cancel',

      'cloudsave.conflict_title': '☁️ Found existing data',
      'cloudsave.conflict_warning': "This Google account has saved game data that's different from what's on this device. Restore the saved data, or keep what's on this device (the other copy will be overwritten)?",
      'cloudsave.restore': 'Restore Saved Data',
      'cloudsave.keep_local': 'Keep This Device',
      'cloudsave.link_reward': 'Google account connected! Bonus: 💎 20 + 💡 2',
      'cloudsave.signin_failed': "Couldn't connect to Google - try again",

      'notif.daily_title': "🎯 Haven't played today!",
      'notif.daily_body': "Today's Daily Challenge is still waiting - keep your streak alive",
      'notif.wheel_title': '🎡 Free spin ready!',
      'notif.wheel_body': "You haven't used today's free wheel spin yet - come grab your prize",

      'exit.title': 'Exit game?',
      'exit.warning': 'Are you sure you want to exit ArrowFlow?',
      'exit.confirm': 'Exit',
      'exit.cancel': 'Cancel',
      'reset.working': 'Resetting...',

      'win.title': 'LEVEL COMPLETE!',
      'win.title_num': 'LEVEL {n} COMPLETE!',
      'win.title_daily': '🗓️ DAILY CHALLENGE COMPLETE!',
      'win.title_remix': '✨ REMIX LEVEL COMPLETE!',
      'win.finale_title': '🏆 CAMPAIGN COMPLETE!',
      'win.finale_sub': "You beat all 300 levels! Keep going in REMIX mode - it only gets harder.",
      'win.score': 'Score',
      'win.time': 'Time',
      'win.hints': 'Hints',
      'win.gems': '💎',
      'win.gems_bonus_daily': '2x!',
      'win.gems_bonus_milestone': '✨ bonus',
      'win.hints_bonus': '+{n} 🎁',
      'win.combo': '🔥 Combo',
      'win.golden': '⭐ Golden',
      'golden.claimed': '⭐ Golden Path Bonus! +{n}',
      'win.personal_best': 'Your best on this level:',
      'win.world_best': 'World best on this level:',
      'win.rank': '🏆 World rank:',
      'win.next': 'NEXT LEVEL →',
      'win.leaderboard': '🏆 Leaderboard',
      'win.share': '📤 Share score',
      'share.title': 'ArrowFlow 3D',
      'share.score_text': 'I scored {score} {stars} on level {level} of ArrowFlow 3D! Think you can beat that? 🎯',
      'share.copied': 'Copied - paste it anywhere to share',
      'win.replay': '↺ Replay',

      'nickname.title': '👋 Set Player Name',
      'nickname.sub': 'Shown on the world leaderboard (no email needed)',
      'nickname.placeholder': 'Your nickname',
      'nickname.confirm': 'Start',
      'nickname.skip': 'Skip',

      'daily_tip.title': '📅 Have you tried Daily Challenge?',
      'daily_tip.text': 'A brand new puzzle every day - finish your first one of the day for 2 free hints, plus play 7 days in a row to earn the "{skin}" skin for free!',
      'daily_tip.go': 'Play now',
      'daily_tip.later': 'Maybe later',

      'daily_streak.badge_progress': '🔥 {cur}/{n}-day streak → unlocks {skin}',
      'daily_streak.badge_maxed': '🔥 {cur}-day streak — all streak skins unlocked!',

      'update.ready': '🔄 Update ready - tap to restart',

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
      'store.hint_ad_success': '💡 You got 1 hint!',
      'fail.continue_ad_success': '❤️ Continue granted!',
      'store.ads_remaining': '{n}/{cap} left today',
      'store.hint_packs': '📦 Hint Packs',
      'store.pack_10': '10 Hints - $0.99',
      'store.pack_30': '30 Hints - $1.99',
      'store.pack_100': '100 Hints - $3.99',
      'store.coming_soon': 'Coming soon 🙏 purchases aren’t live yet.',
      'store.gem_packs': '💎 Buy Gems',
      'store.gem_pack_label': '💎 {n} - {price}',
      'store.skin_bundles': '🎁 Skin Bundles',
      'store.bundle_streak': '🔥 Streak Track Bundle ({n} skins) - {price}',
      'store.bundle_royale': '👑 Premium Bundle ({n} skins) - {price}',
      'store.bundle_all': '🌟 Unlock Every Skin ({n} skins) - {price}',
      'store.bundle_owned_all': '✅ Every skin unlocked',
      'menu.bundle_promo': '🎁 Best-Value Skin Bundles',

      'iap.store_section': '🚫📺 Remove Ads',
      'iap.buy_days': '🚫📺 Remove Ads {days} Days - {price}',
      'iap.buy_forever': '♾️ Remove Ads Forever - {price}',
      'iap.days_left': '{n} days left',
      'iap.active_status': '✅ Ad-free, {n} days left',
      'iap.active_status_forever': '✅ Ad-free forever',
      'iap.hud_cta_label': 'No Ads',
      'iap.purchase_failed': 'Purchase failed - please try again',
      'iap.purchase_invalid': 'This purchase could not be verified with Google Play, so the item has been removed. If you were really charged, please contact us with your Google Play order number.',
      'iap.restore_hint': '💡 Good to know: if you switch phones or reinstall the app later, just tap "Buy" on this item again - it unlocks instantly with no extra charge (Google Play remembers you already own it).',
      'iap.purchase_success': '🎉 Ads removed - {n} days left!',
      'iap.purchase_success_forever': '🎉 Ads removed forever!',
      'iap.fail_hint': '🚫📺 Tired of ads? Pick a plan in the Store',
      'iap.hint_pack_label': '{n} Hints - {price}',
      'iap.hint_pack_success': '🎉 Got {n} hints!',
      'iap.gem_pack_success': '🎉 Got {n} gems!',
      'iap.bundle_success': '🎉 Bundle skins unlocked!',

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
      'tutorial.progress': 'Step {step} / {total}',
      'tutorial.got_it': 'Got it',
      'tutorial.combo.title': 'Color Combo!',
      'tutorial.combo.text': 'Tap same-colored paths back to back to build a combo. Longer combos earn a bigger score bonus.',
      'tutorial.golden.title': 'Golden Path!',
      'tutorial.golden.text': 'The glowing gold path is special - it must be your very first tap of the level to win the big bonus.',
      'tutorial.lockkey.title': 'Locked Path!',
      'tutorial.lockkey.text': "Paths with a padlock icon can't be tapped yet - clear the highlighted path first to unlock them.",

      'wheel.title': '🎡 Daily Wheel',
      'wheel.badge_available': '🎡 Free spin available today!',
      'wheel.spin_free': 'Free Spin',
      'wheel.spin_free_done': 'Come back tomorrow',
      'wheel.spin_ad': '📺 Spin Again (watch ad)',
      'wheel.bonus_remaining': '{n}/{cap} left today',
      'wheel.close': 'Close',
      'wheel.reset_in': 'Resets in {t}',
      'wheel.result_gems': '💎 You got {n} gems!',
      'wheel.result_hints': '💡 You got {n} hints!',

      // REMIX difficulty escalation (2026-09-03) - one-time notice per tier.
      'remix.tier1_notice': '🔥 REMIX gets harder: only 2 hearts from here on - be careful!',
      'remix.tier2_notice': '💀 REMIX sudden death: one mistake ends the run!',
      'remix.tier3_notice': "🚫 REMIX hints are off from here: you're on memory alone now!",
      'remix.hints_disabled': 'Hints are disabled at this REMIX tier'
    }
  };

  // Which languages this build actually ships strings for (STRINGS above).
  const SUPPORTED = ['en', 'th'];

  // First run has no stored choice, and `lang` used to default to a hard-coded
  // 'en' - so a Thai device showed an English game until the player found the
  // toggle in Settings. Fall back to the device's own language list instead;
  // a player who has actually picked a language (langExplicit) always wins.
  function detectLang() {
    try {
      const prefs = (navigator.languages && navigator.languages.length)
        ? navigator.languages : [navigator.language || ''];
      for (const p of prefs) {
        const code = String(p).toLowerCase().split('-')[0];
        if (SUPPORTED.includes(code)) return code;
      }
    } catch {}
    return 'en';
  }

  function currentLang() {
    if (Storage.get('langExplicit')) {
      const stored = Storage.get('lang');
      if (SUPPORTED.includes(stored)) return stored;
    }
    return detectLang();
  }

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
    // Marks the choice as the player's own, so device-language detection stops
    // overriding it - including when they deliberately pick English on a Thai
    // device, which detection would otherwise undo on the next launch.
    Storage.set('langExplicit', true);
    applyToDOM();
  }

  return { t, setLang, applyToDOM, currentLang, detectLang };
})();
