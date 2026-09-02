/* ============================================
   ArrowFlow 3D — functions/index.js
   Server-side Google Play purchase verification.

   WHY THIS EXISTS
   Until now every real-money entitlement was granted purely on the word of the
   client: js/iap.js called the billing plugin, the plugin's promise resolved,
   and the app wrote the entitlement straight into localStorage. That is exactly
   the shape the common "fake billing" patcher apps (Lucky Patcher and friends)
   attack - they don't need root or a memory editor, they just stand in for the
   Play Store and hand the app a forged success response. This endpoint closes
   that door by asking Google itself whether a given purchase token is real.

   WHAT IT DOES NOT DO
   It does not make entitlements server-authoritative. Progress and purchases
   still live in the player's own localStorage (and, once linked, their own
   saves/{uid} cloud-save doc), so anyone willing to edit that storage directly
   can still grant themselves things. Fixing that would mean moving the whole
   economy onto the server - a much larger change than this, and not what this
   endpoint is for. The goal here is narrower and worth stating plainly: raise
   the cost of the ONE cheat that currently takes a single tap.

   PROTOCOL
     POST  (Authorization: Bearer <Firebase ID token>)
     body  { productId: string, purchaseToken: string }
     ->    200 { status: "valid" }
           200 { status: "invalid", reason: "..." }
           503 { status: "unknown" }   (our fault - client should retry later)

   The three-state answer is deliberate and the client depends on it: only a
   confident "invalid" ever revokes anything. Anything we can't answer (Google
   API down, credentials misconfigured, this function not deployed at all) is
   "unknown", and the client keeps the purchase and retries on a later launch.
   A paying customer must never lose what they paid for because our backend had
   a bad day.
   ============================================ */

const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { GoogleAuth } = require('google-auth-library');

admin.initializeApp();

const PACKAGE_NAME = 'com.arrowflowgame.puzzle';

// Application Default Credentials - on Cloud Functions this is the project's
// own service account, which must be granted access to this app in Play Console
// (Play Console -> Users and permissions -> invite the service account email,
// with "View financial data, orders, and cancellation survey responses" on this
// app). No key file is stored anywhere; see functions/README.md for the setup.
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/androidpublisher'] });

// Google Play Billing's Purchase.PurchaseState, as reported by the Play
// Developer API (note: NOT the same numbering the on-device billing client
// uses - here 0 is the purchased state, not 1).
const PURCHASE_STATE_PURCHASED = 0;

async function askGooglePlay(productId, purchaseToken) {
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}` +
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  // 404/410 = Google has never heard of this token for this product, which is
  // precisely what a forged purchase looks like. Any other non-OK status is our
  // problem (auth misconfigured, quota, outage), not evidence against the player.
  if (res.status === 404 || res.status === 410) return { verdict: 'invalid', reason: 'unknown_token' };
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`androidpublisher ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (data.purchaseState !== PURCHASE_STATE_PURCHASED) {
    // 1 = cancelled/refunded, 2 = pending (e.g. cash payment not completed).
    // Neither is a purchase this player currently holds.
    return { verdict: 'invalid', reason: `purchase_state_${data.purchaseState}` };
  }
  return { verdict: 'valid' };
}

// Records the token against the uid that redeemed it, and refuses a token that
// some OTHER account already redeemed. Without this, one genuine purchase
// receipt could be shared around and replayed by any number of accounts - the
// token would verify against Google every single time, because it really is a
// real purchase; it just isn't THIS player's.
async function claimToken(uid, productId, purchaseToken) {
  const ref = admin.firestore().collection('verifiedPurchases').doc(purchaseToken);
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      // Re-verifying one's own purchase is normal and expected - the client
      // retries any verification it couldn't complete earlier (see js/iap.js's
      // pending sweep), so the same token legitimately arrives more than once.
      if (snap.data().uid === uid) return { verdict: 'valid' };
      return { verdict: 'invalid', reason: 'token_belongs_to_another_account' };
    }
    tx.set(ref, {
      uid,
      productId,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { verdict: 'valid' };
  });
}

exports.verifyPurchase = onRequest({ region: 'us-central1', cors: true }, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ status: 'invalid', reason: 'method' });

  try {
    const header = req.get('Authorization') || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) return res.status(401).json({ status: 'invalid', reason: 'no_auth' });

    let uid;
    try {
      uid = (await admin.auth().verifyIdToken(idToken)).uid;
    } catch {
      return res.status(401).json({ status: 'invalid', reason: 'bad_auth' });
    }

    const productId = String((req.body && req.body.productId) || '');
    const purchaseToken = String((req.body && req.body.purchaseToken) || '');
    // Shape check only. There is deliberately no allowlist of product ids here:
    // Google is the authority on which products exist for this package, and it
    // rejects an unknown one on its own - a list duplicated from js/iap.js would
    // only add something new to forget to update.
    if (!/^[a-z0-9_.]{1,80}$/.test(productId) || purchaseToken.length < 10 || purchaseToken.length > 2000) {
      return res.status(400).json({ status: 'invalid', reason: 'bad_request' });
    }

    const google = await askGooglePlay(productId, purchaseToken);
    if (google.verdict !== 'valid') {
      logger.warn('purchase rejected', { uid, productId, reason: google.reason });
      return res.status(200).json({ status: 'invalid', reason: google.reason });
    }

    const claim = await claimToken(uid, productId, purchaseToken);
    if (claim.verdict !== 'valid') {
      logger.warn('purchase replay rejected', { uid, productId, reason: claim.reason });
      return res.status(200).json({ status: 'invalid', reason: claim.reason });
    }

    return res.status(200).json({ status: 'valid' });
  } catch (err) {
    // Our fault, not the player's - answer "unknown" so the client keeps the
    // purchase and asks again on a later launch (see the file header).
    logger.error('verifyPurchase failed', err);
    return res.status(503).json({ status: 'unknown' });
  }
});
