/**
 * Exports every Firestore collection to timestamped JSON.
 *
 * Firestore's own managed scheduled backups need the Blaze plan; this project
 * is on Spark, so player data currently has no copy anywhere. That is the whole
 * risk: a bad rules deploy, a stray script, or a deleted collection is
 * permanent. Reading documents is free-tier, so this gets a real backup today
 * without a billing account, and stays useful afterwards as an
 * offsite/portable copy that isn't tied to the project.
 *
 * Credentials, in order of preference:
 *   FIREBASE_SERVICE_ACCOUNT   a service-account JSON key, inline (CI secret)
 *   GOOGLE_APPLICATION_CREDENTIALS  path to that key file (local)
 *   FIRESTORE_EMULATOR_HOST    the emulator, no credentials needed (tests)
 *
 * Usage:
 *   node tools/backup-firestore.js [--out backups] [--project <id>]
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Every collection that holds data worth restoring. levelBests and players are
// public and cheap; saves is the one that actually matters, since it is a
// player's only copy of their progress once they have signed in.
const COLLECTIONS = ['players', 'levelBests', 'saves', 'verifiedPurchases'];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function initAdmin(projectId) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // The emulator accepts any credential; this path exists so the script can
    // be tested end to end without a real key.
    admin.initializeApp({ projectId });
    return 'emulator';
  }
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(inline)), projectId });
    return 'service account (inline)';
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
    return 'application default credentials';
  }
  throw new Error(
    'No credentials. Set FIREBASE_SERVICE_ACCOUNT (inline JSON key), ' +
    'GOOGLE_APPLICATION_CREDENTIALS (path to one), or FIRESTORE_EMULATOR_HOST.'
  );
}

// Firestore hands back Timestamp/GeoPoint/DocumentReference objects that
// JSON.stringify would flatten into something unrestorable. Tag them instead,
// so a future restore can tell a timestamp from a map that happens to have
// _seconds in it.
function serialize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof admin.firestore.Timestamp) {
    return { __type__: 'timestamp', value: value.toDate().toISOString() };
  }
  if (value instanceof admin.firestore.GeoPoint) {
    return { __type__: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof admin.firestore.DocumentReference) {
    return { __type__: 'ref', path: value.path };
  }
  if (Buffer.isBuffer(value)) return { __type__: 'bytes', base64: value.toString('base64') };
  if (Array.isArray(value)) return value.map(serialize);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
  return out;
}

(async () => {
  const projectId = arg('project', process.env.GCLOUD_PROJECT || 'arrowflow-8d6a8');
  const outRoot = arg('out', 'backups');
  const how = initAdmin(projectId);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(outRoot, stamp);
  fs.mkdirSync(dir, { recursive: true });

  const db = admin.firestore();
  const summary = { project: projectId, startedAt: new Date().toISOString(), collections: {} };
  let total = 0;

  for (const name of COLLECTIONS) {
    const snap = await db.collection(name).get();
    const docs = {};
    snap.forEach(doc => { docs[doc.id] = serialize(doc.data()); });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
    summary.collections[name] = snap.size;
    total += snap.size;
    console.log(`  ${name}: ${snap.size} document(s)`);
  }

  summary.finishedAt = new Date().toISOString();
  summary.totalDocuments = total;
  summary.credentials = how;
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(summary, null, 2));

  console.log(`\nBacked up ${total} document(s) from ${projectId} via ${how}`);
  console.log(`-> ${dir}`);

  // An empty backup is far more likely to mean broken credentials or a wrong
  // project than a genuinely empty database, and a silent success would let
  // that rot unnoticed until the day someone needs to restore.
  if (total === 0 && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('\nERROR: every collection came back empty - check the credentials and project id.');
    process.exit(1);
  }
  process.exit(0);
})().catch(err => {
  console.error('Backup failed:', err.message);
  process.exit(1);
});
