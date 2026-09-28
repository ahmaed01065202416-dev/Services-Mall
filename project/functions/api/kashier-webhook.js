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
        // ⚠️ CRITICAL FIX (found in audit): this endpoint used to finalize
        // ("mark paid") whatever pending order id was in the POST body no
        // matter what — with or without KASHIER_API_KEY set — because no
        // signature verification is implemented yet. That means anyone who
        // could see/guess a pending order id could POST straight to this URL
        // and get it marked paid for free. Since real signature verification
        // isn't wired in (see header note), the only safe behavior until it
        // is: refuse to finalize anything here at all.
        console.error('[KashierWebhook] Blocked — signature verification not implemented yet (see file header). Refusing to finalize any payment through this endpoint until it is.');
        return new Response('Not implemented', { status: 501 });
    } catch (err) {
        console.error('[KashierWebhook] Error:', err.message);
        return new Response('Server error', { status: 500 });
    }
}
