// functions/api/home-stats.js — Cloudflare Pages Function
// Live, REAL counters for the homepage (users, active services, completed
// orders, reviews + their true average) — never hardcoded marketing numbers.
//
// Every number is a fresh Firestore COUNT/AVG aggregation, NOT a stored
// counter that gets incremented — so it goes up AND down with reality (a
// deleted service, a removed review, a banned account...) and can never
// drift. Reviews can only exist for a completed order (see firestore.rules
// match /reviews), so the review count/average are real reviews only.
//
// ⚠️ WHY THIS IS SERVER-SIDE: firestore.rules restricts `orders` reads to
// "your own orders" and `users` reads to signed-in users, so a guest on the
// homepage can't run these counts from the browser. This runs with the
// service account (same trust level as the rest of functions/api/*).
import { fsCount, fsAggregate } from '../_shared/gcp.js';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    // Short edge/browser cache: "live" within ~30s while protecting Firestore
    // from one aggregation read per visitor.
    'Cache-Control': 'public, max-age=30, s-maxage=30',
};

export async function onRequest(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });

    try {
        const [services, users, sellers, completedOrders, reviewAgg] = await Promise.all([
            fsCount(env, {
                from: [{ collectionId: 'services' }],
                where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
            }),
            fsCount(env, { from: [{ collectionId: 'users' }] }),
            fsCount(env, {
                from: [{ collectionId: 'users' }],
                where: { fieldFilter: { field: { fieldPath: 'role' }, op: 'EQUAL', value: { stringValue: 'seller' } } },
            }),
            fsCount(env, {
                from: [{ collectionId: 'orders' }],
                where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'completed' } } },
            }),
            fsAggregate(env, { from: [{ collectionId: 'reviews' }] }, [
                { alias: 'count', count: {} },
                { alias: 'avg', avg: { field: { fieldPath: 'rating' } } },
            ]),
        ]);

        const reviews = reviewAgg.count || 0;
        const avgRating = reviews > 0 && reviewAgg.avg != null ? Number(reviewAgg.avg.toFixed(1)) : null;

        return new Response(JSON.stringify({ success: true, services, users, sellers, completedOrders, reviews, avgRating, ts: Date.now() }), { status: 200, headers: CORS });
    } catch (err) {
        console.error('[home-stats]', err.message);
        return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }
}
