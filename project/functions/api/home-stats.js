// functions/api/home-stats.js — Cloudflare Pages Function
// Real, live counts for the homepage hero stats row (active services, sellers,
// completed orders, average rating) — NOT hardcoded marketing numbers.
//
// ⚠️ WHY THIS IS SERVER-SIDE: firestore.rules intentionally restricts `orders`
// reads to "your own orders" and `users` reads to signed-in users only — a
// guest browsing the homepage (exactly who these stats are for) can't run
// `orders where status==completed` or `users where role==seller` queries
// directly from the client; Firestore would just deny them. This runs with
// the service account (same trust level as the rest of functions/api/*) so
// it can compute the real counts without loosening those rules for everyone.
//
// Cheap: uses Firestore's :runAggregationQuery (COUNT), not full document
// fetches — see fsCount in _shared/gcp.js.
import { fsCount, fsQuery } from '../_shared/gcp.js';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
};

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

    try {
        const [services, sellers, completedOrders, recentReviews] = await Promise.all([
            fsCount(env, {
                from: [{ collectionId: 'services' }],
                where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
            }),
            fsCount(env, {
                from: [{ collectionId: 'users' }],
                where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'seller' } } },
            }),
            fsCount(env, {
                from: [{ collectionId: 'orders' }],
                where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'completed' } } },
            }),
            // Sampled average from the most recent reviews (bounded cost) rather
            // than a full-collection scan — still a real, moving average.
            fsQuery(env, {
                from: [{ collectionId: 'reviews' }],
                orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
                limit: 500,
            }).catch(() => []),
        ]);

        const ratings = recentReviews.map(r => r.rating || 0).filter(r => r > 0);
        const avgRating = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : null;

        return new Response(JSON.stringify({ success: true, services, sellers, completedOrders, avgRating }), { status: 200, headers: CORS });
    } catch (err) {
        console.error('[home-stats]', err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS });
    }
}
