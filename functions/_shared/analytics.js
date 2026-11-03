/**
 * functions/_shared/analytics.js — visitor / customer analytics maths (pure functions, no network)
 * ============================================================================
 * Data model (written by functions/api/analytics.js, read only by it — browsers have no access):
 *   visitors/{vid}                 one per browser: firstDay, lastDay, days[] (visit days), visits, uid (once logged in)
 *   store_visitors/{sellerId_vid}  the same, per merchant store the visitor looked at: sellerId, vid, uid?, days[], views
 *   analytics_daily/{day}          platform counters per day: visitors, newVisitors, returningVisitors
 *   store_daily/{sellerId_day}     the same per merchant
 * A "day" is a Cairo calendar day written YYYYMMDD. No IP address and no user-agent are stored.
 * Purchases are NOT tracked here — they come from the real `orders` (paymentStatus 'paid', not refunded/cancelled).
 */

export const RETENTION_WINDOWS = [1, 7, 30];
const DAY_CAP = 400;

export function dayKey(ms = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(new Date(ms)).replace(/-/g, '');
}
export function dayNum(k) {
    const s = String(k);
    return Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) / 864e5);
}
export const dayDiff = (a, b) => dayNum(b) - dayNum(a);
export const dayMinus = (k, n) => dayKey(Date.UTC(+String(k).slice(0, 4), +String(k).slice(4, 6) - 1, +String(k).slice(6, 8), 12) - n * 864e5);

/** Record a visit on `today`. Returns { days, isNewVisitor, isNewDay } */
export function recordDay(days, today) {
    const list = Array.isArray(days) ? days.map(String) : [];
    if (!list.length) return { days: [today], isNewVisitor: true, isNewDay: true };
    if (list.includes(today)) return { days: list, isNewVisitor: false, isNewDay: false };
    return { days: [...list, today].slice(-DAY_CAP), isNewVisitor: false, isNewDay: true };
}

/**
 * Retention: "came back within N days" — of the visitors whose FIRST visit was at least N days ago, how many visited
 * again on any later day that is at most N days after their first visit.
 * rows: [{ days:[YYYYMMDD…] }]
 */
export function retention(rows, today, windows = RETENTION_WINDOWS) {
    return windows.map((w) => {
        let eligible = 0, returned = 0;
        for (const r of rows) {
            const d = (r.days || []).map(String).sort();
            if (!d.length) continue;
            const first = d[0];
            if (dayDiff(first, today) < w) continue;
            eligible++;
            if (d.some((x) => { const g = dayDiff(first, x); return g > 0 && g <= w; })) returned++;
        }
        return { days: w, eligible, returned, rate: eligible ? Math.round((returned / eligible) * 1000) / 10 : null };
    });
}

/** new vs returning among the rows that have a visit within the last `periodDays` days (inclusive of today) */
export function visitorSplit(rows, today, periodDays = 30) {
    let total = 0, fresh = 0, returning = 0;
    for (const r of rows) {
        const d = (r.days || []).map(String).sort();
        if (!d.length) continue;
        const last = d[d.length - 1];
        if (dayDiff(last, today) >= periodDays) continue;          // not active in the period
        total++;
        if (dayDiff(d[0], today) < periodDays && d.length === 1) fresh++;      // first and only visit inside the period
        else returning++;                                           // visited on 2+ days, or first came before the period
    }
    return { total, new: fresh, returning };
}

const COUNTS = (o) => o && o.paymentStatus === 'paid' && o.status !== 'refunded' && o.status !== 'cancelled';
const ms = (t) => { if (!t) return 0; if (typeof t === 'number') return t; const n = new Date(t).getTime(); return Number.isNaN(n) ? 0 : n; };
export const isPurchase = COUNTS;

/** Customer behaviour from real orders: who bought, who came back, how long between orders. */
export function customerStats(orders, { topN = 10 } = {}) {
    const by = new Map();
    for (const o of orders) {
        if (!COUNTS(o) || !o.buyerId) continue;
        const e = by.get(o.buyerId) || { buyerId: o.buyerId, orders: [], spent: 0, stores: new Set() };
        e.orders.push(ms(o.createdAt)); e.spent += Number(o.price) || 0; if (o.sellerId) e.stores.add(o.sellerId);
        by.set(o.buyerId, e);
    }
    const buyers = [...by.values()];
    const repeat = buyers.filter((b) => b.orders.length >= 2);
    const gaps = [];
    for (const b of repeat) { const t = b.orders.filter(Boolean).sort((a, c) => a - c); for (let i = 1; i < t.length; i++) gaps.push((t[i] - t[i - 1]) / 864e5); }
    const avgGapDays = gaps.length ? Math.round((gaps.reduce((a, c) => a + c, 0) / gaps.length) * 10) / 10 : null;
    return {
        buyers: buyers.length, repeatBuyers: repeat.length,
        repeatRate: buyers.length ? Math.round((repeat.length / buyers.length) * 1000) / 10 : 0,
        orders: buyers.reduce((a, b) => a + b.orders.length, 0), revenue: Math.round(buyers.reduce((a, b) => a + b.spent, 0) * 100) / 100,
        avgGapDays,
        top: repeat.sort((a, b) => b.orders.length - a.orders.length || b.spent - a.spent).slice(0, topN)
            .map((b) => ({ buyerId: b.buyerId, orders: b.orders.length, spent: Math.round(b.spent * 100) / 100, lastAt: Math.max(...b.orders), stores: b.stores.size })),
        buyerIds: new Set(buyers.map((b) => b.buyerId)),
        storesByBuyer: by,
    };
}

/** Group orders by merchant and run customerStats on each → comparison table (admin). */
export function compareStores(orders) {
    const groups = new Map();
    for (const o of orders) { if (!o.sellerId) continue; if (!groups.has(o.sellerId)) groups.set(o.sellerId, []); groups.get(o.sellerId).push(o); }
    return [...groups.entries()].map(([sellerId, list]) => {
        const c = customerStats(list, { topN: 0 });
        return { sellerId, buyers: c.buyers, repeatBuyers: c.repeatBuyers, repeatRate: c.repeatRate, orders: c.orders, revenue: c.revenue, avgGapDays: c.avgGapDays };
    }).sort((a, b) => b.orders - a.orders);
}

/** Visitor funnel for a set of visitor rows: who has an account, who bought (from real orders). */
export function funnel(rows, buyerIds) {
    let visitors = 0, withAccount = 0, bought = 0;
    for (const r of rows) {
        visitors++;
        if (r.uid) { withAccount++; if (buyerIds.has(r.uid)) bought++; }
    }
    return { visitors, withAccount, bought, anonymous: visitors - withAccount, accountNoPurchase: withAccount - bought };
}
