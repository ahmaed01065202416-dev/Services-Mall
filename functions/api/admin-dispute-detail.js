/**
 * functions/api/admin-dispute-detail.js — Admin-only full dispute view
 * ============================================================================
 * Returns everything an admin needs to fairly resolve a dispute in one call:
 * the order, the escrow record, the dispute itself (and the return request
 * behind it, if this dispute came from js/returns.js), both users' contact
 * and payout info, and the FULL chat transcript for that order.
 *
 * WHY THIS HAS TO GO THROUGH THE SERVER, NOT THE BROWSER DIRECTLY:
 * - database.rules.json (Realtime Database, where chat messages live) has no
 *   isAdmin() concept at all — every rule only checks "is this exact user
 *   the buyer/seller of THIS exact chat" (see functions/_shared/gcp.js's own
 *   comments on rtdbGet/rtdbDelete, which this reuses). There is no safe way
 *   to let an admin read someone else's chat straight from the browser with
 *   their own ID token without opening a rule hole any signed-in user could
 *   also fit through.
 * - Users' phone numbers and payout account numbers are private — Firestore
 *   already lets any signed-in user read the /users collection (needed for
 *   public profile info), so exposing phone/payout there for everyone would
 *   be its own leak. Keeping those two fields out of the general /users read
 *   path and only ever assembling them here, behind the same admin check as
 *   admin-delete.js, keeps them visible to nobody but admins resolving an
 *   actual dispute.
 *
 * Required env vars: same as admin-delete.js (FIREBASE_PROJECT_ID,
 * FIREBASE_SERVICE_ACCOUNT, ADMIN_UIDS, FIREBASE_DATABASE_URL optional).
 */
import { verifyIdToken, fsGet, fsQuery, rtdbGet } from '../_shared/gcp.js';

function json(statusCode, headers, obj) {
  return new Response(JSON.stringify(obj), { status: statusCode, headers });
}

// RTDB returns messages as an object keyed by push-id, or null if empty —
// normalize to a plain, chronologically-sorted array for the client.
function messagesToArray(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj)
    .map(id => ({ id, ...obj[id] }))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

// Only the fields an admin reviewing a dispute actually needs — never the
// whole user document (which may carry auth-provider internals etc.).
// `priv` is users/{id}/private/contact — see firestore.rules and js/auth.js;
// phone/payoutMethod/payoutAccount live there now, not on the main doc, so
// they're merged in here (server-side, service account, bypasses rules).
function publicPick(u, priv) {
  if (!u) return null;
  priv = priv || {};
  return {
    id: u.id, name: u.name || u.displayName || '', email: u.email || '',
    phone: priv.phone || u.phone || '', role: u.role || '',
    payoutMethod: priv.payoutMethod || u.payoutMethod || '',
    payoutAccount: priv.payoutAccount || u.payoutAccount || '',
  };
}

export async function onRequest(context) {
  const { request, env } = context;
  const CORS = {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (request.method !== 'GET') return json(405, CORS, { error: 'Method not allowed' });

  try {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const user = idToken ? await verifyIdToken(idToken, env) : null;
    if (!user) return json(401, CORS, { error: 'Unauthorized — missing or invalid ID token' });

    const adminUids = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (adminUids.length === 0 || !adminUids.includes(user.uid)) {
      return json(403, CORS, { error: 'Forbidden: Admin access only' });
    }

    const url = new URL(request.url);
    const disputeId = url.searchParams.get('disputeId');
    if (!disputeId) return json(400, CORS, { error: 'disputeId is required' });

    const dispute = await fsGet(env, `disputes/${disputeId}`);
    if (!dispute) return json(404, CORS, { error: 'Dispute not found' });

    const orderId = dispute.orderId;
    const [order, escrow, buyerUser, sellerUser, buyerPriv, sellerPriv, messagesRaw] = await Promise.all([
      orderId ? fsGet(env, `orders/${orderId}`) : null,
      orderId ? fsGet(env, `escrow/${orderId}`) : null,
      dispute.buyerId  ? fsGet(env, `users/${dispute.buyerId}`)  : null,
      dispute.sellerId ? fsGet(env, `users/${dispute.sellerId}`) : null,
      dispute.buyerId  ? fsGet(env, `users/${dispute.buyerId}/private/contact`).catch(() => null)  : null,
      dispute.sellerId ? fsGet(env, `users/${dispute.sellerId}/private/contact`).catch(() => null) : null,
      orderId ? rtdbGet(env, `chats/${orderId}/messages`).catch(() => null) : null,
    ]);

    // If this dispute was opened by js/returns.js (a seller-approved product
    // return), pull the original return request too so the admin sees the
    // buyer's stated reason/photo, not just the one-line dispute summary.
    let returnRequest = null;
    if (dispute.returnId) {
      returnRequest = await fsGet(env, `returns/${dispute.returnId}`).catch(() => null);
    } else if (orderId) {
      const rows = await fsQuery(env, {
        from: [{ collectionId: 'returns' }],
        where: { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: orderId } } },
        limit: 1,
      }).catch(() => []);
      returnRequest = rows[0] || null;
    }

    return json(200, CORS, {
      dispute,
      order,
      escrow,
      returnRequest,
      buyer:  publicPick(buyerUser, buyerPriv),
      seller: publicPick(sellerUser, sellerPriv),
      messages: messagesToArray(messagesRaw),
    });
  } catch (err) {
    console.error('[admin-dispute-detail] error:', err);
    return json(500, CORS, { error: err.message || 'Internal error' });
  }
}
