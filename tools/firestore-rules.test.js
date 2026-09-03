/**
 * Security-rules tests for firestore.rules, run against the Firestore emulator.
 *
 * These rules are the only thing stopping one player from rewriting another
 * player's data, and they have now failed in production three separate times -
 * every time because `request.resource` is null on an operation that isn't a
 * create or update, which makes a field check throw, and Firestore denies on a
 * thrown rule. Each failure was silent, shipped, and only reproducible against
 * real Firestore:
 *
 *   1. `allow read, write` + field checks  -> every READ denied (cloud save
 *      could never restore anything).
 *   2. `!resource.exists()`                -> invalid syntax, every first write
 *      to levelBests denied.
 *   3. `allow write` + field checks        -> every DELETE denied (account
 *      deletion, which Google Play requires, would not have worked).
 *
 * Run:  npm run test:rules
 * (starts the emulator itself - no separate terminal needed)
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { initializeTestEnvironment, assertFails, assertSucceeds } =
  require('@firebase/rules-unit-testing');

const ALICE = 'alice-uid';
const BOB = 'bob-uid';

let env;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push([true, name]);
    console.log(`PASS  ${name}`);
  } catch (e) {
    results.push([false, name]);
    console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`);
  }
}

// A players/{uid} document that satisfies every bound in the rules, so a test
// that expects a DENY is only ever denying for the reason it names.
const validPlayer = (over = {}) => ({
  nickname: 'Alice', highestLevel: 10, totalScore: 5000, ...over
});
const validSave = (over = {}) => ({
  nickname: 'Alice', currentLevel: 10, highestUnlocked: 10, totalScore: 5000,
  gems: 5, paidGems: 0, hints: 2, paidHints: 0, levelData: { 1: { stars: 3 } }, ...over
});

(async () => {
  env = await initializeTestEnvironment({
    projectId: 'arrowflow-rules-test',
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });

  const alice = env.authenticatedContext(ALICE).firestore();
  const bob = env.authenticatedContext(BOB).firestore();
  const anon = env.unauthenticatedContext().firestore();

  // ---------- players/{uid} : the public leaderboard ----------
  await check('players: owner can create their own entry', () =>
    assertSucceeds(alice.doc(`players/${ALICE}`).set(validPlayer())));

  await check('players: anyone can read the leaderboard (it is public)', () =>
    assertSucceeds(anon.doc(`players/${ALICE}`).get()));

  await check('players: another player cannot overwrite your entry', () =>
    assertFails(bob.doc(`players/${ALICE}`).set(validPlayer({ nickname: 'Bob' }))));

  await check('players: signed-out cannot write', () =>
    assertFails(anon.doc(`players/${ALICE}`).set(validPlayer())));

  await check('players: a nickname over 20 chars is rejected', () =>
    assertFails(alice.doc(`players/${ALICE}`).set(validPlayer({ nickname: 'x'.repeat(21) }))));

  await check('players: a score implausible for the level reached is rejected', () =>
    // The bound is highestLevel * 25650, so level 10 cannot legitimately carry
    // a 300-level score.
    assertFails(alice.doc(`players/${ALICE}`).set(validPlayer({ totalScore: 9999999 }))));

  await check('players: a wrong-typed field is rejected', () =>
    assertFails(alice.doc(`players/${ALICE}`).set(validPlayer({ highestLevel: '10' }))));

  // Regression #3: `allow write` alone made this throw and deny.
  await check('players: owner CAN delete their own entry (account deletion)', () =>
    assertSucceeds(alice.doc(`players/${ALICE}`).delete()));

  await check('players: another player cannot delete your entry', async () => {
    await alice.doc(`players/${ALICE}`).set(validPlayer());
    await assertFails(bob.doc(`players/${ALICE}`).delete());
  });

  // ---------- saves/{uid} : private cloud save ----------
  await check('saves: owner can write their own save', () =>
    assertSucceeds(alice.doc(`saves/${ALICE}`).set(validSave())));

  // Regression #1: the combined read+write rule made every read throw.
  await check('saves: owner CAN read their own save back', () =>
    assertSucceeds(alice.doc(`saves/${ALICE}`).get()));

  await check('saves: another player cannot read your save', () =>
    assertFails(bob.doc(`saves/${ALICE}`).get()));

  await check('saves: signed-out cannot read a save', () =>
    assertFails(anon.doc(`saves/${ALICE}`).get()));

  await check('saves: another player cannot write your save', () =>
    assertFails(bob.doc(`saves/${ALICE}`).set(validSave())));

  // A player who skipped the nickname prompt sends null - this denied every
  // write from every unnamed player until it was fixed.
  await check('saves: a null nickname is accepted (the prompt is skippable)', () =>
    assertSucceeds(alice.doc(`saves/${ALICE}`).set(validSave({ nickname: null }))));

  await check('saves: negative currency is rejected', () =>
    assertFails(alice.doc(`saves/${ALICE}`).set(validSave({ gems: -5 }))));

  await check('saves: owner CAN delete their own save (account deletion)', () =>
    assertSucceeds(alice.doc(`saves/${ALICE}`).delete()));

  await check('saves: another player cannot delete your save', async () => {
    await alice.doc(`saves/${ALICE}`).set(validSave());
    await assertFails(bob.doc(`saves/${ALICE}`).delete());
  });

  // ---------- levelBests/{levelId} ----------
  // Regression #2: `!resource.exists()` was invalid syntax and denied this.
  await check('levelBests: a first-ever score for a level is accepted', () =>
    assertSucceeds(alice.doc('levelBests/42').set({ nickname: 'Alice', score: 1000 })));

  await check('levelBests: a higher score replaces it', () =>
    assertSucceeds(bob.doc('levelBests/42').set({ nickname: 'Bob', score: 2000 })));

  await check('levelBests: a lower score cannot clobber the record', () =>
    assertFails(alice.doc('levelBests/42').set({ nickname: 'Alice', score: 500 })));

  await check('levelBests: signed-out cannot write', () =>
    assertFails(anon.doc('levelBests/42').set({ nickname: 'X', score: 9999 })));

  // ---------- verifiedPurchases/{token} : Cloud Function only ----------
  await check('verifiedPurchases: no client can read the purchase ledger', () =>
    assertFails(alice.doc('verifiedPurchases/token123').get()));

  await check('verifiedPurchases: no client can write the purchase ledger', () =>
    assertFails(alice.doc('verifiedPurchases/token123').set({ uid: ALICE })));

  await env.cleanup();

  const failed = results.filter(([ok]) => !ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})().catch(err => {
  console.error('rules test harness failed to start:', err.message);
  console.error('Is the Firestore emulator running on 127.0.0.1:8080?');
  process.exit(1);
});
