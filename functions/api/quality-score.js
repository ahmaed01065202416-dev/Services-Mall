/**
 * ============================================================================
 * functions/api/quality-score.js — Cloudflare Pages Function
 * Recomputes each seller's Quality Score from REAL data we already track:
 *   - avg rating          (reviews collection)
 *   - order completion %  (orders: completed vs cancelled/refunded)
 *   - activity level      (completed order count, capped)
 * Then denormalizes the score onto users/{sellerId}.qualityScore AND onto
 * every one of that seller's `services` docs (services/{id}.qualityScore) so
 * the marketplace can sort/rank by it cheaply on the client without an
 * extra read per card.
 *
 * ⚠️ HONEST LIMITATION: "response time" was in the original feature request,
 * but this app has no message-read-receipt/first-response timestamp tracked
 * anywhere in the schema — computing it would mean inventing numbers, so
 * it's left OUT of the formula rather than faked. To add it for real: start
 * writing `order.firstSellerReplyAt` when a seller sends their first chat
 * message on an order, then this file can use it.
 *
 * Trigger: called on a schedule by cron-worker (same pattern as the existing
 * AI blog cron — see cron-worker/index.js), or manually via POST with header
 * X-Admin-Token: <ADMIN_SECRET>, or by a logged-in admin (Bearer token).
 * Route: /api/quality-score
 * ============================================================================
 */
import { verifyIdToken, fsGet, fsSet, fsQuery } from '../_shared/gcp.js';

function json(status, obj) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

async function _isAuthorized(request, env) {
    const adminToken = request.headers.get('X-Admin-Token');
    if (env.ADMIN_SECRET && adminToken === env.ADMIN_SECRET) return true;
    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!idToken) return false;
    const auth = await verifyIdToken(idToken, env);
    if (!auth) return false;
    const user = await fsGet(env, `users/${auth.uid}`).catch(() => null);
    return !!(user && user.role === 'admin');
}

function _computeScore({ avgRating, completionRate, completedCount }) {
    // 0–5 scale, weighted. Missing data degrades gracefully (neutral default)
    // instead of punishing brand-new sellers who have zero orders yet.
    const ratingPart     = (avgRating == null ? 4.0 : avgRating) / 5;
    const completionPart = completionRate == null ? 0.9 : completionRate;
    const activityPart   = Math.min(1, (completedCount || 0) / 20); // saturates at 20 orders
    const score = ratingPart * 0.55 + completionPart * 0.35 + activityPart * 0.10;
    return Number((score * 5).toFixed(3));
}

function _eqFilter(field, value) {
    return { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } };
}

async function _recomputeSeller(env, sellerId) {
    const [reviews, orders] = await Promise.all([
        fsQuery(env, { from: [{ collectionId: 'reviews' }], where: _eqFilter('sellerId', sellerId) }),
        fsQuery(env, { from: [{ collectionId: 'orders' }],  where: _eqFilter('sellerId', sellerId) }),
    ]);

    const avgRating = reviews.length ? reviews.reduce((s, r) => s + (Number(r.rating) || 0), 0) / reviews.length : null;
    const completed = orders.filter(o => o.status === 'completed').length;
    const cancelled = orders.filter(o => o.status === 'cancelled' || o.status === 'refunded').length;
    const completionRate = (completed + cancelled) > 0 ? completed / (completed + cancelled) : null;

    const qualityScore = _computeScore({ avgRating, completionRate, completedCount: completed });

    await fsSet(env, `users/${sellerId}`, { qualityScore, qualityScoreUpdatedAt: new Date() }, true);

    // Denormalize onto this seller's services so the marketplace can sort
    // client-side with zero extra reads per card.
    const services = await fsQuery(env, { from: [{ collectionId: 'services' }], where: _eqFilter('sellerId', sellerId) });
    await Promise.all(services.map(s => fsSet(env, `services/${s.id}`, { qualityScore }, true)));

    return { sellerId, qualityScore, avgRating, completionRate, servicesUpdated: services.length };
}

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
    if (!(await _isAuthorized(request, env))) return json(401, { error: 'Unauthorized' });
    if (!env.FIREBASE_SERVICE_ACCOUNT || !env.FIREBASE_PROJECT_ID) {
        return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT / FIREBASE_PROJECT_ID not configured' });
    }

    let body = {};
    try { body = await request.json(); } catch (_) {}

    try {
        if (body.sellerId) {
            const result = await _recomputeSeller(env, body.sellerId);
            return json(200, { ok: true, result });
        }
        const sellers = await fsQuery(env, { from: [{ collectionId: 'users' }], where: _eqFilter('role', 'seller') });
        const results = [];
        for (const s of sellers) { // sequential — runs off-peak via cron, no rush
            results.push(await _recomputeSeller(env, s.id));
        }
        return json(200, { ok: true, sellersProcessed: results.length, results });
    } catch (err) {
        console.error('[QualityScore] error:', err.message);
        return json(500, { error: err.message });
    }
}
