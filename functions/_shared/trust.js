/**
 * functions/_shared/trust.js — dispute rules + per-user fault record.
 * The `trust/{uid}` documents are written ONLY from here (service account);
 * firestore.rules gives clients read-only access to their own record.
 */
import { fsGet, fsQuery, fsSet, fsCommit, writeIncrement, writeUpdate, writeCreate } from './gcp.js';

export const REASONS = {
    not_arrived:      { ar: 'المنتج لم يصلني',                       fault: 'seller', evidence: false },
    damaged:          { ar: 'المنتج وصل تالف أو مكسور',               fault: 'seller', evidence: true  },
    wrong_item:       { ar: 'استلمت منتج مختلف عن المطلوب',           fault: 'seller', evidence: true  },
    not_as_described: { ar: 'المنتج غير مطابق للوصف',                 fault: 'seller', evidence: true  },
    changed_mind:     { ar: 'وصلني ومعجبنيش (المنتج مطابق للوصف)',    fault: 'buyer',  evidence: true  },
    other:            { ar: 'سبب آخر',                                fault: 'unclear', evidence: true },
};

export async function getDisputeCfg(env) {
    const d = await fsGet(env, 'settings/platform').catch(() => null) || {};
    const num = (v, def) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : def);
    return {
        NONRECEIPT_ENABLED: d.NONRECEIPT_ENABLED !== false,
        RETURN_SHIPPING_FEE: Math.max(0, num(d.RETURN_SHIPPING_FEE, 0)),
        SELLER_RESPONSE_HOURS: Math.max(1, num(d.SELLER_RESPONSE_HOURS, 48)),
        SELLER_MAX_FAULTS: Math.max(1, num(d.SELLER_MAX_FAULTS, 3)),
        BUYER_MAX_FAULTS: Math.max(1, num(d.BUYER_MAX_FAULTS, 3)),
        SHIPPED_LATE_DAYS: Math.max(1, num(d.SHIPPED_LATE_DAYS, 7)),
        RETURN_WINDOW_DAYS: Math.max(0, num(d.RETURN_WINDOW_DAYS, 14)),
    };
}

/** Admin ruled: record who was at fault and apply the automatic penalties. */
export async function recordFault(env, cfg, { outcome, buyerId, sellerId }) {
    // outcome: 'seller_fault' (full refund) | 'buyer_fault' (refund minus shipping / seller paid)
    const writes = [];
    if (outcome === 'seller_fault' && sellerId) {
        writes.push(writeIncrement(env, `trust/${sellerId}`, 'sellerFaults', 1));
    } else if (outcome === 'buyer_fault' && buyerId) {
        writes.push(writeIncrement(env, `trust/${buyerId}`, 'buyerFaults', 1));
    }
    if (writes.length) await fsCommit(env, writes);

    if (outcome === 'seller_fault' && sellerId) {
        const t = await fsGet(env, `trust/${sellerId}`).catch(() => null);
        if ((Number(t && t.sellerFaults) || 0) >= cfg.SELLER_MAX_FAULTS && !(t && t.sellerBlocked)) {
            await fsSet(env, `trust/${sellerId}`, { sellerBlocked: true, blockedAt: new Date(), blockReason: `${cfg.SELLER_MAX_FAULTS} نزاعات حُكم فيها ضد البائع` }, true);
            const rows = await fsQuery(env, { from: [{ collectionId: 'services' }],
                where: { fieldFilter: { field: { fieldPath: 'sellerId' }, op: 'EQUAL', value: { stringValue: sellerId } } }, limit: 500 });
            for (const s of rows) {
                if (s.active !== false) await fsSet(env, `services/${s.id}`, { active: false, status: 'paused', pausedByTrust: true, updatedAt: new Date() }, true);
            }
            await fsCommit(env, [writeCreate(env, `notifications/${crypto.randomUUID()}`, {
                userId: sellerId, type: 'seller_blocked', title: '⛔ تم إيقاف حسابك كبائع مؤقتًا',
                message: `تم إيقاف منتجاتك بعد ${cfg.SELLER_MAX_FAULTS} نزاعات حُكم فيها ضدك. تواصل مع الإدارة لمراجعة حسابك.`, read: false, createdAt: new Date(),
            })]);
        }
    }
}

export async function isBuyerBlocked(env, cfg, uid) {
    const t = await fsGet(env, `trust/${uid}`).catch(() => null);
    return (Number(t && t.buyerFaults) || 0) >= cfg.BUYER_MAX_FAULTS;
}
