/**
 * functions/api/admin-migrate-private-fields.js — one-time privacy migration
 * ============================================================================
 * Moves `phone`, `payoutMethod`, `payoutAccount` off the main `users/{uid}`
 * document (readable by ANY signed-in user — see firestore.rules) into
 * `users/{uid}/private/contact` (owner + admin only), for accounts created
 * BEFORE that change (js/auth.js and js/seller-dashboard.js already write
 * new values to the private location going forward — this endpoint only
 * needs to run once to catch up existing data).
 *
 * For each user: copies any of those 3 fields it still has on the main doc
 * into the private subdoc (never overwriting a value already saved there —
 * a user may have already re-saved their phone/payout after the code
 * change but before this migration ran), then deletes those fields from the
 * main doc so they stop being publicly readable.
 *
 * Admin-only (same ADMIN_UIDS check as admin-delete.js). Safe to run more
 * than once — already-migrated users (no phone/payoutMethod/payoutAccount
 * left on the main doc) are simply skipped.
 */
import { verifyIdToken, getAccessToken, fsGet, fsSet, fsQuery, corsHeaders } from '../_shared/gcp.js';

function json(statusCode, headers, obj) {
  return new Response(JSON.stringify(obj), { status: statusCode, headers });
}

// Firestore's REST API deletes a field by naming it in updateMask.fieldPaths
// while leaving it out of the `fields` body — there's no helper for that
// shape in _shared/gcp.js (fsSet always builds the mask from the data it's
// given), so this does the PATCH directly.
async function deleteFields(env, path, fieldNames) {
  const token = await getAccessToken(env);
  const base = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const mask = fieldNames.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const resp = await fetch(`${base}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: {} }),
  });
  const out = await resp.json().catch(() => ({}));
  if (out.error) throw new Error(out.error.message);
  return true;
}

export async function onRequest(context) {
  const { request, env } = context;
  // FIXED: emitted the raw env var, so with more than one origin configured the
  // header became "https://a.com,https://b.com" and browsers rejected every
  // request. ALLOWED_ORIGINS is a comma-separated LIST.
  const CORS = corsHeaders(request, env, { 'Access-Control-Allow-Methods': 'POST, OPTIONS' });
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const admin = idToken ? await verifyIdToken(idToken, env) : null;
    if (!admin) return json(401, CORS, { error: 'Unauthorized' });
    const adminUids = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (adminUids.length === 0 || !adminUids.includes(admin.uid)) {
      return json(403, CORS, { error: 'Forbidden: Admin access only' });
    }

    const PAGE = 300;
    let offset = 0, scanned = 0, migrated = 0, skipped = 0;
    const errors = [];

    while (true) {
      const rows = await fsQuery(env, { from: [{ collectionId: 'users' }], limit: PAGE, offset });
      if (!rows.length) break;
      offset += rows.length;

      for (const u of rows) {
        scanned++;
        const hasLegacy = u.phone !== undefined || u.payoutMethod !== undefined || u.payoutAccount !== undefined;
        if (!hasLegacy) { skipped++; continue; }
        try {
          const existingPriv = await fsGet(env, `users/${u.id}/private/contact`) || {};
          await fsSet(env, `users/${u.id}/private/contact`, {
            phone:         existingPriv.phone         || u.phone         || '',
            payoutMethod:  existingPriv.payoutMethod  || u.payoutMethod  || '',
            payoutAccount: existingPriv.payoutAccount || u.payoutAccount || '',
            updatedAt: new Date(),
          }, true);
          await deleteFields(env, `users/${u.id}`, ['phone', 'payoutMethod', 'payoutAccount']);
          migrated++;
        } catch (e) {
          // Keep the uid (the operator needs to know which document failed) but
          // not the raw Firestore error text — it embeds paths and project id.
          console.error('[admin-migrate-private-fields] doc failed:', u.id, e.message);
          errors.push({ uid: u.id, error: 'Write failed' });
        }
      }

      if (rows.length < PAGE) break; // last page
    }

    return json(200, CORS, { scanned, migrated, skipped, errors });
  } catch (err) {
    console.error('[admin-migrate-private-fields] error:', err);
    // Fixed message only — err.message from the Firestore layer embeds the
    // project id, collection paths and internal rule detail.
    return json(500, CORS, { error: 'Internal error' });
  }
}
