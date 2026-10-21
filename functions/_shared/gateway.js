/**
 * functions/_shared/gateway.js — the ONE place that talks to the payment gateway for the
 * marketer program (subscriptions + dues). Everything else calls createInvoice() and never
 * mentions a provider, so changing the gateway later means rewriting this file only
 * (plus the matching webhook adapter in api/fawaterak-webhook.js).
 *
 * createInvoice(env, { amount, itemName, customer, payLoad, returnPath })
 *   → { url }            hosted payment page to redirect the user to
 *   → { simulated:true } demo mode (no key + ALLOW_SIMULATED_PAYMENTS=true)
 * Throws an Error with .status on failure.
 */
export function siteUrl(env) {
    const first = (env.SITE_URL || (env.ALLOWED_ORIGINS || '').split(',')[0] || 'https://mall-services.pages.dev').trim();
    return first.replace(/\/+$/, '');
}
function fail(status, message) { const e = new Error(message); e.status = status; return e; }

export async function createInvoice(env, { amount, itemName, customer, payLoad, returnPath }) {
    const price = Number(amount);
    if (!(price > 0)) throw fail(400, 'مبلغ غير صالح');
    if (!env.FAWATERAK_API_KEY) {
        if (env.ALLOW_SIMULATED_PAYMENTS === 'true') return { simulated: true };
        throw fail(500, 'بوابة الدفع غير مفعّلة');
    }
    const origin = siteUrl(env), back = `${origin}/?mkt_payment=`;
    const res = await fetch(`${env.FAWATERAK_BASE_URL || 'https://app.fawaterk.com'}/api/v2/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.FAWATERAK_API_KEY}` },
        body: JSON.stringify({
            cartTotal: price, currency: 'EGP',
            customer: { first_name: customer.firstName || 'Marketer', last_name: customer.lastName || 'N/A', email: customer.email || '', phone: customer.phone || '' },
            cartItems: [{ name: itemName, price, quantity: 1 }],
            payLoad,
            redirectionUrls: {
                successUrl: `${back}success#${returnPath || 'my-store'}`, failUrl: `${back}failed#${returnPath || 'my-store'}`,
                pendingUrl: `${back}pending#${returnPath || 'my-store'}`, webhookUrl: `${origin}/api/fawaterak-webhook`,
            },
            sendEmail: false, sendSMS: false,
        }),
    });
    let data = {}; try { data = await res.json(); } catch (_) {}
    if (data.status !== 'success' || !data.data || !data.data.url) throw fail(502, data.message || 'تعذر إنشاء فاتورة الدفع');
    return { url: data.data.url };
}
