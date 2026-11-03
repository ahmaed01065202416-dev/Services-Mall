/**
 * functions/_shared/coupons.js — coupon / discount rules (pure functions, no network)
 * ============================================================================
 * Two kinds of coupon (collection `coupons`):
 *   scope 'store'    → created by a merchant for HIS OWN products. The discount comes out of the merchant's price
 *                      (escrow = discounted price, so the merchant receives less). May be a code the buyer types, or an
 *                      AUTOMATIC discount (auto: true, no code) that applies to every purchase from that merchant.
 *   scope 'platform' → created by an admin. The discount is paid from the PERCENTAGE THE PLATFORM TAKES FROM THE BUYER
 *                      (the buyer fee): the merchant still gets the full price and the discount can never exceed that
 *                      fee, so the buyer always pays at least the escrow amount. Legacy coupons with no `scope` are
 *                      platform coupons.
 *
 * Switches:
 *   • settings/platform.COUPONS_ENABLED  (admin master switch) — when off, NO discount of any kind is applied.
 *   • users/{merchant}.couponsEnabled    (default OFF) — the merchant turns his own coupons / automatic discounts on.
 *     Platform coupons do not depend on it.
 * An admin can pause (disabledByAdmin) or cancel (cancelled) any coupon of any merchant.
 *
 * Money model (see payment.js):
 *   buyer pays   = Σ price(after store discount) + online shipping + buyer fee − platform discount   (discount ≤ buyer fee)
 *   escrow       = price(after store discount) + online shipping          (seller fee is taken at release)
 *   platform gets= buyer fee − platform discount + seller fee             (never negative)
 */

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const MAX_PERCENT = 90;                 // a coupon can never make a line free
const MAX_FIXED = 100000;

export function normCode(c) {
    return String(c == null ? '' : c).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
}

const toMs = (t) => {
    if (!t) return 0;
    if (t instanceof Date) return t.getTime() || 0;
    const n = new Date(t).getTime();
    return Number.isNaN(n) ? 0 : n;
};

/** Why a coupon cannot be used right now (null = usable). */
export function couponBlockReason(c, now = Date.now()) {
    if (!c) return 'not_found';
    if (c.cancelled === true) return 'cancelled';
    if (c.disabledByAdmin === true) return 'disabled_by_admin';
    if (c.active === false) return 'inactive';
    const s = toMs(c.startsAt), e = toMs(c.expiresAt);
    if (s && now < s) return 'not_started';
    if (e && now > e) return 'expired';
    const lim = Number(c.usageLimit) || 0;
    if (lim > 0 && (Number(c.usageCount) || 0) >= lim) return 'exhausted';
    return null;
}

export const REASON_AR = {
    not_found: 'كوبون غير صحيح',
    cancelled: 'الكوبون ده اتلغى',
    disabled_by_admin: 'الكوبون ده موقوف حاليًا',
    inactive: 'الكوبون ده موقوف حاليًا',
    not_started: 'الكوبون لسه مابدأش',
    expired: 'الكوبون انتهت مدته',
    exhausted: 'الكوبون خلص عدد مرات استخدامه',
    per_user: 'استخدمت الكوبون ده قبل كده',
    min_order: 'قيمة الطلب أقل من الحد الأدنى للكوبون',
    disabled_all: 'الكوبونات والخصومات متوقفة حاليًا',
    not_applicable: 'الكوبون ده مش بينطبق على المنتجات اللي في طلبك',
    merchant_off: 'التاجر مش مفعّل الكوبونات حاليًا',
    own_store: 'مينفعش تستخدم كوبون متجرك',
};

/** Validate the fields a merchant/admin sends when creating a coupon. */
export function validateCouponInput(b, { scope }) {
    const auto = scope === 'store' && b.auto === true;
    let code = '';
    if (!auto) {
        code = normCode(b.code);
        if (code.length < 3) return { error: 'كود الكوبون لازم يكون 3 حروف/أرقام إنجليزي على الأقل' };
    }
    const type = b.type === 'fixed' ? 'fixed' : (b.type === 'percent' ? 'percent' : null);
    if (!type) return { error: 'نوع الخصم لازم نسبة أو مبلغ ثابت' };
    const value = Number(b.value);
    if (!Number.isFinite(value) || value <= 0) return { error: 'قيمة الخصم غير صحيحة' };
    if (type === 'percent' && value > MAX_PERCENT) return { error: `نسبة الخصم لا تزيد عن ${MAX_PERCENT}%` };
    if (type === 'fixed' && value > MAX_FIXED) return { error: 'مبلغ الخصم كبير جدًا' };
    const minOrder = b.minOrder === '' || b.minOrder == null ? 0 : Number(b.minOrder);
    if (!Number.isFinite(minOrder) || minOrder < 0) return { error: 'الحد الأدنى للطلب غير صحيح' };
    const usageLimit = b.usageLimit === '' || b.usageLimit == null ? 0 : Math.floor(Number(b.usageLimit));
    if (!Number.isFinite(usageLimit) || usageLimit < 0) return { error: 'عدد مرات الاستخدام غير صحيح' };
    const perUserLimit = b.perUserLimit === '' || b.perUserLimit == null ? 1 : Math.floor(Number(b.perUserLimit));
    if (!Number.isFinite(perUserLimit) || perUserLimit < 0 || perUserLimit > 1000) return { error: 'حد الاستخدام لكل عميل غير صحيح' };
    const startsAt = b.startsAt ? toMs(b.startsAt) : 0;
    const expiresAt = b.expiresAt ? toMs(b.expiresAt) : 0;
    if (b.startsAt && !startsAt) return { error: 'تاريخ البداية غير صحيح' };
    if (b.expiresAt && !expiresAt) return { error: 'تاريخ الانتهاء غير صحيح' };
    if (startsAt && expiresAt && expiresAt <= startsAt) return { error: 'تاريخ الانتهاء لازم يكون بعد البداية' };
    const title = String(b.title == null ? '' : b.title).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (auto && !title) return { error: 'اكتب اسم للخصم التلقائي (يظهر للعميل)' };
    return {
        ok: {
            code, auto, type, value: r2(value), minOrder: r2(minOrder), usageLimit, perUserLimit, title,
            startsAt: startsAt ? new Date(startsAt) : null, expiresAt: expiresAt ? new Date(expiresAt) : null,
        },
    };
}

function rawDiscount(c, base) {
    const v = Number(c.value) || 0;
    return c.type === 'percent' ? base * v / 100 : v;
}

/** Spread `total` over `weights` (rounded to cents, last one takes the remainder). */
export function distribute(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    const out = [];
    let used = 0;
    weights.forEach((w, i) => {
        if (i === weights.length - 1) out.push(r2(total - used));
        else { const part = sum > 0 ? r2(total * w / sum) : 0; out.push(part); used = r2(used + part); }
    });
    return out;
}

/**
 * Price a payment with discounts.
 *   lines          [{ key, sellerId, price, shipOnline, dropship? }]  (list prices, straight from the services)
 *   storeCoupons   usable store-scope coupons that could apply (code-matched ones + automatic ones), each with .sellerId
 *   platformCoupon one usable platform coupon or null
 *   fees           { buyerFee(amount) }  — platform fee function (buyer side)
 * Returns the final per-line prices, totals and what was applied. Never throws; problems come back in `notes`.
 */
export function priceWithCoupons({ lines, storeCoupons = [], platformCoupon = null, fees }) {
    const notes = [];
    const out = lines.map((l) => ({
        key: l.key, sellerId: l.sellerId || '', dropship: !!l.dropship,
        listPrice: r2(l.price), price: r2(l.price), shipOnline: r2(l.shipOnline || 0),
        storeDiscount: 0, storeCouponId: '', storeCouponCode: '', platformDiscount: 0,
    }));
    const applied = [];

    // ── 1) store discounts: best single coupon per merchant ────────────────────────────────────────────
    const bySeller = new Map();
    out.forEach((l) => { if (!bySeller.has(l.sellerId)) bySeller.set(l.sellerId, []); bySeller.get(l.sellerId).push(l); });
    for (const [sellerId, group] of bySeller) {
        const base = r2(group.reduce((a, l) => a + l.listPrice, 0));
        let best = null, bestAmt = 0, minFail = false;
        for (const c of storeCoupons) {
            if (c.sellerId !== sellerId) continue;
            if ((Number(c.minOrder) || 0) > base) { minFail = true; continue; }
            const amt = Math.min(r2(rawDiscount(c, base)), r2(base * MAX_PERCENT / 100));
            if (amt > bestAmt) { best = c; bestAmt = amt; }
        }
        if (!best) { if (minFail) notes.push('min_order'); continue; }
        const parts = distribute(bestAmt, group.map((l) => l.listPrice));
        group.forEach((l, i) => {
            l.storeDiscount = parts[i]; l.price = r2(l.listPrice - parts[i]);
            l.storeCouponId = best.id || ''; l.storeCouponCode = best.auto ? '' : (best.code || '');
        });
        applied.push({ scope: 'store', id: best.id || '', code: best.auto ? '' : (best.code || ''), title: best.title || '', auto: !!best.auto, sellerId, amount: bestAmt });
    }

    const priceSum = r2(out.reduce((a, l) => a + l.price, 0));
    const shipSum = r2(out.reduce((a, l) => a + l.shipOnline, 0));
    const listSum = r2(out.reduce((a, l) => a + l.listPrice, 0));
    const storeDiscount = r2(listSum - priceSum);
    const buyerFee = r2(fees.buyerFee(priceSum));

    // ── 2) platform discount: paid from the buyer-side percentage the platform takes ───────────────────
    let platformDiscount = 0;
    if (platformCoupon) {
        if ((Number(platformCoupon.minOrder) || 0) > priceSum) notes.push('min_order');
        else {
            const raw = r2(rawDiscount(platformCoupon, priceSum));
            const cap = Math.min(buyerFee, r2(priceSum + shipSum + buyerFee - 1));
            platformDiscount = Math.max(0, Math.min(raw, cap));
            if (platformDiscount > 0) {
                const shares = distribute(platformDiscount, out.map((l) => l.price + l.shipOnline));
                out.forEach((l, i) => { l.platformDiscount = shares[i]; });
                applied.push({ scope: 'platform', id: platformCoupon.id || '', code: platformCoupon.code || '', title: platformCoupon.title || '', auto: false, amount: platformDiscount, cappedByCommission: raw > platformDiscount });
            } else if (raw > 0) notes.push('no_commission');
        }
    }

    const total = r2(priceSum + shipSum + buyerFee - platformDiscount);
    return { lines: out, listSum, priceSum, shipSum, storeDiscount, buyerFee, platformDiscount, total, applied, notes };
}
