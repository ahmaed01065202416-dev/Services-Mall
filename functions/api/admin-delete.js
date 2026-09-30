/**
 * functions/api/admin-delete.js — Admin-only destructive deletes
 * ============================================================================
 * Deletes an order (Firestore) and/or its chat (Realtime Database) on the
 * admin's behalf, running with the service account's own credentials
 * (see functions/_shared/gcp.js) so it bypasses both Firestore's and RTDB's
 * security rules entirely.
 *
 * WHY THIS HAS TO GO THROUGH THE SERVER, NOT THE BROWSER DIRECTLY:
 * - Firestore's firestore.rules already has `allow delete: if isAdmin();`
 *   on /orders/{orderId}, so an admin COULD delete the order doc straight
 *   from the browser with their own ID token.
 * - But database.rules.json (Realtime Database) has no isAdmin() concept at
 *   all — every rule there only ever checks "is this exact user the
 *   buyer/seller of THIS exact chat". There's no way to carve out an
 *   RTDB-rules exception for admins without opening a hole any signed-in
 *   user could also fit through. Going through the server with the service
 *   account's OAuth token sidesteps RTDB rules entirely — so the ONLY gate
 *   that matters is the ID-token + ADMIN_UIDS check below.
 * - Doing the order delete here too (not from the browser) means both the
 *   Firestore doc and the RTDB chat get cleaned up together in one request,
 *   instead of the browser doing one and silently leaving the other behind.
 *
 * Required env vars: FIREBASE_PROJECT_ID, FIREBASE_SERVICE_ACCOUNT,
 * ADMIN_UIDS (comma-separated Firebase uids), FIREBASE_DATABASE_URL (optional
 * override — see rtdbBase() in _shared/gcp.js).
 */
import { verifyIdToken, fsGet, fsDelete, fsCreate, rtdbDelete } from '../_shared/gcp.js';

function json(statusCode, headers, obj) {
  return new Response(JSON.stringify(obj), { status: statusCode, headers });
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

  try {
    // ── Auth: a real Firebase ID token, not just a self-reported uid string ──
    // This endpoint is irreversible (deletes data outright), so it verifies a
    // real signed Firebase ID token via verifyIdToken() — unlike ai-generate.js's
    // X-Admin-Token pattern (which trusts a bare uid string sent by the
    // browser), a destructive endpoint deserves proof the caller actually
    // controls that account, not just knowledge of its uid.
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const user = idToken ? await verifyIdToken(idToken, env) : null;
    if (!user) return json(401, CORS, { error: 'Unauthorized — missing or invalid ID token' });

    const adminUids = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (adminUids.length === 0 || !adminUids.includes(user.uid)) {
      return json(403, CORS, { error: 'Forbidden: Admin access only' });
    }

    const body = await request.json().catch(() => ({}));
    const { type, orderId } = body;
    if (!orderId) return json(400, CORS, { error: 'orderId is required' });
    if (!['order', 'chat'].includes(type)) {
      return json(400, CORS, { error: 'Invalid type — expected "order" or "chat"' });
    }

    // Fetch once up front — used both to confirm the order actually exists
    // (a clean 404 instead of a confusing partial-failure) and for the audit
    // log entry below.
    const order = await fsGet(env, `orders/${orderId}`);
    if (!order) return json(404, CORS, { error: 'Order not found' });

    if (type === 'chat') {
      await rtdbDelete(env, `chats/${orderId}`);
    } else {
      // type === 'order': delete the Firestore doc AND its RTDB chat together
      // so nothing is left orphaned on either side.
      await fsDelete(env, `orders/${orderId}`);
      await rtdbDelete(env, `chats/${orderId}`).catch(() => {}); // chat may never have existed — non-fatal
    }

    // ── Audit trail ──────────────────────────────────────────────────────
    // Irreversible admin actions should always leave a paper trail — who did
    // what, to which order, and when. Failing to write this log must never
    // block the delete itself (the delete already succeeded above), so it's
    // best-effort only.
    await fsCreate(env, 'admin_actions', {
      action: type === 'chat' ? 'delete_chat' : 'delete_order',
      orderId,
      buyerId: order.buyerId || '',
      sellerId: order.sellerId || '',
      serviceTitle: order.serviceTitle || '',
      performedBy: user.uid,
      performedByEmail: user.email || '',
      createdAt: new Date().toISOString(),
    }).catch(err => console.error('[admin-delete] audit log write failed (delete still succeeded):', err));

    return json(200, CORS, { success: true, deleted: type, orderId });
  } catch (err) {
    console.error('[admin-delete] error:', err);
    return json(500, CORS, { error: err.message || 'Internal error' });
  }
}
