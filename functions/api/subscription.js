/**
 * ============================================================================
 * functions/api/subscription.js — Cloudflare Pages Function
 * Recurring monthly "package" services (e.g. social media management,
 * monthly site maintenance, N articles/month) using Fawaterak tokenization.
 * ============================================================================
 * ⚠️ HONEST STATUS — READ BEFORE GOING LIVE WITH REAL RECURRING CHARGES:
 *
 * The recurring CHARGE call below (createTokenizationPayRequest) is built
 * exactly per Fawaterak's published docs — request shape and HMAC signature
 * both confirmed:
 *   POST /api/v2/createTokenizationPayRequest
 *   { "order": {"amount":"1000","currency":"EGP"},
 *     "customerData": {"customer_token":"..."} }
 *   signature = HMAC-SHA256("customerUniqueId=X&customerCardToken=X", vendorKey)
 *
 * The ONE thing I could NOT confirm from public docs is the exact request
 * flag that tells Fawaterak "save this card as a token" on the very FIRST
 * (manual) payment — different gateways name this differently (save_card,
 * tokenize, enable_tokenization, etc.) and guessing wrong on a real payment
 * API is exactly the kind of thing that silently breaks billing. So:
 *
 *   subscribeAndCharge() below creates a normal one-time invoice (identical
 *   to a regular purchase) and marks the pending_payment as
 *   `awaitingTokenCapture: true`. The webhook (fawaterak-webhook.js) then
 *   checks the webhook payload for common token field names and stores
 *   whichever one Fawaterak actually sends — but until you confirm the
 *   right field with Fawaterak support/dashboard, treat the resulting
 *   subscription as "first payment collected, recurring NOT yet guaranteed
 *   to work" and check functions/api/subscription.js logs after a real test
 *   subscription before relying on this for real customers.
 *
 * Route: /api/subscription
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsCreate, fsSet, fsQuery, fsCommit, writeIncrement, writeCreate, siteOrigin, corsHeaders, isSafeDocId } from '../_shared/gcp.js';
import { hmacHex, timingSafeEqual } from './payment.js';

function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
// FIXED: emitted the raw env var, so with more than one origin configured the
// header became "https://a.com,https://b.com" and browsers rejected every
// request. ALLOWED_ORIGINS is a list — use the shared helper.
function getCORS(request, env) {
    return corsHeaders(request, env, { 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token' });
}
async function apiPost(url, body, headers = {}) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

// ── Buyer subscribes to a recurring service (first payment = card capture) ──
async function handleSubscribe(body, env, CORS, auth) {
    const { serviceId } = body;
    if (!serviceId) return json(400, CORS, { error: 'serviceId مطلوب' });

    const svc = await fsGet(env, `services/${serviceId}`);
    if (!svc) return json(404, CORS, { error: 'الخدمة غير موجودة' });
    if (!svc.recurring) return json(400, CORS, { error: 'الخدمة دي مش اشتراك شهري' });

    const amount = Number(svc.price) || 0;
    if (amount <= 0) return json(400, CORS, { error: 'سعر غير صالح' });

    const subId = crypto.randomUUID();
    await fsCreate(env, 'subscriptions', {
        buyerId: auth.uid, sellerId: svc.sellerId, serviceId,
        title: svc.title || '', amount, currency: 'EGP', interval: 'monthly',
        status: 'pending_first_payment', failedAttempts: 0,
        createdAt: new Date(),
    }, subId);

    if (!env.FAWATERAK_API_KEY) {
        // ⚠️ SECURITY FIX: this used to silently "activate immediately, no real
        // card on file" whenever FAWATERAK_API_KEY was missing, creating
        // orders + escrow rows in `payment_held` with no money ever collected.
        // payment.js (handleFawaterak) deliberately refuses to simulate a
        // charge unless ALLOW_SIMULATED_PAYMENTS === 'true', and
        // fawaterak-webhook.js enforces the same opt-in — this path was the one
        // place that skipped it. Same guard here, so a missing/typo'd gateway
        // key can no longer manufacture free orders + escrow.
        if (env.ALLOW_SIMULATED_PAYMENTS !== 'true') {
            return json(503, CORS, { error: 'Payment gateway is not configured (FAWATERAK_API_KEY missing).' });
        }
        // Demo mode — activate immediately, no real card on file.
        await fsSet(env, `subscriptions/${subId}`, {
            status: 'active', customerToken: 'DEMO_TOKEN',
            nextBillingDate: new Date(Date.now() + 30 * 86400000),
        }, true);
        return json(200, CORS, { simulated: true, subscriptionId: subId });
    }

    const base = env.FAWATERAK_BASE_URL || 'https://app.fawaterk.com';
    const user = await fsGet(env, `users/${auth.uid}`).catch(() => ({}));
    // ⚠️ CHANGED (privacy audit): phone now lives in users/{uid}/private/contact,
    // not on the main doc — see firestore.rules and js/auth.js. Falls back to
    // user.phone for any account not yet migrated (functions/api/admin-migrate-
    // private-fields.js).
    const priv = await fsGet(env, `users/${auth.uid}/private/contact`).catch(() => ({}));
    const phone = priv.phone || user.phone || '';
    const nameParts = String(user.name || 'Buyer N/A').trim().split(' ');

    // First charge — a normal hosted invoice. We ALSO record this pending
    // payment as awaiting a card token so the webhook knows to look for one
    // (see the file header note on why we don't force a specific "save
    // card" flag here yet).
    await fsCreate(env, 'pending_payments', {
        uid: auth.uid, mode: 'subscription_first_payment', subscriptionId: subId,
        currency: 'EGP', status: 'pending', method: 'fawaterak',
        total: amount, subtotal: amount, fees: 0, createdAt: new Date(),
    }, subId);

    const resp = await apiPost(`${base}/api/v2/createInvoiceLink`, {
        cartTotal: amount, currency: 'EGP',
        customer: { first_name: nameParts[0] || 'Buyer', last_name: nameParts.slice(1).join(' ') || 'N/A', email: user.email || '', phone },
        cartItems: [{ name: `اشتراك شهري: ${svc.title || ''}`, price: amount, quantity: 1 }],
        payLoad: { subscriptionId: subId },
        redirectionUrls: {
            // FIXED: built from ALLOWED_ORIGINS (a comma-separated LIST), which
            // produced an invalid URL for the gateway with >1 origin configured,
            // and a dead webhook URL whenever SITE_URL was unset. Return and
            // webhook URLs must come from SITE_URL only.
            successUrl: `${siteOrigin(env)}?subscription_success=true&sub_id=${subId}#wallet`,
            failUrl:    `${siteOrigin(env)}?subscription_success=false&sub_id=${subId}#wallet`,
            webhookUrl: `${siteOrigin(env)}/api/fawaterak-webhook`,
        },
    }, { Authorization: `Bearer ${env.FAWATERAK_API_KEY}` });

    if (resp.status !== 'success' || !resp.data?.url) {
        return json(502, CORS, { error: resp.message || 'تعذر إنشاء فاتورة الاشتراك' });
    }
    return json(200, CORS, { redirectUrl: resp.data.url, subscriptionId: subId });
}

// ── Buyer/seller cancels a subscription ───────────────────────────────────────
async function handleCancel(body, env, CORS, auth) {
    const { subscriptionId } = body;
    const sub = await fsGet(env, `subscriptions/${subscriptionId}`);
    if (!sub) return json(404, CORS, { error: 'الاشتراك غير موجود' });
    if (sub.buyerId !== auth.uid && sub.sellerId !== auth.uid) return json(403, CORS, { error: 'غير مصرح' });
    await fsSet(env, `subscriptions/${subscriptionId}`, { status: 'cancelled', cancelledAt: new Date() }, true);
    return json(200, CORS, { success: true });
}

// ── Called by fawaterak-webhook.js once the FIRST payment's token arrives ────
export async function activateSubscriptionToken(env, subscriptionId, customerToken) {
    if (!subscriptionId || !customerToken) return;
    await fsSet(env, `subscriptions/${subscriptionId}`, {
        status: 'active', customerToken,
        nextBillingDate: new Date(Date.now() + 30 * 86400000),
    }, true);
}

// ── Cron-driven: charge every subscription due today ──────────────────────────
async function handleChargeDue(env, CORS) {
    const now = new Date();
    const due = await fsQuery(env, {
        from: [{ collectionId: 'subscriptions' }],
        where: {
            compositeFilter: {
                op: 'AND',
                filters: [
                    { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'active' } } },
                    { fieldFilter: { field: { fieldPath: 'nextBillingDate' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: now.toISOString() } } },
                ],
            },
        },
    });

    const base = env.FAWATERAK_BASE_URL || 'https://app.fawaterk.com';
    const results = [];
    for (const sub of due) {
        try {
            if (!sub.customerToken || sub.customerToken === 'DEMO_TOKEN' || sub.customerToken === 'UNCONFIRMED_NO_TOKEN_RECEIVED') {
                results.push({ id: sub.id, skipped: 'demo_or_no_token' });
                await fsSet(env, `subscriptions/${sub.id}`, { nextBillingDate: new Date(Date.now() + 30 * 86400000) }, true);
                continue;
            }
            const signature = await hmacHex(env.FAWATERAK_API_KEY,
                `customerUniqueId=${sub.buyerId}&customerCardToken=${sub.customerToken}`, 'SHA-256');
            const resp = await apiPost(`${base}/api/v2/createTokenizationPayRequest`, {
                order: { amount: String(sub.amount), currency: 'EGP' },
                customerData: { customer_token: sub.customerToken },
            }, { Authorization: `Bearer ${env.FAWATERAK_API_KEY}`, 'X-Signature': signature });

            if (resp.status === 'success') {
                const orderId = crypto.randomUUID();
                await fsCommit(env, [
                    writeCreate(env, `orders/${orderId}`, {
                        serviceId: sub.serviceId, serviceTitle: sub.title,
                        buyerId: sub.buyerId, sellerId: sub.sellerId,
                        price: sub.amount, status: 'payment_held', paymentMethod: 'fawaterak_recurring',
                        subscriptionId: sub.id, escrowHeld: true, escrowAmount: sub.amount,
                        chatEnabled: true, filesEnabled: true,
                        deliveryDeadline: new Date(Date.now() + 3 * 86400000).toISOString(),
                        createdAt: new Date(), updatedAt: new Date(),
                    }),
                    writeCreate(env, `escrow/${orderId}`, {
                        orderId, buyerId: sub.buyerId, sellerId: sub.sellerId, amount: sub.amount,
                        status: 'held', method: 'fawaterak_recurring', currency: 'EGP', createdAt: new Date(),
                    }),
                ]);
                await fsSet(env, `subscriptions/${sub.id}`, {
                    nextBillingDate: new Date(Date.now() + 30 * 86400000), failedAttempts: 0, lastOrderId: orderId,
                }, true);
                results.push({ id: sub.id, ok: true, orderId });
            } else {
                const failedAttempts = (sub.failedAttempts || 0) + 1;
                const cancelled = failedAttempts >= 3;
                await fsSet(env, `subscriptions/${sub.id}`, {
                    failedAttempts, status: cancelled ? 'cancelled' : 'payment_failed',
                    lastError: resp.message || 'charge failed',
                }, true);
                await fsCreate(env, 'notifications', {
                    userId: sub.buyerId, type: 'subscription_payment_failed',
                    title: cancelled ? '❌ تم إلغاء اشتراكك' : '⚠️ فشل تجديد الاشتراك',
                    message: cancelled ? 'فشلت 3 محاولات دفع — تم إلغاء الاشتراك' : 'حاول تحديث بيانات الدفع',
                    read: false, createdAt: new Date(),
                });
                results.push({ id: sub.id, ok: false, cancelled });
            }
        } catch (err) {
            console.error('[Subscription] charge error for', sub.id, err.message);
            results.push({ id: sub.id, error: err.message });
        }
    }
    return json(200, CORS, { processed: results.length, results });
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = getCORS(request, env);
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    let body = {};
    try { body = await request.json(); } catch (_) {}
    const { action } = body;

    if (action === 'chargeDue') {
        const adminToken = request.headers.get('X-Admin-Token');
        // constant-time compare — this gate charges real recurring cards
        if (!env.ADMIN_SECRET || !timingSafeEqual(adminToken, String(env.ADMIN_SECRET))) return json(401, CORS, { error: 'Unauthorized' });
        return handleChargeDue(env, CORS);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '');
    const auth = await verifyIdToken(idToken, env);
    if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });

    // Client-supplied ids are interpolated into Firestore paths below
    // (`services/${serviceId}`, `subscriptions/${subscriptionId}`); validate
    // their shape once, before dispatch.
    for (const key of ['serviceId', 'subscriptionId']) {
        if (body[key] !== undefined && !isSafeDocId(body[key])) {
            return json(400, CORS, { error: `Invalid ${key}` });
        }
    }

    if (action === 'subscribe') return handleSubscribe(body, env, CORS, auth);
    if (action === 'cancel')    return handleCancel(body, env, CORS, auth);
    return json(400, CORS, { error: `Unknown action: ${action}` });
}
