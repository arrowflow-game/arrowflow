/**
 * Warns before the backup's service-account key expires.
 *
 * The key pasted into FIREBASE_SERVICE_ACCOUNT was created with a 90-day
 * expiry. When it lapses the daily backup starts failing, and a backup nobody
 * is watching fails quietly - which is the same as having no backup at all,
 * discovered at the worst possible moment.
 *
 * Asks IAM about the key first, so no date has to be written down anywhere and
 * the check survives any number of rotations untouched. In practice IAM usually
 * refuses (a service account does not hold `iam.serviceAccountKeys.get` on
 * itself by default, and granting it is not worth the extra permission), so
 * there is a fallback: the repo variable BACKUP_KEY_EXPIRES, a YYYY-MM-DD date
 * set when the key is created. Forgetting to update it after a rotation makes
 * this shout early rather than late, which is the right way round.
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

// Set as a GitHub repo *variable*, not a secret: it is only a date, and a
// secret would be masked in the logs, which is where this needs to be read.
function declaredExpiry() {
  const raw = (process.env.BACKUP_KEY_EXPIRES || '').trim();
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return isNaN(d) ? null : d;
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

  const expiry = (await expiryFromIam(key)) || declaredExpiry();
  if (!expiry) {
    say('warning',
      'Could not determine when the backup key expires. Set the repo variable ' +
      'BACKUP_KEY_EXPIRES (YYYY-MM-DD) to the date shown in Google Cloud Console ' +
      '-> IAM & Admin -> Service Accounts -> the account -> Keys. ' +
      'See docs/firestore-backup.md.');
    return;
  }
  report(expiry);
}

// Returns a Date, or null if IAM will not answer - the caller falls back.
async function expiryFromIam(key) {
  // Scoped through firebase-admin rather than a second auth library: it is
  // already a dependency, and cert() credentials carry cloud-platform.
  const app = admin.initializeApp({ credential: admin.credential.cert(key) }, 'key-expiry');
  let token;
  try {
    token = (await app.options.credential.getAccessToken()).access_token;
  } catch (e) {
    console.log(`Could not mint a token to ask IAM about the key: ${e.message}`);
    return null;
  }

  const url = `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${
    encodeURIComponent(key.client_email)}/keys/${encodeURIComponent(key.private_key_id)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    // Expected: a service account does not hold iam.serviceAccountKeys.get on
    // itself by default. Not a problem, just a fall through to the declared date.
    console.log(`IAM would not report this key's expiry (HTTP ${res.status}) - using BACKUP_KEY_EXPIRES instead.`);
    return null;
  }

  const info = await res.json();
  if (!info.validBeforeTime) return null;

  // Google returns year 9999 for keys created without an expiry date.
  const expires = new Date(info.validBeforeTime);
  if (expires.getUTCFullYear() >= 9999) {
    console.log('This key never expires.');
    return null;
  }
  return expires;
}

function report(expires) {
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
