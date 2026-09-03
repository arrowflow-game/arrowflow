# Backing up Firestore

Player progress lives in one Firestore database with no copy anywhere else. A bad rules deploy, a stray script, or a deleted collection is permanent — and this has already come close once, when a test overwrote a live cloud save (recovered only because a local copy happened to exist).

Firestore's own managed scheduled backups need the **Blaze** plan. This project is on Spark, so the backup here reads the documents instead, which is free-tier.

## What runs

`.github/workflows/backup-firestore.yml` runs daily at 03:00 UTC (10:00 Bangkok) and on demand, exporting `players`, `levelBests`, `saves` and `verifiedPurchases` to timestamped JSON and attaching it to the run as an artifact kept for 90 days.

```bash
npm run backup          # locally, needs credentials (below)
npm run test:backup     # verifies the exporter against the emulator
```

## One-time setup

The workflow needs a service-account key, which only you can create:

1. **Firebase Console → Project settings → Service accounts → Generate new private key.** A JSON file downloads.
2. **GitHub → repo Settings → Secrets and variables → Actions → New repository secret.**
   Name it `FIREBASE_SERVICE_ACCOUNT` and paste the **entire contents** of that JSON file.
3. Delete the downloaded file. It grants full admin access to the project — treat it like the signing keystore.
4. Run the workflow once by hand (Actions → Backup Firestore → Run workflow) to confirm it works before relying on the schedule.

Until step 2 is done the workflow fails immediately with a clear message, rather than silently producing an empty backup.

## Running it locally

```bash
# Windows (Git Bash)
GOOGLE_APPLICATION_CREDENTIALS=/c/path/to/key.json npm run backup
```

Output lands in `backups/<timestamp>/`, which is gitignored — it contains real player data and must never be committed.

## What the format preserves

A naive `JSON.stringify` of a Firestore document turns a `Timestamp` into `{_seconds, _nanoseconds}` or worse, and loses the distinction between that and an ordinary map. The exporter tags the types that need it:

```json
{ "updatedAt": { "__type__": "timestamp", "value": "2026-09-03T02:00:00.000Z" } }
```

`geopoint`, `ref` and `bytes` are tagged the same way. Nested maps and arrays are preserved as-is. `tools/backup-firestore.test.js` checks each of these against the emulator.

## Restoring

There is deliberately no automated restore. A restore is rare, irreversible, and always needs a human decision about *what* to put back — a whole collection, or one player's document. Read the JSON, and write what you need with the Admin SDK:

```js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const docs = require('./backups/<stamp>/saves.json');
// Restore ONE player rather than the whole collection unless you are certain:
await admin.firestore().doc('saves/<uid>').set(revive(docs['<uid>']));
```

`revive()` is the inverse of the tagging above: turn `{__type__: 'timestamp'}` back into `admin.firestore.Timestamp.fromDate(new Date(value))`.

## If you later move to Blaze

Firestore's managed backups become available and are better for disaster recovery: point-in-time recovery, no key to leak, no scheduled job to rot. Set them up with `gcloud firestore backups schedules create` and keep this workflow as an offsite copy — it produces plain JSON readable without any Google tooling, which a managed backup does not.
