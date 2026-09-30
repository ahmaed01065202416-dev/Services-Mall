/**
 * functions/api/link-chat-participant.js — safe chat-slot linking
 * ============================================================================
 * ⚠️ SECURITY FIX (audit finding): database.rules.json's write rule for
 * chats/{orderId}/buyerId (and .../sellerId) only ever checked
 * `newData.val() === auth.uid` — it could not also confirm that this uid is
 * genuinely the buyer/seller of that specific order, because Realtime
 * Database rules cannot read Firestore. That meant: for any order whose chat
 * slot hadn't been claimed yet (a fresh order, before either real party had
 * opened its workspace), ANY signed-in user who knew or guessed that exact
 * order ID could write their own uid into buyerId/sellerId first and read
 * every message meant for the real buyer/seller from then on.
 *
 * The fix: buyerId/sellerId are now written ONLY from here, server-side,
 * after actually checking the real order in Firestore — then written to
 * Realtime Database with the service account, which bypasses RTDB rules the
 * same way admin-delete.js's rtdbDelete does. database.rules.json's client
 * `.write` for these two fields is now `false`; js/order-workspace.js's
 * _linkChatParticipant() calls this endpoint instead of writing directly.
 */
import { verifyIdToken, fsGet, rtdbUpdate } from '../_shared/gcp.js';

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
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const auth = idToken ? await verifyIdToken(idToken, env) : null;
    if (!auth) return json(401, CORS, { error: 'Unauthorized' });

    const body = await request.json().catch(() => ({}));
    const orderId = body.orderId;
    if (!orderId || typeof orderId !== 'string' || !/^[A-Za-z0-9_\-]{1,128}$/.test(orderId)) return json(400, CORS, { error: 'orderId is required' });

    const order = await fsGet(env, `orders/${orderId}`);
    if (!order) return json(404, CORS, { error: 'Order not found' });

    const isBuyer  = order.buyerId  === auth.uid;
    const isSeller = order.sellerId === auth.uid;
    if (!isBuyer && !isSeller) return json(403, CORS, { error: 'You are not a party to this order' });

    const patch = {};
    if (isBuyer)  patch.buyerId  = order.buyerId;
    if (isSeller) patch.sellerId = order.sellerId;
    await rtdbUpdate(env, `chats/${orderId}`, patch);

    return json(200, CORS, { success: true });
  } catch (err) {
    console.error('[link-chat-participant] error:', err);
    return json(500, CORS, { error: err.message || 'Internal error' });
  }
}
