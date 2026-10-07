/**
 * ============================================================================
 * functions/api/stores.js — Route: /api/stores
 * ============================================================================
 * Paid "featured store" packages (admin-defined in `store_plans`).
 *
 *   buyPlan    seller → creates a store_subscriptions record and a Fawaterak invoice
 *              pending_payment → (webhook) → active: the store gets featuredUntil / planRank
 *   adminGrant admin  → gives a store a package (or N days) without payment
 *   adminStop  admin  → ends a store's featured period immediately
 *
 * A store is shown at the top of the home page while featuredUntil > now. Nothing needs a
 * cron: expiry is evaluated at read time. Buying again EXTENDS the current period.
 * Same payment pattern as functions/api/ads.js (webhook: fawaterak-webhook.js → activateStorePayment).
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsSet, fsCreate } from '../_shared/gcp.js';

const DAY = 86400000;
function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
function safeId(v) { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_\-]{1,128}$/.test(s) ? s : null; }
function siteUrl(env) {
    const first = (env.SITE_URL || (env.ALLOWED_ORIGINS || '').split(',')[0] || 'https://mall-services.pages.dev').trim();
    return first.replace(/\/+$/, '');
}
function getCORS(request, env) {
    const origin = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || '*'),
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json', 'Vary': 'Origin' };
}
async function apiPost(url, body, headers = {}) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    const text = await res.text();
    try { return JSON.parse(text); } catch (_) { return { raw: text }; }
}
async function isAdminUid(env, uid) {
    const list = (env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (list.includes(uid)) return true;
    const u = await fsGet(env, `users/${uid}`).catch(() => null);
    return !!(u && u.role === 'admin');
}
const toMs = (v) => { if (!v) return 0; const t = typeof v === 'string' ? Date.parse(v) : (v.seconds ? v.seconds * 1000 : +v); return Number.isFinite(t) ? t : 0; };
function notify(env, userId, title, message) {
    return fsCreate(env, 'notifications', { userId, type: 'store_update', title, message, read: false, createdAt: new Date() }).catch(() => {});
}

// Give a store `days` more days of featuring (extends from the current end if it is still running).
async function applyPlan(env, store, plan, days, extra = {}) {
    const base = Math.max(Date.now(), toMs(store.featuredUntil));
    const until = new Date(base + days * DAY);
    await fsSet(env, `stores/${store.id}`, {
        featuredUntil: until, planId: plan.id || '', planName: plan.nameAr || plan.name || '', planRank: Number(plan.rank) || 0, updatedAt: new Date(), ...extra,
    }, true);
    return until;
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = getCORS(request, env);
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });
    let body; try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
    const auth = await verifyIdToken((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env);
    if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });
    try {
        switch (body.action) {
            case 'buyPlan':    return await buyPlan(body, env, CORS, auth);
            case 'adminGrant': return await adminGrant(body, env, CORS, auth);
            case 'adminStop':  return await adminStop(body, env, CORS, auth);
            default: return json(400, CORS, { error: 'Unknown action' });
        }
    } catch (err) {
        console.error('[stores]', body.action, err.message);
        return json(err.status || 500, CORS, { error: err.message || 'Internal error' });
    }
}

async function buyPlan(body, env, CORS, auth) {
    const planId = safeId(body.planId);
    if (!planId) return json(400, CORS, { error: 'الباقة مطلوبة' });
    const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
    if (!user || !['seller', 'admin'].includes(user.role)) return json(403, CORS, { error: 'الباقات للبائعين فقط' });
    const storeId = safeId(body.storeId) || auth.uid;
    const store = await fsGet(env, `stores/${storeId}`);
    if (!store) return json(400, CORS, { error: 'أنشئ متجرك الأول قبل شراء باقة' });
    if (store.ownerId !== auth.uid) return json(403, CORS, { error: 'المتجر ده مش بتاعك' });
    if (store.status === 'paused') return json(400, CORS, { error: 'متجرك موقوف — فعّله الأول' });
    const trust = await fsGet(env, `trust/${auth.uid}`).catch(() => null);
    if (trust && trust.sellerBlocked) return json(403, CORS, { error: 'حسابك موقوف مؤقتًا بسبب نزاعات — تواصل مع الإدارة' });
    const plan = await fsGet(env, `store_plans/${planId}`);
    if (!plan || plan.enabled === false) return json(404, CORS, { error: 'الباقة غير متاحة' });
    const days = Math.max(1, Number(plan.days) || 0), price = Math.max(0, Number(plan.price) || 0);
    if (!days) return json(400, CORS, { error: 'الباقة غير مضبوطة' });

    const subId = crypto.randomUUID();
    const base = { sellerId: auth.uid, storeId, storeName: store.name || '', planId, planName: plan.nameAr || '', days, price, rank: Number(plan.rank) || 0,
        status: price > 0 ? 'pending_payment' : 'active', createdAt: new Date() };
    await fsCreate(env, 'store_subscriptions', base, subId);

    if (price <= 0) {
        const until = await applyPlan(env, { id: storeId, ...store }, { id: planId, ...plan }, days);
        await fsSet(env, `store_subscriptions/${subId}`, { paid: false, paidAmount: 0, activatedAt: new Date(), endAt: until }, true);
        return json(200, CORS, { status: 'active', featuredUntil: until.toISOString() });
    }
    if (!env.FAWATERAK_API_KEY) {
        if (env.ALLOW_SIMULATED_PAYMENTS !== 'true') {
            await fsSet(env, `store_subscriptions/${subId}`, { status: 'cancelled' }, true);
            return json(500, CORS, { error: 'بوابة الدفع غير مفعّلة (FAWATERAK_API_KEY ناقص)' });
        }
        await activateStorePayment(env, subId, 'DEMO_' + subId);
        return json(200, CORS, { simulated: true, status: 'active' });
    }
    const priv = await fsGet(env, `users/${auth.uid}/private/contact`).catch(() => ({}));
    const phone = (priv && priv.phone) || user.phone || '';
    const parts = String(user.name || 'Seller N/A').trim().split(' ');
    const origin = siteUrl(env);
    const resp = await apiPost(`${env.FAWATERAK_BASE_URL || 'https://app.fawaterk.com'}/api/v2/createInvoiceLink`, {
        cartTotal: price, currency: 'EGP',
        customer: { first_name: parts[0] || 'Seller', last_name: parts.slice(1).join(' ') || 'N/A', email: user.email || auth.email || '', phone },
        cartItems: [{ name: `باقة متجر: ${plan.nameAr || planId} (${days} يوم) — ${store.name || ''}`, price, quantity: 1 }],
        payLoad: { storeSubId: subId },
        redirectionUrls: {
            successUrl: `${origin}/?store_payment=success#my-store`, failUrl: `${origin}/?store_payment=failed#my-store`,
            pendingUrl: `${origin}/?store_payment=pending#my-store`, webhookUrl: `${origin}/api/fawaterak-webhook`,
        },
        sendEmail: false, sendSMS: false,
    }, { Authorization: `Bearer ${env.FAWATERAK_API_KEY}` });
    if (resp.status !== 'success' || !resp.data?.url) {
        await fsSet(env, `store_subscriptions/${subId}`, { status: 'cancelled' }, true);
        return json(502, CORS, { error: resp.message || 'تعذر إنشاء فاتورة الدفع' });
    }
    return json(200, CORS, { subId, redirectUrl: resp.data.url });
}

// Called by fawaterak-webhook.js after its signature check. Idempotent.
export async function activateStorePayment(env, subId, invoiceId) {
    const sub = await fsGet(env, `store_subscriptions/${subId}`);
    if (!sub || sub.status !== 'pending_payment') return { skipped: true };
    const store = await fsGet(env, `stores/${sub.storeId}`);
    if (!store) return { skipped: true, reason: 'store missing' };
    const until = await applyPlan(env, { id: sub.storeId, ...store }, { id: sub.planId, nameAr: sub.planName, rank: sub.rank }, sub.days);
    await fsSet(env, `store_subscriptions/${subId}`, { status: 'active', paid: true, paidAmount: Number(sub.price) || 0, paidAt: new Date(), invoiceId: String(invoiceId || ''), activatedAt: new Date(), endAt: until }, true);
    await notify(env, sub.sellerId, '⭐ تم تفعيل باقة متجرك', `متجرك هيظهر في أول الصفحة لحد ${until.toISOString().slice(0, 10)}.`);
    return { ok: true };
}

async function adminGrant(body, env, CORS, auth) {
    if (!(await isAdminUid(env, auth.uid))) return json(403, CORS, { error: 'للأدمن فقط' });
    const storeId = safeId(body.storeId), planId = safeId(body.planId);
    const store = storeId && await fsGet(env, `stores/${storeId}`);
    if (!store) return json(404, CORS, { error: 'المتجر غير موجود' });
    const plan = planId ? await fsGet(env, `store_plans/${planId}`) : null;
    const days = Math.max(1, parseInt(body.days, 10) || (plan && Number(plan.days)) || 0);
    if (!days) return json(400, CORS, { error: 'حدد باقة أو عدد أيام' });
    const until = await applyPlan(env, { id: storeId, ...store }, plan ? { id: planId, ...plan } : { id: '', nameAr: 'منحة من الإدارة', rank: Number(body.rank) || 0 }, days);
    await fsCreate(env, 'store_subscriptions', { sellerId: storeId, storeId, storeName: store.name || '', planId: planId || '', planName: plan ? (plan.nameAr || '') : 'منحة من الإدارة',
        days, price: 0, status: 'active', granted: true, grantedBy: auth.uid, createdAt: new Date(), activatedAt: new Date(), endAt: until });
    await notify(env, storeId, '⭐ الإدارة فعّلت ظهور متجرك في الأول', `لمدة ${days} يوم.`);
    return json(200, CORS, { success: true, featuredUntil: until.toISOString() });
}

async function adminStop(body, env, CORS, auth) {
    if (!(await isAdminUid(env, auth.uid))) return json(403, CORS, { error: 'للأدمن فقط' });
    const storeId = safeId(body.storeId);
    if (!storeId || !(await fsGet(env, `stores/${storeId}`))) return json(404, CORS, { error: 'المتجر غير موجود' });
    await fsSet(env, `stores/${storeId}`, { featuredUntil: new Date(0), planRank: 0, updatedAt: new Date() }, true);
    return json(200, CORS, { success: true });
}
