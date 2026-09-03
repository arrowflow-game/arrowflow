/**
 * Verifies tools/backup-firestore.js against the Firestore emulator.
 *
 * A backup script nobody has ever restored from is a folder of files, not a
 * backup. This seeds the emulator with the shapes that actually break a naive
 * JSON dump - a Timestamp and a nested map - runs the real script, and checks
 * the output could be read back.
 *
 * Run:  npm run test:backup
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const admin = require('firebase-admin');

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('This test must run against the emulator (npm run test:backup).');
    process.exit(1);
  }

  admin.initializeApp({ projectId: 'arrowflow-8d6a8' });
  const db = admin.firestore();

  const savedAt = new Date('2026-09-03T02:00:00Z');
  await db.doc('players/alice').set({
    nickname: 'Alice', totalScore: 5000, highestLevel: 10,
    updatedAt: admin.firestore.Timestamp.fromDate(savedAt)
  });
  await db.doc('players/bob').set({ nickname: 'Bob', totalScore: 9000, highestLevel: 40 });
  await db.doc('levelBests/42').set({ nickname: 'Alice', score: 1234 });
  await db.doc('saves/alice').set({
    highestUnlocked: 62, gems: 78, paidGems: 0,
    levelData: { 1: { stars: 3, score: 2080 }, 2: { stars: 2, score: 1900 } },
    ownedIapSkins: ['royaleneon'],
    updatedAt: admin.firestore.Timestamp.fromDate(savedAt)
  });

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'af-backup-'));
  execFileSync(process.execPath, [path.join(__dirname, 'backup-firestore.js'), '--out', out], {
    stdio: 'inherit', env: process.env
  });

  const stamps = fs.readdirSync(out);
  check('writes exactly one timestamped backup directory', () => {
    if (stamps.length !== 1) throw new Error(`expected 1 directory, got ${stamps.length}`);
  });
  const dir = path.join(out, stamps[0]);
  const read = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

  check('writes a file per collection plus a manifest', () => {
    for (const f of ['players.json', 'levelBests.json', 'saves.json', 'verifiedPurchases.json', 'manifest.json']) {
      if (!fs.existsSync(path.join(dir, f))) throw new Error(`missing ${f}`);
    }
  });

  check('captures every document, keyed by its id', () => {
    const players = read('players.json');
    if (Object.keys(players).length !== 2) throw new Error(`expected 2 players, got ${Object.keys(players).length}`);
    if (players.alice.nickname !== 'Alice') throw new Error('alice missing or wrong');
    if (players.bob.totalScore !== 9000) throw new Error("bob's score not preserved");
  });

  check('preserves nested maps rather than flattening them', () => {
    const saves = read('saves.json');
    if (saves.alice.levelData['1'].stars !== 3) throw new Error('nested levelData lost');
    if (saves.alice.ownedIapSkins[0] !== 'royaleneon') throw new Error('array field lost');
  });

  check('preserves Timestamps as restorable values, not "[object Object]"', () => {
    const players = read('players.json');
    const ts = players.alice.updatedAt;
    if (!ts || ts.__type__ !== 'timestamp') throw new Error(`timestamp not tagged: ${JSON.stringify(ts)}`);
    if (new Date(ts.value).getTime() !== savedAt.getTime()) throw new Error(`timestamp value wrong: ${ts.value}`);
  });

  check('manifest records the document counts', () => {
    const m = read('manifest.json');
    if (m.totalDocuments !== 4) throw new Error(`expected 4 documents, got ${m.totalDocuments}`);
    if (m.collections.players !== 2) throw new Error('player count wrong in manifest');
    if (!m.startedAt || !m.finishedAt) throw new Error('manifest missing timings');
  });

  check('an empty collection is written as an empty object, not omitted', () => {
    const vp = read('verifiedPurchases.json');
    if (typeof vp !== 'object' || Object.keys(vp).length !== 0) throw new Error('expected {}');
  });

  fs.rmSync(out, { recursive: true, force: true });

  const failed = results.filter(r => !r).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('backup test failed:', e); process.exit(1); });
