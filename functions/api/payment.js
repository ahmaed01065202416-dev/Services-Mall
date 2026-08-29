/**
 * ============================================================================
 * functions/api/payment.js — Cloudflare Pages Function
 * Handles payment SERVER-SIDE (keys never exposed to frontend)
 * Gateway: Fawaterak ONLY (all other gateways removed per product decision).
 * ============================================================================
 * ⚠️  SECURITY MODEL:
 *   The browser NEVER decides what an order costs and NEVER writes a "paid"
 *   order to Firestore directly. It only sends WHICH services it wants to buy.
 *   This server looks up the real price in Firestore, computes the real total,
 *   and is the only thing allowed to create an order marked as paid — only
 *   once Fawaterak's server-to-server webhook confirms the transaction
 *   (see functions/api/fawaterak-webhook.js).
 * ============================================================================
 * ⚠️  ADD YOUR KEYS IN CLOUDFLARE DASHBOARD → Pages → Settings → Environment Variables
 *   FAWATERAK_API_KEY, FAWATERAK_BASE_URL (optional)
 * Route: /api/payment
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsCreate, fsSet, fsCommit, fsQuery, writeIncrement, writeUpdate, writeCreate } from '../_shared/gcp.js';

// ── Web Crypto helpers (Node's `crypto`/`https` don't exist in Workers) ──────
async function hmacHex(secret, message, hash = 'SHA-512') {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function apiPost(url, bodyData, extraHeaders = {}) {
    const isString = typeof bodyData === 'string';
    const payload = isString ? bodyData : JSON.stringify(bodyData);
    const headers = {
        'Content-Type': isString ? 'application/x-www-form-urlencoded' : 'application/json',
        ...extraHeaders,
    };
    const res = await fetch(url, { method: 'POST', headers, body: payload });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}

// ── CORS ───────────────────────────────────────────────────────────────────
function getCORS(request, env) {
    const origin = request.headers.get('origin') || request.headers.get('Origin') || '';
    const allowedOrigins = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allowedOrigin = allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] || '*');
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
        'Vary': 'Origin',
    };
}

function json(statusCode, headers, obj) {
    return new Response(JSON.stringify(obj), { status: statusCode, headers });
}

// ── Simple fixed-window rate limiter (1-minute buckets, stored in Firestore) ─
async function _checkRateLimit(env, key, maxPerMinute) {
    const bucket = Math.floor(Date.now() / 60000);
    const docId = `${key}_${bucket}`;
    try {
        const existing = await fsGet(env, `rate_limits/${docId}`);
        if (!existing) {
            await fsCreate(env, 'rate_limits', { count: 1, createdAt: new Date() }, docId).catch(() => {});
            return true;
        }
        if ((existing.count || 0) >= maxPerMinute) return false;
        await fsCommit(env, [writeIncrement(env, `rate_limits/${docId}`, 'count', 1)]);
        return true;
    } catch (e) {
        console.warn('[RateLimit] check failed, allowing request:', e.message);
        return true; // fail open — don't block real payments over a rate-limit bug
    }
}

// ── Main entry point (Cloudflare Pages Functions) ────────────────────────────
export async function onRequest(context) {
    const { request, env } = context;
    const CORS = getCORS(request, env);

    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    let body;
    try {
        body = await request.json();
    } catch (_) {
        return json(400, CORS, { error: 'Invalid JSON' });
    }

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const { action } = body;
    console.log(`[Payment] Action: ${action} | IP: ${ip}`);

    // Actions that touch money/orders require a verified Firebase ID token.
    const AUTH_REQUIRED = new Set(['fawaterakPay', 'releaseEscrow', 'requestWithdrawal', 'resolveDispute']);
    let auth = null;
    if (AUTH_REQUIRED.has(action)) {
        const authHeader = request.headers.get('Authorization') || '';
        const idToken = authHeader.replace(/^Bearer\s+/i, '');
        auth = await verifyIdToken(idToken, env);
        if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول لإتمام الدفع' });
        if (!auth.emailVerified) {
            return json(403, CORS, { error: 'لازم تفعّل بريدك الإلكتروني الأول — تحقق من صندوق الوارد بتاعك', code: 'EMAIL_NOT_VERIFIED' });
        }

        const overIp = !(await _checkRateLimit(env, `ip_${ip.replace(/[:.]/g, '_')}`, 20));
        const overUser = !(await _checkRateLimit(env, `uid_${auth.uid}`, 20));
        if (overIp || overUser) {
            return json(429, CORS, { error: 'محاولات كتير في وقت قصير — استنى دقيقة وحاول تاني' });
        }
    }

    try {
        switch (action) {
            case 'fawaterakPay':   return await handleFawaterak(body, env, CORS, auth);
            case 'releaseEscrow':  return await handleReleaseEscrow(body, env, CORS, auth);
            case 'resolveDispute': return await handleResolveDispute(body, env, CORS, auth);
            case 'requestWithdrawal': return await handleRequestWithdrawal(body, env, CORS, auth);
            case 'checkKeys':      return handleCheckKeys(env, CORS);
            case 'autoReleaseStale': {
                // Cron-only (mirrors subscription.js chargeDue) — not in AUTH_REQUIRED
                // because cron has no Firebase user, just the admin secret.
                const adminToken = request.headers.get('X-Admin-Token');
                if (!env.ADMIN_SECRET || adminToken !== env.ADMIN_SECRET) return json(401, CORS, { error: 'Unauthorized' });
                return await handleAutoReleaseStale(env, CORS);
            }
            default:
                return json(400, CORS, { error: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error(`[Payment] Error in ${action}:`, err.message);
        return json(500, CORS, { error: err.message || 'Internal server error' });
    }
}

// ── Price resolution: NEVER trust an amount coming from the browser. ─────────
async function resolveOrderItems(items, env) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('لا يوجد عناصر للدفع');
    const resolved = [];
    let subtotal = 0;
    for (const it of items) {
        if (!it || !it.serviceId) throw new Error('عنصر غير صالح في السلة');
        const svc = await fsGet(env, `services/${it.serviceId}`);
        if (!svc) throw new Error(`الخدمة غير موجودة: ${it.serviceId}`);
        const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
        const price = Number(svc.price) || 0;
        subtotal = Number((subtotal + price * qty).toFixed(2));
        resolved.push({
            serviceId: it.serviceId,
            title: svc.title || '',
            image: (svc.images && svc.images[0]) || svc.image || '',
            price, quantity: qty,
            deliveryDays: svc.deliveryDays || 3,
            sellerId: svc.sellerId || '',
            sellerName: svc.sellerName || '',
        });
    }
    const cfg = await getPlatformConfig(env);
    const fees = calcFee(subtotal, cfg);
    const total = Number((subtotal + fees).toFixed(2));
    if (total <= 0) throw new Error('قيمة الطلب غير صحيحة');
    return { resolved, subtotal, fees, total };
}

// ── Pay for an EXISTING order (custom request flow) ──────────────────────────
async function resolveExistingOrder(orderId, auth, env) {
    const order = await fsGet(env, `orders/${orderId}`);
    if (!order) throw new Error('الطلب غير موجود');
    if (order.buyerId !== auth.uid) throw new Error('غير مصرح لك بدفع هذا الطلب');
    if (order.status !== 'accepted') throw new Error('لسه البائع مايوافقش على الطلب ده');
    if (order.paymentStatus && order.paymentStatus !== 'no_payment') throw new Error('تم دفع هذا الطلب بالفعل');

    const svc = await fsGet(env, `services/${order.serviceId}`);
    if (!svc) throw new Error('الخدمة غير موجودة');
    const price = Number(svc.price) || 0;
    const cfg = await getPlatformConfig(env);
    const fees = calcFee(price, cfg);
    const total = Number((price + fees).toFixed(2));
    if (total <= 0) throw new Error('قيمة الطلب غير صحيحة');

    return {
        mode: 'existing_order', orderId,
        item: {
            serviceId: order.serviceId, title: svc.title || order.serviceTitle || '',
            image: (svc.images && svc.images[0]) || svc.image || order.image || '',
            price, deliveryDays: svc.deliveryDays || order.deliveryDays || 3,
            sellerId: order.sellerId || '', sellerName: order.sellerName || '',
        },
        subtotal: price, fees, total,
    };
}

async function resolvePaymentTarget(body, env, auth) {
    if (body.existingOrderId) return await resolveExistingOrder(body.existingOrderId, auth, env);
    const { resolved, subtotal, fees, total } = await resolveOrderItems(body.items, env);
    return { mode: 'items', resolved, subtotal, fees, total };
}

function buildPendingPaymentDoc(target, auth, currency, method) {
    const base = { uid: auth.uid, currency, status: 'pending', method, createdAt: new Date(), mode: target.mode };
    if (target.mode === 'existing_order') {
        return Object.assign(base, { orderId: target.orderId, item: target.item, subtotal: target.subtotal, fees: target.fees, total: target.total });
    }
    return Object.assign(base, { items: target.resolved, subtotal: target.subtotal, fees: target.fees, total: target.total });
}

async function getPlatformConfig(env) {
    const doc = await fsGet(env, 'settings/platform').catch(() => null);
    return Object.assign({ FEE_TYPE: 'percent', FEE_PERCENT: 5, FEE_FIXED: 0, FEE_MIN: 0, FEE_MAX: 0 }, doc || {});
}
function calcFee(amount, cfg) {
    let fee;
    if (cfg.FEE_TYPE === 'fixed') fee = cfg.FEE_FIXED || 0;
    else if (cfg.FEE_TYPE === 'both') fee = (cfg.FEE_PERCENT || 0) * amount / 100 + (cfg.FEE_FIXED || 0);
    else fee = (cfg.FEE_PERCENT || 0) * amount / 100;
    if (cfg.FEE_MIN) fee = Math.max(fee, cfg.FEE_MIN);
    if (cfg.FEE_MAX && cfg.FEE_MAX > 0) fee = Math.min(fee, cfg.FEE_MAX);
    return Number(fee.toFixed(2));
}

function genOrderId() {
    return 'MS_' + Date.now().toString(36).toUpperCase() + '_' + crypto.randomUUID().slice(0, 8).toUpperCase();
}

// Once a real payment is confirmed (webhook), this is the ONLY place that
// creates the actual paid `orders` documents. Idempotent.
async function finalizePendingPayment(pendingId, env, { paymentId, method }) {
    const pending = await fsGet(env, `pending_payments/${pendingId}`);
    if (!pending) return { ok: false, reason: 'not_found' };
    if (pending.status === 'processed') return { ok: true, alreadyProcessed: true, orderIds: pending.orderIds || [] };

    if (pending.mode === 'existing_order') {
        const orderId = pending.orderId;
        const item = pending.item;
        await fsSet(env, `orders/${orderId}`, {
            status: 'payment_held', paymentMethod: method, paymentId: String(paymentId),
            merchantOrderId: pendingId, paymentStatus: 'paid', currency: pending.currency,
            escrowHeld: true, escrowAmount: item.price, price: item.price,
            chatEnabled: true, filesEnabled: true, updatedAt: new Date(),
        }, true);

        await fsCreate(env, 'escrow', {
            orderId, buyerId: pending.uid, sellerId: item.sellerId, amount: item.price,
            status: 'held', paymentId: String(paymentId), method, currency: pending.currency,
            createdAt: new Date(),
        }, orderId);

        if (item.sellerId) {
            await fsCreate(env, 'notifications', {
                userId: item.sellerId, type: 'payment_confirmed', title: '💰 تم الدفع!',
                message: `المشتري دفع طلب: ${item.title}`, orderId, read: false, createdAt: new Date(),
            });
        }

        await fsSet(env, `pending_payments/${pendingId}`, { status: 'processed', paymentId: String(paymentId), processedAt: new Date(), orderIds: [orderId] }, true);
        return { ok: true, orderIds: [orderId] };
    }

    const orderIds = [];
    for (const item of pending.items) {
        const orderId = crypto.randomUUID();
        await fsCreate(env, 'orders', {
            serviceId: item.serviceId, serviceTitle: item.title, image: item.image,
            price: item.price, deliveryDays: item.deliveryDays,
            buyerId: pending.uid, sellerId: item.sellerId, sellerName: item.sellerName,
            status: 'payment_held', paymentMethod: method, paymentId: String(paymentId),
            merchantOrderId: pendingId,
            currency: pending.currency, escrowHeld: true, escrowAmount: item.price,
            chatEnabled: true, filesEnabled: true, buyerFiles: [],
            deliveryDeadline: new Date(Date.now() + (item.deliveryDays || 3) * 86400000).toISOString(),
            createdAt: new Date(), updatedAt: new Date(),
        }, orderId);

        await fsCreate(env, 'escrow', {
            orderId, buyerId: pending.uid, sellerId: item.sellerId, amount: item.price,
            status: 'held', paymentId: String(paymentId), method, currency: pending.currency,
            createdAt: new Date(),
        }, orderId);

        if (item.sellerId) {
            await fsCreate(env, 'notifications', {
                userId: item.sellerId, type: 'new_order', title: '🛒 طلب جديد!',
                message: `طلب خدمة: ${item.title}`, orderId, serviceId: item.serviceId,
                read: false, createdAt: new Date(),
            });
        }
        orderIds.push(orderId);
    }

    await fsSet(env, `pending_payments/${pendingId}`, {
        status: 'processed', paymentId: String(paymentId), processedAt: new Date(), orderIds,
    }, true);

    return { ok: true, orderIds };
}

// ── Fawaterak (the ONLY payment gateway) ──────────────────────────────────────
// Price is validated server-side (resolvePaymentTarget). Order is only ever
// marked "paid" once functions/api/fawaterak-webhook.js verifies the payment
// signature server-to-server — see that file for the HMAC check.
async function handleFawaterak(body, env, CORS, auth) {
    const { customerData = {} } = body;
    const target = await resolvePaymentTarget(body, env, auth);
    const { total } = target;
    const orderId = genOrderId();
    await fsCreate(env, 'pending_payments', buildPendingPaymentDoc(target, auth, 'EGP', 'fawaterak'), orderId);

    if (!env.FAWATERAK_API_KEY) {
        const result = await finalizePendingPayment(orderId, env, { paymentId: 'DEMO_' + orderId, method: 'fawaterak' });
        return json(200, CORS, { redirectUrl: `${env.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=fawaterak#orders`, simulated: true, orderId, orderIds: result.orderIds });
    }

    const base = env.FAWATERAK_BASE_URL || 'https://app.fawaterk.com';
    const nameParts = String(customerData.name || 'Buyer N/A').trim().split(' ');
    const resp = await apiPost(`${base}/api/v2/createInvoiceLink`, {
        cartTotal: total, currency: 'EGP',
        customer: {
            first_name: nameParts[0] || 'Buyer', last_name: nameParts.slice(1).join(' ') || 'N/A',
            email: customerData.email || '', phone: customerData.phone || '',
        },
        cartItems: [{ name: 'Mall Services Order', price: total, quantity: 1 }],
        payLoad: { orderId },
        redirectionUrls: {
            successUrl: `${env.ALLOWED_ORIGINS}?payment_success=true&order_id=${orderId}&method=fawaterak#orders`,
            failUrl:    `${env.ALLOWED_ORIGINS}?payment_success=false&order_id=${orderId}&method=fawaterak#payment`,
            pendingUrl: `${env.ALLOWED_ORIGINS}?payment_success=pending&order_id=${orderId}&method=fawaterak#orders`,
            webhookUrl: `${env.SITE_URL || env.ALLOWED_ORIGINS}/api/fawaterak-webhook`,
        },
        sendEmail: false, sendSMS: false,
    }, { 'Authorization': `Bearer ${env.FAWATERAK_API_KEY}` });

    if (resp.status !== 'success' || !resp.data?.url) {
        throw new Error(resp.message || 'Fawaterak invoice creation failed');
    }

    return json(200, CORS, { redirectUrl: resp.data.url, orderId, invoiceKey: resp.data.invoiceKey, simulated: false });
}

// ── Two-tier affiliate commission ─────────────────────────────────────────────
// Pays the referrer a % of the PLATFORM'S OWN FEE (never an extra charge on
// the buyer or seller) — capped at the referred user's first 5 sales/purchases,
// and capped in total so both a referred-buyer + referred-seller payout on the
// same order can never exceed the platform fee actually collected on it.
// Off by default (settings/platform.AFFILIATE_ENABLED) until an admin sets it.
async function _creditAffiliateCommission(env, cfg, platformFee, buyerId, sellerId, orderId) {
    if (!cfg.AFFILIATE_ENABLED) return;
    const pct = Number(cfg.AFFILIATE_COMMISSION_PERCENT) || 0;
    if (pct <= 0 || platformFee <= 0) return;

    let remainingFee = platformFee;
    for (const referredUid of [buyerId, sellerId]) {
        if (!referredUid || remainingFee <= 0) break;
        const referredUser = await fsGet(env, `users/${referredUid}`).catch(() => null);
        if (!referredUser || !referredUser.referredBy) continue;
        if (referredUser.referredBy === referredUid) continue; // can't refer yourself

        const priorCount = Number(referredUser.referralCommissionCount) || 0;
        if (priorCount >= 5) continue; // cap: first 5 sales/purchases only

        const referrerUid = referredUser.referredBy;
        const referrer = await fsGet(env, `users/${referrerUid}`).catch(() => null);
        if (!referrer) continue; // referrer account no longer exists — skip silently

        const commission = Number(Math.min(remainingFee, platformFee * pct / 100).toFixed(2));
        if (commission <= 0) continue;

        await fsCommit(env, [
            writeIncrement(env, `wallets/${referrerUid}`, 'balance', commission),
            writeIncrement(env, `users/${referredUid}`, 'referralCommissionCount', 1),
            writeCreate(env, `transactions/${crypto.randomUUID()}`, {
                userId: referrerUid, type: 'affiliate_commission', amount: commission,
                orderId, referredUserId: referredUid,
                description: 'عمولة برنامج التسويق بالعمولة', status: 'completed', createdAt: new Date(),
            }),
            writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                userId: referrerUid, type: 'affiliate_commission', title: '🎉 عمولة إحالة جديدة!',
                message: `حصلت على ${commission} ج.م من عمولة إحالة`, orderId, read: false, createdAt: new Date(),
            }),
        ]).catch(err => console.error('[Affiliate] commission credit failed:', err.message));

        remainingFee -= commission;
    }
}

// ── Release escrow funds to the seller ────────────────────────────────────────
// ── Shared: pay the seller out of a held escrow ───────────────────────────────
// Used by a buyer's manual "confirm receipt" (handleReleaseEscrow), the
// automatic timeout (handleAutoReleaseStale), and a dispute resolved in the
// seller's favor (handleResolveDispute's pay_seller branch) — one guarded
// path for every way money can leave escrow to a seller.
async function _releaseEscrowToSeller(env, orderId, order, escrow, cfg, buildNotice) {
    const platformFee = calcFee(escrow.amount, cfg);
    const sellerAmount = Number((escrow.amount - platformFee).toFixed(2));
    const { title, message, description } = buildNotice(sellerAmount);
    const txId = crypto.randomUUID();

    await fsCommit(env, [
        writeIncrement(env, `wallets/${escrow.sellerId}`, 'balance', sellerAmount),
        writeUpdate(env, `escrow/${orderId}`, { status: 'released', releasedAt: new Date() }, { updateTime: escrow._updateTime }),
        writeUpdate(env, `orders/${orderId}`, { status: 'completed', completedAt: new Date(), escrowReleased: true, updatedAt: new Date() }),
        writeCreate(env, `transactions/${txId}`, {
            userId: escrow.sellerId, type: 'earning', amount: sellerAmount, platformFee, orderId,
            description, status: 'completed', createdAt: new Date(),
        }),
        writeCreate(env, `notifications/${crypto.randomUUID()}`, {
            userId: escrow.sellerId, type: 'payment_received', title, message, orderId, read: false, createdAt: new Date(),
        }),
    ]);

    await _creditAffiliateCommission(env, cfg, platformFee, order.buyerId, escrow.sellerId, orderId);
    return { sellerAmount, platformFee };
}

async function handleReleaseEscrow(body, env, CORS, auth) {
    const { orderId } = body;
    if (!orderId) return json(400, CORS, { error: 'orderId مطلوب' });

    const order = await fsGet(env, `orders/${orderId}`);
    if (!order) return json(404, CORS, { error: 'الطلب غير موجود' });

    const user = await fsGet(env, `users/${auth.uid}`);
    const isAdmin = user && user.role === 'admin';
    if (order.buyerId !== auth.uid && !isAdmin) return json(403, CORS, { error: 'غير مصرح لك بتأكيد استلام هذا الطلب' });

    const escrow = await fsGet(env, `escrow/${orderId}`);
    if (!escrow || escrow.status !== 'held') {
        return json(409, CORS, { error: 'تم تحويل هذه الأموال بالفعل أو لا يوجد ضمان لهذا الطلب' });
    }

    const cfg = await getPlatformConfig(env);
    const { sellerAmount, platformFee } = await _releaseEscrowToSeller(env, orderId, order, escrow, cfg, (amount) => ({
        title: 'تم استلام الأموال!',
        message: `تم تحويل ${amount} لمحفظتك`,
        description: 'أرباح من طلب مكتمل',
    }));

    return json(200, CORS, { success: true, sellerAmount, platformFee });
}

// ── Auto-dispute: protects the BUYER when nobody confirms receipt in time ────
// ⚠️ CHANGED (was auto-release-to-seller): this used to pay the seller
// automatically once an order sat DELIVERED for more than AUTO_RELEASE_DAYS.
// For physical products that silently pays out the seller even though the
// item may still be in transit and never actually reached the buyer — the
// buyer's silence isn't proof of receipt. Now it opens a SYSTEM dispute
// instead: order → 'disputed', escrow → 'frozen', a dispute record is
// created (raisedByRole: 'system'), and it lands in the admin's normal
// disputes queue (dashboard.js adminTab('disputes')) for a human decision —
// same resolveDispute() path used for any other dispute, so no money moves
// until admin (or the buyer confirming manually) actually acts. Still only
// fires on plain silence: an existing dispute already froze the escrow and
// took it out of this query, so this never overrides an active disagreement.
async function handleAutoReleaseStale(env, CORS) {
    const AUTO_RELEASE_DAYS = 7; // keep in sync with js/constants.js AUTO_RELEASE_DAYS
    const cutoff = new Date(Date.now() - AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000);

    const staleOrders = await fsQuery(env, {
        from: [{ collectionId: 'orders' }],
        where: {
            compositeFilter: {
                op: 'AND',
                filters: [
                    { fieldFilter: { field: { fieldPath: 'status' },     op: 'EQUAL',        value: { stringValue: 'delivered' } } },
                    { fieldFilter: { field: { fieldPath: 'deliveredAt' }, op: 'LESS_THAN_OR_EQUAL', value: { timestampValue: cutoff.toISOString() } } },
                ],
            },
        },
        limit: 200,
    });

    const results = [];
    for (const order of staleOrders) {
        try {
            const escrow = await fsGet(env, `escrow/${order.id}`);
            // Skip anything not cleanly "still held" — a dispute already froze it,
            // or it was released/refunded through some other path in the meantime.
            if (!escrow || escrow.status !== 'held') continue;

            const disputeId = crypto.randomUUID();
            await fsCommit(env, [
                writeUpdate(env, `orders/${order.id}`, { status: 'disputed', updatedAt: new Date() }),
                writeUpdate(env, `escrow/${order.id}`, { status: 'frozen', frozenAt: new Date() }, { updateTime: escrow._updateTime }),
                writeCreate(env, `disputes/${disputeId}`, {
                    orderId: order.id,
                    raisedBy: 'system',
                    raisedByName: 'النظام (تلقائي)',
                    raisedByRole: 'system',
                    reason: `فتح تلقائيًا: لم يتم تأكيد الاستلام خلال ${AUTO_RELEASE_DAYS} أيام من التسليم`,
                    status: 'open',
                    adminNotes: '',
                    resolution: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                }),
                writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                    userId: order.buyerId, type: 'auto_dispute', title: '⚠️ تم فتح نزاع تلقائيًا',
                    message: `لعدم تأكيد الاستلام خلال ${AUTO_RELEASE_DAYS} أيام من التسليم، تم فتح نزاع تلقائي وتجميد المبلغ لحين المراجعة`,
                    orderId: order.id, read: false, createdAt: new Date(),
                }),
                writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                    userId: order.sellerId, type: 'auto_dispute', title: '⚠️ تم فتح نزاع تلقائيًا',
                    message: `العميل لم يؤكد استلام الطلب خلال ${AUTO_RELEASE_DAYS} أيام، تم فتح نزاع تلقائي والمبلغ مجمد لحين مراجعة الأدمن`,
                    orderId: order.id, read: false, createdAt: new Date(),
                }),
                writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                    userId: 'ADMIN', type: 'dispute', title: 'نزاع تلقائي جديد!',
                    message: `نزاع تلقائي على الطلب #${order.id.substr(-8)} (لعدم تفاعل العميل خلال ${AUTO_RELEASE_DAYS} أيام)`,
                    orderId: order.id, read: false, createdAt: new Date(),
                }),
            ]);
            results.push({ orderId: order.id, disputeId });
        } catch (err) {
            console.error('[autoReleaseStale] failed for order', order.id, err.message);
        }
    }

    return json(200, CORS, { success: true, disputed: results.length, orders: results });
}

// ── Admin: resolve a dispute (refund the buyer OR pay the seller) ────────────
// ⚠️ FIXED: this used to be js/escrow.js EscrowManager.resolveDispute() writing
// directly from the admin's browser via a Firestore batch — with NO check that
// the escrow hadn't already been resolved (no double-payout guard, unlike
// handleReleaseEscrow above), no transaction record, no affiliate commission,
// and a fee computed client-side (which supports commission tiers) while the
// server's calcFee() here does not — so a tiered dispute payout could differ
// from what a normal order would have charged. Moved server-side so it goes
// through the exact same guarded path as a normal escrow release.
async function handleResolveDispute(body, env, CORS, auth) {
    const { disputeId, orderId, resolution } = body;
    if (!disputeId || !orderId) return json(400, CORS, { error: 'disputeId و orderId مطلوبين' });
    if (resolution !== 'refund_buyer' && resolution !== 'pay_seller') {
        return json(400, CORS, { error: 'resolution لازم يكون refund_buyer أو pay_seller' });
    }

    const user = await fsGet(env, `users/${auth.uid}`);
    if (!user || user.role !== 'admin') return json(403, CORS, { error: 'غير مصرح لك بحل النزاعات' });

    const dispute = await fsGet(env, `disputes/${disputeId}`);
    if (!dispute) return json(404, CORS, { error: 'النزاع غير موجود' });
    if (dispute.status !== 'open') return json(409, CORS, { error: 'تم حل هذا النزاع بالفعل' });

    const escrow = await fsGet(env, `escrow/${orderId}`);
    if (!escrow || (escrow.status !== 'frozen' && escrow.status !== 'held')) {
        return json(409, CORS, { error: 'لا يوجد ضمان قابل للحل لهذا الطلب (اتحل قبل كده أو مفيش ضمان أصلاً)' });
    }

    const disputeWrites = [
        writeUpdate(env, `disputes/${disputeId}`, {
            status: 'resolved', resolution, resolvedAt: new Date(), resolvedBy: auth.uid,
        }, { updateTime: dispute._updateTime }),
    ];

    let responsePayload;

    if (resolution === 'refund_buyer') {
        const txId = crypto.randomUUID();
        await fsCommit(env, [
            ...disputeWrites,
            writeIncrement(env, `wallets/${escrow.buyerId}`, 'balance', escrow.amount),
            writeUpdate(env, `escrow/${orderId}`, { status: 'refunded', resolvedAt: new Date() }, { updateTime: escrow._updateTime }),
            writeUpdate(env, `orders/${orderId}`, { status: 'refunded', updatedAt: new Date() }),
            writeCreate(env, `transactions/${txId}`, {
                userId: escrow.buyerId, type: 'refund', amount: escrow.amount, orderId,
                description: 'استرداد بعد حل نزاع', status: 'completed', createdAt: new Date(),
            }),
            writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                userId: escrow.buyerId, type: 'dispute_resolved', title: '↩️ تم استرداد أموالك',
                message: `تم حل النزاع لصالحك واسترداد ${escrow.amount}`, orderId, read: false, createdAt: new Date(),
            }),
        ]);
        responsePayload = { refundedAmount: escrow.amount };
    } else {
        const cfg = await getPlatformConfig(env);
        const platformFee = calcFee(escrow.amount, cfg);
        const sellerAmount = Number((escrow.amount - platformFee).toFixed(2));
        const txId = crypto.randomUUID();
        await fsCommit(env, [
            ...disputeWrites,
            writeIncrement(env, `wallets/${escrow.sellerId}`, 'balance', sellerAmount),
            writeUpdate(env, `escrow/${orderId}`, { status: 'released', resolvedAt: new Date() }, { updateTime: escrow._updateTime }),
            writeUpdate(env, `orders/${orderId}`, { status: 'completed', completedAt: new Date(), escrowReleased: true, updatedAt: new Date() }),
            writeCreate(env, `transactions/${txId}`, {
                userId: escrow.sellerId, type: 'earning', amount: sellerAmount, platformFee, orderId,
                description: 'أرباح بعد حل نزاع', status: 'completed', createdAt: new Date(),
            }),
            writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                userId: escrow.sellerId, type: 'dispute_resolved', title: '✅ تم حل النزاع لصالحك',
                message: `تم تحويل ${sellerAmount} لمحفظتك`, orderId, read: false, createdAt: new Date(),
            }),
        ]);
        await _creditAffiliateCommission(env, cfg, platformFee, escrow.buyerId, escrow.sellerId, orderId);
        responsePayload = { sellerAmount, platformFee };
    }

    return json(200, CORS, { success: true, resolution, ...responsePayload });
}

// ── Request a withdrawal (seller cash-out request, reviewed by admin manually
//    — this is NOT a payment gateway, it just records a request). ────────────
async function handleRequestWithdrawal(body, env, CORS, auth) {
    const { amount, method, accountInfo } = body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return json(400, CORS, { error: 'مبلغ غير صالح' });

    const cfg = await getPlatformConfig(env);
    const minW = cfg.MIN_WITHDRAWAL || 0;
    if (minW && amt < minW) return json(400, CORS, { error: `أقل مبلغ للسحب هو ${minW}` });

    const wallet = await fsGet(env, `wallets/${auth.uid}`);
    const balance = Number(wallet && wallet.balance) || 0;
    if (amt > balance) return json(400, CORS, { error: 'رصيدك غير كافٍ لهذا المبلغ' });

    const user = await fsGet(env, `users/${auth.uid}`);
    const reqId = crypto.randomUUID();

    await fsCommit(env, [
        writeIncrement(env, `wallets/${auth.uid}`, 'balance', -amt),
        writeCreate(env, `withdrawals/${reqId}`, {
            userId: auth.uid, userName: (user && user.displayName) || '', userEmail: (user && user.email) || auth.email || '',
            amount: amt, method: method || 'bank', accountInfo: String(accountInfo || '').slice(0, 300),
            status: 'pending', createdAt: new Date(),
        }),
    ]);

    return json(200, CORS, { success: true, requestId: reqId, newBalance: Number((balance - amt).toFixed(2)) });
}

// ── Check Which Keys Are Configured (no secrets returned) ────────────────────
function handleCheckKeys(env, CORS) {
    return json(200, CORS, {
        fawaterak_configured: !!env.FAWATERAK_API_KEY,
        firebase_admin_configured: !!(env.FIREBASE_SERVICE_ACCOUNT && env.FIREBASE_PROJECT_ID),
    });
}

export { finalizePendingPayment, hmacHex, timingSafeEqual };
