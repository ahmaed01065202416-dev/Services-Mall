/**
 * ============================================================================
 * functions/api/fawaterak-webhook.js — Route: /api/fawaterak-webhook
 * ============================================================================
 * Fawaterak calls this directly from their own server once an invoice is
 * paid (per their docs: "this web hook only fires when invoice status
 * changed to Paid"). We verify the HMAC-SHA256 signature they send, then
 * finalize the matching pending_payments record — same pattern as Paymob.
 *
 * Set this URL in Fawaterak Dashboard → Integrations → Webhook URL as a
 * fallback (we also send it per-invoice via redirectionUrls.webhookUrl,
 * which takes priority, so this works even before you paste it there).
 * ============================================================================
 */
import { finalizePendingPayment, hmacHex, timingSafeEqual } from './payment.js';
import { activateSubscriptionToken } from './subscription.js';

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
        if (env.FAWATERAK_API_KEY) {
            const queryParam = `InvoiceId=${data.invoice_id}&InvoiceKey=${data.invoice_key}&PaymentMethod=${data.payment_method}`;
            const computed = await hmacHex(env.FAWATERAK_API_KEY, queryParam, 'SHA-256');
            const provided = data.hashKey || data.hashkey || '';
            // Timing-safe comparison — a plain !== leaks timing info that can
            // theoretically help an attacker forge a valid signature byte-by-byte.
            if (!timingSafeEqual(computed, String(provided))) {
                console.error('[FawaterakWebhook] hash mismatch');
                return new Response('Invalid signature', { status: 400 });
            }
        } else {
            // No key configured yet = demo mode. We still process the webhook
            // (so the demo/dev flow works end-to-end) but this MUST have
            // FAWATERAK_API_KEY set before going live with real payments,
            // otherwise anyone could POST a fake "paid" event to this URL.
            console.warn('[FawaterakWebhook] FAWATERAK_API_KEY not set — signature NOT verified (demo mode only)');
        }

        // payLoad was set to { orderId } for a normal purchase, or
        // { subscriptionId } for a recurring subscription's first payment —
        // Fawaterak echoes it back as-is (may arrive as a JSON string or object).
        let payLoad = data.pay_load;
        if (typeof payLoad === 'string') { try { payLoad = JSON.parse(payLoad); } catch (_) { payLoad = null; } }

        if (payLoad && payLoad.subscriptionId) {
            // ⚠️ See functions/api/subscription.js header note: the exact field
            // Fawaterak uses to return a saved-card token isn't confirmed from
            // public docs, so we defensively check the common names. Whatever
            // arrives gets logged either way, so you can check real logs after
            // a test subscription and adjust this list if needed.
            const token = data.customer_token || data.customerToken || data.card_token || data.token || null;
            console.log('[FawaterakWebhook] subscription first payment for', payLoad.subscriptionId, '— token present:', !!token, token ? '' : JSON.stringify(data));
            await activateSubscriptionToken(env, payLoad.subscriptionId, token || 'UNCONFIRMED_NO_TOKEN_RECEIVED');
            return new Response('OK', { status: 200 });
        }

        const orderId = payLoad && payLoad.orderId;
        if (!orderId) {
            console.error('[FawaterakWebhook] no orderId in pay_load');
            return new Response('OK', { status: 200 });
        }

        const result = await finalizePendingPayment(orderId, env, { paymentId: data.invoice_id, method: 'fawaterak' });
        console.log('[FawaterakWebhook] processed:', JSON.stringify(result));
    } catch (err) {
        console.error('[FawaterakWebhook] Error:', err.message);
        return new Response('Server error', { status: 500 });
    }

    return new Response('OK', { status: 200 });
}
