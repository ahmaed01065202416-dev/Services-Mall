/**
 * functions/_shared/edge-cache.js — shared edge cache for the PUBLIC, read-only endpoints.
 *
 * Why: Cloudflare Pages Functions do NOT honour `Cache-Control: s-maxage` — every request re-ran the Firestore reads.
 * With Firebase Spark (≈50k reads/day) that is the real capacity limit of the site. This wraps a handler with the Cache
 * API so a response is computed once per Cloudflare location per TTL, whatever the traffic.
 *
 *  • only GET; only status 200 (and 404 with an explicit public max-age = negative caching of bad ids)
 *  • TTL = the response's own s-maxage / max-age, capped; responses that say no-store/private are never cached
 *  • cache key = path + ONLY the allow-listed query params (random query strings cannot bust the cache)
 *  • uncached work is throttled per IP (best effort, per isolate) → 429, so one client cannot hammer Firestore
 *  • two layers: (1) a small in-memory cache per isolate (text responses ≤256KB) — works everywhere, even where the Cache API
 *    is a silent no-op (it is on *.workers.dev; verify on *.pages.dev) — and (2) the Cloudflare Cache API, shared per location
 *  • every response carries `X-Edge-Cache: MISS | HIT | STALE | MEM-HIT | MEM-STALE` so you can SEE which layer served it
 */
const _hits = new Map();
function throttled(request, limit, now = Date.now()) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rec = _hits.get(ip);
    if (!rec || now - rec.t > 60000) { if (_hits.size > 5000) _hits.clear(); _hits.set(ip, { t: now, n: 1 }); return false; }
    rec.n++;
    return rec.n > limit;
}

function ttlOf(res, cap) {
    const cc = res.headers.get('Cache-Control') || '';
    if (/no-store|no-cache|private/i.test(cc) || res.headers.has('Set-Cookie')) return 0;
    const m = /s-maxage=(\d+)/i.exec(cc) || /max-age=(\d+)/i.exec(cc);
    return m ? Math.min(parseInt(m[1], 10), cap) : 0;
}

export function cacheKey(request, params) {
    const u = new URL(request.url);
    const kept = [];
    for (const name of [...params].sort()) { const v = u.searchParams.get(name); if (v !== null) kept.push(`${encodeURIComponent(name)}=${encodeURIComponent(v)}`); }
    return new Request(u.origin + u.pathname + (kept.length ? '?' + kept.join('&') : ''), { method: 'GET' });
}

/** opts: { params: string[] (allow-listed query params), cap: max TTL seconds, ttl: force this edge TTL (seconds) for cacheable
 *  responses, swr: seconds an EXPIRED entry may still be served instantly while it is refreshed in the background,
 *  limit: uncached requests/min/IP }
 *
 *  stale-while-revalidate: after the TTL the next visitor does NOT wait for Firestore — they get the previous copy at once and
 *  one background refresh (per isolate) renews it. Only a visitor arriving after TTL+swr of silence waits for a fresh render. */
const _refreshing = new Set();

// ── layer 1: per-isolate memory (text only; bounded) ────────────────────────────────────────────────────────────────
const _mem = new Map();
const MEM_MAX = 150, MEM_BODY_MAX = 262144;

function computeTtl(res, cap, forced) {
    if (!(res.status === 200 || res.status === 404)) return 0;
    let ttl = res.status === 404 ? Math.min(ttlOf(res, cap), 60) : ttlOf(res, cap);   // a 404 is remembered only briefly (a new id may appear)
    if (forced > 0 && ttl > 0 && res.status === 200) ttl = forced;                   // only responses that were cacheable to begin with
    return ttl;
}

async function memStore(url, res, ttl, swr) {
    if (ttl <= 0 || !/json|html|xml|text/i.test(res.headers.get('Content-Type') || '')) return;
    if (parseInt(res.headers.get('Content-Length') || '0', 10) > MEM_BODY_MAX) return;
    const body = await res.clone().text();
    if (body.length > MEM_BODY_MAX) return;
    if (_mem.size >= MEM_MAX) _mem.delete(_mem.keys().next().value);
    const now = Date.now();
    _mem.set(url, { status: res.status, headers: [...res.headers], body, fresh: now + ttl * 1000, stale: now + (ttl + (res.status === 200 ? swr : 0)) * 1000 });
}

function memGet(url) {
    const e = _mem.get(url);
    if (!e) return null;
    if (Date.now() > e.stale) { _mem.delete(url); return null; }
    return e;
}

const tagged = (res, tag) => { const h = new Headers(res.headers); h.set('X-Edge-Cache', tag); return new Response(res.body, { status: res.status, headers: h }); };

// ── layer 2: Cloudflare Cache API ───────────────────────────────────────────────────────────────────────────────────
function store(cache, key, res, o, context) {
    const ttl = computeTtl(res, o.cap, o.forced);
    if (ttl <= 0) return;
    const headers = new Headers(res.headers);
    headers.set('X-Edge-Origin-CC', res.headers.get('Cache-Control') || '');
    headers.set('X-Edge-Fresh-Until', String(Date.now() + ttl * 1000));
    headers.set('Cache-Control', `public, max-age=${ttl + (res.status === 200 ? o.swr : 0)}`);   // lifetime of the ENTRY (fresh + stale window)
    const put = cache.put(key, new Response(res.clone().body, { status: res.status, headers }));
    if (context.waitUntil) context.waitUntil(put);
    return put;
}

/** What the visitor's browser sees: the origin's own Cache-Control again, without our bookkeeping headers. */
function serve(hit, tag) {
    const headers = new Headers(hit.headers);
    const cc = headers.get('X-Edge-Origin-CC');
    headers.delete('X-Edge-Origin-CC'); headers.delete('X-Edge-Fresh-Until');
    if (cc) headers.set('Cache-Control', cc); else headers.delete('Cache-Control');
    headers.set('X-Edge-Cache', tag);
    return new Response(hit.body, { status: hit.status, headers });
}

export async function edgeCached(context, opts, render) {
    const { request } = context;
    if (request.method !== 'GET') return render();
    const { params = [], cap = 600, limit = 120, ttl: forced = 0, swr = 600 } = opts || {};
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const key = cacheKey(request, params);
    const o = { cap, forced, swr };

    // one place that refreshes BOTH layers, at most once at a time per URL
    const refresh = (url) => {
        if (!context.waitUntil || _refreshing.has(url) || throttled(request, limit)) return;
        _refreshing.add(url);
        context.waitUntil((async () => {
            try {
                const fresh = await render();
                await memStore(url, fresh, computeTtl(fresh, cap, forced), swr);
                if (cache) { const put = store(cache, key, fresh, o, {}); if (put) await put; }
            } catch (_) { /* keep serving the stale copy until it expires */ }
            finally { _refreshing.delete(url); }
        })());
    };

    const m = memGet(key.url);
    if (m) {
        const stale = m.status === 200 && Date.now() > m.fresh;
        if (stale) refresh(key.url);
        return tagged(new Response(m.body, { status: m.status, headers: m.headers }), stale ? 'MEM-STALE' : 'MEM-HIT');
    }

    if (cache) {
        try {
            const hit = await cache.match(key);
            if (hit) {
                const freshUntil = parseInt(hit.headers.get('X-Edge-Fresh-Until') || '0', 10);
                const stale = hit.status === 200 && freshUntil && Date.now() > freshUntil;
                if (stale) refresh(key.url);
                return serve(hit, stale ? 'STALE' : 'HIT');
            }
        } catch (_) { /* fall through to render */ }
    }

    if (throttled(request, limit)) return new Response('Too many requests', { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
    const res = await render();
    const ttl = computeTtl(res, cap, forced);
    try { await memStore(key.url, res, ttl, swr); } catch (_) { /* memory layer is optional */ }
    if (cache) { try { const put = store(cache, key, res.clone(), o, context); if (put && !context.waitUntil) await put; } catch (_) { /* cache is optional */ } }
    return tagged(res, 'MISS');
}
