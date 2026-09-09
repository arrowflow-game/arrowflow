/**
 * Warns before the backup's service-account key expires.
 *
 * The key pasted into FIREBASE_SERVICE_ACCOUNT was created with a 90-day
 * expiry. When it lapses the daily backup starts failing, and a backup nobody
 * is watching fails quietly - which is the same as having no backup at all,
 * discovered at the worst possible moment.
 *
 * The expiry date is deliberately NOT hardcoded here: a constant would have to
 * be edited on every rotation, and the one time someone forgets is exactly the
 * time it matters. Instead the key is used to ask IAM about itself, so this
 * stays correct through any number of rotations with no maintenance.
 *
 * Never fails the run. A backup that works must not be reported as broken
 * because a secondary permission check could not be made - the export step
 * that follows is the real signal.
 *
 * Usage: node tools/check-key-expiry.js
 */
const fs = require('fs');
const admin = require('firebase-admin');

const WARN_DAYS = 30;   // still comfortable - a nudge in the run summary
const ALARM_DAYS = 10;  // rotate now; below this it is an annotation, not a note

function loadKey() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline) return JSON.parse(inline);
  const p = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return null;
}

// GitHub renders ::warning:: / ::error:: as annotations on the run, which is
// what makes this impossible to scroll past. Locally they are just lines.
function say(level, message) {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${message}`);
  else console.log(`[${level}] ${message}`);
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n');
  }
}

async function main() {
  const key = loadKey();
  if (!key) {
    console.log('No service-account key in the environment - nothing to check.');
    return;
  }

  // Scoped through firebase-admin rather than a second auth library: it is
  // already a dependency, and cert() credentials carry cloud-platform.
  const app = admin.initializeApp({ credential: admin.credential.cert(key) }, 'key-expiry');
  let token;
  try {
    token = (await app.options.credential.getAccessToken()).access_token;
  } catch (e) {
    say('warning', `Could not mint a token to check key expiry: ${e.message}`);
    return;
  }

  const url = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${
    encodeURIComponent(key.client_email)}/keys/${encodeURIComponent(key.private_key_id)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    // Expected when the key's own account lacks iam.serviceAccountKeys.get,
    // which is common and not worth granting extra permissions for. Say so
    // once, plainly, so nobody mistakes silence for "the key is fine".
    const body = await res.text();
    say('warning',
      `Cannot read this key's expiry from IAM (HTTP ${res.status}). ` +
      'Check it by hand in Google Cloud Console -> IAM & Admin -> Service Accounts -> Keys. ' +
      `Detail: ${body.slice(0, 200)}`);
    return;
  }

  const info = await res.json();
  if (!info.validBeforeTime) {
    console.log('This key has no expiry set.');
    return;
  }

  // Google returns year 9999 for keys created without an expiry date.
  const expires = new Date(info.validBeforeTime);
  if (expires.getUTCFullYear() >= 9999) {
    console.log('This key never expires.');
    return;
  }

  const days = Math.floor((expires - Date.now()) / 86400000);
  const when = expires.toISOString().slice(0, 10);
  const line = `Backup service-account key expires ${when} (${days} days left).`;

  summary(`### Backup credentials\n${line}`);
  if (days <= ALARM_DAYS) {
    say('error', `${line} Rotate it now - see docs/firestore-backup.md. ` +
      'When it lapses the daily backup stops and player saves have no copy anywhere.');
  } else if (days <= WARN_DAYS) {
    say('warning', `${line} Rotate it soon - see docs/firestore-backup.md.`);
  } else {
    console.log(line);
  }
}

main().catch(e => {
  // Same rule as above: a broken checker must never mask a working backup.
  say('warning', `Key expiry check failed: ${e && e.message}`);
});
