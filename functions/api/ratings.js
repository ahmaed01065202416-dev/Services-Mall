/**
 * functions/api/ratings.js — Route: /api/ratings
 * ============================================================================
 * Keeps services/{id}.rating and .reviewCount equal to the REAL reviews.
 *
 * Before this existed nothing ever wrote those two fields after a review was
 * submitted (the browser can't — firestore.rules forbids a buyer touching a
 * seller's listing), so every card kept showing a made-up "5.0" with 0 reviews.
 *
 *   action: 'sync'     (signed-in user)  → recompute ONE service from its reviews
 *   action: 'syncAll'  (cron / admin)    → recompute every service that has
 *                                          reviews, and reset any whose reviews
 *                                          were all deleted back to 0
 *
 * Safe + idempotent: the result is derived purely from the reviews collection,
 * never from anything the caller sends, so a caller can't forge a rating.
 */
import { verifyIdToken, fsGet, fsSet, fsQuery } from '../_shared/gcp.js';
import { timingSafeEqual } from './payment.js';

function json(status, headers, obj) { return new Response(JSON.stringify(obj), { status, headers }); }
function safeId(v) { const s = String(v == null ? '' : v); return /^[A-Za-z0-9_\-]{1,128}$/.test(s) ? s : null; }

function summarize(reviews) {
    const rated = reviews.map(r => Number(r.rating) || 0).filter(n => n >= 1 && n <= 5);
    const count = rated.length;
    const avg = count ? Number((rated.reduce((a, b) => a + b, 0) / count).toFixed(2)) : 0;
    return { rating: avg, reviewCount: count };
}

async function syncOne(env, serviceId) {
    const svc = await fsGet(env, `services/${serviceId}`);
    if (!svc) return { serviceId, skipped: 'service_not_found' };
    const reviews = await fsQuery(env, {
        from: [{ collectionId: 'reviews' }],
        where: { fieldFilter: { field: { fieldPath: 'serviceId' }, op: 'EQUAL', value: { stringValue: serviceId } } },
        limit: 5000,
    });
    const next = summarize(reviews);
    await fsSet(env, `services/${serviceId}`, next, true);
    return { serviceId, ...next };
}

async function syncAll(env) {
    const reviews = await fsQuery(env, { from: [{ collectionId: 'reviews' }], limit: 20000 });
    const byService = new Map();
    for (const r of reviews) {
        if (!r.serviceId) continue;
        if (!byService.has(r.serviceId)) byService.set(r.serviceId, []);
        byService.get(r.serviceId).push(r);
    }
    // Services still claiming reviews that no longer exist (deleted reviews).
    const stale = await fsQuery(env, {
        from: [{ collectionId: 'services' }],
        where: { fieldFilter: { field: { fieldPath: 'reviewCount' }, op: 'GREATER_THAN', value: { integerValue: '0' } } },
        limit: 5000,
    }).catch(() => []);
    for (const s of stale) if (!byService.has(s.id)) byService.set(s.id, []);

    let updated = 0;
    for (const [serviceId, list] of byService) {
        try {
            const svc = await fsGet(env, `services/${serviceId}`);
            if (!svc) continue;
            const next = summarize(list);
            if (Number(svc.rating || 0) === next.rating && Number(svc.reviewCount || 0) === next.reviewCount) continue;
            await fsSet(env, `services/${serviceId}`, next, true);
            updated++;
        } catch (e) { console.error('[ratings] syncAll item failed', serviceId, e.message); }
    }
    return { scanned: byService.size, updated };
}

export async function onRequest(context) {
    const { request, env } = context;
    const CORS = {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGINS || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
        'Content-Type': 'application/json',
    };
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') return json(405, CORS, { error: 'Method not allowed' });

    let body = {};
    try { body = await request.json(); } catch (_) {}

    try {
        if (body.action === 'syncAll') {
            const sent = request.headers.get('X-Admin-Token') || '';
            if (!env.ADMIN_SECRET || !timingSafeEqual(sent, String(env.ADMIN_SECRET))) return json(401, CORS, { error: 'Unauthorized' });
            return json(200, CORS, { success: true, ...(await syncAll(env)) });
        }
        if (body.action === 'sync') {
            const tok = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
            const auth = tok ? await verifyIdToken(tok, env) : null;
            if (!auth) return json(401, CORS, { error: 'يجب تسجيل الدخول' });
            const serviceId = safeId(body.serviceId);
            if (!serviceId) return json(400, CORS, { error: 'serviceId غير صالح' });
            return json(200, CORS, { success: true, ...(await syncOne(env, serviceId)) });
        }
        return json(400, CORS, { error: `Unknown action: ${body.action}` });
    } catch (err) {
        console.error('[ratings]', err.message);
        return json(500, CORS, { error: err.message || 'Internal server error' });
    }
}
