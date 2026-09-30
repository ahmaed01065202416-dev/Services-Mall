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
import { verifyIdToken, fsGet, rtdbUpdate, corsHeaders, isSafeDocId } from '../_shared/gcp.js';

function json(statusCode, headers, obj) {
  return new Response(JSON.stringify(obj), { status: statusCode, headers });
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
    // Operator-facing diagnostics. This endpoint used to answer every failure
    // with a bare `500 {error:'Internal error'}` and log nothing identifying the
    // cause, so "the chat is empty and the console shows 500" was undiagnosable
    // from the outside. The codes below name the *class* of misconfiguration
    // only - never a path, URL, project id or token - which is enough to tell
    // "the env vars are missing on this environment" apart from "the chat write
    // itself is failing", without leaking internals.
    if (!env.FIREBASE_SERVICE_ACCOUNT || !env.FIREBASE_PROJECT_ID) {
      console.error('[link-chat-participant] not configured: FIREBASE_PROJECT_ID=%s FIREBASE_SERVICE_ACCOUNT=%s',
        env.FIREBASE_PROJECT_ID ? 'set' : 'MISSING',
        env.FIREBASE_SERVICE_ACCOUNT ? 'set' : 'MISSING');
      return json(500, CORS, { error: 'Chat is not configured on this deployment', code: 'SERVER_NOT_CONFIGURED' });
    }

    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const auth = idToken ? await verifyIdToken(idToken, env) : null;
    if (!auth) return json(401, CORS, { error: 'Unauthorized' });

    const body = await request.json().catch(() => ({}));
    const orderId = body.orderId;
    if (!orderId || typeof orderId !== 'string') return json(400, CORS, { error: 'orderId is required' });
    // `orderId` goes straight into the Firestore and RTDB paths below; a `/`
    // in it (e.g. `../users/<uid>`) would walk out of the intended node.
    if (!isSafeDocId(orderId)) return json(400, CORS, { error: 'Invalid orderId' });

    const order = await fsGet(env, `orders/${orderId}`);
    if (!order) return json(404, CORS, { error: 'Order not found' });

    const isBuyer  = order.buyerId  === auth.uid;
    const isSeller = order.sellerId === auth.uid;
    if (!isBuyer && !isSeller) return json(403, CORS, { error: 'You are not a party to this order' });

    // FIXED: this used to write ONLY the calling party's own slot, so the other
    // party stayed unlinked until they happened to open the workspace
    // themselves. Both the .read and .write rules in database.rules.json are an
    // OR over buyerId/sellerId, so a half-linked chat meant one side could read
    // while the other got PERMISSION_DENIED - and for a conversation only the
    // buyer ever opens, the seller's side was permanently unreadable.
    //
    // The values written here are NOT client-supplied: they come from the real
    // order document in Firestore, and the caller has just been proven to be one
    // of its parties. So writing both at once is safe, and one successful call
    // now fully links the conversation for BOTH sides.
    // rtdbUpdate() issues a PATCH, not a PUT, so chats/{orderId}/messages and
    // everything else already under the node is left untouched.
    const patch = {};
    if (typeof order.buyerId  === 'string' && order.buyerId)  patch.buyerId  = order.buyerId;
    if (typeof order.sellerId === 'string' && order.sellerId) patch.sellerId = order.sellerId;
    if (!Object.keys(patch).length) {
      return json(409, CORS, { error: 'Order has no linked participants', code: 'NO_PARTICIPANTS' });
    }

    try {
      await rtdbUpdate(env, `chats/${orderId}`, patch);
    } catch (rtdbErr) {
      // Kept separate from the outer catch so a working Firestore config with a
      // broken Realtime Database config is distinguishable in the logs.
      console.error('[link-chat-participant] RTDB write failed for order %s: %s', orderId, rtdbErr && rtdbErr.message);
      return json(500, CORS, { error: 'Chat storage is not reachable', code: 'CHAT_WRITE_FAILED' });
    }

    return json(200, CORS, { success: true });
  } catch (err) {
    console.error('[link-chat-participant] error:', err);
    // Fixed message only - err.message from the Firestore/RTDB layer embeds the
    // database URL and internal path detail.
    return json(500, CORS, { error: 'Internal error', code: 'INTERNAL' });
  }
}
