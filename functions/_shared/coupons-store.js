/**
 * functions/_shared/coupons-store.js — loads usable coupons for a payment + records their use.
 * Used by functions/api/payment.js (pricing at checkout / preview / finalize) and functions/api/coupons.js.
 * Coupons are written ONLY by functions/api/coupons.js (service account) — browsers cannot touch them.
 */
import { fsGet, fsQuery, fsCreate, fsCommit, writeIncrement } from './gcp.js';
import { normCode, couponBlockReason, REASON_AR } from './coupons.js';

const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: String(value) } } });
const isPlatform = (c) => !c.scope || c.scope === 'platform';

async function timesUsedBy(env, couponId, uid) {
    const rows = await fsQuery(env, {
        from: [{ collectionId: 'coupon_uses' }],
        where: { compositeFilter: { op: 'AND', filters: [eq('couponId', couponId), eq('uid', uid)] } },
        limit: 50,
    }).catch(() => []);
    return (rows || []).length;
}

// a merchant's coupons / automatic discounts only work after HE switched them on (default OFF)
async function merchantsWithCouponsOn(env, sellers) {
    const on = new Set();
    for (const sid of sellers) {
        const u = await fsGet(env, `users/${sid}`).catch(() => null);
        if (u && u.couponsEnabled === true) on.add(sid);
    }
    return on;
}

async function perUserBlocked(env, c, uid) {
    const lim = c.perUserLimit === undefined || c.perUserLimit === null ? (isPlatform(c) ? 1 : 0) : Number(c.perUserLimit) || 0;
    if (!lim || !uid) return false;
    return (await timesUsedBy(env, c.id, uid)) >= lim;
}

/**
 * @returns {{ storeCoupons: object[], platformCoupon: object|null, error: string|null }}
 *  - automatic store discounts (no code) of the merchants in the cart are always considered
 *  - `code` (what the buyer typed) may match a platform coupon or store coupons of the merchants in the cart
 *  - `error` is only set when a code was typed and could not be used (a human-readable Arabic reason)
 */
export async function loadCouponsForPayment(env, { code, sellerIds, uid }) {
    const out = { storeCoupons: [], platformCoupon: null, error: null };
    const sellers = [...new Set((sellerIds || []).filter(Boolean))];
    const sellersOn = await merchantsWithCouponsOn(env, sellers);

    // automatic discounts of the merchants being bought from
    for (const sid of sellers) {
        if (!sellersOn.has(sid)) continue;
        const rows = await fsQuery(env, { from: [{ collectionId: 'coupons' }], where: eq('sellerId', sid), limit: 100 }).catch(() => []);
        for (const c of rows || []) {
            if (c.scope !== 'store' || c.auto !== true) continue;
            if (couponBlockReason(c)) continue;
            if (await perUserBlocked(env, c, uid)) continue;
            out.storeCoupons.push(c);
        }
    }

    const typed = normCode(code);
    if (!typed) return out;
    const rows = (await fsQuery(env, { from: [{ collectionId: 'coupons' }], where: eq('code', typed), limit: 30 }).catch(() => [])) || [];
    const candidates = rows.filter((c) => c.auto !== true);
    if (!candidates.length) { out.error = REASON_AR.not_found; return out; }

    // a platform coupon with this code always wins over merchants' coupons with the same code
    const plat = candidates.find(isPlatform);
    if (plat) {
        const why = couponBlockReason(plat) || ((await perUserBlocked(env, plat, uid)) ? 'per_user' : null);
        if (why) out.error = REASON_AR[why] || REASON_AR.not_found; else out.platformCoupon = plat;
        return out;
    }
    const inCart = candidates.filter((c) => sellers.includes(c.sellerId));
    if (!inCart.length) { out.error = REASON_AR.not_applicable; return out; }
    if (!inCart.some((c) => sellersOn.has(c.sellerId))) { out.error = REASON_AR.merchant_off; return out; }
    let firstWhy = null;
    for (const c of inCart.filter((x) => sellersOn.has(x.sellerId))) {
        const why = couponBlockReason(c) || ((await perUserBlocked(env, c, uid)) ? 'per_user' : null);
        if (why) { firstWhy = firstWhy || why; continue; }
        out.storeCoupons.push(c);
    }
    if (!out.storeCoupons.some((c) => !c.auto && normCode(c.code) === typed)) out.error = REASON_AR[firstWhy] || REASON_AR.not_found;
    return out;
}

/**
 * Called once a payment is confirmed (finalizePendingPayment). Idempotent: one `coupon_uses` doc per (payment, coupon),
 * created with a fixed id — a retried webhook can never count the same use twice.
 */
export async function recordCouponUses(env, pendingId, uid, applied) {
    for (const a of applied || []) {
        if (!a || !a.id) continue;
        try {
            await fsCreate(env, 'coupon_uses', {
                couponId: a.id, uid, pendingId, scope: a.scope, code: a.code || '', sellerId: a.sellerId || '',
                amount: Number(a.amount) || 0, createdAt: new Date(),
            }, `${pendingId}_${a.id}`.slice(0, 200));
        } catch (_) { continue; }                       // already recorded
        try { await fsCommit(env, [writeIncrement(env, `coupons/${a.id}`, 'usageCount', 1), writeIncrement(env, `coupons/${a.id}`, 'discountTotal', Number(a.amount) || 0)]); }
        catch (e) { console.warn('[coupons] usage increment failed:', e.message); }
    }
}
