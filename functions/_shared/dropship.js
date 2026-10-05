/**
 * functions/_shared/dropship.js — pure helpers shared by payment.js and api/dropship.js
 * ============================================================================
 * Dropshipping model (adapted from catalogue-style platforms like Taager):
 *   supplier  → lists products at a WHOLESALE price (collection supplier_products)
 *   reseller  → an existing seller who imports a product as their own listing and
 *               sets the SELLING price (services doc with dropship:true)
 *   buyer     → pays the selling price online through the gateway, into escrow
 *   supplier  → ships (shipping is the SUPPLIER's job) and enters the tracking number
 *   release   → supplier gets the wholesale price, reseller gets margin − commission,
 *               platform gets the commission. A refund returns everything to the buyer
 *               because nothing leaves escrow before release.
 *
 * Nothing here trusts the browser: wholesale cost, supplier identity and stock are
 * always re-read from supplier_products at payment time.
 * ============================================================================
 */
import { fsGet, fsQuery, fsSet, fsCreate } from './gcp.js';

export const DEFAULT_DROPSHIP = {
    DROPSHIP_ENABLED: true,
    DROPSHIP_AUTO_APPROVE_SUPPLIERS: true,   // "suppliers are added automatically"
    DROPSHIP_MIN_MARGIN_PERCENT: 10,         // reseller price must beat wholesale by at least this %…
    DROPSHIP_MIN_MARGIN_FIXED: 1,            // …and at least this many EGP
    DROPSHIP_FEE_BASE: 'margin',             // 'margin' | 'total' — what the platform commission is calculated on
    DROPSHIP_SHIP_SLA_DAYS: 3,               // supplier must ship within N days (reminder after)
};

export async function getDropshipSettings(env) {
    const d = await fsGet(env, 'settings/platform').catch(() => null);
    const out = { ...DEFAULT_DROPSHIP };
    if (d) for (const k of Object.keys(DEFAULT_DROPSHIP)) if (d[k] !== undefined && d[k] !== null) out[k] = d[k];
    out.DROPSHIP_ENABLED = out.DROPSHIP_ENABLED !== false;
    out.DROPSHIP_AUTO_APPROVE_SUPPLIERS = out.DROPSHIP_AUTO_APPROVE_SUPPLIERS !== false;
    out.DROPSHIP_MIN_MARGIN_PERCENT = Math.max(0, Number(out.DROPSHIP_MIN_MARGIN_PERCENT) || 0);
    out.DROPSHIP_MIN_MARGIN_FIXED = Math.max(0, Number(out.DROPSHIP_MIN_MARGIN_FIXED) || 0);
    out.DROPSHIP_FEE_BASE = out.DROPSHIP_FEE_BASE === 'total' ? 'total' : 'margin';
    out.DROPSHIP_SHIP_SLA_DAYS = Math.max(1, Number(out.DROPSHIP_SHIP_SLA_DAYS) || 3);
    return out;
}

const r2 = n => Number(Number(n).toFixed(2));

// Lowest price a reseller may sell at. Always strictly above wholesale.
export function minAllowedPrice(wholesale, ds) {
    const w = Number(wholesale) || 0;
    const margin = Math.max(ds.DROPSHIP_MIN_MARGIN_FIXED, (w * ds.DROPSHIP_MIN_MARGIN_PERCENT) / 100, 0.01);
    return r2(w + margin);
}

// Throws a user-facing Arabic Error if this listing can't be bought right now.
// Returns the live supplier product (the cost of record).
export async function assertDropshipPurchasable(env, svc) {
    const ds = await getDropshipSettings(env);
    if (!ds.DROPSHIP_ENABLED) throw new Error('الدروبشيبنج متوقف حالياً');
    if (!svc.supplierProductId) throw new Error('المنتج غير متاح حالياً');
    const sp = await fsGet(env, `supplier_products/${svc.supplierProductId}`);
    if (!sp || sp.active === false) throw new Error('المنتج غير متاح حالياً');
    const sup = await fsGet(env, `suppliers/${sp.supplierId}`);
    if (!sup || sup.status !== 'active') throw new Error('المورد غير متاح حالياً');
    if (svc.supplierId && svc.supplierId !== sp.supplierId) throw new Error('بيانات المنتج غير متسقة — تواصل مع الدعم');
    if ((Number(sp.stock) || 0) < 1) throw new Error('نفد المخزون');
    if ((Number(svc.price) || 0) < minAllowedPrice(sp.wholesalePrice, ds)) throw new Error('المنتج غير متاح مؤقتاً — السعر قيد التحديث من البائع');
    return { sp, ds };
}

// Money split of a held escrow. Pure → unit-testable.
// calcFee = payment.js's SELLER-side fee function (switchable per side, own % optional, tiers/min/max) — one source of truth.
export function computeSplit(escrow, cfg, ds, calcFee) {
    const total = Number(escrow.amount) || 0;
    const supplierAmount = escrow.supplierId ? r2(Math.max(0, Number(escrow.supplierAmount) || 0)) : 0;
    if (!supplierAmount) {
        const platformFee = calcFee(total, cfg);
        return { supplierAmount: 0, platformFee, sellerAmount: r2(total - platformFee) };
    }
    const margin = r2(Math.max(0, total - supplierAmount));
    const base = ds && ds.DROPSHIP_FEE_BASE === 'total' ? total : margin;
    const platformFee = r2(Math.min(calcFee(base, cfg), margin));    // reseller can never end up negative
    return { supplierAmount, platformFee, sellerAmount: r2(margin - platformFee) };
}

// Keep every reseller listing of a supplier product consistent with it:
// stock mirrored, out-of-stock / below-cost listings paused, restocked ones reopened.
export async function syncListings(env, supplierProductId, sp, ds, notify) {
    const rows = await fsQuery(env, {
        from: [{ collectionId: 'services' }],
        where: { fieldFilter: { field: { fieldPath: 'supplierProductId' }, op: 'EQUAL', value: { stringValue: supplierProductId } } },
        limit: 1000,
    });
    const stock = Math.max(0, Number(sp.stock) || 0);
    const floor = minAllowedPrice(sp.wholesalePrice, ds);
    let paused = 0, reopened = 0;
    for (const s of rows) {
        const reasons = [];
        if (sp.active === false) reasons.push('inactive');
        if (stock < 1) reasons.push('stock');
        if ((Number(s.price) || 0) < floor) reasons.push('price');
        const upd = { stockLimit: stock, dropshipFloorPrice: floor };
        if (reasons.length) {
            if (s.active !== false) { upd.active = false; upd.dropshipPaused = reasons[0]; paused++;
                if (notify && s.sellerId) await notify(s.sellerId, '⏸ تم إيقاف منتج دروبشيبنج',
                    reasons.includes('price') ? `رفع المورد سعر الجملة — عدّل سعر "${s.title}" لأعلى من ${floor} ج.م ليعود للبيع.`
                    : reasons.includes('stock') ? `نفد مخزون "${s.title}" عند المورد.` : `المورد أوقف "${s.title}".`, { serviceId: s.id }); }
        } else if (s.active === false && s.dropshipPaused) {
            upd.active = true; upd.dropshipPaused = null; reopened++;
        }
        await fsSet(env, `services/${s.id}`, upd, true);
    }
    return { listings: rows.length, paused, reopened };
}

export { fsCreate };
