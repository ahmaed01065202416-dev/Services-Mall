/**
 * ============================================================================
 * functions/api/affiliate.js — Route: POST /api/affiliate
 * ============================================================================
 * Marketer program, external-link model (see _shared/affiliate.js for the rules).
 *   marketer:  saveProduct · toggleProduct · confirmOrder · cancelOrder · buyPlan · payDuesWallet · payDuesInvoice
 *   admin:     adminBlockProduct (block / unblock a listing that breaks the rules)
 *   buyer:     trackOrder   (signed-in; records the order, then returns the external link)
 * The external URL is kept in affiliate_products/{id}/private/link and only returned by trackOrder,
 * so a customer can't skip tracking by reading the link straight from Firestore.
 * Called back by fawaterak-webhook.js → activateMarketerPayment().
 * ALL writes use the service account; firestore.rules are read-only for clients.
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsCreate, fsSet, fsQuery, fsCommit, writeUpdate, writeCreate, writeIncrement } from '../_shared/gcp.js';
import { getAffSettings, counterField, computeOrderFee, accessStatus, toMs } from '../_shared/affiliate.js';
import { createInvoice } from '../_shared/gateway.js';

const json = (status, headers, obj) => new Response(JSON.stringify(obj), { status, headers });
const safeId = v => { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_\-]{1,128}$/.test(s) ? s : null; };
const r2 = n => Number(Number(n).toFixed(2));
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isImg = u => typeof u === 'string' && (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) || /^https:\/\//i.test(u));
const LEAK = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?\d[\s().-]*){10,}|whats\s?app|واتس|تليجرام|telegram/i;
const CATEGORIES = ['clothing', 'electronics', 'home', 'beauty', 'food', 'accessories', 'digital', 'other'];
const DAY = 86400000;
const err = (status, message) => { const e = new Error(message); e.status = status; return e; };
const notify = (env, userId, title, message, extra = {}) =>
    fsCreate(env, 'notifications', { userId, type: 'affiliate', title, message, read: false, createdAt: new Date(), ...extra }).catch(e => console.warn('[affiliate] notify failed', e.message));

function cleanUrl(u) {
    let x; try { x = new URL(String(u || '').trim()); } catch (_) { throw err(400, 'رابط المنتج غير صالح'); }
    if (x.protocol !== 'https:' || x.username || x.password || String(u).length > 700) throw err(400, 'لازم الرابط يكون https وبدون بيانات دخول');
    return x.toString();
}
async function isAdminUid(env, uid) {
    if ((env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(uid)) return true;
    const u = await fsGet(env, `users/${uid}`).catch(() => null);
    return !!(u && u.role === 'admin');
}
async function requireMarketer(env, uid) {
    const user = await fsGet(env, `users/${uid}`).catch(() => null);
    if (!user || !['seller', 'admin'].includes(user.role)) throw err(403, 'سجّل كمسوّق الأول (ابدأ كمسوّق)');
    const trust = await fsGet(env, `trust/${uid}`).catch(() => null);
    if (trust && trust.sellerBlocked) throw err(403, 'حسابك موقوف مؤقتًا — تواصل مع الإدارة');
    return user;
}
const docName = (env, path) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
// One transform write with several increments (a doc may be written only once per commit).
function multiInc(env, path, incs, precondition) {
    const w = { transform: { document: docName(env, path), fieldTransforms: Object.entries(incs).map(([f, n]) => ({ fieldPath: f, increment: Number.isInteger(n) ? { integerValue: String(n) } : { doubleValue: n } })) } };
    if (precondition) w.currentDocument = precondition;
    return w;
}

// ── fee accounting ───────────────────────────────────────────────────────────
// Marks an order as counted and books its fee against the marketer. Idempotent + race-safe.
async function chargeOrder(env, cfg, orderId) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const order = await fsGet(env, `affiliate_orders/${orderId}`);
        if (!order || order.counted) return 0;
        const acct = await fsGet(env, `marketer_accounts/${order.marketerId}`);
        const field = counterField(cfg), fee = computeOrderFee(cfg, acct ? acct[field] : 0);
        try {
            await fsCommit(env, [
                writeUpdate(env, `affiliate_orders/${orderId}`, { counted: true, feeAmount: fee, countedAt: new Date() }, { updateTime: order._updateTime }),
                multiInc(env, `marketer_accounts/${order.marketerId}`, { [field]: 1, owed: fee, totalFees: fee }, acct ? { updateTime: acct._updateTime } : { exists: false }),
                ...(fee > 0 ? [writeCreate(env, `marketer_ledger/${crypto.randomUUID()}`, { userId: order.marketerId, type: 'order_fee', amount: fee, orderId, productTitle: order.productTitle || '', createdAt: new Date() })] : []),
            ]);
            return fee;
        } catch (e) { if (attempt === 2) throw err(409, 'حصل تضارب في الحساب — جرّب تاني'); }
    }
    return 0;
}

// ── products ─────────────────────────────────────────────────────────────────
async function saveProduct(body, env, auth) {
    const cfg = await getAffSettings(env);
    if (!cfg.AFF_ENABLED) throw err(403, 'منتجات التسويق غير متاحة حالياً');
    const user = await requireMarketer(env, auth.uid);
    const acct = await fsGet(env, `marketer_accounts/${auth.uid}`);
    const st = accessStatus(cfg, acct);
    if (!st.ok) throw err(402, st.message);

    const title = clean(body.title, 120), description = clean(body.description, 2000), platformName = clean(body.platformName, 40);
    if (title.length < 3) throw err(400, 'اكتب عنوان للمنتج (٣ حروف على الأقل)');
    if (description.length < 10) throw err(400, 'اكتب وصف للمنتج (١٠ حروف على الأقل)');
    if (platformName.length < 2) throw err(400, 'اكتب اسم المنصة اللي بتسوّق لها');
    if (LEAK.test(title + ' ' + description + ' ' + platformName)) throw err(400, 'ممنوع وضع أرقام هاتف أو إيميل أو واتساب في بيانات المنتج');
    const category = CATEGORIES.includes(body.category) ? body.category : 'other';
    const price = body.price === '' || body.price == null ? 0 : r2(body.price);
    if (!(price >= 0 && price <= 1e7)) throw err(400, 'السعر غير صالح');
    const url = cleanUrl(body.externalUrl);
    const trackParam = /^[A-Za-z0-9_]{1,20}$/.test(String(body.trackParam || '')) ? String(body.trackParam) : '';
    const list = [...new Set([body.image, ...(Array.isArray(body.images) ? body.images : [])].filter(isImg))].slice(0, 5);
    if (!list.length) throw err(400, 'ارفع صورة واحدة على الأقل');
    if (list.reduce((n, u) => n + u.length, 0) > 880000) throw err(400, 'حجم الصور كبير — قلل عدد الصور أو استخدم صور أصغر');
    const storeId = safeId(body.storeId) || auth.uid, store = await fsGet(env, `stores/${storeId}`);
    if (!store || store.ownerId !== auth.uid) throw err(400, 'اختار متجر من متاجرك (أنشئ متجرك الأول)');

    const data = { title, description, category, price, platformName, storeId, image: list[0], images: list, trackParam, updatedAt: new Date() };
    let id = safeId(body.id);
    if (id) {
        const cur = await fsGet(env, `affiliate_products/${id}`);
        if (!cur || cur.marketerId !== auth.uid) throw err(403, 'المنتج مش بتاعك');
        if (cur.blocked) throw err(403, 'المنتج ده موقوف من الإدارة');
        await fsSet(env, `affiliate_products/${id}`, data, true);
    } else {
        id = crypto.randomUUID();
        await fsCreate(env, 'affiliate_products', { ...data, marketerId: auth.uid, marketerName: user.name || user.displayName || '', active: true, blocked: false, clicks: 0, confirmedCount: 0, createdAt: new Date() }, id);
    }
    await fsSet(env, `affiliate_products/${id}/private/link`, { url, updatedAt: new Date() });
    return { id };
}
async function toggleProduct(body, env, auth) {
    const id = safeId(body.id), cur = id && await fsGet(env, `affiliate_products/${id}`);
    if (!cur || cur.marketerId !== auth.uid) throw err(403, 'المنتج مش بتاعك');
    if (cur.blocked) throw err(403, 'المنتج ده موقوف من الإدارة');
    await fsSet(env, `affiliate_products/${id}`, { active: !!body.active, updatedAt: new Date() }, true);
    return { id };
}

// ── tracked orders ───────────────────────────────────────────────────────────
async function trackOrder(body, env, auth) {
    const cfg = await getAffSettings(env);
    if (!cfg.AFF_ENABLED) throw err(403, 'الطلب غير متاح حالياً');
    const pid = safeId(body.productId), p = pid && await fsGet(env, `affiliate_products/${pid}`);
    if (!p || p.active === false || p.blocked) throw err(404, 'المنتج غير متاح');
    if (p.marketerId === auth.uid) throw err(400, 'مينفعش تطلب منتجك أنت');
    const store = await fsGet(env, `stores/${p.storeId}`);
    if (!store || store.status === 'paused') throw err(409, 'المتجر متوقف حالياً');
    const acct = await fsGet(env, `marketer_accounts/${p.marketerId}`), st = accessStatus(cfg, acct);
    if (!st.ok) throw err(409, 'المنتج غير متاح مؤقتاً من البائع');
    const link = await fsGet(env, `affiliate_products/${pid}/private/link`);
    if (!link || !link.url) throw err(409, 'رابط المنتج غير متاح');

    // The same buyer re-pressing "order" within 24h re-uses the open record (no double fee, no spam).
    const mine = await fsQuery(env, { from: [{ collectionId: 'affiliate_orders' }], where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'buyerId' }, op: 'EQUAL', value: { stringValue: auth.uid } } },
        { fieldFilter: { field: { fieldPath: 'productId' }, op: 'EQUAL', value: { stringValue: pid } } }] } }, limit: 30 });
    let order = mine.find(o => o.status === 'clicked' && Date.now() - toMs(o.createdAt) < DAY);
    if (!order) {
        const id = crypto.randomUUID(), code = 'T' + id.replace(/-/g, '').slice(0, 9).toUpperCase();
        const buyer = await fsGet(env, `users/${auth.uid}`).catch(() => null);
        order = { id, productId: pid, productTitle: p.title, productImage: p.image, platformName: p.platformName, price: Number(p.price) || 0, marketerId: p.marketerId, storeId: p.storeId,
            buyerId: auth.uid, buyerName: (buyer && (buyer.name || buyer.displayName)) || '', trackingCode: code, status: 'clicked', counted: false, feeAmount: 0, createdAt: new Date() };
        await fsCreate(env, 'affiliate_orders', order, id);
        await fsCommit(env, [multiInc(env, `affiliate_products/${pid}`, { clicks: 1 })]).catch(() => {});
        if (cfg.AFF_COUNT_MODE === 'click') await chargeOrder(env, cfg, id);
        await notify(env, p.marketerId, '🛒 عميل جديد طلب منتجك', `"${p.title}" — كود التتبع ${code}`, { orderId: id });
    }
    let url = link.url;
    if (p.trackParam) { try { const u = new URL(url); u.searchParams.set(p.trackParam, order.trackingCode); url = u.toString(); } catch (_) {} }
    return { orderId: order.id, trackingCode: order.trackingCode, url };
}
async function loadMyOrder(env, auth, body, allowed) {
    const id = safeId(body.orderId), o = id && await fsGet(env, `affiliate_orders/${id}`);
    if (!o || o.marketerId !== auth.uid) throw err(403, 'الطلب ده مش بتاعك');
    if (!allowed.includes(o.status)) throw err(409, 'حالة الطلب لا تسمح بالإجراء ده');
    return o;
}
async function confirmOrder(body, env, auth) {
    const cfg = await getAffSettings(env), o = await loadMyOrder(env, auth, body, ['clicked']);
    await fsSet(env, `affiliate_orders/${o.id}`, { status: 'confirmed', confirmedAt: new Date() }, true);
    await fsCommit(env, [multiInc(env, `affiliate_products/${o.productId}`, { confirmedCount: 1 })]).catch(() => {});
    const fee = cfg.AFF_COUNT_MODE === 'confirmed' ? await chargeOrder(env, cfg, o.id) : 0;
    return { orderId: o.id, status: 'confirmed', fee };
}
async function cancelOrder(body, env, auth) {
    const o = await loadMyOrder(env, auth, body, ['clicked']);
    await fsSet(env, `affiliate_orders/${o.id}`, { status: 'cancelled', cancelledAt: new Date() }, true);   // fee (click mode) stays — the click was real
    return { orderId: o.id, status: 'cancelled' };
}

// ── admin moderation ─────────────────────────────────────────────────────────
async function adminBlockProduct(body, env) {
    const id = safeId(body.id), p = id && await fsGet(env, `affiliate_products/${id}`);
    if (!p) throw err(404, 'المنتج غير موجود');
    const blocked = !!body.blocked, reason = clean(body.reason, 200);
    if (blocked && reason.length < 3) throw err(400, 'اكتب سبب الحظر');
    await fsSet(env, `affiliate_products/${id}`, { blocked, blockReason: blocked ? reason : '', active: !blocked, updatedAt: new Date() }, true);   // block hides it; unblock shows it again right away
    await notify(env, p.marketerId, blocked ? '⛔ تم إيقاف أحد منتجاتك' : '✅ تم رفع الإيقاف عن منتجك', blocked ? `"${p.title}" — السبب: ${reason}` : `"${p.title}" — رجع ظاهر في متجرك.`);
    return { id, blocked };
}

// ── subscription ─────────────────────────────────────────────────────────────
async function applyMarketerPlan(env, uid, plan, days) {
    const acct = await fsGet(env, `marketer_accounts/${uid}`);
    const until = new Date(Math.max(Date.now(), toMs(acct && acct.subscriptionUntil)) + days * DAY);
    await fsSet(env, `marketer_accounts/${uid}`, { subscriptionUntil: until, planId: plan.id || '', planName: plan.nameAr || plan.name || '', updatedAt: new Date() }, true);
    return until;
}
async function customerOf(env, uid, auth) {
    const user = await fsGet(env, `users/${uid}`).catch(() => ({})) || {};
    const priv = await fsGet(env, `users/${uid}/private/contact`).catch(() => ({})) || {};
    const parts = String(user.name || 'Marketer N/A').trim().split(' ');
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') || 'N/A', email: user.email || auth.email || '', phone: priv.phone || user.phone || '' };
}
async function buyPlan(body, env, auth) {
    const cfg = await getAffSettings(env);
    if (!cfg.AFF_ENABLED || !cfg.AFF_SUB_ENABLED) throw err(403, 'الاشتراكات غير مفعّلة حالياً');
    await requireMarketer(env, auth.uid);
    const planId = safeId(body.planId), plan = planId && await fsGet(env, `marketer_plans/${planId}`);
    if (!plan || plan.enabled === false) throw err(404, 'الباقة غير متاحة');
    const days = Math.max(1, Number(plan.days) || 0), price = Math.max(0, r2(plan.price) || 0);
    const subId = crypto.randomUUID();
    await fsCreate(env, 'marketer_subscriptions', { userId: auth.uid, planId, planName: plan.nameAr || '', days, price, status: price > 0 ? 'pending_payment' : 'active', createdAt: new Date() }, subId);
    if (price <= 0) {
        const until = await applyMarketerPlan(env, auth.uid, { id: planId, ...plan }, days);
        await fsSet(env, `marketer_subscriptions/${subId}`, { paid: false, activatedAt: new Date(), endAt: until }, true);
        return { status: 'active', subscriptionUntil: until.toISOString() };
    }
    try {
        const inv = await createInvoice(env, { amount: price, itemName: `اشتراك مسوّق: ${plan.nameAr || planId} (${days} يوم)`, customer: await customerOf(env, auth.uid, auth), payLoad: { mktSubId: subId }, returnPath: 'my-store' });
        if (inv.simulated) { await activateMarketerPayment(env, { mktSubId: subId }, 'DEMO_' + subId); return { simulated: true, status: 'active' }; }
        return { subId, redirectUrl: inv.url };
    } catch (e) { await fsSet(env, `marketer_subscriptions/${subId}`, { status: 'cancelled' }, true); throw e; }
}

// ── dues (what the marketer owes us) ─────────────────────────────────────────
async function payDuesWallet(body, env, auth) {
    await requireMarketer(env, auth.uid);
    const acct = await fsGet(env, `marketer_accounts/${auth.uid}`), owed = r2(Number(acct && acct.owed) || 0);
    if (owed <= 0) throw err(400, 'مفيش مستحقات عليك');
    const wallet = await fsGet(env, `wallets/${auth.uid}`), bal = Number(wallet && wallet.balance) || 0;
    const want = body.amount ? r2(body.amount) : owed, amt = r2(Math.min(want, owed));
    if (!(amt > 0)) throw err(400, 'مبلغ غير صالح');
    if (!wallet || !wallet._updateTime || bal < amt) throw err(400, 'رصيد محفظتك غير كافٍ');
    try {
        await fsCommit(env, [
            writeIncrement(env, `wallets/${auth.uid}`, 'balance', -amt, { updateTime: wallet._updateTime }),
            multiInc(env, `marketer_accounts/${auth.uid}`, { owed: -amt, totalPaid: amt }, { updateTime: acct._updateTime }),
            writeCreate(env, `marketer_ledger/${crypto.randomUUID()}`, { userId: auth.uid, type: 'dues_payment', method: 'wallet', amount: -amt, createdAt: new Date() }),
        ]);
    } catch (e) { throw err(409, 'حصل تضارب في الحساب — جرّب تاني'); }
    return { paid: amt, owed: r2(owed - amt) };
}
async function payDuesInvoice(body, env, auth) {
    await requireMarketer(env, auth.uid);
    const acct = await fsGet(env, `marketer_accounts/${auth.uid}`), owed = r2(Number(acct && acct.owed) || 0);
    if (owed <= 0) throw err(400, 'مفيش مستحقات عليك');
    const amt = r2(Math.min(body.amount ? r2(body.amount) : owed, owed));
    if (!(amt >= 1)) throw err(400, 'أقل مبلغ للدفع 1 ج.م');
    const id = crypto.randomUUID();
    await fsCreate(env, 'marketer_dues_payments', { userId: auth.uid, amount: amt, status: 'pending_payment', createdAt: new Date() }, id);
    try {
        const inv = await createInvoice(env, { amount: amt, itemName: 'سداد مستحقات المنصة — برنامج المسوّقين', customer: await customerOf(env, auth.uid, auth), payLoad: { mktDuesId: id }, returnPath: 'my-store' });
        if (inv.simulated) { await activateMarketerPayment(env, { mktDuesId: id }, 'DEMO_' + id); return { simulated: true, paid: amt }; }
        return { duesId: id, redirectUrl: inv.url };
    } catch (e) { await fsSet(env, `marketer_dues_payments/${id}`, { status: 'cancelled' }, true); throw e; }
}

// Called by fawaterak-webhook.js after its signature check. Idempotent (status flips once).
export async function activateMarketerPayment(env, payLoad, invoiceId) {
    if (payLoad.mktSubId) {
        const sub = await fsGet(env, `marketer_subscriptions/${payLoad.mktSubId}`);
        if (!sub || sub.status !== 'pending_payment') return { skipped: true };
        await fsSet(env, `marketer_subscriptions/${sub.id}`, { status: 'active', paid: true, paidAmount: Number(sub.price) || 0, invoiceId: String(invoiceId || ''), paidAt: new Date() }, true);
        const until = await applyMarketerPlan(env, sub.userId, { id: sub.planId, nameAr: sub.planName }, sub.days);
        await fsSet(env, `marketer_subscriptions/${sub.id}`, { endAt: until, activatedAt: new Date() }, true);
        await notify(env, sub.userId, '✅ تم تفعيل اشتراك المسوّق', `اشتراكك ساري لحد ${until.toISOString().slice(0, 10)}.`);
        return { ok: true };
    }
    if (payLoad.mktDuesId) {
        const pay = await fsGet(env, `marketer_dues_payments/${payLoad.mktDuesId}`);
        if (!pay || pay.status !== 'pending_payment') return { skipped: true };
        const amt = r2(pay.amount);
        await fsCommit(env, [
            writeUpdate(env, `marketer_dues_payments/${pay.id}`, { status: 'paid', invoiceId: String(invoiceId || ''), paidAt: new Date() }, { updateTime: pay._updateTime }),
            multiInc(env, `marketer_accounts/${pay.userId}`, { owed: -amt, totalPaid: amt }),
            writeCreate(env, `marketer_ledger/${crypto.randomUUID()}`, { userId: pay.userId, type: 'dues_payment', method: 'invoice', amount: -amt, invoiceId: String(invoiceId || ''), createdAt: new Date() }),
        ]);
        await notify(env, pay.userId, '✅ تم سداد مستحقاتك', `تم خصم ${amt} ج.م من المستحقات.`);
        return { ok: true };
    }
    return { skipped: true };
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });
    let body; try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
    const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const auth = tok ? await verifyIdToken(tok, env) : null;
    if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });
    const handlers = { saveProduct, toggleProduct, trackOrder, confirmOrder, cancelOrder, buyPlan, payDuesWallet, payDuesInvoice };
    try {
        if (body.action === 'adminBlockProduct') {
            if (!(await isAdminUid(env, auth.uid))) return json(403, CORS, { error: 'للإدارة فقط' });
            return json(200, CORS, { success: true, ...(await adminBlockProduct(body, env)) });
        }
        if (!handlers[body.action]) return json(400, CORS, { error: `Unknown action: ${body.action}` });
        return json(200, CORS, { success: true, ...(await handlers[body.action](body, env, auth)) });
    } catch (e) {
        if (!e.status) console.error(`[affiliate] ${body.action} failed:`, e.message);
        return json(e.status || 500, CORS, { error: e.message || 'Internal server error' });
    }
}
