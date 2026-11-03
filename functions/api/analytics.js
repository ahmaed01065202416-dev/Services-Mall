/**
 * functions/api/analytics.js — platform visit counter + customer / visitor analytics
 * ============================================================================
 * Replaces Google Analytics (which is not working on the site) with our own first-party counter that is tied to REAL
 * accounts and orders:
 *   • which visitors came back (after 1 / 7 / 30 days), new vs returning,
 *   • whether a visitor has an account and whether they bought — and from which stores,
 *   • repeat customers per merchant (share who bought 2+ times, average time between orders, best repeat customers),
 *   • a comparison between merchants (admin only).
 * Each merchant sees ONLY his own numbers; the admin sees the whole platform and can look any visitor / customer up.
 * Stored: a random browser id (localStorage), the days it visited, the account uid once the person logs in. NOT stored:
 * IP address, user-agent, page contents. The privacy policy states this (privacy.html).
 *
 * Actions (POST JSON):  track (public, token optional) · sellerReport · adminReport · lookup (admin)
 */
import { verifyIdToken, fsGet, fsSet, fsQuery, fsCount, fsCommit } from '../_shared/gcp.js';
import { dayKey, dayMinus, recordDay, retention, visitorSplit, customerStats, compareStores, funnel } from '../_shared/analytics.js';

const json = (status, headers, obj) => new Response(JSON.stringify(obj), { status, headers });
const safeId = (v) => { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_-]{1,128}$/.test(s) ? s : null; };
const eqS = (f, v) => ({ fieldFilter: { field: { fieldPath: f }, op: 'EQUAL', value: { stringValue: String(v) } } });
const toMs = (t) => { if (!t) return 0; const n = (t instanceof Date ? t : new Date(t)).getTime(); return Number.isNaN(n) ? 0 : n; };
const incr = (field, n = 1) => ({ fieldPath: field, increment: { integerValue: String(n) } });
const q = (env, collection, where, limit, orderBy) => fsQuery(env, { from: [{ collectionId: collection }], ...(where ? { where } : {}), ...(orderBy ? { orderBy } : {}), limit }).then((r) => r || []).catch(() => []);

// best-effort flood guard per isolate (the client also sends at most one call per session / store)
const hits = new Map();
function floodOk(key, max = 40) {
    const now = Date.now(), b = hits.get(key) || [];
    const recent = b.filter((t) => now - t < 60000);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(now); hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
}

// counter doc: creates it if missing, merges `day`/`sellerId`, and increments atomically in ONE write
const counterWrite = (env, path, fields, increments) => ({
    update: { name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { stringValue: String(v) }])) },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: increments,
});

async function names(env, ids) {
    const out = {};
    await Promise.all([...new Set(ids.filter(Boolean))].slice(0, 80).map(async (id) => {
        const u = await fsGet(env, `users/${id}`).catch(() => null);
        out[id] = { name: (u && (u.name || u.displayName)) || id.slice(0, 6), email: (u && u.email) || '' };
    }));
    return out;
}

async function handleTrack(body, env, CORS, auth, ip) {
    const vid = /^[A-Za-z0-9_-]{16,64}$/.test(String(body.vid || '')) ? String(body.vid) : null;
    if (!vid) return json(400, CORS, { error: 'bad visitor id' });
    if (!floodOk('ip_' + ip) || !floodOk('vid_' + vid, 20)) return json(429, CORS, { error: 'slow down' });
    const today = dayKey();

    // platform visitor
    const v = await fsGet(env, `visitors/${vid}`).catch(() => null);
    const rec = recordDay(v && v.days, today);
    const uid = (auth && auth.uid) || (v && v.uid) || '';
    if (rec.isNewDay || (auth && (!v || v.uid !== auth.uid))) {
        await fsSet(env, `visitors/${vid}`, {
            firstDay: (v && v.firstDay) || today, lastDay: today, days: rec.days, uid, hasUid: !!uid, updatedAt: new Date(),
            ...(v ? {} : { createdAt: new Date() }),
        }, true);
    }
    if (rec.isNewDay) {
        await fsCommit(env, [counterWrite(env, `analytics_daily/${today}`, { day: today },
            [incr('visitors'), incr(rec.isNewVisitor ? 'newVisitors' : 'returningVisitors')])]).catch((e) => console.warn('[analytics] daily', e.message));
    }

    // visit to one merchant's store / product
    const sellerId = body.kind === 'store' ? safeId(body.sellerId) : null;
    if (sellerId) {
        const key = `${sellerId}_${vid}`;
        const sv = await fsGet(env, `store_visitors/${key}`).catch(() => null);
        if (!sv) {                                         // first time this browser looks at this merchant: make sure the merchant exists
            const seller = await fsGet(env, `users/${sellerId}`).catch(() => null);
            if (!seller) return json(200, CORS, { success: true });
        }
        const r2 = recordDay(sv && sv.days, today);
        if (r2.isNewDay || (uid && (!sv || sv.uid !== uid))) {
            await fsSet(env, `store_visitors/${key}`, { sellerId, vid, uid, days: r2.days, firstDay: (sv && sv.firstDay) || today, lastDay: today, updatedAt: new Date() }, true);
        }
        if (r2.isNewDay) {
            await fsCommit(env, [counterWrite(env, `store_daily/${sellerId}_${today}`, { day: today, sellerId },
                [incr('visitors'), incr(r2.isNewVisitor ? 'newVisitors' : 'returningVisitors')])]).catch((e) => console.warn('[analytics] store daily', e.message));
        }
    }
    return json(200, CORS, { success: true });
}

function series(docs, today, n = 30) {
    const byDay = new Map(docs.map((d) => [String(d.day), d]));
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
        const k = dayMinus(today, i), d = byDay.get(k) || {};
        out.push({ day: k, visitors: Number(d.visitors) || 0, fresh: Number(d.newVisitors) || 0, returning: Number(d.returningVisitors) || 0 });
    }
    return out;
}

async function attachUids(env, rows, max = 200) {
    let n = 0;
    await Promise.all(rows.filter((r) => !r.uid && r.vid).slice(0, max).map(async (r) => {
        const v = await fsGet(env, `visitors/${r.vid}`).catch(() => null); n++;
        if (v && v.uid) r.uid = v.uid;
    }));
}

async function sellerReport(env, CORS, sellerId) {
    const today = dayKey();
    const [orders, svRows, daily] = await Promise.all([
        q(env, 'orders', eqS('sellerId', sellerId), 3000),
        q(env, 'store_visitors', eqS('sellerId', sellerId), 5000),
        q(env, 'store_daily', eqS('sellerId', sellerId), 120),
    ]);
    const c = customerStats(orders);
    await attachUids(env, svRows);
    const nm = await names(env, c.top.map((t) => t.buyerId));
    return json(200, CORS, {
        success: true, today,
        customers: { buyers: c.buyers, repeatBuyers: c.repeatBuyers, repeatRate: c.repeatRate, orders: c.orders, revenue: c.revenue, avgGapDays: c.avgGapDays,
            top: c.top.map((t) => ({ ...t, name: (nm[t.buyerId] || {}).name || '' })), truncated: orders.length >= 3000 },
        visitors: { split: visitorSplit(svRows, today, 30), retention: retention(svRows, today), funnel: funnel(svRows, c.buyerIds), series: series(daily, today), truncated: svRows.length >= 5000 },
    });
}

async function adminReport(env, CORS) {
    const today = dayKey(), since = dayMinus(today, 29);
    const rangeDay = { fieldFilter: { field: { fieldPath: 'day' }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: since } } };
    const [daily, storeDaily, sample, orders, totalVisitors, withAccount] = await Promise.all([
        q(env, 'analytics_daily', rangeDay, 60),
        q(env, 'store_daily', rangeDay, 20000),
        q(env, 'visitors', null, 5000, [{ field: { fieldPath: 'lastDay' }, direction: 'DESCENDING' }]),
        q(env, 'orders', eqS('paymentStatus', 'paid'), 5000),
        fsCount(env, { from: [{ collectionId: 'visitors' }] }).catch(() => 0),
        fsCount(env, { from: [{ collectionId: 'visitors' }], where: { fieldFilter: { field: { fieldPath: 'hasUid' }, op: 'EQUAL', value: { booleanValue: true } } } }).catch(() => 0),
    ]);
    const c = customerStats(orders);
    const rows = sample.map((r) => ({ ...r, vid: r.id }));
    const cmp = compareStores(orders);
    const visits = new Map();
    for (const d of storeDaily) visits.set(d.sellerId, (visits.get(d.sellerId) || 0) + (Number(d.visitors) || 0));
    const nm = await names(env, [...cmp.slice(0, 40).map((s) => s.sellerId), ...[...visits.keys()].slice(0, 40), ...c.top.map((t) => t.buyerId)]);
    const multiStoreBuyers = [...c.storesByBuyer.values()].filter((b) => b.stores.size > 1).length;
    return json(200, CORS, {
        success: true, today,
        visitors: {
            total: totalVisitors, withAccount, anonymous: Math.max(0, totalVisitors - withAccount), series: series(daily, today),
            split: visitorSplit(rows, today, 30), retention: retention(rows, today), funnel: funnel(rows, c.buyerIds), sampleSize: rows.length, sampled: rows.length >= 5000,
        },
        customers: { buyers: c.buyers, repeatBuyers: c.repeatBuyers, repeatRate: c.repeatRate, orders: c.orders, revenue: c.revenue, avgGapDays: c.avgGapDays, multiStoreBuyers,
            top: c.top.map((t) => ({ ...t, name: (nm[t.buyerId] || {}).name || '' })), truncated: orders.length >= 5000 },
        stores: cmp.slice(0, 40).map((s) => ({ ...s, name: (nm[s.sellerId] || {}).name || s.sellerId.slice(0, 6), visitors30: visits.get(s.sellerId) || 0 })),
    });
}

// admin: "did this person use the platform, and which stores did they buy from?"
async function lookup(env, CORS, qstr) {
    const term = String(qstr || '').trim();
    if (!term) return json(400, CORS, { error: 'اكتب إيميل أو UID أو معرّف زائر' });
    let user = null, uid = '';
    if (term.includes('@')) {
        const rows = await q(env, 'users', eqS('email', term.toLowerCase()), 1);
        if (!rows.length) { const again = await q(env, 'users', eqS('email', term), 1); user = again[0] || null; } else user = rows[0];
        uid = user ? user.id : '';
    } else if (safeId(term)) {
        user = await fsGet(env, `users/${term}`).catch(() => null);
        if (user) uid = term;
    }
    let visitorDocs = [];
    if (uid) visitorDocs = await q(env, 'visitors', eqS('uid', uid), 30);
    else if (safeId(term)) { const v = await fsGet(env, `visitors/${term}`).catch(() => null); if (v) visitorDocs = [v]; }
    if (!user && !visitorDocs.length) return json(200, CORS, { success: true, found: false });
    if (!uid && visitorDocs[0] && visitorDocs[0].uid) { uid = visitorDocs[0].uid; user = await fsGet(env, `users/${uid}`).catch(() => null); }

    const orders = uid ? await q(env, 'orders', eqS('buyerId', uid), 500) : [];
    const paid = orders.filter((o) => o.paymentStatus === 'paid' && o.status !== 'refunded' && o.status !== 'cancelled');
    const bought = new Map();
    for (const o of paid) { const e = bought.get(o.sellerId) || { sellerId: o.sellerId, orders: 0, spent: 0, lastAt: 0 }; e.orders++; e.spent += Number(o.price) || 0; e.lastAt = Math.max(e.lastAt, toMs(o.createdAt)); bought.set(o.sellerId, e); }
    const visitedStores = [];
    for (const v of visitorDocs.slice(0, 10)) for (const r of await q(env, 'store_visitors', eqS('vid', v.id), 100)) visitedStores.push({ sellerId: r.sellerId, days: (r.days || []).length, lastDay: r.lastDay });
    const nm = await names(env, [...bought.keys(), ...visitedStores.map((s) => s.sellerId)]);
    const allDays = [...new Set(visitorDocs.flatMap((v) => (v.days || []).map(String)))].sort();
    return json(200, CORS, {
        success: true, found: true,
        user: user ? { uid, name: user.name || user.displayName || '', email: user.email || '', role: user.role || '', createdAt: toMs(user.createdAt) } : null,
        usedPlatform: { hasAccount: !!user, bought: paid.length > 0, orders: paid.length, spent: Math.round(paid.reduce((a, o) => a + (Number(o.price) || 0), 0) * 100) / 100 },
        visits: { browsers: visitorDocs.length, daysVisited: allDays.length, firstDay: allDays[0] || '', lastDay: allDays[allDays.length - 1] || '' },
        boughtFrom: [...bought.values()].map((b) => ({ ...b, spent: Math.round(b.spent * 100) / 100, name: (nm[b.sellerId] || {}).name || b.sellerId.slice(0, 6) })).sort((a, b) => b.orders - a.orders),
        visitedStores: visitedStores.map((s) => ({ ...s, name: (nm[s.sellerId] || {}).name || s.sellerId.slice(0, 6) })),
    });
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
        let body;
        try { body = await request.json(); } catch (_) { return json(400, CORS, { error: 'Invalid JSON' }); }
        const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
        const auth = idToken ? await verifyIdToken(idToken, env) : null;
        const action = String(body.action || '');

        if (action === 'track') return await handleTrack(body, env, CORS, auth, request.headers.get('cf-connecting-ip') || 'unknown');

        if (!auth) return json(401, CORS, { error: 'سجّل دخولك الأول' });
        const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
        const adminUids = (env.ADMIN_UIDS || '').split(',').map((s) => s.trim()).filter(Boolean);
        const isAdmin = adminUids.includes(auth.uid) || (user && user.role === 'admin');
        const isSeller = isAdmin || (user && user.role === 'seller');

        if (action === 'sellerReport') {
            if (!isSeller) return json(403, CORS, { error: 'للتجار فقط' });
            const sid = isAdmin && body.sellerId ? safeId(body.sellerId) : auth.uid;     // a merchant can only ever read his own
            if (!sid) return json(400, CORS, { error: 'sellerId غير صالح' });
            return await sellerReport(env, CORS, sid);
        }
        if (action === 'adminReport') { if (!isAdmin) return json(403, CORS, { error: 'Forbidden: Admin access only' }); return await adminReport(env, CORS); }
        if (action === 'lookup') { if (!isAdmin) return json(403, CORS, { error: 'Forbidden: Admin access only' }); return await lookup(env, CORS, body.q); }
        return json(400, CORS, { error: 'Unknown action' });
    } catch (err) {
        console.error('[analytics]', err && err.message ? err.message : err);
        return json(500, CORS, { error: 'حصل خطأ في السيرفر — حاول تاني' });
    }
}
