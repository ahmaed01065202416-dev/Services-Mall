/**
 * functions/_shared/affiliate.js — pure rules of the marketer / external-link program.
 * ============================================================================
 * Model: a marketer lists a product that lives on ANOTHER platform (external link). The customer
 * is sent to that platform and pays there — our order is only a tracking record (affiliate_orders).
 * We earn from the marketer through (admin chooses, any combination):
 *   • a per-order fee (fixed, or tiers by order count)  — counted on click OR on marketer confirmation
 *   • a subscription (marketer_plans) — optional, mandatory only if the admin switches it on
 * Fees accumulate as `owed` in marketer_accounts/{uid}; the marketer settles via wallet or invoice.
 * Everything here is pure / settings-only → unit-testable (tests/affiliate.test.mjs).
 * ============================================================================
 */
import { fsGet } from './gcp.js';

export const DEFAULT_AFF = {
    AFF_ENABLED: false,            // master switch for external-link products
    AFF_COUNT_MODE: 'confirmed',   // 'click' | 'confirmed' — what counts as an order
    AFF_FEE_ENABLED: false,        // per-order fee on/off
    AFF_FEE_MODE: 'fixed',         // 'fixed' | 'tiers'
    AFF_FEE_FIXED: 2,              // EGP per order (fixed mode)
    AFF_FEE_TIERS: '[{"upTo":50,"fee":0},{"upTo":null,"fee":2}]',   // JSON: order #1..upTo costs fee; upTo:null = everything after
    AFF_TIER_PERIOD: 'month',      // 'month' | 'lifetime' — what the order counter is measured over
    AFF_SUB_ENABLED: false,        // subscriptions on/off
    AFF_SUB_REQUIRED: false,       // mandatory? (only effective while AFF_SUB_ENABLED)
    AFF_DEBT_LIMIT: 100,           // EGP owed after which new orders/products are blocked (0 = no limit)
};
const r2 = n => Number(Number(n).toFixed(2));

export function parseTiers(raw) {
    let arr = raw;
    if (typeof raw === 'string') { try { arr = JSON.parse(raw); } catch (_) { arr = null; } }
    if (!Array.isArray(arr)) arr = JSON.parse(DEFAULT_AFF.AFF_FEE_TIERS);
    const out = arr.map(t => ({ upTo: t && t.upTo != null && t.upTo !== '' ? Math.max(1, parseInt(t.upTo, 10) || 1) : null, fee: Math.max(0, r2(t && t.fee) || 0) }))
        .sort((a, b) => (a.upTo == null ? Infinity : a.upTo) - (b.upTo == null ? Infinity : b.upTo));
    return out.length ? out : JSON.parse(DEFAULT_AFF.AFF_FEE_TIERS);
}

export function normalizeAff(d) {
    const o = { ...DEFAULT_AFF };
    if (d) for (const k of Object.keys(DEFAULT_AFF)) if (d[k] !== undefined && d[k] !== null) o[k] = d[k];
    o.AFF_ENABLED = o.AFF_ENABLED === true;
    o.AFF_COUNT_MODE = o.AFF_COUNT_MODE === 'click' ? 'click' : 'confirmed';
    o.AFF_FEE_ENABLED = o.AFF_FEE_ENABLED === true;
    o.AFF_FEE_MODE = o.AFF_FEE_MODE === 'tiers' ? 'tiers' : 'fixed';
    o.AFF_FEE_FIXED = Math.max(0, r2(o.AFF_FEE_FIXED) || 0);
    o.AFF_TIERS = parseTiers(o.AFF_FEE_TIERS);
    o.AFF_TIER_PERIOD = o.AFF_TIER_PERIOD === 'lifetime' ? 'lifetime' : 'month';
    o.AFF_SUB_ENABLED = o.AFF_SUB_ENABLED === true;
    o.AFF_SUB_REQUIRED = o.AFF_SUB_REQUIRED === true;
    o.AFF_DEBT_LIMIT = Math.max(0, r2(o.AFF_DEBT_LIMIT) || 0);
    return o;
}
export async function getAffSettings(env) { return normalizeAff(await fsGet(env, 'settings/platform').catch(() => null)); }

// Firestore field that holds the order counter for the current period.
export function counterField(cfg, now = new Date()) {
    return cfg.AFF_TIER_PERIOD === 'lifetime' ? 'cnt_all' : `cnt_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Fee for the NEXT order, given how many orders were already counted in the period.
export function computeOrderFee(cfg, countBefore) {
    if (!cfg.AFF_FEE_ENABLED) return 0;
    if (cfg.AFF_FEE_MODE === 'fixed') return r2(cfg.AFF_FEE_FIXED);
    const n = (Number(countBefore) || 0) + 1;
    const tier = cfg.AFF_TIERS.find(t => t.upTo == null || n <= t.upTo);
    return r2(tier ? tier.fee : 0);
}

export function toMs(v) { if (!v) return 0; if (typeof v === 'string') return Date.parse(v) || 0; if (v.seconds) return v.seconds * 1000; return +v || 0; }

// Can this marketer add products / receive tracked orders right now?
export function accessStatus(cfg, acct, now = Date.now()) {
    const a = acct || {};
    if (cfg.AFF_SUB_ENABLED && cfg.AFF_SUB_REQUIRED && toMs(a.subscriptionUntil) <= now) return { ok: false, reason: 'subscription', message: 'اشتراك المسوّق منتهي — جدّده علشان تكمّل' };
    if (cfg.AFF_DEBT_LIMIT > 0 && (Number(a.owed) || 0) >= cfg.AFF_DEBT_LIMIT) return { ok: false, reason: 'debt', message: 'عليك مستحقات للمنصة وصلت للحد المسموح — سدّدها علشان تكمّل' };
    return { ok: true };
}
