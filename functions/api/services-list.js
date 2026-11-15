/**
 * functions/api/services-list.js — Route: GET /api/services-list[?cursor=<ISO createdAt>]
 * ----------------------------------------------------------------------------
 * The public "services" listing, one page (12) at a time, newest first — the same query the browser used to run directly
 * against Firestore on every visit and on every "load more". Served through the edge cache, so the browse page costs a
 * handful of Firestore reads per Cloudflare location per few minutes instead of 12+ reads PER VISITOR.
 *
 *   {success:true, items:[…listing without embedded photos…], next:'<ISO createdAt of the last item>', hasMore:bool}
 *
 * The browser falls back to its own Firestore query if this endpoint is unavailable (js/services.js → loadServices).
 */
import { fsQueryStrict } from '../_shared/gcp.js';
import { edgeCached } from '../_shared/edge-cache.js';
import { shapeService } from './home-feed.js';

export const PAGE_SIZE = 12;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/;
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
const fail = (status, msg) => new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { ...HEADERS, 'Cache-Control': 'no-store' } });

/** Pure (unit-testable): query docs → response body. createdAt becomes {seconds} (what the browser code reads). */
export function pageBody(docs) {
    const items = docs.map((d) => {
        const o = shapeService(d);
        const ms = Date.parse(typeof d.createdAt === 'string' ? d.createdAt : '');
        if (Number.isFinite(ms)) o.createdAt = { seconds: Math.floor(ms / 1000) }; else delete o.createdAt;
        return o;
    });
    const last = docs[docs.length - 1];
    return { items, next: last && typeof last.createdAt === 'string' ? last.createdAt : '', hasMore: docs.length >= PAGE_SIZE };
}

async function handle(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method !== 'GET') return fail(405, 'method not allowed');
    const cursor = new URL(request.url).searchParams.get('cursor') || '';
    if (cursor && !ISO.test(cursor)) return fail(400, 'bad cursor');
    try {
        const q = {
            from: [{ collectionId: 'services' }],
            where: { fieldFilter: { field: { fieldPath: 'active' }, op: 'EQUAL', value: { booleanValue: true } } },
            orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
            limit: PAGE_SIZE,
        };
        if (cursor) q.startAt = { values: [{ timestampValue: cursor }], before: false };   // "start AFTER the cursor"
        const docs = await fsQueryStrict(env, q);
        // An empty FIRST page is never cached or trusted (e.g. the composite index is missing): the browser then uses its own query.
        if (!docs.length && !cursor) return fail(503, 'no listings');
        return new Response(JSON.stringify({ success: true, ...pageBody(docs) }), { status: 200, headers: { ...HEADERS, 'Cache-Control': 'public, max-age=60' } });
    } catch (err) {
        console.error('[services-list]', err && err.message);
        return fail(500, 'listing unavailable');
    }
}

export const onRequest = (context) => edgeCached(context, { params: ['cursor'], cap: 300, ttl: 180, swr: 900, limit: 60 }, () => handle(context));
