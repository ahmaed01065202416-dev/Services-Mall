/**
 * functions/api/coupons.js — coupons & discounts management (merchants + admin)
 * ============================================================================
 * Why a server API: coupons used to be read/written straight from the browser (every signed-in user could list every
 * code) and the server never applied them. Now the `coupons` collection is closed to browsers; this API is the only
 * writer, and functions/api/payment.js is the only place a discount is actually applied (see _shared/coupons.js).
 *
 * Actions (POST, JSON, Bearer Firebase ID token):
 *   config            → { enabled, storeEnabled }          any signed-in user (storeEnabled = the caller's own switch)
 *   setStoreEnabled   → merchant turns HIS coupons / automatic discounts on or off (default OFF)
 *   list              → my coupons (merchant) / all coupons (admin)
 *   create            → merchant: store coupon / automatic discount for HIS products · admin: platform coupon (from commission)
 *   update            → merchant edits his own coupon (not the code) · admin edits platform coupons
 *   toggle            → pause / resume (a coupon paused by the admin cannot be resumed by the merchant)
 *   cancel            → permanent cancel (owner, or admin for ANY coupon)
 *   adminDisable      → admin pauses any merchant's coupon (reason is sent to the merchant)
 *   adminEnable       → admin lifts that pause
 *   adminSetEnabled   → admin: global switch for all coupons & discounts  (settings/platform.COUPONS_ENABLED)
 */
import { verifyIdToken, fsGet, fsSet, fsCreate, fsQuery } from '../_shared/gcp.js';
import { validateCouponInput, couponBlockReason, normCode } from '../_shared/coupons.js';

const MAX_PER_SELLER = 200;
const json = (status, headers, obj) => new Response(JSON.stringify(obj), { status, headers });
const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: String(value) } } });
const toMs = (t) => { if (!t) return 0; const n = (t instanceof Date ? t : new Date(t)).getTime(); return Number.isNaN(n) ? 0 : n; };
const isPlatform = (c) => !c.scope || c.scope === 'platform';
const safeId = (v) => { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_-]{1,200}$/.test(s) ? s : null; };

export const publicCoupon = (c) => ({
    id: c.id, scope: isPlatform(c) ? 'platform' : 'store', sellerId: c.sellerId || '', sellerName: c.sellerName || '',
    code: c.code || '', auto: c.auto === true, title: c.title || '', type: c.type === 'fixed' ? 'fixed' : 'percent', value: Number(c.value) || 0,
    minOrder: Number(c.minOrder) || 0, usageLimit: Number(c.usageLimit) || 0, usageCount: Number(c.usageCount) || 0,
    perUserLimit: c.perUserLimit === undefined || c.perUserLimit === null ? (isPlatform(c) ? 1 : 0) : Number(c.perUserLimit) || 0,
    startsAt: toMs(c.startsAt), expiresAt: toMs(c.expiresAt), createdAt: toMs(c.createdAt),
    active: c.active !== false, disabledByAdmin: c.disabledByAdmin === true, disabledReason: c.disabledReason || '',
    cancelled: c.cancelled === true, discountTotal: Number(c.discountTotal) || 0,
    state: couponBlockReason(c) || 'live',
});

async function notify(env, userId, title, message) {
    try { await fsCreate(env, 'notifications', { userId, type: 'coupon', title, message, read: false, createdAt: new Date() }); }
    catch (e) { console.warn('[coupons] notify failed:', e.message); }
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
        const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const auth = idToken ? await verifyIdToken(idToken, env) : null;
        if (!auth) return json(401, CORS, { error: 'سجّل دخولك الأول' });
        let body;
        try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
        const action = String(body.action || '');

        const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
        const adminUids = (env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
        const isAdmin = adminUids.includes(auth.uid) || (user && user.role === 'admin');
        const isSeller = isAdmin || (user && user.role === 'seller');

        const settings = await fsGet(env, 'settings/platform').catch(() => null);
        const enabled = !(settings && settings.COUPONS_ENABLED === false);

        const storeEnabled = !!(user && user.couponsEnabled === true);
        if (action === 'config') return json(200, CORS, { success: true, enabled, storeEnabled });

        // ── admin: global switch ───────────────────────────────────────────────────────────────
        if (action === 'adminSetEnabled') {
            if (!isAdmin) return json(403, CORS, { error: 'Forbidden: Admin access only' });
            const on = body.enabled === true;
            await fsSet(env, 'settings/platform', { COUPONS_ENABLED: on, couponsToggledBy: auth.uid, couponsToggledAt: new Date() }, true);
            return json(200, CORS, { success: true, enabled: on });
        }

        if (!isSeller) return json(403, CORS, { error: 'الكوبونات للتجار والإدارة بس' });

        // ── merchant switch (default OFF): nothing of his applies at checkout until he turns it on ──
        if (action === 'setStoreEnabled') {
            if (!user || user.role !== 'seller') return json(403, CORS, { error: 'للبائعين بس' });
            const on = body.enabled === true;
            await fsSet(env, `users/${auth.uid}`, { couponsEnabled: on, updatedAt: new Date() }, true);
            return json(200, CORS, { success: true, storeEnabled: on });
        }

        // ── list ───────────────────────────────────────────────────────────────────────────────
        if (action === 'list') {
            const q = { from: [{ collectionId: 'coupons' }], limit: isAdmin ? 500 : MAX_PER_SELLER };
            if (!isAdmin) q.where = eq('sellerId', auth.uid);
            const rows = ((await fsQuery(env, q).catch(() => [])) || []).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
            const items = rows.map(publicCoupon);
            if (isAdmin) {                                   // merchant names for the admin table
                const names = {};
                for (const sid of [...new Set(items.map((i) => i.sellerId).filter(Boolean))].slice(0, 60)) {
                    const u = await fsGet(env, `users/${sid}`).catch(() => null);
                    names[sid] = (u && (u.name || u.displayName)) || sid.slice(0, 6);
                }
                items.forEach((i) => { if (i.sellerId) i.sellerName = names[i.sellerId] || ''; });
            }
            return json(200, CORS, { success: true, enabled, storeEnabled, items });
        }

        // ── create ─────────────────────────────────────────────────────────────────────────────
        if (action === 'create') {
            const scope = isAdmin && body.scope === 'platform' ? 'platform' : 'store';
            if (scope === 'store') {
                if (!user || user.role !== 'seller') return json(403, CORS, { error: 'لازم تكون بائع موثّق' });
                const trust = await fsGet(env, `trust/${auth.uid}`).catch(() => null);
                if (trust && trust.sellerBlocked) return json(403, CORS, { error: 'حسابك موقوف كبائع حاليًا' });
            }
            const v = validateCouponInput(body, { scope });
            if (v.error) return json(400, CORS, { error: v.error });
            const d = v.ok;

            let docId;
            if (scope === 'platform') {
                if (d.auto) return json(400, CORS, { error: 'كوبون المنصة لازم يكون له كود' });
                const same = ((await fsQuery(env, { from: [{ collectionId: 'coupons' }], where: eq('code', d.code), limit: 30 }).catch(() => [])) || []);
                if (same.some((c) => isPlatform(c) && c.cancelled !== true)) return json(409, CORS, { error: 'الكود ده موجود بالفعل' });
                docId = d.code;
            } else {
                const mine = ((await fsQuery(env, { from: [{ collectionId: 'coupons' }], where: eq('sellerId', auth.uid), limit: MAX_PER_SELLER + 1 }).catch(() => [])) || []);
                if (mine.length >= MAX_PER_SELLER) return json(429, CORS, { error: 'وصلت للحد الأقصى من الكوبونات — الغي القديم الأول' });
                if (!d.auto) {
                    const same = ((await fsQuery(env, { from: [{ collectionId: 'coupons' }], where: eq('code', d.code), limit: 30 }).catch(() => [])) || []);
                    if (same.some((c) => isPlatform(c) && c.cancelled !== true)) return json(409, CORS, { error: 'الكود ده محجوز للمنصة — اختار كود تاني' });
                    if (same.some((c) => c.sellerId === auth.uid && c.cancelled !== true)) return json(409, CORS, { error: 'عندك كوبون بنفس الكود' });
                }
                docId = d.auto ? `a_${auth.uid}_${Date.now().toString(36)}` : `s_${auth.uid}_${d.code}`;
            }
            const doc = {
                scope, code: d.code, auto: d.auto, title: d.title, type: d.type, value: d.value, minOrder: d.minOrder,
                usageLimit: d.usageLimit, perUserLimit: d.perUserLimit, usageCount: 0, discountTotal: 0,
                active: true, disabledByAdmin: false, cancelled: false,
                createdBy: auth.uid, createdAt: new Date(), updatedAt: new Date(),
                ...(scope === 'store' ? { sellerId: auth.uid } : {}),
                ...(d.startsAt ? { startsAt: d.startsAt } : {}), ...(d.expiresAt ? { expiresAt: d.expiresAt } : {}),
            };
            try { await fsCreate(env, 'coupons', doc, docId); }
            catch (e) { return json(409, CORS, { error: 'الكود ده اتستخدم قبل كده — اختار كود تاني' }); }
            return json(200, CORS, { success: true, id: docId });
        }

        // ── everything below targets one existing coupon ───────────────────────────────────────
        const id = safeId(body.id);
        if (!id) return json(400, CORS, { error: 'id غير صالح' });
        const c = await fsGet(env, `coupons/${id}`);
        if (!c) return json(404, CORS, { error: 'الكوبون غير موجود' });
        const isOwner = !isPlatform(c) && c.sellerId === auth.uid;

        if (action === 'adminDisable' || action === 'adminEnable') {
            if (!isAdmin) return json(403, CORS, { error: 'Forbidden: Admin access only' });
            if (c.cancelled === true) return json(409, CORS, { error: 'الكوبون ده اتلغى' });
            const dis = action === 'adminDisable';
            const reason = String(body.reason || '').replace(/[<>]/g, '').trim().slice(0, 200);
            await fsSet(env, `coupons/${id}`, { disabledByAdmin: dis, disabledReason: dis ? reason : '', disabledBy: auth.uid, updatedAt: new Date() }, true);
            if (c.sellerId) await notify(env, c.sellerId, dis ? '⛔ الإدارة أوقفت كوبون' : '✅ الإدارة فعّلت كوبون',
                `${c.auto ? (c.title || 'الخصم التلقائي') : 'كوبون ' + (c.code || '')}${dis && reason ? ' — السبب: ' + reason : ''}`);
            return json(200, CORS, { success: true });
        }

        if (action === 'cancel') {
            if (!isAdmin && !isOwner) return json(403, CORS, { error: 'مش مسموح لك' });
            if (c.cancelled === true) return json(200, CORS, { success: true });
            await fsSet(env, `coupons/${id}`, { cancelled: true, active: false, cancelledBy: auth.uid, cancelledAt: new Date(), updatedAt: new Date() }, true);
            if (isAdmin && !isOwner && c.sellerId) await notify(env, c.sellerId, '🚫 الإدارة ألغت كوبون', `${c.auto ? (c.title || 'الخصم التلقائي') : 'كوبون ' + (c.code || '')}`);
            return json(200, CORS, { success: true });
        }

        // merchant edits/toggles his own; admin edits platform coupons
        if (!(isOwner || (isAdmin && isPlatform(c)))) return json(403, CORS, { error: 'مش مسموح لك تعدّل الكوبون ده' });
        if (c.cancelled === true) return json(409, CORS, { error: 'الكوبون ده اتلغى' });

        if (action === 'toggle') {
            const on = body.active === true;
            if (on && c.disabledByAdmin === true && !isAdmin) return json(403, CORS, { error: 'الإدارة موقفة الكوبون ده — مينفعش تشغّله' });
            await fsSet(env, `coupons/${id}`, { active: on, updatedAt: new Date() }, true);
            return json(200, CORS, { success: true, active: on });
        }

        if (action === 'update') {
            const scope = isPlatform(c) ? 'platform' : 'store';
            const v = validateCouponInput({ ...body, code: c.code, auto: c.auto === true }, { scope });
            if (v.error) return json(400, CORS, { error: v.error });
            const d = v.ok;
            await fsSet(env, `coupons/${id}`, {
                title: d.title, type: d.type, value: d.value, minOrder: d.minOrder, usageLimit: d.usageLimit, perUserLimit: d.perUserLimit,
                startsAt: d.startsAt, expiresAt: d.expiresAt, updatedAt: new Date(),
            }, true);
            return json(200, CORS, { success: true });
        }

        return json(400, CORS, { error: 'Unknown action' });
    } catch (err) {
        console.error('[coupons]', err && err.message ? err.message : err);
        return json(500, CORS, { error: 'حصل خطأ في السيرفر — حاول تاني' });
    }
}
