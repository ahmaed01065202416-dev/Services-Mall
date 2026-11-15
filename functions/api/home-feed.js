/**
 * functions/api/home-feed.js — Route: GET /api/home-feed?section=services|products|stores|platform
 *
 * WHY THIS EXISTS: photos in this app are stored as base64 data URLs INSIDE the Firestore documents (up to ~2 MB each,
 * see safeUrl() in js/constants.js). The homepage used to read those documents straight from the browser, so a
 * first visit downloaded several MB of base64 over Firestore's long-lived streaming connection (≈5.8 MB page weight,
 * slow LCP / Speed Index, and a "Failed to load resource: ERR_TIMED_OUT" console error from the open stream).
 *
 * This endpoint returns the SAME listings the browser could already read (the rules allow public reads of these
 * collections) but with every embedded `data:` URL removed and replaced by a small, browser-cacheable image URL
 * served by /api/ad-image. The client falls back to the old direct-Firestore path if this endpoint fails.
 *
 * Nothing here writes data, and nothing private is exposed: services = active listings only, stores = a fixed
 * whitelist of public profile fields, platform = the `settings/platform` doc that firestore.rules already makes
 * publicly readable.
 */
import { fsQuery, fsGet } from '../_shared/gcp.js';
import { edgeCached } from '../_shared/edge-cache.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' };
const ok = (body, maxAge) => new Response(JSON.stringify({ success: true, ...body }), { status: 200, headers: { ...JSON_HEADERS, 'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}` } });
const fail = (status, msg) => new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' } });

// Same shape the browser's safeUrl() accepts for an https image.
const SAFE_HTTPS = /^https:\/\/[^\s"'<>\\]{1,1900}$/i;
const DATA_IMG = /^data:image\/(?:jpeg|png|webp);base64,/i;

/** Deep copy that drops every string starting with `data:` (embedded files/photos) so the response stays small. */
export function stripData(v) {
    if (typeof v === 'string') return v.startsWith('data:') ? undefined : v;
    if (Array.isArray(v)) return v.map(stripData).filter(x => x !== undefined);
    if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) { const r = stripData(v[k]); if (r !== undefined) o[k] = r; }
        return o;
    }
    return v;
}

const updMs = (doc) => { const t = Date.parse(doc._updateTime || ''); return Number.isFinite(t) ? t : 0; };

/** A listing's cover: a plain https URL is passed through; an embedded base64 photo becomes /api/ad-image?s=<id>. */
export function serviceCover(doc) {
    const first = doc.image || (Array.isArray(doc.images) ? doc.images[0] : '') || '';
    if (typeof first !== 'string' || !first) return '';
    if (DATA_IMG.test(first)) return `/api/ad-image?s=${encodeURIComponent(doc.id)}&v=${updMs(doc)}`;
    return SAFE_HTTPS.test(first) ? first : '';
}

export function shapeService(doc) {
    const { _updateTime, ...rest } = doc;
    const out = stripData(rest);
    delete out.images;
    out.image = serviceCover(doc);
    return out;
}

const STORE_FIELDS = ['name', 'description', 'tagline', 'country', 'city', 'categories', 'status', 'featuredUntil', 'planRank'];
export function shapeStore(doc) {
    const out = { id: doc.id };
    for (const k of STORE_FIELDS) if (doc[k] !== undefined && doc[k] !== null) out[k] = stripData(doc[k]);
    const logo = typeof doc.logo === 'string' ? doc.logo : '';
    if (DATA_IMG.test(logo)) out.logo = `/api/ad-image?st=${encodeURIComponent(doc.id)}&v=${updMs(doc)}`;
    else if (SAFE_HTTPS.test(logo)) out.logo = logo;
    return out;
}

const eq = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value } });
const bool = (b) => ({ booleanValue: b });
const str = (s) => ({ stringValue: s });
const and = (...filters) => ({ compositeFilter: { op: 'AND', filters } });
const isProduct = (d) => (d.listingType || 'service') === 'product';

/** One section of the public feed → { body, maxAge } (null for an unknown section). Throws on Firestore errors. */
async function sectionBody(env, section) {
    if (section === 'services') {
        // Same logic the browser had: featured+active first (excluding product listings), else any active listing.
        let docs = (await fsQuery(env, { from: [{ collectionId: 'services' }], where: and(eq('active', bool(true)), eq('featured', bool(true))), limit: 12 })).filter(d => !isProduct(d));
        if (!docs.length) docs = (await fsQuery(env, { from: [{ collectionId: 'services' }], where: eq('active', bool(true)), limit: 20 })).filter(d => !isProduct(d));
        return { body: { items: docs.slice(0, 6).map(shapeService) }, maxAge: 60 };
    }
    if (section === 'products') {
        const docs = await fsQuery(env, { from: [{ collectionId: 'services' }], where: and(eq('active', bool(true)), eq('listingType', str('product'))), limit: 8 });
        return { body: { items: docs.map(shapeService) }, maxAge: 60 };
    }
    if (section === 'stores') {
        const docs = await fsQuery(env, {
            from: [{ collectionId: 'stores' }],
            where: { fieldFilter: { field: { fieldPath: 'featuredUntil' }, op: 'GREATER_THAN', value: { timestampValue: new Date().toISOString() } } },
            limit: 24,
        });
        return { body: { items: docs.map(shapeStore) }, maxAge: 60 };
    }
    if (section === 'platform') {
        const doc = await fsGet(env, 'settings/platform');
        if (!doc) return { body: { item: null }, maxAge: 30 };
        const { _updateTime, id, ...settings } = doc;
        return { body: { item: settings }, maxAge: 30 };
    }
    return null;
}

// The browser used to call stores + services + products as three separate Function invocations on every first visit.
// `section=bundle` returns them together (one invocation; `platform` stays separate: it is tiny and boot-critical).
export const BUNDLE_SECTIONS = ['stores', 'services', 'products'];
export function assembleBundle(entries) {
    const sections = {};
    for (const [name, r] of entries) if (r && r.body) sections[name] = r.body;
    return Object.keys(sections).length ? sections : null;
}

async function handle(context) {
    const { request, env } = context;
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: { ...JSON_HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (request.method !== 'GET') return fail(405, 'method not allowed');
    const section = new URL(request.url).searchParams.get('section') || '';

    try {
        if (section === 'bundle') {
            // a failing section is simply left out: the browser asks for that one on its own
            const entries = await Promise.all(BUNDLE_SECTIONS.map(n => sectionBody(env, n).then(r => [n, r], err => { console.error('[home-feed]', n, err && err.message); return [n, null]; })));
            const sections = assembleBundle(entries);
            return sections ? ok({ sections }, 120) : fail(500, 'feed unavailable');
        }
        const r = await sectionBody(env, section);
        if (!r) return fail(400, 'unknown section');
        return ok(r.body, r.maxAge);
    } catch (err) {
        console.error('[home-feed]', section, err && err.message);
        return fail(500, 'feed unavailable');
    }
}

export const onRequest = (context) => edgeCached(context, { params: ['section'], cap: 300, ttl: 300, swr: 900 }, () => handle(context));
