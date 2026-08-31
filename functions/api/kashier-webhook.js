/**
 * ============================================================================
 * functions/api/kashier-webhook.js — Route: /api/kashier-webhook
 * ============================================================================
 * ⚠️ SCAFFOLD, NOT VERIFIED. Mirrors fawaterak-webhook.js's structure (same
 * finalizePendingPayment pipeline) so this is a small diff once it's real —
 * but the signature-verification method and field names below are
 * PLACEHOLDERS. I don't have access to Kashier's real webhook docs (behind a
 * merchant login), so this intentionally does NOT verify any signature yet
 * and logs a loud warning instead of pretending to be secure.
 *
 * Before going live with real payments through Kashier:
 *   1. Log into the Kashier merchant dashboard → find their webhook/redirect
 *      signature docs (method — HMAC? which hash? which fields are signed?
 *      which header or body field carries the signature?).
 *   2. Replace the TODO block below with the real verification, following
 *      the exact pattern fawaterak-webhook.js uses (hmacHex + timingSafeEqual
 *      are already available, imported from payment.js).
 *   3. Replace `data.TODO_*` field reads with Kashier's real payload shape —
 *      set this URL in the Kashier dashboard's webhook config once confirmed.
 * Until step 2 is done, do NOT rely on this endpoint for real money — anyone
 * could POST a fake "paid" event to it.
 * ============================================================================
 */
import { finalizePendingPayment } from './payment.js';

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') return new Response('OK', { status: 200 });

    let data;
    try {
        data = await request.json();
    } catch (_) {
        return new Response('OK', { status: 200 });
    }

    try {
        if (env.KASHIER_API_KEY) {
            // TODO: real signature verification goes here once confirmed —
            // see fawaterak-webhook.js for the hmacHex + timingSafeEqual pattern.
            console.warn('[KashierWebhook] Signature verification NOT implemented yet — see header note. Do not use in production until this is filled in.');
        } else {
            console.warn('[KashierWebhook] KASHIER_API_KEY not set — demo mode only.');
        }

        // TODO: confirm the real field names Kashier sends for the merchant
        // order id and payment id — these are placeholders.
        const orderId   = data.merchantOrderId || data.orderId || null;
        const paymentId = data.paymentId || data.transactionId || null;

        if (!orderId) {
            console.error('[KashierWebhook] no orderId in payload:', JSON.stringify(data));
            return new Response('OK', { status: 200 });
        }

        const result = await finalizePendingPayment(orderId, env, { paymentId, method: 'kashier' });
        console.log('[KashierWebhook] processed:', JSON.stringify(result));
    } catch (err) {
        console.error('[KashierWebhook] Error:', err.message);
        return new Response('Server error', { status: 500 });
    }

    return new Response('OK', { status: 200 });
}
